import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CharacterDirectory, CharacterLink } from './CharacterLink';
import { placeCard } from './HoverCard';
import { ItemLink, ItemTooltip } from './ItemLink';

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const viewport = { width: 1000, height: 800 };
const card = { width: 300, height: 200 };

describe('placeCard', () => {
  it('goes below the trigger when there is room', () => {
    expect(placeCard({ top: 100, bottom: 120, left: 50 }, card, viewport)).toEqual({ top: 128, left: 50 });
  });

  it('flips above near the bottom and stays inside the right edge', () => {
    expect(placeCard({ top: 700, bottom: 720, left: 900 }, card, viewport)).toEqual({ top: 492, left: 692 });
  });

  it('never goes off the top', () => {
    expect(placeCard({ top: 100, bottom: 700, left: 0 }, card, viewport).top).toBeGreaterThanOrEqual(8);
  });
});

const sword = {
  id: 1,
  name: 'Hearthfire Greatblade',
  quality: 'EPIC',
  slot: 'Main Hand',
  itemLevel: 57,
  itemType: 'Two-Handed Sword',
  binding: 'Binds when picked up',
  weapon: ['118 - 178 Damage', 'Speed 3.40', '(43.5 damage per second)'],
  stats: ['+19 Strength'],
  effects: ['Chance on hit: Sets the target ablaze.'],
  requirement: 'Requires Level 52',
  description: 'Hot.',
};

describe('ItemTooltip', () => {
  it('shows the details in tooltip order', () => {
    const { container } = render(<ItemTooltip item={sword} />);
    expect(container.textContent).toBe(
      'Hearthfire GreatbladeItem Level 57Binds when picked upMain HandTwo-Handed Sword118 - 178 DamageSpeed 3.40' +
        '(43.5 damage per second)+19 StrengthRequires Level 52Chance on hit: Sets the target ablaze.“Hot.”',
    );
    expect(screen.getByText('Hearthfire Greatblade').className).toContain('q-epic');
  });

  it('falls back to the quality for items without details', () => {
    const { container } = render(
      <ItemTooltip item={{ id: 2, name: 'Old Ring', quality: 'RARE', slot: 'Finger', itemLevel: null }} />,
    );
    expect(container.textContent).toBe('Old RingFingerRare');
  });
});

describe('hover cards', () => {
  it('open on hover after a short delay and close on leave', () => {
    render(<ItemLink item={sword} />);
    const trigger = screen.getByText('[Hearthfire Greatblade]').parentElement!;
    fireEvent.pointerEnter(trigger, { pointerType: 'mouse' });
    expect(screen.queryByRole('tooltip')).toBeNull();
    act(() => vi.advanceTimersByTime(200));
    expect(screen.getByRole('tooltip').textContent).toContain('Requires Level 52');
    expect(trigger.getAttribute('aria-describedby')).toBe(screen.getByRole('tooltip').id);
    fireEvent.pointerLeave(trigger, { pointerType: 'mouse' });
    act(() => vi.advanceTimersByTime(200));
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('ignore touch, open on keyboard focus, and close on Escape', () => {
    render(<ItemLink item={sword} />);
    const trigger = screen.getByText('[Hearthfire Greatblade]').parentElement!;
    fireEvent.pointerEnter(trigger, { pointerType: 'touch' });
    act(() => vi.advanceTimersByTime(200));
    expect(screen.queryByRole('tooltip')).toBeNull();
    fireEvent.focus(trigger);
    act(() => vi.advanceTimersByTime(10));
    expect(screen.getByRole('tooltip')).toBeTruthy();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('fill in character cards from the page directory', () => {
    const full = {
      id: 'c1',
      name: 'Judgement',
      surname: 'Judy',
      class: 'Paladin',
      race: 'Human',
      level: 42,
      guild: 'Last Orders',
      ownerName: 'Alice',
      itemLevel: 51,
    };
    render(
      <CharacterDirectory.Provider value={new Map([['c1', full]])}>
        <CharacterLink character={{ id: 'c1', name: 'Judgement' }}>
          <strong>Judgement</strong>
        </CharacterLink>
      </CharacterDirectory.Provider>,
    );
    fireEvent.focus(screen.getByText('Judgement').parentElement!);
    act(() => vi.advanceTimersByTime(10));
    const text = screen.getByRole('tooltip').textContent;
    expect(text).toContain('Judgement Judy');
    expect(text).toContain('Level 42 Human Paladin');
    expect(text).toContain('<Last Orders>');
    expect(text).toContain('PlayerAlice');
    expect(text).toContain('Item level51');
  });
});
