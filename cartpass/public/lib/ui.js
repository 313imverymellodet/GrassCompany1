// Tiny DOM helpers. Everything user- or agent-supplied goes through text nodes,
// never innerHTML, so a shared cart can't inject markup.

export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === "class") node.className = v;
    else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2), v);
    else if (k === "dataset") Object.assign(node.dataset, v);
    else if (k === "style" && typeof v === "object") Object.assign(node.style, v);
    else node.setAttribute(k, v === true ? "" : String(v));
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return node;
}

export const $ = (sel, root = document) => root.querySelector(sel);

// Constant icon paths (24x24, stroke-based). Only these fixed strings are parsed as SVG.
const ICONS = {
  cart: '<path d="M3 4h2.2l2.4 11.2a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.5L21 8H6.2"/><circle cx="10" cy="20.5" r="1.3" fill="currentColor"/><circle cx="17.5" cy="20.5" r="1.3" fill="currentColor"/>',
  home: '<path d="M4 10.5 12 4l8 6.5V19a1.5 1.5 0 0 1-1.5 1.5H15v-6H9v6H5.5A1.5 1.5 0 0 1 4 19z" fill="currentColor" stroke="none"/>',
  sparkle: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" fill="currentColor" stroke="none"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" fill="currentColor" stroke="none"/>',
  send: '<path d="M21 3 10 14"/><path d="M21 3l-7 18-4-7-7-4z"/>',
  arrow: '<path d="M5 12h14"/><path d="m13 6 6 6-6 6"/>',
  stop: '<rect x="7" y="7" width="10" height="10" rx="2" fill="currentColor" stroke="none"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  share: '<path d="M12 15V3"/><path d="m7 8 5-5 5 5"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="3"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
  message: '<path d="M4 5h16v11H9l-5 4z"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="m4 7 8 6 8-6"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  external: '<path d="M14 4h6v6"/><path d="M20 4 10 14"/><path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"/>',
  pin: '<path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
  gift: '<rect x="3.5" y="8" width="17" height="4" rx="1"/><path d="M5 12v7.5A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5V12M12 8v13"/><path d="M12 8S10.5 3.5 8 4.2 8.6 8 12 8zm0 0s1.5-4.5 4-3.8S15.4 8 12 8z"/>',
  list: '<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1" fill="currentColor"/><circle cx="4.5" cy="12" r="1" fill="currentColor"/><circle cx="4.5" cy="18" r="1" fill="currentColor"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  back: '<path d="m15 5-7 7 7 7"/>',
  chevron: '<path d="m9 5 7 7-7 7"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/>',
  bag: '<path d="M5 8h14l-1 12a1.5 1.5 0 0 1-1.5 1.4h-9A1.5 1.5 0 0 1 6 20z"/><path d="M9 8V6.5a3 3 0 0 1 6 0V8"/>',
  wallet: '<rect x="3" y="6" width="18" height="14" rx="3"/><path d="M16 13h2M3 10h18"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="m11 12 9-9M17 6l3 3"/>',
  bolt: '<path d="M13 3 5 14h6l-1 7 8-11h-6z" fill="currentColor" stroke="none"/>',
};

export function icon(name, cls) {
  const svg = new DOMParser().parseFromString(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ""}</svg>`,
    "image/svg+xml",
  ).documentElement;
  if (cls) svg.setAttribute("class", cls);
  return document.importNode(svg, true);
}

/** Fill every [data-icon] placeholder in static markup. */
export function hydrateIcons(root = document) {
  for (const n of root.querySelectorAll("[data-icon]")) {
    n.prepend(icon(n.dataset.icon));
    n.removeAttribute("data-icon");
  }
}

let toastTimer;
export function toast(msg) {
  document.querySelector(".toast")?.remove();
  const t = el("div", { class: "toast", role: "status" }, msg);
  document.body.append(t);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.remove(), 2200);
}

export async function copyText(text, msg = "Copied") {
  try {
    await navigator.clipboard.writeText(text);
    toast(msg);
    return true;
  } catch {
    window.prompt("Copy this:", text);
    return false;
  }
}

/** Square product image tile with a fallback letter. */
export function tile(item, storeName = "") {
  const box = el("div", { class: "tile" });
  const letter = () => el("span", { class: "letter", "aria-hidden": "true" }, (item.title || storeName || "?").trim().charAt(0).toUpperCase());
  if (item.image) {
    const img = el("img", { src: item.image, alt: "", loading: "lazy", referrerpolicy: "no-referrer" });
    img.addEventListener("error", () => img.replaceWith(letter()));
    box.append(img);
  } else {
    box.append(letter());
  }
  return box;
}

/** Stable colour for a store's initial disc. */
export function storeColor(name = "") {
  const palette = ["#ff9900", "#cc0000", "#0071dc", "#f1641e", "#0046be", "#111111", "#5b3bf6", "#1f9d55", "#d6336c"];
  let h = 0;
  for (const c of name.toLowerCase()) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return palette[h % palette.length];
}

/** Hide the splash screen, no sooner than `minMs` after page start. */
export function dismissSplash(minMs = 0) {
  const s = document.getElementById("splash");
  if (!s) return;
  const wait = Math.max(0, minMs - performance.now());
  setTimeout(() => {
    s.classList.add("gone");
    setTimeout(() => s.remove(), 400);
  }, wait);
}

export const store = {
  get(key, fallback = null) {
    try {
      const v = localStorage.getItem(key);
      return v == null ? fallback : JSON.parse(v);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* private mode or storage full: fine, it's a convenience */
    }
  },
};
