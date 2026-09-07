#!/usr/bin/env node
/**
 * weapon-parts (2.1, drop A): "nothing floats", as a number.
 *
 * Runs the parts check (`src/game/view/weaponParts.check.test.ts`) on every weapon — the glTF ones
 * through the real import pipeline on Babylon's NullEngine, the procedural ones from their specs —
 * and writes the table to `e2e/out/weapons/parts.md` (+ `.json`). Prints ONLY the summary line
 * and the failing rows, so the interesting part fits in a terminal or a chat.
 *
 *   pnpm check:weapons            # from the repo root
 *   node e2e/tools/weapon-parts.mjs [--out <dir>] [--all]     # from apps/client
 *
 * Exit code: 0 when every weapon passes, 1 otherwise (so CI can gate on it).
 * `--all` prints every weapon's part rows, not just the failing ones.
 */
import { spawnSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const client = resolve(here, "../..");
const args = process.argv.slice(2);
const outIdx = args.indexOf("--out");
const outDir = outIdx >= 0 ? resolve(args[outIdx + 1]) : resolve(client, "e2e/out/weapons");
const all = args.includes("--all");

const run = spawnSync("pnpm", ["exec", "vitest", "run", "weaponParts.check", "--reporter=dot"], {
  cwd: client,
  stdio: ["ignore", "pipe", "pipe"],
  env: { ...process.env, WEAPON_PARTS_OUT: outDir, CI: "1" },
  shell: process.platform === "win32",
});

const json = resolve(outDir, "parts.json");
if (!existsSync(json)) {
  process.stdout.write(run.stdout?.toString() ?? "");
  process.stderr.write(run.stderr?.toString() ?? "");
  console.error(`weapon-parts: no report written to ${json} (vitest exit ${run.status})`);
  process.exit(run.status || 1);
}

const { summary, reports } = JSON.parse(readFileSync(json, "utf8"));
const mm = (m) => (m * 1000).toFixed(1);
console.log(summary);
for (const r of reports) {
  if (r.ok && !all) continue;
  console.log(`\n${r.id} (${r.source}) receiver=${r.receiver} — ${r.ok ? "PASS" : "FAIL"}`);
  for (const p of r.parts) if (all || !p.attached) console.log(`  part ${p.name.padEnd(28)} toReceiver ${mm(p.toReceiver).padStart(7)} mm  nearest ${p.nearest} (${mm(p.toNearest)} mm)${p.attached ? "" : "  FLOATING"}`);
  for (const a of r.anchors) if (all || !a.ok) console.log(`  anchor ${a.anchor.padEnd(12)} on ${(a.expected || "—").padEnd(24)} gap ${mm(a.gap).padStart(7)} mm${a.ok ? "" : "  OFF"}${a.note ? `  (${a.note})` : ""}`);
}
console.log(`\nfull table: ${resolve(outDir, "parts.md")}`);
process.exit(run.status === 0 ? 0 : 1);
