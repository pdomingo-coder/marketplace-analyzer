import { groupNotesWithAi } from "./ai-pain.mjs";
import { cacheGet, cacheSet } from "./cache.mjs";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const HYGIENE = [
  {
    id: "broken",
    label: "it breaks",
    re: /\b(doesn'?t work|does not work|not working|never works|stopped working|broken|broke|crash|crashes|bug|error|fail|fails|failed|useless|pathetic|garbage)\b/i,
  },
  {
    id: "setup",
    label: "setup is hard",
    re: /\b(set ?up|setup|install loop|configure|confusing|complicated|hard to|cannot figure|can'?t figure|docs|documentation)\b/i,
  },
  {
    id: "slow",
    label: "it is slow",
    re: /\b(slow|lags?|laggy|freeze|frozen|hangs?|timeout|takes forever)\b/i,
  },
  {
    id: "support",
    label: "no one replies",
    re: /\b(support|no reply|no response|customer service|ghosted|ignored)\b/i,
  },
  {
    id: "update",
    label: "it broke after an update",
    re: /\b(after the (last )?update|latest version|regression|manifest v3)\b/i,
  },
  {
    id: "forced",
    label: "it is forced on",
    re: /\b(didn'?t (download|install)|can'?t (remove|uninstall)|cannot (remove|uninstall)|forced|pre-?installed|why is this)\b/i,
  },
];

const FEATURES = [
  {
    id: "sso",
    label: "Sign-in that sticks",
    build: "One sign-in. Stay signed in. No install loop.",
    re: /\b(log ?in|sign[- ]?in|sso|oauth|signed in|session expired|already (installed|downloaded)|redirect(ed)? to (install|download))\b/i,
  },
  {
    id: "accounts",
    label: "More than one account",
    build: "Switch work and personal without a fight.",
    re: /\b(multi(ple)? accounts?|switch accounts?|work and (home|personal|school)|second account)\b/i,
  },
  {
    id: "sync",
    label: "Two-way sync",
    build: "Names, status, and links stay in line on both sides.",
    re: /\b(two-way|bidirectional|webhook|out of sync|doesn'?t (sync|link|connect)|not (linked|connected)|field mapping)\b/i,
  },
  {
    id: "git",
    label: "Git / branch flow",
    build: "Honor the saved branch format. Smart commits that still work.",
    re: /\b(branch format|branches|smart commit|pull request|merge request|commit (link|syntax))\b/i,
  },
  {
    id: "remote",
    label: "Stable screen and clipboard",
    build: "Multi-monitor, clipboard, and calls that do not freeze.",
    re: /\b(multi-?monitor|clipboard|screen share|remote desktop|meet-?call)\b/i,
  },
  {
    id: "offline",
    label: "Works offline",
    build: "Basic use with no network.",
    re: /\b(offline|no internet|without (internet|wifi|network))\b/i,
  },
  {
    id: "shortcuts",
    label: "Keyboard shortcuts",
    build: "Hotkeys for the daily actions.",
    re: /\b(shortcut|hotkey|hot key|keybind)\b/i,
  },
  {
    id: "export",
    label: "Export and backup",
    build: "Let people take their data with them.",
    re: /\b(export|backup|download (my|the) data|\bcsv\b)\b/i,
  },
  {
    id: "search",
    label: "Search that finds it",
    build: "Find issues, files, and people fast.",
    re: /\b(search (doesn'?t|sucks|bar)|no filter|can'?t find|cannot find|filter by)\b/i,
  },
  {
    id: "bulk",
    label: "Bulk edit",
    build: "Change many rows at once.",
    re: /\b(bulk|batch edit|select all|multi(ple)? select)\b/i,
  },
  {
    id: "notify",
    label: "Alerts that help",
    build: "The right ping. Not a flood.",
    re: /\b(notif|too many (emails?|alerts?|pings?)|email flood|mute)\b/i,
  },
  {
    id: "dark",
    label: "Dark mode",
    build: "A real dark theme.",
    re: /\b(dark mode|dark theme|night mode)\b/i,
  },
  {
    id: "browsers",
    label: "Works in Edge too",
    build: "Chrome, Edge, and work browsers.",
    re: /\b(edge|firefox|safari|other browsers?)\b/i,
  },
  {
    id: "privacy",
    label: "Less tracking",
    build: "Ask for less. Keep work on the device.",
    re: /\b(privacy|spyware|tracking|too many permissions|permissions are)\b/i,
  },
  {
    id: "price",
    label: "Fair free plan",
    build: "Basics free. Pay for extras that are worth it.",
    re: /\b(paywall|subscription|too expensive|free (tier|plan|version)|priced)\b/i,
  },
  {
    id: "automate",
    label: "Rules and automation",
    build: "If X then Y, without a maze.",
    re: /\b(automat(?:e|ion)|workflow rule|if this then|trigger)\b/i,
  },
  {
    id: "fields",
    label: "Fields that fit the team",
    build: "Custom fields people actually use.",
    re: /\b(custom field|required field|field type)\b/i,
  },
  {
    id: "time",
    label: "Time and cost tracking",
    build: "Hours and spend that match the work.",
    re: /\b(time track|timesheet|billable|cost track|budget)\b/i,
  },
  {
    id: "mobile",
    label: "Works on the phone",
    build: "The same job on mobile.",
    re: /\b(on (my )?phone|iphone|android|mobile app)\b/i,
  },
  {
    id: "undo",
    label: "Undo and history",
    build: "Let people reverse a mistake.",
    re: /\b(undo|version history|restore deleted)\b/i,
  },
  {
    id: "pdf",
    label: "PDF and print",
    build: "Clean PDF export.",
    re: /\b(\bpdf\b|print to)\b/i,
  },
  {
    id: "calendar",
    label: "Dates and calendar",
    build: "Due dates that land on a calendar.",
    re: /\b(calendar|due date|time ?zone)\b/i,
  },
  {
    id: "ads",
    label: "No ads",
    build: "Do the job. No extra popups.",
    re: /\b(ads?|advert|pop-?ups?)\b/i,
  },
];

const listingCache = new Map();
const TTL_MS = 60 * 60 * 1000;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function clip(text, max = 160) {
  const s = String(text || "").replace(/\s+/g, " ").trim();
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + "…";
}

function normStars(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  if (x > 5) return Math.round(x / 5);
  return x;
}

async function fetchText(url, headers = {}) {
  const res = await fetch(url, {
    headers: { "User-Agent": UA, ...headers },
    redirect: "follow",
  });
  if (res.status === 429) {
    await sleep(1500);
    return fetchText(url, headers);
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

function parseChromeReviews(html) {
  const m = html.match(/key:\s*'ds:1'[\s\S]*?data:(\[[\s\S]*?]),\s*sideChannel/);
  if (!m) return [];
  let data;
  try {
    data = JSON.parse(m[1]);
  } catch {
    return [];
  }
  const rows = Array.isArray(data?.[1]) ? data[1] : [];
  const out = [];
  for (const row of rows) {
    if (!Array.isArray(row)) continue;
    const body = String(row[3] || "").trim();
    if (!body) continue;
    out.push({
      id: String(row[0] || ""),
      stars: normStars(row[2]),
      body,
    });
  }
  return out;
}

async function chromeReviews(listing) {
  const url = `https://chromewebstore.google.com/detail/${encodeURIComponent(listing.listing_id)}/reviews`;
  const html = await fetchText(url, { Accept: "text/html" });
  return parseChromeReviews(html);
}

async function jiraReviews(listing) {
  const url = `https://marketplace.atlassian.com/rest/2/addons/${encodeURIComponent(listing.listing_id)}/reviews?limit=50&sort=helpful`;
  const raw = await fetchText(url, { Accept: "application/json" });
  const data = JSON.parse(raw);
  const rows = data?._embedded?.reviews || [];
  const out = [];
  for (const row of rows) {
    const body = String(row.review || "").trim();
    if (!body) continue;
    out.push({
      id: String(row.id || ""),
      stars: normStars(row.stars),
      body,
    });
  }
  return out;
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

async function reviewsFor(listing, source) {
  const key = `${source}:${listing.listing_id}`;
  const hit = listingCache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.rows;
  const disk = cacheGet("reviews", key);
  if (disk) {
    listingCache.set(key, { at: Date.now(), rows: disk });
    return disk;
  }
  const rows = source === "jira" ? await jiraReviews(listing) : await chromeReviews(listing);
  listingCache.set(key, { at: Date.now(), rows });
  cacheSet("reviews", key, rows);
  return rows;
}

const inflight = new Map();

export async function analyzePain(listings, source) {
  const cacheKey = `${source}:${listings.map((l) => l.listing_id).sort().join(",")}`;
  const cached = listingCache.get(`pain:${cacheKey}`);
  if (cached && Date.now() - cached.at < TTL_MS) return cached.rows;
  const disk = cacheGet("pain", cacheKey);
  if (disk) {
    listingCache.set(`pain:${cacheKey}`, { at: Date.now(), rows: disk });
    return disk;
  }
  if (inflight.has(cacheKey)) return inflight.get(cacheKey);

  const run = (async () => {
    const notes = [];
    const used = [];
    const conc = source === "jira" ? 6 : 4;
    const results = await mapLimit(listings, conc, async (listing) => {
      try {
        const rows = await reviewsFor(listing, source);
        const usable = rows.filter((r) => r.stars >= 1 && r.stars <= 5 && r.body);
        return { listing, usable };
      } catch {
        return { listing, usable: [] };
      }
    });
    for (const { listing, usable } of results) {
      for (const row of usable) notes.push({ ...row, app: listing.name });
      used.push({
        listing_id: listing.listing_id,
        name: listing.name,
        rating: listing.rating,
        demand: listing.demand,
        notes: usable.length,
      });
    }

    const scored = scoreNotes(notes);
    let method = "words";
    let hygiene = scored.hygiene;
    let themes = scored.themes;
    let read = notes.length;
    try {
      const ai = await groupNotesWithAi(notes);
      if (ai) {
        method = "ai";
        hygiene = ai.hygiene;
        themes = ai.themes;
        read = ai.read || notes.length;
      }
    } catch (err) {
      console.error("AI notes failed, using word match:", err.message);
    }
    const payload = {
      ready: true,
      source,
      method,
      scanned: used.length,
      notes: notes.length,
      read,
      hygiene,
      themes,
      apps: used.filter((a) => a.notes > 0).slice(0, 8),
    };
    if (method === "ai") {
      listingCache.set(`pain:${cacheKey}`, { at: Date.now(), rows: payload });
      cacheSet("pain", cacheKey, payload);
    }
    return payload;
  })();

  inflight.set(cacheKey, run);
  try {
    return await run;
  } finally {
    inflight.delete(cacheKey);
  }
}

function pack(t) {
  return {
    id: t.id,
    label: t.label,
    build: t.build,
    n: t.n,
    apps: [...t.apps].slice(0, 4),
    quote: t.quotes[0] || null,
  };
}

function isHygiene(body) {
  return HYGIENE.some((h) => h.re.test(body));
}

function extractWish(body) {
  const m = String(body).match(
    /(?:please add|would be nice(?: to| if)?|i wish|we need|need(?:s)? a way to|no (?:option|way) to|add support for|support for)\s+([^.]{6,70})/i
  );
  if (!m) return null;
  if (/[?]/.test(m[0])) return null;
  if (/\b(this extension|infiltrat|spyware|malware|uninstall)\b/i.test(m[0])) return null;
  const bit = clip(m[0], 72);
  if (isHygiene(bit)) return null;
  return bit;
}

function wishKey(s) {
  const stop = new Set(["the", "and", "for", "with", "that", "this", "from", "have", "has", "are", "was", "please", "add", "need", "needs", "want", "support"]);
  return String(s)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !stop.has(w))
    .slice(0, 4)
    .join(" ");
}

function scoreNotes(reviews) {
  const hygiene = HYGIENE.map((h) => ({ id: h.id, label: h.label, n: 0 }));
  const hygieneMap = new Map(hygiene.map((h) => [h.id, h]));
  const features = new Map(
    FEATURES.map((f) => [f.id, { ...f, n: 0, quotes: [], apps: new Set() }])
  );
  const wishes = new Map();

  for (const rev of reviews) {
    if (rev.stars <= 3) {
      for (const h of HYGIENE) {
        if (!h.re.test(rev.body)) continue;
        hygieneMap.get(h.id).n += 1;
      }
    }
    let hit = false;
    for (const f of FEATURES) {
      if (!f.re.test(rev.body)) continue;
      hit = true;
      const b = features.get(f.id);
      b.n += 1;
      b.apps.add(rev.app);
      if (b.quotes.length < 3) b.quotes.push({ text: clip(rev.body), app: rev.app });
    }
    if (hit) continue;
    const wish = extractWish(rev.body);
    if (!wish) continue;
    const key = wishKey(wish) || wish.toLowerCase();
    if (!key) continue;
    const cur = wishes.get(key) || {
      id: `wish:${key}`,
      label: wish.replace(/^[a-z]/, (c) => c.toUpperCase()),
      build: "People asked for this. Build it.",
      n: 0,
      quotes: [],
      apps: new Set(),
    };
    cur.n += 1;
    cur.apps.add(rev.app);
    if (cur.quotes.length < 3) cur.quotes.push({ text: clip(rev.body), app: rev.app });
    wishes.set(key, cur);
  }

  const featureCards = [...features.values()]
    .filter((t) => t.n > 0)
    .sort((a, b) => b.n - a.n)
    .slice(0, 9)
    .map(pack);
  const wishCards = [...wishes.values()]
    .filter((t) => t.n > 0)
    .sort((a, b) => b.n - a.n)
    .slice(0, Math.max(0, 12 - featureCards.length))
    .map(pack);

  return {
    hygiene: hygiene.filter((h) => h.n > 0).sort((a, b) => b.n - a.n),
    themes: featureCards.concat(wishCards).slice(0, 12),
  };
}

