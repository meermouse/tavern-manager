import type { FeedItem } from '../api/client';
import { HoverCard } from './HoverCard';

function qualityLabel(q: string) {
  return q.charAt(0) + q.slice(1).toLowerCase();
}

/** A WoW-style item tooltip. Shows whatever details the API gave us; older items may only have the basics. */
export function ItemTooltip({ item }: { item: FeedItem }) {
  const [damage, speed, ...weaponRest] = item.weapon ?? [];
  return (
    <div className="item-tooltip">
      <div className={`tt-name quality q-${item.quality.toLowerCase()}`}>{item.name}</div>
      {item.itemLevel != null && <div className="tt-ilvl">Item Level {item.itemLevel}</div>}
      {item.binding && <div>{item.binding}</div>}
      {item.unique && <div>{item.unique}</div>}
      {(item.slot || item.itemType) && (
        <div className="tt-row">
          <span>{item.slot}</span>
          <span>{item.itemType}</span>
        </div>
      )}
      {damage && (
        <div className="tt-row">
          <span>{damage}</span>
          <span>{speed}</span>
        </div>
      )}
      {weaponRest.map((line) => <div key={line}>{line}</div>)}
      {item.armor && <div>{item.armor}</div>}
      {item.stats?.map((s) => <div key={s}>{s}</div>)}
      {item.enchantments?.map((e) => <div key={e} className="tt-green">{e}</div>)}
      {item.durability && <div>{item.durability}</div>}
      {item.requirement && <div>{item.requirement}</div>}
      {item.effects?.map((e) => <div key={e} className="tt-green">{e}</div>)}
      {item.set && <div className="tt-set">{item.set}</div>}
      {item.description && <div className="tt-flavour">“{item.description}”</div>}
      {!item.itemType && !item.stats && !item.armor && !item.weapon && (
        <div className="tt-muted">{qualityLabel(item.quality)}</div>
      )}
    </div>
  );
}

/** An item name in its quality colour, with the tooltip on hover or focus. */
export function ItemLink({ item, brackets = true }: { item: FeedItem; brackets?: boolean }) {
  return (
    <HoverCard content={() => <ItemTooltip item={item} />} className="item-link">
      <span className={`quality q-${item.quality.toLowerCase()}`}>{brackets ? `[${item.name}]` : item.name}</span>
    </HoverCard>
  );
}
