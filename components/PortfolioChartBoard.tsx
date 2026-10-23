"use client";

/* PORTFOLIO CHARTS — a wall of the portfolio's biggest positions, opened from the dashboard.
   · default: the 9 largest positions, top → down by weight
   · LAYOUT templates: 1 · 2×2 · 3×2 · 3×3
   · ⤢ on a chart = show it large; the rest stays in the selection strip at the bottom
   · × removes a chart; [ + ] next to the strip adds any position or any ticker (ETF / stock)
   The choice is remembered per browser; [ RESET TOP 9 ] goes back to the default. */

import { useEffect, useMemo, useState } from "react";
import ChartGrid, { type GridItem, type GridTf } from "@/components/ChartGrid";
import { ETFS } from "@/lib/etfs";

export interface BoardPosition { ticker: string; name: string; weight: number; sym: string; href: string }

const KEY = "oasis.pf.chartboard.v1";
type Layout = "1" | "2x2" | "3x2" | "3x3" | "rows" | "cols";
/** id · title · columns · charts shown · icon grid [cols, rows] */
const LAYOUTS: { id: Layout; title: string; cols: number; n: number; icon: [number, number] }[] = [
  { id: "1", title: "One large chart", cols: 1, n: 1, icon: [1, 1] },
  { id: "rows", title: "Stacked rows (3 wide charts, one under another)", cols: 1, n: 3, icon: [1, 3] },
  { id: "cols", title: "Side by side (3 tall charts)", cols: 3, n: 3, icon: [3, 1] },
  { id: "2x2", title: "Grid 2 × 2", cols: 2, n: 4, icon: [2, 2] },
  { id: "3x2", title: "Grid 3 × 2", cols: 3, n: 6, icon: [3, 2] },
  { id: "3x3", title: "Grid 3 × 3", cols: 3, n: 9, icon: [3, 3] },
];
const layoutOf = (id: unknown) => LAYOUTS.find((l) => l.id === id) ?? LAYOUTS[5];

/** little picture of a layout: cols × rows boxes */
function LayoutIcon({ c, r }: { c: number; r: number }) {
  const W = 22, H = 16, g = 1.5;
  const w = (W - g * (c - 1)) / c, h = (H - g * (r - 1)) / r;
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden>
      {Array.from({ length: c * r }, (_, i) => <rect key={i} x={(i % c) * (w + g)} y={Math.floor(i / c) * (h + g)} width={w} height={h} rx={1} fill="currentColor" opacity={0.85} />)}
    </svg>
  );
}

interface Saved { syms: string[]; layout: Layout; tf: GridTf; custom: boolean }

