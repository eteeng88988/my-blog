function cleanPath(path = "") {
  return path.replace(/^\/+/, "").replace(/\\/g, "/").replace(/\.\.+/g, "");
}

function publicKey(path = "") {
  const key = cleanPath(path);
  return key.startsWith("public/") ? key : `public/${key}`;
}

function assetPath(path = "") {
  return `/${publicKey(path).replace(/^public\//, "")}`;
}

function contentType(path) {
  if (path.endsWith(".json")) return "application/json; charset=utf-8";
  if (path.endsWith(".md") || path.endsWith(".txt")) return "text/plain; charset=utf-8";
  if (path.endsWith(".xml")) return "application/xml; charset=utf-8";
  if (path.endsWith(".html")) return "text/html; charset=utf-8";
  if (path.endsWith(".css")) return "text/css; charset=utf-8";
  if (path.endsWith(".js")) return "text/javascript; charset=utf-8";
  return "application/octet-stream";
}

function hasR2(env) {
  return env.BLOG_CONTENT && typeof env.BLOG_CONTENT.get === "function";
}

const DOWNLOAD_USER_AGENT = /(curl|wget|python|scrapy|httpclient|libwww|go-http-client|java|node-fetch|axios|postman|insomnia|httrack|webzip|sitecopy|winhttp|powershell|invoke-webrequest)/i;

function forbiddenResponse() {
  return new Response("Protected content is only available inside the site.", {
    status: 403,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "text/plain; charset=utf-8",
      "X-Robots-Tag": "noindex, nofollow, noarchive, nosnippet"
    }
  });
}

function sameOriginBrowserFetch(request) {
  const url = new URL(request.url);
  const referrer = request.headers.get("Referer") || "";
  if (referrer) {
    try {
      if (new URL(referrer).origin === url.origin) return true;
    } catch {}
  }

  const fetchSite = request.headers.get("Sec-Fetch-Site") || "";
  const fetchMode = request.headers.get("Sec-Fetch-Mode") || "";
  return (fetchSite === "same-origin" || fetchSite === "same-site") && fetchMode !== "navigate";
}

function shouldBlockContentRequest(request) {
  const userAgent = request.headers.get("User-Agent") || "";
  if (DOWNLOAD_USER_AGENT.test(userAgent)) return true;

  const fetchMode = request.headers.get("Sec-Fetch-Mode") || "";
  const fetchDest = request.headers.get("Sec-Fetch-Dest") || "";
  if (fetchMode === "navigate" || fetchDest === "document") return true;

  return !sameOriginBrowserFetch(request);
}

async function readStaticAsset(request, key) {
  const url = new URL(assetPath(key), request.url);
  const res = await fetch(url.toString(), { cf: { cacheTtl: 0 } });
  if (!res.ok) return null;
  return {
    body: await res.text(),
    contentType: res.headers.get("Content-Type") || contentType(key)
  };
}

function indexStats(text) {
  try {
    const posts = JSON.parse(text);
    if (!Array.isArray(posts)) return { count: 0, covers: 0 };
    return {
      count: posts.length,
      covers: posts.filter((post) => String(post.cover || "").trim()).length
    };
  } catch {
    return { count: 0, covers: 0 };
  }
}

function shouldUseStaticPostIndex(staticText, r2Text) {
  const staticStats = indexStats(staticText);
  const r2Stats = indexStats(r2Text);
  if (!r2Stats.count) return true;
  if (staticStats.count > r2Stats.count) return true;
  return staticStats.count === r2Stats.count && staticStats.covers > r2Stats.covers;
}

export async function onRequest({ request, env, params }) {
  const relativePath = Array.isArray(params.path) ? params.path.join("/") : (params.path || "");
  if (!relativePath) return new Response("Not found", { status: 404 });
  if (shouldBlockContentRequest(request)) return forbiddenResponse();

  const key = publicKey(relativePath);
  if (key === "public/content/posts/index.json") {
    const staticAsset = await readStaticAsset(request, key);
    if (hasR2(env)) {
      const object = await env.BLOG_CONTENT.get(key);
      if (object) {
        const r2Text = await object.text();
        const body = staticAsset && shouldUseStaticPostIndex(staticAsset.body, r2Text)
          ? staticAsset.body
          : r2Text;
        return new Response(body, {
          headers: {
            "Cache-Control": "no-store",
            "Content-Type": "application/json; charset=utf-8"
          }
        });
      }
    }
    if (staticAsset) {
      return new Response(staticAsset.body, {
        headers: {
          "Cache-Control": "no-store",
          "Content-Type": staticAsset.contentType
        }
      });
    }
  }

  if (hasR2(env)) {
    const object = await env.BLOG_CONTENT.get(key);
    if (object) {
      return new Response(object.body, {
        headers: {
          "Cache-Control": "no-store",
          "Content-Type": object.httpMetadata?.contentType || contentType(key)
        }
      });
    }
  }

  const url = new URL(assetPath(key), request.url);
  const res = await fetch(url.toString(), { cf: { cacheTtl: 0 } });
  if (!res.ok) return new Response("Not found", { status: 404 });
  return new Response(res.body, {
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": res.headers.get("Content-Type") || contentType(key)
    }
  });
}
