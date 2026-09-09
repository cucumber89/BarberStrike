/**
 * HUD render-cost bench (dev page, not shipped — Vite's build input is index.html alone).
 *
 * The report is "the interface is sluggish, everything should fly". That is a measurement, not an
 * opinion, so this mounts the REAL Hud, drives the store the way the network does (a snapshot
 * ~20x a second plus per-frame fields), and counts how many times React actually re-renders and
 * how long it spends doing it. `e2e/tools/hud-bench.mjs` reads the numbers off the page.
 */
import { createRoot } from "react-dom/client";
import { Profiler, useEffect } from "react";
import { MatchPhase, NIGHT_DISTRICT, quantSmokeOpacity } from "@frankibarber/shared";
import { Hud } from "./ui/Hud";
import { hud } from "./game/store";
import { defaultSettings } from "./settings";

interface Bench { commits: number; totalMs: number; maxMs: number; frames: number; done: boolean; times: number[] }
const bench: Bench = { commits: 0, totalMs: 0, maxMs: 0, frames: 0, done: false, times: [] };
(window as unknown as { bench: Bench }).bench = bench;

const noop = () => {};
const api = { buy: noop, sell: noop, close: noop, selectClass: noop } as never;

/** A full scoreboard: eight players, which is what a busy room actually looks like. */
const players = Array.from({ length: 8 }, (_, i) => ({
  id: `p${i}`, name: `Player ${i}`, team: (i % 2) as 0 | 1, kills: i, deaths: 8 - i, score: i * 100,
  ping: 20 + i, alive: true, connected: true, assists: i, money: 1000 + i * 100, bot: i > 2,
  boysClass: (i % 5) + 1,
}));

hud.set({
  connected: true, myId: "p0", myTeam: 0, health: 87, alive: true, weapon: "rifle", pointerLocked: true, armor: 50, tac: 0.7,
  ammo: 24, reserve: 90, phase: MatchPhase.Playing, players,
  money: 4300, scoreA: 7, scoreB: 5, mode: "bomb",
  killFeed: Array.from({ length: 5 }, (_, i) => ({
    key: i, at: performance.now(), killer: `p${i}`, killerName: `Player ${i}`, victim: `p${i + 1}`,
    victimName: `Player ${i + 1}`, weapon: "rifle", headshot: i % 2 === 0, killerTeam: 0, victimTeam: 1,
  })) as never,
} as never);

/**
 * Which parts of a live match to drive, from `?drive=` (default `snapshot`):
 *
 *   snapshot  the 20 Hz network patch only — the original bench
 *   smoke     plus `smokeOpacity`, which the view module writes EVERY frame while a cloud is on
 *             screen. A whole-HUD reconcile per frame is the worst case the store can produce, and
 *             a smoke grenade is how a player reaches it.
 *   radar     plus a live radar snapshot, so `Minimap` actually draws. It runs on its own rAF and
 *             never re-renders React, so the Profiler cannot see it at all — its cost shows up only
 *             in Chromium's ScriptDuration, which is why the tool reports that too.
 *   all       everything at once: the frame a player gets in a firefight inside smoke.
 */
const DRIVE = new URLSearchParams(location.search).get("drive") ?? "snapshot";
const DRIVES_SMOKE = DRIVE === "smoke" || DRIVE === "all";
const DRIVES_RADAR = DRIVE === "radar" || DRIVE === "all";

/** A radar snapshot shaped like `Game`'s: one mutated object, arrays rebuilt per frame. */
const radarSnap = {
  x: 0, z: 0, yaw: 0, alive: true, map: NIGHT_DISTRICT,
  mates: [] as { id: string; x: number; z: number; yaw: number; alive: boolean }[],
  spotted: [] as { x: number; z: number }[],
};
const radar = DRIVES_RADAR ? () => radarSnap : () => null;

/** Drives the store the way a live match does and stops after `RUN_MS`. */
function Driver() {
  useEffect(() => {
    const RUN_MS = 4000;
    const start = performance.now();
    let raf = 0;
    let tick = 0;
    let lastSnap = 0;
    const step = () => {
      const now = performance.now();
      if (now - start > RUN_MS) { bench.done = true; return; }
      bench.frames++;
      tick++;
      if (DRIVES_RADAR) {
        // Walking a circle: every frame changes the position AND the rotation of the map image.
        const a = tick / 120;
        radarSnap.x = 12 + Math.cos(a) * 6; radarSnap.z = 10 + Math.sin(a) * 6; radarSnap.yaw = a;
        radarSnap.mates = players.slice(0, 4).map((p, i) => ({ id: p.id, x: radarSnap.x + i * 2, z: radarSnap.z + i, yaw: a, alive: true }));
        radarSnap.spotted = [{ x: radarSnap.x + 8, z: radarSnap.z + 3 }, { x: radarSnap.x - 5, z: radarSnap.z + 9 }];
      }
      // The per-frame field: a cloud thinning out in front of the player.
      if (DRIVES_SMOKE) hud.set({ smokeOpacity: quantSmokeOpacity(0.35 + Math.sin(tick / 40) * 0.3) } as never);
      // What the game ACTUALLY writes, and how often: `Game.onSnapshot` publishes ~40 fields on
      // every network patch (~20 Hz), and two of them — `perks` and `players` — are rebuilt as new
      // objects each time, so the store's "did anything change" test always says yes.
      if (now - lastSnap >= 50) {
        lastSnap = now;
        hud.set({
          serverNow: now, health: 40 + (tick % 60), ammo: 30 - (tick % 30), money: 4300 - tick,
          crosshairSpread: 0.01 + (tick % 20) / 2000, tac: 1, ping: 24,
          perks: { flask: 0, roids: 0, energy: 0, fade: 0 },
          players: players.map((p) => ({ ...p })),
        } as never);
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, []);
  return null;
}

createRoot(document.getElementById("root")!).render(
  <Profiler id="hud" onRender={(_id, _phase, actual) => { bench.commits++; bench.totalMs += actual; bench.times.push(actual); if (actual > bench.maxMs) bench.maxMs = actual; }}>
      <Driver />
      <Hud
        settings={defaultSettings()} onSettings={noop} onLeave={noop}
        onResume={async () => true} onPause={noop} onFullscreen={async () => true}
        onChooseTeam={noop} onVotePlan={noop}
        shop={api} chat={{ send: noop, close: noop }} radar={radar}
      />
  </Profiler>,
);
