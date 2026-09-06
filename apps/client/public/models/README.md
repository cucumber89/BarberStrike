# Models (drops 6 and 6b)

`manifest.json` is the only thing that decides what the game imports. Anything it does not name —
and anything whose file fails to load — keeps its procedural version, so the game runs with this
whole folder deleted. Every file must be CC0 or CC-BY and recorded in `/ASSET_LICENSES.md`.

Four sections, all optional:

```json
{
  "characters": [ { "file": "raw/pack/Hoodie Character.glb", "tint": "Purple", "height": 1.87 },
                  { "file": "raw/pack/Business Man.glb",     "tint": "Suit",   "height": 1.86 } ],
  "weapons":  { "rifle": { "file": "raw/guns/MDR.glb" } },
  "props":    { "bottle_row": { "file": "raw/bottles/Bottle.glb", "height": 0.2 } },
  "models":   { "car": { "file": "car.glb", "fit": "box" } }
}
```

- **characters** — index 0 is team FADE, index 1 is team TAPER. Needs a rigged glTF whose clips are
  named like the Quaternius packs (`Armature|Walk`, `…|Run`, `…|Death`, see `characterAnim.ts`) and
  whose bones include `Chest`, `Head`, `Wrist.R`. `tint` names the material to recolour per team;
  `height` is the model's own height in metres, and it is MEASURED, not guessed:
  `node e2e/tools/gltf-info.mjs <file.glb>` prints it, along with node names, clips and bones.
- **weapons** — keyed by our weapon id (`pistol revolver smg smg2 rifle shotgun dmr sniper launcher`).
  Nothing else is needed: the loader reads the model's own part names to find the magazine, the
  slide/bolt and the sights, turns the bore onto +Z, scales it to the game's declared length and
  seats it on the grip. Optional `yaw`/`roll` only exist for a model the auto-orient gets wrong.
- **props** — keyed by prop kind (`bottle_row`), `height` in metres.
- **models** — map solids by `look`, the drop-6 section documented below.

Only the files listed here are copied into a production build (`pruneUnusedModels` in
`vite.config.ts`), so a complete pack can live in the repo without bloating the download.

## Map solids (`models` section)

Drop CC0 / CC-BY glTF files into this folder, list them in `manifest.json`, and every map solid with
that `look` is drawn with the model instead (scaled to its collision box; the box itself never changes). A look that is
not listed, or whose file fails to load, keeps its procedural version.

```json
{
  "models": {
    "car":       { "file": "car.glb",       "fit": "box", "yaw": 0, "lift": 0, "license": "CC0 — Kenney Car Kit" },
    "van":       { "file": "van.glb",       "fit": "box", "license": "CC0 — Kenney Car Kit" },
    "truck":     { "file": "truck.glb",     "fit": "box", "license": "CC0 — Kenney Car Kit" },
    "container": { "file": "container.glb", "fit": "box", "license": "CC0 — Kenney City Kit (Industrial)" },
    "dumpster":  { "file": "dumpster.glb",  "fit": "box", "license": "CC0 — Kenney City Kit (Industrial)" }
  }
}
```

- `fit`: `box` (default) scales uniformly so the model fills the box's tightest dimension;
  `footprint` fits width × depth only (roofs and antennas may poke out).
- `yaw`: radians to turn the model so its **front faces +Z** in the solid's frame.
- `lift`: metres above the floor.
- Looks available: `van car truck container dumpster crate lockers drums planter cabinet bin pallets
  machine skip shelter_roof portacabin kiosk_counter`.

## Where to get them (all CC0, no attribution required — still record each file in `ASSET_LICENSES.md`)
- **Kenney Car Kit** — https://kenney.nl/assets/car-kit (sedan, van, delivery, truck; glTF in `Models/GLB format/`).
- **Kenney City Kit (Industrial)** — https://kenney.nl/assets/city-kit-industrial (containers, dumpsters, pallets, drums).
- **Kenney Furniture Kit** — https://kenney.nl/assets/furniture-kit (cabinets, lockers-ish shelves).
- **Quaternius Ultimate Modular / Props packs** — https://quaternius.com (CC0).
- **Poly Haven models** — https://polyhaven.com/models (CC0; heavy textures — export a 1k version).

Keep files small (Kenney models are 10–60 kB). Run `pnpm profile` before and after: one glTF material
is one draw call per instance batch, so a pack with many materials per model costs more than the
procedural version, which merges into a handful of meshes per zone.
