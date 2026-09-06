# Hosting — jak grać przez internet (2.1)

BARBERSTRIKE to jeden proces: serwer gry (Colyseus) serwuje też zbudowanego klienta. Kto otworzy
adres serwera w przeglądarce, ten gra na tym serwerze — nie ma nic do konfigurowania po stronie
znajomych. (Dlaczego to musi być jeden proces: patrz `apps/server/src/hosting.ts`.)

Są trzy sposoby, od najprostszego dla „raz na wieczór” do „stały adres na zawsze”:

| Sposób | Koszt | Kiedy | Adres |
|---|---|---|---|
| **A. Hostuj z własnego PC** (`pnpm host` + tunel) | 0 zł | jeden wieczór | zmienia się co uruchomienie |
| **B. Hugging Face Spaces** (Docker, darmowy CPU) | 0 zł | na stałe, hobbystycznie | `https://<user>-barberstrike.hf.space` |
| **C. Fly.io / Render / Railway / VPS** | od 0 zł | na stałe, więcej kontroli | własna domena |

Wszystkie używają tego samego `Dockerfile` w katalogu głównym repo (B i C) albo `pnpm host` (A).

---

## A. Hostuj z własnego komputera

```bash
pnpm install     # raz
pnpm host        # buduje klienta i startuje serwer na :2567
```

Serwer wypisuje adresy. Osoby **na tym samym wi-fi** wchodzą pod `http://192.168.x.x:2567`.

Osoby **spoza sieci** potrzebują tunelu (zalecane, bo daje HTTPS i nic nie otwierasz w routerze):

```bash
cloudflared tunnel --url http://localhost:2567
# drukuje np. https://mild-fox-1234.trycloudflare.com  ← to jest link do wysłania
```

`ngrok http 2567` robi to samo. Cloudflared do pobrania: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/

W menu gry: **PLAY ONLINE** pokazuje status serwera i link zaproszenia; w lobby przycisk **INVITE**
robi link z nazwą pokoju (`?room=nazwa&mode=tdm`). Kto go otworzy, ma pokój wpisany.

Wady: gra działa tylko, gdy twój komputer i terminal są włączone; adres tunelu zmienia się przy
każdym uruchomieniu.

---

## B. Hugging Face Spaces (darmowy, stały adres)

Space typu **Docker** uruchamia nasz `Dockerfile` i wystawia go pod `https://<login>-<nazwa>.hf.space`
z HTTPS i WebSocketami. Darmowy CPU basic (2 vCPU, 16 GB RAM) w zupełności starcza na 12 graczy.
Space usypia po 48 h bez ruchu i budzi się przy pierwszym wejściu (ok. 30–60 s).

### Jednorazowa konfiguracja (ok. 5 minut)

1. Załóż Space: https://huggingface.co/new-space
   - **Space name**: `barberstrike`
   - **SDK**: **Docker** → **Blank**
   - **Hardware**: CPU basic (free)
   - **Visibility**: Public (znajomi nie muszą się logować)
2. Zrób token z prawem **write**: https://huggingface.co/settings/tokens
3. W GitHubie, w repo `cucumber89/BarberStrike` → **Settings → Secrets and variables → Actions**:
   - **Secrets** → New repository secret: `HF_TOKEN` = token z punktu 2
   - **Variables** → New repository variable: `HF_SPACE` = `sd89/barberstrike` (twój login/nazwa Space)
4. Zmerguj gałąź do `main` (albo uruchom ręcznie **Actions → Sync to Hugging Face Space → Run workflow**).

Workflow `.github/workflows/sync-to-hf.yml` wypycha repo do Space; Space buduje obraz (pierwszy raz
5–8 minut, potem szybciej) i uruchamia serwer na porcie 7860 (front matter w `README.md` mówi Space'owi,
że to Docker na porcie 7860). Adres gry: **`https://sd89-barberstrike.hf.space`** — to jest link dla
znajomych.

### Ręcznie, bez GitHub Actions

```bash
git remote add hf https://huggingface.co/spaces/sd89/barberstrike
git push hf main     # poprosi o login (user) i token (hasło)
```

### Sprawdzenie

```
https://sd89-barberstrike.hf.space/health   → {"ok":true,"game":"BARBERSTRIKE","players":0,...}
```

W menu gry linia **ONLINE · N PLAYING** ma świecić na zielono.

---

## C. Fly.io / Render / własny serwer

Wszystkie budują ten sam obraz. Serwer czyta `PORT` ze środowiska; nic więcej nie trzeba ustawiać.

**Fly.io** (`fly.toml` jest w repo; region `waw` = Warszawa):

```bash
fly launch --copy-config --no-deploy    # nazwa aplikacji: barberstrike (lub własna)
fly deploy
fly open
```

**Render**: New → Blueprint → wskaż repo; `render.yaml` opisuje usługę (plan free usypia po 15 min
bez ruchu, budzi się w ~30 s).

**Railway**: New project → Deploy from GitHub → wykryje `Dockerfile`. Ustaw *Networking → Generate domain*.

**VPS z Dockerem**:

```bash
docker build -t barberstrike .
docker run -d --restart unless-stopped -p 80:2567 --name barberstrike barberstrike
```

Do HTTPS postaw przed tym Caddy (`caddy reverse-proxy --from gra.twojadomena.pl --to :80`) — Caddy
przekazuje WebSockety bez konfiguracji.

---

## Zmienne środowiskowe

| Zmienna | Domyślnie | Co robi |
|---|---|---|
| `PORT` | 2567 | Port strony i gry (HF Spaces: 7860, Fly: 8080). |
| `BS_CLIENT_DIR` | auto | Gdzie leży zbudowany klient, jeśli nie obok serwera. |
| `CORS_ORIGIN` | dowolny | Lista originów po przecinku, gdy strona jest serwowana z innego miejsca niż serwer (np. klient na Vercel). |
| `FB_DEV_TOOLS` | wyłączone | Komunikaty deweloperskie (`dev:teleport`, `dev:endmatch`). **Nigdy** na publicznym serwerze. |

## Klient osobno (opcjonalnie)

Klient to statyczne pliki (`apps/client/dist`), można je położyć na Vercel/Netlify z `VITE_SERVER_URL=wss://adres-serwera`
i `CORS_ORIGIN` ustawionym na serwerze. Nie ma to sensu, dopóki serwer i tak serwuje stronę — jeden adres
jest prostszy dla wszystkich.

## Jak to sprawdzić lokalnie tak, jak zrobi to Docker

```bash
pnpm build
PORT=7860 node apps/server/dist/index.js     # otwórz http://localhost:7860
curl -s http://localhost:7860/health
```
