import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConfirmDialog } from './ConfirmDialog';

afterEach(cleanup);

describe('ConfirmDialog', () => {
  it('confirms or cancels', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <ConfirmDialog title="Delete this post?" confirmLabel="Delete post" danger onConfirm={onConfirm} onCancel={onCancel}>
        <p>Gone for good.</p>
      </ConfirmDialog>,
    );
    const dialog = screen.getByRole('dialog', { name: 'Delete this post?' });
    expect(dialog.textContent).toContain('Gone for good.');
    fireEvent.click(screen.getByRole('button', { name: 'Delete post' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(2);
  });

  it('locks its buttons while busy and shows errors', () => {
    const onCancel = vi.fn();
    render(<ConfirmDialog title="Sure?" busy error="Nope" onConfirm={vi.fn()} onCancel={onCancel} />);
    expect((screen.getByRole('button', { name: 'Cancel' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Working…' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onCancel).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toBe('Nope');
  });
});
