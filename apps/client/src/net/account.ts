import { useSyncExternalStore } from "react";
import type { AccountDTO } from "@frankibarber/shared";

/**
 * The client's thin account store — drop V (P0).
 *
 * Same tiny external-store shape as `game/store.ts`. It holds only who is signed in (from
 * `GET /api/me`) and the transient auth-flow flags the sign-in panel needs. It does NOT own the
 * profile — that stays in `game/progression/profile.ts` (localStorage, with P6 branching the save to
 * the server). P4/P6 wire the REST calls; P0 provides the state and setters.
 */

export interface AccountState {
  /** The signed-in account, or null for a guest. */
  account: AccountDTO | null;
  /** True while a register/login/me request is in flight. */
  pending: boolean;
  /** The last auth error to show under the form, or "" for none. */
  error: string;
}

const initialAccount: AccountState = {
  account: null,
  pending: false,
  error: "",
};

type Listener = () => void;

class AccountStore {
  private state: AccountState = initialAccount;
  private listeners = new Set<Listener>();

  get = (): AccountState => this.state;

  set(patch: Partial<AccountState>): void {
    let changed = false;
    for (const k in patch) {
      const key = k as keyof AccountState;
      if (this.state[key] !== patch[key]) { changed = true; break; }
    }
    if (!changed) return;
    this.state = { ...this.state, ...patch };
    for (const l of this.listeners) l();
  }

  /** Set (or clear) who is signed in, and drop any stale pending/error. */
  setAccount(account: AccountDTO | null): void {
    this.set({ account, pending: false, error: "" });
  }

  /** Are we signed in? */
  isLoggedIn(): boolean {
    return this.state.account !== null;
  }

  reset(): void {
    this.state = initialAccount;
    for (const l of this.listeners) l();
  }

  subscribe = (l: Listener): (() => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };
}

export const account = new AccountStore();

export function useAccount(): AccountState {
  return useSyncExternalStore(account.subscribe, account.get, account.get);
}

export function useAccountSlice<T>(selector: (s: AccountState) => T): T {
  return useSyncExternalStore(account.subscribe, () => selector(account.get()), () => selector(account.get()));
}
