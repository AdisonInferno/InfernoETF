"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isKnownTicker, type Asset, type Lot } from "@/lib/portfolio";

/* ───────────────────────────── types ───────────────────────────── */

interface RawPos {
  symbol: string;
  /** set by the server: true = symbol checked against the exchange (name / price), false = could not confirm */
  verified?: boolean;
  /** the symbol Gemini read, when the server corrected it by name search */
  fixedFrom?: string;
  /** company name as listed at the exchange */
  listedName?: string;
  symbolShown?: boolean;
  name: string | null;
  kind: "etf" | "stock";
  sector?: string;
  quantity: number | null;
  avgOpenPrice: number | null;
  currentPrice: number | null;
  marketValue: number | null;
  profit: number | null;
}
interface ApiResult {
  accountCurrency: string | null;
  totalMarketValue: number | null;
  totalProfit: number | null;
  positions: RawPos[];
  model?: string;
  error?: string;
}
interface Row {
  id: number;
  source: string; // symbol as shown at the broker
  sym?: string; // broker symbol incl. exchange suffix (e.g. "CDR.PL") → used for live quotes / currency
  inferred: boolean; // ticker guessed from the name (not printed on screen)
  verified?: boolean;
  fixedFrom?: string;
  listedName?: string;
  ticker: string; // our ticker
  name: string;
  kind: "etf" | "stock";
  sector: string;
  qty: string;
  avg: string;
  price: string;
  value: string;
  pl: string;
}

export interface ImportResult {
  prompt: string;
  lots: Record<string, Lot>;
  customs: Record<string, Asset>;
}

/* ───────────────────────────── helpers ───────────────────────────── */

const num = (s: string) => {
  const v = Number(s.replace(/\s/g, "").replace(",", "."));
  return s.trim() === "" || !Number.isFinite(v) ? null : v;
};
const str = (v: number | null | undefined) => (v == null ? "" : String(v));
const fmt = (v: number | null, d = 2) => (v == null ? "—" : v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }));

/** "VWCE.DE" → "VWCE", "NVDA.US" → "NVDA"; must start with a letter for the portfolio parser. */
/** Our ticker: US listings plain ("NVDA"), every other market keeps its exchange suffix ("BDX.PL", "VWCE.DE")
 *  so a Warsaw company can never be confused with a US one that shares the letters (Budimex BDX.PL ≠ Becton Dickinson BDX). */
function toTicker(symbol: string) {
  const s = symbol.toUpperCase().trim().replace(/\s+/g, "").replace(/[^A-Z0-9.]/g, "");
  const m = /^([A-Z0-9-]+)\.([A-Z]{2})$/.exec(s);
  const base = m ? (m[2] === "US" ? m[1] : `${m[1]}.${m[2]}`) : s.replace(/\.[A-Z]{1,3}$/, "");
  return /^[A-Z]/.test(base) ? base.slice(0, 10) : ("X" + base).slice(0, 10);
}

/** Same instrument bought in several rows → one position (summed qty, weighted avg price). */
function merge(list: RawPos[]): Row[] {
  const by = new Map<string, RawPos & { n: number }>();
  for (const p of list) {
    const k = p.symbol.toUpperCase().trim();
    const cur = by.get(k);
    if (!cur) { by.set(k, { ...p, n: 1 }); continue; }
    const q1 = cur.quantity ?? 0, q2 = p.quantity ?? 0;
    cur.avgOpenPrice = q1 + q2 && cur.avgOpenPrice != null && p.avgOpenPrice != null ? (cur.avgOpenPrice * q1 + p.avgOpenPrice * q2) / (q1 + q2) : cur.avgOpenPrice ?? p.avgOpenPrice;
    cur.quantity = cur.quantity == null && p.quantity == null ? null : q1 + q2;
    cur.marketValue = cur.marketValue == null && p.marketValue == null ? null : (cur.marketValue ?? 0) + (p.marketValue ?? 0);
    cur.profit = cur.profit == null && p.profit == null ? null : (cur.profit ?? 0) + (p.profit ?? 0);
    cur.currentPrice = cur.currentPrice ?? p.currentPrice;
    cur.n++;
  }
  return [...by.values()].map((p, i) => ({
    id: i,
    source: (p.symbolShown === false ? p.name ?? p.symbol : p.symbol) + (p.n > 1 ? ` ×${p.n}` : ""),
    inferred: p.symbolShown === false,
    verified: p.verified,
    fixedFrom: p.fixedFrom,
    listedName: p.listedName,
    sym: /\.[A-Z]{2}$/.test(p.symbol.toUpperCase().trim()) ? p.symbol.toUpperCase().trim() : undefined,
    ticker: toTicker(p.symbol),
    name: p.name ?? p.symbol,
    kind: p.kind,
    sector: p.sector ?? "Other",
    qty: str(p.quantity),
    avg: str(p.avgOpenPrice != null ? +p.avgOpenPrice.toFixed(4) : null),
    price: str(p.currentPrice),
    value: str(p.marketValue),
    pl: str(p.profit),
  }));
}

