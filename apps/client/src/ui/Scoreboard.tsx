import React from "react";
import { boysClass, MODES, TEAM_NAMES, parseHaircut, type GameMode } from "@frankibarber/shared";
import type { ScoreRow } from "../game/store";
import { OSTRZYZENI_SIDES } from "./resultText";

/**
 * A straight razor, drawn rather than spelled.
 *
 * There is no icon system in this UI — the kill feed is text and the only glyphs anywhere are perk
 * emoji — so this is a local SVG in `currentColor` rather than a new dependency or an emoji whose
 * shape is the operating system's opinion. It inherits the feed's colour, so a shave on your own
 * head is red and one you dealt is not, without a second rule.
 */
export function Razor({ className, title }: { className?: string; title?: string }): React.ReactElement {
  return (
    <svg className={className} viewBox="0 0 24 12" width="18" height="9" aria-hidden={title ? undefined : true} role={title ? "img" : undefined} focusable="false">
      {title && <title>{title}</title>}
      {/* Blade: a long flat wedge with a ground edge along the bottom. */}
      <path d="M1 3.2 L13.6 3.2 L15.2 5.4 L13.6 7.6 L1 7.6 Z" fill="currentColor" opacity="0.95" />
      <path d="M1 6.9 L13.9 6.9 L13.2 7.6 L1 7.6 Z" fill="#000" opacity="0.35" />
      {/* Pivot and handle, folded open behind the blade. */}
      <circle cx="16.1" cy="5.4" r="1.15" fill="currentColor" />
      <rect x="17" y="4.35" width="6.2" height="2.1" rx="1.05" fill="currentColor" opacity="0.75" />
    </svg>
  );
}

/**
 * A head in profile with the shot through it — the kill feed's headshot mark.
 *
 * It replaces a `\u2726` four-pointed star appended to the weapon's name, which said "headshot" only
 * to somebody who already knew. Drawn like `Razor`: local inline SVG in `currentColor`, so it takes
 * the feed row's colour (red on your own death, brass on your own kill) with no extra rule, and no
 * emoji whose shape is the operating system's opinion.
 */
export function HeadShot({ className, title }: { className?: string; title?: string }): React.ReactElement {
  return (
    <svg className={className} viewBox="0 0 20 16" width="16" height="13" aria-hidden={title ? undefined : true} role={title ? "img" : undefined} focusable="false">
      {title && <title>{title}</title>}
      {/* The shot comes in from the left and STOPS at the skull — drawn first and kept clear of it,
          because an arrow laid over the head reads as a bite out of it rather than a bullet. */}
      <path d="M0.8 5.6 L4.2 5.6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity="0.85" />
      <path d="M5.0 3.9 L7.4 5.6 L5.0 7.3 Z" fill="currentColor" />
      {/* Skull and jaw in profile, facing right, clear of the arrow's tip. */}
      <path d="M11.2 2.1 C14.4 1.2 17.9 3 18.1 6.1 C18.2 7.6 17.4 8.6 17.4 9.6 L17.4 11.2 L14.0 11.2 L14.0 13.4 L11.4 13.4 C10.2 13.4 9.5 12.7 9.5 11.6 L9.5 9.3 C8.7 8.4 8.3 7.3 8.4 6.1 C8.6 4.2 9.6 2.6 11.2 2.1 Z" fill="currentColor" opacity="0.95" />
      {/* Eye socket, so it reads as a head rather than a blob at 13 px. */}
      <circle cx="15.3" cy="6.3" r="1.35" fill="#000" opacity="0.55" />
    </svg>
  );
}

/** One scoreboard row (drop 5): K / D / A / shaves / $ / score / ping, a BOT tag, a dash for a bot's ping. */
function ScoreTr({ r, myId }: { r: ScoreRow; myId: string }) {
  const shaves = parseHaircut(r.haircut).shaves;
  return (
    <tr className={r.id === myId ? "me" : r.connected ? "" : "dc"} data-testid="sb-row" data-bot={r.bot ? "1" : "0"}>
      <td className="sb-name">{r.name}{r.boysClass && <span className="sb-bot">{boysClass(r.boysClass).name}</span>}{r.bot && <span className="sb-bot">BOT</span>}</td>
      <td>{r.kills}</td><td>{r.deaths}</td><td>{r.assists}</td>
      {/* Drop E: how many times this head has been done. A dot rather than a 0, so the column reads
          as "who got done" at a glance instead of as a wall of zeroes. */}
      <td className={`sb-shaved ${shaves > 0 ? "" : "none"}`} data-testid="sb-shaved">{shaves > 0 ? shaves : "·"}</td>
      <td className="sb-money">{r.money}</td><td>{r.score}</td><td>{r.bot ? "–" : r.ping}</td>
    </tr>
  );
}

/**
 * Best first. The FFA table always did this; a team table used to print the roster in the order
 * people joined, which reads fine at 6 v 6 and not at all once a deathmatch holds a crowd — the
 * name you are looking for is your own, and it should be near the top or near the bottom, not
 * somewhere in twenty rows of arrival order.
 */
const byKills = (a: ScoreRow, b: ScoreRow): number => b.kills - a.kills || a.deaths - b.deaths;

export function Scoreboard({ rows, myId, mode }: { rows: readonly ScoreRow[]; myId: string; mode: GameMode }) {
  if (!MODES[mode].teams) {
    // FFA (drop 4): one table, most kills first. Gun Game (drop D): highest rung first, the score column is the rung.
    const gun = mode === "gungame";
    const sorted = [...rows].sort((a, b) => (gun ? b.score - a.score || b.kills - a.kills : byKills(a, b)));
    return (
      <div className="scoreboard">
        <table className="sb-team ffa">
          <thead><tr><th className="sb-name">{MODES[mode].name}</th><th>K</th><th>D</th><th>A</th><th className="sb-shaved"><Razor title="OGOLONY" /></th><th>$</th><th>{gun ? "SZCZEBEL" : "PKT"}</th><th>PING</th></tr></thead>
          <tbody>
            {sorted.map((r) => <ScoreTr key={r.id} r={r} myId={myId} />)}
          </tbody>
        </table>
      </div>
    );
  }
  return (
    <div className="scoreboard">
      {[0, 1].map((team) => (
        <table key={team} className={`sb-team t${team}`}>
          <thead><tr><th className="sb-name">{(mode === "ostrzyzeni" ? OSTRZYZENI_SIDES : TEAM_NAMES)[team]}</th><th>K</th><th>D</th><th>A</th><th className="sb-shaved"><Razor title="OGOLONY" /></th><th>$</th><th>PKT</th><th>PING</th></tr></thead>
          <tbody>
            {rows.filter((r) => r.team === team).sort(byKills).map((r) => <ScoreTr key={r.id} r={r} myId={myId} />)}
          </tbody>
        </table>
      ))}
    </div>
  );
}
