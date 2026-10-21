"use client";

/* [ INDEXES ] mode of the Market Map — global benchmarks over one shared timeframe.
   · TILES  : compact cards (ticker, name, value, % change, sparkline)
   · CHARTS : 3/4-column grid of mini area charts with ONE crosshair shared by all charts
              (hover any chart → every chart shows the same moment: date + % since period start)
   Core tier always visible; emerging markets behind [ + SHOW EMERGING MARKETS ].
   Index series come from Yahoo; if an index feed is missing the ETF proxy is used (marked "ETF PROXY"). */

import { useMemo, useState } from "react";
import { SegRail } from "@/components/InfernoChart";
import { IDX_TFS, INDEXES, useIndexSeries, type IdxTf, type IndexSeries, type Series } from "@/lib/indexes";

const MONO = "font-mono";
const UP = "#34d399", DOWN = "#f87171";
const fmtPct = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(2)}%`;
const fmtVal = (v: number) => v.toLocaleString("en-US", { maximumFractionDigits: v >= 1000 ? 0 : 2 });
const fmtDate = (t: number, tf: IdxTf) => {
  const d = new Date(t * 1000);
  return tf === "1D" || tf === "1W"
    ? d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).toUpperCase()
    : d.toLocaleDateString("en-US", { year: "2-digit", month: "short", day: "numeric" }).toUpperCase();
};

/** index of the last point at or before t */
function idxAt(s: Series, t: number) {
  let lo = 0, hi = s.t.length - 1;
  if (t <= s.t[0]) return 0;
  while (lo < hi) { const m = (lo + hi + 1) >> 1; if (s.t[m] <= t) lo = m; else hi = m - 1; }
  return lo;
}

function path(s: Series, w: number, h: number, pad = 2) {
  const lo = Math.min(...s.c), hi = Math.max(...s.c), span = hi - lo || 1;
  const t0 = s.t[0], t1 = s.t[s.t.length - 1] || t0 + 1;
  const pts = s.t.map((t, i) => [((t - t0) / (t1 - t0 || 1)) * w, pad + (1 - (s.c[i] - lo) / span) * (h - 2 * pad)] as const);
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  return { line, area: `${line} L${w} ${h} L0 ${h} Z`, y: (v: number) => pad + (1 - (v - lo) / span) * (h - 2 * pad), x: (t: number) => ((t - t0) / (t1 - t0 || 1)) * w };
}

function Spark({ s, up }: { s: Series; up: boolean }) {
  const { line } = path(s, 100, 28);
  return (
    <svg viewBox="0 0 100 28" preserveAspectRatio="none" className="h-7 w-full">
      <path d={line} fill="none" stroke={up ? UP : DOWN} strokeWidth={1.4} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function Tile({ r }: { r: IndexSeries }) {
  const up = (r.ret ?? 0) >= 0;
  return (
    <div className="flex min-w-0 flex-col gap-1.5 rounded-sm border border-white/[0.05] bg-[var(--oasis-panel)] px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className={`${MONO} text-[13px] font-bold tracking-[0.06em] text-zinc-50`}>{r.def.id}</span>
        <span className={`${MONO} text-[9.5px] tracking-[0.12em] text-zinc-600`}>{r.viaProxy ? `ETF PROXY · ${r.def.proxy}` : r.def.country}</span>
      </div>
      <span className="truncate text-[11.5px] text-zinc-400">{r.def.name}</span>
      <div className="flex items-baseline justify-between gap-2">
        <span className={`${MONO} text-[15px] font-semibold tabular-nums text-zinc-100`}>{r.last != null ? fmtVal(r.last) : "—"}</span>
        <span className={`${MONO} rounded-sm px-1.5 py-0.5 text-[12px] font-bold tabular-nums ${r.ret == null ? "text-zinc-600" : up ? "bg-emerald-500/10 text-emerald-400" : "bg-rose-500/10 text-rose-400"}`}>
          {r.ret == null ? "N/A" : fmtPct(r.ret)}
        </span>
      </div>
      {r.s ? <Spark s={r.s} up={up} /> : <div className="h-7" />}
    </div>
  );
}

function MiniChart({ r, tf, hoverT, setHoverT }: { r: IndexSeries; tf: IdxTf; hoverT: number | null; setHoverT: (t: number | null) => void }) {
  const W = 400, H = 120;
  const g = useMemo(() => (r.s ? path(r.s, W, H, 6) : null), [r.s]);
  const s = r.s;
  const up = (r.ret ?? 0) >= 0, col = up ? UP : DOWN;
  const i = s && hoverT != null ? idxAt(s, hoverT) : null;
  const hv = s && i != null ? { t: s.t[i], v: s.c[i], pct: (s.c[i] / s.c[0] - 1) * 100 } : null;
  const gid = `ix-${r.def.id}`;
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-sm border border-white/[0.05] bg-[var(--oasis-panel)] p-2.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="flex min-w-0 items-baseline gap-2">
          <span className={`${MONO} text-[12px] font-bold text-zinc-50`}>{r.def.id}</span>
          <span className="truncate text-[11px] text-zinc-500">{r.def.name}{r.viaProxy ? ` · ETF ${r.def.proxy}` : ""}</span>
        </span>
        <span className={`${MONO} text-[12px] font-bold tabular-nums`} style={{ color: hv ? (hv.pct >= 0 ? UP : DOWN) : r.ret == null ? "#52525b" : col }}>
          {hv ? fmtPct(hv.pct) : r.ret == null ? "N/A" : fmtPct(r.ret)}
        </span>
      </div>
      <div className="relative">
        {s && g ? (
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-[110px] w-full cursor-crosshair"
            onMouseMove={(e) => {
              const b = e.currentTarget.getBoundingClientRect();
              const f = Math.min(1, Math.max(0, (e.clientX - b.left) / b.width));
              setHoverT(s.t[0] + f * (s.t[s.t.length - 1] - s.t[0]));
            }}
            onMouseLeave={() => setHoverT(null)}>
            <defs>
              <linearGradient id={gid} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0" stopColor={col} stopOpacity={0.22} />
                <stop offset="1" stopColor={col} stopOpacity={0} />
              </linearGradient>
            </defs>
            <line x1={0} x2={W} y1={g.y(s.c[0])} y2={g.y(s.c[0])} stroke="rgba(255,255,255,0.12)" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
            <path d={g.area} fill={`url(#${gid})`} />
            <path d={g.line} fill="none" stroke={col} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
            {hv && (
              <>
                <line x1={g.x(hv.t)} x2={g.x(hv.t)} y1={0} y2={H} stroke="rgba(255,255,255,0.35)" vectorEffect="non-scaling-stroke" />
                <circle cx={g.x(hv.t)} cy={g.y(hv.v)} r={2.5} fill="#fff" />
              </>
            )}
          </svg>
        ) : <div className="flex h-[110px] items-center justify-center text-[11px] text-zinc-600">NO DATA</div>}
        {hv && (
          <span className={`${MONO} pointer-events-none absolute left-1 top-0 rounded-sm bg-black/70 px-1.5 py-0.5 text-[10px] text-zinc-300`}>
            {fmtDate(hv.t, tf)} · {fmtVal(hv.v)}
          </span>
        )}
      </div>
      <div className={`${MONO} flex justify-between text-[9.5px] text-zinc-600`}>
        <span>{s ? fmtDate(s.t[0], tf) : ""}</span>
        <span className="text-zinc-400">{r.last != null ? fmtVal(r.last) : ""} {r.viaProxy ? "USD" : r.def.ccy}</span>
        <span>{s ? fmtDate(s.t[s.t.length - 1], tf) : ""}</span>
      </div>
    </div>
  );
}

