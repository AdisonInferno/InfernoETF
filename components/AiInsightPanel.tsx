"use client";

import { useState, useTransition } from "react";
import { analyzeSectorNews, type AnalysisResult, type Sentiment } from "@/app/news/actions";
import { SECTORS, type Sector } from "@/lib/news";

/* AI insight with full transparency: the answer, then the exact articles (and, on demand,
   the exact prompt) that produced it. */

const label = "font-mono text-[10px] font-bold tracking-[0.16em] text-zinc-500";

const SENTIMENT_STYLE: Record<Sentiment, string> = {
  BULLISH: "border-emerald-400/40 bg-emerald-400/10 text-emerald-400",
  BEARISH: "border-rose-400/40 bg-rose-400/10 text-rose-400",
  NEUTRAL: "border-zinc-500/40 bg-white/[0.04] text-zinc-300",
};

export default function AiInsightPanel({ initialSector = "tech" }: { initialSector?: Sector }) {
  const [sector, setSector] = useState<Sector>(initialSector);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [pending, startTransition] = useTransition();

  const run = (s: Sector = sector) =>
    startTransition(async () => {
      setShowPrompt(false);
      setResult(await analyzeSectorNews(s));
    });

  const cited = new Set(result?.ok ? result.insight.cited : []);

  return (
    <section className="flex flex-col overflow-hidden rounded-2xl border border-white/[0.05] bg-[#0a0a0c]">
      {/* Header */}
      <header className="flex flex-wrap items-center gap-3 border-b border-white/[0.05] px-5 py-3">
        <span className="flex items-center gap-2 font-mono text-[11px] font-bold tracking-[0.18em] text-neutral-200">
          <span className="text-purple-400">✦</span> AI SECTOR INSIGHT
        </span>
        <div className="flex rounded-lg border border-white/[0.05] bg-[#030303] p-0.5">
          {SECTORS.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => { setSector(s.id); setResult(null); }}
              className={`h-7 rounded-md px-3 font-mono text-[11px] font-bold tracking-[0.06em] transition-colors ${s.id === sector ? "bg-white/[0.08] text-white" : "text-zinc-500 hover:text-zinc-200"}`}
            >
              {s.label.toUpperCase()}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => run()}
          disabled={pending}
          className="ml-auto flex h-8 items-center gap-2 border border-purple-400/60 px-3.5 font-mono text-[11px] font-bold tracking-[0.12em] text-purple-300 transition-colors hover:bg-purple-400 hover:text-black disabled:pointer-events-none disabled:opacity-50"
        >
          {pending ? "[ ANALYZING… ]" : result ? "[ ↻ RE-RUN ]" : "[ ANALYZE NEWS ]"}
        </button>
      </header>

      {/* AI response */}
      <div className="px-5 py-5" aria-live="polite">
        {pending ? (
          <div className="flex flex-col gap-2.5">
            <div className="h-3 w-24 animate-pulse rounded bg-white/[0.06]" />
            <div className="h-3 w-full animate-pulse rounded bg-white/[0.05]" />
            <div className="h-3 w-4/5 animate-pulse rounded bg-white/[0.05]" />
          </div>
        ) : !result ? (
          <p className="font-mono text-[12px] text-zinc-500">
            Run the analysis to summarise the latest {SECTORS.find((s) => s.id === sector)?.label} headlines. The model sees only the articles listed under Sources Used.
          </p>
        ) : result.ok ? (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <span className={`rounded border px-2.5 py-1 font-mono text-[12px] font-bold tracking-[0.14em] ${SENTIMENT_STYLE[result.insight.sentiment]}`}>
                {result.insight.sentiment}
              </span>
              <span className="font-mono text-[10px] tracking-[0.1em] text-zinc-600">
                {result.model.toUpperCase()} · {new Date(result.generatedAt).toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" })}
              </span>
            </div>
            <p className="m-0 max-w-[80ch] text-pretty text-[15px] leading-relaxed text-zinc-100">{result.insight.summary}</p>
          </div>
        ) : (
          <p className="m-0 font-mono text-[12px] text-rose-400">⚠ {result.error}</p>
        )}
      </div>

      {/* Sources used — the exact articles sent to the model */}
      {result && (
        <div className="border-t border-white/[0.05] bg-[#030303]/50 px-5 py-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <span className={label}>SOURCES USED · {result.sources.length}</span>
            {result.ok && (
              <button type="button" onClick={() => setShowPrompt((v) => !v)} className="font-mono text-[10px] font-bold tracking-[0.12em] text-zinc-500 hover:text-white" aria-expanded={showPrompt}>
                {showPrompt ? "[ HIDE PROMPT ]" : "[ VIEW EXACT PROMPT ]"}
              </button>
            )}
          </div>

          <ol className="m-0 flex list-none flex-col gap-2 p-0">
            {result.sources.map((a) => {
              const isCited = cited.has(a.id);
              return (
                <li key={a.id} className={`flex gap-3 rounded-lg border px-3.5 py-3 ${isCited ? "border-purple-400/30 bg-purple-400/[0.04]" : "border-white/[0.05] bg-black/20"}`}>
                  <span className={`mt-0.5 flex h-6 w-7 flex-none items-center justify-center rounded font-mono text-[10.5px] font-bold ${isCited ? "bg-purple-400/15 text-purple-300" : "bg-white/[0.05] text-zinc-500"}`}>{a.id}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      <span className="text-[13.5px] font-semibold text-zinc-100">{a.title}</span>
                      {isCited && <span className="font-mono text-[9.5px] font-bold tracking-[0.14em] text-purple-300">CITED</span>}
                    </div>
                    <div className="mt-0.5 font-mono text-[10.5px] tracking-[0.06em] text-zinc-500">{a.source} · {a.date}</div>
                    <p className="m-0 mt-1.5 text-[12.5px] leading-relaxed text-zinc-400">{a.snippet}</p>
                  </div>
                </li>
              );
            })}
          </ol>

          {result.ok && showPrompt && (
            <div className="mt-3 flex flex-col gap-2">
              <span className={label}>SYSTEM INSTRUCTION</span>
              <pre className="m-0 whitespace-pre-wrap rounded-lg border border-white/[0.05] bg-black/40 p-3 font-mono text-[11px] leading-relaxed text-zinc-400">{result.systemInstruction}</pre>
              <span className={label}>PROMPT</span>
              <pre className="m-0 max-h-72 overflow-auto whitespace-pre-wrap rounded-lg border border-white/[0.05] bg-black/40 p-3 font-mono text-[11px] leading-relaxed text-zinc-400">{result.prompt}</pre>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
