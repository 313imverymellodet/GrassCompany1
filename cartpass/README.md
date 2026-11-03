# Cartpass

Tell an AI shopper what you want from any store. It builds the cart. Send the link to someone, and it opens with everything ready so they can order it for you: birthdays, wishlists, "can you grab this for me," and so on.

## How it works

1. **You describe it.** Pick a store (a name like "Amazon" or a link to any shop) and say what you want: sizes, colors, budget.
2. **The agent shops.** Claude (`claude-opus-5-5`) searches that store with web search and web fetch, which are limited to the store's own domain. On Shopify stores it also reads the store's catalog to get exact variant ids. You watch it work, then edit the cart: change quantities, remove items, paste in your own links, or ask for changes ("swap the lamp for something under $40").
3. **You send a link.** Add your name, a note, and an optional shipping address, then text, email, or share the link.
4. **They check out.** How the cart opens depends on the store:

| Store | What the recipient gets |
| --- | --- |
| Amazon (all regions) | One button that adds every item to their Amazon cart, using Amazon's documented [Add to Cart form](https://webservices.amazon.com/paapi5/documentation/add-to-cart-form.html) URL. |
| Shopify stores (Allbirds, Gymshark, and many small brands) | One button that opens checkout with the cart already filled in, using a [cart permalink](https://shopify.dev/docs/apps/checkout/cart-permalinks). Where the store still supports it, your shipping address is filled in too. |
| Everything else (Target, Walmart, Etsy…) | A checklist: open each item, add it to the cart, tick it off. Progress is saved on their device. |

Cartpass never touches payment. The buyer always checks out on the store's own site.

## Run it locally

Requires Node 20+.

```bash
cd cartpass
npm install
cp .env.example .env   # then add your ANTHROPIC_API_KEY
npm run dev            # http://localhost:3000
npm test
```

## Deploy on Vercel

Create a new Vercel project from this repo and set **Root Directory** to `cartpass`. No build step is needed: `public/` is served as static files and `api/` runs as serverless functions. Then add these environment variables:

| Variable | Required | What it does |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | yes | Powers the shopping agent. |
| `CARTPASS_ACCESS_CODE` | recommended | When set, people must enter this code to run the agent, since every run spends your API credits. |
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` | no | Enables short links like `/c/Ab3dE9xYz`. Add Upstash Redis from the Vercel Marketplace and these are filled in for you. Without them, the cart is packed into the link itself (about 500 characters for a few items) and nothing is stored on the server. |
| `AMAZON_ASSOCIATE_TAG` | no | Your Amazon Associates tag, added to Amazon cart links. |
| `CARTPASS_MODEL` | no | Overrides the model. |

The agent endpoint streams for up to 5 minutes (`maxDuration: 300` in `vercel.json`). Most carts take 30 to 90 seconds.

## Layout

```
api/build-cart.js     POST: runs the agent, streams progress as NDJSON
api/carts.js          short-link save/load (only when KV is configured)
api/config.js         tells the front end what's enabled
lib/agent.js          the Claude tool-use loop: add_to_cart, remove_from_cart, shopify_lookup, finish_cart
lib/shopify.js        Shopify storefront catalog lookup
lib/storage.js        Upstash / Vercel KV REST client
public/index.html     builder: request -> live agent feed -> cart editor -> send
public/cart.html      what the recipient sees
public/lib/stores.js  store detection and checkout link builders (shared by browser and server)
public/lib/cart.js    cart validation and link encoding (shared by browser and server)
```

## Privacy notes

- Self-contained links keep the cart, including any shipping address, in the part of the URL after `#`. Browsers never send that part to a server, so the address only reaches the people the link is shared with.
- Short links store the cart in your KV database for 120 days.
- Every link and image URL in a shared cart is validated as http(s), and all cart text is rendered as plain text, so a tampered link can't inject script.
