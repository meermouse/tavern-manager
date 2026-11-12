// Classic class colours (CSS custom properties defined in styles.css).
const KNOWN = ['warrior', 'paladin', 'hunter', 'rogue', 'priest', 'shaman', 'mage', 'warlock', 'druid'];

/** `Night Elf`-style class name → CSS key (`warrior`), or `null` for unknown classes. */
export function classKey(value: string | null | undefined): string | null {
  const key = value?.toLowerCase().replace(/\s+/g, '') ?? '';
  return KNOWN.includes(key) ? key : null;
}

export function ClassName({ value }: { value: string | null }) {
  if (!value) return <span className="muted">—</span>;
  const key = classKey(value);
  return <span className={key ? `class class-${key}` : 'class'}>{value}</span>;
}
