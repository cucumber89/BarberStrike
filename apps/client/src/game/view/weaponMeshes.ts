import { Scene } from "@babylonjs/core/scene";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { WeaponId } from "@frankibarber/shared";
import { beveledBox } from "./geometry";
import { supportHandHome, type PartBox } from "./weaponFit";

/**
 * Procedural weapon models. Every weapon is a few dozen boxes/cylinders merged into ONE mesh per
 * material, so a weapon costs ≤ 8 draw calls however detailed it is. The same builder serves the
 * first-person viewmodel and the third-person characters (scaled down).
 *
 * 1.1 look pass: eight materials instead of three (gunmetal, brushed steel, black polymer, tan
 * furniture, walnut, rubber grips, brass, scope glass), and each silhouette carries the details
 * that read at viewmodel distance — picatinny rails with real notches, hooded front sights and
 * rear apertures, trigger guards, charging handles, ejection ports, muzzle devices with vents,
 * stippled grips, sling loops, scope turrets. Aim points, muzzles and lengths are unchanged from
 * the measured ADS alignment.
 *
 * Local frame: +Z = barrel direction, +Y up, origin at the grip/trigger.
 */

export interface WeaponModel {
  root: TransformNode;
  /** Muzzle position node (for flashes/tracers). */
  muzzle: TransformNode;
  /** Ejection port node (shell casings). */
  eject: TransformNode;
  /** Detachable magazine node (reload animation); null for the shotgun/DMR internal mags. */
  magazine: TransformNode | null;
  /** Moving action part (pistol slide, shotgun pump, DMR bolt); null for the SMG/rifle. */
  action: TransformNode | null;
  actionKind: ActionKind;
  /** Aim point in root space (top of the front sight / scope axis): in ADS this sits on the camera axis. */
  aimPoint: [number, number, number];
  /** The same aim point as a node, so a tool can read where it lands on screen (`vm-fit.mjs`). */
  aim: TransformNode;
  /** Approximate length along +Z (metres), for pose tuning. */
  length: number;
  /** Where the support (left) hand rests, in root space — measured against the fore-end (`supportHandHome`). */
  support: [number, number, number];
}

export type ActionKind = "none" | "slide" | "pump" | "bolt";

export type MatKey = "metal" | "steel" | "polymer" | "tan" | "wood" | "rubber" | "brass" | "lens";

export interface WeaponMaterials extends Record<MatKey, PBRMaterial> {
  dispose(): void;
}

export function createWeaponMaterials(scene: Scene): WeaponMaterials {
  const mk = (name: string, hex: string, metallic: number, roughness: number, emissive?: string): PBRMaterial => {
    const m = new PBRMaterial(name, scene);
    m.albedoColor = Color3.FromHexString(hex).toLinearSpace();
    m.metallic = metallic; m.roughness = roughness;
    if (emissive) m.emissiveColor = Color3.FromHexString(emissive).scale(0.5);
    m.maxSimultaneousLights = 4; m.useGLTFLightFalloff = true; m.freeze();
    return m;
  };
  const mats = {
    // Handoff note: there is no environment texture, so high metallic + dark albedo read as black under
    // the night lights. Metals sit at ~0.55–0.7 with lighter albedo and a faint cool fill; polymer and
    // rubber are lifted out of pure black.
    metal: mk("wpn_metal", "#677c89", 0.35, 0.4, "#17242d"),  // satin blue steel
    steel: mk("wpn_steel", "#a6acb5", 0.7, 0.3, "#0a0c10"),    // brushed steel (bolts, barrels' bright parts)
    polymer: mk("wpn_polymer", "#26272c", 0.05, 0.65, "#08090b"), // black polymer
    tan: mk("wpn_tan", "#b8aa8a", 0.05, 0.65),          // ivory furniture
    wood: mk("wpn_wood", "#6a4529", 0.0, 0.55),         // walnut grips / stocks
    rubber: mk("wpn_rubber", "#27272a", 0.0, 0.95),     // stippled grips, pads
    brass: mk("wpn_brass", "#d9a453", 0.5, 0.35, "#191107"),
    lens: mk("wpn_lens", "#0c1a2a", 0.9, 0.08, "#2a5a8a"), // scope glass with a cold glint
  };
  return { ...mats, dispose() { for (const m of Object.values(mats)) m.dispose(); } };
}

type Part = { kind: "box"; w: number; h: number; d: number; x: number; y: number; z: number; mat: MatKey; rx?: number; ry?: number; rz?: number }
  | { kind: "cyl"; dia: number; len: number; x: number; y: number; z: number; mat: MatKey; axis?: "z" | "y" | "x" };

interface Spec {
  parts: Part[];
  muzzle: [number, number, number];
  eject: [number, number, number];
  magazine: Part[] | null;
  magazinePos: [number, number, number];
  /** Parts that move with the action (slide/pump/bolt), in root space; the node sits at the origin. */
  action?: { kind: ActionKind; parts: Part[] };
  aimPoint: [number, number, number];
  length: number;
}

