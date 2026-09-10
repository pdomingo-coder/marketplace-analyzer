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
  return Math.round(Number(n)).toLocaleString();
}

function pctText(pct, delta) {
  if (pct == null) return "No weekly data";
  if (delta === 0) return "Flat";
  const sign = pct > 0 ? "+" : "";
  return `${sign}${(pct * 100).toFixed(0)}%`;
}

function pctClass(pct, delta) {
  if (pct == null || delta === 0) return "growth-flat";
  return pct > 0 ? "growth-up" : "growth-down";
}

function shortName(name) {
  return String(name || "")
    .replace(/:.*$/, "")
    .replace(/ for (Intercom|Zendesk|Gmail).*$/i, "")
    .trim();
}

function barList(el, rows, key = "usersDump") {
  const max = Math.max(...rows.map((r) => r[key] || 0), 1);
  el.innerHTML = "";
  for (const row of rows) {
    const a = document.createElement("a");
    a.className = "bar";
    a.href = row.url || `https://chromewebstore.google.com/detail/${row.id}`;
    a.target = "_blank";
    a.rel = "noopener";
    a.innerHTML = `
      <span class="bar-name">${escapeHtml(shortName(row.name))}</span>
      <span class="bar-track"><span class="bar-fill" style="width:${Math.max(6, ((row[key] || 0) / max) * 100)}%"></span></span>
      <span class="bar-stat">${fmt(row[key])}</span>
    `;
    el.append(a);
  }
}

function table(rows) {
  const head = `<li class="row row-head cs-row">
    <span>Listing</span>
    <span class="num">Users</span>
    <span class="num">This week</span>
    <span class="num hide-sm">This month</span>
  </li>`;
  const body = rows
    .map((row) => {
      const week = row.inMovers ? pctText(row.wowPct, row.wow) : "Under 10k";
      const month = row.inMovers ? pctText(row.monthPct, row.month) : "—";
      return `<li class="row cs-row">
        <span>
          <a class="name" href="${row.url}" target="_blank" rel="noopener">${escapeHtml(row.name)}</a>
          <span class="sub">${escapeHtml(row.why)}</span>
        </span>
        <span class="num">${fmt(row.usersDump)}</span>
        <span class="num ${row.inMovers ? pctClass(row.wowPct, row.wow) : "growth-flat"}">${escapeHtml(week)}</span>
        <span class="num hide-sm ${row.inMovers ? pctClass(row.monthPct, row.month) : "growth-flat"}">${escapeHtml(month)}</span>
      </li>`;
    })
    .join("");
  return head + body;
}

const data = await fetch("data/cs-copilots.json").then((r) => {
  if (!r.ok) throw new Error("Missing cs-copilots.json");
  return r.json();
});
const rows = data.rows || [];
const direct = rows.filter((r) => r.bucket === "direct").sort((a, b) => b.usersDump - a.usersDump);
const adjacent = rows.filter((r) => r.bucket === "adjacent").sort((a, b) => b.usersDump - a.usersDump);
const other = rows.filter((r) => r.bucket !== "direct").sort((a, b) => b.usersDump - a.usersDump);
const eesel = rows.find((r) => r.id === "ejhkkbilnpifailgngpkgmiofhioacjd");
const hiver = rows.find((r) => r.id === "fcinnggknmdfkilogcndkgpojpfojeem");
const weekGrowers = rows.filter((r) => r.inMovers && r.wow > 0);
const monthGrowers = adjacent.filter((r) => r.inMovers && r.month > 0);

$("stats").innerHTML = [
  [fmt(direct.length), "Direct copilots on the store"],
  [fmt(eesel?.usersDump), "Users on eesel’s current CS extension"],
  [fmt(weekGrowers.length), "In this whole set that grew this week"],
  [hiver?.monthPct == null ? "—" : `${Math.round(hiver.monthPct * 100)}%`, "Hiver this month (50,000 users)"],
]
  .map(
    ([n, label]) =>
      `<article class="brief-stat"><strong>${escapeHtml(n)}</strong><span>${escapeHtml(label)}</span></article>`
  )
  .join("");

$("points").innerHTML = `
  <li>The typical direct copilot is a few hundred to a few thousand Chrome users. That is not a breakout category.</li>
  <li>eesel’s live customer-service extension has ${fmt(eesel?.usersDump)} users. Forethought Assist has 6,000. Tidio’s copilot has 579.</li>
  <li>Only one direct listing is even on the 10,000-user weekly file: eesel’s old docs search. It did not grow this week or this month.</li>
  <li>Hiver is the closest large customer-service listing (50,000 users). It is flat this week and ${fmt(hiver?.month)} users this month (${Math.round((hiver?.monthPct || 0) * 100)}%).</li>
  <li>${monthGrowers.map((r) => shortName(r.name)).join(", ") || "Nothing adjacent"} added users this month. Those are company search and text shortcuts, not ticket copilots.</li>
  <li>If we build this, the bet is SaaS demand, not Chrome-store demand. The store channel looks quiet.</li>
`;

barList($("direct-bars"), direct);
barList($("adj-bars"), adjacent);
$("direct-list").innerHTML = table(direct);
$("other-list").innerHTML = table(other);
$("note").textContent =
  "Users are from the 25 Aug Chrome dump. Week and month change only exist for listings with 10,000+ users in the later Chrome-Stats file. Google rounds those counts, so “flat” often means they stayed in the same bucket.";
