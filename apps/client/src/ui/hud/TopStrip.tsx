import React, { memo } from "react";
import {
  BOMB, DUEL, GUN_GAME, MATCH, MODES, OSTRZYZENI, TEAM_NAMES, WEAPONS, ladderWeapon, scoreLimitFor,
  type GameMode, type Team,
} from "@frankibarber/shared";
import { useHudSlice, type HudState, type ScoreRow } from "../../game/store";
import { bracketStage, pairNames } from "../Bracket";
import { OSTRZYZENI_SIDES } from "./roundText";
import { SIDE_WORD } from "./copy";
import { fmtClock } from "./format";
import { IconBomb, IconClippers, IconShield, IconSword } from "./icons";
import { clockMs, stripSides, urgent, type PhaseModel } from "./phase";
import type { ZoneProps } from "./types";

/**
 * Drop U, P2: the CS2 top strip (zone `top`, docs/UI_U_SPEC.md §4, Principles 1, 8 and 9). The one
 * place for time, score, round and who is alive:
 *
 *   ▮▮▮▮▮ ⚔ [FADE] 4 │  0:12  │ 2 TAPER 🛡 ▮▮▮▮▮      row 1: sides at t1/t3, the clock at t3
 *   ATAK            │RUNDA 5 / 12│                   row 2: my role badge, the round / goal line
 *
 * My side is drawn on the LEFT by CSS `order` only (`stripSides`), so `score-a` / `score-b` stay
 * bound to team 0 / team 1 whatever the screen shows. The clock is the phase model's (`clockKind`):
 * the word in the warm-up, dim in the countdown and a break, amber in a freeze, white live, red
 * under 10 s of a round, and a bomb icon with red fuse digits once planted.
 *
 * Everything that decides what the strip says is a pure function below, so `TopStrip.test.ts` pins
 * it without a DOM; the component only reads the store and lays it out.
 */

/** The strip's old clock format, `mm:ss`. Kept exported for any reader outside the strip. */
export const fmtTime = (ms: number): string => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};

/** Drop T: in a tournament the two sides are two people, so the bar carries their nicknames. */
export const sideNamesOf = (mode: GameMode, bracket: string): readonly [string, string] =>
  mode === "ostrzyzeni" ? OSTRZYZENI_SIDES : (bracket ? pairNames(bracket) : null) ?? TEAM_NAMES;

/** A nick as the strip prints it: its own case, cut at 12 characters (§5.2 row 28). */
export const cutNick = (name: string, max = 12): string => (name.length > max ? `${name.slice(0, max - 1)}…` : name);

// ------------------------------------------------------------------------------------ the sides

/** One DOM slot of a team-mode strip: which team it holds, its testid, its CSS `order`, whether it is mine. */
export interface TeamSlot { team: Team; testid: "score-a" | "score-b"; order: number; left: boolean; mine: boolean }

/**
 * The two team slots in DOM order — team 0 (`score-a`) first, team 1 (`score-b`) second, always —
 * with the CSS `order` that puts my team on the left (Principle 9). `mineTeam` is the side I play
 * for (-1 for a tournament bystander, who has no side on the board).
 */
export function teamSlots(model: PhaseModel, myTeam: Team, mineTeam: Team | -1 = myTeam): readonly [TeamSlot, TeamSlot] {
  const sides = stripSides(model, { myTeam });
  const slot = (team: Team): TeamSlot => ({
    team, testid: team === 0 ? "score-a" : "score-b", order: sides.order[team], left: sides.order[team] === 0, mine: mineTeam === team,
  });
  return [slot(0), slot(1)];
}

/** FFA and gun game: me on the left, the best OTHER player on the right (the runner-up when I lead). */
export interface FfaSides { me: ScoreRow | null; best: ScoreRow | null }
export function ffaSides(players: readonly ScoreRow[], myId: string, mode: GameMode): FfaSides {
  const by = (r: ScoreRow) => (mode === "gungame" ? r.score : r.kills);
  let best: ScoreRow | null = null;
  for (const r of players) if (r.id !== myId && (!best || by(r) > by(best))) best = r;
  return { me: players.find((r) => r.id === myId) ?? null, best };
}

