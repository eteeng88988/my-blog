import { contentUrl, getJson, getText, renderAdSlots, renderFooter, trackPageView } from "./runtime.js";

const article = document.querySelector("[data-article]");
const toggle = document.querySelector("[data-theme-toggle]");

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

function normalizeIndexPost(item) {
  const categories = splitValues(item.categories || item.category);
  const subcategories = splitValues(item.subcategories || item.subcategory);
  const tags = splitValues(item.tags);
  return {
    path: item.path,
    meta: {
      title: item.title || "未命名文章",
      date: item.date || "",
      category: categories[0] || "",
      categories,
      subcategory: subcategories[0] || "",
      subcategories,
      tags,
      cover: item.cover || "",
      summary: item.summary || "",
      showDate: item.showDate !== false && item.showDate !== "false",
      status: item.status || "published",
      format: item.format || ""
    },
    body: item.body || ""
  };
}

function parseFrontMatter(markdown, path = "") {
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
  return {
    path,
    meta: {
      title: meta.title || "Untitled",
      date: meta.date || "",
      category: splitValues(meta.categories || meta.category)[0] || "",
      categories: splitValues(meta.categories || meta.category),
      subcategory: splitValues(meta.subcategories || meta.subcategory)[0] || "",
      subcategories: splitValues(meta.subcategories || meta.subcategory),
      tags: splitValues(meta.tags),
      cover: meta.cover || "",
      showDate: meta.showDate !== "false",
      status: meta.status || "published",
      format: meta.format || ""
    },
    body
  };
}

async function loadPostsFromIndex(index) {
  if (Array.isArray(index) && index.every((item) => typeof item === "string")) {
    const postMarkdown = await Promise.all(index.map(getText));
    return postMarkdown.map((text, indexNumber) => parseFrontMatter(text, index[indexNumber]));
  }
  return (Array.isArray(index) ? index : []).map(normalizeIndexPost);
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

function articleContentToHtml(body, meta) {
  if (meta.format === "raw") return `<pre class="article-raw">${escapeHtml(body)}</pre>`;
  return markdownToHtml(body);
}

function renderMenu(menu) {
  document.querySelector("[data-menu]").innerHTML = menu.map((item) => `<a href="${escapeHtml(item.href)}">${escapeHtml(item.label)}</a>`).join("");
}

function sidebarHref(item) {
  const value = String(item.url || "").trim();
  if (item.type === "email") return value.startsWith("mailto:") ? value : `mailto:${value}`;
  if (item.type === "tel") return value.startsWith("tel:") ? value : `tel:${value}`;
  if (/^(https?:|mailto:|tel:|\/|#)/i.test(value)) return value;
  return value ? `#${encodeURIComponent(value)}` : "#";
}

function filterHref(type, value) {
  const params = new URLSearchParams();
  params.set(type, value);
  return `/?${params.toString()}#posts`;
}

function postCategories(post) {
  return post.meta?.categories || [];
}

function postSubcategories(post) {
  return post.meta?.subcategories || [];
}

function postTags(post) {
  return post.meta?.tags || [];
}

function renderSidebarCategoryTree(categoryConfig, posts) {
  const tree = document.querySelector("[data-sidebar-category-tree]");
  if (!tree) return;
  const categoryCounts = new Map();
  const subcategoryCounts = new Map();
  posts.forEach((post) => {
    postCategories(post).forEach((name) => categoryCounts.set(name, (categoryCounts.get(name) || 0) + 1));
    postSubcategories(post).forEach((name) => subcategoryCounts.set(name, (subcategoryCounts.get(name) || 0) + 1));
  });
  tree.innerHTML = (categoryConfig.items || []).map((item) => {
    const children = (item.children || []).map((child) => `
      <button type="button" data-subcategory="${escapeHtml(child)}">
        <span>${escapeHtml(child)}</span>
        <em>${subcategoryCounts.get(child) || 0}</em>
      </button>
    `).join("");
    return `
      <div class="category-menu-item">
        <button class="category-trigger" type="button" data-category="${escapeHtml(item.name)}">
          <span>${escapeHtml(item.name)}</span>
          <em>${categoryCounts.get(item.name) || 0}</em>
        </button>
        <div class="category-dropdown">${children || "<span>暂无子目录</span>"}</div>
      </div>
    `;
  }).join("");
  tree.querySelectorAll("[data-category]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      location.href = filterHref("category", button.dataset.category);
    });
  });
  tree.querySelectorAll("[data-subcategory]").forEach((button) => {
    button.addEventListener("click", () => {
      location.href = filterHref("subcategory", button.dataset.subcategory);
    });
  });
}

