import type { Metadata } from "next";
import Watchlist from "@/components/Watchlist";

export const metadata: Metadata = { title: "Watchlist — OASIS" };

export default function WatchlistPage() {
  return (
    <div className="mx-auto flex w-full max-w-[3200px] flex-1 flex-col px-3 py-3">
      <Watchlist />
    </div>
  );
}
