# DOLNA design table (Drop W, 2026-09-26)

The layout proposal in `docs/MAP_3_DOLNA.md` §5, as data, with the harness that measured it.
Nothing here is registered in `MAPS`; the repo's generic map suite does not see these files.

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
