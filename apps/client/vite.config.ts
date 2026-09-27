import { readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative, resolve } from "node:path";

// `__dirname` is not defined in an ES module, and this config IS one (`"type": "module"`).
// Vite happens to inject a shim when it bundles the config, but relying on that makes the build
// depend on an implementation detail of the tool loading it; `import.meta.url` is the language's
// own answer and behaves the same on every platform.
const HERE = dirname(fileURLToPath(import.meta.url));
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

/**
 * Ships only the models the manifest actually names.
 *
 * `public/` is copied into the build wholesale, so the CC0/CC-BY packs — kept complete in the repo
 * because they are licensed as packs and useful for swapping a look — would put 26 MB into `dist`
 * to serve the ~4.5 MB the game loads. Dev keeps every file, so editing the manifest and reloading
 * still works; the pruning happens once, on the built output.
 *
 * Anything not under `models/` is untouched, and a missing or unreadable manifest prunes nothing.
 */
function pruneUnusedModels(): Plugin {
  return {
    name: "fb-prune-unused-models",
    apply: "build",
    closeBundle() {
      const dir = resolve(HERE, "dist/models");
      let used: Set<string>;
      try {
        const doc = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8")) as Record<string, unknown>;
        used = new Set<string>();
        const add = (v: unknown) => { if (v && typeof v === "object" && typeof (v as { file?: unknown }).file === "string") used.add((v as { file: string }).file.replace(/\\/g, "/")); };
        for (const section of ["characters", "weapons", "props", "models"]) {
          const s = doc[section];
          if (Array.isArray(s)) s.forEach(add);
          else if (s && typeof s === "object") Object.values(s).forEach(add);
        }
      } catch {
        return;   // no manifest, or it is not readable: ship everything rather than guess
      }
      let removed = 0, bytes = 0;
      const walk = (d: string): void => {
        for (const name of readdirSync(d)) {
          const full = join(d, name);
          if (statSync(full).isDirectory()) { walk(full); continue; }
          if (!/\.(glb|gltf|bin)$/i.test(name)) continue;
          if (used.has(relative(dir, full).replace(/\\/g, "/"))) continue;
          bytes += statSync(full).size;
          rmSync(full);
          removed++;
        }
      };
      try { walk(dir); } catch { return; }
      if (removed) console.log(`[models] pruned ${removed} unused file(s), ${(bytes / 1048576).toFixed(1)} MB`);
    },
  };
}

/**
 * The model creator's back door (dev server only): `/voxel-lab.html` running locally can save a
 * model into the library and place a piece on DOLNA without anybody opening an editor. Two POSTs:
 *   /__voxel/save   { id, text, w, h, d }  → `T.<id> = \`…\`;` written or replaced in
 *                                            packages/shared/src/voxelModels.ts, and the footprint
 *                                            added to DOLNA_FURNITURE if it is new;
 *   /__voxel/place  { id, x, z, yaw, floor } → a `furn("id", x, z, DIR, Y(floor));` line appended
 *                                            to the [KREATOR] block of packages/shared/src/dolna.ts.
 * Vite's own reload then shows the change in the game and in the creator. Nothing of this exists
 * in a build: the deployed page only copies text.
 */
