import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, type Character } from '../api/client';
import { keys, useCharacters, useMe } from '../api/hooks';
import { AddCharacterForm } from '../components/AddCharacterForm';
import { CharacterAvatar } from '../components/CharacterAvatar';
import { CharacterLevel } from '../components/CharacterLevel';
import { ClassName } from '../components/ClassName';

function CharacterRow({ character }: { character: Character }) {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: keys.characters });
    qc.invalidateQueries({ queryKey: keys.taverns });
  };
  const refresh = useMutation({ mutationFn: () => api.refreshCharacter(character.id), onSuccess: invalidate });
  const remove = useMutation({ mutationFn: () => api.deleteCharacter(character.id), onSuccess: invalidate });

  return (
    <tr>
      <td data-label="Character">
        <span className="char-cell">
          <CharacterAvatar character={character} size="xs" />
          <strong>{character.name} {character.surname}</strong>
        </span>
      </td>
      <td data-label="Region">{character.region.toUpperCase()}</td>
      <td data-label="Ruleset">{character.ruleset ?? <span className="muted">—</span>}</td>
      <td data-label="Class"><ClassName value={character.class} /></td>
      <td data-label="Race">{character.race ?? <span className="muted">—</span>}</td>
      <td data-label="Level"><CharacterLevel character={character} /></td>
      <td className="actions">
        <button className="ghost small" onClick={() => refresh.mutate()} disabled={refresh.isPending}>
          {refresh.isPending ? 'Refreshing…' : 'Refresh'}
        </button>
        <button
          className="ghost small danger"
          disabled={remove.isPending}
          onClick={() => {
            if (confirm(`Remove ${character.name} ${character.surname}? They'll be removed from all your taverns.`)) {
              remove.mutate();
            }
          }}
        >
          Remove
        </button>
      </td>
    </tr>
  );
}

export function MyCharactersPage() {
  const me = useMe();
  const characters = useCharacters();
  const qc = useQueryClient();
  const importChars = useMutation({
    mutationFn: api.importCharacters,
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.characters }),
  });

  return (
    <div className="stack">
      <section>
        <h1>My characters</h1>
        <p className="muted">
          Characters are identified by first name and surname. Character data updates when you log out of the game,
          and low-level characters may show as <span className="badge pending">pending</span> until Blizzard's API
          picks them up.
        </p>
      </section>

      <div className="two-col">
        <section className="card">
          <h2>Add by name</h2>
          <AddCharacterForm />
        </section>
        <section className="card">
          <h2>Import from Battle.net</h2>
          <p className="muted small-text">Pull in the characters on your Battle.net account.</p>
          <button onClick={() => importChars.mutate()} disabled={importChars.isPending || !me.data?.canImport}>
            {importChars.isPending ? 'Importing…' : 'Import characters'}
          </button>
          {!me.data?.canImport && (
            <p className="muted small-text">Sign in with Battle.net again to enable importing.</p>
          )}
          {importChars.data && (
            <p className="small-text">
              Found {importChars.data.found}, imported {importChars.data.imported}
              {importChars.data.skipped > 0 && `, ${importChars.data.skipped} already added`}.
            </p>
          )}
          {importChars.error && <p className="error">{importChars.error.message}</p>}
        </section>
      </div>

      <section>
        {characters.isPending && <p className="muted">Loading…</p>}
        {characters.error && <p className="error">{characters.error.message}</p>}
        {characters.data && characters.data.length === 0 && <p className="muted">No characters yet.</p>}
        {characters.data && characters.data.length > 0 && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Character</th><th>Region</th><th>Ruleset</th><th>Class</th><th>Race</th><th>Level</th><th />
                </tr>
              </thead>
              <tbody>
                {characters.data.map((c) => <CharacterRow key={c.id} character={c} />)}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
