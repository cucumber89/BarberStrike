import { useState } from "react";
import { HAIRCUTS } from "@frankibarber/shared";
import { skinById } from "@frankibarber/skins";
import { CRATE_CHALLENGES, openCrate, refreshDailyCrates, type Profile } from "../game/progression/profile";
import { uiSound } from "../game/audio";
export function Crates({ onProfile }: { onProfile(profile: Profile): void }) {
  const [profile, setProfile] = useState(() => refreshDailyCrates()); const [prize, setPrize] = useState(""); const [opening, setOpening] = useState(false);
  const open = () => { if (!profile.crates || opening) return; setOpening(true); uiSound("open"); setTimeout(() => { const result = openCrate(); if (!result) return setOpening(false); const name = result.prize.kind === "skin" ? skinById(result.prize.id)?.name : HAIRCUTS.find(h => h.id === result.prize.id)?.name; setPrize(`${result.prize.kind === "skin" ? "SKIN" : "FRYZURA"}: ${name}`); setProfile(result.profile); onProfile(result.profile); setOpening(false); }, 1800); };
  return <div className="crate-panel" data-testid="crates"><div className="crate-top"><div><b>SKRZYNKI</b><small>1 dziennie + nagrody za zadania</small></div><strong data-testid="crate-count">{profile.crates}</strong></div><div className={opening ? "crate-box opening" : "crate-box"}><span>BS</span><i /></div><button type="button" onClick={open} disabled={!profile.crates || opening} data-testid="crate-open">{opening ? "OTWIERANIE…" : "OTWÓRZ SKRZYNKĘ"}</button>{prize && <div className="crate-prize" data-testid="crate-prize">{prize}</div>}<div className="crate-tasks">{CRATE_CHALLENGES.map(t => { const n = Math.max(0, profile.life[t.stat] - profile.challengeBase[t.stat]); const done = profile.challengeClaims.includes(t.id); return <div key={t.id} className={done ? "done" : ""}><span>{t.label}</span><b>{done ? "ODEBRANO" : `${Math.min(n,t.target)}/${t.target}`}</b></div>; })}</div></div>;
}
