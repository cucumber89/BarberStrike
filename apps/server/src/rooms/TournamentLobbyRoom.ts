import { Room, matchMaker, type Client } from "@colyseus/core";
import {
  LOBBY_CHAT_MAX_LEN,
  LOBBY_CHAT_MIN_INTERVAL_MS,
  TOURNAMENT_MAX_ENTRANTS,
  TOURNAMENT_SIZES,
  bracketString,
  currentMatch,
  mulberry32,
  reportWinner,
  sanitizeChat,
  seedBracket,
  withdraw,
  type Bracket,
  type LobbyChatLine,
  type LobbyChatMsg,
  type LobbyReadyMsg,
  type LobbySpectateMsg,
  type TournamentSize,
} from "@frankibarber/shared";
import { Arena, Entrant, TournamentLobbyState } from "./LobbyState";
import { persistFinish, planFinish, resolveClaim, resolveIdentity, type LobbyIdentity } from "./tournamentFinish";

/**
 * The tournament waiting-room (`tournament-lobby`, drop V, D1). A light coordinator on the
 * `TournamentLobbyState` schema (P0) — ZERO physics, zero game tick: it never calls `setTimestep`
 * and holds no bodies. It carries the roster, the readiness, the chat, and it dirigates the START.
 *
 * On START it draws the bracket (`seedBracket`, shared) and raises one `tdm mode="duel"` arena per
 * round-one pair through the server-side `matchMaker`, injecting the pair plus `tournamentId` and
 * `matchIndex` in the join options so each arena knows where to publish its result. It then
 * subscribes to the Colyseus `presence` channel `tourn:<lobbyId>:<matchIndex>` = {winner,scoreA,
 * scoreB}; each result advances the bracket (`reportWinner` → `settleByes`) and, when a round
 * finishes, raises the arenas of the next one. The arenas are ordinary duels and speak the game's
 * own untouched protocol (L6).
 */

/** The join options a host (or invited player) may send the lobby. `size` picks the draw. */
interface LobbyJoinOptions {
  name?: string;
  size?: number;
  map?: string;
  mode?: string;
  seed?: number;
}

/** The result an arena publishes on `tourn:<lobbyId>:<matchIndex>` when its duel ends. */
interface ArenaResult {
  winner: string;
  scoreA: number;
  scoreB: number;
}

const isFiniteNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** Nearest allowed draw size ≥ the entrant count, capped at the hard maximum (D8). */
function pickSize(asked: unknown, entrants: number): TournamentSize {
  const want = isFiniteNumber(asked) && TOURNAMENT_SIZES.includes(asked as TournamentSize) ? (asked as TournamentSize) : undefined;
  if (want && want >= entrants) return want;
  for (const s of TOURNAMENT_SIZES) if (s >= Math.max(2, entrants) && s <= TOURNAMENT_MAX_ENTRANTS) return s;
  return TOURNAMENT_MAX_ENTRANTS as TournamentSize;
}

export class TournamentLobbyRoom extends Room<{ state: TournamentLobbyState; metadata: { kind: string; map: string } }> {
  override maxClients = TOURNAMENT_MAX_ENTRANTS;
  override autoDispose = true;
  override state = new TournamentLobbyState();

  /** The seat counter, so an entrant's slot number is stable and monotonic across joins. */
  private nextSeat = 0;
  /** Last chat timestamp per entrant id, for the per-entrant rate-limit (§3.3). */
  private lastChatAt = new Map<string, number>();
  /** The draw as a plain object; the replicated `bracket` string is derived from it. */
  private bracket: Bracket | null = null;
  /** The map every arena is created on, chosen at lobby creation. */
  private map = "";
  /** Match indices whose presence channel we have already subscribed to (idempotent). */
  private subscribed = new Set<number>();
  private askedSize: number | undefined;
  private seed = 0;
  /**
   * P7: the account behind each signed-in entrant, keyed by `sessionId` (the same id the bracket
   * carries in every slot). Filled by the `lobby:identify` handler from a session token; used at the
   * finish to record the champion's login and to award trophies. A guest never appears here.
   */
  private identities = new Map<string, LobbyIdentity>();
  /** P7: guard so the finish write happens exactly once, even if `advanceRounds` is re-entered. */
  private finished = false;

