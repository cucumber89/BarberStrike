import { memo, useEffect, useReducer, useRef, useState, type ReactElement } from "react";
import { MODES, MatchPhase, convertsOnKill, type Team } from "@frankibarber/shared";
import { useHudSlice, type HudState } from "../../game/store";
import { BLINK_MS, CARD_IN_MS, CARD_OUT_MS, DEATH_BEAT_MS, spectating as watching } from "../../game/spectate";
import { standing } from "../Bracket";
import { SHOP_ART } from "../shopArt";
import { HeadShot } from "../Scoreboard";
import { DEATH_TEXT, deathCard, spectateBar, type Standing } from "./deathText";
import type { Moment } from "./phase";
import type { ZoneProps } from "./types";

/**
 * Drop U (P1): DEATH AS IN CS2 (docs/UI_U_SPEC.md §7 P1 (j), §5.2 rows 32–38 and 40, §6.1).
 *
 * The beat: a red vignette at once (the death cam drops and turns the view to the killer), the
 * killer card at +300 ms — who, with what, their HP, and in the round modes the damage both ways —
 * and at +5300 ms, in the round modes, the card folds into the spectate bar while the camera cuts
 * to a teammate's eye. A late joiner and a tournament bystander were never killed, so they get no
 * vignette and no killer: the bar alone, or the bracket's word above it.
 *
 * The zone (`death`) sits at `--hud-card-*`, bottom centre, clear of the aim point; the vignette is
 * a separate full-screen `veil`, never a parent of the words. In a break, at halftime and between
 * pairs there is no card and no bar (§4.5): the round's banner is the moment then. The veil stays
 * for the camera's cuts (the blink), with the red gone. In Ended there is nothing at all.
 */

/** §4.5: the moments the death zone does not exist in. */
const GONE: ReadonlySet<Moment> = new Set<Moment>(["break", "halftime", "betweenPairs", "ended"]);
/** §6.1: the card fades out in 160 ms, the vignette in 240. The zone waits for the longer one. */
const EXIT_MS = 240;

export const DeathCard = memo(function DeathCard({ model, now }: ZoneProps & { now: number }) {
  const dead = useHudSlice((s) => !s.alive && s.connected && s.phase !== MatchPhase.Ended);
  const up = dead && model.moment !== "ended";
  const zone = up && !GONE.has(model.moment);
  const leaving = useLeaving(up, EXIT_MS);
  const zoneLeaving = useLeaving(zone, EXIT_MS);
  const inBreak = model.moment === "break" || model.moment === "halftime";
  return up || leaving ? <DeathScreen now={now} out={!up} zone={zone || zoneLeaving} zoneOut={!zone} inBreak={inBreak} /> : null;
});

/**
 * Keeps a layer mounted `ms` after it closes, on the REAL clock (a timer), so the exit can play and
 * the layer then leaves the tree. `useKeepMounted` counts on `performance.now()`, which the gallery
 * pins; a break photographed there must show the card gone, not closing forever.
 */
function useLeaving(open: boolean, ms: number): boolean {
  const [leaving, setLeaving] = useState(false);
  const [was, setWas] = useState(open);
  if (was !== open) { setWas(open); setLeaving(!open); }
  useEffect(() => {
    if (!leaving) return;
    const id = window.setTimeout(() => setLeaving(false), ms);
    return () => window.clearTimeout(id);
  }, [leaving, ms]);
  return leaving;
}

/** Drop T: playing this pair, waiting for yours, or out — read off the bracket, not a new field. */
const standingOf = (h: HudState): Standing => {
  if (h.mode !== "turniej" || !h.bracket) return "";
  const myName = h.players.find((r) => r.id === h.myId)?.name ?? "";
  return standing(h.bracket, myName);
};

/** Re-renders once at local time `at` (a card edge), so the beat lands on time between 4 Hz ticks. */
function useWakeAt(at: number): void {
  const [, wake] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    const ms = at - performance.now();
    if (!(ms > 0) || !Number.isFinite(ms)) return;
    const id = window.setTimeout(wake, ms + 1);
    return () => window.clearTimeout(id);
  }, [at]);
}

