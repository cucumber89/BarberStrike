import { memo, useLayoutEffect, useRef, useSyncExternalStore } from "react";
import { OSTRZYZENI, type GameMode, type Team } from "@frankibarber/shared";
import { hud, useHudSlice, type HudState } from "../../game/store";
import { MODE_TITLE, mapTitle } from "./copy";
import { createMomentTracker, itemWinner, publishBannerUp, type AlertKind, type BannerKind, type BusItem, type MomentTracker, type MomentView } from "./bus";
import { freezeCopy, halftimeCard, roleCopy, sideNames, turniejPair, type BannerCopy, type Tone } from "./roundText";
import { BannerFrame, RoundBannerLive } from "./RoundBanner";
import type { PhaseModel } from "./phase";
import type { ZoneProps } from "./types";

/**
 * Drop U, P5: the match's MOMENTS (docs/UI_U_SPEC.md §6.1, §6.5) — the countdown's intro block and
 * digit, „WALCZ!”, the freeze start (or Ostrzyżeni's role card), the round end, the halftime card,
 * the final round, „OSTRZYŻONY!” and the alert slot (the plant, a flag, the last weapon, an aborted
 * countdown, a new match, the lost connection).
 *
 * One component draws them all because one arbiter decides them all: the moment bus (`bus.ts`)
 * gives the screen at most one banner and one alert, times each from the server's deadlines or the
 * edge it observed, and publishes `uiFlags.bannerUp`. The words come from `roundText.ts` (a round's)
 * and from here (the rest). Every word the player reads is Polish and uppercased in JS (§3.3).
 */

// ------------------------------------------------------------------------------------ words

/** The countdown's intro block (§5.2 row 2): the mode, the map, and whose side I am on. */
export function introCopy(h: Pick<HudState, "mode" | "mapId" | "myTeam" | "bracket">): { eyebrow: string; title: string; line: string } {
  const pair = h.mode === "turniej" ? turniejPair(h.bracket) : null;
  const line = h.mode === "ffa" || h.mode === "gungame" ? "KAŻDY NA SIEBIE"
    : pair ? `${pair.names[0]} vs ${pair.names[1]}`
    : `GRASZ W ${sideNames(h.mode)[h.myTeam]}`;
  return { eyebrow: MODE_TITLE[h.mode], title: mapTitle(h.mapId), line };
}

/** One alert's words, colour and pinned testid (§5.2 rows 3, 18, 42, 67, 68; §8.2, §8.3). */
export interface AlertCopy { text: string; tone: Tone; testid: string }

export function alertCopy(item: BusItem<AlertKind>, mode: GameMode): AlertCopy {
  const d = item.data ?? {};
  switch (item.kind) {
    case "reconnect": return { text: "UTRACONO POŁĄCZENIE · ŁĄCZĘ PONOWNIE…", tone: "danger", testid: "reconnecting" };
    case "plant": return { text: d.site ? `ŁADUNEK PODŁOŻONY · ${d.site}` : "ŁADUNEK PODŁOŻONY", tone: "danger", testid: "bomb-planted" };
    case "flag": {
      const team = (d.team === 1 ? 1 : 0) as Team;
      // „A DLA FADE” from the structured notice (P1's producer); until then its own text.
      return { text: d.flag ? `${d.flag} DLA ${sideNames(mode)[team]}` : String(d.text ?? ""), tone: team === 0 ? "team0" : "team1", testid: "flag-notice" };
    }
    case "lastWeapon": return { text: d.me ? "OSTATNIA BROŃ" : `${d.name} NA OSTATNIEJ BRONI`, tone: "warn", testid: "last-weapon" };
    case "aborted": return { text: "ODLICZANIE PRZERWANE", tone: "tx", testid: "countdown-aborted" };
    case "newMatch": return { text: "NOWY MECZ · ROZGRZEWKA", tone: "tx", testid: "new-match" };
  }
}

/** „WALCZ!” (§6.1: continuous modes only) and „OSTRZYŻONY!” (§5.2 row 40). */
export const FIGHT_COPY: BannerCopy = { eyebrow: [], title: "WALCZ!", titleTone: "tx", line: [], rule: "tx" };
export const SHAVED_COPY: BannerCopy = { eyebrow: [], title: "OSTRZYŻONY!", titleTone: "danger", line: [{ text: "TERAZ TY GONISZ" }], rule: "danger" };

/** The testid each banner kind carries (§8.2, §8.3). */
export const BANNER_TESTID: Readonly<Record<BannerKind, string>> = {
  final: "round-end", roundEnd: "round-end", halftime: "halftime", freeze: "round-start", role: "role-card", fight: "fight", shaved: "shaved-banner",
};

/** The round's first chaser in Ostrzyżeni, by the nick in its own case; "" when none is known. */
export const chaserName = (h: Pick<HudState, "players">): string =>
  h.players.find((p) => p.team === OSTRZYZENI.shavedTeam)?.name ?? "";

