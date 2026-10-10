import NewsArchivePanel from "@/components/NewsArchivePanel";

export default function NewsArchivePage() {
  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-4 px-6 py-6">
      <div className="font-mono text-[10px] tracking-[0.14em] text-zinc-600">
        [ DASHBOARD / NEWS / <span className="text-zinc-300">ARCHIVE</span> ]
      </div>
      <NewsArchivePanel />
    </div>
  );
}
