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
  const plainPassword = getEnv(env, "ADMIN_PASSWORD");
  const passwordHash = getEnv(env, "ADMIN_PASSWORD_SHA256").toLowerCase();

  if (!plainPassword && !passwordHash) {
    throw new Error("\u540e\u53f0\u5bc6\u7801\u672a\u8bbe\u7f6e\uff1a\u8bf7\u5728 Cloudflare Pages \u73af\u5883\u53d8\u91cf\u4e2d\u8bbe\u7f6e ADMIN_PASSWORD \u6216 ADMIN_PASSWORD_SHA256");
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
  if (!token) throw new Error("Missing GITHUB_TOKEN");
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

async function getFile(env, path) {
  const { branch } = repo(env);
  const data = await githubFetch(env, `/contents/${encodeURIComponent(path).replace(/%2F/g, "/")}?ref=${branch}`);
  return {
    path,
    sha: data.sha,
    content: data.content ? decodeURIComponent(escape(atob(data.content.replace(/\n/g, "")))) : ""
  };
}

async function listFiles(env, prefix) {
  const { branch } = repo(env);
  const data = await githubFetch(env, `/contents/${encodeURIComponent(prefix).replace(/%2F/g, "/")}?ref=${branch}`);
  return Array.isArray(data)
    ? data.filter((item) => item.type === "file").map((item) => ({ path: item.path, sha: item.sha, name: item.name }))
    : [];
}

function encodeContent(content) {
  return btoa(unescape(encodeURIComponent(content)));
}

async function putFile(env, path, content, message) {
  const { branch } = repo(env);
  let sha;
  try {
    sha = (await getFile(env, path)).sha;
  } catch {
    sha = undefined;
  }

  return githubFetch(env, `/contents/${encodeURIComponent(path).replace(/%2F/g, "/")}`, {
    method: "PUT",
    body: JSON.stringify({
      message,
      content: encodeContent(content),
      branch,
      ...(sha ? { sha } : {})
    })
  });
}

async function deleteFile(env, path, message) {
  const { branch } = repo(env);
  const file = await getFile(env, path);
  return githubFetch(env, `/contents/${encodeURIComponent(path).replace(/%2F/g, "/")}`, {
    method: "DELETE",
    body: JSON.stringify({ message, sha: file.sha, branch })
  });
}

export async function onRequest(context) {
  try {
    const { request, env, params } = context;
    const action = Array.isArray(params.path) ? params.path.join("/") : (params.path || "");

    if (request.method === "POST" && action === "login") {
      const { password } = await request.json();
      if (!await passwordMatches(env, password || "")) {
        return json({ error: "\u5bc6\u7801\u9519\u8bef" }, { status: 401 });
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

    if (!await verifySession(request, env)) return json({ error: "\u672a\u767b\u5f55" }, { status: 401 });

    const url = new URL(request.url);
    if (request.method === "GET" && action === "session") return json({ ok: true });
    if (request.method === "GET" && action === "files") {
      return json({ items: await listFiles(env, url.searchParams.get("prefix") || "public/content/posts") });
    }
    if (request.method === "GET" && action === "file") {
      return json(await getFile(env, url.searchParams.get("path")));
    }
    if (request.method === "PUT" && action === "file") {
      const body = await request.json();
      await putFile(env, body.path, body.content, body.message || `Update ${body.path}`);
      return json({ ok: true });
    }
    if (request.method === "DELETE" && action === "file") {
      const body = await request.json();
      await deleteFile(env, body.path, body.message || `Delete ${body.path}`);
      return json({ ok: true });
    }

    return json({ error: "Not found" }, { status: 404 });
  } catch (error) {
    return json({ error: error.message || "Server error" }, { status: 500 });
  }
}
