// Zero-dependency static server for the built Lattice SPA (app/dist).
//
// Why this exists: `vite preview` binds to localhost:4173 and needs the full
// dev toolchain present at runtime. In a container that means the app is
// unreachable on 0.0.0.0:$PORT, so the platform's readiness check never passes
// and the deploy dies with a heartbeat timeout. This serves dist/ directly,
// binds 0.0.0.0:$PORT, and depends on nothing but Node's stdlib.
import { createServer } from "node:http";
import { existsSync, readFile, stat } from "node:fs";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
// Find the SPA build (index.html) whether we run from app/, repo root, or /app.
const CANDIDATES = [
  join(here, "dist"),
  join(process.cwd(), "dist"),
  join(here, "app", "dist"),
  join(process.cwd(), "app", "dist"),
];
const ROOT =
  CANDIDATES.find((p) => existsSync(join(p, "index.html"))) || CANDIDATES[0];
const PORT = Number(process.env.PORT) || 8080;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
};

const sendFile = (res, file) => {
  readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    res.writeHead(200, {
      "Content-Type": MIME[extname(file)] || "application/octet-stream",
      "Cache-Control": "public, max-age=300",
    });
    res.end(data);
  });
};

createServer((req, res) => {
  let urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
  if (urlPath === "/") urlPath = "/index.html";
  const file = normalize(join(ROOT, urlPath));
  if (!file.startsWith(ROOT)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  stat(file, (err, stats) => {
    // SPA fallback: unknown path or directory -> index.html (client routing).
    if (err || stats.isDirectory()) sendFile(res, join(ROOT, "index.html"));
    else sendFile(res, file);
  });
}).listen(PORT, "0.0.0.0", () => {
  console.log(`Lattice serving ${ROOT} on http://0.0.0.0:${PORT}`);
});
