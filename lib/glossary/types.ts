/* Glossary data model — lessons (ordered, beginner → advanced) group terms; sections are topic filters. */

export type Level = 1 | 2 | 3 | 4;

export type SectionId =
  | "basics" | "etf" | "costs" | "dividends" | "portfolio" | "sectors" | "currency"
  | "rebalancing" | "returns" | "risk" | "benchmark" | "tracking" | "bonds";

export interface Term {
  id: string;
  /** Display name, e.g. "TER (Total Expense Ratio)" */
  term: string;
  /** Extra search keys: abbreviations, synonyms, other spellings */
  aka?: string[];
  section: SectionId;
  /** One-sentence definition */
  short: string;
  /** "In plain words" — an everyday analogy */
  plain: string;
  /** A worked example with real numbers */
  example?: string;
  /** "Watch out" — the common mistake or limitation */
  watch?: string;
  /** Optional formula, hidden behind "Formula & details" */
  formula?: { expr: string; vars?: [symbol: string, meaning: string][]; note?: string };
  related?: string[];
  /** Where this shows up in OASIS */
  app?: { label: string; href: string };
}

export interface Lesson {
  id: string;
  n: number;
  level: Level;
  title: string;
  /** What you will learn, one line */
  blurb: string;
  minutes: number;
  terms: string[];
}
