import test from "node:test";
import assert from "node:assert/strict";
import { resolveStore, asinFromUrl, checkoutPlan, cartTotal, enrichItem } from "../public/lib/stores.js";

test("resolveStore handles names, domains, and URLs", () => {
  assert.deepEqual(resolveStore("Amazon"), { name: "Amazon", domain: "amazon.com", kind: "amazon" });
  assert.equal(resolveStore("https://www.amazon.co.uk/s?k=x").kind, "amazon");
  assert.deepEqual(resolveStore("allbirds.com"), { name: "Allbirds", domain: "allbirds.com", kind: "generic" });
  assert.deepEqual(resolveStore("Lululemon"), { name: "Lululemon", domain: null, kind: "generic" });
  assert.equal(resolveStore("https://www.target.com/p/x").name, "Target");
  assert.equal(resolveStore(""), null);
});

test("asinFromUrl finds ASINs in common Amazon URL shapes", () => {
  assert.equal(asinFromUrl("https://www.amazon.com/Some-Thing/dp/B0C1234567/ref=sr_1_1?x=1"), "B0C1234567");
  assert.equal(asinFromUrl("https://www.amazon.com/gp/product/b0c1234567"), "B0C1234567");
  assert.equal(asinFromUrl("https://www.amazon.com/s?k=lamp"), null);
});

test("Amazon carts get a one-click add-to-cart link", () => {
  const plan = checkoutPlan(
    {
      store: { name: "Amazon", domain: "amazon.com", kind: "amazon" },
      items: [
        { title: "Lamp", url: "https://www.amazon.com/dp/B000000001", quantity: 1 },
        { title: "Mug", url: "https://www.amazon.com/x/dp/B000000002?th=1", quantity: 2 },
      ],
    },
    { amazonTag: "mytag-20" },
  );
  assert.equal(plan.mode, "auto");
  const u = new URL(plan.url);
  assert.equal(u.origin + u.pathname, "https://www.amazon.com/gp/aws/cart/add.html");
  assert.equal(u.searchParams.get("ASIN.1"), "B000000001");
  assert.equal(u.searchParams.get("Quantity.2"), "2");
  assert.equal(u.searchParams.get("AssociateTag"), "mytag-20");
  assert.match(plan.label, /3 items/);
});

test("Amazon cart with a non-product link falls back to the checklist", () => {
  const plan = checkoutPlan({
    store: { name: "Amazon", domain: "amazon.com", kind: "amazon" },
    items: [{ title: "Lamp", url: "https://www.amazon.com/s?k=lamp", quantity: 1 }],
  });
  assert.equal(plan.mode, "guided");
});

test("Shopify carts get a cart permalink with the shipping address", () => {
  const plan = checkoutPlan({
    store: { name: "Allbirds", domain: "allbirds.com", kind: "shopify" },
    shipTo: { name: "Jordan Lee Smith", address1: "1 Main St", city: "Detroit", region: "MI", postal: "48201", country: "US" },
    items: [
      { title: "Runner", url: "https://allbirds.com/products/runner?variant=111", quantity: 1 },
      { title: "Socks", url: "https://allbirds.com/products/socks", variantId: "222", quantity: 3 },
    ],
  });
  assert.equal(plan.mode, "auto");
  const u = new URL(plan.url);
  assert.equal(u.pathname, "/cart/111:1,222:3");
  assert.equal(u.searchParams.get("checkout[shipping_address][first_name]"), "Jordan");
  assert.equal(u.searchParams.get("checkout[shipping_address][last_name]"), "Lee Smith");
  assert.equal(u.searchParams.get("checkout[shipping_address][zip]"), "48201");
});

test("Other stores get the guided checklist", () => {
  const plan = checkoutPlan({ store: { name: "Target", domain: "target.com", kind: "generic" }, items: [{ title: "x", url: "https://target.com/p/x" }] });
  assert.equal(plan.mode, "guided");
  assert.match(plan.label, /Target/);
});

test("cartTotal multiplies quantity and counts unpriced items", () => {
  assert.deepEqual(cartTotal({ items: [{ price: 10.5, quantity: 2 }, { price: null, quantity: 1 }, { price: 0.1, quantity: 3 }] }), {
    total: 21.3,
    unknown: 1,
  });
});

test("enrichItem clamps quantity", () => {
  assert.equal(enrichItem({ url: "https://x.com", quantity: 500 }).quantity, 99);
  assert.equal(enrichItem({ url: "https://x.com", quantity: "abc" }).quantity, 1);
});