/** Gun game's rung as `ladder` prints it, exactly `${rung + 1}/${n}` (`multiplayer.spec.ts:818,832`). */
export const rungLabel = (rung: number): string => `${Math.min(GUN_GAME.ladder.length, rung + 1)}/${GUN_GAME.ladder.length}`;

// ------------------------------------------------------------------------------------ the pips

export type Pip = "alive" | "dead";
/** A side's pips: one per connected player (filled alive, outlined dead); above 5, one pip and the count. */
export interface Pips { pips: readonly Pip[]; alive: number; many: boolean }

/** How many pips a side shows before it collapses into one pip and a count. */
export const PIP_MAX = 5;

/**
 * The pips of `team` (round modes only): the players of that side, one pip each, filled while
 * alive and outlined once dead; a disconnected player has none. In a tournament only the pair on
 * the board has a side — the entrants waiting their turn (bystanders) have no pip.
 */
export function pipsOf(players: readonly ScoreRow[], team: Team, mode: GameMode, bracket: string): Pips {
  const pair = mode === "turniej" ? pairNames(bracket) : null;
  const rows = players.filter((r) => r.connected && (mode === "turniej" ? !!pair && r.name === pair[team] : r.team === team));
  const alive = rows.filter((r) => r.alive).length;
  if (rows.length > PIP_MAX) return { pips: [alive > 0 ? "alive" : "dead"], alive, many: true };
  // The living first, from the clock outward — the way CS2 greys out its portraits.
  return { pips: rows.map((r) => (r.alive ? "alive" : "dead") as Pip).sort((a, b) => (a === b ? 0 : a === "alive" ? -1 : 1)), alive, many: false };
}

/**
 * A side's pips. The alive count is in `aria-label` and `data-count` and NEVER in text (§5.1: the
 * strip's word budget; §3.10: the tool counts every text node, `sr-only` included). Collapsed
 * above five, the one pip shows the count through CSS (`::after { content: attr(data-count) }`).
 */
export function PipRow({ pips, testid }: { pips: Pips; testid: "alive-a" | "alive-b" }): React.ReactElement {
  return (
    <span className={`ts-pips${pips.many ? " many" : ""}`} data-testid={testid} data-count={pips.alive} role="img" aria-label={`ŻYWI: ${pips.alive}`}>
      {pips.pips.map((p, i) => <i key={i} className={`ts-pip ${p}`} />)}
    </span>
  );
}

// ------------------------------------------------------------------------------------ the clock

/** What the clock face shows at `serverNow`: the word, or the digits, and how they look. */
export interface ClockFace {
  text: string;
  kind: PhaseModel["clockKind"];
  urgent: boolean;
  /** The last 3 s of a freeze: the second on the clock, so each one can pulse (0 = no pulse). */
  tick: number;
  /** Planted, with fewer than `BOMB.defuseMs` left: the fuse pulses twice as fast. */
  fast: boolean;
}

export function clockFace(model: PhaseModel, serverNow: number): ClockFace {
  const ms = clockMs(model, serverNow);
  const kind = model.clockKind;
  const text = kind === "warmup" ? "ROZGRZEWKA" : kind === "none" ? "KONIEC" : fmtClock(ms);
  return {
    text, kind, urgent: urgent(model, serverNow),
    tick: kind === "freeze" && ms > 0 && ms <= 3000 ? Math.ceil(ms / 1000) : 0,
    fast: kind === "bomb" && ms > 0 && ms < BOMB.defuseMs,
  };
}
/** The face as one primitive, so the strip re-renders when what it prints changes and not on every tick. */
const faceKey = (f: ClockFace): string => `${f.kind}|${f.text}|${f.urgent ? 1 : 0}|${f.tick}|${f.fast ? 1 : 0}`;
const parseFace = (key: string): ClockFace => {
  const [kind, text, u, tick, fast] = key.split("|");
  return { kind: kind as ClockFace["kind"], text, urgent: u === "1", tick: Number(tick), fast: fast === "1" };
};

// ------------------------------------------------------------------------------------ row 2

/** The strip's second row: which testid carries it and what it says (one line, t1). */
export interface Row2 { parts: readonly { testid: string; text: string }[]; wide: boolean }

