import { test, expect, type BrowserContext, type Page } from "@playwright/test";

/**
 * Drop U, P1 (docs/UI_U_SPEC.md §7 P1 "ACCEPTANCE"): the HUD's live state against a REAL room —
 * two browsers, the game server on :2567 started with `FB_DEV_TOOLS=1` (the teleport hook).
 *
 * - The round modes' buy window: shut in a duel's break, open for the 5 s tail after the release.
 * - The killer card's facts: the killer's HP is their replicated health, and the respawn deadline
 *   the card counts to is the moment the server revives (± 150 ms).
 * - Spectating: a player killed in a duel watches the other player, through their eye.
 * - The respawn: from `S2C.Spawn` on the store says alive, and the card fades its last frame — it
 *   never redraws the dead copy while the patch is on its way.
 * - A late joiner in a live bomb round (spawned and put down in one tick, no `S2C.Kill`) is dead
 *   locally too, and watches a living teammate through their eye, under „DOŁĄCZYSZ W NASTĘPNEJ
 *   RUNDZIE”.
 *
 * The pictures go to e2e/out/u/p1/. Everything is read through the dev handle `window.__fb`
 * (the store, `hud.get()`, and the game), never through the HUD's words.
 */

interface Killer { id: string; hp: number; armor: number; dealt: number; taken: number }
interface Hud {
  myId: string; alive: boolean; health: number; phase: string; mode: string; serverNow: number; spawnProtectedUntil: number;
  phaseEndsAt: number; buyWindowLeft: number; respawnAt: number; diedAt: number; killer: Killer | null;
  spectating: { id: string; name: string; health: number } | null; lateJoin: boolean;
  bomb: { result: string } | null; roundResult: string;
}
interface V3 { x: number; y: number; z: number }
interface DebugHandle {
  hud: { get(): Hud };
  game: {
    frameCount: number;
    inputState: { pointerLocked: boolean };
    localPlayer: { body: V3; yaw: number; pitch: number; alive: boolean; camera: { position: V3 } };
    remotePlayers: { get(id: string): { eye(out: { set(x: number, y: number, z: number): unknown }): unknown; isHidden: boolean } | undefined };
    events: { on(type: string, cb: () => void): () => void };
    conn: { send(t: string, m: unknown): void; state: { players: { get(id: string): (V3 & { health: number; alive: boolean }) | undefined } } };
  };
}
declare global { interface Window { __fb: DebugHandle; __p1SpawnAt?: number; __p1SpawnAlive?: boolean; __p1Texts?: string[] } }

const LOW_SETTINGS = JSON.stringify({ graphics: { preset: "low", renderer: "webgl2", renderScale: 0.5, shadows: "off", postProcessing: false, effects: 0.3, antialiasing: false, importedModels: false } });
const ctxOpts = { viewport: { width: 1280, height: 720 } };
const OUT = "e2e/out/u/p1";
/** `respawnDelayMs("tdm")` in shared `rounds.ts`: the e2e file does not import shared at run time. */
const TDM_RESPAWN_MS = 3200;

const hud = (p: Page) => p.evaluate(() => window.__fb.hud.get());

/**
 * A browser that joins `mode` with no bots. The duel is played on its own arena (`DUEL_MAP_ID`,
 * „gora”) and its room lists that map, so a join asking for another map matches no duel room and
 * opens its own: both players ask for the arena.
 */
async function newPlayer(ctx: BrowserContext, mode: string): Promise<Page> {
  const map = mode === "duel" ? "gora" : "night_district";
  await ctx.addInitScript(([v, m, mp]) => { localStorage.setItem("fb_settings_v1", v); localStorage.setItem("fb_mode", m); localStorage.setItem("fb_map", mp); localStorage.setItem("fb_bots", "0"); }, [LOW_SETTINGS, mode, map] as const);
  return ctx.newPage();
}

