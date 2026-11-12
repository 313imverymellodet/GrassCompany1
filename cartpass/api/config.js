import { sendJson } from "../lib/http.js";
import { storageEnabled } from "../lib/storage.js";

export default function handler(req, res) {
  sendJson(res, 200, {
    agentReady: !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN),
    accessCodeRequired: !!process.env.CARTPASS_ACCESS_CODE,
    shortLinks: storageEnabled(),
    amazonTag: process.env.AMAZON_ASSOCIATE_TAG || null,
  });
}
