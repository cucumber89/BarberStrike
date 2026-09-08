// Two real game clients prove the join/profile/replication path. Only the later art shots use poses.
// Run with fresh client :5174 and server :2567: node apps/client/e2e/tools/skin-shots.mjs
import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
const out = fileURLToPath(new URL("../out/skins/shots/", import.meta.url));
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: process.env.PW_CHANNEL, args: ["--enable-unsafe-swiftshader"] });
const evidence = { errors: [], replication: null, firstPerson: [], thirdPerson: [] };
const url = process.env.CLIENT_URL ?? "http://localhost:5174";
const ids = ["warsztat", "stalowka", "talk", "slupek-frankiego", "szlaczek-babci", "osy"];
try {
  const contexts = await Promise.all([browser.newContext({ viewport: { width: 1280, height: 720 } }), browser.newContext({ viewport: { width: 1280, height: 720 } })]);
  for (let i = 0; i < contexts.length; i++) await contexts[i].addInitScript(({ ids, owner }) => {
    localStorage.setItem("fb_settings_v1", JSON.stringify({ graphics: { preset: "low", renderer: "webgl2", renderScale: .75, shadows: "off", postProcessing: false, antialiasing: false, importedModels: false } }));
    if (owner) localStorage.setItem("bs_profile_v1", JSON.stringify({ xp: 0, skins: ids.map(skin => ({ skin, wear: 0, rolledAt: 1 })), equip: { pistol: "slupek-frankiego" } }));
  }, { ids, owner: i === 0 });
  const a = await contexts[0].newPage(), b = await contexts[1].newPage();
  for (const page of [a, b]) page.on("pageerror", error => evidence.errors.push(error.message));
  const enter = async page => {
    await page.waitForFunction(() => window.__fb?.hud.get().loadStage === "ready", null, { timeout: 120000 });
    await page.getByRole("button", { name: /ENTER MATCH/i }).click();
    await page.waitForFunction(() => window.__fb.hud.get().alive, null, { timeout: 60000 });
    await page.evaluate(async () => {
      if (document.fullscreenElement) await document.exitFullscreen();
      const c = document.querySelector("canvas.game-canvas");
      Object.defineProperty(document, "pointerLockElement", { get: () => c, configurable: true });
      document.dispatchEvent(new Event("pointerlockchange"));
    });
  };
  await a.goto(url); await a.getByTestId("btn-play").click();
  await a.getByTestId("input-name").fill("SKIN OWNER"); await a.getByTestId("input-room").fill(`skins-${Date.now()}`);
  await a.getByTestId("map-gora").click(); await a.getByTestId("btn-create").click(); await enter(a);
  const { room, map, ownerId } = await a.evaluate(() => ({ room: window.__fb.game.conn.state.roomName, map: window.__fb.game.conn.state.mapId, ownerId: window.__fb.hud.get().myId }));
  // The invite path contains the ROOM NAME, and matchmaking also filters by map.
  await b.goto(`${url}/r/${encodeURIComponent(room)}?mode=tdm&map=${map}`);
  await b.getByTestId("input-name").fill("SKIN OBSERVER"); await b.getByTestId("btn-quickplay").click(); await enter(b);
  await b.waitForFunction(id => {
    const g = window.__fb.game, remote = g.remotes.get(id);
    return g.conn.state.players.get(id)?.skins === "pistol=slupek-frankiego" &&
      remote?.character.weapons.get("pistol")?.meshesByMat.get("metal")?.every(m => m.material?.name === "skin_pistol_slupek-frankiego_metal");
  }, ownerId, { timeout: 60000 }).catch(async error => {
    evidence.debug = await Promise.all([a, b].map(page => page.evaluate(() => {
      const g = window.__fb.game;
      return { profile: localStorage.getItem("bs_profile_v1"), players: [...g.conn.state.players.values()].map(p => ({ id: p.id, weapon: p.weapon, skins: p.skins })),
        remotes: [...g.remotes.values()].map(r => ({ id: r.id, kind: r.character.constructor.name, weapons: [...(r.character.weapons ?? [])].map(([id, m]) => ({ id, materials: m.root.getChildMeshes().map(m => m.material?.name) })) })) };
    })));
    await a.screenshot({ path: `${out}/debug-owner.png` }); await b.screenshot({ path: `${out}/debug-observer.png` }); throw error;
  });
  evidence.replication = await b.evaluate(id => {
    const g = window.__fb.game, remote = g.remotes.get(id), model = remote.character.weapons.get("pistol");
    return { field: g.conn.state.players.get(id).skins, meshes: model.root.getChildMeshes().length,
      materials: [...model.meshesByMat].map(([mat, meshes]) => ({ mat, names: meshes.map(m => m.material.name) })) };
  }, ownerId);
  assert.equal(evidence.replication.field, "pistol=slupek-frankiego");
  await b.screenshot({ path: `${out}/observer-live.png` });
  for (const skin of ids) {
    const result = await a.evaluate(async skin => {
      const vm = window.__fbView.viewmodel, model = vm.models.get("pistol"); const count = model.root.getChildMeshes().length;
      await vm.applySkin("pistol", skin);
      return { skin, before: count, after: model.root.getChildMeshes().length, painted: model.meshesByMat.get("metal").every(m => m.material.name === `skin_pistol_${skin}_metal`) };
    }, skin);
    assert.equal(result.before, result.after); assert.ok(result.painted); evidence.firstPerson.push(result);
    await a.waitForTimeout(300); await a.screenshot({ path: `${out}/${skin}-idle.png` });
    await a.evaluate(() => { window.__fb.game.inputState.mouseButtons = 4; });
    await a.waitForTimeout(700); await a.screenshot({ path: `${out}/${skin}-ads.png` });
    await a.evaluate(() => { window.__fb.game.inputState.mouseButtons = 0; });
  }
  // Preserve the actual replicated remote model/materials. Pose only its camera for readable evidence.
  for (const distance of [3, 12]) {
    const data = await b.evaluate(([id, distance]) => {
      const g = window.__fb.game, scene = g.currentScene, remote = g.remotes.get(id), camera = g.localPlayer.camera;
      const root = remote.character.root;
      if (window.__skinCamera) scene.onBeforeRenderObservable.remove(window.__skinCamera);
      window.__fbView.viewmodel.setVisible(false);
      const pose = () => {
        const target = root.getAbsolutePosition().clone(); target.y += 1.15;
        camera.position.copyFrom(target); camera.position.x += distance; camera.position.z += .3;
        camera.setTarget(target);
      };
      window.__skinCamera = scene.onBeforeRenderObservable.add(pose);
      return { distance, note: "Camera posed; actual replicated remote weapon and world retained." };
    }, [ownerId, distance]);
    await b.waitForTimeout(600); await b.screenshot({ path: `${out}/observer-${distance}m.png` }); evidence.thirdPerson.push(data);
  }
  assert.deepEqual(evidence.errors, []);
} finally { await writeFile(`${out}/verification.json`, JSON.stringify(evidence, null, 2)); await browser.close(); }
