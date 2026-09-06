import http from "node:http";
import path from "node:path";
import express from "express";
import cors from "cors";
import { Server, matchMaker } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { GAME_VERSION, MAX_PLAYERS } from "@frankibarber/shared";
import { TdmRoom } from "./rooms/TdmRoom";
import { clientDir, hostBanner } from "./hosting";

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
    players = list.reduce((n, r) => n + r.clients, 0);
  } catch { /* counts are informational */ }
  res.json({ ok: true, game: "BARBERSTRIKE", version: GAME_VERSION, maxPlayers: MAX_PLAYERS, uptime: process.uptime(), players, rooms });
});

// Room browser for the lobby: public, unlocked TDM rooms with their metadata.
app.get("/rooms", async (_req, res) => {
  try {
    const rooms = await matchMaker.query({ name: "tdm", locked: false, private: false });
    res.json(rooms.map((r) => ({ roomId: r.roomId, clients: r.clients, maxClients: r.maxClients, metadata: r.metadata })));
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
  app.use(express.static(CLIENT_DIR, { index: "index.html", maxAge: "1h" }));
  app.get(/^\/(?!health$|rooms$).*/, (_req, res) => { res.sendFile(path.join(CLIENT_DIR, "index.html")); });
}

const httpServer = http.createServer(app);
const gameServer = new Server({
  transport: new WebSocketTransport({ server: httpServer }),
});

// Rooms match on name AND mode (drop 4): a quick-play into "ffa" never lands in someone's TDM.
gameServer.define("tdm", TdmRoom).filterBy(["room", "mode"]);

gameServer.listen(PORT).then(() => {
  console.log(`[BARBERSTRIKE ${GAME_VERSION}] listening on :${PORT}`);
  for (const line of hostBanner(PORT, CLIENT_DIR !== null)) console.log(line);
});
