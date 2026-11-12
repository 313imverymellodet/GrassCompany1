// POST /api/build-cart -> newline-delimited JSON stream of agent progress events,
// ending with {"type":"done", store, items, summary} or {"type":"error", message}.

import { runCartAgent, DEFAULT_MODEL } from "../lib/agent.js";
import { readJson, sendJson, accessAllowed } from "../lib/http.js";

let clientPromise;
async function getClient() {
  clientPromise ??= import("@anthropic-ai/sdk").then(({ default: Anthropic }) => new Anthropic());
  return clientPromise;
}

const clip = (v, n) => (typeof v === "string" ? v.slice(0, n) : undefined);

export default async function handler(req, res) {
  if (req.method !== "POST") return sendJson(res, 405, { error: "POST only" });
  if (!accessAllowed(req)) return sendJson(res, 401, { error: "Wrong or missing access code." });

  let body;
  try {
    body = await readJson(req);
  } catch (err) {
    return sendJson(res, err.status || 400, { error: "Invalid JSON body." });
  }
  const store = typeof body.store === "string" ? clip(body.store, 200) : body.store;
  if (!store || !(clip(body.wishlist, 4000) || clip(body.instruction, 2000))) {
    return sendJson(res, 400, { error: "Pick a store and describe what you want." });
  }

  res.statusCode = 200;
  res.setHeader("content-type", "application/x-ndjson; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.setHeader("x-accel-buffering", "no");
  const send = (event) => res.write(`${JSON.stringify(event)}\n`);

  const abort = new AbortController();
  res.on("close", () => {
    if (!res.writableFinished) abort.abort();
  });

  try {
    const client = await getClient();
    const result = await runCartAgent({
      client,
      model: process.env.CARTPASS_MODEL || DEFAULT_MODEL,
      signal: abort.signal,
      emit: send,
      request: {
        store,
        wishlist: clip(body.wishlist, 4000),
        budget: Number(body.budget) > 0 ? Math.round(Number(body.budget)) : null,
        currency: clip(body.currency, 3) || "USD",
        forWhom: clip(body.forWhom, 300),
        instruction: clip(body.instruction, 2000),
        currentItems: Array.isArray(body.currentItems) ? body.currentItems.slice(0, 40) : [],
      },
    });
    send({ type: "done", ...result });
  } catch (err) {
    if (!abort.signal.aborted) {
      console.error("build-cart failed:", err);
      send({ type: "error", message: friendlyError(err) });
    }
  } finally {
    res.end();
  }
}

function friendlyError(err) {
  const status = err?.status;
  if (status === 401 || status === 403) return "The server's Anthropic API key is missing or invalid.";
  if (status === 429) return "The shopping assistant is busy right now. Try again in a minute.";
  if (status >= 500) return "The shopping assistant had a hiccup. Try again.";
  if (err?.code === "ERR_MODULE_NOT_FOUND") return "Server isn't set up yet: run npm install.";
  return err?.message || "Something went wrong.";
}
