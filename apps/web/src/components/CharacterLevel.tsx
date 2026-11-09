import type { Character } from '../api/client';

export function CharacterLevel({ character }: { character: Pick<Character, 'level' | 'status' | 'syncError'> }) {
  if (character.level != null) {
    return (
      <span className="level" title={character.status !== 'ok' ? character.syncError ?? undefined : undefined}>
        {character.level}
        {character.status === 'error' && <span className="badge error" title={character.syncError ?? ''}>!</span>}
      </span>
    );
  }
  if (character.status === 'error') {
    return <span className="badge error" title={character.syncError ?? ''}>error</span>;
  }
  return <span className="badge pending" title={character.syncError ?? 'Waiting for the Blizzard API'}>pending</span>;
}
