"use client";

/* ─────────────────────────────────────────────────────────────
   INFERNO CHART — one chart for the whole terminal (portfolio deep view, ETF deep view, scanner cockpit).
   · Vertical timeframe rail on the left (1Y → 1D). Picking a stop zooms the chart to that window;
     scrolling / zooming the chart moves the rail thumb to the matching position (e.g. two months
     sits between 1M and 3M). Daily history is loaded for 2 years, so scrolling back shows real
     earlier months instead of an empty gap; both edges are pinned (no holes left or right).
   · % scale = change from the first visible bar, for every line (re-bases as you scroll).
   · LINE / BARS for the main series.
   · Legend: main line, pinned comparisons (S&P 500, top-5 holdings) — click to grey out / bring back;
     [ + ] opens a picker (all holdings + search for any ETF / ticker); added lines are removed with one click.
   Prices: /api/prices (Yahoo). Falls back to labelled model data.
   ───────────────────────────────────────────────────────────── */

import {
  BarSeries, ColorType, CrosshairMode, LineSeries, LineStyle, PriceScaleMode, createChart,
  type IChartApi, type ISeriesApi, type SeriesType, type Time, type UTCTimestamp,
} from "lightweight-charts";
import { useEffect, useMemo, useRef, useState } from "react";
import { ETFS } from "@/lib/etfs";

export type ChartTf = "1Y" | "YTD" | "3M" | "1M" | "1W" | "1D";
export const CHART_TFS: ChartTf[] = ["1Y", "YTD", "3M", "1M", "1W", "1D"];

type Raw = { t: number[]; c: number[]; o?: number[]; h?: number[]; l?: number[] };
export interface LineDef { id: string; label: string; sym: string; color: string; dashed?: boolean }
export interface MainDef {
  id: string; label: string; color: string;
  /** a single instrument … */
  sym?: string;
  /** … or a weighted basket (portfolio) built from these instruments */
  basket?: { sym: string; weight: number }[];
}

const MONO = "font-mono";
const DAY = 86400;
const EXTRA_COLORS = ["#f472b6", "#22d3ee", "#facc15", "#a78bfa", "#fb923c", "#4ade80", "#38bdf8", "#e879f9"];
const rangeOf = (tf: ChartTf) => (tf === "1D" ? "1d" : tf === "1W" ? "5d" : "2y");
const ytdDays = () => { const n = new Date(); return Math.max(1, (n.getTime() - Date.UTC(n.getUTCFullYear(), 0, 1)) / 864e5); };
const spanOf = (tf: ChartTf) => ({ "1Y": 365, YTD: ytdDays(), "3M": 91, "1M": 30, "1W": 7, "1D": 1 })[tf];
const sgn = (v: number) => (v >= 0 ? "+" : "−") + Math.abs(v).toFixed(2) + "%";

/** Rail position (0 = 1Y … 5 = 1D, fractional) for a visible span in days — log-interpolated between stops. */
function posOf(spanDays: number): number {
  const s = CHART_TFS.map(spanOf);
  if (spanDays >= s[0]) return 0;
  for (let i = 0; i < s.length - 1; i++) {
    const a = s[i], b = s[i + 1];
    if (spanDays <= a && spanDays >= b && a !== b) return i + Math.log(a / spanDays) / Math.log(a / b);
  }
  return s.length - 1;
}

/** Deterministic stand-in when Yahoo is unreachable */
function model(sym: string, range: string): Raw {
  const step = range === "1d" ? 300 : range === "5d" ? 1800 : DAY;
  const n = range === "1d" ? 78 : range === "5d" ? 65 : 504;
  let h = 0;
  for (const ch of sym + range) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const rnd = () => ((h = (h * 1664525 + 1013904223) >>> 0) / 4294967296);
  const end = Math.floor(Date.now() / 1000 / step) * step;
  let p = 100;
  const t: number[] = [], c: number[] = [];
  for (let i = 0; i < n; i++) { t.push(end - (n - 1 - i) * step); p *= 1 + (rnd() - 0.48) * (step === DAY ? 0.018 : 0.003); c.push(p); }
  return { t, c };
}

