# BARBERSTRIKE na VPS (OVH VPS-1, Debian + Docker)

Od czystego serwera do grywalnego adresu. Całość zajmuje ok. 30 minut, z czego 10 to czekanie
na build. Każde polecenie wykonujesz na serwerze, chyba że napisano inaczej.

---

## 0. Zanim zaczniesz

Potrzebujesz trzech rzeczy: dostępu do serwera (IP `57.128.225.124`, użytkownik `debian`, hasło
z linku w mailu od OVH), domeny `barberstrike.click` w panelu OVH, i repozytorium gry na GitHubie
z wypchniętym katalogiem `deploy/`.

---

## 1. DNS: wskaż domenę na serwer — z Twojego komputera

Domena `barberstrike.click` jest w OVH, więc wpis dodajesz w tym samym panelu.

1. Wejdź na https://www.ovh.com/manager → **Web Cloud** → **Domeny** → `barberstrike.click`.
2. Zakładka **Strefa DNS** → przycisk **Dodaj wpis**.
3. Wybierz typ **A** i wypełnij:
   - **Subdomena**: zostaw **puste** (to znaczy „sama domena”, bez `www`)
   - **Target / Cel**: `57.128.225.124`
   - TTL: zostaw domyślny
4. Zatwierdź. Powtórz to samo dla subdomeny `www` z tym samym IP — Caddy przekieruje ją na goły adres.

Jeśli w strefie są już wpisy A dla domeny (OVH czasem dodaje własną stronę parkingową), **usuń je**
albo zmień ich cel na `57.128.225.124`. Dwa różne adresy A dla tej samej nazwy oznaczają, że co drugi
gracz trafi w pustkę.

Potem sprawdź z PowerShella, że domena wskazuje na serwer:

```
ping barberstrike.click
```

Ma odpowiadać `57.128.225.124`. Zmiana w strefie DNS OVH rozchodzi się zwykle w kilka minut, ale
potrafi zająć do godziny. **Certyfikat HTTPS nie powstanie, dopóki to nie działa** — nie uruchamiaj
`docker compose up`, zanim `ping` nie pokaże właściwego adresu.

## 2. Pierwsze logowanie na serwer

W PowerShellu na Windowsie (SSH jest wbudowane, nic nie instalujesz):

```
ssh debian@57.128.225.124
```

Przy pierwszym połączeniu potwierdź odcisk klucza wpisując `yes`, potem wklej hasło (przy wpisywaniu
nic się nie wyświetla — to normalne).

Zaraz po zalogowaniu zaktualizuj system i sprawdź, czy Docker faktycznie jest:

```
sudo apt update && sudo apt upgrade -y
docker --version && docker compose version
```

Jeśli `docker` nie istnieje (wybrałeś czystą dystrybucję zamiast obrazu z Dockerem):

```
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
```

Po `usermod` **wyloguj się i zaloguj ponownie**, inaczej Docker będzie żądał `sudo`.

---

## 3. Firewall i podstawowe bezpieczeństwo

