import { el, $, toast, copyText, tile, icon, hydrateIcons, storeColor, dismissSplash, store as ls } from "/lib/ui.js";
import { resolveStore, cartTotal, formatMoney, clampQty } from "/lib/stores.js";
import { sanitizeItem, sanitizeCart, encodeCart, randomId } from "/lib/cart.js";

const DRAFT_KEY = "cartpass:draft";
const STORE_CHIPS = ["Amazon", "Target", "Walmart", "Etsy", "Best Buy", "Sephora"];

let config = { agentReady: true, accessCodeRequired: false, shortLinks: false };
let state = ls.get(DRAFT_KEY) || {};
state.cart ??= null; // { store, items, summary }
state.send ??= {};
let running = null; // AbortController while the agent works

const save = () => ls.set(DRAFT_KEY, state);

// ---------- setup ----------

async function loadConfig() {
  try {
    const res = await fetch("/api/config");
    if (res.ok) config = await res.json();
  } catch {
    /* static preview without the API: manual mode still works */
    config = { agentReady: false, accessCodeRequired: false, shortLinks: false, offline: true };
  }
  $("#accessField").hidden = !config.accessCodeRequired;
  if (!config.agentReady) {
    const b = $("#setupBanner");
    b.hidden = false;
    b.textContent = config.offline
      ? "The shopping assistant isn't reachable from here. You can still add items yourself."
      : "The shopping assistant isn't set up on this server yet (it needs an ANTHROPIC_API_KEY). You can still add items yourself.";
  }
}

function initForm() {
  const chips = $("#storeChips");
  for (const name of STORE_CHIPS) {
    chips.append(
      el(
        "button",
        { type: "button", class: "chip", onclick: () => { $("#storeInput").value = name; syncChips(); } },
        el("span", { class: "disc", style: { background: storeColor(name) } }, name.charAt(0)),
        name,
      ),
    );
  }
  $("#storeInput").addEventListener("input", syncChips);

  const r = state.request || {};
  $("#storeInput").value = r.store || "";
  $("#wishlist").value = r.wishlist || "";
  $("#budget").value = r.budget || "";
  $("#accessCode").value = ls.get("cartpass:code", "");
  syncChips();

  const s = state.send;
  $("#fromName").value = s.from || "";
  $("#occasion").value = s.occasion || "";
  $("#note").value = s.note || "";
  const a = s.shipTo || {};
  $("#sName").value = a.name || "";
  $("#sAddr1").value = a.address1 || "";
  $("#sAddr2").value = a.address2 || "";
  $("#sCity").value = a.city || "";
  $("#sRegion").value = a.region || "";
  $("#sPostal").value = a.postal || "";
  $("#sCountry").value = a.country || "US";
  if (a.address1) $("#shipDetails").open = true;
}

function syncChips() {
  const v = $("#storeInput").value.trim().toLowerCase();
  for (const c of $("#storeChips").children) c.setAttribute("aria-pressed", String(c.textContent.toLowerCase() === v));
}

function readRequest() {
  return {
    store: $("#storeInput").value.trim(),
    wishlist: $("#wishlist").value.trim(),
    budget: Number($("#budget").value) || null,
  };
}

// ---------- agent ----------

function feedLine(glyph, text) {
  const feed = $("#feed");
  feed.append(el("li", {}, el("span", { class: "ico", "aria-hidden": "true" }, glyph), el("span", {}, text)));
  while (feed.children.length > 4) feed.firstElementChild.remove();
}

/** Live tiles in the dark card: found items, then one shimmering placeholder while working. */
function renderLiveTiles() {
  const row = $("#liveTiles");
  const items = state.cart?.items || [];
  row.replaceChildren(
    ...items.map((item) =>
      el("div", { class: "product" }, (() => {
        const t = tile(item, state.cart.store?.name);
        if (item.price) t.append(el("span", { class: "price-pill" }, formatMoney(item.price)));
        return t;
      })()),
    ),
    ...(running ? [el("div", { class: "placeholder", "aria-hidden": "true" })] : []),
  );
  row.hidden = !items.length && !running;
}

