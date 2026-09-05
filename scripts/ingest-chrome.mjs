import { createReadStream, existsSync } from "node:fs";
import { parse } from "csv-parse";
import { clip, insertBatch, openDb, opportunity, toFloat, toInt } from "./db.mjs";

const DEFAULT_CSV =
  process.env.CHROME_CSV ||
  "/Users/paolodomingo/Downloads/ranking-stats-20260825.csv";

const csvPath = process.argv[2] || DEFAULT_CSV;

if (!existsSync(csvPath)) {
  console.error(`Chrome CSV not found: ${csvPath}`);
  console.error("Pass a path: npm run ingest:chrome -- /path/to/ranking-stats.csv");
  process.exit(1);
}

function authorOf(row) {
  return clip(row.rawAuthorName || row.author || "", 160);
}

const db = openDb();
db.prepare("DELETE FROM listings WHERE source = ?").run("chrome");

const parser = createReadStream(csvPath).pipe(
  parse({
    columns: true,
    relax_quotes: true,
    relax_column_count: true,
    skip_empty_lines: true,
    bom: true,
  })
);

const batch = [];
const BATCH = 400;
let seen = 0;
let kept = 0;

console.log(`Ingesting Chrome dump from ${csvPath}`);
db.exec("BEGIN");

try {
  for await (const row of parser) {
    seen += 1;
    const listing_id = String(row.id || "").trim();
    const name = clip(row.name, 200);
    if (!listing_id || !name) continue;

    const demand = toInt(row.userCount);
    const rating = toFloat(row.ratingValue);
    const review_count = toInt(row.ratingCount);
    const last_update = String(row.lastUpdate || "").slice(0, 32);

    kept += 1;
    batch.push({
      listing_id,
      name,
      description: clip(row.description, 400),
      url: String(row.url || "").trim(),
      category: clip(row.category, 80),
      item_category: clip(row.itemCategory, 40) || "extension",
      demand,
      rating,
      review_count,
      author: authorOf(row),
      last_update,
      payment_type: clip(row.paymentType, 40),
      store_rank: toInt(row["extension-rank"] || row["overall-rank"]),
      downloads: null,
      opportunity: opportunity({
        demand,
        reviewCount: review_count,
        rating,
        lastUpdate: last_update,
      }),
    });

    if (batch.length >= BATCH) {
      insertBatch(db, "chrome", batch);
      batch.length = 0;
      if (kept % 20000 === 0) {
        process.stdout.write(`  ${kept.toLocaleString()} rows\n`);
      }
    }
  }

  if (batch.length) insertBatch(db, "chrome", batch);
  db.exec("COMMIT");
} catch (err) {
  db.exec("ROLLBACK");
  throw err;
}

const counts = db
  .prepare(
    `SELECT item_category, COUNT(*) AS n
     FROM listings WHERE source = 'chrome'
     GROUP BY item_category ORDER BY n DESC`
  )
  .all();

console.log(`Done. Read ${seen.toLocaleString()} rows, stored ${kept.toLocaleString()}.`);
for (const row of counts) {
  console.log(`  ${row.item_category || "(blank)"}: ${Number(row.n).toLocaleString()}`);
}
db.close();
