# Brief: weapon models, new weapons, and a simple shop

You are working in the **BarberStrike** repo (pnpm workspace: `packages/shared`, `apps/server`,
`apps/client` — Vite + React + Babylon.js 9). Read `docs/ARCHITECTURE.md` and
`docs/WEAPON_MATRIX.md` before you change anything.

There are three jobs. Do them in this order, each as its own commit.

---

## Job 1 — make every weapon model look good (EXCEPT the VZ-9 Trim)

**The VZ-9 Trim (`smg2`) is the quality bar. Do not touch it.** It is the one weapon that already
looks the way all of them should: a real silhouette nobody could confuse with another gun, details
that read at viewmodel distance, and parts that sit on each other instead of floating near each
other. Open its spec in `apps/client/src/game/view/weaponMeshes.ts`, study it, and bring the other
ten up to it.

The other ten are: `pistol`, `revolver`, `smg`, `rifle`, `lmg`, `shotgun`, `dmr`, `sniper`,
`launcher`, `clippers`.

### How the models are built

Every weapon is a pure data spec in `SPECS` in `apps/client/src/game/view/weaponMeshes.ts`
(~627 lines, read the whole file). No .glb files, no modelling tool — the geometry IS the spec, and
it is merged into one mesh per material so a weapon costs ≤ 8 draw calls however detailed it is.

- **Frame**: `+Z` = barrel direction, `+Y` = up, origin at the grip/trigger. Metres.
- **Primitives**: `B(w, h, d, x, y, z, mat, rot?)` for a box, `C(dia, len, x, y, z, mat, axis?)`
  for a cylinder.
- **Materials** (`MatKey`): `metal`, `steel`, `polymer`, `tan`, `wood`, `rubber`, `brass`, `lens`.
  Use them to separate parts visually — a gun in one material reads as a lump.
- **Reusable part helpers already there**: `rail()`, `frontSight()`, `triggerGuard()`, `grip()`,
  `ejectionPort()`, `slingLoop()`. Prefer them; add more if a shape repeats.
- **Per weapon the spec also names**: `muzzle`, `eject`, `magazine` + `magazinePos`, optional
  `action` (`slide` / `pump` / `bolt` — the part that moves when the gun cycles), `aimPoint`,
  `length`.

### What "good" means here, concretely

1. **A silhouette you can name in one frame.** No two weapons may share a profile. Art review has
   already flagged `smg`/`smg2` and `dmr`/`sniper` as twins in the past — fix that from the geometry
   side now.
2. **Nothing floats.** Every part touches the part it belongs to. This is enforced, see below.
3. **Detail that survives the viewmodel distance**: rails with real notches, hooded front sights and
   rear apertures, trigger guards, charging handles, ejection ports, muzzle devices with vents,
   stippled grips, sling loops, scope turrets. Detail nobody can see at 720p is wasted budget.
4. **Material contrast**: furniture in `tan` or `wood`, grips in `rubber`, receivers in `metal` or
   `steel`, optics glass in `lens`, small accents in `brass`.
5. **The real object**: a revolver's cylinder has chambers, a pump gun has a tube magazine under the
   barrel, a belt gun has a belt box. If a player who owns the real thing would wince, it is wrong.

### The gate you must keep green

```
pnpm check:weapons
```

It runs `apps/client/e2e/tools/weapon-parts.mjs` over every spec and currently passes **19/19**.
It judges:

- **Attachment**: every part must connect to the receiver through a chain of parts that touch
  within 5 mm. `parts[0]` is taken as the receiver, so put the receiver first.
- **The magazine seats in its well** — it must touch a static part, not hang below it.
- **Muzzle / eject / aim anchors lie inside the parts they name**, and the muzzle is at the END of
  the barrel, not past it.

If it drops below 19/19 you have broken something. Do not weaken the check to make it pass.

### What you must NOT change while doing this

- **`aimPoint`, `muzzle` and `length`** are measured values: `e2e/tools/vm-fit.mjs` proves every
  weapon's sights land within ±1 px of screen centre in ADS. Moving them silently breaks aim. If a
  redesign genuinely needs a new aim point, re-run the tool and record the new numbers in
  `docs/WEAPON_FIT.md`.
- **Anything in `packages/shared/src/weapons.ts` that is a gameplay number**: `damage`, `damageMin`,
  `rpm`, `magazine`, `reserve`, `pellets`, every `spread*`, `range`, `rangeMax`, `equipMs`. The TTK
  is tuned (see `docs/BUILD_STATE.md`, "The weapons") and the server reads these.
- **Anything under `apps/server/`.** This job is client-side geometry.

---

## Job 2 — add a few new weapons

Add **three** new weapons. Propose them first in one short paragraph each (what it is, who picks it
up, why the roster is missing it), then build them.