Otwierasz dokładnie trzy porty: SSH, HTTP (potrzebny Let's Encrypt) i HTTPS.

```
sudo apt install -y ufw fail2ban
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw --force enable
```

Port 2567 zostaje zamknięty — serwer gry stoi za Caddym i nie musi być widoczny z zewnątrz.

`fail2ban` blokuje adresy, które próbują zgadywać hasło SSH; działa od razu po instalacji.

**Uwaga o UFW i Dockerze:** Docker potrafi omijać UFW, wpisując własne reguły do iptables. W tej
konfiguracji to nieszkodliwe, bo jedyny kontener z portami na świat to Caddy i on ma być publiczny.
Ale nie publikuj portów `game` w compose — dlatego jest tam `expose`, a nie `ports`.

---

## 4. Swap (ważne przy 4 GB i budowaniu klienta)

Build Vite z Babylonem potrafi zająć 1,5–2 GB RAM. Bez swapu przy pechu kernel ubije build w
połowie z komunikatem `Killed`.

```
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
free -h
```

---

## 5. Kod na serwer

```
sudo apt install -y git
git clone ADRES_TWOJEGO_REPO sidequest
cd sidequest/frankibarber
```

Jeśli repo jest prywatne, najprościej użyć tokenu: na GitHubie **Settings → Developer settings →
Personal access tokens → Fine-grained tokens**, uprawnienie `Contents: read` do tego repo, i wtedy
`git clone https://TOKEN@github.com/...`.

`ADRES_TWOJEGO_REPO` sprawdzisz na swoim komputerze poleceniem `git remote -v` w katalogu `sidequest`.
Gra siedzi w podkatalogu, dlatego po sklonowaniu wchodzisz do `sidequest/frankibarber` — czyli tam,
gdzie leży `pnpm-workspace.yaml`. Wszystkie polecenia niżej wykonujesz w tym katalogu.

Sprawdź, że pliki wdrożeniowe dojechały:

```
ls deploy
```

Musisz zobaczyć `Caddyfile  DEPLOY.md  Dockerfile  docker-compose.yml  env.example`. Jeśli katalogu
nie ma, znaczy że nie wypchnąłeś go na GitHuba — zrób to na komputerze i tu daj `git pull`.

---

## 6. Konfiguracja

```
cp deploy/env.example deploy/.env
nano deploy/.env
```

Domyślne wartości (`barberstrike.click` i Twój mail) są już wpisane — sprawdź tylko, czy się zgadzają.
Zapis w nano: `Ctrl+O`, `Enter`, potem `Ctrl+X`.

---

## 7. Start

```
docker compose --env-file deploy/.env -f deploy/docker-compose.yml up -d --build
```

Pierwszy build trwa 5–15 minut (instalacja zależności + Babylon w Vite). Kolejne są dużo szybsze,
bo warstwa z zależnościami siedzi w cache'u.

Podglądaj, co się dzieje:

```
docker compose --env-file deploy/.env -f deploy/docker-compose.yml logs -f
```

Szukasz dwóch rzeczy: `[BARBERSTRIKE ...] listening on :2567` od gry i informacji o wystawionym
certyfikacie od Caddy'ego. Wyjście z podglądu: `Ctrl+C` (kontenery działają dalej).

---

## 8. Sprawdzenie

```
curl -s https://barberstrike.click/health
```

Ma zwrócić `{"ok":true,"game":"BARBERSTRIKE",...}`. Potem otwórz adres w Chrome — powinno wejść
menu gry. Otwórz drugie okno, wpisz tę samą nazwę pokoju i sprawdź, czy widzicie się nawzajem.

---

### Kompresja i cache (po co: 2 vCPU liczą mecz, nie gzipa)

Build klienta zapisuje obok każdego pliku wersję `.br` i `.gz` (`apps/client/scripts/precompress.mjs`),
a serwer gry wysyła je gotowe i sam ustawia `Cache-Control` (`apps/server/src/hosting.ts`): assety
z hashem w nazwie na rok, modele na miesiąc, `index.html` nigdy. Caddy nie dokłada już własnych
nagłówków, więc każda odpowiedź ma dokładnie jeden. Sprawdzenie z komputera:

```bash
curl -sI -H 'Accept-Encoding: br' https://TWOJA_DOMENA/ | grep -i -E 'cache-control|content-encoding'
#   cache-control: no-cache            content-encoding: br
curl -sI -H 'Accept-Encoding: br' "https://TWOJA_DOMENA/$(curl -s https://TWOJA_DOMENA/ | grep -o 'assets/index-[^"]*\.js' | head -1)" | grep -i -E 'cache-control|content-encoding'
#   cache-control: public, max-age=31536000, immutable      content-encoding: br
```

## 9. Aktualizacja gry (po każdej zmianie w kodzie)

```
cd ~/sidequest/frankibarber
git pull
docker compose --env-file deploy/.env -f deploy/docker-compose.yml up -d --build
```

Stare kontenery zostają wymienione, gracze w trakcie meczu zostaną rozłączeni — rób to między
sesjami. Sprzątanie starych obrazów co jakiś czas (40 GB dysku to nie tak dużo):

```
docker image prune -af
```

---

## Przydatne polecenia

Skrót, żeby nie pisać za każdym razem długiej ścieżki — dopisz do `~/.bashrc`:

```
echo "alias bs='docker compose --env-file ~/sidequest/frankibarber/deploy/.env -f ~/sidequest/frankibarber/deploy/docker-compose.yml'" >> ~/.bashrc
source ~/.bashrc
```

Potem wystarczy `bs logs -f`, `bs restart`, `bs down`, `bs ps`.

| Co chcesz | Polecenie |
|---|---|
| Zobaczyć obciążenie | `htop` (instalacja: `sudo apt install htop`) |
| Zużycie przez kontenery | `docker stats` |
| Restart samej gry | `bs restart game` |
| Zatrzymać wszystko | `bs down` |
| Statystyki sieci gry | dopisz `FB_NET_STATS: "1"` do `environment` gry i `bs up -d`, potem `bs logs -f game` |

---

## Gdy coś nie działa

**Certyfikat się nie wystawia / strona nie otwiera się po HTTPS.** Najczęściej DNS jeszcze nie
wskazuje na serwer albo port 80 jest zamknięty. Sprawdź `ping barberstrike.click` z komputera i
`sudo ufw status`. Logi Caddy'ego: `bs logs caddy`.

**Strona się otwiera, ale gra nie łączy się z serwerem.** To znaczy, że klient został zbudowany ze
złym `VITE_SERVER_URL`. Sprawdź `DOMAIN` w `deploy/.env` i przebuduj: `bs up -d --build`. W konsoli
przeglądarki (F12) zobaczysz, pod jaki adres leci WebSocket.

**`Killed` w trakcie budowania.** Zabrakło pamięci — wróć do kroku 4 i włącz swap.

**Czarny ekran w grze.** To po stronie przeglądarki, nie serwera: w menu SETTINGS włącz
„Force WebGL2 (disable WebGPU)”.
