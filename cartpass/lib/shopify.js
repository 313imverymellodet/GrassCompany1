// Product lookup for Shopify-powered stores, via their public storefront JSON.
// Gives the agent exact variant ids, which is what lets a cart permalink
// pre-fill the recipient's cart.

const BLOCKED_HOST = /^(localhost|.*\.local|.*\.internal|.*\.localhost)$|^\[|^\d{1,3}(\.\d{1,3}){3}$/i;

export function isPublicHostname(host) {
  return typeof host === "string" && host.includes(".") && !BLOCKED_HOST.test(host);
}

async function getJson(fetchImpl, url, signal) {
  const res = await fetchImpl(url, {
    headers: { accept: "application/json", "user-agent": "Cartpass/1.0 (+shopping assistant)" },
    redirect: "follow",
    signal,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const type = res.headers.get("content-type") || "";
  if (!type.includes("json") && !type.includes("javascript")) throw new Error("not JSON");
  return res.json();
}

const absolutize = (u) => (typeof u === "string" && u.startsWith("//") ? `https:${u}` : u);

const money = (cents) => (Number.isFinite(Number(cents)) ? Math.round(Number(cents)) / 100 : null);

/**
 * Search a Shopify store. Returns up to `limit` products with their variants,
 * or throws with a message the agent can act on.
 */
export async function shopifySearch({ domain, query, limit = 6, fetchImpl = fetch, signal }) {
  if (!isPublicHostname(domain)) throw new Error("This store's address can't be searched directly.");
  const base = `https://${domain}`;
  const q = new URLSearchParams({
    q: query,
    "resources[type]": "product",
    "resources[limit]": String(Math.min(limit, 10)),
  });
  let suggest;
  try {
    suggest = await getJson(fetchImpl, `${base}/search/suggest.json?${q}`, signal);
  } catch (err) {
    throw new Error(`Not a Shopify store, or its catalog isn't public (${err.message}). Use web_search instead.`);
  }
  const products = suggest?.resources?.results?.products;
  if (!Array.isArray(products)) throw new Error("Not a Shopify store. Use web_search instead.");

  const detailed = await Promise.all(
    products.slice(0, limit).map(async (p) => {
      const handle = p.handle;
      let variants = [];
      try {
        const full = await getJson(fetchImpl, `${base}/products/${encodeURIComponent(handle)}.js`, signal);
        variants = (full.variants || []).slice(0, 12).map((v) => ({
          variant_id: String(v.id),
          title: v.title,
          price: money(v.price),
          available: v.available !== false,
        }));
      } catch {
        // Fall back to the summary row; the agent can still link the product.
      }
      return {
        title: p.title,
        url: `${base}/products/${handle}`,
        price: p.price != null ? Number(p.price) : variants[0]?.price ?? null,
        image: absolutize(p.image || p.featured_image?.url || null),
        available: p.available !== false,
        vendor: p.vendor || undefined,
        variants,
      };
    }),
  );
  return detailed;
}
