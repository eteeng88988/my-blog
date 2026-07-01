const SECURITY_HEADERS = {
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Permissions-Policy": "accelerometer=(), ambient-light-sensor=(), autoplay=(), camera=(), encrypted-media=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), midi=(), payment=(), picture-in-picture=(), publickey-credentials-get=(), usb=()",
  "Content-Security-Policy": "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self' https://static.cloudflareinsights.com; style-src 'self' 'unsafe-inline'; img-src 'self' https: data: blob:; media-src 'self' https:; connect-src 'self' https://cloudflareinsights.com; upgrade-insecure-requests"
};

function lockRawRoutes(headers, pathname) {
  if (pathname.startsWith("/api/") || pathname.startsWith("/content/") || pathname.startsWith("/admin/")) {
    headers.set("X-Robots-Tag", "noindex, nofollow, noarchive, nosnippet");
  }
  if (pathname.startsWith("/api/") || pathname.startsWith("/content/")) {
    headers.set("Cache-Control", "no-store");
  }
}

export async function onRequest(context) {
  const response = await context.next();
  const headers = new Headers(response.headers);
  Object.entries(SECURITY_HEADERS).forEach(([name, value]) => headers.set(name, value));
  lockRawRoutes(headers, new URL(context.request.url).pathname);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}
