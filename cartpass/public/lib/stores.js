// Store detection and "send the cart" link builders.
// Shared by the browser and the server, so it must stay dependency-free.

const KNOWN_STORES = {
  amazon: { name: "Amazon", domain: "amazon.com" },
  walmart: { name: "Walmart", domain: "walmart.com" },
  target: { name: "Target", domain: "target.com" },
  "best buy": { name: "Best Buy", domain: "bestbuy.com" },
  bestbuy: { name: "Best Buy", domain: "bestbuy.com" },
  costco: { name: "Costco", domain: "costco.com" },
  etsy: { name: "Etsy", domain: "etsy.com" },
  ebay: { name: "eBay", domain: "ebay.com" },
  "home depot": { name: "The Home Depot", domain: "homedepot.com" },
  lowes: { name: "Lowe's", domain: "lowes.com" },
  "lowe's": { name: "Lowe's", domain: "lowes.com" },
  sephora: { name: "Sephora", domain: "sephora.com" },
  ulta: { name: "Ulta Beauty", domain: "ulta.com" },
  nike: { name: "Nike", domain: "nike.com" },
  ikea: { name: "IKEA", domain: "ikea.com" },
  wayfair: { name: "Wayfair", domain: "wayfair.com" },
  chewy: { name: "Chewy", domain: "chewy.com" },
  kohls: { name: "Kohl's", domain: "kohls.com" },
  "kohl's": { name: "Kohl's", domain: "kohls.com" },
  macys: { name: "Macy's", domain: "macys.com" },
  "macy's": { name: "Macy's", domain: "macys.com" },
};

const AMAZON_HOST = /(^|\.)amazon\.(com|ca|co\.uk|de|fr|it|es|co\.jp|com\.au|in|com\.mx|nl|se|pl|com\.br|sg|ae|sa|com\.tr)$/i;