  override onCreate(options: LobbyJoinOptions): void {
    this.map = typeof options?.map === "string" ? options.map : "";
    this.askedSize = isFiniteNumber(options?.size) ? options.size : undefined;
    // A pinned PRNG for the draw makes a tournament reproducible in a test; production seeds on time.
    this.seed = isFiniteNumber(options?.seed) ? options.seed >>> 0 : (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0;
    this.setMetadata({ kind: "tournament-lobby", map: this.map });

    this.onMessage("lobby:ready", (client, msg: LobbyReadyMsg) => this.onReady(client, msg));
    this.onMessage("lobby:chat", (client, msg: LobbyChatMsg) => this.onChat(client, msg));
    this.onMessage("lobby:start", (client) => this.onStart(client));
    this.onMessage("lobby:spectate", (client, msg: LobbySpectateMsg) => this.onSpectate(client, msg));
    // P7: a signed-in player identifies itself so its win/run earns a trophy. Additive — it touches
    // neither the roster nor the start/arena flow; a guest simply never sends it.
    this.onMessage("lobby:identify", (client, msg: { session?: string; login?: string }) => this.onIdentify(client, msg));
  }

  /**
   * P7: remember the account behind this client, keyed by its `sessionId`. A session token is verified
   * (the strong path); failing that a claimed login is looked up (the browser only holds an HttpOnly
   * cookie it cannot read, so it claims its login — enough for a cosmetic trophy, L1). Nothing to
   * resolve clears any prior identity (the client is a guest). Never errors, never replies.
   */
  private onIdentify(client: Client, msg: { session?: string; login?: string }): void {
    const who =
      resolveIdentity(typeof msg?.session === "string" ? msg.session : "") ??
      resolveClaim(typeof msg?.login === "string" ? msg.login : "");
    if (who) this.identities.set(client.sessionId, who);
    else this.identities.delete(client.sessionId);
  }

  override onJoin(client: Client, options: LobbyJoinOptions): void {
    const e = new Entrant();
    e.id = client.sessionId;
    e.name = (typeof options?.name === "string" ? options.name : "").slice(0, 16) || "Gracz";
    e.ready = false;
    e.connected = true;
    e.seat = this.nextSeat++ & 0xff;
    this.state.entrants.set(client.sessionId, e);
    // The first one in the room hosts it — they alone get to click START (D2).
    if (!this.state.hostId) this.state.hostId = client.sessionId;
  }

  override async onLeave(client: Client, _code?: number): Promise<void> {
    // Lobby-side only: mark the entrant offline for the grace. The ARENA's grace (60 s) and the
    // eventual walkover are P3's job in `TdmRoom`; here, before START, a leaver simply drops off the
    // roster so the host is not blocked by a ghost. After START the entrant stays named on the
    // bracket (its life is independent of the roster).
    const e = this.state.entrants.get(client.sessionId);
    if (!e) return;
    e.connected = false;
    if (this.state.phase === "poczekalnia") {
      this.state.entrants.delete(client.sessionId);
      this.lastChatAt.delete(client.sessionId);
      // P7: drop the identity only before START — after the draw an entrant stays on the bracket, and
      // must keep its identity so a champion who disconnects still earns their trophy.
      this.identities.delete(client.sessionId);
      if (this.state.hostId === client.sessionId) {
        const next = this.state.entrants.keys().next();
        this.state.hostId = next.done ? "" : next.value;
      }
    }
  }

  // ------------------------------------------------------------------ readiness + chat

  private onReady(client: Client, msg: LobbyReadyMsg): void {
    if (this.state.phase !== "poczekalnia") return;
    const e = this.state.entrants.get(client.sessionId);
    if (!e) return;
    e.ready = typeof msg?.ready === "boolean" ? msg.ready : !e.ready;
  }

  private onChat(client: Client, msg: LobbyChatMsg): void {
    const e = this.state.entrants.get(client.sessionId);
    if (!e) return;
    const now = Date.now();
    const last = this.lastChatAt.get(client.sessionId) ?? 0;
    // Rate-limit: a second line inside the interval is dropped silently (§3.3), no state change.
    if (now - last < LOBBY_CHAT_MIN_INTERVAL_MS) return;
    const text = sanitizeChat(typeof msg?.text === "string" ? msg.text : "");
    if (!text) return;
    this.lastChatAt.set(client.sessionId, now);
    const line: LobbyChatLine = { id: client.sessionId, name: e.name, text, at: now };
    this.broadcast("lobby:chat", line);
  }

  private onSpectate(client: Client, msg: LobbySpectateMsg): void {
    if (!isFiniteNumber(msg?.matchIndex)) return;
    const arena = this.state.arenas.get(String(msg.matchIndex));
    if (arena) client.send("lobby:goto", { roomId: arena.roomId, matchIndex: arena.matchIndex });
  }

  // ------------------------------------------------------------------ START → arenas

  private async onStart(client: Client): Promise<void> {
    // Host only, and only from the waiting room. A start from anybody else is ignored in silence.
    if (client.sessionId !== this.state.hostId || this.state.phase !== "poczekalnia") return;
    const roster = [...this.state.entrants.values()];
    const ready = roster.filter((e) => e.ready);
    // Disabled below two ready — a bracket needs a pair to have a first match to play.
    if (ready.length < 2) return;

    const size = pickSize(this.askedSize, ready.length);
    this.bracket = seedBracket(ready.map((e) => ({ id: e.id, name: e.name })), size, mulberry32(this.seed));
    this.state.bracket = bracketString(this.bracket);
    this.state.phase = "trwa";
    await this.raiseRoundArenas();
  }

  /**
   * Raise a `tdm mode="duel"` arena for every pair that actually needs playing in the current front
   * of the bracket, and record it in `arenas`. `seedBracket`/`settleByes` have already walked past
   * byes, so `at` points at the first real pair; every pair in the SAME round as `at` is live now.
   */
  private async raiseRoundArenas(): Promise<void> {
    const b = this.bracket;
    if (!b) return;
    const cur = currentMatch(b);
    if (!cur) return;
    const round = b.matches[b.at].round;
    for (let i = b.at; i < b.matches.length; i++) {
      const m = b.matches[i];
      if (m.round !== round) break;
      if (!m.a || !m.b || m.winner) continue;      // byes/settled pairs never get an arena
      if (this.state.arenas.has(String(i))) continue;
      // P7 (Ultron's P2 note): isolate each arena's creation. A `matchMaker.createRoom` that throws
      // for one pair (a transient matchmaker error) must not abort the whole round — the other pairs
      // still get their arena, and the failed one can be re-raised on the next `advanceRounds` pass.
      try {
        await this.raiseArena(i, m.a, m.b);
      } catch (err) {
        console.warn(`[tournament-lobby] arena create failed for match ${i} in ${this.roomId}:`, err);
      }
    }
  }

  /** Create one arena room for match `matchIndex` and put its pair in it. Records it in `arenas`. */
  private async raiseArena(matchIndex: number, a: string, b: string): Promise<void> {
    const listing = await matchMaker.createRoom("tdm", {
      mode: "duel",
      map: this.map || undefined,
      room: `${this.roomId}-m${matchIndex}`,
      // The context the arena carries back to the lobby (D3/D4): where to publish its result.
      tournamentId: this.roomId,
      matchIndex,
      pair: [a, b],
      seed: this.seed ^ (matchIndex + 1),
    } as Record<string, unknown>);

    const arena = new Arena();
    arena.matchIndex = matchIndex;
    arena.roomId = listing.roomId;
    arena.live = true;
    this.state.arenas.set(String(matchIndex), arena);

    // Subscribe to this pair's result channel. The arena publishes {winner,scoreA,scoreB} on its
    // `endMatch` (P3, TdmRoom); here we advance the bracket and, when the round empties, raise the
    // next one. Idempotent: a re-raise after a restart re-uses the same subscription.
    await this.subscribeResult(matchIndex);
  }

  private async subscribeResult(matchIndex: number): Promise<void> {
    if (this.subscribed.has(matchIndex)) return;
    this.subscribed.add(matchIndex);
    const topic = `tourn:${this.roomId}:${matchIndex}`;
    await this.presence.subscribe(topic, (data: ArenaResult) => this.onArenaResult(matchIndex, data));
  }

  /**
   * A pair's arena reported its result. Feed it into the bracket, mark the arena finished, push the
   * replicated `bracket` string, and — if this was the last live pair of the round — raise the next
   * round's arenas. The bracket advances by `reportWinner` (which settles byes past the result), so
   * a walkover-shaped result (empty `winner`) withdraws the missing side instead.
   */
  private onArenaResult(matchIndex: number, data: ArenaResult): void {
    const b = this.bracket;
    if (!b) return;
    const m = b.matches[matchIndex];
    if (!m) return;
    // Only the pair currently at the front can be reported; a result for a settled or future match
    // is ignored so a stray publish cannot corrupt the draw (`reportWinner` also guards this).
    const winner = data?.winner ?? "";
    const scoreA = isFiniteNumber(data?.scoreA) ? data.scoreA : 0;
    const scoreB = isFiniteNumber(data?.scoreB) ? data.scoreB : 0;
    const before = b.at;
    this.bracket = winner && (winner === m.a || winner === m.b)
      ? reportWinner(b, winner, scoreA, scoreB)
      : withdraw(b, winner ? "" : m.a || m.b); // a resultless arena is a walkover for whoever is there
    if (this.bracket.at === before && winner) return; // nothing moved: not the front pair

    this.state.bracket = bracketString(this.bracket);
    const arena = this.state.arenas.get(String(matchIndex));
    if (arena) arena.live = false;

    // If every arena of the current front is done, open the next round.
    void this.advanceRounds();
  }

  /** Raise the next round's arenas once the current front has no live arena left, or finish. */
  private async advanceRounds(): Promise<void> {
    const b = this.bracket;
    if (!b) return;
    const cur = currentMatch(b);
    if (!cur) {
      // The final has been played: the tournament is over. P7 hooks the champion write here.
      this.state.phase = "koniec";
      this.finishTournament();
      return;
    }
    // Only raise the next round once no arena of the previous front is still live.
    const anyLive = [...this.state.arenas.values()].some((x) => x.live);
    if (anyLive) return;
    await this.raiseRoundArenas();
  }

  // ------------------------------------------------------------------ P7: the finish write

  /**
   * The tournament reached `phase="koniec"`: record the hall-of-fame row and every signed-in placer's
   * trophy through the account store. Runs exactly once (`finished` guard) and never throws into the
   * room — a failed persist must not take down the lobby, and the bracket already stands in the state.
   * A guest champion is still recorded under their nick; only signed-in entrants earn a trophy row.
   */
  private finishTournament(): void {
    if (this.finished || !this.bracket) return;
    this.finished = true;
    try {
      const plan = planFinish(this.roomId, this.bracket, this.identities, bracketString(this.bracket));
      if (plan) persistFinish(plan);
    } catch (err) {
      // The finish is history, not a gate (L1): a store hiccup must never crash the coordinator.
      console.warn(`[tournament-lobby] finish write failed for ${this.roomId}:`, err);
    }
  }
}