Pick them to fill real gaps. The current roster is: two sidearms (fast pistol, heavy revolver), two
SMGs, an assault rifle, an LMG, a pump shotgun, a DMR, a bolt sniper, a grenade launcher, and the
clippers (melee). Think about what a player reaches for and cannot find. Lean into the setting —
this is an after-hours barber shop arena, and the guns are named for haircuts (P9 Straight Razor,
K-7 Buzzcut, AR-31 Pompadour, MG-4 Bulk, S12 Wet Shave, M-1 Clean Line, SR-50 Longcut, GL-1
Blowout). A new weapon needs a name in that family.

### Every place a new weapon must be registered

A `WeaponId` is a union type and about ten `Record<WeaponId, …>` tables are exhaustive, so the
compiler will find most of these — but miss one and the game breaks at runtime, not build time:

| File | What to add |
|---|---|
| `packages/shared/src/weapons.ts` | the `WeaponId` union, the `WEAPONS` entry (full `WeaponDef`), `WEAPON_ORDER`, and `PRIMARY_ORDER` or `SECONDARY_ORDER` |
| `packages/shared/src/economy.ts` | `WEAPON_PRICES` |
| `packages/shared/src/modes.ts` | the Gun Game `ladder` |
| `packages/shared/src/skinsField.ts` | the skin field mapping |
| `apps/client/src/game/view/weaponMeshes.ts` | the `SPECS` entry — the model |
| `apps/client/src/game/combat/weaponFeel.ts` | the `WEAPON_FEEL` row (handling and presentation) |
| `apps/client/src/game/audio/sfx.ts` | the `GUNS` voice row |
| `apps/client/src/game/view/Viewmodel.ts`, `Character.ts` | pose / hold tables |
| `apps/client/src/game/progression/profile.ts` | per-weapon stats |
| `apps/server/src/rooms/TdmRoom.ts` | only if an exhaustive table there demands it — do not change server logic |
| `docs/WEAPON_MATRIX.md` | a row: the six feel axes, in words and numbers |

### Balance rules for the new ones

- New weapons may have new numbers, but they must land **inside the existing band** — body kills
  between roughly 277 ms (rifle) and 429 ms (pistol). `packages/shared/src/balance.test.ts` checks
  this; it must pass.
- Do not move any EXISTING weapon's numbers to make room for a new one.
- Each new weapon needs a distinct feel signature. `weaponFeel.test.ts` asserts that no two weapons
  in the roster are closer than **0.9** on the normalised signature axes — if your new weapon lands
  too close to an old one, that test fails and the answer is to make the weapon more distinct, not
  to lower the threshold.

---

## Job 3 — a simple shop, with simple pictures

The buy menu is `apps/client/src/ui/Shop.tsx` (~310 lines). It is already laid out as four aisles
of short rows with two-key shortcuts (`1·4` = aisle 1, position 4) — **keep that structure, it
works.** The job is to make it read at a glance, not to redesign it.

**The one thing missing: pictures.** The `row()` helper already takes an `art` parameter as its
fourth argument, and **every caller currently passes `null`** — weapons, grenades, armour and perks
alike. Fill it.

- Small inline SVG components, one per item: weapon silhouettes, a grenade, a plate, a can, the
  clippers. Flat, single-colour, no gradients — they sit in a `~28 px` row slot at 720p, so a
  recognisable outline beats detail every time.
- Follow the precedent in `apps/client/src/ui/menuArt.tsx` (`MODE_ART`, `NAV_ART`, `mapArt`) —
  inline SVG React components, no image files, nothing added to the bundle but markup.
- Put them in a new `apps/client/src/ui/shopArt.tsx` and key them by id so a new weapon gets its
  picture by adding one entry.
- Style the slot in `apps/client/src/ui/styles.css` (`.shop-row-art` already exists).

**"Simple" means fewer things to read, not fewer things you can do.** Do not remove the sell
button, the price, the "TOO POOR" reason, or the shortcut keys — a player uses all of them under
time pressure. Make the row scannable: picture, name, the one stat that decides it, price.

---

## Verify before you say you are done

```
pnpm typecheck          # must be clean
pnpm test               # whole workspace, must be green
pnpm build              # must succeed
pnpm check:weapons      # 19/19 or better, never fewer
```

Then look at what you made, with the dev servers running
(`pnpm --filter @frankibarber/server dev` with `FB_DEV_TOOLS=1`, and
`pnpm --filter @frankibarber/client dev`):

```
node apps/client/e2e/tools/weapon-shots.mjs     # idle / ADS / reload / inspect, both persons
node apps/client/e2e/tools/vm-fit.mjs           # ADS alignment in pixels
node apps/client/e2e/tools/hand-pose.mjs        # third-person bore angles
```

Screenshots land under `apps/client/e2e/out/`. **Look at every one of them.** A weapon that passes
`check:weapons` can still look wrong, and a screenshot is the only thing that will tell you.

## Ground rules

- One commit per job, imperative subject, and a body that says **why** — the mechanism, the
  measurement — not what the diff already shows.
- Do not weaken, skip or delete a test to get green.
- If a change would move damage, TTK, a schema field, or anything in `apps/server/`, stop and say so
  instead of doing it.
- Do not touch the VZ-9 Trim.
