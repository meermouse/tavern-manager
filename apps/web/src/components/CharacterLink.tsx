import { createContext, useContext, type ReactNode } from 'react';
import type { TavernCharacter } from '../api/client';
import { TitleBadges } from './TitleBadges';
import { CharacterAvatar } from './CharacterAvatar';
import { CharacterLevel } from './CharacterLevel';
import { CharacterStats, Stat } from './CharacterStats';
import { ClassName, classKey } from './ClassName';
import { HoverCard } from './HoverCard';
import { ProfessionGlyph, primaryProfessions, professionKey } from './ProfessionIcons';
import { ROLES, ROLE_LABELS, RoleGlyph } from './RoleIcons';

/** Anything with an id and a name; the more fields, the richer the card. */
export type CharacterLike = Pick<TavernCharacter, 'id' | 'name'> & Partial<Omit<TavernCharacter, 'id' | 'name'>>;

/**
 * Characters known on the current page (e.g. a tavern's roster), by id. Lets sparse references, such as a feed
 * post's character, show the full card.
 */
export const CharacterDirectory = createContext<ReadonlyMap<string, CharacterLike>>(new Map());

export function CharacterCard({ character: c, onDetails }: { character: CharacterLike; onDetails?: () => void }) {
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
        <TitleBadges titles={c.titles} labelled />
        <CharacterStats character={c} className="cc-stats">
          {/* Spelled out rather than icon-only: this card is itself a tooltip, so the icons can't have their own. */}
          {primaryProfessions(c.professions).length > 0 && (
            <Stat label="Professions">
              <span className="cc-professions">
                {primaryProfessions(c.professions).map((p) => (
                  <span key={p.name} className="cc-profession">
                    <span className={`profession-slot profession-${professionKey(p.name)}`}>
                      <ProfessionGlyph name={p.name} />
                    </span>
                    {p.name}
                    {p.skill != null && <span className="muted"> {p.skill}</span>}
                  </span>
                ))}
              </span>
            </Stat>
          )}
        </CharacterStats>
        {onDetails && (
          // Shown on touch screens only (see styles.css), where tapping a name can bring up this card instead of the
          // details pane: this gets them there.
          <button
            type="button"
            className="small cc-details-button"
            onClick={(e) => {
              // The card is portalled but React still bubbles the click to the table row, whose click toggles the pane.
              e.stopPropagation();
              onDetails();
            }}
          >
            Details
          </button>
        )}
      </div>
    </div>
  );
}

/** Wraps a character's name or portrait so hovering (or focusing) it shows their card. */
export function CharacterLink({
  character,
  children,
  focusable,
  onDetails,
}: {
  character: CharacterLike;
  children: ReactNode;
  focusable?: boolean;
  /** Puts a Details button on the card (touch screens only) that opens this character's details pane. */
  onDetails?: () => void;
}) {
  const directory = useContext(CharacterDirectory);
  return (
    <HoverCard
      className="character-link"
      focusable={focusable}
      content={(close) => (
        <CharacterCard
          character={{ ...character, ...directory.get(character.id) }}
          onDetails={
            onDetails &&
            (() => {
              close();
              onDetails();
            })
          }
        />
      )}
    >
      {children}
    </HoverCard>
  );
}
