# V_SPEC — drop V (turniej + konta + polish)

Data: 2026-09-25 · Gałąź: `claude/practical-bardeen-07gu1m`

## 1. Cel i zakres

Drop V dowozi dwie duże funkcje i cztery mniejsze polish-y, wszystko z zachowaniem zasad L1–L7.

Duże:
- **Turniej 1v1** do 32 miejsc, grany na **równoległych arenach**: poczekalnia dyryguje, host klika START, każda para gra jako osobny pokój, widzowie oglądają dowolny mecz, drabinka na żywo, na końcu mistrz + tablica sławy. Baza: ZWYCIĘSKI projekt B (minimalista niezawodności) + przeszczepy z A wg werdyktu sędziego.
- **Konta (drop H)**: nick + hasło, sesja tokenowa, migracja profilu z localStorage, trofea, tablica sławy. Baza: ZWYCIĘSKI projekt B (minimalista) + przeszczepy z A.

Mniejsze (krócej, sekcja 5): menu poziomu CS2/Valorant + prawdziwe ikony broni, onboarding nowych graczy, wydajność na słabych maszynach, powroty 60 s w turnieju.

Zasady twarde: L1 — nic nie blokowane poziomem/pieniędzmi, nagrody tylko kosmetyczne, brak zakupów; gość gra bez ograniczeń. L6 — autorytet serwera, tick i snapshot pokoju gry (`TdmState`) bez zmian; nowe pola schematu i nowe pokoje tylko dla: poczekalnia, areny, oglądanie, konta, trofea — każde wypisane w sekcji 6.

## 2. Pomiar pojemności i limity

Źródło: `apps/client/e2e/out/v/capacity.md` (przeczytane). Kluczowe zmierzone dane:

| Parametr | Wartość | Źródło |
|---|---|---|
| Tick rate | 60 Hz = 16.7 ms/tick | `packages/shared/src/constants.ts:12` |
| Koszt ticka, 2 ciała (duel 1v1) | ≤ 0.25 ms | drop S ledger, `capacity.md:23` |
| Koszt ticka, 40 ciał | 0.32 ms | `docs/HOSTING.md:82-83` |
| Przepustowość na klienta | 3.6 kB/s przy 40 ciałach | `docs/HOSTING.md:83` |
| MAX_SPECTATORS/pokój | 6 | `packages/shared/src/constants.ts:64` |
| maxClients areny | 2 + 6 = 8 | `apps/server/src/rooms/TdmRoom.ts:347` |

**Wynikające limity (twarde w kodzie):**
- **Maks. 10 równoległych aren 1v1** (20 graczy) = 10 × 0.25 ms = **2.5 ms/tick ≈ 15% budżetu**. Bezpiecznie do 16 aren (32 graczy, runda 1) = 4 ms ≈ 24%.
- **maxClients areny = 8** (2 gracze + 6 widzów) — już w `TdmRoom.ts:347`, bez zmian.
- **Widzowie**: 10 aren × 6 = 60 miejsc; 16 aren × 6 = 96. Koszt = tylko snapshot, fizyka pomijalna.
- **Poczekalnia**: `maxClients ≥ 40` (0 ciał, 0 ms/tick — czysty koordynator meta).
- **Rozgrzewka**: osobny pokój TDM z botami, `maxClients = 12` (`constants.ts:29`).

**VPS `barberstrike.click` = 2 vCPU / 4 GB RAM** (właściciel, 2026-09-25). CPU: symulacja Colyseus jest jednowątkowa (pętla Node), 16 aren R1 × 0.25 ms = **4 ms/tick (24% budżetu)** zmierzone na dev (24 rdzenie); rdzenie VPS wolniejsze, więc bramka końcowa musi potwierdzić `tick.maxMs < 8 ms` przy 16 arenach + widzach. RAM: 10–16 pokoi ≈ 200–400 MB RSS ≪ 4 GB. Uplink: arena 1v1 to 2 ciała (nie 40), więc ≈ 1.5 kB/s/klient; pełne 32 graczy + 96 widzów + rozgrzewka ≈ 32×1.5 + 96×1.5 + 36 ≈ **230 kB/s ≈ 1.9 Mbit/s** — marginalne dla każdego VPS.

