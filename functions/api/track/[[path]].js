function json(data, init = {}) {
  return Response.json(data, {
    ...init,
    headers: {
      "Cache-Control": "no-store",
      ...(init.headers || {})
    }
  });
}

function hasR2(env) {
  return env.BLOG_CONTENT && typeof env.BLOG_CONTENT.put === "function";
}

function text(value, max = 180) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

function dayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

export async function onRequest({ request, env, params, waitUntil }) {
  const action = Array.isArray(params.path) ? params.path.join("/") : (params.path || "");
  if (request.method !== "POST" || action !== "pageview") {
    return json({ error: "Not found" }, { status: 404 });
  }
  if (!hasR2(env)) return new Response(null, { status: 204 });

  const now = new Date();
  const body = await request.json().catch(() => ({}));
  const event = {
    day: dayKey(now),
    ts: now.toISOString(),
    path: text(body.path || new URL(request.url).pathname, 240),
    title: text(body.title, 240),
    page: text(body.page, 40),
    category: text(body.category, 80),
    subcategory: text(body.subcategory, 80),
    referrer: text(request.headers.get("Referer"), 300),
    ua: text(request.headers.get("User-Agent"), 300)
  };
  const id = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const write = env.BLOG_CONTENT.put(
    `analytics/pageviews/${event.day}/${now.getTime()}-${id}.json`,
    JSON.stringify(event),
    { httpMetadata: { contentType: "application/json; charset=utf-8" } }
  );
  if (waitUntil) waitUntil(write);
  else await write;
  return new Response(null, { status: 204 });
}
