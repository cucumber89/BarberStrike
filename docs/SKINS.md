# Drop C: first six finishes (slices 1–4)

This branch stops at the owner's six-skin art gate. It contains two generators, a procedural-weapon
runtime, profile ownership/equip, one replicated string and a development preview. Crates, quests,
the full Armoury, the remaining generators and Skin Studio are not implemented here.

## Add a recipe

Edit `packages/skins/src/catalog.ts`. IDs are stable kebab-case; player-facing text is Polish.
Each recipe stores generator, uint32 seed, scalar params, rarity, weapon compatibility and blurb.
Keep names at most 22 characters and blurbs at most 64. Palettes use comma-separated colour strings
because params are scalar JSON values. No image assets belong in the catalogue.

`renderSkin` draws in a 256-unit design space, scaled to the destination resolution. It layers finish,
pattern, wear and grain. Generators receive only `SkinCanvas` and a seeded RNG; no DOM, clock or
`Math.random`. Register new generators in `GENERATORS`. The current generators are solid and stripes.
The `helix` catalogue hint is not a separate cylindrical UV projection: the runtime uses box projection.

Golden snapshots pin drawing-operation hashes for three seeds per generator. Browser rasterizers
can differ at pixel level; cross-browser pixel identity is not asserted. Do not update a golden hash
without reviewing and recording the intentional visual change.

## Runtime contract

The game uses `weaponMeshes.ts`, not imported glTF weapons. UVs are box-projected in weapon-root
space at 0.32 m/tile. Magazine coordinates include their rest position. `meshesByMat` maps each
material to an array because moving assemblies repeat material keys; retain every entry when swapping.

`SkinRegistry.forScene(scene)` shares a refcounted cache. Jobs are serialized outside rendering,
50 ms apart. Only the visible weapon holds a lease. Restore its factory materials BEFORE releasing
that lease. Never dispose a model's shared materials with its geometry. The LRU target is 12 sets;
it may exceed this while every set is referenced, and evicts idle sets as leases are released.

Each skin set shares one 1024² albedo texture. Lens, steel and brass retain factory materials; steel
and brass include sight blades. Metal housings/notches still belong to the painted metal group and
require the owner ADS review. No weapon geometry, hitboxes or combat numbers change.

`bs_profile_v1` retains its key and defaults new fields independently. Unknown recipes are filtered
without erasing progression. Equip requires ownership; empty equip means factory finish. The join
option is pure and accepts a skin string parameter. The server sanitizes at most 11 entries/400 chars.
RemotePlayer detects changes at receipt of network state and applies them through Character.
Menu equip is carried by the next join; there is no new in-match equip message.

The instance wear field is preserved, but this tranche equips recipe IDs, not duplicate instances.
Per-instance wear replication must be settled before crates ship. Bots are not assigned skins yet.

## Reproduce the review

Run `pnpm install`, then `pnpm dev`. The development preview is
`http://localhost:5174/e2e/tools/skin-review.html`; it is outside the production entry graph.

- `node apps/client/e2e/tools/skin-batch.mjs`: catalogue textures and contact sheet.
- `node apps/client/e2e/tools/skin-preview.mjs`: six model views, sniper/shotgun stripes, 10 mount cycles.
- `node apps/client/e2e/tools/skin-shots.mjs`: two real game clients, profile → join → remote material
  assertion, six pistol idle/ADS views and camera-posed remote views. This tool seeds a test profile;
  it does not grant skins to ordinary players. Full five-skin × four-weapon acceptance remains later work.

Outputs are gitignored under `apps/client/e2e/out/skins/`. Install the matching browser with
`pnpm --filter @frankibarber/client exec playwright install chromium`; `PW_CHANNEL` can select an
installed Chromium channel. Unit checks: `pnpm typecheck`, `pnpm test --maxWorkers=4`.

Independent review: the flat Warsztat swatch was initially rejected as muddy. On the actual model,
the reviewer accepted all six directions for owner review, keeping Warsztat as the weakest design.
No glaring seam was visible on the shown sniper/shotgun sides. This is not full gameplay art acceptance.

The in-game reviewer confirmed six distinct pistol ADS skins with an unobstructed post/notch opening.
There is no factory reference in that set, so unchanged sight contrast is not proven. The 3 m/12 m
observer shots are too small/front-facing to judge patterns and were rejected as art evidence.
The two-client assertion independently verifies the actual replicated field and remote materials.
