/**
 * What Next hands an `error.tsx`.
 *
 * Shared because two of the thirteen boundaries hand-wrote it and named the
 * reset callback `retry`, which is not what Next passes. The prop was undefined
 * at runtime and the button did nothing, on the product's central screen, and
 * nothing caught it: the type was hand-written so it agreed with itself.
 */
export type ErrorBoundaryProps = {
  readonly error: Error & { digest?: string };
  readonly reset: () => void;
};
