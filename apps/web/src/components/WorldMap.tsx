import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { api, type TavernCharacter } from '../api/client';
import { keys } from '../api/hooks';
import { dungeons } from '../dungeons';
import {
  BIOME_COLOURS,
  CONTINENTS,
  LANDMASS_SHAPES,
  WORLD,
  ZONE_SHAPES,
  ZONES,
  continentBox,
  findZone,
  levelRange,
  type ContinentId,
  type ZoneShape,
} from '../map/azeroth';
import { fitAspect, lerpBox, pad, polygonPath, smoothPath, type Box } from '../map/geometry';

const ASPECT = WORLD.w / WORLD.h;
const CLASS_KEYS = ['warrior', 'paladin', 'hunter', 'rogue', 'priest', 'shaman', 'mage', 'warlock', 'druid'];

type View =
  | { level: 'world' }
  | { level: 'continent'; continent: ContinentId }
  | { level: 'zone'; zoneId: string };

function continentName(id: ContinentId) {
  return CONTINENTS.find((c) => c.id === id)!.name;
}

function targetBox(view: View): Box {
  if (view.level === 'world') return WORLD;
  if (view.level === 'continent') return fitAspect(pad(continentBox(view.continent), 22), ASPECT);
  const zone = ZONE_SHAPES.find((z) => z.id === view.zoneId)!;
  const size = Math.max(zone.landBox.w, zone.landBox.h, 120);
  return fitAspect(pad(zone.landBox, size * 0.8), ASPECT);
}

function parent(view: View): View {
  if (view.level === 'zone') {
    const zone = ZONES.find((z) => z.id === view.zoneId)!;
    // Zephras Isle is a one-zone "continent": skip straight back out to the world.
    return zone.continent === 'zephras' ? { level: 'world' } : { level: 'continent', continent: zone.continent };
  }
  return { level: 'world' };
}

/** Animate the SVG viewBox between views, like the in-game map's zoom. */
function useAnimatedBox(target: Box): Box {
  const [box, setBox] = useState(target);
  const current = useRef(target);
  useEffect(() => {
    const from = current.current;
    const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      current.current = target;
      setBox(target);
      return;
    }
    const start = performance.now();
    let frame = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / 450);
      const eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      current.current = lerpBox(from, target, eased);
      setBox(current.current);
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [target]);
  return box;
}

function classColour(cls: string | null) {
  const key = cls?.toLowerCase().replace(/\s+/g, '') ?? '';
  return CLASS_KEYS.includes(key) ? `var(--class-${key})` : 'var(--muted)';
}

function describe(c: TavernCharacter) {
  return `${c.name} ${c.surname} — ${c.level != null ? `level ${c.level}` : 'pending'}${c.class ? ` ${c.class}` : ''} (${c.ownerName})`;
}

