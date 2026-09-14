import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { openDb } from "./db.mjs";
import { dayDiff, todayStamp } from "./snapshots.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "public", "data");
mkdirSync(outDir, { recursive: true });

const SCHOOL =
  /lockdown|lock down|chromebook|clever|iboss|lightspeed|gaggle|bark for chrome|blocksi|linewize|netsupport|examview|i-ready|iready|learnplatform|masteryconnect|schoolcity|renaissance|absolute for chromebook|cisco umbrella|rapididentity|ck-authenticator|ck-12|socrative|schoolday|trelson|google classroom|canvas |eduphoria|dmac |yuja panorama|ets apcj|booknook|destiny discover|faronics insight|managed methods|you shall not pass|epic!|achieve3000|myon|myviewboard|exploros|infohio|math learning|vexcode|ti-84|ti connect|novoconnect|skoletube|wizkids|extemp|onetwoone|gibbs smith|storyline online|home access|hide classroom|upchieve|edx\b|engage & learn|blocklyprop|snap4arduino|sphero|linkbot|journey 2050|nova rna|prowise|symphony math|money pieces|math vocab|math clock|word bank|monster math|wevideo|kurzweil|gnosis iq|hide search games|bookmarklet blocker|bypatrol|lingdys|read the web|paper\b|collage\b|vivi\b|transformer hd|ebsco|explora|asd canvas|anonymous alerts|l\u00e4svy|bookflix|backdrop chrome/i;

const GMBE =
  /\b(gmb|gbp|google business|business profile|google maps|maps scraper|place id|\bcid\b|local seo|local pack|\bnap\b|citation|geo.?grid|teleport|rank check|review request|review link|schema markup|gmbspy|phantom|pleper|profilepro|izylocal|gatherup|mapsleads|presto)\b/i;
const SEO =
  /\b(seo|serp|keyword|backlink|search console|schema|organic|ahrefs|semrush|\bmoz\b|screaming frog|on.?page|meta tag|ai overview)\b/i;
const SMB =
  /\b(small business|local business|review|whatsapp|lead|prospect|invoice|appointment|booking|crm|email marketing|social media|facebook|instagram|maps)\b/i;

function hay(row) {
  return [row.name, row.category, row.description, row.author].join(" ");
}

function chromeLane(row) {
  const text = hay(row);
  if (SCHOOL.test(row.name) || SCHOOL.test(row.description || "") || /education/i.test(row.category || "")) {
    return "school";
  }
  if (GMBE.test(text)) return "gmbe";
  if (SEO.test(text)) return "seo";
  if (SMB.test(text)) return "smb";
  return "other";
}

function storeUrl(row) {
  if (row.url) return row.url;
  return `https://chromewebstore.google.com/detail/${row.id}`;
}

function jiraTheme(row) {
  const t = `${row.name} ${row.description || ""} ${row.category || ""}`.toLowerCase();
  if (/\b(claude agent|github copilot|cursor\b|chatgpt for jira|rovo|ai agent|ai automation)\b/.test(t)) return "ai";
  if (/\b(cloud companion|field governance|inactive user|license|pii|secret scanner|backup|retention|2fa|password|mfa|admin tools|log viewer)\b/.test(t)) return "admin";
  if (/\b(gantt|okr|goal|capacity|sprint|planning poker|scrumpoker|roadmap|team planner|strategy hub)\b/.test(t)) return "planning";
  if (/\b(external share|read-only board|share a live|client)\b/.test(t) || /laya board/i.test(row.name)) return "share";
  if (/\b(template|canned response|deep-clon)\b/.test(t)) return "templates";
  if (/\b(timesheet|worklog|time tracking|time-off)\b/.test(t)) return "time";
  if (/\b(jql|dependency map|issue link|kpi|mermaid|chart|dashboard gadget|gauge)\b/.test(t)) return "viz";
  if (/\b(salesforce|google drive|microsoft|browserstack|power bi|miro|zenduty|veracode|pylon|connector|integration)\b/.test(t)) return "connect";
  return "other";
}

const db = openDb({ readonly: true });

