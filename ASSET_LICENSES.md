# Asset licenses — BARBERSTRIKE (ex FRANKIBARBER: AFTER HOURS)

Drop 6b ships three third-party asset packs, all **CC0 or CC-BY**, all listed below. Everything else
is still generated at runtime, and the game runs with the packs deleted: a file the manifest does not
name, or one that fails to load, simply keeps its procedural version.

Where they live: the packs are kept COMPLETE under `apps/client/public/models/raw/<pack>/`, because
they are licensed as packs and the spare models are how a look gets swapped without another download.
The production build ships only the files `manifest.json` names (`pruneUnusedModels` in
`apps/client/vite.config.ts`) — measured 26 MB in `public/`, 7.3 MB in `dist/`.

### Third-party models

| Pack | Author | License | Attribution required | Files in the repo | Used by the game |
|---|---|---|---|---|---|
| Ultimate Modular Men Pack | [Quaternius](https://quaternius.com/) | CC0 1.0 (public domain) | no | 11 characters | `Hoodie Character.glb` (team FADE), `Business Man.glb` (team TAPER) |
| Low Poly Firearms Bundle | **austincford** | CC-BY 4.0 | **yes — see below** | 14 firearms | P320, Revolver, Mpa, MPX, MDR, MK14, SRSA1, RPG Launcher |
| Bottles | MiniPoly | CC0 1.0 (public domain) | no | 6 bottles | `Bottle.glb` (shelf bottles) |

**Required attribution (CC-BY 4.0):** *"Low Poly Firearms Bundle" by austincford, licensed under
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).* This line is shown in the game's
SETTINGS → CREDITS panel and must stay wherever the game is published.

Per-file mapping, as the manifest declares it:

| Weapon in game | Model file | Weapon in game | Model file |
|---|---|---|---|
| P9 Straight Razor (pistol) | `firearms/P320.glb` | K-7 Buzzcut (rifle) | `firearms/MDR.glb` |
| Snub .38 (revolver) | `firearms/Revolver.glb` | Fade Line (dmr) | `firearms/MK14.glb` |
| Clipper 9 (smg) | `firearms/Mpa.glb` | Long Comb (sniper) | `firearms/SRSA1.glb` |
| Trim 45 (smg2) | `firearms/MPX.glb` | Pomade Launcher | `firearms/RPG Launcher.glb` |

Three of the eleven weapons keep their procedural models, because the pack has nothing for them:
the **LMG**, the **shotgun** and the **clippers**.

Adding your own: drop a CC0/CC-BY glTF into `apps/client/public/models/`, name it in
`manifest.json`, and add a row here. Nothing else is accepted.

Everything else:

| Asset | Source | License | Purpose |
|---|---|---|---|
| Map geometry, props, and every model not listed above | Procedural (Babylon.js primitives, `apps/client/src/game/world`, `view`) | Project code (same as repository) | Environment, players, viewmodels |
| Textures (tiles, brick, concrete, wood, asphalt, metal, plaster, signs, posters, sky) | Procedural canvas generation (`materials.ts`, `props.ts`, `MapBuilder.ts`) | Project code | PBR albedo / emissive / sky |
| Particle sprites, decals, muzzle flash | Procedural radial gradients (`view/Effects.ts`) | Project code | VFX |
| All audio (gunshots, reloads, footsteps, hits, UI, ambience, music) | Procedural Web Audio synthesis (`apps/client/src/game/audio/*`) | Project code | SFX / ambience |
| Favicon | Hand-drawn SVG (`apps/client/public/favicon.svg`) | Project code | Browser tab icon |

## Fonts (self-hosted via npm, bundled with the client)

| Font | Author | License | Package |
|---|---|---|---|
| Bebas Neue | Ryoichi Tsunekawa (Dharma Type) | SIL Open Font License 1.1 | `@fontsource/bebas-neue` |
| Inter | Rasmus Andersson | SIL Open Font License 1.1 | `@fontsource/inter` |
| JetBrains Mono | JetBrains | SIL Open Font License 1.1 | `@fontsource/jetbrains-mono` |

## Libraries

Babylon.js (Apache-2.0), Colyseus (MIT), React (MIT), Vite (MIT) — see each package's LICENSE in `node_modules`.

No content from Call of Duty, Counter-Strike, Valorant, Fortnite, Battlefield or any other game is used.
