import { getJson, getText, renderAdSlots, trackPageView } from "./runtime.js";

const $ = (selector) => document.querySelector(selector);

function parseFrontMatter(markdown, path) {
  const match = markdown.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  const meta = {};
  if (match) {
    match[1].split("\n").forEach((line) => {
      const index = line.indexOf(":");
      if (index === -1) return;
      meta[line.slice(0, index).trim()] = line.slice(index + 1).trim();
    });
  }
  return {
    path,
    title: meta.title || "未命名文章",
    date: meta.date || "",
    category: meta.category || "未分类",
    tags: (meta.tags || "").split(",").map((tag) => tag.trim()).filter(Boolean)
  };
}

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

function countBy(values) {
  return values.reduce((acc, value) => {
    acc.set(value, (acc.get(value) || 0) + 1);
    return acc;
  }, new Map());
}

function renderCloud(selector, entries) {
  $(selector).innerHTML = [...entries]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([name, count]) => `<span class="tag"># ${name} ${count}</span>`)
    .join("");
}

function renderArchive(posts) {
  const categories = countBy(posts.map((post) => post.category));
  const tags = countBy(posts.flatMap((post) => post.tags));
  $("[data-archive-summary]").innerHTML = `
    <span><strong>${posts.length}</strong> 篇文章</span>
    <span><strong>${categories.size}</strong> 个分类</span>
    <span><strong>${tags.size}</strong> 个标签</span>
  `;
  $("[data-archive-list]").innerHTML = posts.map((post) => `
    <a class="archive-row" href="/article.html?file=${encodeURIComponent(post.path)}">
      <time>${post.date}</time>
      <strong>${post.title}</strong>
      <span>${post.category}</span>
    </a>
  `).join("");
  renderCloud("[data-category-cloud]", categories);
  renderCloud("[data-tag-cloud]", tags);
}

async function init() {
  const postFiles = await getJson("/content/posts/index.json");
  const [site, menu, theme, ...markdown] = await Promise.all([
    getJson("/config/site.json"),
    getJson("/config/menu.json"),
    getJson("/config/theme.json"),
    ...postFiles.map(getText)
  ]);
  const posts = markdown.map((text, index) => parseFrontMatter(text, postFiles[index]))
    .sort((a, b) => b.date.localeCompare(a.date));
  document.title = `归档 - ${site.title}`;
  $("[data-site-title]").textContent = site.title;
  $("[data-site-footer]").textContent = site.copyright || `© ${new Date().getFullYear()} ${site.title}`;
  renderMenu(menu);
  setupTheme(theme);
  renderArchive(posts);
  await renderAdSlots({ page: "archive" });
  trackPageView({ page: "archive", title: document.title });
}

init().catch((error) => {
  $("[data-archive-list]").innerHTML = `<p>加载失败：${error.message}</p>`;
});
