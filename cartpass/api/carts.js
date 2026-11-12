// POST /api/carts        -> { id }       save a cart for a short link
// GET  /api/carts?id=abc -> { cart }     load it back
// Only active when Upstash / Vercel KV env vars are set.

import { sanitizeCart, randomId } from "../public/lib/cart.js";
import { readJson, sendJson } from "../lib/http.js";
import { storageEnabled, saveCart, loadCart } from "../lib/storage.js";

export default async function handler(req, res) {
  if (!storageEnabled()) return sendJson(res, 404, { error: "Short links aren't enabled on this server." });
  try {
    if (req.method === "POST") {
      const cart = sanitizeCart(await readJson(req, 128 * 1024));
      if (!cart.items.length) return sendJson(res, 400, { error: "The cart is empty." });
      const id = randomId(9);
      await saveCart(id, cart);
      return sendJson(res, 201, { id });
    }
    if (req.method === "GET") {
      const id = new URL(req.url, "http://x").searchParams.get("id") || "";
      if (!/^[A-Za-z0-9]{6,20}$/.test(id)) return sendJson(res, 400, { error: "Bad id." });
      const cart = await loadCart(id);
      return cart ? sendJson(res, 200, { cart: sanitizeCart(cart) }) : sendJson(res, 404, { error: "Cart not found." });
    }
    return sendJson(res, 405, { error: "Method not allowed" });
  } catch (err) {
    console.error("carts failed:", err);
    return sendJson(res, 500, { error: "Couldn't save the cart. Use the full link instead." });
  }
}
