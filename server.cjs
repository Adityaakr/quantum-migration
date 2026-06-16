// Minimal static file server for the built Lattice SPA (app/dist).
// Zero dependencies. Serves on $PORT (Railway provides it) with SPA fallback.
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const CANDIDATES = [
  path.join(process.cwd(), "dist"),
  path.join(process.cwd(), "app", "dist"),
];
// Pick the build dir that actually contains the SPA (index.html), not the SDK dist.
const ROOT =
  CANDIDATES.find((p) => fs.existsSync(path.join(p, "index.html"))) ||
  CANDIDATES[0];
const PORT = process.env.PORT || 8080;

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
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
};

const sendFile = (res, file) => {
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    res.writeHead(200, {
      "Content-Type": MIME[path.extname(file)] || "application/octet-stream",
      "Cache-Control": "public, max-age=300",
    });
    res.end(data);
  });
};

http
  .createServer((req, res) => {
    let urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
    if (urlPath === "/") urlPath = "/index.html";
    const file = path.normalize(path.join(ROOT, urlPath));
    if (!file.startsWith(ROOT)) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }
    fs.stat(file, (err, stats) => {
      if (err || stats.isDirectory()) {
        // SPA fallback to index.html
        sendFile(res, path.join(ROOT, "index.html"));
      } else {
        sendFile(res, file);
      }
    });
  })
  .listen(PORT, "0.0.0.0", () => {
    console.log(`Lattice serving ${ROOT} on :${PORT}`);
  });
