import React, { memo } from "react";
import { TEAM_NAMES, type Team } from "@frankibarber/shared";
import { useHudSlice, type HudState } from "../../game/store";
import type { PhaseModel } from "./phase";
import type { ZoneProps } from "./types";

/**
 * Drop U, P2: the action slot (zone `action`, y 60 %, ≤ 420 wide; docs/UI_U_SPEC.md §5.2 rows 8,
 * 11, 15 and 16) — the one thing my hands can do right here, or how far along they are:
 *
 *   PRZEJMUJESZ B · 62%            ▬▬▬▬▬▬▬▭▭▭   a flag I am taking, 200 × 4
 *   PRZYTRZYMAJ [T] · PODŁÓŻ                    the carrier on a site
 *   PODKŁADANIE                  ▬▬▬▬▬▬▭▭▭▭▭▭   my plant (or ROZBRAJANIE, my defuse), 240 × 6
 *   PRZYTRZYMAJ [T] · ROZBRÓJ                   a defender at the planted bomb
 *
 * While a banner holds the screen only MY OWN progress (`data-progress`) stays: top.css hides the
 * rest under `.hud[data-banner="1"]` (Principle 5, §6.5). Hidden while dead, under an overlay, in a
 * break, between pairs and in Ended (§4.5).
 */

export type ActionKind = "capture" | "plant" | "defuse" | "prompt-plant" | "prompt-defuse";

export interface ActionView {
  kind: ActionKind;
  text: string;
  /** The bar's fill 0..1, or null for a prompt without one. */
  bar: number | null;
  /** My own plant, defuse or capture: the one thing the slot keeps while a banner is up. */
  progress: boolean;
  /** The flag's look: contested, or being taken by the other side. */
  tone: "" | "contested" | "enemy";
}

type ActionInput = Pick<HudState, "alive" | "mode" | "flags" | "inFlag" | "myTeam" | "myId" | "bomb" | "siteHere" | "nearBomb">;

/** Pure: what the slot shows, or null. The store's `siteHere` / `nearBomb` are "" / false until P1 fills them. */
export function actionOf(model: PhaseModel, h: ActionInput): ActionView | null {
  // Flags are taken and bombs planted only while the round or wave is live.
  if (!h.alive || model.moment !== "live") return null;
  const view = (kind: ActionKind, text: string, bar: number | null = null, progress = false, tone: ActionView["tone"] = ""): ActionView => ({ kind, text, bar, progress, tone });
  if (h.mode === "dom" || h.mode === "boys") {
    const here = h.inFlag >= 0 ? h.flags[h.inFlag] : null;
    if (!here) return null;
    if (here.contested) return view("capture", `SPORNY · ${here.id}`, null, false, "contested");
    if (here.capTeam === h.myTeam) return view("capture", `PRZEJMUJESZ ${here.id} · ${Math.round(here.cap * 100)}%`, here.cap, true);
    if (here.capTeam !== -1) return view("capture", `${TEAM_NAMES[here.capTeam as Team]} PRZEJMUJE ${here.id}`, here.cap, false, "enemy");
    return view("capture", here.owner === h.myTeam ? `TRZYMASZ ${here.id}` : here.owner === -1 ? `FLAGA ${here.id}` : `FLAGA WROGA ${here.id}`);
  }
  const b = h.bomb;
  if (h.mode !== "bomb" || !b) return null;
  const planted = b.stage === "planted";
  if (b.actor === h.myId) return view(planted ? "defuse" : "plant", planted ? "ROZBRAJANIE" : "PODKŁADANIE", Math.max(0, Math.min(1, b.progress)), true);
  if (!planted && b.carrier === h.myId && h.siteHere !== "") return view("prompt-plant", "PRZYTRZYMAJ [T] · PODŁÓŻ");
  if (planted && b.attackTeam !== h.myTeam && h.nearBomb) return view("prompt-defuse", "PRZYTRZYMAJ [T] · ROZBRÓJ");
  return null;
}

/** The copy with its keycap drawn as one: „[T]” stays in the text, as the spec writes it. */
function Words({ text }: { text: string }) {
  const at = text.indexOf("[T]");
  if (at < 0) return <>{text}</>;
  return <>{text.slice(0, at)}<kbd className="act-key">[T]</kbd>{text.slice(at + 3)}</>;
}

export const ActionPrompt = memo(function ActionPrompt({ model }: ZoneProps) {
  const key = useHudSlice((s) => {
    const v = actionOf(model, s);
    return v ? `${v.kind}\u0001${v.text}\u0001${v.bar ?? ""}\u0001${v.progress ? 1 : 0}\u0001${v.tone}` : "";
  });
  if (!key) return null;
  const [kind, text, bar, progress, tone] = key.split("\u0001");
  return (
    <div className={`action ${kind}${tone ? ` ${tone}` : ""}`} data-zone="action" data-kind={kind} data-progress={progress === "1" ? "" : undefined}
      data-testid={kind === "capture" ? "capture" : undefined}>
      <span className="act-text"><Words text={text} /></span>
      {bar !== "" && <span className="act-bar"><i style={{ "--v": Number(bar) } as React.CSSProperties} /></span>}
    </div>
  );
});