const B = (w: number, h: number, d: number, x: number, y: number, z: number, mat: MatKey = "metal", rot?: { rx?: number; ry?: number; rz?: number }): Part => ({ kind: "box", w, h, d, x, y, z, mat, ...rot });
const C = (dia: number, len: number, x: number, y: number, z: number, mat: MatKey = "metal", axis: "z" | "y" | "x" = "z"): Part => ({ kind: "cyl", dia, len, x, y, z, mat, axis });

// ---- detail builders (all return parts in root space)

/** Picatinny rail: a base plus evenly spaced notches. */
function rail(z0: number, z1: number, y: number, w = 0.02, x = 0): Part[] {
  const out: Part[] = [B(w, 0.008, z1 - z0, x, y, (z0 + z1) / 2)];
  const n = Math.max(2, Math.floor((z1 - z0) / 0.016));
  for (let i = 0; i < n; i++) out.push(B(w, 0.006, 0.007, x, y + 0.007, z0 + 0.008 + (i * (z1 - z0)) / n));
  return out;
}

/** Hooded front sight: post inside two protective ears. `top` = y of the post tip (the aim point). */
function frontSight(top: number, z: number, base: number): Part[] {
  const h = top - base;
  return [
    B(0.02, 0.008, 0.02, 0, base + 0.004, z),                 // base
    B(0.004, h - 0.004, 0.004, 0, base + h / 2, z, "steel"),   // post
    B(0.004, h, 0.01, -0.011, base + h / 2, z),               // ear L
    B(0.004, h, 0.01, 0.011, base + h / 2, z),                // ear R
  ];
}

/** Rear sight: aperture housing with a notch, `top` = y of the housing top. */
function rearSight(top: number, z: number, base: number): Part[] {
  const h = top - base;
  return [
    B(0.026, 0.006, 0.016, 0, base + 0.003, z),
    B(0.005, h, 0.006, -0.009, base + h / 2, z),
    B(0.005, h, 0.006, 0.009, base + h / 2, z),
    // Open U-notch: a bridge across the top hid the front post in ADS.
    B(0.022, 0.004, 0.006, 0, base + 0.005, z),
  ];
}

function triggerGuard(y: number, z: number, len = 0.05): Part[] {
  return [
    B(0.008, 0.03, 0.02, 0, y + 0.012, z, "brass"),             // trigger
    B(0.02, 0.004, len, 0, y - 0.01, z + 0.005),                // guard bottom
    B(0.02, 0.028, 0.004, 0, y + 0.004, z + len / 2 + 0.005),   // guard front
  ];
}

/** Muzzle device: a thicker cylinder with vent slots. */
function muzzleDevice(z: number, dia: number, len: number, slots = 3): Part[] {
  const out: Part[] = [C(dia, len, 0, 0.055, z, "steel")];
  for (let i = 0; i < slots; i++) out.push(B(dia * 1.1, 0.004, 0.006, 0, 0.055, z - len / 2 + 0.01 + (i * (len - 0.02)) / Math.max(1, slots - 1), "metal"));
  return out;
}

/** Stippled grip: a core box with three raised bands. */
function grip(x: number, y: number, z: number, w: number, h: number, d: number, mat: MatKey = "polymer"): Part[] {
  const out: Part[] = [B(w, h, d, x, y, z, mat)];
  for (let i = 0; i < 3; i++) out.push(B(w + 0.004, 0.008, d + 0.004, x, y + h * 0.3 - i * h * 0.3, z, "rubber"));
  return out;
}

/** Scope: tube, bells, lens glass at both ends, elevation/windage turrets, two rings. */
function scope(z: number, y: number, len: number, tube: number, objective: number, mountY: number): Part[] {
  return [
    C(tube, len, 0, y, z),
    C(objective, 0.045, 0, y, z + len / 2 + 0.01),
    C(objective * 0.8, 0.004, 0, y, z + len / 2 + 0.034, "lens"),
    C(tube * 1.15, 0.035, 0, y, z - len / 2 - 0.01),
    C(tube * 0.9, 0.004, 0, y, z - len / 2 - 0.03, "lens"),
    C(0.02, 0.018, 0, y + tube / 2 + 0.006, z + 0.01, "steel", "y"),   // elevation turret
    C(0.02, 0.018, tube / 2 + 0.006, y, z + 0.01, "steel", "x"),       // windage turret
    B(0.03, tube * 0.9, 0.012, 0, y - tube * 0.55, z - len * 0.28),    // ring rear
    B(0.03, tube * 0.9, 0.012, 0, y - tube * 0.55, z + len * 0.28),    // ring front
    B(0.014, y - tube / 2 - mountY, 0.05, 0, (mountY + y - tube / 2) / 2, z - len * 0.28),
    B(0.014, y - tube / 2 - mountY, 0.05, 0, (mountY + y - tube / 2) / 2, z + len * 0.28),
  ];
}

