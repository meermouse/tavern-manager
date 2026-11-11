import { useEffect, useMemo, useRef, useState } from 'react';
import { dungeons as DUNGEONS } from '../dungeons';
import {
  BIOME_COLOURS,
  CONTINENTS,
  LANDMASS_SHAPES,
  POIS,
  WORLD,
  ZONE_SHAPES,
  ZONES,
  continentBox,
  levelRange,
  type ContinentId,
  type Poi,
  type PoiFaction,
  type ZoneShape,
} from '../map/azeroth';
import { fitAspect, lerpBox, pad, polygonPath, smoothPath, type Box } from '../map/geometry';

const ASPECT = WORLD.w / WORLD.h;

type View =
  | { level: 'world' }
  | { level: 'continent'; continent: ContinentId }
  | { level: 'zone'; zoneId: string };

interface Layers {
  towns: boolean;
  dungeons: boolean;
}

const FACTION_COLOURS: Record<PoiFaction, string> = {
  Alliance: '#4a86e0',
  Horde: '#d04a36',
  Neutral: '#e0b84a',
};

const zoneById = (id: string) => ZONE_SHAPES.find((z) => z.id === id)!;
const continentName = (id: ContinentId) => CONTINENTS.find((c) => c.id === id)!.name;
const dungeonInfo = (name: string) => DUNGEONS.find((d) => d.name === name);

function targetBox(view: View): Box {
  if (view.level === 'world') return WORLD;
  if (view.level === 'continent') return fitAspect(pad(continentBox(view.continent), 22), ASPECT);
  const zone = zoneById(view.zoneId);
  const size = Math.max(zone.landBox.w, zone.landBox.h, 120);
  return fitAspect(pad(zone.landBox, size * 0.8), ASPECT);
}

