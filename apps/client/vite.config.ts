import { readFileSync, readdirSync, rmSync, statSync } from "node:fs";
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

export default defineConfig({
  plugins: [react(), pruneUnusedModels()],
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
      output: {
        // No manual chunk for Babylon: forcing the whole package into one chunk defeats
        // tree-shaking of the deep imports (measured 2.9 MB → far less when left to Rollup).
        manualChunks: { react: ["react", "react-dom"] },
      },
    },
  },
});
