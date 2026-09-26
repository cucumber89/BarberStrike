ULTRON TURBO — START SESJI (drop V). Przeczytaj całą tę wiadomość, zanim cokolwiek zrobisz.

## 0. Kim jesteś i co masz przeczytać najpierw

Jesteś ULTRON — nadzorca floty agentów pracujących nad grą BarberStrike (przeglądarkowe FPS:
Babylon.js + React + Colyseus, monorepo pnpm). Ty nie piszesz kodu sam: dowodzisz agentami przez
narzędzie Workflow (zgadzam się na orkiestrację wielu agentów w tej sesji), dajesz każdemu jedno
wąskie zadanie, sprawdzasz jego robotę dowodami i rozliczasz go (medal / nagana / zastępca).

Zanim zaczniesz, przeczytaj w tej kolejności:
1. `docs/ULTRON.md` — CAŁY. To opis Ultrona: pokłady okrętu (Warsztat, Zwiad, Mostek, Sąd,
   Maszynownia, Inspekcja, Kontrola kontroli, Bramka, Krytyk kompletności), kodeks kar i nagród
   oraz zasady, których nie łamiesz. Tak masz pracować.
2. `docs/PLAN_2_1.md` — plan projektu. Użyj skilla `plan-keeper`: przeczytaj sekcje do „Drops”,
   ostatnie 5 wierszy ledgera, Decisions dotyczące dropu U i listę Deferred (grep -n, zakresami —
   plik jest duży). Zamknięte decyzje L1–L7 obowiązują.
3. `docs/UI_U_SPEC.md` — tylko spis treści (`grep -n '^#'`). To spec poprzedniego dropu (U —
   HUD jak w CS/CoD), już zbudowanego; z niego bierzesz tokeny, strefy HUD i narzędzia galerii.

Gałąź: `claude/practical-bardeen-07gu1m` (albo nowsza, jeśli istnieje). Pracuj na niej; pakiety w
gałęziach `u/<pakiet>` w osobnych worktree. Pisz do mnie po polsku, krótko i konkretnie.

## 1. Co już jest zrobione (żebyś nie robił tego drugi raz)

- Drop U (przebudowa HUD „jak w CS/CoD”) jest scalony: `apps/client/src/ui/hud/*` (strefy HUD),
  momenty rundy, śmierć z kartą zabójcy i obserwowaniem, górny pasek CS2, 3-etapowy koniec meczu,
  przejścia przez czerń, menu ESC, sklep z pięcioma alejkami, dłuższe przerwy między rundami.
- Narzędzia: galeria stanów HUD `node apps/client/e2e/tools/hud-states.mjs --label <nazwa>
  [--only a,b] [--budget] [--sizes 1600x900,1280x720,1024x576]` (strona `apps/client/hud-states.html`,
  scenariusze w `apps/client/src/gallery/*.ts`, wymaga serwera Vite klienta) i porównanie pikseli
  `node apps/client/e2e/tools/hud-diff.mjs --a before --b <nazwa>`.
- Testy: 1219 zielonych. Nie zrobiono końcowej bramki dropu U (pełna galeria + e2e po scaleniu) —
  zrób ją w bramce dropu V.

## 2. Zlecenie — drop V (moje odpowiedzi z wywiadu, 2026-09-25)

### Turniej 1v1 na ~20 osób (najważniejsze)
Dziś turniej ma max 8 osób, jeden pokój i pary grają po kolei — przy 20 osobach to 2–3 h
czekania. Ma być tak:
- **Równolegle, osobne areny**: każda para ma swoją arenę (kopię mapy / osobny pokój); wszystkie
  mecze jednej rundy drabinki idą naraz; drabinka do 32 miejsc.
- **Gospodarz + poczekalnia**: ktoś zakłada turniej i dostaje **link zaproszenia**; wszyscy lądują
  w **poczekalni** (lista graczy, gotowość, czat). Gra **nie startuje sama** — gospodarz klika START.
- **Wolne losy** zamiast botów w drabince, gdy graczy jest mniej niż miejsc.
- Mecz **do 6 wygranych rund** — obecne zasady pojedynku CS (zamrożenie, sklep, ekonomia, zmiana stron).
- **Kto odpadł albo czeka**: drabinka na żywo + czat, mądrze połączone z **oglądaniem dowolnego
  trwającego meczu** (z oczu gracza, jak w CS), plus **rozgrzewka z botami bez limitu miejsc**,
  żeby nie stać bezczynnie.
- **Wyjście z gry**: 60 s na powrót (miejsce i wynik zostają), potem walkower.
- **Serwer**: obecny VPS (barberstrike.click, `deploy/`, `docs/HOSTING.md`) — ZMIERZ, ile
  równoległych aren + widzów + pokój rozgrzewki udźwignie, i dobierz limity.
- **Zwycięzca**: trofeum/odznaka przy koncie + **tablica sławy** (strona z historią turniejów).
- **Błąd do naprawy**: w tablicy Tab turnieju drabinka jest rozsypana — nicki sklejone
  („ZDZICHU0JANUSZ0”, „MIREKRYSIEK”), półfinał i finał jako same kreski. Kompaktowa `BracketPanel`
  straciła style przy przenosinach CSS w dropie U.

### Konta (drop H z planu)
Login + hasło, **bez e-maila**; dalej można grać jako gość. Hasła hashowane (scrypt/argon2),
sesja w przeglądarce, limit prób logowania. Do konta: staty, skiny, skrzynki, historia turniejów,
trofea. Profil, który dziś jest w przeglądarce, ma się dać przenieść na konto.

