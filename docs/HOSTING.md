# Hosting a game (2.0)

You run the game on your machine, your friends open a link. No accounts, no server to rent, nothing
to configure. Up to 10 players.

```bash
pnpm install     # once
pnpm host        # builds the client, then starts the server
```

The server prints the links. Read out the one your friends can reach:

```
Your friends open one of these in a browser:
  http://localhost:2567    (you)
  http://192.168.1.37:2567  (same wi-fi)

Everyone types the SAME room name to land in the same match.
```

Everyone puts the **same room name** in the menu and presses PLAY. That is the whole join flow — the
room name is the code.

## Why one process serves both

The game server also serves the page. That is not a convenience, it is the only arrangement a
browser allows:

- **A page on HTTPS cannot open a `ws://` socket to a home address.** So a friend on a public
  deployment of the game can never join a match on your network, whatever you configure. Serving the
  page from your machine over plain `http://` puts the page and the socket on the same origin, and
  the rule does not apply.
- **A page cannot broadcast on a local network**, so it cannot go looking for your game either.
  "LAN discovery" is not something a browser can do; the link is the discovery.

Side effect worth knowing: `pnpm host` needs the client built once. `pnpm host` does it for you, and
prints a plain instruction rather than an address that leads to nothing if the build is missing.

## Playing with someone who is not on your wi-fi

Your machine is behind a router, so nobody outside can reach it by default. Two ways:

**A tunnel (recommended).** No router settings, works from anywhere, gives an HTTPS address — and
because it serves the page too, the mixed-content rule above is satisfied.

```bash
pnpm host                                    # leave running
cloudflared tunnel --url http://localhost:2567
# prints something like https://mild-fox-1234.trycloudflare.com — that is the link to share
```

`ngrok http 2567` does the same job.

**Port forwarding.** Forward TCP 2567 on your router to your machine, then share
`http://<your public IP>:2567`. It is free and it is permanent, but it is a hole in your router, it
breaks whenever your ISP changes your address, and some ISPs (CGNAT) make it impossible. Use the
tunnel unless you have a reason not to.

## Options

| Variable | Default | What it does |
|---|---|---|
| `PORT` | 2567 | Port for both the page and the game. |
| `BS_CLIENT_DIR` | auto | Where the built client is, if it is not next to the server. |
| `FB_DEV_TOOLS` | off | Dev-only room messages (`dev:teleport`, `dev:endmatch`). Never on a public server. |
| `CORS_ORIGIN` | any | Comma-separated origins, for a deployment where the page lives elsewhere. |

## Checking it works

```bash
curl -s http://localhost:2567/health     # {"ok":true,"game":"BARBERSTRIKE",...}
HOST_URL=http://localhost:2567 node apps/client/e2e/tools/hostcheck.mjs
```

`hostcheck` opens the page, joins a match and prints which origin the game's socket went to. It must
be the port you are hosting on. Anything else means a friend on another machine would be talking to
nothing — see `defaultServerUrl` in `apps/client/src/game/net/Connection.ts`.
