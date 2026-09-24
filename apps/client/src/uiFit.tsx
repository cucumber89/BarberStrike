/**
 * UI fit review page (dev only, not in the production build — Vite serves any root HTML file, but
 * `rollupOptions.input` decides what ships).
 *
 * The buy menu must fit one screen with nothing cut off and nothing to scroll at every supported
 * resolution. "It looks like it fits" is not a measurement, so `e2e/tools/ui-fit.mjs` drives this
 * page at 1280x720, 1366x768 and 1920x1080 and reads the numbers off the real DOM.
 */
import { createRoot } from "react-dom/client";
import { MatchPhase, type ShopItemId } from "@frankibarber/shared";
// The same cascade as the game (main.tsx): the fonts and the cinematic layer change metrics and
// colours, and a fit measured without them was a fit of a different page.
import "@fontsource/bebas-neue";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";
import "./ui/styles.css";
import "./ui/cinematic.css";
import { Shop } from "./ui/Shop";
import { PlanPanel } from "./ui/PlanPanel";
import { MatchResult } from "./ui/MatchResult";
import { RoundBanner } from "./ui/hud/RoundBanner";
import { emptyProfile, type MatchReward } from "./game/progression/profile";
import { PLANS, planOffer } from "@frankibarber/shared";
import type { HudState, ScoreRow } from "./game/store";

/** A wallet mid-match: enough for some of the list and not enough for the rest, which is the
 *  interesting case — every row state (buyable, carried, too poor, blocked) is on screen at once. */
const state = {
  money: 4300, owned: ["pistol", "rifle"], lethal: "frag", lethalCount: 1, tactical: "flash", tacticalCount: 1,
  armor: 50, perks: {}, kit: false, mode: "bomb", myTeam: 0, serverNow: 100000, phase: MatchPhase.Prep,
  alive: true, nearStation: false, buyWindowLeft: 12000, shopResult: null,
  bomb: { attackTeam: 1, stage: "buy", endsAt: 0, roundEndsAt: 0, x: 0, y: 0, z: 0, result: "" },
} as unknown as HudState;

const api = { buy: (i: ShopItemId) => console.log("buy", i), sell: (i: string) => console.log("sell", i), close: () => console.log("close") };

const q = new URLSearchParams(location.search);
/** `?panel=plan` renders the living-arena vote instead of the shop. */
const which = q.get("panel");
/**
 * `?mode=tdm` is the worst case for the ITEM list (21 rows against bomb's 17). `?mode=boys` is the
 * worst case for HEIGHT: main's #14 added a role strip above the aisles, so that case has to be
 * measured too rather than assumed to still fit.
 */
const mode = q.get("mode") ?? "tdm";
/** `?mode=duel` is the 1 v 1's shop: pistol-round money, the CS freeze counting down. */
const duelState = ({
  ...state, mode: "duel", bomb: { attackTeam: 0, stage: "buy", endsAt: 0, roundEndsAt: 0, x: 0, y: 0, z: 0, result: "" },
  money: 800, owned: ["pistol"], lethal: "", lethalCount: 0, tactical: "", tacticalCount: 0, armor: 0,
  nearStation: false, buyWindowLeft: 15000,
} as unknown as HudState);
const shopState = mode === "duel" ? duelState : mode === "boys"
  ? ({
      ...state, mode: "boys", bomb: null, nearStation: true, boysClass: 2, nextClass: 2,
      players: [0, 1, 2, 3, 4].map((i) => ({ id: `p${i}`, name: `P${i}`, team: 0, connected: true, bot: false, boysClass: (i % 5) + 1, kills: 0, deaths: 0, score: 0, ping: 20, alive: true, assists: 0, money: 0 })),
    } as unknown as HudState)
  : mode === "tdm"
    ? ({ ...state, mode: "tdm", bomb: null, nearStation: true } as unknown as HudState)
    : state;
const planState = {
  ...state,
  myTeam: 1,
  plan: { options: planOffer(2), tally: [2, 1], chosen: 0, appliesAt: 112000, votingTeam: 1, round: 2, at: 0 },
  planId: 0,
} as unknown as HudState;

/**
 * `?panel=result&case=<name>` renders the match-end screen with synthetic data for the cases the
 * brief lists: a win with everything (two level-ups, badges, a haircut, twelve players with long
 * nicks), a loss, a draw, an FFA win, a watcher with no row, and a match that paid no reward.
 */
