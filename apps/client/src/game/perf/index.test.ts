import { afterEach, expect, it, vi } from "vitest";
import { defaultSettings } from "../../settings";
import { GameEvents } from "../events";
import type { GameContext } from "../context";
vi.mock("../store", () => ({ hud: { set: vi.fn() } }));
import { installPerf } from "./index";
afterEach(() => vi.unstubAllGlobals());

it("keeps adapted resolution when audio changes; restores the target when disabled", () => {
  vi.stubGlobal("document", {hidden:false});
  const settings = defaultSettings(); const events = new GameEvents();
  const setHardwareScalingLevel = vi.fn(); let frame: (dt:number)=>void = () => {};
  const ctx = {
    settings, events,
    engine: {setHardwareScalingLevel},
    scene: {isReady:()=>true,particleSystems:[],meshes:[],getActiveMeshes:()=>[]},
    local: {}, connection: {rtt:0},
    onAfterRender(cb:(dt:number)=>void) {frame=cb;return ()=>{};},
  } as unknown as GameContext;
  const dispose = installPerf(ctx)!;
  for(let i=0;i<200;i++)frame(40);
  expect(setHardwareScalingLevel).toHaveBeenCalled();
  const count=setHardwareScalingLevel.mock.calls.length;
  settings.audio.master=.2;events.emit("settings",{});
  expect(setHardwareScalingLevel).toHaveBeenCalledTimes(count);
  settings.graphics.dynamicResolution=false;events.emit("settings",{});
  expect(setHardwareScalingLevel).toHaveBeenLastCalledWith(1);
  dispose();
});
