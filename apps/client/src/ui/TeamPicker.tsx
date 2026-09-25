import { useMemo } from "react";
import { MODES, TEAM_NAMES, canSwitchTeam, teamSizes, MatchPhase, type GameMode, type Team, type TeamMember } from "@frankibarber/shared";
import type { HudState } from "../game/store";
import { uiSound } from "../game/audio";
import { plPlural } from "./hud/format";

/**
 * Choosing a side, inline under ZMIEŃ DRUŻYNĘ in the ESC column (docs/UI_U_SPEC.md §5.6).
 *
 * Both sides, their colours, their sizes and which one you are on are on screen at once, and a side
 * you cannot join says why. The greyed state is computed with the SAME shared `canSwitchTeam` the
 * server runs, so the picker never offers a switch that then bounces, and never refuses one the
 * server would have allowed. The server still decides: nothing here writes a team; it sends a
 * request and shows the answer.
 *
 * In Polish now, every string from §5.6, with the counts through `plPlural` („1 GRACZ”, „2 BOTY”,
 * „5 GRACZY”). The card's words are OUTSIDE its button (`.team-hit` covers the card, as a shop tile
 * does): the global `button { text-transform: uppercase }` of the menu would otherwise shout the
 * lower-case reason „ta strona byłaby większa”.
 */

/** The 1 v 1 and the tournament have no side to choose; neither do the modes without teams. */
export const teamPickerShown = (mode: GameMode): boolean => MODES[mode].teams && mode !== "duel" && mode !== "turniej";

/** The side names the picker prints: the mode's own in Ostrzyżeni, FADE / TAPER elsewhere. */
export const sideNames = (mode: GameMode): readonly [string, string] =>
  mode === "ostrzyzeni" ? ["OCALENI", "OSTRZYŻENI"] : TEAM_NAMES;

/** Why a side is refused, as the server's reason codes read in Polish (§5.6). */
export const WHY: Record<string, string> = {
  balance: "ta strona byłaby większa",
  cooldown: "przed chwilą zmieniałeś — odczekaj",
  mode: "ten tryb nie ma stron",
  ended: "mecz się skończył",
  same: "już tu jesteś",
};
const why = (reason: string | undefined): string => WHY[reason ?? ""] ?? reason ?? "";

/** „5 GRACZY · 2 BOTY” — the side's size, and how many of it are bots. */
export const sideCount = (total: number, bots: number): string =>
  `${total} ${plPlural(total, "GRACZ", "GRACZE", "GRACZY")}${bots > 0 ? ` · ${bots} ${plPlural(bots, "BOT", "BOTY", "BOTÓW")}` : ""}`;

/** The answer line under the cards, for 6 s after the server's answer. */
export const answerText = (a: { ok: boolean; deferred?: boolean; team: Team; reason?: string }, names: readonly [string, string]): string =>
  a.ok
    ? (a.deferred ? `Następną rundę zaczniesz w ${names[a.team]}.` : `Grasz teraz w ${names[a.team]}. Pieniądze i sprzęt przeszły z tobą.`)
    : `Nie można zmienić — ${why(a.reason)}.`;

export function TeamPicker({ h, onChoose }: { h: HudState; onChoose: (t: Team) => void }) {
  const members: TeamMember[] = useMemo(
    () => h.players.map((p) => ({ team: p.team, connected: p.connected, bot: p.bot })),
    [h.players],
  );
  const sizes = useMemo(() => teamSizes(members), [members]);
  if (!teamPickerShown(h.mode)) return null;

  const names = sideNames(h.mode);
  const roundBased = h.mode === "bomb";
  const ctx = {
    teamsMode: true, roundBased,
    frozen: h.phase === MatchPhase.Waiting || h.phase === MatchPhase.Countdown || h.phase === MatchPhase.Prep,
    matchEnded: h.phase === MatchPhase.Ended,
    now: h.serverNow,
    // The client is not told the server's cooldown anchor, so it never predicts a cooldown refusal;
    // that one reason arrives from the server and is shown below like any other.
    lastSwitchAt: -Infinity,
  };
  const answer = h.teamResult && performance.now() - h.teamResult.at < 6000 ? h.teamResult : null;

  return (
    <div className="teams" data-testid="team-picker" id="team-picker">
      <div className="teams-head">
        <span>TWOJA STRONA</span>
        {roundBased && <span className="teams-note">ZMIANA OD NASTĘPNEJ RUNDY</span>}
      </div>
      <div className="teams-row">
        {([0, 1] as Team[]).map((t) => {
          const mine = h.myTeam === t;
          const v = canSwitchTeam(h.myTeam, t, sizes, ctx);
          const bots = sizes.total[t] - sizes.humans[t];
          const state = mine ? "JESTEŚ TU" : v.ok ? (v.deferred ? "OD NASTĘPNEJ RUNDY" : "DOŁĄCZ") : `NIE — ${why(v.reason)}`;
          return (
            <div key={t} className={`team-card${mine ? " mine" : ""}${!mine && !v.ok ? " refused" : ""}`} data-team={t}>
              <button className="team-hit" disabled={mine || !v.ok} data-testid={`team-${t}`}
                aria-label={`${names[t]}: ${state}`}
                onClick={() => { uiSound("click"); onChoose(t); }} />
              <span className="team-name">{names[t]}</span>
              <span className="team-count">{sideCount(sizes.total[t], bots)}</span>
              <span className="team-state">{state}</span>
            </div>
          );
        })}
      </div>
      {answer && (
        <p className={`teams-answer ${answer.ok ? "ok" : "err"}`} data-testid="team-answer" role="status">
          {answerText(answer, names)}
        </p>
      )}
    </div>
  );
}
