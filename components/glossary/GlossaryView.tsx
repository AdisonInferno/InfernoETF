"use client";

/* Glossary — a learning path (4 levels → 17 lessons → terms, easy to hard) plus instant search,
   A–Z browsing and topic sections for experienced investors. Reading progress lives in this browser.
   Quizzes per lesson come later (slot shown as "QUIZ · SOON"). */

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePersisted } from "@/lib/persisted";
import {
  LESSONS, LEVELS, LESSON_OF, PATH, SECTIONS, TERMS, TERM_BY_ID, levelOfTerm, searchTerms,
  type Lesson, type Level, type SectionId, type Term,
} from "@/lib/glossary";

const NO_READ: string[] = [];
const READ_KEY = "oasis.glossary.read.v1";
const LABEL = "font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500";
const LEVEL_TONE: Record<Level, { text: string; bar: string; chip: string }> = {
  1: { text: "text-emerald-400", bar: "bg-emerald-400", chip: "bg-emerald-400/10 text-emerald-300" },
  2: { text: "text-sky-400", bar: "bg-sky-400", chip: "bg-sky-400/10 text-sky-300" },
  3: { text: "text-amber-400", bar: "bg-amber-400", chip: "bg-amber-400/10 text-amber-300" },
  4: { text: "text-violet-400", bar: "bg-violet-400", chip: "bg-violet-400/10 text-violet-300" },
};
const sectionLabel = (id: SectionId) => SECTIONS.find((s) => s.id === id)?.label ?? id;

