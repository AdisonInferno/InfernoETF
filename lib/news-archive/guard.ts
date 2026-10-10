/* The archive endpoints write to disk and spend API quota.
   Allowed from localhost (your own machine, dev or `next start`); anywhere else they require
   NEWS_ARCHIVE_TOKEN sent as the x-archive-token header. */
export function denied(req: Request): Response | null {
  const host = (req.headers.get("host") ?? "").split(":")[0];
  if (["localhost", "127.0.0.1", "::1", "[::1]"].includes(host)) return null;
  const token = process.env.NEWS_ARCHIVE_TOKEN;
  if (token && req.headers.get("x-archive-token") === token) return null;
  return Response.json({ error: "Forbidden" }, { status: 403 });
}
