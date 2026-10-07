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
      className={`rounded-lg px-3 py-1.5 text-[12px] font-semibold transition-colors ${
        view === v ? "bg-white/[0.08] text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)]" : "text-zinc-500 hover:text-zinc-200"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="flex min-h-[640px] flex-1 flex-col">
      <div className="flex-none px-4 pt-3">
        <div className="inline-flex items-center gap-1 rounded-xl border border-white/[0.05] bg-[#0a0a0c] p-1">
          {tab("table", "Table Scanner")}
          {tab("map", "Market Map")}
          <Link
            href="/chat"
            title="AI Chat"
            className="ml-0.5 rounded-md bg-violet-500/15 px-2 py-1 text-[10px] font-bold text-violet-300 transition-colors hover:bg-violet-500/25"
          >
            AI
          </Link>
        </div>
      </div>
      <div className="relative min-h-0 flex-1">
        {view === "table" ? <EtfTableScanner /> : <InfernoEtfScanner />}
      </div>
    </div>
  );
}
