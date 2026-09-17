# Management API (scripting without the CLI)

Base URL `https://api.supabase.com`, header
`Authorization: Bearer $SUPABASE_ACCESS_TOKEN` on every call. Bodies follow
JSON:API (`{"data":{"type":"project_compute_instance","attributes":{...}}}`).

### 1. Package your compute instance

```bash
tar -czf compute.tar.gz -C path/to/compute .
```

The archive root must contain the entrypoint (`index.mjs`/`main.ts` for
node/deno, `Dockerfile` for a dockerfile compute instance). Include any dependencies —
nothing is installed server-side for node/deno.

### 2. Reserve an upload slot, then upload

```bash
slot=$(curl -sf -X POST -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  "https://api.supabase.com/v2/projects/$REF/compute/hello/uploads")
url=$(jq -r '.data.attributes.url' <<<"$slot")
id=$(jq  -r '.data.id'             <<<"$slot")

curl -sf -X PUT -H "content-type: application/gzip" \
  --data-binary @compute.tar.gz "$url"
```

The presigned URL expires in minutes; mint a fresh slot per attempt.

### 3. Deploy

```bash
curl -sf -X POST -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "content-type: application/json" \
  -d '{"data":{"type":"project_compute_instance","attributes":{
        "spec":{"runtime":"node","size":"2gb-1vcpu","exposure":"public","instances":1},
        "context_upload_id":"'"$id"'"}}}' \
  "https://api.supabase.com/v2/projects/$REF/compute/hello/deploy"
```

- `size` on the wire is `2gb-1vcpu` or `4gb-2vcpu`.
- Omit `runtime` for a dockerfile compute instance.
- The response's `data.attributes.build_state` is `active` (already serving —
  the node/deno case) or `building` (a dockerfile build is running).
- A redeploy **without** `context_upload_id` is a spec-only change: code and
  image stay, only `instances`/`exposure`/`size` move. A compute instance's *first*
  deploy always needs a context.

### 4. Poll, invoke, inspect

```bash
curl -sf -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  "https://api.supabase.com/v2/projects/$REF/compute/hello"        # status
curl -sf -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  "https://api.supabase.com/v2/projects/$REF/compute"            # list
curl https://$REF.supabase.co/compute/v1/hello/                    # invoke

curl -sf -X DELETE -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  "https://api.supabase.com/v2/projects/$REF/compute/hello"        # delete (async teardown)
```

Poll `build_state` until `active`; `failed` carries the reason in
`state_reason` — fix and redeploy. Status also reports live instance counts
(`declared/live/ready/stale`).

Logs via the analytics endpoint (same one the CLI uses):

```bash
curl -sf -G -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  "https://api.supabase.com/v1/projects/$REF/analytics/endpoints/logs" \
  --data-urlencode "iso_timestamp_start=$(date -u -d '-1 hour' +%FT%TZ)" \
  --data-urlencode "iso_timestamp_end=$(date -u +%FT%TZ)" \
  --data-urlencode "sql=select toUnixTimestamp64Milli(timestamp) as ts, event_message
    from logs where log_attributes['worker'] = 'hello'
    and log_attributes['source'] in ('worker_guest_logs','worker_ingress_logs','worker_api_logs')
    order by timestamp desc limit 100"
```

---
