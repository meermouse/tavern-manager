import { Link } from 'react-router';
import { useCharacters } from '../api/hooks';
import { DungeonTable } from '../components/DungeonTable';

export function MyDungeonsPage() {
  const characters = useCharacters();

  return (
    <div className="stack">
      <section>
        <h1>My dungeons</h1>
        <p className="muted">
          Which dungeons each of your characters is in range for, across all your characters regardless of tavern.
        </p>
      </section>

      <section>
        {characters.isPending && <p className="muted">Loading…</p>}
        {characters.error && <p className="error">{characters.error.message}</p>}
        {characters.data && characters.data.length === 0 && (
          <p className="muted">
            No characters yet. <Link to="/characters">Add some</Link> to see which dungeons they can run.
          </p>
        )}
        {characters.data && characters.data.length > 0 && (
          <DungeonTable characters={characters.data} charactersLabel="Your characters" />
        )}
      </section>
    </div>
  );
}
