import { useCallback } from 'react';
import { useSearchParams } from 'react-router';
import type { TavernCharacter } from './api/client';
import { CharacterDetails } from './components/CharacterDetails';

/** One URL search parameter, read and written (replacing the history entry). `null` removes it. */
export function useSearchParam(name: string): [string | null, (value: string | null) => void] {
  const [params, setParams] = useSearchParams();
  const set = useCallback(
    (value: string | null) =>
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (value === null) next.delete(name);
          else next.set(name, value);
          return next;
        },
        { replace: true },
      ),
    [name, setParams],
  );
  return [params.get(name), set];
}

/**
 * The selected character (from `characters`) and its details pane, for a table's `selectedId`/`onSelect`. The
 * selection lives in the URL (?character=…) so it survives a page refresh and carries over between tabs. Without a
 * `tavernId` the pane shows the character as seen from the global leaderboard.
 */
export function useCharacterSelection<T extends TavernCharacter>(tavernId: string | undefined, characters: T[]) {
  const [selectedId, setSelectedId] = useSearchParam('character');
  // Look the selection up in the shown characters, so the pane closes if the character leaves or is filtered out.
  const selected = characters.find((c) => c.id === selectedId) ?? null;
  const close = useCallback(() => setSelectedId(null), [setSelectedId]);
  const onSelect = useCallback((c: T | null) => setSelectedId(c?.id ?? null), [setSelectedId]);
  const details = selected && <CharacterDetails tavernId={tavernId} character={selected} onClose={close} />;
  return { selectedId: selected?.id ?? null, onSelect, details };
}
