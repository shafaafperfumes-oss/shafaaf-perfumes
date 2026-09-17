/**
 * SHAFAAF PERFUMES — CLOUDFLARE WORKER
 * ------------------------------------------------------------
 * The website is plain static files, and Cloudflare serves them straight
 * from this folder without ever running this script. It runs only for a
 * request that matches no file, and today answers exactly two of those:
 *
 *   /sitemap.xml — every public page, for search engines. Built fresh
 *                  from the live product list, so a product added in the
 *                  admin shows up here on its own.
 *   /robots.txt  — which pages search engines may index (the shop) and
 *                  which they must not (cart, checkout, orders, admin…).
 *
 * Both use whatever address the site was reached on, so nothing here
 * changes when the shop moves from workers.dev to its own domain.
 * Anything else falls through to Cloudflare's normal "not found".
 */

// Public pages, as their clean URLs (Cloudflare turns /shop.html into /shop).
const STATIC_PAGES = ["/", "/shop", "/about", "/contact", "/fragrance-finder"];

// Signed-in / personal pages: never useful in search results.
const PRIVATE_PAGES = ["/admin", "/cart", "/checkout", "/orders", "/wishlist"];

// How long Cloudflare may reuse one generated sitemap before rebuilding it.
const CACHE_SECONDS = 3600;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/sitemap.xml") return sitemap(url.origin, env);
    if (url.pathname === "/robots.txt") return robots(url.origin);

    return env.ASSETS.fetch(request);
  },
};

async function sitemap(origin, env) {
  const paths = [...STATIC_PAGES];
  for (const slug of await productSlugs(env)) {
    paths.push(`/product?id=${encodeURIComponent(slug)}`);
  }

  const entries = paths.map((path) => `  <url><loc>${escapeXml(origin + path)}</loc></url>`).join("\n");
  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</urlset>\n`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": `public, max-age=${CACHE_SECONDS}`,
    },
  });
}

function robots(origin) {
  const lines = ["User-agent: *", "Allow: /", ...PRIVATE_PAGES.map((path) => `Disallow: ${path}`), "", `Sitemap: ${origin}/sitemap.xml`, ""];
  return new Response(lines.join("\n"), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": `public, max-age=${CACHE_SECONDS}`,
    },
  });
}

/**
 * Slugs of every product the shop currently lists, from the backend's
 * public catalogue. If the backend is unreachable the sitemap still goes
 * out with the static pages — better a short sitemap than an error page.
 */
async function productSlugs(env) {
  if (!env.API_BASE_URL) return [];
  try {
    const response = await fetch(`${env.API_BASE_URL}/products?perPage=100`, {
      headers: { Accept: "application/json" },
      cf: { cacheTtl: CACHE_SECONDS, cacheEverything: true },
    });
    if (!response.ok) return [];
    const body = await response.json();
    const products = body && body.data && Array.isArray(body.data.products) ? body.data.products : [];
    return products.map((product) => product.id).filter((id) => typeof id === "string" && id);
  } catch {
    return [];
  }
}

function escapeXml(value) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
