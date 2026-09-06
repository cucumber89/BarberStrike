import { MATCH } from "./constants";
import { DOM } from "./dom";
import { BOMB } from "./bomb";
import type { GameMode } from "./types";

export interface ModeDef {
  id: GameMode;
  name: string;
  short: string;
  blurb: string;
  /** Two teams (TDM, Domination) or everyone for themselves (FFA). */
  teams: boolean;
  /** Team score (TDM kills, Domination points) or personal kills (FFA) that ends the match. */
  scoreLimit: number;
}

/** Drop 4: the three modes. FFA scores personal kills; Domination scores held flags. */
export const MODES: Record<GameMode, ModeDef> = {
  tdm: { id: "tdm", name: "TEAM DEATHMATCH", short: "TDM", blurb: `FADE vs TAPER · first to ${MATCH.scoreLimit} kills`, teams: true, scoreLimit: MATCH.scoreLimit },
  ffa: { id: "ffa", name: "FREE FOR ALL", short: "FFA", blurb: "Everyone for themselves · first to 30 kills", teams: false, scoreLimit: 30 },
  dom: { id: "dom", name: "DOMINATION", short: "DOM", blurb: `Hold A / B / C · first to ${DOM.scoreLimit} points`, teams: true, scoreLimit: DOM.scoreLimit },
  bomb: { id: "bomb", name: "BOMB PLANT", short: "BOMB", blurb: "Tactical rounds · B to buy · T to plant / defuse · first to 7 · sides swap after 6", teams: true, scoreLimit: BOMB.wins },
};

export const MODE_ORDER: readonly GameMode[] = ["tdm", "ffa", "dom", "bomb"];
