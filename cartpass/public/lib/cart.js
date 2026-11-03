// Cart shape, validation, and the compact link encoding.
// Shared by the browser and the server (Node 18+ has CompressionStream too).

import { enrichItem, clampQty } from "./stores.js";

export const MAX_ITEMS = 40;

const str = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** Only allow http(s) links, so a shared cart can never smuggle in javascript: URLs. */
export function safeUrl(v) {
  if (typeof v !== "string") return "";
  try {
    const u = new URL(v.trim());
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : "";
  } catch {
    return "";
  }
}

function price(v) {
  const n = typeof v === "string" ? Number(v.replace(/[^0-9.-]/g, "")) : Number(v);
  return Number.isFinite(n) && n > 0 && n < 1e6 ? Math.round(n * 100) / 100 : null;
}

export function sanitizeItem(raw) {
  if (!raw || typeof raw !== "object") return null;
  const url = safeUrl(raw.url);
  const title = str(raw.title, 200);
  if (!url || !title) return null;
  const item = enrichItem({
    id: str(raw.id, 40) || randomId(8),
    title,
    url,
    image: safeUrl(raw.image) || "",
    price: price(raw.price),
    quantity: clampQty(raw.quantity),
    variant: str(raw.variant, 120),
    reason: str(raw.reason, 300),
    asin: /^[A-Z0-9]{10}$/i.test(raw.asin || "") ? raw.asin.toUpperCase() : null,
    variantId: /^\d{1,20}$/.test(String(raw.variantId ?? "")) ? String(raw.variantId) : null,
  });
  return item;
}

export function sanitizeCart(raw) {
  const r = raw && typeof raw === "object" ? raw : {};
  const s = r.store && typeof r.store === "object" ? r.store : {};
  const kind = ["amazon", "shopify", "generic"].includes(s.kind) ? s.kind : "generic";
  const domain = /^[a-z0-9.-]{3,100}$/i.test(s.domain || "") ? s.domain.toLowerCase() : null;
  const a = r.shipTo && typeof r.shipTo === "object" ? r.shipTo : null;
  const shipTo = a
    ? {
        name: str(a.name, 80),
        address1: str(a.address1, 120),
        address2: str(a.address2, 120),
        city: str(a.city, 80),
        region: str(a.region, 40),
        postal: str(a.postal, 20),
        country: str(a.country, 40),
      }
    : null;
  return {
    v: 1,
    store: { name: str(s.name, 60) || "Store", domain, kind },
    from: str(r.from, 60),
    note: str(r.note, 600),
    occasion: str(r.occasion, 60),
    currency: /^[A-Z]{3}$/.test(r.currency || "") ? r.currency : "USD",
    shipTo: shipTo && shipTo.address1 ? shipTo : null,
    items: (Array.isArray(r.items) ? r.items : []).map(sanitizeItem).filter(Boolean).slice(0, MAX_ITEMS),
    createdAt: typeof r.createdAt === "string" ? r.createdAt.slice(0, 30) : new Date().toISOString(),
  };
}

export function randomId(len = 10) {
  const alphabet = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(len);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

// ---- link encoding: JSON -> deflate -> base64url, carried in the URL #hash ----
// The hash never reaches a server, so a shipping address in the cart stays
// between the sender and whoever they send the link to.

async function pipe(bytes, stream) {
  const out = new Blob([bytes]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

function toB64url(bytes) {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(s) {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

/** Drop fields the recipient page can rebuild, to keep links short. */
function compact(cart) {
  return {
    ...cart,
    items: cart.items.map(({ id, asin, variantId, ...rest }) => {
      const o = { ...rest };
      if (variantId && !o.url.includes(`variant=${variantId}`)) o.variantId = variantId;
      if (asin && !o.url.toUpperCase().includes(asin)) o.asin = asin;
      for (const k of Object.keys(o)) if (o[k] === "" || o[k] === null) delete o[k];
      return o;
    }),
  };
}

export async function encodeCart(cart) {
  const json = JSON.stringify(compact(sanitizeCart(cart)));
  const packed = await pipe(new TextEncoder().encode(json), new CompressionStream("deflate-raw"));
  return toB64url(packed);
}

export async function decodeCart(token) {
  const bytes = await pipe(fromB64url(token), new DecompressionStream("deflate-raw"));
  return sanitizeCart(JSON.parse(new TextDecoder().decode(bytes)));
}
