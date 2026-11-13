import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Profession } from '../api/client';
import { ProfessionList, ProfessionSlots, bestProfessionSkill, professionRank } from './ProfessionIcons';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const alchemy: Profession = { name: 'Alchemy', kind: 'primary', skill: 225, maxSkill: 300 };
const herbalism: Profession = { name: 'Herbalism', kind: 'primary', skill: 260, maxSkill: 300 };
const cooking: Profession = { name: 'Cooking', kind: 'secondary', skill: 75, maxSkill: 75 };

function hover(el: Element) {
  fireEvent.pointerEnter(el.parentElement!, { pointerType: 'mouse' });
  act(() => vi.runAllTimers());
  return screen.getByRole('tooltip').textContent;
}

describe('ProfessionSlots', () => {
  it('shows both primary slots with skill levels, leaving secondaries out', () => {
    render(<ProfessionSlots professions={[alchemy, cooking, herbalism]} />);
    const slots = screen.getAllByRole('listitem');
    expect(slots.map((s) => s.getAttribute('aria-label'))).toEqual([
      'Alchemy, skill 225 of 300',
      'Herbalism, skill 260 of 300',
    ]);
    expect(slots[0].textContent).toBe('225');
  });

  it('marks empty slots and explains them on hover', () => {
    vi.useFakeTimers();
    render(<ProfessionSlots professions={[alchemy]} />);
    const slots = screen.getAllByRole('listitem');
    expect(slots[1].getAttribute('aria-label')).toBe('Empty profession slot');
    expect(hover(slots[1])).toMatch(/Empty profession slot.*second primary profession/);
  });

  it('describes the profession, rank and skill on hover', () => {
    vi.useFakeTimers();
    render(<ProfessionSlots professions={[alchemy]} />);
    expect(hover(screen.getAllByRole('listitem')[0])).toBe('AlchemyPrimary profession · ArtisanSkill 225 / 300');
  });

  it('shows a dash before professions have synced', () => {
    render(<ProfessionSlots professions={null} />);
    expect(screen.queryByRole('list')).toBeNull();
    expect(screen.getByText('—')).toBeTruthy();
  });
});

describe('ProfessionList', () => {
  it('lists both slots then secondary skills', () => {
    render(<ProfessionList professions={[alchemy, cooking]} />);
    const items = screen.getAllByRole('listitem').map((li) => li.textContent);
    expect(items).toEqual(['Alchemy Artisan225 / 300', 'Empty profession slot', 'Cooking Secondary · Apprentice75 / 75']);
  });
});

describe('helpers', () => {
  it('names ranks by skill cap', () => {
    expect([75, 150, 225, 300, null].map(professionRank)).toEqual(['Apprentice', 'Journeyman', 'Expert', 'Artisan', null]);
  });

  it('sorts by the best primary skill', () => {
    expect(bestProfessionSkill([alchemy, herbalism, { ...cooking, skill: 300 }])).toBe(260);
    expect(bestProfessionSkill([cooking])).toBeUndefined();
  });
});