function setProgressState(mode) {
  const btn = $("#progBtn");
  btn.replaceChildren(icon(mode === "running" ? "stop" : "arrow"));
  btn.setAttribute("aria-label", mode === "running" ? "Stop shopping" : "Go to your cart");
  $("#progSpin").hidden = mode !== "running";
  $("#progressTitle").replaceChildren(
    ...(mode === "running" ? ["Building", el("br"), "your cart"] : mode === "done" ? ["Your cart", el("br"), "is ready"] : ["Stopped"]),
  );
}

async function runAgent(body, { replaceItems }) {
  if (running) return;
  running = new AbortController();
  $("#progressCard").hidden = false;
  setProgressState("running");
  $("#feed").replaceChildren();
  $("#buildBtn").disabled = true;
  $("#shareBox").hidden = true;

  // Live items appear as the agent adds them (refinements start from the current cart).
  state.cart = {
    store: state.cart?.store || resolveStore(body.store),
    items: replaceItems ? [] : [...(state.cart?.items || [])],
    summary: "",
  };
  $("#progressLabel").textContent = `Shopping ${state.cart.store?.name || body.store}`;
  renderCart();
  $("#progressCard").scrollIntoView({ behavior: "smooth", block: "start" });

  const headers = { "content-type": "application/json" };
  const code = $("#accessCode").value.trim();
  if (code) {
    headers["x-access-code"] = code;
    ls.set("cartpass:code", code);
  }

  let finished = false;
  try {
    const res = await fetch("/api/build-cart", {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: running.signal,
    });
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
        if (line) finished = handleEvent(JSON.parse(line)) || finished;
      }
    }
    if (!finished) throw new Error("The connection closed early. What was found so far is kept.");
  } catch (err) {
    if (err.name === "AbortError") feedLine("■", "Stopped. Kept what was found so far.");
    else feedLine("!", err.message);
  } finally {
    running = null;
    $("#buildBtn").disabled = false;
    setProgressState(finished ? "done" : "stopped");
    save();
    renderCart();
  }
}

function handleEvent(ev) {
  const cart = state.cart;
  switch (ev.type) {
    case "status":
      feedLine("•", ev.text);
      break;
    case "search":
      feedLine("⌕", `Searching “${ev.query}”`);
      break;
    case "fetch":
      feedLine("↗", `Reading ${shortUrl(ev.url)}`);
      break;
    case "note":
      feedLine("…", ev.text);
      break;
    case "store":
      cart.store = ev.store;
      break;
    case "item_added": {
      const item = sanitizeItem(ev.item);
      if (item) {
        cart.items.push(item);
        feedLine("+", `Added ${item.title}${item.price ? ` (${formatMoney(item.price)})` : ""}`);
        renderCart();
      }
      break;
    }
    case "item_removed": {
      const gone = cart.items.find((i) => i.id === ev.id);
      cart.items = cart.items.filter((i) => i.id !== ev.id);
      if (gone) feedLine("−", `Removed ${gone.title}`);
      renderCart();
      break;
    }
    case "done":
      cart.store = ev.store || cart.store;
      cart.items = (ev.items || []).map(sanitizeItem).filter(Boolean);
      cart.summary = ev.summary || "";
      feedLine("✓", ev.summary || "Cart ready.");
      return true;
    case "error":
      throw new Error(ev.message);
  }
  return false;
}

const shortUrl = (u) => {
  try {
    const x = new URL(u);
    return x.hostname.replace(/^www\./, "") + (x.pathname.length > 1 ? x.pathname.slice(0, 32) + (x.pathname.length > 32 ? "…" : "") : "");
  } catch {
    return u;
  }
};

// ---------- cart ----------

