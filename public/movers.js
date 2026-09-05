const LIMIT = 50;
const AGE = {
  new: { key: "new", label: "Under 90 days", max: 90 },
  year: { key: "year", label: "90 days to 1 year", min: 90, max: 365 },
  mid: { key: "mid", label: "1 to 3 years", min: 365, max: 1095 },
  old: { key: "old", label: "Over 3 years", min: 1095 },
};
const HIST = [
  { key: "down", label: "Lost users", test: (p, d) => d < 0 },
  { key: "flat", label: "No change", test: (p, d) => d === 0 },
  { key: "none", label: "No last week", test: (p, d) => p == null && d > 0 },
  { key: "p5", label: "0–5%", test: (p, d) => p != null && d > 0 && p < 0.05 },
  { key: "p10", label: "5–10%", test: (p) => p != null && p >= 0.05 && p < 0.1 },
  { key: "p25", label: "10–25%", test: (p) => p != null && p >= 0.1 && p < 0.25 },
  { key: "p50", label: "25–50%", test: (p) => p != null && p >= 0.25 && p < 0.5 },
  { key: "p100", label: "50–100%", test: (p) => p != null && p >= 0.5 && p < 1 },
  { key: "hot", label: "100%+", test: (p) => p != null && p >= 1 },
];

const state = {
  q: "",
  sort: "wowPct",
  minPct: 0,
  minUsers: 10000,
  minStars: 0,
  growers: true,
  newish: false,
  prior: false,
  category: "",
  age: "",
  hist: "",
  offset: 0,
};

let all = [];
let meta = { asOf: "", matched: 0, count: 0 };

const $ = (id) => document.getElementById(id);

