#!/usr/bin/env node
// Minimal local static server for the engine and browser test pages (no Python needed).
// Usage: node tools/serve.mjs [port]   -> http://localhost:<port>/  (default 8000)
// Binds to 127.0.0.1 only. Player books, worlds, git data and secrets are never served.

import { createServer } from "node:http";
import { createReadStream, statSync } from "node:fs";
import { extname, join, normalize, relative, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".woff2": "font/woff2",
  ".webmanifest": "application/manifest+json",
};

// Top-level entries that must never leave the machine (see CLAUDE.md section 6)
const BLOCKED = new Set(["library", "worlds", ".git", "node_modules", ".env"]);

/**
 * Create (but do not start) a static file server rooted at `rootUrl`.
 * @param {URL} rootUrl  directory URL, e.g. new URL("..", import.meta.url)
 */
export function createStaticServer(rootUrl) {
  const root = fileURLToPath(rootUrl);
  return createServer((req, res) => {
    const send = (status, text) => {
      res.writeHead(status, { "content-type": "text/plain; charset=utf-8" });
      res.end(text);
    };

    let path;
    try {
      path = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
    } catch {
      return send(400, "bad request");
    }

    // Resolve inside the root and reject anything that climbs out of it
    const file = normalize(join(root, path));
    const rel = relative(root, file);
    if (rel.startsWith("..") || rel.includes(`..${sep}`)) return send(403, "forbidden");
    const top = rel.split(sep)[0];
    if (BLOCKED.has(top) || top.startsWith(".env") || top.startsWith("config.local")) return send(403, "forbidden");

    let target = file;
    try {
      if (statSync(target).isDirectory()) target = join(target, "index.html");
      statSync(target);
    } catch {
      return send(404, "not found");
    }

    res.writeHead(200, {
      "content-type": TYPES[extname(target).toLowerCase()] ?? "application/octet-stream",
      "cache-control": "no-store",
    });
    createReadStream(target).pipe(res);
  });
}

// Run only when executed directly, not when imported by tests
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const port = Number(process.argv[2] ?? 8000);
  createStaticServer(new URL("..", import.meta.url)).listen(port, "127.0.0.1", () => {
    console.log(`serving repo at http://localhost:${port}/  (Ctrl+C to stop)`);
  });
}
