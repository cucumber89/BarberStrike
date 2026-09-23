/**
 * What a grenade, a perk and the launcher actually DO on the screen and in the ears — measured on
 * the shipped client over a real socket, not asserted from the source.
 *
 * Five things this drop changed, and how each one is read here:
 *
 *  G1  bounce sound          `sfx.bounce` had zero call sites. The tool counts the client-local
 *                            `grenadeBounce` events AND the voices the engine really started for
 *                            them (`maxDistance: 24` is that sound's own, no other uses it).
 *  G11 blast shake           `addShake` is wrapped, so the number each detonation puts on the view
 *                            is printed per kind. It used to be one number for frag and molotov
 *                            and nothing at all for the launcher's shell.
 *  G9  the cook ring         Which grenades take the crosshair away, and where the ring reads 1.
 *  P2  the steroids' gate    The perk row while the 2 s after a hit runs, and after it.
 *  L2/P4 the shop card       The rows the launcher and the perks print.
 *
 * Needs the dev servers (`FB_DEV_TOOLS=1 node apps/server/dist/index.js` on 2567, vite on 5174).
 * Run from apps/client: `PW_CHROMIUM=/opt/pw-browsers/chromium node e2e/tools/grenade-feel.mjs`.
 */
import { chromium } from "@playwright/test";
const OUT = process.env.OUT ?? "e2e/out/nades";
const LOW = JSON.stringify({ graphics: { preset: "low", renderer: "webgl2", renderScale: 0.5, shadows: "off", postProcessing: false, effects: 0.6, antialiasing: false } });
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || "/opt/pw-browsers/chromium", args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
await ctx.addInitScript((v) => localStorage.setItem("fb_settings_v1", v), LOW);
const page = await ctx.newPage();
page.on("pageerror", (e) => console.log("PAGEERROR", e.message));
await page.goto("http://localhost:5174/");
await page.getByTestId("btn-play").click();
await page.getByTestId("input-name").fill("NADES");
await page.getByTestId("input-room").fill(`nades-${Date.now()}`);
await page.getByTestId("btn-quickplay").click();
await page.waitForFunction(() => window.__fb?.game && window.__fb.hud.get().loadStage === "ready", null, { timeout: 60000 });
await page.getByTestId("enter-game").click({ timeout: 60000 });
await page.waitForFunction(() => window.__fb.hud.get().alive, null, { timeout: 30000 });
const lock = () => page.evaluate(() => { const c = document.querySelector("canvas"); Object.defineProperty(document, "pointerLockElement", { get: () => c, configurable: true }); document.dispatchEvent(new Event("pointerlockchange")); });
await lock();

// ---- probes. The audio one filters on the bounce's own maxDistance; the shake one wraps the
// method the view calls, so what is printed is the number the camera was actually given.
await page.evaluate(() => {
  const g = window.__fb.game;
  const p = { bounces: [], bounceVoices: 0, shakes: [], booms: [] };
  window.__probe = p;
  g.events.on("grenadeBounce", (e) => p.bounces.push({ kind: e.kind, speed: Math.round(e.speed * 10) / 10 }));
  g.events.on("boom", (e) => p.booms.push(e.kind));
  const eng = window.__fbAudio.engine;
  const play = eng.play.bind(eng);
  eng.play = (fn, opts) => { if (opts && opts.maxDistance === 24) p.bounceVoices++; return play(fn, opts); };
  const lp = g.localPlayer;
  const shake = lp.addShake.bind(lp);
  lp.addShake = (v) => { if (v > 0) p.shakes.push(Math.round(v * 1000) / 1000); return shake(v); };
});

