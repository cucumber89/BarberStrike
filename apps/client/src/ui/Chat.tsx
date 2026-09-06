import { useEffect, useRef, useState } from "react";
import { CHAT, TEAM_NAMES } from "@frankibarber/shared";
import type { ChatLine } from "../game/store";

export interface ChatApi {
  send(text: string): void;
  close(): void;
}

interface Props { lines: ChatLine[]; open: "all" | "team" | null; teams: boolean; myId: string; api: ChatApi }

/**
 * Text chat (drop 5): the last lines fade out on their own; Enter (all) / Y (team) opens the box,
 * Enter sends, Escape drops it. While the box is open the game ignores every key (InputState.typing).
 */
export function Chat({ lines, open, teams, myId, api }: Props) {
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (open) { setText(""); inputRef.current?.focus(); }
  }, [open]);
  return (
    <div className={`chat ${open ? "open" : ""}`} data-testid="chat">
      <ul className="chat-lines">
        {lines.map((l) => (
          <li key={l.key} className={l.id === myId ? "me" : ""} data-testid="chat-line">
            {!l.all && teams && <span className="chat-tag">[{TEAM_NAMES[l.team]}]</span>}
            <span className={`chat-name ${teams ? `t${l.team}` : "ffa"}`}>{l.name}</span>
            <span className="chat-text">{l.text}</span>
          </li>
        ))}
      </ul>
      {open && (
        <form className="chat-form" onSubmit={(e) => { e.preventDefault(); api.send(text); }}>
          <span className="chat-kind">{open === "team" && teams ? "TEAM" : "ALL"}</span>
          <input
            ref={inputRef} value={text} maxLength={CHAT.maxLen} placeholder="Say something… (Enter to send, Esc to cancel)"
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
