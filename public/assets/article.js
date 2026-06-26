const article = document.querySelector("[data-article]");
const toggle = document.querySelector("[data-theme-toggle]");

async function getJson(path) {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) throw new Error(`Cannot load ${path}`);
  return res.json();
}

function parseFrontMatter(markdown) {
  const match = markdown.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  const meta = {};
  let body = markdown;
  if (match) {
    body = match[2];
    match[1].split("\n").forEach((line) => {
      const index = line.indexOf(":");
      if (index === -1) return;
      meta[line.slice(0, index).trim()] = line.slice(index + 1).trim();
    });
  }
  return { meta, body };
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);
}

function markdownToHtml(markdown) {
  return markdown.split(/\n{2,}/).map((block) => {
    const text = escapeHtml(block.trim());
    if (!text) return "";
    if (text.startsWith("### ")) return `<h3>${text.slice(4)}</h3>`;
    if (text.startsWith("## ")) return `<h2>${text.slice(3)}</h2>`;
    if (text.startsWith("# ")) return `<h1>${text.slice(2)}</h1>`;
    return `<p>${text.replace(/\n/g, "<br>")}</p>`;
  }).join("");
}

function renderMenu(menu) {
  document.querySelector("[data-menu]").innerHTML = menu.map((item) => `<a href="${item.href}">${item.label}</a>`).join("");
}

function setupTheme(theme) {
  document.documentElement.style.setProperty("--accent", theme.accent || "#2f7dff");
  if (theme.cardRadius) document.documentElement.style.setProperty("--card-radius", `${parseInt(theme.cardRadius, 10)}px`);
  const saved = localStorage.getItem("theme");
  const defaultDark = theme.darkMode === true || theme.darkMode === "true";
  if (saved === "dark" || (!saved && defaultDark)) document.body.classList.add("dark");
  toggle.addEventListener("click", () => {
    document.body.classList.toggle("dark");
    localStorage.setItem("theme", document.body.classList.contains("dark") ? "dark" : "light");
  });
}

async function init() {
  const file = new URL(location.href).searchParams.get("file");
  const validPath = file?.startsWith("/content/posts/") || file?.startsWith("/content/pages/");
  if (!file || !validPath) throw new Error("Invalid article path");
  const [site, menu, theme, res] = await Promise.all([
    getJson("/config/site.json"),
    getJson("/config/menu.json"),
    getJson("/config/theme.json"),
    fetch(file, { cache: "no-store" })
  ]);
  if (!res.ok) throw new Error("Article not found");

  document.querySelector("[data-site-title]").textContent = site.title;
  renderMenu(menu);
  setupTheme(theme);

  const { meta, body } = parseFrontMatter(await res.text());
  document.title = meta.title || "Article";
  article.innerHTML = `
    <a class="article-back" href="/">Back to home</a>
    ${meta.cover ? `<img class="article-cover" src="${meta.cover}" alt="">` : ""}
    <div class="post-meta"><span>${meta.date || ""}</span><span>${meta.category || ""}</span></div>
    <h1>${meta.title || "Untitled"}</h1>
    <div class="article-content">${markdownToHtml(body)}</div>
  `;
}

init().catch((error) => {
  article.textContent = `Load failed: ${error.message}`;
});