const ejectionPort = (x: number, y: number, z: number): Part => B(0.004, 0.018, 0.04, x, y, z, "steel");
const chargingHandle = (x: number, y: number, z: number): Part => B(0.03, 0.012, 0.012, x, y, z, "steel");
const slingLoop = (x: number, y: number, z: number): Part => B(0.006, 0.014, 0.014, x, y, z, "steel");

/** Distinct silhouettes; aim points / muzzles / lengths are the measured ones. */
const SPECS: Record<WeaponId, Spec> = {
  pistol: {
    parts: [
      B(0.028, 0.03, 0.17, 0, 0.022, 0.06, "polymer"),                // frame
      ...rail(0.09, 0.14, 0.006, 0.018),                               // accessory rail under the dust cover
      ...grip(0, -0.04, -0.02, 0.028, 0.09, 0.04),
      B(0.03, 0.012, 0.042, 0, -0.088, -0.02, "polymer"),              // magazine well lip
      C(0.012, 0.03, 0, 0.05, 0.165, "steel"),                         // barrel tip
      ...triggerGuard(-0.005, 0.02, 0.045),
      B(0.014, 0.02, 0.012, 0, 0.04, -0.03, "steel"),                  // hammer
      // Flush side medallions replace the tall ornament that obstructed the sight picture.
      C(0.014, 0.032, 0, -0.025, -0.025, "brass", "x"),
      B(0.033, 0.048, 0.022, 0, -0.044, -0.025, "tan"),
    ],
    muzzle: [0, 0.05, 0.19], eject: [0.02, 0.06, 0.03],
    magazine: [B(0.022, 0.08, 0.03, 0, 0, 0, "polymer"), B(0.024, 0.006, 0.032, 0, -0.042, 0, "rubber")], magazinePos: [0, -0.05, -0.02], length: 0.2,
    action: {
      kind: "slide", parts: [
        B(0.032, 0.045, 0.19, 0, 0.05, 0.06),                          // slide
        ejectionPort(0.017, 0.058, 0.03),
        B(0.034, 0.02, 0.03, 0, 0.05, -0.02, "steel"),                 // rear serrations block
        B(0.006, 0.012, 0.01, 0, 0.078, 0.14, "steel"),                // front sight
        B(0.004, 0.012, 0.012, -0.008, 0.078, -0.02),                 // rear notch L
        B(0.004, 0.012, 0.012, 0.008, 0.078, -0.02),                  // rear notch R
        B(0.004, 0.006, 0.004, -0.006, 0.083, -0.02, "brass"),         // rear dot L
        B(0.004, 0.006, 0.004, 0.006, 0.083, -0.02, "brass"),          // rear dot R
      ],
    },
    aimPoint: [0, 0.086, 0.14],
  },
  revolver: {
    parts: [
      B(0.03, 0.034, 0.12, 0, 0.02, 0.02, "steel"),                    // frame
      C(0.036, 0.05, 0, 0.032, 0.02, "steel"),                         // cylinder
      ...Array.from({ length: 6 }, (_, i) => C(0.008, 0.052, Math.cos((i / 6) * Math.PI * 2) * 0.012, 0.032 + Math.sin((i / 6) * Math.PI * 2) * 0.012, 0.02, "metal")), // chambers
      ...grip(0, -0.045, -0.03, 0.024, 0.09, 0.04, "wood"),
      C(0.012, 0.12, 0, 0.05, 0.11, "steel"),                          // barrel
      B(0.03, 0.018, 0.12, 0, 0.062, 0.1, "steel"),                    // barrel rib
      B(0.024, 0.01, 0.1, 0, 0.032, 0.11, "steel"),                    // under-lug
      B(0.006, 0.014, 0.008, 0, 0.078, 0.16, "brass"),                 // front sight blade
      B(0.02, 0.008, 0.01, 0, 0.074, -0.03),                           // rear notch
      ...triggerGuard(-0.005, 0.0, 0.045),
      B(0.01, 0.03, 0.012, 0, 0.05, -0.04, "steel"),                   // hammer spur
    ],
    muzzle: [0, 0.05, 0.17], eject: [0.02, 0.05, 0.02],
    magazine: null, magazinePos: [0, 0, 0], length: 0.2,
    aimPoint: [0, 0.086, 0.16],
  },
  smg: {
    parts: [
      B(0.05, 0.07, 0.34, 0, 0.04, 0.1),                               // receiver
      ...rail(-0.04, 0.26, 0.078, 0.022),                              // top rail
      B(0.04, 0.04, 0.12, 0, 0.03, 0.3, "polymer"),                    // fore-end
      B(0.044, 0.008, 0.1, 0, 0.008, 0.3, "rubber"),                   // fore-end grip pad
      C(0.018, 0.09, 0, 0.055, 0.4, "steel"),                          // barrel
      ...muzzleDevice(0.44, 0.022, 0.03, 2),
      ...grip(0, -0.04, -0.02, 0.03, 0.09, 0.045),
      B(0.03, 0.05, 0.16, 0, 0.03, -0.18, "polymer"),                  // folded stock
      B(0.034, 0.02, 0.02, 0, 0.03, -0.27, "rubber"),                  // stock pad
      ...frontSight(0.102, 0.2, 0.082),
      ...rearSight(0.098, -0.02, 0.082),
      ejectionPort(0.026, 0.05, 0.1),
      chargingHandle(-0.032, 0.06, 0.0),
      ...triggerGuard(-0.005, 0.03, 0.05),
      slingLoop(-0.026, 0.02, -0.1),
    ],
    muzzle: [0, 0.055, 0.45], eject: [0.03, 0.06, 0.1],
    magazine: [B(0.026, 0.16, 0.05, 0, 0, 0, "polymer"), B(0.028, 0.006, 0.052, 0, -0.082, 0, "rubber")], magazinePos: [0, -0.08, 0.12], length: 0.45,
    aimPoint: [0, 0.102, 0.2],
  },
  smg2: {
    parts: [
      B(0.046, 0.06, 0.26, 0, 0.035, 0.06),                            // stubby receiver
      ...rail(-0.04, 0.16, 0.068, 0.02),
      C(0.016, 0.08, 0, 0.05, 0.23, "steel"),                          // short barrel
      C(0.024, 0.03, 0, 0.05, 0.25, "steel"),                          // thread protector
      ...grip(0, -0.04, -0.02, 0.03, 0.09, 0.045),
      B(0.012, 0.03, 0.2, 0, 0.02, -0.16, "steel"),                    // wire stock bar
      B(0.03, 0.03, 0.012, 0, 0.02, -0.26, "steel"),                   // wire stock foot
      ...frontSight(0.092, 0.16, 0.07),
      ...rearSight(0.088, -0.02, 0.07),
      ejectionPort(0.024, 0.045, 0.08),
      B(0.03, 0.012, 0.012, -0.03, 0.05, 0.02, "steel"),               // side charging handle
      ...triggerGuard(-0.005, 0.03, 0.05),
    ],
    muzzle: [0, 0.05, 0.28], eject: [0.03, 0.05, 0.08],
    magazine: [B(0.024, 0.13, 0.04, 0, 0, 0, "polymer"), B(0.026, 0.006, 0.042, 0, -0.067, 0, "rubber")], magazinePos: [0, -0.07, 0.06], length: 0.3,
    aimPoint: [0, 0.092, 0.16],
  },
  rifle: {
    parts: [
      B(0.05, 0.075, 0.42, 0, 0.045, 0.16),                            // upper receiver
      ...rail(-0.04, 0.36, 0.085, 0.022),                              // top rail
      B(0.046, 0.05, 0.28, 0, 0.0, 0.1, "polymer"),                    // lower
      B(0.045, 0.05, 0.26, 0, 0.045, 0.5, "tan"),                      // handguard
      ...rail(0.4, 0.62, 0.072, 0.02),                                 // handguard rail
      ...Array.from({ length: 5 }, (_, i) => B(0.047, 0.006, 0.02, 0, 0.03, 0.4 + i * 0.05, "metal")), // vent slots
      C(0.016, 0.16, 0, 0.055, 0.7, "steel"),                          // barrel
      ...muzzleDevice(0.78, 0.024, 0.05, 3),
      ...grip(0, -0.06, 0.0, 0.034, 0.1, 0.05),
      B(0.04, 0.06, 0.24, 0, 0.03, -0.24, "tan"),                      // stock
      B(0.044, 0.07, 0.02, 0, 0.03, -0.36, "rubber"),                  // butt pad
      B(0.02, 0.02, 0.1, 0, 0.005, -0.2, "polymer"),                   // buffer tube
      ...frontSight(0.117, 0.55, 0.076),
      ...rearSight(0.115, 0.05, 0.089),
      ejectionPort(0.026, 0.06, 0.2),
      chargingHandle(-0.02, 0.075, -0.04),
      B(0.012, 0.03, 0.025, 0.03, 0.03, 0.12, "steel"),                // bolt release
      ...triggerGuard(-0.02, 0.06, 0.05),
      slingLoop(-0.024, 0.02, -0.3), slingLoop(0.024, 0.03, 0.6),
    ],
    muzzle: [0, 0.055, 0.8], eject: [0.03, 0.06, 0.2],
    magazine: [B(0.03, 0.18, 0.07, 0, 0, 0, "polymer"), B(0.032, 0.008, 0.072, 0, -0.092, 0, "rubber"), B(0.031, 0.004, 0.06, 0, -0.03, 0, "metal")], magazinePos: [0, -0.1, 0.2], length: 0.8,
    aimPoint: [0, 0.117, 0.55],
  },
  lmg: {
    parts: [
      B(0.056, 0.085, 0.46, 0, 0.045, 0.18),                           // fat receiver
      B(0.05, 0.03, 0.2, 0, 0.1, 0.16),                                // feed cover
      ...rail(0.06, 0.26, 0.118, 0.022),
      C(0.022, 0.3, 0, 0.055, 0.6, "steel"),                           // heavy barrel
      ...Array.from({ length: 4 }, (_, i) => C(0.03, 0.006, 0, 0.055, 0.5 + i * 0.04, "metal")), // barrel rings
      ...muzzleDevice(0.76, 0.03, 0.06, 3),
      B(0.05, 0.03, 0.26, 0, 0.03, 0.5, "polymer"),                    // handguard
      B(0.012, 0.16, 0.012, 0.03, -0.05, 0.62, "steel"),               // bipod leg R (folded)
      B(0.012, 0.16, 0.012, -0.03, -0.05, 0.62, "steel"),              // bipod leg L
      B(0.06, 0.03, 0.03, 0, -0.14, 0.62, "rubber"),                   // bipod feet
      ...grip(0, -0.05, 0.0, 0.036, 0.1, 0.05),
      B(0.045, 0.08, 0.34, 0, 0.03, -0.22, "polymer"),                 // stock
      B(0.048, 0.09, 0.02, 0, 0.03, -0.39, "rubber"),                  // butt pad
      B(0.06, 0.02, 0.05, 0, 0.09, 0.06, "steel"),                     // carry handle base
      B(0.012, 0.03, 0.12, 0, 0.115, 0.06, "polymer"),                 // carry handle
      ...frontSight(0.142, 0.46, 0.066),
      ...rearSight(0.14, 0.06, 0.115),
      ejectionPort(0.029, 0.05, 0.2),
      chargingHandle(0.038, 0.06, 0.0),
      ...triggerGuard(-0.02, 0.06, 0.05),
    ],
    muzzle: [0, 0.055, 0.79], eject: [0.035, 0.06, 0.2],
    magazine: [B(0.09, 0.11, 0.13, 0, 0, 0, "polymer"), B(0.08, 0.02, 0.1, 0, 0.055, 0.0, "brass"), B(0.092, 0.006, 0.132, 0, -0.045, 0, "rubber")], magazinePos: [-0.02, -0.06, 0.18], length: 0.8,
    aimPoint: [0, 0.142, 0.46],
  },
  shotgun: {
    parts: [
      B(0.05, 0.07, 0.3, 0, 0.04, 0.1, "steel"),                       // receiver
      C(0.034, 0.5, 0, 0.06, 0.45, "steel"),                           // barrel
      C(0.036, 0.42, 0, 0.02, 0.4, "steel"),                           // tube magazine
      C(0.04, 0.02, 0, 0.02, 0.6, "metal"),                            // tube cap
      B(0.014, 0.01, 0.4, 0, 0.078, 0.4, "steel"),                     // vent rib
      ...grip(0, -0.05, -0.02, 0.036, 0.1, 0.05, "wood"),
      B(0.04, 0.07, 0.33, 0, 0.025, -0.215, "wood"),                   // stock
      B(0.044, 0.08, 0.02, 0, 0.025, -0.38, "rubber"),                 // butt pad
      B(0.01, 0.015, 0.01, 0, 0.085, 0.68, "brass"),                   // bead
      ejectionPort(0.026, 0.045, 0.08),
      B(0.012, 0.03, 0.03, 0, 0.005, -0.02, "steel"),                  // loading gate
      ...triggerGuard(-0.01, 0.02, 0.05),
      slingLoop(-0.024, 0.0, -0.3),
    ],
    muzzle: [0, 0.06, 0.7], eject: [0.03, 0.055, 0.08],
    magazine: null, magazinePos: [0, 0, 0], length: 0.72,
    action: {
      kind: "pump", parts: [
        B(0.05, 0.05, 0.16, 0, 0.005, 0.42, "wood"),
        ...Array.from({ length: 6 }, (_, i) => B(0.052, 0.004, 0.006, 0, 0.005, 0.36 + i * 0.024, "rubber")), // pump grooves
      ],
    },
    aimPoint: [0, 0.094, 0.68],
  },
  dmr: {
    parts: [
      B(0.048, 0.07, 0.4, 0, 0.04, 0.15),                              // receiver
      ...rail(-0.06, 0.32, 0.078, 0.022),
      B(0.046, 0.06, 0.34, 0, 0.0, 0.42, "tan"),                       // long forend
      ...Array.from({ length: 6 }, (_, i) => B(0.048, 0.005, 0.014, 0, 0.02, 0.3 + i * 0.045, "metal")), // forend slots
      C(0.018, 0.34, 0, 0.055, 0.75, "steel"),                         // barrel
      ...muzzleDevice(0.94, 0.03, 0.06, 3),
      ...grip(0, -0.06, -0.01, 0.034, 0.1, 0.05),
      B(0.044, 0.08, 0.3, 0, 0.02, -0.27, "tan"),                      // stock
      B(0.04, 0.03, 0.12, 0, 0.075, -0.3, "polymer"),                  // cheek riser
      B(0.048, 0.09, 0.02, 0, 0.02, -0.42, "rubber"),                  // butt pad
      B(0.03, 0.03, 0.06, 0, -0.03, -0.38, "polymer"),                 // stock foot
      ...scope(0.12, 0.11, 0.2, 0.036, 0.046, 0.078),
      ejectionPort(0.025, 0.06, 0.2),
      ...triggerGuard(-0.02, 0.05, 0.05),
      slingLoop(-0.024, 0.0, -0.36), slingLoop(0.024, -0.02, 0.5),
    ],
    muzzle: [0, 0.055, 0.97], eject: [0.03, 0.06, 0.2],
    magazine: [B(0.03, 0.12, 0.07, 0, 0, 0, "polymer"), B(0.032, 0.006, 0.072, 0, -0.062, 0, "rubber")], magazinePos: [0, -0.08, 0.2], length: 0.97,
    action: { kind: "bolt", parts: [C(0.014, 0.05, 0.04, 0.06, 0.1, "steel"), B(0.018, 0.018, 0.018, 0.065, 0.045, 0.1, "steel")] },
    aimPoint: [0, 0.11, 0.12],
  },
  sniper: {
    parts: [
      B(0.046, 0.065, 0.42, 0, 0.04, 0.16),                            // receiver
      ...rail(-0.08, 0.34, 0.075, 0.022),
      B(0.044, 0.06, 0.42, 0, -0.005, 0.44, "tan"),                    // long stock forend
      ...Array.from({ length: 5 }, (_, i) => B(0.046, 0.004, 0.024, 0, 0.02, 0.32 + i * 0.06, "metal")),
      C(0.017, 0.5, 0, 0.055, 0.85, "steel"),                          // long barrel
      ...Array.from({ length: 8 }, (_, i) => C(0.022, 0.012, 0, 0.055, 0.66 + i * 0.05, "metal")), // fluting rings
      ...muzzleDevice(1.12, 0.034, 0.08, 4),
      ...grip(0, -0.06, -0.01, 0.034, 0.1, 0.05),
      B(0.044, 0.09, 0.32, 0, 0.015, -0.28, "tan"),                    // stock
      B(0.044, 0.05, 0.1, 0, 0.075, -0.32, "polymer"),                 // cheek riser
      B(0.048, 0.1, 0.02, 0, 0.015, -0.45, "rubber"),                  // butt pad
      B(0.03, 0.04, 0.05, 0, -0.045, -0.4, "polymer"),                 // monopod
      ...scope(0.12, 0.115, 0.26, 0.04, 0.056, 0.078),
      ejectionPort(0.024, 0.06, 0.2),
      ...triggerGuard(-0.02, 0.05, 0.05),
      slingLoop(-0.024, 0.0, -0.38), slingLoop(0.024, -0.03, 0.55),
    ],
    muzzle: [0, 0.055, 1.16], eject: [0.03, 0.06, 0.2],
    magazine: [B(0.028, 0.1, 0.08, 0, 0, 0, "polymer"), B(0.03, 0.006, 0.082, 0, -0.052, 0, "rubber")], magazinePos: [0, -0.07, 0.2], length: 1.16,
    action: { kind: "bolt", parts: [C(0.014, 0.05, 0.04, 0.06, 0.1, "steel"), B(0.02, 0.02, 0.02, 0.07, 0.045, 0.1, "steel")] },
    aimPoint: [0, 0.115, 0.12],
  },
  launcher: {
    parts: [
      C(0.07, 0.36, 0, 0.05, 0.28, "metal"),                           // fat tube
      C(0.08, 0.04, 0, 0.05, 0.47, "steel"),                           // muzzle ring
      ...Array.from({ length: 3 }, (_, i) => C(0.074, 0.008, 0, 0.05, 0.16 + i * 0.1, "steel")), // tube bands
      B(0.05, 0.07, 0.16, 0, 0.03, 0.02, "polymer"),                   // receiver block
      ...grip(0, -0.06, -0.01, 0.034, 0.1, 0.05),
      B(0.04, 0.06, 0.22, 0, 0.025, -0.2, "tan"),                      // stock
      B(0.044, 0.07, 0.02, 0, 0.025, -0.31, "rubber"),                 // butt pad
      B(0.03, 0.03, 0.08, 0, -0.02, 0.24, "rubber"),                   // fore grip
      B(0.03, 0.05, 0.03, 0, 0.11, 0.05, "steel"),                     // ladder sight
      B(0.03, 0.004, 0.03, 0, 0.135, 0.05, "steel"),                   // ladder top
      ...Array.from({ length: 3 }, (_, i) => B(0.032, 0.003, 0.004, 0, 0.095 + i * 0.012, 0.05, "brass")), // ladder rungs
      ...triggerGuard(-0.02, 0.04, 0.05),
    ],
    muzzle: [0, 0.05, 0.5], eject: [0.03, 0.05, 0.06],
    magazine: null, magazinePos: [0, 0, 0], length: 0.5,
    // The break-open latch travels on reload.
    action: { kind: "pump", parts: [B(0.02, 0.03, 0.06, 0.036, 0.05, 0.1, "brass")] },
    aimPoint: [0, 0.135, 0.05],
  },
  clippers: {
    parts: [
      B(0.04, 0.07, 0.13, 0, -0.01, 0.02, "polymer"),                  // body
      ...Array.from({ length: 4 }, (_, i) => B(0.042, 0.004, 0.006, 0, -0.028 + i * 0.01, -0.02, "rubber")), // grip ribs
      B(0.034, 0.02, 0.05, 0, 0.012, 0.11, "steel"),                   // blade head
      B(0.04, 0.006, 0.02, 0, 0.026, 0.13, "steel"),                   // comb
      ...Array.from({ length: 6 }, (_, i) => B(0.004, 0.008, 0.014, -0.015 + i * 0.006, 0.03, 0.135, "steel")), // teeth
      B(0.012, 0.016, 0.03, 0.018, 0.026, 0.03, "brass"),              // switch
      C(0.008, 0.08, 0, -0.01, -0.09, "rubber"),                       // cord stub
      B(0.02, 0.004, 0.04, 0, 0.026, 0.04, "steel"),                   // lever plate
    ],
    muzzle: [0, 0.026, 0.14], eject: [0, 0, 0],
    magazine: null, magazinePos: [0, 0, 0], length: 0.16,
    aimPoint: [0, 0.03, 0.13],
  },
};

