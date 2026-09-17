---
name: supabase-compute
description: Deploy and operate Supabase Compute (private alpha) — long-running containers served at https://<project-ref>.supabase.co/compute/v1/<name>. Use when the user wants to deploy, scale, inspect, stream logs from, or delete a compute instance on their Supabase project; mentions Supabase Compute, `supabase compute`, compute/v1 URLs, or asks to run a server/container next to their Supabase database.
---

# Supabase Compute

A compute instance is one named service, packaged from a directory and run as
one or more instances on the Supabase platform.

- Runtimes: `node` / `deno` (default-exported `fetch` handler; deploys are
  build-free and serve in ~15s) or `dockerfile` (any language; ~1–2 min build).
- Spec: `size` `2gb`|`4gb`, `exposure` `public`|`private` (private = no URL,
  outbound-only), `instances` (copies kept running).

- Exposure:
  - Public: the service listens on `$PORT` (default 8080) and is reachable at
    `https://<project-ref>.supabase.co/compute/v1/<name>`.
  - Private: not reachable over HTTP; the service starts from its ENTRYPOINT
    and runs its own loop — consuming a queue, or performing a single task.

- Private alpha: if the CLI answers `Compute is not available for project
  <ref>.` (the API: `Compute is not available for this project`), the project
  is not enrolled — stop and tell the user to request enrollment.

## Preconditions

1. CLI: `npm install -g supabase@beta` (Compute ships in the beta channel and
   is opt-in — see below).
2. Auth: `supabase login`, or `SUPABASE_ACCESS_TOKEN` set to an `sbp_...`
   personal access token (dashboard → Account → Access Tokens).
3. Project ref: pass `--project-ref <20-char ref>` everywhere, or run
   `supabase link` once in the repo.

## Core workflow (CLI)

Compute is experimental and opt-in: enable it in `supabase/config.toml`
(or set `SUPABASE_EXPERIMENTAL_COMPUTE=1` for one shell).

```toml
[experimental]
compute = true
```

Then:

```bash
# 1. scaffold: creates supabase/compute/<name>/ + a [compute.<name>] section
#    in supabase/config.toml (names are DNS labels: a-z, 0-9, hyphen)
supabase compute new <name> --runtime node --size 2gb --exposure public

# 2. deploy: packages the directory AS-IS (node needs node_modules vendored —
#    there is no server-side install), uploads, deploys, waits, prints the URL
supabase compute push <name> --project-ref <ref>

# 3. invoke
curl https://<ref>.supabase.co/compute/v1/<name>/

# 4. observe
supabase compute list --project-ref <ref>
supabase compute status <name> --project-ref <ref>
supabase compute logs <name> --project-ref <ref>          # 24h, all streams
supabase compute logs <name> -f --kind app                # follow app logs

# 5. delete (keeps local files and the config entry; push restores)
supabase compute delete <name> --project-ref <ref> --yes
```

Teardown is asynchronous: right after a delete, `list` may briefly show the
compute instance as `deleting`, then — because the local files remain — as
`not deployed`. Both are expected.

Every change is another `push`: edit code and push; scale with
`push <name> --instances 3`; resize/exposure by editing the
`[compute.<name>]` TOML keys and pushing. Secrets: compute instances read the
project's secrets as environment variables (`supabase secrets set KEY=value
--project-ref <ref>`); running instances pick changes up within about a
minute.

Machine-readable output: `status` and `list` take `-o json`; the other
compute commands already emit JSON when not attached to a terminal.

## Rules

- Treat instances as stateless: they can be replaced at any time. Durable
  state belongs in the user's database or storage.
- A request during boot answers `compute instance <name> is starting` — retry
  within a few seconds. A 503 with `Retry-After` means the instances are
  saturated — scale up.
- A public instance must accept connections on `$PORT` within 50 seconds of
  starting. One that misses that window is stopped and relaunched with a
  growing backoff, and never becomes ready. Bind the port first; load heavy
  libraries and models afterwards (a startup thread, or lazily on the first
  request) — importing torch or opencv at module scope takes over a minute on
  a fresh instance. Download models at build time (`RUN python -c ...` in the
  Dockerfile), never on boot. A private instance runs its own loop and need
  not listen at all.
- Memory: `2gb` gives about 1.9 GiB to the app, `4gb` about 3.8 GiB. A
  process that grows past that is killed, and the instance replaced.
- Python: set `ENV PYTHONUNBUFFERED=1` in the Dockerfile so `print` output
  reaches `logs` even when the process is killed mid-way.
- Never guess at failures: `status` carries `state_reason` for a failed
  build, and `logs --kind builds` its history.

## Go deeper when needed

- Scripting without the CLI, upload/deploy wire format, log SQL:
  read [references/management-api.md](references/management-api.md)
- Working deno (TypeScript + streaming, no vendoring) and dockerfile
  (Python/FastAPI) examples: read [references/examples.md](references/examples.md)
- Error messages and their remedies: read
  [references/troubleshooting.md](references/troubleshooting.md)
