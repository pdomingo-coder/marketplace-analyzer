const { escapeHtml, niceName } = await import("./shared.js");
const { bindNav } = await import("./nav.js");

bindNav();

const THEMES = {
  all: "All",
  ai: "AI coding agents",
  admin: "Admin and security",
  planning: "Plans and Gantt",
  share: "Share with clients",
  time: "Time tracking",
  viz: "Charts and JQL",
  connect: "Connectors",
  other: "Other",
};

const $ = (id) => document.getElementById(id);
let rows = [];
let total = 300;
let theme = "all";

function pct(n) {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${(n * 100).toFixed(1)}%`;
}

function fmt(n) {
  return Number(n || 0).toLocaleString();
}

function visible() {
  if (theme === "all") return rows;
  return rows.filter((r) => r.theme === theme);
}

function render() {
  const list = $("list");
  const set = visible();
  list.innerHTML = "";
  const head = document.createElement("li");
  head.className = "row row-head next-row";
  head.innerHTML = `<span>#</span><span>Name</span><span class="num">Week %</span><span class="num hide-sm">Installs</span><span class="hide-sm">Theme</span>`;
  list.append(head);
  if (!set.length) {
    const empty = document.createElement("li");
    empty.className = "empty";
    empty.textContent = "No apps in this theme.";
    list.append(empty);
    $("status").textContent = `0 of ${total}`;
    return;
  }
  for (const row of set) {
    const li = document.createElement("li");
    li.className = "row next-row";
    const href = row.url || "#";
    li.innerHTML = `
      <span class="rank">${row.rank}</span>
      <span>
        <a class="name" href="${href}" target="_blank" rel="noopener">${escapeHtml(row.name)}</a>
        <span class="sub">${escapeHtml([row.author, niceName(row.category)].filter(Boolean).join(" · "))}</span>
      </span>
      <span class="num growth-up">${pct(row.wowPct)} · +${fmt(row.wow)}</span>
      <span class="num hide-sm">${fmt(row.weekAgo)} → ${fmt(row.users)}</span>
      <span class="hide-sm"><span class="cat-pill">${escapeHtml(THEMES[row.theme] || row.theme)}</span></span>
    `;
    list.append(li);
  }
  $("status").textContent = `${set.length} of ${total} · 50+ installs on 2 Sep · sorted by week %`;
}

function bind() {
  $("themes").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-theme]");
    if (!btn) return;
    theme = btn.dataset.theme;
    for (const el of $("themes").querySelectorAll("[data-theme]")) {
      el.setAttribute("aria-pressed", el === btn ? "true" : "false");
    }
    render();
  });
}

try {
  const data = await fetch("data/jira-next.json").then((r) => {
    if (!r.ok) throw new Error("Missing jira-next.json");
    return r.json();
  });
  rows = data.rows || [];
  total = data.count || rows.length || 300;
  const allBtn = document.querySelector("[data-theme=\"all\"]");
  if (allBtn) allBtn.textContent = `All ${total}`;
  $("status").textContent = "Loaded.";
  bind();
  render();
} catch (err) {
  $("status").textContent = err.message || "Could not load the list.";
}