function buildParts(name: string, parts: Part[], mats: WeaponMaterials, scene: Scene, parent: TransformNode): Mesh[] {
  const byMat = new Map<MatKey, Mesh[]>();
  for (const p of parts) {
    let m: Mesh;
    if (p.kind === "box") {
      m = beveledBox(name, p.w, p.h, p.d, scene);
      if (p.rx || p.ry || p.rz) m.rotation.set(p.rx ?? 0, p.ry ?? 0, p.rz ?? 0);
    } else {
      m = MeshBuilder.CreateCylinder(name, { diameter: p.dia, height: p.len, tessellation: 12 }, scene);
      if (p.axis === "x") m.rotation.z = Math.PI / 2; else if (p.axis !== "y") m.rotation.x = Math.PI / 2;
    }
    m.position.set(p.x, p.y, p.z);
    const list = byMat.get(p.mat) ?? [];
    list.push(m);
    byMat.set(p.mat, list);
  }
  const out: Mesh[] = [];
  for (const [mat, list] of byMat) {
    const merged = list.length === 1 ? list[0] : Mesh.MergeMeshes(list, true, true, undefined, false, false)!;
    merged.name = `${name}_${mat}`;
    merged.material = mats[mat];
    merged.isPickable = false;
    merged.parent = parent;
    out.push(merged);
  }
  return out;
}

