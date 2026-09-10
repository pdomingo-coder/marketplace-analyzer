const BUCKETS = [
  {
    id: "direct",
    title: "Direct copilots",
    blurb: "Closest to eesel / MyAskAI. AI drafts replies inside a helpdesk or inbox.",
  },
  {
    id: "inbox",
    title: "Shared inbox / helpdesk shell",
    blurb: "The desk itself, sometimes with AI bolted on. Bigger, but not the same product.",
  },
  {
    id: "adjacent",
    title: "Adjacent (do not confuse)",
    blurb: "Snippets and company search. Support teams use them. They are not helpdesk copilots.",
  },
];

const $ = (id) => document.getElementById(id);

function escapeHtml(s) {
  return String(s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function fmt(n) {
  if (n == null || !Number.isFinite(Number(n))) return "—";
  return Number(n).toLocaleString();
}

function pctText(pct, delta) {
  if (pct == null) return "—";
  if (delta === 0) return "No change";
  const sign = pct > 0 ? "+" : "";
  if (Math.abs(pct) >= 1 && delta != null) {
    return `${sign}${(pct * 100).toFixed(0)}%`;
  }
  return `${sign}${(pct * 100).toFixed(1)}%`;
}

function pctClass(pct, delta) {
  if (pct == null || delta === 0) return "growth-flat";
  return pct > 0 ? "growth-up" : "growth-down";
}

function median(nums) {
  const s = nums.filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  if (!s.length) return null;
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function spark(row) {
  if (!row.inMovers) return `<span class="sub">No week file</span>`;
  const now = Number(row.users) || 0;
  const pts = [
    Math.max(0, now - (Number(row.q3) || 0)),
    Math.max(0, now - (Number(row.month) || 0)),
    Math.max(0, now - (Number(row.wow) || 0)),
    now,
  ];
  const min = Math.min(...pts);
  const max = Math.max(...pts);
  const span = max - min || 1;
  const w = 108;
  const h = 36;
  const top = 4;
  const bottom = 24;
  const coords = pts.map((users, i) => {
    const x = 4 + (i / 3) * 100;
    const y = bottom - ((users - min) / span) * (bottom - top);
    return { x, y };
  });
  const d = coords.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const color = pts[3] > pts[0] ? "#2f6b3a" : pts[3] < pts[0] ? "#a13a2a" : "#a6653c";
  const dots = coords
    .map((p) => `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="2.2" fill="${color}" />`)
    .join("");
  return `<svg class="growth-spark growth-spark--line" viewBox="0 0 ${w} ${h}" aria-hidden="true"><path d="${d}" fill="none" stroke="${color}" stroke-width="1.75" stroke-linejoin="round" stroke-linecap="round"/>${dots}</svg>`;
}

function renderVerdict(rows) {
  const direct = rows.filter((r) => r.bucket === "direct");
  const inFile = direct.filter((r) => r.inMovers);
  const growingWeek = direct.filter((r) => r.inMovers && r.wow > 0);
  const hiver = rows.find((r) => r.id === "fcinnggknmdfkilogcndkgpojpfojeem");
  const eesel = rows.find((r) => r.id === "ejhkkbilnpifailgngpkgmiofhioacjd");
  const med = median(direct.map((r) => r.usersDump));
  $("verdict").innerHTML = `
    <h2>What to tell the boss</h2>
    <p>On the Chrome store, this category looks cold, not exploding.</p>
    <ul>
      <li><strong>${direct.length} direct copilots</strong> we could find. Median size is <strong>${fmt(med)} users</strong>. eesel’s live CS extension is <strong>${fmt(eesel?.usersDump)} users</strong>.</li>
      <li>Only <strong>${inFile.length}</strong> of those even make the 10k+ week-growth file. Week growers in that set: <strong>${growingWeek.length}</strong>.</li>
      <li>Hiver (Gmail CS platform, 50k users) is the closest big listing. Last month: <strong>${hiver?.monthPct == null ? "—" : `${(hiver.monthPct * 100).toFixed(0)}%`}</strong> (${fmt(hiver?.month)} users). This week: no change.</li>
      <li>What is adding users on a 1-month view is Glean, Text Blaze, and Magical. Those are search and snippets. Not a helpdesk copilot.</li>
      <li>Chrome is not the whole market. eesel and MyAskAI can grow as SaaS with a small extension. This page only answers: <em>is the store channel hot?</em> Right now, no.</li>
    </ul>
  `;
}

function renderKpis(rows) {
  const direct = rows.filter((r) => r.bucket === "direct");
  const withWeek = rows.filter((r) => r.inMovers);
  const weekUp = withWeek.filter((r) => r.wow > 0);
  const monthUp = withWeek.filter((r) => r.month > 0);
  const bits = [
    [fmt(direct.length), "Direct copilots"],
    [fmt(median(direct.map((r) => r.usersDump))), "Median users (direct)"],
    [fmt(weekUp.length), "Any in set grew this week"],
    [fmt(monthUp.length), "Any in set grew this month"],
  ];
  $("kpis").innerHTML = bits
    .map(
      ([n, label]) =>
        `<div class="kpi"><span class="kpi-value">${escapeHtml(n)}</span><span class="kpi-label">${escapeHtml(label)}</span></div>`
    )
    .join("");
}

function renderDirectBars(rows) {
  const direct = [...rows.filter((r) => r.bucket === "direct")].sort((a, b) => b.usersDump - a.usersDump);
  const max = Math.max(...direct.map((r) => r.usersDump), 1);
  const el = $("direct-bars");
  el.innerHTML = "";
  for (const row of direct) {
    const btn = document.createElement("a");
    btn.className = "bar";
    btn.href = row.url || `https://chromewebstore.google.com/detail/${row.id}`;
    btn.target = "_blank";
    btn.rel = "noopener";
    btn.innerHTML = `
      <span class="bar-name">${escapeHtml(row.name)}</span>
      <span class="bar-track"><span class="bar-fill" style="width:${Math.max(4, (row.usersDump / max) * 100)}%"></span></span>
      <span class="bar-stat">${fmt(row.usersDump)}</span>
    `;
    el.append(btn);
  }
}

function renderTables(rows) {
  const box = $("tables");
  box.innerHTML = BUCKETS.map((b) => {
    const set = rows.filter((r) => r.bucket === b.id).sort((a, c) => c.usersDump - a.usersDump);
    const head = `
      <li class="row row-head cs-row">
        <span>Name</span>
        <span class="num">Users</span>
        <span class="num hide-sm">Week</span>
        <span class="num hide-sm">Month</span>
        <span class="num hide-sm">Combined</span>
        <span class="hide-sm">Trend</span>
      </li>`;
    const body = set
      .map((row) => {
        const week = row.inMovers ? pctText(row.wowPct, row.wow) : "Under 10k";
        const month = row.inMovers ? pctText(row.monthPct, row.month) : "—";
        const combo = row.combined == null ? "—" : pctText(row.combined, row.combined);
        return `<li class="row cs-row">
          <span>
            <a class="name" href="${row.url}" target="_blank" rel="noopener">${escapeHtml(row.name)}</a>
            <span class="sub">${escapeHtml(row.why)}</span>
          </span>
          <span class="num">${fmt(row.usersDump)}</span>
          <span class="num ${row.inMovers ? pctClass(row.wowPct, row.wow) : "growth-flat"}">${escapeHtml(week)}</span>
          <span class="num hide-sm ${row.inMovers ? pctClass(row.monthPct, row.month) : "growth-flat"}">${escapeHtml(month)}</span>
          <span class="num hide-sm ${pctClass(row.combined, row.combined)}">${escapeHtml(combo)}</span>
          <span class="hide-sm">${spark(row)}</span>
        </li>`;
      })
      .join("");
    return `<section class="cs-block">
      <h2>${escapeHtml(b.title)}</h2>
      <p>${escapeHtml(b.blurb)}</p>
      <ol class="list">${head}${body}</ol>
    </section>`;
  }).join("");
}

$("status").textContent = "Loading the helpdesk set…";
const data = await fetch("data/cs-copilots.json").then((r) => {
  if (!r.ok) throw new Error("Missing cs-copilots.json. Run npm run export:cs");
  return r.json();
});
const rows = data.rows || [];
renderVerdict(rows);
renderKpis(rows);
renderDirectBars(rows);
renderTables(rows);
$("status").textContent = `${rows.length} listings · dump ${data.dump} · week file only covers 10k+ users`;
