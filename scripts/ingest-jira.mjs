import { clip, insertBatch, openDb, opportunity, toFloat, toInt } from "./db.mjs";
import { saveSnapshot, writeSnapshotJson } from "./snapshots.mjs";

const PAGE = 50;
const BASE = "https://marketplace.atlassian.com/rest/2/addons";

async function fetchPage(offset) {
  const url = `${BASE}?application=jira&limit=${PAGE}&offset=${offset}`;
  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "marketplace-analyzer/0.1 (local research)",
    },
  });
  if (res.status === 410) {
    throw new Error(
      "Marketplace V2 API returned 410 Gone. V3 catalog fallback needs an Atlassian API token — stop and tell Paolo."
    );
  }
  if (res.status === 429) {
    const wait = Number(res.headers.get("retry-after") || 3) * 1000;
    await new Promise((r) => setTimeout(r, wait));
    return fetchPage(offset);
  }
  if (!res.ok) {
    throw new Error(`Marketplace API ${res.status} at offset ${offset}`);
  }
  return res.json();
}

function marketplaceUrl(addon) {
  const href = addon?._links?.alternate?.href || "";
  if (!href) return "";
  return href.startsWith("http")
    ? href
    : `https://marketplace.atlassian.com${href}`;
}

function mapAddon(addon) {
  const dist = addon._embedded?.distribution || {};
  const reviews = addon._embedded?.reviews || {};
  const categories = addon._embedded?.categories || [];
  const vendor = addon._embedded?.vendor || {};
  const demand = toInt(dist.totalInstalls);
  const rating = toFloat(reviews.averageStars);
  const review_count = toInt(reviews.count);
  const last_update = String(addon._embedded?.lastModified || "").slice(0, 32);

  return {
    listing_id: String(addon.key || addon.id || "").trim(),
    name: clip(addon.name, 200),
    description: clip(addon.summary || addon.tagLine, 400),
    url: marketplaceUrl(addon),
    category: clip(categories[0]?.name, 80),
    item_category: "jira-app",
    demand,
    rating,
    review_count,
    author: clip(vendor.name, 160),
    last_update,
    payment_type: "",
    store_rank: null,
    downloads: toInt(dist.downloads),
    opportunity: opportunity({
      demand,
      reviewCount: review_count,
      rating,
      lastUpdate: last_update,
    }),
  };
}

const db = openDb();
console.log("Fetching Jira Marketplace apps from Atlassian…");

const first = await fetchPage(0);
const total = Number(first.count || 0);
const rows = [];

function take(payload) {
  for (const addon of payload._embedded?.addons || []) {
    const mapped = mapAddon(addon);
    if (mapped.listing_id && mapped.name) rows.push(mapped);
  }
}

take(first);
process.stdout.write(`  ${rows.length}/${total}\n`);

for (let offset = PAGE; offset < total; offset += PAGE) {
  const page = await fetchPage(offset);
  take(page);
  if (rows.length % 250 === 0 || offset + PAGE >= total) {
    process.stdout.write(`  ${rows.length}/${total}\n`);
  }
}

db.exec("BEGIN");
try {
  db.prepare("DELETE FROM listings WHERE source = ?").run("jira");
  insertBatch(db, "jira", rows);
  db.exec("COMMIT");
} catch (err) {
  db.exec("ROLLBACK");
  throw err;
}

const snap = saveSnapshot(db, "jira");
const path = writeSnapshotJson(db, "jira", snap.date);
console.log(`Done. Stored ${rows.length.toLocaleString()} Jira apps.`);
if (snap.added) {
  console.log(`Saved ${snap.date} baseline: ${path}`);
} else {
  console.log(`Kept the existing ${snap.date} baseline. New installs are in the live list for comparison.`);
}
db.close();