**Limity produkcyjne (DECYZJA D8, sekcja 6), VPS 2 vCPU / 4 GB znany:** **`TOURNAMENT_MAX_ENTRANTS = 32`** (16 aren R1) i **`TOURNAMENT_MAX_SPECTATORS_TOTAL = 96`** (16 aren × 6), egzekwowane w `lobbyProtocol.ts` (P0). Ruch ≈ 1.9 Mbit/s, RAM ≪ 4 GB — duży zapas. **Warunek utrzymania (bramka końcowa, krok 4):** load test 16 aren + widzowie na dev, `tick.maxMs < 8 ms`; jeśli przekroczy → zejść do `ENTRANTS=16 / SPECTATORS=48` i dopisać do `HOSTING.md`.

**Definicja „słabej maszyny" i próg FPS (dla P8c):** „słaba maszyna" = urządzenie, które `DeviceProbe` (`deviceProbe.ts:6`) klasyfikuje jako `WEAK` (mediana frame-time > 22 ms w 2 s próbie ≈ < 45 FPS). Próg akceptacji wydajności: na presecie `minimal` mediana frame-time ≤ 20 ms (≥ 50 FPS) przy 12 ciałach na scenie w headless benchmarku `fps-stream.mjs`; baner „sprzęt ledwo nadąża" pojawia się gdy zmierzony FPS < 40 przez ≥ 3 s.

## 3. Architektura turnieju

**Model: poczekalnia dyryguje, każda para gra jako osobny pokój.** Odrzucamy dzisiejszy „jeden pokój na całą drabinkę grający pary sekwencyjnie" (`TdmRoom.ts:344,1490,1532`) — nie skaluje się powyżej 8. Ważny fakt (werdykt): **`duel`/`turniej` to TRYBY jednego pokoju `tdm`** (`TdmRoom.ts:265-266`); `index.ts:75` rejestruje tylko `"tdm"` z `filterBy(["room","mode","map"])`. „Arena" = instancja `tdm` z `mode="duel"` — nie nowy typ pokoju.

### 3.1 Pokoje
- **`tournament-lobby`** (NOWY typ pokoju — DECYZJA D1, sekcja 6). Lekki koordynator: roster, gotowość, czat, drabinka, mapowanie para→arena. Zero ciał, zero fizyki, nie tickuje gry.
- **Areny** = instancje `tdm` z `mode="duel"`, po jednej na parę rundy. Bez nowego typu, `maxClients=8` już ustawione.
- **Rozgrzewka** = instancja `tdm mode=duel` z botami (boty nie liczą się do drabinki). Boty w `tdm`/`duel` już działają dziś (potwierdzone: slider botów `Menu.tsx:88-94`, boty grają w Duel — ZWIAD [nowi-gracze]), więc rozgrzewka reużywa istniejącą ścieżkę `play("create")` z `bots>0`; ZERO nowej logiki botów, ZERO nowego pola schematu. Nie wymaga zgody L6 (patrz D9, sekcja 6).

### 3.2 Pola schematu (`TournamentLobbyState` — NOWY schemat, `TdmState` NIETKNIĘTY)
- `hostId: string` — kto klika START (D2).
- `phase: string` — `"poczekalnia" | "trwa" | "koniec"` (D2).
- `entrants: MapSchema<Entrant{ id, name, ready:boolean, connected:boolean, seat:number }>` (D2). `seat` i `connected` — przeszczep z A (jawny numer miejsca + status żywotności odporny na reconnect).
- `bracket: string` — TEN SAM wire format co dziś (`bracketString`, `tournament.ts:185`; nicki nie id — potwierdzone werdyktem). Zero nowego protokołu drabinki.
- `arenas: MapSchema<Arena{ matchIndex:number, roomId:string, live:boolean }>` — mapowanie para→pokój. Przeszczep z A: jawne źródło dla „OGLĄDAJ" (`/viewer?room=<roomId>`) i dla widzów.

### 3.3 Protokół
- **Kanał wynik→poczekalnia** (przeszczep B, kluczowy szew): arena `duel` na `endMatch` publikuje wynik przez Colyseus `presence` pod kluczem `tourn:<lobbyId>:<matchIndex>` = `{winner,scoreA,scoreB}`; poczekalnia subskrybuje i aktualizuje `bracket`. Pole `tournamentId` + `matchIndex` w `TdmJoinOptions` (`TdmRoom.ts:163`) niesie kontekst do areny (D3).
- **C2S poczekalni** (nowe, tylko lobby): `lobby:ready`, `lobby:start` (tylko host), `lobby:chat`, `lobby:spectate{matchIndex}`. Zero zmian w protokole gry.
- **Bezpieczeństwo czatu `lobby:chat` (serwer, autorytatywne):** długość ≤ **200 znaków** (dłuższe obcięte), rate-limit **1 wiadomość / 1 s / entrant** (nadmiar odrzucony po cichu), sanityzacja server-side — strip znaków sterujących i tagów HTML (escape `<`,`>`,`&`) przed wpisaniem do stanu; klient renderuje jako tekst (nie `dangerouslySetInnerHTML`). Stałe `LOBBY_CHAT_MAX_LEN=200`, `LOBBY_CHAT_MIN_INTERVAL_MS=1000` w `lobbyProtocol.ts` (P0).