/** Turn "Amazon", "amazon.com", or "https://shop.example.com/x" into { name, domain, kind }. */
export function resolveStore(input) {
  const raw = String(input || "").trim();
  if (!raw) return null;
  const known = KNOWN_STORES[raw.toLowerCase()];
  if (known) return { ...known, kind: kindForDomain(known.domain) };

  let host = raw;
  if (/^[a-z]+:\/\//i.test(raw) || raw.includes(".")) {
    try {
      host = new URL(/^[a-z]+:\/\//i.test(raw) ? raw : `https://${raw}`).hostname;
    } catch {
      host = raw;
    }
  }
  host = host.toLowerCase().replace(/^www\./, "");
  if (!host.includes(".")) {
    // A plain name we don't know ("Lululemon"): let the agent figure out the site.
    return { name: raw, domain: null, kind: "generic" };
  }
  const knownByDomain = Object.values(KNOWN_STORES).find((s) => s.domain === host);
  return {
    name: knownByDomain ? knownByDomain.name : prettyName(host),
    domain: host,
    kind: kindForDomain(host),
  };
}

function kindForDomain(domain) {
  if (domain && AMAZON_HOST.test(domain)) return "amazon";
  return "generic"; // may be upgraded to "shopify" once the agent confirms it
}

function prettyName(host) {
  const base = host.replace(/\.(com|net|org|co|shop|store|us|io)(\.[a-z]{2})?$/, "").split(".").pop();
  return base.charAt(0).toUpperCase() + base.slice(1);
}

export function hostOf(url) {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

/** Amazon product URLs carry the ASIN as /dp/XXXXXXXXXX or /gp/product/XXXXXXXXXX. */
export function asinFromUrl(url) {
  const m = String(url || "").match(/\/(?:dp|gp\/product|gp\/aw\/d|product)\/([A-Z0-9]{10})(?=[/?#]|$)/i);
  return m ? m[1].toUpperCase() : null;
}

/** Shopify product URLs can pin a variant with ?variant=123. */
export function shopifyVariantFromUrl(url) {
  try {
    const v = new URL(url).searchParams.get("variant");
    return v && /^\d+$/.test(v) ? v : null;
  } catch {
    return null;
  }
}

/** Fill in store-specific ids (ASIN, Shopify variant) from an item's URL when missing. */
export function enrichItem(item) {
  const out = { ...item };
  const host = hostOf(out.url);
  if (!out.asin && host && AMAZON_HOST.test(host)) out.asin = asinFromUrl(out.url);
  if (!out.variantId) out.variantId = shopifyVariantFromUrl(out.url);
  out.quantity = clampQty(out.quantity);
  return out;
}

export function clampQty(q) {
  const n = Math.round(Number(q));
  return Number.isFinite(n) && n >= 1 ? Math.min(n, 99) : 1;
}

/**
 * Work out how the recipient can get these items into their own cart.
 * Returns { mode: "auto" | "guided", url?, label, note }.
 *  - Amazon: the documented Add-to-Cart form URL fills their cart in one click.
 *  - Shopify: a cart permalink fills the cart and opens checkout, with the
 *    shipping address prefilled where the store still supports it.
 *  - Everything else: a guided checklist of product links.
 */
export function checkoutPlan(cart, opts = {}) {
  const items = (cart.items || []).map(enrichItem);
  const store = cart.store || {};
  const storeName = store.name || "the store";

  if (store.kind === "amazon" && items.length && items.every((i) => i.asin)) {
    const domain = store.domain && AMAZON_HOST.test(store.domain) ? store.domain : "amazon.com";
    const params = new URLSearchParams();
    if (opts.amazonTag) params.set("AssociateTag", opts.amazonTag);
    items.forEach((it, idx) => {
      params.set(`ASIN.${idx + 1}`, it.asin);
      params.set(`Quantity.${idx + 1}`, String(it.quantity));
    });
    return {
      mode: "auto",
      url: `https://www.${domain}/gp/aws/cart/add.html?${params}`,
      label: `Add all ${countLabel(items)} to my Amazon cart`,
      note: "Amazon will ask you to confirm, then everything lands in your cart.",
    };
  }

  if (store.kind === "shopify" && store.domain && items.length && items.every((i) => i.variantId)) {
    const path = items.map((i) => `${i.variantId}:${i.quantity}`).join(",");
    const params = new URLSearchParams();
    const a = cart.shipTo;
    if (a && a.address1) {
      const [first, ...rest] = String(a.name || "").trim().split(/\s+/);
      const fields = {
        first_name: first,
        last_name: rest.join(" "),
        address1: a.address1,
        address2: a.address2,
        city: a.city,
        province: a.region,
        zip: a.postal,
        country: a.country,
      };
      for (const [k, v] of Object.entries(fields)) {
        if (v) params.set(`checkout[shipping_address][${k}]`, v);
      }
    }
    const qs = params.toString();
    return {
      mode: "auto",
      url: `https://${store.domain}/cart/${path}${qs ? `?${qs}` : ""}`,
      label: `Open checkout with all ${countLabel(items)}`,
      note: cart.shipTo?.address1
        ? `Checkout opens with everything in it. ${storeName} may prefill the shipping address; double-check it before you pay.`
        : "Checkout opens with everything already in it.",
    };
  }

  return {
    mode: "guided",
    label: `Shop the list on ${storeName}`,
    note: `${storeName} doesn't support pre-filled carts, so open each item and tap “Add to cart”. Your progress is saved on this device.`,
  };
}

function countLabel(items) {
  const n = items.reduce((s, i) => s + i.quantity, 0);
  return n === 1 ? "1 item" : `${n} items`;
}

export function cartTotal(cart) {
  let total = 0;
  let unknown = 0;
  for (const it of cart.items || []) {
    const p = Number(it.price);
    if (Number.isFinite(p) && p > 0) total += p * clampQty(it.quantity);
    else unknown += 1;
  }
  return { total: Math.round(total * 100) / 100, unknown };
}

export function formatMoney(n, currency = "USD") {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(n);
  } catch {
    return `$${Number(n).toFixed(2)}`;
  }
}
