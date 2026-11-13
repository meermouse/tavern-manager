import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RoleIcons, RolePicker } from './RoleIcons';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('RoleIcons', () => {
  it('renders nothing without roles', () => {
    const { container } = render(<RoleIcons roles={[]} />);
    expect(container.innerHTML).toBe('');
  });

  it('shows one labelled icon per role in canonical order, with a tooltip on hover', () => {
    vi.useFakeTimers();
    render(<RoleIcons roles={['damage', 'tank']} />);
    const icons = screen.getAllByRole('listitem');
    expect(icons.map((i) => i.getAttribute('aria-label'))).toEqual(['Tank', 'Damage']);

    fireEvent.pointerEnter(icons[0].parentElement!, { pointerType: 'mouse' });
    act(() => vi.runAllTimers());
    expect(screen.getByRole('tooltip').textContent).toMatch(/^Tank/);
  });
});

describe('RolePicker', () => {
  it('toggles roles on and off, allowing several at once', () => {
    const onChange = vi.fn();
    const { rerender } = render(<RolePicker roles={[]} onChange={onChange} />);
    expect(screen.getByRole('button', { name: 'Tank' }).getAttribute('aria-pressed')).toBe('false');

    fireEvent.click(screen.getByRole('button', { name: 'Damage' }));
    expect(onChange).toHaveBeenLastCalledWith(['damage']);

    rerender(<RolePicker roles={['damage']} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Tank' }));
    expect(onChange).toHaveBeenLastCalledWith(['tank', 'damage']);

    rerender(<RolePicker roles={['tank', 'damage']} onChange={onChange} />);
    expect(screen.getByRole('button', { name: 'Tank' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Tank' }));
    expect(onChange).toHaveBeenLastCalledWith(['damage']);
  });
});
