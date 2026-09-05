import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DATA_DIR } from "./db.mjs";

export function todayStamp(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function dayDiff(a, b) {
  const ms = Date.parse(`${a}T00:00:00`) - Date.parse(`${b}T00:00:00`);
  return Math.round(ms / 86400000);
}

function addDays(stamp, n) {
  const [y, m, d] = stamp.split("-").map(Number);
  return todayStamp(new Date(y, m - 1, d + n));
}

export function saveSnapshot(db, source, date = todayStamp()) {
  const info = db
    .prepare(
      `INSERT OR IGNORE INTO snapshots (
         source, listing_id, captured_at, name, demand, review_count, rating, downloads
       )
       SELECT source, listing_id, ?, name, demand, review_count, rating, downloads
       FROM listings
       WHERE source = ?`
    )
    .run(date, source);
  return { date, added: Number(info.changes) || 0 };
}

export function snapshotDates(db, source) {
  return db
    .prepare(
      `SELECT DISTINCT captured_at AS d FROM snapshots WHERE source = ? ORDER BY captured_at`
    )
    .all(source)
    .map((row) => row.d);
}

export function pickBaseline(dates, today = todayStamp()) {
  if (!dates.length) return null;
  const older = dates.filter((d) => d < today);
  const pool = older.length ? older : dates;
  const target = addDays(today, -7);
  return pool.reduce((best, d) =>
    Math.abs(dayDiff(d, target)) < Math.abs(dayDiff(best, target)) ? d : best
  );
}

export function writeSnapshotJson(db, source, date) {
  const path = join(DATA_DIR, `${source}-snapshot-${date}.json`);
  if (existsSync(path)) return path;
  const apps = db
    .prepare(
      `SELECT listing_id AS id, name, demand, review_count, rating, downloads
       FROM snapshots
       WHERE source = ? AND captured_at = ?
       ORDER BY demand DESC`
    )
    .all(source, date);
  writeFileSync(
    path,
    JSON.stringify({ source, captured_at: date, count: apps.length, apps })
  );
  return path;
}