const hud = () => page.evaluate(() => window.__fb.hud.get());
const probe = () => page.evaluate(() => window.__probe);
const reset = () => page.evaluate(() => { const p = window.__probe; p.bounces = []; p.bounceVoices = 0; p.shakes = []; p.booms = []; });
/** Dev wallet, waited for: `buy` a frame later would be refused for want of money. */
const money = async (n) => {
  await page.evaluate((v) => window.__fb.game.conn.send("dev:money", v), n);
  await page.waitForFunction((v) => window.__fb.hud.get().money >= v, n, { timeout: 10000 });
};
/** Buy and wait for the server's answer, so nothing below runs on a loadout we do not have. */
const buy = async (...ids) => {
  for (const id of ids) {
    await page.evaluate((i) => window.__fb.game.buy(i), id);
    await page.waitForFunction((i) => { const h = window.__fb.hud.get(); return h.owned.includes(i) || h.lethal === i || h.tactical === i || h.perks[i] > h.serverNow; }, id, { timeout: 10000 })
      .catch(() => console.log(`(buy ${id} was refused)`));
  }
};
/** Look somewhere and throw the lethal in hand; `holdMs` cooks a frag. */
/** Wait n rendered frames — the unit the input layer is actually drained in. */
const frames = (n) => page.evaluate((k) => new Promise((res) => {
  let left = k;
  const tick = () => (--left <= 0 ? res() : requestAnimationFrame(tick));
  requestAnimationFrame(tick);
}), n);
const aim = (yawTurn, pitch) => page.evaluate(([y, p]) => { const lp = window.__fb.game.localPlayer; lp.yaw += y; lp.pitch = p; }, [yawTurn, pitch]);

/**
 * Throw what is in the lethal slot, and do not come back until it has left the hand.
 *
 * SwiftShader renders this container at a few frames a second and the input layer is drained once
 * a frame, so a key held for the 120 ms a human would hold it can fall entirely BETWEEN two frames
 * and be missed — which is exactly what the first draft of this tool measured and reported as a
 * grenade that never boomed. Every step below waits for the state it wants, never for a clock.
 */
const throwLethal = async (cookMs = 250) => {
  const before = (await hud()).lethalCount;
  await page.keyboard.down("KeyG");
  await page.waitForFunction(() => window.__fb.hud.get().cookingKind !== "", null, { timeout: 8000 })
    .catch(() => console.log("(the grenade never came into the hand)"));
  await page.waitForTimeout(cookMs);
  await page.keyboard.up("KeyG");
  await page.waitForFunction((n) => window.__fb.hud.get().lethalCount < n, before, { timeout: 8000 })
    .catch(() => console.log("(the grenade never left the hand)"));
};
/**
 * One trigger pull through the input state the game drains — a synthetic click needs a real lock.
 *
 * Retried, and the retry is the honest part: the launcher is semi-automatic, so the controller
 * takes a rising edge only, and driving a rising edge from outside the render loop is a race with
 * a renderer running at a few frames a second. The shot it eventually takes is the shipped one.
 */
const fireOnce = async () => {
  for (let attempt = 1; attempt <= 4; attempt++) {
    const before = await page.evaluate(() => window.__fbView.shots);
    await page.evaluate(() => { window.__fb.game.inputState.mouseButtons = 0; });
    await frames(4);
    await page.evaluate(() => { window.__fb.game.inputState.mouseButtons = 1; });
    const went = await page.waitForFunction((n) => window.__fbView.shots > n, before, { timeout: 4000 }).then(() => true).catch(() => false);
    await page.evaluate(() => { window.__fb.game.inputState.mouseButtons = 0; });
    if (went) return;
    if (attempt === 4) console.log("(the gun never went off:", JSON.stringify(await page.evaluate(() => {
      const g = window.__fb.game, h = window.__fb.hud.get(), i = g.inputState;
      return { weapon: h.weapon, ammo: h.ammo, reloading: h.reloading, alive: h.alive, locked: h.pointerLocked, mb: i.mouseButtons };
    })), ")");
    await frames(4);
  }
};

console.log(`# Grenades, perks and the launcher, on the shipped client (${new Date().toISOString().slice(0, 10)})\n`);

