import { useEffect, useState } from "react";
import { levelFor, titleFor, type TournamentRecord } from "@frankibarber/shared";
import { loadProfile } from "../game/progression/profile";
import { useAccount } from "../net/account";
import { fetchTournaments } from "../net/accountApi";
import "./menuProfile.css";

/**
 * The main-menu profile card and a mini hall of fame (owner's follow-up).
 *
 * The card says who you are and how far you have come — nick, barber rank, level and the XP bar into
 * the next one; the top list beside it is the newest tournament champions, a nudge to go win one. All
 * of it reads what already exists: the local profile's lifetime XP (`levelFor`/`titleFor`, shared)
 * and the public hall of fame (`GET /api/tournaments`). No new state on the wire, nothing gated (L1).
 */
export function MenuProfile({ nick }: { nick: string }) {
  const acct = useAccount();
  const [xp, setXp] = useState(0);
  const [champs, setChamps] = useState<TournamentRecord[] | null>(null);

  // Re-read the local XP when the signed-in account changes (a migration may have just pulled it in).
  useEffect(() => { try { setXp(loadProfile().xp); } catch { setXp(0); } }, [acct.account]);
  useEffect(() => {
    let on = true;
    void fetchTournaments(5).then((t) => { if (on) setChamps(t); });
    return () => { on = false; };
  }, []);

  const lvl = levelFor(xp);
  const title = titleFor(lvl.level);
  const pct = lvl.need > 0 ? Math.min(100, Math.round((lvl.into / lvl.need) * 100)) : 100;
  const who = acct.account?.login || nick || "GOŚĆ";

  return (
    <div className="mp" data-testid="menu-profile">
      <div className="mp-card" data-testid="mp-card">
        <div className="mp-badge" aria-hidden="true">{lvl.level}</div>
        <div className="mp-who">
          <b className="mp-nick" data-testid="mp-nick">{who}</b>
          <span className="mp-title" data-testid="mp-rank">{title}{acct.account ? "" : " · gość"}</span>
        </div>
        <div className="mp-xp">
          <div className="mp-xp-head">
            <span>POZIOM {lvl.level}</span>
            <span data-testid="mp-xp">{lvl.into} / {lvl.need} XP</span>
          </div>
          <div className="mp-bar"><i style={{ width: `${pct}%` }} data-testid="mp-xp-bar" /></div>
        </div>
      </div>

      <div className="mp-top" data-testid="menu-top">
        <div className="mp-top-head"><b>TABLICA SŁAWY</b><a href="/stats" data-testid="mp-top-more">więcej ▸</a></div>
        <ol className="mp-top-list">
          {champs === null && <li className="mp-top-empty">Ładowanie…</li>}
          {champs !== null && champs.length === 0 && (
            <li className="mp-top-empty" data-testid="mp-top-empty">Jeszcze nikt nie wygrał turnieju.</li>
          )}
          {(champs ?? []).map((t, i) => (
            <li key={t.id} data-testid="mp-top-row">
              <span className="mp-top-i">{i + 1}</span>
              <b className="mp-top-name">{t.winner || "gość"}</b>
              <span className="mp-top-size">{t.size} os.</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
