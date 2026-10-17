"use client";

import Link from "next/link";
import { useState } from "react";
import EtfTableScanner from "@/components/EtfTableScanner";
import InfernoEtfScanner from "@/components/InfernoEtfScanner";

type View = "table" | "map";

export default function ScannerShell() {
  const [view, setView] = useState<View>("table");

  const tab = (v: View, label: string) => (
    <button
      type="button"
      onClick={() => setView(v)}
      className={`rounded-sm px-3 py-1.5 font-mono text-[11px] font-bold tracking-[0.1em] transition-colors ${
        view === v ? "oasis-on" : "text-zinc-500 hover:text-zinc-200"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="flex min-h-[640px] flex-1 flex-col">
      <div className="flex-none px-4 pt-3">
        <div className="inline-flex items-center gap-1 rounded-sm border border-white/[0.06] bg-[#0a0a0c] p-1">
          {tab("table", "[ TABLE ]")}
          {tab("map", "[ MARKET MAP ]")}
          <Link
            href="/chat"
            title="Query terminal"
            className="ml-0.5 rounded-sm border border-white/[0.06] px-2 py-1 font-mono text-[10px] font-bold tracking-[0.1em] text-zinc-400 transition-colors hover:text-white"
          >
            [ QUERY ]
          </Link>
        </div>
      </div>
      <div className="relative min-h-0 flex-1">
        {view === "table" ? <EtfTableScanner /> : <InfernoEtfScanner />}
      </div>
    </div>
  );
}
