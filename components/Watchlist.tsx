"use client";

/* WATCHLIST — tiles: ALL · PORTFOLIO · FAVORITES · user groups · [ + CREATE GROUP ].
   Lists come from the shared store (lib/watchlist.ts), so the same favourites / groups / portfolio
   tickers are available on every page. Prices: live quotes (Yahoo) with database fallback. */

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ETFS } from "@/lib/etfs";
import { QUOTE } from "@/lib/fund-profiles";
import { getAsset } from "@/lib/portfolio";
import { useSnapshot } from "@/lib/market-snapshot";
import { addFavorite, addToGroup, createGroup, deleteGroup, removeFavorite, removeFromGroup, renameGroup, toggleFavorite, useWatchlist } from "@/lib/watchlist";

const MONO = "font-mono";
const B = "border-white/[0.05]";
const sgn = (v: number) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(2)}%`;
const tone = (v: number) => (v > 0 ? "text-emerald-400" : v < 0 ? "text-rose-400" : "text-zinc-400");
type Q = { price: number; chg: number; currency: string };

function info(t: string) {
  const e = ETFS.find((x) => x.ticker === t);
  if (e) return { name: e.name, kind: "ETF", sector: e.sector, ytd: e.ytd, chg: e.chg1d, price: QUOTE[t]?.[0] ?? null, etf: true };
  const a = getAsset(t);
  if (a) return { name: a.name, kind: a.kind === "etf" ? "ETF" : "STOCK", sector: a.sector.toUpperCase(), ytd: a.ytd, chg: a.chg1d, price: a.price, etf: false };
  return { name: "—", kind: "?", sector: "", ytd: null as number | null, chg: null as number | null, price: null as number | null, etf: false };
}

export default function Watchlist() {
  const w = useWatchlist();
  const [tab, setTab] = useState<string>("ALL");
  const [adding, setAdding] = useState("");
  const [newGroup, setNewGroup] = useState<string | null>(null);

  const lists = useMemo(() => {
    const all = [...new Set([...w.portfolio.map((p) => p.ticker), ...w.favorites, ...w.groups.flatMap((g) => g.tickers)])];
    return { ALL: all, PORTFOLIO: w.portfolio.map((p) => p.ticker), FAVORITES: w.favorites, ...Object.fromEntries(w.groups.map((g) => [g.id, g.tickers])) } as Record<string, string[]>;
  }, [w]);
  const cur = lists[tab] ? tab : "ALL";
  const tickers = lists[cur] ?? [];
  const group = w.groups.find((g) => g.id === cur);
  const weightOf = Object.fromEntries(w.portfolio.map((p) => [p.ticker, p.weight]));

  const snapAll = useSnapshot(tickers);
  /* live quotes */
  const key = tickers.join(",");
  const [quotes, setQuotes] = useState<Record<string, Q | null>>({});
  useEffect(() => {
    if (!key) return;
    let off = false;
    const syms = key.split(",");
    (async () => {
      const out: Record<string, Q | null> = {};
      for (let i = 0; i < syms.length; i += 12) {
        try { Object.assign(out, (await fetch(`/api/quotes?symbols=${syms.slice(i, i + 12).join(",")}`).then((r) => r.json())).quotes ?? {}); } catch { /* offline */ }
      }
      if (!off) setQuotes((q) => ({ ...q, ...out }));
    })();
    return () => { off = true; };
  }, [key]);

  const tile = (id: string, label: string, n: number, accent = "emerald") => (
    <button key={id} type="button" onClick={() => setTab(id)} aria-pressed={cur === id}
      className={`flex min-w-[150px] flex-col items-start gap-1 border px-3.5 py-2.5 text-left transition-colors ${cur === id ? (accent === "amber" ? "border-amber-400/50 bg-amber-400/[0.07]" : "border-emerald-500/50 bg-emerald-500/[0.07]") : `${B} bg-[#0a0a0c] hover:border-white/[0.14]`}`}>
      <span className={`text-[11px] font-bold tracking-[0.14em] ${cur === id ? "text-white" : "text-zinc-300"}`}>{label}</span>
      <span className="text-[10px] tracking-[0.08em] text-zinc-500">{n} INSTRUMENT{n === 1 ? "" : "S"}</span>
    </button>
  );

  const add = () => {
    const t = adding.trim();
    if (!t) return;
    t.split(/[\s,]+/).forEach((x) => (group ? addToGroup(group.id, x) : addFavorite(x)));
    setAdding("");
  };
  const canAdd = cur === "FAVORITES" || !!group;

  return (
    <div className={`${MONO} flex flex-col gap-3`}>
      {/* tiles */}
      <div className="flex flex-wrap gap-2">
        {tile("ALL", "[ ALL ]", lists.ALL.length)}
        {tile("PORTFOLIO", "[ PORTFOLIO ]", lists.PORTFOLIO.length)}
        {tile("FAVORITES", "[ ★ FAVORITES ]", lists.FAVORITES.length, "amber")}
        {w.groups.map((g) => tile(g.id, `[ ${g.name.toUpperCase()} ]`, g.tickers.length))}
        {newGroup === null ? (
          <button type="button" onClick={() => setNewGroup("")} className={`flex min-w-[150px] items-center justify-center gap-2 border border-dashed border-white/[0.12] px-3.5 py-2.5 text-[11px] font-bold tracking-[0.12em] text-zinc-400 transition-colors hover:border-emerald-500/50 hover:text-emerald-300`}>
            <span className="text-[16px] leading-none">+</span> CREATE GROUP
          </button>
        ) : (
          <form onSubmit={(e) => { e.preventDefault(); const id = createGroup(newGroup); setNewGroup(null); setTab(id); }} className={`flex items-center gap-1 border border-emerald-500/40 bg-[#0a0a0c] px-2`}>
            <input autoFocus value={newGroup} onChange={(e) => setNewGroup(e.target.value)} placeholder="GROUP NAME…" maxLength={32}
              onKeyDown={(e) => { if (e.key === "Escape") setNewGroup(null); }}
              className="h-9 w-[170px] bg-transparent text-[11px] text-zinc-100 outline-none placeholder:text-zinc-600" />
            <button type="submit" className="h-7 px-2 text-[10.5px] font-bold text-emerald-300 hover:text-white">[ CREATE ]</button>
          </form>
        )}
      </div>

      {/* list */}
      <section className={`flex flex-col border ${B} bg-[#0a0a0c]`}>
        <header className={`flex flex-wrap items-center gap-2 border-b ${B} px-3 py-2`}>
          {group ? (
            <input defaultValue={group.name} key={group.id} onBlur={(e) => renameGroup(group.id, e.target.value)} className="h-7 w-[200px] border border-transparent bg-transparent px-1 text-[11.5px] font-bold tracking-[0.12em] text-zinc-100 outline-none hover:border-white/[0.08] focus:border-white/[0.2]" title="Click to rename" />
          ) : (
            <span className="text-[11.5px] font-bold tracking-[0.12em] text-zinc-100">[ {cur === "ALL" ? "ALL WATCHED" : cur} ]</span>
          )}
          {canAdd && (
            <form onSubmit={(e) => { e.preventDefault(); add(); }} className="ml-2 flex items-center gap-1">
              <input value={adding} onChange={(e) => setAdding(e.target.value)} list="wl-etfs" placeholder="ADD TICKER(S) — e.g. SMH NVDA" spellCheck={false}
                className={`h-7 w-[240px] border ${B} bg-[#030303] px-2 text-[11px] text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-white/[0.2]`} />
              <button type="submit" className="h-7 border border-emerald-500/40 px-2 text-[10.5px] font-bold text-emerald-300 hover:bg-emerald-500/10">[ + ADD ]</button>
              <datalist id="wl-etfs">{ETFS.map((e) => <option key={e.ticker} value={e.ticker}>{e.name}</option>)}</datalist>
            </form>
          )}
          {cur === "PORTFOLIO" && <Link href="/portfolio" className="ml-2 text-[10.5px] text-zinc-500 hover:text-white">[ OPEN PORTFOLIO → ]</Link>}
          {group && <button type="button" onClick={() => { deleteGroup(group.id); setTab("ALL"); }} className="ml-auto h-7 border border-rose-500/25 px-2 text-[10.5px] font-bold text-rose-400/80 hover:bg-rose-500/10">[ DELETE GROUP ]</button>}
        </header>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] border-collapse text-[12px] tabular-nums">
            <thead>
              <tr className={`border-b ${B} text-[9.5px] tracking-[0.14em] text-zinc-600`}>
                <th className="w-[40px] py-2 pl-3 text-left font-semibold">★</th>
                <th className="py-2 text-left font-semibold">TICKER</th>
                <th className="py-2 text-left font-semibold">NAME</th>
                <th className="py-2 text-left font-semibold">TYPE</th>
                <th className="py-2 text-right font-semibold">PRICE</th>
                <th className="py-2 text-right font-semibold">1D</th>
                <th className="py-2 text-right font-semibold">YTD</th>
                <th className="py-2 text-right font-semibold">IN PORTFOLIO</th>
                <th className="w-[44px] py-2 pr-3" />
              </tr>
            </thead>
            <tbody>
              {tickers.map((t) => {
                const i0 = info(t), sn = snapAll[t];
                const i = sn?.ytd != null ? { ...i0, ytd: sn.ytd } : i0;
                const q = quotes[t];
                const chg = q?.chg ?? i.chg, price = q?.price ?? i.price;
                const fav = w.favorites.includes(t);
                return (
                  <tr key={t} className={`border-b ${B} hover:bg-white/[0.03]`}>
                    <td className="py-2 pl-3"><button type="button" onClick={() => toggleFavorite(t)} title={fav ? "Remove from favorites" : "Add to favorites"} className={fav ? "text-amber-300" : "text-zinc-700 hover:text-amber-300"}>{fav ? "★" : "☆"}</button></td>
                    <td className="py-2 font-bold text-zinc-50">{i.etf ? <Link href={`/etf/${t}`} className="hover:text-emerald-300">{t}</Link> : t}</td>
                    <td className="max-w-[320px] truncate py-2 font-sans text-zinc-400">{i.name}</td>
                    <td className="py-2 text-[10px] tracking-[0.1em] text-zinc-500">{i.kind}{i.sector ? ` · ${i.sector}` : ""}</td>
                    <td className="py-2 text-right text-zinc-100">{price != null ? `${q && q.currency !== "USD" ? q.currency + " " : "$"}${price.toFixed(2)}` : "—"}</td>
                    <td className={`py-2 text-right font-bold ${chg != null ? tone(chg) : "text-zinc-600"}`}>{chg != null ? sgn(chg) : "—"}</td>
                    <td className={`py-2 text-right ${i.ytd != null ? tone(i.ytd) : "text-zinc-600"}`}>{i.ytd != null ? sgn(i.ytd) : "—"}</td>
                    <td className="py-2 text-right text-zinc-300">{weightOf[t] != null ? `${weightOf[t]}%` : <span className="text-zinc-700">—</span>}</td>
                    <td className="py-2 pr-3 text-right">
                      {group && <button type="button" onClick={() => removeFromGroup(group.id, t)} title="Remove from group" className="text-zinc-600 hover:text-rose-400">×</button>}
                      {cur === "FAVORITES" && <button type="button" onClick={() => removeFavorite(t)} title="Remove from favorites" className="text-zinc-600 hover:text-rose-400">×</button>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!tickers.length && (
            <p className="m-0 px-3 py-6 text-[11px] text-zinc-600">
              {cur === "PORTFOLIO" ? "No portfolio yet — build one on the PORTFOLIO page." : canAdd ? "Empty — add tickers above." : "Nothing watched yet — star an ETF (☆ FAVORITE) or create a group."}
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
