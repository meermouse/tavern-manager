import { useState } from 'react';
import { api, type AuctionRegionStatus, type AuctionStatus } from '../api/client';

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : 'never');
const size = (bytes?: number) =>
  bytes == null ? '' : bytes > 1_000_000 ? `${(bytes / 1_000_000).toFixed(1)} MB` : `${Math.ceil(bytes / 1000)} KB`;

/**
 * How the hourly auction house price fetch (behind gear value and net worth) is doing, with every request the last
 * fetch made. Tavern admins can run it now. Loaded only when opened.
 */
export function AuctionPriceStatus() {
  const [status, setStatus] = useState<AuctionStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (load: () => Promise<AuctionStatus>) => {
    setBusy(true);
    setError(null);
    try {
      setStatus(await load());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <details
      className="auction-status"
      onToggle={(e) => {
        if ((e.target as HTMLDetailsElement).open && !status && !busy) void run(api.auctionStatus);
      }}
    >
      <summary>Auction house prices</summary>
      <p className="muted small-text">
        Gear value and net worth use prices fetched from the WoW Forever auction houses every hour.
      </p>
      {busy && <p className="muted">{status ? 'Fetching from Blizzard (up to 20 seconds)…' : 'Loading…'}</p>}
      {error && <p className="error">{error}</p>}
      {status && !status.supported && <p className="muted">This server’s Blizzard client can’t fetch auction prices.</p>}
      {status?.regions.length === 0 && <p className="muted">No characters yet, so no regions to price.</p>}
      {status?.regions.map((r) => <RegionStatus key={r.region} status={r} />)}
      {status?.canRefresh && (
        <button className="ghost small" disabled={busy} onClick={() => void run(api.refreshAuctionPrices)}>
          Fetch now
        </button>
      )}
    </details>
  );
}

function RegionStatus({ status: r }: { status: AuctionRegionStatus }) {
  return (
    <div className="stack">
      <p>
        <strong>{r.region.toUpperCase()}</strong>: {r.priced.toLocaleString()} items priced. Last saved {when(r.fetchedAt)}
        {r.fetchedAt && ` from ${r.houses} auction house${r.houses === 1 ? '' : 's'}`}; last tried {when(r.attemptedAt)}.
      </p>
      {r.error && <p className="error">Last fetch failed: {r.error}</p>}
      {r.attemptedAt && !r.fetchedAt && !r.error && r.trace.length === 0 && (
        <p className="error">The last fetch never finished (it may have run out of time before saving anything).</p>
      )}
      {r.trace.length > 0 && (
        <div className="table-wrap">
          <table className="small-text">
            <thead>
              <tr>
                <th scope="col">Request</th>
                <th scope="col">Status</th>
                <th scope="col" className="num">Time</th>
                <th scope="col" className="num">Size</th>
                <th scope="col">What came back</th>
              </tr>
            </thead>
            <tbody>
              {r.trace.map((s, i) => (
                <tr key={i}>
                  <td data-label="Request"><code>{s.path}</code></td>
                  <td data-label="Status" className={s.status != null && s.status < 400 ? undefined : 'error'}>
                    {s.status ?? 'no answer'}
                  </td>
                  <td data-label="Time" className="num">{(s.ms / 1000).toFixed(1)}s</td>
                  <td data-label="Size" className="num">{size(s.bytes)}</td>
                  <td data-label="What came back">
                    {s.error ??
                      [
                        s.auctions != null && `${s.auctions.toLocaleString()} listings`,
                        s.priced != null && `${s.priced.toLocaleString()} items priced`,
                        s.keys?.length && `keys: ${s.keys.join(', ')}`,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
