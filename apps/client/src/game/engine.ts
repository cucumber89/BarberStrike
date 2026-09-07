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
 * Creates the rendering engine: WebGPU when available and stable, otherwise WebGL2.
 * `preferWebGPU=false` forces WebGL2 (settings / troubleshooting).
 */
export async function createEngine(canvas: HTMLCanvasElement, preferWebGPU = true): Promise<CreatedEngine> {
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
    throw new Error("WebGL2 is required but not available in this browser.");
  }
  return { engine, kind: "webgl2" };
}
