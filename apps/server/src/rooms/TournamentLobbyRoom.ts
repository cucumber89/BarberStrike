import { Room, matchMaker, type Client } from "@colyseus/core";
import {
  LOBBY_CHAT_MAX_LEN,
  LOBBY_CHAT_MIN_INTERVAL_MS,
  TOURNAMENT_MAX_ENTRANTS,
  bracketCapacity,
  bracketString,
  currentMatch,
  isLobbySeats,
  mulberry32,
  reportWinner,
  sanitizeChat,
  seedBracket,
  withdraw,
  type Bracket,
  type LobbyChatLine,
  type LobbyGotoMsg,
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
  /** The name the console gave the tournament (the `/r/<room>?mode=lobby` link carries it). A label. */
  room?: string;
  mode?: string;
  seed?: number;
  /** The admin password (from the /viewer console). Required to CREATE a lobby when the server sets
   * `ADMIN_PASSWORD`; ignored when joining an existing one. */
  adminKey?: string;
}

/** The result an arena publishes on `tourn:<lobbyId>:<matchIndex>` when its duel ends. */
interface ArenaResult {
  winner: string;
  scoreA: number;
  scoreB: number;
}

const isFiniteNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/**
 * How long a tournament ALREADY UNDER WAY is held open with nobody in the room.
 *
 * It has to be held open at all because everybody playing means an empty waiting room: Colyseus
 * disposes an empty room a second later, and a disposed lobby is a tournament that has silently
 * ceased to exist — the bracket gone, the results its arenas publish landing on a channel nobody is
 * subscribed to any more. A pair playing to `DUEL.wins` can take a good twenty minutes, so the wait
 * is longer than that; past it the room really has been abandoned and is let go, so a forgotten
 * tournament cannot hold the VPS forever.
 */
const LOBBY_ABANDON_MS = 30 * 60 * 1000;

/**
 * The bracket size for a draw: a power of two big enough for the seats the host ASKED for (the
 * slider, LOBBY_SEATS — any even count) or the players who actually turned up, whichever is larger,
 * capped at the hard maximum (D8). Empty seats become byes.
 */
function pickSize(asked: unknown, entrants: number): TournamentSize {
  const want = isFiniteNumber(asked) && isLobbySeats(asked) ? asked : 0;
  const base = Math.min(TOURNAMENT_MAX_ENTRANTS, Math.max(2, entrants, want));
  return bracketCapacity(base);
}

export class TournamentLobbyRoom extends Room<{ state: TournamentLobbyState; metadata: { kind: string; room: string; map: string; name: string } }> {
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
  /**
   * HOTFIX — the seat a socket is sitting in, both ways round.
   *
   * A player who goes off to play their match LEAVES this room: the waiting-room screen lives inside
   * the menu, and the menu is gone while a match is on. They come back to the menu when the match
   * ends, the screen reconnects — and with a brand new Colyseus session id. The bracket keys on the
   * id the entrant was drawn under, so a fresh seat for the returning player means the next round's
   * arena is offered to a session that no longer exists: the semi-finals played and then nobody
   * could get into the final.
   *
   * So an ENTRANT ID is now an identity that outlives its socket, and these two maps say which
   * socket is currently speaking for it (`reseat` rebinds a returning player to the seat they
   * already hold). Everything else — the roster, the bracket, the identities — is untouched and
   * still keyed by entrant id.
   */
  private entrantBySocket = new Map<string, string>();
  private socketByEntrant = new Map<string, string>();
  /** The abandonment timer, armed only while a started tournament sits with nobody in the room. */
  private abandonTimer: ReturnType<typeof setTimeout> | undefined;

  /** The entrant this socket speaks for. Its own id, until a rejoin puts it in an older seat. */
  private who(client: Client): string {
    return this.entrantBySocket.get(client.sessionId) ?? client.sessionId;
  }

  /** The live socket of an entrant, if it has one right now. */
  private clientOf(entrantId: string): Client | undefined {
    const sid = this.socketByEntrant.get(entrantId) ?? entrantId;
    return this.clients.find((c) => c.sessionId === sid);
  }