/** Per-row sanity checks the user should look at before importing. */
function rowIssues(r: Row): string[] {
  const out: string[] = [];
  const q = num(r.qty), a = num(r.avg), p = num(r.price), v = num(r.value), pl = num(r.pl);
  if (!/^[A-Z][A-Z0-9.]{0,9}$/.test(r.ticker)) out.push("ticker");
  if (q == null || q <= 0) out.push("qty");
  if (a == null || a < 0) out.push("avg"); // 0 is valid (e.g. spin-off shares)
  if (v == null && (q == null || p == null)) out.push("value");
  // Profit direction must match price vs. open price (currency-independent check).
  if (a != null && a > 0 && p != null && pl != null && Math.abs(p - a) / a > 0.005 && Math.sign(p - a) !== Math.sign(pl)) out.push("P/L sign");
  return out;
}

/* ───────────────────────────── component ───────────────────────────── */

export default function XtbImport({ onImport, onClose }: { onImport: (r: ImportResult) => void; onClose: () => void }) {
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [meta, setMeta] = useState<Omit<ApiResult, "positions"> | null>(null);
  const [rows, setRows] = useState<Row[] | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const read = useCallback(async (file: File) => {
    if (!file.type.startsWith("image/")) { setError("To nie jest obrazek."); return; }
    setError(null);
    setRows(null);
    setPreview(URL.createObjectURL(file));
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("image", file);
      const r = await fetch("/api/portfolio/import", { method: "POST", body: fd });
      const j: ApiResult = await r.json();
      if (!r.ok || j.error) throw new Error(j.error ?? `HTTP ${r.status}`);
      if (!j.positions?.length) throw new Error("Nie znalazłem pozycji na obrazku. Wyślij zrzut tabeli „Otwarte pozycje”.");
      const { positions, ...rest } = j;
      setMeta(rest);
      setRows(merge(positions));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Błąd odczytu");
    } finally {
      setBusy(false);
    }
  }, []);

  // Ctrl+V a screenshot straight from the clipboard.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const f = [...(e.clipboardData?.files ?? [])].find((x) => x.type.startsWith("image/"));
      if (f) { e.preventDefault(); read(f); }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [read]);

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const set = (id: number, k: keyof Row, v: string) => setRows((rs) => rs?.map((r) => (r.id === id ? { ...r, [k]: k === "ticker" ? v.toUpperCase() : v } : r)) ?? null);
  const drop = (id: number) => setRows((rs) => rs?.filter((r) => r.id !== id) ?? null);

  const calc = useMemo(() => {
    if (!rows) return null;
    const vals = rows.map((r) => num(r.value) ?? (num(r.qty) ?? 0) * (num(r.price) ?? 0));
    const total = vals.reduce((a, v) => a + v, 0);
    const plSum = rows.reduce((a, r) => a + (num(r.pl) ?? 0), 0);
    const issues = rows.map(rowIssues);
    const dupTickers = rows.map((r) => r.ticker).filter((t, i, a) => a.indexOf(t) !== i);
    const near = (a: number, b: number | null | undefined) => b == null || Math.abs(a - b) <= Math.max(1, Math.abs(b) * 0.005);
    return {
      vals,
      total,
      plSum,
      issues,
      dupTickers,
      totalOk: near(total, meta?.totalMarketValue),
      plOk: near(plSum, meta?.totalProfit),
      ok: issues.every((x) => x.length === 0) && dupTickers.length === 0 && total > 0,
    };
  }, [rows, meta]);

  const confirm = () => {
    if (!rows || !calc?.ok) return;
    const ccy = meta?.accountCurrency ?? undefined;
    // Weights by market value, 2 decimals, last one absorbs rounding so they sum to exactly 100.
    const w = calc.vals.map((v) => +((v / calc.total) * 100).toFixed(2));
    w[w.length - 1] = +(100 - w.slice(0, -1).reduce((a, x) => a + x, 0)).toFixed(2);
    const lots: Record<string, Lot> = {};
    const customs: Record<string, Asset> = {};
    rows.forEach((r, i) => {
      const price = num(r.price) ?? undefined;
      lots[r.ticker] = { qty: num(r.qty)!, avg: num(r.avg)!, price, value: calc.vals[i], pl: num(r.pl) ?? undefined, ccy, sym: r.sym };
      if (!isKnownTicker(r.ticker)) {
        customs[r.ticker] = { ticker: r.ticker, name: r.name, price: price ?? num(r.avg)!, chg1d: 0, ytd: 0, sector: r.sector, kind: r.kind, dd2022: -30 };
      }
    });
    onImport({ prompt: `${rows.map((r) => r.ticker).join(" ")} ${w.join("/")}`, lots, customs });
  };

  const cell = "h-7 w-full min-w-0 rounded-sm border border-white/[0.06] bg-[#030303] px-1.5 text-right font-mono text-[11.5px] tabular-nums text-zinc-100 outline-none focus:border-white/[0.2]";
  const bad = "border-rose-500/60";

  return (
    <div className="flex flex-col gap-4 rounded-sm border border-white/[0.06] bg-[#0a0a0c] p-3">
      <div className="flex items-center justify-between gap-3">
        <span className="font-mono text-[10.5px] font-semibold tracking-[0.14em] text-zinc-300">[ IMPORT FROM XTB SCREENSHOT ]</span>
        <button type="button" onClick={onClose} className="font-mono text-[11px] text-zinc-500 hover:text-white">[ CLOSE ]</button>
      </div>

      {!rows && (
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) read(f); }}
          disabled={busy}
          className="flex min-h-[140px] flex-col items-center justify-center gap-2 rounded-sm border border-dashed border-white/[0.1] px-4 py-3 text-center transition-colors hover:border-white/[0.25] disabled:cursor-wait"
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- local blob preview */}
          {preview && busy && <img src={preview} alt="" className="max-h-32 rounded-sm opacity-40" />}
          <span className="font-mono text-[12px] tracking-[0.08em] text-zinc-300">
            {busy ? "[ READING TABLE… ]" : "[ DROP / CLICK / CTRL+V ]"}
          </span>
          {!busy && <span className="text-[12px] text-zinc-500">Zrzut tabeli „Otwarte pozycje” z XTB</span>}
        </button>
      )}
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) read(f); e.target.value = ""; }} />

      {error && <p className="font-mono text-[11px] text-rose-400">⚠ {error}</p>}

      {rows && calc && (
        <>
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_260px]">
            <div className="min-w-0 overflow-x-auto">
              <div className="min-w-[760px]">
                <div className="grid grid-cols-[110px_86px_minmax(0,1fr)_repeat(5,88px)_22px] gap-2 px-1 pb-1.5 font-mono text-[9px] tracking-[0.12em] text-zinc-600">
                  <span>XTB</span><span>TICKER</span><span>NAME</span>
                  <span className="text-right">QTY</span><span className="text-right">AVG OPEN</span><span className="text-right">PRICE</span>
                  <span className="text-right">VALUE</span><span className="text-right">P/L</span><span />
                </div>
                <div className="flex flex-col gap-1">
                  {rows.map((r, i) => {
                    const iss = calc.issues[i];
                    const known = isKnownTicker(r.ticker);
                    return (
                      <div key={r.id} className="grid grid-cols-[110px_86px_minmax(0,1fr)_repeat(5,88px)_22px] items-center gap-2 px-1">
                        <span className="truncate font-mono text-[11px] text-zinc-500" title={r.source}>{r.source}</span>
                        <input value={r.ticker} onChange={(e) => set(r.id, "ticker", e.target.value)} className={`${cell} text-left font-bold ${iss.includes("ticker") || calc.dupTickers.includes(r.ticker) ? bad : r.inferred ? "border-sky-500/40" : ""}`} />
                        <span className="flex min-w-0 items-center gap-1.5">
                          <span className={`flex-none rounded-sm px-1 font-mono text-[8.5px] font-bold tracking-[0.08em] ${known ? "bg-emerald-500/10 text-emerald-400" : "bg-amber-500/10 text-amber-400"}`} title={known ? "W bazie Inferno" : "Spoza bazy: dodam jako własną pozycję (bez składu i sektorów)"}>
                            {known ? "DB" : "NEW"}
                          </span>
                          {r.verified === true && <span className="flex-none rounded-sm bg-emerald-500/10 px-1 font-mono text-[8.5px] font-bold tracking-[0.08em] text-emerald-400" title={`Sprawdzone na giełdzie: ${r.listedName ?? ""}${r.fixedFrom ? ` (poprawione z ${r.fixedFrom})` : ""}`}>✓ {r.fixedFrom ? "FIXED" : "OK"}</span>}
                          {r.verified === false && <span className="flex-none rounded-sm bg-amber-500/15 px-1 font-mono text-[8.5px] font-bold tracking-[0.08em] text-amber-300" title="Nie udało się potwierdzić tickera na giełdzie — sprawdź ręcznie">CHECK</span>}
                          {r.inferred && r.verified == null && <span className="flex-none rounded-sm bg-sky-500/10 px-1 font-mono text-[8.5px] font-bold tracking-[0.08em] text-sky-300" title="Ticker odgadnięty z nazwy — sprawdź">GUESS</span>}
                          <span className="truncate text-[11.5px] text-zinc-400">{r.name}</span>
                        </span>
                        <input value={r.qty} onChange={(e) => set(r.id, "qty", e.target.value)} className={`${cell} ${iss.includes("qty") ? bad : ""}`} />
                        <input value={r.avg} onChange={(e) => set(r.id, "avg", e.target.value)} className={`${cell} ${iss.includes("avg") || iss.includes("P/L sign") ? bad : ""}`} />
                        <input value={r.price} onChange={(e) => set(r.id, "price", e.target.value)} className={`${cell} ${iss.includes("P/L sign") ? bad : ""}`} />
                        <input value={r.value} onChange={(e) => set(r.id, "value", e.target.value)} className={`${cell} ${iss.includes("value") ? bad : ""}`} />
                        <input value={r.pl} onChange={(e) => set(r.id, "pl", e.target.value)} className={`${cell} ${iss.includes("P/L sign") ? bad : ""} ${(num(r.pl) ?? 0) >= 0 ? "text-emerald-400" : "text-rose-400"}`} />
                        <button type="button" onClick={() => drop(r.id)} title="Usuń wiersz" className="font-mono text-[12px] text-zinc-600 hover:text-rose-400">×</button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element -- local blob preview */}
              {preview && <img src={preview} alt="Zrzut z XTB" className="max-h-56 w-full rounded-sm border border-white/[0.06] object-contain object-top" />}
              <div className="flex flex-col gap-1.5 font-mono text-[11px]">
                <span className="flex justify-between"><span className="text-zinc-600">POSITIONS</span><span className="text-zinc-200">{rows.length}</span></span>
                <span className="flex justify-between"><span className="text-zinc-600">VALUE {meta?.accountCurrency ?? ""}</span><span className="text-zinc-200">{fmt(calc.total)}</span></span>
                {meta?.totalMarketValue != null && (
                  <span className="flex justify-between"><span className="text-zinc-600">XTB TOTAL</span><span className={calc.totalOk ? "text-emerald-400" : "text-amber-400"}>{fmt(meta.totalMarketValue)} {calc.totalOk ? "✓" : "≠"}</span></span>
                )}
                <span className="flex justify-between"><span className="text-zinc-600">P/L</span><span className={calc.plSum >= 0 ? "text-emerald-400" : "text-rose-400"}>{fmt(calc.plSum)}</span></span>
                {meta?.totalProfit != null && (
                  <span className="flex justify-between"><span className="text-zinc-600">XTB P/L</span><span className={calc.plOk ? "text-emerald-400" : "text-amber-400"}>{fmt(meta.totalProfit)} {calc.plOk ? "✓" : "≠"}</span></span>
                )}
                {meta?.model && <span className="pt-1 text-[9.5px] text-zinc-600">{meta.model.toUpperCase()}</span>}
              </div>
            </div>
          </div>

          {(!calc.totalOk || !calc.plOk) && (
            <p className="font-mono text-[11px] text-amber-400">⚠ Suma wierszy nie zgadza się z podsumowaniem z XTB. Porównaj z obrazkiem i popraw liczby.</p>
          )}
          {calc.dupTickers.length > 0 && <p className="font-mono text-[11px] text-rose-400">⚠ Powtórzony ticker: {[...new Set(calc.dupTickers)].join(", ")}</p>}
          {calc.issues.some((x) => x.length) && <p className="font-mono text-[11px] text-rose-400">⚠ Popraw pola zaznaczone na czerwono.</p>}

          <div className="flex flex-wrap items-center justify-end gap-3">
            <button type="button" onClick={() => { setRows(null); setMeta(null); setPreview(null); }} className="font-mono text-[11px] text-zinc-500 hover:text-white">[ NEW SCREENSHOT ]</button>
            <button
              type="button"
              disabled={!calc.ok}
              onClick={confirm}
              className="rounded-sm bg-red-500 px-3.5 py-1.5 text-[12px] font-semibold text-white transition-colors hover:bg-red-400 disabled:cursor-not-allowed disabled:bg-white/[0.06] disabled:text-zinc-600"
            >
              Import {rows.length} positions
            </button>
          </div>
        </>
      )}
    </div>
  );
}
