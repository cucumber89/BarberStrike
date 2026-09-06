# Hosting — jak grać przez internet (2.1)

BARBERSTRIKE to jeden proces: serwer gry (Colyseus) serwuje też zbudowanego klienta. Kto otworzy
adres serwera w przeglądarce, ten gra na tym serwerze — nie ma nic do konfigurowania po stronie
znajomych. (Dlaczego to musi być jeden proces: patrz `apps/server/src/hosting.ts`.)

Są trzy sposoby, od najprostszego dla „raz na wieczór” do „stały adres na zawsze”:

| Sposób | Koszt | Kiedy | Adres |
|---|---|---|---|
| **A. Hostuj z własnego PC** (`pnpm host` + tunel) | 0 zł | jeden wieczór | zmienia się co uruchomienie |
| **B. Render** (Docker, plan Free) | 0 zł | na stałe, hobbystycznie | `https://barberstrike.onrender.com` |
| **C. Koyeb / Fly.io / Railway / VPS** | od 0 zł | na stałe, więcej kontroli | własna domena |

Wszystkie używają tego samego `Dockerfile` w katalogu głównym repo (B i C) albo `pnpm host` (A).

> **Hugging Face Spaces** — od 2026 typ Space „Docker” jest oznaczony jako **Paid** (na zrzucie z
> formularza: Static i Gradio darmowe, Docker płatny). Static nie uruchomi serwera, a Gradio to
> Python, więc dla tej gry HF przestał być darmową opcją. Workflow `sync-to-hf.yml` zostaje w repo
> na wypadek płatnego planu; nie robi nic, dopóki nie ustawisz zmiennej `HF_SPACE`.

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

## B. Render (darmowy, stały adres) — zalecane

Render buduje nasz `Dockerfile` prosto z GitHuba i daje adres `https://<nazwa>.onrender.com` z HTTPS
i WebSocketami. Plan **Free**: 750 godzin miesięcznie (starcza na jedną usługę non stop), usługa
**usypia po 15 minutach bez ruchu** i budzi się przy pierwszym wejściu (30–60 s — pierwsza osoba
poczeka, reszta wchodzi od razu). RAM 512 MB wystarcza na 12 graczy.

### Konfiguracja (ok. 5 minut, karta nie jest wymagana)

1. Zmerguj gałąź do `main` w GitHubie (Render buduje z gałęzi, którą wskażesz; `main` jest najprościej).
2. Wejdź na https://dashboard.render.com i zaloguj się kontem GitHub.
3. **New → Blueprint** → wybierz repo `cucumber89/BarberStrike` → Render sam czyta `render.yaml`
   (usługa `barberstrike`, runtime Docker, plan free, health check `/health`) → **Apply**.
   Alternatywnie **New → Web Service** → repo → Runtime: Docker → Instance type: Free → Create.
4. Pierwszy build trwa 5–8 minut (widać log). Gdy status zmieni się na **Live**, adres gry to
   **`https://barberstrike.onrender.com`** (albo z przyrostkiem, jeśli nazwa była zajęta — Render pokaże).

Każdy kolejny push do `main` przebudowuje usługę automatycznie.

### Sprawdzenie

```
https://barberstrike.onrender.com/health   → {"ok":true,"game":"BARBERSTRIKE","players":0,...}
```

W menu gry linia **ONLINE · N PLAYING** ma świecić na zielono, a panel **PLAY ONLINE** pokaże
gotowy link do wysłania znajomym.

### Żeby serwer nie usypiał w trakcie wieczoru

Usypianie liczy się od ostatniego żądania HTTP, a gra po wejściu używa WebSocketu. Dopóki ktoś jest
w menu lub w meczu, klient odpytuje `/health` (menu co 5 s) i utrzymuje socket, więc w praktyce
usługa nie zasypia w trakcie grania. Jeśli chcesz, żeby budziła się szybciej dla pierwszej osoby,
darmowy monitor typu UptimeRobot / cron-job.org odpytujący `/health` co 10 minut załatwia sprawę.

---

## C. Koyeb / Fly.io / Railway / własny serwer

Wszystkie budują ten sam obraz. Serwer czyta `PORT` ze środowiska; nic więcej nie trzeba ustawiać.

**Koyeb** (plan Free: jedna usługa web, też usypia bez ruchu): https://app.koyeb.com → Create
Service → GitHub → repo → Builder: **Dockerfile** → Instance: Free → Deploy. Adres: `https://<nazwa>-<login>.koyeb.app`.

**Fly.io** (`fly.toml` jest w repo; region `waw` = Warszawa):

```bash
fly launch --copy-config --no-deploy    # nazwa aplikacji: barberstrike (lub własna)
fly deploy
fly open
```

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
| `PORT` | 2567 | Port strony i gry (Render/Koyeb ustawiają własny, Fly: 8080). |
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
