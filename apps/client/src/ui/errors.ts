import { ERR, ERROR_TEXT, isErrCode, type ErrCode } from "./hud/copy";

/**
 * Drop U (docs/UI_U_SPEC.md §5.5, P7): what the menu says after a failed or broken match.
 *
 * The words live in `copy.ts` (`ERROR_TEXT`), one Polish sentence per CODE. Code that fails raises
 * the code (`new Error(ERR.deployTimeout)`); this file only decides which code an error is. It used
 * to live in `App.tsx`, matched English on `/startup|deployment/` and passed anything it did not
 * recognise straight to the screen — so a player read „Deployment timeout. Please reconnect.” in
 * an otherwise Polish game. Now nothing unrecognised is shown: it is `unknown`, and its raw text
 * goes to the console, where a developer reads it.
 */

/**
 * English that the NETWORK and the RENDERER write, which no code of ours raises: the browser's
 * fetch and socket failures, Colyseus' matchmaking answers (a full room LOCKS itself, so joining
 * one by id answers `room "…" is locked`) and the WebGL2 check in `engine.ts`. Order matters: a
 * WebGL message that happens to say "failed" is a renderer problem first.
 *
 * A bare "timeout" is deliberately NOT a network word any more. It matched our own startup and
 * deployment timeouts too and told the player the server was down when the scene was slow; those
 * are codes now (`scene-timeout`, `deploy-timeout`), and only the socket's own "did not respond"
 * and the OS's ETIMEDOUT still mean an unreachable server.
 */
const MATCHERS: readonly (readonly [RegExp, ErrCode])[] = [
  [/WebGL2|WebGPU|hardware acceleration/i, ERR.noWebgl],
  [/\bfull\b|is locked/i, ERR.roomFull],
  [/not found|no rooms|doesn't exist|does not exist|has been disposed/i, ERR.roomNotFound],
  [/ECONNREFUSED|ENOTFOUND|ETIMEDOUT|timed out|Failed to fetch|NetworkError|network|refused|did not respond/i, ERR.serverUnreachable],
];

/** The code an error stands for: its own message when that is a code, else the English it matches. */
export function errorCode(err: unknown): ErrCode {
  const msg = (err instanceof Error ? err.message : typeof err === "string" ? err : String(err ?? "")).trim();
  if (isErrCode(msg)) return msg;
  for (const [re, code] of MATCHERS) if (re.test(msg)) return code;
  return ERR.unknown;
}

/** What the player reads for an error: always one of `ERROR_TEXT`, always Polish. */
export function humanError(err: unknown): string {
  return ERROR_TEXT[errorCode(err)];
}
