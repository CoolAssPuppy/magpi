export function ErrorState({ title, detail }: { title: string; detail?: string }) {
  return (
    <div
      role="alert"
      className="border-border-destructive bg-destructive-200 rounded-[var(--radius-panel)] border p-5"
    >
      <h2 className="font-heading text-destructive-600 text-base font-medium">{title}</h2>
      {detail ? (
        <p className="text-foreground-light mt-1 max-w-[var(--measure-prose)] text-sm">{detail}</p>
      ) : null}
    </div>
  );
}
