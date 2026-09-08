import React, { useEffect, useMemo, useState } from "react";
import { boysClass, GAME_VERSION, GRENADES, MATCH, MODES, MatchPhase, PERKS, PERK_ORDER, TEAM_NAMES, WEAPONS, BADGES, killerName, perkActive, type GameMode, type WeaponId } from "@frankibarber/shared";
import { useHud } from "../game/store";
import { pelletRing } from "../game/combat/weaponFeel";
import type { MatchReward } from "../game/progression/profile";
import type { Settings } from "../settings";
import { SettingsPanel } from "./SettingsPanel";
import { Shop, type ShopApi } from "./Shop";
import { Chat, type ChatApi } from "./Chat";
import { Minimap } from "./Minimap";
import type { RadarSnapshot } from "../game/Game";

interface Props {
  settings: Settings;
  onSettings: (s: Settings) => void;
  onLeave: () => void;
  onResume: () => void;
  /** Drop 2: shop actions routed to the game (buy/sell go to the server, close re-locks the pointer). */
  shop: ShopApi;
  /** Drop 5: chat send / close, and the minimap's per-frame feed. */
  chat: ChatApi;
  radar: () => RadarSnapshot | null;
}

const fmtTime = (ms: number): string => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};

/**
 * What the match paid: the XP lines, the level bar and any badge earned.
 *
 * The lines are the point. A bare "+1 400" tells a player nothing; "8 kills, 3 head shots, a win"
 * tells them what the game rewards, which is the only job a cosmetic progression has.
 */
function MatchSummary({ reward }: { reward: MatchReward }): React.ReactElement {
  const { after, before, levelsGained } = reward;
  const pct = Math.max(0, Math.min(100, Math.round((after.into / Math.max(1, after.need)) * 100)));
  const badges = reward.earned.map((id) => BADGES.find((b) => b.id === id)).filter(Boolean);
  return (
    <div className="summary" data-testid="summary">
      <div className="summary-lines">
        {reward.lines.map((l) => (
          <div className="summary-line" key={l.label}><span>{l.label}</span><b>+{l.xp}</b></div>
        ))}
        <div className="summary-line total"><span>RAZEM</span><b data-testid="summary-total">+{reward.total} XP</b></div>
      </div>
      <div className="summary-level">
        <div className="summary-rank">
          <span className="summary-lvl" data-testid="summary-level">{after.level}</span>
          <span className="summary-title">{reward.title}</span>
          {levelsGained > 0 && <span className="summary-up" data-testid="summary-levelup">AWANS {levelsGained > 1 ? `×${levelsGained}` : ""}</span>}
        </div>
        <div className="summary-bar"><div className="summary-bar-fill" style={{ width: `${pct}%` }} /></div>
        <div className="summary-xp">{after.into} / {after.need} XP{before.level !== after.level ? "" : ""}</div>
      </div>
      {badges.length > 0 && (
        <div className="summary-badges" data-testid="summary-badges">
          {badges.map((b) => b && <div className="summary-badge" key={b.id}><b>{b.name}</b><span>{b.blurb}</span></div>)}
        </div>
      )}
    </div>
  );
}

