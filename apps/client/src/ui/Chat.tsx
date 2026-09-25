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
/** §4.2: a chat line is 22 px of box — 20 px of text (`left.css` line-height) on a 22 px pitch. */
const PITCH_PX = 22;
/** The smallest supported screen (§4.2: 1024×576). Below it the column may reach past the chat. */
const MIN_SUPPORTED_H = 576;

/**
 * Text chat (drop 5), zone `chat`, bottom left above the perks (drop U P3, docs/UI_U_SPEC.md §7 P3
 * WORK 4, §4.2): the last lines fade out on their own; Enter (all) / Y (team) opens the box, Enter
 * sends, Escape drops it. While the box is open the game ignores every key (InputState.typing).
 *
 * Drop U: Polish tags — „[DRUŻYNA]” for your side only, „[WSZYSCY]” for everyone (none in a mode
 * without teams, where every line is to everyone) — at t1.
 *
 * §4.2 caps the zone's BOX, in visual lines × 22 px: 6 lines, 4 on a screen ≤ 760 px high, 3 at
 * ≤ 600 and 2 there while the plan card shows (`--chat-lines` in `left.css`). A wrapped message
 * counts every line it takes, and the open input box takes its own height out of the same box.
 * The chat also keeps 12 px under the left column (the money, the buy row, the plan card; §4.3).
 * A message's nick is whole and its text wraps; what gives way is HISTORY: newest first, only the
 * messages that fit WHOLE in both the line cap and the room are shown (`fitChat`). Only when the
 * newest message alone is longer than that — a long message on a short screen while the plan
 * card is up — is it cut after its last whole line, with an ellipsis (its full text is its `title`),
 * until the card leaves and the lines come back.
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
 * Newest first, keep the messages that fit whole in the box: at most `--chat-lines` visual lines
 * (§4.2: the box is lines × 22, the input included), and never nearer than 12 px under the column
 * (§4.3). The rest are hidden whole (`data-over`), so the history never has a gap. If even the
 * newest does not fit, it is cut after its last whole line that does, with an ellipsis
 * (`data-clip`: a line clamp); with no whole line of room it is hidden too. React never writes
 * these two attributes or the line clamp, so they are ours. The lines shown are written to `data-lines` (a probe
 * reads them).
 */
function fitChat(root: HTMLElement, list: HTMLElement, column: HTMLElement | null): number {
  const items = Array.from(list.children) as HTMLElement[];
  for (const li of items) { li.removeAttribute("data-over"); li.removeAttribute("data-clip"); li.style.removeProperty("-webkit-line-clamp"); }
  const rootCs = getComputedStyle(root);
  const capLines = parseInt(rootCs.getPropertyValue("--chat-lines"), 10) || 6;
  const gap = parseFloat(getComputedStyle(list).rowGap) || 0;
  const form = root.querySelector<HTMLElement>(".chat-form");
  const formH = form ? form.offsetHeight + (parseFloat(rootCs.rowGap) || 0) : 0;
  // The box's height for messages: the cap, less the input; and the room over the column.
  let budget = capLines * PITCH_PX - formH;
  if (column) {
    const room = root.getBoundingClientRect().bottom - formH - (column.getBoundingClientRect().bottom + CLEAR_PX);
    // Below the smallest supported screen (the e2e suite plays at 640×360) the column can reach
    // past the chat's bottom altogether: there the line cap alone rules, as before the drop.
    if (room >= PITCH_PX || window.innerHeight >= MIN_SUPPORTED_H) budget = Math.min(budget, room);
  }
  const maxLines = Math.floor((budget + gap) / PITCH_PX);
  let used = 0, lines = 0, shown = 0, full = false;
  for (let k = items.length - 1; k >= 0; k--) {
    const li = items[k];
    const h = li.offsetHeight;
    if (!h) continue; // hidden by the message cap in CSS
    const lh = parseFloat(getComputedStyle(li).lineHeight) || PITCH_PX - gap;
    const n = Math.max(1, Math.round(h / lh));
    const need = used + (shown ? gap : 0) + h;
    if (!full && lines + n <= maxLines && need <= budget + 0.5) { used = need; lines += n; shown++; continue; }
    if (!full && shown === 0 && maxLines >= 1) {
      li.style.setProperty("-webkit-line-clamp", String(maxLines));
      li.setAttribute("data-clip", "");
      lines = maxLines;
      shown++;
    } else li.setAttribute("data-over", "");
    full = true;
  }
  root.setAttribute("data-lines", String(lines));
  return lines;
}
