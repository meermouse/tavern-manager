import { useState } from 'react';
import type { Character } from '../api/client';
import { classKey } from './ClassName';

type AvatarCharacter = Pick<Character, 'name' | 'class'> & Partial<Pick<Character, 'surname' | 'avatarUrl'>>;

/**
 * A character's Blizzard headshot, ringed in their class colour. Falls back to their initial when there's
 * no image yet (pending characters) or it fails to load.
 */
export function CharacterAvatar({
  character,
  size = 'sm',
  className = '',
}: {
  character: AvatarCharacter;
  size?: 'xs' | 'sm' | 'md';
  className?: string;
}) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const key = classKey(character.class);
  const url = character.avatarUrl && character.avatarUrl !== failedUrl ? character.avatarUrl : null;
  const classes = `char-avatar char-avatar-${size} ${key ? `class-bg-${key}` : ''} ${className}`.trim();
  if (url) {
    return (
      <img
        className={classes}
        src={url}
        alt=""
        loading="lazy"
        decoding="async"
        onError={() => setFailedUrl(url)}
      />
    );
  }
  return (
    <span className={`${classes} char-avatar-initial`} aria-hidden="true">
      {character.name.charAt(0).toUpperCase()}
    </span>
  );
}
