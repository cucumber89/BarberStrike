import { ArraySchema, MapSchema, Schema, type } from "@colyseus/schema";
import { MatchPhase } from "@frankibarber/shared";

/**
 * Replicated state. Keep this lean: it is diffed and broadcast at SNAPSHOT_RATE.
 * Anything event-like (shots, hits, kills) goes through messages instead.
 */
export class PlayerState extends Schema {
  @type("string") id = "";
  @type("string") name = "";
  @type("uint8") team = 0;
  @type("uint8") boysClass = 1;
  @type("uint8") nextClass = 1;

  @type("float32") x = 0;
  @type("float32") y = 0;
  @type("float32") z = 0;
  // Task 5: angles in 0.1 mrad and velocities in cm/s as int16 — half the bytes of float32 for
  // precision nothing on the client can tell apart (see quantAngle / quantVel in shared types).
  @type("int16") yaw = 0;
  @type("int16") pitch = 0;
  @type("int16") vx = 0;
  @type("int16") vy = 0;
  @type("int16") vz = 0;
  @type("boolean") grounded = true;
  @type("boolean") crouch = false;

  @type("uint8") health = 100;
  @type("boolean") alive = false;
  @type("string") weapon = "rifle";
  @type("uint16") ammo = 0;
  @type("uint16") reserve = 0;
  @type("boolean") reloading = false;
  /** Server time (ms) when the player becomes vulnerable again after spawning. 0 = none. */
  @type("float64") protectedUntil = 0;

  @type("uint16") kills = 0;
  @type("uint16") deaths = 0;
  @type("uint16") score = 0;
  @type("uint16") ping = 0;
  /** Last input sequence the server has simulated (for client reconciliation). */
  @type("boolean") connected = true;

  // ---- economy (1.1 drop 2): wallet + loadout, mirrored by the client's shop UI.
  @type("uint16") money = 0;
  @type(["string"]) owned = new ArraySchema<string>();
  @type("string") lethal = "";
  @type("uint8") lethalCount = 0;
  @type("string") tactical = "";
  @type("uint8") tacticalCount = 0;
  /** Server time (ms) of the last spawn: the buy window is open for ECONOMY.buyWindowMs after it. */
  @type("float64") spawnedAt = 0;

  // ---- drop 3: plate points and active perks (perk id → server time the buff ends).
  @type("uint8") armor = 0;
  @type({ map: "float64" }) perks = new MapSchema<number>();

  // ---- drop 4: lean (-1 / 0 / 1) and tactical sprint, for the third-person pose.
  @type("int8") lean = 0;
  @type("boolean") tac = false;
  // ---- drop 5: scoreboard v2 assists; bots are flagged so the HUD can tag them.
  @type("uint16") assists = 0;
  @type("boolean") bot = false;
  /**
   * Drop D: a visibly shaved head. Ostrzyżeni sets it on the shaved side for the round; Drop E's
   * shave will set it for the match. Cosmetic and replicated like a skin would be — it changes on
   * conversion and at round start, never per tick.
   */
  @type("boolean") shaved = false;
  /**
   * Drop E: the haircut, as ONE string — `"<id>"` or `"<id>#<n>"`, the equipped cosmetic plus the
   * number of times this player has been shaved (a clippers kill from behind) this match. See
   * `shared/haircuts.ts` for why both live in one field.
   *
   * It is written on join, on equip and on a shave death, and at no other time — never per tick
   * (L6). Drop D's `shaved` above is a different thing: the Ostrzyzeni side's bare scalp for a
   * round. A bare head hides hair, so the two never fight over the same pixels.
   */
  @type("string") haircut = "";
}

/** Domination flag (drop 4). `owner` / `capTeam` are -1 for neutral / nobody. */
export class FlagState extends Schema {
  @type("string") id = "";
  @type("int8") owner = -1;
  @type("int8") capTeam = -1;
  @type("float32") cap = 0;
  /** Both teams in the zone (progress frozen). */
  @type("boolean") contested = false;
}

export class BombState extends Schema {
  @type("uint8") round = 0;
  @type("uint8") attackTeam = 0;
  @type("string") stage = "idle";
  @type("string") carrier = "";
  @type("string") site = "";
  @type("float32") x = 0;
  @type("float32") y = 0;
  @type("float32") z = 0;
  @type("float64") endsAt = 0;
  @type("float64") roundEndsAt = 0;
  @type("string") actor = "";
  @type("float32") progress = 0;
  @type("string") result = "";
}

export class MatchState extends Schema {
  @type(BombState) bomb = new BombState();
  @type("string") phase: MatchPhase = MatchPhase.Waiting;
  /**
   * Server time (ms) when the current PHASE ends (0 = open ended). Since drop 7 that is a wave or a
   * preparation window during a match, NOT the match itself — see `matchEndsAt`.
   */
  @type("float64") phaseEndsAt = 0;
  /**
   * Server time (ms) when the match ends (0 = no match running). Split out of `phaseEndsAt` when
   * respawn waves arrived: the HUD's match clock reads this, the wave countdown reads phaseEndsAt.
   */
  @type("float64") matchEndsAt = 0;
  /**
   * THE LIVING ARENA: which tactical plan is in force this round (0 = none). One byte, changing at
   * most once a round, against a 12 kB/s snapshot budget. The plan TABLE lives in shared code on
   * both ends, so only the index travels — a client can never send geometry.
   */
  @type("uint8") planId = 0;
  @type("uint16") scoreA = 0;
  @type("uint16") scoreB = 0;
  @type("int8") winner = -1;
  /** Server time in ms, updated every snapshot for interpolation timestamps. */
  @type("float64") t = 0;
  @type("string") mapId = "";
  @type("string") roomName = "";
  /** Drop 4: "tdm" | "ffa" | "dom"; FFA winner by name (team modes leave it empty). */
  @type("string") mode = "tdm";
  @type("string") winnerId = "";
  @type("string") winnerName = "";
  @type([FlagState]) flags = new ArraySchema<FlagState>();
  @type({ map: PlayerState }) players = new MapSchema<PlayerState>();
}
