import { useCallback, useEffect, useMemo, useState } from "react";
import type { TournamentRecord, Trophy } from "@frankibarber/shared";
import { fetchTournaments, fetchTrophies } from "../net/accountApi";

/**
 * `/stats` — the hall of fame. Drop V (P6).
 *
 * Its own page, like `/viewer`: it reads two public REST endpoints and needs none of the match/menu
 * machinery. `GET /api/tournaments` fills the champions table (`hof-row` per finished tournament);
 * clicking a champion loads their trophies (`GET /api/trophies?login=`) into the side shelf
 * (`trophy-item` per trophy). Everything is read-only and public — no sign-in required to look.
 */

const fmtDate = (ms: number): string => {
  if (!Number.isFinite(ms) || ms <= 0) return "—";
  try {
    return new Date(ms).toLocaleDateString("pl-PL", { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return "—";
  }
};

const placeLabel = (place: number): string =>
  place === 1 ? "MISTRZ" : place === 2 ? "FINALISTA" : place <= 4 ? "PÓŁFINAŁ" : `MIEJSCE ${place}`;

export function Hall() {
  const [rows, setRows] = useState<TournamentRecord[] | null>(null);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [trophies, setTrophies] = useState<Trophy[] | null>(null);

  const load = useCallback(async () => {
    setError("");
    const list = await fetchTournaments(50);
    setRows(list);
    if (!list.length) setError("Jeszcze nikt nie wygrał turnieju. Bądź pierwszy.");
  }, []);

  useEffect(() => { void load(); }, [load]);

  const pick = useCallback(async (login: string) => {
    setSelected(login);
    setTrophies(null);
    setTrophies(await fetchTrophies(login));
  }, []);

  // The champions, newest first — the server orders them, but a defensive sort keeps the page honest
  // if it ever does not.
  const champions = useMemo(() => [...(rows ?? [])].sort((a, b) => b.endedAt - a.endedAt), [rows]);

  return (
    <div className="hall" data-testid="hall-of-fame">
      <header className="hall-head">
        <a className="hall-back" href="/">◂ BARBERSTRIKE</a>
        <h1 className="hall-title">TABLICA SŁAWY</h1>
        <p className="hall-sub">Mistrzowie turniejów w salonie. Kliknij zwycięzcę, żeby zobaczyć jego trofea.</p>
      </header>

      {error && <div className="hall-notice" role="status">{error}</div>}

      <div className="hall-grid">
        <section className="hall-col">
          <h2 className="hall-col-h">TURNIEJE ({champions.length})</h2>
          <div className="hall-list">
            {rows === null && <div className="hall-empty">Wczytuję…</div>}
            {champions.map((t) => (
              <button
                type="button" key={t.id} className={`hof-row ${selected === t.winner ? "on" : ""}`}
                data-testid="hof-row" onClick={() => void pick(t.winner)}
                title={`Trofea: ${t.winner}`}
              >
                <span className="hof-crown" aria-hidden="true">♛</span>
                <span className="hof-winner">{t.winner || "gość"}</span>
                <span className="hof-size">{t.size} osób</span>
                <span className="hof-date">{fmtDate(t.endedAt)}</span>
              </button>
            ))}
          </div>
        </section>

        <aside className="hall-col hall-trophies">
          <h2 className="hall-col-h">{selected ? `TROFEA — ${selected}` : "TROFEA"}</h2>
          {!selected && <div className="hall-empty">Wybierz zwycięzcę z listy.</div>}
          {selected && trophies === null && <div className="hall-empty">Wczytuję…</div>}
          {selected && trophies !== null && trophies.length === 0 && (
            <div className="hall-empty">Brak zapisanych trofeów (mistrz grał jako gość).</div>
          )}
          <div className="hall-list">
            {(trophies ?? []).map((tr, i) => (
              <div className="trophy-item" key={`${tr.tournamentId}-${i}`} data-testid="trophy-item">
                <span className="trophy-medal" aria-hidden="true">{tr.place === 1 ? "🏆" : "🎖"}</span>
                <span className="trophy-place">{placeLabel(tr.place)}</span>
                <span className="trophy-date">{fmtDate(tr.awardedAt)}</span>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}
