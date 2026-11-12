import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

const OPEN_DELAY_MS = 120;
const CLOSE_DELAY_MS = 100;
const GAP = 8;
const MARGIN = 8;

/** Where to put a card of `card` size next to `trigger`: below if it fits, else above; kept inside the viewport. */
export function placeCard(
  trigger: { top: number; bottom: number; left: number },
  card: { width: number; height: number },
  viewport: { width: number; height: number },
): { top: number; left: number } {
  const left = Math.max(MARGIN, Math.min(trigger.left, viewport.width - MARGIN - card.width));
  const below = trigger.bottom + GAP;
  const above = trigger.top - GAP - card.height;
  const fitsBelow = below + card.height <= viewport.height - MARGIN;
  const top = fitsBelow || above < MARGIN ? Math.max(MARGIN, Math.min(below, viewport.height - MARGIN - card.height)) : above;
  return { top, left };
}

/**
 * Shows `content` in a floating card while the pointer is over `children` or they have keyboard focus.
 * Touch input is ignored (there's no hover), so taps keep doing whatever they did before.
 */
export function HoverCard({
  content,
  children,
  className = '',
  focusable = true,
}: {
  /** Rendered lazily, only while open. */
  content: () => ReactNode;
  children: ReactNode;
  className?: string;
  /** Make the trigger a tab stop. Turn off when it's already inside something focusable. */
  focusable?: boolean;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLSpanElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const schedule = (next: boolean, delay: number) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setOpen(next), delay);
  };
  const cancel = () => clearTimeout(timer.current);

  useEffect(() => () => clearTimeout(timer.current), []);

  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    const trigger = triggerRef.current?.getBoundingClientRect();
    const card = cardRef.current?.getBoundingClientRect();
    if (!trigger || !card) return;
    setPos(placeCard(trigger, card, { width: window.innerWidth, height: window.innerHeight }));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <span
      ref={triggerRef}
      className={`hover-trigger ${className}`.trim()}
      tabIndex={focusable ? 0 : undefined}
      aria-describedby={open ? id : undefined}
      onPointerEnter={(e) => e.pointerType !== 'touch' && schedule(true, OPEN_DELAY_MS)}
      onPointerLeave={(e) => e.pointerType !== 'touch' && schedule(false, CLOSE_DELAY_MS)}
      onFocus={() => schedule(true, 0)}
      onBlur={() => schedule(false, 0)}
    >
      {children}
      {open &&
        createPortal(
          <div
            ref={cardRef}
            id={id}
            role="tooltip"
            className="hover-card"
            style={{ top: pos?.top ?? 0, left: pos?.left ?? 0, visibility: pos ? 'visible' : 'hidden' }}
            // Let people move onto the card (e.g. to read a long tooltip) without it vanishing.
            onPointerEnter={cancel}
            onPointerLeave={() => schedule(false, CLOSE_DELAY_MS)}
          >
            {content()}
          </div>,
          document.body,
        )}
    </span>
  );
}
