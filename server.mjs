import { createReadStream, existsSync, statSync, appendFileSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnv } from "./scripts/env.mjs";
import { openDb } from "./scripts/db.mjs";
import { analyzePain } from "./scripts/reviews.mjs";
import { chromeTrendsMany } from "./scripts/chrome-stats.mjs";
import { dayDiff, pickBaseline, snapshotDates, todayStamp } from "./scripts/snapshots.mjs";

loadEnv();

const root = join(fileURLToPath(new URL(".", import.meta.url)));
const publicDir = join(root, "public");
const PORT = Number(process.env.PORT || 4747);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

const SORTS = {
  demand: "demand DESC, review_count DESC",
  reviews: "review_count DESC, demand DESC",
  rating: "rating DESC, review_count DESC",
  opportunity: "opportunity DESC, demand DESC",
  stale: "last_update ASC, demand DESC",
};

function json(res, status, body) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(body));
}

let db = null;
let queue = Promise.resolve();

function getDb() {
  if (db) return db;
  if (!existsSync(join(root, "data", "app.db"))) return null;
  db = openDb({ readonly: true });
  return db;
}

function withDb(fn) {
  const run = queue.then(() => fn(getDb()));
  queue = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

function parseUrl(req) {
  return new URL(req.url, `http://${req.headers.host || "localhost"}`);
}

function listQuery(url) {
  const source = url.searchParams.get("source") === "jira" ? "jira" : "chrome";
  const sort = SORTS[url.searchParams.get("sort")] ? url.searchParams.get("sort") : "demand";
  const q = (url.searchParams.get("q") || "").trim().slice(0, 80);
  const category = (url.searchParams.get("category") || "").trim();
  const itemCategory = (url.searchParams.get("itemCategory") || "").trim();
  const payment = (url.searchParams.get("payment") || "").trim();
  const minDemand = Math.max(0, Number(url.searchParams.get("minDemand") || 0) || 0);
  const minRating = Math.max(0, Number(url.searchParams.get("minRating") || 0) || 0);
  const minReviews = Math.max(0, Number(url.searchParams.get("minReviews") || 0) || 0);
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") || 50) || 50));
  const offset = Math.max(0, Number(url.searchParams.get("offset") || 0) || 0);
  const idsRaw = (url.searchParams.get("ids") || "").trim();
  const ids = idsRaw
    ? idsRaw.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 80)
    : [];
  return {
    source,
    sort,
    q,
    category,
    itemCategory,
    payment,
    minDemand,
    minRating,
    minReviews,
    ids,
    limit,
    offset,
  };
}

function whereClause(params, alias = "") {
  const col = (name) => (alias ? `${alias}.${name}` : name);
  const where = [`${col("source")} = ?`];
  const args = [params.source];
  if (params.q) {
    where.push(`(${col("name")} LIKE ? OR ${col("author")} LIKE ?)`);
    const like = `%${params.q.replaceAll("%", "").replaceAll("_", "")}%`;
    args.push(like, like);
  }
  if (params.category) {
    where.push(`${col("category")} = ?`);
    args.push(params.category);
  }
  if (params.itemCategory) {
    where.push(`${col("item_category")} = ?`);
    args.push(params.itemCategory);
  }
  if (params.payment) {
    where.push(`${col("payment_type")} = ?`);
    args.push(params.payment);
  }
  if (params.minDemand) {
    where.push(`${col("demand")} >= ?`);
    args.push(params.minDemand);
  }
  if (params.minRating) {
    where.push(`${col("rating")} >= ?`);
    args.push(params.minRating);
  }
  if (params.minReviews) {
    where.push(`${col("review_count")} >= ?`);
    args.push(params.minReviews);
  }
  if (params.ids?.length) {
    where.push(`${col("listing_id")} IN (${params.ids.map(() => "?").join(",")})`);
    args.push(...params.ids);
  }
  return { where: where.join(" AND "), args };
}

