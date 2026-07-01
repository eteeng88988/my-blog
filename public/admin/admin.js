const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

let posts = [];
let pages = [];
let mediaItems = [];
let menuItems = [];
let categoryConfig = { items: [] };
let adConfig = { placements: [] };
let sidebarConfig = { links: [] };
let footerConfig = { links: [] };
let adminSettings = {};
let activePost = null;
let activePage = null;
let selectedPostPaths = new Set();
let postManager = {
  search: "",
  status: "all",
  category: "all",
  subcategory: "all",
  sort: "date-desc",
  page: 1,
  pageSize: 25
};

const pageOptions = [
  { value: "all", label: "全站" },
  { value: "home", label: "首页" },
  { value: "archive", label: "归档页" },
  { value: "media", label: "媒体页" },
  { value: "article", label: "文章内容页" },
  { value: "page", label: "独立页面" }
];

const adSlots = [
  { value: "global-top", label: "全站顶部广告位" },
  { value: "home-top", label: "首页广告位" },
  { value: "category-top", label: "大类目广告位" },
  { value: "subcategory-top", label: "子类目广告位" },
  { value: "content-list", label: "内容列表广告位" },
  { value: "article-top", label: "文章页顶部广告位" },
  { value: "article-content", label: "文章内容广告位" },
  { value: "sidebar-notice", label: "右侧栏公告下广告位" },
  { value: "footer", label: "底栏广告位" }
];

async function api(path, options = {}) {
  const res = await fetch(`/api/admin${path}`, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `请求失败：${res.status}`);
  return data;
}

function setStatus(message) {
  $("[data-status]").textContent = message;
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);
}

function slugify(title, fallback) {
  return title.trim().toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "") || `${fallback}-${Date.now()}`;
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
  return { path, meta, body };
}

function splitValues(value) {
  return String(value || "").split(",").map((item) => item.trim()).filter(Boolean);
}

function joinValues(values) {
  return [...new Set((values || []).map((item) => String(item).trim()).filter(Boolean))].join(",");
}

function selectedValues(select) {
  return [...select.selectedOptions].map((option) => option.value).filter(Boolean);
}

const postFrontmatterOrder = [
  "title",
  "date",
  "showDate",
  "category",
  "categories",
  "subcategory",
  "subcategories",
  "tags",
  "cover",
  "summary",
  "featured",
  "status",
  "format",
  "sourceCollection",
  "sourceNumber",
  "sourceStartPage",
  "sourceEndPage",
  "sourceBodySha256"
];

function frontmatterLineValue(value) {
  if (Array.isArray(value)) return joinValues(value);
  return String(value ?? "").replace(/\r?\n/g, " ").trim();
}

function buildMarkdownFromMeta(meta, body) {
  const keys = [
    ...postFrontmatterOrder.filter((key) => Object.prototype.hasOwnProperty.call(meta, key)),
    ...Object.keys(meta).filter((key) => !postFrontmatterOrder.includes(key))
  ];
  const frontmatter = keys
    .filter((key) => meta[key] !== undefined && meta[key] !== null)
    .map((key) => `${key}: ${frontmatterLineValue(meta[key])}`)
    .join("\n");
  return `---\n${frontmatter}\n---\n\n${body || ""}`;
}

function buildPostMarkdown(values, baseMeta = {}) {
  const categories = joinValues(values.categories);
  const subcategories = joinValues(values.subcategories);
  return buildMarkdownFromMeta({
    ...baseMeta,
    title: values.title,
    date: values.date,
    showDate: values.showDate === "false" ? "false" : "true",
    category: categories,
    categories,
    subcategory: subcategories,
    subcategories,
    tags: values.tags,
    cover: values.cover,
    summary: values.summary,
    featured: values.featured === "true" ? "true" : "false",
    status: values.status || "published"
  }, values.body || "");
}

function buildPageMarkdown(values) {
  return `---\ntitle: ${values.title}\ndate: ${values.date}\n---\n\n${values.body || ""}`;
}

function fillForm(form, values) {
  Object.entries(values).forEach(([key, value]) => {
    if (form.elements[key]) form.elements[key].value = value ?? "";
  });
}

function readForm(form) {
  return Object.fromEntries(new FormData(form).entries());
}

function optionList(values, selected = []) {
  const selectedSet = new Set(selected);
  return values.map((value) => `<option value="${escapeHtml(value)}" ${selectedSet.has(value) ? "selected" : ""}>${escapeHtml(value)}</option>`).join("");
}

function objectOptionList(options, selected = []) {
  const selectedSet = new Set(selected);
  return options.map((option) => `<option value="${escapeHtml(option.value)}" ${selectedSet.has(option.value) ? "selected" : ""}>${escapeHtml(option.label)}</option>`).join("");
}

function allCategories() {
  return (categoryConfig.items || []).map((item) => item.name).filter(Boolean);
}

function allSubcategories(selectedCategories = []) {
  const selected = new Set(selectedCategories);
  return (categoryConfig.items || [])
    .filter((item) => !selected.size || selected.has(item.name))
    .flatMap((item) => item.children || [])
    .filter(Boolean)
    .filter((item, index, list) => list.indexOf(item) === index);
}

function postCategories(meta = {}) {
  return splitValues(meta.categories || meta.category);
}

function postSubcategories(meta = {}) {
  return splitValues(meta.subcategories || meta.subcategory);
}

function publicContentPath(path) {
  return `/${path.replace(/^public\//, "")}`;
}

function postIndexEntry(post) {
  const categories = postCategories(post.meta);
  const subcategories = postSubcategories(post.meta);
  const fallbackSummary = (post.body || "").replace(/\s+/g, " ").slice(0, 160);
  return {
    path: publicContentPath(post.path),
    title: post.meta.title || post.path.split("/").pop(),
    date: post.meta.date || "",
    showDate: post.meta.showDate === "false" ? false : true,
    category: categories[0] || post.meta.category || "",
    categories,
    subcategory: subcategories[0] || post.meta.subcategory || "",
    subcategories,
    tags: splitValues(post.meta.tags),
    cover: post.meta.cover || "",
    summary: post.meta.summary || fallbackSummary,
    featured: post.meta.featured === "true" || post.meta.featured === true,
    status: post.meta.status || "published",
    format: post.meta.format || ""
  };
}

function renderCategorySelects(selectedCategories = [], selectedSubcategories = []) {
  const form = $("[data-post-form]");
  if (!form) return;
  form.elements.categories.innerHTML = optionList(allCategories(), selectedCategories);
  form.elements.subcategories.innerHTML = optionList(allSubcategories(selectedCategories), selectedSubcategories);
}

function wireCategorySelects() {
  const form = $("[data-post-form]");
  form.elements.categories.addEventListener("change", () => {
    const selectedCats = selectedValues(form.elements.categories);
    renderCategorySelects(selectedCats, selectedValues(form.elements.subcategories));
  });
}

function normalizeConfig(path, values) {
  if (path.endsWith("theme.json")) {
    return {
      accent: values.accent || "#2f7dff",
      darkMode: values.darkMode === "true",
      cardRadius: Number.parseInt(values.cardRadius || "14", 10),
      enableMotion: values.enableMotion === "true"
    };
  }
  if (path.endsWith("site.json")) {
    return {
      title: values.title || "My Blog",
      subtitle: values.subtitle || "",
      description: values.description || "",
      author: values.author || "",
      url: (values.url || "").replace(/\/+$/, ""),
      logo: values.logo || "/assets/logo.svg",
      heroImage: values.heroImage || "",
      copyright: values.copyright || ""
    };
  }
  return values;
}

