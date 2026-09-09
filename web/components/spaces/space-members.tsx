import type { Database } from '@/lib/database.types';

type SpaceKind = Database['public']['Enums']['space_kind'];

export type SpaceMember = { readonly userId: string; readonly joinedAt: string };

export function SpaceMembers({
  kind,
  members,
}: {
  kind: SpaceKind;
  members: readonly SpaceMember[];
}) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-heading text-foreground text-sm font-medium">
        {members.length} {members.length === 1 ? 'member' : 'members'}
      </h2>

      {kind === 'personal' ? (
        <p className="text-foreground-lighter text-sm">
          A personal space has one member, always. Nobody can be added to it.
        </p>
      ) : null}

      {kind === 'org' ? (
        <p className="text-foreground-lighter text-sm">
          Everyone in the organization is in this space. Membership follows the organization.
        </p>
      ) : null}

      <ul className="border-border divide-border divide-y rounded-[var(--radius-panel)] border">
        {members.map((member) => (
          <li
            key={member.userId}
            className="text-foreground-light flex items-baseline justify-between gap-4 px-4 py-2.5 text-sm"
          >
            <span className="font-mono text-xs">{member.userId.slice(0, 8)}</span>
            <time className="text-foreground-lighter text-xs" dateTime={member.joinedAt}>
              joined {member.joinedAt.slice(0, 10)}
            </time>
          </li>
        ))}
      </ul>
    </section>
  );
}
