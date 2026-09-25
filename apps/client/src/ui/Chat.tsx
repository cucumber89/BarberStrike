import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { CHAT } from "@frankibarber/shared";
import type { ChatLine } from "../game/store";

export interface ChatApi {
  send(text: string): void;
  close(): void;
}

interface Props {
  lines: ChatLine[]; open: "all" | "team" | null; teams: boolean; myId: string; api: ChatApi;
  /** The plan card or chip is up: on a short screen the chat keeps one line fewer (§4.2). */
  planUp?: boolean;
  /** The left column (radar, wallet, plan): the chat never reaches within 12 px of its bottom. */
  column?: RefObject<HTMLElement | null>;
}

/** The two channels, as a Polish CS2 client tags them (drop U, §7 P3 WORK 4). */
export const CHAT_TAG = { team: "[DRUŻYNA]", all: "[WSZYSCY]" } as const;
export const CHAT_PLACEHOLDER = "Napisz… Enter wysyła, Esc zamyka";
/** §4.3: `chat` × `wallet` and `plan` × `chat` keep 12 px. */
const CLEAR_PX = 12;
/** One line of a message (`left.css`: 20 px); less room than this is not a supported screen. */
const ONE_LINE_PX = 20;

/**
 * Text chat (drop 5), zone `chat`, bottom left above the perks (drop U P3, docs/UI_U_SPEC.md §7 P3
 * WORK 4, §4.2): the last lines fade out on their own; Enter (all) / Y (team) opens the box, Enter
 * sends, Escape drops it. While the box is open the game ignores every key (InputState.typing).
 *
 * Drop U: Polish tags — „[DRUŻYNA]” for your side only, „[WSZYSCY]” for everyone (none in a mode
 * without teams, where every line is to everyone) — at t1, at most 6 messages, 4 on a screen
 * ≤ 760 px high, 3 at ≤ 600 and 2 there while the plan card shows (`left.css`).
 *
 * A message is player content, and none of it is ever cut (Principle 14): the nick is whole and
 * the text wraps, as it did before the drop. What gives way is HISTORY: newest first, only the
 * messages that fit WHOLE above the chat's bottom and 12 px under the left column (the money, the
 * buy row, the plan card) are shown, so the chat never runs into the column at any size (§4.3).
 * Only when the newest message alone is taller than all that room — a long message on a short
 * screen while the plan card is up — is it cut at the room's edge, under a fade, until the card
 * leaves and the room comes back.
 */
export function Chat({ lines, open, teams, myId, api, planUp = false, column }: Props) {
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  useEffect(() => {
    if (open) { setText(""); inputRef.current?.focus(); }
  }, [open]);

  // Which messages fit, measured before paint (`fitChat`); again when the column or the window
  // changes size (the plan card coming and going, a resize) and when the fonts arrive.
  const fit = useCallback(() => {
    if (rootRef.current && listRef.current) fitChat(rootRef.current, listRef.current, column?.current ?? null);
  }, [column]);
  useLayoutEffect(fit);
  useEffect(() => {
    const col = column?.current;
    const ro = typeof ResizeObserver === "undefined" || !col ? null : new ResizeObserver(fit);
    if (col) ro?.observe(col);
    window.addEventListener("resize", fit);
    void document.fonts?.ready.then(fit);
    return () => { ro?.disconnect(); window.removeEventListener("resize", fit); };
  }, [column, fit]);

  return (
    <div ref={rootRef} className={`chat${open ? " open" : ""}${planUp ? " with-plan" : ""}`} data-zone="chat" data-testid="chat">
      <ul ref={listRef} className="chat-lines">
        {lines.map((l) => (
          <li key={l.key} className={l.id === myId ? "me" : ""} data-testid="chat-line" title={`${l.name}: ${l.text}`}>
            {teams && <span className="chat-tag">{l.all ? CHAT_TAG.all : CHAT_TAG.team}</span>}{teams && " "}
            <span className={`chat-name ${teams ? `t${l.team}` : "ffa"}`}>{l.name}</span>{" "}
            <span className="chat-text">{l.text}</span>
          </li>
        ))}
      </ul>
      {open && (
        <form className="chat-form" onSubmit={(e) => { e.preventDefault(); api.send(text); }}>
          <span className="chat-kind">{open === "team" && teams ? CHAT_TAG.team : CHAT_TAG.all}</span>
          <input
            ref={inputRef} value={text} maxLength={CHAT.maxLen} placeholder={CHAT_PLACEHOLDER}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); api.close(); } e.stopPropagation(); }}
            onBlur={() => api.close()}
            data-testid="chat-input" autoComplete="off" spellCheck={false}
          />
        </form>
      )}
    </div>
  );
}

/**
 * Newest first, keep the messages that fit whole in the room between the chat's bottom and 12 px
 * under the column; hide the rest (`data-over`, whole messages only, so the history never has a
 * gap). If even the newest does not fit, cut the list at the room (`data-clip`: overflow and a
 * fade). React never writes these two attributes or the list's max-height, so they are ours.
 */
function fitChat(root: HTMLElement, list: HTMLElement, column: HTMLElement | null): void {
  const items = Array.from(list.children) as HTMLElement[];
  for (const li of items) li.removeAttribute("data-over");
  list.removeAttribute("data-clip");
  list.style.maxHeight = "";
  if (!column) return;
  const gap = parseFloat(getComputedStyle(list).rowGap) || 0;
  const form = root.querySelector<HTMLElement>(".chat-form");
  const formH = form ? form.offsetHeight + (parseFloat(getComputedStyle(root).rowGap) || 0) : 0;
  const room = root.getBoundingClientRect().bottom - formH - (column.getBoundingClientRect().bottom + CLEAR_PX);
  // Below the smallest supported screen (1024×576) the column can reach past the chat's bottom
  // altogether (the e2e suite plays at 640×360). There is no room to keep, so hide nothing: the
  // chat stays readable, over the column, as it was before the drop.
  if (room < ONE_LINE_PX) return;
  let used = 0, shown = 0, full = false;
  for (let k = items.length - 1; k >= 0; k--) {
    const li = items[k];
    const h = li.offsetHeight;
    if (!h) continue; // capped by the line count in CSS
    const need = used + (shown ? gap : 0) + h;
    if (!full && need <= room) { used = need; shown++; continue; }
    if (!full && shown === 0) {
      list.style.maxHeight = `${Math.max(0, Math.floor(room))}px`;
      list.setAttribute("data-clip", "");
      shown++;
    } else li.setAttribute("data-over", "");
    full = true;
  }
}
