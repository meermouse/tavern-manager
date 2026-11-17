import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, type AuctionStatus } from '../api/client';
import { AuctionPriceStatus } from './AuctionPriceStatus';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const failed: AuctionStatus = {
  supported: true,
  canRefresh: true,
  regions: [
    {
      region: 'eu', attemptedAt: '2026-11-17T20:00:00Z', fetchedAt: null, houses: 0, items: 0, priced: 0,
      error: 'Blizzard API error (403) for /data/wow/ruleset/1/auctions/110',
      trace: [{ path: '/data/wow/ruleset/index', status: 403, ms: 120, bytes: 9, error: 'Forbidden' }],
    },
  ],
};

describe('AuctionPriceStatus', () => {
  it('loads when opened and shows the last error and each request', async () => {
    const status = vi.spyOn(api, 'auctionStatus').mockResolvedValue(failed);
    const { container } = render(<AuctionPriceStatus />);
    expect(status).not.toHaveBeenCalled();
    const details = container.querySelector('details')!;
    details.open = true;
    fireEvent(details, new Event('toggle'));
    expect(await screen.findByText(/Last fetch failed: Blizzard API error \(403\)/)).toBeTruthy();
    expect(screen.getByText('/data/wow/ruleset/index')).toBeTruthy();
    expect(screen.getByText('Forbidden')).toBeTruthy();
  });

  it('lets admins fetch now', async () => {
    vi.spyOn(api, 'auctionStatus').mockResolvedValue(failed);
    const refresh = vi.spyOn(api, 'refreshAuctionPrices').mockResolvedValue({
      ...failed,
      regions: [{ ...failed.regions[0], error: null, fetchedAt: '2026-11-17T21:00:00Z', houses: 3, items: 500, priced: 500, trace: [] }],
    });
    const { container } = render(<AuctionPriceStatus />);
    const details = container.querySelector('details')!;
    details.open = true;
    fireEvent(details, new Event('toggle'));
    fireEvent.click(await screen.findByRole('button', { name: 'Fetch now' }));
    expect(await screen.findByText(/500 items priced/)).toBeTruthy();
    expect(refresh).toHaveBeenCalled();
  });
});
