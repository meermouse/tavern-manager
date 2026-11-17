import { useMemo } from 'react';
import { useLeaderboard } from '../api/hooks';
import { useCharacterSelection } from '../characterSelection';
import { CharacterDirectory } from '../components/CharacterLink';
import { LeaderboardTable } from '../components/LeaderboardTable';

/** The leaderboard outside a tavern: your characters and everyone in any tavern you belong to. */
export function LeaderboardPage() {
  const board = useLeaderboard();
  const entries = useMemo(() => board.data ?? [], [board.data]);
  const directory = useMemo(() => new Map(entries.map((c) => [c.id, c])), [entries]);
  const { details, ...selection } = useCharacterSelection(undefined, entries);

  return (
    <CharacterDirectory.Provider value={directory}>
      <div className="stack">
        <section>
          <h1>Leaderboard</h1>
          <p className="muted">Your characters against everyone in your taverns. Pick a stat to see who’s on top.</p>
        </section>
        <section className="stack roster">
          {details}
          {board.isPending && <p className="muted">Loading…</p>}
          {board.error && <p className="error">{board.error.message}</p>}
          {board.data && (
            <LeaderboardTable
              entries={board.data}
              emptyText="No characters yet. Add some, or join a tavern."
              scope="Combined"
              {...selection}
            />
          )}
        </section>
      </div>
    </CharacterDirectory.Provider>
  );
}
