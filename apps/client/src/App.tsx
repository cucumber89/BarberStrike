import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { C2S, HAIRCUTS, SHAVE_STAGES, WEAPONS, WEAPON_ORDER, type BotLevel, type GameMode } from "@frankibarber/shared";
import { WEAPON_FEEL } from "./game/combat/weaponFeel";
import { Connection, defaultServerUrl } from "./game/net/Connection";
import { Game } from "./game/Game";
import { loadSettings, saveSettings, type Settings } from "./settings";
import { Menu } from "./ui/Menu";
import { Hud } from "./ui/Hud";
import type { ShopApi } from "./ui/Shop";
import type { ChatApi } from "./ui/Chat";
import { Loading, pickedMap } from "./ui/Loading";
import { Fade, useFade } from "./ui/Fade";
import { humanError } from "./ui/errors";
import { ERR } from "./ui/hud/copy";
import { uiFlags } from "./ui/hud/uiFlags";
import { useHudSlice } from "./game/store";
import { enterFullscreen, exitImmersion, isFullscreen, lockKeyboard } from "./game/input/immersion";
import { hud } from "./game/store";

/**
 * The screens, in the order a match goes through them. `entering` is the click on WEJDŹ DO MECZU
 * while the black comes in (the loading card still shows, the canvas stays hidden); `deploying` is
 * UNDER the black (the canvas is shown, the loading card is still mounted but covered, the HUD is
 * still dormant) until the server has spawned us and the camera has rendered; `game` is play.
 */
type Screen = { kind: "menu"; error?: string } | { kind: "connecting" } | { kind: "ready" } | { kind: "entering" } | { kind: "deploying" } | { kind: "game" };

/** What the loading card is told about the match before the room itself says (§5.2 #64). */
interface Picked { gameMode?: GameMode; mapId?: string }

/** §6.1: the transition lengths, in ms. */
const FADE = {
  /** Menu → loading: black in, the loading card mounts under it, black out. */
  toLoading: { in: 240, out: 200 },
  /** Loading → match: black in, held ≥ `hold` until deployed, then out (the zones stagger in). */
  toMatch: { in: 200, hold: 100, out: 400 },
  /** Match / loading / error → menu: black in, then the menu keyart's own `mm-keyart-in` (1100). */
  toMenu: { in: 240, out: 240 },
  /** The zone stagger (`hud.css` `.hud.entering`): the last zone starts at 180 and runs 240. */
  stagger: 420,
} as const;

