import React, { useCallback, useEffect, useMemo, useState } from "react";
import { boysClass, BOMB, GAME_VERSION, GRENADES, GUN_GAME, MATCH, MODES, MatchPhase, OSTRZYZENI, PERKS, PERK_ORDER, PLAYER, TEAM_NAMES, WEAPONS, BADGES, killerName, ladderDone, ladderWeapon, perkActive, type GameMode, type WeaponId } from "@frankibarber/shared";
import { useHud } from "../game/store";
import { pelletRing } from "../game/combat/weaponFeel";
import { TeamPicker } from "./TeamPicker";
import { PlanPanel } from "./PlanPanel";
import { Hints } from "./Hints";
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
  /** Resolves to whether the pointer really ended up locked — a refusal must be visible, not silent. */
  onResume: () => Promise<boolean>;
  /** Release the pointer so Escape can open the pause card even when the browser did not do it. */
  onPause: () => void;
  /** Toggle fullscreen; resolves to whether the game is fullscreen afterwards. */
  onFullscreen: () => Promise<boolean>;
  /** Ask the server to move you to a side; it decides and answers. */
  onChooseTeam: (t: import("@frankibarber/shared").Team) => void;
  /** Living arena: vote for one of this round's plans. */
  onVotePlan: (id: number) => void;
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

/**
 * Drop D: Ostrzyżeni's sides, in the team slots. The shared `TEAM_NAMES` are the shop's two chairs
 * (FADE / TAPER) and mean nothing here — this mode's sides are "the spared" and "the shaved", and
 * a player changes sides mid-round, which is the whole point.
 */
const OSTRZYZENI_SIDES = ["OCALENI", "OSTRZYŻENI"] as const;
const REASON_SHORT: Record<string, string> = { kill: "KILL", headshot: "HEAD SHOT", assist: "ASSIST", buy: "", sell: "SOLD", reset: "" };