/** The round line, the goal, the ladder, the bracket stage or the warm-up's head count, per mode. */
export function row2Of(model: PhaseModel, h: Pick<HudState, "mode" | "players" | "bracket" | "myId">): Row2 {
  const { mode } = h;
  const one = (testid: string, text: string, wide = false): Row2 => ({ parts: [{ testid, text }], wide });
  if (model.moment === "betweenPairs") return one("bracket-strip", "DRABINKA");
  if (model.moment === "warmup") return one("warmup-players", `GRACZE ${h.players.filter((r) => r.connected).length}/${MATCH.minPlayers}`);
  if (mode === "ostrzyzeni") {
    const round = Math.min(OSTRZYZENI.rounds, Math.max(1, model.round));
    const unshaved = h.players.filter((r) => r.connected && r.alive && !r.shaved).length;
    return one("infection-line", `RUNDA ${round} / ${OSTRZYZENI.rounds} · ${unshaved} NIEOSTRZYŻONYCH`, true);
  }
  if (mode === "turniej") {
    const stage = bracketStage(h.bracket);
    return one("bracket-strip", model.moment === "countdown" || !stage ? stage || `DO ${DUEL.wins}` : `${stage} · RUNDA ${Math.max(1, model.round)}`);
  }
  if (mode === "bomb") {
    return model.moment === "countdown" || model.round < 1 ? one("score-goal", `DO ${BOMB.wins}`) : one("round-label", `RUNDA ${model.round} / ${BOMB.maxRounds}`);
  }
  if (mode === "duel") {
    const goal = { testid: "score-goal", text: `DO ${DUEL.wins}` };
    return model.moment === "countdown" ? { parts: [goal], wide: false } : { parts: [{ testid: "round-label", text: `RUNDA ${Math.max(1, model.round)}` }, goal], wide: false };
  }
  if (mode === "gungame") {
    const me = h.players.find((r) => r.id === h.myId);
    const rung = me?.score ?? 0;
    const gun = WEAPONS[ladderWeapon(rung)].name;
    const next = rung + 1 < GUN_GAME.ladder.length ? WEAPONS[ladderWeapon(rung + 1)].name.split(" ")[0] : "";
    return one("ladder-gun", next ? `${gun} → ${next}` : gun);
  }
  return one("score-goal", `DO ${scoreLimitFor(mode, h.players.length)}`);
}

// ------------------------------------------------------------------------------------ role

/** The first seconds of a live round keep the role badge up (graft from design B). */
const BADGE_LIVE_MS = 5000;

/**
 * Show my role badge? During the freeze and the first 5 s live of a bomb or ostrzyżeni round (the
 * modes with a side to name). The live start is the round deadline less the round's length.
 */
export function badgeUp(model: PhaseModel, h: Pick<HudState, "bomb" | "serverNow">): boolean {
  if (!model.mySide) return false;
  if (model.moment === "freeze") return true;
  if (model.moment !== "live") return false;
  const start = model.mode === "bomb" ? (h.bomb?.roundEndsAt ?? 0) - BOMB.roundMs : model.phaseEndsAt - OSTRZYZENI.roundMs;
  return h.serverNow - start < BADGE_LIVE_MS;
}

/** The icon of a side: the sword for the side that attacks, the shield for the one that holds. */
function RoleIcon({ mode, team, attackTeam }: { mode: GameMode; team: Team; attackTeam: number }) {
  if (mode === "bomb" && attackTeam >= 0) return team === attackTeam ? <IconSword className="ts-role" size={18} /> : <IconShield className="ts-role" size={18} />;
  if (mode === "ostrzyzeni") return team === OSTRZYZENI.shavedTeam ? <IconClippers className="ts-role" size={18} /> : <IconShield className="ts-role" size={18} />;
  return null;
}

// ------------------------------------------------------------------------------------ the strip

