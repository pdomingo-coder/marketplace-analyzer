import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { clip, openDb } from "./db.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Hand-picked. Not a keyword scrape. Eesel/MyAskAI-like: AI that drafts support replies or sits on a helpdesk. */
const WATCH = [
  { id: "ejhkkbilnpifailgngpkgmiofhioacjd", bucket: "direct", why: "eesel’s current CS copilot" },
  { id: "jffaiidojfhflballoapgofphkadiono", bucket: "direct", why: "eesel’s older docs-search extension" },
  { id: "dcbmjjachokjjbofinpakpebaeckdhbc", bucket: "direct", why: "Forethought agent copilot" },
  { id: "lohojfppjeknalpoklojhfnndocgekbd", bucket: "direct", why: "AI replies in Gmail, Intercom, Zendesk" },
  { id: "gceddchegnlgfhmaolidpjbjgdifalba", bucket: "direct", why: "Tidio Lyro copilot on helpdesks" },
  { id: "bamboiagbocaobgfbkjehlaojipfjecf", bucket: "direct", why: "Generic CS copilot for Zendesk/Gorgias/Intercom" },
  { id: "nfobgnbegdmblmlicigodlmaicopjmjb", bucket: "direct", why: "TypeGenie on Zendesk" },
  { id: "gcomdbjknjbjdkejilnpicamdagkjjfj", bucket: "direct", why: "FAQ copilot for inbox mail" },
  { id: "hmjbgpeihcpkboenedoaeoemapepljda", bucket: "direct", why: "Draft replies on Gmail/Hubspot/Zendesk" },
  { id: "aofkkchacgijlpfnffjbahfhkfijpifn", bucket: "direct", why: "Zendesk summary and smart reply" },
  { id: "beibjlmdcppolmlongnmmkpacncdnakl", bucket: "direct", why: "Jarvis helpdesk copilot" },
  { id: "phflmaifeghcegaahcloamgelnemboac", bucket: "direct", why: "Jarvis for ecommerce helpdesks" },
  { id: "fcinnggknmdfkilogcndkgpojpfojeem", bucket: "inbox", why: "Gmail shared inbox + AI CS platform" },
  { id: "dheionainndbbpoacpnopgmnihkcmnkl", bucket: "inbox", why: "Gmail shared inbox + AI drafts" },
  { id: "dcgcnpooblobhncpnddnhoendgbnglpn", bucket: "inbox", why: "Fast mail client teams sometimes use for support" },
  { id: "fiicfmbdhpbnebmbofpphmalhgofdakc", bucket: "inbox", why: "Superhuman’s AI assistant" },
  { id: "gajcfpeecjnncamfhdpbcolikfbaedcn", bucket: "inbox", why: "Help Scout itself" },
  { id: "gckmmhihcdafliflejlgihhjkijajbif", bucket: "inbox", why: "LiveChat helpdesk extension" },
  { id: "mklbhckkgddhlcdagmobdmnadpjokkkn", bucket: "adjacent", why: "Internal knowledge answers in Chrome" },
  { id: "cfpdompphcacgpjfbonkdokgjhgabpij", bucket: "adjacent", why: "Company knowledge search, not a helpdesk" },
  { id: "idgadaccgipmpannjkmfddolnnhmeklj", bucket: "adjacent", why: "Snippets CS teams use; not an AI helpdesk" },
  { id: "iibninhmiggehlcdolcilmhacighjamp", bucket: "adjacent", why: "Text expander CS teams use; not an AI helpdesk" },
];

function storeUrl(id) {
  return `https://chromewebstore.google.com/detail/${id}`;
}

function stretch(from, to) {
  if (!(from > 0)) return null;
  const r = (to - from) / from;
  return Math.max(-1, Math.min(1, r));
}

function combinedPct(users, wow, month, q3) {
  const now = Number(users) || 0;
  const weekAgo = Math.max(0, now - (Number(wow) || 0));
  const monthAgo = Math.max(0, now - (Number(month) || 0));
  const q3Ago = Math.max(0, now - (Number(q3) || 0));
  const parts = [
    { w: 0.5, r: stretch(weekAgo, now) },
    { w: 0.3, r: stretch(monthAgo, weekAgo) },
    { w: 0.2, r: stretch(q3Ago, monthAgo) },
  ].filter((p) => p.r != null);
  const wsum = parts.reduce((sum, p) => sum + p.w, 0);
  if (!wsum) return null;
  return parts.reduce((sum, p) => sum + p.r * (p.w / wsum), 0);
}

function rate(users, delta) {
  if (delta == null || users == null) return null;
  const ago = users - delta;
  return ago > 0 ? delta / ago : null;
}

const db = openDb({ readonly: true });
const moversPath = join(root, "public", "data", "movers.json");
const movers = existsSync(moversPath)
  ? JSON.parse(readFileSync(moversPath, "utf8")).rows
  : [];
const byMover = new Map(movers.map((row) => [row.id, row]));

const rows = [];
for (const item of WATCH) {
  const listing = db
    .prepare(
      `SELECT listing_id, name, author, url, category, description, demand, rating, review_count, last_update, payment_type
       FROM listings WHERE source = 'chrome' AND listing_id = ?`
    )
    .get(item.id);
  if (!listing) {
    console.warn(`Missing from dump: ${item.id} (${item.why})`);
    continue;
  }
  const m = byMover.get(item.id);
  const users = m ? m.users : listing.demand;
  const wow = m ? m.wow : null;
  const month = m ? m.month : null;
  const q3 = m ? m.q3 : null;
  rows.push({
    id: item.id,
    bucket: item.bucket,
    why: item.why,
    name: listing.name,
    author: listing.author || "",
    url: listing.url || storeUrl(item.id),
    category: listing.category || "",
    blurb: clip(listing.description, 220),
    usersDump: listing.demand,
    users,
    wow,
    month,
    q3,
    wowPct: m ? m.wowPct : null,
    monthPct: rate(users, month),
    combined: m ? combinedPct(users, wow, month, q3) : null,
    stars: m?.stars ?? listing.rating,
    reviews: m?.reviews ?? listing.review_count,
    created: m?.created || "",
    updated: listing.last_update || m?.updated || "",
    inMovers: Boolean(m),
    payment: listing.payment_type || m?.payment || "",
  });
}
db.close();

const outDir = join(root, "public", "data");
mkdirSync(outDir, { recursive: true });
const payload = {
  asOf: "2026-09-10",
  dump: "ranking-stats-20260825.csv",
  movers: "results (1).csv · 10k+ users",
  note: "MyAskAI has no meaningful Chrome listing. Direct = AI that drafts helpdesk replies. Inbox = shared inbox / helpdesk shell. Adjacent = snippets or company search CS teams also use.",
  count: rows.length,
  rows,
};
writeFileSync(join(outDir, "cs-copilots.json"), JSON.stringify(payload, null, 2));
console.log(`Wrote ${rows.length} CS copilot rows.`);
