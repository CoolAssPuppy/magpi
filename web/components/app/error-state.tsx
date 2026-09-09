export function ErrorState({ title, detail }: { title: string; detail?: string }) {
  return (
    <div
      role="alert"
      className="rounded-[var(--radius-panel)] border border-border-destructive bg-destructive-200 p-5"
    >
      <h2 className="font-heading text-base font-medium text-destructive-600">{title}</h2>
      {detail ? (
        <p className="mt-1 max-w-[var(--measure-prose)] text-sm text-foreground-light">{detail}</p>
      ) : null}
    </div>
  );
}
