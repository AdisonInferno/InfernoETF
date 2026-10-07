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
    <div className="mx-auto flex min-h-[480px] w-full max-w-[1100px] flex-1 flex-col gap-4 px-6 py-6">
      <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-3xl border border-white/[0.04] bg-[#0a0a0c]">
        <div className="flex items-center justify-between border-b border-white/[0.04] px-5 py-4">
          <span className="text-[11px] font-semibold tracking-[0.1em] text-[#A78BFA]">✦ INFERNO AI</span>
          {messages.length > 0 && (
            <button
              type="button"
              onClick={() => { setMessages([]); setError(null); }}
              disabled={loading}
              className="text-xs text-zinc-500 transition-colors hover:text-white disabled:opacity-40"
            >
              Nowa rozmowa
            </button>
          )}
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-5">
          {messages.length === 0 && (
            <div className="m-auto flex max-w-md flex-col items-center gap-4 text-center">
              <h1 className="text-xl font-semibold tracking-tight text-zinc-50">Zapytaj o dowolny ETF</h1>
              <p className="text-sm text-zinc-500">Koszty, skład, ryzyko, porównania. Asystent wyjaśnia, nie doradza.</p>
              <div className="flex flex-wrap justify-center gap-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => send(s)}
                    className="rounded-full bg-white/[0.05] px-3.5 py-1.5 text-xs text-zinc-300 transition-colors hover:bg-white/10 hover:text-white"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, i) => (
            <div
              key={i}
              className={`max-w-[80%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                m.role === "user"
                  ? "self-end bg-white/[0.08] text-zinc-50"
                  : "self-start border border-violet-400/[0.15] bg-violet-500/[0.06] text-zinc-200"
              }`}
            >
              {m.content || <span className="animate-pulse text-zinc-500">…</span>}
            </div>
          ))}
          <div ref={endRef} />
        </div>

        {error && (
          <div className="mx-5 mb-3 rounded-xl border border-rose-500/20 bg-rose-500/10 px-4 py-2.5 text-xs text-rose-300">{error}</div>
        )}

        <form
          onSubmit={(e) => { e.preventDefault(); send(input); }}
          className="flex items-end gap-2 border-t border-white/[0.04] bg-[#121214] p-3"
        >
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); }
            }}
            rows={1}
            placeholder="Napisz wiadomość…  (Enter = wyślij, Shift+Enter = nowa linia)"
            className="max-h-40 min-h-[42px] flex-1 resize-none rounded-xl border border-white/[0.05] bg-white/[0.03] px-3.5 py-2.5 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-white/[0.15]"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="h-[42px] rounded-xl bg-red-500/90 px-5 text-xs font-bold tracking-[0.08em] text-white transition-colors hover:bg-red-500 disabled:cursor-not-allowed disabled:bg-white/[0.06] disabled:text-zinc-600"
          >
            {loading ? "…" : "WYŚLIJ"}
          </button>
        </form>
      </section>
    </div>
  );
}