function handleApi(req, res, url) {
  withDb((conn) => {
    if (!conn) {
      return json(res, 200, {
        ready: false,
        message: "No data yet. Run npm run ingest:chrome and npm run ingest:jira.",
      });
    }

    try {
      if (url.pathname === "/api/meta") {
        const counts = conn
          .prepare(
            `SELECT source, COUNT(*) AS n, SUM(demand) AS demand
             FROM listings GROUP BY source`
          )
          .all();
        const types = conn
          .prepare(
            `SELECT source, item_category, COUNT(*) AS n
             FROM listings GROUP BY source, item_category`
          )
          .all();
        return json(res, 200, { ready: true, counts, types });
      }

      if (url.pathname === "/api/categories") {
        const source = url.searchParams.get("source") === "jira" ? "jira" : "chrome";
        const rows = conn
          .prepare(
            `SELECT category, COUNT(*) AS n, SUM(demand) AS demand,
                    AVG(rating) AS rating
             FROM listings
             WHERE source = ? AND category IS NOT NULL AND category != ''
             GROUP BY category
             ORDER BY demand DESC`
          )
          .all(source);
        return json(res, 200, { source, categories: rows });
      }

      if (url.pathname === "/api/groups") {
        const params = listQuery(url);
        if (!params.category) {
          return json(res, 200, { ready: true, groups: [] });
        }
        const where = ["source = ?", "category = ?"];
        const args = [params.source, params.category];
        if (params.itemCategory) {
          where.push("item_category = ?");
          args.push(params.itemCategory);
        }
        const rows = conn
          .prepare(
            `SELECT listing_id, name, description, demand, rating
             FROM listings
             WHERE ${where.join(" AND ")}
             ORDER BY demand DESC
             LIMIT 500`
          )
          .all(...args);
        return json(res, 200, {
          ready: true,
          source: params.source,
          category: params.category,
          groups: groupListings(rows),
        });
      }

      if (url.pathname === "/api/insights") {
        const params = listQuery(url);
        const { where, args } = whereClause(params);
        const demandFloor = params.source === "jira" ? 500 : 10000;
        const summary = conn
          .prepare(
            `SELECT COUNT(*) AS listings,
                    COALESCE(SUM(demand), 0) AS demand,
                    AVG(CASE WHEN rating > 0 THEN rating END) AS avg_rating,
                    SUM(CASE WHEN rating IS NOT NULL AND rating < 3.5
                              AND review_count >= ? THEN 1 ELSE 0 END) AS weak_rated,
                    SUM(CASE WHEN last_update IS NOT NULL AND last_update != ''
                              AND date(substr(last_update, 1, 10)) < date('now', '-365 days')
                              AND demand >= ? THEN 1 ELSE 0 END) AS stale
             FROM listings WHERE ${where}`
          )
          .get(params.minReviews || 20, demandFloor, ...args);

        const better = conn
          .prepare(
            `SELECT category,
                    COUNT(*) AS n,
                    COALESCE(SUM(demand), 0) AS demand,
                    AVG(rating) AS avg_rating,
                    (5.0 - AVG(rating)) * ln(COALESCE(SUM(demand), 0) + 1) AS gap
             FROM listings
             WHERE ${where}
               AND category IS NOT NULL AND category != ''
               AND rating IS NOT NULL
               AND rating > 0
             GROUP BY category
             HAVING COUNT(*) >= 5
               AND AVG(rating) < 4.2
               AND SUM(demand) >= ?
             ORDER BY gap DESC
             LIMIT 5`
          )
          .all(...args, demandFloor * 5);

        const stale = conn
          .prepare(
            `SELECT listing_id, name, url, category, demand, rating,
                    review_count, last_update
             FROM listings
             WHERE ${where}
               AND last_update IS NOT NULL AND last_update != ''
               AND date(substr(last_update, 1, 10)) < date('now', '-365 days')
               AND demand >= ?
             ORDER BY demand DESC
             LIMIT 5`
          )
          .all(...args, demandFloor);

        const thin = conn
          .prepare(
            `SELECT category,
                    COUNT(*) AS n,
                    COALESCE(SUM(demand), 0) AS demand,
                    CAST(SUM(demand) AS REAL) / COUNT(*) AS demand_per
             FROM listings
             WHERE ${where}
               AND category IS NOT NULL AND category != ''
             GROUP BY category
             HAVING COUNT(*) BETWEEN 5 AND 80 AND SUM(demand) >= ?
             ORDER BY demand_per DESC
             LIMIT 5`
          )
          .all(...args, demandFloor * 10);

        return json(res, 200, {
          ready: true,
          source: params.source,
          summary,
          better,
          stale,
          thin,
        });
      }

      if (url.pathname === "/api/top") {
        const params = listQuery(url);
        const { where, args } = whereClause(params);
        const total = conn
          .prepare(`SELECT COUNT(*) AS n FROM listings WHERE ${where}`)
          .get(...args);
        const rows = conn
          .prepare(
            `SELECT listing_id, name, description, url, category, item_category,
                    demand, rating, review_count, author, last_update,
                    payment_type, store_rank, downloads, opportunity
             FROM listings
             WHERE ${where}
             ORDER BY ${SORTS[params.sort]}
             LIMIT ? OFFSET ?`
          )
          .all(...args, params.limit, params.offset);
        return json(res, 200, {
          ready: true,
          source: params.source,
          sort: params.sort,
          total: Number(total?.n || 0),
          offset: params.offset,
          limit: params.limit,
          rows,
        });
      }

      return json(res, 404, { error: "not found" });
    } catch (err) {
      console.error(err);
      return json(res, 500, { error: "query failed" });
    }
  });
}

