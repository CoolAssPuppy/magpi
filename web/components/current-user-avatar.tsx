'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useCurrentUserImage } from '@/hooks/use-current-user-image';
import { useCurrentUserName } from '@/hooks/use-current-user-name';

function initialsFrom(name: string | null): string {
  if (!name) return '?';
  const parts = name
    .replace(/@.*$/, '')
    .split(/[\s._-]+/)
    .filter(Boolean);
  return (
    parts
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('') || '?'
  );
}

export function CurrentUserAvatar() {
  const image = useCurrentUserImage();
  const name = useCurrentUserName();
  const initials = initialsFrom(name);

  return (
    <Avatar className="size-7">
      {image ? <AvatarImage src={image} alt={name ?? 'Your avatar'} /> : null}
      <AvatarFallback className="bg-secondary text-xs text-muted-foreground">
        {initials}
      </AvatarFallback>
    </Avatar>
  );
}
