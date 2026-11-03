// Tiny DOM helpers. Everything user- or agent-supplied goes through text nodes,
// never innerHTML, so a shared cart can't inject markup.

export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === "class") node.className = v;
    else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2), v);
    else if (k === "dataset") Object.assign(node.dataset, v);
    else node.setAttribute(k, v === true ? "" : String(v));
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return node;
}

export const $ = (sel, root = document) => root.querySelector(sel);

let toastTimer;
export function toast(msg) {
  document.querySelector(".toast")?.remove();
  const t = el("div", { class: "toast", role: "status" }, msg);
  document.body.append(t);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.remove(), 2400);
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast("Copied");
    return true;
  } catch {
    window.prompt("Copy this:", text);
    return false;
  }
}

export function thumb(item, storeName = "") {
  const box = el("div", { class: "thumb", "aria-hidden": "true" });
  const letter = (item.title || storeName || "?").trim().charAt(0).toUpperCase();
  if (item.image) {
    const img = el("img", { src: item.image, alt: "", loading: "lazy", referrerpolicy: "no-referrer" });
    img.addEventListener("error", () => box.replaceChildren(letter));
    box.append(img);
  } else {
    box.append(letter);
  }
  return box;
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
