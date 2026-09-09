import { useEffect, useRef } from "react";
import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color4 } from "@babylonjs/core/Maths/math.color";
import { BODY_ENVELOPE, DEFAULT_OUTFIT, type Team } from "@frankibarber/shared";
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
 *
 * Build, outfit and haircut are all shown together, because that is what the player will be: three
 * separate previews would let somebody pick a hood and a mohawk without ever seeing that the hood
 * covers it.
 */
export function CharacterPreview({ build, haircut, outfit = DEFAULT_OUTFIT, team = 0, rotate = true, turn = 0 }: {
  build: string; haircut: string; outfit?: string; team?: Team; rotate?: boolean;
  /**
   * Yaw applied to the BODY (rad), not to the camera — the evidence tool turns it round to show a
   * cape. Turning the body is unambiguous; an orbit angle depends on which direction the camera
   * measures from, which is one guess too many for something a test asserts against.
   */
  turn?: number;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const state = useRef<{ scene: Scene; camera: ArcRotateCamera; body: Character | null } | null>(null);
  /**
   * Everything the render loop reads, in a ref rather than in the effect's dependencies.
   *
   * The engine effect must run EXACTLY once per mount. It used to list `rotate` and the camera angle,
   * and that was a real bug rather than a style point: changing either tore the scene down and built
   * a new one, while the effect that builds the BODY did not re-run — its own dependencies had not
   * changed — so the preview came back as an empty box. It showed up as thirteen blank tiles the
   * first time the evidence tool asked for a view from behind.
   */
  const look = useRef({ build, haircut, outfit, rotate });
  look.current = { build, haircut, outfit, rotate };

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
    state.current = { scene, camera, body: null };

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
      if (look.current.rotate && !element.matches(":active")) camera.alpha += dt * .00022;
      scene.render();
    });
    return () => {
      observer.disconnect();
      state.current = null;
      scene.dispose(); engine.dispose();  // Every mount owns a WebGL context: always release it.
    };
  }, []);

  // Turning the body is a property of the body, so it is set on the body — never by rebuilding
  // the scene, which is what the first cut did and why it came back as an empty box.
  useEffect(() => { if (state.current?.body) state.current.body.root.rotation.y = turn; }, [turn]);

  useEffect(() => {
    const s = state.current; if (!s) return;
    s.body?.dispose(); s.body = null;
    if (canvas.current) canvas.current.dataset.ready = "false";
    const body = new Character(s.scene, team, `preview_${build}`, build, outfit);
    body.root.rotation.y = turn;
    // One frame so the pose smoothers are off their zero state before the first render.
    body.update({
      speed: 0, grounded: true, crouch: false, pitch: 0, alive: true, reloading: false,
      weapon: "rifle", moveDir: 0, haircut,
    }, 16);
    s.body = body;
    if (canvas.current) canvas.current.dataset.ready = "true";
    return () => { if (state.current === s && s.body === body) { body.dispose(); s.body = null; } };
  }, [build, haircut, outfit, team, turn]);

  return (
    <canvas
      ref={canvas}
      data-testid="character-preview"
      data-build={build}
      data-outfit={outfit}
      aria-label="Podgląd postaci — przeciągnij, aby obrócić"
      style={{ width: "100%", height: "100%", display: "block", touchAction: "none" }}
    />
  );
}
