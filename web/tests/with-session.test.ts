import type { User } from "@supabase/supabase-js";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocked = vi.hoisted(() => ({
  context: null as { user: { id: string }; accessToken: string; apiBaseUrl: string } | null,
  revalidated: [] as string[],
}));

vi.mock("next/cache", () => ({
  revalidatePath: (path: string) => mocked.revalidated.push(path),
}));

vi.mock("@/lib/supabase/context", () => ({
  getSessionContext: async () => mocked.context,
}));

const { withSession } = await import("@/lib/actions/with-session");
const { NOT_SIGNED_IN, errorState, successState } = await import("@/lib/actions/state");

function signIn(): void {
  mocked.context = {
    user: { id: "11111111-1111-4111-a111-111111111111" },
    accessToken: "jwt",
    apiBaseUrl: "http://127.0.0.1:56521/functions/v1",
  };
}

afterEach(() => {
  mocked.context = null;
  mocked.revalidated = [];
});

describe("running an action as the caller", () => {
  it("refuses when nobody is signed in, and never runs the action", async () => {
    let ran = false;
    const result = await withSession(async () => {
      ran = true;
      return successState("Saved.");
    }, "/dashboard");

    expect(result).toEqual(errorState(NOT_SIGNED_IN));
    expect(ran).toBe(false);
  });

  it("hands the action the caller's own context", async () => {
    signIn();
    const seen: string[] = [];

    await withSession(async (context) => {
      seen.push(context.user.id, context.accessToken);
      return successState("Saved.");
    }, "/dashboard");

    expect(seen).toEqual(["11111111-1111-4111-a111-111111111111", "jwt"]);
  });

  it("refreshes the page after a success, so the change is visible without a reload", async () => {
    signIn();
    await withSession(async () => successState("Saved."), "/pages");

    expect(mocked.revalidated).toEqual(["/pages"]);
  });

  it("leaves the page alone after a failure, since nothing changed", async () => {
    signIn();
    const result = await withSession(async () => errorState("That name is taken."), "/pages");

    expect(result.status).toBe("error");
    expect(mocked.revalidated).toEqual([]);
  });

  it("lets a redirect unwind, because catching it would freeze the form", async () => {
    signIn();
    const redirect = new Error("NEXT_REDIRECT");

    await expect(
      withSession(async () => {
        throw redirect;
      }, "/dashboard"),
    ).rejects.toBe(redirect);
  });
});
