// Development-only evidence page for the dances on H: every emote on one stage, frozen at `?t=`
// seconds (or playing live without it). One engine for all of them — twelve previews would be
// twelve WebGL contexts. Driven by `emote-shots.mjs`.
import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color4 } from "@babylonjs/core/Maths/math.color";
import { EMOTES } from "@frankibarber/shared";
import { Character } from "../../src/game/view/Character";

const params = new URLSearchParams(location.search);
// `?emote=<id>&times=0,0.2,0.4` is a filmstrip: one dance at several instants of its loop, side by
// side. Without `times` every emote stands in a row at `t` (or plays live when `t` is absent).
const only = params.get("emote");
const times = params.get("times")?.split(",").map(Number) ?? null;
const frozen = params.has("t") ? Number(params.get("t")) : null;
const side = Number(params.get("alpha") ?? 1.25);
const slots = only && times
  ? times.map((t) => ({ e: EMOTES.find((x) => x.id === only)!, t }))
  : (only ? EMOTES.filter((e) => e.id === only) : EMOTES).map((e) => ({ e, t: frozen }));
const canvas = document.getElementById("c") as HTMLCanvasElement;
const engine = new Engine(canvas, true, { preserveDrawingBuffer: true });
const scene = new Scene(engine);
scene.clearColor = new Color4(.045, .065, .08, 1);
const gap = 1.25;
const centre = new Vector3(-(slots.length - 1) * gap / 2, 0.85, 0);
const camera = new ArcRotateCamera("cam", side, 1.4, 2.2 + slots.length * 0.95, centre, scene);
camera.minZ = .01; camera.attachControl(canvas, true);
new HemisphericLight("fill", new Vector3(0, 1, .3), scene).intensity = 1.15;
new DirectionalLight("key", new Vector3(-1, -1.6, .8), scene).intensity = 2.2;
new DirectionalLight("rim", new Vector3(.7, -.4, -1), scene).intensity = 1.1;
const bodies = slots.map(({ e, t }, i) => {
  const c = new Character(scene, 0, `emote_${e.id}_${i}`);
  c.root.position.set(-i * gap, 0, 0); // −X: seen from the front, time reads left to right
  return { e, c, t };
});
const input = (id: string, ms: number) => ({ speed: 0, grounded: true, crouch: false, pitch: 0, alive: true, reloading: false, weapon: "rifle" as const, moveDir: 0, emote: id, emoteMs: ms });
// Settle every blend at the requested instant: the pose is then the dance's own, not a blend.
for (let k = 0; k < 90; k++) for (const { e, c, t } of bodies) if (t !== null) c.update(input(e.id, t * 1000), 16);
const start = performance.now();
let last = start;
engine.runRenderLoop(() => {
  const now = performance.now(), dt = Math.min(50, now - last); last = now;
  for (const { e, c, t } of bodies) if (t === null) c.update(input(e.id, now - start), dt);
  scene.render();
});
(window as unknown as { __emoteReview: unknown }).__emoteReview = {
  ready: true,
  catalog: EMOTES.map((e) => ({ id: e.id, loopMs: e.loopMs })),
  dancing: () => bodies.map(({ e, c }) => ({ id: e.id, blend: c.dancing })),
};

