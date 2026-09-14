import { useEffect, useRef } from "react";
import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color4 } from "@babylonjs/core/Maths/math.color";
import type { WeaponId } from "@frankibarber/shared";
import { buildWeaponModel, createWeaponMaterials, weaponFrame, type WeaponModel } from "../game/view/weaponMeshes";
import { SkinBinding, SkinRegistry } from "../game/view/skins";

export type PreviewView = "side" | "left" | "front" | "back" | "top" | "close" | "close-left";
/** Camera poses for the review tool: the right flank is the default, the left is the mirrored flank. */
const VIEWS: Record<PreviewView, [alpha: number, beta: number, zoom: number]> = {
  side: [.12, 1.32, 1], left: [Math.PI + .12, 1.32, 1], front: [Math.PI / 2, 1.4, 1], back: [-Math.PI / 2, 1.4, 1], top: [.12, .25, 1],
  close: [.12, 1.32, .5], "close-left": [Math.PI + .12, 1.32, .5],
};

export function SkinPreview({ weapon, skinId, rotate = true, view = "side", wear = 0 }: { weapon: WeaponId; skinId: string; rotate?: boolean; view?: PreviewView; wear?: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const state = useRef<{ scene: Scene; camera: ArcRotateCamera; binding: SkinBinding; model: WeaponModel | null; mats: ReturnType<typeof createWeaponMaterials> } | null>(null);
  useEffect(() => {
    const element = canvas.current!;
    const engine = new Engine(element, true, { preserveDrawingBuffer: true, stencil: true });
    const scene = new Scene(engine); scene.clearColor = new Color4(.045, .065, .08, 1);
    const camera = new ArcRotateCamera("skin_camera", .12, 1.32, 1.25, new Vector3(0, .08, .2), scene);
    camera.minZ = .01; camera.lowerRadiusLimit = .12; camera.upperRadiusLimit = 2.5;
    camera.wheelPrecision = 150; camera.attachControl(element, true);
    const hemi = new HemisphericLight("skin_fill", new Vector3(0, 1, .3), scene); hemi.intensity = 1.2;
    const key = new DirectionalLight("skin_key", new Vector3(-1, -2, .5), scene); key.intensity = 2;
    const mats = createWeaponMaterials(scene); const binding = new SkinBinding(SkinRegistry.forScene(scene), mats);
    state.current = { scene, camera, binding, mats, model: null };
    const observer = new ResizeObserver(() => engine.resize()); observer.observe(element);
    engine.runRenderLoop(() => { if (rotate && !element.matches(":active")) camera.alpha += Math.min(engine.getDeltaTime(), 50) * .00012; scene.render(); });
    return () => {
      observer.disconnect(); binding.clear(); state.current = null;
      scene.dispose(); engine.dispose(); // Every mount owns a WebGL context: always release it on menu exit.
    };
  }, [rotate]);
  useEffect(() => {
    const s = state.current; if (!s) return;
    s.binding.clear(); s.model?.root.dispose(false, false);
    s.model = buildWeaponModel(weapon, s.mats, s.scene, `preview_${weapon}`);
    // Every selection starts in a three-quarter side view, where the silhouette, magazine and
    // stock are readable. Continuous rotation may have left the previous gun pointing end-on.
    s.camera.alpha = .12;
    s.camera.beta = 1.32;
    s.camera.radius = Math.max(.34, s.model.length * 1.3);
    // Aim at the receiver, where the skin's hero sits: a revolver's is a hand lower than a rifle's.
    const r = weaponFrame(weapon).receiver;
    s.camera.target.set(0, (r.y0 + r.y1) / 2 + .01, s.model.length * .22);
    elementReady(false);
    void s.binding.apply(s.model, weapon, skinId, wear).then(() => { if (state.current === s) elementReady(true); });
    function elementReady(ready: boolean) { if (canvas.current) canvas.current.dataset.ready = String(ready); }
  }, [weapon, skinId, rotate, wear]);
  useEffect(() => {
    const s = state.current; if (!s) return;
    const [alpha, beta, zoom] = VIEWS[view]; s.camera.alpha = alpha; s.camera.beta = beta;
    if (s.model) s.camera.radius = Math.max(.2, s.model.length * 1.3 * zoom);
  }, [view, weapon, skinId]);
  return <canvas ref={canvas} data-testid="skin-preview" aria-label="Podgląd broni — przeciągnij, aby obrócić" style={{ width: "100%", height: "100%", display: "block", touchAction: "none" }} />;
}