export function Hud({ settings, onSettings, onLeave, onResume, onPause, onFullscreen, onChooseTeam, onVotePlan, shop, chat, radar }: Props) {
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
  const ch = settings.hud.crosshair;
  // The gap is the player's own resting gap, opened by the real spread when they asked for that.
  const gap = ch.dynamic ? Math.round(Math.min(34, ch.gap + h.crosshairSpread * 900)) : ch.gap;
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
  // Drop D: Gun Game replicates the ladder rung as `score` (0..11; 11 = finished). The top bar shows
  // the rung, the gun it hands you and the next one, against the leader's rung instead of kills.
  const gunGame = h.mode === "gungame";
  const noShop = MODES[h.mode].shop === "none";
  const myRung = meRow?.score ?? 0;
  const leaderRung = leader?.score ?? 0;
  const rungLabel = (rung: number) => `${Math.min(GUN_GAME.ladder.length, rung + 1)}/${GUN_GAME.ladder.length}`;
  const rungGun = WEAPONS[ladderWeapon(myRung)].name;
  const nextGun = myRung + 1 < GUN_GAME.ladder.length ? WEAPONS[ladderWeapon(myRung + 1)].name : null;
  const ladderLeading = !leader || myRung >= leaderRung;
  // Drop D: Ostrzyżeni. The sides are the teams, so the only new reads are who is still unshaved
  // (counted from the scoreboard rows the HUD already has) and which side I am on.
  const infection = h.mode === "ostrzyzeni";
  // The bar is a fraction of what THIS player can hold: a Boys class, an Ostrzyżony's bigger pool,
  // or the ordinary hundred. Without this a 220 HP chaser draws a bar twice the width of its box.
  const maxHealth = h.mode === "boys" ? boysClass(h.boysClass).health
    : infection && !!h.players.find((r) => r.id === h.myId)?.shaved ? OSTRZYZENI.shavedHealth
    : PLAYER.maxHealth;
  const sideNames = infection ? OSTRZYZENI_SIDES : TEAM_NAMES;
  const meShaved = !!meRow?.shaved;
  const unshavedLeft = infection ? h.players.filter((r) => r.connected && r.alive && !r.shaved).length : 0;
  const here = h.inFlag >= 0 ? h.flags[h.inFlag] : null;
  const captureText = here
    ? here.contested ? `CONTESTED · ${here.id}`
      : here.capTeam === h.myTeam ? `CAPTURING ${here.id} · ${Math.round(here.cap * 100)}%`
      : here.capTeam !== -1 ? `${TEAM_NAMES[here.capTeam as 0 | 1]} TAKING ${here.id}`
      : here.owner === h.myTeam ? `HOLDING ${here.id}` : `ENEMY FLAG ${here.id}`
    : "";
  const noticeAge = h.flagNotice ? now - h.flagNotice.at : Infinity;
  const winnerFfa = h.winnerId === "" ? "DRAW" : h.winnerId === h.myId ? "VICTORY" : "DEFEAT";
  // Drop D: the result names a side or a player by the mode's `winner`, not by whether it has teams.
  const teamWinner = MODES[h.mode].winner === "team";

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
      {/* Ostrzyżeni (drop D): the round, how many heads are left, and which side the clock favours. */}
      {infection && (h.phase === MatchPhase.Playing || h.phase === MatchPhase.Prep) && (
        <div className={`bomb-hud infection ${meShaved ? "shaved" : ""}`} data-testid="infection-line">
          <b>RUNDA {Math.min(OSTRZYZENI.rounds, h.round + 1)} / {OSTRZYZENI.rounds} · {unshavedLeft} NIEOSTRZYŻONYCH · {fmtTime(timeLeft)}</b>
          <span>{h.phase === MatchPhase.Prep
            ? (meShaved ? "OSTRZYSZ ICH ZA CHWILĘ — maszynka w dłoni" : `PRZYGOTOWANIE · B TO BUY · RUNDA ZA ${Math.max(0, Math.ceil(timeLeft / 1000))}s`)
            : meShaved ? "JESTEŚ OSTRZYŻONY — goń ich z maszynką"
            : "PRZEŻYJ — nie daj się ostrzyc"}</span>
        </div>
      )}
      {/* Damage vignette / direction */}
      {dmgAge < 600 && <div className="damage-dir" style={{ transform: `rotate(${h.damageAngle}rad)`, opacity: 1 - dmgAge / 600 }} />}

      {/* Crosshair (hidden in ADS and while a grenade is in the hand: the cook ring takes its place).
          Shape, size, thickness, gap and colour come from the player's own settings — this is the
          one piece of UI they look at every second of the match. */}
      {h.alive && h.pointerLocked && !h.aiming && h.cookingKind === "" && (
        <div
          className={`crosshair ch-${ch.style} ${ch.outline ? "outlined" : ""} ${hitAge < 180 ? (h.hitKill ? "kill" : h.hitHead ? "head" : h.hitArmor ? "armor" : "hit") : ""} ${protectedNow ? "shield" : ""}`}
          data-testid="crosshair"
          style={{ "--gap": `${gap}px`, "--len": `${ch.size}px`, "--w": `${ch.thickness}px`, "--ch-color": ch.color } as React.CSSProperties}
        >
          {ch.style !== "dot" && ch.style !== "circle" && <><span className="ch-top" /><span className="ch-bottom" /><span className="ch-left" /><span className="ch-right" /></>}
          {ch.style === "circle" && <span className="ch-circle" />}
          {(ch.style === "dot" || ch.style === "cross-dot") && <span className="ch-dot" />}
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
          ? <div className={`team-score t0 ${h.myTeam === 0 ? "mine" : ""}`}><span className="tname">{sideNames[0]}</span><span className="tscore" data-testid="score-a">{h.scoreA}</span></div>
          : gunGame
            ? <div className="ffa-score mine ladder"><span className="tname">GUN</span><span className="tscore" data-testid="ladder">{rungLabel(myRung)}</span>
                <span className="ladder-gun" data-testid="ladder-gun">{ladderDone(myRung) ? <b>LADDER DONE</b> : <><b>{rungGun}</b>{nextGun && <small>NEXT: {nextGun}</small>}</>}</span></div>
            : <div className="ffa-score mine"><span className="tname">YOU</span><span className="tscore" data-testid="score-a">{myKills}</span></div>}
        <div className={`timer ${matchLeft > 0 && matchLeft <= 30000 ? "urgent" : ""}`} data-testid="timer">
          {h.phase === MatchPhase.Playing || h.phase === MatchPhase.Prep ? fmtTime(matchLeft)
            : h.phase === MatchPhase.Countdown ? `START ${Math.max(0, Math.ceil(timeLeft / 1000))}`
            : h.phase === MatchPhase.Waiting ? "WARM-UP" : "MATCH OVER"}
        </div>
        {teams
          ? <div className={`team-score t1 ${h.myTeam === 1 ? "mine" : ""}`}><span className="tscore" data-testid="score-b">{h.scoreB}</span><span className="tname">{sideNames[1]}</span></div>
          : gunGame
            ? <div className={`ffa-score ${ladderLeading ? "" : "lead"}`}><span className="tscore" data-testid="score-b">{leader ? rungLabel(leaderRung) : "–"}</span><span className="tname">{leader?.name ?? "NOBODY"}</span></div>
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
        <div className="health-bar"><div className="health-fill" style={{ width: `${100 * h.health / maxHealth}%` }} />{h.armor > 0 && <div className="armor-fill" style={{ width: `${h.armor}%` }} />}</div>
        <div className="health-num">{h.health}</div>
        {(h.armor > 0 || brokeAge < 900) && <div className={`armor-num ${brokeAge < 900 ? "broke" : ""}`} data-testid="armor">🛡 {brokeAge < 900 && h.armor === 0 ? "BROKEN" : h.armor}</div>}
      </div>
      {activePerks.length > 0 && (
        <div className="perk-list" data-testid="perks">
          {activePerks.map((id) => {
            const p = PERKS[id];
            const leftMs = h.perks[id] - h.serverNow;
            // Drop D: a perk can be armed for a whole round rather than for its own duration (the
            // Ostrzyżony's speed). That is written as `PERK_ARMED_MS`, which as a countdown reads
            // "999985s" and pins the bar full — so anything longer than the perk's own life shows
            // as ARMED, the same way a fade does.
            const timed = p.durationMs > 0 && leftMs <= p.durationMs;
            const frac = timed ? Math.max(0, Math.min(1, leftMs / p.durationMs)) : 1;
            return (
              <div key={id} className={`perk perk-${id}`} title={p.blurb}>
                <span className="perk-glyph">{p.glyph}</span>
                <span className="perk-name">{p.name.toUpperCase()}</span>
                <span className="perk-time">{timed ? `${Math.max(0, Math.ceil(leftMs / 1000))}s` : "ARMED"}</span>
                <span className="perk-bar" style={{ width: `${Math.round(frac * 100)}%` }} />
              </div>
            );
          })}
        </div>
      )}

      {/* Wallet + buy prompt (drop 2) */}
      {h.connected && !noShop && (
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
      {shopHint && <div className="shop-closed-hint" data-testid="shop-closed">{noShop ? `NO SHOP IN ${MODES[h.mode].name} · KILLS HAND OUT THE GUNS` : "SHOP CLOSED · REACH A $ BUY COUNTER"}</div>}

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
          <div className={`result-title ${(teamWinner ? winnerTeam : winnerFfa).toLowerCase()}`}>{teamWinner ? winnerTeam : winnerFfa}</div>
          <div className="result-score">
            {teamWinner ? <>{sideNames[0]} {h.scoreA} — {h.scoreB} {sideNames[1]}</>
              : <>{infection && <span className="result-rounds">{sideNames[0]} {h.scoreA} — {h.scoreB} {sideNames[1]} · </span>}
                {h.winnerName ? <><b>{h.winnerName}</b> TAKES THE NIGHT</> : "NOBODY TAKES THE NIGHT"}</>}
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

      {/* First-run hints: one short line, once each, never blocking (2.4) */}
      {!paused && <Hints h={h} />}

      {/* Living arena: the round's plan vote, or what is in force (2.4) */}
      {!h.shopOpen && <PlanPanel h={h} onVote={onVotePlan} />}

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
            <button className="menu-btn" onClick={onLeave} data-testid="btn-leave">LEAVE MATCH</button>
            <div className="version">v{GAME_VERSION}</div>
          </div>
        </div>
      )}

      {/* Frame counter. The player can turn this on in a built game now — it used to be DEV-only,
          so the one number anybody asks for ("what fps am I getting?") did not exist outside a dev
          server. The F3 telemetry table stays a development thing. */}
      {(settings.hud.fps || import.meta.env.DEV) && (
        <div className="debug" data-testid="debug">
          v{GAME_VERSION} · {h.fps} fps · {h.ping} ms{!telemetry && import.meta.env.DEV && " · F3"}
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
    // FFA (drop 4): one table, most kills first. Gun Game (drop D): highest rung first, the score column is the rung.
    const gun = mode === "gungame";
    const sorted = [...rows].sort((a, b) => (gun ? b.score - a.score || b.kills - a.kills : b.kills - a.kills || a.deaths - b.deaths));
    return (
      <div className="scoreboard">
        <table className="sb-team ffa">
          <thead><tr><th className="sb-name">{MODES[mode].name}</th><th>K</th><th>D</th><th>A</th><th>$</th><th>{gun ? "RUNG" : "SCORE"}</th><th>PING</th></tr></thead>
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
          <thead><tr><th className="sb-name">{(mode === "ostrzyzeni" ? OSTRZYZENI_SIDES : TEAM_NAMES)[team]}</th><th>K</th><th>D</th><th>A</th><th>$</th><th>SCORE</th><th>PING</th></tr></thead>
          <tbody>
            {rows.filter((r) => r.team === team).map((r) => <ScoreTr key={r.id} r={r} myId={myId} />)}
          </tbody>
        </table>
      ))}
    </div>
  );
}
