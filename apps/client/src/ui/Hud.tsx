import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { boysClass, DUEL, GAME_VERSION, scoreLimitFor, GRENADES, GUN_GAME, MATCH, MODES, MatchPhase, OSTRZYZENI, TEAM_NAMES, WEAPONS, killerName, ladderDone, ladderWeapon } from "@frankibarber/shared";
import { useHud } from "../game/store";
import { TeamPicker } from "./TeamPicker";
import { PlanPanel } from "./PlanPanel";
import { Hints } from "./Hints";
import { SettingsPanel } from "./SettingsPanel";
import { Shop } from "./Shop";
import { Chat } from "./Chat";
import { Minimap } from "./Minimap";
import { Scoreboard } from "./Scoreboard";
import { MatchResult, RoundBreak } from "./MatchResult";
import { BracketPanel, bracketLine, pairNames, standing } from "./Bracket";
import { OSTRZYZENI_SIDES, roundReasonText } from "./resultText";
import type { HudProps } from "./hud/types";
import { usePhaseModel } from "./hud/phase";
import { Crosshair, FlashVeil, SmokeVeil } from "./hud/Crosshair";
import { Vitals } from "./hud/Vitals";
import { Inventory } from "./hud/Inventory";
import { KillFeed } from "./hud/KillFeed";

/** The props are the drop-U contract (`hud/types.ts`): today's, plus the inert `entering`. */
type Props = HudProps;

const fmtTime = (ms: number): string => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};

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

const REASON_SHORT: Record<string, string> = { kill: "ZABÓJSTWO", headshot: "W GŁOWĘ", assist: "ASYSTA", buy: "", sell: "SPRZEDAŻ", reset: "", round: "WYGRANA RUNDA", loss: "BONUS ZA PRZEGRANĄ" };