export default function IndexesMap({ tf, onTfChange }: { tf: IdxTf; onTfChange: (t: IdxTf) => void }) {
  const [view, setView] = useState<"TILES" | "CHARTS">("TILES");
  const [em, setEm] = useState(false);
  const [hoverT, setHoverT] = useState<number | null>(null);
  const core = useMemo(() => INDEXES.filter((d) => d.tier === "core"), []);
  const emDefs = useMemo(() => INDEXES.filter((d) => d.tier === "em"), []);
  const defs = useMemo(() => (em ? [...core, ...emDefs] : core), [em, core, emDefs]);
  const rows = useIndexSeries(defs, tf);

  const btn = (on: boolean) => `h-7 rounded-sm px-3 ${MONO} text-[10.5px] font-bold tracking-[0.12em] ${on ? "oasis-on" : "text-zinc-500 hover:text-zinc-200"}`;
  const grid = view === "TILES" ? "grid-cols-2 md:grid-cols-4" : "grid-cols-1 md:grid-cols-2 xl:grid-cols-3 min-[1900px]:grid-cols-4";

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex rounded-sm border border-white/[0.05] p-0.5">
          <button type="button" className={btn(view === "TILES")} onClick={() => setView("TILES")}>TILES / CARDS</button>
          <button type="button" className={btn(view === "CHARTS")} onClick={() => setView("CHARTS")}>CHARTS</button>
        </div>
        <SegRail items={IDX_TFS} value={tf} onChange={onTfChange} width={IDX_TFS.length * 44} />
        <button type="button" onClick={() => setEm((v) => !v)} className={`ml-auto ${btn(em)} border border-white/[0.05]`}>
          {em ? "[ COLLAPSE EMERGING ]" : `[ + SHOW EMERGING MARKETS (${emDefs.length}) ]`}
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {!rows ? (
          <div className={`grid gap-2 ${grid}`}>
            {defs.map((d) => <div key={d.id} className={`${view === "TILES" ? "h-[118px]" : "h-[160px]"} animate-pulse rounded-sm border border-white/[0.05] bg-white/[0.02]`} />)}
          </div>
        ) : (
          <>
            {[{ label: "DEVELOPED · CORE BENCHMARKS", list: rows.filter((r) => r.def.tier === "core") }, { label: "EMERGING MARKETS", list: rows.filter((r) => r.def.tier === "em") }]
              .filter((g) => g.list.length)
              .map((g) => (
                <section key={g.label} className="mb-3 flex flex-col gap-2">
                  <span className={`${MONO} text-[9.5px] tracking-[0.16em] text-zinc-500`}>{g.label} · {tf}</span>
                  <div className={`grid gap-2 ${grid}`}>
                    {g.list.map((r) => view === "TILES"
                      ? <Tile key={r.def.id} r={r} />
                      : <MiniChart key={r.def.id} r={r} tf={tf} hoverT={hoverT} setHoverT={setHoverT} />)}
                  </div>
                </section>
              ))}
          </>
        )}
      </div>
    </div>
  );
}
