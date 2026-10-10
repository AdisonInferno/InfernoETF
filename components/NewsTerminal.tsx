"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { NewsItem, NewsPayload } from "@/lib/market-news";

/* ───────────────────────────── constants ───────────────────────────── */

const SECTORS = ["ALL", "MACRO", "TECH", "ENERGY", "FINANCIALS", "HEALTHCARE", "DEFENSE"] as const;
const PORTFOLIO_KEY = "inferno.portfolio.v1";
const G = "#4ADE80";
const R = "#F87171";
const N = "#71717A";

type Tab = "glob" | "pers";

/* ───────────────────────────── helpers ───────────────────────────── */

const pct = (x: number | null, dp = 1) => (x == null ? "—" : (x >= 0 ? "+" : "") + x.toFixed(dp) + "%");
const sentColor = (v: number) => (v > 0 ? G : v < 0 ? R : N);
const sentLabel = (v: number) => (v > 0 ? "BULLISH" : v < 0 ? "BEARISH" : "NEUTRAL");

function ago(ms: number, now: number) {
  const m = Math.max(0, Math.round((now - ms) / 60000));
  if (m < 60) return `${m} MIN AGO`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} H AGO`;
  return `${Math.round(h / 24)} D AGO`;
}

/** Pulls tickers out of the saved portfolio, whatever its exact shape. */
function portfolioTickers(): string[] {
  try {
    const raw = localStorage.getItem(PORTFOLIO_KEY);
    if (!raw) return [];
    const out = new Set<string>();
    const walk = (v: unknown, key = "") => {
      if (typeof v === "string") {
        if (/^(ticker|symbol)$/i.test(key) && /^[A-Z.\-]{1,6}$/.test(v.toUpperCase())) out.add(v.toUpperCase());
        else if (/^(prompt|input|query|raw)$/i.test(key)) v.match(/\b[A-Z]{2,5}\b/g)?.forEach((t) => out.add(t));
      } else if (Array.isArray(v)) v.forEach((x) => walk(x, key));
      else if (v && typeof v === "object") Object.entries(v).forEach(([k, x]) => walk(x, k));
    };
    walk(JSON.parse(raw));
    return [...out].slice(0, 8);
  } catch {
    return [];
  }
}

/* ───────────────────────────── UI pieces ───────────────────────────── */

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex h-[30px] items-center rounded-sm border px-3 font-mono text-[11px] tracking-[0.08em] whitespace-nowrap transition-colors hover:text-white ${
        on ? "border-white/[0.16] bg-white/[0.08] text-[#FAFAFA]" : "border-white/[0.05] text-[#71717A]"
      }`}
    >
      {children}
    </button>
  );
}

function Card({ n, now }: { n: NewsItem; now: number }) {
  const c = sentColor(n.sentiment);
  return (
    <a
      href={n.url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex flex-col gap-2.5 rounded-sm border border-white/[0.05] bg-[#0a0a0c] px-6 py-5 transition-colors hover:border-white/[0.1] hover:bg-[#0d0d10]"
    >
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 font-mono text-[10.5px] tracking-[0.08em] text-[#52525B]">
        <span className="flex items-center gap-2.5">
          <span className="text-[#A1A1AA]">{n.source}</span>
          <span>{ago(n.publishedAt, now)}</span>
          <span className="rounded-sm bg-white/[0.05] px-2 py-0.5 text-[#A1A1AA]">{n.sector}</span>
        </span>
        <span className="flex items-center gap-1.5" style={{ color: c }}>
          <span className="h-1.5 w-1.5" style={{ background: c }} />
          {sentLabel(n.sentiment)}
        </span>
      </div>
      <span className="text-[17px] leading-[1.3] font-semibold tracking-[-0.01em] text-pretty text-[#FAFAFA]">
        {n.headline}
      </span>
      {n.summary && <span className="text-[13px] leading-[1.55] text-pretty text-[#A1A1AA]">{n.summary}</span>}
      {n.tickers.length > 0 && (
        <div className="flex flex-wrap gap-1.5 font-mono text-[11px]">
          {n.tickers.map((x) => (
            <span key={x.t} className="flex gap-1.5 rounded-sm bg-white/[0.04] px-2 py-[3px] text-[#D4D4D8]">
              {x.t}
              <span style={{ color: x.d == null ? N : x.d >= 0 ? G : R }}>{pct(x.d)}</span>
            </span>
          ))}
        </div>
      )}
    </a>
  );
}

function Skeleton() {
  return (
    <div className="flex flex-col gap-3">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="h-[132px] animate-pulse rounded-sm border border-white/[0.05] bg-[#0a0a0c]" />
      ))}
    </div>
  );
}

