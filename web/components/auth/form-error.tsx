/**
 * The one error presentation for auth forms. A full border and a background
 * tint, never a thick left stripe.
 */
export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className="rounded-[var(--radius-panel)] border border-border-destructive bg-destructive-200 px-3 py-2 text-sm text-destructive-600"
    >
      {message}
    </p>
  );
}
