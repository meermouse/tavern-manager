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
 * Touch input is ignored (there's no hover), so taps keep doing whatever they did before, unless `openOnClick` is set:
 * then a click or tap toggles the card, and it stays open until a click outside it, Escape, or another click.
 */
export function HoverCard({
  content,
  children,
  className = '',
  focusable = true,
  openOnClick = false,
}: {
  /** Rendered lazily, only while open. `close` shuts the card, e.g. after a button on it is used. */
  content: (close: () => void) => ReactNode;
  children: ReactNode;
  className?: string;
  /** Make the trigger a tab stop. Turn off when it's already inside something focusable. */
  focusable?: boolean;
  /** Let a click or tap open the card and keep it open, e.g. so touch users can reach links on it. */
  openOnClick?: boolean;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  // Opened by a click: stays open when the pointer or focus leaves, until a click outside or Escape.
  const [pinned, setPinned] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLSpanElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const schedule = (next: boolean, delay: number) => {
    clearTimeout(timer.current);
    if (!next && pinned) return;
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
    const close = () => {
      setOpen(false);
      setPinned(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (!triggerRef.current?.contains(target) && !cardRef.current?.contains(target)) close();
    };
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    window.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [open]);

  const closeCard = () => {
    clearTimeout(timer.current);
    setOpen(false);
    setPinned(false);
  };

  const toggle = () => {
    clearTimeout(timer.current);
    const next = !pinned;
    setPinned(next);
    setOpen(next);
  };

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
      onClick={openOnClick ? (e) => {
        // Clicks on links inside the card bubble here through the portal; leave those alone.
        if (cardRef.current?.contains(e.target as Node)) return;
        toggle();
      } : undefined}
      onKeyDown={openOnClick ? (e) => {
        if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          toggle();
        }
      } : undefined}
      role={openOnClick ? 'button' : undefined}
      aria-expanded={openOnClick ? open : undefined}
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
            {content(closeCard)}
          </div>,
          document.body,
        )}
    </span>
  );
}
