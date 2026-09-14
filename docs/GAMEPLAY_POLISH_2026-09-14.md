# Gameplay polish — raport przed/po (2026-09-14)

Wykonanie briefu `FABLE_GAMEPLAY_POLISH_BRIEF.md`: sklep, ekrany wyników, droga nowego gracza,
pomiary. Gałąź `claude/busy-bardeen-wqmxtl`, cztery commity etapowe plus poprawki. Wszystkie liczby
poniżej pochodzą z narzędzi w `apps/client/e2e/tools/` uruchomionych w tym kontenerze; obrazy pod
`apps/client/e2e/out/` (nie w repo — regeneruj poleceniami z tabeli).

## Co się zmieniło

**Sklep (`Shop.tsx`, `shopCatalog.ts`, `styles.css`).** Cztery działy jako zakładki na lewej szynie,
jeden dział naraz po prawej, maksymalnie dziesięć wierszy (tyle sięgają cyfry). Wiersz: skrót, duża
sylwetka (viewBox dopasowany do rysunku, nie do arkusza), nazwa 17 px, rola dla początkującego
14 px („blisko · seria · lekka, szybki bieg”), cena i osobno rozliczenie wymiany („dopłata $180” /
„zwrot $620”), stan słowem na przycisku (KUP / WYMIEŃ / DOKUP / UŻYJ / ULEPSZ / BRAK KASY /
ZAMKNIĘTE / NIE TA ROLA). Powód odmowy na wierszu, z kwotą: „Brakuje $1,400” liczone z tej samej
reguły, którą wykonuje serwer (`buyShortfall` w `shared/economy.ts`). Klik szarzeje do odpowiedzi
serwera (`pending`), więc podwójny klik nie wysyła dwóch zakupów; odpowiedź sprzedaży niesie
`sold: true`, więc linia wyniku mówi „Sprzedano”, nie „Kupiono”. Skrót dziesiątej pozycji: klawisz
`0`, wydruk `1·0`; jedno źródło dla wydruku i handlera; auto-repeat klawisza ignorowany (wcześniej
przytrzymane „1” kupowało pierwszą pozycję działu). Szczegóły (statystyki, większy podgląd) pod
najechaniem / fokusem w karcie na szynie; podstawowe informacje bez najeżdżania. Kasa, czas zakupów
i ZAMKNIJ w stałej głowie.

**Wynik rundy i meczu (`MatchResult.tsx`, `resultText.ts`, `Scoreboard.tsx`).** Karta końca meczu:
ZWYCIĘSTWO / PORAŻKA / REMIS / KONIEC MECZU (obserwator) z własnego miejsca, wynik stron albo nazwany
zwycięzca, jedno zdanie „dlaczego” wyprowadzone z realnego stanu (limit wyniku, pusta strona, czas —
nigdy przyczyna, której stan nie niesie), trzy statystyki dobrane do trybu (cel przed zabójstwami tam,
gdzie jest cel), XP z paskiem i jedną nagrodą-nagłówkiem, szczegóły XP i odznaki pod rozwinięciem,
tabela pod zakładką (klawisz Tab), stała stopka: „następny mecz startuje sam za N s” (tak robi serwer;
nie ma przycisku rewanżu, bo nie ma takiej prośby do serwera) i WYJDŹ DO MENU. Najbliższy cel
kosmetyczny (najbliższe wyzwanie skrzynkowe z postępem). Między rundami karta „RUNDA DLA FADE ·
Ładunek rozbrojony · FADE 3 : 2 TAPER · następna runda za 5 s” z sygnałów trybu: string wyniku bomby
plus strona atakująca, powód pojedynku plus zwycięzca z eventu Prep (nowe pole `hud.roundWinner`, bo
synchronizacja stanu 10 Hz nadpisywała `winner` chwilę po evencie), zwycięzca rundy Ostrzyżonych.
Killfeed, portfel, sprzęt, amunicja, górny pasek, hinty, panel planu i toasty schodzą z ekranu po
zakończeniu meczu; `prefers-reduced-motion` wyłącza animację karty i przejście paska.

**Droga nowego gracza.** Każdy tryb ma `objective` — jedno zdanie z celem i warunkiem zwycięstwa —
pokazywane na ekranie ładowania (po GOTOWE), w rozgrzewce i odliczaniu oraz na karcie pauzy. Polski
na wszystkich zmienianych ekranach: sklep, wynik, HUD (bomba, flagi, drabinka, śmierć, luneta,
przeładowanie, pauza), hinty, ładowanie, opisy trybów w menu. Nazwy broni bez zmian; „Light/Heavy
plate” → „Lekka/Ciężka płyta”, „Throwing knife” → „Nóż”, „Flashbang” → „Flash”. Hint pierwszego
zakupu nie zasłania już podpowiedzi „B · SKLEP” (nachodziły na siebie przy każdej rozdzielczości).

