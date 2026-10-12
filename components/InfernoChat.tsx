"use client";

import { useEffect, useRef, useState } from "react";

type Message = { role: "user" | "assistant"; content: string };

const SUGGESTIONS = [
  "Czym różni się VOO od VTI?",
  "Co to jest TER i dlaczego ma znaczenie?",
  "Jak zdywersyfikować portfel ETF?",
];

export default function InfernoChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  // "Ask AI" from the scanner opens /chat?etf=TICKER — prefill a question.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const q = params.get("q");
    if (q) { setInput(q); return; }
    const etf = params.get("etf");
    if (etf) setInput(`Opowiedz mi o ETF ${etf.toUpperCase()}: co zawiera, ile kosztuje (TER) i jakie ma ryzyka?`);
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send(text: string) {
    const content = text.trim();
    if (!content || loading) return;

    const history: Message[] = [...messages, { role: "user", content }];
    setMessages([...history, { role: "assistant", content: "" }]);
    setInput("");
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history }),
      });

      if (!res.ok || !res.body) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? `HTTP ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        setMessages([...history, { role: "assistant", content: acc }]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Coś poszło nie tak.");
      setMessages(history);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-[480px] w-full max-w-[1100px] flex-1 flex-col gap-4 px-3 py-3">
      <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-sm border border-white/[0.06] bg-[#0a0a0c]">
        <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-4">
          <span className="font-mono text-[11px] font-bold tracking-[0.16em] text-zinc-300">[ QUERY TERMINAL ]</span>
          {messages.length > 0 && (
            <button
              type="button"
              onClick={() => { setMessages([]); setError(null); }}
              disabled={loading}
              className="font-mono text-[10.5px] tracking-[0.1em] text-zinc-500 transition-colors hover:text-white disabled:opacity-40"
            >
              [ CLEAR ]
            </button>
          )}
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
          {messages.length === 0 && (
            <div className="flex flex-col gap-2 font-mono">
              <span className="text-[10.5px] tracking-[0.14em] text-zinc-500">[ SCOPE ] TER · HOLDINGS · RISK · COMPARISON — FACTS ONLY, NOT ADVICE</span>
              <div className="flex flex-wrap gap-1.5">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => send(s)}
                    className="rounded-sm border border-white/[0.06] bg-[#030303] px-2.5 py-1 font-mono text-[11px] text-zinc-400 transition-colors hover:text-white"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Session log: one row per entry, prefix column instead of chat bubbles */}
          {messages.map((m, i) => (
            <div key={i} className={`grid grid-cols-[64px_minmax(0,1fr)] gap-3 border-b border-white/[0.06] pb-3 ${m.role === "user" ? "" : "text-zinc-200"}`}>
              <span className={`pt-0.5 font-mono text-[10px] font-bold tracking-[0.12em] ${m.role === "user" ? "text-red-400" : "text-zinc-500"}`}>
                {m.role === "user" ? "> QUERY" : "< RESP"}
              </span>
              <div className={`whitespace-pre-wrap text-[13px] leading-relaxed ${m.role === "user" ? "font-mono text-zinc-50" : ""}`}>
                {m.content || <span className="animate-pulse font-mono text-zinc-500">█</span>}
              </div>
            </div>
          ))}
          <div ref={endRef} />
        </div>

        {error && (
          <div className="mx-5 mb-3 rounded-sm border border-rose-500/20 bg-rose-500/10 px-4 py-2.5 text-xs text-rose-300">{error}</div>
        )}

        <form
          onSubmit={(e) => { e.preventDefault(); send(input); }}
          className="flex items-end gap-2 border-t border-white/[0.06] bg-[#0a0a0c] p-3"
        >
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); }
            }}
            rows={1}
            placeholder="> query…   [ENTER] run · [SHIFT+ENTER] newline"
            className="max-h-40 min-h-[42px] flex-1 resize-none rounded-sm border border-white/[0.06] bg-[#030303] px-3 py-2.5 font-mono text-[13px] text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-white/[0.15]"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="h-[42px] rounded-sm bg-red-500/90 px-4 font-mono text-[11px] font-bold tracking-[0.1em] text-white transition-colors hover:bg-red-500 disabled:cursor-not-allowed disabled:bg-white/[0.06] disabled:text-zinc-600"
          >
            {loading ? "[ … ]" : "[ RUN ]"}
          </button>
        </form>
      </section>
    </div>
  );
}
