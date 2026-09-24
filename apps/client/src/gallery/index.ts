/**
 * The HUD state gallery's catalogue: the scenarios and pins of the seven package files, merged.
 *
 * Owned by P0 and frozen for drop U (docs/UI_U_SPEC.md §7.0, P0 step 0b). Each wave-2 package owns
 * one file beside this one and edits only that file: the scenario STATES it owns (§5.2) and the
 * PINS it keeps on its own zones, including pins on scenarios another package owns (§8.7). This
 * module tags every pin with the package that wrote it, so a failure names its owner, and it
 * refuses a catalogue that contradicts itself (the runner reports `GALLERY_PROBLEMS` as the
 * page's error rather than photographing a half-built gallery).
 */
import * as death from "./death";
import * as top from "./top";
import * as left from "./left";
import * as corners from "./corners";
import * as moments from "./moments";
import * as end from "./end";
import * as screens from "./screens";
import type { PinSet, Pins, Pkg, Scenario } from "./fixtures";

/** The package files, in package order (§7). */
const PACKAGES: readonly (readonly [Pkg, { scenarios: Scenario[]; pins: PinSet }])[] = [
  ["P1", death], ["P2", top], ["P3", left], ["P4", corners], ["P5", moments], ["P6", end], ["P7", screens],
];

/** A scenario with the package whose file holds its state. */
export interface OwnedScenario extends Scenario { owner: Pkg }
/** One package's pins on one scenario. */
export interface TaggedPins extends Pins { pkg: Pkg }

const problems: string[] = [];
const owned: OwnedScenario[] = [];
const seen = new Map<string, Pkg>();
for (const [pkg, file] of PACKAGES) {
  for (const sc of file.scenarios) {
    const dup = seen.get(sc.id);
    if (dup) problems.push(`scenario "${sc.id}" is defined by both ${dup} and ${pkg}`);
    seen.set(sc.id, pkg);
    owned.push({ ...sc, owner: pkg });
  }
}
const rows = new Map<number, string>();
for (const sc of owned) {
  const other = rows.get(sc.n);
  if (other !== undefined) problems.push(`scenarios "${other}" and "${sc.id}" share the §5.2 row ${sc.n}`);
  rows.set(sc.n, sc.id);
}

/** Every scenario, in the order of the spec's state table (§5.2). */
export const SCENARIOS: readonly OwnedScenario[] = owned.sort((a, b) => a.n - b.n);

/** Every package's pins, by scenario id, in package order. */
export const PINS: Readonly<Record<string, readonly TaggedPins[]>> = (() => {
  const out: Record<string, TaggedPins[]> = {};
  for (const [pkg, file] of PACKAGES) {
    for (const [id, pins] of Object.entries(file.pins)) {
      if (!seen.has(id)) { problems.push(`${pkg} pins an unknown scenario "${id}"`); continue; }
      (out[id] ??= []).push({ ...pins, pkg });
    }
  }
  return out;
})();

/** What is wrong with the catalogue itself; empty when it is sound. */
export const GALLERY_PROBLEMS: readonly string[] = problems;
