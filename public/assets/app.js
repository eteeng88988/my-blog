import { getJson, getText, renderAdSlots, trackPageView } from "./runtime.js";

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
  let body = markdown;

  if (match) {
    body = match[2];
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
    showDate: meta.showDate !== "false",
    category: meta.category,
    categories: meta.categories,
    subcategory: meta.subcategory,
    subcategories: meta.subcategories,
    tags: meta.tags,
    cover: meta.cover,
    summary: meta.summary || body.replace(/\s+/g, " ").slice(0, 120),
    featured: meta.featured === "true",
    status: meta.status || "published",
    format: meta.format || "",
    body
  });
}

function normalizePost(item) {
  const categories = splitValues(item.categories || item.category || "未分类");
  const subcategories = splitValues(item.subcategories || item.subcategory);
  const tags = splitValues(item.tags);
  return {
    path: item.path,
    title: item.title || "未命名文章",
    date: item.date || "",
    showDate: item.showDate !== false && item.showDate !== "false",
    category: categories[0] || "未分类",
    categories,
    subcategory: subcategories[0] || "",
    subcategories,
    tags,
    cover: item.cover || "",
    summary: item.summary || "",
    featured: item.featured === true || item.featured === "true",
    status: item.status || "published",
    format: item.format || "",
    body: item.body || ""
  };
}

async function loadPostsFromIndex(index) {
  if (Array.isArray(index) && index.every((item) => typeof item === "string")) {
    const markdown = await Promise.all(index.map(getText));
    return markdown.map((text, indexNumber) => parseFrontMatter(text, index[indexNumber]));
  }
  return (Array.isArray(index) ? index : []).map(normalizePost);
}

function articleHref(path) {
  return `/article.html?file=${encodeURIComponent(path)}`;
}

function renderMenu(menu) {
  $("[data-menu]").innerHTML = menu.map((item) => `<a href="${escapeHtml(item.href)}">${escapeHtml(item.label)}</a>`).join("");
}

function renderSite(site) {
  document.title = site.title;
  $("[data-site-title]").textContent = site.title;
  $("[data-site-subtitle]").textContent = site.subtitle;
  $("[data-site-description]").textContent = site.description;
  if (site.heroImage) $("[data-hero]").style.backgroundImage = `url("${site.heroImage}")`;
  $("[data-site-footer]").textContent = site.copyright || `© ${new Date().getFullYear()} ${site.title}`;
}

function renderSidebar(sidebar, posts, onFilter) {
  const tags = new Set(posts.flatMap((post) => post.tags));
  const cats = new Set(posts.flatMap((post) => post.categories));
  $("[data-sidebar-avatar]").src = sidebar.avatar;
  $("[data-sidebar-name]").textContent = sidebar.name;
  $("[data-sidebar-bio]").textContent = sidebar.bio;
  $("[data-sidebar-notice]").textContent = sidebar.notice;
  $("[data-sidebar-github]").href = sidebar.github;
  $("[data-sidebar-email]").href = `mailto:${sidebar.email}`;
  $("[data-stat-posts]").textContent = posts.length;
  $("[data-stat-tags]").textContent = tags.size;
  $("[data-stat-cats]").textContent = cats.size;
  $("[data-tags]").innerHTML = [...tags].map((tag) => `<button class="tag filter-tag" data-tag="${escapeHtml(tag)}"># ${escapeHtml(tag)}</button>`).join("");
  $("[data-tags]").querySelectorAll("[data-tag]").forEach((button) => {
    button.addEventListener("click", () => onFilter({ type: "tag", value: button.dataset.tag }));
  });
}

function renderCover(post) {
  if (post.cover) {
    return `
      <a class="post-cover" href="${articleHref(post.path)}">
        <img src="${escapeHtml(post.cover)}" alt="">
      </a>
    `;
  }
  return `
    <a class="post-cover post-cover-empty" href="${articleHref(post.path)}">
      <span>${escapeHtml(post.category.slice(0, 8) || "文章")}</span>
    </a>
  `;
}

