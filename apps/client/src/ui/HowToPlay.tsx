import { BOMB, ECONOMY, MATCH, MAX_PLAYERS, MODES, MODE_ORDER, RESPAWN_DELAY_MS } from "@frankibarber/shared";
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
        <p>Night District after closing time. {MATCH.minPlayers}–{MAX_PLAYERS} players, one map, four modes. A continuous match (TDM, FFA, Domination) is {MATCH.durationMs / 60000} minutes or the score limit, whichever comes first, then a {MATCH.endedMs / 1000} s result screen and a rematch in the same room. You respawn on your own {(RESPAWN_DELAY_MS / 1000).toFixed(1)} s after a death, sooner with a fresh fade.</p>
        <div className="howto-modes">
          {MODE_ORDER.map((m) => <div key={m} className="howto-mode"><b>{MODES[m].short}</b><span>{MODES[m].name}</span><small>{MODES[m].blurb}</small></div>)}
        </div>
      </section>
      <section>
        <h3>BOMB PLANT</h3>
        <p>Rounds, one life each, like the classics. One attacker gets the charge at random (a pack on their back); <b>{key("dropBomb")}</b> drops it for a teammate, and whoever dies drops it where they fall. Carry it into the painted zone of site <b>A</b> or <b>B</b>, stand still and hold <b>{key("objective")}</b> for {BOMB.plantMs / 1000} s — it plants where you stand, so pick a corner. Defenders hold the same key next to the charge for {BOMB.defuseMs / 1000} s, or {BOMB.defuseKitMs / 1000} s with a <b>defuse kit</b> (${BOMB.kitPrice}, in the shop, lost on death). A {BOMB.buyMs / 1000} s buy phase opens every round on a frozen spawn, the shop is closed afterwards, and money carries between rounds: a round win pays more than a loss, losing streaks pay a growing consolation, and death costs the gear you bought. First to {BOMB.wins} rounds, sides swap after {BOMB.halfRounds}. Dying means waiting for the next round.</p>
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
        <p>Every match pays XP for kills, head shots, assists, captures, Bomb rounds survived and the win. Levels bring barber-shop titles, badges name things you actually did, each weapon has its own <b>mastery</b> from BRĄZ to DIAMENT, and three <b>daily challenges</b> pay extra. None of it changes a fight: everything in the shop is open from level 1.</p>
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