### 3.4 Przepływ
1. **Host** klika „ZAŁÓŻ TURNIEJ" w Menu (liczba miejsc 4/8/16/32, mapa) → `client.create("tournament-lobby", …)`, `hostId = sessionId`. Dostaje LINK ZAPROSZENIA (`invite.ts:58` rozszerzony o `mode=lobby`).
2. **Poczekalnia**: gracze dołączają linkiem, przełączają `ready`. Wolne sloty = „WOLNY LOS" (byes, puste stringi — `seedBracket`/`settleByes` już to robią, `tournament.ts:59-76`).
3. **START** (tylko host, disabled gdy <2 ready): poczekalnia woła `seedBracket`, tworzy N aren `tdm mode=duel` przez server-side match API, wstrzykuje parę + `tournamentId`+`matchIndex`, ustawia `phase="trwa"`, wypełnia `arenas`. **Areny podnoszone server-authoritative przez lobby** (L6 zachowane — arena tickuje sama, ale to nietknięty tick `tdm`).
4. **Równoległe areny**: każda para gra 1v1. Odpadli/czekający widzą drabinkę na żywo + listę trwających meczów z „OGLĄDAJ".
5. **Oglądanie**: klik `watch-match` → `/viewer?room=<arenas[i].roomId>` (reużyty `Viewer.tsx:40`, `ViewerScene` bez zmian).
6. **Drabinka**: arena raportuje wynik przez `presence` → lobby aktualizuje `bracket` → `settleByes` przepycha zwycięzców → tworzy areny następnej rundy.
7. **Zwycięzca**: `phase="koniec"`, ekran „MISTRZ TURNIEJU" + odznaka (kosmetyczna, L1). Wpis do profilu `tournaments[]` i (jeśli zalogowany) do tablicy sławy przez konto (sekcja 4).

### 3.5 Naprawa błędu drabinki w Tab
**Przyczyna (zweryfikowana `result.css:329-334`)**: reguły `.bracket-pair` ISTNIEJĄ, ale zagnieżdżone pod `:is(.sb-bracket, .result-bracket)` i stylizują TYLKO `font-size`/`min-width`. **Brak `display` na `.bracket`/`.bracket-round`/`.bracket-pair`** → dwa `<span>` gracza A i B (`Bracket.tsx:31-36`) lecą inline → sklejone nicki, kreski `—` też inline. Naprawa (tylko CSS, zero `.tsx`):
```css
.bracket { display: flex; gap: 16px; }
.bracket-round { display: flex; flex-direction: column; gap: 6px; }
.bracket-pair { display: flex; flex-direction: column; gap: 2px; }
```

## 4. Konta (drop H)

Baza: projekt B (minimalista). Konta żyją POZA pętlą gry, jako REST na istniejącym Express (`index.ts:14,68`). Zero nowych pokoi Colyseus, zero pól repliki `TdmState`.

### 4.1 Backend / persistence
- **SQLite `better-sqlite3`, plik `data/accounts.db`** (D6). Jeden proces, synchroniczny, backup = kopia pliku. Tabele:
  - `accounts(id, login UNIQUE, pass_hash, created_at)`
  - `profiles(account_id PK, profile_json, updated_at)` — cały `Profile` (`profile.ts:22-56`) jako JSON blob; klient rządzi kształtem.
  - `sessions(token_hash PK, account_id, expires_at, created_at)` — **przeszczep A: przechowujemy SHA-256 hash tokenu, nie plaintext** (wyciek DB nie oddaje aktywnych sesji).
  - `tournaments(id, ended_at, size, winner_login, bracket_json)` — tablica sławy.
  - `trophies(account_id, tournament_id, place, awarded_at)` — trofea przy koncie.
  - `login_attempts(login, ip, ts)` — **przeszczep A: rate-limit po pełnym kluczu (login+IP)**, blokuje enumerację i rozproszony atak; nie tylko licznik w wierszu konta.