function renderPosts(posts, activeFilter) {
  const suffix = activeFilter ? ` / ${activeFilter.value}` : "";
  $("[data-post-count]").textContent = `${posts.length} 篇${suffix}`;
  $("[data-posts]").innerHTML = posts.map((post) => `
    <article class="post-card">
      ${renderCover(post)}
      <div class="post-body">
        <div class="post-meta">
          ${post.showDate && post.date ? `<span>${escapeHtml(post.date)}</span>` : ""}
          ${post.categories.map((category) => `<button class="meta-button" data-category="${escapeHtml(category)}">${escapeHtml(category)}</button>`).join("")}
          ${post.featured ? "<span>推荐</span>" : ""}
        </div>
        <h3><a href="${articleHref(post.path)}">${escapeHtml(post.title)}</a></h3>
        <p>${escapeHtml(post.summary)}</p>
        <div class="tags">${post.tags.map((tag) => `<button class="tag filter-tag" data-tag="${escapeHtml(tag)}"># ${escapeHtml(tag)}</button>`).join("")}</div>
      </div>
    </article>
  `).join("");
}

function setupPostFilters(allPosts) {
  let activeFilter = null;
  const apply = (filter) => {
    activeFilter = filter;
    const posts = filter
      ? allPosts.filter((post) => filter.type === "tag" ? post.tags.includes(filter.value) : post.categories.includes(filter.value))
      : allPosts;
    renderPosts(posts, activeFilter);
    renderAdSlots({ page: "home", categories: filter?.type === "category" ? [filter.value] : [] });
    attachFilterEvents(apply);
  };
  attachFilterEvents(apply);
  return apply;
}

function attachFilterEvents(apply) {
  document.querySelectorAll("[data-tag]").forEach((button) => {
    button.addEventListener("click", () => apply({ type: "tag", value: button.dataset.tag }));
  });
  document.querySelectorAll("[data-category]").forEach((button) => {
    button.addEventListener("click", () => apply({ type: "category", value: button.dataset.category }));
  });
}

function setupSearch(posts) {
  const dialog = $("[data-search-dialog]");
  const input = $("[data-search-input]");
  const results = $("[data-search-results]");
  $("[data-search-open]").addEventListener("click", () => {
    dialog.showModal();
    input.focus();
  });

  input.addEventListener("input", () => {
    const query = input.value.trim().toLowerCase();
    const matched = posts.filter((post) => {
      const haystack = `${post.title} ${post.summary} ${post.categories.join(" ")} ${post.subcategories.join(" ")} ${post.tags.join(" ")}`.toLowerCase();
      return !query || haystack.includes(query);
    });
    results.innerHTML = matched.map((post) => `
      <a class="search-result" href="${articleHref(post.path)}">
        <strong>${escapeHtml(post.title)}</strong>
        <span>${escapeHtml(post.summary)}</span>
      </a>
    `).join("");
  });
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

function setupBackTop() {
  $("[data-back-top]").addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
}

async function init() {
  const postIndex = await getJson("/content/posts/index.json");
  const [site, menu, sidebar, theme] = await Promise.all([
    getJson("/config/site.json"),
    getJson("/config/menu.json"),
    getJson("/config/sidebar.json"),
    getJson("/config/theme.json")
  ]);
  const posts = (await loadPostsFromIndex(postIndex))
    .filter((post) => post.status !== "draft")
    .sort((a, b) => b.date.localeCompare(a.date));

  renderSite(site);
  renderMenu(menu);
  renderPosts(posts, null);
  const applyFilter = setupPostFilters(posts);
  renderSidebar(sidebar, posts, applyFilter);
  setupTheme(theme);
  setupSearch(posts);
  setupBackTop();
  await renderAdSlots({ page: "home" });
  trackPageView({ page: "home", title: document.title });
}

init().catch((error) => {
  console.error(error);
  $("[data-posts]").innerHTML = `<p>加载失败：${escapeHtml(error.message)}</p>`;
});
