/**
 * What every form action returns. Messages are user-facing: never an internal
 * code or a raw upstream string, which can leak rows a caller may not know of.
 */
export type ActionState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "success"; message: string };

export const IDLE: ActionState = { status: "idle" };

export function errorState(message: string): ActionState {
  return { status: "error", message };
}

export function successState(message: string): ActionState {
  return { status: "success", message };
}

export const NOT_SIGNED_IN = "You need to sign in again before you can do that.";