export function buildWeaponModel(id: WeaponId, mats: WeaponMaterials, scene: Scene, name = `wpn_${id}`): WeaponModel {
  const spec = SPECS[id];
  const root = new TransformNode(name, scene);
  buildParts(name, spec.parts, mats, scene, root);
  const muzzle = new TransformNode(`${name}_muzzle`, scene);
  muzzle.position.set(...spec.muzzle);
  muzzle.parent = root;
  const eject = new TransformNode(`${name}_eject`, scene);
  eject.position.set(...spec.eject);
  eject.parent = root;
  const aim = new TransformNode(`${name}_aim`, scene);
  aim.position.set(...spec.aimPoint);
  aim.parent = root;
  let magazine: TransformNode | null = null;
  if (spec.magazine) {
    magazine = new TransformNode(`${name}_mag`, scene);
    magazine.position.set(...spec.magazinePos);
    magazine.parent = root;
    buildParts(`${name}_mag`, spec.magazine, mats, scene, magazine);
  }
  let action: TransformNode | null = null;
  if (spec.action) {
    action = new TransformNode(`${name}_action`, scene);
    action.parent = root;
    buildParts(`${name}_action`, spec.action.parts, mats, scene, action);
  }
  return { root, muzzle, eject, aim, magazine, action, actionKind: spec.action?.kind ?? "none", aimPoint: spec.aimPoint, length: spec.length, support: proceduralParts(id).support };
}

