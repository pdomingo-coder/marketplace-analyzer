import { loadEnv } from "./env.mjs";
loadEnv();

import { openDb } from "./db.mjs";
import { groupListings } from "./jobs.mjs";
import { analyzePain } from "./reviews.mjs";

function topCategories(db, source, itemCategory, limit) {
  const where = ["source = ?", "category IS NOT NULL", "category != ''"];
  const args = [source];
  if (itemCategory) {
    where.push("item_category = ?");
    args.push(itemCategory);
  }
  return db
    .prepare(
      `SELECT category, SUM(demand) AS demand
       FROM listings
       WHERE ${where.join(" AND ")}
       GROUP BY category
       ORDER BY demand DESC
       LIMIT ?`
    )
    .all(...args, limit);
}

function listingsFor(db, source, category, itemCategory, ids = []) {
  const demandFloor = source === "jira" ? 500 : 10000;
  const where = ["source = ?", "category = ?", "review_count >= 15"];
  const args = [source, category];
  if (source === "chrome" && itemCategory) {
    where.push("item_category = ?");
    args.push(itemCategory);
  }
  if (ids.length) {
    where.push(`listing_id IN (${ids.map(() => "?").join(",")})`);
    args.push(...ids);
  } else {
    where.push("rating IS NOT NULL", "rating < 4.2", "demand >= ?");
    args.push(demandFloor);
  }
  return db
    .prepare(
      `SELECT listing_id, name, url, rating, review_count, demand
       FROM listings
       WHERE ${where.join(" AND ")}
       ORDER BY demand DESC
       LIMIT 6`
    )
    .all(...args);
}

function groupRows(db, source, category, itemCategory) {
  const where = ["source = ?", "category = ?"];
  const args = [source, category];
  if (source === "chrome" && itemCategory) {
    where.push("item_category = ?");
    args.push(itemCategory);
  }
  return db
    .prepare(
      `SELECT listing_id, name, description, demand, rating
       FROM listings
       WHERE ${where.join(" AND ")}
       ORDER BY demand DESC
       LIMIT 500`
    )
    .all(...args);
}

async function warm(db, source, category, itemCategory, ids, label) {
  const listings = listingsFor(db, source, category, itemCategory, ids);
  if (!listings.length) {
    console.log(`  skip ${label}`);
    return;
  }
  const t0 = Date.now();
  const out = await analyzePain(listings, source);
  console.log(
    `  ${String(Date.now() - t0).padStart(5)}ms  ${out.method.padEnd(5)}  ${label}  ${out.themes?.length || 0} cards`
  );
}

async function mapLimit(items, limit, fn) {
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

const db = openDb({ readonly: true });
const jobs = [];

for (const source of ["jira", "chrome"]) {
  const itemCategory = source === "chrome" ? "extension" : "";
  const cats = topCategories(db, source, itemCategory, 6);
  console.log(`\n${source}: ${cats.map((c) => c.category).join(", ")}`);
  for (const cat of cats) {
    jobs.push({
      source,
      category: cat.category,
      itemCategory,
      ids: [],
      label: `${source} / ${cat.category}`,
    });
  }
  for (const cat of cats.slice(0, 2)) {
    const groups = groupListings(groupRows(db, source, cat.category, itemCategory)).slice(0, 3);
    for (const g of groups) {
      jobs.push({
        source,
        category: cat.category,
        itemCategory,
        ids: (g.ids || []).slice(0, 80),
        label: `${source} / ${cat.category} / ${g.label}`,
      });
    }
  }
}

console.log(`\nWarming ${jobs.length} views (first load is slow, clicks after that are instant)…`);
await mapLimit(jobs, 2, (job) =>
  warm(db, job.source, job.category, job.itemCategory, job.ids, job.label)
);
console.log("\nDone. Open http://127.0.0.1:4747 and click those types.");
db.close();
