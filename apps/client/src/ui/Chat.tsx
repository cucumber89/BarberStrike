import { useEffect, useRef, useState } from "react";
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
}

/** The two channels, as a Polish CS2 client tags them (drop U, §7 P3 WORK 4). */
export const CHAT_TAG = { team: "[DRUŻYNA]", all: "[WSZYSCY]" } as const;
export const CHAT_PLACEHOLDER = "Napisz… Enter wysyła, Esc zamyka";

/**
 * Text chat (drop 5), zone `chat`, bottom left above the perks (drop U P3, docs/UI_U_SPEC.md §7 P3
 * WORK 4, §4.2): the last lines fade out on their own; Enter (all) / Y (team) opens the box, Enter
 * sends, Escape drops it. While the box is open the game ignores every key (InputState.typing).
 *
 * Drop U: Polish tags — „[DRUŻYNA]” for your side only, „[WSZYSCY]” for everyone (none in a mode
 * without teams, where every line is to everyone) — at t1, one line per message (the full text is
 * its `title`), and at most 6 lines, 4 on a screen ≤ 760 px high, 3 at ≤ 600 and 2 there while the
 * plan card shows (`left.css`), so the column never runs into the money or the plan.
 */
export function Chat({ lines, open, teams, myId, api, planUp = false }: Props) {
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (open) { setText(""); inputRef.current?.focus(); }
  }, [open]);
  return (
    <div className={`chat${open ? " open" : ""}${planUp ? " with-plan" : ""}`} data-zone="chat" data-testid="chat">
      <ul className="chat-lines">
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