  /** Point a socket at a seat (both directions), dropping whatever socket held it before. */
  private bind(client: Client, entrantId: string): void {
    const prev = this.socketByEntrant.get(entrantId);
    if (prev && prev !== client.sessionId) this.entrantBySocket.delete(prev);
    this.entrantBySocket.set(client.sessionId, entrantId);
    this.socketByEntrant.set(entrantId, client.sessionId);
  }

  /**
   * Hold the room open while the tournament is on, and let it go when it truly has been abandoned.
   *
   * `autoDispose` is turned off at START because the normal state of a tournament in progress is an
   * EMPTY waiting room — everybody is in their arena. `LOBBY_ABANDON_MS` is the backstop, and every
   * join cancels it.
   */
  private armAbandon(): void {
    clearTimeout(this.abandonTimer);
    this.abandonTimer = undefined;
    if (this.state.phase !== "trwa" || this.clients.length > 0) return;
    this.abandonTimer = setTimeout(() => { void this.disconnect(); }, LOBBY_ABANDON_MS);
  }

  override onDispose(): void {
    clearTimeout(this.abandonTimer);
    this.abandonTimer = undefined;
  }

  /**
   * Somebody joining a tournament ALREADY UNDER WAY is, almost always, one of its players walking
   * back in from their match — so put them back in their own seat instead of seating them as a
   * newcomer who is in no pair and plays nothing. The nickname is what identifies them: it is the
   * same field the roster is drawn from and the same one the arena matches its sides by. Only an
   * unambiguous case is accepted — exactly one seat, empty, under that name — and anything else
   * falls through to an ordinary join.
   */
  private reseat(client: Client, name: string): boolean {
    const free = [...this.state.entrants.values()].filter((e) => !e.connected && e.name === name);
    if (free.length !== 1) return false;
    free[0].connected = true;
    this.bind(client, free[0].id);
    // ...and if a match of theirs is waiting to be played, send them to it now. This is the other
    // half of the round-two hole: the arenas of a round are raised the moment the last match of the
    // previous one reports, and at that moment its two players are usually still on the summary
    // screen of the match they have just finished, with nothing listening in this room. Offering the
    // arena again on the way back in is what gets them there.
    void this.offerCurrentArena(free[0].id);
    return true;
  }

  /**
   * Send an entrant to the arena of their unplayed match in the round being played, raising it again
   * if it has gone. Colyseus disposes an empty room shortly after it is created, so a pair that both
   * took longer than that to come back from their previous match can find their arena already gone —
   * and an arena nobody can enter is the tournament stuck. Re-raising is safe: `arenas` is keyed by
   * match index so the record is replaced, and the result subscription is idempotent.
   *
   * A match that already has a winner is never offered, so coming back from a match you have just
   * WON does not drag you into the room you have just left.
   */
  private async offerCurrentArena(id: string): Promise<void> {
    const b = this.bracket;
    if (!b || this.state.phase !== "trwa") return;
    const front = b.matches[b.at];
    if (!front) return;
    for (let i = b.at; i < b.matches.length; i++) {
      const m = b.matches[i];
      if (m.round !== front.round) break;
      if (m.winner || !m.a || !m.b || (m.a !== id && m.b !== id)) continue;
      const arena = this.state.arenas.get(String(i));
      // Local lookup: this is a one-process server (one container, D8), so a room that is not local
      // is a room that no longer exists.
      if (arena && matchMaker.getLocalRoomById(arena.roomId)) {
        this.clientOf(id)?.send("lobby:goto", { roomId: arena.roomId, matchIndex: i, play: true } satisfies LobbyGotoMsg);
        return;
      }
      this.state.arenas.delete(String(i));
      try {
        await this.raiseArena(i, m.a, m.b);   // re-raising tells BOTH of them where to go
      } catch (err) {
        console.warn(`[tournament-lobby] re-raise failed for match ${i} in ${this.roomId}:`, err);
      }
      return;
    }
  }

