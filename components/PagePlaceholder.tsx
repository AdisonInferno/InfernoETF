import Link from "next/link";

interface PagePlaceholderProps {
  title: string;
  description: string;
}

export default function PagePlaceholder({ title, description }: PagePlaceholderProps) {
  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-1 flex-col px-6 py-6">
      <section className="flex flex-1 flex-col items-center justify-center gap-4 rounded-3xl border border-white/[0.04] bg-[#0a0a0c] p-12 text-center">
        <span className="font-mono text-[11px] font-semibold tracking-[0.14em] text-zinc-500">[ COMING SOON ]</span>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-50">{title}</h1>
        <p className="max-w-md text-sm text-zinc-500">{description}</p>
        <Link
          href="/scanner"
          className="mt-2 rounded-xl bg-white/[0.05] px-4 py-2 text-xs font-semibold text-zinc-300 transition-colors hover:bg-white/10 hover:text-white"
        >
          ← Back to scanner
        </Link>
      </section>
    </div>
  );
}