### 4.2 Logowanie / hasło / sesja
- **Hasło: `scrypt` z `node:crypto`** (B, zero zależności): `scrypt$<salt>$<hash>`, salt per konto, stały-czasowy compare.
- **Sesja**: token 32B losowy, cookie `bs_sess` HttpOnly+SameSite=Strict+Secure; token też w `localStorage` jako fallback dla WS `joinById`. TTL 30 dni; odwoływalna (kasujemy wiersz).
- **Rate-limit**: 5 prób / 15 min / (login+IP), potem 429.
- **Walidator loginu współdzielony** (przeszczep A): `^[a-z0-9_]{3,20}$` w `packages/shared` z testem — spójność klient/serwer.

### 4.3 REST API (prefix `/api`, montaż przed SPA-fallback `index.ts:64`)
- `POST /api/register {login,password}` → 201+cookie / 409 zajęty
- `POST /api/login {login,password}` → 200+cookie / 401 / 429
- `POST /api/logout` → 204
- `GET /api/me` → `{login, profile}` / 401
- `PUT /api/profile {profile}` → zapis JSON (walidacja ≤ 64 kB)
- `POST /api/migrate {profile}` → **przeszczep A: twardy kontrakt** — zapis tylko gdy profil serwera pusty, inaczej 409 (chroni chmurę przed nadpisaniem lokalnym blobem z drugiego urządzenia)
- `GET /api/tournaments?limit=50` → tablica sławy (publiczne)
- `GET /api/trophies?login=` → trofea konta (publiczne)

### 4.4 Migracja profilu / trofea / tablica sławy
- **Migracja**: po pierwszym logowaniu, jeśli serwer ma pusty profil a klient ma `bs_profile_v1` → baner „Przenieś postępy?" → `POST /api/migrate`. Po zalogowaniu `saveProfile` (`profile.ts:116`, jedyny chokepoint zapisu) rozgałęzia się: localStorage + debounce `PUT /api/profile`. Gość = tylko localStorage.
- **Sesja pokoju**: `session` w `TdmJoinOptions` (`TdmRoom.ts:163-167`) — opcja dołączenia, NIE pole repliki. `onCreate/onJoin` woła lokalnie `verifySession`. Brak sesji = gość (L1).
- **Trofea**: hook przy zakończeniu turnieju (`finishPair`/`isDone`/`champion`, `TdmRoom.ts:1532,1535`) → wpis do `tournaments` + `trophies`.
- **Tablica sławy**: strona `/stats` (`hall-of-fame`) czyta `GET /api/tournaments` + trofea konta.

## 5. Mniejsze funkcje (krócej)

**Menu + ikony broni** (L1/L6, czysto klient + build-tool): ekran tytułowy art-directed (dziś ANG tekst `Menu.tsx:224,227` → PL). Ikony broni = **build-time snapshot** proceduralnej geometrii (`weaponMeshes.ts:62,629`) w jednym ujęciu 3/4, jak `paintSkinArt` (`SkinArt.tsx:45`) → statyczne PNG w repo (zero runtime WebGL w menu). Zero nowych pól/pokoi.

**Nowi gracze** (L1/L6, klient + localStorage): ekran powitalny (raz, klucz `bs_onboard_v1`) z „SAMOUCZEK / TRENING Z BOTAMI / POMIŃ". Samouczek = overlay 5 kroków nad zwykłym meczem (reuse kontekstu z `hintRules.ts`). Trening = `tdm`/`duel` z botami przez istniejące `play("create")`. Zero nowych pól/pokoi.

**Wydajność** (L6 nietknięty — render klienta): tier `minimal` (renderScale 0.5, shadows off, effects 0.2, `settings.ts:141`), `WEAK`→`minimal` (`deviceProbe.ts`), telemetria FPS w produkcji (zdjęcie bramki `if(dev)` `perf/index.ts:132`, pole `perfStat` w store klienta — nie schemat), badge FPS + baner „sprzęt ledwo nadąża", narzędzie `fps-stream.mjs`.

**Powroty 60 s** (przeszczep A+B połączony): stała `TOURNAMENT_RECONNECT_GRACE_S = 60` obok `RECONNECT_GRACE_S = 15` (`TdmRoom.ts:45`); `onLeave` warunkuje `this.tournament ? 60 : 15` (`TdmRoom.ts:690,719`). KRYTYCZNE: `withdrawFromBracket` (`TdmRoom.ts:1554`) NIE leci z `onLeave` areny — **ostateczny walkower wyzwala poczekalnia po 60 s** (miejsce/wynik trwa w `entrants`+`bracket` niezależnie od życia areny, odporne na restart areny). TDM po 15 s wykreślony jak dziś.

