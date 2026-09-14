import { describe, expect, it } from "vitest";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { NIGHT_ENV_SIZE, nightEnvData, nightRadiance } from "./nightEnv";

describe("night environment", () => {
  it("is six sRGB faces of the right size, darker at the zenith than at the horizon, dark under foot", () => {
    const { faces } = nightEnvData();
    expect(faces.length).toBe(6);
    for (const f of faces) expect(f.length).toBe(NIGHT_ENV_SIZE * NIGHT_ENV_SIZE * 4);
    const c = new Color3();
    const lum = (x: number, y: number, z: number) => { nightRadiance(x, y, z, c); return c.r * 0.3 + c.g * 0.59 + c.b * 0.11; };
    expect(lum(0, 1, 0)).toBeLessThan(lum(0.99, 0.02, 0));   // zenith darker than the horizon
    expect(lum(0, -1, 0)).toBeLessThan(lum(0.99, 0.02, 0));  // asphalt darker than the horizon glow
    expect(lum(0, 1, 0)).toBeLessThan(0.05);                 // and a night, not an overcast afternoon
  });

  it("has lamp glints bright enough to put a highlight on a slide, and only near the horizon", () => {
    const { faces } = nightEnvData();
    let brightest = 0;
    for (const f of faces) for (let i = 0; i < f.length; i += 4) brightest = Math.max(brightest, f[i]);
    expect(brightest).toBeGreaterThan(200);
    const c = new Color3();
    nightRadiance(0, 1, 0, c);
    expect(Math.max(c.r, c.g, c.b)).toBeLessThan(0.1); // no glint at the zenith
  });

  it("carries a diffuse polynomial the materials can use without reading the GPU back", () => {
    const { polynomial: p } = nightEnvData();
    // Lambertian irradiance for a normal n is the polynomial evaluated at n.
    const at = (nx: number, ny: number, nz: number) =>
      p.x.x * nx + p.y.x * ny + p.z.x * nz + p.xx.x * nx * nx + p.yy.x * ny * ny + p.zz.x * nz * nz + p.xy.x * nx * ny + p.yz.x * ny * nz + p.zx.x * nz * nx;
    const up = at(0, 1, 0), down = at(0, -1, 0), side = at(1, 0, 0);
    expect(up).toBeGreaterThan(0);
    expect(down).toBeGreaterThan(0);
    expect(up).toBeLessThan(0.3);                 // dim: it is night
    expect(side).toBeGreaterThan(down);           // the lit horizon feeds a vertical face more than the asphalt feeds a sole
  });
});
