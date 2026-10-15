"use client";

import { useEffect, useState } from "react";
import { loadPortfolio, parsePortfolio, type Position } from "@/lib/portfolio";

/**
 * The user's saved portfolio positions (browser storage), for the analytical tools:
 * scanner table, market map, correlation network. Empty until mounted / when no portfolio.
 * Re-reads when the portfolio changes in another tab.
 */
export function useMyPortfolio(): Position[] {
  const [pos, setPos] = useState<Position[]>([]);
  useEffect(() => {
    const read = () => {
      const s = loadPortfolio();
      setPos(s ? parsePortfolio(s.prompt).positions : []);
    };
    read();
    const onStorage = (e: StorageEvent) => { if (!e.key || e.key.startsWith("inferno.portfolio")) read(); };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);
  return pos;
}
