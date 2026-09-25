import { useEffect, useRef, useState } from "react";
import { isValidLogin } from "@frankibarber/shared";
import { account, useAccount } from "../net/account";
import { fetchMe, login as apiLogin, logout as apiLogout, migrate as apiMigrate, readError, register as apiRegister } from "../net/accountApi";
import { loadProfile, mergeServerProfile, saveProfile } from "../game/progression/profile";

/**
 * The account panel — drop V (P6): sign in, sign up, sign out, and the one-time migration banner.
 *
 * The panel owns the auth flow's transient state (which mode the form is in, whether the migration
 * banner should show); WHO is signed in lives in the `account` store so the rest of the app can read
 * it. Everything the server needs travels over `/api/*` through `net/accountApi.ts`; this file is UI.
 *
 * Migration: the moment a fresh sign-in lands on an EMPTY server profile while this browser holds a
 * local `bs_profile_v1`, the "Przenieś postępy?" banner offers to push the local progress up. A
 * server that already has progress (409) never sees the local blob — the contract is server-wins,
 * so a second device cannot overwrite the cloud.
 */

type Mode = "login" | "register";

/** True when the local profile has anything worth migrating (any XP, badges, skins or history). */
function localProfileHasProgress(): boolean {
  try {
    const p = loadProfile();
    return p.xp > 0 || p.life.matches > 0 || p.badges.length > 0 || p.skins.length > 0 || p.tournaments.length > 0;
  } catch {
    return false;
  }
}

export function Account() {
  const { account: who, pending, error } = useAccount();
  const [mode, setMode] = useState<Mode>("login");
  const [login, setLogin] = useState("");
  const [pass, setPass] = useState("");
  const [migrateShown, setMigrateShown] = useState(false);
  const loginRef = useRef<HTMLInputElement>(null);

  const loginOk = isValidLogin(login.trim());
  const passOk = pass.length >= 6;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pending || !loginOk || !passOk) return;
    account.set({ pending: true, error: "" });
    try {
      const dto = mode === "register"
        ? await apiRegister(login.trim(), pass)
        : await apiLogin(login.trim(), pass);
      account.setAccount(dto);
      setPass("");
      // The server's profile is now the source of truth; pull it and adopt it locally so the rest
      // of the app reads one shape. If it comes back empty AND we have local progress, offer to
      // migrate rather than silently starting fresh.
      const fresh = await fetchMe();
      const serverEmpty = !fresh?.profile || (fresh.profile.xp === 0 && fresh.profile.life.matches === 0 && fresh.profile.skins.length === 0);
      if (fresh?.profile && !serverEmpty) {
        mergeServerProfile(fresh.profile);
        setMigrateShown(false);
      } else {
        setMigrateShown(localProfileHasProgress());
      }
    } catch (err) {
      account.set({ pending: false, error: readError(err) });
    }
  };

  const doMigrate = async () => {
    account.set({ pending: true, error: "" });
    try {
      await apiMigrate(loadProfile());
      // From here the local profile keeps saving up to the server on its own (profile.ts branch).
      setMigrateShown(false);
      account.set({ pending: false, error: "" });
    } catch (err) {
      // A 409 means the server already had progress — not a failure to surface as a red error; just
      // close the banner and keep the server's copy.
      setMigrateShown(false);
      account.set({ pending: false, error: readError(err) });
    }
  };

  const skipMigrate = () => setMigrateShown(false);

  const doLogout = async () => {
    account.set({ pending: true, error: "" });
    try {
      await apiLogout();
    } catch {
      /* even if the network call fails, drop the local view of the session */
    }
    account.setAccount(null);
    setMigrateShown(false);
    saveProfile(loadProfile()); // re-save under the guest branch (localStorage only) — harmless.
  };

  useEffect(() => {
    if (!who) loginRef.current?.focus();
  }, [who]);

  // --- Signed in ---------------------------------------------------------------------------------
  if (who) {
    return (
      <section className="acc-panel" data-testid="account-panel">
        <div className="acc-who" data-testid="account-who">
          <span className="acc-badge">✓</span>
          <b>{who.login}</b>
          <em>zalogowano</em>
        </div>
        {migrateShown && (
          <div className="acc-migrate" data-testid="account-migrate">
            <p>Przenieść dotychczasowe postępy z tej przeglądarki na konto?</p>
            <div className="acc-migrate-row">
              <button type="button" className="mm-btn small primary" onClick={() => void doMigrate()} disabled={pending} data-testid="migrate-yes">
                PRZENIEŚ
              </button>
              <button type="button" className="mm-btn small" onClick={skipMigrate} disabled={pending} data-testid="migrate-no">
                NIE, DZIĘKUJĘ
              </button>
            </div>
          </div>
        )}
        {error && <div className="acc-error" role="alert" data-testid="account-error">{error}</div>}
        <button type="button" className="mm-btn small" onClick={() => void doLogout()} disabled={pending} data-testid="account-logout">
          WYLOGUJ
        </button>
      </section>
    );
  }

  // --- Guest -------------------------------------------------------------------------------------
  return (
    <section className="acc-panel" data-testid="account-panel">
      <div className="acc-tabs">
        <button type="button" className={mode === "login" ? "active" : ""} onClick={() => { setMode("login"); account.set({ error: "" }); }}>
          LOGOWANIE
        </button>
        <button type="button" className={mode === "register" ? "active" : ""} onClick={() => { setMode("register"); account.set({ error: "" }); }}>
          NOWE KONTO
        </button>
      </div>
      <form className="acc-form" onSubmit={(e) => void submit(e)}>
        <label className="acc-field">
          <span>Ksywka</span>
          <input
            ref={loginRef} type="text" autoComplete="username" spellCheck={false} maxLength={20}
            value={login} onChange={(e) => setLogin(e.target.value.toLowerCase())}
            placeholder="małe litery, cyfry, _" data-testid="account-login"
          />
        </label>
        <label className="acc-field">
          <span>Hasło</span>
          <input
            type="password" autoComplete={mode === "register" ? "new-password" : "current-password"}
            value={pass} onChange={(e) => setPass(e.target.value)}
            placeholder="min. 6 znaków" data-testid="account-pass"
          />
        </label>
        {error && <div className="acc-error" role="alert" data-testid="account-error">{error}</div>}
        <button type="submit" className="mm-btn primary" disabled={pending || !loginOk || !passOk} data-testid="account-submit">
          {pending ? "…" : mode === "register" ? "ZAŁÓŻ KONTO" : "ZALOGUJ"}
        </button>
      </form>
      <p className="acc-guest" data-testid="account-guest-hint">
        Grasz jako gość — postępy zostają tylko w tej przeglądarce. Załóż konto, żeby zabrać je ze sobą.
      </p>
    </section>
  );
}