/** Sets rendering group + shadow flags on every mesh of a model. */
/**
 * The tuned numbers the glTF loader needs so an imported gun drops into the SAME poses and reload
 * choreography as the procedural one (drop 6b): how long the weapon is, how its action moves, and
 * whether it has a magazine to drop. The model supplies geometry; these stay the game's.
 */
export function weaponMetrics(id: WeaponId): { length: number; actionKind: ActionKind; hasMagazine: boolean } {
  const spec = SPECS[id];
  return { length: spec.length, actionKind: spec.action?.kind ?? "none", hasMagazine: spec.magazine !== null };
}

/** One procedural part's axis-aligned bounds, named `${list}${index}:${material}`. */
export interface NamedBox { name: string; box: PartBox }

/**
 * The procedural model as pure geometry: the AABB of every part in root space, plus the anchors —
 * what a headless "nothing floats" check needs without a Scene. Mirrors `buildWeaponModel` exactly:
 * the action node sits at the origin, so its parts are already in root space; magazine parts are
 * shifted by `magazinePos`.
 */
export interface ProceduralParts {
  /** `spec.parts` followed by the action parts (`part${i}:${mat}` / `action${i}:${mat}`). */
  parts: NamedBox[];
  /** Magazine parts translated by `magazinePos` (`mag${i}:${mat}`); empty when there is no magazine. */
  magazine: NamedBox[];
  muzzle: [number, number, number];
  eject: [number, number, number];
  aimPoint: [number, number, number];
  length: number;
  /** Support-hand rest, measured against the parts (`supportHandHome`). */
  support: [number, number, number];
  actionKind: ActionKind;
  hasMagazine: boolean;
}

