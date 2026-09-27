/**
 * `pnpm kreator` — starts the dev client and opens the model creator in the browser.
 * The creator saves straight into the library (packages/shared/src/voxelModels.ts) and places
 * pieces on DOLNA (packages/shared/src/dolna.ts) through the dev server; the game page reloads.
 */
import { spawn } from "node:child_process";
import { platform } from "node:os";
const url = "http://localhost:5174/voxel-lab.html";
const vite = spawn("pnpm", ["--filter", "@frankibarber/client", "dev"], { stdio: "inherit", shell: platform() === "win32" });
const open = () => {
  const cmd = platform() === "win32" ? ["cmd", ["/c", "start", "", url]] : platform() === "darwin" ? ["open", [url]] : ["xdg-open", [url]];
  spawn(cmd[0], cmd[1], { stdio: "ignore", detached: true }).on("error", () => {}).unref();
};
setTimeout(() => { console.log(`\n  KREATOR MODELI: ${url}\n  (gra: http://localhost:5174 — do gry uruchom osobno serwer: pnpm --filter @frankibarber/server dev)\n`); open(); }, 2500);
process.on("SIGINT", () => { vite.kill("SIGINT"); process.exit(0); });
