"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { forceCenter, forceCollide, forceLink, forceManyBody, forceSimulation, type Simulation, type SimulationLinkDatum, type SimulationNodeDatum } from "d3-force";
import {
  ANCHORS, ANCHOR_LABEL, CLASS_META, VIEWS, WINDOWS, correlations, nodesFor, rho,
  type AssetClass, type NexusLink, type NexusNode, type View, type Window,
} from "@/lib/macro-nexus";
import { ETFS } from "@/lib/etfs";

/* ─────────────────────────────────────────────────────────────
   MACRO NEXUS — cross-asset correlation map
   · Sector switch (ALL / TECHNOLOGY / DEFENSE): each sector is its own constellation of ETFs,
     shown against the same macro anchors (S&P, oil, copper, gold, dollar, bonds).
   · Node colour = asset type. Edge = correlation ρ: neutral → white (width/alpha by |ρ|),
     negative → dashed rose. Spotlight: hovered node's edges take the neighbour's type colour.
   · Physics (d3-force): rest length shrinks and stiffness grows with ρ → correlated assets cluster.
   · Camera: drag = pan · wheel = zoom at cursor · right/Shift-drag = rotate.
   ───────────────────────────────────────────────────────────── */

interface SimNode extends SimulationNodeDatum { id: string }
type SimLink = SimulationLinkDatum<SimNode> & { rho: number };

const THRESHOLDS = [0.3, 0.5, 0.7] as const;
const IN_DB = new Set(ETFS.map((e) => e.ticker));
const PAD = 46;
const FADE = 0.06;

const VIEW0 = { tx: 0, ty: 0, s: 1, rot: 0 };
const ZOOM_MIN = 0.35, ZOOM_MAX = 6;
const clampZoom = (z: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));

const fmtRho = (v: number) => `${v < 0 ? "−" : ""}${Math.abs(v).toFixed(2)}`;
const rest = (r: number) => 70 + 200 * (1 - r);
const stiff = (r: number) => (r > 0 ? 0.03 + 0.55 * r * r : 0.06);
const colorOf = (cls: AssetClass) => CLASS_META[cls].color;

/** Edge look from ρ. Positive = neutral white (colour is reserved for asset types), negative = dashed rose. */
function edgeStyle(r: number) {
  const a = Math.abs(r);
  if (r < 0) return { stroke: "#f43f5e", text: "#fb7185", width: a > 0.5 ? 1.75 : 1.25, alpha: a > 0.5 ? 0.65 : 0.4, label: 0.9, dash: "5 4" };
  if (a > 0.8) return { stroke: "#e4e4e7", text: "#e4e4e7", width: 2.5, alpha: 0.5, label: 1, dash: undefined };
  if (a >= 0.6) return { stroke: "#d4d4d8", text: "#a1a1aa", width: 1.6, alpha: 0.26, label: 0.8, dash: undefined };
  return { stroke: "#71717a", text: "#71717a", width: 1, alpha: 0.2, label: 0.55, dash: undefined };
}

