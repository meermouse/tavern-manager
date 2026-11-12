import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FeedEvent } from '../api/client';
import { cheersLabel, FeedPost, isMilestone, timeAgo } from './TavernFeed';

afterEach(cleanup);

const NOW = Date.parse('2026-11-12T12:00:00Z');
const character = { id: 'c1', name: 'Judgement', surname: 'Judy', class: 'Paladin', race: 'Human', level: 23 };
const user = { id: 'u1', displayName: 'Alice' };

function post(over: Partial<FeedEvent>): FeedEvent {
  return {
    id: '1',
    kind: 'level_up',
    createdAt: '2026-11-12T09:00:00Z',
    character,
    user,
    data: {},
    cheers: { count: 0, names: [], cheeredByMe: false },
    ...over,
  };
}

function renderPost(event: FeedEvent) {
  const { container } = render(<ul><FeedPost event={event} now={NOW} /></ul>);
  return container.querySelector('li')!;
}

describe('timeAgo', () => {
  it.each([
    ['2026-11-12T11:59:30Z', 'just now'],
    ['2026-11-12T11:55:00Z', '5m ago'],
    ['2026-11-12T09:00:00Z', '3h ago'],
    ['2026-11-10T12:00:00Z', '2d ago'],
  ])('%s → %s', (iso, expected) => expect(timeAgo(iso, NOW)).toBe(expected));

  it('falls back to a date for old posts', () => {
    expect(timeAgo('2026-01-02T12:00:00Z', NOW)).toMatch(/2026/);
  });
});

describe('isMilestone', () => {
  it.each([
    [19, 20, true],
    [18, 19, false],
    [28, 31, true],
    [59, 60, true],
    [21, 22, false],
  ])('%i → %i: %s', (from, to, expected) => expect(isMilestone(from, to)).toBe(expected));
});

describe('FeedPost', () => {
  it('renders a multi-level level-up with owner and time', () => {
    const li = renderPost(post({ data: { from: 20, to: 23 } }));
    expect(li.textContent).toContain('Judgement Judy reached level 23');
    expect(li.textContent).toContain('+3 levels');
    expect(li.textContent).toContain('Alice');
    expect(li.textContent).toContain('3h ago');
    expect(li.className).not.toContain('milestone');
    expect(screen.getByText('Judgement Judy').className).toBe('class-paladin');
  });

  it('highlights milestones and max level', () => {
    expect(renderPost(post({ data: { from: 29, to: 30 } })).className).toContain('milestone');
    cleanup();
    const max = renderPost(post({ data: { from: 59, to: 60 } }));
    expect(max.className).toContain('max');
    expect(max.textContent).toContain('max level 60');
  });

  it('lists loot in quality colours', () => {
    const li = renderPost(
      post({
        kind: 'loot',
        data: {
          items: [
            { id: 1, name: 'Hearthfire Greatblade', quality: 'EPIC', slot: 'Main Hand', itemLevel: 57 },
            { id: 2, name: 'Ring of Last Orders', quality: 'RARE', slot: 'Finger', itemLevel: null },
          ],
        },
      }),
    );
    expect(li.textContent).toContain('equipped 2 new items');
    expect(li.className).toContain('loot-epic');
    expect(screen.getByText('[Hearthfire Greatblade]').className).toContain('q-epic');
    expect(li.textContent).toContain('Epic · Main Hand · item level 57');
  });

  it('uses the right article for a single item', () => {
    const li = renderPost(
      post({ kind: 'loot', data: { items: [{ id: 1, name: 'X', quality: 'EPIC', slot: null, itemLevel: null }] } }),
    );
    expect(li.textContent).toContain('equipped an epic item');
  });

  it('renders achievements, joins and founding', () => {
    expect(
      renderPost(post({ kind: 'achievement', data: { achievements: [{ id: 1, name: 'Level 20', completedAt: null }] } }))
        .textContent,
    ).toContain('earned an achievement');
    expect(screen.getByText('Level 20')).toBeTruthy();
    cleanup();
    expect(renderPost(post({ kind: 'character_joined' })).textContent).toContain(
      'Alice brought Judgement Judy to the tavern (level 23 Paladin)',
    );
    cleanup();
    expect(renderPost(post({ kind: 'member_joined', character: null })).textContent).toContain('Alice joined the tavern');
    cleanup();
    expect(
      renderPost(post({ kind: 'tavern_founded', character: null, data: { tavernName: 'The Prancing Pony' } })).textContent,
    ).toContain('Alice founded The Prancing Pony');
  });
});

describe('cheers', () => {
  it('labels who cheered', () => {
    expect(cheersLabel({ count: 0, names: [], cheeredByMe: false })).toBe('Be the first to raise a glass');
    expect(cheersLabel({ count: 2, names: ['Bob', 'Alice'], cheeredByMe: true })).toBe('Cheers from Bob, Alice');
  });

  it('shows the count and pressed state, and toggles', () => {
    const onCheer = vi.fn();
    render(
      <ul>
        <FeedPost
          event={post({ data: { from: 1, to: 2 }, cheers: { count: 2, names: ['Bob', 'Alice'], cheeredByMe: true } })}
          now={NOW}
          onCheer={onCheer}
        />
      </ul>,
    );
    const button = screen.getByRole('button', { name: /cheers/i });
    expect(button.getAttribute('aria-pressed')).toBe('true');
    expect(button.textContent).toContain('2');
    expect(screen.getByText('Cheers from Bob, Alice')).toBeTruthy();
    fireEvent.click(button);
    expect(onCheer).toHaveBeenCalledOnce();
  });

  it('hides the button when the post has no cheer handler', () => {
    renderPost(post({ data: { from: 1, to: 2 } }));
    expect(screen.queryByRole('button')).toBeNull();
  });
});
