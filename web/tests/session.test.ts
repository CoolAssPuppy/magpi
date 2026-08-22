import { describe, expect, it } from "vitest";

import {
  isStaleSessionError,
  isSupabaseAuthCookie,
  readSessionUser,
  type SessionClient,
} from "@/lib/supabase/session";

interface FakeUser {
  id: string;
}

interface AuthResult {
  data: { user: FakeUser | null };
  error?: { code?: string; status?: number; message?: string } | null;
}

function clientReturning(result: AuthResult): SessionClient<FakeUser> {
  return { auth: { getUser: () => Promise.resolve(result) } };
}

function clientThrowing(thrown: unknown): SessionClient<FakeUser> {
  return { auth: { getUser: () => Promise.reject(thrown) } };
}

const SIGNED_IN: AuthResult = { data: { user: { id: "user-1" } }, error: null };

describe("spotting a session that can no longer be refreshed", () => {
  it("matches every code the auth server sends for a dead refresh token", () => {
    for (const code of [
      "refresh_token_not_found",
      "refresh_token_already_used",
      "session_not_found",
      "session_expired",
      "bad_jwt",
    ]) {
      expect(isStaleSessionError({ code })).toBe(true);
    }
  });

  it("matches an older server that sends prose and no code", () => {
    expect(isStaleSessionError({ message: "Invalid Refresh Token: Already Used" })).toBe(true);
    expect(isStaleSessionError({ message: "invalid refresh token" })).toBe(true);
  });

  it("leaves a real failure alone, so nobody is signed out by a network blip", () => {
    expect(isStaleSessionError({ code: "over_request_rate_limit" })).toBe(false);
    expect(isStaleSessionError({ message: "fetch failed" })).toBe(false);
    expect(isStaleSessionError({ status: 500 })).toBe(false);
  });

  it("treats a missing or unreadable error as no error at all", () => {
    expect(isStaleSessionError(null)).toBe(false);
    expect(isStaleSessionError(undefined)).toBe(false);
    expect(isStaleSessionError("")).toBe(false);
    expect(isStaleSessionError("refresh_token_not_found")).toBe(false);
    expect(isStaleSessionError({ code: 42 })).toBe(false);
    expect(isStaleSessionError({ message: 42 })).toBe(false);
  });
});

describe("naming the cookies a dead session leaves behind", () => {
  it("matches the auth cookie and each of its chunks", () => {
    expect(isSupabaseAuthCookie("sb-abcdefgh-auth-token")).toBe(true);
    expect(isSupabaseAuthCookie("sb-abcdefgh-auth-token.0")).toBe(true);
    expect(isSupabaseAuthCookie("sb-abcdefgh-auth-token.1")).toBe(true);
  });

  it("leaves every other cookie in place", () => {
    expect(isSupabaseAuthCookie("sb-abcdefgh-provider-token")).toBe(false);
    expect(isSupabaseAuthCookie("theme")).toBe(false);
    expect(isSupabaseAuthCookie("auth-token")).toBe(false);
  });
});

describe("reading the caller", () => {
  it("hands back the user when the session is good", async () => {
    const read = await readSessionUser(clientReturning(SIGNED_IN));
    expect(read).toEqual({ user: { id: "user-1" }, isStale: false });
  });

  it("reports no user, and no stale cookie, when nobody is signed in", async () => {
    const read = await readSessionUser(clientReturning({ data: { user: null }, error: null }));
    expect(read).toEqual({ user: null, isStale: false });
  });

  it("flags the cookie for deletion when the error says the token is dead", async () => {
    const read = await readSessionUser(
      clientReturning({ data: { user: null }, error: { code: "refresh_token_not_found" } }),
    );
    expect(read).toEqual({ user: null, isStale: true });
  });

  it("flags the cookie when supabase-js throws instead of returning", async () => {
    const read = await readSessionUser(clientThrowing({ code: "refresh_token_already_used" }));
    expect(read).toEqual({ user: null, isStale: true });
  });

  it("swallows an unrelated throw rather than breaking the page that renders /login", async () => {
    const read = await readSessionUser(clientThrowing(new Error("fetch failed")));
    expect(read).toEqual({ user: null, isStale: false });
  });

  it("keeps a real error from silently signing the caller out", async () => {
    const read = await readSessionUser(
      clientReturning({ data: { user: { id: "user-1" } }, error: { code: "some_other_problem" } }),
    );
    expect(read.isStale).toBe(false);
    expect(read.user).toEqual({ id: "user-1" });
  });
});
