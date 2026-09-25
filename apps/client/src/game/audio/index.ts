/**
 * Audio module: gunshots, reloads, footsteps, impacts, UI, ambience with positional audio.
 * All sounds are procedurally synthesised at runtime (no audio assets — see ASSET_LICENSES.md).
 *
 * Exports for the UI layer:
 *   uiSound(kind)          — menu hover/click/back/open/close/error
 *   setMusic(on)           — sparse menu/result music (off during gameplay)
 *   setAudioSettings(a)    — apply volume settings before a game exists (in-game the
 *                            `settings` event does it)
 *   primeAudio()           — optional explicit resume from a button handler
 */
import { WEAPONS, MatchPhase, isPerkId, parseBracket, type GameMode, type Team, type WeaponId } from "@frankibarber/shared";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { GameContext, GameModule } from "../context";
import { loadSettings, type Settings } from "../../settings";
import { AudioEngine, Priority } from "./engine";
import { feelOf } from "../combat/weaponFeel";
import { reloadCues } from "../combat/reloadTimeline";
import { Ambience } from "./ambience";
import { Music } from "./music";
import { RemoteAudio } from "./remotes";
import { runSelfTest, type SelfTestReport } from "./selftest";
import { beepTimes, bombBeepInterval } from "./beeps";
import { hud, type HudState } from "../store";
import * as sfx from "./sfx";
import type { UiSoundKind } from "./sfx";

export type { UiSoundKind } from "./sfx";

let engine: AudioEngine | null = null;
let music: Music | null = null;
let liveCtx: GameContext | null = null;

function getEngine(): AudioEngine {
  if (!engine) engine = new AudioEngine(loadSettings().audio);
  return engine;
}

function getMusic(): Music {
  if (!music) music = new Music(getEngine());
  return music;
}

/** Plays a UI sound (menus, HUD). Safe before the game starts and when autoplay is blocked. */
export function uiSound(kind: UiSoundKind): void {
  try { getEngine().play(sfx.ui(kind), { bus: "ui", priority: Priority.ui }); } catch { /* never break the UI */ }
}

/** Menu / result-screen music. The module turns it off on match start and on for the result screen. */
export function setMusic(on: boolean): void {
  try { getMusic().set(on); } catch { /* ignore */ }
}

export function setAudioSettings(audio: Settings["audio"]): void {
  try { getEngine().setSettings(audio); } catch { /* ignore */ }
}

/** Try to unlock the context from a user-gesture handler (menus can call this on Play). */
export function primeAudio(): void {
  try { getEngine().resume(); } catch { /* ignore */ }
}

const fwd = new Vector3();
const up = new Vector3();

/** The modes played in rounds (`ui/hud/phase.ts` `isRoundMode`): they end on a final round (stage A). */
const ROUND_MODES: ReadonlySet<GameMode> = new Set<GameMode>(["bomb", "duel", "turniej", "ostrzyzeni"]);
/** §6.1: the round banner comes in 250 ms into the break, and the match's end holds stage A for 3 s. */
const ROUND_END_DELAY_MS = 250;
const STAGE_A_MS = 3000;

/**
 * Turniej: am I one of the pair on the board? Everyone else is watching it, and a watcher's round
 * has no verdict. (The Prep event lands before the 10 Hz state moves the bracket on.)
 */
function inPairOnBoard(h: HudState): boolean {
  const view = parseBracket(h.bracket);
  const pair = view?.matches[view.at];
  const me = h.players.find((p) => p.id === h.myId)?.name;
  return !!pair && !!me && (pair.a === me || pair.b === me);
}

