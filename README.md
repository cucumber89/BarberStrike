# BARBERSTRIKE (formerly FRANKIBARBER: AFTER HOURS)

A multiplayer browser FPS set in a premium barber shop district after closing time.
Team Deathmatch, Free For All, Domination and Bomb Plant, 2–12 players, server-authoritative, playable in Chrome/Chromium.

> The YAML block at the top of this file is for a Hugging Face Docker Space (now a paid tier). GitHub
> shows it as a small table; it is harmless everywhere else.

## Play online
The server serves the page, so **one address is the whole setup**: whoever opens it plays there.
`docs/HOSTING.md` (Polish) walks through the three ways to get such an address — from your own PC
with a tunnel, a free Render service built from the root `Dockerfile` (`render.yaml` is the
blueprint), or Koyeb / Fly.io / a VPS with the same image. (Hugging Face Docker Spaces have become a
paid tier; the sync workflow stays for anyone on that plan.) In the game, **PLAY ONLINE** shows the server
line and the invite link; the lobby's **INVITE** button makes a link with the room name filled in
(`?room=late-shift&mode=tdm`).

## What it is
- Fast arena-style FPS: sprint, tactical sprint, lean, jump, crouch, ADS; eleven weapons (two sidearms,
  eight primaries, the clippers), five grenades, four barber perks, two plates, an in-match economy.
- Progression that never touches a fight: levels with barber-shop titles, badges, per-weapon mastery
  (BRĄZ → DIAMENT) and three daily challenges — all local, no accounts.
- A menu that explains itself: an armoury with hand-drawn art and stats for every item, a profile
  page, how-to-play, tabbed settings (crosshair editor, ADS sensitivity, HUD, key rebinding).
- Real multiplayer: Colyseus rooms, 60 Hz authoritative simulation, client prediction + reconciliation,
  snapshot interpolation for remote players, lag-compensated hitscan.
- One intentionally designed map, **Night District**: front street → barber shop → back hall → courtyard,
  with an alley loop, a neighbouring industrial unit and an upper balcony route.
- Complete match flow: lobby → room → warm-up → countdown → TDM (7 min / 40 kills) → result → rematch.

## Architecture
See `docs/ARCHITECTURE.md` (locked decisions) and `docs/BUILD_STATE.md` (status, ownership, known issues).

```
frankibarber/
  apps/client   Vite + React (menus/HUD) + Babylon.js (WebGPU → WebGL2) game client
  apps/server   Node + Colyseus 0.18 authoritative game server (+ Express /health, /rooms)
  packages/shared  contracts, constants, weapons, collision, movement sim, hitscan, map data
  docs/         architecture + build state
```

## Requirements
- Node ≥ 20, pnpm 10: `npm install -g pnpm` (or `corepack enable` — on Windows that needs an
  administrator prompt, otherwise it fails with `EPERM`).
- Desktop Chrome/Chromium (WebGL2 required; WebGPU used when available).

## Install & run (development)
```
cd frankibarber
pnpm install
pnpm dev            # game server on :2567 and client on http://localhost:5174
```
Open http://localhost:5174 in two browser windows (or two machines on the LAN: the client connects to
`ws://<page-host>:2567` by default; override with `VITE_SERVER_URL`).

Troubleshooting:
- `'pnpm' is not recognized` → `npm install -g pnpm`, then open a new terminal.
- `pnpm install` warns about ignored build scripts (esbuild, msgpackr-extract) → harmless, nothing to approve.
- `Failed to load PostCSS config … Cannot find module 'autoprefixer'` → fixed by the inline PostCSS config in
  `apps/client/vite.config.ts`; `git pull` if you still see it.
- Keep the `pnpm dev` terminal open while playing; Ctrl+C stops both server and client.
- Renderer trouble (black screen, `engine.… is not a function`, "WebGPU context lost"): the game retries once on
  WebGL2 by itself and remembers it; you can also force it in SETTINGS → "Force WebGL2 (disable WebGPU)".

## Multiplayer testing
- Manual: two windows → PLAY → same room name → QUICK PLAY. The match starts once two players are present.
- Automated (real two-browser test):
  ```
  FB_DEV_TOOLS=1 pnpm --filter @frankibarber/server dev     # enables the dev-only teleport hook
  pnpm --filter @frankibarber/client dev
  pnpm --filter @frankibarber/client test:e2e               # PW_CHROMIUM=<chromium path> if needed
  ```
