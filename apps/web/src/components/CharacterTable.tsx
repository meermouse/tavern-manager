import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnFiltersState,
  type FilterFn,
  type SortingState,
} from '@tanstack/react-table';
import { useMemo, useState } from 'react';
import type { Role, TavernCharacter } from '../api/client';
import { CharacterAvatar } from './CharacterAvatar';
import { CharacterLink } from './CharacterLink';
import { CharacterLevel } from './CharacterLevel';
import { ClassName } from './ClassName';
import { TitleBadges } from './TitleBadges';
import { ROLES, ROLE_LABELS, RoleIcons } from './RoleIcons';
import { factionOf } from '../faction';
import { ProfessionSlots, bestProfessionSkill } from './ProfessionIcons';

const col = createColumnHelper<TavernCharacter>();

const equalsFilter: FilterFn<TavernCharacter> = (row, columnId, value) =>
  !value || row.getValue(columnId) === value;

const levelRangeFilter: FilterFn<TavernCharacter> = (row, columnId, value: [number | null, number | null]) => {
  const [min, max] = value ?? [null, null];
  const level = row.getValue<number | null>(columnId);
  if (min == null && max == null) return true;
  if (level == null) return false;
  return (min == null || level >= min) && (max == null || level <= max);
};

const globalFilter: FilterFn<TavernCharacter> = (row, _columnId, value: string) => {
  const q = value.trim().toLowerCase();
  if (!q) return true;
  const c = row.original;
  const roles = (c.roles ?? []).map((r) => ROLE_LABELS[r]);
  const professions = (c.professions ?? []).map((p) => p.name);
  return [c.name, c.surname, `${c.name} ${c.surname}`, c.ownerName, c.class, c.race, c.ruleset, factionOf(c), ...roles, ...professions]
    .some((v) => v?.toLowerCase().includes(q));
};

const professionFilter: FilterFn<TavernCharacter> = (row, _columnId, value: string | undefined) =>
  !value || (row.original.professions ?? []).some((p) => p.name === value);

const roleFilter: FilterFn<TavernCharacter> = (row, _columnId, value: Role | undefined) =>
  !value || (row.original.roles ?? []).includes(value);

function uniqueSorted(values: (string | null)[]): string[] {
  return [...new Set(values.filter((v): v is string => !!v))].sort();
}

