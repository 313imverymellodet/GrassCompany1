import test from "node:test";
import assert from "node:assert/strict";
import { sanitizeCart, sanitizeItem, encodeCart, decodeCart } from "../public/lib/cart.js";

const sample = {
  store: { name: "Amazon", domain: "amazon.com", kind: "amazon" },
  from: "Jordan",
  note: "Thank you!",
  occasion: "Birthday",
  shipTo: { name: "Jordan Smith", address1: "1 Main St", city: "Detroit", region: "MI", postal: "48201", country: "US" },
  items: [
    { title: "Reading lamp", url: "https://www.amazon.com/dp/B000000001", price: 39.99, quantity: 1, image: "https://m.media-amazon.com/images/I/x.jpg", reason: "Warm light" },
    { title: "Throw blanket", url: "https://www.amazon.com/dp/B000000002", price: "$24.50", quantity: 2, variant: "Oat" },
  ],
};

test("sanitizeItem rejects non-http links and markup-y junk", () => {
  assert.equal(sanitizeItem({ title: "x", url: "javascript:alert(1)" }), null);
  assert.equal(sanitizeItem({ title: "", url: "https://a.com" }), null);
  const it = sanitizeItem({ title: "x", url: "https://a.com/p", image: "data:text/html,<b>", price: "-3" });
  assert.equal(it.image, "");
  assert.equal(it.price, null);
});

test("sanitizeCart parses prices and drops an empty address", () => {
  const c = sanitizeCart({ ...sample, shipTo: { name: "x" } });
  assert.equal(c.items[1].price, 24.5);
  assert.equal(c.items[0].asin, "B000000001");
  assert.equal(c.shipTo, null);
  assert.equal(c.store.kind, "amazon");
});

test("encodeCart/decodeCart round-trips and stays link-sized", async () => {
  const token = await encodeCart(sample);
  assert.match(token, /^[A-Za-z0-9_-]+$/);
  assert.ok(token.length < 1200, `token is ${token.length} chars`);
  const back = await decodeCart(token);
  assert.equal(back.from, "Jordan");
  assert.equal(back.shipTo.city, "Detroit");
  assert.equal(back.items.length, 2);
  assert.equal(back.items[0].asin, "B000000001");
  assert.equal(back.items[1].quantity, 2);
  assert.equal(back.items[1].variant, "Oat");
});

test("decodeCart rejects garbage", async () => {
  await assert.rejects(decodeCart("not-a-real-token"));
});
