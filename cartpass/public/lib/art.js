// Hand-drawn product illustrations (constant SVG, no user data) for onboarding and empty states.
// Each piece is a 120x120 viewBox with soft gradients so they read as little 3D objects.

const A = {
  gift: `<defs><linearGradient id="g1" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8a72ff"/><stop offset="1" stop-color="#4b2be0"/></linearGradient><linearGradient id="g2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#a996ff"/><stop offset="1" stop-color="#6c50f5"/></linearGradient></defs>
    <rect x="20" y="50" width="80" height="58" rx="8" fill="url(#g1)"/><rect x="14" y="36" width="92" height="20" rx="7" fill="url(#g2)"/>
    <rect x="54" y="36" width="12" height="72" fill="#ffd166"/><rect x="54" y="36" width="12" height="20" fill="#ffe08a"/>
    <path d="M60 36c-6-14-26-18-26-6 0 8 14 8 26 6zM60 36c6-14 26-18 26-6 0 8-14 8-26 6z" fill="#ffd166" stroke="#f0b93a" stroke-width="2"/>
    <rect x="20" y="56" width="80" height="6" fill="#000" opacity=".12"/>`,
  sneaker: `<defs><linearGradient id="s1" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#e3e3ea"/></linearGradient></defs>
    <path d="M12 78c0-10 6-16 14-18l22-6c6-8 12-14 18-14 4 0 6 4 8 8 6 10 18 14 30 16 6 1 6 8 6 14v4H12z" fill="url(#s1)" stroke="#d4d4dc" stroke-width="1.5"/>
    <path d="M48 54c8 4 20 6 26-2" stroke="#ff6a3d" stroke-width="5" fill="none" stroke-linecap="round"/>
    <path d="M12 82h98v8c0 4-3 6-6 6H18c-3 0-6-2-6-6z" fill="#ff6a3d"/><path d="M12 88h98" stroke="#fff" stroke-width="2" opacity=".6"/>
    <path d="M58 46l6 8M64 42l6 8M70 40l5 9" stroke="#b9b9c4" stroke-width="2.5" stroke-linecap="round"/>`,
  mug: `<defs><linearGradient id="m1" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#e0805a"/><stop offset=".55" stop-color="#c8603c"/><stop offset="1" stop-color="#a84a2c"/></linearGradient></defs>
    <path d="M28 40h54v48c0 10-8 18-18 18H46c-10 0-18-8-18-18z" fill="url(#m1)"/><ellipse cx="55" cy="40" rx="27" ry="7" fill="#7a3420"/><ellipse cx="55" cy="40" rx="23" ry="5" fill="#4a1e10"/>
    <path d="M82 52c14 0 18 6 18 14s-6 14-18 14" stroke="#b5532f" stroke-width="8" fill="none" stroke-linecap="round"/>
    <path d="M46 26c-4-6 4-10 0-16M58 26c-4-6 4-10 0-16M70 26c-4-6 4-10 0-16" stroke="#c9c9d2" stroke-width="3" fill="none" stroke-linecap="round" opacity=".8"/>
    <path d="M36 50v34" stroke="#fff" stroke-width="4" opacity=".25" stroke-linecap="round"/>`,
  headphones: `<defs><linearGradient id="h1" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3a3a44"/><stop offset="1" stop-color="#121216"/></linearGradient></defs>
    <path d="M22 70V58c0-22 17-38 38-38s38 16 38 38v12" stroke="url(#h1)" stroke-width="9" fill="none" stroke-linecap="round"/>
    <rect x="12" y="62" width="26" height="40" rx="12" fill="url(#h1)"/><rect x="82" y="62" width="26" height="40" rx="12" fill="url(#h1)"/>
    <rect x="30" y="66" width="10" height="32" rx="5" fill="#5b3bf6"/><rect x="80" y="66" width="10" height="32" rx="5" fill="#5b3bf6"/>
    <path d="M18 70v24" stroke="#fff" stroke-width="3" opacity=".2" stroke-linecap="round"/>`,
  plant: `<defs><linearGradient id="p1" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#f4ece1"/><stop offset="1" stop-color="#d8cbb8"/></linearGradient></defs>
    <path d="M60 70C44 60 30 44 34 24c14 6 24 22 26 46z" fill="#3fa36b"/><path d="M60 70c16-12 30-26 28-46-16 6-26 24-28 46z" fill="#2f8a57"/>
    <path d="M60 72c-4-18 2-38 0-52 8 14 6 34 0 52z" fill="#56c184"/>
    <path d="M34 70h52l-6 36c-1 4-4 6-8 6H48c-4 0-7-2-8-6z" fill="url(#p1)"/><rect x="30" y="66" width="60" height="10" rx="4" fill="#efe5d6"/>`,
  candle: `<defs><linearGradient id="c1" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#c47a2c"/><stop offset=".5" stop-color="#8f4f17"/><stop offset="1" stop-color="#5e300a"/></linearGradient></defs>
    <rect x="30" y="34" width="60" height="72" rx="12" fill="url(#c1)"/><ellipse cx="60" cy="36" rx="30" ry="7" fill="#f3e7cf"/>
    <rect x="38" y="58" width="44" height="30" rx="3" fill="#f6efe0"/><path d="M44 66h32M44 72h24M44 78h28" stroke="#b59a74" stroke-width="2"/>
    <path d="M60 34v-8" stroke="#333" stroke-width="2"/><path d="M60 26c-5-6 0-12 0-16 4 5 6 10 0 16z" fill="#ffb02e"/>
    <path d="M36 44v54" stroke="#fff" stroke-width="3" opacity=".25" stroke-linecap="round"/>`,
  shades: `<defs><linearGradient id="d1" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5a6b8a"/><stop offset="1" stop-color="#1c2233"/></linearGradient></defs>
    <path d="M10 52h100" stroke="#c9b48a" stroke-width="5" stroke-linecap="round"/>
    <ellipse cx="36" cy="64" rx="24" ry="17" fill="url(#d1)" stroke="#c9b48a" stroke-width="4"/><ellipse cx="84" cy="64" rx="24" ry="17" fill="url(#d1)" stroke="#c9b48a" stroke-width="4"/>
    <path d="M24 58c4-4 10-5 16-4M72 58c4-4 10-5 16-4" stroke="#fff" stroke-width="3" opacity=".45" stroke-linecap="round"/>`,
  bag: `<defs><linearGradient id="b1" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e2c194"/><stop offset="1" stop-color="#b8915e"/></linearGradient></defs>
    <path d="M44 42v-8c0-9 7-16 16-16s16 7 16 16v8" stroke="#6e5333" stroke-width="5" fill="none" stroke-linecap="round"/>
    <path d="M24 40h72l6 66c0 4-3 6-7 6H25c-4 0-7-2-7-6z" fill="url(#b1)"/><path d="M24 40h72l2 14H22z" fill="#000" opacity=".08"/>
    <circle cx="44" cy="46" r="3" fill="#6e5333"/><circle cx="76" cy="46" r="3" fill="#6e5333"/><rect x="44" y="70" width="32" height="14" rx="7" fill="#5b3bf6"/>`,
  lipstick: `<defs><linearGradient id="l1" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#e9e9ef"/><stop offset=".45" stop-color="#9c9cab"/><stop offset="1" stop-color="#d4d4dc"/></linearGradient></defs>
    <g transform="rotate(-35 60 60)"><rect x="46" y="58" width="28" height="50" rx="4" fill="url(#l1)"/><rect x="48" y="44" width="24" height="16" rx="2" fill="#bdbdc8"/>
    <path d="M50 44V26c0-6 6-12 20-14v32z" fill="#f2452d"/><path d="M54 40V26" stroke="#fff" stroke-width="3" opacity=".4" stroke-linecap="round"/></g>`,
  clock: `<defs><linearGradient id="k1" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff9a3c"/><stop offset="1" stop-color="#f06a10"/></linearGradient></defs>
    <rect x="18" y="18" width="84" height="84" rx="18" fill="url(#k1)"/><circle cx="60" cy="60" r="32" fill="#ff8a24" stroke="#e86a0c" stroke-width="2"/>
    <path d="M60 60V38M60 60l16 10" stroke="#7a2e00" stroke-width="4" stroke-linecap="round"/><circle cx="60" cy="60" r="4" fill="#7a2e00"/>
    <path d="M60 32v4M60 84v4M32 60h4M84 60h4" stroke="#b44a00" stroke-width="3" stroke-linecap="round"/>`,
};

export const ART_NAMES = Object.keys(A);

export function art(name, cls = "art") {
  const svg = new DOMParser().parseFromString(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" aria-hidden="true">${A[name] || ""}</svg>`,
    "image/svg+xml",
  ).documentElement;
  // Make gradient ids unique per instance so several copies on one page don't collide.
  const suffix = Math.random().toString(36).slice(2, 7);
  for (const g of svg.querySelectorAll("[id]")) {
    const old = g.id;
    g.id = `${old}-${suffix}`;
    for (const n of svg.querySelectorAll(`[fill="url(#${old})"], [stroke="url(#${old})"]`)) {
      for (const attr of ["fill", "stroke"]) if (n.getAttribute(attr) === `url(#${old})`) n.setAttribute(attr, `url(#${g.id})`);
    }
  }
  svg.setAttribute("class", cls);
  return document.importNode(svg, true);
}