function serveStatic(res, pathname) {
  let file = pathname === "/" ? "/index.html" : pathname;
  if (file.includes("..")) {
    res.writeHead(400);
    res.end("bad path");
    return;
  }
  const full = join(publicDir, file);
  if (!existsSync(full) || !statSync(full).isFile()) {
    res.writeHead(404);
    res.end("not found");
    return;
  }
  const type = MIME[extname(full)] || "application/octet-stream";
  res.writeHead(200, { "Content-Type": type });
  createReadStream(full).pipe(res);
}

function pickPainTargets(conn, url) {
  const source = url.searchParams.get("source") === "jira" ? "jira" : "chrome";
  const category = (url.searchParams.get("category") || "").trim();
  const itemCategory = (url.searchParams.get("itemCategory") || "").trim();
  const idsRaw = (url.searchParams.get("ids") || "").trim();
  const ids = idsRaw
    ? idsRaw.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 80)
    : [];
  if (!category) return { source, category, listings: [] };
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
  const listings = conn
    .prepare(
      `SELECT listing_id, name, url, rating, review_count, demand
       FROM listings
       WHERE ${where.join(" AND ")}
       ORDER BY demand DESC
       LIMIT 6`
    )
    .all(...args);
  return { source, category, listings };
}

async function handlePain(req, res, url) {
  try {
    const picked = await withDb((conn) => {
      if (!conn) {
        return { ready: false, message: "No data yet." };
      }
      return pickPainTargets(conn, url);
    });
    if (picked.ready === false) return json(res, 200, picked);
    if (!picked.category) {
      return json(res, 200, { ready: true, themes: [], notes: 0, scanned: 0 });
    }
    if (!picked.listings.length) {
      return json(res, 200, {
        ready: true,
        source: picked.source,
        category: picked.category,
        scanned: 0,
        notes: 0,
        themes: [],
        apps: [],
        message: "No busy, low-score apps in this type.",
      });
    }
    const payload = await analyzePain(picked.listings, picked.source);
    payload.category = picked.category;
    return json(res, 200, payload);
  } catch (err) {
    console.error(err);
    if (!res.headersSent) json(res, 500, { error: "could not read notes" });
  }
}

function jiraGrowth(params) {
  return withDb((conn) => {
    if (!conn) return { ready: false, source: "jira", rows: [], message: "No data yet." };
    const table = conn
      .prepare(`SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = 'snapshots'`)
      .get();
    if (!table) {
      return {
        ready: true,
        source: "jira",
        rows: [],
        title: "Installs vs last snapshot · top 100",
        message: "No Jira baseline yet. Run npm run snapshot:jira.",
      };
    }
    const dates = snapshotDates(conn, "jira");
    if (!dates.length) {
      return {
        ready: true,
        source: "jira",
        rows: [],
        title: "Installs vs last snapshot · top 100",
        message: "No Jira baseline yet. Run npm run snapshot:jira.",
      };
    }
    const today = todayStamp();
    const from = pickBaseline(dates, today);
    const { where, args } = whereClause(params, "l");
    const raw = conn
      .prepare(
        `SELECT l.listing_id, l.name, l.url, l.demand, l.category, s.demand AS week_ago
         FROM listings l
         LEFT JOIN snapshots s
           ON s.source = l.source
          AND s.listing_id = l.listing_id
          AND s.captured_at = ?
         WHERE ${where}
         ORDER BY l.demand DESC
         LIMIT 100`
      )
      .all(from, ...args);
    const rows = raw.map((row, i) => {
      const users = Number(row.demand) || 0;
      const weekAgo = row.week_ago == null ? null : Number(row.week_ago) || 0;
      const delta = weekAgo == null ? null : users - weekAgo;
      const pct = weekAgo ? delta / weekAgo : weekAgo === 0 && delta ? null : delta === 0 ? 0 : null;
      return {
        rank: i + 1,
        listing_id: row.listing_id,
        name: row.name,
        url: row.url,
        category: row.category || "",
        demand: users,
        users,
        weekAgo,
        delta,
        pct,
        from,
        to: today,
        series:
          weekAgo == null
            ? []
            : [
                { day: from, users: weekAgo },
                { day: today, users },
              ],
      };
    });
    const days = Math.abs(dayDiff(today, from));
    const anyDelta = rows.some((row) => row.delta);
    if (from === today && !anyDelta) {
      return {
        ready: true,
        source: "jira",
        rows: [],
        from,
        to: today,
        days: 0,
        title: "Installs vs last snapshot · top 100",
        message: `Baseline saved ${from}. Next week run npm run ingest:jira, then refresh this page.`,
      };
    }
    const span = days === 1 ? "1 day" : `${days} days`;
    return {
      ready: true,
      source: "jira",
      rows,
      from,
      to: today,
      days,
      title: `Installs vs ${from} · top 100`,
      message: `Top ${rows.length} by installs in this view. Compared with the ${from} snapshot (${span}).`,
    };
  });
}

