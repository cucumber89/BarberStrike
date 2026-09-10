/**
 * Bots (drop 5): difficulty presets and names. The brain lives on the server; these numbers are
 * shared so the lobby can describe them and tests can pin them.
 */

export type BotLevel = "easy" | "normal" | "hard";
export const BOT_LEVELS: readonly BotLevel[] = ["easy", "normal", "hard"] as const;
export const isBotLevel = (v: unknown): v is BotLevel => v === "easy" || v === "normal" || v === "hard";

export interface BotPreset {
  id: BotLevel;
  name: string;
  /** Delay between first sight of an enemy and the first shot (ms). */
  reactionMs: number;
  /** Aim error added per shot (radians, uniform disc). */
  aimError: number;
  /** How fast the view turns towards the target (rad/s). */
  turnRate: number;
  /** Beyond this the bot does not open fire (m). */
  engageRange: number;
  /** Multiplier on the weapon's fire interval (a pause between bursts). */
  cadence: number;
  /** How far the bot can notice an enemy (m). */
  sightRange: number;
}

export const BOT_PRESETS: Record<BotLevel, BotPreset> = {
  easy: { id: "easy", name: "EASY", reactionMs: 750, aimError: 0.06, turnRate: 3.2, engageRange: 28, cadence: 1.7, sightRange: 38 },
  normal: { id: "normal", name: "NORMAL", reactionMs: 650, aimError: 0.045, turnRate: 4.8, engageRange: 32, cadence: 1.4, sightRange: 40 },
  hard: { id: "hard", name: "HARD", reactionMs: 400, aimError: 0.025, turnRate: 6.5, engageRange: 42, cadence: 1.15, sightRange: 48 },
};

/** Room option bounds: bots per room (humans + bots never exceed MAX_PLAYERS; the room clamps). */
export const MAX_BOTS = 8;

/** Barber-shop regulars. Picked in order, so two rooms with two bots each get the same faces. */
export const BOT_NAMES: readonly string[] = [
  "RYSIEK", "ZDZICHU", "MIREK", "HENIEK", "BOGDAN", "WALDEK", "JANUSZ", "SEBA", "GRAZYNA", "HALINA", "DZESIKA", "BRAJAN",
];

/** Bot session ids are never valid Colyseus session ids, so nothing can collide with a human. */
export const botId = (n: number): string => `bot-${n}`;
export const isBotId = (id: string): boolean => id.startsWith("bot-");
