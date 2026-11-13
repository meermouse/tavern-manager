import { useCallback, useState } from 'react';
import type { Character } from './api/client';

export type Faction = 'Horde' | 'Alliance';
export type FactionFilter = 'both' | 'horde' | 'alliance';

const HORDE_RACES = new Set(['orc', 'undead', 'tauren', 'troll', 'goblin', 'blood elf']);
const ALLIANCE_RACES = new Set(['human', 'dwarf', 'night elf', 'gnome', 'draenei', 'high elf']);

/** A character's faction, falling back to their race when it hasn't been synced yet. */
export function factionOf(c: Pick<Character, 'race'> & { faction?: string | null }): Faction | null {
  const f = c.faction?.toLowerCase();
  if (f === 'horde') return 'Horde';
  if (f === 'alliance') return 'Alliance';
  const race = c.race?.toLowerCase();
  if (race && HORDE_RACES.has(race)) return 'Horde';
  if (race && ALLIANCE_RACES.has(race)) return 'Alliance';
  return null;
}

/** Whether a character passes the filter. Characters with no known faction only show under "both". */
export function matchesFaction(c: Pick<Character, 'race'> & { faction?: string | null }, filter: FactionFilter): boolean {
  if (filter === 'both') return true;
  return factionOf(c)?.toLowerCase() === filter;
}

const storageKey = (tavernId: string) => `tavern.factionFilter.${tavernId}`;

function load(tavernId: string): FactionFilter {
  try {
    const v = localStorage.getItem(storageKey(tavernId));
    return v === 'horde' || v === 'alliance' ? v : 'both';
  } catch {
    return 'both';
  }
}

/** The faction filter for one tavern, remembered in this browser between visits. */
export function useFactionFilter(tavernId: string): [FactionFilter, (next: FactionFilter) => void] {
  const [state, setState] = useState(() => ({ tavernId, filter: load(tavernId) }));
  // Re-read when navigating between taverns without unmounting.
  const filter = state.tavernId === tavernId ? state.filter : load(tavernId);
  if (state.tavernId !== tavernId) setState({ tavernId, filter });
  const set = useCallback(
    (next: FactionFilter) => {
      setState({ tavernId, filter: next });
      try {
        if (next === 'both') localStorage.removeItem(storageKey(tavernId));
        else localStorage.setItem(storageKey(tavernId), next);
      } catch {
        // Storage unavailable: the choice just won't be remembered.
      }
    },
    [tavernId],
  );
  return [filter, set];
}