/* ───────────────────────────── component ───────────────────────────── */

export default function NewsTerminal() {
  const [tab, setTab] = useState<Tab>("glob");
  const [sec, setSec] = useState<(typeof SECTORS)[number]>("ALL");
  const [glob, setGlob] = useState<NewsPayload | null>(null);
  const [pers, setPers] = useState<NewsPayload | null>(null);
  const [held, setHeld] = useState<string[] | null>(null);
  const [holdFilter, setHoldFilter] = useState<string>("ALL");
  const [error, setError] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const loadGlob = useCallback(async () => {
    setError(false);
    try {
      const r = await fetch("/api/news");
      if (!r.ok) throw new Error();
      setGlob(await r.json());
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    loadGlob();
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, [loadGlob]);

  useEffect(() => {
    if (tab !== "pers" || held !== null) return;
    const t = portfolioTickers();
    setHeld(t);
    if (!t.length) return;
    fetch(`/api/news?tickers=${t.join(",")}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setPers)
      .catch(() => setError(true));
  }, [tab, held]);

  const items = useMemo(() => {
    if (tab === "pers") {
      const list = pers?.items ?? [];
      return holdFilter === "ALL" ? list : list.filter((n) => n.sector === holdFilter);
    }
    const list = glob?.items ?? [];
    return sec === "ALL" ? list : list.filter((n) => n.sector === sec);
  }, [tab, pers, glob, sec, holdFilter]);

  const loading = tab === "glob" ? !glob && !error : held === null || (held.length > 0 && !pers && !error);
  const provider = (tab === "glob" ? glob : pers)?.provider;

  const side = useMemo(() => {
    if (tab === "pers") {
      const byT = new Map<string, number | null>();
      pers?.items.forEach((n) => n.tickers.forEach((x) => byT.set(x.t, x.d)));
      return (held ?? []).map((t) => ({ l: t, v: byT.get(t) ?? null }));
    }
    return [...(glob?.sectors ?? [])].sort((a, b) => (b.v ?? -99) - (a.v ?? -99));
  }, [tab, pers, glob, held]);

  const maxAbs = Math.max(0.5, ...side.map((r) => Math.abs(r.v ?? 0)));

  return (
    <div className="relative flex min-h-full flex-col bg-[#030303]">
      <div className="mx-auto flex w-full max-w-[1920px] flex-col gap-6 p-8">
        {/* Header */}
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
          <div className="flex flex-col gap-2">
            <span className="font-mono text-[11px] tracking-[0.1em] text-[#52525B]">
              [ DASHBOARD / <span className="text-[#A1A1AA]">NEWS</span> ]
            </span>
            <h1 className="m-0 text-[clamp(28px,2.6vw,36px)] leading-[1.1] font-semibold tracking-[-0.025em] text-[#FAFAFA]">
              {tab === "pers" ? "Your news" : "Global & sector news"}
            </h1>
          </div>
          <div className="flex gap-1 rounded-sm border border-white/[0.05] bg-[#0a0a0c] p-1">
            {(
              [
                ["glob", "GLOBAL / SECTOR"],
                ["pers", "PERSONALIZED"],
              ] as const
            ).map(([k, l]) => (
              <button
                key={k}
                type="button"
                onClick={() => setTab(k)}
                className={`flex h-8 items-center rounded-sm px-4 font-mono text-[12px] tracking-[0.06em] whitespace-nowrap transition-colors hover:text-white ${
                  tab === k ? "bg-white/[0.08] text-[#FAFAFA]" : "text-[#71717A]"
                }`}
              >
                {l}
              </button>
            ))}
          </div>
        </div>

        {/* Chips */}
        <div className="flex flex-wrap items-center gap-2">
          {tab === "glob"
            ? SECTORS.map((s) => (
                <Chip key={s} on={s === sec} onClick={() => setSec(s)}>
                  {s}
                </Chip>
              ))
            : ["ALL", ...(held ?? [])].map((t) => (
                <Chip key={t} on={t === holdFilter} onClick={() => setHoldFilter(t)}>
                  {t === "ALL" ? "ALL HOLDINGS" : t}
                </Chip>
              ))}
          {provider && (
            <span className="ml-auto font-mono text-[10.5px] tracking-[0.08em] text-[#52525B]">
              [ SRC: {provider} · {items.length} ]
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
          {/* Feed */}
          <div className="flex min-w-0 flex-col gap-3">
            {loading && <Skeleton />}
            {!loading && error && (
              <div className="flex items-center justify-between rounded-sm border border-white/[0.05] bg-[#0a0a0c] px-6 py-5 font-mono text-[11px] tracking-[0.08em] text-[#F87171]">
                [ FEED UNAVAILABLE ]
                <button type="button" onClick={loadGlob} className="text-[#A1A1AA] hover:text-white">
                  [ RETRY ]
                </button>
              </div>
            )}
            {!loading && !error && tab === "pers" && held?.length === 0 && (
              <div className="rounded-sm border border-white/[0.05] bg-[#0a0a0c] px-6 py-8 text-center font-mono text-[11px] tracking-[0.08em] text-[#52525B]">
                [ NO PORTFOLIO ] →{" "}
                <a href="/portfolio" className="text-[#A1A1AA] hover:text-white">
                  /PORTFOLIO
                </a>
              </div>
            )}
            {!loading && !error && items.length === 0 && !(tab === "pers" && held?.length === 0) && (
              <div className="rounded-sm border border-white/[0.05] bg-[#0a0a0c] px-6 py-8 text-center font-mono text-[11px] tracking-[0.08em] text-[#52525B]">
                [ NO NEWS ]
              </div>
            )}
            {!loading && items.map((n) => <Card key={n.id} n={n} now={now} />)}
          </div>

          {/* Side */}
          <div className="flex min-w-0 flex-col gap-4 rounded-sm border border-white/[0.05] bg-[#0a0a0c] p-6 lg:sticky lg:top-6">
            <span className="font-mono text-[10px] tracking-[0.08em] text-[#71717A] uppercase">
              {tab === "pers" ? "[ HOLDINGS · 1D ]" : "[ SECTOR ETF · 1D ]"}
            </span>
            {side.map((r) => {
              const c = r.v == null ? N : r.v >= 0 ? G : R;
              return (
                <div key={r.l} className="flex flex-col gap-1.5">
                  <div className="flex justify-between font-mono text-[12px] text-[#D4D4D8]">
                    <span>{r.l}</span>
                    <span style={{ color: c }}>{pct(r.v, 2)}</span>
                  </div>
                  <div className="h-1 bg-white/[0.05]">
                    <div
                      className="h-full"
                      style={{ width: `${r.v == null ? 0 : (Math.abs(r.v) / maxAbs) * 100}%`, background: c }}
                    />
                  </div>
                </div>
              );
            })}
            {side.length === 0 && !loading && <span className="font-mono text-[11px] text-[#52525B]">—</span>}
          </div>
        </div>
      </div>
    </div>
  );
}
