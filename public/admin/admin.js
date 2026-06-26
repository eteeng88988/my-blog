const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

let posts = [];
let activePost = null;

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

function slugify(title) {
  return title.trim().toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "") || `post-${Date.now()}`;
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

function buildMarkdown(values) {
  return `---\ntitle: ${values.title}\ndate: ${values.date}\ncategory: ${values.category}\ntags: ${values.tags}\ncover: ${values.cover}\nsummary: ${values.summary}\nfeatured: false\n---\n\n${values.body || ""}`;
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

function renderPostList() {
  const list = $("[data-post-list]");
  list.innerHTML = posts.map((post) => `
    <button class="post-item ${activePost?.path === post.path ? "active" : ""}" data-path="${post.path}">
      ${post.meta.title || post.path}
      <small>${post.meta.date || ""} / ${post.meta.category || "未分类"}</small>
    </button>
  `).join("");

  list.querySelectorAll("[data-path]").forEach((button) => {
    button.addEventListener("click", () => selectPost(button.dataset.path));
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
  renderPostList();
}

async function loadPosts() {
  setStatus("正在读取文章...");
  const files = await api("/files?prefix=public/content/posts");
  posts = await Promise.all(files.items
    .filter((item) => item.path.endsWith(".md"))
    .map(async (item) => {
      const file = await api(`/file?path=${encodeURIComponent(item.path)}`);
      return parseFrontMatter(file.content, item.path);
    }));
  posts.sort((a, b) => (b.meta.date || "").localeCompare(a.meta.date || ""));
  renderPostList();
  if (posts[0]) selectPost(posts[0].path);
  setStatus("文章已读取");
}

async function syncPostIndex(extraPath) {
  const paths = [...new Set([
    ...posts.map((post) => `/${post.path.replace(/^public\//, "")}`),
    ...(extraPath ? [`/${extraPath.replace(/^public\//, "")}`] : [])
  ])].sort();
  await api("/file", {
    method: "PUT",
    body: JSON.stringify({
      path: "public/content/posts/index.json",
      content: `${JSON.stringify(paths, null, 2)}\n`,
      message: "Update post index"
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

function setupLogin() {
  $("[data-login-form]").addEventListener("submit", async (event) => {
    event.preventDefault();
    const password = new FormData(event.currentTarget).get("password");
    await api("/login", { method: "POST", body: JSON.stringify({ password }) });
    $("[data-login-panel]").hidden = true;
    $("[data-dashboard]").hidden = false;
    await loadPosts();
    await Promise.all([...$$("[data-config-form]").map(loadConfig), loadMenu()]);
  });
}

function setupTabs() {
  $$("[data-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      $$("[data-tab]").forEach((item) => item.classList.toggle("active", item === button));
      $$("[data-panel]").forEach((panel) => panel.hidden = panel.dataset.panel !== button.dataset.tab);
      $("[data-panel-title]").textContent = button.textContent;
      $("[data-new-post]").hidden = button.dataset.tab !== "posts";
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
    renderPostList();
  });

  $("[data-post-form]").addEventListener("submit", async (event) => {
    event.preventDefault();
    const values = readForm(event.currentTarget);
    const path = values.path || `public/content/posts/${slugify(values.title)}.md`;
    await api("/file", {
      method: "PUT",
      body: JSON.stringify({ path, content: buildMarkdown(values), message: `Update ${path}` })
    });
    await syncPostIndex(path);
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
    await syncPostIndex();
    activePost = null;
    await loadPosts();
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
    await loadPosts();
    await Promise.all([...$$("[data-config-form]").map(loadConfig), loadMenu()]);
  } catch {
    $("[data-login-panel]").hidden = false;
  }
}

setupLogin();
setupTabs();
setupPostEditor();
setupConfigForms();
setupMenuForm();
setupLogout();
restoreSession();
