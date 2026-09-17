# Compute examples

The walkthrough above used `node`. These two show what the other runtimes are
for.

## Deno: TypeScript, live streaming, no vendoring

Deno resolves imports at startup from your `deno.json`, so — unlike `node` —
there is nothing to vendor: ship two small files and dependencies come from
the registry.

```
supabase/compute/ticker/
├── main.ts
└── deno.json
```

```json
{ "imports": { "@std/ulid": "jsr:@std/ulid@1" } }
```

```ts
// main.ts — JSON at /, a server-sent event stream at /stream
import { ulid } from "@std/ulid";

export default {
  fetch(request: Request): Response {
    const url = new URL(request.url);
    if (url.pathname !== "/stream") {
      return Response.json({ id: ulid(), at: new Date().toISOString() });
    }
    let timer: number;
    const body = new ReadableStream({
      start(controller) {
        const enc = new TextEncoder();
        timer = setInterval(() => {
          controller.enqueue(enc.encode(`data: ${JSON.stringify({ id: ulid() })}\n\n`));
        }, 1000);
      },
      cancel() { clearInterval(timer); },
    });
    return new Response(body, { headers: { "content-type": "text/event-stream" } });
  },
};
```

```toml
[experimental]
compute = true

[compute.ticker]
runtime = "deno"
size = "2gb"
exposure = "public"
```

```bash
supabase compute push ticker --project-ref <ref>
curl -N https://<ref>.supabase.co/compute/v1/ticker/stream   # events tick in live
```

## Dockerfile: any language — Python + FastAPI

A `dockerfile` compute instance runs whatever the image runs; the platform builds it
for you (network is available at build time, so `pip install` works). The
only contract: serve HTTP on `$PORT` (default 8080).

```
supabase/compute/pyapi/
├── Dockerfile
├── requirements.txt
└── main.py
```

```dockerfile
FROM public.ecr.aws/docker/library/python:3.12-slim
ENV PYTHONUNBUFFERED=1
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY main.py .
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8080}"]
```

```
fastapi==0.117.1
uvicorn==0.37.0
```

```python
# main.py
from fastapi import FastAPI

app = FastAPI()

@app.get("/")
def home():
    return {"language": "python", "framework": "fastapi"}

@app.get("/items/{item_id}")
def read_item(item_id: int):
    return {"item_id": item_id}
```

```toml
[experimental]
compute = true

[compute.pyapi]
runtime = "dockerfile"
size = "2gb"
exposure = "public"
```

```bash
supabase compute push pyapi --project-ref <ref>   # builds ~1–2 min
curl https://<ref>.supabase.co/compute/v1/pyapi/items/7        # {"item_id":7}
```