**Narzędzia.** `ui-fit.html` ładuje te same fonty i `cinematic.css` co gra (wcześniej podgląd miał
inną kaskadę). `ui-fit.mjs` mierzy każdą zakładkę sklepu w ośmiu rozmiarach i siedem przypadków
wyniku w dwóch; progi podniesione z „font ≥ 9 px” do: nazwy ≥ 16, role/powody ≥ 13, wszystko ≥ 10,
zero ucięć nazw i powodów, każdy wydrukowany skrót jest prawdziwym klawiszem. `cycles.mjs` (10 cykli
menu → mecz → wyjście) i `context-loss.mjs` (wymuszona utrata kontekstu WebGL) nowe; `hudshots.mjs`,
`reconnect.mjs`, `profile.mjs` przenośne (PW_CHROMIUM, ścieżki w repo).

## Pomiary

| Pomiar | Przed | Po | Polecenie |
|---|---|---|---|
| Sklep 1280×720: najmniejszy tekst | 9 px (`shop-tag`), opisy 9,5 px, nazwy ucięte („M-1 Clean Li…”, „Throwing …”) | 10 px (`shop-slot`); nazwy 17 px, role 14 px, zero ucięć | `node apps/client/e2e/tools/ui-fit.mjs` |
| Sklep 1280×720 @ 125 % i 1366×768 @ 125 % | FAIL: 5 przycisków KUP pod dolną krawędzią, panel przewija (660/414 px) | PASS (wszystkie 8 rozmiarów × 4 zakładki, tryby tdm / bomb / boys) | j.w. `--mode boys`, `--mode bomb` |
| Skrót 10. pozycji | wydruk `1·10`, handler 1–9: nie działa | `1·0`, Digit0/Numpad0 → pozycja 10; test `shopCatalog.test.ts`, e2e `drop 2` naciska 1 potem 0 | `pnpm --filter @frankibarber/client test` |
| Ekran wyniku: 7 przypadków × 2 rozmiary × 2 zakładki, szczegóły rozwinięte | nie mierzono (jedna kolumna flex, nagłówek 96 px, ryzyko przepełnienia) | 14/14 PASS: werdykt, wynik, powód, odliczanie i WYJDŹ na ekranie, nic < 10 px | `ui-fit.mjs` (sekcja result) |
| HUD w grze, React (hud-bench, `--drive snapshot` / `all`, 4 s, 1920×1080, jeden przebieg każdy) | 0,54 / 0,93 ms na klatkę; p95 commit 2,9 / 4,7 ms; najgorszy po montażu 5,7 / 22,9 ms | 0,50 / 0,73 ms; p95 1,9 / 1,9 ms; najgorszy po montażu 4,5 / 4,9 ms — w granicach rozrzutu tej maszyny, nie optymalizacja | `node apps/client/e2e/tools/hud-bench.mjs --drive all --label <l>` |
| 10 cykli menu → mecz → wyjście (SwiftShader, Low) | — | meshe 977, materiały 121, tekstury 44, cząsteczki 14, efekty 31 — płasko od cyklu 2; heap po wyjściu 80,7 → 81,7 MB (cykle 2–10); canvas po wyjściu 0; `__fb` zwolnione; zimne GOTOWE 6,6 s, ciepłe 4,1–4,8 s | `node apps/client/e2e/tools/cycles.mjs --n 10` |
| Utrata kontekstu WebGL w meczu | — | PASS: klatki idą dalej po `restoreContext()`, 0 błędów strony, scena rysuje się (zrzut) | `node apps/client/e2e/tools/context-loss.mjs` |
| Draw calls / aktywne meshe / shadery, 5 widoków, Low vs High | — | ulica 352 / 396 / 31 (Low) vs 351 / 391 / 45 (High); Low: bez cieni (High: 451 casterów), 14 shaderów mniej, te same draw calls; `maxLightsPerMesh` 57 na każdym widoku | `PRESET=low pnpm profile` |
| Serwer: koszt ticku | 0,318 ms średnio (ledger J) | pełny pokój 8 botów + 4 ludzi: średnio 0,481 ms, szczyt 11,73 ms (budżet 16,7) | `pnpm --filter @frankibarber/server test tickCost` |

