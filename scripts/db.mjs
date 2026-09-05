import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
export const DATA_DIR = join(root, "data");
export const DB_PATH = join(DATA_DIR, "app.db");

export function openDb({ readonly = false } = {}) {
  mkdirSync(DATA_DIR, { recursive: true });
  const db = new DatabaseSync(DB_PATH, { readOnly: readonly });
  if (!readonly) {
    db.exec("PRAGMA journal_mode = WAL");
    db.exec("PRAGMA synchronous = NORMAL");
    db.exec(`
      CREATE TABLE IF NOT EXISTS listings (
        source TEXT NOT NULL,
        listing_id TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        url TEXT,
        category TEXT,
        item_category TEXT,
        demand INTEGER NOT NULL DEFAULT 0,
        rating REAL,
        review_count INTEGER NOT NULL DEFAULT 0,
        author TEXT,
        last_update TEXT,
        payment_type TEXT,
        store_rank INTEGER,
        downloads INTEGER,
        opportunity REAL NOT NULL DEFAULT 0,
        PRIMARY KEY (source, listing_id)
      );
      CREATE INDEX IF NOT EXISTS idx_listings_demand
        ON listings(source, demand DESC);
      CREATE INDEX IF NOT EXISTS idx_listings_rating
        ON listings(source, rating DESC);
      CREATE INDEX IF NOT EXISTS idx_listings_reviews
        ON listings(source, review_count DESC);
      CREATE INDEX IF NOT EXISTS idx_listings_opp
        ON listings(source, opportunity DESC);
      CREATE INDEX IF NOT EXISTS idx_listings_category
        ON listings(source, category);
      CREATE INDEX IF NOT EXISTS idx_listings_item
        ON listings(source, item_category);
      CREATE TABLE IF NOT EXISTS snapshots (
        source TEXT NOT NULL,
        listing_id TEXT NOT NULL,
        captured_at TEXT NOT NULL,
        name TEXT,
        demand INTEGER NOT NULL DEFAULT 0,
        review_count INTEGER NOT NULL DEFAULT 0,
        rating REAL,
        downloads INTEGER,
        PRIMARY KEY (source, listing_id, captured_at)
      );
      CREATE INDEX IF NOT EXISTS idx_snapshots_day
        ON snapshots(source, captured_at);
      CREATE TABLE IF NOT EXISTS chrome_movers (
        listing_id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        author TEXT,
        url TEXT,
        category TEXT,
        item_category TEXT,
        payment_type TEXT,
        demand INTEGER NOT NULL DEFAULT 0,
        rating REAL,
        review_count INTEGER NOT NULL DEFAULT 0,
        featured INTEGER NOT NULL DEFAULT 0,
        last_update TEXT,
        created_at TEXT,
        week_ago INTEGER,
        wow_delta INTEGER NOT NULL DEFAULT 0,
        wow_pct REAL,
        from_zero INTEGER NOT NULL DEFAULT 0,
        month_delta INTEGER NOT NULL DEFAULT 0,
        month_pct REAL,
        q3_delta INTEGER NOT NULL DEFAULT 0,
        q3_pct REAL,
        age_days INTEGER,
        matched INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_movers_wow ON chrome_movers(wow_pct DESC);
      CREATE INDEX IF NOT EXISTS idx_movers_delta ON chrome_movers(wow_delta DESC);
    `);
  }
  return db;
}

export function replaceSource(db, source, rows) {
  db.exec("BEGIN");
  try {
    db.prepare("DELETE FROM listings WHERE source = ?").run(source);
    const insert = db.prepare(`
      INSERT INTO listings (
        source, listing_id, name, description, url, category, item_category,
        demand, rating, review_count, author, last_update, payment_type,
        store_rank, downloads, opportunity
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?
      )
    `);
    for (const row of rows) {
      insert.run(
        source,
        row.listing_id,
        row.name,
        row.description,
        row.url,
        row.category,
        row.item_category,
        row.demand,
        row.rating,
        row.review_count,
        row.author,
        row.last_update,
        row.payment_type,
        row.store_rank,
        row.downloads,
        row.opportunity
      );
    }
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

export function insertBatch(db, source, rows) {
  const insert = db.prepare(`
    INSERT OR REPLACE INTO listings (
      source, listing_id, name, description, url, category, item_category,
      demand, rating, review_count, author, last_update, payment_type,
      store_rank, downloads, opportunity
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?
    )
  `);
  for (const row of rows) {
    insert.run(
      source,
      row.listing_id,
      row.name,
      row.description,
      row.url,
      row.category,
      row.item_category,
      row.demand,
      row.rating,
      row.review_count,
      row.author,
      row.last_update,
      row.payment_type,
      row.store_rank,
      row.downloads,
      row.opportunity
    );
  }
}

export function toInt(value) {
  if (value === null || value === undefined || value === "") return 0;
  const n = Number(String(value).replace(/,/g, ""));
  return Number.isFinite(n) ? Math.round(n) : 0;
}

export function toFloat(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function clip(text, max = 400) {
  if (!text) return "";
  const s = String(text).replace(/\s+/g, " ").trim();
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

export function opportunity({ demand, reviewCount, rating, lastUpdate }) {
  const d = Math.max(0, Number(demand) || 0);
  const r = Math.max(0, Number(reviewCount) || 0);
  const ratingN = Number(rating);
  const ratingGap = Number.isFinite(ratingN) ? Math.max(0, 5.1 - ratingN) : 0;
  let score = Math.log10(d + 1) * Math.log10(r + 1) * ratingGap;
  if (lastUpdate) {
    const ts = Date.parse(lastUpdate);
    if (Number.isFinite(ts)) {
      const ageDays = (Date.now() - ts) / 86400000;
      if (ageDays > 365) score *= 1.15;
    }
  }
  return Math.round(score * 1000) / 1000;
}
