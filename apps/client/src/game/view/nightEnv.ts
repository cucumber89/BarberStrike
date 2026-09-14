import { Scene } from "@babylonjs/core/scene";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { SphericalHarmonics, SphericalPolynomial } from "@babylonjs/core/Maths/sphericalPolynomial";
import { RawCubeTexture } from "@babylonjs/core/Materials/Textures/rawCubeTexture";
import { Constants } from "@babylonjs/core/Engines/constants";
import "@babylonjs/core/Materials/Textures/baseTexture.polynomial";

/**
 * A tiny procedural "night district" environment for the things a player looks at closely: the
 * gun in their hands, the hands, the bodies of other players.
 *
 * The map's PBR materials have no environment texture, and without one a metal is only ever lit by
 * the handful of lights that reach it — a rifle in ADS read as one flat grey block (feel-cycle
 * screenshots, stage 1), because nothing on it had anything to reflect. This is what it reflects
 * now: a dark blue sky, a warm sodium horizon, dark asphalt below, a cool moon and a few lamp
 * glints. Sixteen pixels a face, six faces, mipmapped, so a rough polymer sees a soft gradient and
 * a polished slide sees a highlight. The diffuse term (the spherical polynomial) is built HERE from
 * the same pixels rather than read back from the GPU, so it works on WebGL2 and WebGPU alike and
 * costs nothing at load. Nothing in the map is touched: `scene.environmentTexture` stays unset and
 * the texture is assigned per material.
 */
export const NIGHT_ENV_SIZE = 16;

/** Linear-light radiance seen in a direction (unit vector). */
export function nightRadiance(x: number, y: number, z: number, out: Color3): Color3 {
  const e = y; // elevation, -1..1
  if (e >= 0) {
    // Sky: warm at the horizon (the sodium glow of a lit street), deep blue-black at the zenith.
    const t = Math.min(1, e * 2.2);
    const k = t * t * (3 - 2 * t);
    out.set(0.11 + (0.010 - 0.11) * k, 0.075 + (0.014 - 0.075) * k, 0.045 + (0.03 - 0.045) * k);
  } else {
    // Ground: dark asphalt, a touch lighter toward the horizon where the lamps pool.
    const t = Math.min(1, -e * 3);
    out.set(0.05 + (0.012 - 0.05) * t, 0.042 + (0.011 - 0.042) * t, 0.035 + (0.010 - 0.035) * t);
  }
  // Lamp glints just above the horizon at four headings, and a cool moon high to the north-west:
  // these are what put a highlight on a slide or a scope ring. Angular width ~7° with a soft edge.
  const glint = (dx: number, dy: number, dz: number, r: number, g: number, b: number, width: number) => {
    const d = x * dx + y * dy + z * dz;
    const w = Math.max(0, (d - Math.cos(width)) / (1 - Math.cos(width)));
    if (w > 0) { const s = w * w; out.r += r * s; out.g += g * s; out.b += b * s; }
  };
  const el = Math.sin(0.18), ec = Math.cos(0.18);
  glint(ec * Math.sin(0.4), el, ec * Math.cos(0.4), 0.9, 0.62, 0.30, 0.12);
  glint(ec * Math.sin(2.3), el, ec * Math.cos(2.3), 0.7, 0.5, 0.26, 0.10);
  glint(ec * Math.sin(-1.7), el, ec * Math.cos(-1.7), 0.8, 0.55, 0.28, 0.11);
  glint(ec * Math.sin(3.6), el, ec * Math.cos(3.6), 0.5, 0.42, 0.30, 0.10);
  const moonDir = new Vector3(-0.45, 1, -0.35).normalize();
  glint(moonDir.x, moonDir.y, moonDir.z, 0.55, 0.6, 0.75, 0.09);
  return out;
}

const toSrgb = (v: number): number => Math.round(Math.max(0, Math.min(1, v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055)) * 255);

/** Direction through the centre of pixel (u, v) in [-1, 1] on cube face `face` (+X −X +Y −Y +Z −Z). */
function faceDir(face: number, u: number, v: number, out: Vector3): Vector3 {
  switch (face) {
    case 0: return out.set(1, -v, -u);
    case 1: return out.set(-1, -v, u);
    case 2: return out.set(u, 1, v);
    case 3: return out.set(u, -1, -v);
    case 4: return out.set(u, -v, 1);
    default: return out.set(-u, -v, -1);
  }
}

export interface NightEnvData {
  /** Six sRGB RGBA8 faces, `size` square each, in Babylon's +X −X +Y −Y +Z −Z order. */
  faces: Uint8Array[];
  /** Diffuse irradiance of the same sky, ready for `BaseTexture.sphericalPolynomial`. */
  polynomial: SphericalPolynomial;
}

/** The pixels and the harmonics, pure (no engine): unit-tested, and reused for every scene. */
export function nightEnvData(size = NIGHT_ENV_SIZE): NightEnvData {
  const faces: Uint8Array[] = [];
  const sh = new SphericalHarmonics();
  const dir = new Vector3();
  const c = new Color3();
  let solid = 0;
  const step = 2 / size;
  for (let f = 0; f < 6; f++) {
    const px = new Uint8Array(size * size * 4);
    for (let j = 0; j < size; j++) {
      const v = -1 + (j + 0.5) * step;
      for (let i = 0; i < size; i++) {
        const u = -1 + (i + 0.5) * step;
        faceDir(f, u, v, dir);
        // Solid angle of this pixel (the cube face is not a sphere: corners see less sky).
        const d2 = 1 + u * u + v * v;
        const dOmega = (step * step) / (d2 * Math.sqrt(d2));
        dir.normalize();
        nightRadiance(dir.x, dir.y, dir.z, c);
        sh.addLight(dir, c, dOmega);
        solid += dOmega;
        const o = (j * size + i) * 4;
        px[o] = toSrgb(c.r); px[o + 1] = toSrgb(c.g); px[o + 2] = toSrgb(c.b); px[o + 3] = 255;
      }
    }
    faces.push(px);
  }
  // The same normalisation Babylon's own cube → polynomial tool applies to a real texture.
  sh.scaleInPlace((4 * Math.PI) / solid);
  sh.convertIncidentRadianceToIrradiance();
  sh.convertIrradianceToLambertianRadiance();
  return { faces, polynomial: SphericalPolynomial.FromHarmonics(sh) };
}

const CACHE = new Map<Scene, RawCubeTexture | null>();
let shared: NightEnvData | null = null;

/**
 * The scene's night environment cube, built once per scene and freed with it. Null where the
 * engine cannot upload a raw cube (the NullEngine the tests run on): a material without a
 * reflection simply reflects nothing, as before.
 */
export function nightEnvironment(scene: Scene): RawCubeTexture | null {
  if (CACHE.has(scene)) return CACHE.get(scene)!;
  shared ??= nightEnvData();
  let tex: RawCubeTexture | null = null;
  try {
    tex = new RawCubeTexture(scene, shared.faces, NIGHT_ENV_SIZE, Constants.TEXTUREFORMAT_RGBA, Constants.TEXTURETYPE_UNSIGNED_BYTE, true, false, Constants.TEXTURE_TRILINEAR_SAMPLINGMODE);
    tex.name = "night_env";
    tex.gammaSpace = true;          // the faces are sRGB bytes
    tex.sphericalPolynomial = shared.polynomial;
  } catch {
    tex = null; // the NullEngine has no texture upload; a headless test needs no reflections
  }
  CACHE.set(scene, tex);
  scene.onDisposeObservable.addOnce(() => { CACHE.delete(scene); });
  return tex;
}
