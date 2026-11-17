import { dungeonScene } from './dungeonScenes.js';

/**
 * Turning feed posts into an image prompt. Only what can be painted is kept: who was there (race, class, gender,
 * faction and their render as a reference image), where (the dungeon), what they fought (bosses) and what they
 * showed off (new gear, level milestones). Numbers, IRL names, dates and cheers are left out.
 */

/** A feed post as `tavernFeed` returns it (only the fields used here). */
export interface ScenePost {
  id: string;
  kind: string;
  character: { id: string; name: string | null } | null;
  data: Record<string, unknown>;
}

/** A character's look, from the characters table. */
export interface SceneCharacter {
  id: string;
  name: string;
  class: string | null;
  race: string | null;
  gender: string | null;
  faction: string | null;
  level: number | null;
  title: string | null;
  /** Portrait URLs, best first for a reference: full-body render, bust, headshot. */
  render_url: string | null;
  inset_url: string | null;
  avatar_url: string | null;
  equipment: unknown;
}

export interface ImageReference {
  url: string;
  /** Which character it shows, e.g. "Judgement, Human Paladin". */
  label: string;
}

export interface Scene {
  prompt: string;
  /** Character renders to send with the prompt, in the order the prompt numbers them. */
  references: ImageReference[];
  /** A one-line caption for the feed post, e.g. "The Deadmines with Judgement, Grim and Thorn". */
  caption: string;
  /** The characters in the picture, in prompt order. */
  characterIds: string[];
  /** The dungeon the picture is set in, if any. */
  dungeon: string | null;
}

/** More characters than this crowds the picture (and the image API's reference limit). */
export const MAX_SCENE_CHARACTERS = 8;
const MAX_LEVEL = 60;
/** Gear slots you can see on a character in a picture, most eye-catching first. */
const VISIBLE_SLOTS = ['Main Hand', 'Off Hand', 'Two-Hand', 'Ranged', 'Head', 'Shoulders', 'Chest', 'Back'];
const NOTABLE_QUALITIES = new Set(['RARE', 'EPIC', 'LEGENDARY', 'ARTIFACT']);

export const ART_STYLE =
  'World of Warcraft art style: the hand-painted, stylised look of Blizzard’s World of Warcraft key art and loading ' +
  'screens. Chunky heroic proportions, oversized shoulder armour and weapons, bold readable silhouettes, saturated ' +
  'colours, painterly textures and dramatic rim lighting.';

/** What each class looks like in a fight, so the picture shows them doing their job. */
const CLASS_ACTION: Record<string, string> = {
  warrior: 'charging in with a heavy weapon and shield, holding the enemy’s attention',
  paladin: 'smiting with a holy-light-infused weapon, golden radiance around them',
  hunter: 'loosing arrows or firing a gun from range, with their beast companion attacking at their side',
  rogue: 'striking from the shadows with daggers or swords',
  priest: 'channelling bright holy healing light, or dark shadow magic',
  shaman: 'calling down crackling lightning, with elemental totems planted nearby',
  mage: 'hurling a fireball or a blast of frost, arcane runes swirling',
  warlock: 'casting green fel fire and shadow bolts, with a summoned demon beside them',
  druid: 'wielding nature magic, or shapeshifted into a bear or cat',
};

type Item = { name?: unknown; quality?: unknown; slot?: unknown };

function items(value: unknown): Item[] {
  const raw = typeof value === 'string' ? JSON.parse(value) : value;
  return Array.isArray(raw) ? (raw as Item[]) : [];
}

