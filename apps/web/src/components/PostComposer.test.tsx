import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Me, TavernCharacter } from '../api/client';
import { PostComposer } from './PostComposer';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
});

const viewer: Me = { id: 'u1', battletag: 'Alice#1234', displayName: 'Alice', canImport: false };
const judy = {
  id: 'c1',
  name: 'Judgement',
  surname: 'Judy',
  class: 'Paladin',
  level: 23,
  ownerId: 'u1',
  ownerName: 'Alice',
} as TavernCharacter;

function renderComposer() {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: '9' }), { status: 201 }));
  vi.stubGlobal('fetch', fetchMock);
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <PostComposer tavernId="t1" viewer={viewer} characters={[judy]} />
    </QueryClientProvider>,
  );
  return fetchMock;
}

describe('PostComposer', () => {
  it('posts as you by default', async () => {
    const fetchMock = renderComposer();
    const post = screen.getByRole('button', { name: 'Post' });
    expect(post).toHaveProperty('disabled', true);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '  Hello tavern  ' } });
    fireEvent.click(post);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/taverns/t1/posts');
    expect(JSON.parse(init.body as string)).toEqual({ text: 'Hello tavern', images: [], characterId: null });
    await waitFor(() => expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe(''));
  });

  it('posts as a character picked from the dropdown, and remembers it', async () => {
    const fetchMock = renderComposer();
    const select = screen.getByLabelText('Post as') as HTMLSelectElement;
    expect([...select.options].map((o) => o.textContent)).toEqual(['Alice (you)', 'Judgement Judy · level 23']);
    fireEvent.change(select, { target: { value: 'c1' } });
    expect(screen.getByRole('textbox').getAttribute('placeholder')).toBe("What's Judgement up to?");
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'For the Light!' } });
    fireEvent.click(screen.getByRole('button', { name: 'Post' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toMatchObject({ characterId: 'c1' });
    expect(localStorage.getItem('post-as:t1')).toBe('c1');
  });
});