`renderMs` z `profile.mjs` na SwiftShaderze to szum kompilacji shaderów (4–570 ms) i nie jest
raportowany jako wynik.

### HUD

Bench HUD-u mierzy stan „w grze” (snapshot 20 Hz + dym + radar), którego ta praca nie zmienia; ekran
wyniku i sklep nie są w benchu. Liczby „po” służą wykluczeniu regresji, nie jako optymalizacja —
żaden refaktor HUD-u nie został wykonany, bo nie ma potwierdzonego problemu: 0,5–0,9 ms na klatkę to
3–6 % budżetu 60 fps, a jedyna nadmiarowość (cały `Hud` subskrybuje cały store) jest już w Deferred
ze zmierzoną bazą. Jeden przebieg przed i po na współdzielonym CPU (rozrzut między przebiegami
tego samego kodu jest tu rzędu ±0,2 ms/klatkę), więc różnica 0,93 → 0,73 ms nie jest wynikiem —
liczy się to, że nic nie wzrosło: liczba commitów na klatkę identyczna (0,35 / 0,52).

## Ograniczenia weryfikacji

- **Brak prawdziwego GPU.** Cały rendering w tym kontenerze to SwiftShader (~10 fps). Żadna liczba
  tutaj nie mówi, czy gra trzyma 60 fps na jakimkolwiek laptopie; Low/Medium/High różnią się tu tylko
  liczbą casterów cieni i shaderów. Docelowe 60 fps na konfiguracji minimalnej: **niezweryfikowane**.
- **Brak pomiaru opóźnienia wejścia, ADS, przeładowania po odrodzeniu na 30/60/144 fps i RTT
  50/100/150 ms.** Istniejące testy jednostkowe (`inputDt.test.ts` 1–240 Hz, `prediction.test.ts`,
  `RemotePlayer.test.ts`, serwerowe `Framerate.test.ts`) przechodzą i nie zostały dotknięte; nic w
  tej sesji nie zmienia symulacji, predykcji, interpolacji ani kontraktów sieciowych (jedyne dodane
  pole w wiadomości to opcjonalne `ShopResult.sold`). Symulacja jittera / zerwania pod WebSocket nie
  została zbudowana — `reconnect.mjs` (2,5 s offline) istnieje i działa.
- **Pointer lock.** Headless Chromium nie daje prawdziwego pointer locka (testy e2e używają
  `fakeLock`), więc „zamknięcie sklepu przywraca lock” zweryfikowano z kodu (`setShopOpen(false)` →
  `requestPointerLock`; odmowa trafia na kartę pauzy z komunikatem), nie z obserwacji.
- **E2E.** Pełny przebieg: 17/18 (11,4 min, świeżo uruchomione serwery, `FB_DEV_TOOLS=1`): wszystkie
  testy multiplayer i startup zielone, w tym dwa klienty: zakup, trafienie, śmierć, odrodzenie,
  wynik, bomba z kartą rundy, gun game do końca drabinki, reconnect (`reconnect.mjs`). `armoury.spec.ts`
  pada na wyrównaniu znacznika bębna skrzynek (63,8 px zamiast < 2) — komponent nieruszany w tej sesji,
  ta sama asercja na `main`; nie osłabiono, zapisano w Deferred.
- **Playtest.** Brak testerów w tej sesji; pięć zadań i tabela są w `docs/PLAYTEST_TEMPLATE.md`. To,
  że sklep jest zrozumiały bez instrukcji, jest hipotezą do sprawdzenia na ludziach.
- **Boty i balans liczebności, bezpieczeństwo spawnów, czas oczekiwania po śmierci** — nie mierzone
  w tej sesji poza tym, co pokrywają istniejące testy; brak udokumentowanego zacięcia do naprawy.

## Instrukcja playtestu (5 minut)

1. Uruchom `pnpm dev`, otwórz `http://localhost:5174/` w dwóch oknach (albo daj link `/r/<pokój>`).
2. Zadania dla testera: `docs/PLAYTEST_TEMPLATE.md`, sekcja „Pięć zadań dla nowego testera”. Mierz
   stoperem, licz pomyłki, nie podpowiadaj.
3. Po meczu zapytaj: „Wygrałeś? Dlaczego? Ile XP?” — cel: odpowiedź w 2 s z karty wyniku.
4. Zapisz do `docs/playtests/<data>-<nick>.md`.
