import { useContext, useEffect } from 'react';
import type { TitleStanding, TitleStandings } from '../api/client';
import { CharacterAvatar } from './CharacterAvatar';
import { CharacterDirectory, CharacterLink } from './CharacterLink';
import { classKey } from './ClassName';

const holdersOf = (t: TitleStandings) => t.standings.filter((s) => s.holder);

/** A standing's name: the character for character titles, the player for player titles. */
function StandingName({ standing: s }: { standing: TitleStanding }) {
  const directory = useContext(CharacterDirectory);
  if (!s.character) return <>{s.player.displayName}</>;
  const known = directory.get(s.character.id);
  const key = classKey(known?.class ?? null);
  return (
    <CharacterLink character={{ ...s.character, ...known }}>
      <span className="char-cell">
        <CharacterAvatar character={{ name: s.character.name, class: known?.class ?? null, avatarUrl: known?.avatarUrl }} size="xs" />
        <span className={key ? `class-${key}` : undefined}>
          {s.character.name} {s.character.surname}
        </span>
      </span>
    </CharacterLink>
  );
}

/** The table that drops down from the top of the Titles tab: the holder at #1, then everyone else in the running. */
function TitleStandingsPanel({ title: t, onClose }: { title: TitleStandings; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const isPlayer = t.subject === 'player';
  return (
    <section className="card title-standings" aria-labelledby={`title-${t.key}-heading`}>
      <button className="ghost small details-close" onClick={onClose} aria-label="Close standings">✕</button>
      <header>
        <h2 id={`title-${t.key}-heading`}>
          <span aria-hidden="true">{t.icon}</span> {t.name}
        </h2>
        <p className="muted small-text">
          {t.description} {t.lowestWins ? 'Lowest wins.' : ''} Ties share the title.
        </p>
      </header>
      <div className="table-wrap">
        <table className="leaderboard">
          <thead>
            <tr>
              <th scope="col" className="rank">#</th>
              <th scope="col">{isPlayer ? 'Player' : 'Character'}</th>
              {!isPlayer && <th scope="col">Player</th>}
              <th scope="col" className="num">Score</th>
            </tr>
          </thead>
          <tbody>
            {t.standings.map((s) => (
              <tr key={s.character?.id ?? s.player.userId} className={s.holder ? 'title-holder' : undefined}>
                <td data-label="Rank" className="rank">
                  {s.holder ? <span title="Title holder">{t.icon}</span> : s.rank}
                </td>
                <td data-label={isPlayer ? 'Player' : 'Character'}>
                  <StandingName standing={s} />
                  {s.holder && <span className="badge title-badge">Holder</span>}
                </td>
                {!isPlayer && <td data-label="Player" className="muted">{s.player.displayName}</td>}
                <td data-label="Score" className="num">{s.holder ? <strong>{s.value}</strong> : s.value}</td>
              </tr>
            ))}
            {t.standings.length === 0 && (
              <tr>
                <td colSpan={isPlayer ? 3 : 4} className="muted center">
                  Nobody in the tavern has the data for this title yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** One title in the grid: who holds it, or greyed out when nobody does. */
function TitleCell({ title: t, selected, onSelect }: { title: TitleStandings; selected: boolean; onSelect: () => void }) {
  const directory = useContext(CharacterDirectory);
  const holders = holdersOf(t);
  const vacant = holders.length === 0;
  return (
    <button
      className={`title-cell${vacant ? ' vacant' : ''}${selected ? ' selected' : ''}`}
      aria-pressed={selected}
      aria-label={`${t.name}: ${vacant ? 'unclaimed' : holders.map((h) => h.character?.name ?? h.player.displayName).join(', ')}. Show standings`}
      onClick={onSelect}
      title={t.description}
    >
      <span className="title-medal title-cell-medal" aria-hidden="true">{t.icon}</span>
      <span className="title-cell-name">{t.name}</span>
      {vacant ? (
        <span className="title-cell-holder muted">Unclaimed</span>
      ) : (
        <span className="title-cell-holders">
          {holders.map((h) => {
            const known = h.character ? directory.get(h.character.id) : undefined;
            const key = classKey(known?.class ?? null);
            return (
              <span key={h.character?.id ?? h.player.userId} className="title-cell-holder">
                {h.character && (
                  <CharacterAvatar character={{ name: h.character.name, class: known?.class ?? null, avatarUrl: known?.avatarUrl }} size="xs" />
                )}
                <span className={key ? `class-${key}` : undefined}>
                  {h.character ? `${h.character.name} ${h.character.surname}` : h.player.displayName}
                </span>
              </span>
            );
          })}
        </span>
      )}
      {!vacant && <span className="title-cell-value muted small-text">{holders[0].value}</span>}
    </button>
  );
}

/** The tavern's Titles tab: a grid of every title; picking one drops its standings down from the top. */
export function TitlesView({
  titles,
  selectedKey,
  onSelect,
}: {
  titles: TitleStandings[];
  selectedKey: string | null;
  onSelect: (key: string | null) => void;
}) {
  const selected = titles.find((t) => t.key === selectedKey) ?? null;
  return (
    <div className="stack titles-view">
      {selected && <TitleStandingsPanel key={selected.key} title={selected} onClose={() => onSelect(null)} />}
      <div className="title-grid">
        {titles.map((t) => (
          <TitleCell
            key={t.key}
            title={t}
            selected={t.key === selectedKey}
            onSelect={() => onSelect(t.key === selectedKey ? null : t.key)}
          />
        ))}
      </div>
    </div>
  );
}
