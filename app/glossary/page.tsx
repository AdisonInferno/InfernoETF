import type { Metadata } from "next";
import { Suspense } from "react";
import GlossaryView from "@/components/glossary/GlossaryView";

export const metadata: Metadata = { title: "Glossary — OASIS" };

/** Glossary — investing terms as a beginner-friendly learning path, plus search and A–Z. */
export default function GlossaryPage() {
  // Suspense: the view reads the selected term (?t=) from the URL.
  return (
    <Suspense>
      <GlossaryView />
    </Suspense>
  );
}
