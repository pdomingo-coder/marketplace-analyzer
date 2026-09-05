const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
const MAX_NOTES = 24;
const PER_APP = 3;
const MAX_BODY = 220;

const SYSTEM = `You group store reviews into product ideas.

Rules:
- Use only the notes. Do not invent features, apps, or quotes.
- Split quality gripes from feature asks.
- Quality gripes: broken, slow, hard setup, no support, forced install. These are not products.
- Feature asks: a missing capability people want. Short label (3-7 words). One plain sentence of what to build.
- A note may support one feature ask. Count the notes.
- Quotes must be copied from a note, shortened if long. Keep the app name from that note.
- Ignore insults, ads, and “uninstall” with no product ask.
- Plain English. No jargon. No exclamation marks.
- Return JSON only.`;

function clip(text, max = 160) {
  const s = String(text || "").replace(/\s+/g, " ").trim();
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + "…";
}

function norm(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function parseJson(text) {
  const raw = String(text || "").trim();
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fence ? fence[1] : raw;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(body.slice(start, end + 1));
  } catch {
    return null;
  }
}

function pickNotes(notes) {
  const byApp = new Map();
  const ranked = [...notes]
    .filter((n) => n.body)
    .sort((a, b) => a.stars - b.stars || b.body.length - a.body.length);
  for (const n of ranked) {
    const arr = byApp.get(n.app) || [];
    if (arr.length >= PER_APP) continue;
    arr.push(n);
    byApp.set(n.app, arr);
  }
  return [...byApp.values()].flat().slice(0, MAX_NOTES);
}

function noteMatchesQuote(notes, quote) {
  const q = norm(quote);
  if (q.length < 12) return null;
  const needle = q.slice(0, Math.min(48, q.length));
  return notes.find((n) => norm(n.body).includes(needle)) || null;
}

function packThemes(raw, notes) {
  const knownApps = new Set(notes.map((n) => n.app));
  const out = [];
  const seen = new Set();
  for (const row of Array.isArray(raw) ? raw : []) {
    const label = clip(row?.label, 48);
    const build = clip(row?.build, 120);
    if (!label || !build) continue;
    const key = norm(label);
    if (seen.has(key)) continue;
    seen.add(key);
    const quoteText = clip(row?.quote?.text || row?.quote, 160);
    const hit = quoteText ? noteMatchesQuote(notes, quoteText) : null;
    const apps = [...new Set((Array.isArray(row?.apps) ? row.apps : [])
      .map((a) => String(a || "").trim())
      .filter((a) => knownApps.has(a)))]
      .slice(0, 4);
    if (hit && !apps.includes(hit.app) && apps.length < 4) apps.unshift(hit.app);
    const n = Math.max(1, Math.min(notes.length, Number(row?.n) || 1));
    out.push({
      id: `ai:${key}`,
      label,
      build,
      n,
      apps,
      quote: hit
        ? { text: clip(hit.body), app: hit.app }
        : quoteText && apps[0]
          ? { text: quoteText, app: apps[0] }
          : null,
    });
    if (out.length >= 12) break;
  }
  return out;
}

function packHygiene(raw, notes) {
  const out = [];
  const seen = new Set();
  for (const row of Array.isArray(raw) ? raw : []) {
    const label = clip(row?.label, 40).toLowerCase();
    if (!label) continue;
    if (seen.has(label)) continue;
    seen.add(label);
    const n = Math.max(1, Math.min(notes.length, Number(row?.n) || 1));
    out.push({ id: `hyg:${label}`, label, n });
    if (out.length >= 6) break;
  }
  return out;
}

export async function groupNotesWithAi(notes) {
  const key = process.env.OPENROUTER_API_KEY || "";
  if (!key || !notes.length) return null;
  const sample = pickNotes(notes);
  const model = process.env.OPENROUTER_MODEL || "google/gemini-2.5-flash";
  const list = sample
    .map(
      (n, i) =>
        `${i + 1}. ${n.stars} stars · ${n.app}: ${clip(n.body, MAX_BODY)}`
    )
    .join("\n");

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "http://127.0.0.1:4747",
      "X-Title": "Marketplace Analyzer",
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      provider: { sort: "latency" },
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM },
        {
          role: "user",
          content: `Group these ${sample.length} store notes.\n\nReturn:\n{"hygiene":[{"label":"it breaks","n":3}],"themes":[{"label":"Stay signed in","build":"One sign-in. Stay signed in.","n":5,"quote":{"text":"…","app":"App name"},"apps":["App name"]}]}\n\nNotes:\n${list}`,
        },
      ],
    }),
    signal: AbortSignal.timeout(18000),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OpenRouter ${res.status}: ${body.slice(0, 240)}`);
  }
  const json = await res.json();
  if (json.error) throw new Error(json.error.message || "OpenRouter error");
  const parsed = parseJson(json.choices?.[0]?.message?.content);
  if (!parsed) throw new Error("AI did not return JSON");
  const themes = packThemes(parsed.themes, sample);
  const hygiene = packHygiene(parsed.hygiene, sample);
  if (!themes.length && !hygiene.length) return null;
  return { themes, hygiene, read: sample.length };
}
