"use client";

import { useState } from "react";
import MacroNexus from "@/components/MacroNexus";
import SectorSplitView from "@/components/SectorSplitView";

const TOOLS = [["split", "SECTOR SPLIT"], ["nexus", "CORRELATION NETWORK"]] as const;

/** ETF Tools: switch between the sector master/detail view and the Macro Nexus network. */
export default function EtfTools() {
  const [tool, setTool] = useState<(typeof TOOLS)[number][0]>("split");
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <nav className="flex gap-1 font-mono">
        {TOOLS.map(([k, l]) => (
          <button key={k} type="button" onClick={() => setTool(k)} aria-pressed={tool === k}
            className={`h-8 rounded-sm border px-3 text-[11px] font-bold tracking-[0.1em] transition-colors ${tool === k ? "border-white/[0.15] bg-white/[0.08] text-white" : "border-white/[0.05] text-zinc-500 hover:text-zinc-200"}`}>
            [ {l} ]
          </button>
        ))}
      </nav>
      {tool === "split" ? <SectorSplitView /> : <MacroNexus />}
    </div>
  );
}
