const textEncoder = new TextEncoder();

function json(data, init = {}) {
  return Response.json(data, {
    ...init,
    headers: {
      "Cache-Control": "no-store",
      ...(init.headers || {})
    }
  });
}

function getEnv(env, name, fallback = "") {
  return env[name] || fallback;
}

function hasR2(env) {
  return env.BLOG_CONTENT && typeof env.BLOG_CONTENT.get === "function";
}

function cleanKey(path = "") {
  return path.replace(/^\/+/, "").replace(/\\/g, "/").replace(/\.\.+/g, "");
}

function publicKey(path = "") {
  const key = cleanKey(path);
  return key.startsWith("public/") ? key : `public/${key}`;
}

function privateKey(path = "") {
  return `private/${cleanKey(path).replace(/^private\//, "")}`;
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

function base64Url(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  bytes.forEach((byte) => binary += String.fromCharCode(byte));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function sha256Hex(value) {
  const hash = await crypto.subtle.digest("SHA-256", textEncoder.encode(value));
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function readAdminSettings(env) {
  if (!hasR2(env)) return {};
  const object = await env.BLOG_CONTENT.get(privateKey("admin.json"));
  if (!object) return {};
  try {
    return JSON.parse(await object.text());
  } catch {
    return {};
  }
}

function publicAdminSettings(settings = {}, env) {
  return {
    displayName: settings.displayName || "",
    note: settings.note || "",
    passwordConfigured: Boolean(settings.passwordHash || getEnv(env, "ADMIN_PASSWORD") || getEnv(env, "ADMIN_PASSWORD_SHA256")),
    updatedAt: settings.updatedAt || ""
  };
}

async function writeAdminSettings(env, settings) {
  if (!hasR2(env)) throw new Error("R2 绑定 BLOG_CONTENT 未配置，无法保存管理员设置");
  await env.BLOG_CONTENT.put(privateKey("admin.json"), JSON.stringify(settings, null, 2), {
    httpMetadata: { contentType: "application/json; charset=utf-8" },
    customMetadata: { updatedBy: "blog-admin" }
  });
}

async function hmac(secret, value) {
  const key = await crypto.subtle.importKey(
    "raw",
    textEncoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return base64Url(await crypto.subtle.sign("HMAC", key, textEncoder.encode(value)));
}

function cookieValue(request, name) {
  const cookie = request.headers.get("Cookie") || "";
  return cookie.split(";").map((item) => item.trim()).find((item) => item.startsWith(`${name}=`))?.slice(name.length + 1);
}

async function passwordMatches(env, password) {
  const adminSettings = await readAdminSettings(env);
  if (adminSettings.passwordHash && await sha256Hex(password) === String(adminSettings.passwordHash).toLowerCase()) return true;

  const plainPassword = getEnv(env, "ADMIN_PASSWORD");
  const passwordHash = getEnv(env, "ADMIN_PASSWORD_SHA256").toLowerCase();

  if (!adminSettings.passwordHash && !plainPassword && !passwordHash) {
    throw new Error("后台密码未设置：请在 Cloudflare Pages 环境变量中设置 ADMIN_PASSWORD 或 ADMIN_PASSWORD_SHA256");
  }

  if (plainPassword && password === plainPassword) return true;
  if (passwordHash && await sha256Hex(password) === passwordHash) return true;
  return false;
}

async function makeSession(env) {
  const payload = JSON.stringify({ role: "admin", exp: Date.now() + 1000 * 60 * 60 * 12 });
  const body = btoa(payload);
  const sig = await hmac(getEnv(env, "SESSION_SECRET", "dev-secret"), body);
  return `${body}.${sig}`;
}

async function verifySession(request, env) {
  const session = cookieValue(request, "blog_session");
  if (!session || !session.includes(".")) return false;
  const [body, sig] = session.split(".");
  const expected = await hmac(getEnv(env, "SESSION_SECRET", "dev-secret"), body);
  if (sig !== expected) return false;
  const payload = JSON.parse(atob(body));
  return payload.exp > Date.now();
}

function githubHeaders(env) {
  const token = getEnv(env, "GITHUB_TOKEN");
  if (!token) throw new Error("缺少 GITHUB_TOKEN，也没有可用的 R2 绑定 BLOG_CONTENT");
  return {
    "Accept": "application/vnd.github+json",
    "Authorization": `Bearer ${token}`,
    "Content-Type": "application/json",
    "User-Agent": "cloudflare-pages-blog-admin",
    "X-GitHub-Api-Version": "2022-11-28"
  };
}

function repo(env) {
  return {
    owner: getEnv(env, "GITHUB_OWNER", "eteeng88988"),
    repo: getEnv(env, "GITHUB_REPO", "my-blog"),
    branch: getEnv(env, "GITHUB_BRANCH", "main")
  };
}

async function githubFetch(env, path, init = {}) {
  const { owner, repo: repoName } = repo(env);
  const res = await fetch(`https://api.github.com/repos/${owner}/${repoName}${path}`, {
    ...init,
    headers: { ...githubHeaders(env), ...(init.headers || {}) }
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || `GitHub API failed: ${res.status}`);
  return data;
}

async function getGithubFile(env, path) {
  const { branch } = repo(env);
  const key = publicKey(path);
  const data = await githubFetch(env, `/contents/${encodeURIComponent(key).replace(/%2F/g, "/")}?ref=${branch}`);
  return {
    path: key,
    sha: data.sha,
    content: data.content ? decodeURIComponent(escape(atob(data.content.replace(/\n/g, "")))) : ""
  };
}

async function listGithubFiles(env, prefix) {
  const { branch } = repo(env);
  const data = await githubFetch(env, `/contents/${encodeURIComponent(cleanKey(prefix)).replace(/%2F/g, "/")}?ref=${branch}`);
  return Array.isArray(data)
    ? data.filter((item) => item.type === "file").map((item) => ({ path: item.path, sha: item.sha, name: item.name }))
    : [];
}

function encodeContent(content) {
  return btoa(unescape(encodeURIComponent(content)));
}

async function putGithubFile(env, path, content, message) {
  const { branch } = repo(env);
  const key = publicKey(path);
  let sha;
  try {
    sha = (await getGithubFile(env, key)).sha;
  } catch {
    sha = undefined;
  }

  return githubFetch(env, `/contents/${encodeURIComponent(key).replace(/%2F/g, "/")}`, {
    method: "PUT",
    body: JSON.stringify({
      message,
      content: encodeContent(content),
      branch,
      ...(sha ? { sha } : {})
    })
  });
}

async function deleteGithubFile(env, path, message) {
  const { branch } = repo(env);
  const key = publicKey(path);
  const file = await getGithubFile(env, key);
  return githubFetch(env, `/contents/${encodeURIComponent(key).replace(/%2F/g, "/")}`, {
    method: "DELETE",
    body: JSON.stringify({ message, sha: file.sha, branch })
  });
}

async function fetchStaticFile(request, path) {
  const url = new URL(assetPath(path), request.url);
  const res = await fetch(url.toString(), { cf: { cacheTtl: 0 } });
  if (!res.ok) throw new Error(`静态文件不存在：${assetPath(path)}`);
  return {
    path: publicKey(path),
    sha: "static",
    content: await res.text()
  };
}

async function listStaticFiles(request, prefix) {
  const key = cleanKey(prefix);
  const indexPath = key.endsWith("content/posts")
    ? "public/content/posts/index.json"
    : key.endsWith("content/pages")
      ? "public/content/pages/index.json"
      : "";
  if (!indexPath) return [];
  const index = await fetchStaticFile(request, indexPath);
  return JSON.parse(index.content).map((item) => indexEntryPath(item)).filter(Boolean).map((path) => ({
    path: publicKey(path),
    sha: "static",
    name: path.split("/").pop()
  }));
}

function indexEntryPath(item) {
  return typeof item === "string" ? item : (item?.path || "");
}

async function getFile(env, request, path) {
  const key = publicKey(path);
  if (hasR2(env)) {
    const object = await env.BLOG_CONTENT.get(key);
    if (object) return { path: key, sha: object.etag || "", content: await object.text(), source: "r2" };
  }
  try {
    return { ...await fetchStaticFile(request, key), source: "static" };
  } catch (error) {
    return { ...await getGithubFile(env, key), source: "github" };
  }
}

async function listFiles(env, request, prefix) {
  const key = cleanKey(prefix);
  if (hasR2(env)) {
    const listed = await env.BLOG_CONTENT.list({ prefix: key });
    const items = listed.objects
      .filter((item) => !item.key.endsWith("/"))
      .map((item) => ({ path: item.key, sha: item.etag || "", name: item.key.split("/").pop(), source: "r2" }));
    if (items.length) return items;
  }
  try {
    const staticItems = await listStaticFiles(request, key);
    if (staticItems.length) return staticItems;
  } catch {
    // Fall through to GitHub if static indexes are unavailable.
  }
  return listGithubFiles(env, key);
}

async function putFile(env, path, content, message) {
  const key = publicKey(path);
  if (hasR2(env)) {
    await env.BLOG_CONTENT.put(key, content, {
      httpMetadata: { contentType: contentType(key) },
      customMetadata: { updatedBy: "blog-admin" }
    });
    return { ok: true, storage: "r2" };
  }
  await putGithubFile(env, key, content, message);
  return { ok: true, storage: "github" };
}

async function deleteFile(env, path, message) {
  const key = publicKey(path);
  if (hasR2(env)) {
    await env.BLOG_CONTENT.delete(key);
    return { ok: true, storage: "r2" };
  }
  await deleteGithubFile(env, key, message);
  return { ok: true, storage: "github" };
}

async function seedR2(env, request) {
  if (!hasR2(env)) throw new Error("R2 绑定 BLOG_CONTENT 未配置，无法迁移静态内容");
  const paths = new Set([
    "public/config/site.json",
    "public/config/menu.json",
    "public/config/sidebar.json",
    "public/config/footer.json",
    "public/config/theme.json",
    "public/config/ads.json",
    "public/config/analytics.json",
    "public/config/categories.json",
    "public/content/media.json",
    "public/content/posts/index.json",
    "public/content/pages/index.json",
    "public/robots.txt",
    "public/sitemap.xml",
    "public/feed.xml"
  ]);

  for (const indexPath of ["public/content/posts/index.json", "public/content/pages/index.json"]) {
    try {
      const index = await fetchStaticFile(request, indexPath);
      JSON.parse(index.content).map((item) => indexEntryPath(item)).filter(Boolean).forEach((path) => paths.add(publicKey(path)));
    } catch {
      // Missing seed indexes should not block the rest of the migration.
    }
  }

  let count = 0;
  for (const path of paths) {
    try {
      const file = await fetchStaticFile(request, path);
      await env.BLOG_CONTENT.put(path, file.content, {
        httpMetadata: { contentType: contentType(path) },
        customMetadata: { seededBy: "blog-admin" }
      });
      count += 1;
    } catch {
      // Optional files can be absent in older deployments.
    }
  }
  return { ok: true, storage: "r2", count };
}

async function listAllR2Objects(bucket, prefix) {
  const objects = [];
  let cursor;
  do {
    const listed = await bucket.list({ prefix, cursor });
    objects.push(...listed.objects);
    cursor = listed.truncated ? listed.cursor : undefined;
  } while (cursor);
  return objects;
}

function dateKey(offset = 0) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

async function readStats(env) {
  if (!hasR2(env)) {
    return {
      storage: "missing-r2",
      total: 0,
      today: 0,
      last7: 0,
      days: [],
      topPaths: [],
      topCategories: []
    };
  }

  const wantedDays = Array.from({ length: 14 }, (_, index) => dateKey(-index)).reverse();
  const events = [];
  for (const day of wantedDays) {
    const objects = await listAllR2Objects(env.BLOG_CONTENT, `analytics/pageviews/${day}/`);
    for (const object of objects) {
      const entry = await env.BLOG_CONTENT.get(object.key);
      if (!entry) continue;
      try {
        events.push(JSON.parse(await entry.text()));
      } catch {
        // Ignore malformed legacy events.
      }
    }
  }

  const todayKey = dateKey();
  const last7Set = new Set(Array.from({ length: 7 }, (_, index) => dateKey(-index)));
  const byDay = new Map(wantedDays.map((day) => [day, 0]));
  const byPath = new Map();
  const byCategory = new Map();

  for (const event of events) {
    byDay.set(event.day, (byDay.get(event.day) || 0) + 1);
    byPath.set(event.path || "/", (byPath.get(event.path || "/") || 0) + 1);
    if (event.category) byCategory.set(event.category, (byCategory.get(event.category) || 0) + 1);
  }

  const sortCounts = (map) => [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([name, count]) => ({ name, count }));

  return {
    storage: "r2",
    total: events.length,
    today: events.filter((event) => event.day === todayKey).length,
    last7: events.filter((event) => last7Set.has(event.day)).length,
    days: [...byDay.entries()].map(([day, count]) => ({ day, count })),
    topPaths: sortCounts(byPath),
    topCategories: sortCounts(byCategory)
  };
}

export async function onRequest(context) {
  try {
    const { request, env, params } = context;
    const action = Array.isArray(params.path) ? params.path.join("/") : (params.path || "");

    if (request.method === "POST" && action === "login") {
      const { password } = await request.json();
      if (!await passwordMatches(env, password || "")) {
        return json({ error: "密码错误" }, { status: 401 });
      }
      const session = await makeSession(env);
      const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
      return json({ ok: true }, {
        headers: {
          "Set-Cookie": `blog_session=${session}; Path=/; HttpOnly${secure}; SameSite=Lax; Max-Age=43200`
        }
      });
    }

    if (request.method === "POST" && action === "logout") {
      return json({ ok: true }, {
        headers: { "Set-Cookie": "blog_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0" }
      });
    }

    if (!await verifySession(request, env)) return json({ error: "未登录" }, { status: 401 });

    const url = new URL(request.url);
    if (request.method === "GET" && action === "session") return json({ ok: true });
    if (request.method === "GET" && action === "admin-settings") {
      return json(publicAdminSettings(await readAdminSettings(env), env));
    }
    if (request.method === "PUT" && action === "admin-settings") {
      const body = await request.json();
      const settings = await readAdminSettings(env);
      if (body.newPassword) {
        if (!body.currentPassword || !await passwordMatches(env, body.currentPassword)) {
          return json({ error: "当前密码不正确" }, { status: 401 });
        }
        if (String(body.newPassword).length < 8) {
          return json({ error: "新密码至少需要 8 个字符" }, { status: 400 });
        }
        settings.passwordHash = await sha256Hex(String(body.newPassword));
      }
      settings.displayName = String(body.displayName || "").trim();
      settings.note = String(body.note || "").trim();
      settings.updatedAt = new Date().toISOString();
      await writeAdminSettings(env, settings);
      return json(publicAdminSettings(settings, env));
    }
    if (request.method === "GET" && action === "storage") {
      return json({
        storage: hasR2(env) ? "r2" : "github",
        r2: hasR2(env),
        bucket: "BLOG_CONTENT"
      });
    }
    if (request.method === "GET" && action === "stats") return json(await readStats(env));
    if (request.method === "POST" && action === "seed-r2") return json(await seedR2(env, request));
    if (request.method === "GET" && action === "files") {
      return json({ items: await listFiles(env, request, url.searchParams.get("prefix") || "public/content/posts") });
    }
    if (request.method === "GET" && action === "file") {
      return json(await getFile(env, request, url.searchParams.get("path")));
    }
    if (request.method === "PUT" && action === "file") {
      const body = await request.json();
      return json(await putFile(env, body.path, body.content, body.message || `Update ${body.path}`));
    }
    if (request.method === "DELETE" && action === "file") {
      const body = await request.json();
      return json(await deleteFile(env, body.path, body.message || `Delete ${body.path}`));
    }

    return json({ error: "Not found" }, { status: 404 });
  } catch (error) {
    return json({ error: error.message || "Server error" }, { status: 500 });
  }
}
