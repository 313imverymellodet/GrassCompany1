import { el, $, copyText, tile, icon, hydrateIcons, dismissSplash, store as ls } from "/lib/ui.js";
import { checkoutPlan, cartTotal, formatMoney } from "/lib/stores.js";
import { decodeCart, sanitizeCart } from "/lib/cart.js";

function hashKey(s) {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  return ((h2 >>> 0).toString(36) + (h1 >>> 0).toString(36)).slice(0, 12);
}

async function loadCart() {
  const token = new URLSearchParams(location.hash.slice(1)).get("c");
  if (token) return { cart: await decodeCart(token), key: hashKey(token) };

  const id = location.pathname.match(/^\/c\/([A-Za-z0-9]{6,20})\/?$/)?.[1];
  if (id) {
    const res = await fetch(`/api/carts?id=${id}`);
    if (res.status === 404) throw new Error("This cart has expired or the link is wrong.");
    if (!res.ok) throw new Error("Couldn't load this cart right now. Try again in a moment.");
    return { cart: sanitizeCart((await res.json()).cart), key: id };
  }
  throw new Error("This link doesn't include a cart. Ask whoever sent it to copy the whole link.");
}

async function amazonTag() {
  try {
    const res = await fetch("/api/config");
    return res.ok ? (await res.json()).amazonTag : null;
  } catch {
    return null;
  }
}

function addressText(a) {
  return [a.name, a.address1, a.address2, [a.city, [a.region, a.postal].filter(Boolean).join(" ")].filter(Boolean).join(", "), a.country]
    .filter(Boolean)
    .join("\n");
}

