import { openDb } from "./db.mjs";
import { saveSnapshot, writeSnapshotJson } from "./snapshots.mjs";

const db = openDb();
const { date, added } = saveSnapshot(db, "jira");
const path = writeSnapshotJson(db, "jira", date);
const n = db
  .prepare(`SELECT COUNT(*) AS n FROM snapshots WHERE source = 'jira' AND captured_at = ?`)
  .get(date).n;
db.close();

if (!added && n) {
  console.log(`Jira baseline for ${date} already saved (${Number(n).toLocaleString()} apps). Left it as-is.`);
} else {
  console.log(`Saved Jira baseline for ${date}: ${Number(n).toLocaleString()} apps.`);
}
console.log(`File: ${path}`);
