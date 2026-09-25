# ULTRON TURBO — drop V (turniej na 20 osób, konta, menu, nowi gracze, płynność, powroty)

Wklej wszystko od linii „PROMPT” do końca jako **pierwszą wiadomość nowego czatu Claude Code**
uruchomionego lokalnie w folderze `BarberStrike` (na gałęzi `claude/practical-bardeen-07gu1m`
albo nowszej). Lokalnie liczba agentów pracujących naraz = liczba rdzeni − 2, więc na 12–16
rdzeniach flota jest 5–7× szybsza niż w chmurze (4 rdzenie → 2 agenty naraz).

---

## PROMPT

Jesteś **ULTRON** z `docs/ULTRON.md`, w **trybie TURBO** (zasady niżej). Użyj narzędzia
Workflow (orkiestracja wielu agentów) — zgadzam się na nie. Najpierw przeczytaj
`docs/PLAN_2_1.md` (skill plan-keeper), potem działaj według planu poniżej. Pisz do mnie po
polsku, krótko.

### Zlecenie (moje odpowiedzi z wywiadu, 2026-09-25)

**Turniej 1v1 na ~20 osób** (dziś max 8, jeden pokój, pary grają po kolei — za wolno):
- pary grają **równolegle na osobnych arenach**; mecze jednej rundy drabinki idą naraz; do 32 miejsc;
- **gospodarz** zakłada turniej i dostaje **link zaproszenia**; wszyscy lądują w **poczekalni**
  (lista graczy, gotowość, czat); gra **nie startuje sama** — gospodarz klika START;
- puste miejsca to **wolne losy** (bez botów w drabince);
- mecz **do 6 wygranych rund** (obecne zasady pojedynku CS);
- kto odpadł lub czeka: **drabinka na żywo + czat połączone z oglądaniem dowolnego meczu**
  (z oczu gracza), plus **rozgrzewka z botami bez limitu miejsc**;
- wyjście z gry: **60 s na powrót** (miejsce i wynik zostają), potem walkower;
- serwer: **obecny VPS** — zmierz, ile równoległych aren + widzów udźwignie;
- zwycięzca: **trofeum/odznaka przy koncie** + **tablica sławy**.
- **Błąd do naprawy**: w tablicy Tab turnieju drabinka jest rozsypana — sklejone nicki
  („ZDZICHU0JANUSZ0”, „MIREKRYSIEK”), półfinał/finał jako same kreski (kompaktowa
  `BracketPanel` straciła style przy przenosinach CSS w dropie U).

**Konta**: login + hasło, bez e-maila; dalej można grać jako gość; staty, skiny, historia
turniejów i trofea przy koncie (drop H z planu).

**Reszta**: ładne **menu główne** (jak CS2/Valorant), dużo lepsze **ikony przedmiotów w sklepie**,
**nowi gracze** nie wiedzą, co robić (samouczek/trening), **lagi i słabe FPS**, **brak powodu,
żeby wracać** (wyzwania, poziomy, ranking — tylko kosmetyka, L1).

### Plan pracy (w tej kolejności, każdy krok = jeden workflow)

1. **Projekt (1 workflow, ~15 agentów):** zwiad 6–8 soczewek (turniej dziś, pokoje/zaproszenia,
   pojemność serwera + POMIAR N równoległych pojedynków na tej maszynie, oglądanie, zapis
   profilu, menu/ikony, nowi gracze, wydajność klienta, powroty) → dla **turnieju i kont** po
   dwóch rywalizujących projektantów + sędzia; dla pozostałych obszarów po jednym projektancie →
   synteza `docs/V_SPEC.md` z pakietami o rozłącznych plikach → krytyk → poprawka.
   **Potem STOP: pokaż mi streszczenie i pytania. Buduj dopiero po mojej akceptacji.**
2. **Szkielet (1 workflow):** pakiet kontraktu (wspólne pliki: protokół, typy, store) sam, z testami.
3. **Budowa (1 workflow):** wszystkie pakiety naraz, każdy w swoim worktree, inspekcja + audyt.
4. **Scalenie + bramka:** scal gałęzie, typecheck/test/build, e2e (sam na maszynie), galeria HUD.
5. **Ledger** w `docs/PLAN_2_1.md`, commit, push, raport ≤ 20 linii ze zrzutami przed/po.

### Tryb TURBO — jak Ultron ma być szybszy (obowiązkowo)

- **Jeden workflow na krok, wszystkie niezależne rzeczy w nim równolegle** (`pipeline`, nie
  bariery). Nie odpalaj kilku workflow naraz na tych samych plikach.
- **Tańsze modele tam, gdzie się da:** zwiad i proste skrypty `model: 'sonnet'`,
  `effort: 'low'`/`'medium'`; najmocniejszy model tylko dla projektantów, inżynierów i audytu.
