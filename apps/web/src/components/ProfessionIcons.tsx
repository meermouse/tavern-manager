import type { ReactNode } from 'react';
import type { Profession } from '../api/client';
import { HoverCard } from './HoverCard';

/** Every character has two primary profession slots. */
export const PRIMARY_SLOTS = 2;

// 16×16 glyphs drawn with currentColor, like the role icons.
const GLYPHS: Record<string, ReactNode> = {
  // Round-bottomed flask.
  alchemy: <path d="M6 1.5h4v1h-.6v3.7l3.9 6.2c.7 1.1-.1 2.6-1.4 2.6H4.1c-1.3 0-2.1-1.5-1.4-2.6l3.9-6.2V2.5H6v-1Zm-.9 9.3h5.8L9.1 8H6.9l-1.8 2.8Z" fillRule="evenodd" />,
  // Anvil.
  blacksmithing: <path d="M1.5 4h10.2c0 1.8 1.3 2.9 2.8 2.9v1.6h-3.3c-.9 0-1.6.7-1.6 1.6v1h1.6V13H4.8v-1.9h1.6v-1C6.4 8.3 4.6 7.1 1.5 7V4Z" />,
  // Four-point sparkle.
  enchanting: <path d="M8 1l1.5 5.5L15 8l-5.5 1.5L8 15l-1.5-5.5L1 8l5.5-1.5L8 1Zm5 0 .6 1.4L15 3l-1.4.6L13 5l-.6-1.4L11 3l1.4-.6L13 1Z" />,
  // Cog.
  engineering: (
    <path
      fillRule="evenodd"
      d="M7 1h2l.4 2 1.5.6 1.7-1.2 1.4 1.4-1.2 1.7.6 1.5 2 .4v2l-2 .4-.6 1.5 1.2 1.7-1.4 1.4-1.7-1.2-1.5.6L9 15H7l-.4-2-1.5-.6-1.7 1.2-1.4-1.4 1.2-1.7-.6-1.5L1 9V7l2-.4.6-1.5-1.2-1.7 1.4-1.4 1.7 1.2 1.5-.6L7 1Zm1 4.6a2.4 2.4 0 1 0 0 4.8 2.4 2.4 0 0 0 0-4.8Z"
    />
  ),
  // Leaf on a stem.
  herbalism: <path d="M14.5 1.5C7.5 1.5 3 5 3 10c0 .9.2 1.7.5 2.4l-2 2 .9.9 2-2c.7.4 1.6.6 2.5.6 5 0 7.6-4.6 7.6-12.4ZM5.2 11.9l5.5-6.1.6.5-5.5 6.1-.6-.5Z" fillRule="evenodd" />,
  // Stretched hide.
  leatherworking: <path d="M3 2l2.6 1.2h4.8L13 2l1.2 3.2-1.6 2 .6 5.1L10 14H6l-3.2-1.7.6-5.1-1.6-2L3 2Z" />,
  // Pickaxe.
  mining: <path d="M1.8 5.2C4.6 1.9 9.6 1 13.6 3.2l-1.5 1.5C9 3.4 5.5 3.8 3 5.9L1.8 5.2Zm7.8.3 1.4 1.4-7.5 7.5a1 1 0 0 1-1.4-1.4l7.5-7.5Zm1.7-2.7 1.9 1.9 1.3 4.1-.8.3-2.4-3.9-.9-.9.9-1.5Z" />,
  // Curved knife.
  skinning: <path d="M14.6 1.4c-3.2 1-6.8 4.1-8.7 7l1.7 1.7c2.9-1.9 6-5.5 7-8.7ZM5.2 9.3l1.6 1.6-3.6 3.6a1.1 1.1 0 0 1-1.6-1.6l3.6-3.6Z" />,
  // Needle with thread.
  tailoring: (
    <>
      <path d="M13.9 1.1c.6 0 1 .4 1 1 0 .3-.1.5-.3.7L4.2 13.2l-2.6 1.2 1.2-2.6L13.2 1.4c.2-.2.4-.3.7-.3Zm-.3.9-.6.6.4.4.6-.6-.4-.4Z" fillRule="evenodd" />
      <path d="M12.8 3.2C9 5 4 4 2.5 2" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
    </>
  ),
  // Cut gem.
  jewelcrafting: <path d="M4.5 2h7L15 6l-7 8.5L1 6l3.5-4Zm.5 1.5L3.3 5.5h3L7.2 3.5H5Zm3.8 0 .9 2h3l-1.7-2H8.8ZM3.6 7l3.4 4.2L5.6 7h-2Zm3.6 0L8 9.8 8.8 7H7.2Zm3.2 0L9 11.2 12.4 7h-2Z" fillRule="evenodd" />,
  // Quill.
  inscription: <path d="M14.5 1.5C9 2 5.4 5.8 4.4 10.4L3 13.6l.8.6 2-2.7c4.3-.9 7.5-4.4 8.7-10ZM2 14.4h6v1H2v-1Z" />,
  // Cooking pot with lid.
  cooking: <path d="M7 2.5h2V4H7V2.5ZM3.5 4.8h9v1.2h-9V4.8ZM2 6.8h12V8h-1v4.5c0 .8-.7 1.5-1.5 1.5h-7c-.8 0-1.5-.7-1.5-1.5V8H2V6.8Z" />,
  // Satchel with a cross cut out.
  'first aid': <path fillRule="evenodd" d="M6 1.8h4v1.7h4v10.7H2V3.5h4V1.8Zm1 1v.7h2v-.7H7Zm0 3.7v2H5v2h2v2h2v-2h2v-2H9v-2H7Z" />,
  // Fish hook.
  fishing: (
    <>
      <path d="M10.5 1.5v8.3a3.6 3.6 0 0 1-7.2 0V8.4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M3.3 6.2 5.6 9H1l2.3-2.8Z" />
      <circle cx="10.5" cy="2" r="1.5" />
    </>
  ),
};

