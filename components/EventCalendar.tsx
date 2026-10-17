"use client";

import { useEffect, useMemo, useState } from "react";

/* Month calendar — its own card on the NEWS page (under MACRO).
   Days with an event are filled (colour = most important source) and list their codes;
   clicking a day shows its events underneath. */

interface Ev { source: string; code: string; at: string; title: string; allDay?: boolean }

/** Priority + colours per source (first match wins when a day has several). */
const SRC: Record<string, { rank: number; label: string; cell: string; bar: string; chip: string }> = {
  EARN: { rank: 0, label: "EARNINGS", cell: "bg-red-500/[0.09] hover:bg-red-500/[0.14]", bar: "bg-red-500", chip: "bg-red-500/15 text-red-300" },
  FED:  { rank: 1, label: "FED", cell: "bg-amber-400/[0.08] hover:bg-amber-400/[0.13]", bar: "bg-amber-400", chip: "bg-amber-400/15 text-amber-300" },
  FRED: { rank: 2, label: "MACRO DATA", cell: "bg-sky-400/[0.07] hover:bg-sky-400/[0.12]", bar: "bg-sky-400", chip: "bg-sky-400/15 text-sky-300" },
  MKT:  { rank: 3, label: "MARKET", cell: "bg-violet-400/[0.07] hover:bg-violet-400/[0.12]", bar: "bg-violet-400", chip: "bg-violet-400/15 text-violet-300" },
};
const OTHER = { rank: 9, label: "OTHER", cell: "bg-white/[0.04] hover:bg-white/[0.07]", bar: "bg-zinc-400", chip: "bg-white/[0.08] text-zinc-300" };
const src = (s: string) => SRC[s] ?? OTHER;

const WEEK = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
const pad = (n: number) => String(n).padStart(2, "0");
/** Local (viewer time zone) "YYYY-MM-DD". */
const localKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const evKey = (e: Ev) => (e.allDay ? e.at.slice(0, 10) : localKey(new Date(e.at)));

