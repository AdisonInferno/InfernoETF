"use client";

import { ConcentrationNotice } from "@/components/RiskNotice";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { FundData, SubTab } from "./types";
import { sg } from "./utils";
import Overview from "./Overview";
import CompositionMap from "./CompositionMap";
import ChartsTab from "./ChartsTab";
import EtfNewsPanel from "@/components/EtfNewsPanel";
import { useSnapshot } from "@/lib/market-snapshot";
import type { ChartTf } from "@/components/InfernoChart";
import { currencyOf, formatMarketValue } from "@/lib/format";

const TABS: [SubTab, string][] = [
  ["OV", "OVERVIEW"], ["MAP", "COMPOSITION"], ["SEAS", "CHARTS"], ["NEWS", "NEWS"],
];

/** header chips already shown in the Overview metric strip */
const OV_STRIP_KEYS = new Set(["EXPENSE RATIO", "ASSETS (AUM)"]);

interface Props {
  fund: FundData;
  onBack?: () => void;
  onSelectAlt?: (tic: string) => void;
  /** chart timeframe to open on (e.g. the market-map timeframe the user came from) */
  initialTf?: ChartTf;
}

export default function DeepView({ fund, onBack, onSelectAlt, initialTf }: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<SubTab>("OV");
  const back = onBack ?? (() => (window.history.length > 1 ? router.back() : router.push("/scanner")));
  const selectAlt = onSelectAlt ?? ((tic: string) => router.push(`/etf/${tic}`));
  // today's real price / move (Yahoo); database values only as fallback
  const live = useSnapshot([fund.tic])[fund.tic];
  const price = live?.price ?? fund.price, dayPct = live?.chg1d ?? fund.dayPct;
  const up = dayPct >= 0;
  const ccy = currencyOf(fund.tic, { currency: live?.currency ?? fund.meta.find(([k]) => k === "CURRENCY")?.[1] });

  return (
    /* lg+: the deep view is locked to the viewport — Overview / Composition Map / Charts fit without page scroll,
       only the News list scrolls inside its own area. Smaller screens scroll normally. */
    <div key={fund.tic} className="animate-inf-take flex min-h-full min-w-0 flex-col bg-[var(--oasis-bg)] font-display text-zinc-200 lg:h-full lg:min-h-0 lg:overflow-hidden">
      <header className="flex flex-none flex-col gap-2 border-b border-white/[0.05] px-5 pt-2.5">
        <div className="flex items-center justify-between gap-3">
          <button type="button" onClick={back} className="font-mono text-[11px] font-semibold tracking-[0.14em] text-gray-500 hover:text-white">[ ← BACK TO SCANNER ]</button>
          <span className="whitespace-nowrap font-mono text-[10px] tracking-[0.12em] text-gray-600">
            SCANNER / {fund.category} / <span className="text-gray-400">{fund.tic}</span>
          </span>
        </div>

        <div className="flex flex-wrap items-end gap-x-[18px] gap-y-2">
          <span className="text-[40px] font-bold leading-[0.82] tracking-[0.01em] text-white">{fund.tic}</span>
          <span className="pb-0.5 text-xl font-medium tracking-[0.02em] text-neutral-400">{fund.name}</span>
          <div className="ml-auto flex items-baseline gap-3 font-mono tabular-nums">
            <span className="text-[24px] font-semibold text-neutral-100">{formatMarketValue(price, ccy)}</span>
            <span className={`text-[13px] font-bold ${up ? "text-emerald-400" : "text-red-500"}`}>{sg(dayPct)}</span>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5">
          <span className="flex h-6 items-center whitespace-nowrap border border-oasis/50 bg-oasis-muted px-2.5 font-mono text-[11px] font-bold tracking-[0.12em] text-oasis" title="Quote currency of this listing — prices on this page are in it">[ CURRENCY: {ccy} ]</span>
          {/* AUM / TER live in the Overview metric strip — shown here only on the other tabs to keep context without repeating them */}
          {fund.meta.filter(([k]) => k !== "CURRENCY" && (tab !== "OV" || !OV_STRIP_KEYS.has(k))).map(([k, v]) => (
            <div key={k} className="flex h-6 items-center gap-2 whitespace-nowrap rounded-sm border border-white/[0.05] bg-[var(--oasis-bg)] px-2.5">
              <span className="font-display text-[10.5px] font-semibold tracking-[0.12em] text-gray-400">{k}:</span>
              <span className="font-mono text-xs font-semibold text-neutral-100">{v}</span>
            </div>
          ))}
          {fund.alts.length > 0 && <span className="mx-1 ml-2 self-center font-sans text-[10.5px] font-semibold tracking-[0.12em] text-zinc-500">LOWER TER</span>}
          {fund.alts.map((a) => (
            <button
              key={a.tic}
              type="button"
              onClick={() => selectAlt(a.tic)}
              title={`${a.name} · −${(fund.ter - a.ter).toFixed(2)}% vs ${fund.tic}`}
              className="flex items-center gap-2 whitespace-nowrap rounded-none border border-white/[0.06] bg-white/5 px-3 py-1 font-geist text-xs tabular-nums text-zinc-100 transition-colors hover:border-emerald-400/25 hover:bg-emerald-400/10"
            >
              [ {a.tic} ] <span className="font-semibold text-emerald-400">{a.ter.toFixed(2)}%</span>
            </button>
          ))}
        </div>

        <nav className="flex flex-wrap gap-x-7">
          {TABS.map(([k, l]) => {
            const on = tab === k;
            return (
              <button
                key={k}
                type="button"
                onClick={() => setTab(k)}
                className={`-mb-px whitespace-nowrap border-b-2 pb-2 pt-1 font-mono text-[12px] font-semibold uppercase tracking-[0.06em] ${
                  on ? "oasis-tab" : "border-transparent text-gray-500 hover:text-gray-300"
                }`}
              >
                [ {l} ]
              </button>
            );
          })}
        </nav>
      </header>

      <div className={`flex min-h-0 min-w-0 flex-1 flex-col ${tab === "NEWS" ? "lg:overflow-y-auto" : "lg:overflow-hidden"}`}>
        {tab === "OV" && <Overview fund={fund} initialTf={initialTf} />}
        {tab === "MAP" && <CompositionMap fund={fund} fill notice={<ConcentrationNotice fund={fund} />} />}
        {tab === "SEAS" && <ChartsTab fund={fund} fill />}
        {tab === "NEWS" && <div className="flex flex-none flex-col px-5 pb-12 pt-4"><EtfNewsPanel ticker={fund.tic} /></div>}
      </div>
    </div>
  );
}
