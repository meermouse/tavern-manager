import type { ReactNode } from 'react';
import type { Role } from '../api/client';
import { HoverCard } from './HoverCard';

export const ROLES: Role[] = ['tank', 'healer', 'damage'];

export const ROLE_LABELS: Record<Role, string> = { tank: 'Tank', healer: 'Healer', damage: 'Damage' };

const ROLE_HINTS: Record<Role, string> = {
  tank: 'Takes hits and holds threat',
  healer: 'Keeps the party alive',
  damage: 'Deals the damage',
};

// 16×16 glyphs drawn with currentColor so each role can be tinted from CSS.
const GLYPHS: Record<Role, ReactNode> = {
  tank: <path d="M8 1 2.5 3v4.2c0 3.4 2.3 6.4 5.5 7.8 3.2-1.4 5.5-4.4 5.5-7.8V3L8 1Z" />,
  healer: <path d="M6.2 1.5h3.6v4.7h4.7v3.6H9.8v4.7H6.2V9.8H1.5V6.2h4.7V1.5Z" />,
  // Blade, crossguard, then grip, angled bottom-left to top-right.
  damage: <path d="M14.5 1.5V4L7.2 11.3 4.7 8.8 12 1.5h2.5ZM2.6 8.4l5 5-1.1 1.1-5-5 1.1-1.1ZM4.5 10.5l1 1-3 3-1-1 3-3Z" />,
};

export function RoleGlyph({ role }: { role: Role }) {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden="true" focusable="false">
      {GLYPHS[role]}
    </svg>
  );
}

function RoleTooltip({ role, extra }: { role: Role; extra?: string }) {
  return (
    <div className="role-tooltip">
      <strong className={`role-${role}`}>{ROLE_LABELS[role]}</strong>
      <div className="tt-muted">{extra ?? ROLE_HINTS[role]}</div>
    </div>
  );
}

/** A character's roles as icons, each with a tooltip. Renders nothing when no roles are set. */
export function RoleIcons({ roles }: { roles: Role[] | null | undefined }) {
  if (!roles?.length) return null;
  return (
    <span className="role-icons" role="list" aria-label="Roles">
      {ROLES.filter((r) => roles.includes(r)).map((r) => (
        <HoverCard key={r} focusable={false} content={() => <RoleTooltip role={r} />}>
          <span role="listitem" className={`role-icon role-${r}`} aria-label={ROLE_LABELS[r]}>
            <RoleGlyph role={r} />
          </span>
        </HoverCard>
      ))}
    </span>
  );
}

/** Toggle buttons for the owner to pick any combination of roles. */
export function RolePicker({
  roles,
  onChange,
  disabled,
}: {
  roles: Role[];
  onChange: (roles: Role[]) => void;
  disabled?: boolean;
}) {
  return (
    <span className="role-picker" role="group" aria-label="Roles">
      {ROLES.map((r) => {
        const on = roles.includes(r);
        return (
          <HoverCard
            key={r}
            focusable={false}
            content={() => <RoleTooltip role={r} extra={on ? 'Click to remove' : 'Click to assign'} />}
          >
            <button
              type="button"
              className={`role-toggle role-${r}${on ? ' active' : ''}`}
              aria-pressed={on}
              aria-label={ROLE_LABELS[r]}
              disabled={disabled}
              onClick={() => onChange(on ? roles.filter((x) => x !== r) : ROLES.filter((x) => x === r || roles.includes(x)))}
            >
              <RoleGlyph role={r} />
            </button>
          </HoverCard>
        );
      })}
    </span>
  );
}
