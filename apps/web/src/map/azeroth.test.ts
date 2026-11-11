import { describe, expect, it } from 'vitest';
import { dungeons } from '../dungeons';
import { levelRange, POIS, seedInsideOwnZone, ZONE_SHAPES, ZONES } from './azeroth';
import { pointInPolygon } from './geometry';

describe('Azeroth map data', () => {
  it('gives every zone a non-empty patch of land around its seed', () => {
    for (const zone of ZONE_SHAPES) {
      expect(zone.land.length, zone.name).toBeGreaterThanOrEqual(3);
      expect(seedInsideOwnZone(zone), zone.name).toBe(true);
    }
  });

  it('has unique ids', () => {
    expect(new Set(ZONES.map((z) => z.id)).size).toBe(ZONES.length);
    expect(new Set(POIS.map((p) => p.id)).size).toBe(POIS.length);
  });

  it('includes the new WoW Forever zones', () => {
    expect(ZONES.filter((z) => z.isNew).map((z) => z.name).sort()).toEqual(
      ['Mount Hyjal', 'Riverglades', "Shen'dralas", 'Zephras Isle'],
    );
  });

  it('formats level ranges', () => {
    const byId = (id: string) => ZONES.find((z) => z.id === id)!;
    expect(levelRange(byId('moonglade'))).toBe('All levels');
    expect(levelRange(byId('mount-hyjal'))).toBe('60');
    expect(levelRange(byId('westfall'))).toBe('10–20');
  });
});

describe('points of interest', () => {
  it.each(POIS.filter((p) => !p.offshore).map((p) => [p.name, p] as const))('%s sits inside its zone', (_, poi) => {
    const zone = ZONE_SHAPES.find((z) => z.id === poi.zoneId);
    expect(zone, poi.zoneId).toBeDefined();
    expect(pointInPolygon(poi.at, zone!.land)).toBe(true);
  });

  it('places offshore entrances in the sea', () => {
    for (const poi of POIS.filter((p) => p.offshore)) {
      expect(ZONE_SHAPES.some((z) => pointInPolygon(poi.at, z.land)), poi.name).toBe(false);
    }
  });

  it('only references dungeons from the dungeon finder', () => {
    const known = new Set(dungeons.map((d) => d.name));
    for (const poi of POIS) for (const d of poi.dungeons ?? []) expect(known.has(d), d).toBe(true);
  });

  it('puts every dungeon finder entry on the map, except unconfirmed locations', () => {
    const mapped = new Set(POIS.flatMap((p) => p.dungeons ?? []));
    expect(dungeons.filter((d) => !mapped.has(d.name)).map((d) => d.name)).toEqual(['Shaper’s Terrace']);
  });

  it('has a capital for each of the six home cities', () => {
    expect(POIS.filter((p) => p.kind === 'capital')).toHaveLength(6);
  });
});
