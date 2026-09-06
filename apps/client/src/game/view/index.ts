import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { GameModule } from "../context";
import type { RemotePlayer } from "../player/RemotePlayer";
import { Tracers } from "../vfx/Tracers";
import { Viewmodel } from "./Viewmodel";
import { Effects } from "./Effects";
import { Nameplates } from "./Nameplates";
import { Grenades } from "./Grenades";
import { Flags } from "./Flags";
import { BombSites } from "./BombSites";
import { Marks } from "./Marks";
import { hud } from "../store";
import { INTERP_DELAY_MS, MatchPhase, WEAPONS, makeRayHit } from "@frankibarber/shared";

/**
 * Presentation module: first-person viewmodel, muzzle flashes, tracers, impacts, decals,
 * shell casings and the local feel hooks (shake). Remote characters live in RemotePlayer.
 */
export const installView: GameModule = (ctx) => {
  const tracers = new Tracers(ctx.scene);
  const viewmodel = new Viewmodel(ctx.scene, ctx.camera, ctx.local);
  viewmodel.setWorld(ctx.world);
  // Drop 6b: upgrade to the imported guns in the background. Deliberately not awaited — the
  // procedural weapons are already up, and a slow or missing file must not delay the first frame.
  if (ctx.weaponModels) void viewmodel.useModels(ctx.weaponModels);
  const effects = new Effects(ctx.scene, ctx.world);
  const nameplates = new Nameplates(ctx.scene, ctx.world, () => (ctx.connection.me()?.team ?? 0) as 0 | 1);
  const grenades = new Grenades(ctx.scene, ctx.world, ctx.serverNow);
  // Drop 4: flag poles / rings only in Domination.
  const flags = ctx.connection.state.mode === "dom" ? new Flags(ctx.scene, ctx.mapDef, () => ctx.connection.state.flags) : null;
  const bomb = ctx.connection.state.mode === "bomb" ? new BombSites(ctx.scene) : null;
  // Drop 5: team marks as world billboards.
  const marks = new Marks(ctx.scene, ctx.remotes, () => ({ x: ctx.local.body.x, y: ctx.local.body.y, z: ctx.local.body.z }));
  grenades.setHooks({
    onBounce: (kind, x, y, z, speed) => { if (speed > 1.5) { tmpB.set(x, y, z); effects.puff(tmpB, Math.min(1, speed / 10) * 0.5); } void kind; },
    onBoom: (e) => {
      // Camera shake by distance for blasts.
      if (e.kind === "frag" || e.kind === "molotov") {
        const b = ctx.local.body;
        const d = Math.hypot(b.x - e.x, b.y + 1 - e.y, b.z - e.z);
        ctx.local.addShake(Math.max(0, 0.05 * (1 - d / 16)));
      }
    },
  });
  const eye = new Vector3();
  const tmpA = new Vector3();
  const tmpB = new Vector3();
  const tmpC = new Vector3();
  const shotHit = makeRayHit();
  const density = () => ctx.settings.graphics.effects;
  effects.setDensity(density());

  /** Remote player whose body is within a metre of (x, z), excluding the shooter. */
  const nearestRemote = (x: number, z: number, exceptId: string) => {
    let best: RemotePlayer | null = null, bestD = 1.0;
    for (const r of ctx.remotes.values()) {
      if (r.id === exceptId) continue;
      const d = Math.hypot(r.x - x, r.z - z);
      if (d < bestD) { bestD = d; best = r; }
    }
    return best;
  };

  const localMuzzle = (): Vector3 => {
    const n = viewmodel.muzzleNode;
    n.computeWorldMatrix(true);
    return tmpA.copyFrom(n.getAbsolutePosition());
  };

  const offs = [
    ctx.events.on("matchPhase", e => { if (e.phase === MatchPhase.Prep || e.phase === MatchPhase.Ended || e.phase === MatchPhase.Playing) grenades.reset(); }),
    ctx.events.on("localShot", (s) => {
      viewmodel.onFire();
      const kind = WEAPONS[s.weapon].kind;
      if (kind === "melee") return;                       // the swing is the whole show
      if (kind === "launcher") { effects.flash(localMuzzle(), 0.35, true); ctx.local.addShake(0.014); return; } // the shell draws its own arc
      const m = localMuzzle();
      effects.flash(m, 0.22, true);
      ctx.world.raycast(...s.origin, ...s.dir, WEAPONS[s.weapon].rangeMax, shotHit);
      const distance = shotHit.hit ? shotHit.t : WEAPONS[s.weapon].rangeMax;
      tmpB.set(s.origin[0] + s.dir[0] * distance, s.origin[1] + s.dir[1] * distance, s.origin[2] + s.dir[2] * distance);
      tracers.spawn(m, tmpB, density());
      const ej = viewmodel.ejectNode; ej.computeWorldMatrix(true);
      effects.eject(tmpC.copyFrom(ej.getAbsolutePosition()), ctx.local.yaw);
      ctx.local.addShake(s.weapon === "shotgun" ? 0.012 : s.weapon === "dmr" ? 0.01 : 0.004);
    }),
    ctx.events.on("remoteShot", ({ player, event }) => {
      const origin = player ? player.muzzle(tmpA) : tmpA.set(event.o[0], event.o[1], event.o[2]);
      player?.onShot();
      if (WEAPONS[event.weapon].kind === "melee") return; // a swing: no flash, no tracer
      effects.flash(origin, 0.3, true);
      for (let i = 0; i < event.e.length; i++) {
        const e = event.e[i];
        tmpB.set(e[0], e[1], e[2]);
        tracers.spawn(origin, tmpB, density());
        const kind = event.k[i] ?? 0;
        effects.impact(origin, tmpB, kind);
        // A pellet that ended on a player: the nearest remote character flinches away from the shooter.
        if (kind > 0) {
          const victim = nearestRemote(e[0], e[2], event.id);
          if (victim) victim.character.flinch(event.o[0] - victim.x, event.o[2] - victim.z, kind === 2);
        }
      }
    }),
    // Our own confirmed hits: the victim flinches away from us (the server does not echo our shot back).
    ctx.events.on("localHit", (h) => {
      const victim = ctx.remotes.get(h.victim);
      if (!victim) return;
      const b = ctx.local.body;
      victim.character.flinch(b.x - victim.x, b.z - victim.z, h.headshot);
    }),
    // Deaths fall away from the killer.
    ctx.events.on("kill", (e) => {
      const victim = ctx.remotes.get(e.victim);
      if (!victim) return;
      const killer = e.killer === ctx.connection.sessionId ? ctx.local.body : ctx.remotes.get(e.killer);
      if (killer && e.killer !== e.victim) victim.character.die(killer.x - victim.x, killer.z - victim.z);
      else victim.character.die();
    }),
    // Our own shots: the server tells us only about hits; impacts come from re-tracing our ray locally.
    ctx.events.on("localShot", (s) => {
      if (WEAPONS[s.weapon].kind !== "hitscan") return;
      tmpB.set(s.origin[0], s.origin[1], s.origin[2]);
      ctx.world.raycast(...s.origin, ...s.dir, WEAPONS[s.weapon].rangeMax, shotHit);
      if (shotHit.hit) {
        tmpC.set(s.origin[0] + s.dir[0] * shotHit.t, s.origin[1] + s.dir[1] * shotHit.t, s.origin[2] + s.dir[2] * shotHit.t);
        effects.impact(tmpB, tmpC, 0);
      }
    }),
    ctx.events.on("localDamaged", () => ctx.local.addShake(0.015)),
    ctx.events.on("remoteJoin", ({ player }) => { for (const m of player.character.allMeshes) ctx.mapInstance.addCaster(m); }),
    ctx.events.on("weaponEquip", (e) => viewmodel.setWeapon(e.weapon)),
    ctx.events.on("weaponInspect", () => viewmodel.inspect()),
    ctx.events.on("reloadStart", () => viewmodel.onReload()),
    ctx.events.on("reloadEnd", () => viewmodel.onReloadEnd()),
    ctx.events.on("landed", (e) => viewmodel.onLanded(e.impactSpeed)),
    ctx.events.on("jump", () => viewmodel.onJump()),
    ctx.events.on("localDeath", () => { viewmodel.cancelGrenade(); viewmodel.setVisible(false); }),
    ctx.events.on("localSpawn", () => { viewmodel.setVisible(true); viewmodel.cancelGrenade(); viewmodel.setWeapon(ctx.weapons.weapon); }),
    ctx.events.on("settings", () => { effects.setDensity(density()); grenades.setDensity(density()); }),
    // ---- drop 2: grenades
    ctx.events.on("grenadePrime", (e) => viewmodel.primeGrenade(e.kind)),
    ctx.events.on("grenadeThrow", () => viewmodel.throwGrenade()),
    ctx.events.on("grenadeCancel", () => viewmodel.cancelGrenade()),
    ctx.events.on("throw", (e) => {
      const mine = e.owner === ctx.connection.sessionId;
      grenades.onThrow(e, mine ? 0 : INTERP_DELAY_MS);
      if (!mine) ctx.remotes.get(e.owner)?.character.throw();
    }),
    ctx.events.on("boom", (e) => {
      grenades.onBoom(e);
      // A knife that hit a player: a small puff on the body, no stuck blade.
      if (e.kind === "knife" && e.effectMs === 0) { tmpB.set(e.x, e.y, e.z); effects.puff(tmpB, 0.6); }
    }),
    ctx.onFrame((dt) => {
      viewmodel.setEmpty(ctx.weapons.ammo === 0 && WEAPONS[ctx.weapons.weapon].magazine > 0 && !ctx.weapons.reloading);
      viewmodel.update(dt);
      tracers.update(dt);
      effects.update(dt);
      grenades.update(dt);
      flags?.update(dt);
      if (bomb && ctx.connection.state.bomb) bomb.update(ctx.connection.state.bomb, ctx.serverNow());
      marks.update();
      const b = ctx.local.body;
      eye.set(b.x, b.y + 1.62, b.z);
      hud.set({ smokeOpacity: grenades.obscurityAt(eye.x, eye.y, eye.z) });
      nameplates.update(ctx.remotes, eye);
    }),
  ];

  return () => {
    hud.set({ smokeOpacity: 0 });
    for (const off of offs) off();
    tracers.dispose();
    viewmodel.dispose();
    effects.dispose();
    grenades.dispose();
    flags?.dispose();
    bomb?.dispose();
    marks.dispose();
    nameplates.dispose();
  };
};
