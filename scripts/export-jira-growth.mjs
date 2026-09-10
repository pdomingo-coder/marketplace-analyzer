import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { openDb } from "./db.mjs";
import { dayDiff, pickBaseline, snapshotDates, todayStamp } from "./snapshots.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const db = openDb({ readonly: true });
const dates = snapshotDates(db, "jira");
const today = todayStamp();
const from = pickBaseline(dates, today);
if (!from) {
  db.close();
  console.log("No Jira snapshot yet.");
  process.exit(0);
}

const raw = db
  .prepare(
    `SELECT l.listing_id AS id, l.name, l.url, l.category, l.demand AS users, s.demand AS weekAgo
     FROM listings l
     LEFT JOIN snapshots s
       ON s.source = l.source AND s.listing_id = l.listing_id AND s.captured_at = ?
     WHERE l.source = 'jira'`
  )
  .all(from);

const rows = raw
  .map((row) => {
    const users = Number(row.users) || 0;
    const weekAgo = row.weekAgo == null ? null : Number(row.weekAgo) || 0;
    const delta = weekAgo == null ? null : users - weekAgo;
    const pct = weekAgo ? delta / weekAgo : null;
    return { ...row, users, weekAgo, delta, pct };
  })
  .filter((row) => (row.delta || 0) > 0)
  .sort((a, b) => b.delta - a.delta);

const outDir = join(root, "public", "data");
mkdirSync(outDir, { recursive: true });
const payload = {
  asOf: today,
  from,
  to: today,
  days: Math.abs(dayDiff(today, from)),
  grew: rows.length,
  chart: rows.slice(0, 12),
  rows: rows.slice(0, 100),
};
writeFileSync(join(outDir, "jira-growth.json"), JSON.stringify(payload, null, 2));
db.close();
console.log(`Wrote ${rows.length} Jira growers (${from} → ${today}).`);
