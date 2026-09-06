import type { Scene } from "@babylonjs/core/scene";
import type { AbstractEngine } from "@babylonjs/core/Engines/abstractEngine";
import type { TargetCamera } from "@babylonjs/core/Cameras/targetCamera";
import type { CollisionWorld, MapDef } from "@frankibarber/shared";
import type { GameEvents } from "./events";
import type { LocalPlayer } from "./player/LocalPlayer";
import type { RemotePlayer } from "./player/RemotePlayer";
import type { WeaponController } from "./combat/WeaponController";
import type { Throwing } from "./combat/Throwing";
import type { Connection } from "./net/Connection";
import type { MapInstance } from "./world/MapBuilder";
import type { Settings } from "../settings";
import type { RendererKind } from "./engine";
import type { WeaponModelLibrary } from "./view/weaponModels";

/**
 * Everything a presentation module needs, handed to its `install*` function once the core
 * is ready. Modules must not hold per-frame state in React; they hook `onFrame` instead.
 */
export interface GameContext {
  scene: Scene;
  engine: AbstractEngine;
  rendererKind: RendererKind;
  camera: TargetCamera;
  events: GameEvents;
  local: LocalPlayer;
  remotes: ReadonlyMap<string, RemotePlayer>;
  weapons: WeaponController;
  /** Local grenade state (what is in the hand, cook progress). */
  throwing: Throwing;
  connection: Connection;
  world: CollisionWorld;
  mapDef: MapDef;
  mapInstance: MapInstance;
  settings: Settings;
  /** Drop 6b: imported glTF guns, when the manifest lists any and they loaded. Undefined = procedural. */
  weaponModels?: WeaponModelLibrary;
  /** Register a per-frame callback (dtMs). Returns an unsubscribe. Called before scene.render(). */
  onFrame(cb: (dtMs: number) => void): () => void;
  /** Register a callback for the end of a frame (after render). */
  onAfterRender(cb: (dtMs: number) => void): () => void;
  /** Current estimated server time. */
  serverNow(): number;
}

/** A presentation module: installs itself and returns a disposer. */
export type GameModule = (ctx: GameContext) => (() => void) | void;
