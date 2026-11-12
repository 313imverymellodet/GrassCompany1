// The shopping agent: Claude searches the store and builds a cart through tools.
// `client` is an Anthropic SDK client (injected so tests can use a fake).

import { sanitizeItem, MAX_ITEMS } from "../public/lib/cart.js";
import { cartTotal, hostOf, resolveStore } from "../public/lib/stores.js";
import { shopifySearch, isPublicHostname } from "./shopify.js";

export const DEFAULT_MODEL = "claude-opus-5-5";
const MAX_TURNS = 14;

const SYSTEM = `You are Cartpass, a personal shopper. You build a shopping cart on one specific store for someone, and they will send that cart to a friend or family member who will buy it for them as a gift. So every item you add must be a real, specific, currently sold product page on that store, and the cart should be something the person would be happy to receive.

How to work:
- Find products with the tools you have. When shopify_lookup is available, try it first: it returns exact variant ids, which let the cart open pre-filled for the buyer. If it says the store isn't Shopify, use web_search and web_fetch.
- Add each pick with add_to_cart, using the product page URL on the store's own site (for Amazon, a URL containing /dp/ followed by the ASIN). Include the price you saw, an image URL when you have one, the size/color/variant when it matters, and a short reason written to the buyer.
- Respect the budget if there is one: the cart total should come in at or under it. add_to_cart reports the running total.
- Prefer items that are in stock, well reviewed, and unambiguous (the buyer shouldn't have to guess which size or color). If a detail like size is unknown and matters, pick the most common option and say so in the reason.
- Don't pad the cart. Cover what was asked for, then stop.
- When you are done, call finish_cart with a one or two sentence summary for the person who asked.`;

function toolDefs({ shopifyAvailable }) {
  const custom = [
    {
      name: "add_to_cart",
      description:
        "Add one product to the cart. Returns the updated cart total and item count. Call once per distinct product.",
      eager_input_streaming: true,
      input_schema: {
        type: "object",
        properties: {
          title: { type: "string", description: "Product name as shown on the store." },
          url: { type: "string", description: "Product page URL on the store's own site." },
          price: { type: "number", description: "Unit price in the store's currency, if known." },
          quantity: { type: "integer", minimum: 1, maximum: 20 },
          image_url: { type: "string", description: "Direct product image URL, if known." },
          variant: { type: "string", description: "Size, color, or other option chosen, if any." },
          shopify_variant_id: {
            type: "string",
            description: "Exact variant id from shopify_lookup, when the store is Shopify.",
          },
          reason: { type: "string", description: "One short sentence for the buyer on why this item." },
        },
        required: ["title", "url"],
      },
    },
    {
      name: "remove_from_cart",
      description: "Remove an item that is already in the cart, by its item_id.",
      eager_input_streaming: true,
      input_schema: {
        type: "object",
        properties: { item_id: { type: "string" }, why: { type: "string" } },
        required: ["item_id"],
      },
    },
    {
      name: "finish_cart",
      description: "Call once the cart is complete.",
      eager_input_streaming: true,
      input_schema: {
        type: "object",
        properties: { summary: { type: "string" } },
        required: ["summary"],
      },
    },
  ];
  if (shopifyAvailable) {
    custom.unshift({
      name: "shopify_lookup",
      description:
        "Search this store's own catalog, if it runs on Shopify. Returns products with prices, images, and variant ids. Errors if the store isn't Shopify.",
      eager_input_streaming: true,
      input_schema: {
        type: "object",
        properties: { query: { type: "string", description: "What to search for, e.g. 'wool beanie'." } },
        required: ["query"],
      },
    });
  }
  return custom;
}

function serverTools(domain) {
  const scope = domain ? { allowed_domains: [domain] } : {};
  return [
    { type: "web_search_20260209", name: "web_search", max_uses: 12, ...scope },
    { type: "web_fetch_20260209", name: "web_fetch", max_uses: 10, max_content_tokens: 20000, ...scope },
  ];
}

function describeRequest(req, store, items) {
  const lines = [];
  lines.push(`Store: ${store.name}${store.domain ? ` (${store.domain})` : " (find its official website)"}`);
  if (req.budget) lines.push(`Budget: about ${req.budget} ${req.currency || "USD"} total`);
  if (req.forWhom) lines.push(`The cart is for: ${req.forWhom}`);
  lines.push("", "What they want:", req.wishlist || "(not specified)");
  if (items.length) {
    lines.push("", "Items already in the cart (item_id: title, price x qty):");
    for (const it of items) lines.push(`- ${it.id}: ${it.title}, ${it.price ?? "?"} x ${it.quantity}`);
  }
  if (req.instruction) lines.push("", "Change requested to the current cart:", req.instruction);
  return lines.join("\n");
}

const isStr = (v) => typeof v === "string" && v.trim().length > 0;

/**
 * Run the agent. `emit` receives progress events for the UI:
 *  {type:"status",text} {type:"search",query} {type:"fetch",url} {type:"note",text}
 *  {type:"item_added",item} {type:"item_removed",id} {type:"store",store}
 * Resolves to { store, items, summary }.
 */
