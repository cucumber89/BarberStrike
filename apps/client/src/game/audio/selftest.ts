/**
 * In-page audio harness (exposed as `window.__fbAudio.selfTest()`).
 *  1. Renders every one-shot through an OfflineAudioContext and asserts its peak is neither
 *     silent (< -40 dBFS) nor clipping (> -1 dBFS) — catches broken envelopes.
 *  2. Fires every game event the module listens to and every exported UI/music entry point on
 *     the live engine, asserting nothing throws and the context is "running".
 */
import { WEAPON_ORDER, WEAPONS, MatchPhase } from "@frankibarber/shared";
import type { GameContext } from "../context";
import type { AudioEngine } from "./engine";
import * as sfx from "./sfx";
import { sharedBuffers, type Graph } from "./synth";
import { WEAPON_FEEL } from "../combat/weaponFeel";

export interface OfflineResult { name: string; peakDb: number; ok: boolean; seconds: number; }
export interface SelfTestReport {
  contextState: string;
  offline: OfflineResult[];
  live: { name: string; ok: boolean; error?: string }[];
  voicesAfter: number;
  passed: boolean;
}

const PEAK_MAX_DB = -1;
const PEAK_MIN_DB = -40;

function catalogue(): [string, sfx.SoundFn][] {
  const list: [string, sfx.SoundFn][] = [];
  for (const w of WEAPON_ORDER) {
    list.push([`gunshot:${w}`, sfx.gunshot(w)]);
    list.push([`gunshot:${w}:distant`, sfx.gunshot(w, true)]);
    list.push([`reload:${w}`, sfx.reload(w, WEAPONS[w].reloadMs)]);
    if (WEAPON_FEEL[w].actionMs > 0) list.push([`action:${w}`, sfx.weaponAction(w, WEAPON_FEEL[w].actionMs)]);
    list.push([`equip:${w}`, sfx.equip(WEAPONS[w].equipMs)]);
  }
  list.push(["dryFire", sfx.dryFire]);
  list.push(["footstep:walk", sfx.footstep(false, false)]);
  list.push(["footstep:sprint", sfx.footstep(true, false)]);
  list.push(["footstep:crouch", sfx.footstep(false, true)]);
  list.push(["footstep:remote", sfx.footstep(true, false, true)]);
  list.push(["jump", sfx.jump]);
  list.push(["landing:soft", sfx.landing(2)]);
  list.push(["landing:hard", sfx.landing(12)]);
  list.push(["hit:body", sfx.hitConfirm("body")]);
  list.push(["hit:head", sfx.hitConfirm("head")]);
  list.push(["hit:kill", sfx.hitConfirm("kill")]);
  list.push(["damageTaken", sfx.damageTaken]);
  list.push(["death", sfx.death]);
  list.push(["respawn", sfx.respawn]);
  for (const k of ["hover", "click", "back", "open", "close", "error"] as const) list.push([`ui:${k}`, sfx.ui(k)]);
  list.push(["countdown", sfx.countdownBeep(false)]);
  list.push(["countdown:final", sfx.countdownBeep(true)]);
  list.push(["stinger:start", sfx.stinger("start")]);
  list.push(["stinger:end", sfx.stinger("end")]);
  return list;
}

/** Renders one sound offline (deterministic RNG) and returns its peak in dBFS. */
export async function renderOffline(name: string, fn: sfx.SoundFn, seconds = 3.5): Promise<OfflineResult> {
  const sr = 48000;
  const Ctor = window.OfflineAudioContext ?? (window as unknown as { webkitOfflineAudioContext: typeof OfflineAudioContext }).webkitOfflineAudioContext;
  const ctx = new Ctor(2, Math.ceil(sr * seconds), sr);
  let seed = 1234567;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const out = ctx.createGain();
  out.connect(ctx.destination);
  const g: Graph = { ctx, out, verb: null, t: 0.05, buf: sharedBuffers(ctx), rnd };
  const dur = fn(g);
  const buf = await ctx.startRendering();
  let peak = 0;
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < d.length; i++) { const a = Math.abs(d[i]); if (a > peak) peak = a; }
  }
  const peakDb = peak > 0 ? 20 * Math.log10(peak) : -Infinity;
  return { name, peakDb: Math.round(peakDb * 10) / 10, ok: peakDb <= PEAK_MAX_DB && peakDb >= PEAK_MIN_DB, seconds: dur };
}

