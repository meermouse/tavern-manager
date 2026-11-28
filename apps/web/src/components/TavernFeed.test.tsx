import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FeedEvent } from '../api/client';
import { cheersLabel, CommissionDialog, FeedPost, isMilestone, timeAgo } from './TavernFeed';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

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
  it('shows yesterday on the auction house', () => {
    const li = renderPost(
      post({
        kind: 'auction_daily',
        character: null,
        user: null,
        data: {
          region: 'eu',
          day: '2026-11-11',
          hours: 24,
          houses: 12,
          totals: { purchases: 15000, units: 90000, copper: 123_456_789 },
          hottest: [
            { id: 2589, name: 'Linen Cloth', quality: 'COMMON', purchases: 812, units: 9300, copper: 50_000, average: 5 },
            { id: 858, name: 'Lesser Healing Potion', quality: 'COMMON', purchases: 400, units: 400, copper: 20_000, average: 50 },
          ],
          bigSpender: { id: 12360, name: 'Arcanite Bar', quality: 'UNCOMMON', purchases: 30, units: 60, copper: 9_000_000 },
          priciest: { id: 12640, name: 'Lionheart Helm', quality: 'EPIC', unit: 15_000_000, quantity: 1, going: 12_000_000, house: 'Horde Auction House' },
        },
      }),
    );
    expect(li.textContent).toContain('Wednesday 11 November on the auction house');
    expect(li.textContent).toContain('[Linen Cloth] ~812 sales, 9,300 units, avg 5c each');
    expect(li.textContent).toContain('[Lesser Healing Potion] ~400 sales, avg 50c each');
    expect(li.textContent).not.toContain('400 units');
    expect(li.textContent).toContain('[Arcanite Bar] ~900g 0s over 30 sales');
    expect(li.textContent).toContain('[Lionheart Helm] 1,500g 0s');
    expect(li.textContent).toContain('going rate 1,200g 0s, Horde Auction House');
    expect(li.textContent).toContain('Roughly 15,000 sales worth 12,345g 67s across 12 auction houses');
    expect(li.querySelector('.q-epic')).not.toBeNull();
  });

  it("shows a tavern's local market", () => {
    const li = renderPost(
      post({
        kind: 'auction_market',
        character: null,
        user: null,
        data: {
          region: 'eu',
          day: '2026-11-11',
          groups: [
            {
              faction: 'Horde',
              minLevel: 20,
              maxLevel: 28,
              characters: [
                { id: 'c2', name: 'Grimble', surname: 'Thornwick', class: 'Warrior', level: 23 },
                { id: 'c3', name: 'Moss', surname: 'Hoof', class: 'Druid', level: 25 },
              ],
              zones: ['Ashenvale', 'Stonetalon Mountains'],
              items: [
                { id: 4306, name: 'Silk Cloth', quality: 'COMMON', purchases: 300, units: 4000, copper: 2_400_000, average: 600, level: 25 },
                { id: 6264, name: 'Greater Adept\'s Robe', quality: 'UNCOMMON', purchases: 3, units: 3, copper: 450_000, average: 150_000, level: 23 },
              ],
            },
          ],
        },
      }),
    );
    expect(li.textContent).toContain('Your local market, Wednesday 11 November');
    expect(li.textContent).toContain('Grimble and Moss (Horde, level 23–25) · probably out in Ashenvale or Stonetalon Mountains');
    expect(li.textContent).toContain('[Silk Cloth] avg 6s 0c each · ~300 sales, 4,000 units · level 25');
    expect(li.textContent).toContain("[Greater Adept's Robe] avg 15g 0s · ~3 sales · level 23");
    expect(li.textContent).toContain('on the Horde and neutral auction houses');
  });

  it('shows a title gained, tagging whoever it was taken from', () => {
    const grim = { id: 'c2', name: 'Grimble', surname: 'Thornwick', class: 'Warrior', level: 40 };
    const title = { key: 'ninja', name: 'The Ninja', icon: '🎲', value: '90.0% need rolls' };
    const taken = renderPost(
      post({
        kind: 'title_gained',
        character: { ...grim, race: 'Orc' },
        data: {
          title,
          characters: [grim, character],
          previous: { characterId: 'c1', player: { id: 'u1', displayName: 'Alice' }, value: '75.0% need rolls' },
        },
      }),
    );
    expect(taken.textContent).toContain('Grimble took The Ninja from Judgement');
    expect(taken.textContent).toContain('90.0% need rolls · Judgement: 75.0% need rolls');
    const fresh = renderPost(post({ kind: 'title_gained', data: { title, characters: [character], previous: null } }));
    expect(fresh.textContent).toContain('Judgement is now The Ninja');
    const player = renderPost(
      post({
        kind: 'title_gained',
        character: null,
        data: {
          title: { key: 'altaholic', name: 'Altaholic', icon: '👥', value: '3 characters' },
          characters: [],
          previous: { characterId: null, player: { id: 'u2', displayName: 'Bob' }, value: '2 characters' },
        },
      }),
    );
    expect(player.textContent).toContain('Alice took Altaholic from Bob');
  });

  it('shows nothing for a kind it does not know', () => {
    const { container } = render(<ul><FeedPost event={post({ kind: 'secret_admin_thing' as FeedEvent['kind'] })} now={NOW} /></ul>);
    expect(container.querySelector('li')).toBeNull();
    expect(container.textContent).not.toMatch(/Something happened/);
  });

  it('renders a group run', () => {
    const party = [
      { id: 'a', name: 'Judy', surname: 'X', class: 'Paladin', level: 15, avatarUrl: null },
      { id: 'b', name: 'Grim', surname: 'Y', class: 'Mage', level: 16, avatarUrl: null },
      { id: 'c', name: 'Thorn', surname: 'Z', class: 'Rogue', level: 17, avatarUrl: null },
    ];
    const cleared = renderPost(post({
      kind: 'dungeon_run', character: null, data: { dungeon: 'Ragefire Chasm', cleared: true, bosses: ['Bazzalan'], characters: party },
    }));
    expect(cleared.textContent).toContain('Judy, Grim and Thorn cleared Ragefire Chasm');
    expect(cleared.textContent).toContain('Bosses: Bazzalan');
    cleanup();
    const partial = renderPost(post({
      kind: 'dungeon_run', character: null,
      data: { dungeon: 'Uldaman', cleared: false, bosses: ['Revelosh', 'Ironaya'], characters: party.slice(0, 2) },
    }));
    expect(partial.textContent).toContain('Judy and Grim ran Uldaman (2 bosses down)');
  });

  it('renders a dungeon clear', () => {
    const li = renderPost(post({ kind: 'dungeon_cleared', data: { dungeon: 'The Deadmines' } }));
    expect(li.textContent).toContain('Judgement Judy cleared The Deadmines');
    expect(li.textContent).toContain('🗝️');
  });

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

