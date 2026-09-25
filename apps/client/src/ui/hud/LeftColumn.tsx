import { memo, useRef, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { MODES, MatchPhase, planById } from "@frankibarber/shared";
import { useHud, useHudSlice, type HudState } from "../../game/store";
import type { RadarSnapshot } from "../../game/Game";
import { Chat, type ChatApi } from "../Chat";
import { Hints } from "../Hints";
import { Minimap } from "../Minimap";
import { PlanPanel } from "../PlanPanel";
import { useUiFlags } from "./uiFlags";
import type { ZoneProps } from "./types";

/**
 * Drop U, P3: the CS2 left column (docs/UI_U_SPEC.md §7 P3 WORK 1, §4.1, §4.2).
 *
 * One flex column from the top-left corner: the radar, 12 px, the wallet (money, then 6 px, the
 * buy row), 10 px, the round's plan. The column is a layout box and nothing more — it has no
 * `data-zone`; the radar (`Minimap.tsx`), the wallet (`Wallet.tsx`) and the plan (`PlanPanel.tsx`)
 * are each a zone root of their own, so zones never nest. The chat sits apart at the bottom left
 * and the first-run hints at the bottom centre.
 *
 * `Hud.tsx` (P0, frozen) mounts the wallet and the plan where it always did, because they are
 * given what only it has — the HUD's clock and the vote callback. So the column owns two SLOTS,
 * and those two render into them through a portal: the DOM is one column, while the React tree
 * stays the frozen composition. The slots are `display: contents`, so the zone roots are the
 * column's own flex items.
 */

// ------------------------------------------------------------------------------------ slots

type SlotName = "wallet" | "plan";
const slotEls: Record<SlotName, HTMLElement | null> = { wallet: null, plan: null };
const slotListeners = new Set<() => void>();
const subscribeSlots = (l: () => void): (() => void) => { slotListeners.add(l); return () => { slotListeners.delete(l); }; };
function setSlot(name: SlotName, el: HTMLElement | null): void {
  if (slotEls[name] === el) return;
  slotEls[name] = el;
  for (const l of slotListeners) l();
}
const walletRef = (el: HTMLElement | null) => setSlot("wallet", el);
const planRef = (el: HTMLElement | null) => setSlot("plan", el);

/** The column's slot for the wallet or the plan; null until the column is mounted. */
export function useLeftSlot(name: SlotName): HTMLElement | null {
  return useSyncExternalStore(subscribeSlots, () => slotEls[name], () => null);
}

// ------------------------------------------------------------------------------------ column

/** The column (radar, the two slots) and the chat. */
export const LeftColumn = memo(function LeftColumn({ radar, chat }: ZoneProps & { radar: () => RadarSnapshot | null; chat: ChatApi }) {
  // The radar hides behind a tube scope ("the tube takes your surroundings away with it; the M-1's
  // ring is the weapon that does NOT") and in the result. A spacer keeps its place, so the money
  // under it never jumps while you scope in and out.
  const connected = useHudSlice((s) => s.connected);
  const ended = useHudSlice((s) => s.phase === MatchPhase.Ended);
  const tube = useHudSlice((s) => s.scopeStyle === "tube");
  const lines = useHudSlice((s) => s.chat);
  const open = useHudSlice((s) => s.chatOpen);
  const teams = useHudSlice((s) => MODES[s.mode].teams);
  const myId = useHudSlice((s) => s.myId);
  const planUp = useHudSlice(planShowing);
  // The chat measures its room against the column's bottom (§4.3: 12 px under the money or the plan).
  const colRef = useRef<HTMLDivElement>(null);
  return (
    <>
      <div className="left-col" ref={colRef}>
        {connected && !ended && !tube ? <Minimap radar={radar} /> : <div className="radar-spacer" aria-hidden="true" />}
        <div className="left-slot" ref={walletRef} />
        <div className="left-slot" ref={planRef} />
      </div>
      {connected && <Chat lines={lines} open={open} teams={teams} myId={myId} api={chat} planUp={planUp} column={colRef} />}
    </>
  );
});

/**
 * Is the plan on screen — the freeze card or the live chip? The chat keeps fewer lines under it
 * on a short screen (§4.2: ≤ 2 while the plan card shows at ≤ 600 px high).
 */
function planShowing(s: HudState): boolean {
  const p = s.plan;
  if (!p || !p.options.length) return false;
  if (p.chosen === 0 && s.phase === MatchPhase.Prep && s.serverNow < p.appliesAt) return true;
  return s.phase === MatchPhase.Playing && !!planById(s.planId);
}

/**
 * First-run hints: one short line, once each, never blocking (2.4). NOT while dormant: a hint is
 * shown once ever and then remembered, so letting the timer run behind an invisible HUD would burn
 * them all before the player saw one. Not under the pause card either (its `uiFlags` flag), and
 * under the shop or Tab it stays mounted but picks nothing (`covered`, HintsMount).
 */
export const HintLine = memo(function HintLine({ dormant }: ZoneProps & { dormant: boolean }) {
  const paused = useUiFlags((f) => f.overlay.pause);
  const ended = useHudSlice((s) => s.phase === MatchPhase.Ended);
  return !paused && !dormant && !ended ? <HintsMount /> : null;
});

/**
 * The hint zone is hidden under the shop and Tab (§4.5, `left.css`); `covered` tells Hints so it
 * picks nothing there — a hint shown once ever must not be spent behind an overlay.
 */
function HintsMount() {
  const h = useHud();
  const covered = useUiFlags((f) => f.overlay.tab || f.overlay.shop || f.overlay.pause);
  return <Hints h={h} covered={covered || h.shopOpen} />;
}

/**
 * Living arena: the round's plan vote, or what is in force (2.4), in the column's plan slot. It
 * stays MOUNTED under the shop — hidden by §4.5's row in `left.css` — so F1 and F2 still vote.
 */
export const PlanCard = memo(function PlanCard({ onVote }: ZoneProps & { onVote: (id: number) => void }) {
  const show = useHudSlice((s) => !!s.plan && s.plan.options.length > 0 && s.phase !== MatchPhase.Ended);
  const slot = useLeftSlot("plan");
  return show && slot ? <PlanMount onVote={onVote} slot={slot} /> : null;
});

function PlanMount({ onVote, slot }: { onVote: (id: number) => void; slot: HTMLElement }) {
  const h = useHud();
  return createPortal(<PlanPanel h={h} onVote={onVote} />, slot);
}
