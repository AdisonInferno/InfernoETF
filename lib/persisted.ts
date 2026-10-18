"use client";

/* Small persisted UI preferences (collapsed panels, chosen indicators…) in localStorage.
   useSyncExternalStore keeps server and first client render identical (server = fallback),
   and every component using the same key stays in sync. */

import { useCallback, useSyncExternalStore } from "react";

const listeners = new Map<string, Set<() => void>>();
const cache = new Map<string, { raw: string | null; val: unknown }>();

function read<T>(key: string, fallback: T): T {
  let raw: string | null = null;
  try { raw = window.localStorage.getItem(key); } catch { /* private mode */ }
  const hit = cache.get(key);
  if (hit && hit.raw === raw) return hit.val as T;
  let val: T = fallback;
  if (raw != null) { try { val = JSON.parse(raw) as T; } catch { /* corrupt → fallback */ } }
  cache.set(key, { raw, val });
  return val;
}

export function usePersisted<T>(key: string, fallback: T): [T, (v: T) => void] {
  const subscribe = useCallback((cb: () => void) => {
    const set = listeners.get(key) ?? new Set();
    set.add(cb);
    listeners.set(key, set);
    return () => { set.delete(cb); };
  }, [key]);
  const value = useSyncExternalStore(subscribe, () => read(key, fallback), () => fallback);
  const setValue = useCallback((v: T) => {
    try { window.localStorage.setItem(key, JSON.stringify(v)); } catch { /* ignore */ }
    cache.delete(key);
    listeners.get(key)?.forEach((cb) => cb());
  }, [key]);
  return [value, setValue];
}