export default function GlossaryView() {
  const router = useRouter();
  const params = useSearchParams();
  const selected = params.get("t") && TERM_BY_ID[params.get("t")!] ? params.get("t")! : null;

  const [readList, setReadList] = usePersisted<string[]>(READ_KEY, NO_READ);
  const read = useMemo(() => new Set(readList), [readList]);
  const [q, setQ] = useState("");
  const [mode, setMode] = useState<"path" | "az">("path");
  const [section, setSection] = useState<SectionId | null>(null);
  const [openLesson, setOpenLesson] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const select = (id: string | null) => {
    const sp = new URLSearchParams(params.toString());
    if (id) sp.set("t", id); else sp.delete("t");
    router.replace(`/glossary${sp.size ? `?${sp}` : ""}`, { scroll: false });
    if (id) {
      setOpenLesson(LESSON_OF[id]?.id ?? null);
      if (window.innerWidth < 1280) setTimeout(() => panelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
    }
  };

  // Opening a term marks it as read. Read the stored list directly: on the first render after a page load
  // `readList` is still the empty fallback, and appending to it would wipe the saved progress.
  useEffect(() => {
    if (!selected) return;
    let saved: string[] = [];
    try { saved = JSON.parse(window.localStorage.getItem(READ_KEY) ?? "[]"); } catch { /* private mode */ }
    if (!Array.isArray(saved)) saved = [];
    if (!saved.includes(selected)) setReadList([...saved, selected]);
  }, [selected, setReadList]);

  const lessonDone = (l: Lesson) => l.terms.filter((id) => read.has(id)).length;
  const current = LESSONS.find((l) => lessonDone(l) < l.terms.length) ?? null; // first unfinished lesson
  const nextUnread = PATH.find((id) => !read.has(id)) ?? PATH[0];
  const results = useMemo(() => searchTerms(q), [q]);
  const inSection = useMemo(() => (section ? PATH.map((id) => TERM_BY_ID[id]).filter((t) => t.section === section) : []), [section]);

  return (
    <div className="mx-auto flex w-full max-w-[2000px] flex-1 flex-col gap-4 px-3 py-4">
      {/* Header */}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <h1 className="m-0 text-[28px] font-semibold tracking-[0.01em] text-zinc-50">Glossary</h1>
          <p className="m-0 max-w-2xl text-[14px] leading-relaxed text-zinc-500">
            Learn investing step by step — from the very basics to advanced risk measures. Or just search for the term you need.
          </p>
        </div>
        <div className="flex min-w-[220px] flex-col gap-1.5">
          <div className="flex items-baseline justify-between">
            <span className={LABEL}>Your progress</span>
            <span className="font-mono text-[11px] text-zinc-400">{read.size} / {TERMS.length} terms</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.07]">
            <div className="h-full rounded-full bg-oasis transition-[width] duration-500" style={{ width: `${(read.size / TERMS.length) * 100}%` }} />
          </div>
          {read.size > 0 && (
            <button type="button" onClick={() => setReadList(NO_READ)} className="self-end font-mono text-[9.5px] tracking-[0.1em] text-zinc-600 hover:text-zinc-300">RESET PROGRESS</button>
          )}
        </div>
      </header>

      {/* Search + view switch */}
      <div className="flex flex-wrap items-center gap-2.5">
        <label className="flex h-11 min-w-[260px] flex-1 items-center gap-2.5 rounded-sm border border-white/[0.08] bg-[var(--oasis-panel)] px-3.5 focus-within:border-white/[0.2]">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="flex-none text-zinc-500" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          <input
            ref={searchRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Escape") setQ(""); if (e.key === "Enter" && results[0]) select(results[0].id); }}
            placeholder="Search a term… e.g. TER, Sharpe, accumulating, duration"
            aria-label="Search the glossary"
            className="h-full flex-1 bg-transparent text-[14px] text-zinc-100 outline-none placeholder:text-zinc-600"
          />
          {q && <button type="button" onClick={() => setQ("")} className="font-mono text-[11px] text-zinc-500 hover:text-white" aria-label="Clear search">✕</button>}
        </label>
        <div className="flex rounded-sm border border-white/[0.08] bg-[var(--oasis-panel)] p-1" role="tablist" aria-label="View">
          {([["path", "LEARNING PATH"], ["az", "ALL TERMS A–Z"]] as const).map(([k, l]) => (
            <button key={k} type="button" role="tab" aria-selected={mode === k} onClick={() => { setMode(k); setSection(null); setQ(""); }}
              className={`h-9 rounded-sm border px-3.5 font-mono text-[10.5px] font-semibold tracking-[0.1em] transition-colors ${mode === k && !section && !q ? "oasis-on" : "border-transparent text-zinc-500 hover:text-zinc-200"}`}>
              {l}
            </button>
          ))}
        </div>
      </div>

      {/* Sections */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className={`${LABEL} mr-1`}>Sections</span>
        {SECTIONS.map((s) => {
          const n = TERMS.filter((t) => t.section === s.id).length;
          const on = section === s.id;
          return (
            <button key={s.id} type="button" aria-pressed={on} onClick={() => { setSection(on ? null : s.id); setQ(""); }}
              className={`h-7 rounded-sm border px-2.5 text-[11.5px] font-medium transition-colors ${on ? "oasis-on" : "border-white/[0.07] bg-[var(--oasis-panel)] text-zinc-400 hover:text-zinc-100"}`}>
              {s.label}<span className="ml-1.5 font-mono text-[10px] text-zinc-600">{n}</span>
            </button>
          );
        })}
      </div>

      {/* Body: content + term panel */}
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(380px,460px)]">
        <div className="min-w-0">
          {q ? (
            <ResultList title={`${results.length} result${results.length === 1 ? "" : "s"} for “${q}”`} terms={results} read={read} selected={selected} onSelect={select}
              empty="No terms match. Try a shorter word or an abbreviation." />
          ) : section ? (
            <ResultList title={`${sectionLabel(section)} · ${inSection.length} terms, easiest first`} terms={inSection} read={read} selected={selected} onSelect={select} />
          ) : mode === "az" ? (
            <AtoZ read={read} selected={selected} onSelect={select} />
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-4">
              {LEVELS.map((lv) => {
                const lessons = LESSONS.filter((l) => l.level === lv.level);
                const done = lessons.filter((l) => lessonDone(l) === l.terms.length).length;
                const tone = LEVEL_TONE[lv.level];
                return (
                  <section key={lv.level} className="oasis-glass flex flex-col gap-2.5 border border-white/[0.06] bg-[var(--oasis-panel)] p-3.5">
                    <div className="flex items-baseline justify-between">
                      <span className={`font-mono text-[10px] font-semibold tracking-[0.16em] ${tone.text}`}>LEVEL {lv.level}</span>
                      <span className={`font-mono text-[10px] ${done === lessons.length ? tone.text : "text-zinc-600"}`}>{done}/{lessons.length} lessons{done === lessons.length ? " ✓" : ""}</span>
                    </div>
                    <div>
                      <h2 className="m-0 text-[16px] font-semibold text-zinc-50">{lv.title}</h2>
                      <p className="m-0 mt-0.5 text-[12px] leading-snug text-zinc-500">{lv.blurb}</p>
                    </div>
                    {lessons.map((l) => (
                      <LessonCard key={l.id} lesson={l} doneCount={lessonDone(l)} read={read} isCurrent={current?.id === l.id}
                        open={openLesson === l.id} onToggle={() => setOpenLesson(openLesson === l.id ? null : l.id)} selected={selected} onSelect={select} />
                    ))}
                  </section>
                );
              })}
            </div>
          )}
        </div>

        <div ref={panelRef} className={`min-w-0 scroll-mt-4 ${selected ? "order-first xl:order-none" : ""}`}>
          <div className="xl:sticky xl:top-3">
            {selected ? (
              <TermPanel term={TERM_BY_ID[selected]} onSelect={select} />
            ) : (
              <Welcome
                startId={nextUnread}
                started={read.size > 0}
                currentTitle={current?.title}
                onStart={() => select(nextUnread)}
                onSearch={() => searchRef.current?.focus()}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Lesson card (path view) ── */
function LessonCard({ lesson: l, doneCount, read, isCurrent, open, onToggle, selected, onSelect }: {
  lesson: Lesson; doneCount: number; read: Set<string>; isCurrent: boolean; open: boolean; onToggle: () => void; selected: string | null; onSelect: (id: string) => void;
}) {
  const complete = doneCount === l.terms.length;
  const tone = LEVEL_TONE[l.level];
  return (
    <div className={`flex flex-col rounded-sm border bg-[var(--oasis-bg)] transition-colors ${isCurrent ? "border-oasis/45 shadow-[0_0_0_1px_var(--oasis-accent-muted)]" : "border-white/[0.06] hover:border-white/[0.12]"}`}>
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex flex-col gap-1.5 px-3 py-2.5 text-left">
        <span className="flex items-center gap-2 font-mono text-[9.5px] tracking-[0.08em] text-zinc-500">
          {complete && <span className={tone.text}>✓</span>}
          LESSON {l.n} · {l.minutes} MIN · {l.terms.length} TERMS
          {isCurrent && <span className="ml-auto rounded-xs bg-oasis-muted px-1.5 py-px text-[9px] font-semibold text-oasis">{doneCount ? "CONTINUE" : "START HERE"}</span>}
        </span>
        <span className="text-[13.5px] font-semibold leading-snug text-zinc-100">{l.title}</span>
        <span className="text-[11.5px] leading-snug text-zinc-500">{l.blurb}</span>
        <span className="mt-0.5 h-1 overflow-hidden rounded-full bg-white/[0.07]">
          <span className={`block h-full rounded-full ${complete ? tone.bar : "bg-oasis"}`} style={{ width: `${(doneCount / l.terms.length) * 100}%` }} />
        </span>
      </button>
      {open && (
        <div className="flex flex-col gap-0.5 border-t border-white/[0.06] px-1.5 py-1.5">
          {l.terms.map((id, i) => {
            const t = TERM_BY_ID[id], on = selected === id;
            return (
              <button key={id} type="button" onClick={() => onSelect(id)}
                className={`flex items-center gap-2 rounded-xs px-2 py-1.5 text-left text-[12.5px] transition-colors ${on ? "bg-oasis-muted text-zinc-50" : "text-zinc-300 hover:bg-white/[0.05]"}`}>
                <span className={`w-4 flex-none text-center font-mono text-[10px] ${read.has(id) ? tone.text : "text-zinc-600"}`}>{read.has(id) ? "✓" : i + 1}</span>
                <span className="truncate">{t.term}</span>
              </button>
            );
          })}
          <span className="mx-2 my-1 self-start rounded-xs border border-dashed border-white/[0.12] px-2 py-0.5 font-mono text-[9px] tracking-[0.1em] text-zinc-600">QUIZ · SOON</span>
        </div>
      )}
    </div>
  );
}

/* ── Flat list: search results / one section ── */
function ResultList({ title, terms, read, selected, onSelect, empty }: {
  title: string; terms: Term[]; read: Set<string>; selected: string | null; onSelect: (id: string) => void; empty?: string;
}) {
  return (
    <section className="oasis-glass flex flex-col border border-white/[0.06] bg-[var(--oasis-panel)] p-2">
      <span className={`${LABEL} px-2 pb-2 pt-1.5`}>{title}</span>
      {terms.length === 0 && <p className="m-0 px-2 pb-3 text-[13px] text-zinc-500">{empty}</p>}
      {terms.map((t) => <TermRow key={t.id} t={t} read={read.has(t.id)} on={selected === t.id} onSelect={onSelect} />)}
    </section>
  );
}

function TermRow({ t, read, on, onSelect }: { t: Term; read: boolean; on: boolean; onSelect: (id: string) => void }) {
  const lv = levelOfTerm(t.id);
  return (
    <button type="button" onClick={() => onSelect(t.id)}
      className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-0.5 rounded-sm px-2.5 py-2 text-left transition-colors ${on ? "bg-oasis-muted" : "hover:bg-white/[0.04]"}`}>
      <span className="flex min-w-0 items-center gap-2">
        <span className="truncate text-[13.5px] font-semibold text-zinc-100">{t.term}</span>
        {read && <span className={`font-mono text-[10px] ${LEVEL_TONE[lv].text}`}>✓</span>}
      </span>
      <span className="flex gap-1.5">
        <span className={`rounded-xs px-1.5 py-px font-mono text-[9px] font-semibold tracking-[0.08em] ${LEVEL_TONE[lv].chip}`}>L{lv}</span>
        <span className="hidden rounded-xs bg-white/[0.05] px-1.5 py-px font-mono text-[9px] tracking-[0.06em] text-zinc-500 sm:inline">{sectionLabel(t.section).toUpperCase()}</span>
      </span>
      <span className="col-span-2 truncate text-[12px] text-zinc-500">{t.short}</span>
    </button>
  );
}

/* ── A–Z index ── */
function AtoZ({ read, selected, onSelect }: { read: Set<string>; selected: string | null; onSelect: (id: string) => void }) {
  const groups = useMemo(() => {
    const m = new Map<string, Term[]>();
    [...TERMS].sort((a, b) => a.term.localeCompare(b.term)).forEach((t) => {
      const k = /[a-z]/i.test(t.term[0]) ? t.term[0].toUpperCase() : "#";
      m.set(k, [...(m.get(k) ?? []), t]);
    });
    return [...m.entries()];
  }, []);
  return (
    <section className="oasis-glass flex flex-col gap-3 border border-white/[0.06] bg-[var(--oasis-panel)] p-3">
      <nav className="flex flex-wrap gap-1" aria-label="Jump to letter">
        {groups.map(([k]) => (
          <a key={k} href={`#az-${k}`} className="flex h-7 w-7 items-center justify-center rounded-xs border border-white/[0.06] font-mono text-[11px] text-zinc-400 hover:text-white">{k}</a>
        ))}
      </nav>
      <div className="columns-1 gap-4 lg:columns-2">
        {groups.map(([k, list]) => (
          <div key={k} id={`az-${k}`} className="mb-3 break-inside-avoid scroll-mt-4">
            <span className="mb-1 block border-b border-white/[0.06] px-2.5 pb-1 font-mono text-[13px] font-semibold text-zinc-300">{k}</span>
            {list.map((t) => <TermRow key={t.id} t={t} read={read.has(t.id)} on={selected === t.id} onSelect={onSelect} />)}
          </div>
        ))}
      </div>
    </section>
  );
}

/* ── Right panel: nothing selected ── */
function Welcome({ startId, started, currentTitle, onStart, onSearch }: { startId: string; started: boolean; currentTitle?: string; onStart: () => void; onSearch: () => void }) {
  return (
    <section className="oasis-glass flex flex-col gap-4 border border-white/[0.06] bg-[var(--oasis-panel)] p-5">
      <span className={LABEL}>How it works</span>
      <div className="flex flex-col gap-2">
        <h2 className="m-0 text-[19px] font-semibold text-zinc-50">{started ? "Welcome back" : "New to investing?"}</h2>
        <p className="m-0 text-[13.5px] leading-relaxed text-zinc-400">
          {started
            ? `Pick up where you left off${currentTitle ? ` — “${currentTitle}”` : ""}.`
            : "Follow the learning path: 17 short lessons in 4 levels, each about 5 minutes. Every term is explained in plain words, with a real example and the one thing to watch out for."}
        </p>
      </div>
      <button type="button" onClick={onStart}
        className="oasis-on flex h-10 items-center justify-center gap-2 rounded-sm border text-[13px] font-semibold">
        {started ? "Continue" : "Start with lesson 1"} → {TERM_BY_ID[startId]?.term}
      </button>
      <div className="flex flex-col gap-1.5 rounded-sm border border-white/[0.06] bg-[var(--oasis-bg)] p-3.5">
        <span className="text-[13px] font-semibold text-zinc-200">Already an experienced investor?</span>
        <span className="text-[12.5px] leading-relaxed text-zinc-500">
          Jump straight to any term with the <button type="button" onClick={onSearch} className="text-oasis underline-offset-2 hover:underline">search</button>, browse all {TERMS.length} terms A–Z, or filter by section.
        </span>
      </div>
      <div className="grid grid-cols-4 gap-2">
        {LEVELS.map((lv) => (
          <div key={lv.level} className="flex flex-col gap-0.5 rounded-sm border border-white/[0.06] p-2">
            <span className={`font-mono text-[9.5px] font-semibold tracking-[0.1em] ${LEVEL_TONE[lv.level].text}`}>LEVEL {lv.level}</span>
            <span className="text-[11.5px] leading-tight text-zinc-400">{lv.title}</span>
          </div>
        ))}
      </div>
      <p className="m-0 font-mono text-[10px] leading-relaxed tracking-[0.04em] text-zinc-600">
        Educational content only — not investment advice. Progress is saved in this browser.
      </p>
    </section>
  );
}

/* ── Right panel: one term ── */
function TermPanel({ term: t, onSelect }: { term: Term; onSelect: (id: string | null) => void }) {
  const lesson = LESSON_OF[t.id];
  const idx = lesson.terms.indexOf(t.id);
  const pathIdx = PATH.indexOf(t.id);
  const prev = pathIdx > 0 ? TERM_BY_ID[PATH[pathIdx - 1]] : null;
  const next = pathIdx < PATH.length - 1 ? TERM_BY_ID[PATH[pathIdx + 1]] : null;
  const lastInLesson = idx === lesson.terms.length - 1;
  const nextLesson = lastInLesson ? LESSONS.find((l) => l.n === lesson.n + 1) : null;
  const tone = LEVEL_TONE[lesson.level];
  const box = "flex flex-col gap-1.5 rounded-sm border border-white/[0.06] bg-[var(--oasis-bg)] px-4 py-3";

  return (
    <article key={t.id} className="oasis-glass animate-inf-take flex flex-col gap-3.5 border border-white/[0.06] bg-[var(--oasis-panel)] p-5">
      <div className="flex items-start justify-between gap-3">
        <span className="font-mono text-[10px] leading-relaxed tracking-[0.08em] text-zinc-500">
          LEVEL {lesson.level} › LESSON {lesson.n} · {lesson.title.toUpperCase()} › {idx + 1} / {lesson.terms.length}
        </span>
        <button type="button" onClick={() => onSelect(null)} aria-label="Close term" className="font-mono text-[12px] text-zinc-500 hover:text-white">✕</button>
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="m-0 text-[23px] font-semibold leading-tight text-zinc-50">{t.term}</h2>
        <div className="flex flex-wrap gap-1.5">
          <span className={`rounded-xs px-1.5 py-0.5 font-mono text-[9.5px] font-semibold tracking-[0.08em] ${tone.chip}`}>LEVEL {lesson.level}</span>
          <span className="rounded-xs bg-white/[0.06] px-1.5 py-0.5 font-mono text-[9.5px] tracking-[0.08em] text-zinc-400">{sectionLabel(t.section).toUpperCase()}</span>
          {t.aka?.filter((a) => /^[A-Z0-9%/&.-]{2,8}$/.test(a)).slice(0, 2).map((a) => (
            <span key={a} className="rounded-xs bg-white/[0.06] px-1.5 py-0.5 font-mono text-[9.5px] tracking-[0.06em] text-zinc-500">{a.toUpperCase()}</span>
          ))}
        </div>
      </div>

      <p className="m-0 text-[15.5px] leading-relaxed text-zinc-100">{t.short}</p>

      <div className={box}>
        <span className={LABEL}>In plain words</span>
        <p className="m-0 text-[13.5px] leading-relaxed text-zinc-300">{t.plain}</p>
      </div>
      {t.example && (
        <div className={box}>
          <span className={LABEL}>Example</span>
          <p className="m-0 text-[13.5px] leading-relaxed text-zinc-300">{t.example}</p>
        </div>
      )}
      {t.watch && (
        <div className="flex flex-col gap-1.5 rounded-sm border border-amber-400/25 bg-amber-400/[0.05] px-4 py-3">
          <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-400">Watch out</span>
          <p className="m-0 text-[13.5px] leading-relaxed text-zinc-300">{t.watch}</p>
        </div>
      )}
      {t.formula && (
        <details className="group rounded-sm border border-white/[0.06] bg-[var(--oasis-bg)] px-4 py-3">
          <summary className="flex cursor-pointer list-none items-center justify-between font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
            Formula & details <span className="text-[13px] transition-transform group-open:rotate-45">+</span>
          </summary>
          <div className="mt-2.5 flex flex-col gap-2">
            <code className="block whitespace-pre-wrap rounded-xs bg-white/[0.04] px-3 py-2 font-mono text-[12.5px] text-zinc-200">{t.formula.expr}</code>
            {t.formula.vars?.map(([s, m]) => (
              <span key={s} className="text-[12.5px] text-zinc-400"><span className="font-mono text-zinc-200">{s}</span> — {m}</span>
            ))}
            {t.formula.note && <span className="text-[12px] text-zinc-500">{t.formula.note}</span>}
          </div>
        </details>
      )}

      {!!t.related?.length && (
        <div className="flex flex-col gap-1.5">
          <span className={LABEL}>Related</span>
          <div className="flex flex-wrap gap-1.5">
            {t.related.map((r) => (
              <button key={r} type="button" onClick={() => onSelect(r)}
                className="rounded-sm border border-white/[0.08] px-2.5 py-1 text-[12px] text-zinc-400 transition-colors hover:border-white/[0.18] hover:text-zinc-100">
                {TERM_BY_ID[r].term}
              </button>
            ))}
          </div>
        </div>
      )}

      {t.app && (
        <Link href={t.app.href} className="self-start font-mono text-[11px] tracking-[0.04em] text-oasis hover:underline">↗ See it in OASIS: {t.app.label}</Link>
      )}

      <nav className="flex items-center justify-between gap-3 border-t border-white/[0.06] pt-3 font-mono text-[10.5px] tracking-[0.06em]">
        {prev ? (
          <button type="button" onClick={() => onSelect(prev.id)} className="min-w-0 truncate text-left text-zinc-500 hover:text-zinc-200">← {prev.term}</button>
        ) : <span />}
        {next && (
          <button type="button" onClick={() => onSelect(next.id)} className="min-w-0 truncate text-right font-semibold text-oasis hover:underline">
            {nextLesson ? `NEXT LESSON: ${nextLesson.title}` : `NEXT: ${next.term}`} →
          </button>
        )}
      </nav>
      {lastInLesson && (
        <span className="self-start rounded-xs border border-dashed border-white/[0.12] px-2 py-0.5 font-mono text-[9px] tracking-[0.1em] text-zinc-600">LESSON {lesson.n} QUIZ · SOON</span>
      )}
    </article>
  );
}
