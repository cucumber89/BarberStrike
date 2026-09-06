import { ECONOMY, MATCH, MAX_PLAYERS, MODES, MODE_ORDER } from "@frankibarber/shared";
import { BINDABLE_ACTIONS, keyLabel, resolveBindings, type Settings } from "../settings";

/**
 * How to play (2.1): the rules in the order a new player meets them, and the controls as they are
 * currently bound. The old CONTROLS page listed keys and nothing else — a player who read it
 * still did not know why they spawned with a pistol or why everyone came back at once.
 */
export function HowToPlay({ settings, onControls }: { settings: Settings; onControls: () => void }) {
  const b = resolveBindings(settings.keys);
  const key = (a: keyof typeof b) => b[a].map(keyLabel).join(" / ");
  return (
    <div className="howto" data-testid="howto">
      <section>
        <h3>THE NIGHT</h3>
        <p>Night District after closing time. {MATCH.minPlayers}–{MAX_PLAYERS} players, one map, three modes. A match is {MATCH.durationMs / 60000} minutes or the score limit, whichever comes first, then a {MATCH.endedMs / 1000} s result screen and a rematch in the same room.</p>
        <div className="howto-modes">
          {MODE_ORDER.map((m) => <div key={m} className="howto-mode"><b>{MODES[m].short}</b><span>{MODES[m].name}</span><small>{MODES[m].blurb}</small></div>)}
        </div>
      </section>
      <section>
        <h3>WAVES</h3>
        <p>Nobody respawns alone. The match runs in <b>{MATCH.waveMs / 1000} s waves</b>: whoever dies waits for the wave to end, then <b>everyone</b> comes back together during a {MATCH.prepMs / 1000} s preparation freeze — reload, buy, pick a lane. Surviving a whole wave pays XP.</p>
      </section>
      <section>
        <h3>MONEY</h3>
        <p>You spawn with the free P9 and <b>${ECONOMY.startMoney.toLocaleString("en-US")}</b>. Press <b>{key("shop")}</b> in the first {ECONOMY.buyWindowMs / 1000} s after a spawn, or stand at a <b>$ BUY</b> counter, to open Franki's back room: primaries, sidearms, grenades, perks and plates. A kill pays ${ECONOMY.killReward}, a head shot ${ECONOMY.headshotBonus} on top, an assist ${ECONOMY.assistReward}. Selling refunds {Math.round(ECONOMY.sellRatio * 100)}%. Money is capped at ${ECONOMY.maxMoney.toLocaleString("en-US")}, so spend it.</p>
      </section>
      <section>
        <h3>MOVEMENT</h3>
        <p><b>{key("sprint")}</b> sprints; tap it twice for a <b>tactical sprint</b> — faster, gun up, on a 4 s budget. <b>{key("leanLeft")} / {key("leanRight")}</b> lean around corners without stepping out. <b>{key("crouch")}</b> tightens your spread. Aiming down sights (RMB) halves it; sprinting, jumping and getting hit widen it.</p>
      </section>
      <section>
        <h3>PROGRESS</h3>
        <p>Every match pays XP for kills, head shots, assists, captures, waves survived and the win. Levels bring barber-shop titles, badges name things you actually did, each weapon has its own <b>mastery</b> from BRĄZ to DIAMENT, and three <b>daily challenges</b> pay extra. None of it changes a fight: everything in the shop is open from level 1.</p>
      </section>
      <section>
        <h3>CONTROLS <button type="button" className="link inline" onClick={onControls}>CHANGE KEYS →</button></h3>
        <table className="keys-table">
          <tbody>
            {BINDABLE_ACTIONS.map((a) => <tr key={a.id}><td className="key">{key(a.id)}</td><td>{a.label}</td></tr>)}
            {([["LMB / RMB", "Fire / aim down sights"], ["1 · 2 · 3 · wheel", "Primary · sidearm · clippers"], ["Tab", "Scoreboard"], ["Enter / Y", "Chat to all / to the team"], ["MMB", "Mark a spot · aimed at an enemy: spotted"], ["Esc", "Release the mouse / pause"]] as const).map(([k, v]) => (
              <tr key={k}><td className="key">{k}</td><td>{v}</td></tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
