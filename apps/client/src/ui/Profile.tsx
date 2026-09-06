import { useRef, useState } from "react";
import { BADGES, MODES, TITLES, dailyChallenges, dailyProgress, dayKey, levelFor, titleFor, totalWeaponKills, xpToNext } from "@frankibarber/shared";
import { clearProfile, repairProfile, saveProfile, type Profile } from "../game/progression/profile";
import { uiSound } from "../game/audio";

/** Level, title and the bar to the next one. Used at the top of the profile and, compact, on the main screen. */
export function LevelCard({ profile, compact }: { profile: Profile; compact?: boolean }) {
  const l = levelFor(profile.xp);
  const pct = Math.round((l.into / Math.max(1, l.need)) * 100);
  const next = TITLES.find((t) => t.from > l.level);
  return (
    <div className={`level-card ${compact ? "compact" : ""}`} data-testid="level-card">
      <div className="level-num">{l.level}</div>
      <div className="level-body">
        <div className="level-title">{titleFor(l.level)}</div>
        <div className="summary-bar"><div className="summary-bar-fill" style={{ width: `${pct}%` }} /></div>
        <div className="level-xp">{l.into} / {l.need} XP{!compact && next ? ` · ${next.name} at level ${next.from}` : ""}</div>
      </div>
    </div>
  );
}

/** Today's three, with progress. On the main screen and in the profile. */
export function DailyChallenges({ profile }: { profile: Profile }) {
  const day = dayKey();
  return (
    <div className="daily" data-testid="daily">
      <div className="daily-head">TODAY'S CHALLENGES <span className="muted">{day}</span></div>
      {dailyChallenges(day).map((c) => {
        const p = dailyProgress(profile.daily, day, c);
        const pct = Math.round((p.have / c.goal) * 100);
        return (
          <div className={`daily-row ${p.done ? "done" : ""}`} key={c.id} data-testid={`daily-${c.id}`}>
            <span className="daily-text">{c.text}</span>
            <span className="daily-xp">+{c.xp} XP</span>
            <span className="daily-track"><span className="daily-fill" style={{ width: `${pct}%` }} /></span>
            <span className="daily-count">{p.done ? "DONE" : `${p.have} / ${c.goal}`}</span>
          </div>
        );
      })}
    </div>
  );
}

const fmtDate = (ms: number) => new Date(ms).toLocaleString(undefined, { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const ratio = (a: number, b: number) => (b === 0 ? (a === 0 ? "0.00" : a.toFixed(2)) : (a / b).toFixed(2));
const pctOf = (a: number, b: number) => (b === 0 ? "—" : `${Math.round((a / b) * 100)}%`);

/**
 * The profile page (2.1): what the game remembers about you. Everything on it is local (see
 * profile.ts), which the page says out loud and gives an export for.
 */
export function ProfilePanel({ profile, onChange }: { profile: Profile; onChange: (p: Profile) => void }) {
  const life = profile.life;
  const earned = new Set(profile.badges);
  const [note, setNote] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);

  const exportProfile = () => {
    try {
      const blob = new Blob([JSON.stringify(profile, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `barberstrike-profile-${dayKey()}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      setNote("Profile saved as a file.");
    } catch { setNote("Could not save the file in this browser."); }
  };
  const importProfile = async (f: File | undefined) => {
    if (!f) return;
    try {
      const p = repairProfile(JSON.parse(await f.text()));
      if (!window.confirm(`Replace your profile with this one? (level ${levelFor(p.xp).level}, ${p.life.matches} matches)`)) return;
      saveProfile(p);
      onChange(p);
      setNote("Profile imported.");
    } catch { setNote("That file is not a BARBERSTRIKE profile."); }
  };
  const reset = () => {
    if (!window.confirm("Reset ALL progress — level, badges, mastery, challenges? This cannot be undone.")) return;
    clearProfile();
    onChange(repairProfile(null));
    setNote("Progress reset.");
  };

  const stats: [string, string][] = [
    ["MATCHES", `${life.matches}`], ["WINS", `${life.wins} · ${pctOf(life.wins, life.matches)}`], ["KILLS", `${life.kills}`], ["DEATHS", `${life.deaths}`],
    ["K/D", ratio(life.kills, life.deaths)], ["HEAD SHOTS", `${life.headshots} · ${pctOf(life.headshots, life.kills)}`], ["ASSISTS", `${life.assists}`], ["BEST MATCH", `${life.bestKills} kills`],
    ["CAPTURES", `${life.captures}`], ["CLIPPER KILLS", `${life.clipperKills}`], ["FLAWLESS", `${life.flawless}`], ["ROUNDS SURVIVED", `${life.wavesSurvived}`],
    ["WEAPON KILLS", `${totalWeaponKills(profile.weapons)}`], ["TOTAL XP", `${profile.xp}`], ["NEXT LEVEL", `${xpToNext(levelFor(profile.xp).level) - levelFor(profile.xp).into} XP`], ["BADGES", `${earned.size} / ${BADGES.length}`],
  ];

  return (
    <div className="profile" data-testid="profile">
      <LevelCard profile={profile} />
      <h3>LIFETIME</h3>
      <div className="stat-grid">
        {stats.map(([k, v]) => <div className="stat" key={k}><span>{k}</span><b>{v}</b></div>)}
      </div>
      <h3>BADGES <span className="shop-hint">{earned.size} of {BADGES.length}</span></h3>
      <div className="badges">
        {BADGES.map((b) => (
          <div className={`badge ${earned.has(b.id) ? "earned" : "locked"}`} key={b.id} data-testid={`badge-${b.id}`} title={b.blurb}>
            <b>{b.name}</b><span>{b.blurb}</span>
          </div>
        ))}
      </div>
      <DailyChallenges profile={profile} />
      <h3>RECENT MATCHES</h3>
      {profile.recent.length === 0
        ? <p className="muted">Nothing yet. The first match is the one that counts.</p>
        : (
          <table className="recent">
            <thead><tr><th>WHEN</th><th>MODE</th><th>K</th><th>D</th><th>A</th><th>RESULT</th><th>XP</th></tr></thead>
            <tbody>
              {profile.recent.map((m) => (
                <tr key={m.at} className={m.result === 1 ? "win" : m.result === -1 ? "loss" : ""}>
                  <td>{fmtDate(m.at)}</td><td>{MODES[m.mode]?.short ?? m.mode}</td><td>{m.kills}</td><td>{m.deaths}</td><td>{m.assists}</td>
                  <td>{m.result === 1 ? "WIN" : m.result === -1 ? "LOSS" : "DRAW"}</td><td>+{m.xp}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      <h3>YOUR DATA</h3>
      <p className="muted small">The profile lives in this browser only — no account, nothing sent anywhere. Save it as a file to carry it to another computer.</p>
      <div className="row wrap">
        <button type="button" className="menu-btn small" onClick={() => { uiSound("click"); exportProfile(); }}>SAVE TO FILE</button>
        <button type="button" className="menu-btn small" onClick={() => { uiSound("click"); file.current?.click(); }}>LOAD FROM FILE</button>
        <input ref={file} type="file" accept="application/json" hidden onChange={(e) => { void importProfile(e.target.files?.[0]); e.target.value = ""; }} />
        <button type="button" className="menu-btn small danger" onClick={() => { uiSound("click"); reset(); }} data-testid="profile-reset">RESET PROGRESS</button>
      </div>
      {note && <div className="notice" role="status">{note}</div>}
    </div>
  );
}