function voxelCreatorApi(): Plugin {
  const MODELS = resolve(HERE, "../../packages/shared/src/voxelModels.ts");
  const MAP = resolve(HERE, "../../packages/shared/src/dolna.ts");
  const ID = /^[a-z][a-z0-9_]{0,40}$/;
  const num = (v: unknown, lo: number, hi: number) => { const n = Number(v); if (!Number.isFinite(n) || n < lo || n > hi) throw new Error(`liczba poza zakresem: ${String(v)}`); return Math.round(n * 100) / 100; };
  const body = (req: import("node:http").IncomingMessage) => new Promise<Record<string, unknown>>((ok, bad) => {
    let data = ""; req.on("data", (c: Buffer) => { data += c; if (data.length > 200_000) bad(new Error("za duże")); }); req.on("end", () => { try { ok(JSON.parse(data)); } catch (e) { bad(e); } });
  });
  const save = (b: Record<string, unknown>) => {
    const id = String(b.id ?? ""), text = String(b.text ?? "");
    if (!ID.test(id)) throw new Error("id: małe litery, cyfry, podkreślenie, bez spacji");
    if (!text.startsWith(`#model ${id}\n`)) throw new Error("tekst nie zaczyna się od #model " + id);
    if (text.includes("`") || text.includes("${")) throw new Error("tekst nie może zawierać ` ani ${");
    let src = readFileSync(MODELS, "utf8");
    const block = `T.${id} = \`${text.endsWith("\n") ? text : text + "\n"}\`;\n`;
    const re = new RegExp("T\\." + id + " = `[\\s\\S]*?`;\\n");
    let what: string;
    if (re.test(src)) { src = src.replace(re, block); what = "zastąpiony"; }
    else {
      const at = src.indexOf("export const VOXEL_TEXT");
      if (at < 0) throw new Error("voxelModels.ts bez VOXEL_TEXT");
      src = src.slice(0, at) + "// [kreator]\n" + block + "\n" + src.slice(at); what = "dodany";
    }
    writeFileSync(MODELS, src);
    let map = readFileSync(MAP, "utf8");
    const w = num(b.w, 0.05, 20), h = num(b.h, 0.05, 20), d = num(b.d, 0.05, 20);
    const marker = "  // [kreator] footprints added by the creator go below (keep this line)\n";
    const rowRe = new RegExp("^\\s*" + id + ": \\[[^\\]]*\\],?\\s*$", "m");
    if (rowRe.test(map)) map = map.replace(rowRe, `  ${id}: [${w}, ${h}, ${d}],`);
    else if (map.includes(marker)) map = map.replace(marker, marker + `  ${id}: [${w}, ${h}, ${d}],\n`);
    else throw new Error("dolna.ts bez znacznika [kreator] w DOLNA_FURNITURE");
    writeFileSync(MAP, map);
    return { ok: true, what, file: "packages/shared/src/voxelModels.ts", footprint: [w, h, d] };
  };
  const place = (b: Record<string, unknown>) => {
    const id = String(b.id ?? "");
    if (!ID.test(id)) throw new Error("zły id");
    const x = num(b.x, -30, 30), z = num(b.z, -10, 40), floor = Math.round(num(b.floor, 0, 2));
    const dir = String(b.yaw ?? "N"); if (!["N", "E", "W", "SO"].includes(dir)) throw new Error("kierunek: N, E, W, SO");
    let map = readFileSync(MAP, "utf8");
    if (!new RegExp("^\\s*" + id + ": \\[", "m").test(map)) throw new Error(`najpierw ZAPISZ model ${id} w bibliotece`);
    const marker = "// when tidying, or leave it — the map does not care where a line stands.\n";
    if (!map.includes(marker)) throw new Error("dolna.ts bez bloku [KREATOR]");
    const line = `furn("${id}", ${x}, ${z}, ${dir}${floor ? `, Y(${floor})` : ""});   // [kreator]\n`;
    map = map.replace(marker, marker + line);
    writeFileSync(MAP, map);
    return { ok: true, line: line.trim() };
  };
  return {
    name: "fb-voxel-creator-api",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith("/__voxel/")) return next();
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        try {
          if (req.url === "/__voxel/ping") { res.end(JSON.stringify({ ok: true })); return; }
          if (req.method !== "POST") { res.statusCode = 405; res.end(JSON.stringify({ error: "POST" })); return; }
          const b = await body(req);
          if (req.url === "/__voxel/save") { res.end(JSON.stringify(save(b))); return; }
          if (req.url === "/__voxel/place") { res.end(JSON.stringify(place(b))); return; }
          res.statusCode = 404; res.end(JSON.stringify({ error: "nieznane" }));
        } catch (e) { res.statusCode = 400; res.end(JSON.stringify({ error: String((e as Error).message) })); }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), pruneUnusedModels(), voxelCreatorApi()],
  // Inline (empty) PostCSS config: an inline object makes Vite skip the postcss.config.js search
  // entirely. Without it the search is meant to stop at the pnpm workspace root, but on Windows the
  // stop directory (posix-normalised by Vite) never matches the backslash path lilconfig walks, so
  // the search escapes into the SideQuest repo root and loads its postcss.config.js, which requires
  // autoprefixer that this workspace does not install ("Cannot find module 'autoprefixer'").
  css: { postcss: {} },
  server: { port: 5174, strictPort: true },
  build: {
    target: "es2022",
    sourcemap: false,
    chunkSizeWarningLimit: 4000,
    rollupOptions: {
      // The voxel creator ships with the game (the owner draws furniture on the deployed site);
      // the other review pages stay dev-only.
      input: { main: resolve(HERE, "index.html"), lab: resolve(HERE, "voxel-lab.html") },
      output: {
        // No manual chunk for Babylon: forcing the whole package into one chunk defeats
        // tree-shaking of the deep imports (measured 2.9 MB → far less when left to Rollup).
        manualChunks: { react: ["react", "react-dom"] },
      },
    },
  },
});