/** value of s at time t (last close at or before t; first close before the series starts) */
function at(s: Raw, t: number) {
  if (t <= s.t[0]) return s.c[0];
  let lo = 0, hi = s.t.length - 1;
  while (lo < hi) { const m = (lo + hi + 1) >> 1; if (s.t[m] <= t) lo = m; else hi = m - 1; }
  return s.c[lo];
}

function basketSeries(parts: { s: Raw; w: number }[]): Raw | null {
  const ok = parts.filter((p) => p.s && p.s.c.length > 1);
  if (!ok.length) return null;
  const grid = ok.reduce((a, p) => (p.s.t.length > a.length ? p.s.t : a), [] as number[]);
  const W = ok.reduce((a, p) => a + p.w, 0) || 1;
  return { t: grid, c: grid.map((t) => 100 * ok.reduce((a, p) => a + (p.w / W) * (at(p.s, t) / at(p.s, grid[0])), 0)) };
}

/** Timeframe rail (under the chart, bottom-left): a wide rounded rectangle split into cells; the light-blue glowing
 *  block slides along it — snapped on a pick, fractional while you scroll/zoom (`pos`). */
export function TfRail({ value, pos, onChange }: { value: ChartTf; pos?: number; onChange: (t: ChartTf) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const n = CHART_TFS.length;
  const idx = CHART_TFS.indexOf(value);
  const p = Math.min(n - 1, Math.max(0, pos ?? idx));
  const pick = (x: number) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    onChange(CHART_TFS[Math.min(n - 1, Math.max(0, Math.floor(((x - r.left) / r.width) * n)))]);
  };
  return (
    <div ref={ref} role="slider" tabIndex={0} aria-label="Timeframe" aria-orientation="horizontal" aria-valuemin={0} aria-valuemax={n - 1} aria-valuenow={idx} aria-valuetext={value}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight" || e.key === "ArrowDown") { e.preventDefault(); onChange(CHART_TFS[Math.min(n - 1, idx + 1)]); }
        if (e.key === "ArrowLeft" || e.key === "ArrowUp") { e.preventDefault(); onChange(CHART_TFS[Math.max(0, idx - 1)]); }
      }}
      onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); pick(e.clientX); }}
      onPointerMove={(e) => { if (e.currentTarget.hasPointerCapture(e.pointerId)) pick(e.clientX); }}
      className="relative flex h-[30px] w-[360px] max-w-full flex-none cursor-ew-resize touch-none select-none overflow-hidden rounded-[5px] border border-sky-400/25 bg-[#060a0e] outline-none focus-visible:ring-1 focus-visible:ring-sky-300/40">
      {/* sliding block */}
      <span className="pointer-events-none absolute inset-y-[2px] rounded-[4px] border border-sky-300/80 bg-sky-400/20 shadow-[0_0_14px_rgba(56,189,248,0.55),inset_0_0_8px_rgba(56,189,248,0.25)] transition-[left] duration-150 ease-out"
        style={{ left: `calc(${(p / n) * 100}% + 2px)`, width: `calc(${100 / n}% - 4px)` }} />
      {CHART_TFS.map((t, i) => (
        <span key={t} className={`relative z-[1] flex flex-1 items-center justify-center ${i ? "border-l border-sky-400/10" : ""} ${MONO} text-[10.5px] font-bold tracking-[0.06em] ${i === idx ? "text-sky-100" : "text-zinc-500"}`}>{t}</span>
      ))}
    </div>
  );
}

/** "#60a5fa" → "rgba(96,165,250,a)" — comparison lines are drawn muted so the main line dominates */
const mute = (hex: string, a: number) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
};

