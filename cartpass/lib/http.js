// Small helpers so the same handlers run on Vercel and in the local dev server.

export async function readJson(req, limit = 64 * 1024) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") return JSON.parse(req.body || "{}");
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw Object.assign(new Error("Request too large"), { status: 413 });
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString("utf8");
  return text ? JSON.parse(text) : {};
}

export function sendJson(res, status, data) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(data));
}

/** If CARTPASS_ACCESS_CODE is set, the agent endpoint requires it (it spends API credits). */
export function accessAllowed(req, env = process.env) {
  const code = env.CARTPASS_ACCESS_CODE;
  if (!code) return true;
  return req.headers["x-access-code"] === code;
}