- Unit tests: `pnpm test` (shared movement/collision/hitscan + **map validity** (walk grid, spawn LOS, prop
  placement) + server room/match logic + client animation/reload/dynamic-scale on Babylon's NullEngine).
- Asset tools: `node apps/client/e2e/tools/gltf-info.mjs <file.glb>` reads a model straight from disk
  (node names, animation clips, bones, bounding boxes) — no browser, no dev server. With the dev servers
  running, `node e2e/tools/assets-check.mjs` reports what the RUNNING game imported and what it costs,
  `node e2e/tools/vm-fit.mjs` prints where each gun sits in camera space, and
  `node e2e/tools/hand-pose.mjs` prints where a remote player's gun points (bore angle against the
  direction the body faces, muzzle height and offset) — the check that caught every enemy carrying
  their rifle backwards.
- Measurement tools (dev servers running): `pnpm profile` (draw calls / meshes / lights per view),
  `pnpm shots` (13 map views), `pnpm anim` (per-weapon idle / shot / reload stills).
- Diagnostic scripts in `apps/client/e2e/tools/` (dev servers running): `reconnect.mjs` (simulated network drop →
  session resume), `audio-selftest.mjs` (renders every sound offline + live voice cap), `shots.mjs` / `faceoff.mjs` /
  `shot1.mjs` (screenshots of the map, characters and HUD in headless Chromium).
- Reconnection: an unexpected socket drop keeps the player on the server for 15 s; the client resumes the same
  session automatically (HUD shows "RECONNECTING").

## 2.2 — what changed (2026-09-06)
- Bomb Plant plays like the classics: one attacker gets the charge at random, **H** drops it a step
  ahead for a teammate (whoever dropped it has to step away and come back to take it again), any
  attacker walks over it to pick it up, and it is planted by holding **T** while standing still
  anywhere inside the painted zone of A or B — the charge lands where the planter stood. Defenders
  defuse next to the charge (10 s, or 5 s with a **defuse kit**, $400 in the buy phase, lost on death).
  Plant and defuse pay $300. The carrier wears the pack, the HUD names the carrier and the keys.
- Sites A (depot) and B (courtyard) rebuilt: hazard-striped zones painted on the floor with the
  letter, lit corner posts, stencilled letters and site signs on the walls, cover to plant behind.
- Materials get relief: every wall / floor look now has a generated normal map and colour variation
  (`world/materials.ts`), so brick, plaster, concrete and metal read as surfaces, not flat paint.
- The main menu has a live cover, CS 1.6 style: the game's own characters, both sides, lit by a
  brass and a violet practical, idling behind the menu on a wet floor (`view/MenuCover.ts`).
- The district is dressed as a place people use (`shared/districtDressing.ts`, `world/props.ts`):
  café tables, coffee machine and menu board, the depot's tool boards, tyre stacks and jack, the
  shop's clock, calendar, coat rack and magazines, string lights, a fire barrel, an A-frame sign,
  bicycles, puddles, litter, tape and cones on the streets.

## 2.1 — what changed (2026-09-06)
- Menu rebuilt: PLAY / ARMOURY / PROFILE / PLAY ONLINE / HOW TO PLAY / SETTINGS, with the level card,
  today's challenges and the server line on the first screen.
- Shop and armoury show a drawing of every weapon, grenade, perk and plate (`ui/art/GearArt.tsx`).
- Settings in tabs: ADS sensitivity, crosshair editor (colour, size, gap, thickness, dot, dynamic,
  outline), HUD scale, minimap / kill feed / toasts / FPS toggles, key rebinding with conflict marks.
- Weapon mastery and daily challenges (`shared/mastery.ts`, `shared/challenges.ts`), recent matches
  and profile export / import / reset.
- Invite links (`?room=…&mode=…`, `?join=<roomId>`), `/health` reports players and rooms.
- One Docker image for server + client (`Dockerfile`), Hugging Face sync workflow, `fly.toml`, `render.yaml`, CI.
- Merged the owner's parallel ChatGPT work: Bomb Plant, smoke, the wider district, procedural
  characters, individual respawns (see "Procedural combat and map update" below).

## Production build
```
pnpm build                                   # typechecks shared, bundles server (dist/), builds client (dist/)
pnpm --filter @frankibarber/server start      # node dist/index.js  (PORT, CORS_ORIGIN)
pnpm --filter @frankibarber/client preview    # static preview of the client build
```
The client build is static (deploy `apps/client/dist` anywhere); the server needs a persistent
WebSocket-capable host (VM, container, Fly/Railway/Render — **not** a serverless function runtime).
A `Dockerfile` for the server lives in `apps/server/` (build from the `frankibarber/` root:
`docker build -f apps/server/Dockerfile -t frankibarber-server .`). The image was written and reviewed but
could not be built in the authoring sandbox (no Docker daemon) — verify on your host.