export const TopStrip = memo(function TopStrip({ model }: ZoneProps) {
  const mode = useHudSlice((s) => s.mode);
  const myTeam = useHudSlice((s) => s.myTeam);
  const myId = useHudSlice((s) => s.myId);
  const players = useHudSlice((s) => s.players);
  const scoreA = useHudSlice((s) => s.scoreA);
  const scoreB = useHudSlice((s) => s.scoreB);
  const bracket = useHudSlice((s) => s.bracket);
  const attackTeam = useHudSlice((s) => s.bomb?.attackTeam ?? -1);
  const site = useHudSlice((s) => s.bomb?.site ?? "");
  const face = parseFace(useHudSlice((s) => faceKey(clockFace(model, s.serverNow))));
  const badge = useHudSlice((s) => badgeUp(model, s));
  const row2 = row2Of(model, { mode, players, bracket, myId });
  const teams = MODES[mode].teams;
  const between = model.moment === "betweenPairs";

  let sides: React.ReactNode = null;
  if (between) {
    sides = null; // the pair card says who is next; the strip keeps the clock and „DRABINKA” only
  } else if (teams) {
    const names = sideNamesOf(mode, bracket);
    const myName = players.find((r) => r.id === myId)?.name ?? "";
    const pair = mode === "turniej" ? pairNames(bracket) : null;
    const mineTeam: Team | -1 = mode === "turniej" ? (pair ? (pair[0] === myName ? 0 : pair[1] === myName ? 1 : -1) : -1) : myTeam;
    const pipsShown = model.roundMode;
    sides = teamSlots(model, myTeam, mineTeam).map((s) => (
      <div key={s.team} className={`ts-side ${s.left ? "l" : "r"} t${s.team}${s.mine ? " mine" : ""}`} style={{ order: s.order }}>
        {pipsShown && <PipRow pips={pipsOf(players, s.team, mode, bracket)} testid={s.team === 0 ? "alive-a" : "alive-b"} />}
        <RoleIcon mode={mode} team={s.team} attackTeam={attackTeam} />
        {mode === "turniej"
          ? <span className="ts-name nick">{cutNick(names[s.team])}</span>
          : <span className="ts-name">{names[s.team]}</span>}
        <span className="ts-score" data-testid={s.testid}>{s.team === 0 ? scoreA : scoreB}</span>
      </div>
    ));
  } else {
    const { me, best } = ffaSides(players, myId, mode);
    const gun = mode === "gungame";
    sides = [
      <div key="me" className="ts-side l me" style={{ order: 0 }}>
        <span className="ts-name">TY</span>
        {gun
          ? <span className="ts-score" data-testid="ladder">{rungLabel(me?.score ?? 0)}</span>
          : <span className="ts-score" data-testid="score-a">{me?.kills ?? 0}</span>}
      </div>,
      <div key="best" className={`ts-side r best${best && (gun ? best.score > (me?.score ?? 0) : best.kills > (me?.kills ?? 0)) ? " lead" : ""}`} style={{ order: 2 }}>
        <span className="ts-name nick">{best ? cutNick(best.name) : "—"}</span>
        <span className="ts-score" data-testid="score-b">{best ? (gun ? rungLabel(best.score) : best.kills) : 0}</span>
      </div>,
    ];
  }

  return (
    <div className={`top-bar${between ? " between" : ""}`} data-zone="top" data-mode={mode} data-moment={model.moment} data-round={model.roundMode ? "" : undefined}>
      {sides}
      <div className="ts-clock" data-testid="timer" data-kind={face.kind} data-urgent={face.urgent ? "" : undefined} data-fast={face.fast ? "" : undefined}
        aria-label={face.kind === "bomb" ? `ŁADUNEK ${site}`.trim() : undefined} style={{ order: 1 }}>
        {face.kind === "bomb" && <IconBomb className="ts-bomb" size={26} />}
        <span key={face.tick || face.kind} className={`ts-digits${face.tick ? " tick" : ""}`}>{face.text}</span>
      </div>
      {badge && model.mySide && <span className={`ts-badge t${myTeam}`} data-testid="role-badge">{SIDE_WORD[model.mySide]}</span>}
      <div className={`ts-row2${row2.wide ? " wide" : ""}`}>
        {row2.parts.map((p, i) => <React.Fragment key={p.testid}>{i > 0 && " · "}<span data-testid={p.testid}>{p.text}</span></React.Fragment>)}
      </div>
    </div>
  );
});
