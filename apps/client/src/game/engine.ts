import { Engine } from "@babylonjs/core/Engines/engine";
import { WebGPUEngine } from "@babylonjs/core/Engines/webgpuEngine";
// The WebGL `Engine` pulls in all of its feature extensions itself; `WebGPUEngine` imports only a subset
// (alpha, rawTexture, readTexture, cubeTexture, renderTarget*, query). Anything else is a side-effect
// import, and without these two the WebGPU path died on the first procedural texture with
// "engine.createDynamicTexture is not a function" (seen on a real GPU; the sandbox only ever ran WebGL2).
import "@babylonjs/core/Engines/WebGPU/Extensions/engine.dynamicTexture";
import "@babylonjs/core/Engines/WebGPU/Extensions/engine.multiRender";
import type { AbstractEngine } from "@babylonjs/core/Engines/abstractEngine";

export type RendererKind = "webgpu" | "webgl2";

export interface CreatedEngine {
  engine: AbstractEngine;
  kind: RendererKind;
}

/**
 * Creates the rendering engine.
 *
 * WebGL2 is the DEFAULT and needs no switch flipped: it is what every supported browser has, and
 * WebGPU can initialise successfully and still fail later inside scene setup on some browser and
 * driver pairs (App.tsx carries a retry for exactly that). `preferWebGPU` is the opt-in.
 *
 * When WebGL2 itself is missing the thrown message is written for a player, not a developer: it
 * reaches the menu through `humanError`, so it has to say what to do about it.
 */
export async function createEngine(canvas: HTMLCanvasElement, preferWebGPU = false): Promise<CreatedEngine> {
  let candidate: WebGPUEngine | undefined;
  if (preferWebGPU && typeof navigator !== "undefined" && "gpu" in navigator) {
    try {
      const supported = await WebGPUEngine.IsSupportedAsync;
      if (supported) {
        const engine = candidate = new WebGPUEngine(canvas, { antialias: false, adaptToDeviceRatio: false, stencil: true });
        await engine.initAsync();
        return { engine, kind: "webgpu" };
      }
    } catch (err) {
      try { candidate?.dispose(); } catch { /* partially initialized GPU device */ }
      console.warn("[engine] WebGPU init failed, falling back to WebGL2", err);
    }
  }
  // FXAA is controlled live by postfx.ts; native MSAA would remain on even with AA disabled.
  const engine = new Engine(canvas, false, { stencil: true, preserveDrawingBuffer: false, powerPreference: "high-performance" }, false);
  if (engine.webGLVersion < 2) {
    engine.dispose();
    throw new Error(
      "This game needs WebGL2, and this browser did not provide it. " +
      "A recent Chrome, Edge or Firefox will have it — and if you are already on one, check that " +
      "hardware acceleration is switched on in the browser's settings.",
    );
  }
  return { engine, kind: "webgl2" };
}
