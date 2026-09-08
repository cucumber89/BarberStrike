import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { GameModule } from "../context";
import type { RemotePlayer } from "../player/RemotePlayer";
import { Tracers } from "../vfx/Tracers";
import { Viewmodel } from "./Viewmodel";
import { loadProfile } from "../progression/profile";
import type { WeaponId } from "@frankibarber/shared";
import { Effects } from "./Effects";
import { Nameplates } from "./Nameplates";
import { Grenades } from "./Grenades";
import { Flags } from "./Flags";
import { BombSites } from "./BombSites";
import { Marks } from "./Marks";
import { hud } from "../store";
import { feelOf } from "../combat/weaponFeel";
import { boysClass, INTERP_DELAY_MS, MatchPhase, WEAPONS, makeRayHit } from "@frankibarber/shared";

/**
 * Presentation module: first-person viewmodel, muzzle flashes, tracers, impacts, decals,
 * shell casings and the local feel hooks (shake). Remote characters live in RemotePlayer.
 */
export const installView: GameModule = (ctx) => {
  const tracers = new Tracers(ctx.scene);
  const viewmodel = new Viewmodel(ctx.scene, ctx.camera, ctx.local);
  for (const [weapon, skin] of Object.entries(loadProfile().equip)) void viewmodel.applySkin(weapon as WeaponId, skin);
  viewmodel.setWorld(ctx.world);
  // Drop 6b: upgrade to the imported guns in the background. Deliberately not awaited — the
  // procedural weapons are already up, and a slow or missing file must not delay the first frame.
  if (ctx.weaponModels) void viewmodel.useModels(ctx.weaponModels);
  const effects = new Effects(ctx.scene, ctx.world);
  const nameplates = new Nameplates(ctx.scene, ctx.world, () => (ctx.connection.me()?.team ?? 0) as 0 | 1, p => {
    const net = ctx.connection.state.players.get(p.id);
    return ctx.connection.state.mode === "boys" && net
      ? `${p.name}\n${boysClass(net.boysClass).name} · ${net.health} HP` : p.name;
  });
  const grenades = new Grenades(ctx.scene, ctx.world, ctx.serverNow);
  // Drop 4: flag poles / rings only in Domination.
  const flags = (ctx.connection.state.mode === "dom" || ctx.connection.state.mode === "boys") ? new Flags(ctx.scene, ctx.mapDef, () => ctx.connection.state.flags) : null;
  const bomb = ctx.connection.state.mode === "bomb" ? new BombSites(ctx.scene, ctx.mapDef) : null;
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

  /** A case owed by a hand-worked action, and the size it should come out at (0 = nothing pending). */
  let ejectAt = 0;
  let ejectScale = 1;
  /** Shots this module has presented, for `weapon-signature.mjs` to measure cadence against. */
  let shotCount = 0;
  /** The recoil the last shot put on the view, sampled at the shot rather than a frame later. */
  let lastKick = { pitch: 0, yaw: 0 };

  const offs = [
    ctx.events.on("matchPhase", e => { if (e.phase === MatchPhase.Prep || e.phase === MatchPhase.Ended || e.phase === MatchPhase.Playing) grenades.reset(); }),
    ctx.events.on("localShot", (s) => {
      viewmodel.onFire();
      // Axis 6 of the matrix, from the feel table: how much violence the shot puts on the screen.
      // Every number that used to be one value for all eleven weapons — flash size, shake, tracer
      // width, whether a case comes out at all — is now the weapon's own.
      shotCount++;
      lastKick = ctx.local.recoilOffset; // sampled here, where the kick has just been applied
      const feel = feelOf(s.weapon);
      const kind = WEAPONS[s.weapon].kind;
      if (kind === "melee") return;                       // the swing is the whole show
      ctx.local.addShake(feel.shake);
      if (kind === "launcher") { effects.flash(localMuzzle(), feel.flash, true); return; } // the shell draws its own arc
      const m = localMuzzle();
      effects.flash(m, feel.flash, true);
      if (feel.tracer > 0) {
        ctx.world.raycast(...s.origin, ...s.dir, WEAPONS[s.weapon].rangeMax, shotHit);
        const distance = shotHit.hit ? shotHit.t : WEAPONS[s.weapon].rangeMax;
        tmpB.set(s.origin[0] + s.dir[0] * distance, s.origin[1] + s.dir[1] * distance, s.origin[2] + s.dir[2] * distance);
        tracers.spawn(m, tmpB, density(), feel.tracer);
        // A pellet gun throws its whole pattern: one line down the middle is what made the S12 look
        // like a very loud rifle. The spread here is presentation only — the pellets that decide the
        // damage were traced by the server from its own cone.
        if (feel.tracerCount > 1) {
          // The S12's cone is constant (spreadPerShot 0), so its base spread IS its pattern width.
          const cone = WEAPONS[s.weapon].spread * distance;
          for (let i = 1; i < feel.tracerCount; i++) {
            const a = (i / (feel.tracerCount - 1)) * Math.PI * 2;
            const r = cone * (0.35 + Math.random() * 0.65);
            tmpB.set(
              s.origin[0] + s.dir[0] * distance + Math.cos(a) * r,
              s.origin[1] + s.dir[1] * distance + Math.sin(a) * r * 0.8,
              s.origin[2] + s.dir[2] * distance + Math.sin(a) * r,
            );
            tracers.spawn(m, tmpB, density(), feel.tracer);
          }
        }
      }
      // A gun that cycles itself throws its brass now; one worked by hand (revolver, pump, bolt)
      // holds on to it until the action is worked, which is where the eye expects to see it.
      if (feel.casings > 0) {
        const ej = viewmodel.ejectNode; ej.computeWorldMatrix(true);
        for (let i = 0; i < feel.casings; i++) effects.eject(tmpC.copyFrom(ej.getAbsolutePosition()), ctx.local.yaw, feel.casingScale, feel.ejectDown);
        // A belt gun throws the spent link with the case — two objects a second is most of why an
        // MG-4 firing looks like machinery rather than a rifle with a big magazine.
        if (feel.beltLink) effects.eject(tmpC.copyFrom(ej.getAbsolutePosition()), ctx.local.yaw, 0.55, true);
      } else if (feel.actionMs > 0) {
        // At the peak of the VISIBLE action, which is a tenth of a second, not at the end of the
        // rhythm the shooter feels — the bolt is open for 125 ms and the SR-50's `actionMs` is 700.
        ejectAt = performance.now() + viewmodel.actionPeakMs;
        ejectScale = feel.casingScale;
      }
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
    // A case owed by the gun you just put away is not owed by the one in your hands: without this
    // an SR-50 hull drops out of the pistol you swapped to a third of a second later.
    ctx.events.on("weaponEquip", (e) => { ejectAt = 0; viewmodel.setWeapon(e.weapon); }),
    ctx.events.on("weaponInspect", () => viewmodel.inspect()),
    ctx.events.on("reloadStart", () => viewmodel.onReload()),
    ctx.events.on("reloadEnd", () => viewmodel.onReloadEnd()),
    ctx.events.on("landed", (e) => viewmodel.onLanded(e.impactSpeed)),
    ctx.events.on("jump", () => viewmodel.onJump()),
    ctx.events.on("localDeath", () => { ejectAt = 0; viewmodel.cancelGrenade(); viewmodel.setVisible(false); }),
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
      // The brass a hand-worked gun held on to (pump, bolt, break-open): it comes out with the
      // action, not with the shot, which is the whole reason a pump gun reads as a pump gun.
      if (ejectAt > 0 && performance.now() >= ejectAt) {
        ejectAt = 0;
        const ej = viewmodel.ejectNode; ej.computeWorldMatrix(true);
        effects.eject(tmpC.copyFrom(ej.getAbsolutePosition()), ctx.local.yaw, ejectScale);
      }
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

  // Harness hook for the e2e tools, the same shape the audio module uses (`__fbAudio`):
  // `weapon-signature.mjs` reads the viewmodel's sway and counts shots through it.
  (window as unknown as { __fbView?: unknown }).__fbView = {
    viewmodel,
    get shots(): number { return shotCount; },
    get lastKick(): { pitch: number; yaw: number } { return lastKick; },
  };

  return () => {
    hud.set({ smokeOpacity: 0 });
    delete (window as unknown as { __fbView?: unknown }).__fbView;
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
