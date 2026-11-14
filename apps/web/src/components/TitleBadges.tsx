import type { PlayerTitle, TitleBadge } from '../api/client';

const tooltip = (b: TitleBadge, where?: string) =>
  `${b.name}${where ? ` · ${where}` : ''}\n${b.description}\n${b.value}`;

/**
 * Tavern titles held by a character, as small icon medals with a tooltip. `labelled` spells the names out,
 * for places that are themselves a tooltip (the hover card) or have room (the details pane).
 */
export function TitleBadges({ titles, labelled = false }: { titles: TitleBadge[] | undefined; labelled?: boolean }) {
  if (!titles?.length) return null;
  return (
    <span className="title-badges">
      {titles.map((b) =>
        labelled ? (
          <span key={b.key} className="badge title-badge" title={tooltip(b)}>
            <span aria-hidden="true">{b.icon}</span> {b.name}
          </span>
        ) : (
          <span key={b.key} className="title-medal" role="img" aria-label={b.name} title={tooltip(b)}>
            {b.icon}
          </span>
        ),
      )}
    </span>
  );
}

/** The signed-in player's titles, for the top bar: one medal per title, per tavern. */
export function PlayerTitles({ titles }: { titles: PlayerTitle[] | undefined }) {
  if (!titles?.length) return null;
  return (
    <span className="title-badges player-titles" aria-label="Your titles">
      {titles.map((b) => {
        const where = b.character ? `${b.character.name} ${b.character.surname} in ${b.tavernName}` : b.tavernName;
        return (
          <span
            key={`${b.key}:${b.tavernId}:${b.character?.id ?? 'player'}`}
            className="title-medal"
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
