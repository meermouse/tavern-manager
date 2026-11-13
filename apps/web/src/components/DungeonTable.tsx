import type { Character } from '../api/client';
import { CharacterLevel } from './CharacterLevel';
import { CharacterAvatar } from './CharacterAvatar';
import { CharacterLink } from './CharacterLink';
import { ClassName } from './ClassName';
import { RoleCounts, RoleIcons } from './RoleIcons';
import { assignCharactersToDungeons } from '../dungeons';

function CharacterNames({ characters, showRoles }: { characters: Character[]; showRoles: boolean }) {
  if (!characters.length) return <span className="muted">No characters in range</span>;

  return (
    <ul className="dungeon-characters">
      {characters.map((character) => (
        <li className="dungeon-line" key={character.id}>
          {/* Roles sit outside the chip, in a fixed-width slot, so they line up down the list. */}
          {showRoles && (
            <span className="dungeon-roles">
              <RoleIcons roles={character.roles} />
            </span>
          )}
          <span className="dungeon-character">
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
        </li>
      ))}
    </ul>
  );
}

/** "3 eligible" plus how many of them are tanks, healers and damage. */
function EligibleSummary({ characters }: { characters: Character[] }) {
  return (
    <div className="dungeon-eligible">
      <span className="muted small-text">
        {characters.length} eligible
      </span>
      {characters.length > 0 && <RoleCounts characters={characters} />}
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
  // Only reserve the roles slot when someone has a role, so tables without any stay compact.
  const showRoles = characters.some((c) => c.roles?.length);

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
              <td><CharacterNames characters={row.characters} showRoles={showRoles} /></td>
            </tr>
          ) : (
            <tr key={row.dungeon.name}>
              <td data-label="Dungeon">
                <div className="dungeon-name">
                  <strong>{row.dungeon.name}</strong>
                  <EligibleSummary characters={row.characters} />
                </div>
              </td>
              <td data-label="Recommended level">{row.dungeon.minLevel}–{row.dungeon.maxLevel}</td>
              <td data-label="Players">{row.dungeon.players}</td>
              <td data-label="Faction">{row.dungeon.faction}</td>
              <td data-label={charactersLabel}>
                <CharacterNames characters={row.characters} showRoles={showRoles} />
              </td>
            </tr>
          ))}
          {assignments.pending.length > 0 && (
            <tr className="dungeon-between" key="pending-characters">
              <td colSpan={4}>Pending level</td>
              <td><CharacterNames characters={assignments.pending} showRoles={showRoles} /></td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
