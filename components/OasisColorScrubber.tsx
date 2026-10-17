"use client";

/* OASIS brand-accent tester — fixed bottom-right. Drag the native colour picker or tap a preset:
   --oasis-accent / --oasis-accent-muted change on <html> instantly, so every `text-oasis`, `border-oasis`,
   `bg-oasis/…`, `bg-oasis-muted` (timeframe rails, active rows, portfolio badges, ruler, legend toggles…)
   shifts live. The pick is remembered per browser; collapse it to a small pill when not tuning. */

import { useEffect, useState } from "react";

const KEY = "oasis.accent.v1";
const PRESETS = [
  ["ICE CYAN", "#38bdf8"],
  ["ELECTRIC TERMINAL", "#00e5ff"],
  ["ARCTIC BLUE", "#7dd3fc"],
  ["MINT-CYAN", "#2dd4bf"],
] as const;

const BG_KEY = "oasis.bg.v1";
const BG_PRESETS = [
  ["BLACK", "#030303"],
  ["GRAPHITE", "#16181c"],
  ["SLATE", "#1c2026"],
  ["DARK NAVY", "#0b1220"],
] as const;
function applyBg(hex: string) {
  document.documentElement.style.setProperty("--oasis-bg", hex);
}

function apply(hex: string) {
  const root = document.documentElement.style;
  root.setProperty("--oasis-accent", hex);
  root.setProperty("--oasis-accent-muted", hex + "26"); // ≈15 % alpha
}

export default function OasisColorScrubber() {
  const [hex, setHex] = useState("#38bdf8");
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [bg, setBgState] = useState("#030303");

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(KEY);
      if (saved && /^#[0-9a-f]{6}$/i.test(saved)) {
        apply(saved);
        // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time restore from browser storage
        setHex(saved);
      }
      const b = window.localStorage.getItem(BG_KEY);
      if (b && /^#[0-9a-f]{6}$/i.test(b)) { applyBg(b); setBgState(b); }
    } catch { /* ignore */ }
  }, []);

  // the ⚙ button in the header opens / closes the panel too
  useEffect(() => {
    const t = () => setOpen((o) => !o);
    window.addEventListener("oasis:accent-toggle", t);
    return () => window.removeEventListener("oasis:accent-toggle", t);
  }, []);

  const set = (v: string) => {
    apply(v);
    setHex(v);
    try { window.localStorage.setItem(KEY, v); } catch { /* ignore */ }
  };
  const setBg = (v: string) => {
    applyBg(v);
    setBgState(v);
    try { window.localStorage.setItem(BG_KEY, v); } catch { /* ignore */ }
  };
  const copy = () => {
    navigator.clipboard?.writeText(hex.toUpperCase()).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1200); }).catch(() => {});
  };

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} title="Tune the OASIS accent colour"
        className="fixed bottom-4 right-4 z-[9999] flex h-8 items-center gap-2 rounded-sm border border-white/10 bg-[var(--oasis-panel)] px-2.5 font-mono text-[10px] font-bold tracking-[0.12em] text-zinc-400 hover:text-white">
        <span className="h-3 w-3 rounded-[2px]" style={{ background: hex }} />ACCENT
      </button>
    );
  }
  return (
    <div className="fixed bottom-4 right-4 z-[9999] flex w-[264px] flex-col gap-2.5 rounded-sm border border-white/10 bg-[var(--oasis-panel)] p-3 font-mono shadow-[0_8px_30px_rgba(0,0,0,0.6)]">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold tracking-[0.14em] text-zinc-300">[ OASIS ACCENT ]</span>
        <button type="button" onClick={() => setOpen(false)} aria-label="Collapse" className="text-[12px] text-zinc-500 hover:text-white">—</button>
      </div>
      <div className="flex items-center gap-2.5">
        <input type="color" value={hex} onInput={(e) => set((e.target as HTMLInputElement).value)} onChange={(e) => set(e.target.value)}
          aria-label="Accent colour" className="h-9 w-12 cursor-pointer rounded-sm border border-white/10 bg-transparent p-0.5" />
        <span className="flex-1 text-[14px] font-bold tabular-nums text-oasis">{hex.toUpperCase()}</span>
        <button type="button" onClick={copy} className="h-7 border border-oasis/40 px-2 text-[9.5px] font-bold tracking-[0.1em] text-oasis hover:bg-oasis-muted">
          {copied ? "[ COPIED ]" : "[ COPY HEX ]"}
        </button>
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        {PRESETS.map(([name, v]) => (
          <button key={v} type="button" onClick={() => set(v)}
            className={`flex items-center gap-2 border px-2 py-1.5 text-left text-[9.5px] font-bold tracking-[0.08em] transition-colors ${hex.toLowerCase() === v ? "border-white/30 text-white" : "border-white/[0.06] text-zinc-400 hover:text-white"}`}>
            <span className="h-2.5 w-2.5 flex-none rounded-[2px]" style={{ background: v }} />{name}
          </button>
        ))}
      </div>
      <div className="flex flex-col gap-1.5 border-t border-white/[0.06] pt-2">
        <span className="text-[10px] font-bold tracking-[0.14em] text-zinc-300">[ BACKGROUND ]</span>
        <div className="flex items-center gap-2.5">
          <input type="color" value={bg} onInput={(e) => setBg((e.target as HTMLInputElement).value)} onChange={(e) => setBg(e.target.value)}
            aria-label="Background colour" className="h-9 w-12 cursor-pointer rounded-sm border border-white/10 bg-transparent p-0.5" />
          <span className="flex-1 text-[14px] font-bold tabular-nums text-zinc-200">{bg.toUpperCase()}</span>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {BG_PRESETS.map(([name, v]) => (
            <button key={v} type="button" onClick={() => setBg(v)}
              className={`flex items-center gap-2 border px-2 py-1.5 text-left text-[9.5px] font-bold tracking-[0.08em] transition-colors ${bg.toLowerCase() === v ? "border-white/30 text-white" : "border-white/[0.06] text-zinc-400 hover:text-white"}`}>
              <span className="h-2.5 w-2.5 flex-none rounded-[2px] border border-white/20" style={{ background: v }} />{name}
            </button>
          ))}
        </div>
      </div>
      {/* live sample of the accent in use */}
      <div className="flex items-center gap-2 border-t border-white/[0.06] pt-2 text-[9.5px]">
        <span className="border border-oasis/50 bg-oasis-muted px-1.5 py-0.5 font-bold text-oasis">★ PORTFOLIO</span>
        <span className="rounded-[4px] border border-oasis/80 bg-oasis/20 px-2 py-0.5 font-bold text-oasis" style={{ boxShadow: `0 0 4px ${hex}40` }}>1M</span>
        <span className="text-zinc-500">PREVIEW</span>
      </div>
    </div>
  );
}
