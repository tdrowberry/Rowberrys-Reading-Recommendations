#!/usr/bin/env node
/**
 * serve.mjs — a tiny static file server for previewing the site locally.
 * No dependencies. Usage:
 *
 *   node tools/serve.mjs           (serves this folder at http://localhost:4173)
 *   node tools/serve.mjs 8080      (pick a different port)
 *
 * You can also just double-click index.html — the site works from a file://
 * URL too. The server is only here for a nicer preview address.
 */
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const PORT = Number(process.env.PORT) || Number(process.argv[2]) || 4173;

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
};

const server = createServer(async (req, res) => {
  try {
    let urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
    if (urlPath.endsWith("/")) urlPath += "index.html";
    const filePath = join(ROOT, normalize(urlPath));
    if (!filePath.startsWith(ROOT)) {
      res.writeHead(403).end("Forbidden");
      return;
    }
    const info = await stat(filePath).catch(() => null);
    if (!info || !info.isFile()) {
      res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
      res.end("<h1>404</h1><p>Not found. Try <a href='/'>the home page</a>.</p>");
      return;
    }
    const body = await readFile(filePath);
    res.writeHead(200, { "Content-Type": TYPES[extname(filePath)] || "application/octet-stream" });
    res.end(body);
  } catch (err) {
    res.writeHead(500).end("Server error: " + err.message);
  }
});

server.listen(PORT, () => {
  console.log(`\n  Rowberrys Reading Reviews`);
  console.log(`  Serving ${ROOT}`);
  console.log(`  →  http://localhost:${PORT}\n`);
  console.log(`  Press Ctrl+C to stop.\n`);
});