export function App() {
  const [screen, setScreen] = useState<Screen>({ kind: "menu" });
  const [settings, setSettings] = useState<Settings>(() => loadSettings());
  const canvasHost = useRef<HTMLDivElement>(null);
  /**
   * What goes fullscreen. It has to be the whole app, not the canvas host: a fullscreen element is
   * promoted to the browser's TOP LAYER, and everything outside it stops being painted and stops
   * receiving clicks. Fullscreening the canvas alone therefore took the HUD, the buy menu, the
   * chat, the pause card and the result screen off the screen — MEASURED: a screenshot taken at
   * an open buy menu showed the barbershop and nothing else, and Playwright reported the canvas
   * intercepting the click meant for a BUY button.
   */
  const appRoot = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Game | null>(null);
  const attempt = useRef(0);
  const starting = useRef(false);
  const connectionRef = useRef<Connection | null>(null);
  const { state: fadeState, ref: fadeRef, through } = useFade();
  /** The menu's pick for the match being loaded: undefined when joining a room by its id. */
  const [picked, setPicked] = useState<Picked>({});
  /** The HUD's zone stagger is running (§6.1): on as the black starts to leave, off ~420 ms later. */
  const [entering, setEntering] = useState(false);
  const enteringTimer = useRef(0);

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

  /**
   * Back to the menu, through black (§6.1 match → menu, loading → menu, error → menu). `reason` is
   * "left" when the player chose it; anything else is an error — a code (`ERR.*`) or whatever was
   * thrown — and the menu shows its Polish text (`ui/errors.ts`), never the raw message.
   *
   * The attempt is cancelled at once, so a start still in flight can no longer replace the menu;
   * the teardown itself waits for the black.
   */
  const leave = useCallback(async (reason?: unknown) => {
    attempt.current++;
    starting.current = false;
    const error = reason === undefined || reason === "left" ? undefined : humanError(reason);
    if (error) console.warn("[app] back to the menu:", reason);
    await through({
      inMs: FADE.toMenu.in, outMs: FADE.toMenu.out,
      swap: async () => {
        const g = gameRef.current, c = connectionRef.current;
        gameRef.current = null; connectionRef.current = null;
        // Leaving the match gives the keyboard and the screen back to the browser. Without this the
        // player lands in the menu still fullscreen with Escape captured, which reads as a hang.
        exitImmersion();
        canvasHost.current?.replaceChildren();
        // The e2e harness hook holds the WHOLE previous generation: the Game, its Scene, its disposed
        // engine with the WebGL context behind it, the Connection with the full room state, every
        // RemotePlayer and the local player's 240-entry input history. Leaving it set meant a stale
        // generation stayed reachable for as long as the tab lived — the view and audio modules already
        // delete their own globals on teardown, and this one was simply missed.
        delete (window as unknown as { __fb?: unknown }).__fb;
        hud.reset();
        window.clearTimeout(enteringTimer.current);
        setEntering(false);
        uiFlags.set({ entering: false });
        setScreen((s) => (s.kind === "menu" && !error ? s : { kind: "menu", error }));
        try { if (g) await g.dispose(); else await c?.leave(); } catch (err) { console.warn("[app] cleanup", err); }
      },
    });
  }, [through]);

  const play = useCallback(async (name: string, roomName: string, mode: "auto" | "create" | "join", roomId: string | undefined, gameMode: GameMode, bots: { count: number; level: BotLevel }, mapId: string) => {
    if (starting.current || gameRef.current) return;
    starting.current = true;
    const token = ++attempt.current;
    hud.reset();
    // Joining a room by its id: the room has its own mode and map, and the menu's pick is not them
    // (§5.2 #64) — the loading card says „DOŁĄCZANIE DO POKOJU” until the room itself tells us.
    // A duel and a tournament are always played on the 1 v 1 arena, whatever the menu's map says:
    // the server overrides the lobby's map for them (`TdmRoom.ts` `duel`, `MAPS[DUEL_MAP_ID]`).
    setPicked(mode === "join" ? {} : { gameMode, mapId: pickedMap(gameMode, mapId) });
    // The connection starts now; the screen changes under the black (§6.1 menu → loading). The
    // ENGINE waits for the loading card to be on screen (`shown`): building the scene holds the
    // main thread for seconds, and started under the black it froze the black in place — the card
    // then appeared only once the heavy part was over (measured: black for 10 s+ on SwiftShader).
    const shown = through({
      inMs: FADE.toLoading.in, outMs: FADE.toLoading.out,
      swap: () => { if (attempt.current === token) setScreen((s) => (s.kind === "menu" ? { kind: "connecting" } : s)); },
    });
    const timeout = window.setTimeout(() => { if (attempt.current === token) void leave(ERR.loadTimeout); }, 90000);
    const startWith = async (s: Settings): Promise<void> => {
      const connection = await Connection.connect({ url: defaultServerUrl(), name, roomName, mode, roomId, gameMode, mapId, bots: bots.count, botLevel: bots.level });
      await shown;
      if (attempt.current !== token) { await connection.leave(); return; }
      connectionRef.current = connection;
      const game = new Game({ canvas: freshCanvas(), connection, settings: s, onLeave: reason => { if (attempt.current === token) void leave(reason); } });
      gameRef.current = game;
      await game.start();
      if (attempt.current !== token) { await game.dispose(); return; }
      // Harness hook for the e2e tools. `WEAPONS` and `WEAPON_FEEL` ride along so a tool reads the
      // numbers the running bundle was built from rather than a copy it keeps in its own source —
      // a copy is how a tool ends up reporting a matrix the game stopped implementing.
      (window as unknown as { __fb: unknown }).__fb = { game, hud, shared: { WEAPONS, WEAPON_ORDER, HAIRCUTS, SHAVE_STAGES }, feel: WEAPON_FEEL };
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
      if (attempt.current === token) { console.error(err); await leave(err); }
    } finally {
      window.clearTimeout(timeout);
      if (attempt.current === token) starting.current = false;
    }
  }, [settings, leave, updateSettings, through]);

  /**
   * WEJDŹ DO MECZU (§6.1 loading → match). The black comes in over 200 ms; under it the canvas is
   * shown and we wait for the server's spawn plus two rendered frames (`waitForDeployment`), held at
   * least 100 ms; then the loading card unmounts, the HUD wakes, and the black leaves over 400 ms
   * while the zones stagger in. No frame shows the loading card and the live canvas together, or
   * the canvas with a dormant HUD, unless it is black (`startup.spec.ts` "no shared frame").
   */
  const enter = async () => {
    const game = gameRef.current, connection = connectionRef.current, token = attempt.current;
    if (!game || !connection || screen.kind !== "ready") return;
    setScreen({ kind: "entering" });
    // THIS CLICK is the user gesture fullscreen, Keyboard Lock and pointer lock all require, and
    // it is the last one before play starts — asking earlier (before `connect`) would spend the
    // gesture on an await and have every request refused. Fullscreen first: Keyboard Lock, which
    // is what puts Escape and Ctrl+W in the game's hands, only works inside it and only on
    // Chromium, so its failure is normal and silent. The pointer is asked for last; if the browser
    // refuses it, the pause card is already the retry surface and says so. The black starts with
    // the click, so the fullscreen resize happens behind it. `deployed` exists before the black is
    // queued (the swap under it awaits it) and starts waiting once Ready is sent.
    let waitFor!: (p: Promise<void>) => void;
    const deployed = new Promise<void>((resolve, reject) => { waitFor = (p) => { p.then(resolve, reject); }; });
    deployed.catch(() => undefined); // observed through `black` below
    const black = through({
      inMs: FADE.toMatch.in, outMs: FADE.toMatch.out,
      swap: async () => {
        if (attempt.current !== token) return;
        setScreen({ kind: "deploying" });
        await Promise.all([deployed, new Promise((r) => window.setTimeout(r, FADE.toMatch.hold))]);
        if (attempt.current === token) setScreen({ kind: "game" });
      },
      onClear: () => {
        if (attempt.current !== token) return;
        setEntering(true);
        uiFlags.set({ entering: true });
        window.clearTimeout(enteringTimer.current);
        enteringTimer.current = window.setTimeout(() => { setEntering(false); uiFlags.set({ entering: false }); }, FADE.stagger);
      },
    });
    const host = appRoot.current;
    if (host && await enterFullscreen(host)) void lockKeyboard();
    void game.requestPointerLockAsync();
    connection.send(C2S.Ready);
    waitFor(game.waitForDeployment());
    try { await black; }
    catch (error) { if (attempt.current === token) await leave(error); }
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
    <div className="app" ref={appRoot}>
      {/* The game canvas is created imperatively per start (see freshCanvas); menus overlay this host. */}
      <div ref={canvasHost} className="game-canvas-host" style={{ visibility: screen.kind === "game" || screen.kind === "deploying" ? "visible" : "hidden" }} />
      {/* Mounted from the READY screen on, not from DEPLOY: React's first commit of this tree is
          ~25 ms (measured, `e2e/tools/hud-bench.mjs`), and paying it at the moment the player
          presses DEPLOY is a dropped frame in the first second of play. `dormant` keeps it
          invisible and inert until the match actually starts. */}
      {(screen.kind === "ready" || screen.kind === "entering" || screen.kind === "deploying" || screen.kind === "game") && (
        <Hud
          dormant={screen.kind !== "game"} entering={entering}
          settings={settings} onSettings={updateSettings} onLeave={() => void leave("left")}
          onResume={async () => (await gameRef.current?.requestPointerLockAsync()) ?? false}
          onPause={() => gameRef.current?.releasePointerLock()}
          onFullscreen={async () => {
            const el = appRoot.current;
            if (isFullscreen()) { exitImmersion(); return false; }
            const ok = el ? await enterFullscreen(el) : false;
            if (ok) {
              void lockKeyboard();
              // Entering fullscreen drops the pointer lock, and everything the player reads while
              // playing — the crosshair, the tactical meter — is gated on holding it, so without
              // this you land in fullscreen with the pause menu open and no HUD. Taking it back is
              // what "go fullscreen" was always supposed to mean.
              await gameRef.current?.requestPointerLockAsync();
            }
            return ok;
          }}
          onChooseTeam={(t) => gameRef.current?.chooseTeam(t)}
          onVotePlan={(id) => gameRef.current?.votePlan(id)}
          shop={shopApi} chat={chatApi} radar={radar}
        />
      )}
      {(screen.kind === "connecting" || screen.kind === "ready" || screen.kind === "entering" || screen.kind === "deploying") && (
        <Loading entering={screen.kind === "entering" || screen.kind === "deploying"} ready={screen.kind === "ready" && loadStage === "ready"}
          gameMode={picked.gameMode} mapId={picked.mapId} onEnter={enter} onCancel={() => void leave("left")} />
      )}
      {screen.kind === "menu" && (
        <Menu
          settings={settings}
          onSettings={updateSettings}
          connecting={false}
          error={screen.kind === "menu" ? screen.error : undefined}
          onPlay={play}
        />
      )}
      <Fade ref={fadeRef} on={fadeState.on} ms={fadeState.ms} />
    </div>
  );
}