## 6. DECYZJE (nowe pola schematu i nowe pokoje)

Dozwolone tylko: poczekalnia, areny, oglądanie, konta, trofea. Każde poniżej.

| # | Co | Rodzaj | Uzasadnienie | Zgoda właściciela (L6)? |
|---|---|---|---|---|
| **D1** | pokój `tournament-lobby` | nowy pokój | Poczekalnia — koordynator bez fizyki; L6 zakazuje ruszać tick/snapshot `tdm`, więc lobby jest osobne. Rejestracja `index.ts:75`. | **TAK — nowy pokój** |
| **D2** | `TournamentLobbyState` (`hostId`, `phase`, `entrants{id,name,ready,connected,seat}`, `bracket`) | nowe pola schematu | Poczekalnia; bez `hostId` nikt nie klika START, bez rostera nie ma gotowości. `bracket` reużywa wire format `bracketString`. | **TAK — nowy schemat** |
| **D3** | `arenas: Map<Arena{matchIndex,roomId,live}>` w lobby | nowe pole schematu | Oglądanie — jawne mapowanie para→pokój dla „OGLĄDAJ" i widzów. | **TAK** |
| **D4** | `tournamentId?`, `matchIndex?` w `TdmJoinOptions` | opcja dołączenia (NIE replika) | Areny — kontekst wynik→poczekalnia przez `presence`. Nie jest polem stanu. | nie (opcja, nie schemat) |
| **D5** | `TOURNAMENT_SIZES = [4,8,16,32]` (`tournament.ts:20`) | zmiana danych | Areny — `seedBracket`+byes już obsługują dowolny rozmiar; zmiana stałej, nie logiki. | nie |
| **D6** | SQLite `data/accounts.db` + `session` w `TdmJoinOptions` | persistence + opcja dołączenia | Konta — REST poza pętlą gry; `session` to opcja dołączenia, nie replika. | nie (zero pól repliki) |
| **D7** | `tournaments: []` w `Profile` (`profile.ts:22`) | nowe pole profilu (localStorage/konto) | Trofea — historia turniejów; kosmetyczne (L1). | nie (nie schemat Colyseus) |
| **D8** | `TOURNAMENT_MAX_ENTRANTS = 32`, `TOURNAMENT_MAX_SPECTATORS_TOTAL = 96` (`lobbyProtocol.ts`) | stałe limitów | Areny/poczekalnia — VPS 2 vCPU/4 GB (właściciel): ruch ≈1.9 Mbit/s, RAM ≪4 GB. Bramka końcowa potwierdza `tick.maxMs<8 ms` przy 16 arenach; inaczej zejść do 16/48. | nie (stała, nie schemat) |
| **D9** | Boty w rozgrzewce `tdm mode=duel` | użycie istniejącej logiki | Rozgrzewka — boty już działają w Duel dziś (`Menu.tsx:88-94`); reuse `play("create")` z `bots>0`, zero nowej logiki, zero nowego pola. | nie (bez zmian schematu ani nowego pokoju) |

**Wymagają zgody właściciela (nowy pokój / nowy schemat repliki): D1, D2, D3 — ZATWIERDZONE przez właściciela 2026-09-25.** Reszta to opcje dołączenia, dane, stałe lub stan klienta — poza L6.

## 7. PAKIETY (rozłączne pliki)

### 7.0 Granice linii dla plików dzielonych przez pakiety (obowiązkowe przy merge)

Trzy pliki są dotykane przez więcej niż jeden pakiet. Rozłączność egzekwowana PER BLOK — każdy pakiet edytuje wyłącznie wymienione linie/komponenty, nigdy poza nie:

