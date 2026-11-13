import { createContext, useContext, type ReactNode } from 'react';
import type { TavernCharacter } from '../api/client';
import { CharacterAvatar } from './CharacterAvatar';
import { CharacterLevel } from './CharacterLevel';
import { ClassName, classKey } from './ClassName';
import { HoverCard } from './HoverCard';
import { ProfessionGlyph, primaryProfessions, professionKey } from './ProfessionIcons';
import { ROLES, ROLE_LABELS, RoleGlyph } from './RoleIcons';
import { timeAgo } from '../time';

/** Anything with an id and a name; the more fields, the richer the card. */
export type CharacterLike = Pick<TavernCharacter, 'id' | 'name'> & Partial<Omit<TavernCharacter, 'id' | 'name'>>;

/**
 * Characters known on the current page (e.g. a tavern's roster), by id. Lets sparse references, such as a feed
 * post's character, show the full card.
 */
export const CharacterDirectory = createContext<ReadonlyMap<string, CharacterLike>>(new Map());

export function CharacterCard({ character: c }: { character: CharacterLike }) {
  const key = classKey(c.class ?? null);
  const image = c.insetUrl ?? null;
  const line = [c.race, c.class].filter(Boolean);
  return (
    <div className={`character-card ${key ? `class-bg-${key}` : ''}`}>
      {image ? (
        <img className="cc-inset" src={image} alt="" />
      ) : (
        <CharacterAvatar character={{ name: c.name, class: c.class ?? null, avatarUrl: c.avatarUrl }} size="md" />
      )}
      <div className="cc-body">
        <div className={`cc-name ${key ? `class-${key}` : ''}`}>
          {c.name} {c.surname}
        </div>
        {c.title && <div className="cc-title">{c.title}</div>}
        <div className="cc-line">
          {c.level != null ? (
            <>Level {c.level}</>
          ) : c.status ? (
            <CharacterLevel character={{ level: null, status: c.status, syncError: c.syncError ?? null }} />
          ) : null}{' '}
          {line.length > 0 && (
            <>
              {c.race} {c.class && <ClassName value={c.class} />}
            </>
          )}
        </div>
        {c.guild && <div className="cc-guild">&lt;{c.guild}&gt;</div>}
        <div className="cc-badges">
          {c.faction && <span className={`badge faction ${c.faction.toLowerCase()}`}>{c.faction}</span>}
          {c.ruleset && <span className="badge">{c.ruleset}</span>}
          {c.region && <span className="badge">{c.region.toUpperCase()}</span>}
          {/* Labelled rather than icon-only: this card is itself a tooltip, so the icons can't have their own. */}
          {ROLES.filter((r) => c.roles?.includes(r)).map((r) => (
            <span key={r} className={`badge role-badge role-${r}`}>
              <RoleGlyph role={r} />
              {ROLE_LABELS[r]}
            </span>
          ))}
        </div>
        <dl className="cc-stats">
          {c.ownerName && (
            <>
              <dt>Player</dt>
              <dd>{c.ownerName}</dd>
            </>
          )}
          {c.itemLevel != null && (
            <>
              <dt>Item level</dt>
              <dd>{c.itemLevel}</dd>
            </>
          )}
          {c.achievementPoints != null && (
            <>
              <dt>Achievement points</dt>
              <dd>{c.achievementPoints}</dd>
            </>
          )}
          {/* Spelled out rather than icon-only: this card is itself a tooltip, so the icons can't have their own. */}
          {primaryProfessions(c.professions).length > 0 && (
            <>
              <dt>Professions</dt>
              <dd className="cc-professions">
                {primaryProfessions(c.professions).map((p) => (
                  <span key={p.name} className="cc-profession">
                    <span className={`profession-slot profession-${professionKey(p.name)}`}>
                      <ProfessionGlyph name={p.name} />
                    </span>
                    {p.name}
                    {p.skill != null && <span className="muted"> {p.skill}</span>}
                  </span>
                ))}
              </dd>
            </>
          )}
          {c.lastLoginAt && (
            <>
              <dt>Last seen</dt>
              <dd>{timeAgo(c.lastLoginAt)}</dd>
            </>
          )}
        </dl>
      </div>
    </div>
  );
}

/** Wraps a character's name or portrait so hovering (or focusing) it shows their card. */
export function CharacterLink({
  character,
  children,
  focusable,
}: {
  character: CharacterLike;
  children: ReactNode;
  focusable?: boolean;
}) {
  const directory = useContext(CharacterDirectory);
  return (
    <HoverCard
      className="character-link"
      focusable={focusable}
      content={() => <CharacterCard character={{ ...character, ...directory.get(character.id) }} />}
    >
      {children}
    </HoverCard>
  );
}