describe('generated image posts', () => {
  const image = (over: Partial<NonNullable<FeedEvent['data']['image']>>) =>
    post({
      kind: 'generated_image',
      character: null,
      data: {
        caption: 'The Deadmines with Grim and Judy',
        sourceEventId: '7',
        image: { id: 'img1', status: 'ready', error: null, url: '/api/taverns/t1/images/img1?v=1', ...over },
      },
    });

  it('shows the finished picture', () => {
    const li = renderPost(image({}));
    expect(li.textContent).toContain('Alice commissioned a painting: The Deadmines with Grim and Judy');
    const img = li.querySelector('img')!;
    expect(img.getAttribute('src')).toBe('/api/taverns/t1/images/img1?v=1');
    expect(img.getAttribute('alt')).toBe('The Deadmines with Grim and Judy');
  });

  it('shows progress while painting', () => {
    const li = renderPost(image({ status: 'generating', url: null }));
    expect(li.querySelector('img')).toBeNull();
    expect(screen.getByRole('status').textContent).toContain('painting');
  });

  it('shows failures, with retry and remove for admins only', () => {
    const failed = image({ status: 'failed', url: null, error: 'Rejected by the safety system' });
    expect(renderPost(failed).textContent).toContain('Rejected by the safety system');
    expect(screen.queryByText('Try again')).toBeNull();
    cleanup();

    const retry = vi.fn();
    const remove = vi.fn();
    render(<ul><FeedPost event={failed} now={NOW} imageActions={{ retry, remove }} /></ul>);
    fireEvent.click(screen.getByText('Try again'));
    fireEvent.click(screen.getByText('Remove'));
    expect(retry).toHaveBeenCalledWith('img1');
    expect(remove).toHaveBeenCalledWith('img1');
  });
});