export function CharacterTable({
  characters,
  selectedId,
  onSelect,
}: {
  characters: TavernCharacter[];
  selectedId?: string | null;
  /** Called with the clicked character, or `null` when the selected row is clicked again. */
  onSelect?: (character: TavernCharacter | null) => void;
}) {
  const [sorting, setSorting] = useState<SortingState>([{ id: 'level', desc: true }]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [search, setSearch] = useState('');
  const selectable = !!onSelect;

  const columns = useMemo(
    () => [
      col.accessor((c) => `${c.name} ${c.surname}`, {
        id: 'name',
        header: 'Character',
        cell: (info) => (
          // Selectable rows are already a tab stop, so the name needn't be one too.
          <span className="char-name-cell">
            <CharacterLink character={info.row.original} focusable={!selectable}>
              <span className="char-cell">
                <CharacterAvatar character={info.row.original} size="xs" />
                <strong>{info.getValue()}</strong>
              </span>
            </CharacterLink>
            <TitleBadges titles={info.row.original.titles} />
          </span>
        ),
      }),
      col.accessor('ruleset', {
        header: 'Ruleset',
        filterFn: equalsFilter,
        cell: (info) => info.getValue() ?? <span className="muted">—</span>,
      }),
      col.accessor('ownerName', { header: 'IRL name' }),
      col.accessor('class', {
        header: 'Class',
        filterFn: equalsFilter,
        cell: (info) => <ClassName value={info.getValue()} />,
      }),
      col.accessor('race', {
        header: 'Race',
        filterFn: equalsFilter,
        cell: (info) => info.getValue() ?? <span className="muted">—</span>,
      }),
      col.accessor((c) => factionOf(c), {
        id: 'faction',
        header: 'Faction',
        sortUndefined: 'last',
        cell: (info) => {
          const f = info.getValue();
          return f ? <span className={`faction ${f.toLowerCase()}`}>{f}</span> : <span className="muted">—</span>;
        },
      }),
      // Sorts tanks, then healers, then damage; characters without roles go last.
      col.accessor((c) => (c.roles?.length ? Math.min(...c.roles.map((r) => ROLES.indexOf(r))) : undefined), {
        id: 'roles',
        header: 'Roles',
        filterFn: roleFilter,
        sortUndefined: 'last',
        cell: (info) => <RoleIcons roles={info.row.original.roles} />,
      }),
      // Sorts by the higher of the two primary profession skills; characters without professions go last.
      col.accessor((c) => bestProfessionSkill(c.professions), {
        id: 'professions',
        header: 'Professions',
        filterFn: professionFilter,
        sortUndefined: 'last',
        sortDescFirst: true,
        cell: (info) => <ProfessionSlots professions={info.row.original.professions} />,
      }),
      col.accessor('level', {
        header: 'Level',
        filterFn: levelRangeFilter,
        sortUndefined: 'last',
        cell: (info) => <CharacterLevel character={info.row.original} />,
      }),
    ],
    [selectable],
  );

  const table = useReactTable({
    data: characters,
    columns,
    state: { sorting, columnFilters, globalFilter: search },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setSearch,
    globalFilterFn: globalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  const filterValue = (id: string) => (columnFilters.find((f) => f.id === id)?.value as string) ?? '';
  const setFilter = (id: string, value: unknown) => table.getColumn(id)?.setFilterValue(value || undefined);
  const levelRange = (columnFilters.find((f) => f.id === 'level')?.value as [number | null, number | null]) ?? [null, null];
  const setLevel = (index: 0 | 1, raw: string) => {
    const next: [number | null, number | null] = [...levelRange];
    next[index] = raw === '' ? null : Number(raw);
    setFilter('level', next[0] == null && next[1] == null ? undefined : next);
  };

  const options = {
    ruleset: uniqueSorted(characters.map((c) => c.ruleset)),
    class: uniqueSorted(characters.map((c) => c.class)),
    race: uniqueSorted(characters.map((c) => c.race)),
    profession: uniqueSorted(characters.flatMap((c) => (c.professions ?? []).map((p) => p.name))),
  };
  const hasFilters = search !== '' || columnFilters.length > 0;
  const rows = table.getRowModel().rows;

  return (
    <div className="character-table">
      <div className="filters">
        <input
          type="search"
          placeholder="Search name, player, class, profession…"
          aria-label="Search characters"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {(['class', 'race', 'ruleset'] as const).map((id) => (
          <select key={id} aria-label={`Filter by ${id}`} value={filterValue(id)} onChange={(e) => setFilter(id, e.target.value)}>
            <option value="">Any {id}</option>
            {options[id].map((o) => (
              <option key={o} value={o}>{o}</option>
            ))}
          </select>
        ))}
        <select aria-label="Filter by role" value={filterValue('roles')} onChange={(e) => setFilter('roles', e.target.value)}>
          <option value="">Any role</option>
          {ROLES.map((r) => (
            <option key={r} value={r}>{ROLE_LABELS[r]}</option>
          ))}
        </select>
        {options.profession.length > 0 && (
          <select aria-label="Filter by profession" value={filterValue('professions')} onChange={(e) => setFilter('professions', e.target.value)}>
            <option value="">Any profession</option>
            {options.profession.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        )}
        <span className="level-range">
          <label>
            Level
            <input type="number" min={1} max={60} placeholder="min" aria-label="Minimum level"
              value={levelRange[0] ?? ''} onChange={(e) => setLevel(0, e.target.value)} />
          </label>
          –
          <input type="number" min={1} max={60} placeholder="max" aria-label="Maximum level"
            value={levelRange[1] ?? ''} onChange={(e) => setLevel(1, e.target.value)} />
        </span>
        {hasFilters && (
          <button className="ghost small" onClick={() => { setSearch(''); setColumnFilters([]); }}>
            Clear
          </button>
        )}
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((header) => {
                  const sorted = header.column.getIsSorted();
                  return (
                    <th key={header.id} aria-sort={sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : 'none'}>
                      <button className="sort" onClick={header.column.getToggleSortingHandler()}>
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        <span className="sort-icon">{sorted === 'asc' ? '▲' : sorted === 'desc' ? '▼' : ''}</span>
                      </button>
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {rows.map((row) => {
              const selected = row.original.id === selectedId;
              const select = () => onSelect?.(selected ? null : row.original);
              return (
              <tr
                key={row.id}
                className={onSelect ? `selectable${selected ? ' selected' : ''}` : undefined}
                aria-selected={onSelect ? selected : undefined}
                tabIndex={onSelect ? 0 : undefined}
                title={onSelect ? `Show details for ${row.original.name} ${row.original.surname}` : undefined}
                onClick={onSelect ? select : undefined}
                onKeyDown={
                  onSelect
                    ? (e) => {
                        if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
                          e.preventDefault();
                          select();
                        }
                      }
                    : undefined
                }
              >
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} data-label={String(cell.column.columnDef.header)}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="muted center">
                  {characters.length === 0 ? 'No characters in this tavern yet.' : 'No characters match those filters.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="muted small-text">
        Showing {rows.length} of {characters.length} characters
      </p>
    </div>
  );
}
