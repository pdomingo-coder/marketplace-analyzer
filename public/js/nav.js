export function bindNav() {
  const btn = document.getElementById("nav-toggle");
  const menu = document.getElementById("nav-menu");
  if (btn && menu) {
    btn.addEventListener("click", () => {
      const open = btn.getAttribute("aria-expanded") === "true";
      btn.setAttribute("aria-expanded", open ? "false" : "true");
      menu.hidden = open;
    });
  }

  const file = location.pathname.split("/").pop() || "index.html";
  const isIndex = file === "" || file === "index.html";
  if (!isIndex) return;
  const source = new URLSearchParams(location.search).get("source") === "jira" ? "jira" : "chrome";
  const on = "text-xs font-medium bg-primary-600 text-white px-3 py-1.5 rounded-md";
  const off = "text-xs font-medium bg-primary-200 hover:bg-primary-300 text-primary-900 px-3 py-1.5 rounded-md";
  for (const link of document.querySelectorAll("[data-nav]")) {
    const current = link.dataset.nav === source;
    link.className = current ? on : off;
    if (current) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  }
}
