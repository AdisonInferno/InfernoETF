"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { forceCenter, forceCollide, forceLink, forceManyBody, forceSimulation, type Simulation, type SimulationLinkDatum, type SimulationNodeDatum } from "d3-force";
import { NODES, WINDOWS, correlations, rho, type NexusLink, type Window } from "@/lib/macro-nexus";
import { ETFS } from "@/lib/etfs";

/* ─────────────────────────────────────────────────────────────
   MACRO NEXUS — cross-asset correlation network
   Physics (d3-force), rendered as plain SVG:
   · every pair is a spring: rest length grows as ρ falls (ρ=1 → 34px, ρ=−1 → 300px),
     stiffness grows with ρ² → correlated assets cluster, negatives get pushed apart;
   · many-body repulsion + collision keep tags readable.
   Only pairs with |ρ| ≥ threshold are drawn; the layout always uses the full matrix.
   ───────────────────────────────────────────────────────────── */

interface SimNode extends SimulationNodeDatum { id: string }
type SimLink = SimulationLinkDatum<SimNode> & { rho: number };

const THRESHOLDS = [0.3, 0.5, 0.7] as const;
const IN_DB = new Set(ETFS.map((e) => e.ticker));
const PAD = 34;

const fmtRho = (v: number) => `${v < 0 ? "−" : ""}${Math.abs(v).toFixed(2)}`;
const rest = (r: number) => 40 + 170 * (1 - r);
const stiff = (r: number) => (r > 0 ? 0.03 + 0.55 * r * r : 0.06);