  override onCreate(options: LobbyJoinOptions): void {
    // A tournament is raised only from the admin console (/viewer): when the server sets an admin
    // password, creating a lobby needs it. Joining an existing lobby by id is unaffected. With no
    // password set (dev) creation is open. Rejecting here fails the client's `create()` outright.
    const admin = process.env.ADMIN_PASSWORD ?? "";
    if (admin && options?.adminKey !== admin) {
      throw new Error("tournament creation requires the admin password");
    }
    this.map = typeof options?.map === "string" ? options.map : "";
    this.askedSize = isFiniteNumber(options?.size) ? options.size : undefined;
    // A pinned PRNG for the draw makes a tournament reproducible in a test; production seeds on time.
    this.seed = isFiniteNumber(options?.seed) ? options.seed >>> 0 : (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0;
    // The name IS the matchmaking key (`filterBy(["room"])`, index.ts): tonight's link leads to
    // tonight's tournament and never into one already being played. The admin console's MECZE table
    // prints it, and the invite link carries it in the path.
    //
    // It has to be carried in the metadata VERBATIM, because that is where Colyseus keeps a filter
    // key and `setMetadata` replaces the lot: a metadata block without `room` leaves the lobby
    // unmatchable by name, and every joiner either lands in some other tournament or starts one of
    // their own. (`TdmRoom` repeats `room`/`mode`/`map` in its own metadata for the same reason.)
    const asked = typeof options?.room === "string" ? options.room : "";
    this.setMetadata({ kind: "tournament-lobby", room: asked, map: this.map, name: asked.trim().slice(0, 24) });

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
    if (who) this.identities.set(this.who(client), who);
    else this.identities.delete(this.who(client));
  }

  override onJoin(client: Client, options: LobbyJoinOptions): void {
    const name = (typeof options?.name === "string" ? options.name : "").slice(0, 16) || "Gracz";
    clearTimeout(this.abandonTimer);
    this.abandonTimer = undefined;
    // A player walking back in from their match takes the seat they already hold, bracket and all.
    if (this.state.phase !== "poczekalnia" && this.reseat(client, name)) return;
    const e = new Entrant();
    e.id = client.sessionId;
    e.name = name;
    e.ready = false;
    e.connected = true;
    e.seat = this.nextSeat++ & 0xff;
    this.state.entrants.set(client.sessionId, e);
    this.bind(client, client.sessionId);
    // The first one in the room hosts it — they alone get to click START (D2).
    if (!this.state.hostId) this.state.hostId = client.sessionId;
  }

  override async onLeave(client: Client, _code?: number): Promise<void> {
    // Lobby-side only: mark the entrant offline for the grace. The ARENA's grace (60 s) and the
    // eventual walkover are P3's job in `TdmRoom`; here, before START, a leaver simply drops off the
    // roster so the host is not blocked by a ghost. After START the entrant stays named on the
    // bracket (its life is independent of the roster).
    const id = this.who(client);
    this.entrantBySocket.delete(client.sessionId);
    // Only if it is still THIS socket sitting there: a returning player has already taken the seat.
    if (this.socketByEntrant.get(id) === client.sessionId) this.socketByEntrant.delete(id);
    const e = this.state.entrants.get(id);
    if (!e) return;
    e.connected = false;
    if (this.state.phase === "poczekalnia") {
      this.state.entrants.delete(id);
      this.lastChatAt.delete(id);
      // P7: drop the identity only before START — after the draw an entrant stays on the bracket, and
      // must keep its identity so a champion who disconnects still earns their trophy.
      this.identities.delete(id);
      if (this.state.hostId === id) {
        const next = this.state.entrants.keys().next();
        this.state.hostId = next.done ? "" : next.value;
      }
    }
    // A started tournament with nobody in the room is the normal state of one being PLAYED, not a
    // tournament to throw away — but it is also how an abandoned one looks, so arm the backstop.
    this.armAbandon();
  }

  // ------------------------------------------------------------------ readiness + chat

  private onReady(client: Client, msg: LobbyReadyMsg): void {
    if (this.state.phase !== "poczekalnia") return;
    const e = this.state.entrants.get(this.who(client));
    if (!e) return;
    e.ready = typeof msg?.ready === "boolean" ? msg.ready : !e.ready;
  }

  private onChat(client: Client, msg: LobbyChatMsg): void {
    const id = this.who(client);
    const e = this.state.entrants.get(id);
    if (!e) return;
    const now = Date.now();
    const last = this.lastChatAt.get(id) ?? 0;
    // Rate-limit: a second line inside the interval is dropped silently (§3.3), no state change.
    if (now - last < LOBBY_CHAT_MIN_INTERVAL_MS) return;
    const text = sanitizeChat(typeof msg?.text === "string" ? msg.text : "");
    if (!text) return;
    this.lastChatAt.set(id, now);
    const line: LobbyChatLine = { id, name: e.name, text, at: now };
    this.broadcast("lobby:chat", line);
  }

  private onSpectate(client: Client, msg: LobbySpectateMsg): void {
    if (!isFiniteNumber(msg?.matchIndex)) return;
    const arena = this.state.arenas.get(String(msg.matchIndex));
    if (arena) client.send("lobby:goto", { roomId: arena.roomId, matchIndex: arena.matchIndex, play: false } satisfies LobbyGotoMsg);
  }

  // ------------------------------------------------------------------ START → arenas

  private async onStart(client: Client): Promise<void> {
    // Host only, and only from the waiting room. A start from anybody else is ignored in silence.
    if (this.who(client) !== this.state.hostId || this.state.phase !== "poczekalnia") return;
    const roster = [...this.state.entrants.values()];
    const ready = roster.filter((e) => e.ready);
    // Disabled below two ready — a bracket needs a pair to have a first match to play.
    if (ready.length < 2) return;

    const size = pickSize(this.askedSize, ready.length);
    this.bracket = seedBracket(ready.map((e) => ({ id: e.id, name: e.name })), size, mulberry32(this.seed));
    this.state.bracket = bracketString(this.bracket);
    this.state.phase = "trwa";
    // From here the room must outlive its sockets: everybody is about to leave for their arena.
    this.autoDispose = false;
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

  /**
   * An entrant's display name. The roster is the truth while they are connected; the bracket's own
   * `names` map keeps naming somebody who has already dropped out of the room.
   */
  private nameOf(id: string): string {
    return this.state.entrants.get(id)?.name ?? this.bracket?.names[id] ?? "";
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
      // ...and the pair's NICKNAMES in the same order. The arena hands its two sides out by whoever
      // connected first unless it can tell who is who, and the result it publishes only names a TEAM
      // — so without this the bracket advances the loser whenever the pair joined the other way
      // round (`TdmRoom.sideOfPair`).
      pairNames: [this.nameOf(a), this.nameOf(b)],
      seed: this.seed ^ (matchIndex + 1),
    } as Record<string, unknown>);

    const arena = new Arena();
    arena.matchIndex = matchIndex;
    arena.roomId = listing.roomId;
    arena.live = true;
    this.state.arenas.set(String(matchIndex), arena);

    // AND TELL THE TWO PEOPLE WHOSE MATCH IT IS. Writing the arena into `arenas` puts it on the
    // spectators' list; it sends nobody anywhere. The room was raised by the matchmaker, so it has
    // no name a client could type and no listing a client could find — if the pair is not told, the
    // arena stands empty. Measured live on the first tournament: the bracket drew, sixteen arenas
    // came up, and not one player could get into a match.
    for (const id of [a, b]) {
      this.clientOf(id)?.send("lobby:goto", { roomId: listing.roomId, matchIndex, play: true } satisfies LobbyGotoMsg);
    }

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
      // The bracket is settled; the room may go as soon as the last person has read it.
      this.autoDispose = true;
      this.armAbandon();
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
