export const NOT_SIGNED_IN = 'You need to sign in to do that.';

/** What every server action returns. Switching on `status` is exhaustive. */
export type ActionState<T = undefined> =
  | { readonly status: 'idle' }
  | { readonly status: 'success'; readonly data: T }
  | { readonly status: 'error'; readonly message: string };

export const idleState: ActionState<never> = { status: 'idle' };

export function successState<T>(data: T): ActionState<T> {
  return { status: 'success', data };
}

export function errorState(message: string): ActionState<never> {
  return { status: 'error', message };
}
