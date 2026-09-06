// Bundles the server into dist/index.js. Workspace package @frankibarber/shared is
// inlined (it ships TypeScript source); every other dependency stays external.
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const sharedEntry = path.resolve(here, "../../packages/shared/src/index.ts");

await build({
  entryPoints: [path.join(here, "src/index.ts")],
  outfile: path.join(here, "dist/index.js"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  sourcemap: true,
  packages: "external",
  plugins: [{
    name: "inline-shared",
    setup(b) {
      b.onResolve({ filter: /^@frankibarber\/shared$/ }, () => ({ path: sharedEntry }));
    },
  }],
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
});
console.log("server bundled -> dist/index.js");
