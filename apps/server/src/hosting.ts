import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

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
