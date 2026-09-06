import { test, expect, type Page } from "@playwright/test";
const GRENADES_FRAG_FUSE = 3200; // GRENADES.frag.fuseMs — the e2e file does not import shared

/**
 * Real two-client multiplayer test: two browser contexts join the same room, each sees the
 * other, movement replicates, shooting damages, killing produces a kill feed entry and a
 * respawn. Uses the `window.__fb` debug handle exposed by the client (dev only).
 */

interface DebugHandle {
  game: { frameCount: number; stats: { throws: number; booms: number; flashes: number }; buy(item: string): void; sell(item: string): void; setShopOpen(open: boolean): void }
    & { localPlayer: { body: { x: number; y: number; z: number; tac: number }; yaw: number; pitch: number; alive: boolean; lean: number }; inputState: { pointerLocked: boolean; tacLatched: boolean; typing: boolean } }
    & { mapDefinition: { flags: { id: string; x: number; y: number; z: number }[] } };
  hud: { get(): {
    health: number; alive: boolean; players: { id: string; kills: number; deaths: number }[]; killFeed: unknown[]; myId: string; myTeam: number; ammo: number; reloading: boolean; weapon: string; phase: string; phaseEndsAt: number; matchEndsAt: number; spawnProtectedUntil: number; serverNow: number;
    money: number; owned: string[]; lethal: string; lethalCount: number; tactical: string; tacticalCount: number; buyWindowLeft: number; shopOpen: boolean; cookingKind: string; cooking: number; flashUntil: number;
    armor: number; perks: Record<string, number>; scoped: boolean; breath: number; aiming: boolean;
    mode: string; flags: { id: string; owner: number; capTeam: number; cap: number; contested: boolean }[]; inFlag: number; scoreA: number; scoreB: number; tac: number; tacOn: boolean; winnerName: string;
    chat: { name: string; text: string }[]; chatOpen: string | null; marks: { kind: string }[]; flagNotice: { text: string } | null;
    reward: { total: number; earned: string[] } | null; profile: { xp: number; badges: string[] };
  } };
}

declare global { interface Window { __fb: DebugHandle } }

const ROOM = `e2e-${Date.now()}`;

async function joinRoom(page: Page, name: string, roomName = ROOM): Promise<void> {
  await page.goto("/");
  await page.getByTestId("btn-play").click();
  await page.getByTestId("input-name").fill(name);
  await page.getByTestId("input-room").fill(roomName);
  await page.getByTestId("btn-quickplay").click();
  await expect(page.getByTestId("hud")).toBeVisible({ timeout: 30_000 });
  await page.waitForFunction(() => window.__fb?.game && window.__fb.hud.get().myId !== "", null, { timeout: 30_000 });
}

/** Simulates pointer lock so the input layer accepts mouse/keys (headless has no real lock). */
async function fakeLock(page: Page): Promise<void> {
  await page.evaluate(() => {
    const canvas = document.querySelector("canvas") as HTMLCanvasElement;
    Object.defineProperty(document, "pointerLockElement", { get: () => canvas, configurable: true });
    document.dispatchEvent(new Event("pointerlockchange"));
  });
  await page.waitForFunction(() => window.__fb.game.inputState.pointerLocked);
}

const pos = (page: Page) => page.evaluate(() => { const b = window.__fb.game.localPlayer.body; return { x: b.x, y: b.y, z: b.z }; });
const hud = (page: Page) => page.evaluate(() => window.__fb.hud.get());
const remoteCount = (page: Page) => page.evaluate(() => window.__fb.hud.get().players.length);

async function lookAt(page: Page, tx: number, tz: number, ty = 1.4): Promise<void> {
  await page.evaluate(([tx, tz, ty]) => {
    const lp = window.__fb.game.localPlayer;
    const b = lp.body;
    const dx = tx - b.x, dz = tz - b.z, dy = ty - (b.y + 1.62);
    lp.yaw = Math.atan2(dx, dz);
    lp.pitch = -Math.atan2(dy, Math.hypot(dx, dz));
  }, [tx, tz, ty]);
}

/** Software GL in CI is slow; force the LOW preset and a small viewport so the loop runs at a usable rate. */
// LOW, which also means `importedModels: false`: these tests are about netcode and match flow, and
// they run on a SOFTWARE renderer, where three skinned characters (12.5 k vertices each) cost more
// than everything else in the scene put together. The imported-asset path has its own coverage —
// unit tests on the real .glb files, plus `e2e/tools/assets-check.mjs` against the running game.
const LOW_SETTINGS = JSON.stringify({ graphics: { preset: "low", renderer: "webgl2", renderScale: 0.5, shadows: "off", postProcessing: false, effects: 0.3, antialiasing: false, importedModels: false } });
const ctxOpts = { viewport: { width: 640, height: 360 } };

