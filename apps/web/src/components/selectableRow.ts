import type { HTMLAttributes, KeyboardEvent } from 'react';

/**
 * Props that make a table row clickable (and keyboard-selectable) to show a character's details. Clicking the
 * selected row again deselects it. Returns nothing when the table isn't selectable.
 */
export function selectableRowProps<T extends { id: string; name: string; surname: string }>(
  character: T,
  selectedId: string | null | undefined,
  onSelect: ((character: T | null) => void) | undefined,
): HTMLAttributes<HTMLTableRowElement> {
  if (!onSelect) return {};
  const selected = character.id === selectedId;
  const select = () => onSelect(selected ? null : character);
  return {
    className: `selectable${selected ? ' selected' : ''}`,
    'aria-selected': selected,
    tabIndex: 0,
    title: `Show details for ${character.name} ${character.surname}`,
    onClick: select,
    onKeyDown: (e: KeyboardEvent<HTMLTableRowElement>) => {
      if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        select();
      }
    },
  };
}
