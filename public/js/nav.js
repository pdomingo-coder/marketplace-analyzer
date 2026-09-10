export function bindNav() {
  const btn = document.getElementById("nav-toggle");
  const menu = document.getElementById("nav-menu");
  if (!btn || !menu) return;
  btn.addEventListener("click", () => {
    const open = btn.getAttribute("aria-expanded") === "true";
    btn.setAttribute("aria-expanded", open ? "false" : "true");
    menu.hidden = open;
  });
}
