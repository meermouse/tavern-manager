import { useMemo, useState } from 'react';
import type { DungeonRun, TavernCharacter } from '../api/client';
import { useDungeonRunMutations, useDungeonRuns } from '../api/hooks';
import { dungeons, findDungeon } from '../dungeons';
import { CharacterAvatar } from './CharacterAvatar';
import { CharacterLink } from './CharacterLink';
import { ClassName } from './ClassName';
import { DungeonTable } from './DungeonTable';

/** Today in the viewer's time zone, as YYYY-MM-DD (what a date input wants). */
export function localToday(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** "15 Nov 2026" for a YYYY-MM-DD run date, read as a local day so it never shifts by a time zone. */
export function formatRunDate(date: string): string {
  return new Date(`${date}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

/** A dungeon's known bosses (built-in list first), plus any other names the tavern has logged for it. */
export function knownBosses(dungeon: string, runs: DungeonRun[]): string[] {
  const out = [...(findDungeon(dungeon)?.bosses ?? [])];
  const seen = new Set(out.map((b) => b.toLowerCase()));
  for (const run of [...runs].reverse()) {
    if (run.dungeon !== dungeon) continue;
    for (const boss of run.bosses) {
      if (seen.has(boss.toLowerCase())) continue;
      seen.add(boss.toLowerCase());
      out.push(boss);
    }
  }
  return out;
}

export interface BossTally {
  dungeon: string;
  runs: number;
  clears: number;
  lastRun: string;
  /** Every known boss with how many logged runs killed it (0 = not yet). */
  bosses: { name: string; kills: number }[];
}

/** Per dungeon the tavern has run: runs, clears and kills per boss. In dungeon list order. */
export function tallyBosses(runs: DungeonRun[]): BossTally[] {
  const names = [...new Set(runs.map((r) => r.dungeon))];
  const order = (name: string) => {
    const i = dungeons.findIndex((d) => d.name === name);
    return i === -1 ? dungeons.length : i;
  };
  names.sort((a, b) => order(a) - order(b) || a.localeCompare(b));
  return names.map((dungeon) => {
    const these = runs.filter((r) => r.dungeon === dungeon);
    const kills = new Map<string, number>();
    for (const run of these) {
      for (const boss of run.bosses) kills.set(boss.toLowerCase(), (kills.get(boss.toLowerCase()) ?? 0) + 1);
    }
    return {
      dungeon,
      runs: these.length,
      clears: these.filter((r) => r.cleared).length,
      lastRun: these.map((r) => r.date).sort().at(-1)!,
      bosses: knownBosses(dungeon, runs).map((name) => ({ name, kills: kills.get(name.toLowerCase()) ?? 0 })),
    };
  });
}

function RunForm({
  tavernId,
  characters,
  runs,
  initialDungeon,
  onDone,
}: {
  tavernId: string;
  characters: TavernCharacter[];
  runs: DungeonRun[];
  initialDungeon: string;
  onDone: () => void;
}) {
  const { log } = useDungeonRunMutations(tavernId);
  const [dungeon, setDungeon] = useState(initialDungeon);
  const [date, setDate] = useState(localToday);
  const [party, setParty] = useState<Set<string>>(new Set());
  const [extraBosses, setExtraBosses] = useState<string[]>([]);
  const bossOptions = useMemo(() => {
    const known = knownBosses(dungeon, runs);
    const seen = new Set(known.map((b) => b.toLowerCase()));
    return [...known, ...extraBosses.filter((b) => !seen.has(b.toLowerCase()))];
  }, [dungeon, runs, extraBosses]);
  // A full clear is the usual case, so every known boss starts ticked.
  const [killed, setKilled] = useState<Set<string>>(() => new Set(knownBosses(initialDungeon, runs)));
  const [newBoss, setNewBoss] = useState('');
  const [cleared, setCleared] = useState(true);
  const [notes, setNotes] = useState('');

  const info = findDungeon(dungeon);
  const inRange = (c: TavernCharacter) => !!info && c.level != null && c.level >= info.minLevel && c.level <= info.maxLevel;
  // Characters in the dungeon's level range first, then by level.
  const sorted = [...characters].sort(
    (a, b) => Number(inRange(b)) - Number(inRange(a)) || (b.level ?? 0) - (a.level ?? 0) || a.name.localeCompare(b.name),
  );

  const toggle = <T,>(set: Set<T>, value: T) => {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    return next;
  };

  const pickDungeon = (name: string) => {
    setDungeon(name);
    setExtraBosses([]);
    setKilled(new Set(knownBosses(name, runs)));
  };

  const addBoss = () => {
    const name = newBoss.trim().replace(/\s+/g, ' ');
    if (!name) return;
    const existing = bossOptions.find((b) => b.toLowerCase() === name.toLowerCase());
    if (!existing) setExtraBosses((list) => [...list, name]);
    setKilled((set) => new Set(set).add(existing ?? name));
    setNewBoss('');
  };

  return (
    <form
      className="card run-form"
      onSubmit={(e) => {
        e.preventDefault();
        log.mutate(
          {
            dungeon,
            date,
            characterIds: [...party],
            bosses: bossOptions.filter((b) => killed.has(b)),
            cleared,
            notes: notes.trim() || undefined,
          },
          { onSuccess: onDone },
        );
      }}
    >
      <h3>Log a run</h3>
      <div className="run-form-row">
        <label>
          <span className="muted small-text">Dungeon</span>
          <select value={dungeon} onChange={(e) => pickDungeon(e.target.value)}>
            {dungeons.map((d) => (
              <option key={d.name} value={d.name}>
                {d.name} ({d.minLevel}–{d.maxLevel})
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="muted small-text">Date</span>
          <input type="date" value={date} max={localToday()} required onChange={(e) => setDate(e.target.value)} />
        </label>
      </div>

      <fieldset>
        <legend>
          Who was in the group{' '}
          <span className="muted small-text">
            {party.size} picked{info ? ` · ${info.players}-player` : ''}
          </span>
        </legend>
        {characters.length === 0 && <p className="muted small-text">No characters in this tavern yet.</p>}
        <ul className="run-pick-list">
          {sorted.map((c) => (
            <li key={c.id}>
              <label>
                <input type="checkbox" checked={party.has(c.id)} onChange={() => setParty((s) => toggle(s, c.id))} />
                <CharacterAvatar character={c} size="xs" />
                <span className="run-pick-name">
                  <strong>{c.name} {c.surname}</strong>{' '}
                  <span className="muted small-text">
                    {c.level ?? '?'} {c.class && <ClassName value={c.class} />} · {c.ownerName}
                  </span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      </fieldset>

      <fieldset>
        <legend>
          Bosses killed{' '}
          <span className="muted small-text">
            {bossOptions.filter((b) => killed.has(b)).length} / {bossOptions.length}
          </span>
        </legend>
        {bossOptions.length === 0 && (
          <p className="muted small-text">No boss list for this dungeon yet. Add the ones you killed below.</p>
        )}
        {bossOptions.length > 0 && (
          <ul className="run-pick-list bosses">
            {bossOptions.map((b) => (
              <li key={b}>
                <label>
                  <input type="checkbox" checked={killed.has(b)} onChange={() => setKilled((s) => toggle(s, b))} />
                  {b}
                </label>
              </li>
            ))}
          </ul>
        )}
        <div className="run-add-boss">
          <input
            value={newBoss}
            placeholder="Another boss"
            aria-label="Boss name"
            maxLength={80}
            onChange={(e) => setNewBoss(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addBoss();
              }
            }}
          />
          <button type="button" className="ghost small" onClick={addBoss} disabled={!newBoss.trim()}>
            Add boss
          </button>
        </div>
      </fieldset>

      <label className="run-cleared">
        <input type="checkbox" checked={cleared} onChange={(e) => setCleared(e.target.checked)} />
        <span>
          We cleared it <span className="muted small-text">(ticks {dungeon} off in everyone’s dungeon log)</span>
        </span>
      </label>

      <label>
        <span className="muted small-text">Notes (optional)</span>
        <textarea value={notes} maxLength={500} rows={2} onChange={(e) => setNotes(e.target.value)} />
      </label>

      {log.error && <p className="error">{log.error.message}</p>}
      <div className="run-form-actions">
        <button type="submit" disabled={log.isPending || party.size === 0}>
          {log.isPending ? 'Logging…' : 'Log run'}
        </button>
        <button type="button" className="ghost" onClick={onDone}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function RunCard({ run, tavernId }: { run: DungeonRun; tavernId: string }) {
  const { remove } = useDungeonRunMutations(tavernId);
  const total = knownBosses(run.dungeon, [run]).length;
  return (
    <li className={`card run-card${run.cleared ? ' cleared' : ''}`}>
      <div className="run-head">
        <div>
          <strong className="run-dungeon">{run.dungeon}</strong>{' '}
          {run.cleared ? <span className="badge dungeon-done">✔ Cleared</span> : <span className="badge">Partial</span>}
        </div>
        <time className="muted small-text" dateTime={run.date}>{formatRunDate(run.date)}</time>
      </div>
      <ul className="run-party" aria-label="Group">
        {run.characters.map((c) => (
          <li key={c.id}>
            <CharacterLink character={c}>
              <CharacterAvatar character={c} size="xs" />
              <span>{c.name} {c.surname}</span>
            </CharacterLink>
            <span className="muted small-text">{c.ownerName}</span>
          </li>
        ))}
      </ul>
      {run.bosses.length > 0 ? (
        <p className="run-bosses small-text">
          <span className="muted">
            Bosses ({run.bosses.length}{total > run.bosses.length ? ` of ${total}` : ''}):
          </span>{' '}
          {run.bosses.join(' · ')}
        </p>
      ) : (
        <p className="muted small-text">No bosses logged.</p>
      )}
      {run.notes && <p className="run-notes small-text">“{run.notes}”</p>}
      <div className="run-foot muted small-text">
        <span>Logged by {run.loggedBy?.displayName ?? 'a former member'}</span>
        {run.canDelete && (
          <button
            className="ghost small danger"
            disabled={remove.isPending}
            onClick={() => confirm(`Delete this ${run.dungeon} run?`) && remove.mutate(run.id)}
          >
            Delete
          </button>
        )}
      </div>
      {remove.error && <p className="error small-text">{remove.error.message}</p>}
    </li>
  );
}

function BossTallies({ runs }: { runs: DungeonRun[] }) {
  const tallies = tallyBosses(runs);
  if (!tallies.length) return <p className="muted">No runs logged yet, so no bosses down.</p>;
  return (
    <ul className="boss-tallies">
      {tallies.map((t) => {
        const down = t.bosses.filter((b) => b.kills > 0).length;
        return (
          <li key={t.dungeon} className="card">
            <div className="run-head">
              <strong className="run-dungeon">{t.dungeon}</strong>
              <span className="dungeon-log-count" aria-label={`${down} of ${t.bosses.length} bosses defeated`}>
                {down} / {t.bosses.length}
              </span>
            </div>
            <p className="muted small-text">
              {t.runs} {t.runs === 1 ? 'run' : 'runs'} · {t.clears} {t.clears === 1 ? 'clear' : 'clears'} · last{' '}
              {formatRunDate(t.lastRun)}
            </p>
            {t.bosses.length > 0 && (
              <ul className="boss-chips">
                {t.bosses.map((b) => (
                  <li key={b.name} className={b.kills ? 'down' : undefined}>
                    {b.kills ? '✔ ' : ''}
                    {b.name}
                    {b.kills > 1 && <span className="muted"> ×{b.kills}</span>}
                  </li>
                ))}
              </ul>
            )}
          </li>
        );
      })}
    </ul>
  );
}

type DungeonView = 'finder' | 'runs' | 'bosses';
const DUNGEON_VIEWS: [DungeonView, string][] = [
  ['finder', 'Finder'],
  ['runs', 'Runs'],
  ['bosses', 'Bosses'],
];

/** A tavern's Dungeons tab: the level-range finder, the run log, and boss kills so far. */
export function TavernDungeons({
  tavernId,
  characters,
  visible,
}: {
  tavernId: string;
  /** Everyone in the tavern, to pick a group from. */
  characters: TavernCharacter[];
  /** The characters the faction filter shows, for the finder. */
  visible: TavernCharacter[];
}) {
  const [view, setView] = useState<DungeonView>('finder');
  // The dungeon the run form is open for (null = closed).
  const [logging, setLogging] = useState<string | null>(null);
  const runs = useDungeonRuns(tavernId);

  const startLog = (dungeon: string) => {
    setView('runs');
    setLogging(dungeon);
  };

  return (
    <div className="stack">
      <div className="sub-tabs" role="group" aria-label="Dungeon views">
        {DUNGEON_VIEWS.map(([key, label]) => (
          <button
            key={key}
            className={`small${view === key ? ' active' : ''}`}
            aria-pressed={view === key}
            onClick={() => setView(key)}
          >
            {label}
            {key === 'runs' && runs.data && runs.data.length > 0 && <span className="muted"> ({runs.data.length})</span>}
          </button>
        ))}
      </div>

      {view === 'finder' && <DungeonTable characters={visible} showTotals onLogRun={startLog} />}

      {view !== 'finder' && runs.isPending && <p className="muted">Loading…</p>}
      {view !== 'finder' && runs.error && <p className="error">{runs.error.message}</p>}

      {view === 'runs' && runs.data && (
        <>
          {logging ? (
            <RunForm
              key={logging}
              tavernId={tavernId}
              characters={characters}
              runs={runs.data}
              initialDungeon={logging}
              onDone={() => setLogging(null)}
            />
          ) : (
            <div>
              <button onClick={() => setLogging(dungeons[0].name)}>+ Log a run</button>
            </div>
          )}
          {runs.data.length === 0 ? (
            <p className="muted">
              No runs logged yet. Log one here, or with <strong>Log run</strong> next to a dungeon in the finder.
            </p>
          ) : (
            <ol className="run-list">
              {runs.data.map((r) => (
                <RunCard key={r.id} run={r} tavernId={tavernId} />
              ))}
            </ol>
          )}
        </>
      )}

      {view === 'bosses' && runs.data && <BossTallies runs={runs.data} />}
    </div>
  );
}