/** Re-renders on a timer so countdowns tick without the game loop pushing state. */
function useClock(intervalMs: number): number {
  const [t, setT] = useState(() => performance.now());
  useEffect(() => {
    const id = window.setInterval(() => setT(performance.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return t;
}

const money = (n: number) => `$${n.toLocaleString("en-US")}`;
const REASON_SHORT: Record<string, string> = { kill: "KILL", headshot: "HEAD SHOT", assist: "ASSIST", buy: "", sell: "SOLD", reset: "" };

export function Hud({ settings, onSettings, onLeave, onResume, shop, chat, radar }: Props) {
  const h = useHud();
  // The flash overlay and cook ring need a smooth clock; everything else is fine at 4 Hz.
  const fast = h.flashUntil > performance.now() || h.cookingKind !== "";
  const now = useClock(fast ? 33 : 250);
  const [scoreboard, setScoreboard] = useState(false);
  const [paused, setPaused] = useState(false);
  const [telemetry, setTelemetry] = useState(false);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (h.chatOpen) return; // the chat box owns the keyboard (drop 5)
      if (e.code === "Tab") { e.preventDefault(); setScoreboard(true); }
      if (e.code === "Escape" && document.pointerLockElement === null && !h.shopOpen) setPaused((p) => !p);
      if (e.code === "F3" && import.meta.env.DEV) { e.preventDefault(); setTelemetry((t) => !t); }
    };
    const up = (e: KeyboardEvent) => { if (e.code === "Tab") setScoreboard(false); };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); };
  }, [h.shopOpen, h.chatOpen]);

  // Escape releases pointer lock (browser) → show pause overlay; clicking resume re-locks.
  // The shop and the chat box release / hold the lock on purpose, so they never count as a pause.
  useEffect(() => {
    if (!h.pointerLocked && h.connected && h.phase !== MatchPhase.Ended && !h.shopOpen && !h.chatOpen) {
      const timer = window.setTimeout(() => setPaused(true), 300);
      return () => window.clearTimeout(timer);
    }
    if (h.pointerLocked || h.shopOpen || h.chatOpen) setPaused(false);
  }, [h.pointerLocked, h.connected, h.phase, h.shopOpen, h.chatOpen]);

  const w = WEAPONS[h.weapon as WeaponId];
  const timeLeft = h.phaseEndsAt ? h.phaseEndsAt - h.serverNow : 0;
  // The match deadline stays fixed through every individual death and respawn.
  const matchLeft = h.bomb && h.phase === MatchPhase.Playing
    ? (h.bomb.stage === "planted" ? h.bomb.endsAt : h.bomb.roundEndsAt) - h.serverNow
    : h.matchEndsAt ? h.matchEndsAt - h.serverNow : 0;
  const hitAge = performance.now() - h.hitAt;
  const dmgAge = performance.now() - h.damageAt;
  const lowHealth = h.alive && h.health <= 30;
  // Crosshair gap grows with the effective spread (radians → px at the current FOV). Clamped for readability.
  const gap = Math.round(Math.min(34, 5 + h.crosshairSpread * 900));
  // C1 (matrix): pellet weapons show the true cone as a ring, uncapped — the gap above stops at
  // 34 px, and the S12's cone is roughly 50.
  const spreadRing = pelletRing(h.weapon as WeaponId) ? Math.round(h.crosshairSpread * 900) : null;
  const protectedNow = h.alive && h.spawnProtectedUntil > h.serverNow;
  const reloadMs = w.reloadMs;
  const winnerTeam = h.winner === -1 ? "DRAW" : h.winner === h.myTeam ? "VICTORY" : "DEFEAT";
  // Flash: full white, then a fade whose length scales with the strength (the last third is a haze).
  const flashLeft = h.flashUntil - now;
  const flashTotal = Math.max(1, h.flashUntil - h.flashAt);
  const flashOpacity = flashLeft > 0 ? Math.min(1, (flashLeft / flashTotal) * 1.6) * (0.35 + 0.65 * h.flashStrength) : 0;
  const windowSecs = h.buyWindowLeft === Infinity ? null : Math.ceil(h.buyWindowLeft / 1000);
  const shopHint = h.shopResult && !h.shopOpen && h.shopResult.reason === "closed" && now - h.shopResult.at < 1800;
  const toasts = useMemo(() => h.moneyToasts.filter((t) => t.reason !== "reset" && t.reason !== "buy"), [h.moneyToasts]);
  const activePerks = PERK_ORDER.filter((id) => perkActive(h.perks, id, h.serverNow));
  const brokeAge = now - h.armorBrokeAt;
  // Drop 4: mode-aware scoring. FFA shows my kills against the leader; Domination adds the flag row.
  const teams = MODES[h.mode].teams;
  const meRow = h.players.find((r) => r.id === h.myId);
  const leader = h.players.find((r) => r.id !== h.myId) ?? null;
  const myKills = meRow?.kills ?? 0;
  const leading = !leader || myKills >= leader.kills;
  const here = h.inFlag >= 0 ? h.flags[h.inFlag] : null;
  const captureText = here
    ? here.contested ? `CONTESTED · ${here.id}`
      : here.capTeam === h.myTeam ? `CAPTURING ${here.id} · ${Math.round(here.cap * 100)}%`
      : here.capTeam !== -1 ? `${TEAM_NAMES[here.capTeam as 0 | 1]} TAKING ${here.id}`
      : here.owner === h.myTeam ? `HOLDING ${here.id}` : `ENEMY FLAG ${here.id}`
    : "";
  const noticeAge = h.flagNotice ? now - h.flagNotice.at : Infinity;
  const winnerFfa = h.winnerId === "" ? "DRAW" : h.winnerId === h.myId ? "VICTORY" : "DEFEAT";

  return (
    <div className={`hud ${lowHealth ? "low-health" : ""}`} data-testid="hud">
      {h.smokeOpacity > 0 && <div className="smoke-screen" data-testid="smoke-screen" style={{ opacity: h.smokeOpacity }} />}
      {h.bomb && (h.phase === MatchPhase.Playing || h.phase === MatchPhase.Prep) && <div className={`bomb-hud ${h.bomb.stage === "planted" ? "armed" : ""}`} data-testid="bomb-hud">
        <b>ROUND {h.bomb.round} / 12 · {h.bomb.attackTeam === h.myTeam ? "ATTACK" : "DEFEND"} · FIRST TO 7</b>
        <span>{h.bomb.stage === "buy" ? `${h.bomb.round === 7 ? "SIDES SWITCHED · " : ""}B TO BUY · START IN ${Math.max(0, Math.ceil(timeLeft / 1000))}s`
          : h.phase === MatchPhase.Prep ? `${h.bomb.result} · NEXT ROUND ${Math.max(0, Math.ceil(timeLeft / 1000))}s`
          : h.bomb.stage === "planted" ? `BOMB ARMED AT ${h.bomb.site} · ${h.bomb.attackTeam === h.myTeam ? "GUARD THE CHARGE" : "HOLD T TO DEFUSE"}`
          : h.bomb.carrier === h.myId ? "YOU HAVE THE BOMB · HOLD T AT A / B TO PLANT"
          : h.bomb.attackTeam !== h.myTeam ? "PROTECT SITES A / B"
          : h.bomb.stage === "dropped" ? "BOMB DROPPED · WALK OVER IT TO PICK UP" : "ESCORT THE BOMB CARRIER"}</span>
        {h.bomb.actor && <><div className="bomb-progress"><i style={{ width: `${h.bomb.progress * 100}%` }} /></div><small>{h.bomb.actor === h.myId ? "KEEP HOLDING T · STAND STILL" : h.bomb.stage === "planted" ? "DEFUSING" : "PLANTING"}</small></>}
      </div>}
      {/* Damage vignette / direction */}
      {dmgAge < 600 && <div className="damage-dir" style={{ transform: `rotate(${h.damageAngle}rad)`, opacity: 1 - dmgAge / 600 }} />}

      {/* Crosshair (hidden in ADS and while a grenade is in the hand: the cook ring takes its place) */}
      {h.alive && h.pointerLocked && !h.aiming && h.cookingKind === "" && (
        <div className={`crosshair ${hitAge < 180 ? (h.hitKill ? "kill" : h.hitHead ? "head" : h.hitArmor ? "armor" : "hit") : ""} ${protectedNow ? "shield" : ""}`} data-testid="crosshair" style={{ "--gap": `${gap}px` } as React.CSSProperties}>
          <span className="ch-top" /><span className="ch-bottom" /><span className="ch-left" /><span className="ch-right" />
          {/* C1: a pellet gun's cone is far wider than the 34 px the four lines can open to, so the
              S12 draws the real radius as a ring. Four lines that stopped growing told the player
              nothing about where nine pellets were actually going. */}
          {spreadRing !== null && <span className="ch-ring" style={{ "--r": `${spreadRing}px` } as React.CSSProperties} />}
          {hitAge < 180 && <span className="hitmarker" />}
          {protectedNow && <span className="ch-shield" />}
        </div>
      )}
      {h.alive && h.cookingKind !== "" && (
        <div className="cook" data-testid="cook" style={{ "--p": `${Math.round(h.cooking * 100)}%` } as React.CSSProperties} />
      )}
      {/* Tactical sprint budget (drop 4): only while it is running or refilling */}
      {h.alive && h.pointerLocked && (h.tacOn || h.tac < 0.98) && (
        <div className={`tac-meter ${h.tacOn ? "on" : ""} ${h.tac <= 0.01 ? "empty" : ""}`} data-testid="tac"><div className="tac-fill" style={{ width: `${Math.round(h.tac * 100)}%` }} /></div>
      )}
      {/* Scope (drop 3): black mask with a round window, a reticle, breath meter.
          Drop B / D-B2: the SR-50 keeps the full tube; the M-1 gets a light ring that leaves most
          of the view clear and has no breath to hold, so the two long rifles are not one weapon
          shown twice. */}
      {h.alive && h.scoped && (
        <div className={`scope ${h.scopeStyle === "ring" ? "ring" : ""}`} data-testid="scope" data-style={h.scopeStyle ?? ""}>
          <div className="scope-mask" />
          <div className={`scope-reticle ${hitAge < 180 ? "hit" : ""}`}><span className="v" /><span className="hz" /><span className="dot" /></div>
          {h.scopeStyle === "tube" && (
            <div className="scope-breath"><div className="scope-breath-fill" style={{ width: `${Math.round(h.breath * 100)}%` }} /><span>{h.breath <= 0 ? "WINDED" : "SHIFT · HOLD BREATH"}</span></div>
          )}
        </div>
      )}


      {/* Top: score + timer (team modes) or me vs the leader (FFA, drop 4) */}
      <div className="top-bar" data-mode={h.mode}>
        {teams
          ? <div className={`team-score t0 ${h.myTeam === 0 ? "mine" : ""}`}><span className="tname">{TEAM_NAMES[0]}</span><span className="tscore" data-testid="score-a">{h.scoreA}</span></div>
          : <div className="ffa-score mine"><span className="tname">YOU</span><span className="tscore" data-testid="score-a">{myKills}</span></div>}
        <div className={`timer ${matchLeft > 0 && matchLeft <= 30000 ? "urgent" : ""}`} data-testid="timer">
          {h.phase === MatchPhase.Playing || h.phase === MatchPhase.Prep ? fmtTime(matchLeft)
            : h.phase === MatchPhase.Countdown ? `START ${Math.max(0, Math.ceil(timeLeft / 1000))}`
            : h.phase === MatchPhase.Waiting ? "WARM-UP" : "MATCH OVER"}
        </div>
        {teams
          ? <div className={`team-score t1 ${h.myTeam === 1 ? "mine" : ""}`}><span className="tscore" data-testid="score-b">{h.scoreB}</span><span className="tname">{TEAM_NAMES[1]}</span></div>
          : <div className={`ffa-score ${leading ? "" : "lead"}`}><span className="tscore" data-testid="score-b">{leader?.kills ?? 0}</span><span className="tname">{leader?.name ?? "NOBODY"}</span></div>}
      </div>
      {/* Domination (drop 4): A / B / C with owner colour, capture bar, contested pulse */}
      {(h.mode === "dom" || h.mode === "boys") && h.flags.length > 0 && (
        <div className="flags" data-testid="flags">
          {h.flags.map((f, i) => (
            <div key={f.id} className={`flag own${f.owner} cap${f.capTeam} ${f.contested ? "contested" : ""} ${h.inFlag === i ? "here" : ""}`} title={f.name} data-testid={`flag-${f.id}`} data-owner={f.owner}>
              {f.id}
              {f.capTeam !== -1 && <span className="flag-cap" style={{ width: `${Math.round(f.cap * 100)}%` }} />}
            </div>
          ))}
        </div>
      )}
      {h.flagNotice && noticeAge < 2600 && (
        <div className={`flag-notice t${h.flagNotice.team}`} data-testid="flag-notice" style={{ opacity: Math.min(1, (2600 - noticeAge) / 500) }}>{h.flagNotice.text}</div>
      )}
      {h.alive && here && (
        <div className={`capture ${here.contested ? "contested" : ""} ${here.capTeam !== -1 && here.capTeam !== h.myTeam ? "enemy" : ""}`} data-testid="capture">
          {captureText}
          {here.capTeam !== -1 && !here.contested && <div className="capture-bar"><div className="capture-fill" style={{ width: `${Math.round(here.cap * 100)}%` }} /></div>}
        </div>
      )}

      {/* Minimap + compass (drop 5): hidden behind the scope and the result screen */}
      {/* The tube takes your surroundings away with it; the M-1's ring is the weapon that does NOT,
          which is most of what separates the two long rifles in play. */}
      {h.connected && h.scopeStyle !== "tube" && h.phase !== MatchPhase.Ended && <Minimap radar={radar} />}
      {/* Chat (drop 5) */}
      {h.connected && <Chat lines={h.chat} open={h.chatOpen} teams={teams} myId={h.myId} api={chat} />}

      {/* Kill feed */}
      <ul className="killfeed" data-testid="killfeed">
        {h.killFeed.map((k) => (
          <li key={k.key} className={k.victim === h.myId ? "me-victim" : k.killer === h.myId ? "me-killer" : ""}>
            <span className={`kf-name ${teams ? `t${k.killerTeam}` : "ffa"}`}>{k.killer === k.victim ? "" : k.killerName}</span>
            <span className="kf-weapon">{k.killer === k.victim ? "fell" : killerName(k.weapon).split(" ")[0]}{k.headshot ? " ✦" : ""}</span>
            <span className={`kf-name ${teams ? `t${k.victimTeam}` : "ffa"}`}>{k.victimName}</span>
          </li>
        ))}
      </ul>

      {/* Bottom-left: health */}
      <div className="health" data-testid="health">
        <div className="health-bar"><div className="health-fill" style={{ width: `${100 * h.health / (h.mode === "boys" ? boysClass(h.boysClass).health : 100)}%` }} />{h.armor > 0 && <div className="armor-fill" style={{ width: `${h.armor}%` }} />}</div>
        <div className="health-num">{h.health}</div>
        {(h.armor > 0 || brokeAge < 900) && <div className={`armor-num ${brokeAge < 900 ? "broke" : ""}`} data-testid="armor">🛡 {brokeAge < 900 && h.armor === 0 ? "BROKEN" : h.armor}</div>}
      </div>
      {activePerks.length > 0 && (
        <div className="perk-list" data-testid="perks">
          {activePerks.map((id) => {
            const p = PERKS[id];
            const leftMs = h.perks[id] - h.serverNow;
            const frac = p.durationMs > 0 ? Math.max(0, Math.min(1, leftMs / p.durationMs)) : 1;
            return (
              <div key={id} className={`perk perk-${id}`} title={p.blurb}>
                <span className="perk-glyph">{p.glyph}</span>
                <span className="perk-name">{p.name.toUpperCase()}</span>
                <span className="perk-time">{p.durationMs > 0 ? `${Math.max(0, Math.ceil(leftMs / 1000))}s` : "ARMED"}</span>
                <span className="perk-bar" style={{ width: `${Math.round(frac * 100)}%` }} />
              </div>
            );
          })}
        </div>
      )}

      {/* Wallet + buy prompt (drop 2) */}
      {h.connected && (
        <div className="wallet" data-testid="wallet">
          {h.mode === "boys" && <div className="wallet-role">{boysClass(h.boysClass).name} · B: class / shop{h.nextClass !== h.boysClass ? ` · Next: ${boysClass(h.nextClass).name}` : ""}</div>}
          <div className={`wallet-money ${h.money >= 8000 ? "rich" : ""}`} data-testid="money">{money(h.money)}</div>
          {h.alive && !h.shopOpen && h.buyWindowLeft > 0 && (
            <div className={`wallet-prompt ${h.nearStation ? "station" : ""} ${windowSecs !== null && windowSecs <= 5 ? "urgent" : ""}`} data-testid="buy-prompt">
              <kbd>B</kbd><span>BUY EQUIPMENT</span><strong data-testid="buy-countdown">{windowSecs !== null ? `${windowSecs}s` : h.nearStation ? "OPEN" : "WARM-UP"}</strong>
            </div>
          )}
        </div>
      )}
      <div className="money-toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.key} className={`money-toast ${t.delta < 0 ? "neg" : ""}`}>{t.delta > 0 ? "+" : ""}{money(t.delta)}<span className="why">{REASON_SHORT[t.reason] ?? t.reason.toUpperCase()}</span></div>
        ))}
      </div>
      {shopHint && <div className="shop-closed-hint" data-testid="shop-closed">SHOP CLOSED · REACH A $ BUY COUNTER</div>}

      {/* Bottom-right: weapon + ammo, grenade slots above */}
      {h.connected && (
        <div className="gear" data-testid="gear">
          <div className={`gear-slot ${h.lethal ? "" : "empty"} ${h.cookingKind && GRENADES[h.cookingKind].slot === "lethal" ? "cooking" : ""}`} data-testid="slot-lethal">
            <span className="key">G</span><span>{h.lethal ? GRENADES[h.lethal].name.toUpperCase() : "LETHAL"}</span><span className="count">{h.lethal ? h.lethalCount : "–"}</span>
          </div>
          <div className={`gear-slot ${h.tactical ? "" : "empty"}`} data-testid="slot-tactical">
            <span className="key">4</span><span>{h.tactical ? GRENADES[h.tactical].name.toUpperCase() : "TACTICAL"}</span><span className="count">{h.tactical ? h.tacticalCount : "–"}</span>
          </div>
        </div>
      )}
      <div className="ammo" data-testid="ammo">
        <div className="weapon-name">{w.name}<span className="slot">{w.slot}</span></div>
        <div className={`ammo-num ${h.ammo === 0 && w.kind !== "melee" ? "empty" : ""}`}>{w.kind === "melee" ? <span className="mag">∞</span> : h.reloading ? <span className="reloading">RELOADING</span> : <><span className="mag">{h.ammo}</span><span className="sep">/</span><span className="res">{h.reserve}</span></>}</div>
        {h.reloading && <div className="reload-bar"><div className="reload-fill" key={h.weapon + String(h.reloading)} style={{ animationDuration: `${reloadMs}ms` }} /></div>}
      </div>

      {h.reconnecting && <div className="reconnect" data-testid="reconnecting">CONNECTION LOST · RECONNECTING…</div>}

      {/* Countdown */}
      {h.phase === MatchPhase.Countdown && (
        <div className="center-msg countdown" data-testid="countdown">{Math.max(1, Math.ceil(timeLeft / 1000))}</div>
      )}
      {h.phase === MatchPhase.Waiting && h.alive && (
        <div className="center-sub">WARM-UP · waiting for players ({MATCH.minPlayers} needed)</div>
      )}

      {/* Flask (drop 3): the promised blurry edges */}
      {h.alive && activePerks.includes("flask") && <div className="flask-haze" />}
      {/* Flash blindness (above everything but the menus) */}
      {flashOpacity > 0.01 && <div className="flash-out" data-testid="flash" style={{ opacity: flashOpacity }} />}

      {/* Death screen */}
      {!h.alive && h.connected && h.phase !== MatchPhase.Ended && (
        <div className="death" data-testid="death">
          <div className="death-title">{h.killerName ? <>ELIMINATED BY <b>{h.killerName}</b></> : "ELIMINATED"}</div>
          {h.killerWeapon && h.killerName && <div className="death-weapon">{killerName(h.killerWeapon)}</div>}
          <div className="death-respawn">
            {h.mode === "bomb" && (h.phase === MatchPhase.Playing || h.phase === MatchPhase.Prep) ? "BACK NEXT ROUND" : `RESPAWN IN ${Math.max(0, Math.ceil((h.respawnAt - now) / 1000))}`}
          </div>
        </div>
      )}

      {/* Match end */}
      {h.phase === MatchPhase.Ended && (
        <div className="result" data-testid="result">
          <div className={`result-title ${(teams ? winnerTeam : winnerFfa).toLowerCase()}`}>{teams ? winnerTeam : winnerFfa}</div>
          <div className="result-score">
            {teams ? <>{TEAM_NAMES[0]} {h.scoreA} — {h.scoreB} {TEAM_NAMES[1]}</> : h.winnerName ? <><b>{h.winnerName}</b> TAKES THE NIGHT</> : "NOBODY TAKES THE NIGHT"}
          </div>
          {h.reward && <MatchSummary reward={h.reward} />}
          <Scoreboard rows={h.players} myId={h.myId} mode={h.mode} />
          <div className="result-foot">Next match in {Math.max(0, Math.ceil(timeLeft / 1000))}s · <button className="link" onClick={onLeave}>LEAVE</button></div>
        </div>
      )}

      {/* Scoreboard (Tab) */}
      {scoreboard && h.phase !== MatchPhase.Ended && (
        <div className="scoreboard-wrap" data-testid="scoreboard"><Scoreboard rows={h.players} myId={h.myId} mode={h.mode} /></div>
      )}

      {/* Buy menu (B) */}
      {h.shopOpen && h.phase !== MatchPhase.Ended && <Shop h={h} api={shop} now={now} />}

      {/* Pause / settings */}
      {paused && h.phase !== MatchPhase.Ended && (
        <div className="pause" data-testid="pause">
          <div className="pause-card">
            <div className="wordmark small">BARBERSTRIKE</div>
            <button className="menu-btn primary" onClick={onResume} data-testid="btn-resume">RESUME</button>
            <details><summary className="menu-btn">SETTINGS</summary><SettingsPanel settings={settings} onChange={onSettings} /></details>
            <button className="menu-btn" onClick={onLeave} data-testid="btn-leave">LEAVE MATCH</button>
            <div className="version">v{GAME_VERSION}</div>
          </div>
        </div>
      )}

      {/* Debug overlay (dev only) */}
      {import.meta.env.DEV && (
        <div className="debug" data-testid="debug">
          v{GAME_VERSION} · {h.fps} fps · {h.ping} ms{!telemetry && " · F3"}
          {telemetry && (
            <table className="telemetry"><tbody>
              {Object.entries(h.telemetry).map(([k, v]) => <tr key={k}><td>{k}</td><td>{v}</td></tr>)}
            </tbody></table>
          )}
        </div>
      )}
    </div>
  );
}