const longNick = (i: number) => (i % 3 === 0 ? `BardzoDługiNickGraczaNumer${i}_XXL` : i % 3 === 1 ? `P${i}` : `Gracz_${i}`);
const players = (n: number, teams = true): ScoreRow[] => Array.from({ length: n }, (_, i) => ({
  id: i === 0 ? "me" : `p${i}`, name: i === 0 ? "TY_SAM" : longNick(i), team: (teams ? i % 2 : 0) as 0 | 1, connected: i !== 5, bot: i > 8,
  kills: 20 - i, deaths: 4 + i, assists: (i * 3) % 7, score: 300 - i * 17, ping: 20 + i * 9, alive: true, shaved: i === 3, haircut: i === 3 ? "irokez:2" : "", money: 1000,
}));
const reward: MatchReward = {
  lines: [{ label: "Zabójstwa ×20", xp: 400 }, { label: "Trafienia w głowę ×6", xp: 180 }, { label: "Asysty ×5", xp: 100 }, { label: "Przejęcia ×3", xp: 150 }, { label: "Rozegrany mecz", xp: 100 }, { label: "Wygrana", xp: 250 }],
  total: 1180, before: { level: 3, into: 40, need: 600, total: 1240 }, after: { level: 5, into: 220, need: 900, total: 2420 }, levelsGained: 2,
  earned: ["first-blood", "hs-25", "kills-100"], haircuts: ["irokez"], title: "CZELADNIK",
};
const resultCase = q.get("case") ?? "win";
const resultBase = { ...state, mode: "tdm", profile: emptyProfile(), phase: MatchPhase.Ended, phaseEndsAt: 112000, serverNow: 100000, myId: "me", myTeam: 0, players: players(12), reward, scoreA: 40, scoreB: 33, winner: 0, winnerId: "", winnerName: "", bomb: null } as unknown as HudState;
const resultState: HudState = resultCase === "loss" ? { ...resultBase, winner: 1, scoreA: 31, scoreB: 40, reward: { ...reward, levelsGained: 0, earned: [], haircuts: [], lines: reward.lines.slice(0, 3), total: 680 } }
  : resultCase === "draw" ? { ...resultBase, winner: -1, scoreA: 22, scoreB: 22 }
  : resultCase === "ffa" ? { ...resultBase, mode: "ffa", winnerId: "me", winnerName: "TY_SAM", players: players(8, false) }
  : resultCase === "spectator" ? { ...resultBase, myId: "watcher", reward: null }
  : resultCase === "noreward" ? { ...resultBase, reward: null }
  : resultCase === "ostrzyzeni" ? { ...resultBase, mode: "ostrzyzeni", winnerId: "p1", winnerName: "P1", scoreA: 3, scoreB: 2 }
  // Drop T: a finished tournament, so the result card's third tab (the whole draw) is measured
  // like every other screen. The string is the one the server writes — eight entrants, played out.
  : resultCase === "turniej" ? { ...resultBase, mode: "turniej", winnerId: "p3", winnerName: "ZDZICHU", scoreA: 6, scoreB: 4,
      bracket: "8|7;TY|RYSIEK|0|6|b;MIREK|ZDZICHU|4|6|b;KUBA|WALDEK|6|2|a;STASZEK|HENIU|3|6|b;RYSIEK|ZDZICHU|4|6|b;KUBA|HENIU|6|5|a;ZDZICHU|KUBA|6|4|a" }
  : resultBase;
const roundState = { ...resultBase, mode: "bomb", phase: MatchPhase.Prep, roundWinner: -1, scoreA: 3, scoreB: 2,
  // `roundResult` is what the card reads (the bomb block is only mirrored in Bomb); it carries the
  // same string the server writes, which is why the 1 v 1 gets a round card at all now.
  roundResult: "BOMB DEFUSED",
  bomb: { attackTeam: 1, stage: "resolved", endsAt: 0, roundEndsAt: 0, x: 0, y: 0, z: 0, result: "BOMB DEFUSED", round: 5 } } as unknown as HudState;

createRoot(document.getElementById("root")!).render(
  <div className="app" style={{ background: "#0b0b0d" }}>
    {which === "plan"
      ? <PlanPanel h={planState} onVote={(id) => console.log("vote", id)} />
      : which === "result"
        ? <div className="hud"><MatchResult h={resultState} now={100000} onLeave={() => console.log("leave")} /></div>
        : which === "round"
          ? <div className="hud"><RoundBanner h={roundState} standalone /></div>
          : <Shop h={shopState} api={api as never} now={100000} />}
  </div>,
);
void PLANS;
