# Troubleshooting

| Symptom | Meaning / fix |
|---|---|
| CLI: `Compute is not available for project <ref>.` / API 404 `Compute is not available for this project` | Project not enrolled in the alpha — ask for enrollment. |
| `Access token not provided` / `Invalid access token format` | Run `supabase login` or export a valid `sbp_...` token. |
| `Cannot find project ref` | Pass `--project-ref`, or run `supabase link` in the repo. |
| `Unknown subcommand "compute" for "supabase"` | The family is opt-in: `compute = true` under `[experimental]` in `supabase/config.toml`, or `SUPABASE_EXPERIMENTAL_COMPUTE=1`. |
| Deploy 400 `a compute instance's first deploy needs code` | The very first deploy must carry a context upload. |
| `build_state: failed` | Read `state_reason` (status / `logs --kind builds`), fix, push again. |
| Invoke answers `compute instance <name> is starting` | The instance is still booting (fresh deploy or replacement) — retry in a few seconds. |
| Invoke answers 503 `temporarily unable to reach compute instance <name>` + `Retry-After` | All instances saturated — retry or scale up. |
| `logs` shows nothing right after a deploy | Log ingestion lags by up to a minute or two — retry shortly. |
| `status` never reaches `ready`; instances keep restarting with no app logs | The app did not open `$PORT` within 50 s of starting — almost always a heavy import (torch, opencv, a model load) at module scope. Bind the port first and load afterwards. |
| Python instance: nothing in `logs`, then it dies | `print` output was still buffered when the process was killed — set `ENV PYTHONUNBUFFERED=1`. |
| The instance dies while processing a large job | It ran out of memory (about 1.9 GiB usable on `2gb`, 3.8 GiB on `4gb`) — reduce the working set or move to `4gb`. |
| Invoke answers 404 `compute instance <name> not found` | Wrong name/path, the compute instance was deleted, or it is `private`. |
| The instance serves an empty 503 `no application code loaded` | The uploaded context had no entrypoint at its root — check the archive layout. |
| CLI `logs`: `The logs API is rate limiting this project (10 requests per minute).` | Wait a minute; avoid several tails at once. |
