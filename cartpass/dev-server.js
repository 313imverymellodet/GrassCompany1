// Local dev server: serves public/ and runs api/*.js the way Vercel does.
// Usage: npm install && cp .env.example .env (add your key) && npm run dev

import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(root, "public");

if (existsSync(path.join(root, ".env"))) {
  for (const line of readFileSync(path.join(root, ".env"), "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && m[2] && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".webmanifest": "application/manifest+json",
};

const server = http.createServer(async (req, res) => {
  const { pathname } = new URL(req.url, "http://localhost");
  try {
    const api = pathname.match(/^\/api\/([a-z-]+)$/);
    if (api) {
      const file = path.join(root, "api", `${api[1]}.js`);
      if (!existsSync(file)) return notFound(res);
      const mod = await import(pathToFileURL(file).href);
      return await mod.default(req, res);
    }
    let rel = pathname === "/" ? "/index.html" : pathname.startsWith("/c/") ? "/cart.html" : pathname;
    if (!path.extname(rel)) rel += ".html";
    const file = path.normalize(path.join(publicDir, rel));
    if (!file.startsWith(publicDir) || !(await stat(file).catch(() => null))?.isFile()) return notFound(res);
    res.writeHead(200, { "content-type": TYPES[path.extname(file)] || "application/octet-stream" });
    res.end(await readFile(file));
  } catch (err) {
    console.error(err);
    if (!res.headersSent) res.writeHead(500);
    res.end("Server error");
  }
});

function notFound(res) {
  res.writeHead(404, { "content-type": "text/plain" });
  res.end("Not found");
}

const port = Number(process.env.PORT) || 3000;
server.listen(port, () => console.log(`Cartpass running at http://localhost:${port}`));
