import { MapSchema, Schema, type } from "@colyseus/schema";

/**
 * The replicated state of the tournament waiting-room (`tournament-lobby`, drop V, D2/D3).
 *
 * This is a NEW schema, deliberately separate from `TdmState` (`../schema.ts`), which L6 keeps
 * untouched. The lobby holds NO game fields: no bodies, no positions, no health — it is a
 * coordinator that dirigates the START, carries the roster and the chat's result, and maps each
 * pair to the arena room playing it. The arenas themselves are ordinary `tdm` duels with their own
 * (unchanged) state.
 *
 * The wire shape mirrors `TournamentLobbyStateShape` in `@frankibarber/shared/lobbyProtocol`.
 */

/** One entrant on the roster. `seat` is the explicit slot; `connected` survives a drop for the grace. */
export class Entrant extends Schema {
  @type("string") id = "";
  @type("string") name = "";
  @type("boolean") ready = false;
  @type("boolean") connected = true;
  @type("uint8") seat = 0;
}

/** One arena: which bracket match it plays, which room it is, and whether it is still live. */
export class Arena extends Schema {
  @type("uint8") matchIndex = 0;
  @type("string") roomId = "";
  @type("boolean") live = false;
}

/**
 * The lobby's whole state. `bracket` is the SAME string as `bracketString` (`shared/tournament.ts`)
 * — no new bracket protocol. `phase` is a `LobbyPhase` value ("poczekalnia" | "trwa" | "koniec").
 */
export class TournamentLobbyState extends Schema {
  @type("string") hostId = "";
  @type("string") phase = "poczekalnia";
  @type({ map: Entrant }) entrants = new MapSchema<Entrant>();
  @type("string") bracket = "";
  @type({ map: Arena }) arenas = new MapSchema<Arena>();
}
