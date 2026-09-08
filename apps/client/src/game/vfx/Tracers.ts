import { Scene } from "@babylonjs/core/scene";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";

interface Tracer { mesh: Mesh; life: number; ttl: number }

const POOL = 48;

/**
 * Pooled bullet tracers: thin emissive cylinders stretched between origin and end point,
 * faded over a few frames. Zero allocations after warm-up.
 */
export class Tracers {
  private pool: Tracer[] = [];
  private active: Tracer[] = [];
  private material: StandardMaterial;
  private mid = new Vector3();
  private dir = new Vector3();

  constructor(private scene: Scene) {
    this.material = new StandardMaterial("tracerMat", scene);
    this.material.emissiveColor = new Color3(1.0, 0.82, 0.55);
    this.material.diffuseColor = Color3.Black();
    this.material.specularColor = Color3.Black();
    this.material.disableLighting = true;
    this.material.alpha = 0.85;
    for (let i = 0; i < POOL; i++) this.pool.push(this.make());
  }

  private make(): Tracer {
    const mesh = MeshBuilder.CreateCylinder("tracer", { height: 1, diameter: 0.02, tessellation: 4 }, this.scene);
    mesh.material = this.material;
    mesh.isPickable = false;
    mesh.setEnabled(false);
    mesh.rotationQuaternion = null;
    return { mesh, life: 0, ttl: 0 };
  }

  /** `width` scales the 20 mm default: the MG-4's rounds are ropes, the VZ-9's are threads. */
  spawn(from: Vector3, to: Vector3, density: number, width = 1): void {
    if (density <= 0) return;
    const t = this.pool.pop() ?? (this.active.length < POOL * 2 ? this.make() : this.active.shift()!);
    const m = t.mesh;
    this.dir.copyFrom(to).subtractInPlace(from);
    const len = this.dir.length();
    if (len < 0.05) { this.pool.push(t); return; }
    this.dir.scaleInPlace(1 / len);
    this.mid.copyFrom(from).addInPlace(to).scaleInPlace(0.5);
    m.position.copyFrom(this.mid);
    m.scaling.set(width, len, width);
    // Orient the cylinder's Y axis along dir.
    m.rotation.set(Math.acos(Math.max(-1, Math.min(1, this.dir.y))), Math.atan2(this.dir.x, this.dir.z), 0);
    // rotation order in Babylon is YXZ (yaw, pitch, roll); pitch = angle from +Y measured around X after yaw.
    m.setEnabled(true);
    m.visibility = 1;
    t.life = 0; t.ttl = 70 + Math.random() * 30;
    this.active.push(t);
  }

  update(dtMs: number): void {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const t = this.active[i];
      t.life += dtMs;
      const f = 1 - t.life / t.ttl;
      if (f <= 0) {
        t.mesh.setEnabled(false);
        this.active.splice(i, 1);
        this.pool.push(t);
      } else {
        t.mesh.visibility = f;
      }
    }
  }

  dispose(): void {
    for (const t of this.active) t.mesh.dispose();
    for (const t of this.pool) t.mesh.dispose();
    this.material.dispose();
  }
}