export async function runSelfTest(engine: AudioEngine, ctx: GameContext | null, exports: { uiSound: (k: sfx.UiSoundKind) => void; setMusic: (on: boolean) => void }): Promise<SelfTestReport> {
  const offline: OfflineResult[] = [];
  for (const [name, fn] of catalogue()) {
    try { offline.push(await renderOffline(name, fn)); }
    catch (err) { offline.push({ name, peakDb: NaN, ok: false, seconds: 0 }); console.error("[audio selftest]", name, err); }
  }
  const live: SelfTestReport["live"] = [];
  const step = (name: string, f: () => void) => {
    try { f(); live.push({ name, ok: true }); } catch (err) { live.push({ name, ok: false, error: String(err) }); }
  };
  engine.resume();
  if (ctx) {
    const ev = ctx.events;
    const remote = ctx.remotes.values().next().value ?? null;
    const pos = (): [number, number, number] => { const b = ctx.local.body; return [b.x, b.y + 1.5, b.z]; };
    for (const w of WEAPON_ORDER) {
      step(`event:localShot:${w}`, () => ev.emit("localShot", { weapon: w, origin: pos(), dir: [0, 0, 1] }));
      step(`event:remoteShot:${w}`, () => ev.emit("remoteShot", { player: remote, event: { id: remote?.id ?? "x", weapon: w, o: [pos()[0] + 6, pos()[1], pos()[2] + 3], e: [[0, 1, 30]], k: [0] } }));
      step(`event:weaponEquip:${w}`, () => ev.emit("weaponEquip", { weapon: w }));
      step(`event:reloadStart:${w}`, () => ev.emit("reloadStart", { weapon: w }));
      step(`event:reloadEnd:${w}`, () => ev.emit("reloadEnd", { weapon: w }));
      step(`event:dryFire:${w}`, () => ev.emit("dryFire", { weapon: w }));
    }
    step("event:footstep", () => ev.emit("footstep", { sprint: false, crouch: false }));
    step("event:footstep:sprint", () => ev.emit("footstep", { sprint: true, crouch: false }));
    step("event:footstep:crouch", () => ev.emit("footstep", { sprint: false, crouch: true }));
    step("event:jump", () => ev.emit("jump", {}));
    step("event:landed", () => ev.emit("landed", { impactSpeed: 7 }));
    step("event:localHit", () => ev.emit("localHit", { victim: "v", damage: 20, kill: false, headshot: false }));
    step("event:localHit:head", () => ev.emit("localHit", { victim: "v", damage: 40, kill: false, headshot: true }));
    step("event:localHit:kill", () => ev.emit("localHit", { victim: "v", damage: 40, kill: true, headshot: false }));
    step("event:localDamaged", () => ev.emit("localDamaged", { from: "a", amount: 20, dx: 1, dz: 0, health: 80 }));
    const kill = { killer: "a", killerName: "A", killerTeam: 0 as const, victim: "b", victimName: "B", victimTeam: 1 as const, weapon: "rifle" as const, headshot: false };
    step("event:kill", () => ev.emit("kill", kill));
    step("event:localDeath", () => ev.emit("localDeath", kill));
    step("event:localSpawn", () => ev.emit("localSpawn", { id: "me", x: 0, y: 0, z: 0, yaw: 0 }));
    for (const phase of [MatchPhase.Countdown, MatchPhase.Prep, MatchPhase.Playing, MatchPhase.Ended, MatchPhase.Waiting]) {
      step(`event:matchPhase:${phase}`, () => ev.emit("matchPhase", { phase, winner: -1 }));
    }
    step("event:settings", () => ev.emit("settings", {}));
  }
  for (const k of ["hover", "click", "back", "open", "close", "error"] as const) step(`uiSound:${k}`, () => exports.uiSound(k));
  step("setMusic:on", () => exports.setMusic(true));
  step("setMusic:off", () => exports.setMusic(false));
  // Voice limit: 40 gunshots in one burst must not exceed the cap or throw.
  step("voiceLimit", () => { for (let i = 0; i < 40; i++) engine.play(sfx.gunshot("smg"), { priority: 4 }); if (engine.activeVoices > 24) throw new Error(`voices=${engine.activeVoices}`); });
  await new Promise((r) => setTimeout(r, 150));
  const contextState = engine.state;
  const passed = offline.every((o) => o.ok) && live.every((l) => l.ok) && contextState === "running";
  return { contextState, offline, live, voicesAfter: engine.activeVoices, passed };
}