/**
 * AABB of one part, offset by `at`. A box rotates the way `mesh.rotation.set(rx, ry, rz)` does —
 * Babylon's `RotationYawPitchRoll(ry, rx, rz)`: about Z by rz, then X by rx, then Y by ry — and the
 * bounds are those of its eight rotated corners. A cylinder is the box that spans `len` along its
 * axis and `dia` on the other two (no tessellation correction).
 */
export function partAabb(p: Part, at: [number, number, number] = [0, 0, 0]): PartBox {
  const cx = p.x + at[0], cy = p.y + at[1], cz = p.z + at[2];
  if (p.kind === "cyl") {
    const r = p.dia / 2, h = p.len / 2;
    const [ex, ey, ez] = p.axis === "x" ? [h, r, r] : p.axis === "y" ? [r, h, r] : [r, r, h];
    return { min: [cx - ex, cy - ey, cz - ez], max: [cx + ex, cy + ey, cz + ez] };
  }
  const hw = p.w / 2, hh = p.h / 2, hd = p.d / 2;
  const rx = p.rx ?? 0, ry = p.ry ?? 0, rz = p.rz ?? 0;
  const cX = Math.cos(rx), sX = Math.sin(rx), cY = Math.cos(ry), sY = Math.sin(ry), cZ = Math.cos(rz), sZ = Math.sin(rz);
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < 8; i++) {
    const x0 = i & 1 ? hw : -hw, y0 = i & 2 ? hh : -hh, z0 = i & 4 ? hd : -hd;
    // roll (Z), then pitch (X), then yaw (Y)
    const x1 = x0 * cZ - y0 * sZ, y1 = x0 * sZ + y0 * cZ;
    const y2 = y1 * cX - z0 * sX, z2 = y1 * sX + z0 * cX;
    const x3 = z2 * sY + x1 * cY, z3 = z2 * cY - x1 * sY;
    const c = [cx + x3, cy + y2, cz + z3];
    for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], c[k]); max[k] = Math.max(max[k], c[k]); }
  }
  return { min, max };
}

export function proceduralParts(id: WeaponId): ProceduralParts {
  const spec = SPECS[id];
  const named = (list: Part[], prefix: string, at?: [number, number, number]): NamedBox[] =>
    list.map((p, i) => ({ name: `${prefix}${i}:${p.mat}`, box: partAabb(p, at) }));
  const parts = [...named(spec.parts, "part"), ...(spec.action ? named(spec.action.parts, "action") : [])];
  const magazine = spec.magazine ? named(spec.magazine, "mag", spec.magazinePos) : [];
  return {
    parts, magazine,
    muzzle: spec.muzzle, eject: spec.eject, aimPoint: spec.aimPoint, length: spec.length,
    support: supportHandHome(spec.length, [...parts, ...magazine].map((p) => p.box)),
    actionKind: spec.action?.kind ?? "none", hasMagazine: spec.magazine !== null,
  };
}

export function forEachMesh(model: WeaponModel, fn: (m: Mesh) => void): void {
  for (const m of model.root.getChildMeshes(false)) fn(m as Mesh);
}

export const WEAPON_UP = new Vector3(0, 1, 0);
