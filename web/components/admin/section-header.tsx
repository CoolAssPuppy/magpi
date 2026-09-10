/** The heading for one admin section. It says which section you are in and nothing else. */
export function SectionHeader({ title }: { title: string }) {
  return (
    <h1 className="font-heading text-xl leading-tight font-medium text-foreground">{title}</h1>
  );
}