function Seg<T extends string | number>({ label, items, value, onChange, fmt }: { label: string; items: readonly T[]; value: T; onChange: (v: T) => void; fmt?: (v: T) => string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[9.5px] font-semibold tracking-[0.14em] text-zinc-600">{label}</span>
      <div role="radiogroup" aria-label={label} className="flex items-center rounded-sm border border-white/[0.06] bg-[#030303] p-0.5">
        {items.map((it) => (
          <button key={String(it)} type="button" role="radio" aria-checked={it === value} onClick={() => onChange(it)}
            className={`h-6 rounded-sm px-2 text-[10.5px] font-bold tracking-[0.06em] transition-colors ${it === value ? "bg-white/[0.09] text-white" : "text-zinc-500 hover:text-zinc-200"}`}>
            {fmt ? fmt(it) : String(it)}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function MacroNexus() {
  const [mkt, setMkt] = useState<View>("ALL");
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
  /** Camera on top of the fitted layout */
  const [view, setView] = useState(VIEW0);
  const viewRef = useRef(VIEW0);
  useEffect(() => { viewRef.current = view; }, [view]);
  const camRef = useRef<{ mode: "pan" | "rotate"; x0: number; y0: number; a0: number; v0: typeof VIEW0; moved: boolean } | null>(null);
  const [panning, setPanning] = useState(false);

  const nodes = useMemo(() => nodesFor(mkt), [mkt]);
  const byId = useMemo(() => Object.fromEntries(nodes.map((n) => [n.id, n])) as Record<string, NexusNode>, [nodes]);
  const links = useMemo(() => correlations(win).filter((l) => byId[l.source] && byId[l.target]), [win, byId]);
  const base = useMemo(() => correlations("1Y"), []);

  const boxRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const simRef = useRef<Simulation<SimNode, SimLink> | null>(null);
  const nodesRef = useRef<SimNode[]>([]);
  const sizeRef = useRef(size);
  const dragRef = useRef<{ node: SimNode; moved: boolean } | null>(null);

  // sector constellations are compared against weakly-linked macro anchors → show weaker links there
  const pickMarket = (m: View) => { setMkt(m); setThr(m === "ALL" ? 0.5 : 0.3); setSel(null); setHover(null); setView(VIEW0); };

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

  /* Simulation: rebuilt per market view; links swapped when the window changes */
  useEffect(() => {
    const sim0: SimNode[] = nodes.map((n, i) => {
      const a = (i / nodes.length) * Math.PI * 2;
      return { id: n.id, x: Math.cos(a) * 220, y: Math.sin(a) * 220 };
    });
    nodesRef.current = sim0;
    fitRef.current = { cx: 0, cy: 0, k: 1 };
    let raf = 0;
    const sim = forceSimulation<SimNode, SimLink>(sim0)
      .force("charge", forceManyBody<SimNode>().strength(-220).distanceMax(380))
      .force("collide", forceCollide<SimNode>(52).strength(0.9))
      .force("center", forceCenter(0, 0))
      .alphaDecay(0.025)
      .on("tick", () => {
        if (!raf) raf = requestAnimationFrame(() => {
          raf = 0;
          const { w, h } = sizeRef.current;
          const f = fitRef.current;
          if (w && h && !dragRef.current) {
            const xs = sim0.map((n) => n.x ?? 0), ys = sim0.map((n) => n.y ?? 0);
            const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
            const k = Math.min((w - 2 * PAD - 80) / Math.max(1, x1 - x0), (h - 2 * PAD - 40) / Math.max(1, y1 - y0), 2.2);
            const a = f.k === 1 && f.cx === 0 ? 1 : 0.18;
            f.cx += ((x0 + x1) / 2 - f.cx) * a; f.cy += ((y0 + y1) / 2 - f.cy) * a; f.k += (k - f.k) * a;
          }
          setPos(Object.fromEntries(sim0.map((n) => [n.id, { x: ((n.x ?? 0) - f.cx) * f.k, y: ((n.y ?? 0) - f.cy) * f.k }])));
        });
      });
    simRef.current = sim;
    return () => { sim.stop(); cancelAnimationFrame(raf); simRef.current = null; };
  }, [nodes]);

  useEffect(() => {
    const sim = simRef.current;
    if (!sim) return;
    const simLinks: SimLink[] = links.map((l) => ({ source: l.source, target: l.target, rho: l.correlation_value }));
    sim.force("link", forceLink<SimNode, SimLink>(simLinks).id((n) => n.id).distance((l) => rest(l.rho)).strength((l) => stiff(l.rho)));
    sim.alpha(0.8).restart();
  }, [links]);

  /* Screen ⇄ physics */
  const toSim = useCallback((cx: number, cy: number) => {
    const r = svgRef.current!.getBoundingClientRect(), f = fitRef.current, v = viewRef.current;
    const qx = cx - r.left - r.width / 2 - v.tx, qy = cy - r.top - r.height / 2 - v.ty;
    const c = Math.cos(v.rot), sn = Math.sin(v.rot);
    const ux = (qx * c + qy * sn) / v.s, uy = (-qx * sn + qy * c) / v.s;
    return { x: ux / f.k + f.cx, y: uy / f.k + f.cy };
  }, []);
  const local = (e: { clientX: number; clientY: number }) => {
    const r = svgRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left - r.width / 2, y: e.clientY - r.top - r.height / 2 };
  };

  /* Camera */
  const onBgDown = (e: React.PointerEvent) => {
    if (e.button !== 0 && e.button !== 2) return;
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    const p = local(e);
    camRef.current = { mode: e.button === 2 || e.shiftKey ? "rotate" : "pan", x0: p.x, y0: p.y, a0: Math.atan2(p.y, p.x), v0: viewRef.current, moved: false };
    setPanning(true);
  };
  const onBgUp = () => {
    const c = camRef.current;
    camRef.current = null;
    setPanning(false);
    if (c && !c.moved) setSel(null);
  };
  const rotateBy = (d: number) =>
    setView((v) => ({ ...v, rot: v.rot + d, tx: v.tx * Math.cos(d) - v.ty * Math.sin(d), ty: v.tx * Math.sin(d) + v.ty * Math.cos(d) }));
  const zoomAt = useCallback((factor: number, at = { x: 0, y: 0 }) =>
    setView((v) => {
      const s2 = clampZoom(v.s * factor), k = s2 / v.s;
      return { ...v, s: s2, tx: at.x - (at.x - v.tx) * k, ty: at.y - (at.y - v.ty) * k };
    }), []);
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      zoomAt(Math.exp(-Math.max(-200, Math.min(200, e.deltaY)) * 0.0012), { x: e.clientX - r.left - r.width / 2, y: e.clientY - r.top - r.height / 2 });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomAt]);

  /* Node dragging */
  const onDown = (e: React.PointerEvent, id: string) => {
    const node = nodesRef.current.find((n) => n.id === id);
    if (!node) return;
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    dragRef.current = { node, moved: false };
    node.fx = node.x; node.fy = node.y;
    simRef.current?.alphaTarget(0.25).restart();
  };
  const onMove = (e: React.PointerEvent) => {
    const c = camRef.current;
    if (c) {
      const p = local(e);
      if (!c.moved && Math.hypot(p.x - c.x0, p.y - c.y0) < 3) return;
      c.moved = true;
      if (c.mode === "pan") setView({ ...c.v0, tx: c.v0.tx + p.x - c.x0, ty: c.v0.ty + p.y - c.y0 });
      else {
        const d = Math.atan2(p.y, p.x) - c.a0, cs = Math.cos(d), sn = Math.sin(d);
        setView({ ...c.v0, rot: c.v0.rot + d, tx: c.v0.tx * cs - c.v0.ty * sn, ty: c.v0.tx * sn + c.v0.ty * cs });
      }
      return;
    }
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
      const a = (i / nodesRef.current.length) * Math.PI * 2;
      n.x = Math.cos(a) * 220; n.y = Math.sin(a) * 220; n.vx = 0; n.vy = 0;
    });
    fitRef.current = { cx: 0, cy: 0, k: 1 };
    simRef.current?.alpha(1).restart();
  };

  /* ── Derived ── */
  const scr = useMemo(() => {
    const c = Math.cos(view.rot), sn = Math.sin(view.rot);
    return Object.fromEntries(Object.entries(pos).map(([id, p]) => {
      const x = p.x * view.s, y = p.y * view.s;
      return [id, { x: x * c - y * sn + view.tx, y: x * sn + y * c + view.ty }];
    }));
  }, [pos, view]);

  const focus = hover ?? sel;
  const visible = links.filter((l) => Math.abs(l.correlation_value) >= thr);
  const avgAbs = visible.length ? visible.reduce((s, l) => s + Math.abs(l.correlation_value), 0) / visible.length : 0;
  const drawn = [...visible].sort((a, b) => Math.abs(a.correlation_value) - Math.abs(b.correlation_value));
  const touches = (l: NexusLink) => !focus || l.source === focus || l.target === focus;
  const lit = useMemo(() => {
    if (!focus) return null;
    const set = new Set([focus]);
    for (const l of links) if (Math.abs(l.correlation_value) >= thr && (l.source === focus || l.target === focus)) set.add(l.source === focus ? l.target : l.source);
    return set;
  }, [focus, links, thr]);
  const top5 = new Set([...visible].sort((a, b) => Math.abs(b.correlation_value) - Math.abs(a.correlation_value)).slice(0, 5).map((l) => l.source + l.target));
  const showLabel = (l: NexusLink) => labels === "ALL" || (focus ? touches(l) : top5.has(l.source + l.target));

  const clusters = useMemo(() => {
    const parent = Object.fromEntries(nodes.map((n) => [n.id, n.id]));
    const find = (x: string): string => (parent[x] === x ? x : (parent[x] = find(parent[x])));
    for (const l of links) if (l.correlation_value >= thr) parent[find(l.source)] = find(l.target);
    const groups: Record<string, string[]> = {};
    for (const n of nodes) (groups[find(n.id)] ??= []).push(n.id);
    return Object.values(groups).filter((g) => g.length > 1).sort((a, b) => b.length - a.length);
  }, [nodes, links, thr]);

  const node = sel ? byId[sel] ?? null : null;
  const peers = node
    ? nodes.filter((n) => n.id !== node.id)
        .map((n) => ({ n, r: rho(links, node.id, n.id), d: rho(links, node.id, n.id) - rho(base, node.id, n.id) }))
        .sort((a, b) => b.r - a.r)
    : [];
  const sorted = [...links].sort((a, b) => b.correlation_value - a.correlation_value);
  const sectorRows = mkt === "ALL" ? [] : nodes.filter((n) => n.sector === mkt);
  const classes = [...new Set(nodes.map((n) => n.cls))];
  const meta = VIEWS.find((v) => v.id === mkt)!;

  /** "Most / least sensitive" read-outs for the sector matrix */
  const extremes = (anchor: string) => {
    const r = sectorRows.map((n) => ({ n, r: rho(links, n.id, anchor) })).sort((a, b) => b.r - a.r);
    return r.length ? { hi: r[0], lo: r[r.length - 1] } : null;
  };

  return (
    <div className="flex flex-col gap-3 font-mono">
      {/* ── Title + sector switch ── */}
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <h1 className="m-0 flex items-center gap-2.5 text-[22px] font-bold tracking-[0.06em] text-zinc-50">
            <span className="h-2.5 w-2.5 flex-none bg-red-500" />CROSS-ASSET CORRELATION MAP
          </h1>
          <p className="m-0 mt-1 max-w-[760px] text-[11.5px] leading-relaxed text-zinc-500">
            How assets move together. <span className="text-zinc-300">Closer dots + thicker white line = stronger positive correlation (ρ)</span>.{" "}
            <span className="text-rose-400">Dashed red line = they move in opposite directions.</span> Colour = asset type.
          </p>
        </div>
        <div role="tablist" aria-label="Market" className="flex items-center gap-1.5">
          {VIEWS.map((v) => (
            <button key={v.id} type="button" role="tab" aria-selected={mkt === v.id} onClick={() => pickMarket(v.id)} title={v.hint}
              className={`h-9 rounded-sm border px-4 text-[12px] font-bold tracking-[0.12em] transition-colors ${
                mkt === v.id ? "border-red-500/40 bg-red-500/[0.12] text-red-300" : "border-white/[0.08] bg-[#0a0a0c] text-zinc-400 hover:text-white"
              }`}>
              [ {v.label} ]
            </button>
          ))}
        </div>
      </div>

      <div className="grid h-[calc(100vh-250px)] min-h-[620px] grid-cols-[minmax(0,1fr)_340px] gap-3 max-lg:h-auto max-lg:grid-cols-1">
        {/* ── Map ── */}
        <section className="flex min-h-0 min-w-0 flex-col rounded-sm border border-white/[0.06] bg-[#0a0a0c] max-lg:h-[680px]">
          <header className="flex flex-none flex-wrap items-center gap-x-5 gap-y-2 border-b border-white/[0.06] px-3 py-2">
            <Seg label="WINDOW" items={WINDOWS} value={win} onChange={setWin} />
            <Seg label="SHOW |ρ| ≥" items={THRESHOLDS} value={thr} onChange={setThr} fmt={(v) => v.toFixed(1)} />
            <Seg label="ρ LABELS" items={["KEY", "ALL"] as const} value={labels} onChange={setLabels} />
            <div className="ml-auto flex items-center gap-1">
              {([["−", "Zoom out", () => zoomAt(1 / 1.25)], ["+", "Zoom in", () => zoomAt(1.25)], ["⟲", "Rotate left", () => rotateBy(-Math.PI / 12)], ["⟳", "Rotate right", () => rotateBy(Math.PI / 12)]] as const).map(([t, l, f]) => (
                <button key={l} type="button" onClick={f} title={l} aria-label={l}
                  className="flex h-7 w-7 items-center justify-center rounded-sm border border-white/[0.06] text-[13px] text-zinc-400 transition-colors hover:text-white">{t}</button>
              ))}
              <span className="w-[80px] text-center text-[10px] tabular-nums tracking-[0.06em] text-zinc-500">
                {Math.round(view.s * 100)}% · {Math.round((((view.rot * 180) / Math.PI) % 360 + 360) % 360)}°
              </span>
              <button type="button" onClick={() => setView(VIEW0)} className="h-7 rounded-sm border border-white/[0.06] px-2 text-[10px] font-bold tracking-[0.1em] text-zinc-400 transition-colors hover:text-white">[ RESET VIEW ]</button>
              <button type="button" onClick={resetLayout} className="h-7 rounded-sm border border-white/[0.06] px-2 text-[10px] font-bold tracking-[0.1em] text-zinc-400 transition-colors hover:text-white">[ RE-LAYOUT ]</button>
            </div>
          </header>

          <div ref={boxRef} className="relative min-h-0 flex-1 overflow-hidden bg-[#030303]">
            {size.w > 0 && (
              <svg ref={svgRef} width={size.w} height={size.h} viewBox={`${-size.w / 2} ${-size.h / 2} ${size.w} ${size.h}`}
                className={`block touch-none select-none ${panning ? "cursor-grabbing" : "cursor-grab"}`}
                onPointerMove={onMove} onContextMenu={(e) => e.preventDefault()}
                role="img" aria-label={`Correlation map, ${meta.label}, ${win}, ${visible.length} links with |ρ| ≥ ${thr}`}>
                <rect x={-size.w / 2} y={-size.h / 2} width={size.w} height={size.h} fill="transparent"
                  onPointerDown={onBgDown} onPointerUp={onBgUp} onDoubleClick={() => setView(VIEW0)} />

                {/* edges */}
                <g className="pointer-events-none">
                  {drawn.map((l) => {
                    const a = scr[l.source], b = scr[l.target];
                    if (!a || !b) return null;
                    const st = edgeStyle(l.correlation_value);
                    const on = !!focus && touches(l);
                    const other = on ? byId[l.source === focus ? l.target : l.source] : null;
                    const stroke = on && other && l.correlation_value > 0 ? colorOf(other.cls) : st.stroke;
                    return (
                      <line key={l.source + l.target} x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                        stroke={stroke} strokeWidth={on ? st.width + 0.6 : st.width} strokeDasharray={st.dash}
                        strokeOpacity={focus ? (on ? 0.95 : FADE) : st.alpha}
                        className="transition-[stroke-opacity] duration-150" vectorEffect="non-scaling-stroke" />
                    );
                  })}
                </g>

                {/* ρ labels */}
                <g className="pointer-events-none">
                  {drawn.filter(showLabel).map((l) => {
                    const a = scr[l.source], b = scr[l.target];
                    if (!a || !b) return null;
                    const r = l.correlation_value, t = `[ ρ = ${fmtRho(r)} ]`, st = edgeStyle(r);
                    const on = !!focus && touches(l);
                    const other = on ? byId[l.source === focus ? l.target : l.source] : null;
                    const fill = on && other && r > 0 ? colorOf(other.cls) : st.text;
                    const x = (a.x + b.x) / 2, y = (a.y + b.y) / 2, w = t.length * 6.1 + 6;
                    return (
                      <g key={"t" + l.source + l.target} opacity={focus ? (on ? 1 : FADE) : st.label} className="transition-opacity duration-150">
                        <rect x={x - w / 2} y={y - 7.5} width={w} height={15} fill="#030303" stroke={fill} strokeOpacity={0.25} />
                        <text x={x} y={y + 3.5} textAnchor="middle" fontSize={10.5} fill={fill} fontWeight={Math.abs(r) > 0.8 ? 700 : 500}>{t}</text>
                      </g>
                    );
                  })}
                </g>

                {/* nodes */}
                <g>
                  {nodes.map((n) => {
                    const p = scr[n.id];
                    if (!p) return null;
                    const c = colorOf(n.cls);
                    const isSel = sel === n.id, isFocus = focus === n.id;
                    const star = mkt !== "ALL" && n.sector === mkt; // sector ETFs are the "stars" of their constellation
                    const r = star ? 7 : 5.5;
                    return (
                      <g key={n.id} transform={`translate(${p.x},${p.y})`} opacity={!lit || lit.has(n.id) ? 1 : FADE}
                        className="cursor-pointer transition-opacity duration-150"
                        onPointerDown={(e) => onDown(e, n.id)} onPointerUp={() => onUp(n.id)}
                        onPointerEnter={() => setHover(n.id)} onPointerLeave={() => setHover(null)}
                        role="button" aria-label={`${n.ticker} ${n.name}`}>
                        <circle r={22} fill="transparent" />
                        <circle r={r + 4} fill="none" stroke={isSel ? "#ef4444" : c} strokeOpacity={isSel ? 1 : isFocus ? 0.7 : 0.28} strokeWidth={isSel ? 1.5 : 1} />
                        <circle r={r} fill={c} />
                        <text y={-r - 9} textAnchor="middle" fontSize={star ? 13 : 12} fontWeight={700} letterSpacing="0.04em" fill={c}>{n.name}</text>
                        <text y={r + 16} textAnchor="middle" fontSize={10} letterSpacing="0.08em" className="fill-zinc-500">[ {n.ticker} ]</text>
                      </g>
                    );
                  })}
                </g>
              </svg>
            )}

            {/* asset-type legend */}
            <div className="pointer-events-none absolute left-3 top-3 flex flex-col gap-1.5 rounded-sm border border-white/[0.06] bg-[#030303]/90 px-2.5 py-2">
              <span className="text-[9px] font-semibold tracking-[0.16em] text-zinc-600">ASSET TYPE</span>
              {classes.map((k) => (
                <span key={k} className="flex items-center gap-2 text-[10.5px] font-semibold tracking-[0.08em]" style={{ color: CLASS_META[k].color }}>
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: CLASS_META[k].color }} />{CLASS_META[k].label}
                </span>
              ))}
            </div>

            {/* line legend + controls */}
            <div className="pointer-events-none absolute bottom-2 left-3 right-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[9.5px] tracking-[0.08em] text-zinc-500">
              {([["ρ > 0.8 · MOVE TOGETHER", 0.9], ["ρ 0.6–0.8", 0.7], ["WEAK", 0.4], ["NEGATIVE · OPPOSITE", -0.5]] as const).map(([t, v]) => {
                const st = edgeStyle(v);
                return (
                  <span key={t} className="flex items-center gap-1.5">
                    <svg width="22" height="4" aria-hidden><line x1="0" y1="2" x2="22" y2="2" stroke={st.stroke} strokeOpacity={Math.max(st.alpha, 0.6)} strokeWidth={st.width} strokeDasharray={st.dash} /></svg>{t}
                  </span>
                );
              })}
              <span className="ml-auto text-zinc-600">DRAG · PAN &nbsp; WHEEL · ZOOM &nbsp; RIGHT-DRAG · ROTATE &nbsp; HOVER · ISOLATE</span>
            </div>
          </div>
        </section>

        {/* ── Data panel ── */}
        <aside className="flex min-h-0 flex-col overflow-hidden rounded-sm border border-white/[0.06] bg-[#0a0a0c]">
          <div className="grid flex-none grid-cols-4 border-b border-white/[0.06]">
            {[["ASSETS", String(nodes.length)], ["LINKS", String(visible.length)], ["AVG |ρ|", avgAbs.toFixed(2)], ["CLUSTERS", String(clusters.length)]].map(([k, v]) => (
              <div key={k} className="border-r border-white/[0.06] px-2.5 py-2 last:border-r-0">
                <div className="text-[9px] tracking-[0.12em] text-zinc-600">{k}</div>
                <div className="text-[15px] font-semibold tabular-nums text-zinc-100">{v}</div>
              </div>
            ))}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {node ? (
              <div className="flex flex-col">
                <div className="border-b border-white/[0.06] px-3 py-2.5">
                  <div className="flex items-baseline gap-2">
                    <span className="text-[15px] font-bold" style={{ color: colorOf(node.cls) }}>{node.name}</span>
                    <span className="text-[11px] text-zinc-500">[ {node.ticker} ]</span>
                    <span className="ml-auto text-[9.5px] tracking-[0.12em]" style={{ color: colorOf(node.cls) }}>{CLASS_META[node.cls].label}</span>
                  </div>
                  <p className="m-0 mt-1 text-[10.5px] leading-snug text-zinc-500">{node.desc}</p>
                </div>
                <div className="grid grid-cols-[96px_1fr_44px_42px] gap-x-2 px-3 pb-1 pt-2 text-[9px] tracking-[0.12em] text-zinc-600">
                  <span>ASSET</span><span>ρ {win}</span><span className="text-right">ρ</span><span className="text-right">Δ 1Y</span>
                </div>
                {peers.map(({ n, r, d }) => (
                  <button key={n.id} type="button" onClick={() => setSel(n.id)} onPointerEnter={() => setHover(n.id)} onPointerLeave={() => setHover(null)}
                    className={`grid grid-cols-[96px_1fr_44px_42px] items-center gap-x-2 px-3 py-[5px] text-left text-[11px] tabular-nums transition-colors hover:bg-white/[0.03] ${Math.abs(r) < thr ? "opacity-45" : ""}`}>
                    <span className="truncate font-bold" style={{ color: colorOf(n.cls) }} title={n.name}>{n.name}</span>
                    <span className="relative h-2.5 bg-white/[0.03]">
                      <span className="absolute inset-y-0 left-1/2 w-px bg-white/10" />
                      <span className={`absolute inset-y-0 ${r >= 0 ? "left-1/2" : "right-1/2"}`} style={{ width: `${Math.abs(r) * 50}%`, background: r >= 0 ? colorOf(n.cls) : "#f43f5e", opacity: 0.7 }} />
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
            ) : mkt !== "ALL" ? (
              /* Sector view: sensitivity matrix vs macro anchors */
              <div className="flex flex-col gap-3 px-3 py-3">
                <div>
                  <div className="text-[10px] font-semibold tracking-[0.14em] text-zinc-400">MACRO SENSITIVITY · ρ {win}</div>
                  <p className="m-0 mt-1 text-[10px] leading-snug text-zinc-600">How each {meta.label.toLowerCase()} ETF moves with the macro anchors. Higher = moves together.</p>
                </div>
                <table className="w-full border-collapse text-[10.5px] tabular-nums">
                  <thead>
                    <tr className="text-[9px] tracking-[0.1em] text-zinc-500">
                      <th className="py-1 text-left font-semibold">ETF</th>
                      {ANCHORS.map((a) => <th key={a} className="py-1 text-center font-semibold" style={{ color: colorOf(byId[a].cls) }}>{ANCHOR_LABEL[a]}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {sectorRows.map((n) => (
                      <tr key={n.id} onPointerEnter={() => setHover(n.id)} onPointerLeave={() => setHover(null)} onClick={() => setSel(n.id)} className="cursor-pointer hover:bg-white/[0.03]">
                        <td className="py-[3px] pr-1 font-bold" style={{ color: colorOf(n.cls) }} title={n.desc}>{n.ticker}</td>
                        {ANCHORS.map((a) => {
                          const r = rho(links, n.id, a);
                          return (
                            <td key={a} className="p-[1.5px]">
                              <div className="py-[3px] text-center" style={{ background: r >= 0 ? `rgba(228,228,231,${(Math.abs(r) * 0.32).toFixed(3)})` : `rgba(244,63,94,${(Math.abs(r) * 0.55).toFixed(3)})`, color: Math.abs(r) > 0.55 ? "#fafafa" : r < 0 ? "#fb7185" : "#a1a1aa" }}>
                                {fmtRho(r)}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="flex flex-col gap-1.5 border-t border-white/[0.06] pt-2.5">
                  <span className="text-[9.5px] font-semibold tracking-[0.14em] text-zinc-600">READ-OUT</span>
                  {(["USO", "CPER", "TLT", "SPY"] as const).map((a) => {
                    const e = extremes(a);
                    if (!e) return null;
                    return (
                      <div key={a} className="text-[10.5px] leading-snug text-zinc-400">
                        <span style={{ color: colorOf(byId[a].cls) }}>{ANCHOR_LABEL[a]}</span>: most linked{" "}
                        <span className="font-bold text-zinc-100">{e.hi.n.ticker}</span> ({fmtRho(e.hi.r)}) · least{" "}
                        <span className="font-bold text-zinc-100">{e.lo.n.ticker}</span> ({fmtRho(e.lo.r)})
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-4 px-3 py-3">
                <p className="m-0 text-[10.5px] leading-relaxed text-zinc-500">Pick <span className="text-zinc-300">TECHNOLOGY</span> or <span className="text-zinc-300">DEFENSE</span> for a sector constellation, or click any dot for its full correlation row.</p>
                {([["STRONGEST ρ", sorted.slice(0, 8)], ["MOST NEGATIVE ρ", sorted.slice(-6).reverse()]] as const).map(([title, list]) => (
                  <div key={title}>
                    <div className="mb-1.5 text-[9.5px] font-semibold tracking-[0.14em] text-zinc-600">{title} · {win}</div>
                    {list.map((l) => (
                      <button key={l.source + l.target} type="button" onClick={() => setSel(l.source)}
                        className="flex w-full items-center justify-between gap-2 py-[3px] text-left text-[10.5px] tabular-nums transition-colors hover:bg-white/[0.03]">
                        <span className="truncate">
                          <span style={{ color: colorOf(byId[l.source].cls) }}>{byId[l.source].name}</span>
                          <span className="text-zinc-600"> ↔ </span>
                          <span style={{ color: colorOf(byId[l.target].cls) }}>{byId[l.target].name}</span>
                        </span>
                        <span className={`flex-none ${l.correlation_value < 0 ? "text-rose-400" : "text-zinc-100"}`}>{fmtRho(l.correlation_value)}</span>
                      </button>
                    ))}
                  </div>
                ))}
                <div>
                  <div className="mb-1.5 text-[9.5px] font-semibold tracking-[0.14em] text-zinc-600">CLUSTERS · ρ ≥ {thr.toFixed(1)}</div>
                  {clusters.map((c, i) => (
                    <div key={c.join()} className="flex gap-2 py-[3px] text-[10.5px]">
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
    </div>
  );
}