export default function EventCalendar() {
  const today = useMemo(() => new Date(), []);
  const todayKey = localKey(today);
  const [ym, setYm] = useState({ y: today.getFullYear(), m: today.getMonth() });
  const month = `${ym.y}-${pad(ym.m + 1)}`;
  const [picked, setPicked] = useState<string | null>(null);
  const [st, setSt] = useState<{ month: string; events: Ev[]; missing: string[]; error?: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/intel/calendar?month=${month}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((j: { events: Ev[]; missing: string[] }) => { if (!cancelled) setSt({ month, events: j.events, missing: j.missing }); })
      .catch((e: Error) => { if (!cancelled) setSt({ month, events: [], missing: [], error: e.message }); });
    return () => { cancelled = true; };
  }, [month]);

  const loading = st?.month !== month;
  const byDay = useMemo(() => {
    const map: Record<string, Ev[]> = {};
    if (!loading) for (const e of st?.events ?? []) (map[evKey(e)] ??= []).push(e);
    for (const list of Object.values(map)) list.sort((a, b) => src(a.source).rank - src(b.source).rank || a.at.localeCompare(b.at));
    return map;
  }, [st, loading]);

  // 6 weeks × 7 days, Monday first
  const cells = useMemo(() => {
    const first = new Date(ym.y, ym.m, 1);
    const offset = (first.getDay() + 6) % 7;
    return Array.from({ length: 42 }, (_, i) => new Date(ym.y, ym.m, 1 - offset + i));
  }, [ym]);

  // Selected day: what the user clicked, else today (this month) or the first day with events
  const sel = picked && picked.startsWith(month) ? picked
    : todayKey.startsWith(month) ? todayKey
    : Object.keys(byDay).filter((k) => k.startsWith(month)).sort()[0] ?? null;
  const selEvents = sel ? byDay[sel] ?? [] : [];
  const monthCount = Object.entries(byDay).filter(([k]) => k.startsWith(month)).reduce((n, [, l]) => n + l.length, 0);

  const shift = (d: number) => setYm(({ y, m }) => { const t = new Date(y, m + d, 1); return { y: t.getFullYear(), m: t.getMonth() }; });
  const navBtn = "flex h-7 w-7 items-center justify-center rounded-sm border border-white/[0.06] bg-[var(--oasis-bg)] text-[12px] text-zinc-400 transition-colors hover:border-red-500/40 hover:text-red-300";
  const monthName = new Date(ym.y, ym.m, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" }).toUpperCase();

  return (
    <section className="flex min-h-[460px] min-w-0 flex-1 flex-col gap-2.5 rounded-sm border border-white/[0.06] bg-[var(--oasis-panel)] p-4">
      {/* Header: title · month switcher */}
      <div className="flex items-center justify-between gap-2">
        <h2 className="m-0 flex items-baseline gap-2 font-mono text-[12px] font-bold tracking-[0.16em] text-zinc-200">
          [ EVENT CALENDAR ]
          <span className="text-[10px] tracking-[0.12em] text-zinc-500">{loading ? "…" : `${monthCount} EVENTS`}</span>
        </h2>
        <div className="flex items-center gap-1.5">
          <button type="button" onClick={() => shift(-1)} className={navBtn} aria-label="Previous month">‹</button>
          <button type="button" onClick={() => { setYm({ y: today.getFullYear(), m: today.getMonth() }); setPicked(null); }}
            className="h-7 min-w-[124px] rounded-sm border border-white/[0.06] bg-[var(--oasis-bg)] px-2 font-mono text-[10.5px] font-bold tracking-[0.12em] text-zinc-200 hover:text-white" title="Back to today">
            {monthName}
          </button>
          <button type="button" onClick={() => shift(1)} className={navBtn} aria-label="Next month">›</button>
        </div>
      </div>

      {/* Weekday header */}
      <div className="grid grid-cols-7 gap-1">
        {WEEK.map((w, i) => (
          <span key={w} className={`text-center font-mono text-[9px] font-bold tracking-[0.14em] ${i >= 5 ? "text-zinc-700" : "text-zinc-600"}`}>{w}</span>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid flex-1 grid-cols-7 grid-rows-6 gap-1">
        {cells.map((d) => {
          const k = localKey(d), evs = byDay[k] ?? [], inMonth = d.getMonth() === ym.m;
          const isToday = k === todayKey, isSel = k === sel, weekend = d.getDay() === 0 || d.getDay() === 6;
          const top = evs[0] ? src(evs[0].source) : null;
          return (
            <button
              key={k}
              type="button"
              onClick={() => setPicked(k)}
              aria-pressed={isSel}
              aria-label={`${d.toDateString()}${evs.length ? `, ${evs.length} event${evs.length > 1 ? "s" : ""}` : ""}`}
              className={`relative flex min-h-[46px] min-w-0 flex-col items-stretch gap-0.5 overflow-hidden rounded-sm border px-1 pb-1 pl-1.5 pt-0.5 text-left transition-colors
                ${top ? top.cell : weekend ? "bg-white/[0.01] hover:bg-white/[0.04]" : "bg-[var(--oasis-bg)] hover:bg-white/[0.04]"}
                ${isToday ? "border-red-500/70" : isSel ? "border-white/[0.25]" : "border-white/[0.05]"}
                ${isSel ? "shadow-[inset_0_0_0_1px_rgba(255,255,255,0.14)]" : ""}
                ${inMonth ? "" : "opacity-35"}`}
            >
              {top && <span className={`absolute inset-y-0 left-0 w-[2px] ${top.bar}`} />}
              <span className="flex items-center justify-between">
                <span className={`font-mono text-[10.5px] font-bold tabular-nums ${isToday ? "text-red-400" : top ? "text-zinc-100" : "text-zinc-600"}`}>{d.getDate()}</span>
                {evs.length > 2 && <span className="font-mono text-[8.5px] font-bold text-zinc-500">+{evs.length - 2}</span>}
              </span>
              {evs.slice(0, 2).map((e, i) => (
                <span key={i} className={`truncate rounded-[2px] px-1 font-mono text-[8.5px] font-bold leading-[13px] tracking-[0.04em] ${src(e.source).chip}`}>{e.code}</span>
              ))}
            </button>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {Object.values(SRC).map((s) => (
          <span key={s.label} className="flex items-center gap-1.5 font-mono text-[9px] font-bold tracking-[0.12em] text-zinc-600">
            <span className={`h-2 w-2 rounded-[1px] ${s.bar}`} />{s.label}
          </span>
        ))}
        <span className="ml-auto flex items-center gap-1.5 font-mono text-[9px] font-bold tracking-[0.12em] text-zinc-600">
          <span className="h-2 w-2 rounded-[1px] border border-red-500/70" />TODAY
        </span>
      </div>

      {/* Selected day */}
      <div className="flex flex-col gap-1.5 rounded-sm border border-white/[0.06] bg-[var(--oasis-bg)] p-3">
        <span className="font-mono text-[10px] font-bold tracking-[0.14em] text-zinc-400">
          {sel ? new Date(`${sel}T12:00:00`).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" }).toUpperCase() : "—"}
        </span>
        {loading && <div className="h-4 w-2/3 animate-pulse rounded bg-white/[0.04]" />}
        {!loading && selEvents.length === 0 && <span className="font-sans text-[12px] text-zinc-600">No events on this day.</span>}
        {!loading && selEvents.map((e, i) => (
          <div key={i} className="flex items-start gap-2.5">
            <span className={`mt-px flex-none rounded-sm px-1.5 py-px font-mono text-[10px] font-bold ${src(e.source).chip}`}>{e.code}</span>
            <span className="min-w-0 flex-1 font-sans text-[12.5px] leading-snug text-zinc-200">{e.title}</span>
            <span className="flex-none pt-px font-mono text-[10px] text-zinc-500">
              {e.allDay ? "ALL DAY" : new Date(e.at).toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" })}
            </span>
          </div>
        ))}
      </div>

      {st?.error && !loading && <p className="m-0 text-[10.5px] text-rose-400">⚠ Calendar unavailable ({st.error}).</p>}
    </section>
  );
}
