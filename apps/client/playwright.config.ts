import { defineConfig } from "@playwright/test";

/**
 * End-to-end multiplayer tests. Expects the dev server (client :5174) and the game server (:2567)
 * to be running — `pnpm dev` from the repo root — unless PW_WEBSERVER=1 is set, in which case
 * Playwright launches both itself.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 120_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: process.env.PW_BASE_URL ?? "http://localhost:5174",
    headless: true,
    viewport: { width: 1280, height: 720 },
    launchOptions: {
      // The sandbox ships a pinned Chromium; PW_CHROMIUM overrides the bundled download.
      executablePath: process.env.PW_CHROMIUM || undefined,
      args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--enable-webgl", "--disable-gpu-sandbox"],
    },
  },
  webServer: process.env.PW_WEBSERVER
    ? [
        {
          // The suite drives `dev:teleport` and `dev:endmatch`, which the room only registers with
          // this set. It used to be left to the caller's environment, and a run without it did not
          // fail — teleport quietly did nothing and the tests coped, which is worse.
          command: "pnpm --filter @frankibarber/server dev",
          env: { FB_DEV_TOOLS: "1" },
          port: 2567, reuseExistingServer: true, timeout: 60_000,
        },
        { command: "pnpm --filter @frankibarber/client dev", port: 5174, reuseExistingServer: true, timeout: 60_000 },
      ]
    : undefined,
});