function render(cart, key, tag) {
  const storeName = cart.store.name;
  const from = cart.from || "Someone";
  const n = cart.items.reduce((s, i) => s + i.quantity, 0);
  const itemsLabel = `${n} item${n === 1 ? "" : "s"}`;
  const { total, unknown } = cartTotal(cart);
  document.title = `${from}'s ${storeName} cart · Cartpass`;

  // Promo strip + hero
  $("#fromTag").textContent = `From ${from}`;
  $("#promoText").textContent = cart.occasion ? ` ${cart.occasion} wishlist` : " picked these out";
  $("#promoSub").textContent = cart.shipTo?.city ? `Ships to ${cart.shipTo.city}` : `${itemsLabel}, ready to order`;
  const cover = cart.items.find((i) => i.image)?.image;
  if (cover) $("#heroBg").style.backgroundImage = `url(${JSON.stringify(cover)})`;
  $("#storeTitle").textContent = storeName;
  $("#heroSub").textContent = `${itemsLabel}${total ? ` · ${formatMoney(total, cart.currency)}` : ""}`;
  $("#heroPills").replaceChildren(
    ...cart.items.slice(0, 3).map((item, idx) => {
      const disc = el("span", { class: "disc" });
      if (item.image) disc.append(el("img", { src: item.image, alt: "", referrerpolicy: "no-referrer" }));
      else disc.textContent = item.title.charAt(0).toUpperCase();
      const short = item.title.length > 18 ? `${item.title.slice(0, 17).trim()}…` : item.title;
      return el(
        "button",
        { type: "button", class: "chip", onclick: () => document.getElementById(`item-${idx}`)?.scrollIntoView({ behavior: "smooth", block: "center" }) },
        disc,
        short,
      );
    }),
  );

  if (cart.note) {
    $("#note").hidden = false;
    $("#note").replaceChildren(
      cart.note,
      el("div", { class: "from" }, el("span", { class: "disc" }, from.charAt(0).toUpperCase()), from),
    );
  }

  // Checkout plan: one-click pre-filled cart where the store supports it, otherwise a checklist.
  const plan = checkoutPlan(cart, { amazonTag: tag });
  const doneKey = `cartpass:done:${key}`;
  const done = new Set(ls.get(doneKey, []));
  const cta = $("#ctaBtn");
  $("#dock").hidden = false;
  $("#total").textContent = formatMoney(total, cart.currency);
  $("#totalNote").textContent = unknown ? `${itemsLabel} · ${unknown} unpriced` : `${itemsLabel} · ${storeName}`;

  if (plan.mode === "auto") {
    $("#autoBox").hidden = false;
    $("#autoNote").textContent = plan.note;
    cta.href = plan.url;
    cta.replaceChildren(icon("cart"), storeName === "Amazon" || plan.url.includes("/gp/aws/") ? "Add all to cart" : "Check out");
    cta.setAttribute("aria-label", plan.label);
  } else {
    $("#guidedBox").hidden = false;
    $("#guidedTitle").textContent = plan.label;
    $("#guidedNote").textContent = plan.note;
  }

  const updateProgress = () => {
    if (plan.mode !== "guided") return;
    const count = cart.items.filter((i) => done.has(i.url)).length;
    $("#progressBar").style.width = `${(count / cart.items.length) * 100}%`;
    $("#progressText").textContent =
      count === cart.items.length ? "Everything's in your cart. Time to check out." : `${count} of ${cart.items.length} added to your cart`;
    const next = cart.items.find((i) => !done.has(i.url));
    if (next) {
      cta.href = next.url;
      cta.replaceChildren(icon("external"), count ? "Open next item" : "Open first item");
    } else {
      cta.href = cart.store.domain ? `https://www.${cart.store.domain.replace(/^www\./, "")}/` : cart.items[0].url;
      cta.replaceChildren(icon("check"), `Check out on ${storeName}`);
    }
  };

  const list = $("#items");
  cart.items.forEach((item, idx) => {
    const card = el("li", { class: `product${done.has(item.url) ? " done" : ""}`, id: `item-${idx}` });
    const t = tile(item, storeName);
    if (item.price) t.append(el("span", { class: "price-pill" }, formatMoney(item.price, cart.currency)));
    if (item.quantity > 1) t.append(el("span", { class: "qty-pill" }, `×${item.quantity}`));
    if (plan.mode === "guided") {
      const fab = el("button", { type: "button", class: `fab${done.has(item.url) ? " on" : ""}`, "aria-pressed": String(done.has(item.url)), "aria-label": `Mark ${item.title} as added` }, icon("check"));
      fab.addEventListener("click", () => {
        const on = !done.has(item.url);
        if (on) done.add(item.url);
        else done.delete(item.url);
        ls.set(doneKey, [...done]);
        fab.classList.toggle("on", on);
        fab.setAttribute("aria-pressed", String(on));
        card.classList.toggle("done", on);
        updateProgress();
      });
      t.append(fab);
    }
    const link = el("a", { href: item.url, target: "_blank", rel: "noopener noreferrer", "aria-label": `${item.title} on ${storeName}` }, t);
    card.append(
      ...[
      plan.mode === "guided" ? t : link,
      el("a", { class: "name", href: item.url, target: "_blank", rel: "noopener noreferrer" }, item.title),
      item.variant ? el("div", { class: "sub" }, item.variant) : null,
      item.reason ? el("div", { class: "reason" }, item.reason) : null,
      item.quantity > 1 && item.price ? el("div", { class: "cost" }, `${formatMoney(item.price * item.quantity, cart.currency)} total`) : null,
      ].filter(Boolean),
    );
    list.append(card);
  });
  $("#countLabel").textContent = itemsLabel;
  updateProgress();

  $("#copyList").addEventListener("click", () =>
    copyText(
      [`${from}'s ${storeName} cart`, ...cart.items.map((i) => `- ${i.quantity > 1 ? `${i.quantity}x ` : ""}${i.title}${i.variant ? ` (${i.variant})` : ""}: ${i.url}`)].join("\n"),
      "List copied",
    ),
  );
  $("#shareBtn").addEventListener("click", () => {
    if (navigator.share) navigator.share({ title: `${from}'s ${storeName} cart`, url: location.href }).catch(() => {});
    else copyText(location.href, "Link copied");
  });

  if (cart.shipTo) {
    $("#shipCard").hidden = false;
    const text = addressText(cart.shipTo);
    $("#address").textContent = text;
    $("#copyAddr").addEventListener("click", () => copyText(text, "Address copied"));
  }

  const thanks = `I just ordered your ${storeName} cart!`;
  $("#tellText").textContent = `Let ${from} know it's on the way.`;
  $("#tellSms").href = `sms:?&body=${encodeURIComponent(thanks)}`;
  $("#tellMail").href = `mailto:?subject=${encodeURIComponent("Your cart is ordered")}&body=${encodeURIComponent(thanks)}`;
}

hydrateIcons();

(async () => {
  try {
    const [{ cart, key }, tag] = await Promise.all([loadCart(), amazonTag()]);
    if (!cart.items.length) throw new Error("This cart is empty.");
    render(cart, key, tag);
    $("#view").hidden = false;
  } catch (err) {
    console.error(err);
    $("#failed").hidden = false;
    if (err?.message && !/JSON|inflate|decompress|atob|invalid|incorrect header|DOMException/i.test(err.message)) {
      $("#failedMsg").textContent = err.message;
    }
  } finally {
    dismissSplash(700);
  }
})();
