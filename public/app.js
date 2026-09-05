const DEFAULTS = {
  sort: "demand",
  q: "",
  category: "",
  itemCategory: "extension",
  minDemand: 0,
  minRating: 0,
  minReviews: 20,
  offset: 0,
  job: "",
  jobIds: [],
  jobLabel: "",
};

const state = {
  source: "chrome",
  limit: 40,
  total: 0,
  ...DEFAULTS,
};

function reviewsDefault(source = state.source) {
  return source === "jira" ? 0 : 20;
}

const SORT_WORDS = {
  demand: "users",
  reviews: "reviews",
  rating: "stars",
  opportunity: "gap",
};

const $ = (id) => document.getElementById(id);
const demandWord = () => (state.source === "jira" ? "installs" : "users");
const demandLabel = () => (state.source === "jira" ? "Installs" : "Users");
let loadGen = 0;
let painAbort = null;

function fmt(n) {
  const x = Number(n || 0);
  if (x >= 1_000_000_000) return `${(x / 1_000_000_000).toFixed(x >= 10_000_000_000 ? 0 : 1)}B`;
  if (x >= 1_000_000) return `${(x / 1_000_000).toFixed(x >= 10_000_000 ? 0 : 1)}M`;
  if (x >= 1_000) return `${(x / 1_000).toFixed(x >= 10_000 ? 0 : 1)}k`;
  return String(x);
}

