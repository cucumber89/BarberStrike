import { useSyncExternalStore } from "react";

/**
 * Drop U: the HUD's own UI flags — which overlay is up, whether a banner holds the screen, and
 * whether the match is being entered. Not game state, so not the game store: these are written by
 * HUD components (the scoreboard sets `overlay.tab`, the moment bus sets `bannerUp`, the fade sets
 * `entering`) and read by the zones that must hide or wait for them (§4.5, §6.5).
 *
 * Writes notify synchronously; a write that changes nothing notifies nobody, and the snapshot
 * object is replaced only when a value really changed, so `useUiFlags` never loops.
 *
 * Owned by P0 and frozen for the drop (docs/UI_U_SPEC.md §7.0).
 */

export interface UiOverlay {
  /** Tab held: the scoreboard is up (P6). */
  readonly tab: boolean;
  /** The shop card is open (P7). */
  readonly shop: boolean;
  /** The ESC column is open (P7). */
  readonly pause: boolean;
}

export interface UiFlags {
  readonly overlay: UiOverlay;
  /** A banner holds the screen: alerts except reconnect wait, the action slot shows only my bar (P5). */
  readonly bannerUp: boolean;
  /** The loading → match fade is leaving: the zones run their enter stagger (P7). */
  readonly entering: boolean;
}

export interface UiFlagsPatch {
  overlay?: Partial<UiOverlay>;
  bannerUp?: boolean;
  entering?: boolean;
}

const NO_OVERLAY: UiOverlay = Object.freeze({ tab: false, shop: false, pause: false });
export const initialUiFlags: UiFlags = Object.freeze({ overlay: NO_OVERLAY, bannerUp: false, entering: false });

type Listener = () => void;

class UiFlagsStore {
  private state: UiFlags = initialUiFlags;
  private listeners = new Set<Listener>();

  get = (): UiFlags => this.state;

  set(patch: UiFlagsPatch): void {
    const cur = this.state;
    const o = patch.overlay;
    const overlay = o && ((o.tab ?? cur.overlay.tab) !== cur.overlay.tab || (o.shop ?? cur.overlay.shop) !== cur.overlay.shop || (o.pause ?? cur.overlay.pause) !== cur.overlay.pause)
      ? Object.freeze({ ...cur.overlay, ...o })
      : cur.overlay;
    const bannerUp = patch.bannerUp ?? cur.bannerUp;
    const entering = patch.entering ?? cur.entering;
    if (overlay === cur.overlay && bannerUp === cur.bannerUp && entering === cur.entering) return;
    this.state = Object.freeze({ overlay, bannerUp, entering });
    for (const l of this.listeners) l();
  }

  reset(): void {
    if (this.state === initialUiFlags) return;
    this.state = initialUiFlags;
    for (const l of this.listeners) l();
  }

  subscribe = (l: Listener): (() => void) => {
    this.listeners.add(l);
    return () => { this.listeners.delete(l); };
  };
}

export const uiFlags = new UiFlagsStore();

/** The `.hud` root's `data-overlay` value: the open overlays, space-separated („tab shop”). */
export const overlayAttr = (o: UiOverlay): string =>
  `${o.tab ? "tab " : ""}${o.shop ? "shop " : ""}${o.pause ? "pause " : ""}`.trim();

/**
 * Read the flags in a component. With a selector, it re-renders only when the selected value
 * changes — so select a primitive (`(f) => f.bannerUp`) or an existing reference (`(f) => f.overlay`).
 */
export function useUiFlags(): UiFlags;
export function useUiFlags<T>(select: (f: UiFlags) => T): T;
export function useUiFlags<T>(select?: (f: UiFlags) => T): T | UiFlags {
  const read = (): T | UiFlags => (select ? select(uiFlags.get()) : uiFlags.get());
  return useSyncExternalStore(uiFlags.subscribe, read, read);
}
