import { useEffect, useRef } from "react";
import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color4 } from "@babylonjs/core/Maths/math.color";
import type { WeaponId } from "@frankibarber/shared";
import { buildWeaponModel, createWeaponMaterials, type WeaponModel } from "../game/view/weaponMeshes";
import { SkinBinding, SkinRegistry } from "../game/view/skins";

export function SkinPreview({ weapon, skinId, rotate = true }: { weapon: WeaponId; skinId: string; rotate?: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const state = useRef<{ scene: Scene; camera: ArcRotateCamera; binding: SkinBinding; model: WeaponModel | null; mats: ReturnType<typeof createWeaponMaterials> } | null>(null);
  useEffect(() => {
    const element = canvas.current!;
    const engine = new Engine(element, true, { preserveDrawingBuffer: true, stencil: true });
    const scene = new Scene(engine); scene.clearColor = new Color4(.045, .065, .08, 1);
    const camera = new ArcRotateCamera("skin_camera", .12, 1.32, 1.25, new Vector3(0, .08, .2), scene);
    camera.minZ = .01; camera.lowerRadiusLimit = .5; camera.upperRadiusLimit = 2.5;
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
    s.camera.radius = Math.max(.65, s.model.length * 1.65);
    s.camera.target.set(0, .08, s.model.length * .22);
    elementReady(false);
    void s.binding.apply(s.model, weapon, skinId).then(() => { if (state.current === s) elementReady(true); });
    function elementReady(ready: boolean) { if (canvas.current) canvas.current.dataset.ready = String(ready); }
  }, [weapon, skinId, rotate]);
  return <canvas ref={canvas} data-testid="skin-preview" aria-label="Podgląd broni — przeciągnij, aby obrócić" style={{ width: "100%", height: "100%", display: "block", touchAction: "none" }} />;
}
