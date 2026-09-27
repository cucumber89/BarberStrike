# DOLNA design table (Drop W, 2026-09-26; v2 2026-09-27)

The layout proposal in `docs/MAP_3_DOLNA.md` §5, as data, with the harness that measured it —
and, since v2, the harness that measures the BUILT map (`proto-repo.ts` re-exports
`packages/shared/src/dolna.ts`). Nothing else here is registered in `MAPS`.

- `proto-repo.ts` — the map as built, in the harness's shape. This is what to measure now:
  `./apps/server/node_modules/.bin/tsx apps/client/e2e/tools/dolna/measure.mts apps/client/e2e/tools/dolna/proto-repo.ts`.
  Two of its checks are known to read wrong on a three-storey house: §6 (the climb chain) hops
  through walls, so it lists every upstairs floor and bed as "from" something outside — the
  repo test `dolna.test.ts` runs a wall-aware chain instead; and §5's "longest ≥ 50 m" cannot hold
  on a 46 m plot (the longest line is the 42 m road). §7's floating check wants a solid's bottom
  within 0.1 m of what carries it, which is why the shed chairs' back proxies sit 0.1 m over
  their seats.

- `proto-final.ts` — the proposed layout (127 solids, starts, stations, flags, sites, `PLACES`,
  `EXITS`); `proto-cs2.ts` and `proto-fidelity.ts` are the two rival drafts it was synthesised from;
  `proto-template.ts` is the empty form.
- `measure.mts <proto>` — emulates `map.test.ts` / `mapFlags` / `floorAudit` and the 1v1 audit of
  `map-duel.ts` (starts hidden, sprint routes from BOTH starts to the same places with the real
  mover, exits, sight lines, climb chain, cover language, floating) on any prototype; validated on
  GÓRA (7.8 % of surfaces see a start, 39.1 m start to start — the numbers `map-duel.ts` reports).
- `plan.mts <proto>` — the ASCII plan from the solids, like `map-plan.ts` but for any bounds.
- `both.mts`, `sight2.mts` — the two scratch checks quoted in §5.8 (no cell sees both starts;
  sight lines split into street↔street and the rest).
- `measure-final.md`, `plan-final.txt` — the outputs §5 quotes.

Run from the repo root: `./apps/server/node_modules/.bin/tsx apps/client/e2e/tools/dolna/measure.mts apps/client/e2e/tools/dolna/proto-final.ts`
