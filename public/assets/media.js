import { getJson, renderAdSlots, renderFooter, trackPageView } from "./runtime.js";

const $ = (selector) => document.querySelector(selector);

function renderMenu(menu) {
  $("[data-menu]").innerHTML = menu.map((item) => `<a href="${item.href}">${item.label}</a>`).join("");
}

function setupTheme(theme) {
  document.documentElement.style.setProperty("--accent", theme.accent || "#2f7dff");
  if (theme.cardRadius) document.documentElement.style.setProperty("--card-radius", `${parseInt(theme.cardRadius, 10)}px`);
  const saved = localStorage.getItem("theme");
  const defaultDark = theme.darkMode === true || theme.darkMode === "true";
  if (saved === "dark" || (!saved && defaultDark)) document.body.classList.add("dark");
  $("[data-theme-toggle]").addEventListener("click", () => {
    document.body.classList.toggle("dark");
    localStorage.setItem("theme", document.body.classList.contains("dark") ? "dark" : "light");
  });
}

function renderMedia(items) {
  $("[data-media-grid]").innerHTML = items.map((item) => `
    <article class="media-item">
      ${item.type === "image" ? `<img src="${item.url}" alt="">` : `<div class="media-file">${item.type || "file"}</div>`}
      <div>
        <h3>${item.name}</h3>
        <p>${item.note || ""}</p>
        <a href="${item.url}" target="_blank" rel="noreferrer">打开链接</a>
      </div>
    </article>
  `).join("");
}

async function init() {
  const [site, menu, theme, footer, media] = await Promise.all([
    getJson("/config/site.json"),
    getJson("/config/menu.json"),
    getJson("/config/theme.json"),
    getJson("/config/footer.json").catch(() => ({})),
    getJson("/content/media.json")
  ]);
  document.title = `媒体库 - ${site.title}`;
  $("[data-site-title]").textContent = site.title;
  renderFooter(site, footer);
  renderMenu(menu);
  setupTheme(theme);
  renderMedia(media);
  await renderAdSlots({ page: "media" });
  trackPageView({ page: "media", title: document.title });
}

init().catch((error) => {
  $("[data-media-grid]").innerHTML = `<p>加载失败：${error.message}</p>`;
});
