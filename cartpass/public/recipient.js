import { el, $, copyText, thumb, store as ls } from "/lib/ui.js";
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
  document.title = `${from}'s ${storeName} cart · Cartpass`;

  if (cart.occasion) {
    $("#occasion").hidden = false;
    $("#occasion").textContent = cart.occasion;
  }
  $("#headline").textContent = `${from} sent you a cart from ${storeName}`;
  const n = cart.items.reduce((s, i) => s + i.quantity, 0);
  $("#sublede").textContent = `${n} item${n === 1 ? "" : "s"}, picked and ready. Check out on ${storeName} in a couple of taps.`;
  if (cart.note) {
    $("#note").hidden = false;
    $("#note").replaceChildren(cart.note, el("cite", {}, `${from}`));
  }

  // Checkout plan: one-click pre-filled cart where the store supports it, otherwise a checklist.
  const plan = checkoutPlan(cart, { amazonTag: tag });
  const doneKey = `cartpass:done:${key}`;
  const done = new Set(ls.get(doneKey, []));

  if (plan.mode === "auto") {
    $("#autoBox").hidden = false;
    $("#autoBtn").href = plan.url;
    $("#autoBtn").textContent = plan.label;
    $("#autoNote").textContent = plan.note;
  } else {
    $("#guidedBox").hidden = false;
    $("#guidedTitle").textContent = plan.label;
    $("#guidedNote").textContent = plan.note;
  }

  const list = $("#items");
  const updateProgress = () => {
    const count = cart.items.filter((i) => done.has(i.url)).length;
    $("#progressBar").style.width = `${(count / cart.items.length) * 100}%`;
    $("#progressText").textContent =
      count === cart.items.length ? "Everything's in your cart. Time to check out." : `${count} of ${cart.items.length} added to your cart`;
  };

  for (const item of cart.items) {
    const row = el("li", { class: `item${done.has(item.url) ? " done" : ""}` });
    const box = el("input", { type: "checkbox", checked: done.has(item.url) || null });
    box.addEventListener("change", () => {
      if (box.checked) done.add(item.url);
      else done.delete(item.url);
      ls.set(doneKey, [...done]);
      row.classList.toggle("done", box.checked);
      updateProgress();
    });
    row.append(
      thumb(item, storeName),
      el(
        "div",
        {},
        el("a", { class: "item-title", href: item.url, target: "_blank", rel: "noopener noreferrer" }, item.title),
        el("div", { class: "item-meta" }, [item.variant, item.quantity > 1 ? `Qty ${item.quantity}` : null].filter(Boolean).join(" · ") || null),
        item.reason ? el("div", { class: "item-reason" }, item.reason) : null,
        plan.mode === "guided"
          ? el(
              "div",
              { class: "actions", style: "margin-top:8px" },
              el("a", { class: "btn small", href: item.url, target: "_blank", rel: "noopener noreferrer" }, `Open on ${storeName} ↗`),
              el("label", { class: "check" }, box, "Added"),
            )
          : null,
      ),
      el(
        "div",
        { class: "item-side" },
        el("span", { class: "price" }, item.price ? formatMoney(item.price * item.quantity, cart.currency) : "—"),
        item.quantity > 1 && item.price ? el("span", { class: "muted small" }, `${formatMoney(item.price, cart.currency)} each`) : null,
      ),
    );
    list.append(row);
  }
  if (plan.mode === "guided") updateProgress();

  const { total, unknown } = cartTotal(cart);
  $("#total").textContent = formatMoney(total, cart.currency);
  $("#totalNote").textContent = unknown ? `(${unknown} without a price)` : "";

  $("#copyList").addEventListener("click", () =>
    copyText(
      [`${from}'s ${storeName} cart`, ...cart.items.map((i) => `- ${i.quantity > 1 ? `${i.quantity}x ` : ""}${i.title}${i.variant ? ` (${i.variant})` : ""}: ${i.url}`)].join("\n"),
    ),
  );

  if (cart.shipTo) {
    $("#shipCard").hidden = false;
    const text = addressText(cart.shipTo);
    $("#address").textContent = text;
    $("#copyAddr").addEventListener("click", () => copyText(text));
  }

  const thanks = `I just ordered your ${storeName} cart!`;
  $("#tellText").textContent = `Let ${from} know it's on the way.`;
  $("#tellSms").href = `sms:?&body=${encodeURIComponent(thanks)}`;
  $("#tellMail").href = `mailto:?subject=${encodeURIComponent("Your cart is ordered")}&body=${encodeURIComponent(thanks)}`;
}

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
    $("#loading").hidden = true;
  }
})();
