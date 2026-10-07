import { Suspense } from "react";
import ScannerShell from "@/components/ScannerShell";

export default function ScannerPage() {
  // Suspense is required because the table reads ?q= from the URL (useSearchParams).
  return (
    <Suspense>
      <ScannerShell />
    </Suspense>
  );
}
