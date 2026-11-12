import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { clampPan, clampZoom, PortraitViewer } from './PortraitViewer';

afterEach(cleanup);

describe('clamping', () => {
  it('keeps zoom between 1x and 4x', () => {
    expect(clampZoom(0.5)).toBe(1);
    expect(clampZoom(2)).toBe(2);
    expect(clampZoom(9)).toBe(4);
  });

  it('keeps a zoomed image covering the stage', () => {
    const stage = { width: 400, height: 600 };
    expect(clampPan({ x: 500, y: -500 }, 2, stage)).toEqual({ x: 200, y: -300 });
    expect(clampPan({ x: 50, y: 50 }, 1, stage)).toEqual({ x: 0, y: 0 });
  });
});

function open(onClose = vi.fn()) {
  render(<PortraitViewer src="/judy.png" alt="Judgement Judy, Human Paladin" title="Judgement Judy" onClose={onClose} />);
  return onClose;
}

describe('PortraitViewer', () => {
  it('shows the render with a title and zooms with the buttons and keys', () => {
    open();
    expect(screen.getByRole('img', { name: 'Judgement Judy, Human Paladin' })).toBeTruthy();
    expect(screen.getByText('100%')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Zoom out' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
    expect(screen.getByText('125%')).toBeTruthy();
    fireEvent.keyDown(screen.getByRole('button', { name: 'Close' }), { key: '+' });
    expect(screen.getByText('156%')).toBeTruthy();
    fireEvent.keyDown(screen.getByRole('button', { name: 'Close' }), { key: '0' });
    expect(screen.getByText('100%')).toBeTruthy();
  });

  it('double-click toggles zoom', () => {
    open();
    const img = screen.getByRole('img');
    fireEvent.doubleClick(img);
    expect(screen.getByText('250%')).toBeTruthy();
    expect(img.style.transform).toContain('scale(2.5)');
    fireEvent.doubleClick(img);
    expect(screen.getByText('100%')).toBeTruthy();
  });

  it('closes on ✕ and on Escape without closing what is behind it', () => {
    const behind = vi.fn((e: KeyboardEvent) => e.key === 'Escape' && !e.defaultPrevented);
    window.addEventListener('keydown', behind);
    const onClose = open();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(screen.getByRole('button', { name: 'Close' }), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(behind.mock.results.every((r) => r.value === false)).toBe(true);
    window.removeEventListener('keydown', behind);
  });
});