/** One scoreboard row (drop 5): K / D / A / $ / score / ping, a BOT tag, a dash for a bot's ping. */
function ScoreTr({ r, myId }: { r: ReturnType<typeof useHud>["players"][number]; myId: string }) {
  return (
    <tr className={r.id === myId ? "me" : r.connected ? "" : "dc"} data-testid="sb-row" data-bot={r.bot ? "1" : "0"}>
      <td className="sb-name">{r.name}{r.boysClass && <span className="sb-bot">{boysClass(r.boysClass).name}</span>}{r.bot && <span className="sb-bot">BOT</span>}</td>
      <td>{r.kills}</td><td>{r.deaths}</td><td>{r.assists}</td><td className="sb-money">{r.money}</td><td>{r.score}</td><td>{r.bot ? "–" : r.ping}</td>
    </tr>
  );
}

function Scoreboard({ rows, myId, mode }: { rows: ReturnType<typeof useHud>["players"]; myId: string; mode: GameMode }) {
  if (!MODES[mode].teams) {
    // FFA (drop 4): one table, most kills first.
    const sorted = [...rows].sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);
    return (
      <div className="scoreboard">
        <table className="sb-team ffa">
          <thead><tr><th className="sb-name">{MODES[mode].name}</th><th>K</th><th>D</th><th>A</th><th>$</th><th>SCORE</th><th>PING</th></tr></thead>
          <tbody>
            {sorted.map((r) => <ScoreTr key={r.id} r={r} myId={myId} />)}
          </tbody>
        </table>
      </div>
    );
  }
  return (
    <div className="scoreboard">
      {[0, 1].map((team) => (
        <table key={team} className={`sb-team t${team}`}>
          <thead><tr><th className="sb-name">{TEAM_NAMES[team]}</th><th>K</th><th>D</th><th>A</th><th>$</th><th>SCORE</th><th>PING</th></tr></thead>
          <tbody>
            {rows.filter((r) => r.team === team).map((r) => <ScoreTr key={r.id} r={r} myId={myId} />)}
          </tbody>
        </table>
      ))}
    </div>
  );
}