/** Alive and holding money: a molotov at your own feet is how this tool makes damage happen. */
const ready = async () => {
  await page.waitForFunction(() => { const h = window.__fb.hud.get(); return h.alive && !h.reloading; }, null, { timeout: 30000 })
    .catch(() => console.log("(not ready: dead, or still working the action)"));
  await frames(3);
  await money(16000);
};

// ---- G11a: the launcher, FIRST, out of a fresh spawn — before this script has spent a minute
// throwing things, so the shot is not competing with a reload or a grenade in the hand.
await ready();
await buy("launcher");
await page.waitForFunction(() => window.__fb.hud.get().weapon === "launcher", null, { timeout: 10000 }).catch(() => console.log("(never got the launcher in hand)"));
const shellLine = await (async () => {
  await reset();
  await aim(0, 0.55);
  await fireOnce();
  await page.waitForFunction(() => window.__probe.booms.length > 0, null, { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(500);
  const q = await probe();
  return `${"launcher shell, into the ground".padEnd(30)} kind=${JSON.stringify(q.booms)} shake=${JSON.stringify(q.shakes)}`;
})();

// ---- G1: a frag thrown flat, and every knock it makes on the way down.
await ready();
await buy("frag", "smoke");
await reset();
await aim(Math.PI / 2, 0.05);
await page.waitForTimeout(300);
await throwLethal();
await page.waitForFunction(() => window.__probe.booms.length > 0, null, { timeout: 15000 }).catch(() => console.log("(no detonation)"));
await page.waitForTimeout(400);
let r = await probe();
console.log("## G1 — the bounce that had no call site\n");
console.log("```");
console.log(`frag thrown flat: ${r.bounces.length} bounces  ${JSON.stringify(r.bounces)}`);
console.log(`voices the engine started for them: ${r.bounceVoices}   <- was 0, always, since drop 2`);
console.log("(the sound has existed since drop 2 with nothing calling it; a grenade landing at your");
console.log(" feet was silent. `maxDistance: 24` is that sound's own, so these are its voices.)");
console.log("```\n");

// ---- G9: what takes the crosshair away, and what the ring reads at the release.
console.log("## G9 — the cook ring belongs to the one grenade that cooks\n```");
const hold = async (key) => {
  await page.keyboard.down(key);
  await page.waitForTimeout(400);
  const seen = { crosshair: await page.getByTestId("crosshair").count(), ring: await page.getByTestId("cook").count() };
  await page.keyboard.up(key);
  await page.waitForTimeout(1200);
  return seen;
};
const smokeHold = await hold("Digit4");
console.log(`smoke in hand: crosshair=${smokeHold.crosshair} ring=${smokeHold.ring}   <- it never cooks, so it keeps the sight`);
await ready();
await buy("frag");
await page.keyboard.down("KeyG");
await page.waitForFunction(() => window.__fb.hud.get().cooking >= 0.999, null, { timeout: 8000 }).catch(() => console.log("the ring never reached 1"));
const full = (await hud()).cooking;
const cross = await page.getByTestId("crosshair").count();
await page.keyboard.up("KeyG");
console.log(`frag in hand:  crosshair=${cross} ring=${await page.getByTestId("cook").count()}, and it reads ${full.toFixed(3)} where the hand opens by itself`);
console.log("(it used to read 0.86 there: the ring was drawn against the FUSE, and the arm swung at a");
console.log(" point the ring had never marked)");
console.log("```\n");
await page.waitForTimeout(3000);

// ---- G11: the same blast, three weapons, from a standing spot.
console.log("## G11 — one number for every blast, or each blast's own\n```");
const blast = async (label, fn) => {
  await reset();
  await fn();
  await page.waitForFunction(() => window.__probe.booms.length > 0, null, { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(500);
  const p = await probe();
  return `${label.padEnd(30)} kind=${JSON.stringify(p.booms)} shake=${JSON.stringify(p.shakes)}`;
};
await ready();
await buy("frag");
console.log(await blast("frag, a few metres ahead", async () => { await aim(0, 0.7); await throwLethal(600); }));
console.log(shellLine);
console.log("(the shell's line carries two numbers: 0.014 is the launcher's own recoil, straight out of");
console.log(" the feel table, and the second is the BLAST — which used to be 0, because the shake");
console.log(" table knew about the frag and the molotov and nothing else. A molotov, in turn, used to");
console.log(" kick exactly as hard as a frag. The shot is the shipped one; only the trigger is driven");
console.log(" through `inputState`, retried, because a semi-automatic wants a rising edge and this");
console.log(" container renders at a few frames a second.)");
console.log("```\n");

// ---- P2 / P1 / P5: the perk rows, with the molotov under our own feet as the source of damage.
console.log("## P2 — the steroids' two-second gate, in words\n```");
await ready();
await buy("roids", "flask", "molotov");
const perkText = async () => (await page.getByTestId("perks").innerText()).replace(/\n/g, " · ");
console.log(`no hit for a while:  ${await perkText()}`);
await reset();
await aim(0, 0.75);
await throwLethal();
await page.waitForFunction(() => window.__probe.booms.length > 0, null, { timeout: 20000 }).catch(() => console.log("(the bottle never landed)"));
await page.waitForTimeout(400);
console.log(`molotov, a few metres ahead: shake=${JSON.stringify((await probe()).shakes)}   <- a third of a frag's, at half the reach`);
// A LONE client cannot be hurt: the server refuses damage from you to yourself
// (`v.id === attacker.id`, so your own fire and your own frag are free), and in a team mode a
// team-mate's is refused too. So the gate is measured where the HUD reads it: the store's
// `damageAt`, stamped now — the same field, written the same way, that a `Damaged` packet writes.
await page.evaluate(() => window.__fb.hud.set({ damageAt: performance.now() }));
await page.waitForTimeout(350);
console.log(`a hit just landed:   ${await perkText()}`);
console.log("   ^ the hit is the store's `damageAt` stamped now \u2014 the same field, written the same way,");
console.log("     that a Damaged packet writes. A LONE client cannot be hurt: the server refuses damage");
console.log("     from a player to themselves (`v.id === attacker.id`), so your own fire is free.");
await page.screenshot({ path: `${OUT}/perks-gate.png` });
await page.waitForTimeout(2200);
console.log(`two seconds clear:   ${await perkText()}`);
console.log("(the gate is `PERK_EFFECT.roidsDelayMs`, and nothing on the screen used to mention it:");
console.log(" a player who bought the perk, traded shots and watched their health sit still had no");
console.log(" way to tell a working perk from a broken one)");
console.log("```\n");

// ---- L2 / P4: the cards.
console.log("## L2 / P4 — what the shop card says\n```");
await page.keyboard.press("KeyB");
await page.waitForTimeout(800);
const card = async (tab, id) => {
  await page.getByTestId(`shop-tab-${tab}`).click();
  await page.getByTestId(`shop-${id}`).hover();
  await page.waitForTimeout(300);
  return (await page.getByTestId("shop-detail").innerText()).replace(/\n+/g, " · ");
};
console.log(`launcher: ${await card(3, "launcher")}`);
await page.screenshot({ path: `${OUT}/card-launcher.png` });
console.log(`roids:    ${await card(4, "roids")}`);
console.log(`fade:     ${await card(4, "fade")}`);
await page.screenshot({ path: `${OUT}/card-roids.png` });
console.log(`frag:     ${await card(5, "frag")}`);
console.log(`molotov:  ${await card(5, "molotov")}`);
console.log("(the launcher used to say no damage at all — `WEAPONS.launcher.damage` is 0, the damage");
console.log(" is the shell's — under a `Zasięg 40 m` that means nothing for a projectile; and every");
console.log(" perk said one thing, `Czas`, so the shop answered how long and never for what)");
console.log("```");
await browser.close();
