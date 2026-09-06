import { describe, expect, it } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { beveledBox } from "./geometry";

describe("procedural bevel geometry", () => {
  it("keeps the requested bounds and outward-facing lit surfaces", () => {
    const engine = new NullEngine(), scene = new Scene(engine);
    const mesh = beveledBox("test", 0.4, 0.6, 0.8, scene);
    const p = mesh.getVerticesData(VertexBuffer.PositionKind)!;
    const n = mesh.getVerticesData(VertexBuffer.NormalKind)!;
    for (let i = 0; i < p.length; i += 3) {
      expect(p[i] * n[i] + p[i + 1] * n[i + 1] + p[i + 2] * n[i + 2]).toBeGreaterThan(0);
    }
    const b = mesh.getBoundingInfo().boundingBox;
    expect(b.maximum.x - b.minimum.x).toBeCloseTo(0.4);
    expect(b.maximum.y - b.minimum.y).toBeCloseTo(0.6);
    expect(b.maximum.z - b.minimum.z).toBeCloseTo(0.8);
    scene.dispose(); engine.dispose();
  });
});
