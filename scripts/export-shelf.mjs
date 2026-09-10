import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { openDb } from "./db.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "public", "data");
mkdirSync(outDir, { recursive: true });

const db = openDb({ readonly: true });

function categories(source) {
  return db
    .prepare(
      `SELECT category, COUNT(*) AS n, SUM(demand) AS demand, AVG(rating) AS rating
       FROM listings
       WHERE source = ? AND category IS NOT NULL AND category != ''
       GROUP BY category
       ORDER BY demand DESC`
    )
    .all(source);
}

function counts(source) {
  return db.prepare(`SELECT COUNT(*) AS n, SUM(demand) AS demand FROM listings WHERE source = ?`).get(source);
}

function rows(source, extraWhere = "", extraArgs = [], limit = 3000) {
  return db
    .prepare(
      `SELECT listing_id, name, url, category, item_category, demand, rating,
              review_count, author, last_update, payment_type, opportunity
       FROM listings
       WHERE source = ? ${extraWhere}
       ORDER BY demand DESC
       LIMIT ?`
    )
    .all(source, ...extraArgs, limit);
}

const chrome = {
  source: "chrome",
  asOf: new Date().toISOString().slice(0, 10),
  total: Number(counts("chrome")?.n || 0),
  categories: categories("chrome"),
  rows: rows("chrome", "AND item_category = ? AND review_count >= ?", ["extension", 20], 3000),
};

const jira = {
  source: "jira",
  asOf: chrome.asOf,
  total: Number(counts("jira")?.n || 0),
  categories: categories("jira"),
  rows: rows("jira", "", [], 6000),
};

writeFileSync(join(outDir, "chrome-shelf.json"), JSON.stringify(chrome));
writeFileSync(join(outDir, "jira-shelf.json"), JSON.stringify(jira));
db.close();
console.log(`Chrome snapshot ${chrome.rows.length} / ${chrome.total}`);
console.log(`Jira snapshot ${jira.rows.length} / ${jira.total}`);