function Seg<T extends string | number>({ label, items, value, onChange, fmt }: { label: string; items: readonly T[]; value: T; onChange: (v: T) => void; fmt?: (v: T) => string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[9.5px] font-semibold tracking-[0.14em] text-zinc-600">{label}</span>
      <div role="radiogroup" aria-label={label} className="flex items-center rounded-sm border border-white/[0.06] bg-[#030303] p-0.5">
        {items.map((it) => (
          <button
            key={String(it)}
            type="button"
            role="radio"
            aria-checked={it === value}
            onClick={() => onChange(it)}
            className={`h-6 rounded-sm px-2 text-[10.5px] font-bold tracking-[0.06em] transition-colors ${it === value ? "bg-white/[0.09] text-white" : "text-zinc-500 hover:text-zinc-200"}`}
          >
            {fmt ? fmt(it) : String(it)}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function MacroNexus() {
  const [win, setWin] = useState<Window>("90D");
  const [thr, setThr] = useState<(typeof THRESHOLDS)[number]>(0.5);
  const [labels, setLabels] = useState<"KEY" | "ALL">("KEY");
  const [sel, setSel] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  /** Screen positions (physics coords auto-fitted to the canvas), refreshed once per animation frame */
  const [pos, setPos] = useState<Record<string, { x: number; y: number }>>({});
  /** physics → screen transform: screen = (p − c) · k ; smoothed so the view doesn't jump */
  const fitRef = useRef({ cx: 0, cy: 0, k: 1 });

  const links = useMemo(() => correlations(win), [win]);
  const base = useMemo(() => correlations("1Y"), []);

  const boxRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const simRef = useRef<Simulation<SimNode, SimLink> | null>(null);
  const nodesRef = useRef<SimNode[]>([]);
  const sizeRef = useRef(size);
  const dragRef = useRef<{ node: SimNode; moved: boolean } | null>(null);

  /* Container size */
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const s = { w: el.clientWidth, h: el.clientHeight };
      sizeRef.current = s;
      setSize(s);
      simRef.current?.alpha(0.3).restart();
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* Simulation: created once; links swapped when the window changes */
  useEffect(() => {
    const nodes: SimNode[] = NODES.map((n, i) => {
      const a = (i / NODES.length) * Math.PI * 2;
      return { id: n.id, x: Math.cos(a) * 160, y: Math.sin(a) * 160 };
    });
    nodesRef.current = nodes;
    let raf = 0;
    const sim = forceSimulation<SimNode, SimLink>(nodes)
      .force("charge", forceManyBody<SimNode>().strength(-70).distanceMax(320))
      .force("collide", forceCollide<SimNode>(16))
      .force("center", forceCenter(0, 0))
      .alphaDecay(0.025)
      .on("tick", () => {
        if (!raf) raf = requestAnimationFrame(() => {
          raf = 0;
          const { w, h } = sizeRef.current;
          const f = fitRef.current;
          if (w && h && !dragRef.current) {
            // fit the layout's bounding box into the canvas (zoom in on tight clusters, never above 2.6×)
            const xs = nodes.map((n) => n.x ?? 0), ys = nodes.map((n) => n.y ?? 0);
            const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
            const k = Math.min((w - 2 * PAD - 40) / Math.max(1, x1 - x0), (h - 2 * PAD - 30) / Math.max(1, y1 - y0), 2.6);
            const a = f.k === 1 && f.cx === 0 ? 1 : 0.18;
            f.cx += ((x0 + x1) / 2 - f.cx) * a; f.cy += ((y0 + y1) / 2 - f.cy) * a; f.k += (k - f.k) * a;
          }
          setPos(Object.fromEntries(nodes.map((n) => [n.id, { x: ((n.x ?? 0) - f.cx) * f.k, y: ((n.y ?? 0) - f.cy) * f.k }])));
        });
      });
    simRef.current = sim;
    return () => { sim.stop(); cancelAnimationFrame(raf); simRef.current = null; };
  }, []);

  useEffect(() => {
    const sim = simRef.current;
    if (!sim) return;
    const simLinks: SimLink[] = links.map((l) => ({ source: l.source, target: l.target, rho: l.correlation_value }));
    sim.force("link", forceLink<SimNode, SimLink>(simLinks).id((n) => n.id).distance((l) => rest(l.rho)).strength((l) => stiff(l.rho)));
    sim.alpha(0.8).restart();
  }, [links]);

  /* Dragging */
  const toSim = useCallback((cx: number, cy: number) => {
    const r = svgRef.current!.getBoundingClientRect(), f = fitRef.current;
    return { x: (cx - r.left - r.width / 2) / f.k + f.cx, y: (cy - r.top - r.height / 2) / f.k + f.cy };
  }, []);
  const onDown = (e: React.PointerEvent, id: string) => {
    const node = nodesRef.current.find((n) => n.id === id);
    if (!node) return;
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    dragRef.current = { node, moved: false };
    node.fx = node.x; node.fy = node.y;
    simRef.current?.alphaTarget(0.25).restart();
  };
  const onMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const p = toSim(e.clientX, e.clientY);
    d.node.fx = p.x; d.node.fy = p.y; d.moved = true;
  };
  const onUp = (id: string) => {
    const d = dragRef.current;
    if (!d) return;
    d.node.fx = null; d.node.fy = null;
    simRef.current?.alphaTarget(0);
    if (!d.moved) setSel((s) => (s === id ? null : id));
    dragRef.current = null;
  };
  const resetLayout = () => {
    nodesRef.current.forEach((n, i) => {
      const a = (i / NODES.length) * Math.PI * 2;
      n.x = Math.cos(a) * 160; n.y = Math.sin(a) * 160; n.vx = 0; n.vy = 0;
    });
    simRef.current?.alpha(1).restart();
  };

  /* Derived */
  const focus = hover ?? sel;
  const visible = links.filter((l) => Math.abs(l.correlation_value) >= thr);
  const avgAbs = visible.length ? visible.reduce((s, l) => s + Math.abs(l.correlation_value), 0) / visible.length : 0;

  // clusters = connected components over visible positive edges
  const clusters = useMemo(() => {
    const parent = Object.fromEntries(NODES.map((n) => [n.id, n.id]));
    const find = (x: string): string => (parent[x] === x ? x : (parent[x] = find(parent[x])));
    for (const l of links) if (l.correlation_value >= thr) parent[find(l.source)] = find(l.target);
    const groups: Record<string, string[]> = {};
    for (const n of NODES) (groups[find(n.id)] ??= []).push(n.id);
    return Object.values(groups).sort((a, b) => b.length - a.length);
  }, [links, thr]);

  const node = sel ? NODES.find((n) => n.id === sel) ?? null : null;
  const peers = node
    ? NODES.filter((n) => n.id !== node.id)
        .map((n) => ({ n, r: rho(links, node.id, n.id), d: rho(links, node.id, n.id) - rho(base, node.id, n.id) }))
        .sort((a, b) => b.r - a.r)
    : [];
  const sorted = [...links].sort((a, b) => b.correlation_value - a.correlation_value);
  const topPos = sorted.slice(0, 8);
  const topNeg = sorted.slice(-6).reverse();

  const showLabel = (l: NexusLink) =>
    labels === "ALL" || (focus ? l.source === focus || l.target === focus : Math.abs(l.correlation_value) >= 0.85);

  return (
    <div className="grid h-[calc(100vh-170px)] min-h-[600px] grid-cols-[minmax(0,1fr)_320px] gap-3 font-mono max-lg:h-auto max-lg:grid-cols-1">
      {/* ── Graph ── */}
      <section className="flex min-h-0 min-w-0 flex-col rounded-sm border border-white/[0.06] bg-[#0a0a0c] max-lg:h-[640px]">
        <header className="flex flex-none flex-wrap items-center gap-x-5 gap-y-2 border-b border-white/[0.06] px-3 py-2">
          <span className="flex items-center gap-2 text-[12px] font-bold tracking-[0.14em] text-zinc-100">
            <span className="h-2 w-2 bg-red-500" />[ MACRO NEXUS ]
          </span>
          <Seg label="WINDOW" items={WINDOWS} value={win} onChange={setWin} />
          <Seg label="|ρ| ≥" items={THRESHOLDS} value={thr} onChange={setThr} fmt={(v) => v.toFixed(1)} />
          <Seg label="LABELS" items={["KEY", "ALL"] as const} value={labels} onChange={setLabels} />
          <button type="button" onClick={resetLayout} className="ml-auto h-7 rounded-sm border border-white/[0.06] px-2.5 text-[10.5px] font-bold tracking-[0.1em] text-zinc-400 transition-colors hover:text-white">
            [ RESET LAYOUT ]
          </button>
        </header>

        <div ref={boxRef} className="relative min-h-0 flex-1 overflow-hidden bg-[#030303]">
          {size.w > 0 && (
            <svg
              ref={svgRef}
              width={size.w}
              height={size.h}
              viewBox={`${-size.w / 2} ${-size.h / 2} ${size.w} ${size.h}`}
              className="block touch-none select-none"
              onPointerMove={onMove}
              onClick={(e) => { if (e.target === e.currentTarget) setSel(null); }}
              role="img"
              aria-label={`Correlation network, ${win} window, ${visible.length} links with |ρ| ≥ ${thr}`}
            >
              {/* edges */}
              <g>
                {visible.map((l) => {
                  const a = pos[l.source], b = pos[l.target];
                  if (!a || !b) return null;
                  const r = l.correlation_value;
                  const on = focus && (l.source === focus || l.target === focus);
                  const op = focus ? (on ? 0.5 : 0.025) : r > 0 ? 0.05 + 0.17 * r : 0.05;
                  return (
                    <line key={l.source + l.target} x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                      stroke={r < 0 && on ? "#fb7185" : "#ffffff"} strokeOpacity={op} strokeWidth={1}
                      strokeDasharray={r < 0 ? "3 3" : undefined} vectorEffect="non-scaling-stroke" />
                  );
                })}
              </g>
              {/* edge labels */}
              <g>
                {visible.filter(showLabel).map((l) => {
                  const a = pos[l.source], b = pos[l.target];
                  if (!a || !b) return null;
                  const r = l.correlation_value, t = `[ ρ = ${fmtRho(r)} ]`;
                  const x = (a.x + b.x) / 2, y = (a.y + b.y) / 2, w = t.length * 5.6 + 4;
                  const dim = focus && !(l.source === focus || l.target === focus);
                  return (
                    <g key={"t" + l.source + l.target} opacity={dim ? 0.15 : 1} className="pointer-events-none">
                      <rect x={x - w / 2} y={y - 6.5} width={w} height={13} fill="#030303" />
                      <text x={x} y={y + 3} textAnchor="middle" fontSize={9.5} className={r < 0 ? "fill-rose-400/80" : "fill-zinc-400"}>{t}</text>
                    </g>
                  );
                })}
              </g>
              {/* nodes */}
              <g>
                {NODES.map((n) => {
                  const p = pos[n.id];
                  if (!p) return null;
                  const isSel = sel === n.id, isFocus = focus === n.id;
                  const linked = focus ? n.id === focus || Math.abs(rho(links, focus, n.id)) >= thr : true;
                  return (
                    <g
                      key={n.id}
                      transform={`translate(${p.x},${p.y})`}
                      opacity={linked ? 1 : 0.25}
                      className="cursor-grab active:cursor-grabbing"
                      onPointerDown={(e) => onDown(e, n.id)}
                      onPointerUp={() => onUp(n.id)}
                      onPointerEnter={() => setHover(n.id)}
                      onPointerLeave={() => setHover(null)}
                      role="button"
                      aria-label={`${n.ticker} ${n.name}`}
                    >
                      <circle r={12} fill="transparent" />
                      <circle r={isFocus ? 4 : 3} className={isSel ? "fill-red-500" : isFocus ? "fill-white" : "fill-zinc-300"} />
                      <text y={-9} textAnchor="middle" fontSize={11.5} className={isSel ? "fill-red-400" : isFocus ? "fill-white" : "fill-zinc-300"}>
                        [ {n.ticker} ]
                      </text>
                    </g>
                  );
                })}
              </g>
            </svg>
          )}

          {/* legend */}
          <div className="pointer-events-none absolute bottom-2 left-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[9.5px] tracking-[0.08em] text-zinc-600">
            <span className="flex items-center gap-1.5"><span className="h-px w-5 bg-white/40" />HIGH ρ · SHORT</span>
            <span className="flex items-center gap-1.5"><span className="h-px w-5 bg-white/10" />LOW ρ · LONG</span>
            <span className="flex items-center gap-1.5"><span className="w-5 border-t border-dashed border-white/25" />NEGATIVE ρ</span>
            <span>DRAG · CLICK TO PIN</span>
          </div>
        </div>
      </section>

      {/* ── Data panel ── */}
      <aside className="flex min-h-0 flex-col overflow-hidden rounded-sm border border-white/[0.06] bg-[#0a0a0c]">
        <div className="grid flex-none grid-cols-4 border-b border-white/[0.06]">
          {[
            ["NODES", String(NODES.length)],
            ["LINKS", String(visible.length)],
            ["AVG |ρ|", avgAbs.toFixed(2)],
            ["CLUSTERS", String(clusters.filter((c) => c.length > 1).length)],
          ].map(([k, v]) => (
            <div key={k} className="border-r border-white/[0.06] px-2.5 py-2 last:border-r-0">
              <div className="text-[9px] tracking-[0.12em] text-zinc-600">{k}</div>
              <div className="text-[15px] font-semibold tabular-nums text-zinc-100">{v}</div>
            </div>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {node ? (
            <div className="flex flex-col">
              <div className="flex items-baseline gap-2 border-b border-white/[0.06] px-3 py-2.5">
                <span className="text-[15px] font-bold text-red-400">[ {node.ticker} ]</span>
                <span className="truncate text-[11px] text-zinc-500">{node.name}</span>
                <span className="ml-auto text-[9.5px] tracking-[0.12em] text-zinc-600">{node.group}</span>
              </div>
              <div className="grid grid-cols-[52px_1fr_52px_46px] gap-x-2 px-3 pb-1 pt-2 text-[9px] tracking-[0.12em] text-zinc-600">
                <span>ASSET</span><span>ρ {win}</span><span className="text-right">ρ</span><span className="text-right">Δ 1Y</span>
              </div>
              {peers.map(({ n, r, d }) => (
                <button key={n.id} type="button" onClick={() => setSel(n.id)} onPointerEnter={() => setHover(n.id)} onPointerLeave={() => setHover(null)}
                  className={`grid grid-cols-[52px_1fr_52px_46px] items-center gap-x-2 px-3 py-[5px] text-left text-[11px] tabular-nums transition-colors hover:bg-white/[0.03] ${Math.abs(r) < thr ? "opacity-45" : ""}`}>
                  <span className="font-bold text-zinc-200">{n.ticker}</span>
                  <span className="relative h-2.5 bg-white/[0.03]">
                    <span className="absolute inset-y-0 left-1/2 w-px bg-white/10" />
                    <span className={`absolute inset-y-0 ${r >= 0 ? "left-1/2 bg-zinc-300/70" : "right-1/2 bg-rose-400/60"}`} style={{ width: `${Math.abs(r) * 50}%` }} />
                  </span>
                  <span className={`text-right ${r < 0 ? "text-rose-400" : "text-zinc-200"}`}>{fmtRho(r)}</span>
                  <span className={`text-right text-[10px] ${win === "1Y" || Math.abs(d) < 0.005 ? "text-zinc-600" : d > 0 ? "text-emerald-400" : "text-rose-400"}`}>
                    {win === "1Y" ? "—" : `${d > 0 ? "+" : d < 0 ? "−" : ""}${Math.abs(d).toFixed(2)}`}
                  </span>
                </button>
              ))}
              {IN_DB.has(node.ticker) && (
                <Link href={`/etf/${node.ticker}`} className="mx-3 my-3 rounded-sm border border-white/[0.06] py-2 text-center text-[10.5px] font-bold tracking-[0.12em] text-zinc-400 transition-colors hover:text-white">
                  [ DEEP VIEW {node.ticker} → ]
                </Link>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-4 px-3 py-3">
              <p className="m-0 text-[10.5px] leading-relaxed text-zinc-500">Select a node to see its full correlation row. Hover to isolate its links.</p>
              {([["STRONGEST ρ", topPos], ["MOST NEGATIVE ρ", topNeg]] as const).map(([title, list]) => (
                <div key={title}>
                  <div className="mb-1.5 text-[9.5px] font-semibold tracking-[0.14em] text-zinc-600">{title} · {win}</div>
                  {list.map((l) => (
                    <button key={l.source + l.target} type="button" onClick={() => setSel(l.source)}
                      className="flex w-full items-center justify-between py-[3px] text-[11px] tabular-nums text-zinc-300 transition-colors hover:text-white">
                      <span>{l.source} <span className="text-zinc-600">↔</span> {l.target}</span>
                      <span className={l.correlation_value < 0 ? "text-rose-400" : "text-zinc-100"}>[ ρ = {fmtRho(l.correlation_value)} ]</span>
                    </button>
                  ))}
                </div>
              ))}
              <div>
                <div className="mb-1.5 text-[9.5px] font-semibold tracking-[0.14em] text-zinc-600">CLUSTERS · ρ ≥ {thr.toFixed(1)}</div>
                {clusters.filter((c) => c.length > 1).map((c, i) => (
                  <div key={c.join()} className="flex gap-2 py-[3px] text-[11px] text-zinc-400">
                    <span className="w-5 flex-none text-zinc-600">C{i + 1}</span>
                    <span className="text-zinc-300">{c.join(" · ")}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex-none border-t border-white/[0.06] px-3 py-2 text-[9.5px] leading-relaxed tracking-[0.04em] text-zinc-600">
          MODEL DATA · factor-model correlations of daily returns, illustrative only — not live market data.
        </div>
      </aside>
    </div>
  );
}