function escapeHtml(s) {
  return String(s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function niceName(s) {
  return String(s || "")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function categoryParts(cat) {
  return String(cat || "")
    .split("/")
    .map((part) => niceName(part.trim()))
    .filter(Boolean);
}

function categoryHtml(cat) {
  return categoryParts(cat)
    .map((part) => `<span class="cat-pill">${escapeHtml(part)}</span>`)
    .join("");
}

function fmt(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "—";
  return x.toLocaleString();
}

function storeUrl(id) {
  return `https://chromewebstore.google.com/detail/${id}`;
}

function rate(users, delta) {
  const ago = users - delta;
  return ago > 0 ? delta / ago : null;
}

function lastWeek(row) {
  return row.users - row.wow;
}

function pctLabel(row) {
  if (row.wowPct == null) {
    return {
      text: row.wow ? `${row.wow > 0 ? "+" : ""}${fmt(row.wow)} · no last week` : "—",
      cls: row.wow > 0 ? "growth-up" : "growth-flat",
    };
  }
  if (row.wow === 0) return { text: "No change", cls: "growth-flat" };
  const sign = row.wow > 0 ? "+" : "";
  const ago = lastWeek(row);
  if (Math.abs(row.wowPct) >= 1) {
    return {
      text: `${fmt(ago)} → ${fmt(row.users)} · ${sign}${fmt(row.wow)}`,
      cls: row.wow > 0 ? "growth-up" : "growth-down",
    };
  }
  return {
    text: `${sign}${(row.wowPct * 100).toFixed(1)}% · ${sign}${fmt(row.wow)}`,
    cls: row.wow > 0 ? "growth-up" : "growth-down",
  };
}

function ageKey(days) {
  if (days == null) return "";
  if (days < 90) return "new";
  if (days < 365) return "year";
  if (days < 1095) return "mid";
  return "old";
}

function median(nums) {
  if (!nums.length) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function matches(row, skip = {}) {
  if (state.growers && row.wow <= 0) return false;
  if (state.newish && !(row.ageDays != null && row.ageDays < 365)) return false;
  if (state.prior && lastWeek(row) < 10000) return false;
  if (state.minUsers && row.users < state.minUsers) return false;
  if (state.minStars && !(row.stars >= state.minStars)) return false;
  if (state.minPct && !(row.wowPct != null && row.wowPct * 100 >= state.minPct)) return false;
  if (!skip.category && state.category && row.category !== state.category) return false;
  if (!skip.age && state.age && ageKey(row.ageDays) !== state.age) return false;
  if (!skip.hist && state.hist) {
    const bucket = HIST.find((h) => h.key === state.hist);
    if (bucket && !bucket.test(row.wowPct, row.wow)) return false;
  }
  if (state.q) {
    const q = state.q.toLowerCase();
    const hay = `${row.name} ${row.author}`.toLowerCase();
    if (!hay.includes(q)) return false;
  }
  return true;
}

function sortRows(rows) {
  const list = [...rows];
  if (state.sort === "wowPct") {
    list.sort((a, b) => {
      const ap = a.wowPct == null ? -Infinity : a.wowPct;
      const bp = b.wowPct == null ? -Infinity : b.wowPct;
      return bp - ap || b.wow - a.wow;
    });
  } else if (state.sort === "wow") {
    list.sort((a, b) => b.wow - a.wow);
  } else if (state.sort === "users") {
    list.sort((a, b) => b.users - a.users);
  } else if (state.sort === "monthPct") {
    list.sort((a, b) => (rate(b.users, b.month) || -Infinity) - (rate(a.users, a.month) || -Infinity));
  } else if (state.sort === "created") {
    list.sort((a, b) => String(b.created || "").localeCompare(String(a.created || "")));
  }
  return list;
}

function filtered() {
  return sortRows(all.filter(matches));
}

function spark(row) {
  const pts = [row.wow, row.month, row.q3].map((n) => Number(n) || 0);
  const max = Math.max(...pts.map((n) => Math.abs(n)), 1);
  const w = 72;
  const h = 22;
  const barW = 16;
  const gap = 8;
  const bars = pts
    .map((n, i) => {
      const bh = Math.max(2, (Math.abs(n) / max) * (h - 4));
      const x = 4 + i * (barW + gap);
      const y = n >= 0 ? h - 2 - bh : 2;
      const color = n > 0 ? "#2f6b3a" : n < 0 ? "#a13a2a" : "#b7aaa3";
      return `<rect x="${x}" y="${y}" width="${barW}" height="${bh}" fill="${color}" />`;
    })
    .join("");
  return `<svg class="growth-spark" viewBox="0 0 ${w} ${h}" aria-hidden="true">${bars}</svg>`;
}

function setKpis(rows) {
  const growers = rows.filter((r) => r.wow > 0);
  const newFast = growers.filter((r) => r.ageDays != null && r.ageDays < 365 && (r.fromZero || r.wowPct >= 0.2));
  const bits = [
    [fmt(rows.length), "In this view"],
    [fmt(growers.length), "Grew this week"],
    [growers.length ? `${(median(growers.map((r) => r.wowPct)) * 100).toFixed(1)}%` : "—", "Median week %"],
    [fmt(newFast.length), "New and fast"],
  ];
  $("kpis").innerHTML = bits
    .map(
      ([n, label]) =>
        `<div class="kpi"><span class="kpi-value">${escapeHtml(n)}</span><span class="kpi-label">${escapeHtml(label)}</span></div>`
    )
    .join("");
}

function barChart(el, items, onClick) {
  const max = Math.max(...items.map((i) => i.n), 1);
  el.innerHTML = "";
  for (const item of items) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "bar";
    btn.setAttribute("aria-pressed", item.active ? "true" : "false");
    btn.innerHTML = `
      <span class="bar-name">${escapeHtml(item.label)}</span>
      <span class="bar-track"><span class="bar-fill" style="width:${Math.max(4, (item.n / max) * 100)}%"></span></span>
      <span class="bar-stat">${escapeHtml(item.right)}</span>
    `;
    btn.addEventListener("click", () => onClick(item.key));
    el.append(btn);
  }
}

function renderCharts(rows) {
  const histItems = HIST.map((h) => {
    const n = rows.filter((r) => h.test(r.wowPct, r.wow)).length;
    return { key: h.key, label: h.label, n, right: fmt(n), active: state.hist === h.key };
  }).filter((i) => i.n);
  barChart($("hist"), histItems, (key) => {
    state.hist = state.hist === key ? "" : key;
    state.offset = 0;
    render();
  });

  const byCat = new Map();
  for (const row of rows) {
    if (!row.category || row.wow <= 0) continue;
    const cur = byCat.get(row.category) || [];
    cur.push(row.wowPct);
    byCat.set(row.category, cur);
  }
  const catItems = [...byCat.entries()]
    .filter(([, pcts]) => pcts.length >= 8)
    .map(([key, pcts]) => ({
      key,
      label: categoryParts(key).join(" · ") || key,
      n: median(pcts),
      right: `${(median(pcts) * 100).toFixed(1)}% · ${fmt(pcts.length)}`,
      active: state.category === key,
    }))
    .sort((a, b) => b.n - a.n)
    .slice(0, 8);
  barChart($("cats"), catItems, (key) => {
    state.category = state.category === key ? "" : key;
    state.offset = 0;
    render();
  });

  const ageItems = Object.values(AGE).map((a) => {
    const set = rows.filter((r) => ageKey(r.ageDays) === a.key);
    const growers = set.filter((r) => r.wow > 0);
    return {
      key: a.key,
      label: a.label,
      n: growers.length ? median(growers.map((r) => r.wowPct)) : 0,
      right: growers.length ? `${(median(growers.map((r) => r.wowPct)) * 100).toFixed(1)}% · ${fmt(set.length)}` : `0 · ${fmt(set.length)}`,
      active: state.age === a.key,
    };
  });
  barChart($("ages"), ageItems, (key) => {
    state.age = state.age === key ? "" : key;
    state.offset = 0;
    render();
  });
}

function renderChips() {
  const chips = [];
  if (state.category) chips.push(["Type", categoryParts(state.category).join(" · ")]);
  if (state.age) chips.push(["Age", AGE[state.age]?.label || state.age]);
  if (state.hist) chips.push(["Week change", HIST.find((h) => h.key === state.hist)?.label || ""]);
  const box = $("chips");
  if (!chips.length) {
    box.hidden = true;
    box.innerHTML = "";
    return;
  }
  box.hidden = false;
  box.innerHTML = chips
    .map(([k, v]) => `<span class="chip">${escapeHtml(k)}: ${escapeHtml(v)}</span>`)
    .join("");
}

function renderRows(rows) {
  const list = $("list");
  list.innerHTML = "";
  const page = rows.slice(state.offset, state.offset + LIMIT);
  if (!page.length) {
    list.innerHTML = `<li class="empty">Nothing matches. Hit Reset to see all.</li>`;
    $("status").textContent = "0 results";
    $("prev").disabled = true;
    $("next").disabled = true;
    return;
  }
  const head = document.createElement("li");
  head.className = "row row-head movers-row";
  head.innerHTML = `
    <span>#</span>
    <span>Name</span>
    <span class="num">Users</span>
    <span class="num">Week</span>
    <span class="num hide-sm">Month</span>
    <span class="hide-sm">Trend</span>
  `;
  list.append(head);
  page.forEach((row, i) => {
    const li = document.createElement("li");
    li.className = "row movers-row";
    const g = pctLabel(row);
    const monthPct = rate(row.users, row.month);
    const month = monthPct == null ? "—" : `${row.month >= 0 ? "+" : ""}${(monthPct * 100).toFixed(1)}%`;
    const age =
      row.ageDays == null
        ? ""
        : row.ageDays < 365
          ? `${Math.max(1, Math.round(row.ageDays / 30))} mo old`
          : `${Math.round(row.ageDays / 365)} yr old`;
    li.innerHTML = `
      <span class="rank">${state.offset + i + 1}</span>
      <span>
        <a class="name" href="${storeUrl(row.id)}" target="_blank" rel="noopener">${escapeHtml(row.name)}</a>
        <span class="cat-row">${categoryHtml(row.category)}${row.matched ? "" : `<span class="cat-pill cat-pill--miss">Not in Aug dump</span>`}</span>
        <span class="sub">${escapeHtml([row.author, age, row.payment].filter(Boolean).join(" · "))}</span>
      </span>
      <span class="num">${fmt(row.users)}</span>
      <span class="num ${g.cls}">${escapeHtml(g.text)}</span>
      <span class="num hide-sm">${escapeHtml(month)}</span>
      <span class="hide-sm">${spark(row)}</span>
    `;
    list.append(li);
  });
  const from = state.offset + 1;
  const to = state.offset + page.length;
  $("status").textContent = `${from.toLocaleString()}–${to.toLocaleString()} of ${rows.length.toLocaleString()} · ${meta.matched.toLocaleString()} of ${meta.count.toLocaleString()} matched the Aug 25 dump`;
  $("prev").disabled = state.offset <= 0;
  $("next").disabled = state.offset + page.length >= rows.length;
}

function dirty() {
  return (
    state.q ||
    state.sort !== "wowPct" ||
    state.minPct ||
    state.minUsers !== 10000 ||
    state.minStars ||
    !state.growers ||
    state.newish ||
    state.prior ||
    state.category ||
    state.age ||
    state.hist
  );
}

function render() {
  const rows = filtered();
  setKpis(rows);
  renderCharts(all.filter((r) => matches(r, { hist: true, category: true, age: true })));
  renderChips();
  renderRows(rows);
  $("reset").disabled = !dirty();
}

function reset() {
  Object.assign(state, {
    q: "",
    sort: "wowPct",
    minPct: 0,
    minUsers: 10000,
    minStars: 0,
    growers: true,
    newish: false,
    prior: false,
    category: "",
    age: "",
    hist: "",
    offset: 0,
  });
  $("q").value = "";
  $("min-pct").value = "0";
  $("min-users").value = "10000";
  $("min-stars").value = "0";
  $("growers").setAttribute("aria-pressed", "true");
  $("newish").setAttribute("aria-pressed", "false");
  $("prior").setAttribute("aria-pressed", "false");
  for (const btn of document.querySelectorAll(".sorts [data-sort]")) {
    btn.setAttribute("aria-pressed", btn.dataset.sort === "wowPct" ? "true" : "false");
  }
  render();
}

function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

$("q").addEventListener(
  "input",
  debounce(() => {
    state.q = $("q").value.trim();
    state.offset = 0;
    render();
  }, 200)
);
$("min-pct").addEventListener("change", () => {
  state.minPct = Math.max(0, Number($("min-pct").value) || 0);
  state.offset = 0;
  render();
});
$("min-users").addEventListener("change", () => {
  state.minUsers = Math.max(0, Number($("min-users").value) || 0);
  state.offset = 0;
  render();
});
$("min-stars").addEventListener("change", () => {
  state.minStars = Math.max(0, Number($("min-stars").value) || 0);
  state.offset = 0;
  render();
});
$("growers").addEventListener("click", () => {
  state.growers = !state.growers;
  $("growers").setAttribute("aria-pressed", state.growers ? "true" : "false");
  state.offset = 0;
  render();
});
$("newish").addEventListener("click", () => {
  state.newish = !state.newish;
  $("newish").setAttribute("aria-pressed", state.newish ? "true" : "false");
  state.offset = 0;
  render();
});
$("prior").addEventListener("click", () => {
  state.prior = !state.prior;
  $("prior").setAttribute("aria-pressed", state.prior ? "true" : "false");
  state.offset = 0;
  render();
});
$("reset").addEventListener("click", reset);
$("prev").addEventListener("click", () => {
  state.offset = Math.max(0, state.offset - LIMIT);
  render();
});
$("next").addEventListener("click", () => {
  state.offset += LIMIT;
  render();
});
for (const btn of document.querySelectorAll(".sorts [data-sort]")) {
  btn.addEventListener("click", () => {
    state.sort = btn.dataset.sort;
    state.offset = 0;
    for (const b of document.querySelectorAll(".sorts [data-sort]")) {
      b.setAttribute("aria-pressed", b.dataset.sort === state.sort ? "true" : "false");
    }
    render();
  });
}

$("status").textContent = "Loading the 10k+ week file…";
const data = await fetch("data/movers.json").then((r) => {
  if (!r.ok) throw new Error("Missing movers.json. Run npm run ingest:movers");
  return r.json();
});
all = data.rows || [];
meta = { asOf: data.asOf || "", matched: data.matched || 0, count: data.count || all.length };
render();
