import { el, $, toast, copyText, tile, icon, hydrateIcons, storeColor, dismissSplash, store as ls } from "/lib/ui.js";
import { resolveStore, cartTotal, formatMoney, clampQty } from "/lib/stores.js";
import { sanitizeItem, sanitizeCart, encodeCart, randomId } from "/lib/cart.js";
import { art } from "/lib/art.js";

// ---------------------------------------------------------------------------
// State (everything lives on this device)
// ---------------------------------------------------------------------------

const KEY = "cartpass:v2";
const fresh = () => ({
  onboarded: false,
  profile: { name: "", shipTo: null, accessCode: "" },
  carts: [],
  composer: { store: null, wishlist: "", budget: "" },
});
let db = { ...fresh(), ...(ls.get(KEY) || {}) };
const save = () => ls.set(KEY, db);

let config = { agentReady: true, accessCodeRequired: false, shortLinks: false };
let running = null; // { controller, cartId, mode }
let currentView = null;
let currentCartId = null;

const getCart = (id) => db.carts.find((c) => c.id === id);
const itemCount = (cart) => cart.items.reduce((s, i) => s + i.quantity, 0);
const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

const VIEWS = ["onboard", "home", "cart", "carts", "you", "shopping"];

function route() {
  closeSheets();
  if (!db.onboarded) return show("onboard");
  const [name, id] = location.hash.replace(/^#\/?/, "").split("/");
  if (name === "cart" && getCart(id)) return show("cart", id);
  if (name === "carts") return show("carts");
  if (name === "you") return show("you");
  if (name === "shopping" && running) return show("shopping");
  return show("home");
}

function show(view, id) {
  const changed = view !== currentView || id !== currentCartId;
  currentView = view;
  currentCartId = id || null;
  for (const v of VIEWS) $(`#v-${v}`).classList.toggle("active", v === view);
  $("#foot").hidden = !["home", "carts", "you"].includes(view);
  $("#navDock").classList.toggle("away", !["home", "carts", "you"].includes(view));
  for (const a of document.querySelectorAll(".nav a")) a.classList.toggle("active", a.dataset.route === view);
  document.body.style.overflow = view === "onboard" || view === "shopping" ? "hidden" : "";
  if (changed) window.scrollTo(0, 0);
  render();
}

function go(hash) {
  if (location.hash === hash) route();
  else location.hash = hash;
}

function render() {
  renderBadges();
  if (currentView === "home") renderHome();
  if (currentView === "cart") renderCart();
  if (currentView === "carts") renderCarts();
  if (currentView === "you") renderProfile();
  if (currentView === "shopping") renderShopping();
  const cart = currentView === "cart" ? getCart(currentCartId) : null;
  $("#cartDock").classList.toggle("away", !cart || !cart.items.length);
}

function renderBadges() {
  const n = db.carts.length;
  for (const b of [$("#cartsBadge"), $("#navBadge")]) {
    b.hidden = !n;
    b.textContent = n;
  }
}

// ---------------------------------------------------------------------------
// Onboarding
// ---------------------------------------------------------------------------

const PIECES = ["headphones", "plant", "clock", "candle", "sneaker", "lipstick", "mug", "bag", "shades", "gift"];
// A ring of resting spots around the centre copy: [x%, y%, rotation, width%].
const RING = [
  [20, 18, -12, 25], [52, 7, 0, 20], [83, 20, 10, 22], [9, 33, 8, 19], [90, 67, -8, 26],
  [13, 73, -18, 20], [38, 89, -6, 25], [84, 86, 8, 23], [64, 96, -4, 19], [61, 71, 6, 18],
];
let obStep = 0;
const floaters = [];

function buildOnboarding() {
  const stage = $("#obStage");
  PIECES.forEach((name, i) => {
    const f = el("div", { class: "floater" }, el("div", { class: "bob", style: { "--d": `${4 + (i % 4) * 0.9}s`, animationDelay: `${-i * 0.7}s` } }, art(name)));
    stage.prepend(f);
    floaters.push(f);
  });
  $("#obDots").replaceChildren(...[1, 2, 3, 4].map(() => el("span")));
  placeFloaters(0);
  $("#obNext").addEventListener("click", nextStep);
  $("#obSkip").addEventListener("click", () => setStep(4));
  $("#obName").addEventListener("keydown", (e) => e.key === "Enter" && finishOnboarding());
}

function placeFloaters(step) {
  floaters.forEach((f, i) => {
    const [x, y, r, s] = RING[(i + step * 3) % RING.length];
    const shrink = step === 4 ? 0.8 : 1;
    f.style.setProperty("--x", `${x}%`);
    f.style.setProperty("--y", `${y}%`);
    f.style.setProperty("--r", `${r + step * 14}deg`);
    f.style.setProperty("--s", `${s}%`);
    f.style.setProperty("--k", shrink);
    f.style.opacity = step === 4 && y > 30 && y < 70 ? "0.35" : "1";
  });
}

function setStep(step) {
  obStep = step;
  placeFloaters(step);
  $("#obMark").classList.toggle("out", step !== 0);
  for (const c of document.querySelectorAll("#obStage [data-step]")) c.classList.toggle("out", Number(c.dataset.step) !== step);
  [...$("#obDots").children].forEach((d, i) => d.classList.toggle("on", i === step - 1));
  $("#obDots").style.visibility = step === 0 ? "hidden" : "visible";
  $("#obSkip").hidden = step === 4;
  $("#obNext").textContent = step === 0 ? "Get started" : step === 4 ? "Let's go" : "Next";
  if (step === 4) {
    $("#obName").value = db.profile.name || "";
    setTimeout(() => $("#obName").focus(), 450);
  }
}

function nextStep() {
  if (obStep === 4) return finishOnboarding();
  if (obStep === 0) {
    // Like a real app warming up: a beat of loading while the objects re-orbit.
    const btn = $("#obNext");
    btn.disabled = true;
    btn.replaceChildren(el("span", { class: "spinner" }));
    placeFloaters(1);
    setTimeout(() => {
      btn.disabled = false;
      setStep(1);
    }, 650);
    return;
  }
  setStep(obStep + 1);
}

function finishOnboarding() {
  db.profile.name = $("#obName").value.trim().slice(0, 40);
  db.onboarded = true;
  save();
  go("#/home");
}

// ---------------------------------------------------------------------------
// Home
// ---------------------------------------------------------------------------

const POPULAR = [
  { q: "Amazon", sub: "Opens with the cart filled", fast: true },
  { q: "Target", sub: "Item-by-item checklist" },
  { q: "Walmart", sub: "Item-by-item checklist" },
  { q: "Best Buy", sub: "Item-by-item checklist" },
  { q: "Etsy", sub: "Item-by-item checklist" },
  { q: "Sephora", sub: "Item-by-item checklist" },
  { q: "IKEA", sub: "Item-by-item checklist" },
  { q: "allbirds.com", label: "Allbirds", sub: "Shopify store · usually opens filled", fast: true },
  { q: "gymshark.com", label: "Gymshark", sub: "Shopify store · usually opens filled", fast: true },
];

const IDEAS = [
  { art: "gift", title: "Birthday wishlist", sub: "Under $100", store: "Amazon", budget: 100, text: "My birthday wishlist: things I'd actually use. I'm into coffee, reading, and cozy stuff." },
  { art: "plant", title: "First apartment", sub: "Cozy basics", store: "Target", budget: 250, text: "Starter kit for my first apartment: a few kitchen basics, bath towels, a plant, and some storage." },
  { art: "sneaker", title: "Gym refresh", sub: "Shoes and gear", store: "Amazon", budget: 200, text: "Gym refresh: running shoes (men's size 10), two moisture-wicking shirts in large, and a big water bottle." },
  { art: "headphones", title: "Dorm essentials", sub: "Move-in ready", store: "Amazon", budget: 300, text: "College dorm essentials: twin XL sheets, a desk lamp, a shower caddy, and noise-cancelling headphones." },
  { art: "candle", title: "Self-care night", sub: "Treat yourself", store: "Amazon", budget: 80, text: "A self-care night in: a nice candle, a sheet mask set, fuzzy socks, and herbal tea." },
  { art: "mug", title: "Coffee corner", sub: "Pour-over setup", store: "Amazon", budget: 150, text: "A pour-over coffee setup: gooseneck kettle, dripper, filters, a nice mug, and whole-bean coffee." },
];

function storeDisc(storeObj, cls = "disc") {
  const name = storeObj?.name || "?";
  return el("span", { class: cls, style: { background: storeColor(name) } }, name.charAt(0).toUpperCase());
}

function initial(name) {
  return (name || "").trim().charAt(0).toUpperCase();
}

function setAvatar(node) {
  const i = initial(db.profile.name);
  node.replaceChildren(i ? i : icon("user"));
}

function buildHome() {
  $("#buildBtn").append(icon("arrow"));
  $("#ideaGrid").replaceChildren(
    ...IDEAS.map((idea) =>
      el(
        "button",
        { type: "button", class: "idea", onclick: () => useIdea(idea) },
        el("div", { class: "art-wrap" }, art(idea.art)),
        el("b", {}, idea.title),
        el("span", {}, `${idea.store} · ${idea.sub}`),
      ),
    ),
  );
  $("#ideasPill").addEventListener("click", (e) => {
    e.preventDefault();
    $("#ideas").scrollIntoView({ behavior: "smooth", block: "start" });
  });
  $("#wishlist").addEventListener("input", () => {
    db.composer.wishlist = $("#wishlist").value;
    save();
    syncComposer();
  });
  $("#budget").addEventListener("input", () => {
    db.composer.budget = $("#budget").value;
    save();
  });
  $("#storeBtn").addEventListener("click", () => openSheet("storeSheet"));
  $("#composer").addEventListener("submit", (e) => {
    e.preventDefault();
    startBuild();
  });
  $("#manualBtn").addEventListener("click", startManual);
}

function useIdea(idea) {
  db.composer = { store: resolveStore(idea.store), wishlist: idea.text, budget: String(idea.budget) };
  save();
  renderHome();
  window.scrollTo({ top: 0, behavior: "smooth" });
  setTimeout(() => $("#wishlist").focus({ preventScroll: true }), 300);
}

function syncComposer() {
  const c = db.composer;
  $("#buildBtn").disabled = !(c.store && c.wishlist.trim()) || !!running;
}

function renderHome() {
  setAvatar($("#homeAvatar"));
  $("#hello").textContent = db.profile.name ? `Hi ${db.profile.name}` : "Hi there";
  const c = db.composer;
  const disc = $("#storeDisc");
  if (c.store) {
    disc.className = "disc";
    disc.style.background = storeColor(c.store.name);
    disc.replaceChildren(c.store.name.charAt(0).toUpperCase());
    $("#storeName").textContent = c.store.name;
  } else {
    disc.className = "disc empty";
    disc.style.background = "";
    disc.replaceChildren(icon("bag"));
    $("#storeName").textContent = "Pick a store";
  }
  if (!$("#storeBtn").querySelector(":scope > svg")) $("#storeBtn").append(icon("down"));
  if (document.activeElement !== $("#wishlist")) $("#wishlist").value = c.wishlist || "";
  if (document.activeElement !== $("#budget")) $("#budget").value = c.budget || "";
  syncComposer();

  const recent = db.carts.slice(0, 8);
  $("#recentCard").hidden = !recent.length;
  $("#recentRow").replaceChildren(...recent.map(cartThumb));
}

function collage(cart) {
  const imgs = cart.items.slice(0, 4);
  const box = el("div", { class: "collage" });
  if (!imgs.length) box.append(el("div", {}, storeDisc(cart.store, "disc-sm")));
  for (const it of imgs) {
    const cell = el("div");
    if (it.image) {
      const img = el("img", { src: it.image, alt: "", loading: "lazy", referrerpolicy: "no-referrer" });
      img.addEventListener("error", () => img.replaceWith(initial(it.title)));
      cell.append(img);
    } else cell.append(initial(it.title));
    box.append(cell);
  }
  return box;
}

function cartThumb(cart) {
  const { total } = cartTotal(cart);
  return el(
    "a",
    { class: "cart-thumb", href: `#/cart/${cart.id}` },
    collage(cart),
    el("div", { class: "name" }, cart.store.name),
    el("div", { class: "sub" }, `${plural(itemCount(cart), "item")}${total ? ` · ${formatMoney(total)}` : ""}`),
  );
}

// ---------------------------------------------------------------------------
// Store picker sheet
// ---------------------------------------------------------------------------

function renderStoreList() {
  const q = $("#storeSearch").value.trim();
  const ql = q.toLowerCase();
  const rows = [];
  if (q) {
    const r = resolveStore(q);
    const known = POPULAR.some((p) => (p.label || p.q).toLowerCase() === ql || p.q.toLowerCase() === ql);
    if (r && !known) {
      rows.push({
        store: r,
        label: r.domain ? r.domain : `“${q}”`,
        sub: r.kind === "amazon" ? "Opens with the cart filled" : r.domain ? "Any shop works" : "We'll find their website",
        fast: r.kind === "amazon",
        custom: true,
      });
    }
  }
  for (const p of POPULAR) {
    const label = p.label || p.q;
    if (ql && !label.toLowerCase().includes(ql) && !p.q.toLowerCase().includes(ql)) continue;
    rows.push({ store: { ...resolveStore(p.q), name: label }, label, sub: p.sub, fast: p.fast });
  }
  $("#storeList").replaceChildren(
    ...rows.map((r) =>
      el(
        "li",
        {},
        el(
          "button",
          { type: "button", onclick: () => pickStore(r.store) },
          r.custom ? el("span", { class: "disc-sm", style: { background: "var(--surface-2)", color: "var(--ink-2)" } }, icon(r.store.domain ? "link" : "search")) : storeDisc(r.store, "disc-sm"),
          el("span", { class: "grow" }, el("b", {}, r.custom ? `Shop at ${r.label}` : r.label), el("small", {}, r.sub)),
          r.fast ? el("span", { class: "tag" }, icon("bolt"), "1-tap") : null,
        ),
      ),
    ),
  );
  if (!rows.length) $("#storeList").append(el("li", { class: "empty" }, "Type a store name or paste a link."));
}

function pickStore(store) {
  db.composer.store = store;
  save();
  closeSheets();
  renderHome();
  $("#wishlist").focus({ preventScroll: true });
}

// ---------------------------------------------------------------------------
// Agent runs
// ---------------------------------------------------------------------------

function newCart(store, request) {
  const now = new Date().toISOString();
  const cart = { id: randomId(8), store, items: [], summary: "", request, send: { occasion: "", note: "" }, link: null, createdAt: now, updatedAt: now };
  db.carts.unshift(cart);
  save();
  return cart;
}

function startBuild() {
  const c = db.composer;
  if (!c.store || !c.wishlist.trim() || running) return;
  if (!config.agentReady) return toast("The shopping assistant isn't set up here yet");
  if (config.accessCodeRequired && !db.profile.accessCode) {
    toast("Add the access code in your profile first");
    return go("#/you");
  }
  const request = { wishlist: c.wishlist.trim(), budget: Number(c.budget) || null };
  const cart = newCart(c.store, request);
  db.composer = { store: c.store, wishlist: "", budget: "" };
  save();
  runAgent(cart, { store: c.store.domain || c.store.name, ...request }, "build");
}

function startManual() {
  const store = db.composer.store;
  if (!store) {
    toast("Pick a store first");
    return openSheet("storeSheet");
  }
  const cart = newCart(store, { wishlist: db.composer.wishlist.trim(), budget: Number(db.composer.budget) || null });
  go(`#/cart/${cart.id}`);
  setTimeout(() => openSheet("addSheet"), 250);
}

const shop = { status: "", feed: [], error: null, done: false, freshIds: new Set(), cartId: null, ghost: null };

async function runAgent(cart, body, mode) {
  const controller = new AbortController();
  running = { controller, cartId: cart.id, mode };
  shop.mode = mode;
  Object.assign(shop, { status: "Getting started…", feed: [], error: null, done: false, freshIds: new Set(), cartId: cart.id, ghost: cart });
  go("#/shopping");

  const headers = { "content-type": "application/json" };
  if (db.profile.accessCode) headers["x-access-code"] = db.profile.accessCode;
  const startItems = cart.items.length;

  let finished = false;
  try {
    const res = await fetch("/api/build-cart", { method: "POST", headers, body: JSON.stringify(body), signal: controller.signal });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Request failed (${res.status})`);
    }
    const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
    let buf = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += value;
      let nl;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (line) finished = handleEvent(cart, JSON.parse(line)) || finished;
      }
    }
    if (!finished) throw new Error("The connection closed early.");
  } catch (err) {
    shop.error = err.name === "AbortError" ? null : err.message;
  } finally {
    running = null;
    cart.updatedAt = new Date().toISOString();
    save();
  }

  const hasItems = cart.items.length > 0;
  if (finished) {
    shop.done = true;
    shop.status = cart.summary || "Cart ready.";
    if (currentView === "shopping") renderShopping();
    setTimeout(() => currentView === "shopping" && go(`#/cart/${cart.id}`), 1100);
  } else if (hasItems && (shop.error === null || cart.items.length > startItems || mode === "refine")) {
    if (shop.error) toast(shop.error);
    go(`#/cart/${cart.id}`);
  } else {
    // Nothing found: put the request back in the composer and show what went wrong.
    if (mode === "build") {
      db.carts = db.carts.filter((c) => c.id !== cart.id);
      db.composer = { store: cart.store, wishlist: cart.request.wishlist, budget: cart.request.budget ? String(cart.request.budget) : "" };
      save();
    }
    if (shop.error) {
      if (currentView === "shopping") renderShopping();
    } else go(mode === "build" ? "#/home" : `#/cart/${cart.id}`);
  }
}

function pushFeed(glyph, text) {
  shop.feed.push({ glyph, text });
  if (shop.feed.length > 4) shop.feed.shift();
  shop.status = text;
}

function handleEvent(cart, ev) {
  switch (ev.type) {
    case "status":
      pushFeed("•", ev.text);
      break;
    case "search":
      pushFeed("⌕", `Searching “${ev.query}”`);
      break;
    case "fetch":
      pushFeed("↗", `Reading ${shortUrl(ev.url)}`);
      break;
    case "note":
      pushFeed("…", ev.text);
      break;
    case "store":
      cart.store = { ...ev.store, name: cart.store.name || ev.store.name };
      break;
    case "item_added": {
      const item = sanitizeItem(ev.item);
      if (item) {
        cart.items.push(item);
        shop.freshIds.add(item.id);
        pushFeed("+", `Added ${item.title}`);
      }
      break;
    }
    case "item_removed": {
      const gone = cart.items.find((i) => i.id === ev.id);
      cart.items = cart.items.filter((i) => i.id !== ev.id);
      if (gone) pushFeed("−", `Removed ${gone.title}`);
      break;
    }
    case "done":
      cart.store = { ...(ev.store || cart.store), name: cart.store.name || ev.store?.name };
      cart.items = (ev.items || []).map(sanitizeItem).filter(Boolean);
      cart.summary = ev.summary || "";
      pushFeed("✓", "Cart ready");
      if (currentView === "shopping") renderShopping();
      return true;
    case "error":
      throw new Error(ev.message);
  }
  if (currentView === "shopping") renderShopping();
  return false;
}

const shortUrl = (u) => {
  try {
    const x = new URL(u);
    return x.hostname.replace(/^www\./, "") + (x.pathname.length > 1 ? x.pathname.slice(0, 28) + (x.pathname.length > 28 ? "…" : "") : "");
  } catch {
    return u;
  }
};

function productCard(item, cart, { editable = false, dark = false } = {}) {
  const t = tile(item, cart.store?.name);
  if (item.price) t.append(el("span", { class: "price-pill" }, formatMoney(item.price)));
  if (!editable && item.quantity > 1) t.append(el("span", { class: "qty-pill" }, `×${item.quantity}`));
  if (editable) {
    t.append(el("button", { type: "button", class: "fab", "aria-label": `Remove ${item.title}`, onclick: () => removeItem(cart, item.id) }, icon("close")));
  }
  const card = el(
    "li",
    { class: `product${shop.freshIds.has(item.id) ? " enter" : ""}` },
    t,
    el("a", { class: "name", href: item.url, target: "_blank", rel: "noopener noreferrer" }, item.title),
    item.variant ? el("div", { class: "sub" }, item.variant) : null,
    !dark && item.reason ? el("div", { class: "reason" }, item.reason) : null,
    editable
      ? el(
          "div",
          { class: "stepper" },
          el("button", { type: "button", "aria-label": `Fewer ${item.title}`, onclick: () => setQty(cart, item.id, item.quantity - 1) }, "−"),
          el("span", { "aria-label": "Quantity" }, item.quantity),
          el("button", { type: "button", "aria-label": `More ${item.title}`, onclick: () => setQty(cart, item.id, item.quantity + 1) }, "+"),
        )
      : null,
  );
  return card;
}

function renderShopping() {
  const cart = getCart(shop.cartId) || shop.ghost;
  if (!cart) return;
  const disc = $("#shopDisc");
  disc.style.background = storeColor(cart.store.name);
  disc.textContent = cart.store.name.charAt(0).toUpperCase();
  $("#shopStore").textContent = `Shopping ${cart.store.name}`;
  const refine = (running?.mode || shop.mode) === "refine";

  const orb = $("#orb");
  orb.classList.toggle("done", shop.done);
  orb.replaceChildren(shop.done ? icon("check") : "");
  if (shop.done) orb.style.cssText = "display:grid;place-items:center;color:#fff";
  else orb.style.cssText = "";

  const headline = shop.error
    ? ["That didn't", "work out"]
    : shop.done
      ? ["Your cart", "is ready"]
      : refine
        ? ["Updating", "your cart"]
        : cart.items.length
          ? ["Filling", "your cart"]
          : ["Finding the", "good stuff"];
  $("#shopHeadline").replaceChildren(headline[0], el("br"), headline[1]);
  $("#shopStatus").textContent = shop.error || shop.status;

  const stop = $("#stopBtn");
  stop.replaceChildren(icon(running ? "stop" : "back"), running ? "Stop" : "Back");

  const grid = $("#liveGrid");
  grid.replaceChildren(
    ...cart.items.map((it) => productCard(it, cart, { dark: true })),
    ...(running ? [0, 1].slice(0, cart.items.length % 2 ? 1 : 2).map(() => el("li", { class: "product", "aria-hidden": "true" }, el("div", { class: "placeholder" }), el("div", { class: "placeholder-line" }), el("div", { class: "placeholder-line short" }))) : []),
  );
  $("#feed").replaceChildren(...shop.feed.map((f) => el("li", {}, el("span", { class: "ico", "aria-hidden": "true" }, f.glyph), el("span", {}, f.text))));
}

// ---------------------------------------------------------------------------
// Cart screen
// ---------------------------------------------------------------------------

function touch(cart) {
  cart.updatedAt = new Date().toISOString();
  cart.link = null;
  save();
  render();
}

function setQty(cart, id, q) {
  const item = cart.items.find((i) => i.id === id);
  if (!item) return;
  if (q < 1) return removeItem(cart, id);
  item.quantity = clampQty(q);
  touch(cart);
}

function removeItem(cart, id) {
  cart.items = cart.items.filter((i) => i.id !== id);
  touch(cart);
}

function renderCart() {
  const cart = getCart(currentCartId);
  if (!cart) return go("#/home");
  shop.freshIds.clear();
  $("#cartTitle").textContent = cart.store.name;
  $("#cartHeadline").textContent = `Your ${cart.store.name} cart`;
  $("#cartSummary").hidden = !cart.summary;
  $("#cartSummary").textContent = cart.summary;
  $("#refineCard").hidden = !config.agentReady || !cart.items.length;

  $("#items").replaceChildren(
    ...cart.items.map((it) => productCard(it, cart, { editable: true })),
    el("li", { class: "product" }, el("button", { type: "button", class: "add-tile", onclick: () => openSheet("addSheet") }, icon("plus"), "Add item")),
  );

  const { total, unknown } = cartTotal(cart);
  const n = itemCount(cart);
  $("#total").textContent = formatMoney(total);
  $("#totalNote").textContent = unknown ? `${plural(n, "item")} · ${unknown} unpriced` : `${plural(n, "item")} · ${cart.store.name}`;
}

function renderCarts() {
  const list = $("#cartList");
  if (!db.carts.length) {
    list.replaceChildren(
      el(
        "li",
        { class: "card center" },
        el("div", { style: { width: "110px", margin: "0 auto 8px" } }, art("bag")),
        el("h3", {}, "No carts yet"),
        el("p", { class: "muted", style: { margin: "6px 0 16px" } }, "Describe what you want and we'll build your first one."),
        el("a", { class: "btn btn-brand", href: "#/home" }, "Start a cart"),
      ),
    );
    return;
  }
  list.replaceChildren(
    ...db.carts.map((cart) => {
      const { total } = cartTotal(cart);
      return el(
        "li",
        {},
        el(
          "a",
          { class: "cart-item", href: `#/cart/${cart.id}` },
          collage(cart),
          el(
            "div",
            { class: "grow" },
            el("div", { class: "t" }, cart.store.name, el("span", { class: `status-tag${cart.link ? " sent" : ""}` }, cart.link ? "Link ready" : "Draft")),
            el("div", { class: "s" }, `${plural(itemCount(cart), "item")}${total ? ` · ${formatMoney(total)}` : ""}`),
            cart.request?.wishlist ? el("div", { class: "s" }, cart.request.wishlist) : null,
          ),
          icon("chevron"),
        ),
      );
    }),
  );
}

// ---------------------------------------------------------------------------
// Send sheet
// ---------------------------------------------------------------------------

const OCCASIONS = ["Birthday", "Holiday", "Housewarming", "Graduation", "Wedding", "Baby shower", "Just because"];

function addressLine(a) {
  return a ? [a.address1, a.city, a.region].filter(Boolean).join(", ") : "";
}

function openSend() {
  const cart = getCart(currentCartId);
  if (!cart || !cart.items.length) return;
  $("#sendFormWrap").hidden = false;
  $("#shareBox").hidden = true;
  $("#fromName").value = cart.send.from || db.profile.name || "";
  $("#note").value = cart.send.note || "";
  $("#occasionChips").replaceChildren(
    ...OCCASIONS.map((o) =>
      el(
        "button",
        {
          type: "button",
          class: "chip",
          "aria-pressed": String(cart.send.occasion === o),
          onclick: (e) => {
            cart.send.occasion = cart.send.occasion === o ? "" : o;
            for (const b of $("#occasionChips").children) b.setAttribute("aria-pressed", String(b.textContent === cart.send.occasion));
            e.currentTarget.blur();
          },
        },
        o,
      ),
    ),
  );
  const addr = db.profile.shipTo;
  $("#shipToggle").disabled = !addr;
  $("#shipToggle").checked = !!addr && cart.send.includeAddress !== false;
  $("#shipPreview").textContent = addr ? addressLine(addr) : "Add one in your profile first";
  openSheet("sendSheet");
}

async function makeLink() {
  const cart = getCart(currentCartId);
  if (!cart) return;
  cart.send.from = $("#fromName").value.trim();
  cart.send.note = $("#note").value.trim();
  cart.send.includeAddress = $("#shipToggle").checked;
  if (!db.profile.name && cart.send.from) db.profile.name = cart.send.from;

  const payload = sanitizeCart({
    store: cart.store,
    items: cart.items,
    from: cart.send.from,
    note: cart.send.note,
    occasion: cart.send.occasion,
    shipTo: cart.send.includeAddress ? db.profile.shipTo : null,
    createdAt: new Date().toISOString(),
  });
  const btn = $("#makeLinkBtn");
  btn.disabled = true;
  let url = null;
  if (config.shortLinks) {
    try {
      const res = await fetch("/api/carts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      if (res.ok) url = `${location.origin}/c/${(await res.json()).id}`;
    } catch {
      /* fall back to a self-contained link */
    }
  }
  url ??= `${location.origin}/cart#c=${await encodeCart(payload)}`;
  btn.disabled = false;
  cart.link = url;
  save();

  const who = payload.from || "Someone";
  const msg = `${who} put together a cart on ${payload.store.name}${payload.occasion ? ` for their ${payload.occasion.toLowerCase()}` : ""}. Open it to see everything and check out in a couple of taps: ${url}`;
  $("#shareUrl").value = url;
  $("#previewLink").href = url;
  $("#smsLink").href = `sms:?&body=${encodeURIComponent(msg)}`;
  $("#mailLink").href = `mailto:?subject=${encodeURIComponent(`${who}'s ${payload.store.name} cart`)}&body=${encodeURIComponent(msg)}`;
  $("#nativeShare").onclick = () => {
    if (navigator.share) navigator.share({ title: `${who}'s cart`, text: msg.replace(url, "").trim(), url }).catch(() => {});
    else copyText(url, "Link copied");
  };
  $("#sendFormWrap").hidden = true;
  $("#shareBox").hidden = false;
}

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

const ADDR_FIELDS = { sName: "name", sAddr1: "address1", sAddr2: "address2", sCity: "city", sRegion: "region", sPostal: "postal", sCountry: "country" };

function renderProfile() {
  setAvatar($("#youAvatar"));
  $("#youName").textContent = db.profile.name || "You";
  if (document.activeElement?.closest("#profileForm")) return;
  $("#pName").value = db.profile.name || "";
  const a = db.profile.shipTo || {};
  for (const [id, k] of Object.entries(ADDR_FIELDS)) $(`#${id}`).value = a[k] || (k === "country" ? "US" : "");
  $("#accessCard").hidden = !config.accessCodeRequired;
  $("#accessCode").value = db.profile.accessCode || "";
}

function saveProfile(e) {
  e.preventDefault();
  db.profile.name = $("#pName").value.trim().slice(0, 40);
  const a = {};
  for (const [id, k] of Object.entries(ADDR_FIELDS)) a[k] = $(`#${id}`).value.trim();
  db.profile.shipTo = a.address1 ? a : null;
  db.profile.accessCode = $("#accessCode").value.trim();
  save();
  document.activeElement?.blur();
  render();
  toast("Saved");
}

// ---------------------------------------------------------------------------
// Sheets
// ---------------------------------------------------------------------------

function openSheet(id) {
  closeSheets();
  $("#scrim").classList.add("open");
  const s = $(`#${id}`);
  s.classList.add("open");
  if (id === "storeSheet") {
    $("#storeSearch").value = "";
    renderStoreList();
    setTimeout(() => $("#storeSearch").focus({ preventScroll: true }), 350);
  }
  if (id === "addSheet") setTimeout(() => $("#mUrl").focus({ preventScroll: true }), 350);
}

function closeSheets() {
  $("#scrim").classList.remove("open");
  for (const s of document.querySelectorAll(".sheet.open")) s.classList.remove("open");
}

// ---------------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------------

async function loadConfig() {
  try {
    const res = await fetch("/api/config");
    if (res.ok) config = await res.json();
  } catch {
    config = { agentReady: false, accessCodeRequired: false, shortLinks: false, offline: true };
  }
  if (!config.agentReady) {
    $("#setupBanner").hidden = false;
    $("#setupBanner").textContent = config.offline
      ? "The shopping assistant isn't reachable from here. You can still add items yourself."
      : "The shopping assistant isn't set up on this server yet. You can still add items yourself.";
  }
  render();
}

$("#scrim").addEventListener("click", closeSheets);
for (const b of document.querySelectorAll("[data-close]")) b.addEventListener("click", closeSheets);
document.addEventListener("keydown", (e) => e.key === "Escape" && closeSheets());
$("#storeSearch").addEventListener("input", renderStoreList);
$("#storeSearch").addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    $("#storeList button")?.click();
  }
});