/**
 * A non-round banner's words (the round end and the final round are `RoundBanner`'s). Null when
 * the state has nothing to say for it (a halftime card outside bomb's half).
 */
export function bannerCopy(kind: Exclude<BannerKind, "roundEnd" | "final">, model: PhaseModel, h: { myTeam: Team; bracket: string; chaser: string }): (BannerCopy & { glow?: boolean }) | null {
  switch (kind) {
    case "halftime": return halftimeCard(model.mode, model.round, h.myTeam);
    case "freeze": return freezeCopy({ ...model, myTeam: h.myTeam, bracket: h.bracket });
    case "role": return roleCopy(model.mySide === "ostrzyzony", h.chaser);
    case "fight": return FIGHT_COPY;
    case "shaved": return SHAVED_COPY;
  }
}

// ------------------------------------------------------------------------------------ the zones

/** The bus, fed every store state in order from this HUD's mount. */
function useMomentView(): MomentView {
  const tracker = useRef<MomentTracker | null>(null);
  if (!tracker.current) tracker.current = createMomentTracker();
  const t = tracker.current;
  const read = (): MomentView => t.read(hud.get(), performance.now());
  return useSyncExternalStore(hud.subscribe, read, read);
}

/** The countdown: the intro block, left of the aim point (zone `intro`, no plate). */
function Intro({ leaving }: { leaving: boolean }) {
  const mode = useHudSlice((s) => s.mode);
  const mapId = useHudSlice((s) => s.mapId);
  const myTeam = useHudSlice((s) => s.myTeam);
  const bracket = useHudSlice((s) => s.bracket);
  const c = introCopy({ mode, mapId, myTeam, bracket });
  return (
    <div className={`moment-intro${leaving ? " out" : ""}`} data-zone="intro" data-testid="intro">
      <div className="mi-eyebrow">{c.eyebrow}</div>
      {c.title && <div className="mi-title">{c.title}</div>}
      <div className="mi-line">{c.line}</div>
    </div>
  );
}

/** The last three seconds of the countdown: one digit in the banner box, no band (veto). */
function Digit({ n }: { n: number }) {
  return (
    <div className="moment-stage">
      <div key={n} className="moment-digit" data-zone="banner" data-testid="countdown">{n}</div>
    </div>
  );
}

/** The alert slot (zone `alert`): one line at t3 under the strip. */
function Alert({ item, leaving }: { item: BusItem<AlertKind>; leaving: boolean }) {
  const mode = useHudSlice((s) => s.mode);
  const c = alertCopy(item, mode);
  return (
    <div className={`moment-alert tone-${c.tone}${leaving ? " out" : ""}`} data-zone="alert" data-testid="alert" data-kind={item.kind} role="status">
      <span data-testid={c.testid}>{c.text}</span>
      {item.kind === "reconnect" && <i className="ma-spinner" aria-hidden="true" />}
    </div>
  );
}

/** A non-round banner, drawn from the live state (the chaser's nick, the pair, my side). */
function MomentBanner({ kind, model }: { kind: Exclude<BannerKind, "roundEnd" | "final">; model: PhaseModel }) {
  const myTeam = useHudSlice((s) => s.myTeam);
  const bracket = useHudSlice((s) => s.bracket);
  const chaser = useHudSlice(chaserName);
  const copy = bannerCopy(kind, model, { myTeam, bracket, chaser });
  if (!copy) return null;
  return <BannerFrame copy={copy} testid={BANNER_TESTID[kind]} className={`k-${kind}`} glow={copy.glow} />;
}

/**
 * The flag notice renders in the alert slot, inside `<Moments>`, where the bus weighs it against
 * the other alerts (§7 P5 WORK 2). `Hud.tsx` (frozen) still mounts it here; this mount draws nothing.
 */
export const FlagNotice = memo(function FlagNotice(_props: ZoneProps & { now: number }) {
  return null;
});

/** Every moment: the intro, the alert slot and the banner slot (or the countdown digit). */
export const Moments = memo(function Moments(_props: ZoneProps) {
  const view = useMomentView();
  const up = view.banner !== null;
  useLayoutEffect(() => { publishBannerUp(up); }, [up]);
  useLayoutEffect(() => () => publishBannerUp(false), []);
  const b = view.banner;
  return (
    <>
      {view.intro && <Intro leaving={view.intro === "out"} />}
      {view.alert && <Alert key={view.alert.key} item={view.alert} leaving={view.alertOut} />}
      {b ? (
        <div key={b.key} className={`moment-slot${view.bannerOut ? " out" : ""}`}>
          {b.kind === "roundEnd" || b.kind === "final"
            ? <RoundBannerLive model={view.model} winner={itemWinner(b)} />
            : <MomentBanner kind={b.kind} model={view.model} />}
        </div>
      ) : view.digit > 0 && <Digit n={view.digit} />}
    </>
  );
});
