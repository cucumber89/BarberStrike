import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { C2S, WEAPONS, WEAPON_ORDER, type BotLevel, type GameMode } from "@frankibarber/shared";
import { WEAPON_FEEL } from "./game/combat/weaponFeel";
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

type Screen = { kind: "menu"; error?: string } | { kind: "connecting" } | { kind: "ready" } | { kind: "entering" } | { kind: "game" };

export function App() {
  const [screen, setScreen] = useState<Screen>({ kind: "menu" });
  const [settings, setSettings] = useState<Settings>(() => loadSettings());
  const canvasHost = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Game | null>(null);
  const attempt = useRef(0);
  const starting = useRef(false);
  const connectionRef = useRef<Connection | null>(null);

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
    attempt.current++;
    starting.current = false;
    const g = gameRef.current, c = connectionRef.current;
    gameRef.current = null; connectionRef.current = null;
    // Leaving the match gives the keyboard and the screen back to the browser. Without this the
    // player lands in the menu still fullscreen with Escape captured, which reads as a hang.
    exitImmersion();
    canvasHost.current?.replaceChildren();
    hud.reset();
    setScreen({ kind: "menu", error: reason && reason !== "left" ? reason : undefined });
    try { if (g) await g.dispose(); else await c?.leave(); } catch (error) { console.warn("[app] cleanup", error); }
  }, []);

  const play = useCallback(async (name: string, roomName: string, mode: "auto" | "create" | "join", roomId: string | undefined, gameMode: GameMode, bots: { count: number; level: BotLevel }) => {
    if (starting.current || gameRef.current) return;
    starting.current = true;
    const token = ++attempt.current;
    hud.reset();
    setScreen({ kind: "connecting" });
    const timeout = window.setTimeout(() => { if (attempt.current === token) void leave("Loading took too long. Please try again or lower graphics settings."); }, 90000);
    const startWith = async (s: Settings): Promise<void> => {
      const connection = await Connection.connect({ url: defaultServerUrl(), name, roomName, mode, roomId, gameMode, bots: bots.count, botLevel: bots.level });
      if (attempt.current !== token) { await connection.leave(); return; }
      connectionRef.current = connection;
      const game = new Game({ canvas: freshCanvas(), connection, settings: s, onLeave: reason => { if (attempt.current === token) void leave(reason); } });
      gameRef.current = game;
      await game.start();
      if (attempt.current !== token) { await game.dispose(); return; }
      // Harness hook for the e2e tools. `WEAPONS` and `WEAPON_FEEL` ride along so a tool reads the
      // numbers the running bundle was built from rather than a copy it keeps in its own source —
      // a copy is how a tool ends up reporting a matrix the game stopped implementing.
      (window as unknown as { __fb: unknown }).__fb = { game, hud, shared: { WEAPONS, WEAPON_ORDER }, feel: WEAPON_FEEL };
      setScreen({ kind: "ready" });
    };
    try {
      try { await startWith(settings); }
      catch (err) {
        if (attempt.current !== token) return;
        const failed = gameRef.current as Game | null;
        if (failed?.rendererKind !== "webgpu" || settings.graphics.renderer === "webgl2") throw err;
        gameRef.current = null; connectionRef.current = null;
        await failed.dispose();
        if (attempt.current !== token) return;
        const forced: Settings = { ...settings, graphics: { ...settings.graphics, renderer: "webgl2" } };
        updateSettings(forced); hud.reset();
        await startWith(forced);
      }
    } catch (err) {
      if (attempt.current === token) { console.error(err); await leave(humanError(err)); }
    } finally {
      window.clearTimeout(timeout);
      if (attempt.current === token) starting.current = false;
    }
  }, [settings, leave, updateSettings]);

  const enter = async () => {
    const game = gameRef.current, connection = connectionRef.current, token = attempt.current;
    if (!game || !connection || screen.kind !== "ready") return;
    setScreen({ kind: "entering" });
    if (canvasHost.current) canvasHost.current.style.visibility = "visible";
    // THIS CLICK is the user gesture fullscreen, Keyboard Lock and pointer lock all require, and
    // it is the last one before play starts — asking earlier (before `connect`) would spend the
    // gesture on an await and have every request refused. Fullscreen first: Keyboard Lock, which
    // is what puts Escape and Ctrl+W in the game's hands, only works inside it and only on
    // Chromium, so its failure is normal and silent. The pointer is asked for last; if the browser
    // refuses it, the pause card is already the retry surface and says so.
    const host = canvasHost.current;
    if (host && await enterFullscreen(host)) void lockKeyboard();
    void game.requestPointerLockAsync();
    connection.send(C2S.Ready);
    try {
      await game.waitForDeployment();
      if (attempt.current === token) setScreen({ kind: "game" });
    } catch (error) { if (attempt.current === token) await leave(humanError(error)); }
  };
  useEffect(() => () => {
    attempt.current++;
    void gameRef.current?.dispose();
    if (!gameRef.current) void connectionRef.current?.leave();
  }, []);

  // Stable objects so the shop's / chat's handlers are not re-bound every render.
  const shopApi = useMemo<ShopApi>(() => ({
    selectClass: (id) => gameRef.current?.selectClass(id),
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
      <div ref={canvasHost} className="game-canvas-host" style={{ visibility: screen.kind === "game" || screen.kind === "entering" ? "visible" : "hidden" }} />
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
          onChooseTeam={(t) => gameRef.current?.chooseTeam(t)}
          onVotePlan={(id) => gameRef.current?.votePlan(id)}
          shop={shopApi} chat={chatApi} radar={radar}
        />
      )}
      {(screen.kind === "connecting" || screen.kind === "ready" || screen.kind === "entering") && <Loading entering={screen.kind === "entering"} ready={screen.kind === "ready" && loadStage === "ready"} onEnter={enter} onCancel={() => void leave("left")} />}
      {screen.kind === "menu" && (
        <Menu
          settings={settings}
          onSettings={updateSettings}
          connecting={false}
          error={screen.kind === "menu" ? screen.error : undefined}
          onPlay={play}
        />
      )}
    </div>
  );
}

function humanError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (/startup|deployment/i.test(msg)) return msg;
  if (/ECONNREFUSED|Failed to fetch|NetworkError|network|refused|ENOTFOUND|timeout/i.test(msg)) return "Cannot reach the game server. Is it running?";
  if (/full/i.test(msg)) return "That room is full.";
  // The renderer's own messages are already written for a player; passing them through beats
  // replacing them with a generic failure that says nothing about what to try.
  if (/WebGL2|hardware acceleration/i.test(msg)) return msg;
  if (/not found|no rooms|doesn't exist|does not exist/i.test(msg)) return "Room not found.";
  if (/WebGL2|WebGPU/i.test(msg)) return msg;
  return msg || "Something went wrong.";
}