export function Hud({ settings, onSettings, onLeave, onResume, onPause, onFullscreen, onChooseTeam, onVotePlan, shop, chat, radar, dormant = false }: Props) {
  const h = useHud();
  const model = usePhaseModel();
  const ended = h.phase === MatchPhase.Ended;
  // The break after a round is the FIRST Prep window after Playing; the buy window that follows
  // is a second Prep with a new deadline. Remembering the break's deadline is what tells them apart.
  const prevPhase = useRef(h.phase);
  const [breakEndsAt, setBreakEndsAt] = useState(0);
  useEffect(() => {
    if (prevPhase.current === MatchPhase.Playing && h.phase === MatchPhase.Prep) setBreakEndsAt(h.phaseEndsAt);
    prevPhase.current = h.phase;
  }, [h.phase, h.phaseEndsAt]);
  const inBreak = h.phase === MatchPhase.Prep && breakEndsAt !== 0 && breakEndsAt === h.phaseEndsAt;
  /**
   * Rule G9: the cook ring belongs to the ONE grenade that cooks. A smoke, a flash, a molotov or a
   * knife is in the hand for the 180 ms of the wind-up and never cooks, so the ring it used to draw
   * was an empty circle — and it cost the crosshair for exactly the moment the throw is aimed. Only
   * the frag replaces the crosshair now; everything else is thrown with the sight you aim with.
   */
  const cookRing = h.cookingKind !== "" && GRENADES[h.cookingKind].cookable;
  // The flash overlay and cook ring need a smooth clock; everything else is fine at 4 Hz.
  const fast = h.flashUntil > performance.now() || cookRing;
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
    if (dormant) return;
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
  }, [h.shopOpen, h.chatOpen, paused, resume, onPause, dormant]);

  // Escape releases pointer lock (browser) → show pause overlay; clicking resume re-locks.
  // The shop and the chat box release / hold the lock on purpose, so they never count as a pause.
  useEffect(() => {
    // A DORMANT hud is the one mounted behind the loading screen from READY on (App.tsx), and
    // nobody has entered the match yet: it is connected and it has no pointer, which is exactly
    // the shape of "the player pressed Escape", so it armed the pause card 300 ms into the ready
    // screen. Invisible (`.hud.dormant`), but real: `startup.spec.ts` asserts no pause card there
    // and was passing only by beating that timer to the assertion. The gate is the same one the
    // keyboard effect above already has — a hud that is not on screen decides nothing.
    if (dormant) return;
    if (!h.pointerLocked && h.connected && h.phase !== MatchPhase.Ended && !h.shopOpen && !h.chatOpen) {
      const timer = window.setTimeout(() => setPaused(true), 300);
      return () => window.clearTimeout(timer);
    }
    if (h.pointerLocked || h.shopOpen || h.chatOpen) setPaused(false);
  }, [dormant, h.pointerLocked, h.connected, h.phase, h.shopOpen, h.chatOpen]);

  const timeLeft = h.phaseEndsAt ? h.phaseEndsAt - h.serverNow : 0;
  // The match deadline stays fixed through every individual death and respawn.
  const matchLeft = h.bomb && h.phase === MatchPhase.Playing
    ? (h.bomb.stage === "planted" ? h.bomb.endsAt : h.bomb.roundEndsAt) - h.serverNow
    : h.matchEndsAt ? h.matchEndsAt - h.serverNow : 0;
  const lowHealth = h.alive && h.health <= 30;
  const windowSecs = h.buyWindowLeft === Infinity ? null : Math.ceil(h.buyWindowLeft / 1000);
  const shopHint = h.shopResult && !h.shopOpen && h.shopResult.reason === "closed" && now - h.shopResult.at < 1800;
  const toasts = useMemo(() => h.moneyToasts.filter((t) => t.reason !== "reset" && t.reason !== "buy"), [h.moneyToasts]);
  // Drop T: playing this pair, waiting for yours, or out — read off the bracket, not a new field.
  const myName = h.players.find((r) => r.id === h.myId)?.name ?? "";
  const tourStanding = h.bracket ? standing(h.bracket, myName) : "";
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
  // GÓRA's 1 v 1: the round number, the score, the clock; one life a round.
  const duel = h.mode === "duel";
  // Drop T: in a tournament the two sides are two people, so the bar carries their nicknames.
  const sideNames = infection ? OSTRZYZENI_SIDES : (h.bracket ? pairNames(h.bracket) : null) ?? TEAM_NAMES;
  const meShaved = !!meRow?.shaved;
  const unshavedLeft = infection ? h.players.filter((r) => r.connected && r.alive && !r.shaved).length : 0;
  const here = h.inFlag >= 0 ? h.flags[h.inFlag] : null;
  const captureText = here
    ? here.contested ? `SPORNY · ${here.id}`
      : here.capTeam === h.myTeam ? `PRZEJMUJESZ ${here.id} · ${Math.round(here.cap * 100)}%`
      : here.capTeam !== -1 ? `${TEAM_NAMES[here.capTeam as 0 | 1]} PRZEJMUJE ${here.id}`
      : here.owner === h.myTeam ? `TRZYMASZ ${here.id}` : `FLAGA WROGA ${here.id}`
    : "";
  const noticeAge = h.flagNotice ? now - h.flagNotice.at : Infinity;

  return (
    <div className={`hud ${lowHealth ? "low-health" : ""} ${dormant ? "dormant" : ""}`} data-testid="hud" aria-hidden={dormant || undefined}>
      <SmokeVeil model={model} />
      {h.bomb && (h.phase === MatchPhase.Playing || h.phase === MatchPhase.Prep) && <div className={`bomb-hud ${h.bomb.stage === "planted" ? "armed" : ""}`} data-testid="bomb-hud">
        <b>RUNDA {h.bomb.round} / 12 · {h.bomb.attackTeam === h.myTeam ? "ATAK" : "OBRONA"} · DO 7</b>
        {/* The objective ALWAYS, and while CS's buy tail runs it carries that too — the shop being
            open a few seconds into the round is no use to anybody who does not know it is, and the
            first five seconds of a round is exactly when a player needs to be told their job. */}
        <span>{h.bomb.stage === "buy" ? `${h.bomb.round === 7 ? "ZMIANA STRON · " : ""}B: SKLEP · START ZA ${Math.max(0, Math.ceil(timeLeft / 1000))}s`
          : h.phase === MatchPhase.Prep ? `${roundReasonText(h.bomb.result)} · NASTĘPNA RUNDA ZA ${Math.max(0, Math.ceil(timeLeft / 1000))}s`
          : (h.bomb.stage === "planted" ? `ŁADUNEK NA ${h.bomb.site} · ${h.bomb.attackTeam === h.myTeam ? "PILNUJ ŁADUNKU" : "PRZYTRZYMAJ T, ŻEBY ROZBROIĆ"}`
            : h.bomb.carrier === h.myId ? "MASZ ŁADUNEK · PRZYTRZYMAJ T NA A / B, ŻEBY PODŁOŻYĆ"
            : h.bomb.attackTeam !== h.myTeam ? "BROŃ PUNKTÓW A / B"
            : h.bomb.stage === "dropped" ? "ŁADUNEK UPUSZCZONY · PODEJDŹ, ŻEBY PODNIEŚĆ" : "OSŁANIAJ NIOSĄCEGO ŁADUNEK")
            + (h.alive && h.buyWindowLeft > 0 ? ` · SKLEP (B) JESZCZE ${Math.max(0, Math.ceil(h.buyWindowLeft / 1000))}s` : "")}</span>
        {h.bomb.actor && <><div className="bomb-progress"><i style={{ "--v": h.bomb.progress } as React.CSSProperties} /></div><small>{h.bomb.actor === h.myId ? "TRZYMAJ T · NIE RUSZAJ SIĘ" : h.bomb.stage === "planted" ? "ROZBRAJANIE" : "PODKŁADANIE"}</small></>}
      </div>}
      {/* Ostrzyżeni (drop D): the round, how many heads are left, and which side the clock favours. */}
      {infection && (h.phase === MatchPhase.Playing || h.phase === MatchPhase.Prep) && (
        <div className={`bomb-hud infection ${meShaved ? "shaved" : ""}`} data-testid="infection-line">
          <b>RUNDA {Math.min(OSTRZYZENI.rounds, h.round + 1)} / {OSTRZYZENI.rounds} · {unshavedLeft} NIEOSTRZYŻONYCH · {fmtTime(timeLeft)}</b>
          <span>{h.phase === MatchPhase.Prep
            ? (meShaved ? "OSTRZYSZ ICH ZA CHWILĘ — maszynka w dłoni" : `PRZYGOTOWANIE · B: SKLEP · RUNDA ZA ${Math.max(0, Math.ceil(timeLeft / 1000))}s`)
            : meShaved ? "JESTEŚ OSTRZYŻONY — goń ich z maszynką"
            : "PRZEŻYJ — nie daj się ostrzyc"}</span>
        </div>
      )}
      {/* The 1 v 1's line. Two different Preps run through here — the fifteen-second FREEZE you buy
          in, and the three-second BREAK after a round — and they used to print the same words
          ("B: SKLEP · RUNDA ZA 3s") while the shop was shut in one of them. What tells them apart
          is the buy window itself, which the HUD already knows: `buyWindowLeft`. */}
      {duel && (h.phase === MatchPhase.Playing || h.phase === MatchPhase.Prep) && (() => {
        const secs = Math.max(0, Math.ceil(timeLeft / 1000));
        const buying = h.buyWindowLeft > 0 && h.alive;
        const buySecs = h.buyWindowLeft === Infinity ? null : Math.max(0, Math.ceil(h.buyWindowLeft / 1000));
        const mine = h.myTeam === 0 ? h.scoreA : h.scoreB, theirs = h.myTeam === 0 ? h.scoreB : h.scoreA;
        const matchPoint = Math.max(mine, theirs) === DUEL.wins - 1;
        const swapping = h.round > 0 && h.round % DUEL.halfRounds === 0;
        return (
          <div className="bomb-hud duel" data-testid="duel-line">
            <b>RUNDA {h.round + 1} · {sideNames[h.myTeam]} {mine} : {theirs} · DO {DUEL.wins}{matchPoint ? (mine > theirs ? " · MECZBOL" : " · BRONISZ MECZBOLU") : ""} · {fmtTime(timeLeft)}</b>
            <span>{h.phase === MatchPhase.Prep
              ? buying
                ? `${swapping ? "ZMIANA STRON · " : ""}ZAMROŻENIE · B: SKLEP · START ZA ${secs}s`
                : `${h.roundResult ? `${roundReasonText(h.roundResult)} · ` : ""}NASTĘPNA RUNDA ZA ${secs}s`
              : buying
                // CS's buy time runs past the freeze; say so, or nobody uses it.
                ? `SKLEP OTWARTY JESZCZE ${buySecs}s · B, ŻEBY DOKUPIĆ`
                : "JEDNO ŻYCIE · po czasie wygrywa więcej zdrowia"}</span>
          </div>
        );
      })()}
      <Crosshair model={model} settings={settings} now={now} />


      {/* Top: score + timer (team modes) or me vs the leader (FFA, drop 4) */}
      {!ended && <div className="top-bar" data-mode={h.mode}>
        {teams
          ? <div className={`team-score t0 ${h.myTeam === 0 ? "mine" : ""}`}><span className="tname">{sideNames[0]}</span><span className="tscore" data-testid="score-a">{h.scoreA}</span></div>
          : gunGame
            ? <div className="ffa-score mine ladder"><span className="tname">BROŃ</span><span className="tscore" data-testid="ladder">{rungLabel(myRung)}</span>
                <span className="ladder-gun" data-testid="ladder-gun">{ladderDone(myRung) ? <b>DRABINKA ZALICZONA</b> : <><b>{rungGun}</b>{nextGun && <small>NASTĘPNA: {nextGun}</small>}</>}</span></div>
            : <div className="ffa-score mine"><span className="tname">TY</span><span className="tscore" data-testid="score-a">{myKills}</span></div>}
        <div className={`timer ${matchLeft > 0 && matchLeft <= 30000 ? "urgent" : ""}`} data-testid="timer">
          {h.phase === MatchPhase.Playing || h.phase === MatchPhase.Prep ? fmtTime(matchLeft)
            : h.phase === MatchPhase.Countdown ? `START ${Math.max(0, Math.ceil(timeLeft / 1000))}`
            : h.phase === MatchPhase.Waiting ? "ROZGRZEWKA" : "KONIEC"}
          {/* TDM's target follows the size of the room (`scoreLimitFor`), so it is printed rather
              than left to a mode blurb that would be wrong in half the rooms. */}
          {h.mode === "tdm" && <small className="timer-goal" data-testid="score-goal">DO {scoreLimitFor("tdm", h.players.length)}</small>}
        </div>
        {teams
          ? <div className={`team-score t1 ${h.myTeam === 1 ? "mine" : ""}`}><span className="tscore" data-testid="score-b">{h.scoreB}</span><span className="tname">{sideNames[1]}</span></div>
          : gunGame
            ? <div className={`ffa-score ${ladderLeading ? "" : "lead"}`}><span className="tscore" data-testid="score-b">{leader ? rungLabel(leaderRung) : "–"}</span><span className="tname">{leader?.name ?? "NIKT"}</span></div>
            : <div className={`ffa-score ${leading ? "" : "lead"}`}><span className="tscore" data-testid="score-b">{leader?.kills ?? 0}</span><span className="tname">{leader?.name ?? "NIKT"}</span></div>}
      </div>}
      {/* Domination (drop 4): A / B / C with owner colour, capture bar, contested pulse */}
      {(h.mode === "dom" || h.mode === "boys") && h.flags.length > 0 && (
        <div className="flags" data-testid="flags">
          {h.flags.map((f, i) => (
            <div key={f.id} className={`flag own${f.owner} cap${f.capTeam} ${f.contested ? "contested" : ""} ${h.inFlag === i ? "here" : ""}`} title={f.name} data-testid={`flag-${f.id}`} data-owner={f.owner}>
              {f.id}
              {f.capTeam !== -1 && <span className="flag-cap" style={{ "--v": f.cap } as React.CSSProperties} />}
            </div>
          ))}
        </div>
      )}
      {h.flagNotice && noticeAge < 2600 && !ended && (
        <div className={`flag-notice t${h.flagNotice.team}`} data-testid="flag-notice" style={{ opacity: Math.min(1, (2600 - noticeAge) / 500) }}>{h.flagNotice.text}</div>
      )}
      {h.alive && here && (
        <div className={`capture ${here.contested ? "contested" : ""} ${here.capTeam !== -1 && here.capTeam !== h.myTeam ? "enemy" : ""}`} data-testid="capture">
          {captureText}
          {here.capTeam !== -1 && !here.contested && <div className="capture-bar"><div className="capture-fill" style={{ "--v": here.cap } as React.CSSProperties} /></div>}
        </div>
      )}

      {/* Minimap + compass (drop 5): hidden behind the scope and the result screen */}
      {/* The tube takes your surroundings away with it; the M-1's ring is the weapon that does NOT,
          which is most of what separates the two long rifles in play. */}
      {h.connected && h.scopeStyle !== "tube" && h.phase !== MatchPhase.Ended && <Minimap radar={radar} />}
      {/* Chat (drop 5) */}
      {h.connected && <Chat lines={h.chat} open={h.chatOpen} teams={teams} myId={h.myId} api={chat} />}

      <KillFeed model={model} />

      <Vitals model={model} now={now} />

      {/* Wallet + buy prompt (drop 2) */}
      {h.connected && !noShop && !ended && (
        <div className="wallet" data-testid="wallet">
          {h.mode === "boys" && <div className="wallet-role">{boysClass(h.boysClass).name} · B: rola / sklep{h.nextClass !== h.boysClass ? ` · następna: ${boysClass(h.nextClass).name}` : ""}</div>}
          <div className={`wallet-money ${h.money >= 8000 ? "rich" : ""}`} data-testid="money">{money(h.money)}</div>
          {h.alive && !h.shopOpen && h.buyWindowLeft > 0 && (
            <div className={`wallet-prompt ${h.nearStation ? "station" : ""} ${windowSecs !== null && windowSecs <= 5 ? "urgent" : ""}`} data-testid="buy-prompt">
              <kbd>B</kbd><span>SKLEP</span><strong data-testid="buy-countdown">{windowSecs !== null ? `${windowSecs}s` : "OTWARTY"}</strong>
            </div>
          )}
        </div>
      )}
      <div className="money-toasts" aria-live="polite">
        {!ended && toasts.map((t) => (
          <div key={t.key} className={`money-toast ${t.delta < 0 ? "neg" : ""}`}>{t.delta > 0 ? "+" : ""}{money(t.delta)}<span className="why">{REASON_SHORT[t.reason] ?? t.reason.toUpperCase()}</span></div>
        ))}
      </div>
      {shopHint && !ended && <div className="shop-closed-hint" data-testid="shop-closed">{noShop ? `W TRYBIE ${MODES[h.mode].name} NIE MA SKLEPU · BROŃ DAJĄ ZABÓJSTWA` : "SKLEP ZAMKNIĘTY · PODEJDŹ DO LADY $"}</div>}

      <Inventory model={model} />

      {h.reconnecting && <div className="reconnect" data-testid="reconnecting">UTRACONO POŁĄCZENIE · ŁĄCZĘ PONOWNIE…</div>}

      {/* Countdown */}
      {h.phase === MatchPhase.Countdown && (
        <div className="center-msg countdown" data-testid="countdown">{Math.max(1, Math.ceil(timeLeft / 1000))}</div>
      )}
      {/* The mode's goal in one sentence, while there is nothing else to read: the warm-up and the
          countdown. Once the match runs, the mode's own line (bomb, rounds, flags) takes over. */}
      {(h.phase === MatchPhase.Waiting || h.phase === MatchPhase.Countdown) && h.connected && (
        <div className="center-sub objective" data-testid="objective">
          {h.phase === MatchPhase.Waiting && <b>ROZGRZEWKA · czekamy na graczy (potrzeba {MATCH.minPlayers})</b>}
          <span>{MODES[h.mode].objective}</span>
        </div>
      )}

      <FlashVeil model={model} now={now} />

      {/* Death screen */}
      {!h.alive && h.connected && h.phase !== MatchPhase.Ended && (
        <div className="death" data-testid="death">
          <div className="death-title">{h.killerName ? <>WYELIMINOWAŁ CIĘ <b>{h.killerName}</b></> : "WYELIMINOWANY"}</div>
          {h.killerWeapon && h.killerName && <div className="death-weapon">{killerName(h.killerWeapon)}</div>}
          <div className="death-respawn">
            {/* A tournament leaves most of the room dead for minutes at a time, and counting down a
                respawn that is never coming is the one thing the card must not do. */}
            {tourStanding === "waiting" ? "CZEKASZ NA SWOJĄ PARĘ"
              : tourStanding === "out" ? "ODPADŁEŚ · OGLĄDASZ DO KOŃCA"
              : (h.mode === "bomb" || h.mode === "duel" || h.mode === "turniej") && (h.phase === MatchPhase.Playing || h.phase === MatchPhase.Prep) ? "WRACASZ W NASTĘPNEJ RUNDZIE"
              : `ODRODZENIE ZA ${Math.max(0, Math.ceil((h.respawnAt - now) / 1000))}`}
          </div>
        </div>
      )}

      {/* Between rounds: who took it and why, from the round's real signals */}
      {inBreak && !h.shopOpen && <RoundBreak h={h} />}

      {/* Drop T: the tournament's bracket. Full size between pairs — the one moment anybody has
          time to read it — and one line in the corner while a pair is on, so you always know which
          round of the draw you are in. On the result screen it is a TAB of the result card rather
          than a card over it: floating, it covered the word PORAŻKA. */}
      {h.bracket !== "" && !h.shopOpen && !ended && (
        h.phase === MatchPhase.Prep
          ? <div className="bracket-card" data-testid="bracket-card"><h3>DRABINKA</h3><BracketPanel bracket={h.bracket} /></div>
          : <div className="bracket-strip" data-testid="bracket-strip">{bracketLine(h.bracket)}</div>
      )}

      {/* Match end */}
      {ended && <MatchResult h={h} now={now} onLeave={onLeave} />}

      {/* Scoreboard (Tab) */}
      {scoreboard && h.phase !== MatchPhase.Ended && (
        <div className="scoreboard-wrap" data-testid="scoreboard"><Scoreboard rows={h.players} myId={h.myId} mode={h.mode} /></div>
      )}

      {/* First-run hints: one short line, once each, never blocking (2.4) */}
      {/* NOT while dormant: a hint is shown once ever and then remembered, so letting the timer
          run behind an invisible HUD would burn them all before the player saw one. */}
      {!paused && !dormant && !ended && <Hints h={h} />}

      {/* Living arena: the round's plan vote, or what is in force (2.4) */}
      {!h.shopOpen && !ended && <PlanPanel h={h} onVote={onVotePlan} />}

      {/* Buy menu (B) */}
      {h.shopOpen && h.phase !== MatchPhase.Ended && <Shop h={h} api={shop} now={now} />}

      {/* Pause / settings */}
      {paused && h.phase !== MatchPhase.Ended && (
        <div className="pause" data-testid="pause">
          <div className="pause-card">
            <div className="wordmark small">BARBERSTRIKE</div>
            <p className="pause-hint">Pauza · <kbd>ESC</kbd> albo WRÓĆ DO GRY, żeby grać dalej</p>
            <p className="pause-objective" data-testid="pause-objective"><b>{MODES[h.mode].name}</b> · {MODES[h.mode].objective}</p>
            {lockRefused && (
              <p className="pause-warn" data-testid="pause-lock-refused">
                Przeglądarka nie oddała myszy. Kliknij <strong>WRÓĆ DO GRY</strong> jeszcze raz —
                odmowa tuż po wciśnięciu Escape jest normalna i mija po sekundzie.
              </p>
            )}
            <button className="menu-btn primary" onClick={() => void resume()} data-testid="btn-resume">WRÓĆ DO GRY</button>
            <button className="menu-btn" onClick={() => void onFullscreen().then(setFullscreen)} data-testid="btn-fullscreen">
              {fullscreen ? "WYJDŹ Z PEŁNEGO EKRANU" : "PEŁNY EKRAN"}
            </button>
            <button className="menu-btn" onClick={() => setPauseSettings((v) => !v)} data-testid="btn-pause-settings">{pauseSettings ? "UKRYJ USTAWIENIA" : "USTAWIENIA"}</button>
            {!pauseSettings && <TeamPicker h={h} onChoose={onChooseTeam} />}
            {pauseSettings && <SettingsPanel settings={settings} onChange={onSettings} />}
            <button className="menu-btn" onClick={onLeave} data-testid="btn-leave">OPUŚĆ MECZ</button>
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

