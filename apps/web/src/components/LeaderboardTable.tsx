import { useMemo, useState } from 'react';
import type { LeaderboardEntry } from '../api/client';
import { availableMetrics, DEFAULT_METRIC, formatMetric, metricByKey, rankBy, useMetricChoice } from '../leaderboard';
import { CharacterAvatar } from './CharacterAvatar';
import { CharacterLevel } from './CharacterLevel';
import { CharacterLink } from './CharacterLink';
import { ClassName } from './ClassName';

const MEDALS = ['🥇', '🥈', '🥉'];

/** Characters ranked by one stat, picked from a drop-down. */
export function LeaderboardTable({ entries, emptyText }: { entries: LeaderboardEntry[]; emptyText: string }) {
  const [chosen, setChosen] = useMetricChoice();
  const [ascending, setAscending] = useState(false);
  const [onePerPlayer, setOnePerPlayer] = useState(false);

  const metrics = useMemo(() => availableMetrics(entries), [entries]);
  // A remembered choice can be missing here (e.g. a raw statistic nobody in this tavern has): fall back to the default.
  const metric =
    metrics.find((m) => m.key === chosen) ?? metricByKey(DEFAULT_METRIC)!;
  const rows = useMemo(() => rankBy(entries, metric, { ascending, onePerPlayer }), [entries, metric, ascending, onePerPlayer]);
  const groups = useMemo(() => {
    const out = new Map<string, typeof metrics>();
    for (const m of metrics) out.set(m.group, [...(out.get(m.group) ?? []), m]);
    return [...out];
  }, [metrics]);
  const hasData = rows.some((r) => r.value != null);

  return (
    <div className="leaderboard">
      <div className="filters leaderboard-controls">
        <label className="metric-picker">
          <span className="muted small-text">Rank by</span>
          <select aria-label="Rank by" value={metric.key} onChange={(e) => setChosen(e.target.value)}>
            {groups.map(([group, list]) => (
              <optgroup key={group} label={group}>
                {list.map((m) => (
                  <option key={m.key} value={m.key}>{m.label}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        <button
          className="ghost small"
          aria-pressed={ascending}
          title="Flip the order"
          onClick={() => setAscending((a) => !a)}
        >
          {ascending ? '▲ Lowest first' : '▼ Highest first'}
        </button>
        <label className="small-text">
          <input
            type="checkbox"
            checked={onePerPlayer || !!metric.perPlayer}
            disabled={metric.perPlayer}
            title={metric.perPlayer ? 'This stat belongs to the player, so it’s always one row each' : undefined}
            onChange={(e) => setOnePerPlayer(e.target.checked)}
          />{' '}
          Best character per player
        </label>
      </div>
      <p className="muted small-text metric-description">{metric.description}</p>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th scope="col" className="rank">#</th>
              <th scope="col">Character</th>
              <th scope="col">IRL name</th>
              <th scope="col">Class</th>
              <th scope="col">Level</th>
              <th scope="col" className="num" aria-sort={ascending ? 'ascending' : 'descending'}>{metric.label}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ entry, value, rank }) => (
              <tr key={entry.id} className={rank != null && rank <= 3 ? `podium podium-${rank}` : undefined}>
                <td data-label="Rank" className="rank">
                  {rank == null ? <span className="muted">—</span> : !ascending && rank <= 3 ? <span title={`#${rank}`}>{MEDALS[rank - 1]}</span> : rank}
                </td>
                <td data-label="Character">
                  <CharacterLink character={entry}>
                    <span className="char-cell">
                      <CharacterAvatar character={entry} size="xs" />
                      <strong>{entry.name} {entry.surname}</strong>
                    </span>
                  </CharacterLink>
                </td>
                <td data-label="IRL name">{entry.ownerName}</td>
                <td data-label="Class"><ClassName value={entry.class} /></td>
                <td data-label="Level"><CharacterLevel character={entry} /></td>
                <td data-label={metric.label} className="num">
                  {value == null ? <span className="muted">—</span> : <strong>{formatMetric(value, metric.format)}</strong>}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="muted center">{emptyText}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {entries.length > 0 && !hasData && (
        <p className="muted small-text">
          Nobody has data for this yet. Stats arrive after each character’s next sync, and some may not be offered by
          the WoW Forever API at all.
        </p>
      )}
    </div>
  );
}
