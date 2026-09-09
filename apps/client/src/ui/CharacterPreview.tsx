import { useEffect, useRef } from "react";
import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color4 } from "@babylonjs/core/Maths/math.color";
import { BODY_ENVELOPE, type Team } from "@frankibarber/shared";
import { Character } from "../game/view/Character";

/**
 * The body, turning on the spot in the wardrobe.
 *
 * Built the same way `SkinPreview` is, and for the same reasons: its own engine and scene, released
 * on unmount, because every mount owns a WebGL context and a browser gives out about sixteen of
 * them before it starts silently dropping the oldest. The build is a CONSTRUCTOR argument to
 * `Character`, so switching one rebuilds the body rather than mutating it — which is also what
 * happens in a match, where a body is built once from the join field and never re-shaped.
 *
 * It runs the real animation loop rather than a still pose: the thing a player is choosing between
 * is a silhouette in motion, and a static T-pose is the one view that hides how a build reads.
 */
export function CharacterPreview({ build, haircut, team = 0, rotate = true }: {
  build: string; haircut: string; team?: Team; rotate?: boolean;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const state = useRef<{ scene: Scene; body: Character | null } | null>(null);
  // Kept in a ref and read by the render loop, so a prop change never restarts the engine.
  const look = useRef({ build, haircut });
  look.current = { build, haircut };

  useEffect(() => {
    const element = canvas.current!;
    const engine = new Engine(element, true, { preserveDrawingBuffer: true, stencil: true });
    const scene = new Scene(engine);
    scene.clearColor = new Color4(.045, .065, .08, 1);
    // Framed on the whole body from the crown to the sole, slightly above eye level and off to one
    // side: the three-quarter view is where a silhouette reads, where a straight-on one flattens it.
    const height = BODY_ENVELOPE.crownY - BODY_ENVELOPE.footY;
    const camera = new ArcRotateCamera("body_camera", -0.9, 1.35, height * 1.85, new Vector3(0, height * .52, 0), scene);
    camera.minZ = .01; camera.lowerRadiusLimit = height * 1.1; camera.upperRadiusLimit = height * 3;
    camera.wheelPrecision = 40; camera.attachControl(element, true);
    const fill = new HemisphericLight("body_fill", new Vector3(0, 1, .3), scene); fill.intensity = 1.15;
    const key = new DirectionalLight("body_key", new Vector3(-1, -1.6, .8), scene); key.intensity = 2.2;
    // A rim from behind separates the body from the panel it stands on — without it a dark build on
    // a dark background is an outline nobody can judge.
    const rim = new DirectionalLight("body_rim", new Vector3(.7, -.4, -1), scene); rim.intensity = 1.1;
    state.current = { scene, body: null };

    const observer = new ResizeObserver(() => engine.resize()); observer.observe(element);
    let last = performance.now();
    engine.runRenderLoop(() => {
      const now = performance.now(), dt = Math.min(now - last, 50); last = now;
      const s = state.current;
      if (s?.body) {
        s.body.update({
          speed: 0, grounded: true, crouch: false, pitch: 0, alive: true, reloading: false,
          weapon: "rifle", moveDir: 0, haircut: look.current.haircut,
        }, dt);
      }
      if (rotate && !element.matches(":active")) camera.alpha += dt * .00022;
      scene.render();
    });
    return () => {
      observer.disconnect();
      state.current = null;
      scene.dispose(); engine.dispose();  // Every mount owns a WebGL context: always release it.
    };
  }, [rotate]);

  useEffect(() => {
    const s = state.current; if (!s) return;
    s.body?.dispose(); s.body = null;
    if (canvas.current) canvas.current.dataset.ready = "false";
    const body = new Character(s.scene, team, `preview_${build}`, build);
    // One frame so the pose smoothers are off their zero state before the first render.
    body.update({
      speed: 0, grounded: true, crouch: false, pitch: 0, alive: true, reloading: false,
      weapon: "rifle", moveDir: 0, haircut,
    }, 16);
    s.body = body;
    if (canvas.current) canvas.current.dataset.ready = "true";
    return () => { if (state.current === s && s.body === body) { body.dispose(); s.body = null; } };
  }, [build, haircut, team]);

  return (
    <canvas
      ref={canvas}
      data-testid="character-preview"
      data-build={build}
      aria-label="Podgląd postaci — przeciągnij, aby obrócić"
      style={{ width: "100%", height: "100%", display: "block", touchAction: "none" }}
    />
  );
}
