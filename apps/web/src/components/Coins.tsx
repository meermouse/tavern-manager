/** An amount of money, in copper, as WoW shows it: gold, silver and copper, each in its coin's colour. */
export function Coins({ copper }: { copper: number }) {
  const gold = Math.floor(copper / 10_000);
  const silver = Math.floor((copper % 10_000) / 100);
  const rest = Math.round(copper % 100);
  // The two largest coins are plenty: nobody cares about the copper on a 40g item.
  const parts: [number, 'g' | 's' | 'c'][] = gold
    ? [[gold, 'g'], [silver, 's']]
    : silver
      ? [[silver, 's'], [rest, 'c']]
      : [[rest, 'c']];
  return (
    <span className="coins">
      {parts.map(([n, unit], i) => (
        <span key={unit} className={`coin coin-${unit}`}>
          {i > 0 && ' '}
          {unit === 'g' ? n.toLocaleString() : n}
          {unit}
        </span>
      ))}
    </span>
  );
}