/** The side a name is drawn in: its team, or "enemy" where nobody has one (FFA, gun game). */
const sideOf = (team: Team, teams: boolean): string => (teams ? String(team) : "enemy");

/** Everything one frame of the death screen draws, so a closing screen can keep its last frame. */
interface View {
  casualty: boolean; bystander: boolean; card: boolean; bar: boolean; lateJoin: boolean;
  c: ReturnType<typeof deathCard>; b: ReturnType<typeof spectateBar>;
  weapon: string; headshot: boolean; killerSide: string; targetSide: string; drain: number;
}

/**
 * `out`: the whole screen is leaving (the respawn). `zone`: the card/bar zone is mounted, and
 * `zoneOut`: it is leaving (the round ended). A leaving layer fades its LAST frame, it does not
 * redraw it — at the respawn the store already says "alive", and the card must not flicker into
 * something else on its way out.
 */
function DeathScreen({ now, out, zone, zoneOut, inBreak }: { now: number; out: boolean; zone: boolean; zoneOut: boolean; inBreak: boolean }) {
  const diedAt = useHudSlice((s) => s.diedAt);
  const killer = useHudSlice((s) => s.killer);
  const respawnAt = useHudSlice((s) => s.respawnAt);
  const lateJoin = useHudSlice((s) => s.lateJoin);
  const target = useHudSlice((s) => s.spectating);
  const mode = useHudSlice((s) => s.mode);
  const phase = useHudSlice((s) => s.phase);
  const tour = useHudSlice(standingOf);
  const targetTeam = useHudSlice((s) => (s.spectating ? s.players.find((r) => r.id === s.spectating!.id)?.team ?? -1 : -1));
  // Shaved already, or shaved by this very kill: the room converts on any clippers kill in a live
  // round (`convertsOnKill`), and my `shaved` only rides the next patch — the card may be up first.
  const clippers = useHudSlice((s) => s.mode === "ostrzyzeni" && (!!s.players.find((r) => r.id === s.myId)?.shaved
    || (!!s.killer && convertsOnKill(s.killer.weapon, false, s.phase === MatchPhase.Playing))));
  // The HUD clock ticks at 4 Hz; the card's two edges are woken for exactly.
  useWakeAt(diedAt + CARD_IN_MS);
  useWakeAt(diedAt + CARD_OUT_MS);
  useWakeAt(diedAt + DEATH_BEAT_MS);
  const last = useRef<View | null>(null);

  const t = Math.max(now, performance.now());
  const bystander = tour === "waiting" || tour === "out";
  const casualty = !lateJoin && !bystander;
  const bar = watching({ mode, phase, alive: false, respawnAt, diedAt, now: t, noCard: !casualty });
  // In a break the camera moves on after the death's own beat (`spectate.ts`), and the red with it.
  const specNow = bar || watching({ mode, phase, alive: false, respawnAt, diedAt, now: t, noCard: !casualty, inBreak });
  const frozen = (out || zoneOut) && last.current !== null;
  let v: View;
  if (frozen) v = last.current!;
  else {
    const teams = MODES[mode]?.teams ?? true;
    v = {
      casualty, bystander, bar, lateJoin,
      card: bystander || (casualty && t - diedAt >= CARD_IN_MS && !bar),
      c: deathCard({ killer, respawnAt, now: t, clippers, standing: tour }),
      b: spectateBar({ target, lateJoin, standing: tour }),
      weapon: killer?.weapon ?? "", headshot: !!killer?.headshot,
      killerSide: killer ? sideOf(killer.team, teams) : "",
      targetSide: targetTeam < 0 ? "enemy" : sideOf(targetTeam as Team, teams),
      drain: respawnAt > 0 ? drainOf(respawnAt, diedAt, t) : 0,
    };
    last.current = v;
  }
  // A cut to another player happens inside a black blink (§6.1): count the changes of target —
  // the camera follows the game's `spectating`, in the break too, where the card is gone.
  const blink = useBlink(target?.id ?? null);
  // The red is the death's own beat: gone once the bar takes over, in a break, and at the respawn.
  const red = !out && casualty && !specNow;
  const { c, b } = v;
  const Art = c.weapon ? (SHOP_ART as Record<string, (() => ReactElement) | undefined>)[v.weapon] : undefined;

  return (
    <>
      {(v.casualty || blink > 0) && (
        <div className={`death-veil${out ? " out" : ""}`} data-zone="veil" aria-hidden="true">
          <div className={`death-vignette${red ? "" : " off"}`} />
          {blink > 0 && <i key={blink} className="death-blink" />}
        </div>
      )}
      {zone && <div className={`death-zone${zoneOut ? " out" : ""}`} data-zone="death">
        {v.card && v.bystander && (
          <section className="death-card bystander" data-testid="death">
            <p className="death-title">{c.title}</p>
          </section>
        )}
        {v.card && !v.bystander && (
          <section className="death-card" data-testid="death">
            <div className="death-head">
              <p className="death-eyebrow">{c.eyebrow}</p>
              {c.weapon && (
                <div className="death-gun">
                  {Art && <span className="death-art" aria-hidden="true"><Art /></span>}
                  <span className="death-gun-name">{c.weapon}</span>
                  {v.headshot && <span className="death-hs" role="img" aria-label={DEATH_TEXT.headshot}><HeadShot /></span>}
                </div>
              )}
            </div>
            {c.nick && (
              <div className="death-killer">
                <span className="death-nick" data-side={v.killerSide}>{c.nick}</span>
                {c.hp && <span className="death-hp" data-testid="killer-hp"><b>{c.hp}</b> {DEATH_TEXT.hp}</span>}
              </div>
            )}
            {c.damage && <p className="death-damage" data-testid="killer-damage">{c.damage}</p>}
            {c.footer && <p className="death-foot">{c.footer}</p>}
            {c.live && (
              <div className="death-live">
                <p>{c.live}</p>
                <i className="death-track"><i className="death-drain" style={{ transform: `scaleX(${v.drain})` }} /></i>
              </div>
            )}
          </section>
        )}
        {v.bar && (
          <section className="death-bar" data-testid="spectate">
            <p className="spec-watch">
              {b.watch}
              {b.nick && <> <span className="spec-nick" data-side={v.targetSide}>{b.nick}</span></>}
              {b.hp && <> · <span className="spec-hp">{b.hp} {DEATH_TEXT.hp}</span></>}
            </p>
            <p className="spec-keys">
              <kbd>{DEATH_TEXT.keyNext}</kbd> {DEATH_TEXT.next} · <kbd>{DEATH_TEXT.keyPrev}</kbd> {DEATH_TEXT.prev}
            </p>
            {b.footer && <p className="spec-foot" data-testid={v.lateJoin ? "late-join" : undefined}>{b.footer}</p>}
          </section>
        )}
      </div>}
    </>
  );
}

/** The respawn bar's fill: 1 at the death, 0 at the respawn. */
function drainOf(respawnAt: number, diedAt: number, t: number): number {
  const span = respawnAt - diedAt;
  return span > 0 ? Math.max(0, Math.min(1, (respawnAt - t) / span)) : 0;
}

/** A counter that moves when the spectated id changes after mount (a cut), keying the blink. */
function useBlink(id: string | null): number {
  const last = useRef(id);
  const [n, setN] = useState(0);
  useEffect(() => {
    if (last.current === id) return;
    last.current = id;
    if (id !== null) setN((k) => k + 1);
  }, [id]);
  useEffect(() => {
    if (!n) return;
    const off = window.setTimeout(() => setN(0), BLINK_MS + 40);
    return () => window.clearTimeout(off);
  }, [n]);
  return n;
}
