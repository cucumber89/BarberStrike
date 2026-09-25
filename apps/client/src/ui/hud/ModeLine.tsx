import React, { memo } from "react";
import { scoreLimitFor, type BombData, type Team } from "@frankibarber/shared";
import { useHudSlice, type HudState, type ScoreRow } from "../../game/store";
import { modeGoal } from "./copy";
import { sideNamesOf } from "./TopStrip";
import type { PhaseModel } from "./phase";
import type { ZoneProps } from "./types";

/**
 * Drop U, P2: the mode line under the strip (zone `top-line`, docs/UI_U_SPEC.md §4.2, §5.3) — at
 * most six words at t2 that say what to do NOW. Everything else the old lines printed has its own
 * place: the round and the side are on the strip, the buy window in the wallet, the round's end on
 * the banner, my own plant or defuse in the action slot.
 *
 * The testid follows the mode: `objective` in the warm-up and the countdown, `bomb-hud` in bomb,
 * `duel-line` in duel and turniej (match point only), `mode-line` in ostrzyżeni and a TDM wave's
 * freeze. Nothing is rendered in a break, between pairs or in Ended (§8.4); while I am dead or an
 * overlay is up, top.css hides it (§4.5).
 *
 * `ModeLine` and `Objective` stay two components because `Hud.tsx` (frozen) mounts both: the first
 * says the round's line, the second the goal before the match starts.
 */

/** What the line says, in which testid and tone; `bar` is a teammate's or enemy's plant/defuse (0..1). */
export interface ModeLineView {
  testid: "objective" | "bomb-hud" | "duel-line" | "mode-line";
  text: string;
  /** `warn`: match point (amber); `danger`: the bomb is planted (red); "" plain. */
  tone: "" | "warn" | "danger";
  bar: number | null;
  /** The bar's colour: whose hands the bomb is in. */
  barTeam: Team | -1;
  /** A teammate's nick that opens the line („Kasia_Brzytwa ROZBRAJA”): drawn in its own case and tracking. */
  nick: string;
}

type LineInput = Pick<HudState, "mode" | "bomb" | "myId" | "myTeam" | "players" | "bracket" | "connected">;

/** Pure: the mode line for this moment, or null when the moment has no line. */
export function modeLineOf(model: PhaseModel, h: LineInput): ModeLineView | null {
  const line = (testid: ModeLineView["testid"], text: string, tone: ModeLineView["tone"] = "", bar: number | null = null, barTeam: Team | -1 = -1, nick = ""): ModeLineView =>
    ({ testid, text, tone, bar, barTeam, nick });
  const { mode } = h;
  if (model.moment === "warmup" || model.moment === "countdown") {
    // Domination and the Boys: the flag row IS the objective (its three letters would take the
    // line over its six words), and the goal's number is on the strip („DO 100”).
    if (!h.connected || mode === "dom" || mode === "boys") return null;
    return line("objective", modeGoal(mode, scoreLimitFor(mode, h.players.length)));
  }
  if (model.moment !== "freeze" && model.moment !== "live") return null;
  if (mode === "bomb") return model.moment === "live" && h.bomb ? bombLine(h.bomb, h, line) : null;
  if (mode === "duel" || mode === "turniej") {
    if (model.matchPoint < 0) return null;
    if (model.matchPoint === 2) return line("duel-line", "MECZBOL DLA OBU", "warn");
    return line("duel-line", `MECZBOL · ${sideNamesOf(mode, h.bracket)[model.matchPoint as Team]}`, "warn");
  }
  if (mode === "ostrzyzeni") return line("mode-line", model.mySide === "ostrzyzony" ? "GOŃ I GOL" : "UCIEKAJ PRZED MASZYNKĄ");
  if (model.moment === "freeze") return line("mode-line", "ZAMROŻENIE");
  return null;
}

/** Every live bomb state today's HUD prints (§5.3), each in at most six words. */
function bombLine(b: BombData, h: LineInput, line: (t: ModeLineView["testid"], s: string, tone?: ModeLineView["tone"], bar?: number | null, barTeam?: Team | -1, nick?: string) => ModeLineView): ModeLineView {
  const attack = b.attackTeam === h.myTeam;
  const planted = b.stage === "planted";
  // Somebody else's plant or defuse: who, what, and how far (Principle 14 keeps the enemy's too).
  if (b.actor && b.actor !== h.myId) {
    const actor: ScoreRow | undefined = h.players.find((r) => r.id === b.actor);
    const actorTeam = (planted ? 1 - b.attackTeam : b.attackTeam) as Team;
    const nick = actorTeam === h.myTeam ? (actor?.name ?? "") : "";
    const who = actorTeam === h.myTeam ? nick : "WRÓG";
    return line("bomb-hud", `${who} ${planted ? "ROZBRAJA" : "PODKŁADA"}`.trim(), planted ? "danger" : "", Math.max(0, Math.min(1, b.progress)), actorTeam, nick);
  }
  if (planted) return line("bomb-hud", `ŁADUNEK NA ${b.site} — ${attack ? "PILNUJ" : "ROZBRÓJ [T]"}`, "danger");
  if (b.carrier === h.myId) return line("bomb-hud", "MASZ ŁADUNEK");
  if (!attack) return line("bomb-hud", "BROŃ PUNKTÓW A / B");
  if (b.stage === "dropped") return line("bomb-hud", "ŁADUNEK UPUSZCZONY — PODNIEŚ GO");
  return line("bomb-hud", "OSŁANIAJ NIOSĄCEGO ŁADUNEK");
}

/** The line itself: one row at t2, a 3 px bar under it while somebody else plants or defuses. */
function Line({ view }: { view: ModeLineView }) {
  return (
    <div className={`mode-line${view.testid === "bomb-hud" ? " bomb-hud" : ""}${view.tone === "danger" ? " armed" : ""}${view.tone === "warn" ? " warn" : ""}`}
      data-zone="top-line" data-testid={view.testid}>
      <span className="ml-text">{view.nick && view.text.startsWith(view.nick)
        ? <><span className="ml-nick">{view.nick}</span>{view.text.slice(view.nick.length)}</>
        : view.text}</span>
      {view.bar !== null && <i className={`ml-bar t${view.barTeam}`} style={{ "--v": view.bar } as React.CSSProperties} />}
    </div>
  );
}

const lineInput = (s: HudState): LineInput => s;

export const ModeLine = memo(function ModeLine({ model }: ZoneProps) {
  const view = useLineView(model);
  if (!view || view.testid === "objective") return null;
  return <Line view={view} />;
});

/** The goal before the match starts (the warm-up and the countdown), in the same place and look. */
export const Objective = memo(function Objective({ model }: ZoneProps) {
  const view = useLineView(model);
  if (!view || view.testid !== "objective") return null;
  return <Line view={view} />;
});

/**
 * The view, selected as one primitive key (so the line re-renders only when its words, tone or bar
 * change — a new object per store commit would loop, §7.0) and rebuilt from it.
 */
function useLineView(model: PhaseModel): ModeLineView | null {
  const key = useHudSlice((s) => {
    const v = modeLineOf(model, lineInput(s));
    return v ? `${v.testid}\u0001${v.text}\u0001${v.tone}\u0001${v.bar ?? ""}\u0001${v.barTeam}\u0001${v.nick}` : "";
  });
  if (!key) return null;
  const [testid, text, tone, bar, barTeam, nick] = key.split("\u0001");
  return { testid: testid as ModeLineView["testid"], text, tone: tone as ModeLineView["tone"], bar: bar === "" ? null : Number(bar), barTeam: Number(barTeam) as Team | -1, nick };
}
