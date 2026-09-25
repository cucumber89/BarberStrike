import { memo, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { BOMB, MODES, MatchPhase, OSTRZYZENI, type GameMode, type Team } from "@frankibarber/shared";
import { useHudSlice } from "../../game/store";
import { BracketPanel } from "../Bracket";
import { HistoryStrip, Scoreboard } from "../Scoreboard";
import { boardSides, boardSplit, historySlots, nextDensity, type BoardDensity } from "../resultText";
import { MODE_TITLE, mapTitle } from "./copy";
import { fmtClock } from "./format";
import { clockMs, type PhaseModel } from "./phase";
import { uiFlags } from "./uiFlags";
import { useKeepMounted } from "./useKeepMounted";
import type { ZoneProps } from "./types";

/**
 * The Tab scoreboard (zone `scoreboard`, docs/UI_U_SPEC.md P6): held open by Tab, as in CS2 — also
 * over the shop, above it (z 45 > 40), because a player checks the enemy's buy while buying. It
 * publishes `uiFlags.overlay.tab` while it shows, so every other zone but the strip steps back
 * (§4.5), and it steps back itself under the pause column. Plain focus navigation keeps Tab only
 * inside the pause card, and the chat box keeps the keyboard.
 *
 * From top to bottom (§4.4): the header (`sb-header`: my side and score, the round and the clock,
 * the mode and the map, theirs), the round history (`sb-history`, round modes), my side, theirs;
 * in a tournament the pair on the board and then the whole draw (`BracketPanel`, read-only). It
 * never scrolls: a roster too big for that stack at this screen's height is drawn tighter, and then
 * with the sides side by side (`useBoardFit`), never in type under the floor.
 */

/** Leaving takes 100 ms (§6.1): the board stays mounted that long, its keys already released. */
const SB_EXIT_MS = 100;

export const ScoreboardOverlay = memo(function ScoreboardOverlay({ model, dormant }: ZoneProps & { dormant: boolean }) {
  const chatOpen = useHudSlice((s) => s.chatOpen);
  const ended = useHudSlice((s) => s.phase === MatchPhase.Ended);
  const [held, setHeld] = useState(false);

  useEffect(() => {
    if (dormant) return;
    const down = (e: KeyboardEvent) => {
      if (chatOpen) return; // the chat box owns the keyboard (drop 5)
      // Tab is the scoreboard in play and in the shop; plain focus navigation inside the pause card.
      if (e.code === "Tab" && !uiFlags.get().overlay.pause) { e.preventDefault(); setHeld(true); }
    };
    const up = (e: KeyboardEvent) => { if (e.code === "Tab") setHeld(false); };
    // Alt-tabbing away with Tab down never delivers its keyup: the board must not stay stuck open.
    const blur = () => setHeld(false);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); window.removeEventListener("blur", blur); };
  }, [chatOpen, dormant]);

  // The match's end has its own table (the result card's TABELA tab, which Tab opens).
  const open = held && !ended;
  const mount = useKeepMounted(open, SB_EXIT_MS);
  // Published before paint, like the pause card's flag.
  useLayoutEffect(() => { uiFlags.set({ overlay: { tab: open } }); }, [open]);
  useLayoutEffect(() => () => uiFlags.set({ overlay: { tab: false } }), []);
  return mount === "closed" ? null : <Board model={model} closing={mount === "closing"} />;
});

/** The board: its rows are read only while it is up. */
function Board({ model, closing }: { model: PhaseModel; closing: boolean }) {
  const players = useHudSlice((s) => s.players);
  const myId = useHudSlice((s) => s.myId);
  const myTeam = useHudSlice((s) => s.myTeam);
  const mode = useHudSlice((s) => s.mode);
  const bracket = useHudSlice((s) => s.bracket);
  const history = useHudSlice((s) => s.roundHistory);
  const slots = historySlots(mode, history, model.round);
  const ref = useRef<HTMLDivElement>(null);
  // What decides the board's height: how many rows and tables, the strip, the draw, the screen.
  const density = useBoardFit(ref, `${players.length}|${mode}|${slots?.length ?? 0}|${bracket}`);
  return (
    <div ref={ref} className={`sb${closing ? " closing" : ""}`} data-zone="scoreboard" data-testid="scoreboard" data-density={density} role="dialog" aria-label="Tabela wyników">
      <Header model={model} mode={mode} myTeam={myTeam} bracket={bracket} />
      {slots && <HistoryStrip slots={slots} mode={mode} />}
      <Scoreboard rows={players} myId={myId} myTeam={myTeam} mode={mode} bracket={bracket} live split={boardSplit(density)} />
      {mode === "turniej" && bracket !== "" && <div className="sb-bracket"><BracketPanel bracket={bracket} compact /></div>}
    </div>
  );
}

