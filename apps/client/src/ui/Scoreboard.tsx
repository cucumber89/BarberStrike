import React from "react";
import { boysClass, MODES, type GameMode, type Team } from "@frankibarber/shared";
import type { ScoreRow } from "../game/store";
import { IconSkull } from "./hud/icons";
import { money } from "./hud/format";
import { pairNames } from "./Bracket";
import { rankCompare, ranking, shavesOf, sideNames, splitColumns, type HistoryKind, type HistorySlot } from "./resultText";

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

/**
 * Drop U (P6): the table as CS2 draws it — one table per side, MY side first, the columns K A D ✂ $
 * PKT PING in that order, rows at t1 with tabular numerals, the dead at half strength with a skull,
 * and money only where CS2 shows it: my own side's (the enemy's wallet is not mine to read).
 */

/** Which rows, in which tables: my side and then theirs; one table where there are no sides. */
interface Table { key: string; cls: string; head: string; rows: ScoreRow[]; mine: boolean }

/** Best first: points, then kills (the table's order in every team mode, and the podium's). */
// The server's end-of-match order (resultText.rankCompare): FFA by kills then score, else score then kills.
const byScore = rankCompare("tdm");
const byKills = rankCompare("ffa");

function tablesOf(rows: readonly ScoreRow[], myId: string, myTeam: Team, mode: GameMode, bracket: string, split: boolean): Table[] {
  if (mode === "turniej") {
    // A tournament's sides are two PEOPLE: the pair on the board, and nobody else (the bystanders are
    // in the bracket below it). Once the draw is over there is no pair: everyone, by how far they got.
    const pair = pairNames(bracket);
    const on = pair ? pair.map((n) => rows.find((r) => r.name === n)).filter((r): r is ScoreRow => !!r) : [];
    const list = on.length ? on : ranking({ mode, winner: -1, winnerId: "", winnerName: "", myId, myTeam, scoreA: 0, scoreB: 0, players: rows, bracket }).map((x) => x.row);
    return [{ key: "pair", cls: "pair", head: "", rows: list, mine: false }];
  }
  if (!MODES[mode].teams) {
    const ranked = [...rows].sort(mode === "gungame" ? byScore : byKills);
    // A crowd side by side: the ranking reads down the left column, then down the right one.
    if (split && ranked.length > 1) return splitColumns(ranked).map((part, i) => ({ key: `all${i}`, cls: "ffa", head: "", rows: part, mine: false }));
    return [{ key: "all", cls: "ffa", head: "", rows: ranked, mine: false }];
  }
  const names = sideNames(mode);
  const side = (t: Team): Table => ({ key: `t${t}`, cls: `t${t} ${t === myTeam ? "mine" : "theirs"}`, head: names[t], rows: rows.filter((r) => r.team === t).sort(byScore), mine: t === myTeam });
  return [side(myTeam), side((1 - myTeam) as Team)];
}

/** One row: the name (a skull when down, the BOT tag), K A D, shaves, money on my side, points, ping. */
function ScoreTr({ r, myId, showMoney, moneyCol, live }: { r: ScoreRow; myId: string; showMoney: boolean; moneyCol: boolean; live: boolean }) {
  const shaves = shavesOf(r);
  const dead = live && r.connected && !r.alive;
  const cls = [r.id === myId ? "me" : "", r.connected ? "" : "dc", dead ? "dead" : ""].filter(Boolean).join(" ");
  return (
    <tr className={cls || undefined} data-testid="sb-row" data-bot={r.bot ? "1" : "0"}>
      <td className="sb-name">
        {dead && <IconSkull className="sb-skull" size={14} title="nie żyje" />}
        <span className="sb-nick">{r.name}</span>
        {r.boysClass ? <span className="sb-tag">{boysClass(r.boysClass).name}</span> : null}
        {r.bot && <span className="sb-tag">BOT</span>}
      </td>
      <td>{r.kills}</td><td>{r.assists}</td><td>{r.deaths}</td>
      {/* Drop E: how many times this head has been done. A dot rather than a 0, so the column reads
          as "who got done" at a glance instead of as a wall of zeroes. */}
      <td className={`sb-shaved ${shaves > 0 ? "" : "none"}`} data-testid="sb-shaved">{shaves > 0 ? shaves : "·"}</td>
      {moneyCol && <td className="sb-money">{showMoney ? money(r.money) : ""}</td>}
      <td className="sb-pts">{r.score}</td><td className="sb-ping">{r.bot ? "–" : r.ping}</td>
    </tr>
  );
}

