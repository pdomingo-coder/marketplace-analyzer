import { createReadStream, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "csv-parse";
import { clip, openDb, toFloat, toInt } from "./db.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_CSV =
  process.env.MOVERS_CSV || "/Users/paolodomingo/Downloads/results (1).csv";
const csvPath = process.argv[2] || DEFAULT_CSV;

if (!existsSync(csvPath)) {
  console.error(`Movers CSV not found: ${csvPath}`);
  process.exit(1);
}

function growth(now, delta) {
  const users = toInt(now);
  const d = toInt(delta);
  const ago = users - d;
  if (ago > 0) return { ago, delta: d, pct: d / ago, fromZero: 0 };
  return { ago: 0, delta: d, pct: null, fromZero: 1 };
}

function ageDays(created) {
  const ts = Date.parse(created);
  if (!Number.isFinite(ts)) return null;
  return Math.max(0, Math.round((Date.now() - ts) / 86400000));
}

const db = openDb();
const dump = db
  .prepare(
    `SELECT listing_id, name, author, url, category, item_category, payment_type, description
     FROM listings WHERE source = 'chrome'`
  )
  .all();
const byId = new Map(dump.map((row) => [row.listing_id, row]));

const parser = createReadStream(csvPath).pipe(
  parse({
    columns: true,
    relax_quotes: true,
    relax_column_count: true,
    skip_empty_lines: true,
    bom: true,
  })
);

const rows = [];
console.log(`Reading ${csvPath}`);

for await (const raw of parser) {
  const listing_id = String(raw.id || "").trim();
  const name = clip(raw.name, 200);
  if (!listing_id || !name) continue;

  const demand = toInt(raw.userCount);
  const wow = growth(demand, raw.oneWeekUserCountDelta);
  const month = growth(demand, raw.oneMonthUserCountDelta);
  const q3 = growth(demand, raw.threeMonthsUserCountDelta);
  const hit = byId.get(listing_id);
  const created_at = String(raw.creationDate || "").slice(0, 32);

  rows.push({
    listing_id,
    name,
    author: clip(hit?.author || raw.author, 160),
    url: String(hit?.url || "").trim(),
    category: clip(hit?.category, 80),
    item_category: clip(hit?.item_category, 40) || "extension",
    payment_type: clip(hit?.payment_type, 40),
    demand,
    rating: toFloat(raw.ratingValue),
    review_count: toInt(raw.ratingCount),
    featured: String(raw.isFeatured || "").toLowerCase() === "true" ? 1 : 0,
    last_update: String(raw.lastUpdate || "").slice(0, 32),
    created_at,
    week_ago: wow.ago,
    wow_delta: wow.delta,
    wow_pct: wow.pct,
    from_zero: wow.fromZero,
    month_delta: month.delta,
    month_pct: month.pct,
    q3_delta: q3.delta,
    q3_pct: q3.pct,
    age_days: ageDays(created_at),
    matched: hit ? 1 : 0,
  });
}

db.exec("BEGIN");
try {
  db.exec("DELETE FROM chrome_movers");
  const insert = db.prepare(`
    INSERT INTO chrome_movers (
      listing_id, name, author, url, category, item_category, payment_type,
      demand, rating, review_count, featured, last_update, created_at,
      week_ago, wow_delta, wow_pct, from_zero, month_delta, month_pct,
      q3_delta, q3_pct, age_days, matched
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?
    )
  `);
  for (const row of rows) {
    insert.run(
      row.listing_id,
      row.name,
      row.author,
      row.url,
      row.category,
      row.item_category,
      row.payment_type,
      row.demand,
      row.rating,
      row.review_count,
      row.featured,
      row.last_update,
      row.created_at,
      row.week_ago,
      row.wow_delta,
      row.wow_pct,
      row.from_zero,
      row.month_delta,
      row.month_pct,
      row.q3_delta,
      row.q3_pct,
      row.age_days,
      row.matched
    );
  }
  db.exec("COMMIT");
} catch (err) {
  db.exec("ROLLBACK");
  throw err;
}

const payload = {
  asOf: "2026-09-05",
  rawDump: "ranking-stats-20260825.csv",
  count: rows.length,
  matched: rows.filter((r) => r.matched).length,
  rows: rows.map((r) => ({
    id: r.listing_id,
    name: r.name,
    author: r.author,
    category: r.category || "",
    users: r.demand,
    wow: r.wow_delta,
    wowPct: r.wow_pct,
    fromZero: r.from_zero,
    month: r.month_delta,
    q3: r.q3_delta,
    stars: r.rating,
    reviews: r.review_count,
    created: r.created_at,
    payment: r.payment_type || "",
    matched: r.matched,
    ageDays: r.age_days,
  })),
};

const outDir = join(root, "public", "data");
mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, "movers.json");
writeFileSync(outPath, JSON.stringify(payload));

const growers = rows.filter((r) => r.wow_delta > 0).length;
console.log(
  `Done. ${rows.length.toLocaleString()} extensions. ${payload.matched.toLocaleString()} matched the Aug 25 dump. ${growers.toLocaleString()} grew this week.`
);
console.log(`JSON: ${outPath}`);
db.close();