function renderCart() {
  const cart = state.cart;
  const show = !!cart;
  $("#cart").hidden = !show;
  $("#send").hidden = !show || !cart.items.length;
  $("#startOver").hidden = !show;
  const n = show ? cart.items.reduce((s, i) => s + i.quantity, 0) : 0;
  for (const b of [$("#topBadge"), $("#navBadge")]) {
    b.hidden = !n;
    b.textContent = n;
  }
  renderLiveTiles();
  if (!show) return;

  $("#cartTitle").textContent = cart.store?.name ? `Your ${cart.store.name} cart` : "Your cart";
  $("#sendStoreName").textContent = cart.store?.name || "the store";
  $("#cartCount").textContent = n ? `${n} item${n === 1 ? "" : "s"}` : "";
  $("#summary").hidden = !cart.summary;
  $("#summary").textContent = cart.summary || "";
  $("#refineForm").hidden = !cart.items.length || !config.agentReady;

  const list = $("#items");
  list.replaceChildren();
  if (!cart.items.length) {
    list.append(el("li", { class: "empty" }, running ? "Items show up here as they're found." : "No items yet. Add one by link below."));
  }
  for (const item of cart.items) {
    const t = tile(item, cart.store?.name);
    if (item.price) t.append(el("span", { class: "price-pill" }, formatMoney(item.price)));
    t.append(
      el("button", { type: "button", class: "fab", "aria-label": `Remove ${item.title}`, onclick: () => removeItem(item.id) }, icon("close")),
    );
    list.append(
      el(
        "li",
        { class: "product" },
        t,
        el("a", { class: "name", href: item.url, target: "_blank", rel: "noopener noreferrer" }, item.title),
        item.variant ? el("div", { class: "sub" }, item.variant) : null,
        item.reason ? el("div", { class: "reason" }, item.reason) : null,
        el(
          "div",
          { class: "stepper" },
          el("button", { type: "button", "aria-label": `Fewer ${item.title}`, onclick: () => setQty(item.id, item.quantity - 1) }, "−"),
          el("span", { "aria-label": "Quantity" }, item.quantity),
          el("button", { type: "button", "aria-label": `More ${item.title}`, onclick: () => setQty(item.id, item.quantity + 1) }, "+"),
        ),
      ),
    );
  }
  const { total, unknown } = cartTotal(cart);
  $("#total").textContent = formatMoney(total);
  $("#totalNote").textContent = unknown ? `${unknown} without a price` : `${n} item${n === 1 ? "" : "s"}`;
  $("#totalRow").hidden = !cart.items.length;
}

function setQty(id, q) {
  const item = state.cart.items.find((i) => i.id === id);
  if (!item) return;
  if (q < 1) return removeItem(id);
  item.quantity = clampQty(q);
  changed();
}

function removeItem(id) {
  state.cart.items = state.cart.items.filter((i) => i.id !== id);
  changed();
}

function changed() {
  $("#shareBox").hidden = true;
  save();
  renderCart();
}

// ---------- send ----------

function readSend() {
  const shipTo = {
    name: $("#sName").value.trim(),
    address1: $("#sAddr1").value.trim(),
    address2: $("#sAddr2").value.trim(),
    city: $("#sCity").value.trim(),
    region: $("#sRegion").value.trim(),
    postal: $("#sPostal").value.trim(),
    country: $("#sCountry").value.trim(),
  };
  return {
    from: $("#fromName").value.trim(),
    occasion: $("#occasion").value,
    note: $("#note").value.trim(),
    shipTo: shipTo.address1 ? shipTo : null,
  };
}

