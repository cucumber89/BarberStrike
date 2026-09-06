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
import { MATCH, WEAPONS, MatchPhase, isPerkId } from "@frankibarber/shared";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { GameContext, GameModule } from "../context";
import { loadSettings, type Settings } from "../../settings";
import { AudioEngine, Priority } from "./engine";
import { Ambience } from "./ambience";
import { Music } from "./music";
import { RemoteAudio } from "./remotes";
import { runSelfTest, type SelfTestReport } from "./selftest";
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
  let countdownTimers: number[] = [];
  const clearCountdown = () => { for (const t of countdownTimers) window.clearTimeout(t); countdownTimers = []; };

  on("localShot", (e) => play(WEAPONS[e.weapon].kind === "melee" ? sfx.meleeSwing(false) : sfx.gunshot(e.weapon), Priority.gunshot, 0.9));
  on("remoteShot", (e) => {
    if (WEAPONS[e.event.weapon].kind === "melee") eng.play(sfx.meleeSwing(e.event.k.length > 0), { priority: Priority.movement, gain: 0.7, position: at(e.event.o[0], e.event.o[1], e.event.o[2]), maxDistance: 18 });
    else remotes.shot(e.player, e.event.weapon, e.event.o);
  });
  on("dryFire", () => play(sfx.dryFire, Priority.reload, 0.8));
  on("reloadStart", (e) => { reloadVoice?.stop(); reloadVoice = play(sfx.reload(e.weapon, WEAPONS[e.weapon].reloadMs), Priority.reload, 0.85); });
  on("reloadEnd", () => { reloadVoice = null; });
  on("weaponEquip", (e) => { reloadVoice?.stop(); reloadVoice = null; play(sfx.equip(WEAPONS[e.weapon].equipMs), Priority.reload, 0.7); });
  on("footstep", (e) => play(sfx.footstep(e.sprint, e.crouch), Priority.movement, 0.55));
  on("jump", () => play(sfx.jump, Priority.movement, 0.7));
  on("slide", () => play(sfx.slide(), Priority.movement, 0.7));
  on("landed", (e) => { if (e.impactSpeed > 1.5) play(sfx.landing(e.impactSpeed), Priority.movement, 0.8); });
  on("localHit", (e) => { play(sfx.hitConfirm(e.kill ? "kill" : e.headshot ? "head" : "body"), Priority.hit, 0.9); if (e.armor && !e.kill) play(sfx.plate(false), Priority.hit, 0.35); });
  on("localDamaged", (e) => {
    play(sfx.damageTaken, Priority.hit, 0.9); eng.duck(Math.min(1, 0.5 + e.amount / 60), 150);
    if (e.broke) play(sfx.plate(true), Priority.hit, 0.9); else if ((e.armor ?? 0) > 0) play(sfx.plate(false), Priority.hit, 0.6);
  });
  on("localDeath", () => { reloadVoice?.stop(); reloadVoice = null; play(sfx.death, Priority.hit, 1); eng.duck(1, 600); });
  on("localSpawn", () => play(sfx.respawn, Priority.hit, 0.8));
  on("kill", () => play(sfx.ui("hover"), Priority.ui, 0.5)); // kill feed tick (local kills already get the confirm)
  on("remoteLeave", (e) => remotes.forget(e.id));
  on("settings", () => eng.setSettings(ctx.settings.audio));

  // ---- drop 2: grenades and the shop. World sounds are positional; the listener is the camera.
  const dist = (x: number, y: number, z: number) => { const p = cam.globalPosition; return Math.hypot(p.x - x, p.y - y, p.z - z); };
  on("grenadePrime", () => play(sfx.pinPull, Priority.reload, 0.8));
  on("grenadeThrow", () => play(sfx.throwSwish, Priority.reload, 0.8));
  on("throw", (e) => { if (e.owner !== ctx.connection.sessionId) eng.play(sfx.throwSwish, { priority: Priority.movement, gain: 0.6, position: at(e.o[0], e.o[1], e.o[2]), maxDistance: 14 }); });
  on("boom", (e) => {
    const d = dist(e.x, e.y, e.z);
    switch (e.kind) {
      case "c4":
        // The charge: heard everywhere, felt up close. Non-positional like the frag, shaped by distance.
        play(sfx.c4Blast(d), Priority.gunshot, Math.max(0.45, 1 - d / 140));
        eng.duck(Math.min(1, Math.max(0.3, 1 - d / 45)), 900);
        break;
      case "frag":
      case "shell":
        // Non-positional so a close blast is full and centred; the distance shapes the sound instead.
        play(sfx.explosion(d), Priority.gunshot, Math.max(0.25, 1 - d / 60) * (e.kind === "shell" ? 0.8 : 1));
        if (d < 12) eng.duck(Math.min(1, 1 - d / 14), 350);
        break;
      case "flash": eng.play(sfx.flashBang(0), { priority: Priority.gunshot, gain: 0.9, position: at(e.x, e.y, e.z), rolloff: 0.6, maxDistance: 70 }); break;
      case "smoke": eng.play(sfx.smokeHiss(Math.min(6, e.effectMs / 1000)), { priority: Priority.movement, gain: 0.7, position: at(e.x, e.y, e.z), maxDistance: 30 }); break;
      case "molotov":
        eng.play(sfx.molotovBreak, { priority: Priority.hit, gain: 0.9, position: at(e.x, e.y, e.z), maxDistance: 50 });
        eng.play(sfx.fireCrackle(e.effectMs / 1000), { priority: Priority.movement, gain: 0.7, position: at(e.x, e.y, e.z), maxDistance: 26 });
        break;
      case "knife": eng.play(sfx.knifeHit(e.effectMs === 0), { priority: Priority.hit, gain: 0.8, position: at(e.x, e.y, e.z), maxDistance: 30 }); break;
    }
  });
  // Bomb Plant (2.3): the charge beeps from where it lies, faster as the fuse runs down; the plant
  // and the defuse are announced to everyone, like the classic voice lines.
  on("bombBeep", (e) => eng.play(sfx.bombBeep(e.urgency), { priority: Priority.hit, gain: 0.85, position: at(e.x, e.y + 0.3, e.z), rolloff: 0.45, maxDistance: 110 }));
  on("bombPlanted", () => play(sfx.bombPlanted, Priority.hit, 0.8));
  on("bombDefused", () => play(sfx.bombDefused, Priority.hit, 0.8));
  on("flashed", (e) => { play(sfx.flashBang(e.strength), Priority.gunshot, 1); eng.duck(Math.min(1, 0.4 + e.strength * 0.6), e.ms * 0.5); });
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
  on("matchPhase", (m) => {
    clearCountdown();
    switch (m.phase) {
      case MatchPhase.Countdown: {
        // Server countdown is 4 s: three soft beeps, the start stinger arrives with `Playing`.
        for (let i = 1; i <= 3; i++) countdownTimers.push(window.setTimeout(() => play(sfx.countdownBeep(i === 3), Priority.ui, 0.7), i * 1000));
        setMusic(false);
        break;
      }
      case MatchPhase.Prep: {
        // The last three seconds of the preparation window, so the release is never a surprise.
        // Derived from MATCH.prepMs rather than written out, because that constant is meant to be
        // tuned by playing and a hard-coded 3/2/1 would drift away from it silently.
        for (let i = 3; i >= 1; i--) {
          const at = MATCH.prepMs - i * 1000;
          if (at > 0) countdownTimers.push(window.setTimeout(() => play(sfx.countdownBeep(i === 1), Priority.ui, 0.7), at));
        }
        setMusic(false);
        break;
      }
      // Also every wave release, not just the match start: it is the cue that the freeze is over.
      case MatchPhase.Playing: play(sfx.stinger("start"), Priority.ui, 0.9); setMusic(false); break;
      case MatchPhase.Ended: play(sfx.stinger("end"), Priority.ui, 0.9); setMusic(true); break;
      case MatchPhase.Waiting: setMusic(false); break;
    }
  });

  const cam = ctx.camera;
  unsubs.push(ctx.onFrame((dtMs) => {
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
    ambience.dispose();
    liveCtx = null;
    delete (window as unknown as { __fbAudio?: unknown }).__fbAudio;
    // The engine itself outlives the game (menus keep using uiSound/music).
  };
};
