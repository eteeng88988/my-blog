const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

let posts = [];
let pages = [];
let activePost = null;
let activePage = null;

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

function buildPostMarkdown(values) {
  return `---\ntitle: ${values.title}\ndate: ${values.date}\ncategory: ${values.category}\ntags: ${values.tags}\ncover: ${values.cover}\nsummary: ${values.summary}\nfeatured: false\n---\n\n${values.body || ""}`;
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

function normalizeConfig(path, values) {
  if (path.endsWith("theme.json")) {
    return {
      accent: values.accent || "#2f7dff",
      darkMode: values.darkMode === "true",
      cardRadius: Number.parseInt(values.cardRadius || "14", 10),
      enableMotion: values.enableMotion === "true"
    };
  }
  return values;
}

function renderMarkdownList(items, selector, activePath, selectItem) {
  const list = $(selector);
  list.innerHTML = items.map((item) => `
    <button class="post-item ${activePath === item.path ? "active" : ""}" data-path="${item.path}">
      ${item.meta.title || item.path}
      <small>${item.meta.date || ""} / ${item.meta.category || "页面"}</small>
    </button>
  `).join("");

  list.querySelectorAll("[data-path]").forEach((button) => {
    button.addEventListener("click", () => selectItem(button.dataset.path));
  });
}

function selectPost(path) {
  activePost = posts.find((post) => post.path === path);
  if (!activePost) return;
  fillForm($("[data-post-form]"), {
    path: activePost.path,
    title: activePost.meta.title,
    date: activePost.meta.date,
    category: activePost.meta.category,
    tags: activePost.meta.tags,
    cover: activePost.meta.cover,
    summary: activePost.meta.summary,
    body: activePost.body.trim()
  });
  renderMarkdownList(posts, "[data-post-list]", activePost.path, selectPost);
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
  renderMarkdownList(posts, "[data-post-list]", activePost?.path, selectPost);
  if (posts[0]) selectPost(posts[0].path);
  setStatus("文章已读取");
}

async function loadPages() {
  setStatus("正在读取页面...");
  pages = await loadMarkdownDirectory("public/content/pages");
  renderMarkdownList(pages, "[data-page-list]", activePage?.path, selectPage);
  if (pages[0]) selectPage(pages[0].path);
  setStatus("页面已读取");
}

async function syncIndex(items, extraPath, indexPath) {
  const paths = [...new Set([
    ...items.map((item) => `/${item.path.replace(/^public\//, "")}`),
    ...(extraPath ? [`/${extraPath.replace(/^public\//, "")}`] : [])
  ])].sort();
  await api("/file", {
    method: "PUT",
    body: JSON.stringify({
      path: indexPath,
      content: `${JSON.stringify(paths, null, 2)}\n`,
      message: `Update ${indexPath}`
    })
  });
}

async function loadConfig(form) {
  const path = form.dataset.configForm;
  const file = await api(`/file?path=${encodeURIComponent(path)}`);
  fillForm(form, JSON.parse(file.content));
}

async function loadMenu() {
  const form = $("[data-menu-form]");
  const file = await api(`/file?path=${encodeURIComponent("public/config/menu.json")}`);
  const items = JSON.parse(file.content);
  form.elements.items.value = items.map((item) => `${item.label}|${item.href}`).join("\n");
}

function parseMenuItems(value) {
  return value.split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [label, ...hrefParts] = line.split("|");
      return { label: label.trim(), href: hrefParts.join("|").trim() || "/" };
    })
    .filter((item) => item.label);
}

async function loadMedia() {
  const form = $("[data-media-form]");
  const file = await api(`/file?path=${encodeURIComponent("public/content/media.json")}`);
  const items = JSON.parse(file.content);
  form.elements.items.value = items.map((item) => [
    item.name || "",
    item.url || "",
    item.type || "image",
    item.note || ""
  ].join("|")).join("\n");
}

function parseMediaItems(value) {
  return value.split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [name, url, type = "image", ...noteParts] = line.split("|");
      return { name: name.trim(), url: (url || "").trim(), type: type.trim(), note: noteParts.join("|").trim() };
    })
    .filter((item) => item.name && item.url);
}

async function loadAllAdminData() {
  await Promise.all([
    loadPosts(),
    loadPages(),
    ...$$("[data-config-form]").map(loadConfig),
    loadMenu(),
    loadMedia()
  ]);
}

function setupLogin() {
  $("[data-login-form]").addEventListener("submit", async (event) => {
    event.preventDefault();
    const password = new FormData(event.currentTarget).get("password");
    await api("/login", { method: "POST", body: JSON.stringify({ password }) });
    $("[data-login-panel]").hidden = true;
    $("[data-dashboard]").hidden = false;
    await loadAllAdminData();
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
    });
  });
}

function setupPostEditor() {
  $("[data-new-post]").addEventListener("click", () => {
    activePost = null;
    fillForm($("[data-post-form]"), {
      path: "",
      title: "",
      date: new Date().toISOString().slice(0, 10),
      category: "",
      tags: "",
      cover: "",
      summary: "",
      body: ""
    });
    renderMarkdownList(posts, "[data-post-list]", "", selectPost);
  });

  $("[data-post-form]").addEventListener("submit", async (event) => {
    event.preventDefault();
    const values = readForm(event.currentTarget);
    const path = values.path || `public/content/posts/${slugify(values.title, "post")}.md`;
    await api("/file", {
      method: "PUT",
      body: JSON.stringify({ path, content: buildPostMarkdown(values), message: `Update ${path}` })
    });
    await syncIndex(posts, path, "public/content/posts/index.json");
    setStatus("文章已保存到 GitHub，等待 Cloudflare 自动部署。");
    await loadPosts();
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
    await loadPosts();
  });
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
    setStatus("页面已保存到 GitHub，等待 Cloudflare 自动部署。");
    await loadPages();
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
  });
}

function setupConfigForms() {
  $$("[data-config-form]").forEach((form) => {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const path = form.dataset.configForm;
      await api("/file", {
        method: "PUT",
        body: JSON.stringify({
          path,
          content: `${JSON.stringify(normalizeConfig(path, readForm(form)), null, 2)}\n`,
          message: `Update ${path}`
        })
      });
      setStatus("配置已保存到 GitHub，等待 Cloudflare 自动部署。");
    });
  });
}

function setupMenuForm() {
  const form = $("[data-menu-form]");
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    await api("/file", {
      method: "PUT",
      body: JSON.stringify({
        path: "public/config/menu.json",
        content: `${JSON.stringify(parseMenuItems(form.elements.items.value), null, 2)}\n`,
        message: "Update menu"
      })
    });
    setStatus("菜单已保存到 GitHub，等待 Cloudflare 自动部署。");
  });
}

function setupMediaForm() {
  const form = $("[data-media-form]");
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    await api("/file", {
      method: "PUT",
      body: JSON.stringify({
        path: "public/content/media.json",
        content: `${JSON.stringify(parseMediaItems(form.elements.items.value), null, 2)}\n`,
        message: "Update media links"
      })
    });
    setStatus("媒体链接已保存到 GitHub，等待 Cloudflare 自动部署。");
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
setupPostEditor();
setupPageEditor();
setupConfigForms();
setupMenuForm();
setupMediaForm();
setupLogout();
restoreSession();