/** The screen's size, and whether the web fonts have landed: either one moves the rows' height. */
function useScreenKey(): string {
  const read = () => `${window.innerWidth}x${window.innerHeight}|${document.fonts?.status ?? "loaded"}`;
  const [key, setKey] = useState(read);
  useEffect(() => {
    const on = () => setKey(read());
    window.addEventListener("resize", on);
    if (document.fonts && document.fonts.status !== "loaded") void document.fonts.ready.then(on);
    return () => window.removeEventListener("resize", on);
  }, []);
  return key;
}

/**
 * The Tab board never scrolls (the pointer is locked and the wheel changes weapons, so a row under
 * the fold is a row the player never sees): it is drawn at the first density (`BoardDensity`) at
 * which everything fits, measured before paint. A new roster, strip, draw or screen starts again
 * from the spec's roomy board, and each overflow steps one density on — a few synchronous layouts
 * when the board opens or the roster changes, none while only the numbers tick.
 *
 * Past the densest layout (a host who raised the open lobby's cap far past the default 32 + 8) the
 * board scrolls after all, and keeps my own row in view.
 */
function useBoardFit(ref: RefObject<HTMLDivElement | null>, content: string): BoardDensity {
  const key = `${content}|${useScreenKey()}`;
  const [fit, setFit] = useState<{ key: string; density: BoardDensity }>({ key, density: 0 });
  const density: BoardDensity = fit.key === key ? fit.density : 0;
  const measured = useRef("");
  useLayoutEffect(() => {
    const el = ref.current;
    const at = `${key}#${density}`;
    if (!el || measured.current === at) return;
    measured.current = at;
    const over = el.scrollHeight > el.clientHeight + 1;
    const next = nextDensity(density, over);
    if (next !== null) { setFit({ key, density: next }); return; }
    if (fit.key !== key) setFit({ key, density });
    if (over) {
      const me = el.querySelector<HTMLElement>("tr.me");
      if (me) {
        const r = me.getBoundingClientRect(), b = el.getBoundingClientRect();
        if (r.bottom > b.bottom) el.scrollTop += r.bottom - b.bottom + 8;
      }
    }
  });
  return density;
}

/**
 * „FADE 4 · RUNDA 7 / 12 · 0:12 · ŁADUNEK · NIGHT DISTRICT · 2 TAPER” (§5.2 #52): my side on the
 * left as in the strip; the round and the clock the strip shows; the mode title from `copy.ts`
 * (Polish, also in FFA, where the table used to say FREE FOR ALL) and the map. FFA and gun game
 * have no sides to put at the ends; a tournament's sides are the pair's two nicks.
 */
function Header({ model, mode, myTeam, bracket }: { model: PhaseModel; mode: GameMode; myTeam: Team; bracket: string }) {
  const scoreA = useHudSlice((s) => s.scoreA);
  const scoreB = useHudSlice((s) => s.scoreB);
  const mapId = useHudSlice((s) => s.mapId);
  const serverNow = useHudSlice((s) => s.serverNow);
  // Names, score and round of ONE pair: between a tournament's pairs, the pair now up at 0 : 0.
  const { names, score, round: roundOn } = boardSides(mode, bracket, model.betweenPairs, scoreA, scoreB);
  const sides = MODES[mode].teams;
  const mine = myTeam;
  const roundOf = mode === "bomb" ? ` / ${BOMB.maxRounds}` : mode === "ostrzyzeni" ? ` / ${OSTRZYZENI.rounds}` : "";
  const round = roundOn && model.roundMode && model.round > 0 ? `RUNDA ${model.round}${roundOf}` : "";
  const clock = model.clockKind === "warmup" ? "ROZGRZEWKA" : model.clockKind === "none" ? "" : fmtClock(clockMs(model, serverNow));
  const map = mapTitle(mapId);
  const side = (t: Team, end: "l" | "r") => (
    <div className={`sb-side ${end} t${t}${mode === "turniej" ? " nicks" : ""}`}>
      {end === "l" ? <><b className="sb-side-name">{names[t]}</b><span className="sb-side-score">{score[t]}</span></>
        : <><span className="sb-side-score">{score[t]}</span><b className="sb-side-name">{names[t]}</b></>}
    </div>
  );
  return (
    <div className="sb-header" data-testid="sb-header">
      {sides && side(mine, "l")}
      <div className="sb-mid">
        <div className="sb-mid-top">
          {round && <span className="sb-round">{round}</span>}
          {clock && <span className={`sb-clock ${model.clockKind}`}>{clock}</span>}
        </div>
        <div className="sb-mid-sub">{MODE_TITLE[mode]}{map && <> <i aria-hidden="true">·</i> {map}</>}</div>
      </div>
      {sides && side((1 - mine) as Team, "r")}
    </div>
  );
}
