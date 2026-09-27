import { useEffect, useState } from "react";
import type { TournamentRecord } from "@frankibarber/shared";
import { fetchTournaments } from "../net/accountApi";
import "./menuProfile.css";

/**
 * The main menu's TABELA card (Package U, owner's brief of 2026-09-27): the top of the hall of fame
 * as a framed card under the profile, on the right of the title screen.
 *
 * It is the first `TOP` rows of the same public list `/stats` draws (`GET /api/tournaments`, via the
 * one API client in `net/accountApi`) — place, champion, draw size, date — and a link to the full
 * table. It used to be a `mp-top` list inside `MenuProfile`; it is its own card now because the
 * owner asked for two frames on the right (profile, table), and a card that fetches its own rows
 * can be dropped anywhere without dragging the profile along. Read-only, nothing gated (L1).
 */
const TOP = 8;

/** `12 wrz` — a date that fits a 300 px column next to a nickname. */
const shortDate = (ms: number): string => {
  if (!Number.isFinite(ms) || ms <= 0) return "—";
  try { return new Date(ms).toLocaleDateString("pl-PL", { month: "short", day: "numeric" }); } catch { return "—"; }
};

export function MenuTable() {
  const [rows, setRows] = useState<TournamentRecord[] | null>(null);

  useEffect(() => {
    let on = true;
    void fetchTournaments(TOP).then((t) => { if (on) setRows(t.slice(0, TOP)); });
    return () => { on = false; };
  }, []);

  return (
    <section className="mp-frame mp-top" data-testid="menu-top" aria-label="Tabela">
      <div className="mp-frame-head">
        <b>TABELA</b>
        <span className="mp-frame-sub">MISTRZOWIE TURNIEJÓW</span>
        <a href="/stats" data-testid="mp-top-more">PEŁNA TABELA ▸</a>
      </div>
      <ol className="mp-top-list">
        {rows === null && <li className="mp-top-empty">Ładowanie…</li>}
        {rows !== null && rows.length === 0 && (
          <li className="mp-top-empty" data-testid="mp-top-empty">Jeszcze nikt nie wygrał turnieju. Bądź pierwszy.</li>
        )}
        {(rows ?? []).map((t, i) => (
          <li key={t.id} className={i === 0 ? "first" : ""} data-testid="mp-top-row">
            <span className="mp-top-i">{i + 1}</span>
            <b className="mp-top-name">{i === 0 && <i aria-hidden="true">♛ </i>}{t.winner || "gość"}</b>
            <span className="mp-top-size">{t.size} os.</span>
            <span className="mp-top-date">{shortDate(t.endedAt)}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