const chromeAll = db
  .prepare(
    `SELECT m.listing_id AS id, m.name, m.author, m.category, m.demand AS users,
            m.month_delta AS month, m.month_pct AS monthPct, m.wow_delta AS wow,
            m.rating AS stars, m.review_count AS reviews, l.description, l.url
     FROM chrome_movers m
     LEFT JOIN listings l ON l.source = 'chrome' AND l.listing_id = m.listing_id
     WHERE m.month_pct IS NOT NULL AND m.month_delta > 0
     ORDER BY m.month_pct DESC, m.month_delta DESC`
  )
  .all();

const top200 = chromeAll.slice(0, 200).map((row, i) => {
  const lane = chromeLane(row);
  return {
    rank: i + 1,
    id: row.id,
    name: row.name,
    author: row.author || "",
    category: row.category || "",
    users: Number(row.users) || 0,
    monthAgo: (Number(row.users) || 0) - (Number(row.month) || 0),
    month: Number(row.month) || 0,
    monthPct: Number(row.monthPct) || 0,
    stars: row.stars == null ? null : Number(row.stars),
    reviews: Number(row.reviews) || 0,
    url: storeUrl(row),
    lane,
    blurb: String(row.description || "").replace(/\s+/g, " ").slice(0, 160),
  };
});

const lanes = { school: 0, gmbe: 0, seo: 0, smb: 0, other: 0 };
for (const row of top200) lanes[row.lane] += 1;
const bucket900 = top200.filter((r) => r.monthPct >= 8.9 && r.monthPct <= 9.1).length;

const chromePayload = {
  asOf: "2026-09-05",
  dump: "ranking-stats-20260825.csv",
  movers: "results (1).csv",
  count: top200.length,
  lanes,
  bucket900,
  lowReviews: top200.filter((r) => r.reviews < 5).length,
  rows: top200,
};

const from = "2026-09-02";
const to = todayStamp();
const jira = db
  .prepare(
    `SELECT l.listing_id AS id, l.name, l.url, l.category, l.author, l.rating AS stars,
            l.review_count AS reviews, l.description, l.demand AS users, s.demand AS weekAgo
     FROM listings l
     LEFT JOIN snapshots s
       ON s.source = l.source AND s.listing_id = l.listing_id AND s.captured_at = ?
     WHERE l.source = 'jira'`
  )
  .all(from)
  .map((row) => {
    const users = Number(row.users) || 0;
    const weekAgo = row.weekAgo == null ? null : Number(row.weekAgo) || 0;
    const wow = weekAgo == null ? null : users - weekAgo;
    const wowPct = weekAgo > 0 ? wow / weekAgo : null;
    return {
      id: row.id,
      name: row.name,
      author: row.author || "",
      category: row.category || "",
      url: row.url || "",
      stars: row.stars == null ? null : Number(row.stars),
      reviews: Number(row.reviews) || 0,
      users,
      weekAgo,
      wow,
      wowPct,
      blurb: String(row.description || "").replace(/\s+/g, " ").slice(0, 180),
    };
  })
  .filter((row) => row.wowPct != null && row.wow > 0)
  .sort((a, b) => b.wowPct - a.wowPct || (b.wow || 0) - (a.wow || 0));

const useful = jira.filter((row) => row.weekAgo >= 50).slice(0, 100).map((row, i) => ({
  rank: i + 1,
  ...row,
  theme: jiraTheme(row),
}));

const themes = {};
for (const row of useful) themes[row.theme] = (themes[row.theme] || 0) + 1;

const jiraPayload = {
  from,
  to,
  days: Math.abs(dayDiff(to, from)),
  grew: jira.length,
  compared: jira.length,
  floor: 50,
  themes,
  noisyTop: jira.slice(0, 8).map((row) => ({
    name: row.name,
    wowPct: row.wowPct,
    weekAgo: row.weekAgo,
    users: row.users,
  })),
  rows: useful,
};

writeFileSync(join(outDir, "chrome-next.json"), JSON.stringify(chromePayload));
writeFileSync(join(outDir, "jira-next.json"), JSON.stringify(jiraPayload));
db.close();

console.log(
  `Chrome next: 200 rows, school ${lanes.school}, seo ${lanes.seo}, smb ${lanes.smb}, gmbe ${lanes.gmbe}, ~900% ${bucket900}`
);
console.log(
  `Jira next: ${useful.length} apps, ${from} → ${to} (${jiraPayload.days} days), themes ${JSON.stringify(themes)}`
);
