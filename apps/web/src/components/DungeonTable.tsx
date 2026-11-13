import type { Character } from '../api/client';
import { CharacterLevel } from './CharacterLevel';
import { CharacterAvatar } from './CharacterAvatar';
import { CharacterLink } from './CharacterLink';
import { ClassName } from './ClassName';
import { assignCharactersToDungeons } from '../dungeons';

function CharacterNames({ characters }: { characters: Character[] }) {
  if (!characters.length) return <span className="muted">No characters in range</span>;

  return (
    <div className="dungeon-characters">
      {characters.map((character) => (
        <span className="dungeon-character" key={character.id}>
          <CharacterLink character={character}>
            <CharacterAvatar character={character} size="xs" />
            <strong>{character.name} {character.surname}</strong>
          </CharacterLink>
          {'ownerName' in character && typeof character.ownerName === 'string' && (
            <span className="muted small-text">{character.ownerName}</span>
          )}
          {character.class && <ClassName value={character.class} />}
          <CharacterLevel character={character} />
        </span>
      ))}
    </div>
  );
}

export function DungeonTable({
  characters,
  charactersLabel = 'Tavern characters',
}: {
  characters: Character[];
  /** Heading for the characters column, e.g. "Tavern characters" or "Your characters". */
  charactersLabel?: string;
}) {
  const assignments = assignCharactersToDungeons(characters);

  return (
    <div className="table-wrap dungeon-table-wrap">
      <table className="dungeon-table">
        <thead>
          <tr>
            <th>Dungeon</th>
            <th>Recommended level</th>
            <th>Players</th>
            <th>Faction</th>
            <th>{charactersLabel}</th>
          </tr>
        </thead>
        <tbody>
          {assignments.rows.map((row) => row.type === 'between' ? (
            <tr className="dungeon-between" key={`between-${row.characters[0]?.id}`}>
              <td colSpan={4}>Outside the listed level ranges</td>
              <td><CharacterNames characters={row.characters} /></td>
            </tr>
          ) : (
            <tr key={row.dungeon.name}>
              <td data-label="Dungeon"><strong>{row.dungeon.name}</strong></td>
              <td data-label="Recommended level">{row.dungeon.minLevel}–{row.dungeon.maxLevel}</td>
              <td data-label="Players">{row.dungeon.players}</td>
              <td data-label="Faction">{row.dungeon.faction}</td>
              <td data-label={charactersLabel}>
                <CharacterNames characters={row.characters} />
              </td>
            </tr>
          ))}
          {assignments.pending.length > 0 && (
            <tr className="dungeon-between" key="pending-characters">
              <td colSpan={4}>Pending level</td>
              <td><CharacterNames characters={assignments.pending} /></td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}