function list(names: string[]): string {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

function quoted(names: string[]): string {
  return list(names.map((n) => `“${n}”`));
}

/** "Judgement, a female Human Paladin of the Alliance". */
function describe(c: SceneCharacter): string {
  const what = [c.gender?.toLowerCase(), c.race, c.class ?? 'adventurer'].filter(Boolean).join(' ');
  const level = c.level != null && c.level >= MAX_LEVEL ? 'max-level ' : '';
  const faction = c.faction ? ` of the ${c.faction}` : '';
  return `${c.name}, a ${level}${what}${faction}`;
}

/** The character's most visible notable gear, e.g. `“Arcanite Reaper” (two-hand)`. */
function visibleGear(c: SceneCharacter, limit = 3): string[] {
  return items(c.equipment)
    .filter((i) => typeof i.name === 'string' && NOTABLE_QUALITIES.has(String(i.quality)))
    .filter((i) => VISIBLE_SLOTS.includes(String(i.slot)))
    .sort((a, b) => VISIBLE_SLOTS.indexOf(String(a.slot)) - VISIBLE_SLOTS.indexOf(String(b.slot)))
    .slice(0, limit)
    .map((i) => `“${i.name}” (${String(i.slot).toLowerCase()})`);
}

function postCharacterIds(post: ScenePost): string[] {
  const party = Array.isArray(post.data.characters) ? (post.data.characters as { id?: unknown }[]) : [];
  const ids = party.map((p) => p.id).filter((id): id is string => typeof id === 'string');
  if (post.character) ids.push(post.character.id);
  return ids;
}

const isDungeonPost = (p: ScenePost) =>
  (p.kind === 'dungeon_run' || p.kind === 'dungeon_cleared') && typeof p.data.dungeon === 'string';

/**
 * Build the prompt for one picture of these posts (newest first, as the feed lists them). The newest dungeon post,
 * if there is one, sets the scene: an action shot of its party in that dungeon. Otherwise it's a group scene of
 * everyone in the posts. The other posts add details: new gear to show off, milestones to celebrate.
 */
export function buildScene(posts: ScenePost[], characters: SceneCharacter[], tavernName: string): Scene {
  const byId = new Map(characters.map((c) => [c.id, c]));
  const focus = posts.find(isDungeonPost) ?? null;

  // Who's in it: the focus party first, then everyone else in the posts, newest first.
  const order: string[] = [];
  for (const id of [...(focus ? postCharacterIds(focus) : []), ...posts.flatMap(postCharacterIds)]) {
    if (byId.has(id) && !order.includes(id)) order.push(id);
  }
  const cast = order.slice(0, MAX_SCENE_CHARACTERS).map((id) => byId.get(id)!);
  const inCast = (id: string | undefined) => !!id && cast.some((c) => c.id === id);

  // Reference images: the full-body render when there is one. Only https URLs (the mock data uses data: SVGs).
  const references: ImageReference[] = [];
  const refIndex = new Map<string, number>();
  for (const c of cast) {
    const url = [c.render_url, c.inset_url, c.avatar_url].find((u) => !!u && /^https:\/\//i.test(u));
    if (!url) continue;
    references.push({ url, label: `${c.name}, ${[c.race, c.class].filter(Boolean).join(' ')}`.trim() });
    refIndex.set(c.id, references.length);
  }

  const dungeon = focus ? (focus.data.dungeon as string) : null;
  const lines: string[] = [];
  lines.push(`A single epic illustration in the ${ART_STYLE}`);
  lines.push('');

  // The setting and the action.
  if (focus && dungeon) {
    const bosses = Array.isArray(focus.data.bosses) ? (focus.data.bosses as string[]).filter(Boolean) : [];
    const finalBoss = bosses[bosses.length - 1];
    lines.push(`Setting: inside the dungeon ${dungeonScene(dungeon)}.`);
    if (finalBoss && focus.data.cleared) {
      lines.push(
        `Action: a dynamic, cinematic action shot of the party in the climactic battle against ${finalBoss}, ` +
          'the final boss, mid-fight with spells and steel flying.',
      );
    } else if (finalBoss) {
      lines.push(`Action: a dynamic, cinematic action shot of the party battling ${finalBoss} mid-fight.`);
    } else {
      lines.push(
        `Action: a dynamic, cinematic action shot of the party fighting their way through the dungeon` +
          (focus.data.cleared ? ', on the verge of clearing it.' : '.'),
      );
    }
    if (bosses.length > 1) lines.push(`Defeated foes can be hinted at in the background: ${list(bosses.slice(0, -1))}.`);
  } else {
    lines.push(
      `Setting: the cosy, lantern-lit common room of ${tavernName ? `“${tavernName}”, ` : ''}a fantasy tavern ` +
        'in Azeroth, with a roaring hearth, wooden beams and tankards of ale.',
    );
    lines.push('Action: the adventurers gathered together, celebrating their latest deeds in a heroic group pose.');
  }
  lines.push('');

  // The cast.
  if (cast.length) {
    lines.push(`Characters (show each exactly once, ${cast.length === 1 ? 'alone' : 'together'} in the scene):`);
    cast.forEach((c, i) => {
      const ref = refIndex.get(c.id);
      const parts = [`${i + 1}. ${describe(c)}.`];
      if (ref) parts.push(`Match reference image ${ref}: same face, hair, armour and colours.`);
      else parts.push(`Give them armour and weapons typical of a ${c.class ?? 'adventurer'}.`);
      const gear = visibleGear(c);
      if (gear.length) parts.push(`Carries ${list(gear)}.`);
      const action = c.class ? CLASS_ACTION[c.class.toLowerCase()] : undefined;
      if (focus && action) parts.push(`Shown ${action}.`);
      lines.push(parts.join(' '));
    });
    lines.push('');
  }

  // Details from the other posts.
  const details: string[] = [];
  for (const p of posts) {
    const who = p.character && inCast(p.character.id) ? byId.get(p.character.id)!.name : null;
    if (p.kind === 'loot' && who) {
      const loot = items(p.data.items).filter((i) => typeof i.name === 'string').map((i) => String(i.name));
      if (loot.length) details.push(`${who} proudly shows off newly won ${quoted(loot.slice(0, 3))}, faintly glowing.`);
    } else if (p.kind === 'level_up' && who) {
      const to = Number(p.data.to);
      if (to >= MAX_LEVEL) details.push(`${who} has just reached max level: a golden, triumphant aura surrounds them.`);
      else if (Math.floor(Number(p.data.from) / 10) < Math.floor(to / 10)) {
        details.push(`${who} has just grown stronger: a subtle golden glow of power.`);
      }
    } else if (p.kind === 'achievement' && who) {
      const names = Array.isArray(p.data.achievements)
        ? (p.data.achievements as { name?: unknown }[]).map((a) => a.name).filter((n): n is string => !!n)
        : [];
      if (names.length) details.push(`${who} recently earned ${quoted(names.slice(0, 2))}; reflect it if it can be shown.`);
    } else if (p.kind === 'character_joined' && who && !focus) {
      details.push(`${who} has just arrived at the tavern and is being welcomed.`);
    } else if (isDungeonPost(p) && p !== focus) {
      details.push(`A trophy or banner from ${p.data.dungeon} can appear somewhere in the scene.`);
    }
  }
  const unique = [...new Set(details)].slice(0, 6);
  if (unique.length) {
    lines.push('Story details to weave in:');
    for (const d of unique) lines.push(`- ${d}`);
    lines.push('');
  }

  lines.push(
    'Composition: wide landscape shot, characters as the clear heroes in the foreground, dramatic lighting and depth. ' +
      'No text, captions, names, logos, user interface or watermarks anywhere in the image.',
  );

  const names = cast.map((c) => c.name);
  const caption = dungeon
    ? `${dungeon}${names.length ? ` with ${list(names)}` : ''}`
    : names.length
      ? `${list(names)} at the tavern`
      : 'A night at the tavern';

  return { prompt: lines.join('\n'), references, caption, characterIds: cast.map((c) => c.id), dungeon };
}