function xmlEscape(value = "") {
  return String(value).replace(/[<>&'"]/g, (char) => ({
    "<": "&lt;",
    ">": "&gt;",
    "&": "&amp;",
    "'": "&apos;",
    '"': "&quot;"
  })[char]);
}

function siteBase(site) {
  return (site.url || location.origin).replace(/\/+$/, "");
}

function articleHref(path) {
  return `/article.html?file=${encodeURIComponent(`/${path.replace(/^public\//, "")}`)}`;
}

function absoluteUrl(site, path) {
  return `${siteBase(site)}${path}`;
}

function rssDate(date) {
  const value = date ? new Date(`${date}T00:00:00Z`) : new Date();
  return Number.isNaN(value.getTime()) ? new Date().toUTCString() : value.toUTCString();
}

function buildRobots(site) {
  return `User-agent: *\nAllow: /\n\nSitemap: ${absoluteUrl(site, "/sitemap.xml")}\n`;
}

function buildSitemap(site, postItems, pageItems) {
  const today = new Date().toISOString().slice(0, 10);
  const urls = [
    { loc: absoluteUrl(site, "/"), changefreq: "daily", priority: "1.0" },
    { loc: absoluteUrl(site, "/archive.html"), changefreq: "daily", priority: "0.8" },
    { loc: absoluteUrl(site, "/media.html"), changefreq: "weekly", priority: "0.6" },
    ...pageItems.map((page) => ({ loc: absoluteUrl(site, articleHref(page.path)), changefreq: "monthly", priority: "0.6", lastmod: page.meta.date })),
    ...postItems.map((post) => ({ loc: absoluteUrl(site, articleHref(post.path)), changefreq: "monthly", priority: "0.7", lastmod: post.meta.date }))
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((url) => `  <url>\n    <loc>${xmlEscape(url.loc)}</loc>\n    <lastmod>${xmlEscape(url.lastmod || today)}</lastmod>\n    <changefreq>${url.changefreq}</changefreq>\n    <priority>${url.priority}</priority>\n  </url>`).join("\n")}\n</urlset>\n`;
}

function buildFeed(site, postItems) {
  const items = [...postItems].sort((a, b) => (b.meta.date || "").localeCompare(a.meta.date || ""));
  return `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0">\n  <channel>\n    <title>${xmlEscape(site.title || "My Blog")}</title>\n    <link>${xmlEscape(siteBase(site) + "/")}</link>\n    <description>${xmlEscape(site.description || "")}</description>\n    <language>zh-CN</language>\n    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>\n${items.map((post) => {
    const url = absoluteUrl(site, articleHref(post.path));
    return `    <item>\n      <title>${xmlEscape(post.meta.title || post.path)}</title>\n      <link>${xmlEscape(url)}</link>\n      <guid>${xmlEscape(url)}</guid>\n      <pubDate>${rssDate(post.meta.date)}</pubDate>\n      <description>${xmlEscape(post.meta.summary || post.body.replace(/\s+/g, " ").slice(0, 160))}</description>\n    </item>`;
  }).join("\n")}\n  </channel>\n</rss>\n`;
}

async function loadSiteConfig() {
  const file = await api(`/file?path=${encodeURIComponent("public/config/site.json")}`);
  return JSON.parse(file.content);
}

async function writeGeneratedFile(path, content) {
  await api("/file", {
    method: "PUT",
    body: JSON.stringify({ path, content, message: `Update ${path}` })
  });
}

async function syncGeneratedSiteFiles(siteOverride) {
  const site = siteOverride || await loadSiteConfig();
  const publishedPosts = posts.filter((post) => normalizePostStatus(post.meta) !== "draft");
  await writeGeneratedFile("public/robots.txt", buildRobots(site));
  await writeGeneratedFile("public/sitemap.xml", buildSitemap(site, publishedPosts, pages));
  await writeGeneratedFile("public/feed.xml", buildFeed(site, publishedPosts));
}

function renderDashboard() {
  const tags = new Set(posts.flatMap((post) => (post.meta.tags || "").split(",").map((tag) => tag.trim()).filter(Boolean)));
  $("[data-dashboard-posts]").textContent = posts.length;
  $("[data-dashboard-pages]").textContent = pages.length;
  $("[data-dashboard-media]").textContent = mediaItems.length;
  $("[data-dashboard-tags]").textContent = tags.size;
}

function renderMarkdownList(items, selector, activePath, selectItem) {
  const list = $(selector);
  list.innerHTML = items.map((item) => `
    <button class="post-item ${activePath === item.path ? "active" : ""}" data-path="${item.path}">
      ${item.meta.title || item.path}
      <small>${item.meta.date || ""} / ${postCategories(item.meta).join("、") || "页面"}</small>
    </button>
  `).join("");

  list.querySelectorAll("[data-path]").forEach((button) => {
    button.addEventListener("click", () => selectItem(button.dataset.path));
  });
}

function normalizePostStatus(meta = {}) {
  return meta.status === "draft" ? "draft" : "published";
}

function statusText(status) {
  return status === "draft" ? "草稿" : "公开";
}

function postCharacterCount(post) {
  return String(post.body || "").replace(/\s/g, "").length;
}

function postSearchText(post) {
  return [
    post.meta.title,
    post.meta.summary,
    post.meta.tags,
    post.path,
    ...postCategories(post.meta),
    ...postSubcategories(post.meta)
  ].join(" ").toLowerCase();
}

function articlePublicHref(path) {
  return `/article.html?file=${encodeURIComponent(`/${path.replace(/^public\//, "")}`)}`;
}

function openPostEditor(title = "编辑文章") {
  $("[data-post-form]").hidden = false;
  $("[data-post-editor-backdrop]").hidden = false;
  $("[data-post-editor-title]").textContent = title;
}

function closePostEditor() {
  $("[data-post-form]").hidden = true;
  $("[data-post-editor-backdrop]").hidden = true;
}

function renderPostFilterOptions() {
  const categorySelect = $("[data-post-category-filter]");
  const subcategorySelect = $("[data-post-subcategory-filter]");
  const selectedCategory = postManager.category;
  categorySelect.innerHTML = `<option value="all">全部大类</option>${optionList(allCategories(), selectedCategory === "all" ? [] : [selectedCategory])}`;
  categorySelect.value = allCategories().includes(selectedCategory) ? selectedCategory : "all";
  postManager.category = categorySelect.value;

  const subcategories = postManager.category === "all" ? allSubcategories() : allSubcategories([postManager.category]);
  subcategorySelect.innerHTML = `<option value="all">全部子类</option>${optionList(subcategories, postManager.subcategory === "all" ? [] : [postManager.subcategory])}`;
  subcategorySelect.value = subcategories.includes(postManager.subcategory) ? postManager.subcategory : "all";
  postManager.subcategory = subcategorySelect.value;
}

function filteredPosts() {
  const query = postManager.search.trim().toLowerCase();
  const filtered = posts.filter((post) => {
    const status = normalizePostStatus(post.meta);
    if (postManager.status !== "all" && status !== postManager.status) return false;
    if (postManager.category !== "all" && !postCategories(post.meta).includes(postManager.category)) return false;
    if (postManager.subcategory !== "all" && !postSubcategories(post.meta).includes(postManager.subcategory)) return false;
    return !query || postSearchText(post).includes(query);
  });
  return filtered.sort((a, b) => {
    if (postManager.sort === "date-asc") return (a.meta.date || "").localeCompare(b.meta.date || "");
    if (postManager.sort === "title-asc") return (a.meta.title || "").localeCompare(b.meta.title || "");
    if (postManager.sort === "status") return normalizePostStatus(a.meta).localeCompare(normalizePostStatus(b.meta)) || (b.meta.date || "").localeCompare(a.meta.date || "");
    return (b.meta.date || "").localeCompare(a.meta.date || "");
  });
}

function currentPagePosts(result = filteredPosts()) {
  const totalPages = Math.max(1, Math.ceil(result.length / postManager.pageSize));
  postManager.page = Math.min(Math.max(postManager.page, 1), totalPages);
  const start = (postManager.page - 1) * postManager.pageSize;
  return result.slice(start, start + postManager.pageSize);
}

function updateSelectionControls(pageItems, result) {
  const count = selectedPostPaths.size;
  const countEl = $("[data-selected-post-count]");
  if (countEl) countEl.textContent = `已选 ${count} 篇`;

  const pageToggle = $("[data-select-page-posts]");
  if (pageToggle) {
    const pagePaths = pageItems.map((post) => post.path);
    const selectedOnPage = pagePaths.filter((path) => selectedPostPaths.has(path)).length;
    pageToggle.checked = pagePaths.length > 0 && selectedOnPage === pagePaths.length;
    pageToggle.indeterminate = selectedOnPage > 0 && selectedOnPage < pagePaths.length;
  }

  const applyButton = $("[data-apply-post-status]");
  if (applyButton) applyButton.disabled = count === 0;
  const clearButton = $("[data-clear-post-selection]");
  if (clearButton) clearButton.disabled = count === 0;
  const filteredButton = $("[data-select-filtered-posts]");
  if (filteredButton) filteredButton.disabled = result.length === 0;
}

function renderPostManager() {
  const table = $("[data-post-table]");
  if (!table) return;
  renderPostFilterOptions();
  const result = filteredPosts();
  const totalPages = Math.max(1, Math.ceil(result.length / postManager.pageSize));
  postManager.page = Math.min(Math.max(postManager.page, 1), totalPages);
  const pageItems = currentPagePosts(result);
  const draftCount = posts.filter((post) => normalizePostStatus(post.meta) === "draft").length;

  $("[data-post-total]").textContent = posts.length;
  $("[data-post-published]").textContent = posts.length - draftCount;
  $("[data-post-drafts]").textContent = draftCount;
  $("[data-post-filtered]").textContent = result.length;
  $("[data-post-empty]").hidden = result.length !== 0;
  $("[data-post-page-info]").textContent = `第 ${postManager.page} / ${totalPages} 页 · ${result.length} 篇`;
  $("[data-post-prev]").disabled = postManager.page <= 1;
  $("[data-post-next]").disabled = postManager.page >= totalPages;

  table.innerHTML = pageItems.map((post) => {
    const status = normalizePostStatus(post.meta);
    const categories = postCategories(post.meta);
    const subcategories = postSubcategories(post.meta);
    const categoryHtml = [...categories, ...subcategories].slice(0, 5)
      .map((item) => `<span class="mini-pill">${escapeHtml(item)}</span>`)
      .join("");
    return `
      <tr class="${activePost?.path === post.path ? "active" : ""}">
        <td class="select-col">
          <input type="checkbox" data-select-post="${escapeHtml(post.path)}" ${selectedPostPaths.has(post.path) ? "checked" : ""} aria-label="选择文章">
        </td>
        <td>
          <div class="title-cell">
            <strong>${escapeHtml(post.meta.title || post.path)}</strong>
            <small>${escapeHtml(post.path)}</small>
          </div>
        </td>
        <td><span class="status-pill ${status}">${statusText(status)}</span></td>
        <td><div class="pill-list">${categoryHtml || `<span class="muted-cell">未分类</span>`}</div></td>
        <td class="muted-cell">${escapeHtml(post.meta.date || "")}</td>
        <td class="muted-cell">${postCharacterCount(post)}</td>
        <td>
          <div class="row-actions">
            <button type="button" class="ghost-button" data-edit-post="${escapeHtml(post.path)}">编辑</button>
            <a class="ghost-link" href="${articlePublicHref(post.path)}" target="_blank" rel="noreferrer">预览</a>
          </div>
        </td>
      </tr>
    `;
  }).join("");

  $$("[data-edit-post]").forEach((button) => {
    button.addEventListener("click", () => selectPost(button.dataset.editPost));
  });
  $$("[data-select-post]").forEach((checkbox) => {
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) selectedPostPaths.add(checkbox.dataset.selectPost);
      else selectedPostPaths.delete(checkbox.dataset.selectPost);
      updateSelectionControls(pageItems, result);
    });
  });
  updateSelectionControls(pageItems, result);
}

function selectPost(path) {
  activePost = posts.find((post) => post.path === path);
  if (!activePost) return;
  const categories = splitValues(activePost.meta.categories || activePost.meta.category);
  const subcategories = splitValues(activePost.meta.subcategories || activePost.meta.subcategory);
  renderCategorySelects(categories, subcategories);
  fillForm($("[data-post-form]"), {
    path: activePost.path,
    title: activePost.meta.title,
    date: activePost.meta.date,
    showDate: activePost.meta.showDate === "false" ? "false" : "true",
    tags: activePost.meta.tags,
    cover: activePost.meta.cover,
    summary: activePost.meta.summary,
    featured: activePost.meta.featured === "true" ? "true" : "false",
    status: activePost.meta.status || "published",
    body: activePost.body.trim()
  });
  $("[data-post-editor-path]").textContent = activePost.path;
  $("[data-preview-post]").href = articlePublicHref(activePost.path);
  $("[data-preview-post]").hidden = false;
  openPostEditor("编辑文章");
  renderPostManager();
}

function selectPage(path) {
  activePage = pages.find((page) => page.path === path);
  if (!activePage) return;
  fillForm($("[data-page-form]"), {
    path: activePage.path,
    title: activePage.meta.title,
    date: activePage.meta.date,
    body: activePage.body.trim()
  });
  renderMarkdownList(pages, "[data-page-list]", activePage.path, selectPage);
}

async function loadMarkdownDirectory(prefix) {
  const files = await api(`/files?prefix=${encodeURIComponent(prefix)}`);
  const items = await Promise.all(files.items
    .filter((item) => item.path.endsWith(".md"))
    .map(async (item) => {
      const file = await api(`/file?path=${encodeURIComponent(item.path)}`);
      return parseFrontMatter(file.content, item.path);
    }));
  return items.sort((a, b) => (b.meta.date || "").localeCompare(a.meta.date || ""));
}

async function loadPosts() {
  setStatus("正在读取文章...");
  posts = await loadMarkdownDirectory("public/content/posts");
  selectedPostPaths = new Set([...selectedPostPaths].filter((path) => posts.some((post) => post.path === path)));
  if (activePost) activePost = posts.find((post) => post.path === activePost.path) || null;
  renderPostManager();
  setStatus("文章已读取");
}

async function loadPages() {
  setStatus("正在读取页面...");
  pages = await loadMarkdownDirectory("public/content/pages");
  renderMarkdownList(pages, "[data-page-list]", activePage?.path, selectPage);
  if (pages[0]) selectPage(pages[0].path);
  setStatus("页面已读取");
}

async function syncIndex(items, extraPath, indexPath, extraContent = "") {
  const nextItems = [...items];
  if (extraPath) {
    const extraItem = extraContent ? parseFrontMatter(extraContent, extraPath) : { path: extraPath, meta: {}, body: "" };
    const existing = nextItems.findIndex((item) => item.path === extraPath);
    if (existing === -1) nextItems.push(extraItem);
    else nextItems[existing] = extraItem;
  }
  const paths = [...new Set(nextItems.map((item) => publicContentPath(item.path)))].sort();
  const content = indexPath.includes("/posts/")
    ? JSON.stringify(nextItems.map(postIndexEntry).sort((a, b) => (b.date || "").localeCompare(a.date || "")), null, 2)
    : JSON.stringify(paths, null, 2);
  await api("/file", {
    method: "PUT",
    body: JSON.stringify({
      path: indexPath,
      content: `${content}\n`,
      message: `Update ${indexPath}`
    })
  });
}

async function loadConfig(form) {
  const path = form.dataset.configForm;
  const file = await api(`/file?path=${encodeURIComponent(path)}`);
  fillForm(form, JSON.parse(file.content));
}

function normalizeSidebarLinks(config = {}) {
  const legacy = [
    config.github ? { label: "GitHub", type: "link", url: config.github, enabled: true, html: "" } : null,
    config.email ? { label: "邮箱", type: "email", url: config.email, enabled: true, html: "" } : null
  ].filter(Boolean);
  const links = Array.isArray(config.links) ? config.links : legacy;
  return links.map((item) => ({
    label: item.label || "",
    type: item.type || "link",
    url: item.url || item.href || "",
    enabled: item.enabled !== false,
    html: item.html || ""
  }));
}

async function loadSidebar() {
  const file = await api(`/file?path=${encodeURIComponent("public/config/sidebar.json")}`);
  sidebarConfig = JSON.parse(file.content);
  sidebarConfig.links = normalizeSidebarLinks(sidebarConfig);
  const form = $("[data-sidebar-form]");
  fillForm(form, {
    avatar: sidebarConfig.avatar || "",
    name: sidebarConfig.name || "",
    bio: sidebarConfig.bio || "",
    notice: sidebarConfig.notice || "",
    customHtml: sidebarConfig.customHtml || ""
  });
  renderSidebarEditor();
}

function renderSidebarEditor() {
  const typeOptions = [
    { value: "link", label: "普通链接" },
    { value: "email", label: "邮箱" },
    { value: "tel", label: "电话" },
    { value: "wechat", label: "微信/QQ" },
    { value: "html", label: "自定义 HTML" }
  ];
  $("[data-sidebar-links]").innerHTML = normalizeSidebarLinks(sidebarConfig).map((item, index) => `
    <div class="structured-row sidebar-link-row" data-sidebar-link-row="${index}">
      <label>启用
        <select data-sidebar-link-enabled>
          <option value="true" ${item.enabled ? "selected" : ""}>显示</option>
          <option value="false" ${!item.enabled ? "selected" : ""}>隐藏</option>
        </select>
      </label>
      <label>名称<input data-sidebar-link-label value="${escapeHtml(item.label)}" placeholder="例如：商务合作"></label>
      <label>类型<select data-sidebar-link-type>${objectOptionList(typeOptions, [item.type])}</select></label>
      <label>链接或账号<input data-sidebar-link-url value="${escapeHtml(item.url)}" placeholder="https:// 或 邮箱/电话/微信号"></label>
      <label>自定义 HTML<textarea data-sidebar-link-html rows="4">${escapeHtml(item.html)}</textarea></label>
      <button type="button" data-remove-sidebar-link="${index}">删除</button>
    </div>
  `).join("");
  $$("[data-remove-sidebar-link]").forEach((button) => {
    button.addEventListener("click", () => {
      sidebarConfig.links.splice(Number(button.dataset.removeSidebarLink), 1);
      renderSidebarEditor();
    });
  });
}

function collectSidebarConfig() {
  const form = $("[data-sidebar-form]");
  const values = readForm(form);
  return {
    avatar: values.avatar || "",
    name: values.name || "",
    bio: values.bio || "",
    notice: values.notice || "",
    customHtml: values.customHtml || "",
    links: $$("[data-sidebar-link-row]").map((row) => ({
      enabled: row.querySelector("[data-sidebar-link-enabled]").value === "true",
      label: row.querySelector("[data-sidebar-link-label]").value.trim(),
      type: row.querySelector("[data-sidebar-link-type]").value,
      url: row.querySelector("[data-sidebar-link-url]").value.trim(),
      html: row.querySelector("[data-sidebar-link-html]").value.trim()
    })).filter((item) => item.label || item.html)
  };
}

async function loadFooter() {
  let config = { text: "", links: [], html: "" };
  try {
    const file = await api(`/file?path=${encodeURIComponent("public/config/footer.json")}`);
    config = JSON.parse(file.content);
  } catch {
    config = { text: "", links: [], html: "" };
  }
  footerConfig = {
    text: config.text || "",
    links: Array.isArray(config.links) ? config.links : [],
    html: config.html || ""
  };
  fillForm($("[data-footer-form]"), footerConfig);
  renderFooterEditor();
}

function renderFooterEditor() {
  $("[data-footer-links]").innerHTML = (footerConfig.links || []).map((item, index) => `
    <div class="structured-row footer-link-row" data-footer-link-row="${index}">
      <label>启用
        <select data-footer-link-enabled>
          <option value="true" ${item.enabled !== false ? "selected" : ""}>显示</option>
          <option value="false" ${item.enabled === false ? "selected" : ""}>隐藏</option>
        </select>
      </label>
      <label>名称<input data-footer-link-label value="${escapeHtml(item.label || "")}" placeholder="例如：隐私政策"></label>
      <label>链接<input data-footer-link-href value="${escapeHtml(item.href || "")}" placeholder="/article.html?file=..."></label>
      <button type="button" data-remove-footer-link="${index}">删除</button>
    </div>
  `).join("");
  $$("[data-remove-footer-link]").forEach((button) => {
    button.addEventListener("click", () => {
      footerConfig.links.splice(Number(button.dataset.removeFooterLink), 1);
      renderFooterEditor();
    });
  });
}

function collectFooterConfig() {
  const values = readForm($("[data-footer-form]"));
  return {
    text: values.text || "",
    html: values.html || "",
    links: $$("[data-footer-link-row]").map((row) => ({
      enabled: row.querySelector("[data-footer-link-enabled]").value === "true",
      label: row.querySelector("[data-footer-link-label]").value.trim(),
      href: row.querySelector("[data-footer-link-href]").value.trim()
    })).filter((item) => item.label && item.href)
  };
}

async function loadAdminSettings() {
  adminSettings = await api("/admin-settings");
  fillForm($("[data-admin-form]"), {
    displayName: adminSettings.displayName || "",
    note: adminSettings.note || "",
    currentPassword: "",
    newPassword: "",
    confirmPassword: ""
  });
}

async function loadMenu() {
  const file = await api(`/file?path=${encodeURIComponent("public/config/menu.json")}`);
  menuItems = JSON.parse(file.content);
  renderMenuEditor();
}

function renderMenuEditor() {
  $("[data-menu-items]").innerHTML = menuItems.map((item, index) => `
    <div class="structured-row" data-menu-row="${index}">
      <label>名称<input data-menu-label value="${escapeHtml(item.label)}"></label>
      <label>链接<input data-menu-href value="${escapeHtml(item.href)}"></label>
      <button type="button" data-remove-menu="${index}">删除</button>
    </div>
  `).join("");
  $$("[data-remove-menu]").forEach((button) => {
    button.addEventListener("click", () => {
      menuItems.splice(Number(button.dataset.removeMenu), 1);
      renderMenuEditor();
    });
  });
}

function collectMenuItems() {
  return $$("[data-menu-row]").map((row) => ({
    label: row.querySelector("[data-menu-label]").value.trim(),
    href: row.querySelector("[data-menu-href]").value.trim() || "/"
  })).filter((item) => item.label);
}

async function loadCategories() {
  const file = await api(`/file?path=${encodeURIComponent("public/config/categories.json")}`);
  categoryConfig = JSON.parse(file.content);
  renderCategoryEditor();
  renderCategorySelects(
    activePost ? splitValues(activePost.meta.categories || activePost.meta.category) : [],
    activePost ? splitValues(activePost.meta.subcategories || activePost.meta.subcategory) : []
  );
}

function renderCategoryEditor() {
  $("[data-category-items]").innerHTML = (categoryConfig.items || []).map((item, index) => `
    <div class="structured-row category-row" data-category-row="${index}">
      <label>大类<input data-category-name value="${escapeHtml(item.name)}"></label>
      <label>子类<textarea data-category-children rows="3">${escapeHtml((item.children || []).join("\n"))}</textarea></label>
      <button type="button" data-remove-category="${index}">删除</button>
    </div>
  `).join("");
  $$("[data-remove-category]").forEach((button) => {
    button.addEventListener("click", () => {
      categoryConfig.items.splice(Number(button.dataset.removeCategory), 1);
      renderCategoryEditor();
      renderCategorySelects();
    });
  });
}

function collectCategories() {
  return {
    items: $$("[data-category-row]").map((row) => ({
      name: row.querySelector("[data-category-name]").value.trim(),
      children: splitValues(row.querySelector("[data-category-children]").value.replace(/\n/g, ","))
    })).filter((item) => item.name)
  };
}

async function loadMedia() {
  const file = await api(`/file?path=${encodeURIComponent("public/content/media.json")}`);
  mediaItems = JSON.parse(file.content);
  renderMediaEditor();
}

function renderMediaEditor() {
  $("[data-media-items]").innerHTML = mediaItems.map((item, index) => `
    <div class="structured-row" data-media-row="${index}">
      <label>名称<input data-media-name value="${escapeHtml(item.name)}"></label>
      <label>链接<input data-media-url value="${escapeHtml(item.url)}"></label>
      <label>类型
        <select data-media-type>
          <option value="image" ${item.type === "image" ? "selected" : ""}>图片</option>
          <option value="file" ${item.type === "file" ? "selected" : ""}>文件</option>
          <option value="video" ${item.type === "video" ? "selected" : ""}>视频</option>
        </select>
      </label>
      <label>备注<input data-media-note value="${escapeHtml(item.note)}"></label>
      <button type="button" data-remove-media="${index}">删除</button>
    </div>
  `).join("");
  $$("[data-remove-media]").forEach((button) => {
    button.addEventListener("click", () => {
      mediaItems.splice(Number(button.dataset.removeMedia), 1);
      renderMediaEditor();
    });
  });
}

function collectMediaItems() {
  return $$("[data-media-row]").map((row) => ({
    name: row.querySelector("[data-media-name]").value.trim(),
    url: row.querySelector("[data-media-url]").value.trim(),
    type: row.querySelector("[data-media-type]").value,
    note: row.querySelector("[data-media-note]").value.trim()
  })).filter((item) => item.name && item.url);
}

function listValue(value) {
  const items = Array.isArray(value) ? value : String(value || "").split(",");
  return items.map((item) => String(item).trim()).filter(Boolean);
}

function formatAdItem(item) {
  return [
    item.enabled ? "是" : "否",
    item.slot || "global-top",
    listValue(item.pages).join(",") || "all",
    listValue(item.categories).join(",") || "all",
    listValue(item.subcategories).join(",") || "all",
    listValue(item.paths).join(","),
    item.title || "",
    item.url || "",
    item.image || "",
    item.html || item.text || ""
  ].join("|");
}

function parseAdItems(value) {
  return {
    placements: value.split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line, index) => {
        const [enabled, slot, pages, categories, subcategories, paths, title, url, image, ...contentParts] = line.split("|");
        const content = contentParts.join("|").trim();
        const isHtml = /<\/?[a-z][\s\S]*>/i.test(content);
        return {
          id: `${(slot || "ad").trim()}-${index + 1}`,
          enabled: ["是", "true", "1", "on", "yes"].includes((enabled || "").trim().toLowerCase()),
          slot: (slot || "global-top").trim(),
          pages: listValue(pages || "all"),
          categories: listValue(categories || "all"),
          subcategories: listValue(subcategories || "all"),
          paths: listValue(paths || ""),
          title: (title || "").trim(),
          text: isHtml ? "" : content,
          url: (url || "").trim(),
          image: (image || "").trim(),
          html: isHtml ? content : ""
        };
      })
  };
}

async function loadAds() {
  const file = await api(`/file?path=${encodeURIComponent("public/config/ads.json")}`);
  const parsed = JSON.parse(file.content || "{}");
  adConfig = {
    placements: Array.isArray(parsed.placements) ? parsed.placements : []
  };
  renderAdEditor();
}

function renderAdEditor() {
  const categoryOptions = [{ value: "all", label: "全部大类" }, ...allCategories().map((name) => ({ value: name, label: name }))];
  const subcategoryOptions = [{ value: "all", label: "全部子类" }, ...allSubcategories().map((name) => ({ value: name, label: name }))];
  const placements = adConfig.placements || [];
  if (!placements.length) {
    $("[data-ad-items]").innerHTML = `<p class="hint">还没有广告。点击“新增广告”后，会在这里出现可编辑的广告位。</p>`;
    return;
  }
  $("[data-ad-items]").innerHTML = placements.map((item, index) => `
    <div class="structured-row ad-row" data-ad-row="${index}">
      <label>启用
        <select data-ad-enabled>
          <option value="true" ${item.enabled ? "selected" : ""}>打开</option>
          <option value="false" ${!item.enabled ? "selected" : ""}>关闭</option>
        </select>
      </label>
      <label>广告位置
        <select data-ad-slot>${objectOptionList(adSlots, [item.slot || "global-top"])}</select>
      </label>
      <label>展示页面
        <select data-ad-pages multiple size="6">${objectOptionList(pageOptions, listValue(item.pages).length ? listValue(item.pages) : ["all"])}</select>
      </label>
      <label>指定大类
        <select data-ad-categories multiple size="6">${objectOptionList(categoryOptions, listValue(item.categories).length ? listValue(item.categories) : ["all"])}</select>
      </label>
      <label>指定子类
        <select data-ad-subcategories multiple size="6">${objectOptionList(subcategoryOptions, listValue(item.subcategories).length ? listValue(item.subcategories) : ["all"])}</select>
      </label>
      <label>指定路径<input data-ad-paths value="${escapeHtml(listValue(item.paths).join(","))}" placeholder="/content/posts/example.md"></label>
      <label>标题<input data-ad-title value="${escapeHtml(item.title)}"></label>
      <label>链接<input data-ad-url value="${escapeHtml(item.url)}"></label>
      <label>图片<input data-ad-image value="${escapeHtml(item.image)}"></label>
      <label>文字<input data-ad-text value="${escapeHtml(item.text)}"></label>
      <label>HTML<textarea data-ad-html rows="4">${escapeHtml(item.html)}</textarea></label>
      <button type="button" data-remove-ad="${index}">删除</button>
    </div>
  `).join("");
  $$("[data-remove-ad]").forEach((button) => {
    button.addEventListener("click", () => {
      adConfig.placements.splice(Number(button.dataset.removeAd), 1);
      renderAdEditor();
    });
  });
}

function collectAdItems() {
  return {
    placements: $$("[data-ad-row]").map((row, index) => {
      const slot = row.querySelector("[data-ad-slot]").value;
      return {
        id: `${slot}-${index + 1}`,
        enabled: row.querySelector("[data-ad-enabled]").value === "true",
        slot,
        pages: selectedValues(row.querySelector("[data-ad-pages]")),
        categories: selectedValues(row.querySelector("[data-ad-categories]")),
        subcategories: selectedValues(row.querySelector("[data-ad-subcategories]")),
        paths: splitValues(row.querySelector("[data-ad-paths]").value),
        title: row.querySelector("[data-ad-title]").value.trim(),
        text: row.querySelector("[data-ad-text]").value.trim(),
        url: row.querySelector("[data-ad-url]").value.trim(),
        image: row.querySelector("[data-ad-image]").value.trim(),
        html: row.querySelector("[data-ad-html]").value.trim()
      };
    })
  };
}

function createAdPlacement(slot = "global-top") {
  return {
    id: `ad-${Date.now()}`,
    enabled: true,
    slot,
    pages: ["all"],
    categories: ["all"],
    subcategories: ["all"],
    paths: [],
    title: "新广告",
    text: "这里填写广告文案，保存后前台对应位置会显示。",
    url: "",
    image: "",
    html: ""
  };
}

function focusFirstAdRow() {
  const row = $("[data-ad-row='0']");
  if (!row) return;
  row.scrollIntoView({ behavior: "smooth", block: "start" });
  row.querySelector("[data-ad-title]")?.focus();
}

function normalizeAnalytics(values) {
  return {
    local: {
      enabled: values.localEnabled !== "false"
    },
    cloudflare: {
      enabled: values.cloudflareEnabled === "true",
      token: values.cloudflareToken || "",
      dashboardUrl: values.dashboardUrl || ""
    }
  };
}

async function loadAnalyticsConfig() {
  const form = $("[data-analytics-form]");
  const file = await api(`/file?path=${encodeURIComponent("public/config/analytics.json")}`);
  const config = JSON.parse(file.content);
  fillForm(form, {
    localEnabled: config.local?.enabled === false ? "false" : "true",
    cloudflareEnabled: config.cloudflare?.enabled ? "true" : "false",
    cloudflareToken: config.cloudflare?.token || "",
    dashboardUrl: config.cloudflare?.dashboardUrl || ""
  });
}

function renderCountList(selector, items, emptyText = "暂无数据") {
  const list = $(selector);
  if (!items?.length) {
    list.innerHTML = `<p class="hint">${emptyText}</p>`;
    return;
  }
  list.innerHTML = items.map((item) => `
    <div class="stats-row">
      <span title="${item.name || item.day}">${item.name || item.day}</span>
      <strong>${item.count}</strong>
    </div>
  `).join("");
}

async function loadStats() {
  const stats = await api("/stats");
  $("[data-dashboard-visits]").textContent = stats.total || 0;
  $("[data-stats-total]").textContent = stats.total || 0;
  $("[data-stats-today]").textContent = stats.today || 0;
  $("[data-stats-last7]").textContent = stats.last7 || 0;
  renderCountList("[data-stats-days]", stats.days, "还没有访问记录");
  renderCountList("[data-stats-paths]", stats.topPaths, "还没有热门页面");
  renderCountList("[data-stats-categories]", stats.topCategories, "还没有热门类目");
}

async function loadStorageStatus() {
  const status = await api("/storage");
  $("[data-dashboard-storage]").textContent = status.r2 ? "R2" : "GitHub";
}

async function loadAllAdminData() {
  await Promise.all([
    loadCategories(),
    ...$$("[data-config-form]").map(loadConfig),
    loadSidebar(),
    loadFooter(),
    loadAdminSettings(),
    loadMenu(),
    loadMedia(),
    loadAnalyticsConfig(),
    loadStorageStatus()
  ]);
  await Promise.all([
    loadPosts(),
    loadPages(),
    loadAds(),
    loadStats(),
  ]);
  renderDashboard();
}

function setupLogin() {
  $("[data-login-form]").addEventListener("submit", async (event) => {
    event.preventDefault();
    const errorBox = $("[data-login-error]");
    errorBox.hidden = true;
    try {
      const password = new FormData(event.currentTarget).get("password");
      await api("/login", { method: "POST", body: JSON.stringify({ password }) });
      $("[data-login-panel]").hidden = true;
      $("[data-dashboard]").hidden = false;
      await loadAllAdminData();
    } catch (error) {
      errorBox.textContent = error.message;
      errorBox.hidden = false;
    }
  });
}

function setupTabs() {
  $$("[data-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      const tab = button.dataset.tab;
      $$("[data-tab]").forEach((item) => item.classList.toggle("active", item === button));
      $$("[data-panel]").forEach((panel) => panel.hidden = panel.dataset.panel !== tab);
      $("[data-panel-title]").textContent = button.textContent;
      $("[data-new-post]").hidden = tab !== "posts";
      $("[data-new-page]").hidden = tab !== "pages";
      if (tab === "dashboard") {
        renderDashboard();
        loadStats().catch((error) => setStatus(error.message));
      }
      if (tab === "stats") loadStats().catch((error) => setStatus(error.message));
    });
  });
}

function setupPostEditor() {
  $("[data-new-post]").addEventListener("click", () => {
    activePost = null;
    renderCategorySelects([], []);
    fillForm($("[data-post-form]"), {
      path: "",
      title: "",
      date: new Date().toISOString().slice(0, 10),
      showDate: "true",
      tags: "",
      cover: "",
      summary: "",
      featured: "false",
      status: "published",
      body: ""
    });
    $("[data-post-editor-path]").textContent = "新文章";
    $("[data-preview-post]").removeAttribute("href");
    $("[data-preview-post]").hidden = true;
    openPostEditor("新建文章");
    renderPostManager();
  });

  $("[data-post-form]").addEventListener("submit", async (event) => {
    event.preventDefault();
    const values = {
      ...readForm(event.currentTarget),
      categories: selectedValues(event.currentTarget.elements.categories),
      subcategories: selectedValues(event.currentTarget.elements.subcategories)
    };
    const path = values.path || `public/content/posts/${slugify(values.title, "post")}.md`;
    const content = buildPostMarkdown(values, activePost?.meta || {});
    await api("/file", {
      method: "PUT",
      body: JSON.stringify({ path, content, message: `Update ${path}` })
    });
    await syncIndex(posts, path, "public/content/posts/index.json", content);
    await loadPosts();
    await syncGeneratedSiteFiles();
    setStatus("文章、索引、RSS 和站点地图已保存。R2 模式下前台会直接读取最新内容。");
    selectPost(path);
  });

  $("[data-delete-post]").addEventListener("click", async () => {
    if (!activePost) return;
    if (!confirm(`确认删除 ${activePost.meta.title || activePost.path}？`)) return;
    const deletedPath = activePost.path;
    await api("/file", {
      method: "DELETE",
      body: JSON.stringify({ path: deletedPath, message: `Delete ${deletedPath}` })
    });
    posts = posts.filter((post) => post.path !== deletedPath);
    await syncIndex(posts, null, "public/content/posts/index.json");
    activePost = null;
    closePostEditor();
    await loadPosts();
    await syncGeneratedSiteFiles();
    setStatus("文章已删除，RSS 和站点地图已更新。");
  });
}

async function writePostWithStatus(post, status) {
  const content = buildMarkdownFromMeta({ ...post.meta, status }, post.body);
  await api("/file", {
    method: "PUT",
    body: JSON.stringify({ path: post.path, content, message: `Set ${post.path} ${status}` })
  });
  post.meta.status = status;
}

async function applyBulkPostStatus() {
  const status = $("[data-bulk-status]").value;
  const targets = posts.filter((post) => selectedPostPaths.has(post.path));
  if (!targets.length) {
    setStatus("请先选择要操作的文章。");
    return;
  }
  if (!confirm(`确认将 ${targets.length} 篇文章设为${status === "published" ? "公开发布" : "草稿"}？`)) return;

  for (let index = 0; index < targets.length; index += 1) {
    const post = targets[index];
    setStatus(`正在更新文章状态：${index + 1} / ${targets.length}`);
    await writePostWithStatus(post, status);
  }

  await syncIndex(posts, null, "public/content/posts/index.json");
  await syncGeneratedSiteFiles();
  selectedPostPaths.clear();
  await loadPosts();
  renderDashboard();
  setStatus(`已将 ${targets.length} 篇文章设为${status === "published" ? "公开发布" : "草稿"}，索引、RSS 和站点地图已更新。`);
}

function setupPostManager() {
  const search = $("[data-post-search]");
  const status = $("[data-post-status-filter]");
  const category = $("[data-post-category-filter]");
  const subcategory = $("[data-post-subcategory-filter]");
  const sort = $("[data-post-sort]");
  const update = () => {
    postManager.search = search.value;
    postManager.status = status.value;
    postManager.category = category.value;
    postManager.subcategory = subcategory.value;
    postManager.sort = sort.value;
    postManager.page = 1;
    renderPostManager();
  };
  search.addEventListener("input", update);
  status.addEventListener("change", update);
  category.addEventListener("change", () => {
    postManager.category = category.value;
    postManager.subcategory = "all";
    postManager.page = 1;
    renderPostManager();
  });
  subcategory.addEventListener("change", update);
  sort.addEventListener("change", update);
  $("[data-select-page-posts]").addEventListener("change", (event) => {
    const result = filteredPosts();
    currentPagePosts(result).forEach((post) => {
      if (event.currentTarget.checked) selectedPostPaths.add(post.path);
      else selectedPostPaths.delete(post.path);
    });
    renderPostManager();
  });
  $("[data-select-filtered-posts]").addEventListener("click", () => {
    filteredPosts().forEach((post) => selectedPostPaths.add(post.path));
    renderPostManager();
  });
  $("[data-select-all-posts]").addEventListener("click", () => {
    posts.forEach((post) => selectedPostPaths.add(post.path));
    renderPostManager();
  });
  $("[data-clear-post-selection]").addEventListener("click", () => {
    selectedPostPaths.clear();
    renderPostManager();
  });
  $("[data-apply-post-status]").addEventListener("click", () => {
    applyBulkPostStatus().catch((error) => setStatus(error.message));
  });
  $("[data-post-prev]").addEventListener("click", () => {
    postManager.page -= 1;
    renderPostManager();
  });
  $("[data-post-next]").addEventListener("click", () => {
    postManager.page += 1;
    renderPostManager();
  });
  $("[data-close-post-editor]").addEventListener("click", closePostEditor);
  $("[data-post-editor-backdrop]").addEventListener("click", closePostEditor);
}

function setupPageEditor() {
  $("[data-new-page]").addEventListener("click", () => {
    activePage = null;
    fillForm($("[data-page-form]"), {
      path: "",
      title: "",
      date: new Date().toISOString().slice(0, 10),
      body: ""
    });
    renderMarkdownList(pages, "[data-page-list]", "", selectPage);
  });

  $("[data-page-form]").addEventListener("submit", async (event) => {
    event.preventDefault();
    const values = readForm(event.currentTarget);
    const path = values.path || `public/content/pages/${slugify(values.title, "page")}.md`;
    await api("/file", {
      method: "PUT",
      body: JSON.stringify({ path, content: buildPageMarkdown(values), message: `Update ${path}` })
    });
    await syncIndex(pages, path, "public/content/pages/index.json");
    await loadPages();
    await syncGeneratedSiteFiles();
    setStatus("页面、索引和站点地图已保存。R2 模式下前台会直接读取最新内容。");
    selectPage(path);
  });

  $("[data-delete-page]").addEventListener("click", async () => {
    if (!activePage) return;
    if (!confirm(`确认删除 ${activePage.meta.title || activePage.path}？`)) return;
    const deletedPath = activePage.path;
    await api("/file", {
      method: "DELETE",
      body: JSON.stringify({ path: deletedPath, message: `Delete ${deletedPath}` })
    });
    pages = pages.filter((page) => page.path !== deletedPath);
    await syncIndex(pages, null, "public/content/pages/index.json");
    activePage = null;
    await loadPages();
    await syncGeneratedSiteFiles();
    setStatus("页面已删除，站点地图已更新。");
  });
}

function setupConfigForms() {
  $$("[data-config-form]").forEach((form) => {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const path = form.dataset.configForm;
      const values = normalizeConfig(path, readForm(form));
      await api("/file", {
        method: "PUT",
        body: JSON.stringify({
          path,
          content: `${JSON.stringify(values, null, 2)}\n`,
          message: `Update ${path}`
        })
      });
      if (path.endsWith("site.json")) await syncGeneratedSiteFiles(values);
      setStatus(path.endsWith("site.json")
        ? "站点配置、RSS 和站点地图已保存。"
        : "配置已保存。");
    });
  });
}

function setupSidebarForm() {
  const form = $("[data-sidebar-form]");
  $("[data-add-sidebar-link]").addEventListener("click", () => {
    sidebarConfig.links = normalizeSidebarLinks(sidebarConfig);
    sidebarConfig.links.push({ label: "", type: "link", url: "", enabled: true, html: "" });
    renderSidebarEditor();
    setStatus("已新增侧边栏联系方式标签。");
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    sidebarConfig = collectSidebarConfig();
    await api("/file", {
      method: "PUT",
      body: JSON.stringify({
        path: "public/config/sidebar.json",
        content: `${JSON.stringify(sidebarConfig, null, 2)}\n`,
        message: "Update sidebar"
      })
    });
    setStatus("侧边栏已保存，前台联系方式名称和自定义标签会同步更新。");
  });
}

function setupFooterForm() {
  const form = $("[data-footer-form]");
  $("[data-add-footer-link]").addEventListener("click", () => {
    footerConfig.links = footerConfig.links || [];
    footerConfig.links.push({ label: "", href: "/", enabled: true });
    renderFooterEditor();
    setStatus("已新增底栏链接。");
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    footerConfig = collectFooterConfig();
    await api("/file", {
      method: "PUT",
      body: JSON.stringify({
        path: "public/config/footer.json",
        content: `${JSON.stringify(footerConfig, null, 2)}\n`,
        message: "Update footer"
      })
    });
    setStatus("底栏已保存。");
  });
}

function setupMenuForm() {
  const form = $("[data-menu-form]");
  $("[data-add-menu]").addEventListener("click", () => {
    menuItems.push({ label: "", href: "/" });
    renderMenuEditor();
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    menuItems = collectMenuItems();
    await api("/file", {
      method: "PUT",
      body: JSON.stringify({
        path: "public/config/menu.json",
        content: `${JSON.stringify(menuItems, null, 2)}\n`,
        message: "Update menu"
      })
    });
    setStatus("菜单已保存。");
  });
}

function setupCategoriesForm() {
  const form = $("[data-categories-form]");
  $("[data-add-category]").addEventListener("click", () => {
    categoryConfig.items = categoryConfig.items || [];
    categoryConfig.items.push({ name: "", children: [] });
    renderCategoryEditor();
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    categoryConfig = collectCategories();
    await api("/file", {
      method: "PUT",
      body: JSON.stringify({
        path: "public/config/categories.json",
        content: `${JSON.stringify(categoryConfig, null, 2)}\n`,
        message: "Update categories"
      })
    });
    renderCategorySelects(
      activePost ? postCategories(activePost.meta) : [],
      activePost ? postSubcategories(activePost.meta) : []
    );
    renderAdEditor();
    setStatus("分类已保存，文章编辑和广告范围已同步更新。");
  });
}

function setupAdsForm() {
  const form = $("[data-ads-form]");
  $("[data-add-ad]").addEventListener("click", (event) => {
    event.preventDefault();
    try {
      if ($$("[data-ad-row]").length) adConfig = collectAdItems();
      adConfig.placements = adConfig.placements || [];
      adConfig.placements.unshift(createAdPlacement());
      renderAdEditor();
      focusFirstAdRow();
      setStatus(`已在列表顶部新增一条广告，当前共 ${adConfig.placements.length} 条，编辑后点击“保存广告设置”。`);
    } catch (error) {
      setStatus(`新增广告失败：${error.message}`);
    }
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    adConfig = collectAdItems();
    await api("/file", {
      method: "PUT",
      body: JSON.stringify({
        path: "public/config/ads.json",
        content: `${JSON.stringify(adConfig, null, 2)}\n`,
        message: "Update ads"
      })
    });
    setStatus("广告设置已保存。关闭的广告位会在前台自动折叠。");
  });
}

function setupMediaForm() {
  const form = $("[data-media-form]");
  $("[data-add-media]").addEventListener("click", () => {
    mediaItems.push({ name: "", url: "", type: "image", note: "" });
    renderMediaEditor();
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    mediaItems = collectMediaItems();
    await api("/file", {
      method: "PUT",
      body: JSON.stringify({
        path: "public/content/media.json",
        content: `${JSON.stringify(mediaItems, null, 2)}\n`,
        message: "Update media links"
      })
    });
    setStatus("媒体链接已保存。R2 模式下前台会直接读取最新内容。");
    renderDashboard();
  });
}

function setupAnalyticsForm() {
  const form = $("[data-analytics-form]");
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    await api("/file", {
      method: "PUT",
      body: JSON.stringify({
        path: "public/config/analytics.json",
        content: `${JSON.stringify(normalizeAnalytics(readForm(form)), null, 2)}\n`,
        message: "Update analytics settings"
      })
    });
    setStatus("统计插件设置已保存。Cloudflare Web Analytics 开启后会自动注入官方脚本。");
  });
}

function setupAdminForm() {
  const form = $("[data-admin-form]");
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const values = readForm(form);
    if (values.newPassword || values.confirmPassword) {
      if (!values.currentPassword) {
        setStatus("修改密码需要填写当前密码。");
        return;
      }
      if (values.newPassword.length < 8) {
        setStatus("新密码至少需要 8 个字符。");
        return;
      }
      if (values.newPassword !== values.confirmPassword) {
        setStatus("两次输入的新密码不一致。");
        return;
      }
    }
    adminSettings = await api("/admin-settings", {
      method: "PUT",
      body: JSON.stringify({
        displayName: values.displayName || "",
        note: values.note || "",
        currentPassword: values.currentPassword || "",
        newPassword: values.newPassword || ""
      })
    });
    fillForm(form, {
      displayName: adminSettings.displayName || "",
      note: adminSettings.note || "",
      currentPassword: "",
      newPassword: "",
      confirmPassword: ""
    });
    setStatus(values.newPassword ? "管理员设置和后台密码已保存。" : "管理员设置已保存。");
  });
}

function setupStatsActions() {
  $("[data-refresh-stats]").addEventListener("click", async () => {
    await loadStats();
    setStatus("统计数据已刷新。");
  });
  $("[data-seed-r2]").addEventListener("click", async () => {
    const result = await api("/seed-r2", { method: "POST" });
    setStatus(`已同步 ${result.count || 0} 个静态文件到 R2。`);
    await loadStorageStatus();
  });
}

function setupLogout() {
  $("[data-logout]").addEventListener("click", async () => {
    await api("/logout", { method: "POST" });
    location.reload();
  });
}

async function restoreSession() {
  try {
    await api("/session");
    $("[data-login-panel]").hidden = true;
    $("[data-dashboard]").hidden = false;
    await loadAllAdminData();
  } catch {
    $("[data-login-panel]").hidden = false;
  }
}

setupLogin();
setupTabs();
setupPostManager();
setupPostEditor();
setupPageEditor();
setupConfigForms();
setupSidebarForm();
setupFooterForm();
setupCategoriesForm();
setupMenuForm();
setupAdsForm();
setupMediaForm();
setupAnalyticsForm();
setupAdminForm();
setupStatsActions();
setupLogout();
wireCategorySelects();
restoreSession();