| Plik | Pakiet | Dozwolony blok | Zakaz |
|---|---|---|---|
| `apps/server/src/index.ts` | P2 | `registerRoom` przy `:75` — dopisanie `gameServer.define("tournament-lobby", …)` obok `"tdm"` | nie ruszać `app.use`/SPA-fallback `:64` |
| `apps/server/src/index.ts` | P4 | montaż routera REST `app.use("/api", accountRoutes)` PRZED SPA-fallback `:64` | nie ruszać `registerRoom` `:75` |
| `apps/server/src/rooms/TdmRoom.ts` | P0 | tylko stała `TOURNAMENT_RECONNECT_GRACE_S = 60` obok `:45` | nie ruszać `onLeave`/`TdmJoinOptions`/hooków |
| `apps/server/src/rooms/TdmRoom.ts` | P3 | `onLeave:690,719`, `withdrawFromBracket:1554`, `TdmJoinOptions:163`, hook trofeum `:1532` | nie ruszać stałej `:45` (własność P0) |
| `apps/client/src/ui/Menu.tsx` | P5 | wejście „ZAŁÓŻ TURNIEJ" + panel poczekalni (nowy blok JSX + handler, przy `:56`) | nie ruszać bloku KONTO ani tytułówki `:219-257` |
| `apps/client/src/ui/Menu.tsx` | P6 | przycisk KONTO + render `<Account/>` (nowy blok, obok wejść) | nie ruszać panelu poczekalni ani tytułówki `:219-257` |
| `apps/client/src/ui/Menu.tsx` | P8a | tylko blok tytułówki `:219-257` (`mm-hero`, ikony NAV) | nie ruszać wejść turniej/konto |
| `apps/client/src/ui/Menu.tsx` | P8b | tylko render `<Welcome/>` (onboarding, warunkowy nad menu) | nie ruszać tytułówki `:219-257` ani wejść |

Kolejność wymuszona sekwencją (sekcja 7 dół): P2 przed P3 dla `index.ts`/`TdmRoom.ts`; P5/P6/P8a/P8b w `Menu.tsx` są rozłącznymi blokami — merge PO P5, w kolejności P5→P6→(P8a∥P8b), każdy jako osobny commit dotykający tylko swoich linii.

### P0 — SZKIELET (wspólne, PIERWSZY) — wszyscy budują na tym
Pliki:
- `packages/shared/src/tournament.ts` — `TOURNAMENT_SIZES = [4,8,16,32]` + `seedBracket`/`settleByes` do 32 + testy.
- `packages/shared/src/lobbyProtocol.ts` (NOWY) — typy C2S/S2C, `LobbyPhase`, kształt `TournamentLobbyState`, stałe limitów: `TOURNAMENT_MAX_ENTRANTS=32`, `TOURNAMENT_MAX_SPECTATORS_TOTAL=96` (D8), `LOBBY_CHAT_MAX_LEN=200`, `LOBBY_CHAT_MIN_INTERVAL_MS=1000` (bezpieczeństwo czatu, sekcja 3.3).
- `packages/shared/src/account.ts` (NOWY) — typy `AccountDTO`, `SessionToken`, `TournamentRecord`, `Trophy`, walidator loginu `^[a-z0-9_]{3,20}$`.
- `apps/server/src/rooms/schema/LobbyState.ts` (NOWY) — schemat Colyseus poczekalni.
- `apps/client/src/net/lobbyStore.ts` (NOWY), `apps/client/src/net/account.ts` (NOWY) — store'y klienta.
- `apps/server/src/rooms/TdmRoom.ts:45` — stała `TOURNAMENT_RECONNECT_GRACE_S = 60`.

Zależności: brak. **Kryteria odbioru:** `pnpm --filter @frankibarber/shared test` zielony; `TOURNAMENT_SIZES` == `[4,8,16,32]` (assert `modes.test.ts`); `seedBracket(20,32)` → 32 sloty, 12 byes, round-trip `bracketString`→`parseBracket` równy; walidator loginu: 3–20 znaków `[a-z0-9_]` (≥6 przypadków); `TOURNAMENT_MAX_ENTRANTS === 32` i `TOURNAMENT_MAX_SPECTATORS_TOTAL === 96` (D8, assert w `lobbyProtocol` test).

### P1 — FIX DRABINKI (izolowany, natychmiastowy)
Pliki: `apps/client/src/ui/hud/result.css` (dodać reguły layoutu `.bracket`/`.bracket-round`/`.bracket-pair`). Zero `.tsx`.
Zależności: brak. **Kryteria:** zrzut `hud-states.mjs` Tab — dwa nicki w osobnych wierszach, brak sklejenia; `getComputedStyle('.bracket-pair').display === 'flex'` i `flexDirection === 'column'`.

