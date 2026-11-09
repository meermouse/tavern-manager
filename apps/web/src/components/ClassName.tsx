// Classic class colours (CSS custom properties defined in styles.css).
const KNOWN = ['warrior', 'paladin', 'hunter', 'rogue', 'priest', 'shaman', 'mage', 'warlock', 'druid'];

export function ClassName({ value }: { value: string | null }) {
  if (!value) return <span className="muted">—</span>;
  const key = value.toLowerCase().replace(/\s+/g, '');
  return <span className={KNOWN.includes(key) ? `class class-${key}` : 'class'}>{value}</span>;
}
