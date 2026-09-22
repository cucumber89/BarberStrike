/** Simulation / networking constants shared by client and server. Single source of truth. */

/** Product version shown in the menu, pause screen, telemetry and `/health`. Bump with package.json. */
export const GAME_VERSION = "2.0 beta";

export const TICK_RATE = 60;
export const TICK_DT = 1 / TICK_RATE;
export const TICK_MS = 1000 / TICK_RATE;

/** How often the server broadcasts state patches (Hz). Remote players are interpolated between them. */
export const SNAPSHOT_RATE = 20;
export const SNAPSHOT_MS = 1000 / SNAPSHOT_RATE;
/** Interpolation delay applied by the client for remote players. ~2 snapshots + jitter margin. */
export const INTERP_DELAY_MS = 110;
/** Server keeps this much positional history for lag-compensated hit tests. */
export const LAG_COMP_MAX_MS = 350;

/**
 * Seats a room of the FIXED-ROSTER modes has, bots included: Bomb, Domination, The Boys, Gun Game,
 * Ostrzyżeni. Those modes are built around a roster you can hold in your head (a site take, a flag
 * rotation, one hunter), so twelve bodies is the design, not a limit of the engine.
 */
export const MAX_PLAYERS = 12;
/**
 * The OPEN LOBBY cap: how many HUMANS a deathmatch room admits (`OPEN_MODES` in `modes.ts`).
 *
 * Deathmatch has no roster shape to protect — it is the mode you drop a crowd into — so bots stop
 * taking human seats there (a full house of `MAX_BOTS` sits on top of these) and the only ceiling
 * left is what one room can simulate and send.
 *
 * Why 32 and not "no number at all": a room costs CPU per body and bandwidth per body PER SOCKET,
 * so the wire bill grows as the square of the room, and both halves were MEASURED at exactly this
 * cap rather than guessed.
 *
 *   tick   `tickCost.test.ts`: 32 humans + 8 bots = 40 bodies, mean **0.32 ms** of a 16.7 ms tick
 *          (the full fixed-roster room of 12 measures 0.25 ms — the crowd is not what costs the
 *          simulation; the eight bots' planning is, and there are still eight of them).
 *   wire   `netBytes.test.ts`: **3.6 kB/s** per client at 40 bodies, against 3.3 kB/s at 10 —
 *          a body that does not move costs nothing per tick. Eight moving bodies are ~0.4 kB/s
 *          each, so a room where all 40 are running is ~16 kB/s per client and ~0.5 MB/s out of
 *          the process; 64 humans would be ~4× that, and a 2-vCPU VPS is where this runs.
 *
 * Neither number is the one that will decide this in the end: only a playtest can price 32 people
 * all sending input, and the CLIENT drawing 40 characters is its own budget. So this is "a crowd
 * the server can serve", not a ceiling anybody has hit.
 *
 * A host who knows their machine can raise or lower it with `FB_MAX_PLAYERS` (see
 * `openPlayerCap()`); `OPEN_PLAYER_CAP_MAX` is the hard ceiling that env var is clamped to.
 */
export const OPEN_MAX_PLAYERS = 32;
/** The most `FB_MAX_PLAYERS` may ask for. Past this the wire cost stops being servable. */
export const OPEN_PLAYER_CAP_MAX = 64;
/**
 * Watchers a room admits on top of its players (`/viewer`). They hold a socket and receive state
 * patches, and that is the whole cost — no body, no simulation, no scoreboard row. Six is a
 * tournament's worth: both captains, a caster and a spare.
 */
export const MAX_SPECTATORS = 6;
export const MAX_NAME_LENGTH = 16;
export const MIN_NAME_LENGTH = 2;

/**
 * Max inputs a client may send per second before the surplus is dropped.
 *
 * A client emits ONE input per rendered frame, so this ceiling is a display refresh rate, not a
 * guess: at 90 it refused a 144 Hz player nine inputs a second and the room rubber-banded them
 * once per second, every second. 250 clears every display anyone plays on. Nothing about speed
 * hacking rides on this number — the per-player time bank prices each input by its `dt`, so extra
 * inputs buy no extra movement; this cap is only here so a flood cannot cost the tick CPU.
 */
export const MAX_INPUT_RATE = 250;
/** Max dt (ms) accepted per input; longer frames are clamped so a stalled tab cannot "teleport". */
export const MAX_INPUT_DT_MS = 50;
/**
 * Resolution of the `dt` field on the wire: tenths of a millisecond.
 *
 * The client must quantise to this with `InputDt` rather than rounding each frame on its own — see
 * that class for why rounding per frame makes a 60 Hz player's movement decay over a match.
 */
export const INPUT_DT_STEP_MS = 0.1;
/** Max inputs per C2S.Input message; larger batches are dropped whole (a real client sends 1–3). */
export const MAX_INPUT_BATCH = 12;
/** Max queued (not yet simulated) inputs per player on the server; the oldest are discarded beyond this. */
export const MAX_INPUT_QUEUE = 12;
/** Max non-input messages (equip/reload/ping/…) a client may send per second. */
export const MAX_OTHER_MSG_RATE = 30;

export const PLAYER = {
  /** Horizontal half-extent of the collision box (metres). */
  halfWidth: 0.35,
  height: 1.8,
  crouchHeight: 1.25,
  eyeHeight: 1.62,
  crouchEyeHeight: 1.08,
  /** Fraction of the body height (from the top) that counts as head for hitscan. */
  headFraction: 0.18,
  maxHealth: 100,
  walkSpeed: 5.4,
  sprintSpeed: 7.6,
  crouchSpeed: 2.7,
  /** Sideways/backwards move at this fraction of forward speed. */
  strafeFactor: 0.9,
  /** Per-second gain × wish speed (Quake style). Must exceed `friction` or top speed is never reached. */
  groundAccel: 13,
  airAccel: 14,
  airMaxSpeed: 1.6,
  friction: 12,
  stopSpeed: 0.8,
  jumpVelocity: 6.4,
  gravity: -22,
  terminalVelocity: -40,
  stepHeight: 0.4,
  /** Time after landing before another jump (prevents pogo spam). */
  jumpCooldownMs: 120,
} as const;

export const HEADSHOT_MULTIPLIER = 1.6;
export const RESPAWN_DELAY_MS = 3200;
export const SPAWN_PROTECTION_MS = 1500;

export const MATCH = {
  /** Minimum players to leave WAITING. */
  minPlayers: 2,
  countdownMs: 4000,
  durationMs: 7 * 60 * 1000,
  scoreLimit: 40,
  /** Result screen duration before the room returns to WAITING/rematch. */
  endedMs: 15000,
  /**
   * Respawn waves (1.1 drop 7). A match alternates a LIVE window of `waveMs` with a frozen PREP
   * window of `prepMs`: everyone who died during the wave comes back at the start of prep, nobody
   * can act until it ends, and both sides are released together.
   *
   * These two numbers are the whole feel of the mode and are meant to be tuned by playing:
   *  - the longest you can be dead is `waveMs + prepMs` (17 s), the typical wait about 11 s,
   *    against the flat 3.2 s of the old individual respawn;
   *  - the freeze is `prepMs / (waveMs + prepMs)` of the match — 29% at these values, which is the
   *    price of everyone starting a fight from the line rather than trickling into one.
   * Warm-up (WAITING) keeps the old individual respawn: waves are a rule of the MATCH.
   */
  waveMs: 12000,
  prepMs: 5000,
} as const;

export const TEAM_NAMES = ["FADE", "TAPER"] as const;
export const TEAM_COLORS = ["#d9a441", "#7a5cc9"] as const;