export async function runCartAgent({ client, request, emit = () => {}, signal, model = DEFAULT_MODEL, fetchImpl = fetch }) {
  const APIError = client.constructor?.APIError;
  const storeInput = typeof request.store === "string" ? request.store : request.store?.domain || request.store?.name;
  const store = { ...(resolveStore(storeInput) || {}) };
  if (!store.name) throw new Error("Tell me which store to shop at.");
  if (request.store?.kind === "shopify" && store.kind === "generic") store.kind = "shopify";

  let items = (request.currentItems || []).map(sanitizeItem).filter(Boolean);
  let summary = "";
  let finished = false;
  const shopifyAvailable = !!store.domain && store.kind !== "amazon" && isPublicHostname(store.domain);

  const tools = [...serverTools(store.domain), ...toolDefs({ shopifyAvailable })];
  const messages = [{ role: "user", content: describeRequest(request, store, items) }];

  const runTool = async (block) => {
    const input = block.input && typeof block.input === "object" ? block.input : {};
    const fail = (msg) => ({ type: "tool_result", tool_use_id: block.id, is_error: true, content: msg });
    const ok = (data) => ({ type: "tool_result", tool_use_id: block.id, content: JSON.stringify(data) });

    switch (block.name) {
      case "shopify_lookup": {
        if (!isStr(input.query)) return fail("query is required");
        emit({ type: "search", query: input.query });
        try {
          const products = await shopifySearch({ domain: store.domain, query: input.query, fetchImpl, signal });
          if (store.kind !== "shopify") {
            store.kind = "shopify";
            emit({ type: "store", store });
          }
          return ok(products.length ? products : { products: [], hint: "No matches. Try a broader query." });
        } catch (err) {
          return fail(err.message);
        }
      }
      case "add_to_cart": {
        if (!isStr(input.title) || !isStr(input.url)) return fail("title and url are required");
        if (items.length >= MAX_ITEMS) return fail(`The cart is full (${MAX_ITEMS} items).`);
        const host = hostOf(input.url);
        if (store.domain && host && !(host === store.domain || host.endsWith(`.${store.domain}`))) {
          return fail(`That link is on ${host}, not ${store.domain}. Use the product page on ${store.domain}.`);
        }
        const item = sanitizeItem({
          title: input.title,
          url: input.url,
          price: input.price,
          quantity: input.quantity,
          image: input.image_url,
          variant: input.variant,
          reason: input.reason,
          variantId: input.shopify_variant_id,
        });
        if (!item) return fail("That URL isn't a valid http(s) product link.");
        if (store.kind === "amazon" && !item.asin) {
          return fail("Amazon links need the ASIN, like https://www.amazon.com/dp/B0XXXXXXXX. Find the product page URL.");
        }
        const dupe = items.find((i) => i.url === item.url && i.variant === item.variant);
        if (dupe) return fail(`Already in the cart as ${dupe.id}.`);
        items.push(item);
        emit({ type: "item_added", item });
        const { total, unknown } = cartTotal({ items });
        return ok({
          item_id: item.id,
          cart_items: items.length,
          cart_total: total,
          items_without_price: unknown,
          budget: request.budget || null,
        });
      }
      case "remove_from_cart": {
        const before = items.length;
        items = items.filter((i) => i.id !== input.item_id);
        if (items.length === before) return fail(`No item with id ${input.item_id}.`);
        emit({ type: "item_removed", id: input.item_id });
        return ok({ removed: input.item_id, cart_items: items.length, cart_total: cartTotal({ items }).total });
      }
      case "finish_cart": {
        finished = true;
        summary = isStr(input.summary) ? input.summary.trim().slice(0, 600) : "";
        return ok({ done: true });
      }
      default:
        return fail(`Unknown tool ${block.name}`);
    }
  };

  emit({ type: "status", text: `Shopping ${store.name}…` });
  let jsonRetries = 0;

  for (let turn = 0; turn < MAX_TURNS && !finished; turn++) {
    const stream = client.beta.messages.stream(
      {
        model,
        max_tokens: 32000,
        betas: ["server-side-fallback-2026-07-01", "thinking-display-updates-2026-08-18"],
        fallbacks: "default",
        thinking: { type: "adaptive", display: "updates" },
        output_config: { effort: "medium" },
        system: SYSTEM,
        tools,
        messages,
      },
      { signal },
    );
    stream.on("contentBlock", (block) => {
      if (block.type === "server_tool_use" && block.name === "web_search" && block.input?.query) {
        emit({ type: "search", query: block.input.query });
      } else if (block.type === "server_tool_use" && block.name === "web_fetch" && block.input?.url) {
        emit({ type: "fetch", url: block.input.url });
      } else if (block.type === "thinking" && isStr(block.thinking)) {
        emit({ type: "note", text: block.thinking.trim().slice(0, 280) });
      } else if (block.type === "text" && isStr(block.text)) {
        emit({ type: "note", text: block.text.trim().slice(0, 280) });
      }
    });

    let message;
    try {
      message = await stream.finalMessage();
      jsonRetries = 0;
    } catch (err) {
      // Only a tool input that couldn't be parsed is retried; API errors go up.
      if ((APIError && err instanceof APIError) || signal?.aborted || jsonRetries++ >= 2) throw err;
      continue;
    }

    if (message.stop_reason === "refusal") {
      throw new Error("The shopping assistant declined this request. Try rewording what you're looking for.");
    }
    messages.push({ role: "assistant", content: message.content });
    if (message.stop_reason === "pause_turn") continue;

    const toolUses = message.content.filter((b) => b.type === "tool_use");
    if (!toolUses.length) break;
    if (message.stop_reason === "max_tokens") throw new Error("The assistant ran out of room mid-step. Try a shorter request.");

    const results = await Promise.all(toolUses.map(runTool));
    messages.push({ role: "user", content: results });
  }

  if (!summary) {
    summary = items.length
      ? `Picked ${items.length} item${items.length === 1 ? "" : "s"} from ${store.name}.`
      : `I couldn't find matching products on ${store.name}. Try describing what you want differently.`;
  }
  return { store, items, summary };
}
