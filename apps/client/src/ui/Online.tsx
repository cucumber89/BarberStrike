import { useState } from "react";
import type { GameMode } from "@frankibarber/shared";
import { copyText, inviteLink, isSharedOrigin } from "./invite";
import { uiSound } from "../game/audio";

export interface ServerStatus { ok: boolean; version?: string; players?: number; rooms?: number; url: string }

/** One line: is there a server, and who is on it. */
export function ServerLine({ status }: { status: ServerStatus | null }) {
  if (!status) return <div className="server-line" data-testid="server-line"><span className="dot" />CHECKING SERVER…</div>;
  if (!status.ok) return <div className="server-line off" data-testid="server-line"><span className="dot" />SERVER UNREACHABLE</div>;
  return (
    <div className="server-line on" data-testid="server-line">
      <span className="dot" />ONLINE · {status.players ?? 0} PLAYING IN {status.rooms ?? 0} {status.rooms === 1 ? "MATCH" : "MATCHES"}{status.version ? ` · v${status.version}` : ""}
    </div>
  );
}

/** A copyable line with a COPY button and a two-second "copied" state. */
export function CopyRow({ value, label, testid }: { value: string; label?: string; testid?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="copy-row" data-testid={testid}>
      {label && <span className="copy-label">{label}</span>}
      <input readOnly value={value} onFocus={(e) => e.target.select()} />
      <button type="button" className="shop-btn" onClick={async () => { uiSound("click"); if (await copyText(value)) { setCopied(true); setTimeout(() => setCopied(false), 2000); } }}>{copied ? "COPIED" : "COPY"}</button>
    </div>
  );
}

/**
 * Play online (2.1): how friends get in, depending on where this page is running.
 *
 * The page IS the server (see docs/HOSTING.md): whoever can open this address can play here. So
 * the panel has two honest states — "share this link" when the address is one other people can
 * reach, and the steps to get such an address when it is not.
 */
export function Online({ status, room, mode }: { status: ServerStatus | null; room: string; mode: GameMode }) {
  const shared = typeof location !== "undefined" && isSharedOrigin(location);
  const link = typeof location !== "undefined" ? inviteLink(location.href, room, mode) : "";
  return (
    <div className="online" data-testid="online">
      <ServerLine status={status} />
      {shared ? (
        <>
          <h3>SHARE THIS LINK</h3>
          <p>Anyone who opens it lands on this server{room ? <> in room <b>{room}</b></> : null}. Same link, same room, same match.</p>
          <CopyRow value={link} testid="invite-link" />
          <ol className="steps">
            <li>Send the link to your friends (any chat will do).</li>
            <li>Everyone opens it in Chrome or Chromium on a computer and enters a nickname.</li>
            <li>Press <b>QUICK PLAY</b>. Up to {12} players in one match; add bots if you are few.</li>
          </ol>
        </>
      ) : (
        <>
          <h3>THIS IS A LOCAL COPY</h3>
          <p>Only this computer can open <b>{typeof location !== "undefined" ? location.host : ""}</b>. To play with people elsewhere, the game needs an address they can reach. Two ways, both free:</p>
          <div className="host-options">
            <div className="host-option">
              <b>HOST FROM THIS PC</b>
              <span>Runs on your machine while you play. Good for one evening.</span>
              <pre>{`pnpm host\ncloudflared tunnel --url http://localhost:2567`}</pre>
              <small>The tunnel prints an https address — that is the link to share. On the same wi-fi the LAN address the server prints works as it is.</small>
            </div>
            <div className="host-option">
              <b>PUT IT ON A SERVER</b>
              <span>Always on, one address for good. Render (free), Koyeb or Fly.io run the Docker image straight from GitHub.</span>
              <pre>{`docs/HOSTING.md`}</pre>
              <small>Step-by-step for each host, including the free tiers.</small>
            </div>
          </div>
        </>
      )}
      <h3>ROOM NAMES</h3>
      <p>A room name is the code. Everyone who enters the same name, in the same mode, lands in the same match; leave it empty for quick play with whoever is around. The lobby's <b>INVITE</b> button makes a link with the name already filled in.</p>
    </div>
  );
}
