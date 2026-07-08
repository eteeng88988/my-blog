export function contentUrl(path) {
  if (!path) return path;
  if (/^https?:\/\//i.test(path)) return path;
  if (path.startsWith("/api/")) return path;
  if (path.startsWith("public/")) return `/api/content/${path.replace(/^public\//, "")}`;
  if (path.startsWith("/content/") || path.startsWith("/config/")) return `/api/content${path}`;
  if (path.startsWith("content/") || path.startsWith("config/")) return `/api/content/${path}`;
  return path;
}

export function generatedCoverPath(path = "") {
  const slug = String(path)
    .replace(/^\/?content\/posts\//, "")
    .replace(/^public\/content\/posts\//, "")
    .replace(/\.md$/i, "")
    .replace(/[^a-z0-9_-]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return slug ? `/assets/generated-covers/${slug}.svg` : "";
}

export function resolvePostCover(post = {}) {
  const path = post.path || "";
  const cover = String(post.cover || post.meta?.cover || "").trim();
  const isBatchPost = /\/money-playbook\//.test(path);
  if (isBatchPost) return generatedCoverPath(path) || cover;
  return cover || generatedCoverPath(path);
}

export async function getJson(path) {
  const res = await fetch(contentUrl(path), { cache: "no-store" });
  if (!res.ok) throw new Error(`Cannot load ${path}`);
  return res.json();
}

export async function getText(path) {
  const res = await fetch(contentUrl(path), { cache: "no-store" });
  if (!res.ok) throw new Error(`Cannot load ${path}`);
  return res.text();
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

function safeHref(value = "") {
  const href = String(value || "").trim();
  if (!href) return "#";
  if (/^(https?:|mailto:|tel:|\/|#)/i.test(href)) return href;
  return `/${href.replace(/^\/+/, "")}`;
}

function normalizeList(value) {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  return String(value || "").split(",").map((item) => item.trim()).filter(Boolean);
}

function includesMatch(values, targets) {
  const list = normalizeList(values);
  const targetList = normalizeList(targets);
  return !list.length || list.includes("all") || list.includes("全部") || targetList.some((target) => list.includes(target));
}

function placementMatches(placement, context) {
  if (!placement.enabled || placement.slot !== context.slot) return false;
  if (!includesMatch(placement.pages, context.page)) return false;
  if (!includesMatch(placement.categories, context.category)) return false;
  if (!includesMatch(placement.subcategories, context.subcategory)) return false;
  const paths = normalizeList(placement.paths);
  if (paths.length && !paths.includes(context.path)) return false;
  return true;
}

function renderAd(placement) {
  if (placement.html?.trim()) {
    return `<div class="ad-card ad-html">${placement.html}</div>`;
  }
  if (placement.image) {
    const image = `<img src="${escapeHtml(placement.image)}" alt="${escapeHtml(placement.title || "广告")}">`;
    if (placement.url) {
      return `<a class="ad-card ad-image-only" href="${escapeHtml(placement.url)}" target="_blank" rel="nofollow sponsored noreferrer" aria-label="${escapeHtml(placement.title || "广告")}">${image}</a>`;
    }
    return `<div class="ad-card ad-image-only">${image}</div>`;
  }
  const body = `
    <div>
      <strong>${escapeHtml(placement.title || "广告")}</strong>
      ${placement.text ? `<p>${escapeHtml(placement.text)}</p>` : ""}
    </div>
  `;
  if (placement.url) {
    return `<a class="ad-card" href="${escapeHtml(placement.url)}" target="_blank" rel="nofollow sponsored noreferrer">${body}</a>`;
  }
  return `<div class="ad-card">${body}</div>`;
}

export function renderFooter(site = {}, footer = {}) {
  const textEl = document.querySelector("[data-site-footer]");
  const linksEl = document.querySelector("[data-footer-links]");
  const htmlEl = document.querySelector("[data-footer-html]");
  if (textEl) textEl.textContent = footer.text || site.copyright || `© ${new Date().getFullYear()} ${site.title || "My Blog"}`;
  if (linksEl) {
    const links = Array.isArray(footer.links) && footer.links.length
      ? footer.links
      : [
        { label: "RSS", href: "/feed.xml", enabled: true },
        { label: "Sitemap", href: "/sitemap.xml", enabled: true }
      ];
    linksEl.innerHTML = links
      .filter((item) => item.enabled !== false)
      .map((item) => `<a href="${escapeHtml(safeHref(item.href))}">${escapeHtml(item.label || item.href)}</a>`)
      .join("");
  }
  if (htmlEl) htmlEl.innerHTML = footer.html || "";
}

export async function renderAdSlots(context = {}) {
  const slots = [...document.querySelectorAll("[data-ad-slot]")];
  if (!slots.length) return;
  let config = { placements: [] };
  try {
    config = await getJson("/config/ads.json");
  } catch {
    config = { placements: [] };
  }

  slots.forEach((slot) => {
    const slotContext = {
      page: context.page || "",
      category: context.categories || context.category || "",
      subcategory: context.subcategories || context.subcategory || "",
      path: context.path || location.pathname,
      slot: slot.dataset.adSlot
    };
    const ads = (config.placements || []).filter((placement) => placementMatches(placement, slotContext));
    slot.innerHTML = ads.map(renderAd).join("");
    slot.hidden = ads.length === 0;
  });
}

export async function setupAnalytics() {
  let config = {};
  try {
    config = await getJson("/config/analytics.json");
  } catch {
    config = {};
  }
  const cloudflare = config.cloudflare || {};
  if (cloudflare.enabled && cloudflare.token && !document.querySelector("[data-cf-beacon]")) {
    const script = document.createElement("script");
    script.defer = true;
    script.src = "https://static.cloudflareinsights.com/beacon.min.js";
    script.dataset.cfBeacon = JSON.stringify({ token: cloudflare.token });
    document.head.append(script);
  }
  return config;
}

export async function trackPageView(context = {}) {
  const config = await setupAnalytics();
  if (config.local?.enabled === false) return;
  const payload = JSON.stringify({
    path: context.path || `${location.pathname}${location.search}`,
    title: context.title || document.title,
    page: context.page || "",
    category: context.category || "",
    subcategory: context.subcategory || ""
  });
  if (navigator.sendBeacon) {
    navigator.sendBeacon("/api/track/pageview", new Blob([payload], { type: "application/json" }));
    return;
  }
  fetch("/api/track/pageview", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: payload,
    keepalive: true
  }).catch(() => {});
}
