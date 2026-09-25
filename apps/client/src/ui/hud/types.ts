import type { Team } from "@frankibarber/shared";
import type { Settings } from "../../settings";
import type { RadarSnapshot } from "../../game/Game";
import type { ShopApi } from "../Shop";
import type { ChatApi } from "../Chat";
import type { PhaseModel } from "./phase";

/**
 * Drop U: the HUD's contract types. Owned by P0 and frozen for the drop (docs/UI_U_SPEC.md §7.0).
 */

/** The `<Hud>` props: today's, unchanged, plus `entering`. `Hud.tsx` takes exactly this type. */
export interface HudProps {
  settings: Settings;
  onSettings: (s: Settings) => void;
  onLeave: () => void;
  /** Resolves to whether the pointer really ended up locked — a refusal must be visible, not silent. */
  onResume: () => Promise<boolean>;
  /** Release the pointer so Escape can open the pause card even when the browser did not do it. */
  onPause: () => void;
  /** Toggle fullscreen; resolves to whether the game is fullscreen afterwards. */
  onFullscreen: () => Promise<boolean>;
  /** Ask the server to move you to a side; it decides and answers. */
  onChooseTeam: (t: Team) => void;
  /** Living arena: vote for one of this round's plans. */
  onVotePlan: (id: number) => void;
  /** Drop 2: shop actions routed to the game (buy/sell go to the server, close re-locks the pointer). */
  shop: ShopApi;
  /** Drop 5: chat send / close, and the minimap's per-frame feed. */
  chat: ChatApi;
  radar: () => RadarSnapshot | null;
  /**
   * Mounted but not yet in play: the tree is built and committed while the loading screen is still
   * up, so the ~25 ms first commit is not paid at the instant the player presses DEPLOY. Nothing
   * is interactive and nothing is visible until this goes false.
   */
  dormant?: boolean;
  /**
   * Drop U (§6.1, P7 drives it): the black of the loading → match fade has started to leave. The
   * root gets the class `entering` and each zone runs `hud-enter`. Inert until wave 2.
   */
  entering?: boolean;
}

/** What every zone component receives: the phase model (`phase.ts`), computed once per HUD. */
export interface ZoneProps {
  model: PhaseModel;
}

/**
 * My side in a round mode, as the strip badge and the banners name it (`copy.ts` SIDE_WORD):
 * attack or defence in bomb, survivor or shaved in ostrzyżeni.
 */
export type Side = "atak" | "obrona" | "ocalony" | "ostrzyzony";
