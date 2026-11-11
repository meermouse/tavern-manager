import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { FOREVER_MAP_URL, MapSection } from './MapSection';

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe('MapSection', () => {
  it('embeds the Forever Map with a credit by default', () => {
    render(<MapSection />);
    expect(screen.getByTitle(/wowforevermap\.com/).getAttribute('src')).toBe(FOREVER_MAP_URL);
    expect(screen.getByRole('link', { name: /Open full map/ }).getAttribute('href')).toBe(FOREVER_MAP_URL);
  });

  it('switches to the simple map and remembers the choice', () => {
    const { unmount } = render(<MapSection />);
    fireEvent.click(screen.getByRole('button', { name: 'Simple map' }));
    expect(screen.queryByTitle(/wowforevermap\.com/)).toBeNull();
    expect(screen.getByRole('img', { name: 'Map of Azeroth' })).toBeTruthy();
    unmount();
    render(<MapSection />);
    expect(screen.queryByTitle(/wowforevermap\.com/)).toBeNull();
  });
});