export default function PortfolioChartBoard({ positions, extra = [], onClose }: { positions: BoardPosition[]; /** look-through holdings (stocks inside your ETFs) — fill the board when you hold < 9 positions */ extra?: BoardPosition[]; onClose: () => void }) {
  const top9 = useMemo(() => {
    const own = [...positions].sort((a, b) => b.weight - a.weight).map((p) => p.sym);
    const fill = [...extra].sort((a, b) => b.weight - a.weight).map((p) => p.sym).filter((s) => !own.includes(s));
    return [...own, ...fill].slice(0, 9);
  }, [positions, extra]);
  const [st, setSt] = useState<Saved>({ syms: top9, layout: "3x3", tf: "1Y", custom: false });
  const [focus, setFocus] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [q, setQ] = useState("");

  /* restore the saved board once (falls back to the top 9) */
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(KEY);
      if (raw) {
        const j = JSON.parse(raw) as Saved;
        // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time restore from browser storage
        if (Array.isArray(j.syms)) setSt({ ...j, layout: layoutOf(j.layout).id, syms: j.custom ? j.syms : top9 });
      }
    } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- restore once
  }, []);
  const save = (n: Saved) => { setSt(n); try { window.localStorage.setItem(KEY, JSON.stringify(n)); } catch { /* ignore */ } };
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") { if (focus) setFocus(null); else onClose(); } };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [focus, onClose]);

  const bySym = useMemo(() => Object.fromEntries(positions.map((p) => [p.sym, p])), [positions]);
  const exBySym = useMemo(() => Object.fromEntries(extra.map((p) => [p.sym, p])), [extra]);
  const itemOf = (sym: string): GridItem => {
    const p = bySym[sym];
    if (p) return { sym, label: p.ticker, sub: p.name, note: `${p.weight.toFixed(1)}% of the portfolio`, href: p.href };
    const x = exBySym[sym];
    if (x) return { sym, label: x.ticker, sub: x.name, note: `${x.weight.toFixed(1)}% of the portfolio · inside your ETFs`, href: x.href };
    const e = ETFS.find((x) => x.ticker === sym);
    return { sym, label: sym, sub: e?.name ?? "not in the portfolio", href: e ? `/etf/${sym}` : `/stock/${sym}` };
  };
  const L = layoutOf(st.layout);
  const shown = focus ? [focus] : st.syms.slice(0, L.n);
  const cols = focus ? 1 : L.cols;

  const remove = (sym: string) => { save({ ...st, syms: st.syms.filter((s) => s !== sym), custom: true }); if (focus === sym) setFocus(null); };
  const add = (sym: string) => {
    const s = sym.trim().toUpperCase();
    if (!s || st.syms.includes(s)) return;
    save({ ...st, syms: [...st.syms, s], custom: true });
    setAdding(false); setQ("");
  };
  const candidates = useMemo(() => {
    const n = q.trim().toLowerCase();
    const pos = positions.filter((p) => !st.syms.includes(p.sym) && (!n || p.ticker.toLowerCase().includes(n) || p.name.toLowerCase().includes(n)))
      .map((p) => ({ sym: p.sym, label: p.ticker, sub: `${p.weight.toFixed(1)}% · ${p.name}`, mine: true }));
    const etf = n ? ETFS.filter((e) => !st.syms.includes(e.ticker) && (e.ticker.toLowerCase().startsWith(n) || e.name.toLowerCase().includes(n))).slice(0, 8)
      .map((e) => ({ sym: e.ticker, label: e.ticker, sub: e.name, mine: false })) : [];
    const inside = extra.filter((p) => !st.syms.includes(p.sym) && (!n || p.ticker.toLowerCase().includes(n) || p.name.toLowerCase().includes(n))).slice(0, n ? 8 : 6)
      .map((p) => ({ sym: p.sym, label: p.ticker, sub: `${p.weight.toFixed(1)}% · ${p.name} · inside your ETFs`, mine: true }));
    return [...pos, ...inside, ...etf];
  }, [q, positions, extra, st.syms]);

  const chip = (on: boolean) => `h-7 rounded-sm px-2.5 font-mono text-[10.5px] font-bold tracking-[0.1em] ${on ? "oasis-on" : "text-zinc-500 hover:text-zinc-200"}`;

  return (
    <div className="fixed inset-0 z-[150] flex flex-col bg-black/80 p-3 backdrop-blur-[2px]" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="flex min-h-0 flex-1 flex-col gap-2 rounded-sm border border-white/[0.08] bg-[var(--oasis-bg)] p-2">
        <div className="min-h-0 flex-1">
          <ChartGrid items={shown.map(itemOf)} tf={st.tf} onTf={(tf) => save({ ...st, tf })} cols={cols} rowMin={focus ? 400 : L.id === "rows" ? 200 : 150}
            title={focus ? `PORTFOLIO CHARTS · ${itemOf(focus).label}` : `PORTFOLIO CHARTS · TOP ${Math.min(L.n, st.syms.length)} BY WEIGHT`}
            hint={focus ? "Esc or ⤡ = back to the grid · pick another chart in the strip below" : "⤢ = show one large · × = remove · + below = add a chart"}
            onRemove={remove} onFocus={focus ? undefined : setFocus}
            tools={<>
              {focus ? <button type="button" onClick={() => setFocus(null)} className={chip(false)}>[ ⤡ GRID ]</button> : (
                <div className="flex rounded-sm border border-white/[0.06] p-0.5" title="Layout">
                  {LAYOUTS.map((l) => (
                    <button key={l.id} type="button" title={l.title} aria-label={l.title}
                      onClick={() => l.id === "1" ? setFocus(st.syms[0] ?? null) : save({ ...st, layout: l.id })}
                      className={`flex h-7 w-9 items-center justify-center rounded-sm ${!focus && st.layout === l.id ? "oasis-on" : "text-zinc-500 hover:text-zinc-200"}`}>
                      <LayoutIcon c={l.icon[0]} r={l.icon[1]} />
                    </button>
                  ))}
                </div>
              )}
              <button type="button" onClick={() => { save({ syms: top9, layout: "3x3", tf: st.tf, custom: false }); setFocus(null); }} className={chip(false)} title="Back to the 9 largest positions">[ RESET TOP 9 ]</button>
              <button type="button" onClick={onClose} aria-label="Close" className="px-2 text-[18px] leading-none text-zinc-500 hover:text-white">×</button>
            </>} />
        </div>

        {/* selection strip: every chart on the board (click = show large) · × remove · + add */}
        <div className="relative flex flex-none flex-wrap items-center gap-1.5 border-t border-white/[0.06] px-1 pt-2 font-mono">
          <span className="mr-1 text-[9.5px] tracking-[0.14em] text-zinc-600">ON THE BOARD</span>
          {st.syms.map((s, i) => {
            const it = itemOf(s), on = focus === s, hidden = !focus && i >= L.n;
            return (
              <span key={s} className={`flex h-7 items-center gap-1.5 rounded-sm border px-2 text-[11px] ${on ? "oasis-on" : hidden ? "border-white/[0.05] text-zinc-600" : "border-white/[0.1] text-zinc-300"}`}>
                <button type="button" onClick={() => setFocus(s)} title={hidden ? "Not in the current layout — click to show it large" : "Show large"} className="font-bold hover:text-white">{it.label}</button>
                <button type="button" onClick={() => remove(s)} aria-label={`Remove ${it.label}`} className="text-zinc-500 hover:text-rose-400">×</button>
              </span>
            );
          })}
          <button type="button" onClick={() => setAdding((v) => !v)} title="Add a chart: another position or any ETF / stock"
            className="flex h-7 w-8 items-center justify-center rounded-sm border border-oasis/50 text-[15px] font-bold text-oasis hover:bg-oasis-muted">+</button>
          {adding && (
            <div className="absolute bottom-10 left-0 z-10 flex w-[360px] flex-col gap-1 rounded-sm border border-white/[0.1] bg-[var(--oasis-panel)] p-2 shadow-[0_8px_30px_rgba(0,0,0,0.6)]">
              <form onSubmit={(e) => { e.preventDefault(); add(candidates[0]?.sym ?? q); }}>
                <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ticker or name (portfolio, ETF or any stock)…" spellCheck={false}
                  className="h-8 w-full rounded-sm border border-white/[0.08] bg-[var(--oasis-bg)] px-2 text-[12px] text-zinc-100 outline-none focus:border-white/[0.2]" />
              </form>
              <div className="flex max-h-[260px] flex-col overflow-y-auto">
                {candidates.map((c) => (
                  <button key={c.sym} type="button" onClick={() => add(c.sym)} className="flex items-baseline gap-2 rounded-sm px-2 py-1.5 text-left hover:bg-white/[0.05]">
                    <span className="w-[64px] flex-none text-[12px] font-bold text-zinc-100">{c.label}</span>
                    <span className="min-w-0 flex-1 truncate text-[10.5px] text-zinc-500">{c.sub}</span>
                    <span className={`flex-none text-[9px] tracking-[0.1em] ${c.mine ? "text-emerald-400" : "text-zinc-600"}`}>{c.mine ? "PORTFOLIO" : "ETF"}</span>
                  </button>
                ))}
                {q.trim() && <button type="button" onClick={() => add(q)} className="rounded-sm px-2 py-1.5 text-left text-[11px] text-zinc-400 hover:bg-white/[0.05]">+ add “{q.trim().toUpperCase()}” as a ticker</button>}
                {!q.trim() && !candidates.length && <span className="px-2 py-1 text-[11px] text-zinc-600">All positions are on the board — type any ticker.</span>}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
