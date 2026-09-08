# Drop D evidence — how to regenerate it

Everything under `apps/client/e2e/out/d/` is generated. `e2e/out/` is git-ignored, so these are the
commands, not the files.

All of them talk to a BUILT client served by the game server on one port — the arrangement a player
actually uses — rather than to the Vite dev pair:

```
pnpm --filter @frankibarber/client build
pnpm --filter @frankibarber/server build
FB_DEV_TOOLS=1 PORT=2601 node apps/server/dist/index.js     # another shell
```

| What it proves | Command | Output |
|---|---|---|
| Join by link: `/r/<room>?mode=…` is the page, the lobby asks for a nickname only, and the server lists that room in that mode — plus the 2.0 single-port claim | `HOST_URL=http://localhost:2601 node apps/client/e2e/tools/hostcheck.mjs` | `out/d/hostcheck.md`, exit code |
| The whole Gun Game ladder, two clients, eleven rungs to the clippers | `cd apps/client && PW_BASE_URL=http://localhost:2601 PW_CHROMIUM=/opt/pw-browsers/chromium-1194/chrome-linux/chrome npx playwright test e2e/multiplayer.spec.ts -g "gun game"` | `out/d/gungame/{mid-ladder,result}.png` |
| A clippers kill converting a player, in two browsers | …`-g "ostrzyzeni"` | `out/d/ostrzyzeni/converted-*.png` |
| The shaved head itself, next to an unshaved one from the same camera (L3) | `cd apps/client && HOST_URL=http://localhost:2601 node e2e/tools/shaved-shots.mjs` | `out/d/ostrzyzeni/{shaved-front,shaved-side,unshaved-front}.png` |
| A round of Ostrzyżeni with bots, as numbers over a minute | `cd apps/client && HOST_URL=http://localhost:2601 node e2e/tools/infection-shots.mjs` | `out/d/ostrzyzeni/*.png` + a table on stdout |

`infection-shots.mjs` is the one that says the mode is not finished as a game: it prints the shaved
count every ten seconds, and in three separate runs it stayed at 1 of 5 for the whole round. See the
owner decision in `docs/PLAN_2_1.md`.