/** Classic rank names by skill cap: Apprentice 75, Journeyman 150, Expert 225, Artisan 300, Master 375... */
const RANKS: [number, string][] = [
  [75, 'Apprentice'],
  [150, 'Journeyman'],
  [225, 'Expert'],
  [300, 'Artisan'],
  [375, 'Master'],
  [450, 'Grand Master'],
];

export function professionRank(maxSkill: number | null | undefined): string | null {
  if (maxSkill == null || maxSkill <= 0) return null;
  return RANKS.find(([cap]) => maxSkill <= cap)?.[1] ?? 'Grand Master';
}

/** CSS-friendly key, e.g. "First Aid" → "first-aid". */
export function professionKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z]+/g, '-');
}

export function ProfessionGlyph({ name }: { name: string }) {
  const glyph = GLYPHS[name.toLowerCase()];
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden="true" focusable="false">
      {glyph ?? (
        // Anything we don't have art for: its initial in a ring.
        <>
          <circle cx="8" cy="8" r="6.6" fill="none" stroke="currentColor" strokeWidth="1.2" />
          <text x="8" y="11.2" textAnchor="middle" fontSize="8.5" fontWeight="700">{name.charAt(0).toUpperCase()}</text>
        </>
      )}
    </svg>
  );
}

function EmptySlotGlyph() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
      <circle cx="8" cy="8" r="6.2" fill="none" stroke="currentColor" strokeWidth="1.3" strokeDasharray="2.4 2" />
    </svg>
  );
}

/** "225 / 300", or just "225" when the cap is unknown. */
export function skillText(p: Profession): string | null {
  if (p.skill == null) return null;
  return p.maxSkill ? `${p.skill} / ${p.maxSkill}` : String(p.skill);
}

/** A thin bar showing skill towards the current rank's cap. */
function SkillBar({ profession: p }: { profession: Profession }) {
  if (p.skill == null || !p.maxSkill) return null;
  const pct = Math.max(0, Math.min(100, (p.skill / p.maxSkill) * 100));
  return (
    <span className="skill-bar" aria-hidden="true">
      <span style={{ width: `${pct}%` }} />
    </span>
  );
}

export function ProfessionTooltip({ profession: p }: { profession: Profession }) {
  const rank = professionRank(p.maxSkill);
  const skill = skillText(p);
  return (
    <div className="profession-tooltip">
      <strong className={`profession-${professionKey(p.name)}`}>{p.name}</strong>
      <div className="tt-muted">
        {p.kind === 'primary' ? 'Primary profession' : 'Secondary skill'}
        {rank && ` · ${rank}`}
      </div>
      {skill ? (
        <>
          <div>Skill {skill}</div>
          <SkillBar profession={p} />
          {p.maxSkill != null && p.skill != null && p.skill >= p.maxSkill && p.maxSkill < 300 && (
            <div className="tt-muted">Capped: train the next rank to keep levelling</div>
          )}
        </>
      ) : (
        <div className="tt-muted">Skill level unknown</div>
      )}
    </div>
  );
}

