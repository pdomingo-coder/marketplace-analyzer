import { loadEnv } from "./env.mjs";
loadEnv();

import { openDb } from "./db.mjs";
import { chromeTrendsMany } from "./chrome-stats.mjs";

const db = openDb({ readonly: true });
const rows = db
  .prepare(
    `SELECT listing_id, name, demand
     FROM listings
     WHERE source = 'chrome' AND item_category = 'extension' AND review_count >= 20
     ORDER BY demand DESC
     LIMIT 100`
  )
  .all();
db.close();

console.log(`Fetching Chrome-Stats growth for ${rows.length} top extensions…`);
const t0 = Date.now();
const { rows: trends, quota } = await chromeTrendsMany(rows.map((r) => r.listing_id));
console.log(
  `Done in ${Date.now() - t0}ms. Cached ${trends.length}. Quota hit: ${quota ? "yes" : "no"}`
);
