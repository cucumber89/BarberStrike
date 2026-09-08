import { useMemo } from "react";
import { MODES, TEAM_COLORS, TEAM_NAMES, canSwitchTeam, teamSizes, MatchPhase, type Team, type TeamMember } from "@frankibarber/shared";
import type { HudState } from "../game/store";
import { uiSound } from "../game/audio";

/**
 * Choosing a side, in the pause card where a player goes looking for it.
 *
 * Everything the brief asks to see is on screen at once: both team names, their colours, how many
 * bodies are on each, which one you are on, and — when a side is not available — why. The greyed
 * state is computed with the SAME shared `canSwitchTeam` the server runs, so the picker never
 * offers a switch that then bounces, and never refuses one the server would have allowed.
 *
 * The server still decides. Nothing here writes a team; it sends a request and shows the answer.
 */
export function TeamPicker({ h, onChoose }: { h: HudState; onChoose: (t: Team) => void }) {
  const mode = MODES[h.mode];
  const members: TeamMember[] = useMemo(
    () => h.players.map((p) => ({ team: p.team, connected: p.connected, bot: p.bot })),
    [h.players],
  );
  const sizes = useMemo(() => teamSizes(members), [members]);
  if (!mode.teams) return null;

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

  const WHY: Record<string, string> = {
    balance: "that side would be bigger",
    cooldown: "you just switched — wait a moment",
    mode: "this mode has no sides",
    ended: "the match is over",
    same: "you are already there",
  };

  return (
    <div className="teams" data-testid="team-picker">
      <div className="teams-head">
        <span>YOUR SIDE</span>
        {roundBased && <span className="teams-note">changes take effect next round</span>}
      </div>
      <div className="teams-row">
        {([0, 1] as Team[]).map((t) => {
          const mine = h.myTeam === t;
          const v = canSwitchTeam(h.myTeam, t, sizes, ctx);
          const bots = sizes.total[t] - sizes.humans[t];
          return (
            <button
              key={t}
              className={`team-card ${mine ? "mine" : ""}`}
              style={{ ["--team" as string]: TEAM_COLORS[t] }}
              disabled={mine || !v.ok}
              data-testid={`team-${t}`}
              onClick={() => { uiSound("click"); onChoose(t); }}
            >
              <span className="team-swatch" />
              <span className="team-name">{TEAM_NAMES[t]}</span>
              <span className="team-count">{sizes.total[t]} {sizes.total[t] === 1 ? "player" : "players"}{bots > 0 ? ` · ${bots} bot${bots === 1 ? "" : "s"}` : ""}</span>
              <span className="team-state">
                {mine ? "YOU ARE HERE" : v.ok ? (v.deferred ? "JOIN NEXT ROUND" : "JOIN") : `CAN'T — ${WHY[v.reason ?? ""] ?? v.reason}`}
              </span>
            </button>
          );
        })}
      </div>
      {answer && (
        <p className={`teams-answer ${answer.ok ? "ok" : "err"}`} data-testid="team-answer">
          {answer.ok
            ? (answer.deferred
              ? `You will start the next round with ${TEAM_NAMES[answer.team]}.`
              : `You are now with ${TEAM_NAMES[answer.team]}. Your money and gear came with you.`)
            : `Cannot switch — ${WHY[answer.reason ?? ""] ?? answer.reason}.`}
        </p>
      )}
    </div>
  );
}
