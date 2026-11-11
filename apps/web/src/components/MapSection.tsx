import { useState } from 'react';
import { WorldMap } from './WorldMap';

export const FOREVER_MAP_URL = 'https://wowforevermap.com/';
const STORAGE_KEY = 'tavern.mapSource';

type Source = 'forever' | 'simple';

function initialSource(): Source {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'simple' ? 'simple' : 'forever';
  } catch {
    return 'forever';
  }
}

/**
 * The home page map: the interactive map from wowforevermap.com (a separate fan site, embedded
 * as-is and credited), with our own simple map as a fallback if theirs doesn't load.
 */
export function MapSection() {
  const [source, setSource] = useState<Source>(initialSource);
  const choose = (next: Source) => {
    setSource(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Storage unavailable (private mode etc.): the choice just won't be remembered.
    }
  };

  return (
    <section className="map-section">
      <div className="map-section-head">
        <h2 className="section-title">Map of Azeroth</h2>
        <div className="view-tabs" role="group" aria-label="Map source">
          <button className={source === 'forever' ? 'active' : ''} aria-pressed={source === 'forever'} onClick={() => choose('forever')}>
            Forever Map
          </button>
          <button className={source === 'simple' ? 'active' : ''} aria-pressed={source === 'simple'} onClick={() => choose('simple')}>
            Simple map
          </button>
        </div>
      </div>

      {source === 'forever' ? (
        <>
          <div className="map-embed">
            <iframe
              src={FOREVER_MAP_URL}
              title="WoW Forever interactive map by wowforevermap.com"
              loading="lazy"
              referrerPolicy="strict-origin-when-cross-origin"
              sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-open-new-tabs allow-forms"
              allow="fullscreen"
            />
          </div>
          <p className="muted small-text map-credit">
            Interactive map by{' '}
            <a href={FOREVER_MAP_URL} target="_blank" rel="noreferrer">wowforevermap.com</a>, a separate fan site.{' '}
            <a href={FOREVER_MAP_URL} target="_blank" rel="noreferrer">Open full map ↗</a> · Not loading?{' '}
            <button className="link" onClick={() => choose('simple')}>Use the simple map</button>
          </p>
        </>
      ) : (
        <WorldMap />
      )}
    </section>
  );
}