function rating(n) {
  return n == null || n === "" ? "—" : Number(n).toFixed(2);
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

function niceName(s) {
  return String(s || "")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function escapeHtml(s) {
  return String(s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

async function getJson(path, signal) {
  const res = await fetch(path, { signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function queryString() {
  const p = new URLSearchParams({
    source: state.source,
    sort: state.sort,
    limit: String(state.limit),
    offset: String(state.offset),
    minDemand: String(state.minDemand || 0),
    minRating: String(state.minRating || 0),
    minReviews: String(state.minReviews || 0),
  });
  if (state.q) p.set("q", state.q);
  if (state.category) p.set("category", state.category);
  if (state.jobIds?.length) p.set("ids", state.jobIds.join(","));
  if (state.source === "chrome" && state.itemCategory) {
    p.set("itemCategory", state.itemCategory);
  }
  return p.toString();
}

function isFiltered() {
  if (state.q) return true;
  if (state.category) return true;
  if (state.job) return true;
  if (state.minDemand) return true;
  if (state.minRating) return true;
  if (state.minReviews !== reviewsDefault()) return true;
  if (state.sort !== DEFAULTS.sort) return true;
  if (state.source === "chrome" && state.itemCategory !== DEFAULTS.itemCategory) return true;
  return false;
}

function syncLabels() {
  $("demand-label").textContent = state.source === "jira" ? "Min installs" : "Min users";
  $("sort-demand").textContent = demandLabel();
  $("chart-title").textContent = state.source === "jira" ? "Installs by type" : "Users by type";
  $("reset").disabled = !isFiltered();
}

function renderChips() {
  const box = $("chips");
  const chips = [];
  if (state.category) chips.push({ key: "category", label: niceName(state.category) });
  if (state.job) chips.push({ key: "job", label: state.jobLabel || state.job });
  if (state.q) chips.push({ key: "q", label: state.q });
  if (state.minDemand) chips.push({ key: "minDemand", label: `${fmt(state.minDemand)}+ ${demandWord()}` });
  if (state.minRating) chips.push({ key: "minRating", label: `${state.minRating}+ stars` });
  if (state.minReviews !== reviewsDefault()) {
    chips.push({ key: "minReviews", label: `${state.minReviews}+ reviews` });
  }
  if (state.source === "chrome" && state.itemCategory && state.itemCategory !== DEFAULTS.itemCategory) {
    chips.push({ key: "itemCategory", label: niceName(state.itemCategory) });
  }

  box.innerHTML = "";
  if (!chips.length) {
    box.hidden = true;
    syncLabels();
    return;
  }
  box.hidden = false;
  for (const chip of chips) {
    const el = document.createElement("span");
    el.className = "chip";
    el.innerHTML = `<span>${escapeHtml(chip.label)}</span>`;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.setAttribute("aria-label", `Clear ${chip.label}`);
    btn.textContent = "×";
    btn.addEventListener("click", () => clearChip(chip.key));
    el.append(btn);
    box.append(el);
  }
  syncLabels();
}

function clearChip(key) {
  if (key === "category") {
    state.category = "";
    state.job = "";
    state.jobIds = [];
    state.jobLabel = "";
  }
  if (key === "job") {
    state.job = "";
    state.jobIds = [];
    state.jobLabel = "";
  }
  if (key === "q") {
    state.q = "";
    $("q").value = "";
  }
  if (key === "minDemand") {
    state.minDemand = 0;
    $("min-demand").value = "0";
  }
  if (key === "minRating") {
    state.minRating = 0;
    $("min-rating").value = "0";
  }
  if (key === "minReviews") {
    state.minReviews = reviewsDefault();
    $("min-reviews").value = String(reviewsDefault());
  }
  if (key === "itemCategory") {
    state.itemCategory = DEFAULTS.itemCategory;
    $("item-category").value = DEFAULTS.itemCategory;
  }
  state.offset = 0;
  loadAll();
}

function resetFilters() {
  Object.assign(state, DEFAULTS);
  state.jobIds = [];
  state.minReviews = reviewsDefault();
  if (state.source === "jira") state.itemCategory = "";
  $("q").value = "";
  $("min-demand").value = "0";
  $("min-rating").value = "0";
  $("min-reviews").value = String(state.minReviews);
  $("item-category").value = state.source === "chrome" ? DEFAULTS.itemCategory : "";
  for (const btn of document.querySelectorAll(".sorts [data-sort]")) {
    btn.setAttribute("aria-pressed", btn.dataset.sort === state.sort ? "true" : "false");
  }
  loadAll();
}

function setSource(source) {
  state.source = source;
  state.offset = 0;
  state.category = "";
  state.job = "";
  state.jobIds = [];
  state.jobLabel = "";
  if (source === "jira") {
    state.itemCategory = "";
    state.minReviews = 0;
    $("type-field").hidden = true;
  } else {
    if (!state.itemCategory) state.itemCategory = DEFAULTS.itemCategory;
    state.minReviews = 20;
    $("type-field").hidden = false;
  }
  $("min-reviews").value = String(state.minReviews);
  $("src-chrome").setAttribute("aria-pressed", source === "chrome" ? "true" : "false");
  $("src-jira").setAttribute("aria-pressed", source === "jira" ? "true" : "false");
  loadAll();
}

function setSort(sort) {
  state.sort = sort;
  state.offset = 0;
  for (const btn of document.querySelectorAll(".sorts [data-sort]")) {
    btn.setAttribute("aria-pressed", btn.dataset.sort === sort ? "true" : "false");
  }
  renderChips();
  loadList();
}

function pickJob(group) {
  const same = state.job === group.id;
  if (same) {
    state.job = "";
    state.jobIds = [];
    state.jobLabel = "";
  } else {
    state.job = group.id;
    state.jobIds = group.ids || [];
    state.jobLabel = group.label;
  }
  state.offset = 0;
  loadAll();
}

function pickCategory(category, sort) {
  const same = state.category === category;
  state.category = same ? "" : category;
  state.job = "";
  state.jobIds = [];
  state.jobLabel = "";
  if (sort) state.sort = state.category ? sort : DEFAULTS.sort;
  state.offset = 0;
  for (const btn of document.querySelectorAll(".sorts [data-sort]")) {
    btn.setAttribute("aria-pressed", btn.dataset.sort === state.sort ? "true" : "false");
  }
  loadAll();
}

function renderRows(payload) {
  const list = $("list");
  list.innerHTML = "";
  if (!payload.ready && payload.message) {
    list.innerHTML = `<li class="empty">${payload.message}</li>`;
    $("status").textContent = payload.message;
    return;
  }
  if (!payload.rows?.length) {
    list.innerHTML = `<li class="empty">Nothing matches. Hit Reset to see all.</li>`;
    $("status").textContent = "0 results";
    return;
  }

  const head = document.createElement("li");
  head.className = "row row-head";
  head.innerHTML = `
    <span>#</span>
    <span>Name</span>
    <span class="num">${demandLabel()}</span>
    <span class="num hide-sm">Stars</span>
    <span class="num hide-sm">Reviews</span>
    <span class="num hide-sm">Gap</span>
  `;
  list.append(head);

  payload.rows.forEach((row, i) => {
    const li = document.createElement("li");
    li.className = "row";
    const rank = state.offset + i + 1;
    const href = row.url || "#";
    li.innerHTML = `
      <span class="rank">${rank}</span>
      <span>
        <a class="name" href="${href}" target="_blank" rel="noopener">${escapeHtml(row.name)}</a>
        <span class="cat-row">${categoryHtml(row.category)}</span>
        <span class="sub">${escapeHtml([row.author, row.payment_type].filter(Boolean).join(" · "))}</span>
      </span>
      <span class="num">${fmt(row.demand)}</span>
      <span class="num hide-sm">${rating(row.rating)}</span>
      <span class="num hide-sm">${fmt(row.review_count)}</span>
      <span class="num hide-sm">${rating(row.opportunity)}</span>
    `;
    list.append(li);
  });

  const from = (state.offset + 1).toLocaleString();
  const to = Math.min(state.offset + payload.rows.length, payload.total).toLocaleString();
  const sortWord = state.sort === "demand" ? demandWord() : SORT_WORDS[state.sort];
  $("status").textContent = `${from}–${to} of ${payload.total.toLocaleString()} · sorted by ${sortWord}`;
  $("prev").disabled = state.offset <= 0;
  $("next").disabled = state.offset + payload.rows.length >= payload.total;
  state.total = payload.total;
}

async function loadList() {
  const gen = loadGen;
  $("status").textContent = "Loading…";
  try {
    const data = await getJson(`/api/top?${queryString()}`);
    if (gen !== loadGen) return;
    renderRows(data);
  } catch (err) {
    if (gen !== loadGen) return;
    $("list").innerHTML = `<li class="error">Could not load the list. Is the server on?</li>`;
    $("status").textContent = String(err.message);
  }
}

let growthAbort = null;

function sparkline(series) {
  const pts = (series || []).map((s) => Number(s.users) || 0);
  if (pts.length < 2) return "";
  const min = Math.min(...pts);
  const max = Math.max(...pts);
  const span = max - min || 1;
  const w = 72;
  const h = 22;
  const d = pts
    .map((y, i) => {
      const x = (i / (pts.length - 1)) * (w - 2) + 1;
      const yy = h - 2 - ((y - min) / span) * (h - 4);
      return `${i ? "L" : "M"}${x.toFixed(1)},${yy.toFixed(1)}`;
    })
    .join(" ");
  return `<svg class="growth-spark" viewBox="0 0 ${w} ${h}" aria-hidden="true"><path d="${d}" fill="none" stroke="#a6653c" stroke-width="1.5"/></svg>`;
}

function growthLabel(row) {
  if (row.pct == null) return { text: "—", cls: "growth-flat" };
  if (row.delta === 0) return { text: "No change", cls: "growth-flat" };
  const pct = `${row.delta > 0 ? "+" : ""}${(row.pct * 100).toFixed(1)}%`;
  const abs = `${row.delta > 0 ? "+" : ""}${fmt(row.delta)}`;
  return {
    text: `${pct} · ${abs}`,
    cls: row.delta > 0 ? "growth-up" : "growth-down",
  };
}

function renderGrowth(data) {
  const box = $("growth");
  const list = $("growth-list");
  list.innerHTML = "";
  box.hidden = false;
  $("growth-toggle").textContent =
    data?.title ||
    (state.source === "jira"
      ? "Installs vs last snapshot · top 100"
      : "Users this week vs last week · top 100");
  if (!data?.rows?.length) {
    $("growth-meta").textContent = data?.message || "No growth data for this view.";
    return;
  }
  const bits = [];
  if (data.message) bits.push(data.message);
  else bits.push(`Top ${data.rows.length} by ${demandWord()} in this view.`);
  if (data.quota) bits.push("Monthly Chrome-Stats cap was hit. Some rows have no week change yet.");
  if (state.source === "chrome") {
    bits.push("Store rounds users, so a flat line often means they stayed in the same bucket.");
  }
  $("growth-meta").textContent = bits.join(" ");
  for (const row of data.rows) {
    const li = document.createElement("li");
    li.className = "growth-row";
    const g = growthLabel(row);
    const href = row.url || "#";
    const cats = categoryHtml(row.category);
    li.innerHTML = `
      <span class="rank">${row.rank}</span>
      <span>
        <a href="${href}" target="_blank" rel="noopener">${escapeHtml(row.name)}</a>
        ${cats ? `<span class="cat-row">${cats}</span>` : ""}
      </span>
      <span class="num">${fmt(row.users)}</span>
      <span class="${g.cls}">${escapeHtml(g.text)}</span>
      ${sparkline(row.series)}
    `;
    list.append(li);
  }
}

async function loadGrowth() {
  const box = $("growth");
  const gen = loadGen;
  if (growthAbort) growthAbort.abort();
  growthAbort = new AbortController();
  box.hidden = false;
  $("growth-toggle").textContent =
    state.source === "jira"
      ? "Installs vs last snapshot · top 100"
      : "Users this week vs last week · top 100";
  $("growth-meta").textContent =
    state.source === "jira" ? "Reading last snapshot…" : "Reading last week’s users…";
  $("growth-list").innerHTML = "";
  try {
    const data = await getJson(`/api/growth?${queryString()}`, growthAbort.signal);
    if (gen !== loadGen) return;
    renderGrowth(data);
  } catch (err) {
    if (err.name === "AbortError") return;
    if (gen !== loadGen) return;
    $("growth-meta").textContent = "Could not read growth. Try this type again.";
  }
}

async function loadMeta() {
  try {
    const data = await getJson("/api/meta");
    if (!data.ready) {
      $("meta-line").textContent = "No data yet";
      return;
    }
    const bits = (data.counts || []).map((row) => {
      const label = row.source === "jira" ? "Jira apps" : "Chrome listings";
      return `${Number(row.n).toLocaleString()} ${label}`;
    });
    $("meta-line").textContent = bits.join(" · ") || "Loaded on this computer";
  } catch {
    $("meta-line").textContent = "Server is off";
  }
}

function kpi(value, label) {
  return `<div class="kpi"><span class="kpi-value">${value}</span><span class="kpi-label">${escapeHtml(label)}</span></div>`;
}

function renderIdeaList(el, rows, mapRow) {
  el.innerHTML = "";
  if (!rows?.length) {
    el.innerHTML = `<li class="idea-empty">None here. The list below still has the apps.</li>`;
    return;
  }
  for (const row of rows) {
    const item = mapRow(row);
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "idea-row";
    btn.innerHTML = `<span><span class="idea-name">${escapeHtml(item.name)}</span><span class="idea-meta">${escapeHtml(item.meta)}</span></span><span class="idea-stat">${escapeHtml(item.stat)}<span class="idea-stat-unit">${escapeHtml(item.unit || demandWord())}</span></span>`;
    btn.addEventListener("click", item.onClick);
    li.append(btn);
    el.append(li);
  }
}

function renderInsights(data) {
  if (!data.ready) {
    $("kpis").innerHTML = `<div class="kpi"><span class="kpi-label">${escapeHtml(data.message || "No data yet")}</span></div>`;
    return;
  }
  const s = data.summary || {};
  $("kpis").innerHTML = [
    kpi(Number(s.listings || 0).toLocaleString(), state.source === "jira" ? "Jira apps" : "Chrome listings"),
    kpi(s.avg_rating == null ? "—" : rating(s.avg_rating), "Avg stars"),
    kpi(fmt(s.weak_rated), "Busy, low stars"),
    kpi(fmt(s.stale), "Old, still used"),
  ].join("");

  renderIdeaList($("better"), data.better, (row) => ({
    name: niceName(row.category),
    meta: `${fmt(row.n)} apps · ${rating(row.avg_rating)} stars`,
    stat: fmt(row.demand),
    onClick: () => pickCategory(row.category, "opportunity"),
  }));

  renderIdeaList($("stale"), data.stale, (row) => ({
    name: row.name,
    meta: `${niceName(row.category) || "No type"} · ${String(row.last_update || "").slice(0, 10)}`,
    stat: fmt(row.demand),
    onClick: () => {
      state.q = row.name;
      $("q").value = row.name;
      state.offset = 0;
      loadGen += 1;
      renderChips();
      loadInsights();
      loadList();
    },
  }));

  renderIdeaList($("thin"), data.thin, (row) => ({
    name: niceName(row.category),
    meta: `${fmt(row.n)} apps`,
    stat: fmt(row.demand),
    onClick: () => pickCategory(row.category, "opportunity"),
  }));
}

async function loadInsights() {
  const gen = loadGen;
  try {
    const data = await getJson(`/api/insights?${queryString()}`);
    if (gen !== loadGen) return;
    renderInsights(data);
  } catch {
    if (gen !== loadGen) return;
    $("kpis").innerHTML = `<div class="kpi"><span class="kpi-label">Could not load this view.</span></div>`;
  }
}

async function loadCats() {
  const gen = loadGen;
  const box = $("cats");
  box.innerHTML = "";
  try {
    const data = await getJson(`/api/categories?source=${state.source}`);
    if (gen !== loadGen) return;
    const cats = data.categories || [];
    const max = Math.max(1, ...cats.map((c) => Number(c.demand) || 0));
    for (const cat of cats) {
      const pct = Math.max(2, Math.round((Number(cat.demand) / max) * 100));
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "bar";
      btn.setAttribute("aria-pressed", cat.category === state.category ? "true" : "false");
      btn.innerHTML = `
        <span class="bar-name">${escapeHtml(niceName(cat.category))}</span>
        <span class="bar-track"><span class="bar-fill" style="width:${pct}%"></span></span>
        <span class="bar-stat">${fmt(cat.demand)} · ${Number(cat.n).toLocaleString()}</span>
      `;
      btn.addEventListener("click", () => pickCategory(cat.category));
      box.append(btn);
    }
  } catch {
    if (gen !== loadGen) return;
    box.textContent = "Could not load types.";
  }
}

async function loadPain() {
  const box = $("pain");
  const note = $("pain-note");
  if (painAbort) painAbort.abort();
  if (!state.category) {
    box.hidden = true;
    note.hidden = true;
    $("pain-list").innerHTML = "";
    return;
  }
  const cat = state.category;
  const gen = loadGen;
  painAbort = new AbortController();
  box.hidden = false;
  $("pain-title").textContent = `What to build in ${niceName(cat)}`;
  $("pain-meta").textContent = "Reading notes with AI…";
  note.hidden = true;
  $("pain-list").innerHTML = "";
  try {
    const p = new URLSearchParams({ source: state.source, category: cat });
    if (state.source === "chrome" && state.itemCategory) p.set("itemCategory", state.itemCategory);
    if (state.jobIds?.length) p.set("ids", state.jobIds.join(","));
    const data = await getJson(`/api/pain?${p}`, painAbort.signal);
    if (gen !== loadGen || cat !== state.category) return;
    const titleBit = state.jobLabel || niceName(cat);
    $("pain-title").textContent = `What to build in ${titleBit}`;
    renderPain(data);
  } catch (err) {
    if (err.name === "AbortError") return;
    if (gen !== loadGen || cat !== state.category) return;
    $("pain-meta").textContent = "Could not read notes. Try the type again.";
  }
}

function hygieneLine(rows) {
  if (!rows?.length) return "";
  const bits = rows.slice(0, 4).map((h) => `${h.n} say ${h.label}`);
  return `Also: ${bits.join(". ")}.`;
}

function renderPain(data) {
  const list = $("pain-list");
  const note = $("pain-note");
  list.innerHTML = "";
  const extra = hygieneLine(data.hygiene);
  if (extra) {
    note.hidden = false;
    note.textContent = extra;
  } else {
    note.hidden = true;
  }
  if (!data.themes?.length) {
    $("pain-meta").textContent = data.message || "No clear feature asks in these notes. See the note for quality gripes.";
    return;
  }
  const how = data.method === "ai" ? "AI grouped" : "Word match grouped";
  const n = data.read || data.notes;
  $("pain-meta").textContent = `${how} ${n} notes on ${data.scanned} busy apps.`;
  for (const theme of data.themes) {
    const li = document.createElement("li");
    li.className = "pain-item";
    const quote = theme.quote
      ? `“${escapeHtml(theme.quote.text)}”`
      : "";
    const from = theme.quote?.app ? ` — ${escapeHtml(theme.quote.app)}` : "";
    const apps = theme.apps?.length ? theme.apps.join(", ") : "";
    li.innerHTML = `
      <h3>${escapeHtml(theme.label)}<span class="pain-count">${theme.n}</span></h3>
      <p class="pain-build">${escapeHtml(theme.build)}</p>
      ${quote ? `<p class="pain-quote">${quote}<span>${from}</span></p>` : ""}
      ${apps ? `<span class="pain-apps">${escapeHtml(apps)}</span>` : ""}
    `;
    list.append(li);
  }
}

async function loadJobs() {
  const box = $("jobs");
  const grid = $("job-grid");
  if (!state.category) {
    box.hidden = true;
    grid.innerHTML = "";
    return;
  }
  box.hidden = false;
  $("jobs-title").textContent = `What kind of ${niceName(state.category)}`;
  grid.innerHTML = `<p class="idea-empty">Grouping by job…</p>`;
  const gen = loadGen;
  const cat = state.category;
  try {
    const p = new URLSearchParams({ source: state.source, category: cat });
    if (state.source === "chrome" && state.itemCategory) p.set("itemCategory", state.itemCategory);
    const data = await getJson(`/api/groups?${p}`);
    if (gen !== loadGen || cat !== state.category) return;
    grid.innerHTML = "";
    if (!data.groups?.length) {
      grid.innerHTML = `<p class="idea-empty">Could not split this type into jobs.</p>`;
      return;
    }
    for (const group of data.groups) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "job-card";
      btn.setAttribute("aria-pressed", group.id === state.job ? "true" : "false");
      const feats = (group.features || []).slice(0, 4)
        .map((f) => `<span class="job-feat">${escapeHtml(f)}</span>`)
        .join("");
      const stars = group.avg_rating == null ? "—" : rating(group.avg_rating);
      btn.innerHTML = `
        <h3>${escapeHtml(group.label)}</h3>
        <p class="job-card-meta">${fmt(group.demand)} ${demandWord()} · ${fmt(group.n)} apps · ${stars} stars</p>
        ${feats ? `<div class="job-feats">${feats}</div>` : ""}
        <p class="job-ex">${escapeHtml((group.examples || []).slice(0, 2).join(" · "))}</p>
      `;
      btn.addEventListener("click", () => pickJob(group));
      grid.append(btn);
    }
  } catch {
    if (gen !== loadGen) return;
    grid.innerHTML = `<p class="idea-empty">Could not group this type.</p>`;
  }
}

async function loadAll() {
  loadGen += 1;
  renderChips();
  loadJobs();
  loadPain();
  loadGrowth();
  await loadMeta();
  await loadInsights();
  await loadList();
  await loadCats();
}

const COMMANDS = [
  { id: "chrome", label: "Switch to Chrome", run: () => setSource("chrome") },
  { id: "jira", label: "Switch to Jira", run: () => setSource("jira") },
  { id: "demand", label: "Sort by users", run: () => setSort("demand") },
  { id: "reviews", label: "Sort by reviews", run: () => setSort("reviews") },
  { id: "rating", label: "Sort by stars", run: () => setSort("rating") },
  { id: "opportunity", label: "Sort by gap", run: () => setSort("opportunity") },
  { id: "reset", label: "Reset filters", run: () => resetFilters() },
  { id: "how", label: "How it works", run: () => { window.location.href = "/how.html"; } },
  { id: "search", label: "Search", run: () => $("q").focus() },
];

let paletteIndex = 0;
let paletteHits = COMMANDS;

function openPalette() {
  const el = $("palette");
  el.hidden = false;
  el.dataset.open = "true";
  $("palette-q").value = "";
  renderPalette("");
  $("palette-q").focus();
}

function closePalette() {
  const el = $("palette");
  el.hidden = true;
  el.dataset.open = "false";
}

function renderPalette(q) {
  const needle = q.toLowerCase().trim();
  paletteHits = COMMANDS.filter((c) => c.label.toLowerCase().includes(needle));
  paletteIndex = 0;
  const ul = $("palette-list");
  ul.innerHTML = "";
  paletteHits.forEach((cmd, i) => {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = cmd.label;
    btn.setAttribute("aria-selected", i === 0 ? "true" : "false");
    btn.addEventListener("click", () => {
      cmd.run();
      closePalette();
    });
    li.append(btn);
    ul.append(li);
  });
}

function bind() {
  $("src-chrome").addEventListener("click", () => setSource("chrome"));
  $("src-jira").addEventListener("click", () => setSource("jira"));
  $("reset").addEventListener("click", resetFilters);
  $("q").addEventListener("input", debounce(() => {
    state.q = $("q").value.trim();
    state.offset = 0;
    loadGen += 1;
    renderChips();
    loadInsights();
    loadList();
    loadGrowth();
  }, 250));
  $("min-demand").addEventListener("change", () => {
    state.minDemand = Number($("min-demand").value || 0);
    state.offset = 0;
    loadGen += 1;
    renderChips();
    loadInsights();
    loadList();
    loadGrowth();
  });
  $("min-rating").addEventListener("change", () => {
    state.minRating = Number($("min-rating").value || 0);
    state.offset = 0;
    loadGen += 1;
    renderChips();
    loadInsights();
    loadList();
    loadGrowth();
  });
  $("min-reviews").addEventListener("change", () => {
    state.minReviews = Number($("min-reviews").value || 0);
    state.offset = 0;
    loadGen += 1;
    renderChips();
    loadInsights();
    loadList();
    loadGrowth();
  });
  $("item-category").addEventListener("change", () => {
    state.itemCategory = $("item-category").value;
    state.offset = 0;
    loadGen += 1;
    renderChips();
    loadInsights();
    loadList();
    loadGrowth();
  });
  for (const btn of document.querySelectorAll(".sorts [data-sort]")) {
    btn.addEventListener("click", () => setSort(btn.dataset.sort));
  }
  $("prev").addEventListener("click", () => {
    state.offset = Math.max(0, state.offset - state.limit);
    loadList();
  });
  $("next").addEventListener("click", () => {
    state.offset += state.limit;
    loadList();
  });
  $("cmd-open").addEventListener("click", openPalette);
  $("growth-toggle").addEventListener("click", () => {
    const btn = $("growth-toggle");
    const open = btn.getAttribute("aria-expanded") !== "true";
    btn.setAttribute("aria-expanded", open ? "true" : "false");
    $("growth-body").hidden = !open;
  });
  $("palette").addEventListener("click", (e) => {
    if (e.target.id === "palette") closePalette();
  });
  $("palette-q").addEventListener("input", (e) => renderPalette(e.target.value));
  document.addEventListener("keydown", (e) => {
    const open = $("palette").dataset.open === "true";
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      open ? closePalette() : openPalette();
    }
    if (!open) return;
    if (e.key === "Escape") closePalette();
    if (e.key === "ArrowDown") {
      e.preventDefault();
      paletteIndex = Math.min(paletteHits.length - 1, paletteIndex + 1);
      paintPalette();
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      paletteIndex = Math.max(0, paletteIndex - 1);
      paintPalette();
    }
    if (e.key === "Enter" && paletteHits[paletteIndex]) {
      e.preventDefault();
      paletteHits[paletteIndex].run();
      closePalette();
    }
  });
}

function paintPalette() {
  [...$("palette-list").querySelectorAll("button")].forEach((btn, i) => {
    btn.setAttribute("aria-selected", i === paletteIndex ? "true" : "false");
  });
}

function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

bind();
loadAll();