## Controls
| Key | Action |
|---|---|
| W A S D | Move |
| Mouse | Aim |
| LMB / RMB | Fire / Aim down sights |
| Shift | Sprint |
| Shift ×2 (double tap) | Tactical sprint — faster, gun up, on a 4 s budget |
| Q / E | Lean left / right (blocked by walls, off while sprinting) |
| Space | Jump |
| Ctrl / C | Crouch |
| R | Reload |
| 1 / 2 / wheel / X | Primary / pistol / cycle / last weapon |
| G (hold to cook) | Lethal grenade |
| V / 3 | Clippers (melee; one-hit from behind) |
| F | Inspect weapon |
| Shift while scoped | Hold breath (sniper) |
| 4 | Tactical grenade |
| B | Buy menu (15 s after spawn or at a $ BUY station) |
| Tab | Scoreboard (K / D / A / $ / ping) |
| Enter / Y | Chat to all / to the team (Enter sends, Esc cancels) |
| Middle mouse | Mark a spot for the team; aimed at an enemy: "spotted" |
| Esc | Release mouse / pause |

Bots: pick 0–8 and a level (EASY / NORMAL / HARD) in the lobby before QUICK PLAY / CREATE MATCH.

## Environment variables
See `.env.example`. Server: `PORT` (2567), `CORS_ORIGIN`, `FB_DEV_TOOLS` (dev only). Client: `VITE_SERVER_URL`.

## Asset licenses
See `ASSET_LICENSES.md`; the required CC-BY line is also in-game under SETTINGS → CREDITS.
Three CC0/CC-BY packs are shipped — Quaternius characters (CC0), a low-poly firearms bundle by
**austincford** (CC-BY 4.0), MiniPoly bottles (CC0). Everything else is still generated at runtime, and
the game runs unchanged with the packs deleted. To swap or add: drop a CC0/CC-BY glTF into
`apps/client/public/models/`, name it in `manifest.json` (see the README there) and add a row to
`ASSET_LICENSES.md`. Only files the manifest names are copied into a production build.

## Known limitations
- Desktop only; touch controls are not implemented (mobile devices get a notice).
- Characters and all weapons are built from geometry in the game at every graphics preset. Team
  masks, vests, bevelled weapons and animated hands need no model downloads. The optional scenery
  setting enables existing prop packs from MEDIUM upwards.
- Audio is entirely procedural. Map geometry, characters, weapons and effects are generated at runtime;
  some scenery can use the existing CC0/CC-BY packs.
- One map. Modes: Team Deathmatch, Free For All, Domination and Bomb Plant (picked in the lobby); bots at three levels. A second map is a stretch goal.
- Tuning (sensitivity, recoil, bob) was validated logically and via headless screenshots; final feel needs a
  real-GPU playtest.
- See the "Known issues" section of `docs/BUILD_STATE.md` for measured decisions and caveats.

## Procedural combat and map update (2026-09-06)
- Bomb Plant is separate from continuous modes: rounds of 115 s, a 10 s buy phase, hold **T** while
  standing still inside site A / B for 3.2 s to plant, 10 s to defuse (5 s with a kit); 40 s fuse,
  one life per round, sides swap after 6 rounds, first to 7 wins. A dropped charge is picked up by
  walking over it (see 2.2 above for the drop / hand-over rules). Late joins wait for the next round.
- Detailed procedural facades, divided shop windows, striped awning, interior trims and cabinetry;
  the centre repair garage now provides a sheltered west-lane passage.
- Smoke blocks bot sight and the view from inside; flashes blind bots too. Bots use a forward field
  of view, slower reactions, short bursts with pauses and retreat from visible fire. Spawns prefer
  cover and avoid fire. Molotov damage respects walls; bullet trails stop at world surfaces.
- Continuous matches: no repeating preparation windows or team respawn waves. Each casualty
  respawns independently after 3 seconds (shorter with Fade); survivors keep fighting until
  the match time or score limit. Applies to TDM, FFA and Domination, including bots.
- Team-coloured masked characters with vests, pouches and knee pads; joint-local mesh merging,
  weapons built only when equipped, shared materials preserved when another player leaves.
- Bevelled weapon geometry, brighter satin metal, open sight notches, correct support-hand positions
  for sidearms and long guns, and magazines that keep their authored position through equip/reload.
- Night market cover on the main street and a stair-fed yard lookout linked to the container roof.
- Bots choose from more affordable primaries, use weapon-specific distance, aim at range, retreat
  with an empty magazine and keep a target when two opponents repeatedly trade nearest position.
- Visual check: with dev servers running and `FB_DEV_TOOLS=1`, run
  `node apps/client/e2e/tools/art-review.mjs` (`PW_CHROMIUM` can name a Chrome executable;
  `SHOT_DIR` selects the screenshot directory).
