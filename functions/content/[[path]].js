function securityHeaders() {
  return {
    "Cache-Control": "no-store",
    "Content-Type": "text/plain; charset=utf-8",
    "X-Robots-Tag": "noindex, nofollow, noarchive, nosnippet"
  };
}

export async function onRequest() {
  return new Response("Raw content downloads are disabled.", {
    status: 404,
    headers: securityHeaders()
  });
}