function renderSidebar(sidebar, posts, categoryConfig) {
  const tags = new Set(posts.flatMap(postTags));
  const cats = new Set(posts.flatMap(postCategories));
  const avatar = document.querySelector("[data-sidebar-avatar]");
  if (avatar) avatar.src = sidebar.avatar || "";
  document.querySelector("[data-sidebar-name]").textContent = sidebar.name || "";
  document.querySelector("[data-sidebar-bio]").textContent = sidebar.bio || "";
  document.querySelector("[data-sidebar-notice]").textContent = sidebar.notice || "";
  const links = Array.isArray(sidebar.links) && sidebar.links.length
    ? sidebar.links
    : [
      sidebar.github ? { label: "GitHub", type: "link", url: sidebar.github, enabled: true } : null,
      sidebar.email ? { label: "邮箱", type: "email", url: sidebar.email, enabled: true } : null
    ].filter(Boolean);
  document.querySelector("[data-sidebar-links]").innerHTML = links
    .filter((item) => item.enabled !== false)
    .map((item) => item.type === "html"
      ? `<span class="profile-link-html">${item.html || item.label || ""}</span>`
      : `<a href="${escapeHtml(sidebarHref(item))}" target="${item.type === "link" ? "_blank" : "_self"}" rel="noreferrer">${escapeHtml(item.label || item.url)}</a>`)
    .join("");
  document.querySelector("[data-sidebar-custom]").innerHTML = sidebar.customHtml || "";
  document.querySelector("[data-stat-posts]").textContent = posts.length;
  document.querySelector("[data-stat-tags]").textContent = tags.size;
  document.querySelector("[data-stat-cats]").textContent = cats.size;
  document.querySelector("[data-tags]").innerHTML = [...tags]
    .map((tag) => `<a class="tag filter-tag" href="${escapeHtml(filterHref("tag", tag))}"># ${escapeHtml(tag)}</a>`)
    .join("");
  renderSidebarCategoryTree(categoryConfig, posts);
}

function articleHref(path) {
  return `/article.html?file=${encodeURIComponent(path)}`;
}

function hasOverlap(left = [], right = []) {
  return left.some((item) => right.includes(item));
}

function renderArticleExtras(currentPath, currentMeta, posts) {
  if (!currentPath.startsWith("/content/posts/")) return "";
  const published = posts.filter((post) => post.meta.status !== "draft");
  const index = published.findIndex((post) => post.path === currentPath);
  const prev = index === -1 ? null : published[index + 1];
  const next = index === -1 ? null : published[index - 1];
  let related = published
    .filter((post) => post.path !== currentPath)
    .filter((post) => hasOverlap(post.meta.categories, currentMeta.categories) || hasOverlap(post.meta.tags, currentMeta.tags))
    .slice(0, 3);
  let relatedTitle = "相关文章";
  if (!related.length) {
    related = published.filter((post) => post.path !== currentPath).slice(0, 3);
    relatedTitle = "最新文章";
  }

  return `
    <nav class="article-nav">
      ${prev ? `<a href="${articleHref(prev.path)}"><span>上一篇</span><strong>${escapeHtml(prev.meta.title)}</strong></a>` : "<span></span>"}
      ${next ? `<a href="${articleHref(next.path)}"><span>下一篇</span><strong>${escapeHtml(next.meta.title)}</strong></a>` : "<span></span>"}
    </nav>
    ${related.length ? `
      <section class="related-posts">
        <h2>${relatedTitle}</h2>
        <div>
          ${related.map((post) => `<a href="${articleHref(post.path)}">${escapeHtml(post.meta.title)}<span>${escapeHtml(post.meta.categories.join("、"))}</span></a>`).join("")}
        </div>
      </section>
    ` : ""}
  `;
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
  const [site, menu, theme, footer, sidebar, categories, postIndex, res] = await Promise.all([
    getJson("/config/site.json"),
    getJson("/config/menu.json"),
    getJson("/config/theme.json"),
    getJson("/config/footer.json").catch(() => ({})),
    getJson("/config/sidebar.json"),
    getJson("/config/categories.json"),
    getJson("/content/posts/index.json"),
    fetch(contentUrl(file), { cache: "no-store" })
  ]);
  if (!res.ok) throw new Error("Article not found");

  document.querySelector("[data-site-title]").textContent = site.title;
  renderFooter(site, footer);
  renderMenu(menu);
  setupTheme(theme);

  const posts = (await loadPostsFromIndex(postIndex)).sort((a, b) => b.meta.date.localeCompare(a.meta.date));
  renderSidebar(sidebar, posts.filter((post) => post.meta.status !== "draft"), categories);
  const { meta, body } = parseFrontMatter(await res.text(), file);
  const indexPost = posts.find((post) => post.path === file);
  if (indexPost?.meta.cover) meta.cover = indexPost.meta.cover;
  const pageType = file.startsWith("/content/posts/") ? "article" : "page";
  document.title = meta.title || "Article";
  const metaItems = [
    ...(meta.showDate && meta.date ? [meta.date] : []),
    ...meta.categories,
    ...meta.subcategories
  ];
  article.innerHTML = `
    <a class="article-back" href="/">返回首页</a>
    ${meta.cover ? `<img class="article-cover" src="${escapeHtml(meta.cover)}" alt="">` : ""}
    <section class="ad-region" data-ad-slot="article-top" hidden></section>
    <div class="post-meta">${metaItems.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}</div>
    <h1>${escapeHtml(meta.title || "Untitled")}</h1>
    <section class="ad-region" data-ad-slot="article-content" hidden></section>
    <div class="article-content">${articleContentToHtml(body, meta)}</div>
    ${renderArticleExtras(file, meta, posts)}
  `;
  await renderAdSlots({ page: pageType, path: file, categories: meta.categories, subcategories: meta.subcategories });
  trackPageView({
    page: pageType,
    path: file,
    title: meta.title,
    category: meta.categories.join(","),
    subcategory: meta.subcategories.join(",")
  });
}

init().catch((error) => {
  article.textContent = `加载失败：${error.message}`;
});
