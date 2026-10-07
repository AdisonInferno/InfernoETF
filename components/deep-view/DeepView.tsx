"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { FundData, SubTab } from "./types";
import { sg, usd } from "./utils";
import Overview from "./Overview";
import CompositionMap from "./CompositionMap";
import ChartsTab from "./ChartsTab";

const TABS: [SubTab, string][] = [
  ["OV", "OVERVIEW"], ["MAP", "COMPOSITION MAP"], ["SEAS", "CHARTS"], ["DIV", "DIVIDEND RADAR"], ["BT", "BACKTESTER"],
];

interface Props {
  fund: FundData;
  onBack?: () => void;
  onSelectAlt?: (tic: string) => void;
}

export default function DeepView({ fund, onBack, onSelectAlt }: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<SubTab>("OV");
  const back = onBack ?? (() => (window.history.length > 1 ? router.back() : router.push("/scanner")));
  const selectAlt = onSelectAlt ?? ((tic: string) => router.push(`/etf/${tic}`));
  const up = fund.dayPct >= 0;

  return (
    <div key={fund.tic} className="animate-inf-take flex min-h-full min-w-0 flex-col bg-[#09090b] font-display text-[#e6e6e6]">
      <header className="flex flex-col gap-3.5 border-b border-white/[0.06] px-5 pt-3.5">
        <div className="flex items-center justify-between gap-3">
          <button type="button" onClick={back} className="font-mono text-[11px] font-semibold tracking-[0.14em] text-gray-500 hover:text-white">[ ← BACK TO SCANNER ]</button>
          <span className="whitespace-nowrap font-mono text-[10px] tracking-[0.12em] text-gray-600">
            SCANNER / {fund.category} / <span className="text-gray-400">{fund.tic}</span>
          </span>
        </div>

        <div className="flex flex-wrap items-end gap-x-[22px] gap-y-2.5">
          <span className="text-[56px] font-bold leading-[0.82] tracking-[0.01em] text-white">{fund.tic}</span>
          <span className="pb-0.5 text-xl font-medium tracking-[0.02em] text-neutral-400">{fund.name}</span>
          <div className="ml-auto flex items-baseline gap-3 font-mono tabular-nums">
            <span className="text-[30px] font-semibold text-neutral-100">{usd(fund.price)}</span>
            <span className={`text-[13px] font-bold ${up ? "text-emerald-400" : "text-red-500"}`}>{sg(fund.dayPct)}</span>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 py-0.5">
          {fund.meta.map(([k, v]) => (
            <div key={k} className="flex h-7 items-center gap-2 whitespace-nowrap rounded-xl border border-white/[0.03] bg-black/30 px-3">
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
              className="flex items-center gap-2 whitespace-nowrap rounded-full border border-white/[0.04] bg-white/5 px-3 py-1 font-geist text-xs tabular-nums text-zinc-100 transition-colors hover:border-emerald-400/25 hover:bg-emerald-400/10"
            >
              [ {a.tic} ] <span className="font-semibold text-emerald-400">{a.ter.toFixed(2)}%</span>
            </button>
          ))}
        </div>

        <nav className="mt-1 flex flex-wrap gap-x-8">
          {TABS.map(([k, l]) => {
            const on = tab === k;
            return (
              <button
                key={k}
                type="button"
                onClick={() => setTab(k)}
                className={`-mb-px whitespace-nowrap border-b-2 pb-2.5 pt-2 font-mono text-[13px] font-semibold uppercase tracking-[0.06em] ${
                  on ? "border-green-500 text-white" : "border-transparent text-gray-500 hover:text-gray-300"
                }`}
              >
                [ {l} ]
              </button>
            );
          })}
        </nav>
      </header>

      {tab === "OV" && <Overview fund={fund} />}
      {tab === "MAP" && <CompositionMap fund={fund} />}
      {tab === "SEAS" && <ChartsTab fund={fund} />}
      {(tab === "DIV" || tab === "BT") && (
        <div className="m-3 mt-6 flex min-h-[320px] flex-1 flex-col items-center justify-center gap-2 border border-dashed border-gray-800 font-mono">
          <span className="text-xs font-bold tracking-[0.16em] text-gray-400">{tab === "DIV" ? "DIVIDEND RADAR" : "BACKTESTER"}</span>
          <span className="text-[10px] tracking-[0.12em] text-gray-600">MODULE NOT YET BUILT</span>
        </div>
      )}
    </div>
  );
}
