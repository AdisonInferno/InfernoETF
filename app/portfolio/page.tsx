"use client";

import { useMemo, useState } from "react";

interface Holding { ticker: string; name: string; shares: number; avgCost: number; price: number; changePct: number; sector: string; }
interface WatchItem { ticker: string; name: string; price: number; changePct: number; aumB: number; }

const MOCK_HOLDINGS: Holding[] = [
  { ticker: "VOO", name: "Vanguard S&P 500 ETF", shares: 42, avgCost: 468.2, price: 537.4, changePct: 0.42, sector: "Broad Market" },
  { ticker: "QQQ", name: "Invesco QQQ Trust", shares: 25, avgCost: 410.5, price: 512.8, changePct: 1.12, sector: "Technology" },
  { ticker: "SMH", name: "VanEck Semiconductor ETF", shares: 18, avgCost: 214.0, price: 262.1, changePct: 2.48, sector: "Technology" },
  { ticker: "BND", name: "Vanguard Total Bond Market", shares: 120, avgCost: 74.1, price: 72.9, changePct: 0.08, sector: "Bonds" },
  { ticker: "GLD", name: "SPDR Gold Shares", shares: 30, avgCost: 188.3, price: 243.7, changePct: 0.9, sector: "Commodities" },
  { ticker: "XLE", name: "Energy Select Sector SPDR", shares: 60, avgCost: 92.4, price: 87.2, changePct: -2.34, sector: "Energy" },
];

const MOCK_WATCHLIST: WatchItem[] = [
  { ticker: "XLK", name: "Technology Select Sector SPDR", price: 236.4, changePct: 1.65, aumB: 78 },
  { ticker: "SLV", name: "iShares Silver Trust", price: 27.6, changePct: 1.74, aumB: 14 },
  { ticker: "XBI", name: "SPDR S&P Biotech ETF", price: 89.6, changePct: -1.38, aumB: 6.5 },
  { ticker: "VTI", name: "Vanguard Total Stock Market", price: 288.6, changePct: 0.38, aumB: 450 },
];

const SECTOR_COLORS: Record<string, string> = {
  "Broad Market": "bg-emerald-500", Technology: "bg-violet-500", Bonds: "bg-sky-500", Commodities: "bg-amber-400", Energy: "bg-rose-500",
};

const fmtPct = (c: number) => (c > 0 ? "+" : c < 0 ? "−" : "") + Math.abs(c).toFixed(2) + "%";
const usd = (n: number) => (n < 0 ? "−" : "") + "$" + Math.abs(n).toLocaleString("en-US", { maximumFractionDigits: 0 });

function ChangeBadge({ v }: { v: number }) {
  const up = v >= 0;
  return (
    <span className={`inline-block rounded-lg px-2 py-0.5 font-mono text-xs font-bold ${up ? "bg-emerald-500/10 text-emerald-400" : "bg-rose-500/10 text-rose-400"}`}>
      {fmtPct(v)}
    </span>
  );
}

function Card({ title, aside, children, className = "" }: { title: string; aside?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`flex min-w-0 flex-col gap-4 rounded-3xl border border-white/[0.04] bg-[#0a0a0c] p-5 shadow-[0_25px_50px_-12px_rgba(0,0,0,0.8)] ${className}`}>
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold tracking-[0.1em] text-zinc-500">{title}</span>
        {aside}
      </div>
      {children}
    </section>
  );
}