async function joinRoom(page: Page, name: string, room: string): Promise<void> {
  await page.goto("/");
  await page.getByTestId("btn-play").click();
  await page.getByTestId("input-name").fill(name);
  await page.getByTestId("input-room").fill(room);
  await page.getByTestId("btn-quickplay").click();
  await page.getByTestId("enter-game").click({ timeout: 60_000 });
  await expect(page.getByTestId("hud")).toBeVisible({ timeout: 30_000 });
  await page.waitForFunction(() => window.__fb?.game && window.__fb.hud.get().myId !== "", null, { timeout: 30_000 });
}

/** Headless has no real pointer lock: pretend the canvas holds it, so the input layer takes keys. */
async function fakeLock(page: Page): Promise<void> {
  await page.evaluate(() => {
    const canvas = document.querySelector("canvas") as HTMLCanvasElement;
    Object.defineProperty(document, "pointerLockElement", { get: () => canvas, configurable: true });
    document.dispatchEvent(new Event("pointerlockchange"));
  });
  await page.waitForFunction(() => window.__fb.game.inputState.pointerLocked);
}

async function waitForFrames(page: Page, n: number): Promise<void> {
  const start = await page.evaluate(() => window.__fb.game.frameCount);
  await page.waitForFunction((target) => window.__fb.game.frameCount >= target, start + n, { timeout: 60_000 });
}

const lookAt = (page: Page, t: V3) => page.evaluate(({ x, y, z }) => {
  const lp = window.__fb.game.localPlayer;
  const b = lp.body;
  const dx = x - b.x, dz = z - b.z, dy = y - (b.y + 1.62);
  lp.yaw = Math.atan2(dx, dz);
  lp.pitch = -Math.atan2(dy, Math.hypot(dx, dz));
}, t);

const stateOf = (page: Page, id: string) => page.evaluate((pid) => {
  const s = window.__fb.game.conn.state.players.get(pid)!;
  return { x: s.x, y: s.y, z: s.z, health: s.health, alive: s.alive };
}, id);

/**
 * Where the shooter stands to kill: close sides first (1.5 m — `dev:teleport` checks only the
 * world, not bodies), then the old 2.5–3.5 m ring. MEASURED 2026-09-25 on the duel's „gora”: with
 * the old ring alone B never killed A in round 1 (veil-cost exit 2, "B could not kill A"); with the
 * close sides first A died in all 5 rounds (1.5,0 was refused, inside a wall, in rounds 1–3). A side
 * the room refuses (the shooter did not arrive) is skipped, not shot from.
 */
const SIDES: [number, number][] = [[1.5, 0], [-1.5, 0], [0, 1.5], [0, -1.5], [3.5, 0], [-3.5, 0], [0, 3.5], [0, -3.5], [2.5, 2.5], [-2.5, -2.5]];

/**
 * The shooter walks up to the victim (dev teleport, trying a few sides for a line of sight) and
 * fires bursts until the victim is down — the kill sequence of `multiplayer.spec.ts`.
 */
async function kill(shooter: Page, victim: Page, victimId: string): Promise<void> {
  const burst = async () => { await shooter.mouse.down(); await waitForFrames(shooter, 2); await shooter.mouse.up(); await waitForFrames(shooter, 1); };
  for (const [ox, oz] of SIDES) {
    const t = await stateOf(shooter, victimId);
    if (!t.alive) return;
    await shooter.evaluate(([x, y, z]) => window.__fb.game.conn.send("dev:teleport", { x, y, z }), [t.x + ox, t.y, t.z + oz]);
    await shooter.waitForTimeout(400);
    const at = await shooter.evaluate(() => { const p = window.__fb.game.localPlayer.body; return { x: p.x, z: p.z }; });
    if (Math.hypot(at.x - (t.x + ox), at.z - (t.z + oz)) > 1) continue; // refused: inside a wall
    for (let i = 0; i < 25; i++) {
      await lookAt(shooter, { x: t.x, y: t.y + 1.2, z: t.z });
      await burst();
      if (!(await hud(victim)).alive) return;
      if (i % 6 === 5) { await shooter.keyboard.press("KeyR"); await shooter.waitForTimeout(1500); }
    }
  }
}

