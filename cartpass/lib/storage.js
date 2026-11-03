// Optional short links. If an Upstash Redis (or Vercel KV) REST endpoint is
// configured, carts are saved under a short id. Otherwise the whole cart rides
// in the link itself and nothing is stored server-side.

const TTL_SECONDS = 60 * 60 * 24 * 120; // 120 days

function config(env = process.env) {
  const url = env.KV_REST_API_URL || env.UPSTASH_REDIS_REST_URL;
  const token = env.KV_REST_API_TOKEN || env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url: url.replace(/\/$/, ""), token } : null;
}

export function storageEnabled(env) {
  return !!config(env);
}

async function call(cfg, path, body, fetchImpl) {
  const res = await fetchImpl(`${cfg.url}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { authorization: `Bearer ${cfg.token}` },
    body,
  });
  if (!res.ok) throw new Error(`storage HTTP ${res.status}`);
  return res.json();
}

export async function saveCart(id, cart, { env, fetchImpl = fetch } = {}) {
  const cfg = config(env);
  if (!cfg) throw new Error("storage not configured");
  // Upstash REST: POST /set/<key>?EX=<ttl> with the value as the request body.
  await call(cfg, `/set/cart:${encodeURIComponent(id)}?EX=${TTL_SECONDS}`, JSON.stringify(cart), fetchImpl);
}

export async function loadCart(id, { env, fetchImpl = fetch } = {}) {
  const cfg = config(env);
  if (!cfg) return null;
  const { result } = await call(cfg, `/get/cart:${encodeURIComponent(id)}`, undefined, fetchImpl);
  return result ? JSON.parse(result) : null;
}
