import type { ReactNode } from 'react';
import type { TavernCharacter } from '../api/client';
import { timeAgo } from '../time';

type StatsCharacter = Partial<Pick<TavernCharacter, 'ownerName' | 'gearItemLevel' | 'achievementPoints' | 'lastLoginAt'>>;

/** One labelled stat inside a `CharacterStats` list. */
export function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="stat">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

/** A time shown as "3 hours ago", with the full date on hover. */
export function Ago({ at }: { at: string }) {
  return (
    <time dateTime={at} title={new Date(at).toLocaleString()}>
      {timeAgo(at)}
    </time>
  );
}

/**
 * The character stats shared by the details pane and the hover card, so the two always show the same numbers
 * under the same labels. Each view adds its own extra stats as `children`, after the shared ones.
 */
export function CharacterStats({
  character: c,
  className,
  children,
}: {
  character: StatsCharacter;
  className: string;
  children?: ReactNode;
}) {
  return (
    <dl className={`character-stats ${className}`}>
      {c.ownerName && <Stat label="Player">{c.ownerName}</Stat>}
      {c.gearItemLevel != null && <Stat label="Total item level">{c.gearItemLevel}</Stat>}
      {c.achievementPoints != null && <Stat label="Achievement points">{c.achievementPoints}</Stat>}
      {c.lastLoginAt && (
        <Stat label="Last seen in game">
          <Ago at={c.lastLoginAt} />
        </Stat>
      )}
      {children}
    </dl>
  );
}