function EmptySlotTooltip({ slot }: { slot: number }) {
  return (
    <div className="profession-tooltip">
      <strong>Empty profession slot</strong>
      <div className="tt-muted">
        {slot === 0 ? 'No primary profession trained yet' : 'Room for a second primary profession'}
      </div>
    </div>
  );
}

export function professionLabel(p: Profession): string {
  const skill = p.skill == null ? '' : p.maxSkill ? `, skill ${p.skill} of ${p.maxSkill}` : `, skill ${p.skill}`;
  return `${p.name}${skill}`;
}

export function primaryProfessions(professions: Profession[] | null | undefined): Profession[] {
  return (professions ?? []).filter((p) => p.kind === 'primary').slice(0, PRIMARY_SLOTS);
}

/**
 * A character's two primary profession slots: each trained profession as an icon with its skill level, empty
 * slots as a dashed ring. Every slot has a tooltip. Shows a dash before professions have synced.
 */
export function ProfessionSlots({ professions }: { professions: Profession[] | null | undefined }) {
  if (professions == null) {
    return (
      <span className="muted" title="Professions show up after the character's next refresh">
        —
      </span>
    );
  }
  const primaries = primaryProfessions(professions);
  const slots = Array.from({ length: PRIMARY_SLOTS }, (_, i) => primaries[i] ?? null);
  return (
    <span className="profession-slots" role="list" aria-label="Professions">
      {slots.map((p, i) =>
        p ? (
          <HoverCard key={p.name} focusable={false} content={() => <ProfessionTooltip profession={p} />}>
            <span role="listitem" className={`profession-slot profession-${professionKey(p.name)}`} aria-label={professionLabel(p)}>
              <ProfessionGlyph name={p.name} />
              {p.skill != null && <span className="profession-skill">{p.skill}</span>}
            </span>
          </HoverCard>
        ) : (
          <HoverCard key={`empty-${i}`} focusable={false} content={() => <EmptySlotTooltip slot={i} />}>
            <span role="listitem" className="profession-slot empty" aria-label="Empty profession slot">
              <EmptySlotGlyph />
            </span>
          </HoverCard>
        ),
      )}
    </span>
  );
}

/** Every profession, primaries then secondaries, with name, rank and skill: for the details pane. */
export function ProfessionList({ professions }: { professions: Profession[] | null | undefined }) {
  if (professions == null) {
    return <p className="muted small-text">Professions show up after the character's next refresh.</p>;
  }
  const primaries = primaryProfessions(professions);
  const secondaries = professions.filter((p) => p.kind !== 'primary');
  const rows: (Profession | null)[] = [...Array.from({ length: PRIMARY_SLOTS }, (_, i) => primaries[i] ?? null), ...secondaries];
  return (
    <ul className="profession-list">
      {rows.map((p, i) =>
        p ? (
          <li key={p.name} className={p.kind === 'primary' ? undefined : 'secondary'}>
            <span className={`profession-slot profession-${professionKey(p.name)}`}>
              <ProfessionGlyph name={p.name} />
            </span>
            <span className="profession-name">
              {p.name}
              <span className="muted small-text">
                {' '}
                {[p.kind === 'primary' ? null : 'Secondary', professionRank(p.maxSkill)].filter(Boolean).join(' · ')}
              </span>
            </span>
            <span className="profession-level">
              {skillText(p) ?? <span className="muted">—</span>}
              <SkillBar profession={p} />
            </span>
          </li>
        ) : (
          <li key={`empty-${i}`} className="empty">
            <span className="profession-slot empty">
              <EmptySlotGlyph />
            </span>
            <span className="profession-name muted">Empty profession slot</span>
          </li>
        ),
      )}
    </ul>
  );
}

/** Highest primary profession skill, for sorting. `undefined` when none are trained or synced. */
export function bestProfessionSkill(professions: Profession[] | null | undefined): number | undefined {
  const skills = primaryProfessions(professions)
    .map((p) => p.skill)
    .filter((s): s is number => s != null);
  return skills.length ? Math.max(...skills) : undefined;
}
