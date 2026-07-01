import { getJson, getText, renderAdSlots, renderFooter, trackPageView } from "./runtime.js";

const $ = (selector) => document.querySelector(selector);

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);
}

function splitValues(value) {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  return String(value || "").split(",").map((item) => item.trim()).filter(Boolean);
}

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
  return normalizePost({
    path,
    title: meta.title,
    date: meta.date,
    category: meta.category,
    categories: meta.categories,
    tags: meta.tags,
    status: meta.status || "published"
  });
}

function normalizePost(item) {
  const categories = splitValues(item.categories || item.category || "未分类");
  return {
    path: item.path,
    title: item.title || "未命名文章",
    date: item.date || "",
    category: categories[0] || "未分类",
    categories,
    tags: splitValues(item.tags),
    status: item.status || "published"
  };
}

async function loadPostsFromIndex(index) {
  if (Array.isArray(index) && index.every((item) => typeof item === "string")) {
    const markdown = await Promise.all(index.map(getText));
    return markdown.map((text, indexNumber) => parseFrontMatter(text, index[indexNumber]));
  }
  return (Array.isArray(index) ? index : []).map(normalizePost);
}

function renderMenu(menu) {
  $("[data-menu]").innerHTML = menu.map((item) => `<a href="${escapeHtml(item.href)}">${escapeHtml(item.label)}</a>`).join("");
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
    .map(([name, count]) => `<span class="tag"># ${escapeHtml(name)} ${count}</span>`)
    .join("");
}

function renderArchive(posts) {
  const categories = countBy(posts.flatMap((post) => post.categories));
  const tags = countBy(posts.flatMap((post) => post.tags));
  $("[data-archive-summary]").innerHTML = `
    <span><strong>${posts.length}</strong> 篇文章</span>
    <span><strong>${categories.size}</strong> 个分类</span>
    <span><strong>${tags.size}</strong> 个标签</span>
  `;
  $("[data-archive-list]").innerHTML = posts.map((post) => `
    <a class="archive-row" href="/article.html?file=${encodeURIComponent(post.path)}">
      <time>${escapeHtml(post.date)}</time>
      <strong>${escapeHtml(post.title)}</strong>
      <span>${escapeHtml(post.categories.join("、"))}</span>
    </a>
  `).join("");
  renderCloud("[data-category-cloud]", categories);
  renderCloud("[data-tag-cloud]", tags);
}

async function init() {
  const postIndex = await getJson("/content/posts/index.json");
  const [site, menu, theme, footer] = await Promise.all([
    getJson("/config/site.json"),
    getJson("/config/menu.json"),
    getJson("/config/theme.json"),
    getJson("/config/footer.json").catch(() => ({}))
  ]);
  const posts = (await loadPostsFromIndex(postIndex))
    .filter((post) => post.status !== "draft")
    .sort((a, b) => b.date.localeCompare(a.date));
  document.title = `归档 - ${site.title}`;
  $("[data-site-title]").textContent = site.title;
  renderFooter(site, footer);
  renderMenu(menu);
  setupTheme(theme);
  renderArchive(posts);
  await renderAdSlots({ page: "archive" });
  trackPageView({ page: "archive", title: document.title });
}

init().catch((error) => {
  $("[data-archive-list]").innerHTML = `<p>加载失败：${escapeHtml(error.message)}</p>`;
});