async function waitForFrames(page: Page, n: number): Promise<void> {
  const start = await page.evaluate(() => window.__fb.game.frameCount);
  await page.waitForFunction((target) => window.__fb.game.frameCount >= target, start + n, { timeout: 60_000 });
}

/**
 * Wait until the live wave has at least `ms` left.
 *
 * Grenades are removed from the air when the frozen preparation window opens (they would land on
 * players who cannot step out of the way; the thrower gets the grenade back). So a throw made in
 * the last fuse-length of a wave never goes off — which is exactly what an earlier run of this file
 * caught, as a flashbang that vanished. Anything that needs a detonation waits for room first.
 */
async function waveRoom(p: Page, ms: number): Promise<void> {
  await expect.poll(async () => {
    const h = await hud(p);
    return h.phase === "playing" && h.phaseEndsAt - h.serverNow > ms;
  }, { timeout: 40_000, message: `waiting for ${ms} ms of live wave` }).toBe(true);
}

test.describe("two clients", () => {
  test("see each other, move, shoot, kill, respawn", async ({ browser }) => {
    const ctxA = await browser.newContext(ctxOpts);
    const ctxB = await browser.newContext(ctxOpts);
    for (const c of [ctxA, ctxB]) await c.addInitScript((v) => localStorage.setItem("fb_settings_v1", v), LOW_SETTINGS);
    const a = await ctxA.newPage();
    const b = await ctxB.newPage();
    const errors: string[] = [];
    for (const p of [a, b]) p.on("pageerror", (e) => errors.push(e.message));
    for (const p of [a, b]) p.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

    await joinRoom(a, "ALPHA");
    await joinRoom(b, "BRAVO");

    // Both see two players in the scoreboard state.
    await expect.poll(() => remoteCount(a), { timeout: 15_000 }).toBe(2);
    await expect.poll(() => remoteCount(b), { timeout: 15_000 }).toBe(2);

    const idA = (await hud(a)).myId;
    const idB = (await hud(b)).myId;
    expect(idA).not.toBe(idB);

    // With two players the room counts down and starts the match, which respawns everyone.
    // Wait for a LIVE wave with room in it, and for spawn protection to lapse, before measuring
    // anything. "playing" alone is not enough since drop 7: the match spends five seconds in a
    // frozen preparation window every seventeen, and a movement or combat measurement that lands
    // there measures the freeze — a walk of exactly 0 m, which is what caught this.
    await waveRoom(a, 6000);
    await a.waitForFunction(() => { const h = window.__fb.hud.get(); return h.serverNow > h.spawnProtectedUntil + 1000; }, null, { timeout: 10_000 });

    // Movement: A walks forward; B must observe A's replicated position changing.
    await fakeLock(a);
    await fakeLock(b);
    await a.mouse.move(320, 180);
    await b.mouse.move(320, 180);
    await waitForFrames(a, 5); // shaders compiled, loop warm
    await waitForFrames(b, 5);
    await waveRoom(a, 4000);
    const beforeA = await pos(a);
    await a.keyboard.down("KeyW");
    await waitForFrames(a, 12);
    await a.keyboard.up("KeyW");
    await waitForFrames(a, 3);
    await a.waitForTimeout(250); // let the server ack + snapshot
    const afterA = await pos(a);
    const moved = Math.hypot(afterA.x - beforeA.x, afterA.z - beforeA.z);
    expect(moved).toBeGreaterThan(0.8);

    // B observes A at approximately the same place (server-replicated position).
    const aOnB = await b.evaluate((id) => {
      const s = (window.__fb.game as unknown as { conn: { state: { players: { get(id: string): { x: number; z: number } } } } }).conn.state.players.get(id);
      return { x: s.x, z: s.z };
    }, idA);
    expect(Math.hypot(aOnB.x - afterA.x, aOnB.z - afterA.z)).toBeLessThan(0.5);

    // Combat. Spawns are deliberately out of each other's sight, so the test uses the
    // dev-only teleport hook (server started with FB_DEV_TOOLS=1) to put B a few metres from A.
    // A must be alive here; if it is not, the kill feed says who did it (a fall = self-kill entry).
    await expect.poll(async () => (await hud(a)).alive, { timeout: 6000, message: `A not alive before combat: ${JSON.stringify((await hud(a)).killFeed)}` }).toBe(true);
    const target = await b.evaluate((id) => {
      const s = (window.__fb.game as unknown as { conn: { state: { players: { get(id: string): { x: number; y: number; z: number } } } } }).conn.state.players.get(id);
      return { x: s.x, y: s.y, z: s.z };
    }, idA);
    const teleport = (x: number, y: number, z: number) =>
      b.evaluate(([x, y, z]) => (window.__fb.game as unknown as { conn: { send(t: string, m: unknown): void } }).conn.send("dev:teleport", { x, y, z }), [x, y, z]);
    const burst = async () => { await b.mouse.down(); await waitForFrames(b, 2); await b.mouse.up(); await waitForFrames(b, 1); };

    // Try a few spots around A until one has line of sight (props may block a given side).
    let killed = false;
    let damaged = false;
    for (const [ox, oz] of [[3.5, 0], [-3.5, 0], [0, 3.5], [0, -3.5], [2.5, 2.5], [-2.5, -2.5]]) {
      await teleport(target.x + ox, target.y, target.z + oz);
      await b.waitForTimeout(400);
      const pb = await pos(b);
      const info = await a.evaluate(() => { const h = window.__fb.hud.get(); const b = window.__fb.game.localPlayer.body; return { phase: h.phase, prot: Math.round(h.spawnProtectedUntil - h.serverNow), a: [b.x, b.z], alive: h.alive }; });
      console.log(`[e2e] spot ${ox},${oz}: b=${pb.x.toFixed(1)},${pb.z.toFixed(1)} target=${target.x.toFixed(1)},${target.z.toFixed(1)} A=${JSON.stringify(info)}`);
      if (Math.hypot(pb.x - (target.x + ox), pb.z - (target.z + oz)) > 0.3) continue; // spot occupied
      await waitForFrames(b, 2);
      const before = (await hud(a)).health;
      for (let i = 0; i < 6 && !damaged; i++) {
        await lookAt(b, target.x, target.z, target.y + 1.2);
        await burst();
        damaged = (await hud(a)).health < before;
        console.log(`[e2e]   burst ${i}: aHealth=${(await hud(a)).health} bAmmo=${(await hud(b)).ammo}`);
      }
      if (damaged) break;
    }
    expect(damaged, "B should damage A from at least one spot (server started with FB_DEV_TOOLS=1?)").toBe(true);

    for (let i = 0; i < 40 && !killed; i++) {
      await lookAt(b, target.x, target.z, target.y + 1.2);
      await waveRoom(b, 3000); // B is the shooter: no point pulling the trigger while frozen
      await burst();
      killed = !(await hud(a)).alive;
      if ((await hud(b)).ammo === 0) { await b.keyboard.press("KeyR"); await b.waitForTimeout(2300); }
    }
    expect(killed, "A should have been killed by B").toBe(true);

    // Kill feed on both, deaths/kills in scoreboard.
    await expect.poll(async () => (await hud(a)).killFeed.length, { timeout: 5000 }).toBeGreaterThan(0);
    await expect.poll(async () => (await hud(b)).killFeed.length, { timeout: 5000 }).toBeGreaterThan(0);
    const rowsB = (await hud(b)).players;
    expect(rowsB.find((r) => r.id === idA)?.deaths).toBe(1);
    await expect(a.getByTestId("death")).toBeVisible();

    // Respawn is a WAVE (drop 7): nobody comes back on a timer of their own, everyone returns
    // together when the preparation window opens. The wait is therefore up to a full wave plus the
    // freeze, not the old flat 3.2 s — and the phase it lands in is the proof of the rule.
    await expect.poll(async () => (await hud(a)).phase, { timeout: 25_000 }).toBe("prep");
    expect((await hud(a)).alive, "the wave brings you back at the START of the countdown").toBe(true);
    await expect(a.getByTestId("prep")).toBeVisible();
    await expect.poll(async () => (await hud(a)).health, { timeout: 3000 }).toBe(100);

    // Frozen: holding forward through the countdown moves nobody.
    const beforeFreeze = await a.evaluate(() => { const b = window.__fb.game.localPlayer.body; return { x: b.x, z: b.z }; });
    await a.keyboard.down("KeyW");
    await waitForFrames(a, 30);
    const afterFreeze = await a.evaluate(() => { const b = window.__fb.game.localPlayer.body; return { x: b.x, z: b.z }; });
    await a.keyboard.up("KeyW");
    expect(Math.hypot(afterFreeze.x - beforeFreeze.x, afterFreeze.z - beforeFreeze.z),
      "movement during the preparation window").toBeLessThan(0.2);

    // …and released together when it ends.
    await expect.poll(async () => (await hud(a)).phase, { timeout: 15_000 }).toBe("playing");

    // Drop 2: everyone spawns with the free pistol; a primary is bought inside the spawn window.
    expect((await hud(a)).weapon).toBe("pistol");
    await a.evaluate(() => window.__fb.game.buy("smg"));
    await expect.poll(async () => (await hud(a)).weapon, { timeout: 3000 }).toBe("smg");
    await expect.poll(async () => (await hud(a)).owned.join(","), { timeout: 3000 }).toBe("pistol,smg");
    // Slot keys map onto the carried weapons: 2 = pistol, 1 = primary.
    await a.keyboard.press("Digit2");
    await expect.poll(async () => (await hud(a)).weapon, { timeout: 3000 }).toBe("pistol");
    await a.keyboard.press("Digit1");
    await expect.poll(async () => (await hud(a)).weapon, { timeout: 3000 }).toBe("smg");
    await a.waitForTimeout(600); // equip animation time
    await a.mouse.down(); await waitForFrames(a, 8); await a.mouse.up();
    await expect.poll(async () => (await hud(a)).ammo, { timeout: 5000 }).toBeLessThan(32);
    await a.keyboard.press("KeyR");
    await expect.poll(async () => (await hud(a)).reloading, { timeout: 2000 }).toBe(true);
    await expect.poll(async () => (await hud(a)).ammo, { timeout: 4000 }).toBe(32);

    // No page errors / console errors during the whole run.
    expect(errors, errors.join("\n")).toEqual([]);

    await ctxA.close();
    await ctxB.close();
  });

  test("drop 2: buy menu, wallet, frag cook + throw, flashbang", async ({ browser }) => {
    const ctxA = await browser.newContext(ctxOpts);
    const ctxB = await browser.newContext(ctxOpts);
    for (const c of [ctxA, ctxB]) await c.addInitScript((v) => localStorage.setItem("fb_settings_v1", v), LOW_SETTINGS);
    const a = await ctxA.newPage();
    const b = await ctxB.newPage();
    const errors: string[] = [];
    for (const p of [a, b]) p.on("pageerror", (e) => errors.push(e.message));
    for (const p of [a, b]) p.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
    const room = `${ROOM}-d2`;
    for (const [p, name] of [[a, "CHARLIE"], [b, "DELTA"]] as const) {
      await p.goto("/");
      await p.getByTestId("btn-play").click();
      await p.getByTestId("input-name").fill(name);
      await p.getByTestId("input-room").fill(room);
      await p.getByTestId("btn-quickplay").click();
      await expect(p.getByTestId("hud")).toBeVisible({ timeout: 30_000 });
      await p.waitForFunction(() => window.__fb?.game && window.__fb.hud.get().myId !== "", null, { timeout: 30_000 });
    }
    await expect.poll(async () => (await hud(a)).phase, { timeout: 20_000 }).toBe("playing");
    await fakeLock(a);
    await a.mouse.move(320, 180);
    await waitForFrames(a, 5);

    // Wallet: start money, pistol only, spawn window open.
    const h0 = await hud(a);
    expect(h0.money).toBe(2000);
    expect(h0.owned).toEqual(["pistol"]);
    expect(h0.buyWindowLeft).toBeGreaterThan(0);
    await expect(a.getByTestId("buy-prompt")).toBeVisible();

    // B opens the buy menu (input off, the menu is a real UI), a frag is bought by clicking.
    await a.keyboard.press("KeyB");
    await expect(a.getByTestId("shop")).toBeVisible();
    await expect.poll(async () => (await hud(a)).shopOpen).toBe(true);
    await a.getByTestId("shop-frag").getByRole("button").click();
    await expect.poll(async () => (await hud(a)).lethal, { timeout: 3000 }).toBe("frag");
    await expect.poll(async () => (await hud(a)).money, { timeout: 3000 }).toBe(1700);
    await expect(a.getByTestId("shop-result")).toContainText("Bought Frag");
    // A second flash goes in the tactical slot; the shop refuses what cannot be afforded (DMR $2900).
    await a.getByTestId("shop-flash").getByRole("button").click();
    await expect.poll(async () => (await hud(a)).tactical, { timeout: 3000 }).toBe("flash");
    await expect(a.getByTestId("shop-dmr").getByRole("button")).toBeDisabled();
    await a.keyboard.press("KeyB");
    await expect(a.getByTestId("shop")).toBeHidden();
    await expect.poll(async () => (await hud(a)).shopOpen).toBe(false);
    await fakeLock(a);

    // Cook a frag: G held shows the cook ring, the count drops when it leaves the hand, the server booms it.
    await a.evaluate(() => { window.__fb.game.localPlayer.pitch = -0.4; }); // lob it up and away
    const booms0 = await a.evaluate(() => window.__fb.game.stats.booms);
    await waveRoom(a, GRENADES_FRAG_FUSE + 4000); // the frag must survive to detonate
    await a.keyboard.down("KeyG");
    await expect.poll(async () => (await hud(a)).cookingKind, { timeout: 2000 }).toBe("frag");
    await expect(a.getByTestId("cook")).toBeVisible();
    await a.waitForTimeout(700);
    expect((await hud(a)).cooking).toBeGreaterThan(0.1);
    await a.keyboard.up("KeyG");
    await expect.poll(async () => (await hud(a)).lethalCount, { timeout: 10_000 }).toBe(0);
    await expect.poll(async () => (await hud(a)).cookingKind, { timeout: 5000 }).toBe("");
    await expect.poll(() => a.evaluate(() => window.__fb.game.stats.throws), { timeout: 5000 }).toBeGreaterThan(0);
    // Cooked ~0.9 s of a 3.2 s fuse: the boom lands within a few seconds.
    await expect.poll(() => a.evaluate(() => window.__fb.game.stats.booms), { timeout: 10_000 }).toBeGreaterThan(booms0);
    // Both clients saw the throw (broadcast) — B never threw anything.
    await expect.poll(() => b.evaluate(() => window.__fb.game.stats.throws), { timeout: 3000 }).toBeGreaterThan(0);
    // Server-side count agrees (snapshot after the optimistic decrement).
    await a.waitForTimeout(400);
    expect((await hud(a)).lethalCount).toBe(0);
    expect((await hud(a)).lethal).toBe("");

    // Flash at the feet while looking down: we get the Flashed message and the white-out.
    await a.evaluate(() => { window.__fb.game.localPlayer.pitch = 1.3; });
    await a.waitForTimeout(700); // throw interval
    await waveRoom(a, 1700 + 4000); // flashbang fuse plus wind-up and SwiftShader's frame rate
    await a.keyboard.press("Digit4");
    // SwiftShader runs the client at a few fps: key → frame → 180 ms wind-up → frame can take a second or more.
    await expect.poll(async () => (await hud(a)).tacticalCount, { timeout: 10_000 }).toBe(0);
    await expect.poll(() => a.evaluate(() => window.__fb.game.stats.flashes), { timeout: 10_000 }).toBeGreaterThan(0);
    await expect.poll(async () => (await hud(a)).flashUntil > 0, { timeout: 5000 }).toBe(true);
    await expect(a.getByTestId("flash")).toBeVisible();

    expect(errors, errors.join("\n")).toEqual([]);
    await ctxA.close();
    await ctxB.close();
  });

  test("drop 3: sidearm swap, clippers, sniper scope, perks and armour on the HUD", async ({ browser }) => {
    const ctx = await browser.newContext(ctxOpts);
    await ctx.addInitScript((v) => localStorage.setItem("fb_settings_v1", v), LOW_SETTINGS);
    const a = await ctx.newPage();
    const errors: string[] = [];
    a.on("pageerror", (e) => errors.push(e.message));
    a.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
    await a.goto("/");
    await a.getByTestId("btn-play").click();
    await a.getByTestId("input-name").fill("ECHO");
    await a.getByTestId("input-room").fill(`${ROOM}-d3`);
    await a.getByTestId("btn-quickplay").click();
    await expect(a.getByTestId("hud")).toBeVisible({ timeout: 30_000 });
    await a.waitForFunction(() => window.__fb?.game && window.__fb.hud.get().myId !== "", null, { timeout: 30_000 });
    await fakeLock(a);
    await a.mouse.move(320, 180);
    await waitForFrames(a, 5);
    // Warm-up: the shop is open and money is plenty for this list after a top-up through the dev handle? No —
    // the wallet is server-authoritative, so buy within $2 000: revolver 600 + flask 500 + light 650 = 1 750.
    await a.evaluate(() => window.__fb.game.buy("revolver"));
    await expect.poll(async () => (await hud(a)).weapon, { timeout: 5000 }).toBe("revolver");
    await expect.poll(async () => (await hud(a)).owned.join(","), { timeout: 5000 }).toBe("revolver");
    // V = clippers; 2 = back to the sidearm (the revolver now).
    await a.keyboard.press("KeyV");
    await expect.poll(async () => (await hud(a)).weapon, { timeout: 5000 }).toBe("clippers");
    await expect(a.getByTestId("ammo")).toContainText("∞");
    await a.keyboard.press("Digit2");
    await expect.poll(async () => (await hud(a)).weapon, { timeout: 5000 }).toBe("revolver");
    // Perk + plate show on the HUD.
    await a.evaluate(() => { window.__fb.game.buy("flask"); window.__fb.game.buy("light"); });
    await expect.poll(async () => (await hud(a)).armor, { timeout: 5000 }).toBe(50);
    await expect(a.getByTestId("armor")).toContainText("50");
    await expect(a.getByTestId("perks")).toContainText("FLASZKA");
    await expect.poll(async () => (await hud(a)).money, { timeout: 5000 }).toBe(2000 - 600 - 500 - 650);
    // Shop reflects the running perk and the worn plate; the sniper is out of reach at $250.
    await a.keyboard.press("KeyB");
    await expect(a.getByTestId("shop")).toBeVisible();
    await expect(a.getByTestId("shop-sniper")).toContainText("SCOPE");
    await expect(a.getByTestId("shop-sniper").getByRole("button")).toBeDisabled();
    await expect(a.getByTestId("shop-flask")).toContainText("RUNNING");
    await expect(a.getByTestId("shop-light")).toContainText("WORN");
    await a.keyboard.press("KeyB");
    await expect(a.getByTestId("shop")).toBeHidden();
    await fakeLock(a);
    // Sniper via the dev wallet hook (FB_DEV_TOOLS=1): aiming shows the scope overlay and hides the crosshair.
    await a.evaluate(() => (window.__fb.game as unknown as { conn: { send(t: string, m: unknown): void } }).conn.send("dev:money", 9000));
    await expect.poll(async () => (await hud(a)).money, { timeout: 5000 }).toBe(9000);
    await a.evaluate(() => window.__fb.game.buy("sniper"));
    await expect.poll(async () => (await hud(a)).weapon, { timeout: 5000 }).toBe("sniper");
    await a.waitForTimeout(900); // equip
    await a.mouse.down({ button: "right" });
    await expect.poll(async () => (await hud(a)).scoped, { timeout: 5000 }).toBe(true);
    await expect(a.getByTestId("scope")).toBeVisible();
    await expect(a.getByTestId("crosshair")).toHaveCount(0);
    await a.mouse.up({ button: "right" });
    await expect.poll(async () => (await hud(a)).scoped, { timeout: 5000 }).toBe(false);
    expect(errors, errors.join("\n")).toEqual([]);
    await ctx.close();
  });

  test("drop 4: domination capture, flag HUD, lean and tactical sprint", async ({ browser }) => {
    const ctxA = await browser.newContext(ctxOpts);
    const ctxB = await browser.newContext(ctxOpts);
    for (const c of [ctxA, ctxB]) await c.addInitScript((v) => localStorage.setItem("fb_settings_v1", v), LOW_SETTINGS);
    const a = await ctxA.newPage();
    const b = await ctxB.newPage();
    const errors: string[] = [];
    for (const p of [a, b]) p.on("pageerror", (e) => errors.push(e.message));
    for (const p of [a, b]) p.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
    const room = `${ROOM}-d4`;
    for (const [p, name] of [[a, "FOXTROT"], [b, "GOLF"]] as const) {
      await p.goto("/");
      await p.getByTestId("btn-play").click();
      await p.getByTestId("input-name").fill(name);
      await p.getByTestId("input-room").fill(room);
      await p.getByTestId("mode-dom").click();
      await expect(p.getByTestId("mode-blurb")).toContainText("Hold A / B / C");
      await p.getByTestId("btn-quickplay").click();
      await expect(p.getByTestId("hud")).toBeVisible({ timeout: 30_000 });
      await p.waitForFunction(() => window.__fb?.game && window.__fb.hud.get().myId !== "", null, { timeout: 30_000 });
    }
    // Both landed in a Domination room on opposite teams; the flag row shows three neutral flags.
    await expect.poll(async () => (await hud(a)).mode, { timeout: 10_000 }).toBe("dom");
    await expect.poll(async () => (await hud(b)).mode, { timeout: 10_000 }).toBe("dom");
    expect((await hud(a)).myTeam).not.toBe((await hud(b)).myTeam);
    await expect(a.getByTestId("flags")).toBeVisible();
    await expect(a.getByTestId("flag-A")).toHaveAttribute("data-owner", "-1");
    await expect.poll(async () => (await hud(a)).phase, { timeout: 20_000 }).toBe("playing");
    await fakeLock(a);
    await a.mouse.move(320, 180);
    await waitForFrames(a, 5);

    // A stands on flag A (dev teleport): capture runs, the HUD says so, the flag turns A's colour,
    // the notice fires and the team score starts ticking.
    const flagA = await a.evaluate(() => window.__fb.game.mapDefinition.flags[0]);
    await a.evaluate(([x, y, z]) => (window.__fb.game as unknown as { conn: { send(t: string, m: unknown): void } }).conn.send("dev:teleport", { x, y, z }), [flagA.x, flagA.y, flagA.z]);
    await expect.poll(async () => (await hud(a)).inFlag, { timeout: 8000 }).toBe(0);
    await expect(a.getByTestId("capture")).toContainText("CAPTURING A", { timeout: 8000 });
    const teamA = (await hud(a)).myTeam;
    await expect.poll(async () => (await hud(a)).flags[0].capTeam, { timeout: 8000 }).toBe(teamA);
    // Capture progress and the score tick both pause during a preparation window (`stepFlags` runs
    // in a live wave only), so these two allow for one freeze on top of the work itself.
    await expect.poll(async () => (await hud(a)).flags[0].owner, { timeout: 25_000 }).toBe(teamA);
    await expect(a.getByTestId("flag-A")).toHaveAttribute("data-owner", String(teamA));
    // The notice fades after 2.6 s and the owner poll above can outlast it in headless, so read the
    // store (which keeps the last notice) instead of the DOM.
    expect(await a.evaluate(() => window.__fb.hud.get().flagNotice?.text ?? "")).toContain("TOOK A");
    await expect(b.getByTestId("flag-A")).toHaveAttribute("data-owner", String(teamA), { timeout: 5000 });
    await expect.poll(async () => { const h = await hud(a); return teamA === 0 ? h.scoreA : h.scoreB; }, { timeout: 25_000 }).toBeGreaterThan(0);

    // Lean: Q moves the eye left (negative lean), E right; releasing returns to centre.
    await a.keyboard.down("KeyQ");
    await expect.poll(() => a.evaluate(() => window.__fb.game.localPlayer.lean), { timeout: 5000 }).toBeLessThan(-0.3);
    await a.keyboard.up("KeyQ");
    await a.keyboard.down("KeyE");
    await expect.poll(() => a.evaluate(() => window.__fb.game.localPlayer.lean), { timeout: 5000 }).toBeGreaterThan(0.3);
    await a.keyboard.up("KeyE");
    await expect.poll(() => a.evaluate(() => Math.abs(window.__fb.game.localPlayer.lean)), { timeout: 5000 }).toBeLessThan(0.05);

    // Tactical sprint: W + a double-tapped Shift latches it; the budget drains and the meter shows.
    // Needs a live wave: the freeze masks the movement bits, so the budget would refill, not drain.
    await waveRoom(a, 5000);
    await a.keyboard.down("KeyW");
    await a.keyboard.press("ShiftLeft");
    await a.keyboard.down("ShiftLeft");
    await expect.poll(() => a.evaluate(() => window.__fb.game.inputState.tacLatched), { timeout: 3000 }).toBe(true);
    await expect.poll(async () => (await hud(a)).tacOn, { timeout: 5000 }).toBe(true);
    await expect(a.getByTestId("tac")).toBeVisible();
    await expect.poll(() => a.evaluate(() => window.__fb.game.localPlayer.body.tac), { timeout: 5000 }).toBeLessThan(3500);
    await a.keyboard.up("ShiftLeft");
    await a.keyboard.up("KeyW");
    await expect.poll(async () => (await hud(a)).tacOn, { timeout: 5000 }).toBe(false);

    expect(errors, errors.join("\n")).toEqual([]);
    await ctxA.close();
    await ctxB.close();
  });

  test("drop 5: bots in the lobby, minimap, chat between clients, a mark on the map", async ({ browser }) => {
    const ctxA = await browser.newContext(ctxOpts);
    const ctxB = await browser.newContext(ctxOpts);
    for (const c of [ctxA, ctxB]) await c.addInitScript((v) => localStorage.setItem("fb_settings_v1", v), LOW_SETTINGS);
    const a = await ctxA.newPage();
    const b = await ctxB.newPage();
    const errors: string[] = [];
    for (const p of [a, b]) p.on("pageerror", (e) => errors.push(e.message));
    for (const p of [a, b]) p.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
    const room = `${ROOM}-d5`;
    // A creates a TDM room with two bots; B joins it from the room list.
    await a.goto("/");
    await a.getByTestId("btn-play").click();
    await a.getByTestId("input-name").fill("INDIA");
    await a.getByTestId("input-room").fill(room);
    await a.getByTestId("mode-tdm").click();
    await a.getByTestId("bots-range").fill("2");
    await a.getByTestId("bots-hard").click();
    await expect(a.getByTestId("bots-count")).toContainText("2 · HARD");
    await a.getByTestId("btn-create").click();
    await expect(a.getByTestId("hud")).toBeVisible({ timeout: 30_000 });
    await a.waitForFunction(() => window.__fb?.game && window.__fb.hud.get().myId !== "", null, { timeout: 30_000 });
    await joinRoom(b, "JULIET", room);
    // Four players: two humans, two bots tagged on the scoreboard.
    await expect.poll(() => remoteCount(a), { timeout: 15_000 }).toBe(4);
    await a.keyboard.down("Tab");
    await expect(a.locator('[data-testid="sb-row"][data-bot="1"]')).toHaveCount(2);
    await expect(a.locator(".sb-team th").filter({ hasText: "A" }).first()).toBeVisible();
    await a.keyboard.up("Tab");
    await expect(a.getByTestId("minimap")).toBeVisible();
    // Chat: A opens the box with Enter, types, sends; B sees the line with A's name.
    await fakeLock(a);
    await a.mouse.move(320, 180);
    await waitForFrames(a, 3);
    await a.keyboard.press("Enter");
    await expect(a.getByTestId("chat-input")).toBeVisible({ timeout: 5000 });
    await a.getByTestId("chat-input").fill("fresh fade incoming");
    await a.keyboard.press("Enter");
    await expect(b.getByTestId("chat-line").filter({ hasText: "fresh fade incoming" })).toBeVisible({ timeout: 10_000 });
    await expect(b.getByTestId("chat-line").filter({ hasText: "INDIA" })).toBeVisible();
    // Keys go back to the game once the box closes.
    await expect.poll(() => a.evaluate(() => window.__fb.game.inputState.typing), { timeout: 3000 }).toBe(false);
    // A mark: middle mouse drops a "go" marker that A's own HUD and B's (same team? teams vary) at least A records.
    await a.mouse.click(320, 180, { button: "middle" });
    await expect.poll(async () => (await hud(a)).marks.length, { timeout: 8000 }).toBeGreaterThanOrEqual(1);
    expect(errors, errors.join("\n")).toEqual([]);
    await ctxA.close();
    await ctxB.close();
  });

  test("2.0: the match summary pays what the match was worth, and the profile keeps it", async ({ browser }) => {
    const room = "sum-" + Date.now();
    const ctxA = await browser.newContext(ctxOpts);
    const ctxB = await browser.newContext(ctxOpts);
    for (const c of [ctxA, ctxB]) await c.addInitScript((v) => localStorage.setItem("fb_settings_v1", v), LOW_SETTINGS);
    const a = await ctxA.newPage();
    const b = await ctxB.newPage();
    await joinRoom(a, "ALPHA", room);
    await joinRoom(b, "BRAVO", room);
    await expect.poll(async () => (await hud(a)).phase, { timeout: 30_000 }).not.toBe("waiting");

    // A fresh browser profile: nothing earned yet.
    expect(await a.evaluate(() => JSON.parse(localStorage.getItem("bs_profile_v1") ?? "null"))).toBeNull();

    // End the match through the real path rather than waiting seven minutes for the clock.
    await waveRoom(a, 3000);
    await a.evaluate(() => (window.__fb.game as unknown as { conn: { send(t: string, m: unknown): void } }).conn.send("dev:endmatch", {}));
    await expect.poll(async () => (await hud(a)).phase, { timeout: 15_000 }).toBe("ended");

    await expect(a.getByTestId("summary")).toBeVisible();
    // Showing up is worth something even with no kills, so the total is always positive.
    const reward = (await hud(a)).reward;
    expect(reward, "the summary must have been paid").not.toBeNull();
    expect(reward!.total).toBeGreaterThan(0);
    await expect(a.getByTestId("summary-total")).toContainText("XP");
    await expect(a.getByTestId("summary-level")).toBeVisible();

    // …and it is on disk, so the next session starts from it.
    const stored = await a.evaluate(() => JSON.parse(localStorage.getItem("bs_profile_v1") ?? "null"));
    expect(stored.xp).toBe(reward!.total);
    expect(stored.life.matches).toBe(1);

    await ctxA.close();
    await ctxB.close();
  });

  test("drop 4: free for all lobby and HUD", async ({ browser }) => {
    const ctx = await browser.newContext(ctxOpts);
    await ctx.addInitScript((v) => localStorage.setItem("fb_settings_v1", v), LOW_SETTINGS);
    const a = await ctx.newPage();
    const errors: string[] = [];
    a.on("pageerror", (e) => errors.push(e.message));
    a.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
    await a.goto("/");
    await a.getByTestId("btn-play").click();
    await a.getByTestId("input-name").fill("HOTEL");
    await a.getByTestId("input-room").fill(`${ROOM}-ffa`);
    await a.getByTestId("mode-ffa").click();
    await a.getByTestId("btn-create").click();
    await expect(a.getByTestId("hud")).toBeVisible({ timeout: 30_000 });
    await a.waitForFunction(() => window.__fb?.game && window.__fb.hud.get().myId !== "", null, { timeout: 30_000 });
    await expect.poll(async () => (await hud(a)).mode, { timeout: 10_000 }).toBe("ffa");
    await expect(a.locator(".top-bar")).toHaveAttribute("data-mode", "ffa");
    await expect(a.locator(".top-bar")).toContainText("YOU");
    await expect(a.getByTestId("flags")).toHaveCount(0);
    // Tab: the FFA scoreboard is a single table.
    await a.keyboard.down("Tab");
    await expect(a.getByTestId("scoreboard")).toBeVisible();
    await expect(a.locator(".sb-team.ffa")).toHaveCount(1);
    await a.keyboard.up("Tab");
    expect(errors, errors.join("\n")).toEqual([]);
    await ctx.close();
  });
});
