const $ = (selector) => document.querySelector(selector);

async function getJson(path) {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) throw new Error(`Cannot load ${path}`);
  return res.json();
}

async function getText(path) {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) throw new Error(`Cannot load ${path}`);
  return res.text();
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

  return {
    path,
    title: meta.title || "Untitled",
    date: meta.date || "",
    category: meta.category || "General",
    tags: (meta.tags || "").split(",").map((tag) => tag.trim()).filter(Boolean),
    cover: meta.cover || "",
    summary: meta.summary || body.replace(/\s+/g, " ").slice(0, 120),
    featured: meta.featured === "true",
    body
  };
}

function articleHref(path) {
  return `/article.html?file=${encodeURIComponent(path)}`;
}

function renderMenu(menu) {
  $("[data-menu]").innerHTML = menu.map((item) => `<a href="${item.href}">${item.label}</a>`).join("");
}

function renderSite(site) {
  document.title = site.title;
  $("[data-site-title]").textContent = site.title;
  $("[data-site-subtitle]").textContent = site.subtitle;
  $("[data-site-description]").textContent = site.description;
  $("[data-hero]").style.backgroundImage = `url("${site.heroImage}")`;
}

function renderSidebar(sidebar, posts) {
  const tags = new Set(posts.flatMap((post) => post.tags));
  const cats = new Set(posts.map((post) => post.category));
  $("[data-sidebar-avatar]").src = sidebar.avatar;
  $("[data-sidebar-name]").textContent = sidebar.name;
  $("[data-sidebar-bio]").textContent = sidebar.bio;
  $("[data-sidebar-notice]").textContent = sidebar.notice;
  $("[data-sidebar-github]").href = sidebar.github;
  $("[data-sidebar-email]").href = `mailto:${sidebar.email}`;
  $("[data-stat-posts]").textContent = posts.length;
  $("[data-stat-tags]").textContent = tags.size;
  $("[data-stat-cats]").textContent = cats.size;
  $("[data-tags]").innerHTML = [...tags].map((tag) => `<span class="tag"># ${tag}</span>`).join("");
}

function renderPosts(posts) {
  $("[data-post-count]").textContent = `${posts.length} posts`;
  $("[data-posts]").innerHTML = posts.map((post) => `
    <article class="post-card">
      <a class="post-cover" href="${articleHref(post.path)}">
        <img src="${post.cover}" alt="">
      </a>
      <div class="post-body">
        <div class="post-meta">
          <span>${post.date}</span>
          <span>${post.category}</span>
          ${post.featured ? "<span>Featured</span>" : ""}
        </div>
        <h3><a href="${articleHref(post.path)}">${post.title}</a></h3>
        <p>${post.summary}</p>
        <div class="tags">${post.tags.map((tag) => `<span class="tag"># ${tag}</span>`).join("")}</div>
      </div>
    </article>
  `).join("");
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
      const haystack = `${post.title} ${post.summary} ${post.tags.join(" ")}`.toLowerCase();
      return !query || haystack.includes(query);
    });
    results.innerHTML = matched.map((post) => `
      <a class="search-result" href="${articleHref(post.path)}">
        <strong>${post.title}</strong>
        <span>${post.summary}</span>
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
  const postFiles = await getJson("/content/posts/index.json");
  const [site, menu, sidebar, theme, ...markdown] = await Promise.all([
    getJson("/config/site.json"),
    getJson("/config/menu.json"),
    getJson("/config/sidebar.json"),
    getJson("/config/theme.json"),
    ...postFiles.map(getText)
  ]);
  const posts = markdown.map((text, index) => parseFrontMatter(text, postFiles[index]))
    .sort((a, b) => b.date.localeCompare(a.date));

  renderSite(site);
  renderMenu(menu);
  renderPosts(posts);
  renderSidebar(sidebar, posts);
  setupTheme(theme);
  setupSearch(posts);
  setupBackTop();
}

init().catch((error) => {
  console.error(error);
  $("[data-posts]").innerHTML = `<p>Load failed: ${error.message}</p>`;
});
