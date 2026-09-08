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
import { Shop } from "./ui/Shop";
import { PlanPanel } from "./ui/PlanPanel";
import { PLANS, planOffer } from "@frankibarber/shared";
import type { HudState } from "./game/store";

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
/** `?mode=tdm` is the WORST case for fit: 21 items rather than bomb's 17 (perks, and the launcher). */
const shopState = q.get("mode") === "tdm"
  ? ({ ...state, mode: "tdm", bomb: null, nearStation: true } as unknown as HudState)
  : state;
const planState = {
  ...state,
  myTeam: 1,
  plan: { options: planOffer(2), tally: [2, 1], chosen: 0, appliesAt: 112000, votingTeam: 1, round: 2, at: 0 },
  planId: 0,
} as unknown as HudState;

createRoot(document.getElementById("root")!).render(
  <div className="app" style={{ background: "#0b0b0d" }}>
    {which === "plan"
      ? <PlanPanel h={planState} onVote={(id) => console.log("vote", id)} />
      : <Shop h={shopState} api={api as never} now={100000} />}
  </div>,
);
void PLANS;
