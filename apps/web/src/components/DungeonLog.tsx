import type { Character } from '../api/client';
import { useSetDungeonCompleted } from '../api/hooks';
import { dungeons } from '../dungeons';
import { CharacterAvatar } from './CharacterAvatar';
import { CharacterLevel } from './CharacterLevel';
import { ClassName } from './ClassName';

/** How many of the listed dungeons a character has logged as completed. */
export function completedCount(character: Pick<Character, 'dungeonsCompleted'>): number {
  const log = character.dungeonsCompleted ?? {};
  return dungeons.filter((d) => log[d.name]).length;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

/** One character's checklist: every dungeon, ticked when the owner has logged it as completed. */
function CharacterDungeonLog({ character, open }: { character: Character; open: boolean }) {
  const setCompleted = useSetDungeonCompleted(character.id);
  const log = character.dungeonsCompleted ?? {};
  const done = completedCount(character);

  return (
    <details className="card dungeon-log" open={open}>
      <summary>
        <CharacterAvatar character={character} size="sm" />
        <span className="dungeon-log-who">
          <strong>{character.name} {character.surname}</strong>
          <span className="muted small-text">
            {character.class && <ClassName value={character.class} />} <CharacterLevel character={character} />
          </span>
        </span>
        <span className="dungeon-log-count" aria-label={`${done} of ${dungeons.length} dungeons completed`}>
          {done} / {dungeons.length}
        </span>
      </summary>
      <div className="dungeon-log-progress" aria-hidden="true">
        <span style={{ width: `${(done / dungeons.length) * 100}%` }} />
      </div>
      {setCompleted.error && <p className="error small-text">{setCompleted.error.message}</p>}
      <ul className="dungeon-log-list">
        {dungeons.map((d) => {
          const loggedAt = log[d.name];
          return (
            <li key={d.name} className={loggedAt ? 'done' : undefined}>
              <label>
                <input
                  type="checkbox"
                  checked={!!loggedAt}
                  onChange={(e) => setCompleted.mutate({ dungeon: d.name, completed: e.target.checked })}
                />
                <span className="dungeon-log-name">{d.name}</span>
                <span className="muted small-text">
                  {loggedAt ? <time dateTime={loggedAt}>{formatDate(loggedAt)}</time> : `${d.minLevel}–${d.maxLevel}`}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
    </details>
  );
}

/** A dungeon checklist for each of your characters, so completed runs get logged. */
export function DungeonLog({ characters }: { characters: Character[] }) {
  return (
    <div className="dungeon-logs">
      {characters.map((c) => (
        <CharacterDungeonLog key={c.id} character={c} open={characters.length === 1} />
      ))}
    </div>
  );
}
