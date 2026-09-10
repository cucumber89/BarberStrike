import http from "node:http";
import express from "express";
import cors from "cors";
import { Server, matchMaker } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { GAME_VERSION, MAX_PLAYERS } from "@frankibarber/shared";
import { TdmRoom } from "./rooms/TdmRoom";
import { clientDir, hostBanner, serveClient, spaFallback } from "./hosting";
import { tickStats } from "./stats";

const PORT = Number(process.env.PORT ?? 2567);
const origins = (process.env.CORS_ORIGIN ?? "").split(",").map((s) => s.trim()).filter(Boolean);

const app = express();
app.use(cors({ origin: origins.length ? origins : true }));
app.get("/health", async (_req, res) => {
  // Player and room counts ride along (2.1): the menu shows "N playing" so a friend knows whether
  // anyone is in before they join. A failing query must not turn the health check red.
  let players = 0, rooms = 0;
  try {
    const list = await matchMaker.query({ name: "tdm" });
    rooms = list.length;
    // `clients` counts sockets, and a spectator is one. The room publishes the player count it
    // alone can tell apart; a room from before this shipped has no such field and falls back.
    players = list.reduce((n, r) => n + (r.metadata?.players ?? r.clients), 0);
  } catch { /* counts are informational */ }
  // `tick` (task 6): worst and mean simulation tick over the last minute, across rooms — the one
  // number that says whether the core the simulation runs on is keeping up. Watch it with curl.
  res.json({ ok: true, game: "BARBERSTRIKE", version: GAME_VERSION, maxPlayers: MAX_PLAYERS, uptime: process.uptime(), players, rooms, tick: tickStats() });
});

// Room browser for the lobby: public, unlocked TDM rooms with their metadata.
app.get("/rooms", async (_req, res) => {
  try {
    const rooms = await matchMaker.query({ name: "tdm", locked: false, private: false });
    // `clients` and `maxClients` are what the browser prints as "n / 12" and sorts on, so they
    // have to mean PLAYERS — six people watching must not make a room look full to a seventh who
    // wants to play. `watching` carries the rest, for anyone who wants to show it.
    res.json(rooms.map((r) => {
      const players = r.metadata?.players ?? r.clients;
      return { roomId: r.roomId, clients: players, maxClients: r.metadata?.slots ?? r.maxClients, watching: Math.max(0, r.clients - players), metadata: r.metadata };
    }));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

/**
 * Player-hosted games (2.0): serve the built client from this very process when it is there.
 *
 * Mounted AFTER the API routes so `/health` and `/rooms` keep winning, and the SPA fallback is
 * explicitly limited to GETs that are not those — a catch-all that swallowed them would hand the
 * client an HTML page where it expected JSON, which is a failure mode this project has already
 * paid for once on Netlify.
 */
const CLIENT_DIR = clientDir();
if (CLIENT_DIR) {
  // Precompressed assets and one Cache-Control per response (performance pass, task 3): see hosting.ts.
  app.use(serveClient(CLIENT_DIR));
  app.use(spaFallback(CLIENT_DIR)); // `/r/<room>` and friends land on the game (Drop D, join by link)
}

const httpServer = http.createServer(app);
const gameServer = new Server({
  transport: new WebSocketTransport({ server: httpServer }),
});

// Rooms match on name AND mode (drop 4) AND map (drop G): a quick-play into "ffa" never lands in
// someone's TDM, and a quick-play onto GÓRA never lands in a Night District room.
gameServer.define("tdm", TdmRoom).filterBy(["room", "mode", "map"]);

gameServer.listen(PORT).then(() => {
  console.log(`[BARBERSTRIKE ${GAME_VERSION}] listening on :${PORT}`);
  for (const line of hostBanner(PORT, CLIENT_DIR !== null)) console.log(line);
});
