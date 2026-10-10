/* Runs once when the Next.js server starts. Node-only work is imported conditionally. */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startScheduler } = await import("./lib/news-archive/collector");
    startScheduler();
  }
}
