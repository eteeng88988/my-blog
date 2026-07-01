export function contentUrl(path) {
  if (!path) return path;
  if (/^https?:\/\//i.test(path)) return path;
  if (path.startsWith("/api/")) return path;
  if (path.startsWith("public/")) return `/api/content/${path.replace(/^public\//, "")}`;
  if (path.startsWith("/content/") || path.startsWith("/config/")) return `/api/content${path}`;
  if (path.startsWith("content/") || path.startsWith("config/")) return `/api/content/${path}`;
  return path;
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
  const body = `
    ${placement.image ? `<img src="${escapeHtml(placement.image)}" alt="">` : ""}
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