### P2 — SERWER POCZEKALNIA
Pliki: `apps/server/src/rooms/TournamentLobbyRoom.ts` (NOWY), `apps/server/src/index.ts:75` (rejestracja). Areny przez `tdm mode=duel`.
Zależności: P0. **Kryteria:** `apps/client/e2e/tools/tournament.mjs` — host tworzy lobby, 8 graczy ready, START podnosi 4 areny równolegle (`arenas.size === 4`); wynik z areny przez `presence` aktualizuje `bracket`; **czat:** wiadomość > 200 znaków trafia do stanu obcięta do 200; druga wiadomość w < 1 s odrzucona (stan bez duplikatu); payload `<b>x</b>` ląduje w stanie z escapowanymi `<`/`>` (asercja: brak surowego `<b>`).

### P3 — SERWER ARENA/GRACE + KONTA W POKOJU
Pliki: `apps/server/src/rooms/TdmRoom.ts` (`onLeave:690,719` warunek `this.tournament?60:15`; `withdrawFromBracket:1554` wyzwalany przez lobby; `TdmJoinOptions:163` — `tournamentId`,`matchIndex`,`session`; hook trofeum `1532`). Rozłączne z P2.
Zależności: P0, P4 (dla `verifySession`). **Kryteria:** test grace (`tournament.mjs`, node/Colyseus) — gracz turnieju rozłączony po 15 s wciąż w drabince, po 60 s walkower; TDM po 15 s wykreślony (dwie różne stałe użyte); hook trofeum (`:1532`) — po `isDone`/`champion` publikuje wynik przez `presence` (asercja: lobby odbiera `tourn:<id>:<matchIndex>`); `verifySession` — `onJoin` z ważną `session` ustawia tożsamość konta, z brakującą/nieważną `session` → gość bez błędu (asercja: dwa joiny, jeden `account_id` ustawiony, drugi `null`, oba wchodzą).

### P4 — BACKEND KONT (auth + persistence)
Pliki: `apps/server/src/accounts/db.ts`, `hash.ts`, `session.ts`, `store.ts`, `rateLimit.ts`, `routes.ts` (wszystkie NOWE), montaż `apps/server/src/index.ts:64`.
Zależności: P0. **Kryteria:** `apps/client/e2e/tools/account.mjs` (NOWY) — register 201+cookie, duplikat 409, login złe hasło ×5 → 6. daje 429, `/api/me` z cookie 200 / bez 401; `db.ts` tworzy 6 tabel (`sqlite_master` count == 6); `hash.ts` verify true/false.

### P5 — UI POCZEKALNIA + OGLĄDANIE
Pliki: `apps/client/src/ui/lobby/*` (NOWE), `apps/client/src/ui/invite.ts:58` (mode=lobby), `apps/client/src/ui/Menu.tsx` (wejście + panel), przycisk „OGLĄDAJ" → reuse `Viewer.tsx:40`.
Zależności: P0, P2. **Port Vite:** klient dev `5173`. **Kryteria:** e2e (`tournament.mjs`, browser) — `lobby-start` disabled przy <2 ready, enabled przy 2; `lobby-roster` N wierszy = N entrants; klik `watch-match` otwiera `/viewer?room=X`, `activeMeshes>0` w `profile.mjs`; **rozgrzewka (D9):** klik `lobby-warmup` z poczekalni woła `play("create")` z `bots>0` i wchodzi do pokoju `tdm mode=duel` z co najmniej jednym botem w roster (asercja: `activeMeshes>0`, roster zawiera bota, gracz gra), bez tworzenia areny turniejowej.

### P6 — UI KONTA + MIGRACJA + TABLICA SŁAWY
Pliki: `apps/client/src/ui/Account.tsx` (NOWY), `apps/client/src/ui/Hall.tsx` (NOWY, route `/stats` w `main.tsx`), `apps/client/src/game/progression/profile.ts:116` (rozgałęzienie `saveProfile`), `apps/client/src/ui/Menu.tsx` (przycisk KONTO — rozłączny blok od P5).
Zależności: P0, P4. **Kryteria:** rozszerz `profile.mjs` — logowanie→migracja→profil serwera ma `xp` z localStorage; wylogowanie chowa `account-who`; gość widzi `account-guest-hint`; `POST /api/migrate` na niepustym → 409.