function parent(view: View): View {
  if (view.level === 'zone') {
    const zone = zoneById(view.zoneId);
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

function dungeonLevels(poi: Poi): string | null {
  const levels = (poi.dungeons ?? []).map(dungeonInfo).filter((d) => d != null);
  if (!levels.length) return null;
  return `${Math.min(...levels.map((d) => d.minLevel))}–${Math.max(...levels.map((d) => d.maxLevel))}`;
}

function poiSummary(poi: Poi): string {
  if (poi.kind === 'dungeon') {
    const levels = dungeonLevels(poi);
    return levels ? `Dungeon · ${levels}` : 'Dungeon';
  }
  return `${poi.faction ?? ''}${poi.kind === 'capital' ? ' capital' : ' town'}`.trim();
}

/** Map icons, centred on (x, y) with half-size `r`. Shared by the map and the legend. */
function PoiIcon({ kind, faction, x, y, r }: { kind: Poi['kind']; faction?: PoiFaction; x: number; y: number; r: number }) {
  if (kind === 'capital') {
    // A little castle: walls with three merlons.
    const d =
      [
        [-1, 1], [-1, -0.55], [-0.6, -0.55], [-0.6, -1], [-0.2, -1], [-0.2, -0.55],
        [0.2, -0.55], [0.2, -1], [0.6, -1], [0.6, -0.55], [1, -0.55], [1, 1],
      ]
        .map(([dx, dy], i) => `${i ? 'L' : 'M'}${x + dx * r},${y + dy * r}`)
        .join('') + 'Z';
    return <path d={d} fill={FACTION_COLOURS[faction ?? 'Neutral']} className="poi-capital" strokeWidth={r * 0.22} />;
  }
  if (kind === 'town') {
    return <circle cx={x} cy={y} r={r} fill={FACTION_COLOURS[faction ?? 'Neutral']} className="poi-town" strokeWidth={r * 0.35} />;
  }
  // Dungeon: an archway with a glowing portal.
  const arch = (k: number) =>
    `M${x - r * k},${y + r * k}L${x - r * k},${y - r * k * 0.15}A${r * k},${r * k} 0 0 1 ${x + r * k},${y - r * k * 0.15}L${x + r * k},${y + r * k}Z`;
  return (
    <g className="poi-dungeon">
      <path d={arch(1)} strokeWidth={r * 0.22} />
      <path d={arch(0.55)} className="poi-dungeon-portal" />
    </g>
  );
}

function LegendIcon({ kind, faction }: { kind: Poi['kind']; faction?: PoiFaction }) {
  return (
    <svg viewBox="-10 -10 20 20" className="legend-icon" aria-hidden>
      <PoiIcon kind={kind} faction={faction} x={0} y={0} r={kind === 'town' ? 5 : 8} />
    </svg>
  );
}

export function WorldMap() {
  const [view, setView] = useState<View>({ level: 'world' });
  const [hover, setHover] = useState<{ title: string; detail: string } | null>(null);
  const [selectedPoi, setSelectedPoi] = useState<string | null>(null);
  const [layers, setLayers] = useState<Layers>({ towns: true, dungeons: true });
  const target = useMemo(() => targetBox(view), [view]);
  const box = useAnimatedBox(target);
  const s = box.w / WORLD.w; // world units per "screen unit" at full-map scale

  const go = (next: View) => {
    setView(next);
    setSelectedPoi(null);
  };
  const zoomOut = () => go(parent(view));
  const openZone = (zone: ZoneShape) => {
    if (view.level === 'world' && zone.continent !== 'zephras') go({ level: 'continent', continent: zone.continent });
    else go({ level: 'zone', zoneId: zone.id });
  };
  const openPoi = (poi: Poi) => {
    setView({ level: 'zone', zoneId: poi.zoneId });
    setSelectedPoi(poi.id);
  };

  const selectedZone = view.level === 'zone' ? zoneById(view.zoneId) : null;
  const activeContinent = view.level === 'continent' ? view.continent : selectedZone ? selectedZone.continent : null;
  const zoomedIn = view.level !== 'world';

  const visiblePois = POIS.filter((p) => {
    if (!zoomedIn) return p.kind === 'capital';
    if (zoneById(p.zoneId).continent !== activeContinent) return false;
    return p.kind === 'town' ? layers.towns : layers.dungeons;
  });
  const poiLabelled = (p: Poi) =>
    view.level === 'zone' ? zoneById(p.zoneId).continent === activeContinent : view.level === 'continent' && p.kind === 'capital';

  return (
    <div className="world-map">
      <div className="map-frame">
        <nav className="map-crumbs" aria-label="Map location">
          <button className="link" onClick={() => go({ level: 'world' })} disabled={view.level === 'world'}>
            Azeroth
          </button>
          {activeContinent && activeContinent !== 'zephras' && (
            <>
              <span aria-hidden>›</span>
              <button
                className="link"
                onClick={() => go({ level: 'continent', continent: activeContinent })}
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
        {zoomedIn && (
          <button className="map-zoom-out small" onClick={zoomOut} title="Zoom out (right-click)">
            − Zoom out
          </button>
        )}
        {hover && (
          <div className="map-hover" aria-hidden>
            <strong>{hover.title}</strong>
            {hover.detail && <span className="muted"> · {hover.detail}</span>}
          </div>
        )}

        <svg
          viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`}
          role="img"
          aria-label="Map of Azeroth"
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
          {!zoomedIn && <text x={510} y={380} className="map-sea-label" fontSize={14}>The Great Sea</text>}
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
                    className={`map-zone${dim ? ' dim' : ''}`}
                    strokeWidth={1.1 * s}
                    role="button"
                    tabIndex={0}
                    aria-label={`${zone.name}, levels ${levelRange(zone)}`}
                    onClick={() => openZone(zone)}
                    onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), openZone(zone))}
                    onMouseEnter={() => setHover({ title: zone.name, detail: levelRange(zone) })}
                    onMouseLeave={() => setHover(null)}
                  />
                );
              })}
              <rect x={l.box.x - 10} y={l.box.y - 10} width={l.box.w + 20} height={l.box.h + 20} filter="url(#paper)" className="map-texture" />
            </g>
          ))}

          {LANDMASS_SHAPES.map((l) => (
            <path key={`coast-${l.id}`} d={smoothPath(l.outline)} className="map-coast" strokeWidth={1.6 * s} />
          ))}

          {!zoomedIn &&
            CONTINENTS.map((c) => (
              <text key={c.id} x={c.label[0]} y={c.label[1]} className="map-continent-label" fontSize={c.id === 'zephras' ? 12 : 20}>
                {c.name}
              </text>
            ))}

          {zoomedIn &&
            ZONE_SHAPES.filter((z) => z.continent === activeContinent).map((z) => (
              <text
                key={z.id}
                x={z.seed[0]}
                y={z.seed[1]}
                fontSize={(selectedZone?.id === z.id ? 14 : 10) * s}
                className={`map-zone-label${z.isNew ? ' new' : ''}`}
              >
                {z.name}
              </text>
            ))}

          {visiblePois.map((poi) => {
            const r = (poi.kind === 'capital' ? 6 : poi.kind === 'dungeon' ? 5.5 : 3) * s * (zoomedIn ? 1 : 0.8);
            const [x, y] = poi.at;
            return (
              <g
                key={poi.id}
                className={`map-poi kind-${poi.kind}`}
                role="button"
                tabIndex={zoomedIn ? 0 : -1}
                aria-label={`${poi.name}, ${poiSummary(poi)}`}
                onClick={() => openPoi(poi)}
                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), openPoi(poi))}
                onMouseEnter={() => setHover({ title: poi.name, detail: poiSummary(poi) })}
                onMouseLeave={() => setHover(null)}
              >
                {selectedPoi === poi.id && <circle cx={x} cy={y} r={r * 2.2} className="poi-selected" strokeWidth={1.5 * s} />}
                <circle cx={x} cy={y} r={r * 1.8} fill="transparent" />
                <PoiIcon kind={poi.kind} faction={poi.faction} x={x} y={y} r={r} />
                {poiLabelled(poi) && (
                  <text
                    x={x}
                    y={y - r - 2.5 * s}
                    fontSize={(poi.kind === 'capital' ? 8.5 : 6.5) * s}
                    className={`map-poi-label kind-${poi.kind}`}
                  >
                    {poi.name}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      <aside className="map-panel card">
        {view.level === 'world' && (
          <WorldPanel
            onContinent={(id) =>
              id === 'zephras' ? go({ level: 'zone', zoneId: 'zephras-isle' }) : go({ level: 'continent', continent: id })
            }
          />
        )}
        {view.level === 'continent' && <ContinentPanel continent={view.continent} onZone={(id) => go({ level: 'zone', zoneId: id })} />}
        {selectedZone && <ZonePanel zone={selectedZone} selectedPoi={selectedPoi} onPoi={openPoi} />}
        <Legend layers={layers} onChange={setLayers} />
      </aside>
    </div>
  );
}

function WorldPanel({ onContinent }: { onContinent: (id: ContinentId) => void }) {
  return (
    <>
      <h2>Azeroth</h2>
      <p className="muted small-text">Click a continent to zoom in, then a zone. Right-click or Esc zooms out.</p>
      <ul className="map-list">
        {CONTINENTS.map((c) => {
          const zoneIds = new Set(ZONES.filter((z) => z.continent === c.id).map((z) => z.id));
          const dungeonCount = POIS.filter((p) => p.kind === 'dungeon' && zoneIds.has(p.zoneId)).length;
          return (
            <li key={c.id}>
              <button className="link nowrap" onClick={() => onContinent(c.id)}>{c.name}</button>
              <span className="muted small-text nowrap">
                {zoneIds.size} zone{zoneIds.size === 1 ? '' : 's'}
                {dungeonCount ? ` · ${dungeonCount}` : ''}
                {dungeonCount > 0 && <LegendIcon kind="dungeon" />}
              </span>
            </li>
          );
        })}
      </ul>
    </>
  );
}

function ContinentPanel({ continent, onZone }: { continent: ContinentId; onZone: (id: string) => void }) {
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
            <span className="muted small-text nowrap">{levelRange(z)}</span>
          </li>
        ))}
      </ul>
    </>
  );
}

function ZonePanel({ zone, selectedPoi, onPoi }: { zone: ZoneShape; selectedPoi: string | null; onPoi: (poi: Poi) => void }) {
  const here = POIS.filter((p) => p.zoneId === zone.id);
  const places = here.filter((p) => p.kind !== 'dungeon');
  const entrances = here.filter((p) => p.kind === 'dungeon');
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
      {zone.note && <p className="small-text muted">{zone.note}</p>}

      {places.length > 0 && (
        <>
          <h3>Cities &amp; towns</h3>
          <ul className="map-list">
            {places.map((p) => (
              <li key={p.id} className={selectedPoi === p.id ? 'selected' : ''}>
                <button className="link poi-link" onClick={() => onPoi(p)}>
                  <LegendIcon kind={p.kind} faction={p.faction} />
                  {p.name}
                </button>
                <span className={`small-text faction ${(p.faction ?? 'Neutral').toLowerCase()}`}>{p.faction}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      {entrances.length > 0 && (
        <>
          <h3>Dungeons</h3>
          <ul className="map-list">
            {entrances.map((p) => {
              const wings = p.dungeons ?? [];
              const multiple = wings.length > 1;
              return (
                <li key={p.id} className={`dungeon-entry${selectedPoi === p.id ? ' selected' : ''}`}>
                  <div className="dungeon-head">
                    <button className="link poi-link" onClick={() => onPoi(p)}>
                      <LegendIcon kind="dungeon" />
                      {p.name}
                    </button>
                    {!multiple && <span className="muted small-text nowrap">{dungeonLevels(p)}</span>}
                  </div>
                  {multiple && (
                    <ul className="instance-list">
                      {wings.map((name) => {
                        const d = dungeonInfo(name);
                        return (
                          <li key={name}>
                            {name.replace(`${p.name}: `, '')}
                            <span className="muted small-text">{d ? `${d.minLevel}–${d.maxLevel}` : ''}</span>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                  {p.note && <p className="muted small-text poi-note">{p.note}</p>}
                </li>
              );
            })}
          </ul>
        </>
      )}
      {!here.length && <p className="muted small-text">No cities or dungeons marked here yet.</p>}
    </>
  );
}

function Legend({ layers, onChange }: { layers: Layers; onChange: (l: Layers) => void }) {
  return (
    <div className="map-legend">
      <h3>Legend</h3>
      <ul>
        <li><LegendIcon kind="capital" faction="Alliance" /> Alliance capital</li>
        <li><LegendIcon kind="capital" faction="Horde" /> Horde capital</li>
        <li>
          <label>
            <input type="checkbox" checked={layers.towns} onChange={(e) => onChange({ ...layers, towns: e.target.checked })} />
            <LegendIcon kind="town" faction="Alliance" />
            <LegendIcon kind="town" faction="Horde" />
            <LegendIcon kind="town" faction="Neutral" />
            Towns
          </label>
        </li>
        <li>
          <label>
            <input type="checkbox" checked={layers.dungeons} onChange={(e) => onChange({ ...layers, dungeons: e.target.checked })} />
            <LegendIcon kind="dungeon" />
            Dungeon entrances
          </label>
        </li>
      </ul>
      <p className="muted small-text">Towns and dungeons appear once you zoom in.</p>
    </div>
  );
}
