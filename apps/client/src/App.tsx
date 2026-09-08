import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { BotLevel, GameMode } from "@frankibarber/shared";
import { Connection, defaultServerUrl } from "./game/net/Connection";
import { Game } from "./game/Game";
import { loadSettings, saveSettings, type Settings } from "./settings";
import { Menu } from "./ui/Menu";
import { Hud } from "./ui/Hud";
import type { ShopApi } from "./ui/Shop";
import type { ChatApi } from "./ui/Chat";
import { Loading } from "./ui/Loading";
import { useHudSlice } from "./game/store";
import { enterFullscreen, exitImmersion, isFullscreen, lockKeyboard } from "./game/input/immersion";
import { hud } from "./game/store";

type Screen = { kind: "menu"; error?: string } | { kind: "connecting" } | { kind: "game" };

export function App() {
  const [screen, setScreen] = useState<Screen>({ kind: "menu" });
  const [settings, setSettings] = useState<Settings>(() => loadSettings());
  const canvasHost = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Game | null>(null);

  /**
   * A canvas can hold only one kind of context for its whole life: once WebGPU has claimed it,
   * `getContext("webgl2")` returns null forever. Each game start therefore gets a brand-new
   * canvas, which is what makes the WebGPU → WebGL2 retry below possible at all.
   */
  const freshCanvas = (): HTMLCanvasElement => {
    const host = canvasHost.current;
    if (!host) throw new Error("Canvas host not mounted");
    host.replaceChildren();
    const canvas = document.createElement("canvas");
    canvas.className = "game-canvas";
    canvas.tabIndex = 0;
    host.appendChild(canvas);
    return canvas;
  };
  const loadStage = useHudSlice((s) => s.loadStage);

  const updateSettings = useCallback((s: Settings) => {
    setSettings(s);
    saveSettings(s);
    gameRef.current?.applySettings(s);
  }, []);

  const leave = useCallback(async (reason?: string) => {
    const g = gameRef.current;
    gameRef.current = null;
    if (g) await g.dispose();
    // Leaving the match gives the keyboard and the screen back to the browser. Without this the
    // player lands in the menu still fullscreen with Escape captured, which reads as a hang.
    exitImmersion();
    canvasHost.current?.replaceChildren();
    setScreen({ kind: "menu", error: reason && reason !== "left" ? reason : undefined });
  }, []);

  const play = useCallback(async (name: string, roomName: string, mode: "auto" | "create" | "join", roomId: string | undefined, gameMode: GameMode, bots: { count: number; level: BotLevel }) => {
    // Fullscreen is only granted inside the user gesture that started this call, and `connect`
    // below is an await — by the time it resolves the gesture is spent. So the request is made
    // FIRST and its promise carried across; `enterFullscreen` never throws, it returns false.
    const host = canvasHost.current;
    const goneFullscreen = host ? enterFullscreen(host) : Promise.resolve(false);
    const startWith = async (s: Settings): Promise<void> => {
      setScreen({ kind: "connecting" });
      const connection = await Connection.connect({ url: defaultServerUrl(), name, roomName, mode, roomId, gameMode, bots: bots.count, botLevel: bots.level });
      const canvas = freshCanvas();
      setScreen({ kind: "game" });
      const game = new Game({ canvas, connection, settings: s, onLeave: (reason) => void leave(reason) });
      gameRef.current = game;
      await game.start();
      (window as unknown as { __fb: unknown }).__fb = { game, hud };
      // Keyboard Lock needs fullscreen and exists only in Chromium; it is what puts Escape and
      // Ctrl+W in the game's hands rather than the browser's. Failure is normal and silent.
      if (await goneFullscreen) void lockKeyboard();
      // The pointer is asked for last. If the browser refuses (it often does once the gesture has
      // been spent on a slow connect) the pause card is already the retry surface.
      await game.requestPointerLockAsync();
    };
    try {
      await startWith(settings);
    } catch (err) {
      // WebGPU can come up (adapter + device) and still fail inside scene setup on a given
      // browser/driver. That is not a reason to bounce the player back to the menu: retry once
      // on WebGL2 and remember the choice (visible as "Force WebGL2" in settings).
      const failed = gameRef.current;
      if (failed?.rendererKind === "webgpu" && settings.graphics.renderer !== "webgl2") {
        console.warn("[app] WebGPU renderer failed during setup, retrying with WebGL2", err);
        gameRef.current = null;
        await failed.dispose();
        const forced: Settings = { ...settings, graphics: { ...settings.graphics, renderer: "webgl2" } };
        updateSettings(forced);
        try {
          await startWith(forced);
          return;
        } catch (err2) {
          err = err2;
        }
      }
      console.error(err);
      await leave(humanError(err));
    }
  }, [settings, leave, updateSettings]);

  useEffect(() => () => { void gameRef.current?.dispose(); }, []);

  // Stable objects so the shop's / chat's handlers are not re-bound every render.
  const shopApi = useMemo<ShopApi>(() => ({
    buy: (item) => gameRef.current?.buy(item),
    sell: (item) => gameRef.current?.sell(item),
    close: () => gameRef.current?.setShopOpen(false),
  }), []);
  const chatApi = useMemo<ChatApi>(() => ({
    send: (text) => gameRef.current?.sendChat(text),
    close: () => gameRef.current?.closeChat(),
  }), []);
  const radar = useCallback(() => gameRef.current?.radar() ?? null, []);

  return (
    <div className="app">
      {/* The game canvas is created imperatively per start (see freshCanvas); menus overlay this host. */}
      <div ref={canvasHost} className="game-canvas-host" />
      {screen.kind === "game" && (
        <Hud
          settings={settings} onSettings={updateSettings} onLeave={() => void leave("left")}
          onResume={async () => (await gameRef.current?.requestPointerLockAsync()) ?? false}
          onPause={() => gameRef.current?.releasePointerLock()}
          onFullscreen={async () => {
            const el = canvasHost.current;
            if (isFullscreen()) { exitImmersion(); return false; }
            const ok = el ? await enterFullscreen(el) : false;
            if (ok) void lockKeyboard();
            return ok;
          }}
          shop={shopApi} chat={chatApi} radar={radar}
        />
      )}
      {(screen.kind === "connecting" || (screen.kind === "game" && loadStage !== "ready")) && <Loading />}
      {screen.kind !== "game" && (
        <Menu
          settings={settings}
          onSettings={updateSettings}
          connecting={screen.kind === "connecting"}
          error={screen.kind === "menu" ? screen.error : undefined}
          onPlay={play}
        />
      )}
    </div>
  );
}

function humanError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (/ECONNREFUSED|Failed to fetch|NetworkError|network|refused|ENOTFOUND|timeout/i.test(msg)) return "Cannot reach the game server. Is it running?";
  if (/full/i.test(msg)) return "That room is full.";
  if (/not found|no rooms|doesn't exist|does not exist/i.test(msg)) return "Room not found.";
  if (/WebGL2|WebGPU/i.test(msg)) return msg;
  return msg || "Something went wrong.";
}