test.describe("P1: the HUD's live state", () => {
  test("duel: the buy window through a round, and the dead watch the living", async ({ browser }) => {
    test.setTimeout(300_000);
    const ca = await browser.newContext(ctxOpts), cb = await browser.newContext(ctxOpts);
    const errors: string[] = [];
    try {
      const a = await newPlayer(ca, "duel"), b = await newPlayer(cb, "duel");
      for (const p of [a, b]) p.on("pageerror", (e) => errors.push(e.message));
      const room = `hudfeed-duel-${Date.now()}`;
      await joinRoom(a, "OFIARA", room); await joinRoom(b, "STRZELEC", room);
      await fakeLock(a); await fakeLock(b);
      await expect.poll(async () => (await hud(a)).mode, { timeout: 15_000 }).toBe("duel");
      const idA = (await hud(a)).myId, idB = (await hud(b)).myId;

      // The freeze: the shop is open to its end. Then the release: 5 s of tail, counted down.
      await b.waitForFunction(() => { const h = window.__fb.hud.get(); return h.phase === "prep" && h.alive; }, null, { timeout: 90_000 });
      expect((await hud(b)).buyWindowLeft, "the freeze is the buy window").toBeGreaterThan(5_000);
      await b.waitForFunction(() => window.__fb.hud.get().phase === "playing", null, { timeout: 30_000, polling: "raf" });
      const tail = (await hud(b)).buyWindowLeft;
      expect(tail, "the buy tail after the release").toBeGreaterThan(0);
      expect(tail).toBeLessThanOrEqual(5_000);
      await b.waitForFunction(() => window.__fb.hud.get().buyWindowLeft === 0, null, { timeout: 7_000 });

      // B kills A: the round ends on the kill, and the break begins.
      await a.waitForFunction(() => { const h = window.__fb.hud.get(); return h.serverNow > h.spawnProtectedUntil + 500; }, null, { timeout: 15_000 });
      await kill(b, a, idA);
      expect((await hud(a)).alive, "A should have been killed by B").toBe(false);
      const diedAt = await a.evaluate(() => window.__fb.hud.get().diedAt);
      expect(diedAt).toBeGreaterThan(0);

      // In the break the shop is shut — for the winner too, who is alive and standing in it.
      await b.waitForFunction(() => { const h = window.__fb.hud.get(); return h.phase === "prep" && (h.bomb?.result ?? h.roundResult) !== ""; }, null, { timeout: 10_000 });
      expect((await hud(b)).buyWindowLeft, "duel break: buy window 0").toBe(0);

      // Spectate: within 5800 ms of the death A watches B — the bar's id, and the camera in B's eye.
      await a.waitForFunction(([id, t0]) => window.__fb.hud.get().spectating?.id === id && performance.now() - t0 <= 5_800,
        [idB, diedAt] as const, { timeout: 5_800, polling: "raf" });
      await waitForFrames(a, 6); // the view is smoothed over ~40 ms
      const view = await a.evaluate((id) => {
        const g = window.__fb.game;
        const eye = { x: 0, y: 0, z: 0, set(x: number, y: number, z: number) { this.x = x; this.y = y; this.z = z; return this; } };
        const r = g.remotePlayers.get(id)!;
        r.eye(eye);
        const c = g.localPlayer.camera.position;
        return { gap: Math.hypot(c.x - eye.x, c.y - eye.y, c.z - eye.z), hidden: r.isHidden, t: performance.now() - window.__fb.hud.get().diedAt };
      }, idB);
      expect(view.gap, `camera ${view.gap.toFixed(3)} m from B's eye`).toBeLessThan(0.3);
      expect(view.hidden, "the watched body is not drawn around the camera").toBe(true);
      expect(view.t).toBeLessThan(5_800);
      await a.screenshot({ path: `${OUT}/duel-spectate.png` });
      await b.screenshot({ path: `${OUT}/duel-break-winner.png` });

      // The next round: A is back, the view is A's own again, and the tail opens once more.
      await a.waitForFunction(() => window.__fb.hud.get().alive, null, { timeout: 15_000 });
      expect(await a.evaluate(() => window.__fb.hud.get().spectating)).toBeNull();
      await b.waitForFunction(() => window.__fb.hud.get().phase === "playing", null, { timeout: 30_000, polling: "raf" });
      const tail2 = (await hud(b)).buyWindowLeft;
      expect(tail2).toBeGreaterThan(0);
      expect(tail2).toBeLessThanOrEqual(5_000);
      expect(errors).toEqual([]);
    } finally { await ca.close(); await cb.close(); }
  });

  test("tdm: the killer card's HP is the killer's, and the respawn lands on the card's zero", async ({ browser }) => {
    test.setTimeout(240_000);
    const ca = await browser.newContext(ctxOpts), cb = await browser.newContext(ctxOpts);
    const errors: string[] = [];
    try {
      const a = await newPlayer(ca, "tdm"), b = await newPlayer(cb, "tdm");
      for (const p of [a, b]) p.on("pageerror", (e) => errors.push(e.message));
      const room = `hudfeed-tdm-${Date.now()}`;
      await joinRoom(a, "OFIARA", room); await joinRoom(b, "STRZELEC", room);
      await fakeLock(a); await fakeLock(b);
      const idA = (await hud(a)).myId, idB = (await hud(b)).myId;
      await a.waitForFunction(() => { const h = window.__fb.hud.get(); return h.phase === "playing" && h.alive && h.phaseEndsAt - h.serverNow > 8_000 && h.serverNow > h.spawnProtectedUntil + 500; }, null, { timeout: 90_000 });
      // The spawn the server sends back, on A's own clock.
      await a.evaluate(() => { window.__p1SpawnAt = 0; window.__fb.game.events.on("localSpawn", () => { window.__p1SpawnAt = performance.now(); window.__p1SpawnAlive = window.__fb.hud.get().alive; }); });

      await kill(b, a, idA);
      expect((await hud(a)).alive, "A should have been killed by B").toBe(false);
      const card = await hud(a);
      expect(card.killer?.id).toBe(idB);
      // The killer's HP on the card is B's replicated health (live while B lives), and B's own.
      await expect.poll(async () => {
        const [h, s, own] = [await hud(a), await stateOf(a, idB), (await hud(b)).health];
        return h.killer?.hp === s.health && s.health === own;
      }, { timeout: 3_000, message: "hud.killer.hp equals the killer's server health" }).toBe(true);
      expect(card.respawnAt - card.diedAt, "the deadline is respawnDelayMs(tdm)").toBe(TDM_RESPAWN_MS);
      await expect(a.getByTestId("death")).toBeVisible();
      await expect(a.getByTestId("killer-hp")).toContainText("HP");
      await a.screenshot({ path: `${OUT}/tdm-killer-card.png` });

      // The server revives A on its own timer: the card's zero is that moment, ± 150 ms.
      // Every text the death zone shows from here to the respawn and after it (the card must fade
      // its LAST frame: no „ZGINĄŁEŚ”, no „WRACASZ W NASTĘPNEJ RUNDZIE” in a TDM respawn).
      await a.evaluate(() => {
        const seen: string[] = (window.__p1Texts = []);
        new MutationObserver(() => { const t = document.querySelector("[data-zone=death]")?.textContent ?? ""; if (t && seen[seen.length - 1] !== t) seen.push(t); })
          .observe(document.body, { subtree: true, childList: true, characterData: true });
      });
      await a.waitForFunction(() => (window.__p1SpawnAt ?? 0) > 0, null, { timeout: 8_000 });
      const late = await a.evaluate((respawnAt) => (window.__p1SpawnAt ?? 0) - respawnAt, card.respawnAt);
      expect(Math.abs(late), `respawned ${Math.round(late)} ms from the card's deadline`).toBeLessThanOrEqual(150);
      expect(await a.evaluate(() => window.__p1SpawnAlive), "S2C.Spawn makes the store alive at once").toBe(true);
      await expect(a.getByTestId("death")).toHaveCount(0);
      await a.waitForTimeout(800); // past the patch that confirms the spawn
      const texts = await a.evaluate(() => window.__p1Texts ?? []);
      expect(texts.filter((t) => t.includes("ZGINĄŁEŚ") || t.includes("NASTĘPNEJ RUNDZIE") || t.includes("NIKOGO")), "no dead copy across the respawn").toEqual([]);
      expect((await hud(a)).alive).toBe(true);
      expect(errors).toEqual([]);
    } finally { await ca.close(); await cb.close(); }
  });

  test("bomb: a late joiner is down with no kill, and watches a living teammate", async ({ browser }) => {
    test.setTimeout(300_000);
    const ca = await browser.newContext(ctxOpts), cb = await browser.newContext(ctxOpts), cc = await browser.newContext(ctxOpts);
    const errors: string[] = [];
    try {
      const a = await newPlayer(ca, "bomb"), b = await newPlayer(cb, "bomb");
      for (const p of [a, b]) p.on("pageerror", (e) => errors.push(e.message));
      const room = `hudfeed-late-${Date.now()}`;
      await joinRoom(a, "ALFA", room); await joinRoom(b, "BRAVO", room);
      // Fresh into the live round, so C's join (tens of seconds on software GL) lands inside it.
      await a.waitForFunction(() => {
        const h = window.__fb.hud.get() as unknown as { phase: string; serverNow: number; bomb: { roundEndsAt: number } | null };
        return h.phase === "playing" && (h.bomb?.roundEndsAt ?? 0) - h.serverNow > 90_000;
      }, null, { timeout: 180_000, polling: 250 });

      // C joins the live round: the room spawns C and puts C down in the same tick (TdmRoom C2S.Ready).
      const c = await newPlayer(cc, "bomb");
      c.on("pageerror", (e) => errors.push(e.message));
      await joinRoom(c, "SPOZNIONY", room);
      await c.waitForFunction(() => { const h = window.__fb.hud.get(); return !h.alive && h.lateJoin && !window.__fb.game.localPlayer.alive; }, null, { timeout: 15_000 });
      const me = await hud(c);
      expect(me.diedAt, "no death was announced: no killer card").toBe(0);
      expect(me.killer).toBeNull();
      // The spectator runs: a living teammate, through their eye.
      await c.waitForFunction(() => window.__fb.hud.get().spectating !== null, null, { timeout: 10_000 });
      const watched = await c.evaluate(() => {
        const h = window.__fb.hud.get() as unknown as { spectating: { id: string }; myTeam: number; players: { id: string; team: number; alive: boolean }[] };
        const row = h.players.find((p) => p.id === h.spectating.id)!;
        return { id: row.id, sameTeam: row.team === h.myTeam, alive: row.alive };
      });
      expect(watched.alive).toBe(true);
      expect(watched.sameTeam, "a teammate first").toBe(true);
      await waitForFrames(c, 6);
      const gap = await c.evaluate((id) => {
        const g = window.__fb.game;
        const eye = { x: 0, y: 0, z: 0, set(x: number, y: number, z: number) { this.x = x; this.y = y; this.z = z; return this; } };
        g.remotePlayers.get(id)!.eye(eye);
        const cam = g.localPlayer.camera.position;
        return Math.hypot(cam.x - eye.x, cam.y - eye.y, cam.z - eye.z);
      }, watched.id);
      expect(gap, `camera ${gap.toFixed(3)} m from the teammate's eye`).toBeLessThan(0.3);
      await expect(c.getByTestId("spectate")).toBeVisible();
      await expect(c.getByTestId("late-join")).toHaveText("DOŁĄCZYSZ W NASTĘPNEJ RUNDZIE");
      await expect(c.getByTestId("death")).toHaveCount(0);
      await c.screenshot({ path: `${OUT}/late-join-spectate-live.png` });
      expect(errors).toEqual([]);
    } finally { await ca.close(); await cb.close(); await cc.close(); }
  });
});
