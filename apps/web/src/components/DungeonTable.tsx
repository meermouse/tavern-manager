import type { Character } from '../api/client';
import { CharacterLevel } from './CharacterLevel';
import { CharacterAvatar } from './CharacterAvatar';
import { CharacterLink } from './CharacterLink';
import { ClassName } from './ClassName';
import { RoleCounts, RoleIcons } from './RoleIcons';
import { assignCharactersToDungeons } from '../dungeons';
import { questsFor, wowheadQuestUrl, type DungeonQuest, type QuestRef } from '../dungeonQuests';
import { HoverCard } from './HoverCard';

/** A grid of ! markers, one per quest that leads into the dungeon; hover, focus or click one for its details and Wowhead links. */
export function QuestMarkers({ dungeon, faction }: { dungeon: string; faction?: 'Alliance' | 'Horde' | null }) {
  const quests = questsFor(dungeon, faction ?? null);
  if (!quests.length) return null;
  return (
    <ul className="quest-markers" aria-label={`${quests.length} ${quests.length === 1 ? 'quest' : 'quests'} for ${dungeon}`}>
      {quests.map((quest) => (
        <li key={`${quest.name}-${quest.faction}-${quest.giver}`}>
          <HoverCard
            className={`quest-marker ${quest.faction.toLowerCase()}`}
            content={() => <QuestCard quest={quest} />}
            openOnClick
          >
            <span aria-hidden="true">!</span>
            <span className="sr-only">{quest.name}: {questGiverText(quest)}{questTagText(quest)}</span>
          </HoverCard>
        </li>
      ))}
    </ul>
  );
}

/** Who gives the quest and where, for screen readers; some new Forever quests have no giver on record yet. */
function questGiverText(quest: DungeonQuest): string {
  if (!quest.giver) return 'quest giver not on record yet';
  return quest.location ? `${quest.giver}, ${quest.location}` : quest.giver;
}

/** ", shareable, chain quest" and the like, for screen readers. */
function questTagText(quest: DungeonQuest): string {
  const tags = [];
  if (quest.shareable !== undefined) tags.push(quest.shareable ? 'shareable' : 'not shareable');
  if (quest.chain) tags.push(`chain quest, ${quest.chain.first.name} to ${quest.chain.last.name}`);
  return tags.map((tag) => `, ${tag}`).join('');
}

function QuestLink({ quest, current }: { quest: QuestRef; current: DungeonQuest }) {
  return (
    <>
      <a href={wowheadQuestUrl(quest)} target="_blank" rel="noreferrer">{quest.name}</a>
      {quest.id === current.id && <span className="muted"> (this quest)</span>}
    </>
  );
}

function QuestCard({ quest }: { quest: DungeonQuest }) {
  return (
    <div className="quest-card">
      <div className="qc-name">{quest.name}</div>
      {quest.giver ? <div>{quest.giver}</div> : <div className="muted">Quest giver not on record yet</div>}
      {quest.location && <div className="qc-location">{quest.location}</div>}
      {quest.faction !== 'Both' && <div className={`faction ${quest.faction.toLowerCase()}`}>{quest.faction} only</div>}
      {(quest.shareable !== undefined || quest.chain) && (
        <div className="qc-tags">
          {quest.shareable !== undefined && (
            <span className={`qc-tag ${quest.shareable ? 'shareable' : 'not-shareable'}`}>
              {quest.shareable ? 'Shareable' : 'Not shareable'}
            </span>
          )}
          {quest.chain && <span className="qc-tag chain">Chain quest · {quest.chain.length} steps</span>}
        </div>
      )}
      {quest.chain && (
        <dl className="qc-chain">
          <dt>Starts</dt>
          <dd><QuestLink quest={quest.chain.first} current={quest} /></dd>
          <dt>Ends</dt>
          <dd><QuestLink quest={quest.chain.last} current={quest} /></dd>
        </dl>
      )}
      <a className="qc-wowhead" href={wowheadQuestUrl(quest)} target="_blank" rel="noreferrer">
        {quest.id ? 'View on Wowhead ↗' : 'Search Wowhead ↗'}
      </a>
    </div>
  );
}

function CharacterNames({
  characters,
  showRoles,
  dungeon,
}: {
  characters: Character[];
  showRoles: boolean;
  /** The row's dungeon, to mark characters who've logged it as completed. */
  dungeon?: string;
}) {
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
            {dungeon && character.dungeonsCompleted?.[dungeon] && (
              <span className="badge dungeon-done" title={`Logged as completed ${new Date(character.dungeonsCompleted[dungeon]).toLocaleDateString()}`}>
                ✔ Done
              </span>
            )}
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
  showTotals = false,
  onLogRun,
  questFaction = null,
}: {
  characters: Character[];
  /** Heading for the characters column, e.g. "Tavern characters" or "Your characters". */
  charactersLabel?: string;
  /** Show each dungeon's eligible count and per-role totals (for tavern groups, not your own list). */
  showTotals?: boolean;
  /** Offer a "Log run" button on each dungeon (tavern view). */
  onLogRun?: (dungeon: string) => void;
  /** Only show quests this faction can pick up (null shows both factions' quests). */
  questFaction?: 'Alliance' | 'Horde' | null;
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
                  <QuestMarkers dungeon={row.dungeon.name} faction={questFaction} />
                  {showTotals && <EligibleSummary characters={row.characters} />}
                  {onLogRun && (
                    <button
                      className="ghost small log-run"
                      aria-label={`Log a ${row.dungeon.name} run`}
                      onClick={() => onLogRun(row.dungeon.name)}
                    >
                      + Log run
                    </button>
                  )}
                </div>
              </td>
              <td data-label="Recommended level">{row.dungeon.minLevel}–{row.dungeon.maxLevel}</td>
              <td data-label="Players">{row.dungeon.players}</td>
              <td data-label="Faction">{row.dungeon.faction}</td>
              <td data-label={charactersLabel}>
                <CharacterNames characters={row.characters} showRoles={showRoles} dungeon={row.dungeon.name} />
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
