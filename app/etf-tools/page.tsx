import type { Metadata } from "next";
import EtfTools from "@/components/EtfTools";

export const metadata: Metadata = { title: "ETF Tools — INFERNO" };

/** ETF Tools — sector split (master/detail) and the cross-asset correlation network. */
export default function EtfToolsPage() {
  return (
    <div className="mx-auto flex w-full max-w-[3200px] flex-1 flex-col px-3 py-3">
      <EtfTools />
    </div>
  );
}
