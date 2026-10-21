import { LESSONS, LEVELS, SECTIONS } from "./lessons";
import { TERMS_1 } from "./terms-1";
import { TERMS_2 } from "./terms-2";
import { TERMS_3 } from "./terms-3";
import { TERMS_4 } from "./terms-4";
import type { Lesson, Level, Term } from "./types";

export type { Lesson, Level, SectionId, Term } from "./types";
export { LESSONS, LEVELS, SECTIONS };

export const TERMS: Term[] = [...TERMS_1, ...TERMS_2, ...TERMS_3, ...TERMS_4];
export const TERM_BY_ID: Record<string, Term> = Object.fromEntries(TERMS.map((t) => [t.id, t]));

/** The lesson each term belongs to (every term is taught in exactly one lesson). */
export const LESSON_OF: Record<string, Lesson> = Object.fromEntries(LESSONS.flatMap((l) => l.terms.map((id) => [id, l])));
export const levelOfTerm = (id: string): Level => LESSON_OF[id]?.level ?? 1;

/** Terms in learning order: lesson 1 → 17, in lesson order. "Next" walks this list. */
export const PATH: string[] = LESSONS.flatMap((l) => l.terms);

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ł/g, "l");

/** Ranked search over name, abbreviations / synonyms and the one-line definition. */
export function searchTerms(q: string): Term[] {
  const n = norm(q.trim());
  if (!n) return [];
  const scored: [number, Term][] = [];
  for (const t of TERMS) {
    const name = norm(t.term), aka = (t.aka ?? []).map(norm), short = norm(t.short);
    let s = 0;
    if (name.startsWith(n)) s = 100;
    else if (aka.some((a) => a === n)) s = 95;
    else if (name.split(/[\s(/,-]+/).some((w) => w.startsWith(n))) s = 80;
    else if (aka.some((a) => a.startsWith(n))) s = 70;
    else if (name.includes(n)) s = 60;
    else if (aka.some((a) => a.includes(n))) s = 50;
    else if (short.includes(n)) s = 20;
    if (s) scored.push([s - levelOfTerm(t.id), t]);
  }
  return scored.sort((a, b) => b[0] - a[0] || a[1].term.localeCompare(b[1].term)).map(([, t]) => t);
}