async function handleGrowth(req, res, url) {
  try {
    const params = listQuery(url);
    if (params.source === "jira") {
      return json(res, 200, await jiraGrowth(params));
    }
    if (!process.env.CHROME_STATS_API_KEY) {
      return json(res, 200, {
        ready: false,
        rows: [],
        message: "Chrome-Stats key is missing.",
      });
    }
    const picked = await withDb((conn) => {
      if (!conn) return { ready: false, message: "No data yet.", rows: [] };
      const { where, args } = whereClause(params);
      const rows = conn
        .prepare(
          `SELECT listing_id, name, url, demand, category
           FROM listings
           WHERE ${where}
           ORDER BY demand DESC
           LIMIT 100`
        )
        .all(...args);
      return { ready: true, rows };
    });
    if (!picked.ready) return json(res, 200, picked);
    if (!picked.rows.length) {
      return json(res, 200, { ready: true, source: "chrome", rows: [], message: "No apps in this view." });
    }
    const { rows: trends, quota } = await chromeTrendsMany(picked.rows.map((r) => r.listing_id));
    const byId = new Map(trends.map((t) => [t.listing_id, t]));
    const rows = picked.rows.map((row, i) => {
      const t = byId.get(row.listing_id);
      return {
        rank: i + 1,
        listing_id: row.listing_id,
        name: row.name,
        url: row.url,
        category: row.category || "",
        demand: row.demand,
        users: t?.users ?? row.demand,
        weekAgo: t?.weekAgo ?? null,
        delta: t?.delta ?? null,
        pct: t?.pct ?? null,
        from: t?.from || "",
        to: t?.to || "",
        series: t?.series || [],
      };
    });
    return json(res, 200, {
      ready: true,
      source: "chrome",
      quota,
      rows,
      message: quota
        ? "Chrome-Stats monthly cap was hit. Cached apps still show. The rest need a new month."
        : undefined,
    });
  } catch (err) {
    console.error(err);
    if (!res.headersSent) {
      json(res, 200, {
        ready: false,
        rows: [],
        message: err.message || "Could not read growth.",
      });
    }
  }
}

function onRequest(req, res) {
  const url = parseUrl(req);
  if (url.pathname === "/api/pain") {
    handlePain(req, res, url);
    return;
  }
  if (url.pathname === "/api/growth") {
    handleGrowth(req, res, url);
    return;
  }
  if (url.pathname.startsWith("/api/")) return handleApi(req, res, url);
  return serveStatic(res, url.pathname);
}

process.on("uncaughtException", (err) => {
  console.error("uncaught", err);
  try {
    appendFileSync(join(root, "data", "server.log"), `${new Date().toISOString()} ${err.stack || err}\n`);
  } catch {
    /* ignore */
  }
});
process.on("unhandledRejection", (err) => {
  console.error("unhandled", err);
});

function listenOn(host) {
  const s = createServer(onRequest);
  s.on("error", (err) => {
    if (err.code === "EADDRINUSE") {
      console.error(`Port ${PORT} already in use on ${host}`);
      return;
    }
    console.error(err);
  });
  s.listen(PORT, host, () => {
    console.log(`Marketplace Analyzer → http://127.0.0.1:${PORT} (${host})`);
  });
  return s;
}

if (process.env.PORT) {
  listenOn("0.0.0.0");
} else {
  listenOn("127.0.0.1");
  listenOn("::1");
}
