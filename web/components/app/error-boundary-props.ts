/** What Next hands an `error.tsx`. Shared so no boundary hand-writes the prop names. */
export type ErrorBoundaryProps = {
  readonly error: Error & { digest?: string };
  readonly reset: () => void;
};
