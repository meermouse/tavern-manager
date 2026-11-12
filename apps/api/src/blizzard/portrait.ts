import type { CharacterMedia } from './client.js';

// Stand-in character renders for local development (mock Blizzard client), drawn as small SVGs.
// Real renders come from render.worldofwarcraft.com via the `/character-media` endpoint.

const CLASS_COLOURS: Record<string, string> = {
  warrior: '#c69b6d',
  paladin: '#f48cba',
  hunter: '#aad372',
  rogue: '#fff468',
  priest: '#ffffff',
  shaman: '#2c8ee8',
  mage: '#3fc7eb',
  warlock: '#a28be0',
  druid: '#ff7c0a',
};

const SKIN: Record<string, string> = {
  human: '#e8b99a',
  dwarf: '#d9a07e',
  'night elf': '#9a86c9',
  gnome: '#f0c6a8',
  orc: '#6f9a4a',
  undead: '#9aa79a',
  tauren: '#8a6243',
  troll: '#5f97a8',
};

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
}

/** Head, ears/horns and shoulders, centred on x=50 in a 100-wide box. `y` is the top of the head. */
function bust(race: string, skin: string, colour: string, y: number): string {
  const ears =
    race === 'night elf' || race === 'troll'
      ? `<path d="M34 ${y + 18} L16 ${y + 6} L35 ${y + 26} Z M66 ${y + 18} L84 ${y + 6} L65 ${y + 26} Z" fill="${skin}"/>`
      : '';
  const horns =
    race === 'tauren'
      ? `<path d="M33 ${y + 8} Q18 ${y + 4} 20 ${y - 10} Q26 ${y + 2} 38 ${y + 4} Z M67 ${y + 8} Q82 ${y + 4} 80 ${y - 10} Q74 ${y + 2} 62 ${y + 4} Z" fill="#efe3c8"/>`
      : '';
  const beard =
    race === 'dwarf'
      ? `<path d="M37 ${y + 24} Q50 ${y + 52} 63 ${y + 24} Q50 ${y + 32} 37 ${y + 24} Z" fill="#7a4a22"/>`
      : '';
  return `
    ${horns}${ears}
    <path d="M14 ${y + 78} Q16 ${y + 44} 50 ${y + 40} Q84 ${y + 44} 86 ${y + 78} Z" fill="${colour}" stroke="#1a120a" stroke-width="2"/>
    <path d="M40 ${y + 42} L50 ${y + 60} L60 ${y + 42}" fill="none" stroke="#1a120a" stroke-width="2" opacity="0.5"/>
    <ellipse cx="50" cy="${y + 20}" rx="16" ry="19" fill="${skin}" stroke="#1a120a" stroke-width="2"/>
    <circle cx="44" cy="${y + 19}" r="2" fill="#1a120a"/><circle cx="56" cy="${y + 19}" r="2" fill="#1a120a"/>
    ${beard}`;
}

function svgUrl(svg: string): string {
  return `data:image/svg+xml,${encodeURIComponent(svg.replace(/\s+/g, ' ').trim())}`;
}

export function mockPortraits(name: string, characterClass: string, race: string): CharacterMedia {
  const colour = CLASS_COLOURS[characterClass.toLowerCase()] ?? '#e0a43c';
  const r = race.toLowerCase();
  const skin = SKIN[r] ?? '#e8b99a';
  const initial = esc(name.charAt(0).toUpperCase());
  const glow = `<radialGradient id="g" cx="50%" cy="40%" r="65%"><stop offset="0" stop-color="${colour}" stop-opacity="0.55"/><stop offset="1" stop-color="#17110c" stop-opacity="0"/></radialGradient>`;

  const avatar = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs>${glow}</defs>
    <rect width="100" height="100" fill="#221911"/><rect width="100" height="100" fill="url(#g)"/>
    ${bust(r, skin, colour, 22)}</svg>`;

  const inset = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 230 116"><defs>${glow}</defs>
    <rect width="230" height="116" fill="#221911"/><rect width="230" height="116" fill="url(#g)"/>
    <g transform="translate(65 8) scale(1.1)">${bust(r, skin, colour, 14)}</g></svg>`;

  // Short races stand a little lower in the frame.
  const short = r === 'gnome' || r === 'dwarf';
  const s = short ? 0.82 : 1;
  const mainRaw = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 400"><defs>${glow}</defs>
    <ellipse cx="150" cy="380" rx="90" ry="12" fill="#000" opacity="0.35"/>
    <g transform="translate(${150 - 150 * s} ${400 - 400 * s}) scale(${s})">
      <ellipse cx="150" cy="170" rx="140" ry="170" fill="url(#g)"/>
      <path d="M112 250 L104 372 L136 372 L146 262 L154 262 L164 372 L196 372 L188 250 Z" fill="#3a2a1a" stroke="#1a120a" stroke-width="3"/>
      <path d="M86 150 Q70 210 80 262 L98 260 L104 168 Z M214 150 Q230 210 220 262 L202 260 L196 168 Z" fill="${colour}" stroke="#1a120a" stroke-width="3"/>
      <path d="M96 140 Q150 118 204 140 L196 266 Q150 280 104 266 Z" fill="${colour}" stroke="#1a120a" stroke-width="3"/>
      <path d="M128 168 L172 168 L172 222 L150 240 L128 222 Z" fill="#1a120a" opacity="0.75"/>
      <text x="150" y="214" font-family="Georgia, serif" font-size="34" font-weight="700" text-anchor="middle" fill="${colour}">${initial}</text>
      <g transform="translate(70 62) scale(1.6)">${bust(r, skin, colour, 10).replace(/<path d="M14[^>]*\/>/, '')}</g>
    </g></svg>`;

  return { avatar: svgUrl(avatar), inset: svgUrl(inset), main: null, mainRaw: svgUrl(mainRaw) };
}