export interface ScoreboardProps {
  rows: readonly ScoreRow[];
  myId: string;
  /** My side (my table first); the side of my own row when not given. */
  myTeam?: Team;
  mode: GameMode;
  /** The tournament's bracket ("" elsewhere): the pair on the board is the table. */
  bracket?: string;
  /** Mid-match: the dead are dimmed with a skull. The result card's table is not (the match is over). */
  live?: boolean;
  /**
   * The Tab board's densest layouts (`boardSplit`): the tables side by side, my side on the left —
   * a solo ranking in two columns — so a crowd fits the board without scrolling.
   */
  split?: boolean;
}

/** The tables: my side first, then theirs (`.sb-team` each, the class `multiplayer.spec.ts` counts). */
export function Scoreboard({ rows, myId, myTeam = rows.find((r) => r.id === myId)?.team ?? 0, mode, bracket = "", live = false, split = false }: ScoreboardProps) {
  const moneyCol = MODES[mode].shop !== "none";
  const gun = mode === "gungame";
  const tables = tablesOf(rows, myId, myTeam, mode, bracket, split);
  return (
    <div className={`sb-tables${split && tables.length > 1 ? " split" : ""}`}>
      {tables.map((t) => (
        <table key={t.key} className={`sb-team ${t.cls}`}>
          <thead>
            <tr>
              <th className="sb-name">{t.head}</th><th className="sb-n">K</th><th className="sb-n">A</th><th className="sb-n">D</th>
              <th className="sb-shaved"><Razor title="OGOLONY" /></th>
              {moneyCol && <th className="sb-money">$</th>}
              <th className="sb-pts">{gun ? "SZCZEBEL" : "PKT"}</th><th className="sb-ping">PING</th>
            </tr>
          </thead>
          <tbody>
            {t.rows.map((r) => (
              <ScoreTr key={r.id} r={r} myId={myId} moneyCol={moneyCol} live={live}
                showMoney={MODES[mode].teams && mode !== "turniej" ? t.mine : r.id === myId} />
            ))}
          </tbody>
        </table>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- the history strip's icons

/** ✹ The charge went off. */
function IconBurst({ size = 14 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden="true" focusable="false">
      <path d="M12 1.5l2.2 6.1 5.6-3.3-3.3 5.6 6.1 2.1-6.1 2.2 3.3 5.6-5.6-3.3L12 22.5l-2.2-6.1-5.6 3.3 3.3-5.6L1.5 12l6.1-2.1-3.3-5.6 5.6 3.3z" />
    </svg>
  );
}
/** ✂ The wire was cut. */
function IconCut({ size = 14 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true" focusable="false">
      <circle cx="6" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><path d="M8.5 7.8L21 18M8.5 16.2L21 6" />
    </svg>
  );
}
/** ⏱ The clock ran out. */
function IconClock({ size = 14 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true" focusable="false">
      <circle cx="12" cy="13.5" r="8" /><path d="M12 9v4.5l3 2M9.5 2.5h5" />
    </svg>
  );
}
const KIND_ICON: Record<HistoryKind, () => React.ReactElement> = {
  detonation: () => <IconBurst />,
  defuse: () => <IconCut />,
  elimination: () => <IconSkull size={14} />,
  time: () => <IconClock />,
};
const KIND_WORD: Record<HistoryKind, string> = { detonation: "wybuch", defuse: "rozbrojenie", elimination: "eliminacja", time: "czas" };

/**
 * The round history strip (`sb-history`): one 18 px slot a round, the reason's icon in the winner's
 * colour, a gap where the sides swap. Every word is in `aria-label`, none in the text: the strip is
 * read by its shapes, as in CS2.
 */
export function HistoryStrip({ slots, mode }: { slots: readonly HistorySlot[]; mode: GameMode }) {
  const names = sideNames(mode);
  return (
    <ol className="sb-history" data-testid="sb-history" aria-label="Historia rund">
      {slots.map((s) => (
        <li key={s.n} data-slot={s.n} data-reason={s.kind ?? undefined}
          className={["sb-slot", s.winner === null ? "empty" : s.winner === -1 ? "even" : `w${s.winner}`, s.now ? "now" : "", s.gapAfter ? "gap" : ""].filter(Boolean).join(" ")}
          aria-label={s.winner === null ? `Runda ${s.n}` : `Runda ${s.n}: ${s.winner === -1 ? "remis" : names[s.winner]} · ${s.kind ? KIND_WORD[s.kind] : ""}`}>
          {s.kind ? KIND_ICON[s.kind]() : null}
        </li>
      ))}
    </ol>
  );
}
