import test from "node:test";
import assert from "node:assert/strict";
import { runCartAgent } from "../lib/agent.js";

// A stand-in for the SDK client: replays scripted assistant turns and records requests.
function fakeClient(turns) {
  const requests = [];
  class APIError extends Error {}
  class FakeAnthropic {
    static APIError = APIError;
    beta = {
      messages: {
        stream: (params) => {
          requests.push(structuredClone(params));
          const next = turns.shift();
          const handlers = {};
          return {
            on(evt, fn) {
              handlers[evt] = fn;
              return this;
            },
            async finalMessage() {
              if (next instanceof Error) throw next;
              for (const block of next.content) handlers.contentBlock?.(block);
              return { role: "assistant", ...next };
            },
          };
        },
      },
    };
  }
  return { client: new FakeAnthropic(), requests, APIError };
}

const toolUse = (id, name, input) => ({ type: "tool_use", id, name, input });

test("agent searches, adds items, enforces store links, and finishes", async () => {
  const { client, requests } = fakeClient([
    {
      stop_reason: "tool_use",
      content: [
        { type: "thinking", thinking: "Looking for a lamp and a blanket.", signature: "" },
        { type: "server_tool_use", id: "s1", name: "web_search", input: { query: "reading lamp" } },
        { type: "web_search_tool_result", tool_use_id: "s1", content: [] },
        toolUse("t1", "add_to_cart", { title: "Lamp", url: "https://www.amazon.com/dp/B000000001", price: 30, image_url: "https://m.media-amazon.com/x.jpg", reason: "Warm light" }),
        toolUse("t2", "add_to_cart", { title: "Elsewhere", url: "https://www.target.com/p/x" }),
        toolUse("t3", "add_to_cart", { title: "Search page", url: "https://www.amazon.com/s?k=blanket" }),
      ],
    },
    { stop_reason: "pause_turn", content: [{ type: "server_tool_use", id: "s2", name: "web_search", input: { query: "throw blanket" } }] },
    {
      stop_reason: "tool_use",
      content: [toolUse("t4", "add_to_cart", { title: "Blanket", url: "https://www.amazon.com/dp/B000000002", price: 25, quantity: 2 })],
    },
    { stop_reason: "tool_use", content: [toolUse("t5", "finish_cart", { summary: "A lamp and two blankets, $80." })] },
  ]);
  const events = [];
  const result = await runCartAgent({
    client,
    request: { store: "Amazon", wishlist: "lamp and blanket", budget: 100 },
    emit: (e) => events.push(e),
  });

  assert.equal(result.summary, "A lamp and two blankets, $80.");
  assert.deepEqual(result.items.map((i) => [i.title, i.asin, i.quantity]), [["Lamp", "B000000001", 1], ["Blanket", "B000000002", 2]]);
  assert.equal(result.store.kind, "amazon");

  // Off-store and non-product links came back as errors the model can fix.
  const firstResults = requests[1].messages.at(-1).content;
  assert.equal(firstResults.length, 3);
  assert.equal(firstResults[0].is_error, undefined);
  assert.match(firstResults[1].content, /not amazon\.com/);
  assert.match(firstResults[2].content, /ASIN/);

  // pause_turn resumed without adding a user message.
  assert.equal(requests[2].messages.at(-1).role, "assistant");

  // Request shape: search scoped to the store, adaptive thinking, fallbacks on, no Shopify tool for Amazon.
  const p = requests[0];
  assert.equal(p.model, "claude-opus-5-5");
  assert.deepEqual(p.thinking, { type: "adaptive", display: "updates" });
  assert.equal(p.fallbacks, "default");
  assert.deepEqual(p.tools.find((t) => t.name === "web_search").allowed_domains, ["amazon.com"]);
  assert.ok(!p.tools.some((t) => t.name === "shopify_lookup"));

  assert.ok(events.some((e) => e.type === "search" && e.query === "reading lamp"));
  assert.ok(events.some((e) => e.type === "note"));
  assert.equal(events.filter((e) => e.type === "item_added").length, 2);
});

test("agent uses shopify_lookup and upgrades the store to Shopify", async () => {
  const fetchImpl = async (url) => {
    const json = (data) => ({ ok: true, headers: new Headers({ "content-type": "application/json" }), json: async () => data });
    if (url.includes("/search/suggest.json")) {
      return json({ resources: { results: { products: [{ title: "Wool Runner", handle: "wool-runner", price: "98.00", image: "//cdn.shopify.com/a.jpg" }] } } });
    }
    if (url.endsWith("/products/wool-runner.js")) {
      return json({ variants: [{ id: 4455, title: "Size 9", price: 9800, available: true }] });
    }
    throw new Error(`unexpected ${url}`);
  };
  const { client, requests } = fakeClient([
    { stop_reason: "tool_use", content: [toolUse("a", "shopify_lookup", { query: "runner" })] },
    {
      stop_reason: "tool_use",
      content: [
        toolUse("b", "add_to_cart", { title: "Wool Runner", url: "https://allbirds.com/products/wool-runner", price: 98, shopify_variant_id: "4455", variant: "Size 9" }),
        toolUse("c", "finish_cart", { summary: "Done." }),
      ],
    },
  ]);
  const events = [];
  const result = await runCartAgent({ client, fetchImpl, request: { store: "allbirds.com", wishlist: "shoes" }, emit: (e) => events.push(e) });
  const lookup = JSON.parse(requests[1].messages.at(-1).content[0].content);
  assert.equal(lookup[0].variants[0].variant_id, "4455");
  assert.equal(lookup[0].image, "https://cdn.shopify.com/a.jpg");
  assert.equal(result.store.kind, "shopify");
  assert.equal(result.items[0].variantId, "4455");
  assert.ok(events.some((e) => e.type === "store" && e.store.kind === "shopify"));
});

test("refinements see the current cart and can remove items", async () => {
  const { client, requests } = fakeClient([
    { stop_reason: "tool_use", content: [toolUse("r", "remove_from_cart", { item_id: "keepme1" }), toolUse("f", "finish_cart", { summary: "Removed it." })] },
  ]);
  const result = await runCartAgent({
    client,
    request: {
      store: "Amazon",
      instruction: "drop the mug",
      currentItems: [{ id: "keepme1", title: "Mug", url: "https://www.amazon.com/dp/B000000009", price: 12 }],
    },
  });
  assert.match(requests[0].messages[0].content, /keepme1: Mug/);
  assert.match(requests[0].messages[0].content, /drop the mug/);
  assert.equal(result.items.length, 0);
});

test("API errors propagate instead of being retried", async () => {
  const { client, APIError } = fakeClient([]);
  const err = new APIError("rate limited");
  client.beta.messages.stream = () => ({ on() { return this; }, finalMessage: async () => { throw err; } });
  await assert.rejects(runCartAgent({ client, request: { store: "Amazon", wishlist: "x" } }), err);
});

test("refusals surface a readable error", async () => {
  const { client } = fakeClient([{ stop_reason: "refusal", content: [] }]);
  await assert.rejects(runCartAgent({ client, request: { store: "Amazon", wishlist: "x" } }), /declined/);
});