export function WorldMap({ characters, meId }: { characters: TavernCharacter[]; meId: string }) {
  const [view, setView] = useState<View>({ level: 'world' });
  const [hover, setHover] = useState<string | null>(null);
  const target = useMemo(() => targetBox(view), [view]);
  const box = useAnimatedBox(target);
  const s = box.w / WORLD.w; // world units per "screen unit" at full-map scale

  const byZone = useMemo(() => {
    const map = new Map<string, TavernCharacter[]>();
    const unknown: TavernCharacter[] = [];
    for (const c of characters) {
      const zone = findZone(c.zone);
      if (!zone) {
        unknown.push(c);
        continue;
      }
      map.set(zone.id, [...(map.get(zone.id) ?? []), c]);
    }
    return { map, unknown };
  }, [characters]);

  const zoomOut = () => setView((v) => parent(v));
  const open = (zone: ZoneShape) => {
    if (view.level === 'world' && zone.continent !== 'zephras') setView({ level: 'continent', continent: zone.continent });
    else setView({ level: 'zone', zoneId: zone.id });
  };

  const selectedZone = view.level === 'zone' ? ZONE_SHAPES.find((z) => z.id === view.zoneId)! : null;
  const activeContinent =
    view.level === 'continent' ? view.continent : selectedZone ? selectedZone.continent : null;
  const showZoneLabels = view.level !== 'world';
  const hovered = hover ? ZONE_SHAPES.find((z) => z.id === hover) : null;

  return (
    <div className="world-map">
      <div className="map-frame">
        <nav className="map-crumbs" aria-label="Map location">
          <button className="link" onClick={() => setView({ level: 'world' })} disabled={view.level === 'world'}>
            Azeroth
          </button>
          {activeContinent && activeContinent !== 'zephras' && (
            <>
              <span aria-hidden>›</span>
              <button
                className="link"
                onClick={() => setView({ level: 'continent', continent: activeContinent })}
                disabled={view.level === 'continent'}
              >
                {continentName(activeContinent)}
              </button>
            </>
          )}
          {selectedZone && (
            <>
              <span aria-hidden>›</span>
              <span>{selectedZone.name}</span>
            </>
          )}
        </nav>
        {view.level !== 'world' && (
          <button className="map-zoom-out small" onClick={zoomOut} title="Zoom out (right-click)">
            − Zoom out
          </button>
        )}
        {hovered && (
          <div className="map-hover" aria-hidden>
            <strong>{hovered.name}</strong> <span className="muted">· {levelRange(hovered)}</span>
          </div>
        )}

        <svg
          viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`}
          role="img"
          aria-label="Map of Azeroth showing where characters are"
          onContextMenu={(e) => {
            e.preventDefault();
            zoomOut();
          }}
          onKeyDown={(e) => e.key === 'Escape' && zoomOut()}
        >
          <defs>
            <radialGradient id="sea" cx="50%" cy="45%" r="75%">
              <stop offset="0%" stopColor="#1d3a4d" />
              <stop offset="100%" stopColor="#0c1a24" />
            </radialGradient>
            <radialGradient id="cloud" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#e8f3ff" stopOpacity="0.55" />
              <stop offset="100%" stopColor="#e8f3ff" stopOpacity="0" />
            </radialGradient>
            <pattern id="waves" width="24" height="14" patternUnits="userSpaceOnUse" patternTransform={`scale(${s})`}>
              <path d="M0 7 q6 -4 12 0 t12 0" fill="none" stroke="#3b6177" strokeWidth="0.6" opacity="0.35" />
            </pattern>
            <filter id="paper" x="0" y="0" width="100%" height="100%">
              <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="3" seed="4" />
              <feColorMatrix values="0 0 0 0 0.1  0 0 0 0 0.07  0 0 0 0 0.03  0 0 0 0.9 -0.2" />
            </filter>
            {LANDMASS_SHAPES.map((l) => (
              <clipPath key={l.id} id={`land-${l.id}`}>
                <path d={smoothPath(l.outline)} />
              </clipPath>
            ))}
          </defs>

          <rect x={-1000} y={-1000} width={3000} height={2700} fill="url(#sea)" />
          <rect x={-1000} y={-1000} width={3000} height={2700} fill="url(#waves)" />
          {view.level === 'world' && <text x={510} y={380} className="map-sea-label" fontSize={14}>The Great Sea</text>}
          <ellipse cx={520} cy={104} rx={85} ry={50} fill="url(#cloud)" />

          {LANDMASS_SHAPES.map((l) => (
            <path key={`shore-${l.id}`} d={smoothPath(l.outline)} className="map-shore" strokeWidth={7} />
          ))}

          {LANDMASS_SHAPES.map((l) => (
            <g key={l.id} clipPath={`url(#land-${l.id})`}>
              {ZONE_SHAPES.filter((z) => z.landmass === l.id).map((zone) => {
                const dim = selectedZone ? selectedZone.id !== zone.id : activeContinent ? zone.continent !== activeContinent : false;
                return (
                  <path
                    key={zone.id}
                    d={polygonPath(zone.fill)}
                    fill={BIOME_COLOURS[zone.biome]}
                    className={`map-zone${dim ? ' dim' : ''}${hover === zone.id ? ' hover' : ''}`}
                    strokeWidth={1.1 * s}
                    role="button"
                    tabIndex={0}
                    aria-label={`${zone.name}, levels ${levelRange(zone)}`}
                    onClick={() => open(zone)}
                    onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), open(zone))}
                    onMouseEnter={() => setHover(zone.id)}
                    onMouseLeave={() => setHover((h) => (h === zone.id ? null : h))}
                  >
                    <title>{`${zone.name} (${levelRange(zone)})`}</title>
                  </path>
                );
              })}
              <rect x={l.box.x - 10} y={l.box.y - 10} width={l.box.w + 20} height={l.box.h + 20} filter="url(#paper)" className="map-texture" />
            </g>
          ))}

          {LANDMASS_SHAPES.map((l) => (
            <path key={`coast-${l.id}`} d={smoothPath(l.outline)} className="map-coast" strokeWidth={1.6 * s} />
          ))}

          {ZONES.filter((z) => z.capital).map((z) => {
            const { at, name, faction } = z.capital!;
            const r = 4.5 * s;
            return (
              <g key={name} className="map-capital" pointerEvents="none">
                <path
                  d={`M${at[0]},${at[1] - r}L${at[0] + r},${at[1]}L${at[0]},${at[1] + r}L${at[0] - r},${at[1]}Z`}
                  fill={faction === 'Alliance' ? '#4a86e0' : '#d04a36'}
                  stroke="#f4ead8"
                  strokeWidth={1 * s}
                />
                {showZoneLabels && (
                  <text x={at[0]} y={at[1] - r - 2 * s} fontSize={8 * s} className="map-capital-label">{name}</text>
                )}
              </g>
            );
          })}

          {!showZoneLabels &&
            CONTINENTS.map((c) => (
              <text key={c.id} x={c.label[0]} y={c.label[1]} className="map-continent-label" fontSize={c.id === 'zephras' ? 12 : 20}>
                {c.name}
              </text>
            ))}

          {showZoneLabels &&
            ZONE_SHAPES.filter((z) => z.continent === activeContinent).map((z) => (
              <text
                key={z.id}
                x={z.seed[0]}
                y={z.seed[1]}
                fontSize={(selectedZone?.id === z.id ? 14 : 10) * s}
                className={`map-zone-label${z.isNew ? ' new' : ''}`}
                pointerEvents="none"
              >
                {z.name}
              </text>
            ))}

          {ZONE_SHAPES.map((zone) => {
            const here = byZone.map.get(zone.id);
            if (!here) return null;
            const r = (view.level === 'world' ? 9 : 7) * s;
            const perRow = 5;
            const top = zone.seed[1] + (showZoneLabels ? 9 * s : -r);
            return (
              <g key={zone.id} className="map-pins">
                {here.map((c, i) => {
                  const row = Math.floor(i / perRow);
                  const inRow = Math.min(perRow, here.length - row * perRow);
                  const x = zone.seed[0] + ((i % perRow) - (inRow - 1) / 2) * r * 2.3;
                  const y = top + r + row * r * 2.3;
                  return (
                    <g
                      key={c.id}
                      className={`map-pin${c.ownerId === meId ? ' mine' : ''}`}
                      onClick={() => setView({ level: 'zone', zoneId: zone.id })}
                    >
                      <title>{describe(c)}</title>
                      <circle cx={x} cy={y} r={r} fill={classColour(c.class)} strokeWidth={1.4 * s} />
                      <text x={x} y={y} fontSize={r * 1.15} dy="0.36em">{c.name.charAt(0)}</text>
                    </g>
                  );
                })}
              </g>
            );
          })}
        </svg>
      </div>

      <aside className="map-panel card">
        {view.level === 'world' && (
          <WorldPanel byZone={byZone.map} onContinent={(id) => (id === 'zephras' ? setView({ level: 'zone', zoneId: 'zephras-isle' }) : setView({ level: 'continent', continent: id }))} />
        )}
        {view.level === 'continent' && (
          <ContinentPanel continent={view.continent} byZone={byZone.map} onZone={(id) => setView({ level: 'zone', zoneId: id })} />
        )}
        {selectedZone && <ZonePanel zone={selectedZone} here={byZone.map.get(selectedZone.id) ?? []} />}
      </aside>

      <CharacterLocations characters={characters} unknown={byZone.unknown} meId={meId} />
    </div>
  );
}

