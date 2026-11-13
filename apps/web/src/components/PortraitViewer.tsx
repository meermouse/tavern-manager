import { useEffect, useRef, useState } from 'react';

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 4;

export function clampZoom(z: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));
}

/** Keep a zoomed image covering the stage: it may move at most half its overflow in each direction. */
export function clampPan(pan: { x: number; y: number }, zoom: number, stage: { width: number; height: number }) {
  const maxX = ((zoom - 1) * stage.width) / 2;
  const maxY = ((zoom - 1) * stage.height) / 2;
  return { x: Math.min(maxX, Math.max(-maxX, pan.x)), y: Math.min(maxY, Math.max(-maxY, pan.y)) };
}

/**
 * Full-screen view of a character render. Scroll, double-click or +/− to zoom; drag to pan; Esc or ✕ to close.
 */
export function PortraitViewer({
  src,
  alt,
  title,
  className = '',
  onClose,
}: {
  src: string;
  alt: string;
  title: string;
  className?: string;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const drag = useRef<{ id: number; x: number; y: number; pan: { x: number; y: number } } | null>(null);

  const stageSize = () => {
    const r = stageRef.current?.getBoundingClientRect();
    return { width: r?.width ?? 0, height: r?.height ?? 0 };
  };

  const zoomTo = (next: number) => {
    const z = clampZoom(next);
    setZoom(z);
    setPan((p) => clampPan(p, z, stageSize()));
  };

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (typeof dialog.showModal === 'function' && !dialog.open) dialog.showModal();
    else dialog.setAttribute('open', '');
    return () => {
      if (dialog.open && typeof dialog.close === 'function') dialog.close();
    };
  }, []);

  // React's onWheel is passive, so the page behind would scroll too; listen natively instead.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      setZoom((z) => {
        const next = clampZoom(z * (e.deltaY < 0 ? 1.15 : 1 / 1.15));
        setPan((p) => clampPan(p, next, stageSize()));
        return next;
      });
    };
    stage.addEventListener('wheel', onWheel, { passive: false });
    return () => stage.removeEventListener('wheel', onWheel);
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className={`portrait-viewer ${className}`.trim()}
      aria-label={title}
      // Esc fires `cancel` on a modal dialog.
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => e.target === dialogRef.current && onClose()}
      onKeyDown={(e) => {
        if (e.key === '+' || e.key === '=') zoomTo(zoom * 1.25);
        else if (e.key === '-' || e.key === '_') zoomTo(zoom / 1.25);
        else if (e.key === '0') zoomTo(1);
        else if (e.key === 'Escape') {
          // Don't let the character details pane behind us close too.
          e.preventDefault();
          e.stopPropagation();
          onClose();
        }
      }}
    >
      <div className="viewer-bar">
        <span className="viewer-title">{title}</span>
        <div className="viewer-controls">
          <button className="ghost small" onClick={() => zoomTo(zoom / 1.25)} disabled={zoom <= MIN_ZOOM} aria-label="Zoom out">
            −
          </button>
          <span className="viewer-zoom" aria-live="polite">{Math.round(zoom * 100)}%</span>
          <button className="ghost small" onClick={() => zoomTo(zoom * 1.25)} disabled={zoom >= MAX_ZOOM} aria-label="Zoom in">
            +
          </button>
          <button className="ghost small" onClick={() => zoomTo(1)} disabled={zoom === 1}>
            Reset
          </button>
          <button className="ghost small" onClick={onClose} aria-label="Close" autoFocus>
            ✕
          </button>
        </div>
      </div>
      <div
        ref={stageRef}
        className={`viewer-stage${zoom > 1 ? ' zoomed' : ''}${drag.current ? ' dragging' : ''}`}
        onDoubleClick={() => zoomTo(zoom > 1 ? 1 : 2.5)}
        onPointerDown={(e) => {
          if (zoom <= 1 || e.button !== 0) return;
          drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, pan };
          e.currentTarget.setPointerCapture?.(e.pointerId);
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d || d.id !== e.pointerId) return;
          setPan(clampPan({ x: d.pan.x + e.clientX - d.x, y: d.pan.y + e.clientY - d.y }, zoom, stageSize()));
        }}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
      >
        <img
          src={src}
          alt={alt}
          draggable={false}
          style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
        />
      </div>
      <p className="viewer-hint muted small-text">Scroll or double-click to zoom · drag to move · Esc to close</p>
    </dialog>
  );
}
