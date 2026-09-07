import { describe, expect, it } from "vitest";
import { hostBanner, lanAddresses } from "./hosting";

/**
 * Player-hosted games (2.0). What is testable here is the thing the host READS OUT to the room —
 * a banner that names an address nobody can reach is worse than no banner at all.
 */
describe("host banner", () => {
  it("says what to do when the client has not been built, instead of an address with nothing behind it", () => {
    const lines = hostBanner(2567, false).join("\n");
    expect(lines).toMatch(/not built/i);
    expect(lines).toMatch(/pnpm host/);
    expect(lines, "no address may be offered when there is no page to serve").not.toMatch(/http:\/\//);
  });

  it("offers localhost and every LAN address, on the port it is actually listening on", () => {
    const lines = hostBanner(4321, true);
    const text = lines.join("\n");
    expect(text).toContain("http://localhost:4321");
    for (const a of lanAddresses()) expect(text).toContain(`http://${a}:4321`);
    // The room name is how two people end up in the same match; leaving it out is the first
    // question the host gets asked.
    expect(text).toMatch(/room name/i);
  });

  it("never offers a link-local address", () => {
    // 169.254.x.x is what a machine gives itself when DHCP failed: telling friends to open it
    // sends them somewhere that cannot work.
    for (const a of lanAddresses()) expect(a.startsWith("169.254."), a).toBe(false);
  });
});

// ---- performance pass, task 3: cache policy and precompressed siblings
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import express from "express";
import { cacheControlFor, serveClient } from "./hosting";

describe("cache policy", () => {
  it("hashed assets for a year, models for a month, index never, the rest an hour", () => {
    expect(cacheControlFor("/assets/index-abc123.js")).toBe("public, max-age=31536000, immutable");
    expect(cacheControlFor("/models/hero.glb")).toBe("public, max-age=2592000");
    expect(cacheControlFor("/")).toBe("no-cache");
    expect(cacheControlFor("/index.html")).toBe("no-cache");
    expect(cacheControlFor("/favicon.svg")).toBe("public, max-age=3600");
  });
});

describe("precompressed client", () => {
  async function withServer<T>(fn: (base: string, dir: string) => Promise<T>): Promise<T> {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bs-client-"));
    fs.mkdirSync(path.join(dir, "assets"));
    const js = "console.log('" + "x".repeat(4000) + "');";
    fs.writeFileSync(path.join(dir, "assets", "app-abc.js"), js);
    fs.writeFileSync(path.join(dir, "assets", "app-abc.js.br"), zlib.brotliCompressSync(js));
    fs.writeFileSync(path.join(dir, "assets", "app-abc.js.gz"), zlib.gzipSync(js));
    fs.writeFileSync(path.join(dir, "assets", "plain-def.js"), js); // no siblings
    fs.writeFileSync(path.join(dir, "index.html"), "<!doctype html><title>x</title>");
    const app = express(); app.use(serveClient(dir));
    const server = http.createServer(app);
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const port = (server.address() as { port: number }).port;
    try { return await fn(`http://127.0.0.1:${port}`, dir); }
    finally { await new Promise<void>((r) => server.close(() => r())); fs.rmSync(dir, { recursive: true, force: true }); }
  }
  const get = (url: string, encoding: string) => new Promise<{ status: number; headers: http.IncomingHttpHeaders; body: Buffer }>((resolve, reject) => {
    http.get(url, { headers: { "accept-encoding": encoding } }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c)); res.on("end", () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks) }));
    }).on("error", reject);
  });
  it("sends the .br sibling as brotli with the asset's type and one year of cache, and the raw file to a client that accepts nothing", async () => {
    await withServer(async (base) => {
      const br = await get(`${base}/assets/app-abc.js`, "gzip, deflate, br");
      expect(br.status).toBe(200);
      expect(br.headers["content-encoding"]).toBe("br");
      expect(br.headers["content-type"]).toMatch(/javascript/);
      expect(br.headers["cache-control"]).toBe("public, max-age=31536000, immutable");
      expect(br.headers["vary"]).toBe("Accept-Encoding");
      expect(zlib.brotliDecompressSync(br.body).toString()).toContain("console.log");
      const gz = await get(`${base}/assets/app-abc.js`, "gzip");
      expect(gz.headers["content-encoding"]).toBe("gzip");
      expect(zlib.gunzipSync(gz.body).toString()).toContain("console.log");
      const raw = await get(`${base}/assets/app-abc.js`, "identity");
      expect(raw.headers["content-encoding"]).toBeUndefined();
      expect(raw.headers["cache-control"]).toBe("public, max-age=31536000, immutable");
      expect(raw.body.toString()).toContain("console.log");
    });
  });
  it("falls through to the raw file when there is no sibling, and never caches index.html", async () => {
    await withServer(async (base) => {
      const plain = await get(`${base}/assets/plain-def.js`, "br");
      expect(plain.status).toBe(200); expect(plain.headers["content-encoding"]).toBeUndefined();
      expect(plain.headers["cache-control"]).toBe("public, max-age=31536000, immutable");
      const index = await get(`${base}/`, "br");
      expect(index.status).toBe(200); expect(index.headers["cache-control"]).toBe("no-cache");
      expect(index.body.toString()).toContain("<title>");
    });
  });
});
