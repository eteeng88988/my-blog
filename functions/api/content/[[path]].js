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

export async function onRequest({ request, env, params }) {
  const relativePath = Array.isArray(params.path) ? params.path.join("/") : (params.path || "");
  if (!relativePath) return new Response("Not found", { status: 404 });

  const key = publicKey(relativePath);
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
