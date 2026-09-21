/**
 * SHAFAAF PERFUMES — CLOUDFLARE WORKER
 * ------------------------------------------------------------
 * The website is plain static files in this folder. This script runs in
 * front of them and does three small jobs for search engines and for the
 * link previews WhatsApp, Facebook and Google build:
 *
 *   /sitemap.xml — every public page, built fresh from the live product
 *                  list, so a product added in the admin shows up on its own.
 *   /robots.txt  — which pages search engines may index (the shop) and
 *                  which they must not (cart, checkout, orders, admin…).
 *   Every HTML page — a canonical address plus Open Graph / Twitter tags
 *                  are added to <head>. A product page additionally gets
 *                  the product's own title, description, photo and price
 *                  data (JSON-LD) written into the HTML, because the page
 *                  itself only fills those in with JavaScript, which link
 *                  previews never run.
 *
 * Everything uses whatever address the site was reached on, so nothing
 * here changes when the shop moves from workers.dev to its own domain.
 */

// Public pages, as their clean URLs (Cloudflare turns /shop.html into /shop).
const STATIC_PAGES = ["/", "/shop", "/custom", "/about", "/contact", "/fragrance-finder"];

// Signed-in / personal pages: never useful in search results.
const PRIVATE_PAGES = ["/admin", "/cart", "/checkout", "/orders", "/wishlist"];

// How long Cloudflare may reuse one generated sitemap before rebuilding it.
const CACHE_SECONDS = 3600;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/sitemap.xml") return sitemap(url.origin, env);
    if (url.pathname === "/robots.txt") return robots(url.origin);

    const response = await env.ASSETS.fetch(request);
    const type = response.headers.get("Content-Type") || "";
    if (!type.includes("text/html") || PRIVATE_PAGES.includes(cleanPath(url.pathname))) return response;

    const product = cleanPath(url.pathname) === "/product" ? await productBySlug(env, url.searchParams.get("id")) : null;
    return decorateHtml(response, url, product);
  },
};

/** "/shop.html", "/shop/" and "/shop" are the same page; "/index.html" is "/". */
function cleanPath(pathname) {
  const path = pathname.replace(/\.html$/, "").replace(/\/+$/, "") || "/";
  return path === "/index" ? "/" : path;
}

/**
 * The address search engines should treat as the one true copy of a page.
 * Query strings are dropped except the ones that change what the page shows:
 * the shop's section (?type=) and the product (?id=).
 */
function canonicalUrl(url) {
  const path = cleanPath(url.pathname);
  const keep = path === "/shop" ? "type" : path === "/product" ? "id" : null;
  const value = keep && url.searchParams.get(keep);
  return url.origin + path + (value ? `?${keep}=${encodeURIComponent(value)}` : "");
}

function absoluteUrl(origin, path) {
  if (!path) return null;
  return /^https?:\/\//.test(path) ? path : origin + "/" + path.replace(/^\/+/, "");
}

/**
 * Adds the canonical link and social-preview tags to a page, and for a
 * product page swaps the placeholder title/description for the product's
 * own. The page's existing <title> and description are read on the way
 * through and reused for the social tags, so each page keeps its own words.
 */
function decorateHtml(response, url, product) {
  const origin = url.origin;
  const canonical = canonicalUrl(url);
  const page = { title: "", description: "" };
  const shareImage = product ? absoluteUrl(origin, product.image) : origin + "/images/logo-mark.png";

  const rewriter = new HTMLRewriter()
    .on("title", {
      element(el) {
        if (product) el.setInnerContent(productTitle(product));
      },
      text(chunk) {
        if (!product) page.title += chunk.text;
      },
    })
    .on('meta[name="description"]', {
      element(el) {
        if (product) el.setAttribute("content", productDescription(product));
        else page.description = el.getAttribute("content") || "";
      },
    })
    .on("head", {
      element(el) {
        el.onEndTag((end) => {
          const title = product ? productTitle(product) : page.title.trim();
          const description = product ? productDescription(product) : page.description;
          const tags = [
            `<link rel="canonical" href="${escapeAttr(canonical)}">`,
            `<meta property="og:site_name" content="Shafaaf Perfumes">`,
            `<meta property="og:type" content="${product ? "product" : "website"}">`,
            `<meta property="og:url" content="${escapeAttr(canonical)}">`,
            `<meta property="og:title" content="${escapeAttr(title)}">`,
            `<meta property="og:description" content="${escapeAttr(description)}">`,
            `<meta property="og:image" content="${escapeAttr(shareImage)}">`,
            `<meta name="twitter:card" content="summary_large_image">`,
            `<meta name="twitter:title" content="${escapeAttr(title)}">`,
            `<meta name="twitter:description" content="${escapeAttr(description)}">`,
            `<meta name="twitter:image" content="${escapeAttr(shareImage)}">`,
          ];
          if (product) tags.push(`<script type="application/ld+json">${productJsonLd(product, canonical, origin)}</script>`);
          end.before("\n  " + tags.join("\n  ") + "\n", { html: true });
        });
      },
    });

  const decorated = rewriter.transform(response);
  // A product page's tags change when the product does, so don't let
  // Cloudflare's edge keep an old copy for long.
  if (product) {
    const headers = new Headers(decorated.headers);
    headers.set("Cache-Control", `public, max-age=${CACHE_SECONDS}`);
    return new Response(decorated.body, { status: decorated.status, headers });
  }
  return decorated;
}

function productTitle(product) {
  const forms = (product.variants || []).map((v) => v.type).filter(Boolean);
  const suffix = forms.length ? ` (${forms.join(" & ")})` : "";
  return `${product.name}${suffix} — Shafaaf Perfumes`;
}

function productDescription(product) {
  const prices = allPrices(product);
  const from = prices.length ? ` From ₹${Math.min(...prices)}.` : "";
  const notes = Array.isArray(product.notes) && product.notes.length ? ` Notes: ${product.notes.slice(0, 5).join(", ")}.` : "";
  return `${product.description || product.name}${notes}${from} Free shipping across India.`;
}

function allPrices(product) {
  const prices = [];
  for (const variant of product.variants || []) {
    for (const size of variant.sizes || []) {
      if (typeof size.price === "number") prices.push(size.price);
    }
  }
  return prices;
}

/** Google's product rich-result data: name, image, price range, availability. */
function productJsonLd(product, canonical, origin) {
  const prices = allPrices(product);
  const data = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: product.description || undefined,
    image: [product.image, product.imageAlt].map((p) => absoluteUrl(origin, p)).filter(Boolean),
    brand: { "@type": "Brand", name: "Shafaaf Perfumes" },
    url: canonical,
  };
  if (prices.length) {
    data.offers = {
      "@type": "AggregateOffer",
      priceCurrency: "INR",
      lowPrice: Math.min(...prices),
      highPrice: Math.max(...prices),
      offerCount: prices.length,
      availability: "https://schema.org/InStock",
      url: canonical,
    };
  }
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

/** One product from the backend's public catalogue, or null if unknown. */
async function productBySlug(env, slug) {
  if (!env.API_BASE_URL || !slug || !/^[a-z0-9-]{1,80}$/.test(slug)) return null;
  try {
    const response = await fetch(`${env.API_BASE_URL}/products/${slug}`, {
      headers: { Accept: "application/json" },
      cf: { cacheTtl: CACHE_SECONDS, cacheEverything: true },
    });
    if (!response.ok) return null;
    const body = await response.json();
    return body && body.data && body.data.product ? body.data.product : null;
  } catch {
    return null;
  }
}

function escapeAttr(value) {
  return escapeXml(String(value == null ? "" : value));
}

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
