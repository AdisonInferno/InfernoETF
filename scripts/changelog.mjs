// Generates CHANGELOG.md from git history.
// Commits less than 60 min apart = one work session.
import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const GAP = 60 * 60;
const raw = execSync('git log --no-merges --format=%ct%x1f%an%x1f%s', { encoding: "utf8" }).trim();
const commits = raw ? raw.split("\n").map((l) => { const [t, a, s] = l.split("\x1f"); return { t: +t, a, s }; }).reverse() : [];

const sessions = [];
for (const c of commits) {
  const last = sessions.at(-1);
  if (last && c.t - last.at(-1).t < GAP) last.push(c); else sessions.push([c]);
}

const tz = "Europe/Warsaw";
const day = (t) => new Date(t * 1000).toLocaleDateString("pl-PL", { timeZone: tz, weekday: "long", day: "numeric", month: "long", year: "numeric" });
const hm = (t) => new Date(t * 1000).toLocaleTimeString("pl-PL", { timeZone: tz, hour: "2-digit", minute: "2-digit" });

let out = "# INFERNO ETF — Dziennik zmian\n\n_Generowany automatycznie z historii git. Zmiany oddalone o mniej niż godzinę = jedna sesja._\n";
let lastDay = "";
sessions.reverse().forEach((s, i) => {
  const n = sessions.length - i, d = day(s[0].t);
  if (d !== lastDay) { out += `\n## ${d}\n`; lastDay = d; }
  const who = [...new Set(s.map((c) => c.a))].join(", ");
  out += `\n### Sesja #${n} · ${hm(s[0].t)}–${hm(s.at(-1).t)} · ${s.length} zmian · ${who}\n\n`;
  for (const c of [...s].reverse()) out += `- \`${hm(c.t)}\` ${c.s}\n`;
});
writeFileSync("CHANGELOG.md", out);
console.log(`CHANGELOG.md: ${sessions.length} sesji, ${commits.length} zmian`);
