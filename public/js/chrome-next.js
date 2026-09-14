const { escapeHtml, niceName } = await import("./shared.js");
const { bindNav } = await import("./nav.js");

bindNav();

const LANES = {
  all: "All",
  school: "School Chromebook",
  gmbe: "GMBE-related",
  seo: "SEO",
  smb: "Small business",
  other: "Other",
};

const $ = (id) => document.getElementById(id);
let rows = [];
let total = 500;
let lane = "all";

function pct(n) {
  if (n == null || !Number.isFinite(n)) return "—";
  if (n >= 10) return `${Math.round(n * 100)}%`;
  return `${(n * 100).toFixed(1)}%`;
}

function fmt(n) {
  return Number(n || 0).toLocaleString();
}

function laneLabel(key) {
  if (key === "gmbe") return "GMBE-related";
  return LANES[key] || niceName(key);
}

function visible() {
  if (lane === "all") return rows;
  if (lane === "seo") return rows.filter((r) => r.lane === "seo" || r.lane === "gmbe");
  return rows.filter((r) => r.lane === lane);
}

function render() {
  const list = $("list");
  const set = visible();
  list.innerHTML = "";
  const head = document.createElement("li");
  head.className = "row row-head next-row";
  head.innerHTML = `<span>#</span><span>Name</span><span class="num">Month %</span><span class="num hide-sm">Users</span><span class="hide-sm">Lane</span>`;
  list.append(head);
  if (!set.length) {
    const empty = document.createElement("li");
    empty.className = "empty";
    empty.textContent = `None of the ${total} sit in this lane.`;
    list.append(empty);
    $("status").textContent = `0 of ${total}`;
    return;
  }
  for (const row of set) {
    const li = document.createElement("li");
    li.className = "row next-row";
    li.innerHTML = `
      <span class="rank">${row.rank}</span>
      <span>
        <a class="name" href="${row.url}" target="_blank" rel="noopener">${escapeHtml(row.name)}</a>
        <span class="sub">${escapeHtml([row.author, niceName(row.category)].filter(Boolean).join(" · "))}</span>
      </span>
      <span class="num growth-up">${pct(row.monthPct)}</span>
      <span class="num hide-sm">${fmt(row.monthAgo)} → ${fmt(row.users)}</span>
      <span class="hide-sm"><span class="cat-pill">${escapeHtml(laneLabel(row.lane))}</span></span>
    `;
    list.append(li);
  }
  $("status").textContent = `${set.length} of ${total} · sorted by monthly growth`;
}

function bind() {
  $("lanes").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-lane]");
    if (!btn) return;
    lane = btn.dataset.lane;
    for (const el of $("lanes").querySelectorAll("[data-lane]")) {
      el.setAttribute("aria-pressed", el === btn ? "true" : "false");
    }
    render();
  });
}

try {
  const data = await fetch("data/chrome-next.json").then((r) => {
    if (!r.ok) throw new Error("Missing chrome-next.json");
    return r.json();
  });
  rows = data.rows || [];
  total = data.count || rows.length;
  const allBtn = document.querySelector("[data-lane=\"all\"]");
  if (allBtn) allBtn.textContent = `All ${total}`;
  $("status").textContent = "Loaded.";
  bind();
  render();
} catch (err) {
  $("status").textContent = err.message || "Could not load the list.";
}
