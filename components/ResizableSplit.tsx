"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Two panes side by side, resized like Windows snap layouts:
 * - drag the gutter between them → trade width,
 * - drag the corner grip of the left pane → width + row height together,
 * - drag the corner grip of the right pane → row height,
 * - double-click any handle → reset.
 * Each pane has a minimum width in px so its rows never wrap. Below xl the panes stack (no resizing).
 * Layout is remembered per browser under `storageKey`.
 */

const GUTTER = 12;
const XL = "(min-width: 1280px)";

interface Props {
  storageKey: string;
  /** Minimum width of [left, right] in px */
  minPx: [number, number];
  /** Initial share of the left pane, 0–1 */
  initial?: number;
  /** Row height control; omit for content-height rows (width-only resizing) */
  height?: { initial: number; min: number; max: number };
  left: (h: number | null) => ReactNode;
  right: (h: number | null) => ReactNode;
}

function Grip({ onPointerDown, onDoubleClick, cursor, title }: { onPointerDown: (e: React.PointerEvent) => void; onDoubleClick: () => void; cursor: string; title: string }) {
  return (
    <span
      role="separator"
      title={title}
      onPointerDown={onPointerDown}
      onDoubleClick={onDoubleClick}
      className="group absolute -bottom-1 -right-1 z-20 flex h-5 w-5 touch-none items-end justify-end p-1"
      style={{ cursor }}
    >
      <svg width="9" height="9" viewBox="0 0 9 9" className="text-zinc-600 transition-colors group-hover:text-red-400">
        <path d="M8 1L1 8M8 4.5L4.5 8M8 7.5L7.5 8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      </svg>
    </span>
  );
}

export default function ResizableSplit({ storageKey, minPx, initial = 0.5, height, left, right }: Props) {
  const rowRef = useRef<HTMLDivElement>(null);
  const [ratio, setRatio] = useState(initial);
  const [h, setH] = useState<number | null>(height?.initial ?? null);
  const [wide, setWide] = useState(false);
  const [dragging, setDragging] = useState(false);

  // Restore saved layout + track the xl breakpoint (both browser-only, so after mount).
  useEffect(() => {
    const mq = window.matchMedia(XL);
    const on = () => setWide(mq.matches);
    /* eslint-disable react-hooks/set-state-in-effect -- one-time sync with browser state */
    on();
    try {
      const v = JSON.parse(window.localStorage.getItem(storageKey) ?? "null") as { ratio?: number; h?: number } | null;
      if (v?.ratio) setRatio(v.ratio);
      if (v?.h && height) setH(v.h);
    } catch { /* ignore */ }
    /* eslint-enable react-hooks/set-state-in-effect */
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `height` is a fresh object each render; only its presence matters
  }, [storageKey, !!height]);

  useEffect(() => {
    try { window.localStorage.setItem(storageKey, JSON.stringify({ ratio, h })); } catch { /* ignore */ }
  }, [storageKey, ratio, h]);

  /** Clamp the ratio so both panes keep their minimum width at the current row width. */
  const [minL, minR] = minPx;
  /** Keep both panes at or above their minimum width for a row `w` px wide. */
  const clampRatio = useCallback(
    (r: number, w: number) => {
      if (!w) return r;
      const lo = (minL + GUTTER / 2) / w, hi = 1 - (minR + GUTTER / 2) / w;
      return lo > hi ? 0.5 : Math.min(hi, Math.max(lo, r));
    },
    [minL, minR]
  );
  const clampH = (v: number) => (height ? Math.min(height.max, Math.max(height.min, v)) : v);

  // Re-clamp when the window gets narrower.
  useEffect(() => {
    if (!wide) return;
    const el = rowRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setRatio((r) => clampRatio(r, el.clientWidth)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [wide, clampRatio]);

  const drag = (mode: "x" | "xy" | "y", e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const el = rowRef.current;
    if (!el) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const rect = el.getBoundingClientRect();
    const startY = e.clientY, startH = h ?? 0;
    setDragging(true);
    const move = (ev: PointerEvent) => {
      if (mode !== "y") setRatio(clampRatio((ev.clientX - rect.left) / rect.width, rect.width));
      if (mode !== "x" && height) setH(clampH(startH + ev.clientY - startY));
    };
    const up = () => {
      setDragging(false);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  const reset = () => { setRatio(clampRatio(initial, rowRef.current?.clientWidth ?? 0)); if (height) setH(height.initial); };

  if (!wide) {
    return (
      <div className="flex flex-col gap-4">
        <div className="min-w-0">{left(null)}</div>
        <div className="min-w-0">{right(null)}</div>
      </div>
    );
  }

  return (
    <div ref={rowRef} className={`flex items-stretch ${dragging ? "cursor-grabbing select-none" : ""}`} style={h != null ? { height: h } : undefined}>
      <div className="relative min-w-0 flex-none" style={{ width: `calc(${ratio * 100}% - ${GUTTER / 2}px)` }}>
        <div className="h-full min-w-0 overflow-hidden">{left(h)}</div>
        {height && <Grip onPointerDown={(e) => drag("xy", e)} onDoubleClick={reset} cursor="nwse-resize" title="Drag to resize · double-click to reset" />}
      </div>

      <div
        role="separator"
        aria-orientation="vertical"
        tabIndex={0}
        onPointerDown={(e) => drag("x", e)}
        onDoubleClick={reset}
        onKeyDown={(e) => {
          const w = rowRef.current?.clientWidth ?? 0;
          if (e.key === "ArrowLeft") setRatio((r) => clampRatio(r - 0.03, w));
          if (e.key === "ArrowRight") setRatio((r) => clampRatio(r + 0.03, w));
        }}
        title="Drag to resize · double-click to reset"
        className="group flex flex-none cursor-col-resize touch-none items-center justify-center outline-none"
        style={{ width: GUTTER }}
      >
        <span className={`h-full w-px transition-colors ${dragging ? "bg-red-500/60" : "bg-transparent group-hover:bg-red-500/40 group-focus-visible:bg-red-500/40"}`} />
      </div>

      <div className="relative min-w-0 flex-1">
        <div className="h-full min-w-0 overflow-hidden">{right(h)}</div>
        {height && <Grip onPointerDown={(e) => drag("y", e)} onDoubleClick={reset} cursor="ns-resize" title="Drag to change height · double-click to reset" />}
      </div>
    </div>
  );
}
