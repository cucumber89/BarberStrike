# FRANKIBARBER: AFTER HOURS — Architecture (locked)

Decisions below are locked. Reopen only with evidence (a measurement or a failing test).

## Stack
- **pnpm workspace** in `frankibarber/` (this folder is independent from the SideQuest app at the repo root).
- `packages/shared` — pure TypeScript, **no browser/node APIs**: contracts, constants, weapons, collision, movement sim, hitscan, map data, spawn logic. Imported as source by both apps.
- `apps/server` — Node + **Colyseus 0.18** (`@colyseus/core`, `@colyseus/ws-transport`, `@colyseus/schema` 5) + Express (health, room browser). Bundled with esbuild (`build.mjs`), shared inlined.
- `apps/client` — Vite + React 18 (menus/HUD only) + **Babylon.js 9** (WebGPU → WebGL2 fallback). `@colyseus/sdk` client.

## Coordinate system
+X east, +Y up, +Z north. Yaw 0 looks along +Z; forward = (sin yaw, 0, cos yaw). Pitch positive = looking down (Babylon `rotation.x`). Player origin = feet. Body = AABB (halfWidth 0.35, height 1.8 / crouch 1.25), eye 1.62 / 1.08.

## Networking model
- **Server authoritative** for movement, health, ammo, fire rate, kills, score, spawns, match flow.
- Client → server: `C2S.Input` = batches of `[seq, dtMs, buttons, yaw, pitch]` (~60 msgs/s, batched per frame group). `C2S.Fire {seq, weapon, o, d, t}`; `Equip slot`; `Reload`; `Ping {c, rtt}`.
- Server tick: 60 Hz fixed accumulator (`setTimestep`). Each player has a **time bank** (refilled TICK_MS per tick, cap 120 ms); inputs cost their `dt` → clients cannot run faster than real time. Queue capped at 12.
- Server → client: Colyseus Schema patches at **20 Hz** (`patchRate = SNAPSHOT_MS`). `MatchState.t` = server time per snapshot. Events as messages: `Shot`, `Hit`, `Damaged`, `Kill`, `Spawn`, `MatchEvent`, `Welcome`, `Pong`.
- **Prediction**: `LocalPlayer` runs `simulateBody` per frame, stores pending inputs + predicted state; on each snapshot it compares the server state at `ack` and replays if error > 3 cm. The `ack` is not part of the replicated state: each client gets its own as `S2C.Ack`, sent in `onBeforePatch` right before the patch it belongs to (performance pass). Angles and velocities in the snapshot are int16 (0.1 mrad, cm/s); the quantisers live in shared `types.ts`.
- **Interpolation**: `RemotePlayer` buffers snapshots keyed by `state.t`, renders at `serverNow - INTERP_DELAY_MS (110)`.
- **Lag compensation**: server keeps 30 ticks of position history per player; `Fire.t` (client's render time) selects the history entry (clamped to 350 ms).
- Hitscan: `traceBullet` (shared) = world AABB raycast + player boxes; head = top 18 % → ×1.6. Shotgun = 9 pellets with seeded RNG (mulberry32).
- Time sync: `Welcome.serverTime` + pings every 1.5 s (EMA offset).

## Match flow (server `match.ts`)
Waiting (≥2 connected) → Countdown 4 s → Playing 7 min / 40 kills → Ended 15 s → Waiting (→ Countdown again). Warm-up allows combat (no score). Match start respawns everyone; kills/deaths reset.

## Client structure
```
src/game/Game.ts            orchestrator (owned by Lead): input → prediction → net → events → render
src/game/events.ts          GameEvents bus (localShot, remoteShot, localHit, localDamaged, kill, localDeath,
                            localSpawn, remoteSpawn, remoteJoin/Leave, weaponEquip, reloadStart/End, dryFire,
                            jump, landed, footstep, matchPhase, settings)
src/game/context.ts         GameContext passed to modules; onFrame/onAfterRender hooks
src/game/view/index.ts      PRESENTATION module (viewmodel, characters, VFX)   ← installView
src/game/audio/index.ts     AUDIO module                                      ← installAudio
src/game/world/postfx.ts    post-processing / lighting polish                 ← installPostFx
src/game/perf/index.ts      telemetry / quality auto                          ← installPerf
src/game/world/MapBuilder.ts + materials.ts   static geometry (merged per material), lights, shadows
src/game/player/LocalPlayer.ts  prediction, camera, recoil, shake API (addRecoil/addShake)
src/game/player/RemotePlayer.ts interpolation + placeholder mannequin
src/game/combat/WeaponController.ts  client weapon logic mirror
src/game/net/Connection.ts   Colyseus wrapper, time sync, room browser (GET /rooms)
src/game/store.ts            hud store (useSyncExternalStore), coalesced per frame
src/ui/*                     React: Menu, SettingsPanel, Hud, styles.css
src/settings.ts              persisted settings + quality presets
```
Modules are installed from `MODULES` in Game.ts and receive a `GameContext`; they must **not** edit Game.ts. They subscribe to events and `ctx.onFrame`.

## Performance rules
- No per-frame allocations in movement/interp/tracers (pools + scratch objects).
- Map geometry merged per material tag, world matrices frozen, materials frozen.
- Shadows: ≤2 generators, only lights flagged `shadows` in map data. `maxSimultaneousLights = 6`.
- HUD writes are coalesced per animation frame; scoreboard sync at 10 Hz.
- Input send batched to ≤60 messages/s regardless of frame rate.

## Testing
- `pnpm test` = vitest in shared (movement/collision/hitscan/map) + server (match logic).
- `pnpm test:e2e` (client) = real two-browser Playwright test. Requires servers running, `FB_DEV_TOOLS=1` on the server for the teleport hook, `PW_CHROMIUM=<path>` when the bundled browser isn't installed.