export default function PortfolioPage() {
  const [holdings, setHoldings] = useState<Holding[]>(MOCK_HOLDINGS);
  const [watchlist, setWatchlist] = useState<WatchItem[]>(MOCK_WATCHLIST);

  const stats = useMemo(() => {
    const value = holdings.reduce((s, h) => s + h.shares * h.price, 0);
    const cost = holdings.reduce((s, h) => s + h.shares * h.avgCost, 0);
    const day = holdings.reduce((s, h) => s + h.shares * h.price * (h.changePct / (100 + h.changePct)), 0);
    const bySector: Record<string, number> = {};
    holdings.forEach((h) => (bySector[h.sector] = (bySector[h.sector] ?? 0) + h.shares * h.price));
    return { value, cost, gain: value - cost, gainPct: ((value - cost) / cost) * 100, day, dayPct: (day / (value - day)) * 100, bySector };
  }, [holdings]);

  const alloc = Object.entries(stats.bySector).sort((a, b) => b[1] - a[1]);
  const th = "px-4 py-3 text-[10px] font-semibold tracking-[0.1em] text-zinc-500";
  const td = "px-4 py-3 transition-colors group-hover:bg-white/[0.04]";

  const summary = [
    { label: "TOTAL VALUE", value: usd(stats.value), sub: null as number | null },
    { label: "TODAY", value: (stats.day >= 0 ? "+" : "") + usd(stats.day), sub: stats.dayPct },
    { label: "TOTAL GAIN", value: (stats.gain >= 0 ? "+" : "") + usd(stats.gain), sub: stats.gainPct },
    { label: "HOLDINGS", value: String(holdings.length), sub: null },
  ];

  return (
    <div className="flex flex-1 flex-col bg-[#030303] font-sans text-neutral-200">
      <div className="mx-auto flex w-full max-w-[1600px] flex-1 flex-col gap-4 px-6 pb-6 pt-4">
        <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
          {summary.map((s) => (
            <div key={s.label} className="flex flex-col gap-2 rounded-3xl border border-white/[0.04] bg-[#0a0a0c] p-5 shadow-[0_25px_50px_-12px_rgba(0,0,0,0.8)]">
              <span className="text-[11px] font-semibold tracking-[0.1em] text-zinc-500">{s.label}</span>
              <div className="flex items-center gap-2.5">
                <span className="font-mono text-2xl font-semibold tabular-nums text-zinc-50">{s.value}</span>
                {s.sub !== null && <ChangeBadge v={s.sub} />}
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-[minmax(0,1fr)_340px] gap-4 max-lg:grid-cols-1">
          <Card title="HOLDINGS" aside={<span className="font-mono text-[11px] text-zinc-600">{holdings.length} positions</span>}>
            <div className="overflow-x-auto">
              <table className="w-full border-separate border-spacing-y-0.5">
                <thead>
                  <tr className="text-left">
                    <th className={th}>TICKER</th>
                    <th className={`${th} text-right`}>SHARES</th>
                    <th className={`${th} text-right`}>PRICE</th>
                    <th className={`${th} text-right`}>1D %</th>
                    <th className={`${th} text-right`}>VALUE</th>
                    <th className={`${th} text-right`}>GAIN</th>
                    <th className={th}></th>
                  </tr>
                </thead>
                <tbody>
                  {holdings.map((h) => {
                    const val = h.shares * h.price;
                    const gp = ((h.price - h.avgCost) / h.avgCost) * 100;
                    return (
                      <tr key={h.ticker} className="group">
                        <td className={`${td} rounded-l-xl`}>
                          <div className="font-mono text-[13px] font-bold text-zinc-50">{h.ticker}</div>
                          <div className="text-[11px] text-zinc-600">{h.name}</div>
                        </td>
                        <td className={`${td} text-right font-mono text-[13px] tabular-nums text-neutral-300`}>{h.shares}</td>
                        <td className={`${td} text-right font-mono text-[13px] tabular-nums text-neutral-300`}>${h.price.toFixed(2)}</td>
                        <td className={`${td} text-right`}><ChangeBadge v={h.changePct} /></td>
                        <td className={`${td} text-right font-mono text-[13px] tabular-nums text-zinc-50`}>{usd(val)}</td>
                        <td className={`${td} text-right`}><ChangeBadge v={gp} /></td>
                        <td className={`${td} rounded-r-xl text-right`}>
                          <button type="button" onClick={() => setHoldings((a) => a.filter((x) => x.ticker !== h.ticker))}
                            className="rounded-full px-2 py-1 text-xs text-zinc-600 opacity-0 transition hover:bg-white/10 hover:text-white group-hover:opacity-100" aria-label={`Remove ${h.ticker}`}>✕</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {holdings.length === 0 && <div className="p-12 text-center text-[13px] text-zinc-500">No holdings yet. Add ETFs from the Screener.</div>}
            </div>
          </Card>

          <div className="flex min-w-0 flex-col gap-4">
            <Card title="ALLOCATION">
              <div className="flex h-3 gap-[1px] overflow-hidden rounded-full">
                {alloc.map(([k, v]) => <div key={k} className={SECTOR_COLORS[k] ?? "bg-zinc-500"} style={{ width: `${(v / stats.value) * 100}%` }} />)}
              </div>
              <div className="flex flex-col gap-1.5">
                {alloc.map(([k, v]) => (
                  <div key={k} className="flex items-center gap-2.5 rounded-xl px-3 py-2 transition-colors hover:bg-white/[0.05]">
                    <span className={`h-2.5 w-2.5 rounded-full ${SECTOR_COLORS[k] ?? "bg-zinc-500"}`} />
                    <span className="flex-1 text-[13px] text-neutral-200">{k}</span>
                    <span className="font-mono text-xs text-zinc-400">{((v / stats.value) * 100).toFixed(1)}%</span>
                  </div>
                ))}
              </div>
            </Card>

            <Card title="WATCHLIST" aside={<span className="font-mono text-[11px] text-zinc-600">{watchlist.length}</span>}>
              <div className="flex flex-col gap-0.5">
                {watchlist.map((w) => (
                  <div key={w.ticker} className="group flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-white/[0.05]">
                    <div className="min-w-0 flex-1">
                      <div className="font-mono text-[13px] font-bold text-zinc-50">{w.ticker}</div>
                      <div className="truncate text-[11px] text-zinc-600">{w.name}</div>
                    </div>
                    <span className="font-mono text-[13px] tabular-nums text-neutral-300">${w.price.toFixed(2)}</span>
                    <ChangeBadge v={w.changePct} />
                    <button type="button" onClick={() => setWatchlist((a) => a.filter((x) => x.ticker !== w.ticker))}
                      className="text-xs text-zinc-600 opacity-0 transition hover:text-white group-hover:opacity-100" aria-label={`Remove ${w.ticker}`}>✕</button>
                  </div>
                ))}
                {watchlist.length === 0 && <div className="p-6 text-center text-[13px] text-zinc-500">Watchlist is empty.</div>}
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}