- **Jedna inspekcja zamiast dwóch:** inspektor kod+oko w jednym agencie; audytor tylko wtedy, gdy
  inspektor coś znalazł (przy PASS audyt robi losowe 2 sprawdzenia, `effort: 'low'`).
- **Maks. 1 poprawka + 1 zastępca** na pakiet, potem problem trafia do mnie w raporcie — bez
  pętli.
- **Testy celowane, nie całość:** agent odpala `vitest` tylko dla swoich plików; pełne
  `pnpm test` i `pnpm build` raz, na końcu, przez kwatermistrza. E2E tylko w bramce, sam na
  maszynie (porty 2567/5174).
- **Galeria HUD tylko dla scen pakietu** (`--only`), jedna rozdzielczość w trakcie pracy, trzy
  w bramce.
- **Raporty agentów ≤ 200 słów + file:line**, żadnego wklejania kodu; spec czytany zakresami
  (`grep -n '^#'`), nigdy w całości.
- **Worktree per pakiet** w `../wt/<pakiet>` z `pnpm install --offline`; każdy pakiet ma swój
  port Vite (5201+).
- **Commity robią inżynierowie w swoich gałęziach `u/<pakiet>`**; scala tylko Ultron.
- **Nie czekaj na mnie w trakcie** — pytaj tylko na końcu kroku 1 i przy decyzjach z L1–L7.

### Zasady, których nie łamiesz
Decyzje L1–L7 z planu (nic nie jest blokowane, nagrody tylko kosmetyczne, autorytet serwera,
tick i snapshot bez zmian bez mojej zgody). Nowe pola schematu: wolno tylko dla tego, o co
prosiłem (konta, poczekalnia, areny, trofea) i każde wypisz w spec jako decyzję. UI po polsku.
Istniejące `data-testid` i testy e2e to kontrakt.

---

## Kolejne wiadomości (wklejaj, gdy Ultron o to poprosi albo gdy trzeba)

**Po projekcie, gdy spec ci się podoba:**
> Akceptuję docs/V_SPEC.md. Odpowiedzi na pytania: <tu twoje odpowiedzi>. Ruszaj z krokiem 2 (szkielet), potem 3 (budowa wszystkich pakietów naraz), 4 (scalenie + bramka) i 5 (ledger, push, raport). Tryb TURBO.

**Gdy chcesz coś zmienić w projekcie:**
> Zanim budujesz, zmień w V_SPEC.md: <co>. Pokaż mi tylko różnice.

**Gdy trafisz na limit użycia i potem wrócisz:**
> Limit się zresetował. Sprawdź stan (git log, gałęzie u/*, journal ostatniego workflow) i wznów przerwany workflow przez resumeFromRunId. Nie zaczynaj od nowa.

**Gdy chcesz wiedzieć, na czym stoimy:**
> Na czym stoimy? Krótko: co gotowe, co trwa, co zostało, ile agentów pracuje.

**Gdy chcesz zobaczyć efekt:**
> Uruchom galerię HUD i pokaż mi zrzuty przed/po dla: menu, poczekalni turnieju, drabinki, oglądania meczu, ekranu zwycięzcy.

**Gdy chcesz zagrać lokalnie:**
> Odpal grę lokalnie (serwer + klient) i podaj mi adres do przeglądarki.

**Na koniec:**
> Otwórz PR z claude/practical-bardeen-07gu1m do main z opisem dropów U i V.

## Ściąga: gdzie czego szukać

| Co | Gdzie |
|---|---|
| Plan projektu, ledger, decyzje, odłożone | `docs/PLAN_2_1.md` |
| Zasady Ultrona (floty agentów) | `docs/ULTRON.md` |
| Spec przebudowy UI (drop U) | `docs/UI_U_SPEC.md` |
| Spec turnieju/kont/menu (drop V, powstanie) | `docs/V_SPEC.md` |
| HUD w grze (komponenty) | `apps/client/src/ui/hud/` (+ `ui/Hud.tsx`) |
| Menu, sklep, drabinka, wyniki | `apps/client/src/ui/Menu.tsx`, `Shop.tsx`, `Bracket.tsx`, `MatchResult.tsx` |
| Zasady trybów, turniej, czasy rund | `packages/shared/src/modes.ts`, `tournament.ts`, `cs.ts` |
| Serwer gry (pokoje) | `apps/server/src/rooms/TdmRoom.ts`, `apps/server/src/index.ts` |
| Galeria stanów HUD (zrzuty) | `node apps/client/e2e/tools/hud-states.mjs --label <nazwa>` → `apps/client/e2e/out/u/<nazwa>/` |
| Porównanie zrzutów | `node apps/client/e2e/tools/hud-diff.mjs --a before --b <nazwa>` |
| Testy | `pnpm test`, `pnpm typecheck`, `pnpm build`; e2e: `cd apps/client && set PW_WEBSERVER=1 && npx playwright test` |
| Uruchomienie gry lokalnie | `pnpm dev` → klient http://localhost:5174 |
