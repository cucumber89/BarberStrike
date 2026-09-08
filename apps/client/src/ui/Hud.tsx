import React, { useCallback, useEffect, useMemo, useState } from "react";
import { BOMB, GAME_VERSION, GRENADES, MATCH, MODES, MatchPhase, PERKS, PERK_ORDER, TEAM_NAMES, WEAPONS, BADGES, killerName, perkActive, type GameMode, type WeaponId } from "@frankibarber/shared";
import { useHud } from "../game/store";
import { TeamPicker } from "./TeamPicker";
import type { MatchReward } from "../game/progression/profile";
import { CROSSHAIR_COLORS, keyLabel, resolveBindings, type Settings } from "../settings";
import { SettingsPanel } from "./SettingsPanel";
import { Shop, type ShopApi } from "./Shop";
import { Chat, type ChatApi } from "./Chat";
import { Minimap } from "./Minimap";
import { CopyRow } from "./Online";
import { inviteLink } from "./invite";
import type { RadarSnapshot } from "../game/Game";

interface Props {
  settings: Settings;
  onSettings: (s: Settings) => void;
  onLeave: () => void;
  /** Resolves to whether the pointer really ended up locked — a refusal must be visible, not silent. */
  onResume: () => Promise<boolean>;
  /** Release the pointer so Escape can open the pause card even when the browser did not do it. */
  onPause: () => void;
  /** Toggle fullscreen; resolves to whether the game is fullscreen afterwards. */
  onFullscreen: () => Promise<boolean>;
  /** Ask the server to move you to a side; it decides and answers. */
  onChooseTeam: (t: import("@frankibarber/shared").Team) => void;
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
/** The carrier's name for the escort line, from the scoreboard rows. */
const carrierName = (h: ReturnType<typeof useHud>): string => h.players.find((p) => p.id === h.bomb?.carrier)?.name ?? "THE CARRIER";
const REASON_SHORT: Record<string, string> = { kill: "KILL", headshot: "HEAD SHOT", assist: "ASSIST", buy: "", sell: "SOLD", reset: "" };

export function Hud({ settings, onSettings, onLeave, onResume, onPause, onFullscreen, onChooseTeam, shop, chat, radar }: Props) {
  const h = useHud();
  // The flash overlay and cook ring need a smooth clock; everything else is fine at 4 Hz.
  const fast = h.flashUntil > performance.now() || h.cookingKind !== "";
  const now = useClock(fast ? 33 : 250);
  const [scoreboard, setScoreboard] = useState(false);
  const [paused, setPaused] = useState(false);
  const [telemetry, setTelemetry] = useState(false);
  const [pauseSettings, setPauseSettings] = useState(false);
  /** Set when a resume attempt came back without the pointer, so the card can say so and retry. */
  const [lockRefused, setLockRefused] = useState(false);
  const [fullscreen, setFullscreen] = useState(() => typeof document !== "undefined" && document.fullscreenElement != null);

  useEffect(() => {
    const sync = () => setFullscreen(document.fullscreenElement != null);
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);

  const resume = useCallback(async () => {
    const ok = await onResume();
    setLockRefused(!ok);
    if (ok) setPaused(false);
  }, [onResume]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (h.chatOpen) return; // the chat box owns the keyboard (drop 5)
      // Tab is the scoreboard in play, but plain focus navigation inside the pause card / shop.
      if (e.code === "Tab" && !paused && !h.shopOpen) { e.preventDefault(); setScoreboard(true); }
      if (e.code === "Escape" && !h.shopOpen) {
        // Two ways in. Normally the browser has already released the pointer by the time this
        // runs. Under Keyboard Lock (fullscreen, Chromium) Escape reaches the page WITHOUT
        // releasing it, so the lock has to be dropped here or the pause card would be unclickable.
        e.preventDefault();
        if (paused) void resume();
        else { onPause(); setPaused(true); }
      }
      if (e.code === "F3" && import.meta.env.DEV) { e.preventDefault(); setTelemetry((t) => !t); }
    };
    const up = (e: KeyboardEvent) => { if (e.code === "Tab") setScoreboard(false); };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); };
  }, [h.shopOpen, h.chatOpen, paused, resume, onPause]);

  // Escape releases pointer lock (browser) → show pause overlay; clicking resume re-locks.
  // The shop and the chat box release / hold the lock on purpose, so they never count as a pause.
  useEffect(() => {
    if (!h.pointerLocked && h.connected && h.phase !== MatchPhase.Ended && !h.shopOpen && !h.chatOpen) setPaused(true);
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
  // Crosshair (2.1: player-styled). The gap grows with the effective spread (radians → px at the
  // current FOV) when the dynamic option is on; clamped for readability either way.
  const ui = settings.interface;
  const ch = ui.crosshair;
  const bindings = resolveBindings(settings.keys);
  const keyOf = (a: keyof typeof bindings) => keyLabel(bindings[a][0]);
  const gap = Math.round(Math.min(34 + ch.gap, ch.gap + (ch.dynamic ? h.crosshairSpread * 900 : 0)));
  const chStyle = {
    "--gap": `${gap}px`, "--ch-len": `${ch.size}px`, "--ch-thick": `${ch.thickness}px`, "--ch-color": CROSSHAIR_COLORS[ch.color],
    "--ch-outline": ch.outline ? "0 0 2px rgba(0,0,0,.9)" : "none",
  } as React.CSSProperties;
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
    <div className={`hud ${lowHealth ? "low-health" : ""}`} data-testid="hud" style={{ zoom: ui.hudScale }}>
      {h.smokeOpacity > 0 && <div className="smoke-screen" data-testid="smoke-screen" style={{ opacity: h.smokeOpacity }} />}
      {h.bomb && (h.phase === MatchPhase.Playing || h.phase === MatchPhase.Prep) && <div className={`bomb-hud ${h.bomb.stage === "planted" ? "armed" : ""}`} data-testid="bomb-hud">
        <b>ROUND {h.bomb.round} / {BOMB.maxRounds} · {h.bomb.attackTeam === h.myTeam ? "ATTACK" : "DEFEND"} · FIRST TO {BOMB.wins}{h.kit ? " · DEFUSE KIT" : ""}</b>
        <span>{h.bomb.stage === "buy" ? `${h.bomb.round === BOMB.halfRounds + 1 ? "SIDES SWITCHED · " : ""}${keyOf("shop")} TO BUY · START IN ${Math.max(0, Math.ceil(timeLeft / 1000))}s`
          : h.phase === MatchPhase.Prep ? `${h.bomb.result} · NEXT ROUND ${Math.max(0, Math.ceil(timeLeft / 1000))}s`
          : h.bomb.stage === "planted" ? `BOMB ARMED AT ${h.bomb.site} · ${h.bomb.attackTeam === h.myTeam ? "GUARD THE CHARGE" : `HOLD ${keyOf("objective")} AT THE CHARGE TO DEFUSE (${(h.kit ? BOMB.defuseKitMs : BOMB.defuseMs) / 1000} S)`}`
          : h.bomb.carrier === h.myId ? `YOU HAVE THE BOMB · HOLD ${keyOf("objective")} INSIDE A / B TO PLANT · ${keyOf("dropBomb")} TO HAND IT OVER`
          : h.bomb.attackTeam !== h.myTeam ? "PROTECT SITES A / B"
          : h.bomb.stage === "dropped" ? "BOMB ON THE GROUND · WALK OVER IT TO PICK UP" : `ESCORT ${carrierName(h)} · THE BOMB`}</span>
        {h.bomb.actor && <><div className="bomb-progress"><i style={{ width: `${h.bomb.progress * 100}%` }} /></div><small>{h.bomb.actor === h.myId ? `KEEP HOLDING ${keyOf("objective")} · STAND STILL` : h.bomb.stage === "planted" ? "DEFUSING" : "PLANTING"}</small></>}
      </div>}
      {h.bomb && h.bomb.stage === "carried" && h.bomb.carrier === h.myId && h.phase === MatchPhase.Playing && <div className="bomb-carry" data-testid="bomb-carry">◆ C4</div>}
      {/* Damage vignette / direction */}
      {dmgAge < 600 && <div className="damage-dir" style={{ transform: `rotate(${h.damageAngle}rad)`, opacity: 1 - dmgAge / 600 }} />}

      {/* Crosshair (hidden in ADS and while a grenade is in the hand: the cook ring takes its place) */}
      {h.alive && h.pointerLocked && !h.aiming && h.cookingKind === "" && (
        <div className={`crosshair ${hitAge < 180 ? (h.hitKill ? "kill" : h.hitHead ? "head" : h.hitArmor ? "armor" : "hit") : ""} ${protectedNow ? "shield" : ""}`} data-testid="crosshair" style={chStyle}>
          {ch.size > 0 && <><span className="ch-top" /><span className="ch-bottom" /><span className="ch-left" /><span className="ch-right" /></>}
          {ch.dot && <span className="ch-dot" />}
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
      {/* Scope (drop 3): black mask with a round window, a reticle, breath meter */}
      {h.alive && h.scoped && (
        <div className="scope" data-testid="scope">
          <div className="scope-mask" />
          <div className={`scope-reticle ${hitAge < 180 ? "hit" : ""}`}><span className="v" /><span className="hz" /><span className="dot" /></div>
          <div className="scope-breath"><div className="scope-breath-fill" style={{ width: `${Math.round(h.breath * 100)}%` }} /><span>{h.breath <= 0 ? "WINDED" : "SHIFT · HOLD BREATH"}</span></div>
        </div>
      )}

      {/* Top: score + timer (team modes) or me vs the leader (FFA, drop 4) */}
      <div className="top-bar" data-mode={h.mode}>
        {teams
          ? <div className={`team-score t0 ${h.myTeam === 0 ? "mine" : ""}`}><span className="tname">{TEAM_NAMES[0]}</span><span className="tscore" data-testid="score-a">{h.scoreA}</span></div>
          : <div className="ffa-score mine"><span className="tname">YOU</span><span className="tscore" data-testid="score-a">{myKills}</span></div>}
        <div className="timer" data-testid="timer">
          {h.phase === MatchPhase.Playing || h.phase === MatchPhase.Prep ? fmtTime(matchLeft)
            : h.phase === MatchPhase.Countdown ? "STARTING"
            : h.phase === MatchPhase.Waiting ? "WARM-UP" : "MATCH OVER"}
        </div>
        {teams
          ? <div className={`team-score t1 ${h.myTeam === 1 ? "mine" : ""}`}><span className="tscore" data-testid="score-b">{h.scoreB}</span><span className="tname">{TEAM_NAMES[1]}</span></div>
          : <div className={`ffa-score ${leading ? "" : "lead"}`}><span className="tscore" data-testid="score-b">{leader?.kills ?? 0}</span><span className="tname">{leader?.name ?? "NOBODY"}</span></div>}
      </div>
      {/* Domination (drop 4): A / B / C with owner colour, capture bar, contested pulse */}
      {h.mode === "dom" && h.flags.length > 0 && (
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
      {h.connected && ui.minimap && !h.scoped && h.phase !== MatchPhase.Ended && <Minimap radar={radar} />}
      {/* Chat (drop 5) */}
      {h.connected && <Chat lines={h.chat} open={h.chatOpen} teams={teams} myId={h.myId} api={chat} />}

      {/* Kill feed */}
      <ul className="killfeed" data-testid="killfeed">
        {ui.killFeed && h.killFeed.map((k) => (
          <li key={k.key} className={k.victim === h.myId ? "me-victim" : k.killer === h.myId ? "me-killer" : ""}>
            <span className={`kf-name ${teams ? `t${k.killerTeam}` : "ffa"}`}>{k.killer === k.victim ? "" : k.killerName}</span>
            <span className="kf-weapon">{k.killer === k.victim && k.weapon !== "c4" ? "fell" : killerName(k.weapon).split(" ")[0]}{k.headshot ? " ✦" : ""}</span>
            <span className={`kf-name ${teams ? `t${k.victimTeam}` : "ffa"}`}>{k.victimName}</span>
          </li>
        ))}
      </ul>

      {/* Bottom-left: health */}
      <div className="health" data-testid="health">
        <div className="health-bar"><div className="health-fill" style={{ width: `${h.health}%` }} />{h.armor > 0 && <div className="armor-fill" style={{ width: `${h.armor}%` }} />}</div>
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
          <div className={`wallet-money ${h.money >= 8000 ? "rich" : ""}`} data-testid="money">{money(h.money)}</div>
          {h.alive && !h.shopOpen && h.buyWindowLeft > 0 && (
            <div className={`wallet-prompt ${h.nearStation ? "station" : ""}`} data-testid="buy-prompt">
              <b>B</b> · BUY{windowSecs !== null ? ` (${windowSecs}s)` : h.nearStation ? " · AT THE COUNTER" : ""}
            </div>
          )}
        </div>
      )}
      <div className="money-toasts" aria-live="polite">
        {ui.moneyToasts && toasts.map((t) => (
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
            <p className="pause-hint">Paused · press <kbd>ESC</kbd> or click Resume to play on</p>
            {lockRefused && (
              <p className="pause-warn" data-testid="pause-lock-refused">
                The browser did not hand over your mouse. Click <strong>RESUME</strong> once more —
                a refusal right after you pressed Escape is normal and clears in a second.
              </p>
            )}
            <button className="menu-btn primary" onClick={() => void resume()} data-testid="btn-resume">RESUME</button>
            <button className="menu-btn" onClick={() => void onFullscreen().then(setFullscreen)} data-testid="btn-fullscreen">
              {fullscreen ? "LEAVE FULLSCREEN" : "GO FULLSCREEN"}
            </button>
            <button className="menu-btn" onClick={() => setPauseSettings((v) => !v)} data-testid="btn-pause-settings">{pauseSettings ? "HIDE SETTINGS" : "SETTINGS"}</button>
            {!pauseSettings && <TeamPicker h={h} onChoose={onChooseTeam} />}
            {pauseSettings && <SettingsPanel settings={settings} onChange={onSettings} />}
            {!pauseSettings && (
              <div className="pause-invite">
                <small>INVITE A FRIEND TO THIS ROOM</small>
                <CopyRow value={inviteLink(location.href, h.roomName, h.mode)} testid="pause-invite" />
              </div>
            )}
            <button className="menu-btn" onClick={onLeave} data-testid="btn-leave">LEAVE MATCH</button>
            <div className="version">v{GAME_VERSION}</div>
          </div>
        </div>
      )}

      {/* FPS / ping (2.1: a setting, so a player can check a stutter without a dev build) */}
      {!import.meta.env.DEV && ui.showFps && <div className="fps" data-testid="fps">{h.fps} FPS · {h.ping} MS</div>}
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
      <td className="sb-name">{r.name}{r.bot && <span className="sb-bot">BOT</span>}</td>
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
