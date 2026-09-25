import React, { memo, useEffect, useReducer } from "react";
import { MODES, killerName } from "@frankibarber/shared";
import { useHudSlice, type KillFeedEntry } from "../../game/store";
import { HeadShot, Razor } from "../Scoreboard";
import { SHOP_ART } from "../shopArt";
import type { ZoneProps } from "./types";

/**
 * Drop U, P4 (docs/UI_U_SPEC.md §7 P4 WORK 3, §4.2): the kill feed, top right (zone `feed`), as
 * CS2 draws it — „killer + assist ⌐╦ ✹ victim”, one plated row per kill:
 * - at most 5 rows, in a column exactly `--hud-feed-w` wide (460 / 320 / 195.5 px at 1600 / 1280 /
 *   1024), so it keeps 16 px from the strip and 12 px from the banner by construction (§3.6);
 * - the weapon is its silhouette (`SHOP_ART`), the headshot and the shave are icons, so a row is at
 *   most three words: two nicks and one assist (§5.1). Nicks keep their own case. A row is always
 *   one 30 px line, so five rows are 166 px at every width (§4.2); a row too wide for the column
 *   shares the room fairly between its nicks (`Row`, corners.css);
 * - a 1 px brass rule when I am the killer, 1 px red when I am the victim;
 * - a row slides in over 160 ms and fades over its last 400 ms (§6.1 "Kill feed row"). The store
 *   drops a row at 6000 ms (`Game.syncHud`); the fade is started by a timer, not by a 6-second CSS
 *   animation, so nothing in the zone runs longer than the gallery's 600 ms (Principle 11).
 */

/** Rows on screen at once (§4.2: ≤ 5 rows × 30 + 4). */
const MAX_ROWS = 5;
/** A row's life in the store (`Game.ts`, `now - k.at < 6000`) and its fade at the end of it. */
const ROW_LIFE_MS = 6_000;
const ROW_FADE_MS = 400;

function Gun({ weapon }: { weapon: string }) {
  const Draw = (SHOP_ART as Record<string, (() => React.ReactElement) | undefined>)[weapon];
  return Draw ? <span className="kf-art"><Draw /></span> : <span className="kf-art-name">{killerName(weapon).split(" ")[0]}</span>;
}

/**
 * One row, one line: „killer + assist ⌐╦ ✹ victim”. The halves (`kf-who`, `kf-what`) are kept in the
 * DOM for the selectors that name them, but corners.css flattens them (display: contents) so the
 * names and the weapon are the columns of one grid line. When the row fits it is whole — every
 * gallery row at 1600 and 1280. When it does not (the 195.5 px column at 1024 holds about 180 px of
 * row), the names share what the weapon leaves in equal parts, each stopping at its own width: a
 * short name stays whole, the long ones end in „…”. The weapon never shrinks. The row never wraps,
 * so the zone keeps its §4.2 box (≤ 5 rows × 30 + 4, 166 px) on every screen.
 */
function Row({ k, myId, teams, out }: { k: KillFeedEntry; myId: string; teams: boolean; out: boolean }) {
  const self = k.killer === k.victim;
  const side = (t: number) => (teams ? `t${t}` : "ffa");
  const assist = k.assists?.[0];
  return (
    <li className="kf-row" data-me={k.killer === myId && !self ? "killer" : k.victim === myId ? "victim" : undefined} data-out={out || undefined}>
      {!self && (
        <span className="kf-who">
          <span className={`kf-nick kf-killer ${side(k.killerTeam)}`}>{k.killerName}</span>
          {assist && <span className={`kf-assist ${side(k.killerTeam)}`}><span className="kf-plus">+</span> {assist}</span>}
        </span>
      )}
      <span className="kf-what">
        <span className="kf-weapon" role="img" aria-label={k.shave ? "OGOLENIE" : `${killerName(k.weapon)}${k.headshot ? " · W GŁOWĘ" : ""}`}>
          {k.shave ? <Razor className="kf-razor" /> : <Gun weapon={k.weapon} />}
          {k.headshot && !k.shave ? <HeadShot className="kf-head" /> : null}
        </span>
        <span className={`kf-nick kf-victim ${side(k.victimTeam)}`}>{k.victimName}</span>
      </span>
    </li>
  );
}

export const KillFeed = memo(function KillFeed(_props: ZoneProps) {
  const killFeed = useHudSlice((s) => s.killFeed);
  const myId = useHudSlice((s) => s.myId);
  const teams = useHudSlice((s) => MODES[s.mode].teams);
  const rows = killFeed.slice(-MAX_ROWS);
  const now = performance.now();
  const fadeAt = ROW_LIFE_MS - ROW_FADE_MS;
  // The next row to start its fade: one timer for the column, re-armed on every render.
  const next = rows.reduce((m, k) => { const d = k.at + fadeAt - now; return d > 0 && d < m ? d : m; }, Infinity);
  const [, wake] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    if (!Number.isFinite(next)) return;
    const t = window.setTimeout(wake, Math.max(16, next));
    return () => window.clearTimeout(t);
  }, [next]);
  return (
    <ul className="feed" data-zone="feed" data-testid="killfeed">
      {rows.map((k) => <Row key={k.key} k={k} myId={myId} teams={!!teams} out={now - k.at >= fadeAt} />)}
    </ul>
  );
});