function WorldPanel({ byZone, onContinent }: { byZone: Map<string, TavernCharacter[]>; onContinent: (id: ContinentId) => void }) {
  return (
    <>
      <h2>Azeroth</h2>
      <p className="muted small-text">Click a continent to zoom in, then a zone. Right-click or Esc to zoom out.</p>
      <ul className="map-list">
        {CONTINENTS.map((c) => {
          const count = ZONES.filter((z) => z.continent === c.id).reduce((n, z) => n + (byZone.get(z.id)?.length ?? 0), 0);
          return (
            <li key={c.id}>
              <button className="link" onClick={() => onContinent(c.id)}>{c.name}</button>
              <span className="muted small-text">{count ? `${count} here` : ''}</span>
            </li>
          );
        })}
      </ul>
      <p className="muted small-text map-legend">
        <span className="legend-diamond alliance" /> Alliance capital <span className="legend-diamond horde" /> Horde capital
      </p>
    </>
  );
}

function ContinentPanel({
  continent,
  byZone,
  onZone,
}: {
  continent: ContinentId;
  byZone: Map<string, TavernCharacter[]>;
  onZone: (id: string) => void;
}) {
  const zones = ZONES.filter((z) => z.continent === continent).sort(
    (a, b) => (a.minLevel ?? 99) - (b.minLevel ?? 99) || a.name.localeCompare(b.name),
  );
  return (
    <>
      <h2>{continentName(continent)}</h2>
      <ul className="map-list zones">
        {zones.map((z) => (
          <li key={z.id}>
            <button className="link" onClick={() => onZone(z.id)}>
              {z.name}
              {z.isNew && <span className="badge new">New</span>}
            </button>
            <span className="muted small-text">
              {levelRange(z)}
              {byZone.get(z.id)?.length ? ` · ${byZone.get(z.id)!.length} here` : ''}
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}

function ZonePanel({ zone, here }: { zone: ZoneShape; here: TavernCharacter[] }) {
  const zoneDungeons = (zone.dungeons ?? []).map((name) => dungeons.find((d) => d.name === name)!).filter(Boolean);
  return (
    <>
      <h2>
        {zone.name}
        {zone.isNew && <span className="badge new">New</span>}
      </h2>
      <p className="small-text">
        <span className="muted">Levels</span> {levelRange(zone)} ·{' '}
        <span className={`faction ${zone.faction.toLowerCase()}`}>{zone.faction}</span>
      </p>
      {zone.capital && <p className="small-text muted">Capital: {zone.capital.name}</p>}
      {zone.note && <p className="small-text muted">{zone.note}</p>}
      {zoneDungeons.length > 0 && (
        <>
          <h3>Dungeons</h3>
          <ul className="map-list">
            {zoneDungeons.map((d) => (
              <li key={d.name}>
                {d.name} <span className="muted small-text">{d.minLevel}–{d.maxLevel}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      <h3>Characters here</h3>
      {here.length === 0 ? (
        <p className="muted small-text">Nobody from your taverns.</p>
      ) : (
        <ul className="map-list">
          {here.map((c) => (
            <li key={c.id}>
              <span style={{ color: classColour(c.class), fontWeight: 600 }} title={c.class ?? undefined}>
                {c.name} {c.surname}
              </span>
              <span className="muted small-text nowrap">
                {c.level != null ? `Lvl ${c.level}` : 'pending'} · {c.ownerName}
              </span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

const ZONE_OPTIONS = CONTINENTS.map((c) => ({
  continent: c.name,
  zones: ZONES.filter((z) => z.continent === c.id).map((z) => z.name).sort(),
}));

function CharacterLocations({
  characters,
  unknown,
  meId,
}: {
  characters: TavernCharacter[];
  unknown: TavernCharacter[];
  meId: string;
}) {
  const qc = useQueryClient();
  const mine = characters.filter((c) => c.ownerId === meId);
  const setZone = useMutation({
    mutationFn: ({ id, zone }: { id: string; zone: string | null }) => api.setCharacterZone(id, zone),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.map });
      qc.invalidateQueries({ queryKey: keys.characters });
      qc.invalidateQueries({ queryKey: keys.taverns });
    },
  });

  if (!mine.length && !unknown.length) return null;
  return (
    <section className="map-locations">
      {mine.length > 0 && (
        <div>
          <h3>Where are your characters?</h3>
          <p className="muted small-text">
            Blizzard’s API doesn’t share a character’s location, so set it here. If the API ever reports one, it’ll update automatically.
          </p>
          <ul className="location-list">
            {mine.map((c) => {
              const known = findZone(c.zone);
              const value = known?.name ?? c.zone ?? '';
              return (
                <li key={c.id}>
                  <label>
                    <span style={{ color: classColour(c.class) }}>{c.name} {c.surname}</span>
                    <select
                      value={value}
                      disabled={setZone.isPending && setZone.variables?.id === c.id}
                      onChange={(e) => setZone.mutate({ id: c.id, zone: e.target.value || null })}
                    >
                      <option value="">Unknown</option>
                      {c.zone && !known && <option value={c.zone}>{c.zone}</option>}
                      {ZONE_OPTIONS.map((g) => (
                        <optgroup key={g.continent} label={g.continent}>
                          {g.zones.map((z) => (
                            <option key={z} value={z}>{z}</option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </label>
                </li>
              );
            })}
          </ul>
          {setZone.error && <p className="error">{setZone.error.message}</p>}
        </div>
      )}
      {unknown.length > 0 && (
        <p className="muted small-text">
          Location unknown: {unknown.map((c) => `${c.name} ${c.surname}`).join(', ')}
        </p>
      )}
    </section>
  );
}