### P7 — TROFEA W PROFILU + ZAPIS TURNIEJU
Pliki: `packages/shared` (`Profile.tournaments[]` typ w P0 już zadeklarowany; tu użycie), Armoury trofea, hook zapisu w lobby (`TournamentLobbyRoom.ts`).
**Granica w `TournamentLobbyRoom.ts` (dzielony z P2):** P2 tworzy pokój, roster, START, `arenas`, subskrypcję `presence`; P7 dopisuje WYŁĄCZNIE handler przejścia `phase="koniec"` (na champion) → `POST` do własnego store kont (`tournaments`+`trophies`) + wpis do profilu zwycięzcy. P7 nie rusza logiki startu/aren P2.
Zależności: P2, P4, P6. **Kryteria (`profile.mjs`, browser + `account.mjs` HTTP):** po turnieju `loadProfile().tournaments.length` +1 (odczyt w kontekście przeglądarki po `phase=koniec`); `GET /api/tournaments` +1 wiersz; `GET /api/trophies?login=<winner>` ma `place=1`; `/stats` renderuje `hof-row` (count≥1).

### P8 — POLISH (menu/ikony, onboarding, wydajność) — rozłączne podpakiety
- **P8a menu+ikony**: `packages/shared/src/weaponArt.ts` (NOWY), `apps/client/e2e/tools/weapon-icons.mjs` (NOWY), `apps/client/src/assets/weapons/*.png` (NOWE), `apps/client/src/ui/shopArt.tsx`, `Menu.tsx:219-257` (blok tytułówki — rozłączny od wejść P5/P6). Kryteria: 14 PNG > 0 B z alpha; `mm-hero` bez ANG tekstu; brak inline `<path>` w kartach broni.
- **P8b onboarding**: `apps/client/src/ui/onboarding/*` (NOWE), `Menu.tsx` (render Welcome — rozłączny blok). Kryteria: `tutorial.mjs` — 5 akcji przełącza `tutorial-step` 1→5; `onb-skip` → `welcomed=true`.
- **P8c wydajność**: `apps/client/src/game/perf/fpsMeter.ts` (NOWY), `perf/index.ts:132`, `settings.ts:141`, `deviceProbe.ts`, `apps/client/src/ui/hud/PerfBadge.tsx` (NOWY), `apps/client/e2e/tools/fps-stream.mjs` (NOWY). Kryteria: `PRESET=minimal` daje `drawCalls`/`tris` niższe niż `low` o ≥15%; `fps-stream.mjs` na `minimal` przy 12 ciałach mediana frame-time ≤ 20 ms (≥ 50 FPS, próg z sekcji 2); `perf-warn` („sprzęt ledwo nadąża") pojawia się gdy FPS < 40 przez ≥ 3 s; `perf-fps` widoczny przy niskim FPS.

**Kolejność:** P0 → P1 → (P2 ∥ P4 ∥ P8) → P3 → (P5 ∥ P6) → P7.

## 8. Kontrakt testów (data-testid / e2e)

**Nowe data-testid:**
- Turniej: `turniej-zaloz`, `turniej-link`, `lobby-roster`, `lobby-entrant`, `lobby-ready-toggle`, `lobby-chat`, `lobby-chat-send`, `lobby-start`, `lobby-warmup`, `lobby-invite`, `bracket-now` (istnieje), `watch-match`, `trofeum`.
- Konta: `account-panel`, `account-login`, `account-pass`, `account-submit`, `account-error`, `account-who`, `account-logout`, `account-guest-hint`, `account-migrate`, `migrate-yes`, `migrate-no`, `hall-of-fame`, `hof-row`, `trophy-item`.
- Polish: `mm-hero`, `mm-hero-bg`, `shop-icon-<id>`, `onboarding-welcome`, `onb-tutorial`, `onb-training`, `onb-skip`, `tutorial-overlay`, `tutorial-step`, `tutorial-quit`, `perf-fps`, `toggle-fps`, `perf-warn`, `btn-quality-auto`.

**Dotknięte e2e (`apps/client/e2e/tools/`):**
- `tournament.mjs` — rozszerzony: lobby, START, `arenas.size`, reconnect 60 s, zapis turnieju/trofeum, rozgrzewka z botami (`lobby-warmup`, D9), bezpieczeństwo czatu (długość/rate/escape).
- `hud-states.mjs` — zrzut naprawionej drabinki, `hall-of-fame`, `mm-hero`.
- `profile.mjs` — migracja, `account-who`, watch-match `activeMeshes`, regres draw-calls polish.
- `crowd-check.mjs` — 20 klientów w poczekalni, `lobby-start` gating.
- Nowe: `account.mjs` (HTTP smoke auth), `tutorial.mjs` (onboarding), `fps-stream.mjs` (ciągły FPS), `weapon-icons.mjs` (generator ikon).
