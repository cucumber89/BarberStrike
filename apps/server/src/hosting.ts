import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express, { type RequestHandler } from "express";

/**
 * Player-hosted games (2.0): one process serves BOTH the built client and the game server.
 *
 * WHY IT HAS TO BE ONE PROCESS, and not the "start a server, then tell your friends the IP" the
 * plan sketched. Two browser rules decide this and neither is negotiable:
 *
 *  - A page loaded over HTTPS may not open a `ws://` socket to a private address. So a friend on
 *    the public deployment CANNOT join a game on your home network, however you configure it.
 *  - A page cannot broadcast on the LAN, so it cannot discover your game either. "LAN discovery"
 *    as written in the plan does not exist for a browser; the URL is the discovery.
 *
 * Serving the client from the game server sidesteps both. Friends open `http://<your-ip>:2567`,
 * the page and the socket are the same origin, and there is nothing to configure, no CORS and no
 * mixed content. The cost is that the host must have built the client once.
 */

/**
 * Cache policy per path (performance pass, task 3), set HERE so the reverse proxy does not have
 * to know the layout and no response ever carries two Cache-Control headers (a live curl against
 * the VPS returned both Caddy's `no-cache` and Express's `max-age=3600`):
 *
 *  - `/assets/*` — Vite hashes the name, so the content never changes: a year, immutable.
 *  - `/models/*` — fixed names, big files, rarely change: a month.
 *  - `index.html` (and `/`) — never cached, or a deploy stays invisible for an hour.
 *  - everything else (favicon, manifest) — an hour.
 */
export function cacheControlFor(urlPath: string): string {
  const p = urlPath.split("?")[0];
  if (p.startsWith("/assets/")) return "public, max-age=31536000, immutable";
  if (p.startsWith("/models/")) return "public, max-age=2592000";
  if (p === "/" || p.endsWith("/index.html") || p === "/index.html") return "no-cache";
  return "public, max-age=3600";
}

const TYPE_OF: Record<string, string> = {
  ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".html": "text/html; charset=utf-8",
  ".svg": "image/svg+xml", ".json": "application/json; charset=utf-8", ".map": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8", ".webmanifest": "application/manifest+json", ".xml": "application/xml",
  ".glb": "model/gltf-binary", ".wasm": "application/wasm",
};

/**
 * Serve the built client with the precompressed siblings the build writes (`scripts/precompress.mjs`:
 * `.br` and `.gz` next to every compressible file). A request that accepts brotli gets the `.br`
 * file as-is with `Content-Encoding: br`; gzip likewise; anything else falls through to
 * `express.static`. Nothing is compressed per request — on a 2-vCPU VPS that CPU belongs to the
 * simulation — and the caller's cache policy (`cacheControlFor`) is applied on both paths.
 *
 * Existence is checked once per path and remembered: the build is immutable while the process
 * lives, and a `stat` per asset request would be its own small tax.
 */
export function serveClient(dir: string): RequestHandler[] {
  const known = new Map<string, string | null>(); // url path → precompressed file, or null
  const precompressed: RequestHandler = (req, res, next) => {
    if (req.method !== "GET" && req.method !== "HEAD") return next();
    const accept = String(req.headers["accept-encoding"] ?? "");
    const urlPath = req.path === "/" ? "/index.html" : req.path;
    const ext = path.extname(urlPath);
    if (!TYPE_OF[ext] || urlPath.includes("..")) return next();
    const encodings = accept.includes("br") ? ["br", "gzip"] : accept.includes("gzip") ? ["gzip"] : [];
    for (const enc of encodings) {
      const key = `${urlPath}\0${enc}`;
      let file = known.get(key);
      if (file === undefined) {
        const candidate = path.join(dir, urlPath) + (enc === "br" ? ".br" : ".gz");
        file = fs.existsSync(candidate) ? candidate : null;
        known.set(key, file);
      }
      if (!file) continue;
      res.setHeader("Content-Encoding", enc);
      res.setHeader("Content-Type", TYPE_OF[ext]);
      res.setHeader("Vary", "Accept-Encoding");
      res.setHeader("Cache-Control", cacheControlFor(urlPath));
      return res.sendFile(file, (err) => { if (err) next(err); });
    }
    return next();
  };
  const plain = express.static(dir, {
    index: "index.html",
    setHeaders: (res, filePath) => {
      res.setHeader("Cache-Control", cacheControlFor("/" + path.relative(dir, filePath).split(path.sep).join("/")));
      res.setHeader("Vary", "Accept-Encoding");
    },
  });
  return [precompressed, plain];
}

/** Where the built client lives, relative to this file in both `src` (tsx) and `dist` (node). */
export function clientDir(): string | null {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const override = process.env.BS_CLIENT_DIR?.trim();
  const candidates = override
    ? [override]
    : [
        path.resolve(here, "../../client/dist"),      // apps/server/src → apps/client/dist
        path.resolve(here, "../../../client/dist"),   // apps/server/dist → apps/client/dist
        path.resolve(process.cwd(), "apps/client/dist"),
      ];
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, "index.html"))) return dir;
  }
  return null;
}

/**
 * Every address a friend on the same network could reach this machine at.
 *
 * IPv4 only, and link-local (169.254.x.x) dropped: those are what a machine gives itself when DHCP
 * failed, so printing one as "tell your friends this" sends them somewhere that cannot work.
 */
export function lanAddresses(): string[] {
  const out: string[] = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const ni of list ?? []) {
      if (ni.family !== "IPv4" || ni.internal) continue;
      if (ni.address.startsWith("169.254.")) continue;
      out.push(ni.address);
    }
  }
  return out;
}

/** The lines printed at startup: what the host reads out to the room. */
export function hostBanner(port: number, served: boolean): string[] {
  const lines: string[] = [];
  if (!served) {
    lines.push("Game server is up, but the client is not built, so there is nothing to open.");
    lines.push("Build it once with `pnpm build`, or use `pnpm host`, which does both.");
    return lines;
  }
  const addrs = lanAddresses();
  const urls = [`http://localhost:${port}`, ...addrs.map((a) => `http://${a}:${port}`)];
  const width = Math.max(...urls.map((u) => u.length));
  lines.push("Your friends open one of these in a browser:");
  urls.forEach((u, i) => lines.push(`  ${u.padEnd(width)}  ${i === 0 ? "(you)" : "(same wi-fi)"}`));
  if (addrs.length === 0) lines.push("  (no network address found — is this machine online?)");
  lines.push("");
  lines.push("Everyone types the SAME room name to land in the same match.");
  lines.push("Playing with someone not on your wi-fi? See docs/HOSTING.md.");
  return lines;
}
