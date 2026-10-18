"use client";

/* Ctrl (⌘ on Mac) + left-drag measurement — the interaction behind the Financials "Quant Ruler",
   shared by every chart (quarterly bars, the terminal price chart …).
   The hook only tracks WHICH data points are measured (`T` = a bar index, a timestamp …);
   each chart turns them into pixels and computes Δ / % from its own underlying data.

     const m = useCtrlMeasure((e) => indexAt(e.clientX));
     <div {...m.handlers} style={{ pointerEvents: m.armed || m.span?.live ? "auto" : "none" }}> …
*/

import { useEffect, useState } from "react";
import type React from "react";

export interface MeasureSpan<T> { a: T; b: T; live: boolean }

export function useCtrlMeasure<T>(locate: (e: React.PointerEvent) => T | null) {
  const [span, setSpan] = useState<MeasureSpan<T> | null>(null);
  /** Ctrl / ⌘ currently held — lets an overlay capture the drag before the chart pans */
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    const on = (e: KeyboardEvent) => setArmed(e.ctrlKey || e.metaKey);
    const off = () => setArmed(false);
    window.addEventListener("keydown", on);
    window.addEventListener("keyup", on);
    window.addEventListener("blur", off);
    return () => { window.removeEventListener("keydown", on); window.removeEventListener("keyup", on); window.removeEventListener("blur", off); };
  }, []);

  const onPointerDown = (e: React.PointerEvent) => {
    if (!(e.ctrlKey || e.metaKey) || e.button !== 0) { if (span && !span.live) setSpan(null); return; }
    const p = locate(e);
    if (p == null) return;
    e.preventDefault();
    e.stopPropagation();
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* pointer already gone — drag still works while inside */ }
    setSpan({ a: p, b: p, live: true });
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!span?.live) return;
    const p = locate(e);
    if (p != null) setSpan({ ...span, b: p });
  };
  const onPointerUp = () => { if (span?.live) setSpan({ ...span, live: false }); };
  // a Ctrl-click must not also trigger the element under the pointer (e.g. select a bar)
  const onClickCapture = (e: React.MouseEvent) => { if (e.ctrlKey || e.metaKey) { e.stopPropagation(); e.preventDefault(); } };

  return { span, armed, clear: () => setSpan(null), handlers: { onPointerDown, onPointerMove, onPointerUp, onClickCapture } };
}
