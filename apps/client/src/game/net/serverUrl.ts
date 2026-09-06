/**
 * Where the game server is, from the page's own address (pure, so it is testable without a browser).
 *
 * Three cases, in the order they are decided:
 *
 *  1. `VITE_SERVER_URL` — a deployment where the page and the game live apart. It wins over
 *     everything, because only the person who built it knows where the server went.
 *  2. Dev — Vite serves the page on 5174 and is NOT the game server; the game is on 2567 beside it.
 *  3. Everything else is the one-process flow (`pnpm host`, the Docker image on Render / Fly / a
 *     VPS): the game server is serving this very page, so the socket goes to the SAME ORIGIN —
 *     whatever port that is, including none. MEASURED on Render: the old fallback appended `:2567`
 *     to `https://barberstrike.onrender.com`, and every request timed out against a port nothing
 *     was listening on. A static host with the game beside it is case 1, not a guess.
 */
export function resolveServerUrl(
  loc: { protocol: string; hostname: string; host: string },
  env: string | undefined,
  dev: boolean,
): string {
  const configured = env?.trim();
  if (configured) return configured;
  const proto = loc.protocol === "https:" ? "wss" : "ws";
  if (dev) return `${proto}://${loc.hostname || "localhost"}:2567`;
  return `${proto}://${loc.host || "localhost:2567"}`;
}