export default function InfernoChart({ main, pinned: pinnedAll = [], picker = [], tf: tfProp, onTfChange, initialTf = "1Y", className = "", groupLabel = "TOP 5 HOLDINGS" }: {
  /** label of the button that reveals the grouped comparisons (ids "top:…" / "peer:…") */
  groupLabel?: string;
  main: MainDef;
  /** always-listed comparisons (S&P 500, top-5 holdings): click greys them out */
  pinned?: LineDef[];
  /** instruments offered under [ + ] (e.g. every holding) */
  picker?: { sym: string; label: string; sub?: string }[];
  tf?: ChartTf;
  onTfChange?: (t: ChartTf) => void;
  initialTf?: ChartTf;
  className?: string;
}) {
  const [tfLocal, setTfLocal] = useState<ChartTf>(initialTf);
  const tf = tfProp ?? tfLocal;
  const setTf = (t: ChartTf) => { setTfLocal(t); onTfChange?.(t); };
  const [kind, setKind] = useState<"LINE" | "BARS">("LINE");
  const [off, setOff] = useState<Set<string>>(new Set());
  const [extras, setExtras] = useState<LineDef[]>([]);
  const [pickOpen, setPickOpen] = useState(false);
  const [q, setQ] = useState("");
  const [vis, setVis] = useState<{ from: number; to: number } | null>(null);
  const [hoverT, setHoverT] = useState<number | null>(null);

  const range = rangeOf(tf);
  /* Only the main line + S&P 500 at first; the grouped comparisons (top-5 holdings / peers) appear on demand */
  const [showGroup, setShowGroup] = useState(false);
  const isGroup = (id: string) => id.startsWith("top:") || id.startsWith("peer:");
  const hasGroup = pinnedAll.some((l) => isGroup(l.id));
  const pinned = useMemo(() => (showGroup ? pinnedAll : pinnedAll.filter((l) => !isGroup(l.id))), [pinnedAll, showGroup]);
  const lines = useMemo(() => [...pinned, ...extras.filter((e) => !pinned.some((p) => p.sym === e.sym))], [pinned, extras]);
  const syms = useMemo(() => [...new Set([...(main.sym ? [main.sym] : []), ...(main.basket ?? []).map((b) => b.sym), ...lines.map((l) => l.sym)])].sort(), [main, lines]);
  const key = `${range}|${syms.join(",")}`;

  /* ── data ── */
  const [data, setData] = useState<{ key: string; raw: Record<string, Raw>; model: boolean } | null>(null);
  useEffect(() => {
    let dead = false;
    (async () => {
      const got: Record<string, Raw | null> = {};
      for (let i = 0; i < syms.length; i += 20) {
        try {
          const j = await fetch(`/api/prices?symbols=${encodeURIComponent(syms.slice(i, i + 20).join(","))}&range=${range}`).then((r) => r.json());
          Object.assign(got, j.series ?? {});
        } catch { /* offline */ }
      }
      let isModel = false;
      const raw: Record<string, Raw> = {};
      for (const s of syms) { const v = got[s]; if (v && v.c.length > 1) raw[s] = v; else { raw[s] = model(s, range); isModel = true; } }
      if (!dead) setData((d) => (d?.key === key ? d : { key, raw, model: isModel }));
    })();
    return () => { dead = true; };
  }, [key, range, syms]);

  const ready = data?.key === key ? data : null;
  const mainRaw = useMemo(() => {
    if (!ready) return null;
    if (main.sym) return ready.raw[main.sym] ?? null;
    return basketSeries((main.basket ?? []).map((b) => ({ s: ready.raw[b.sym], w: b.weight })));
  }, [ready, main]);

  /* ── chart ── */
  const box = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const series = useRef<Map<string, ISeriesApi<SeriesType>>>(new Map());
  const fitTo = useRef<ChartTf | null>(tf);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const chart = createChart(el, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: "#030303" }, textColor: "#71717a", fontFamily: "'JetBrains Mono Variable','JetBrains Mono',monospace", fontSize: 10, attributionLogo: false },
      grid: { vertLines: { color: "rgba(255,255,255,0.025)" }, horzLines: { color: "rgba(255,255,255,0.035)" } },
      // tight vertical fit: autoscale to the visible window of the visible lines, small margins
      rightPriceScale: { borderColor: "rgba(255,255,255,0.05)", mode: PriceScaleMode.Percentage, autoScale: true, scaleMargins: { top: 0.06, bottom: 0.06 } },
      timeScale: { borderColor: "rgba(255,255,255,0.05)", timeVisible: true, secondsVisible: false, fixLeftEdge: true, fixRightEdge: true, rightOffset: 0 },
      crosshair: { mode: CrosshairMode.Normal, vertLine: { color: "rgba(255,255,255,0.2)", style: LineStyle.Dashed, labelBackgroundColor: "#27272a" }, horzLine: { color: "rgba(255,255,255,0.2)", style: LineStyle.Dashed, labelBackgroundColor: "#27272a" } },
    });
    chartRef.current = chart;
    chart.timeScale().subscribeVisibleTimeRangeChange((r) => { if (r) setVis({ from: r.from as number, to: r.to as number }); });
    chart.subscribeCrosshairMove((p) => setHoverT(typeof p.time === "number" ? p.time : null));
    const map = series.current;
    return () => { chart.remove(); chartRef.current = null; map.clear(); };
  }, []);

  // (re)draw all series
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !ready || !mainRaw) return;
    const map = series.current;
    const want = new Set<string>();
    const dedupe = <T,>(t: number[], f: (i: number) => T) => {
      const m = new Map<number, T>();
      t.forEach((ts, i) => m.set(ts, f(i)));
      return [...m].sort((a, b) => a[0] - b[0]);
    };
    // main
    const mainKey = `main:${kind}`;
    want.add(mainKey);
    let ms = map.get(mainKey);
    if (!ms) {
      ms = kind === "BARS"
        ? chart.addSeries(BarSeries, { upColor: "#34d399", downColor: "#f87171", thinBars: false, priceLineVisible: false, lastValueVisible: true, title: main.label })
        : chart.addSeries(LineSeries, { color: main.color, lineWidth: 3, priceLineVisible: false, lastValueVisible: true, title: main.label });
      map.set(mainKey, ms);
    }
    const r = mainRaw;
    if (kind === "BARS") {
      const real = !!(r.o && r.h && r.l);
      ms.setData(dedupe(r.t, (i) => {
        const c = r.c[i], o = real ? r.o![i] : r.c[Math.max(0, i - 1)];
        return { o, h: real ? r.h![i] : Math.max(o, c), l: real ? r.l![i] : Math.min(o, c), c };
      }).map(([t, v]) => ({ time: t as UTCTimestamp, open: v.o, high: v.h, low: v.l, close: v.c })));
    } else {
      ms.setData(dedupe(r.t, (i) => r.c[i]).map(([t, value]) => ({ time: t as UTCTimestamp, value })));
    }
    ms.applyOptions({ visible: !off.has(main.id) });
    // comparisons
    for (const l of lines) {
      const s = ready.raw[l.sym];
      if (!s) continue;
      const k = `l:${l.id}`;
      want.add(k);
      let ls = map.get(k);
      if (!ls) {
        ls = chart.addSeries(LineSeries, { color: mute(l.color, l.dashed ? 0.55 : 0.45), lineWidth: 1, lineStyle: l.dashed ? LineStyle.Dashed : LineStyle.Solid, priceLineVisible: false, lastValueVisible: false, title: "" });
        map.set(k, ls);
      }
      ls.setData(dedupe(s.t, (i) => s.c[i]).map(([t, value]) => ({ time: t as UTCTimestamp, value })));
      ls.applyOptions({ visible: !off.has(l.id) });
    }
    for (const [k, s] of map) if (!want.has(k)) { chart.removeSeries(s); map.delete(k); }
    // zoom to the picked timeframe once per pick / data load
    if (fitTo.current) {
      const end = r.t[r.t.length - 1];
      const from = fitTo.current === "1D" || fitTo.current === "1W" ? r.t[0] : end - spanOf(fitTo.current) * DAY;
      chart.timeScale().setVisibleRange({ from: Math.max(r.t[0], from) as Time, to: end as Time });
      fitTo.current = null;
    }
  }, [ready, mainRaw, lines, kind, off, main.id, main.label, main.color]);

  const pick = (t: ChartTf) => { fitTo.current = t; setTf(t); };
  // same data range (e.g. 1M → 3M on the 2-year daily set): just zoom, no reload
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !mainRaw || !fitTo.current || rangeOf(fitTo.current) !== range) return;
    const end = mainRaw.t[mainRaw.t.length - 1];
    const from = fitTo.current === "1D" || fitTo.current === "1W" ? mainRaw.t[0] : end - spanOf(fitTo.current) * DAY;
    chart.timeScale().setVisibleRange({ from: Math.max(mainRaw.t[0], from) as Time, to: end as Time });
    fitTo.current = null;
  }, [tf, range, mainRaw]);

  /* ── legend values: change over the visible window (or up to the crosshair) ── */
  const pctOver = (s: Raw | null | undefined) => {
    if (!s || !vis) return null;
    const a = at(s, vis.from), b = at(s, hoverT ?? vis.to);
    return a ? (b / a - 1) * 100 : null;
  };
  const span = vis ? (vis.to - vis.from) / DAY : spanOf(tf);
  const pos = tf === "1D" || tf === "1W" ? CHART_TFS.indexOf(tf) : posOf(span);

  const toggle = (id: string) => setOff((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const addExtra = (sym: string, label = sym) => {
    if (main.sym === sym || lines.some((l) => l.sym === sym)) return;
    setExtras((e) => [...e, { id: `x:${sym}`, label, sym, color: EXTRA_COLORS[e.length % EXTRA_COLORS.length] }]);
  };
  const needle = q.trim().toUpperCase();
  const found = needle
    ? [...picker.filter((p) => p.sym.includes(needle) || p.label.toUpperCase().includes(needle)),
       ...ETFS.filter((e) => e.ticker.includes(needle) || e.name.toUpperCase().includes(needle)).slice(0, 12).map((e) => ({ sym: e.ticker, label: e.ticker, sub: e.name }))]
        .filter((x, i, a) => a.findIndex((y) => y.sym === x.sym) === i).slice(0, 16)
    : picker;

  const chip = (id: string, label: string, color: string, dashed: boolean | undefined, v: number | null, removable: boolean) => {
    const dim = off.has(id);
    return (
      <button key={id} type="button" onClick={() => (removable ? setExtras((e) => e.filter((x) => x.id !== id)) : toggle(id))}
        title={removable ? "Click to remove" : dim ? "Click to show" : "Click to hide"}
        className={`flex items-center gap-1.5 rounded-sm px-1.5 py-0.5 transition-colors hover:bg-white/[0.05] ${dim ? "opacity-35" : ""}`}>
        <span className="w-4 flex-none" style={dashed ? { borderTop: `1px dashed ${color}` } : { height: 2, background: color }} />
        <span className={dim ? "text-zinc-500" : "text-zinc-200"}>{label}</span>
        {v != null && !dim && <span className={v >= 0 ? "text-emerald-400" : "text-rose-400"}>{sgn(v)}</span>}
        {removable && <span className="text-zinc-600">×</span>}
      </button>
    );
  };

  return (
    <div className={`flex h-full min-h-0 flex-col gap-2 ${className}`}>
      {/* legend + controls */}
      <div className={`${MONO} flex flex-wrap items-center gap-x-1 gap-y-1 text-[10.5px] tabular-nums`}>
        {chip(main.id, main.label, main.color, false, pctOver(mainRaw), false)}
        {pinned.filter((l) => !isGroup(l.id)).map((l) => chip(l.id, l.label, l.color, l.dashed, pctOver(ready?.raw[l.sym]), false))}
        {hasGroup && (
          <button type="button" onClick={() => setShowGroup((v) => !v)} aria-pressed={showGroup}
            className={`mx-1 h-5 rounded-sm border px-2 text-[9.5px] font-bold tracking-[0.08em] transition-colors ${showGroup ? "border-sky-400/50 bg-sky-400/10 text-sky-200" : "border-white/[0.12] text-zinc-400 hover:border-white/[0.3] hover:text-white"}`}>
            {showGroup ? `HIDE ${groupLabel}` : `SHOW ${groupLabel}`}
          </button>
        )}
        {pinned.filter((l) => isGroup(l.id)).map((l) => chip(l.id, l.label, l.color, l.dashed, pctOver(ready?.raw[l.sym]), false))}
        {extras.map((l) => chip(l.id, l.label, l.color, false, pctOver(ready?.raw[l.sym]), true))}
        <button type="button" onClick={() => setPickOpen((o) => !o)} aria-expanded={pickOpen} title="Add a comparison"
          className={`ml-0.5 flex h-5 w-5 items-center justify-center rounded-sm border text-[13px] leading-none transition-colors ${pickOpen ? "border-emerald-400/50 text-emerald-300" : "border-white/[0.12] text-zinc-400 hover:border-white/[0.3] hover:text-white"}`}>+</button>
        <span className="ml-auto flex items-center gap-2">
          {ready?.model && <span className="rounded-sm bg-amber-400/10 px-1.5 py-px text-[9.5px] font-bold tracking-[0.1em] text-amber-300" title="Live prices unavailable — synthetic data">MODEL DATA</span>}
          <span className="flex rounded-sm border border-white/[0.06] bg-[#030303] p-0.5">
            {(["LINE", "BARS"] as const).map((k) => (
              <button key={k} type="button" onClick={() => setKind(k)} aria-pressed={kind === k}
                className={`h-5 rounded-sm px-2 text-[9.5px] font-bold tracking-[0.08em] ${kind === k ? "bg-white/[0.09] text-white" : "text-zinc-500 hover:text-zinc-200"}`}>{k}</button>
            ))}
          </span>
        </span>
      </div>

      {pickOpen && (
        <div className={`${MONO} flex max-h-[220px] flex-none flex-col overflow-hidden rounded-sm border border-white/[0.08] bg-[#0a0a0c]`}>
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} spellCheck={false} placeholder="SEARCH ANY ETF / TICKER — ENTER TO ADD"
            onKeyDown={(e) => { if (e.key === "Enter" && needle) { addExtra(found[0]?.sym ?? needle, found[0]?.label ?? needle); setQ(""); } if (e.key === "Escape") setPickOpen(false); }}
            className="h-8 flex-none border-b border-white/[0.06] bg-transparent px-3 text-[11px] text-zinc-100 outline-none placeholder:text-zinc-600" />
          <div className="min-h-0 flex-1 overflow-y-auto">
            {found.map((p) => {
              const on = main.sym === p.sym || lines.some((l) => l.sym === p.sym);
              return (
                <button key={p.sym} type="button" disabled={on} onClick={() => addExtra(p.sym, p.label)}
                  className="grid w-full grid-cols-[70px_minmax(0,1fr)_40px] items-center gap-2 border-b border-white/[0.03] px-3 py-1.5 text-left text-[11px] hover:bg-white/[0.04] disabled:opacity-40">
                  <span className="font-bold text-zinc-100">{p.label}</span>
                  <span className="truncate font-sans text-zinc-500">{p.sub ?? ""}</span>
                  <span className="text-right text-zinc-500">{on ? "ON" : "+ ADD"}</span>
                </button>
              );
            })}
            {!found.length && <p className="m-0 px-3 py-2 text-[10.5px] text-zinc-600">Press Enter to add “{needle}”.</p>}
          </div>
        </div>
      )}

      <div className="relative min-h-[300px] min-w-0 flex-1">
        <div ref={box} className="absolute inset-0" />
        {!ready && <div className="absolute inset-0 animate-pulse bg-white/[0.02]" />}
      </div>
      <div className="flex flex-none items-center">
        <TfRail value={tf} pos={pos} onChange={pick} />
      </div>
    </div>
  );
}
