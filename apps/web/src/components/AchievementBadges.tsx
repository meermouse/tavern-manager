import type { AchievementBadge, PlayerAchievement } from '../api/client';

const tooltip = (b: AchievementBadge, where?: string) =>
  `${b.name}${where ? ` · ${where}` : ''}\n${b.description}\n${b.value}`;

/**
 * Tavern achievements held by a character, as small icon medals with a tooltip. `labelled` spells the names out,
 * for places that are themselves a tooltip (the hover card) or have room (the details pane).
 */
export function AchievementBadges({
  achievements,
  labelled = false,
}: {
  achievements: AchievementBadge[] | undefined;
  labelled?: boolean;
}) {
  if (!achievements?.length) return null;
  return (
    <span className="achievement-badges">
      {achievements.map((b) =>
        labelled ? (
          <span key={b.key} className="badge achievement-badge" title={tooltip(b)}>
            <span aria-hidden="true">{b.icon}</span> {b.name}
          </span>
        ) : (
          <span key={b.key} className="achievement-medal" role="img" aria-label={b.name} title={tooltip(b)}>
            {b.icon}
          </span>
        ),
      )}
    </span>
  );
}

/** The signed-in player's titles, for the top bar: one medal per title, per tavern. */
export function PlayerAchievements({ achievements }: { achievements: PlayerAchievement[] | undefined }) {
  if (!achievements?.length) return null;
  return (
    <span className="achievement-badges player-achievements" aria-label="Your achievements">
      {achievements.map((b) => {
        const where = `${b.character.name} ${b.character.surname} in ${b.tavernName}`;
        return (
          <span
            key={`${b.key}:${b.tavernId}:${b.character.id}`}
            className="achievement-medal"
            role="img"
            aria-label={`${b.name} (${where})`}
            title={tooltip(b, where)}
          >
            {b.icon}
          </span>
        );
      })}
    </span>
  );
}
