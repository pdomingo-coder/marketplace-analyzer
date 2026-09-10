export function escapeHtml(s) {
  return String(s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function niceName(s) {
  return String(s || "")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function categoryHtml(cat) {
  return String(cat || "")
    .split("/")
    .map((part) => niceName(part.trim()))
    .filter(Boolean)
    .map((part) => `<span class="cat-pill">${escapeHtml(part)}</span>`)
    .join("");
}
