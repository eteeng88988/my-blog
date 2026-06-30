import { contentUrl, getJson, getText, renderAdSlots, trackPageView } from "./runtime.js";

const article = document.querySelector("[data-article]");
const toggle = document.querySelector("[data-theme-toggle]");

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
      category: meta.category || "",
      subcategory: meta.subcategory || "",
      tags: meta.tags || "",
      cover: meta.cover || "",
      showDate: meta.showDate !== "false"
    },
    body
  };
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

function articleHref(path) {
  return `/article.html?file=${encodeURIComponent(path)}`;
}

function renderArticleExtras(currentPath, currentMeta, posts) {
  if (!currentPath.startsWith("/content/posts/")) return "";
  const index = posts.findIndex((post) => post.path === currentPath);
  const prev = posts[index + 1];
  const next = posts[index - 1];
  const currentTags = currentMeta.tags.split(",").map((tag) => tag.trim()).filter(Boolean);
  let related = posts
    .filter((post) => post.path !== currentPath)
    .filter((post) => {
      const tags = post.meta.tags.split(",").map((tag) => tag.trim()).filter(Boolean);
      return post.meta.category === currentMeta.category || tags.some((tag) => currentTags.includes(tag));
    })
    .slice(0, 3);
  let relatedTitle = "相关文章";
  if (!related.length) {
    related = posts.filter((post) => post.path !== currentPath).slice(0, 3);
    relatedTitle = "最新文章";
  }

  return `
    <nav class="article-nav">
      ${prev ? `<a href="${articleHref(prev.path)}"><span>上一篇</span><strong>${prev.meta.title}</strong></a>` : "<span></span>"}
      ${next ? `<a href="${articleHref(next.path)}"><span>下一篇</span><strong>${next.meta.title}</strong></a>` : "<span></span>"}
    </nav>
    ${related.length ? `
      <section class="related-posts">
        <h2>${relatedTitle}</h2>
        <div>
          ${related.map((post) => `<a href="${articleHref(post.path)}">${post.meta.title}<span>${post.meta.category}</span></a>`).join("")}
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
  const [site, menu, theme, postFiles, res] = await Promise.all([
    getJson("/config/site.json"),
    getJson("/config/menu.json"),
    getJson("/config/theme.json"),
    getJson("/content/posts/index.json"),
    fetch(contentUrl(file), { cache: "no-store" })
  ]);
  if (!res.ok) throw new Error("Article not found");

  document.querySelector("[data-site-title]").textContent = site.title;
  document.querySelector("[data-site-footer]").textContent = site.copyright || `© ${new Date().getFullYear()} ${site.title}`;
  renderMenu(menu);
  setupTheme(theme);

  const postMarkdown = await Promise.all(postFiles.map(getText));
  const posts = postMarkdown.map((text, index) => parseFrontMatter(text, postFiles[index]))
    .sort((a, b) => b.meta.date.localeCompare(a.meta.date));
  const { meta, body } = parseFrontMatter(await res.text(), file);
  const pageType = file.startsWith("/content/posts/") ? "article" : "page";
  document.title = meta.title || "Article";
  article.innerHTML = `
    <a class="article-back" href="/">返回首页</a>
    ${meta.cover ? `<img class="article-cover" src="${meta.cover}" alt="">` : ""}
    <section class="ad-region" data-ad-slot="article-top" hidden></section>
    <div class="post-meta">${meta.showDate && meta.date ? `<span>${meta.date}</span>` : ""}<span>${meta.category || ""}</span>${meta.subcategory ? `<span>${meta.subcategory}</span>` : ""}</div>
    <h1>${meta.title || "Untitled"}</h1>
    <section class="ad-region" data-ad-slot="article-content" hidden></section>
    <div class="article-content">${markdownToHtml(body)}</div>
    ${renderArticleExtras(file, meta, posts)}
  `;
  await renderAdSlots({ page: pageType, path: file, category: meta.category, subcategory: meta.subcategory });
  trackPageView({ page: pageType, path: file, title: meta.title, category: meta.category, subcategory: meta.subcategory });
}

init().catch((error) => {
  article.textContent = `加载失败：${error.message}`;
});
