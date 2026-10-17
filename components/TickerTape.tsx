"use client";

/* Scrolling market ticker under the main menu. Pure CSS animation (see globals.css).
   Live values from Yahoo (futures / indices) via the shared market snapshot; the numbers below are only
   the fallback shown until the first update arrives (or when Yahoo is unreachable). */
import { useSnapshot } from "@/lib/market-snapshot";

type Flag = "us" | "de" | "eu" | "jp";

interface TickerItem {
  label: string;
  /** Yahoo symbol for the live value */
  sym?: string;
  /** "$", "€", "¥", "" (index points) or "%" (yields) */
  unit?: string;
  value: string;
  chg?: number;
  icon?: string;
  flag?: Flag;
}

const ITEMS: TickerItem[] = [
  { label: "GOLD", sym: "GC=F", unit: "$", value: "$2,640", chg: 0.65, icon: "🥇" },
  { label: "SILVER", sym: "SI=F", unit: "$", value: "$31.50", chg: 1.2, icon: "🥈" },
  { label: "COPPER", sym: "HG=F", unit: "$", value: "$4.35", chg: 0.8, icon: "🟧" },
  { label: "CRUDE OIL", sym: "CL=F", unit: "$", value: "$71.20", chg: -1.15, icon: "🛢️" },
  { label: "NAT GAS", sym: "NG=F", unit: "$", value: "$2.85", chg: 2.4, icon: "🔥" },
  { label: "US 10Y", sym: "^TNX", unit: "%", value: "4.28%", icon: "🏛️" },
  { label: "VIX", sym: "^VIX", unit: "", value: "14.50", chg: -2.1, icon: "⚠️" },
  { label: "USD", sym: "DX-Y.NYB", unit: "", value: "103.50", chg: 0.15, icon: "💲" },
  { label: "S&P 500", sym: "^GSPC", unit: "", value: "$582.40", chg: 0.84, flag: "us" },
  { label: "NASDAQ", sym: "^IXIC", unit: "", value: "$498.20", chg: 1.42, flag: "us" },
  { label: "DAX", sym: "^GDAXI", unit: "", value: "€19,210", chg: 0.45, flag: "de" },
  { label: "EU 50", sym: "^STOXX50E", unit: "", value: "€5,120", chg: 0.3, flag: "eu" },
  { label: "NIKKEI", sym: "^N225", unit: "", value: "¥38,500", chg: -0.6, flag: "jp" },
];

/* Inline SVG flags — Windows does not render flag emoji. */
function FlagIcon({ flag }: { flag: Flag }) {
  const common = { width: 18, height: 12, className: "flex-none rounded-[2px]" } as const;
  switch (flag) {
    case "us":
      return (
        <svg {...common} viewBox="0 0 18 12">
          <rect width="18" height="12" fill="#fff" />
          {[0, 2, 4, 6, 8, 10].map((y) => <rect key={y} y={y} width="18" height="1" fill="#b22234" />)}
          <rect width="8" height="6.5" fill="#3c3b6e" />
        </svg>
      );
    case "de":
      return (
        <svg {...common} viewBox="0 0 18 12">
          <rect width="18" height="4" fill="#000" />
          <rect y="4" width="18" height="4" fill="#dd0000" />
          <rect y="8" width="18" height="4" fill="#ffce00" />
        </svg>
      );
    case "eu":
      return (
        <svg {...common} viewBox="0 0 18 12">
          <rect width="18" height="12" fill="#003399" />
          {Array.from({ length: 12 }, (_, i) => {
            const a = (i / 12) * Math.PI * 2;
            return <circle key={i} cx={(9 + Math.cos(a) * 3.6).toFixed(3)} cy={(6 + Math.sin(a) * 3.6).toFixed(3)} r="0.55" fill="#ffcc00" />;
          })}
        </svg>
      );
    case "jp":
      return (
        <svg {...common} viewBox="0 0 18 12">
          <rect width="18" height="12" fill="#fff" />
          <circle cx="9" cy="6" r="3.4" fill="#bc002d" />
        </svg>
      );
  }
}

function Item({ it }: { it: TickerItem }) {
  const up = (it.chg ?? 0) >= 0;
  return (
    <div className="flex flex-none items-center gap-2 border-r border-white/[0.06] px-5 font-mono text-[12px] whitespace-nowrap">
      {it.flag && <FlagIcon flag={it.flag} />}
      <span className="text-zinc-500">{it.label}:</span>
      <span className="font-semibold text-zinc-100">{it.value}</span>
      {it.chg !== undefined && (
        <span className={up ? "text-emerald-400" : "text-rose-400"}>
          ({up ? "+" : "-"}
          {Math.abs(it.chg).toFixed(2)}%)
        </span>
      )}
    </div>
  );
}

const fmtLive = (v: number, unit = "") =>
  unit === "%" ? `${v.toFixed(2)}%` : `${unit}${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function TickerTape() {
  const snap = useSnapshot(ITEMS.flatMap((i) => (i.sym ? [i.sym] : [])));
  const items = ITEMS.map((it) => {
    const s = it.sym ? snap[it.sym.toUpperCase()] : null;
    return s ? { ...it, value: fmtLive(s.price, it.unit), chg: it.unit === "%" ? undefined : s.chg1d } : it;
  });
  return (
    <div className="ticker-mask group relative h-9 w-full overflow-hidden border-y border-white/[0.06] bg-[var(--oasis-panel)]">
      {/* TV-style crawl: two identical halves slide left forever; -50% lands exactly on the copy.
          Each half repeats the list twice so it is wider than even ultra-wide screens. Hover pauses. */}
      <div className="animate-ticker flex h-full w-max items-center will-change-transform group-hover:[animation-play-state:paused]">
        {[0, 1].map((half) => (
          <div key={half} aria-hidden={half === 1} className="flex flex-none items-center">
            {[...items, ...items].map((it, i) => (
              <Item key={i} it={it} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