async function makeLink() {
  state.send = readSend();
  save();
  const cart = sanitizeCart({ ...state.cart, ...state.send, createdAt: new Date().toISOString() });
  if (!cart.items.length) return toast("Add at least one item first.");

  let url = null;
  if (config.shortLinks) {
    try {
      const res = await fetch("/api/carts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(cart) });
      if (res.ok) url = `${location.origin}/c/${(await res.json()).id}`;
    } catch {
      /* fall back to a self-contained link */
    }
  }
  url ??= `${location.origin}/cart#c=${await encodeCart(cart)}`;

  const who = cart.from || "Someone";
  const msg = `${who} put together a cart on ${cart.store.name}${cart.occasion ? ` for their ${cart.occasion.toLowerCase()}` : ""}. Open it to see everything and check out in a couple of taps: ${url}`;
  $("#shareUrl").value = url;
  $("#previewLink").href = url;
  $("#smsLink").href = `sms:?&body=${encodeURIComponent(msg)}`;
  $("#mailLink").href = `mailto:?subject=${encodeURIComponent(`${who}'s ${cart.store.name} cart`)}&body=${encodeURIComponent(msg)}`;
  const nativeBtn = $("#nativeShare");
  nativeBtn.hidden = !navigator.share;
  nativeBtn.onclick = () => navigator.share({ title: `${who}'s cart`, text: msg.replace(url, "").trim(), url }).catch(() => {});
  $("#shareBox").hidden = false;
  $("#shareBox").scrollIntoView({ behavior: "smooth", block: "nearest" });
}

// ---------- wiring ----------

$("#requestForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const req = readRequest();
  if (!req.store || !req.wishlist) return;
  if (!config.agentReady) return toast("The shopping assistant isn't set up. Add items yourself instead.");
  state.request = req;
  state.cart = null;
  save();
  runAgent(req, { replaceItems: true });
});

$("#manualBtn").addEventListener("click", () => {
  const req = readRequest();
  const store = resolveStore(req.store);
  if (!store) {
    $("#storeInput").focus();
    return toast("Pick a store first.");
  }
  state.request = req;
  state.cart ??= { store, items: [], summary: "" };
  save();
  renderCart();
  $("#addManual").open = true;
  $("#cart").scrollIntoView({ behavior: "smooth", block: "start" });
  $("#mUrl").focus({ preventScroll: true });
});

$("#refineForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const instruction = $("#refine").value.trim();
  if (!instruction || !state.cart) return;
  $("#refine").value = "";
  const req = state.request || readRequest();
  runAgent(
    {
      store: state.cart.store?.domain || state.cart.store?.name || req.store,
      wishlist: req.wishlist,
      budget: req.budget,
      instruction,
      currentItems: state.cart.items,
    },
    { replaceItems: false },
  );
});

$("#manualForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const item = sanitizeItem({
    id: randomId(8),
    url: $("#mUrl").value,
    title: $("#mTitle").value,
    price: $("#mPrice").value,
    quantity: $("#mQty").value,
    variant: $("#mVariant").value,
  });
  if (!item) return toast("That link doesn't look right.");
  state.cart.items.push(item);
  e.target.reset();
  $("#mQty").value = 1;
  changed();
  toast("Added");
});

$("#sendForm").addEventListener("submit", (e) => {
  e.preventDefault();
  makeLink();
});
$("#sendForm").addEventListener("input", () => {
  $("#shareBox").hidden = true;
});
$("#copyBtn").addEventListener("click", () => copyText($("#shareUrl").value));
$("#progBtn").addEventListener("click", () => {
  if (running) running.abort();
  else $("#cart").scrollIntoView({ behavior: "smooth", block: "start" });
});
$("#startOver").addEventListener("click", () => {
  if (running) running.abort();
  state.cart = null;
  save();
  $("#progressCard").hidden = true;
  renderCart();
  window.scrollTo({ top: 0, behavior: "smooth" });
});

// Highlight the section in view on the floating nav.
const navFor = { build: "#navBuild", cart: "#navCart", send: "#navSend" };
const io = new IntersectionObserver(
  (entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      for (const sel of Object.values(navFor)) $(sel).classList.remove("active");
      $(navFor[e.target.id]).classList.add("active");
    }
  },
  { rootMargin: "-45% 0px -50% 0px" },
);
for (const id of Object.keys(navFor)) io.observe(document.getElementById(id));

hydrateIcons();
initForm();
renderCart();
loadConfig().then(renderCart);
dismissSplash(900);
