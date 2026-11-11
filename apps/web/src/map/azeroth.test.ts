import { describe, expect, it } from 'vitest';
import { dungeons } from '../dungeons';
import { findZone, levelRange, seedInsideOwnZone, ZONE_SHAPES, ZONES } from './azeroth';

describe('Azeroth map data', () => {
  it('gives every zone a non-empty patch of land around its seed', () => {
    for (const zone of ZONE_SHAPES) {
      expect(zone.land.length, zone.name).toBeGreaterThanOrEqual(3);
      expect(seedInsideOwnZone(zone), zone.name).toBe(true);
    }
  });

  it('only references dungeons from the dungeon finder', () => {
    const known = new Set(dungeons.map((d) => d.name));
    for (const zone of ZONES) for (const d of zone.dungeons ?? []) expect(known.has(d), d).toBe(true);
  });

  it('has unique ids', () => {
    expect(new Set(ZONES.map((z) => z.id)).size).toBe(ZONES.length);
  });

  it('includes the new WoW Forever zones', () => {
    expect(ZONES.filter((z) => z.isNew).map((z) => z.name).sort()).toEqual(
      ['Mount Hyjal', 'Riverglades', "Shen'dralas", 'Zephras Isle'],
    );
  });
});

describe('findZone', () => {
  it.each([
    ['Elwynn Forest', 'elwynn'],
    ['stormwind city', 'elwynn'],
    ['Barrens', 'barrens'],
    ['The Barrens', 'barrens'],
    ['Orgrimmar', 'durotar'],
    ['Hyjal', 'mount-hyjal'],
    ["SHEN'DRALAS", 'shendralas'],
  ])('%s → %s', (name, id) => {
    expect(findZone(name)?.id).toBe(id);
  });

  it('returns null for unknown places', () => {
    expect(findZone('Northrend')).toBeNull();
    expect(findZone(null)).toBeNull();
  });

  it('formats level ranges', () => {
    expect(levelRange(findZone('Moonglade')!)).toBe('All levels');
    expect(levelRange(findZone('Mount Hyjal')!)).toBe('60');
    expect(levelRange(findZone('Westfall')!)).toBe('10–20');
  });
});