$("#stopBtn").addEventListener("click", () => {
  if (running) running.controller.abort();
  else go("#/home");
});

$("#refineForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const cart = getCart(currentCartId);
  const instruction = $("#refine").value.trim();
  if (!cart || !instruction || running) return;
  $("#refine").value = "";
  cart.link = null;
  runAgent(
    cart,
    { store: cart.store.domain || cart.store.name, wishlist: cart.request?.wishlist, budget: cart.request?.budget, instruction, currentItems: cart.items },
    "refine",
  );
});

$("#manualForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const cart = getCart(currentCartId);
  if (!cart) return;
  const item = sanitizeItem({ id: randomId(8), url: $("#mUrl").value, title: $("#mTitle").value, price: $("#mPrice").value, quantity: $("#mQty").value, variant: $("#mVariant").value });
  if (!item) return toast("That link doesn't look right");
  cart.items.push(item);
  e.target.reset();
  $("#mQty").value = 1;
  closeSheets();
  touch(cart);
  toast("Added to cart");
});

$("#deleteCart").addEventListener("click", () => {
  const cart = getCart(currentCartId);
  if (!cart || !confirm(`Delete this ${cart.store.name} cart?`)) return;
  db.carts = db.carts.filter((c) => c.id !== cart.id);
  save();
  go("#/carts");
});

$("#sendBtn").addEventListener("click", openSend);
$("#sendForm").addEventListener("submit", (e) => {
  e.preventDefault();
  makeLink();
});
$("#copyBtn").addEventListener("click", () => copyText($("#shareUrl").value, "Link copied"));
$("#profileForm").addEventListener("submit", saveProfile);
$("#resetAll").addEventListener("click", () => {
  if (!confirm("Clear your name, address, and all carts from this device?")) return;
  db = fresh();
  save();
  location.hash = "";
  location.reload();
});

hydrateIcons();
buildOnboarding();
buildHome();
setStep(0);
window.addEventListener("hashchange", route);
route();
loadConfig();
dismissSplash(900);
