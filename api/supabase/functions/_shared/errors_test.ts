import { assert, assertEquals } from "@std/assert";
import { ApiError, errorEnvelope, errorResponse, jsonResponse, toErrorResponse } from "./errors.ts";

Deno.test("errorEnvelope builds the common envelope shape", () => {
  assertEquals(errorEnvelope("invalid_request", "bad body"), {
    error: "invalid_request",
    message: "bad body",
  });
  assertEquals(errorEnvelope("invalid_request", "bad body", { field: "fw" }), {
    error: "invalid_request",
    message: "bad body",
    detail: { field: "fw" },
  });
});

Deno.test("errorEnvelope omits detail when not provided", () => {
  assert(!("detail" in errorEnvelope("x", "y")));
});

Deno.test("jsonResponse serializes JSON with status", async () => {
  const res = jsonResponse({ ok: true }, { status: 202 });
  assertEquals(res.status, 202);
  assertEquals(res.headers.get("content-type"), "application/json");
  assertEquals(await res.json(), { ok: true });
});

Deno.test("jsonResponse defaults to 200", () => {
  assertEquals(jsonResponse({}).status, 200);
});

Deno.test("errorResponse maps ApiError to envelope with status and headers", async () => {
  const err = new ApiError(429, "rate_limited", "slow down", {
    detail: { retry_after: 7 },
    headers: { "Retry-After": "7" },
  });
  const res = errorResponse(err);
  assertEquals(res.status, 429);
  assertEquals(res.headers.get("Retry-After"), "7");
  assertEquals(await res.json(), {
    error: "rate_limited",
    message: "slow down",
    detail: { retry_after: 7 },
  });
});

Deno.test("toErrorResponse passes ApiError through", async () => {
  const res = toErrorResponse(new ApiError(403, "not_granted", "nope"));
  assertEquals(res.status, 403);
  assertEquals(await res.json(), { error: "not_granted", message: "nope" });
});

Deno.test("toErrorResponse hides internal error details", async () => {
  const res = toErrorResponse(new Error("db password is hunter2"));
  assertEquals(res.status, 500);
  assertEquals(await res.json(), {
    error: "internal",
    message: "internal server error",
  });
});
