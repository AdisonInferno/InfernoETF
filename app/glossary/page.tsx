import type { Metadata } from "next";

export const metadata: Metadata = { title: "Glossary — OASIS" };

/** Glossary — key investing terms for beginners. Empty for now; terms will be added later. */
export default function GlossaryPage() {
  return (
    <div className="mx-auto flex w-full max-w-[1200px] flex-1 flex-col gap-5 px-3 py-6">
      <header className="flex flex-col gap-1.5">
        <h1 className="m-0 text-[28px] font-semibold tracking-[0.01em] text-zinc-50">Glossary</h1>
        <p className="m-0 max-w-xl text-[14px] leading-relaxed text-zinc-500">
          The most important investing terms, explained simply — a calm starting point for beginners.
        </p>
      </header>

      <section className="oasis-glass flex min-h-[360px] flex-1 items-center justify-center border border-white/[0.06] bg-[var(--oasis-panel)] p-10">
        <p className="m-0 text-[13px] text-zinc-600">No terms yet.</p>
      </section>
    </div>
  );
}