export const installAudio: GameModule = (ctx) => {
  const eng = getEngine();
  eng.setSettings(ctx.settings.audio);
  liveCtx = ctx;
  const ambience = new Ambience(eng);
  const remotes = new RemoteAudio(ctx, eng);
  const ev = ctx.events;
  const unsubs: (() => void)[] = [];
  const on = <K extends keyof import("../events").GameEventMap>(k: K, h: (p: import("../events").GameEventMap[K]) => void) => unsubs.push(ev.on(k, h));
  const play = (fn: sfx.SoundFn, priority: number, gain = 1) => eng.play(fn, { priority: priority as 0 | 1 | 2 | 3 | 4, gain });
  const at = (x: number, y: number, z: number) => ({ x, y, z });

  setMusic(false); // gameplay: ambience only
  let reloadVoice: { stop(): void } | null = null;
  /**
   * Rule M1: the clippers hum while they are equipped. The engine plays one-shots, so the loop is a
   * two-second voice re-triggered just before it ends — `clippersHum` fades in and out, so the seam
   * is inaudible and the engine needs no new concept of a looping source. It stops on death, on
   * switching away, and on teardown; it is re-armed on spawn, because `weaponEquip` only fires when
   * the weapon id CHANGES and respawning still holding the clippers would otherwise be silent.
   */
  let humVoice: { stop(): void } | null = null;
  let humTimer = 0;
  const HUM_S = 2;
  /**
   * The voice being crossfaded OUT. Two references, because the hum is one-shots overlapped: the new
   * voice starts while the old one is still fading (`HUM_FADE_S`), and `stopHum` used to stop only
   * the newest — leaving the previous one to finish its fade out loud after the clippers were gone.
   */
  let humPrev: { stop(): void } | null = null;
  const stopHum = (): void => {
    window.clearInterval(humTimer); humTimer = 0;
    humVoice?.stop(); humVoice = null;
    humPrev?.stop(); humPrev = null;
  };
  const setHum = (weapon: WeaponId): void => {
    const level = feelOf(weapon).hum;
    stopHum();
    if (level <= 0) return;
    const tick = (): void => {
      humPrev = humVoice;
      humVoice = play(sfx.clippersHum(HUM_S), Priority.movement, level);
    };
    tick();
    // Re-triggered exactly one fade before the end, so the new voice's attack rises into the old
    // one's decay. The two numbers are one decision: `sfx.HUM_FADE_S` is where it is written down.
    humTimer = window.setInterval(tick, (HUM_S - sfx.HUM_FADE_S) * 1000);
  };
  let countdownTimers: number[] = [];
  const clearCountdown = () => { for (const t of countdownTimers) window.clearTimeout(t); countdownTimers = []; };

  on("localShot", (e) => {
    play(WEAPONS[e.weapon].kind === "melee" ? sfx.meleeSwing(false) : sfx.gunshot(e.weapon), Priority.gunshot, 0.9);
    // Drop B, axis 2: the machine the shooter works between shots. Quieter than the report and
    // priced as a reload, so a burst never spends gunshot voices on lockwork.
    const action = feelOf(e.weapon).actionMs;
    if (action > 0) play(sfx.weaponAction(e.weapon, action), Priority.reload, 0.5);
  });
  on("remoteShot", (e) => {
    if (WEAPONS[e.event.weapon].kind === "melee") eng.play(sfx.meleeSwing(e.event.k.length > 0), { priority: Priority.movement, gain: 0.7, position: at(e.event.o[0], e.event.o[1], e.event.o[2]), maxDistance: 18 });
    else remotes.shot(e.player, e.event.weapon, e.event.o);
  });
  on("dryFire", () => play(sfx.dryFire, Priority.reload, 0.8));
  // The cues are read off the same choreography the hands follow (`reloadCues`), for THIS reload:
  // a two-shell top-up sounds like two shells, a tactical reload has no charging handle in it.
  on("reloadStart", (e) => { reloadVoice?.stop(); reloadVoice = play(sfx.reload(e.weapon, WEAPONS[e.weapon].reloadMs, reloadCues(e.weapon, e.shells, e.empty)), Priority.reload, 0.85); });
  on("reloadEnd", () => { reloadVoice = null; });
  on("weaponEquip", (e) => { reloadVoice?.stop(); reloadVoice = null; play(sfx.equip(WEAPONS[e.weapon].equipMs), Priority.reload, 0.7); setHum(e.weapon); });
  on("footstep", (e) => play(sfx.footstep(e.sprint, e.crouch), Priority.movement, 0.55));
  on("jump", () => play(sfx.jump, Priority.movement, 0.7));
  on("slide", () => play(sfx.slide(), Priority.movement, 0.7));
  on("landed", (e) => { if (e.impactSpeed > 1.5) play(sfx.landing(e.impactSpeed), Priority.movement, 0.8); });
  on("localHit", (e) => { play(sfx.hitConfirm(e.kill ? "kill" : e.headshot ? "head" : "body"), Priority.hit, 0.9); if (e.armor && !e.kill) play(sfx.plate(false), Priority.hit, 0.35); });
  on("localDamaged", (e) => {
    play(sfx.damageTaken, Priority.hit, 0.9); eng.duck(Math.min(1, 0.5 + e.amount / 60), 150);
    if (e.broke) play(sfx.plate(true), Priority.hit, 0.9); else if ((e.armor ?? 0) > 0) play(sfx.plate(false), Priority.hit, 0.6);
  });
  on("localDeath", () => { reloadVoice?.stop(); reloadVoice = null; stopHum(); play(sfx.death, Priority.hit, 1); eng.duck(1, 600); });
  on("localSpawn", () => { play(sfx.respawn, Priority.hit, 0.8); setHum(ctx.weapons.weapon); });
  on("kill", () => play(sfx.ui("hover"), Priority.ui, 0.5)); // kill feed tick (local kills already get the confirm)
  on("remoteLeave", (e) => remotes.forget(e.id));
  on("settings", () => eng.setSettings(ctx.settings.audio));

  // ---- drop 2: grenades and the shop. World sounds are positional; the listener is the camera.
  const dist = (x: number, y: number, z: number) => { const p = cam.globalPosition; return Math.hypot(p.x - x, p.y - y, p.z - z); };
  on("grenadePrime", () => play(sfx.pinPull, Priority.reload, 0.8));
  on("grenadeThrow", () => play(sfx.throwSwish, Priority.reload, 0.8));
  on("throw", (e) => { if (e.owner !== ctx.connection.sessionId) eng.play(sfx.throwSwish, { priority: Priority.movement, gain: 0.6, position: at(e.o[0], e.o[1], e.o[2]), maxDistance: 14 }); });
  /**
   * Rule G1: a grenade knocking off the world. `sfx.bounce` has been written since drop 2 and had
   * no caller — a frag skittering past your feet or off the wall behind you made no sound at all,
   * which is the single loudest cue a player has for "that one is landing near me".
   *
   * Two limits, at the two places they belong. The view swallows knocks less than 120 ms apart on
   * ONE grenade (a grenade settling rattles several times in a tenth of a second); this caps how
   * many DIFFERENT grenades may be voiced on one frame, because a wave of four frags landing
   * together is four metal knocks in the same millisecond, which reads as a glitch rather than a
   * grenade. The rest of the frame's bounces are dropped, not queued: a late knock is a lie about
   * where the grenade is.
   */
  let bouncesThisFrame = 0;
  const BOUNCES_PER_FRAME = 2;
  on("grenadeBounce", (e) => {
    if (bouncesThisFrame >= BOUNCES_PER_FRAME) return;
    bouncesThisFrame++;
    eng.play(sfx.bounce(e.kind, e.speed), { priority: Priority.movement, gain: Math.min(0.9, 0.3 + e.speed / 20), position: at(e.x, e.y, e.z), maxDistance: 24 });
  });
  on("boom", (e) => {
    const d = dist(e.x, e.y, e.z);
    switch (e.kind) {
      case "frag":
      case "shell":
        // Non-positional so a close blast is full and centred; the distance shapes the sound instead.
        play(sfx.explosion(d), Priority.gunshot, Math.max(0.25, 1 - d / 60) * (e.kind === "shell" ? 0.8 : 1));
        if (d < 12) eng.duck(Math.min(1, 1 - d / 14), 350);
        break;
      case "flash": eng.play(sfx.flashBang(0), { priority: Priority.gunshot, gain: 0.9, position: at(e.x, e.y, e.z), rolloff: 0.6, maxDistance: 70 }); break;
      // The hiss runs for as long as the cloud stands. It used to be capped at six seconds against
      // a twelve-second cloud, so a smoke went quiet half way through and the second half looked
      // like a cloud nobody had thrown. Four clouds is the hard maximum (`MAX_SMOKE_CLOUDS`) and
      // they are movement-priority, so at worst four of twenty-four voices are held — and a
      // gunshot takes one straight back.
      case "smoke": eng.play(sfx.smokeHiss(e.effectMs / 1000), { priority: Priority.movement, gain: 0.7, position: at(e.x, e.y, e.z), maxDistance: 30 }); break;
      case "molotov":
        eng.play(sfx.molotovBreak, { priority: Priority.hit, gain: 0.9, position: at(e.x, e.y, e.z), maxDistance: 50 });
        eng.play(sfx.fireCrackle(e.effectMs / 1000), { priority: Priority.movement, gain: 0.7, position: at(e.x, e.y, e.z), maxDistance: 26 });
        break;
      case "knife": eng.play(sfx.knifeHit(e.effectMs === 0), { priority: Priority.hit, gain: 0.8, position: at(e.x, e.y, e.z), maxDistance: 30 }); break;
    }
  });
  // Rule G5: the ring WITHOUT the crack. The crack already played, positioned, from `boom` a
  // moment earlier — this event says the grenade caught US, not that a second one went off.
  on("flashed", (e) => { play(sfx.flashBang(e.strength, false), Priority.gunshot, 1); eng.duck(Math.min(1, 0.4 + e.strength * 0.6), e.ms * 0.5); });
  on("money", (e) => { if (e.reason === "kill" || e.reason === "headshot" || e.reason === "assist") play(sfx.cash("sell"), Priority.ui, 0.5); });
  on("shop", (e) => {
    play(sfx.cash(e.ok ? "buy" : "deny"), Priority.ui, 0.8);
    // A perk is consumed on the spot: the gulp / lighter / can / clippers follow the register.
    if (e.ok && isPerkId(e.item)) countdownTimers.push(window.setTimeout(() => play(sfx.perkUse(e.item as "flask" | "roids" | "energy" | "fade"), Priority.reload, 0.8), 250));
  });
  on("shopOpen", (e) => play(sfx.ui(e.open ? "open" : "close"), Priority.ui, 0.7));
  // ---- drop 4: a flag changing hands (ours pays a coin), the tactical sprint kicking in.
  on("flag", (e) => {
    play(sfx.ui("open"), Priority.ui, 0.8);
    const me = ctx.connection.me();
    if (me && e.team === me.team) play(sfx.cash("sell"), Priority.ui, 0.45);
  });
  on("tacSprint", (e) => { if (e.on) play(sfx.ui("hover"), Priority.movement, 0.45); });
  // ---- drop 5: chat tick, mark blip (a spot is sharper).
  on("chat", (e) => { if (e.id !== ctx.connection.sessionId) play(sfx.ui("hover"), Priority.ui, 0.6); });
  on("mark", (e) => play(sfx.ui(e.kind === "spot" ? "open" : "hover"), Priority.ui, 0.7));
  // ---- drop U (P5): the match's beeps, each round's verdict and the planted bomb (§6.1, §6.4).
  /**
   * The phase the last match event opened; at install, the phase the room is already in (its
   * replicated state — the HUD store is synced later, on the frame loop), so the first event of a
   * player who joined mid-round is judged against the round they joined, not against the warm-up.
   */
  let prevPhase: MatchPhase | null = ctx.connection.state?.phase ?? null;
  const beep = (at: number, final: boolean) =>
    countdownTimers.push(window.setTimeout(() => play(sfx.countdownBeep(final), Priority.ui, 0.7), Math.max(0, at - ctx.serverNow())));
  /** The round's verdict as the round banner comes in: won or lost — nothing for a trade, or for a pair I only watch. */
  const verdict = (winner: Team | -1): void => {
    const h = hud.get();
    if (winner === -1 || (h.mode === "turniej" && !inPairOnBoard(h))) return;
    countdownTimers.push(window.setTimeout(() => play(sfx.roundStinger(winner === h.myTeam), Priority.ui, 0.8), ROUND_END_DELAY_MS));
  };
  on("matchPhase", (m) => {
    clearCountdown();
    // The beeps count down to the phase's own deadline — the countdown's and a freeze's, never a
    // break's (`beeps.ts`). They used to be `MATCH.prepMs − i·1000` after every Prep: 11 s early.
    const endsAt = typeof m.endsAt === "number" ? m.endsAt : hud.get().phaseEndsAt;
    for (const b of beepTimes(m.phase, prevPhase, endsAt, ctx.serverNow())) beep(b.at, b.final);
    switch (m.phase) {
      case MatchPhase.Countdown: setMusic(false); break;
      case MatchPhase.Prep: {
        // The Prep after Playing is the round's end (the one after a break is the next freeze).
        if (prevPhase === MatchPhase.Playing) verdict(m.winner);
        setMusic(false);
        break;
      }
      // Every release, not just the match start: the cue that the freeze is over — at the release.
      case MatchPhase.Playing: play(sfx.stinger("start"), Priority.ui, 0.9); setMusic(false); break;
      case MatchPhase.Ended: {
        // A round mode ends on its deciding round: its verdict under the final-round banner (stage A),
        // then the match's stinger with the verdict screen (stage B, 3 s on). Elsewhere stage B is now.
        if (ROUND_MODES.has(hud.get().mode) && prevPhase === MatchPhase.Playing) {
          verdict(m.winner);
          countdownTimers.push(window.setTimeout(() => play(sfx.stinger("end"), Priority.ui, 0.9), STAGE_A_MS));
        } else play(sfx.stinger("end"), Priority.ui, 0.9);
        setMusic(true);
        break;
      }
      case MatchPhase.Waiting: setMusic(false); break;
    }
    prevPhase = m.phase;
  });
  // The planted bomb beeps where it lies, 1000 ms apart at the plant and 150 ms at the end
  // (`bombBeepInterval`). The fuse is read from the store, so a defuse or the round's end stops it.
  let bombTimer = 0;
  let bombFuse = 0;
  const bombTick = (): void => {
    bombTimer = 0;
    const b = hud.get().bomb;
    if (!b || b.stage !== "planted" || b.endsAt !== bombFuse) return;
    const left = b.endsAt - ctx.serverNow();
    if (left <= 0) return;
    eng.play(sfx.bombBeep, { priority: Priority.ui, gain: 0.7, position: at(b.x, b.y + 0.2, b.z), maxDistance: 70 });
    bombTimer = window.setTimeout(bombTick, bombBeepInterval(left));
  };
  const stopBomb = (): void => { window.clearTimeout(bombTimer); bombTimer = 0; bombFuse = 0; };
  unsubs.push(hud.subscribe(() => {
    const b = hud.get().bomb;
    const fuse = b && b.stage === "planted" ? b.endsAt : 0;
    if (fuse === bombFuse) return;
    stopBomb();
    if (fuse > 0) { bombFuse = fuse; bombTick(); }
  }));
  unsubs.push(stopBomb);

  const cam = ctx.camera;
  unsubs.push(ctx.onFrame((dtMs) => {
    bouncesThisFrame = 0;
    // Listener = camera. TargetCamera direction helpers are allocation-free with *ToRef.
    cam.getDirectionToRef(Vector3.Forward(), fwd);
    cam.getDirectionToRef(Vector3.Up(), up);
    const p = cam.globalPosition;
    eng.updateListener(p.x, p.y, p.z, fwd.x, fwd.y, fwd.z, up.x, up.y, up.z);
    const b = ctx.local.body;
    ambience.update(b.x, b.y, b.z);
    remotes.update(dtMs);
  }));

  // Harness hook for the audio self-test (see selftest.ts / tools/selftest.mjs).
  (window as unknown as { __fbAudio?: unknown }).__fbAudio = {
    engine: eng,
    selfTest: (): Promise<SelfTestReport> => runSelfTest(eng, liveCtx, { uiSound, setMusic }),
  };

  return () => {
    for (const u of unsubs) u();
    clearCountdown();
    reloadVoice?.stop();
    stopHum();
    ambience.dispose();
    liveCtx = null;
    delete (window as unknown as { __fbAudio?: unknown }).__fbAudio;
    // The engine itself outlives the game (menus keep using uiSound/music).
  };
};
