"use client";

/* ─────────────────────────────────────────────────────────────
   WATCHLIST STORE — one place for every saved list, used by any page:
     · favorites  — starred tickers (☆ FAVORITE in the scanner cockpit, ★ on the watchlist)
     · groups     — user-made lists ("CREATE GROUP")
     · portfolio  — tickers of the saved portfolio (read from the portfolio store)
   Persisted in browser storage; every page using `useWatchlist()` stays in sync
   (same tab via an event, other tabs via the storage event).
   ───────────────────────────────────────────────────────────── */

import { useEffect, useState } from "react";
import { loadPortfolio, parsePortfolio } from "@/lib/portfolio";

export const FAV_KEY = "inferno.favorites.v1";
const GROUPS_KEY = "inferno.watchlist.groups.v1";
const EVT = "inferno:watchlist";

export interface WatchGroup { id: string; name: string; tickers: string[] }
export interface WatchState { favorites: string[]; groups: WatchGroup[]; portfolio: { ticker: string; weight: number }[] }

const read = <T,>(k: string, d: T): T => {
  try { return JSON.parse(window.localStorage.getItem(k) ?? "null") ?? d; } catch { return d; }
};
const write = (k: string, v: unknown) => {
  try { window.localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ }
  window.dispatchEvent(new Event(EVT));
};
const norm = (t: string) => t.trim().toUpperCase().replace(/[^A-Z0-9.^=-]/g, "").slice(0, 12);

export function readWatch(): WatchState {
  const p = loadPortfolio();
  return {
    favorites: read<string[]>(FAV_KEY, []),
    groups: read<WatchGroup[]>(GROUPS_KEY, []),
    portfolio: p ? parsePortfolio(p.prompt).positions.map((x) => ({ ticker: x.asset.ticker, weight: x.weight })) : [],
  };
}

/* ── mutations (work from any page) ── */
export function toggleFavorite(t: string) {
  const k = norm(t), cur = read<string[]>(FAV_KEY, []);
  write(FAV_KEY, cur.includes(k) ? cur.filter((x) => x !== k) : [k, ...cur]);
}
export function addFavorite(t: string) { const k = norm(t), cur = read<string[]>(FAV_KEY, []); if (k && !cur.includes(k)) write(FAV_KEY, [k, ...cur]); }
export function createGroup(name: string, tickers: string[] = []): string {
  const id = `g${Date.now().toString(36)}`;
  write(GROUPS_KEY, [...read<WatchGroup[]>(GROUPS_KEY, []), { id, name: name.trim().slice(0, 32) || "NEW GROUP", tickers: [...new Set(tickers.map(norm).filter(Boolean))] }]);
  return id;
}
export function renameGroup(id: string, name: string) { write(GROUPS_KEY, read<WatchGroup[]>(GROUPS_KEY, []).map((g) => (g.id === id ? { ...g, name: name.trim().slice(0, 32) || g.name } : g))); }
export function deleteGroup(id: string) { write(GROUPS_KEY, read<WatchGroup[]>(GROUPS_KEY, []).filter((g) => g.id !== id)); }
export function addToGroup(id: string, t: string) {
  const k = norm(t);
  if (k) write(GROUPS_KEY, read<WatchGroup[]>(GROUPS_KEY, []).map((g) => (g.id === id && !g.tickers.includes(k) ? { ...g, tickers: [...g.tickers, k] } : g)));
}
export function removeFromGroup(id: string, t: string) { write(GROUPS_KEY, read<WatchGroup[]>(GROUPS_KEY, []).map((g) => (g.id === id ? { ...g, tickers: g.tickers.filter((x) => x !== t) } : g))); }
export function removeFavorite(t: string) { write(FAV_KEY, read<string[]>(FAV_KEY, []).filter((x) => x !== t)); }

/** Live view of every list. Empty until mounted (browser storage). */
export function useWatchlist(): WatchState {
  const [s, setS] = useState<WatchState>({ favorites: [], groups: [], portfolio: [] });
  useEffect(() => {
    const sync = () => setS(readWatch());
    sync();
    const onStorage = (e: StorageEvent) => { if (!e.key || e.key.startsWith("inferno.")) sync(); };
    window.addEventListener(EVT, sync);
    window.addEventListener("storage", onStorage);
    return () => { window.removeEventListener(EVT, sync); window.removeEventListener("storage", onStorage); };
  }, []);
  return s;
}
