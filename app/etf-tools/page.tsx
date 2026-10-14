import type { Metadata } from "next";
import MacroNexus from "@/components/MacroNexus";

export const metadata: Metadata = { title: "ETF Tools · Correlation Network — INFERNO" };

/** ETF Tools — default view: cross-asset correlation network (Macro Nexus). */
export default function EtfToolsPage() {
  return (
    <div className="mx-auto flex w-full max-w-[3200px] flex-1 flex-col px-3 py-3">
      <MacroNexus />
    </div>
  );
}
