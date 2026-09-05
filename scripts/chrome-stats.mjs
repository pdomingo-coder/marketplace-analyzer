import { cacheGet, cacheSet } from "./cache.mjs";

const BASE = "https://chrome-stats.com/api/trends";

function seriesOf(stats) {
  return (Array.isArray(stats) ? stats : [])
    .map((row) => ({
      day: String(row?.ts || ""),
      users: Number(row?.value?.userCount) || 0,
    }))
    .filter((row) => row.day);
}

export function wowFromStats(stats) {
  const series = seriesOf(stats);
  if (!series.length) {
    return { series: [], users: 0, weekAgo: null, delta: null, pct: null, from: "", to: "" };
  }
  const now = series[series.length - 1];
  const ago = series.length >= 8 ? series[series.length - 8] : series[0];
  const delta = now.users - ago.users;
  const pct = ago.users ? delta / ago.users : null;
  return {
    series,
    users: now.users,
    weekAgo: ago.users,
    delta,
    pct,
    from: ago.day,
    to: now.day,
  };
}

export async function chromeTrends(id) {
  const key = String(id || "").trim();
  if (!key) return null;
  const hit = cacheGet("growth", key);
  if (hit) return hit;

  const apiKey = process.env.CHROME_STATS_API_KEY || "";
  if (!apiKey) throw new Error("CHROME_STATS_API_KEY is missing");

  const res = await fetch(`${BASE}?id=${encodeURIComponent(key)}&numDays=14`, {
    headers: { "x-api-key": apiKey, Accept: "application/json" },
    signal: AbortSignal.timeout(20000),
  });
  if (res.status === 429) throw new Error("Chrome-Stats quota hit. Try again later.");
  if (!res.ok) return null;
  const data = await res.json();
  const wow = wowFromStats(data.stats);
  const packed = {
    listing_id: key,
    name: data.name || key,
    users: wow.users || Number(data.userCount) || 0,
    weekAgo: wow.weekAgo,
    delta: wow.delta,
    pct: wow.pct,
    from: wow.from,
    to: wow.to,
    series: wow.series,
  };
  cacheSet("growth", key, packed);
  return packed;
}

export async function chromeTrendsMany(ids) {
  const unique = [...new Set(ids.map((id) => String(id || "").trim()).filter(Boolean))].slice(0, 100);
  const out = new Array(unique.length);
  let next = 0;
  let quota = false;
  async function worker() {
    while (next < unique.length) {
      const i = next++;
      const id = unique[i];
      const hit = cacheGet("growth", id);
      if (hit) {
        out[i] = hit;
        continue;
      }
      if (quota) {
        out[i] = null;
        continue;
      }
      try {
        out[i] = await chromeTrends(id);
      } catch (err) {
        if (String(err.message || "").includes("quota")) {
          quota = true;
          out[i] = null;
          continue;
        }
        throw err;
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(3, unique.length) }, worker));
  return { rows: out.filter(Boolean), quota };
}
