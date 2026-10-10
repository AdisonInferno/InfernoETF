import AiInsightPanel from "@/components/AiInsightPanel";

export default function NewsPage() {
  return (
    <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-4 px-6 py-6">
      <div className="font-mono text-[10px] tracking-[0.14em] text-zinc-600">[ DASHBOARD / <span className="text-zinc-300">NEWS</span> ]</div>
      <AiInsightPanel />
    </div>
  );
}