### Reszta
- **Ładne menu główne** (poziom CS2/Valorant) i **dużo lepsze ikony przedmiotów w sklepie**
  (prawdziwe sylwetki broni z modeli gry, jeden styl).
- **Nowi gracze nie wiedzą, co robić** — samouczek / trening z botami / lepsze pierwsze minuty.
- **Lagi i słabe FPS** — zmierz i popraw na słabszych komputerach.
- **Brak powodu, żeby wracać** — wyzwania, poziomy, ranking, trofea. Tylko kosmetyka (L1, L5).

## 3. Plan pracy — każdy krok to JEDEN workflow

1. **Projekt** (~15 agentów): zwiad 6–8 soczewek (turniej dziś + przyczyna błędu drabinki; pokoje
   i zaproszenia w Colyseus; pojemność serwera + POMIAR N równoległych pojedynków na tej maszynie;
   oglądanie meczu w innym pokoju; zapis profilu i to, czego wymagają konta; menu i ikony; nowi
   gracze; wydajność klienta; powroty). Dla **turnieju** i **kont** po dwóch rywalizujących
   projektantów + sędzia; dla reszty po jednym projektancie. Synteza do `docs/V_SPEC.md`:
   pakiety o ROZŁĄCZNYCH plikach, pakiet szkieletu (wspólne pliki: protokół, schemat, typy, store)
   na początek, kryteria odbioru sprawdzalne testem/liczbą/zrzutem. Krytyk kompletności → poprawka.
   **Potem STOP: pokaż mi streszczenie (architektura turnieju, wynik pomiaru, pakiety) i pytania.
   Buduj dopiero po mojej akceptacji.**
2. **Szkielet**: jeden inżynier, kontrakt i wspólne pliki, z testami; inspekcja.
3. **Budowa**: wszystkie pakiety naraz, każdy w swoim worktree i gałęzi `u/<pakiet>`, każdy z
   inspekcją (i audytem, jeśli inspektor coś znalazł).
4. **Scalenie + bramka**: scalasz gałęzie ty (Ultron), potem `pnpm typecheck`, `pnpm test`,
   `pnpm build`, pełne e2e (samo na maszynie), galeria HUD we wszystkich scenach i 3 rozdzielczościach,
   plus test turnieju na ~20 klientach (boty/skrypt) z pomiarem serwera.
5. **Koniec**: wiersz w ledgerze `docs/PLAN_2_1.md` (+ Decisions, Deferred), commit, push, raport
   ≤ 20 linii ze zrzutami przed/po.

## 4. Tryb TURBO — jak masz być szybszy niż poprzednio (obowiązkowo)

Poprzednia sesja szła za wolno (godziny na falę). Zasady:
- **Jeden workflow na krok**, w środku `pipeline` (bez zbędnych barier). Nie odpalaj kilku
  workflow naraz na tych samych plikach.
- **Tańsze modele tam, gdzie wystarczą**: zwiad, pomiary i proste skrypty `model: 'sonnet'`,
  `effort: 'low'` lub `'medium'`. Najmocniejszy model tylko dla projektantów, inżynierów i audytora.
- **Jeden inspektor** (kod + zrzuty naraz) zamiast dwóch. Audytor tylko, gdy inspektor coś znalazł.
- **Maks. 1 poprawka (nagana) + 1 zastępca (degradacja)** na pakiet. Jeśli dalej źle — opisz mi
  problem w raporcie, bez kolejnych pętli.
- **Testy celowane**: agent uruchamia `npx vitest run <swoje pliki>`; pełne `pnpm test`, `pnpm build`
  i e2e raz, w bramce.
- **Galeria tylko dla swoich scen** (`--only`, 1600x900) w trakcie pracy; trzy rozdzielczości w bramce.
- **Raporty agentów ≤ 200 słów + file:line**, bez wklejania kodu. Duże pliki (TdmRoom.ts, Game.ts,
  Menu.tsx, spec) czytane zakresami, nigdy w całości.
- **Worktree per pakiet** (`git worktree add -b u/<pakiet> ../wt/<pakiet>`, potem
  `pnpm install --offline`), własny port Vite na pakiet (5201, 5202…).
- **Nie pytaj mnie w trakcie** — pytania tylko na końcu kroku 1 i przy zmianach L1–L7.

## 5. Zasady, których nie łamiesz

- L1–L7 z planu: nic nie jest blokowane poziomem ani pieniędzmi, nagrody tylko kosmetyczne, brak
  zakupów, autorytet serwera, tick i snapshot bez zmian bez mojej zgody.
- Nowe pola schematu i nowe pokoje wolno tylko dla tego, o co prosiłem (poczekalnia, areny,
  oglądanie, konta, trofea) — każde wypisz w V_SPEC.md jako decyzję.
- UI po polsku. Istniejące `data-testid` i testy e2e to kontrakt: zmiana = zmiana testu w tym samym
  pakiecie.
- Dowód albo nie było: każde twierdzenie = test, liczba, `file:line` albo zrzut w
  `apps/client/e2e/out/`.
- Commity: temat w trybie rozkazującym, treść mówi DLACZEGO. Nie pushuj do `main`; PR tylko na moją
  prośbę.

Zacznij od przeczytania `docs/ULTRON.md` i planu, potem powiedz mi w 3 linijkach, co zrobisz w
kroku 1, i od razu go uruchom.
