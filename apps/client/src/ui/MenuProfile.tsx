import { useEffect, useState } from "react";
import { HAIRCUTS, levelFor, titleFor } from "@frankibarber/shared";
import { equippedHaircut, loadProfile } from "../game/progression/profile";
import { useAccount } from "../net/account";
import "./menuProfile.css";

/**
 * The main menu's PROFIL card (Package U, owner's brief of 2026-09-27): a framed card on the right
 * of the title screen that says who you are and how far you have come.
 *
 * Nick, barber rank, level and the XP bar into the next one, the haircut you wear, how many skins
 * you own, and whether you are signed in — with a KONTO button, because the login state is the one
 * line here a player can act on. All of it reads what already exists: the local profile's lifetime
 * XP (`levelFor`/`titleFor`, shared), the wardrobe (`equippedHaircut`, `skins`) and the account
 * store. No new state on the wire, nothing gated (L1). The hall-of-fame list that used to sit in
 * this component is `MenuTable` now — the owner asked for two frames, not one.
 */
export function MenuProfile({ nick, onAccount }: { nick: string; onAccount?: () => void }) {
  const acct = useAccount();
  const [xp, setXp] = useState(0);
  const [skins, setSkins] = useState(0);

  // Re-read the local profile when the signed-in account changes (a migration may have just pulled it in).
  useEffect(() => {
    try { const p = loadProfile(); setXp(p.xp); setSkins(p.skins.length); } catch { setXp(0); setSkins(0); }
  }, [acct.account]);

  const lvl = levelFor(xp);
  const title = titleFor(lvl.level);
  const pct = lvl.need > 0 ? Math.min(100, Math.round((lvl.into / lvl.need) * 100)) : 100;
  const who = acct.account?.login || nick || "GOŚĆ";
  const cut = HAIRCUTS.find((h) => h.id === equippedHaircut())?.name ?? "—";

  return (
    <section className="mp-frame mp" data-testid="menu-profile" aria-label="Profil">
      <div className="mp-frame-head">
        <b>PROFIL</b>
        <span className={`mp-login ${acct.account ? "on" : ""}`} data-testid="mp-login">{acct.account ? "ZALOGOWANY" : "GOŚĆ"}</span>
      </div>
      <div className="mp-card" data-testid="mp-card">
        <div className="mp-badge" aria-hidden="true">{lvl.level}</div>
        <div className="mp-who">
          <b className="mp-nick" data-testid="mp-nick">{who}</b>
          <span className="mp-title" data-testid="mp-rank">{title}</span>
        </div>
        <div className="mp-xp">
          <div className="mp-xp-head">
            <span>POZIOM {lvl.level}</span>
            <span data-testid="mp-xp">{lvl.into} / {lvl.need} XP</span>
          </div>
          <div className="mp-bar"><i style={{ width: `${pct}%` }} data-testid="mp-xp-bar" /></div>
        </div>
      </div>
      <dl className="mp-facts">
        <div><dt>FRYZURA</dt><dd data-testid="mp-haircut">{cut}</dd></div>
        <div><dt>SKINY</dt><dd data-testid="mp-skins">{skins}</dd></div>
      </dl>
      {onAccount && (
        <button type="button" className="mm-btn small mp-account" onClick={onAccount} data-testid="mp-account">
          {acct.account ? "KONTO ▸" : "ZALOGUJ SIĘ ▸"}
        </button>
      )}
    </section>
  );
}