describe('Commission painting', () => {
  it('shows the button when given, and calls back', () => {
    const onClick = vi.fn();
    render(<ul><FeedPost event={post({})} now={NOW} commission={{ onClick }} /></ul>);
    fireEvent.click(screen.getByRole('button', { name: /Commission painting/ }));
    expect(onClick).toHaveBeenCalled();
  });

  it('is disabled with a reason while another picture is painting', () => {
    render(
      <ul>
        <FeedPost event={post({})} now={NOW} commission={{ onClick: vi.fn(), disabledReason: 'Already painting' }} />
      </ul>,
    );
    const button = screen.getByRole('button', { name: /Commission painting/ });
    expect(button).toHaveProperty('disabled', true);
    expect(button.getAttribute('title')).toBe('Already painting');
  });

  it('is absent by default (non-admins)', () => {
    renderPost(post({}));
    expect(screen.queryByText(/Commission painting/)).toBeNull();
  });
});

describe('CommissionDialog', () => {
  function renderDialog(onConfirm = vi.fn()) {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ prompt: 'Paint Judgement levelling up.' })));
    vi.stubGlobal('fetch', fetchMock);
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <CommissionDialog tavernId="t1" event={post({ id: '7' })} onConfirm={onConfirm} onCancel={vi.fn()} />
      </QueryClientProvider>,
    );
    return { fetchMock, onConfirm };
  }

  it('shows the prompt in an editable box and paints the edited prompt', async () => {
    const { fetchMock, onConfirm } = renderDialog();
    const box = (await screen.findByDisplayValue('Paint Judgement levelling up.')) as HTMLTextAreaElement;
    expect(fetchMock).toHaveBeenCalledWith('/api/taverns/t1/images/preview', expect.objectContaining({ method: 'POST' }));
    expect(screen.getByLabelText('Prompt')).toBe(box);

    fireEvent.change(box, { target: { value: 'Paint Judgement in the rain.  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
    expect(box.value).toBe('Paint Judgement levelling up.');

    fireEvent.change(box, { target: { value: 'Paint Judgement in the rain.  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Paint it' }));
    expect(onConfirm).toHaveBeenCalledWith('Paint Judgement in the rain.');
  });

  it('can’t paint an empty prompt', async () => {
    renderDialog();
    const box = await screen.findByDisplayValue('Paint Judgement levelling up.');
    fireEvent.change(box, { target: { value: '   ' } });
    expect(screen.getByRole('button', { name: 'Paint it' })).toHaveProperty('disabled', true);
  });
});

describe('deleting a post', () => {
  it('offers admins a delete (×) button', () => {
    const onDelete = vi.fn();
    render(<ul><FeedPost event={post({})} now={NOW} onDelete={onDelete} /></ul>);
    fireEvent.click(screen.getByRole('button', { name: 'Delete this post' }));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it('is absent by default (non-admins)', () => {
    renderPost(post({}));
    expect(screen.queryByRole('button', { name: 'Delete this post' })).toBeNull();
  });
});

describe('player posts', () => {
  it('shows what a player wrote as themselves, with their pictures', () => {
    const li = renderPost(
      post({
        kind: 'user_post',
        character: null,
        data: { text: 'Deadmines tonight?\nBring snacks', images: [{ id: 'i1', url: '/api/taverns/t1/posts/images/i1' }] },
      }),
    );
    expect(li.querySelector('.feed-headline')!.textContent).toContain('Alice');
    expect(li.querySelector('.feed-text')!.textContent).toBe('Deadmines tonight?\nBring snacks');
    const img = li.querySelector('.feed-gallery img') as HTMLImageElement;
    expect(img.getAttribute('src')).toBe('/api/taverns/t1/posts/images/i1');
    expect(img.alt).toBe('Picture 1 posted by Alice');
  });

  it('names the character when posted as one, and the player beside it', () => {
    const li = renderPost(post({ kind: 'user_post', data: { text: 'For the Light!' } }));
    expect(li.querySelector('.feed-headline')!.textContent).toContain('Judgement Judy');
    expect(li.querySelector('.feed-meta')!.textContent).toContain('Alice');
    expect(li.querySelector('.feed-gallery')).toBeNull();
  });
});
