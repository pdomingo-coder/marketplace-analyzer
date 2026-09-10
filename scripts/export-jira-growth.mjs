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
    `SELECT l.listing_id AS id, l.name, l.url, l.category, l.author, l.rating AS stars,
            l.review_count, l.last_update, l.demand AS users, s.demand AS weekAgo
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
    const wow = weekAgo == null ? null : users - weekAgo;
    const wowPct = weekAgo > 0 ? wow / weekAgo : weekAgo === 0 && users > 0 ? null : wow === 0 ? 0 : null;
    return {
      id: row.id,
      name: row.name,
      url: row.url,
      category: row.category || "",
      author: row.author || "",
      stars: row.stars == null ? null : Number(row.stars),
      users,
      weekAgo,
      wow: wow == null ? 0 : wow,
      wowPct,
    };
  })
  .sort((a, b) => {
    const ap = a.wowPct == null ? -Infinity : a.wowPct;
    const bp = b.wowPct == null ? -Infinity : b.wowPct;
    return bp - ap || (b.wow || 0) - (a.wow || 0);
  });

const growers = rows.filter((row) => (row.wow || 0) > 0 && row.wowPct != null);
const outDir = join(root, "public", "data");
mkdirSync(outDir, { recursive: true });
const payload = {
  source: "jira",
  asOf: today,
  from,
  to: today,
  days: Math.abs(dayDiff(today, from)),
  grew: growers.length,
  compared: rows.filter((row) => row.weekAgo != null).length,
  chart: growers.slice(0, 12),
  rows,
};
writeFileSync(join(outDir, "jira-growth.json"), JSON.stringify(payload));
db.close();
console.log(`Jira growth ${from} → ${today}: ${growers.length} grew, ${payload.compared} compared.`);
if (growers[0]) {
  console.log(
    `Top rate: ${growers[0].name} ${(growers[0].wowPct * 100).toFixed(1)}% (${growers[0].weekAgo} → ${growers[0].users})`
  );
}
