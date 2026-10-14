import { redirect } from "next/navigation";

/** Old address — tools now live under /etf-tools. */
export default function ToolsPage() {
  redirect("/etf-tools");
}
