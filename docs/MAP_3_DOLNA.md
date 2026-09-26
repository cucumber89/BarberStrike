# MAP 3 — DOLNA: prompt na mapę turniejową 1 v 1 (działka + ulica)

**Status: szkic promptu do wklejenia, 2026-09-26. Drop G (kolejna mapa). Kod gry nietknięty —
właściciel pracuje lokalnie.** Ten plik jest tym, o co poprosił właściciel: promptem, który wkleja
się do innego czatu, żeby ten wygenerował **właściwy prompt** (brief wykonawczy) dla sesji Claude
Code w tym repo. Każda liczba w §4 pochodzi z kodu na dzień 2026-09-26 (Załącznik A podaje
`file:line`); nic nie jest zgadywane. §5 (układ) jest propozycją z narady projektantów (Załącznik B)
— do zmierzenia, nie do wiary.

## Jak tego użyć

1. Skopiuj wszystko między `=== POCZĄTEK PROMPTU ===` a `=== KONIEC PROMPTU ===` do czatu z obsługą
   obrazów (Claude / ChatGPT) i **dołącz trzy zdjęcia**: (1) Street View wzdłuż ulicy, (2) front
   domu zza ulicy, (3) widok satelitarny 3D.
2. Czat odda **PROMPT WYKONAWCZY**. Przeczytaj jego §9 (pytania do właściciela), wpisz odpowiedzi
   (albo zostaw domyślne) i sprawdź, że §4 (liczby) przepisał bez zmian.
3. Wklej prompt wykonawczy jako ZLECENIE na końcu `docs/ULTRON.md` (albo po `docs/MASTER_PROMPT.md`)
   w nowej sesji Claude Code w repo BarberStrike. Sesja ma najpierw napisać projekt na papierze
   (sekcja „Projekt” w tym pliku), dostać podpis, a dopiero potem geometrię.

Skrót: ten blok można też wkleić **bezpośrednio** do Claude Code, zmieniając pierwsze zdanie §0 na
„Jesteś sesją wykonawczą w repo BarberStrike; zamiast pisać prompt — wykonaj §6 od kroku 1”.

---

=== POCZĄTEK PROMPTU ===

## 0. Twoja rola i co masz oddać

Jesteś projektantem poziomów (level designer po latach w Counter-Strike'u) i redaktorem technicznym.
Dostajesz: (a) trzy zdjęcia prawdziwego miejsca, (b) opis tego miejsca i zmian, jakie właściciel chce
w nim wprowadzić (§2), (c) wymagania rozgrywki (§3), (d) twarde fakty o silniku gry i jej pipeline
map (§4) — przepisane z kodu, nie do dyskusji, (e) propozycję układu (§5) i (f) porządek pracy sesji,
która mapę zbuduje (§6–§9).

Masz oddać JEDEN dokument: **PROMPT WYKONAWCZY** dla agenta (Claude Code) pracującego w repozytorium
gry BarberStrike, który zaprojektuje, zmierzy i zbuduje mapę **DOLNA**. Nie buduj mapy sam, nie pisz
kodu. Format wyjścia jest w §10 — trzymaj się go co do sekcji.

Zasady dla Ciebie:
- Piszesz po polsku; identyfikatory, nazwy plików, pól i materiałów zostają po angielsku, dokładnie
  tak, jak w §4.
- **Nie wymyślasz faktów o repo.** Wszystko, co wiesz o kodzie, jest w §4. Jeśli czegoś tam nie ma,
  a jest potrzebne, wpisujesz to jako pytanie do §9 promptu wykonawczego („sprawdź w kodzie: …”),
  nie jako fakt.
- Liczby z §4 przepisujesz dosłownie (jednostki: metry, sekundy, m/s). Liczby projektowe z §2 i §5 są
  szacunkami — oznaczasz je „do zmierzenia” tam, gdzie tak są oznaczone tutaj.
- Zdjęcia są ważniejsze niż mój opis w §2; notatki właściciela są ważniejsze niż zdjęcia. Gdzie
  zdjęcie i opis się różnią — powiedz to i zostaw pytanie w §9.
- Prompt wykonawczy ma być kompletny bez tego dokumentu: agent, który go dostanie, nie zobaczy ani
  zdjęć, ani tego tekstu. Dlatego opis miejsca (§2) przepisujesz w całości, po swojemu, ale bez
  utraty żadnego obiektu ani wymiaru.

## 1. Gra i tryb, w którym mapa będzie grana

**BarberStrike** (repo `BarberStrike`, pakiet `frankibarber-after-hours`) — przeglądarkowy FPS na
małe grupy: Babylon.js na kliencie, Colyseus na serwerze, wspólny pakiet `packages/shared` w czystym
TypeScript (kolizje, ruch, hitscan, dane map). Serwer jest autorytatywny: tick symuluje ciała graczy
tymi samymi funkcjami, którymi klient przewiduje ruch. Mapa to **dane**, nie scena: lista
prostopadłościanów (`solids`) z tagiem materiału, lista rekwizytów bez kolizji (`props`), świateł,
spawnów, stacji zakupów, flag i miejsc bomby. Klient rysuje to sam, proceduralnie. Motyw gry: zakład
fryzjerski (barber) jako mechanika — ogolenie, fryzury, skiny.

Mapa DOLNA powstaje pod **tryb `duel` (1 v 1) i turniej**, ale musi przejść ten sam zestaw testów, co
każda mapa (§4.6), więc dostaje też spawny drużynowe, spawny areny, stacje, flagi i miejsca bomby.

Zasady duelu (`packages/shared/src/modes.ts`, stała `DUEL`), jak w CS:
- **15 s zamrożenia** z otwartym sklepem (`prepMs`), sklep otwarty jeszcze **5 s** po starcie
  (`buyTailMs`); runda **60 s** (`roundMs`); przerwa 5 s (`breakMs`); **pierwszy do 6** rund
  (`wins`); **zmiana stron co 3 rundy** (`halfRounds: 3`); limit meczu 15 min (`matchMs`).
- Zabójstwo wygrywa rundę, wymiana to remis, zegar oddaje rundę temu, kto ma więcej HP.
- Ekonomia CS (`cs.ts`, `CS_ECONOMY`): $800 na start połowy, $3 250 za wygraną, drabinka za
  przegrane od $1 400, limit $16 000, kasa za zabójstwo wg broni; jedyna różnica: **podłoga $2 500**
  w każdej rundzie poza pierwszą w połowie. Kto przeżył, zachowuje broń; kto zginął, wraca z
  pistoletem.
- Bez perków i bez granatnika w tym trybie (`modeAllowsItem`). Granaty są (`grenades.ts`): frag
  (promień 6 m), molotov (3.2 m, 6 s), nóż, flash (14 m), smoke (3.5 m, 12 s).
- **Obaj gracze startują na PIERWSZYM punkcie spawnu swojej strony** (`apps/server/src/rooms/
  TdmRoom.ts:1445`: `map.spawns.find(v => v.team === side)`), bez losowania. Pozostałe spawny strony
  są dla innych trybów.
- Turniej: w pokoju (`turniej`, 4 lub 8 osób, pary po kolei) i lobby z równoległymi arenami (do 32
  uczestników, każda para w osobnym pokoju `tdm mode=duel`). Każda arena duelu **wymusza mapę
  `DUEL_MAP_ID`** (`TdmRoom.ts:359`), dziś `gora`. DOLNA musi więc albo zastąpić GÓRĘ, albo wymagać
  małej zmiany, żeby duel przyjmował mapę z lobby (§9, pytanie P1).

## 2. Miejsce — co jest na zdjęciach i co właściciel zmienia

Prawdziwe miejsce: **ul. Dolna**, gruntowa uliczka na przedmieściu (Mazowsze), zdjęcia z marca, w
słońcu. Mapa obejmuje **jedną działkę z domem i odcinek ulicy przed nią** (to, co stoi po drugiej
stronie ulicy, jest drugą krawędzią mapy). Nazwa mapy: **DOLNA**, id `dolna`.

Trzy zdjęcia:

**Z1 — Street View, wzdłuż ulicy** (kamera na środku drogi, patrzy wzdłuż niej).
- Droga gruntowa, piaszczysto-błotna, ok. **5–6 m** szerokości, koleiny i kałuże, bez krawężników;
  biegnie prosto **≥ 150 m** do skrzyżowania z asfaltem (tam latarnia uliczna).
- **Lewa strona (strona działki):** wysoki, gęsty **żywopłot z tui (3–4 m)** wzdłuż granicy, dalej
  **brązowy drewniany płot sztachetowy (~1.6 m)** na betonowym cokole ze słupkami; za nim dom: białe
  tynki, **kopertowy dach z brązowej dachówki, dwa kominy**; dwa **betonowe słupy energetyczne** z
  przewodami tuż przy jezdni; dalej kolejne płoty, tuje i domy sąsiadów.
- **Prawa strona:** rząd wysokich **sosen (15–20 m, gołe pnie, korony wysoko)** na piaszczystym
  poboczu; za nimi **nowoczesny biały dom-kostka w budowie** (płaski dach, ciemne pasy okien),
  ogrodzony **siatką budowlaną na słupkach** i drewnianym parkanem; przy drodze **niebieska toaleta
  przenośna (toi-toi)** i **kontenery/kubły budowlane**; dalej po prawej **zaparkowane: ciemne auto
  osobowe i biały dostawczak (van)** na poboczu.

**Z2 — front domu, zza ulicy** (dom nr 17).
- Dom **piętrowy, ok. 10 × 10–11 m** w rzucie (szacunek do potwierdzenia), białe/kremowe tynki,
  **dach kopertowy** z brązowej dachówki, dwa ceglane kominy. Parter od frontu: **dwie ciemne bramy
  garażowe** (lewa cofnięta, w niszy; prawa w licu ściany) — garaż na dwa auta w bryle domu; piętro:
  dwa okna z roletami, między nimi lampa ścienna; tabliczka „17” przy prawym narożniku na ~2.5 m.
- **Płot frontowy**: brązowe pionowe sztachety z prześwitami, **~1.6 m**, słupki betonowe, cokół;
  **furtka** (ok. 1 m) na lewo od środka, **brama wjazdowa dwuskrzydłowa (ok. 3–3.5 m)** po prawej,
  prowadzi na podjazd do garażu; skrzynka na listy na słupku.
- Po lewej domu **3–4 wysokie tuje (6–7 m)** i żywopłot; po prawej tuje i krzewy; za domem po prawej
  **dom sąsiada** (szaro-brązowy dach dwuspadowy) i coś pod ciemną plandeką (auto/przyczepa).
- Przed płotem: piaszczyste pobocze i droga.

**Z3 — widok satelitarny 3D** (rozmyta siatka 3D; kierunki do potwierdzenia).
- Działka **prostokątna, ok. 22–25 m szeroka i 40–50 m głęboka** (szacunek), dom w przedniej części,
  **trawnik** z tyłu i z boku; ulica „Dolna” biegnie wzdłuż górno-lewej krawędzi (stoi tam
  zaparkowane ciemne auto); numer „19” na sąsiedniej działce po lewej.
- Na jednej z elewacji **balkon z jasną balustradą** na piętrze, pod nim ciemny otwór/wnęka na
  parterze; na sąsiedniej elewacji mały **taras/ganek ze schodkami**.
- W ogrodzie: **zielona zjeżdżalnia** (plac zabaw) na trawniku, kilka drzew, szpalery tui na
  granicach; w rogu przy płocie (dolny-lewy róg zdjęcia) **altana/wiata z brązowym dachem**; domy
  sąsiadów z brązowymi dachami z dwóch stron.
- ⚠ **Niejasność do rozstrzygnięcia:** na Z2 front (z bramami garażowymi) nie ma balkonu, a na Z3
  balkon wydaje się być na elewacji od strony ulicy. Najprawdopodobniej balkon jest na **elewacji
  ogrodowej lub bocznej** — właściciel ma to potwierdzić (§9, P2), a agent wykonawczy ma dostać
  jednoznaczny szkic: która ściana domu jest frontem (bramy), która ma balkon, gdzie jest altana.

**Zmiany właściciela (to jest „mapa”, nie rzeczywistość — obowiązują bezwzględnie):**
1. **Pod balkonem stoi duży CZARNY BARAK — to jest BARBER SHOP.** Czarna, prostokątna, parterowa
   buda (proponowane **8 × 4 m, 2.8 m wysokości**, do potwierdzenia), przylegająca do domu pod
   balkonem albo tuż przy nim; w środku fotele fryzjerskie, lustra, lada, neon; drzwi i najlepiej
   drugie wyjście, żeby był to korytarz walki, nie ślepy pokój.
2. **Tam, gdzie na Z3 jest altana przy płocie, stoi OGROMNY BLASZANY GARAŻ — DETAILING SAMOCHODÓW.**
   Hala z blachy falistej (proponowane **12 × 7 m, 4 m wysokości**, do potwierdzenia), duża brama
   rolowana (otwarta) od strony ogrodu/podjazdu, małe drzwi z boku; w środku auto na podnośniku,
   szafki narzędziowe, beczki, opony, wąż, jarzeniówki.
3. Reszta jak na zdjęciach: dom z garażem w bryle, płot ze sztachet z furtką i bramą, tuje na
   granicach, ulica przed działką, po drugiej stronie sosny, budowa, toi-toi, kontenery, van i auto,
   słupy energetyczne z przewodami.

Co jest **w grze** (można tam wejść): cała działka (podjazd, garaż w domu, barak, blaszana hala,
ogród, przejścia między domem a tujami), płot z furtką i bramą, ulica na całym odcinku mapy,
pobocze po drugiej stronie z sosnami, toi-toiem i kontenerami, i najwyżej **parter/szkielet domu w
budowie** jako drugi kraniec. **Tłem**: piętro domu (zamknięte; balkon tylko wizualnie), domy
sąsiadów, dalsza część ulicy poza granicą mapy, korony sosen.

## 3. Wymagania rozgrywki — „jak z CS:GO, klarowna, prosta”

Właściciel: *„mapa pod turniej, taka jak z CS:GO — klarowna, prosta, ale daje dużo możliwości osłony
odpowiednich do wielkości gracza; możliwość walki na bardzo daleko, ale i blisko; dobrze odwzorowana,
mapa obejmuje działkę i ulicę przed”.* Przetłumaczone na wymagania, które da się zmierzyć:

- **R1. Trzy czytelne strefy walki, jedna długa linia.** (a) **ULICA** — jedna prosta, długa linia
  strzału **50–70 m** (dystans DMR / snajperki, §4.3), przerywana osłonami (van, auto, słupy,
  kontenery, toi-toi), ale z co najmniej jednym miejscem, z którego widać cały odcinek;
  (b) **PODJAZD / FRONT** — dystans średni **12–25 m** (brama, furtka, płot, podjazd, front garażu);
  (c) **WNĘTRZA** — barak barbera, garaż w domu, blaszana hala: **< 10 m**, narożniki, drzwi, osłona
  z foteli, auta, szafek. Gracz wybiera dystans swoim ruchem, nie losem.
- **R2. Dwa–trzy wejścia z ulicy na działkę** (brama wjazdowa, furtka, ewentualnie dziura w płocie /
  przejście przy tujach) i **dwie–trzy drogi przez działkę** (przez garaż domu, przez barak, wzdłuż
  tui). Żadna droga nie jest ślepa; każde wnętrze ma dwa wyjścia.
- **R3. Osłona mówi jednym językiem, dopasowanym do gracza** (ciało 0.70 m szer. × 1.80 m; kucnięcie
  1.25 m; oczy 1.62 / 1.08 m): **0.8 m** — niska, można na nią wskoczyć (skrzynia, opona, ławka);
  **1.3–1.5 m** — kucnięcie chowa całego, stojąc wystaje głowa, NIE DA SIĘ na nią wejść (mantle to
  1.25 m) — płot sztachetowy, auto, kontener; **≥ 2.0 m** — pełna (van, toi-toi, barak, hala,
  ściany); **≥ 2.8 m** — konstrukcje, na które nikt nie wchodzi. Każda osłona jest szersza niż ciało
  (**≥ 0.9 m**) albo świadomie „częściowa” (słup 0.35 m). Osłona wizualna bez bryły kolizyjnej jest
  błędem (§4.7).
- **R4. Starty ukryte i równe.** Oba starty niewidoczne z siebie nawzajem (stojąc i kucając, w obie
  strony); z każdego startu **≥ 3 wyjścia w 15 m ścieżki**; czasy sprintu do tych samych miejsc
  kluczowych (brama, garaż, barak, hala, środek ulicy, drugi start) **różnią się ≤ 250 ms** (miara
  GÓRY: 0 ms dzięki symetrii 180°; tu, na prawdziwym miejscu, dopuszczamy 250). Asymetrię stron
  wyrównuje zmiana stron co 3 rundy — ale runda decydująca (11.) jest grana na tej stronie, którą
  da zmiana, więc ≤ 250 ms to warunek, nie życzenie.
- **R5. Linie wzroku z liczbami:** mediana czystej linii między dwoma osiągalnymi punktami **8–12 m**,
  p90 **≤ 25 m**, jedna linia **≥ 50 m** (ulica) i żadna dłuższa niż ulica w granicach mapy. Żadne
  miejsce nie widzi obu startów. Żadna wyżej położona pozycja nie jest osiągalna z jednej strony
  szybciej niż z drugiej o więcej niż 250 ms.
- **R6. Nic nie wychodzi z mapy, nic nie lata.** Tuje, płoty, siatki i niewidzialne ściany zamykają
  arenę; test łańcucha wspinaczek (§4.6, wzór `gora.test.ts`) dowodzi, że **nikt nie wejdzie na dach
  domu, hali ani baraka**, chyba że projekt świadomie robi z dachu hali perch (wtedy jest osiągalny
  schodami/drabiną z obu stron w równym czasie i ma lip 1.35 m jak GÓRA). Każda bryła stoi na ziemi
  albo na innej bryle.
- **R7. Rozmiar:** ulica **60–70 m** długości w granicach mapy, działka **~24 × 45 m**, całość rzędu
  **70 × 45–50 m**. To trzy–cztery razy więcej niż GÓRA (34 × 22 m) — cena za długą linię. Runda ma
  60 s: mapa musi być tak czytelna, żeby dwie osoby znalazły się w 10–15 s (starty ~35–45 m ścieżki
  od siebie, nie więcej).
- **R8. Odwzorowanie:** każdy obiekt ze zdjęć jest na mapie w swojej pozycji względem domu i ulicy
  (lista w §2); proporcje domu, płotu, bramy i szerokości ulicy trzymają się szacunków ±20 %.
  Stylistyka gry to **noc + low-poly na serio** (§4.8): dom, tuje, sosny, blacha i sztachety mają być
  rozpoznawalne z sylwetki, nie z tekstury.
- **R9. Callouty po polsku**, krótkie, jedno słowo, na każde miejsce, np.: ULICA, SOSNY, BUDOWA, VAN,
  TOJ (toi-toi), SŁUP, BRAMA, FURTKA, PODJAZD, GARAŻ, BARAK, FOTEL, HALA, PODNOŚNIK, TUJE, OGRÓD,
  ZJEŻDŻALNIA, BALKON. Identyfikatory w kodzie po angielsku, teksty widoczne po polsku.
- **R10. Inne tryby też muszą działać** (testy są wspólne): ≥ 6 spawnów na drużynę (pierwszy = start
  duelu), spawny areny (FFA / Gun Game / Ostrzyżeni), 3 stacje zakupów rozrzucone > 30 m w osi x,
  flagi A/B/C > 14 m od siebie, dwa miejsca bomby po przeciwnych stronach z równym dojściem,
  `huntSpawnMinM` dobrane do rozmiaru mapy (GÓRA: 6 m na 39 m przekątnej; NIGHT_DISTRICT: 14 m na
  121 m).

## 4. Fakty o silniku i pipeline map (przepisane z kodu, 2026-09-26)

### 4.1 Układ współrzędnych i jednostki
Metry. `+X` = wschód, `+Y` = góra, `+Z` = północ; `yaw 0` patrzy w `+Z`. Podłoga zwykle na `y = 0`
(bryła podłogi od `y = −1` do `0`). Każda bryła to AABB: `boxFrom(minX, minY, minZ, sizeX, sizeY,
sizeZ)`; bryły nie obracają się (pole `yaw` obraca tylko „ubranie” bryły z `look`).

### 4.2 Gracz i ruch (`packages/shared/src/constants.ts` `PLAYER`, `movement.ts` `MOVE`)
- Ciało: `halfWidth 0.35` (0.70 m szer.), `height 1.8`, `crouchHeight 1.25`, `eyeHeight 1.62`,
  `crouchEyeHeight 1.08`; głowa = górne 18 % ciała (`headFraction`).
- Prędkości: chód **5.4 m/s**, sprint **7.6**, kucanie 2.7; slide z sprintu (~0.8 s); tac-sprint na
  budżecie.
- Skok: `jumpVelocity 6.4`, `gravity −22` → **apex 0.93 m**; `stepHeight 0.4` (stopnie ≤ 0.4 m
  przechodzi się bez skoku; GÓRA używa 0.3334); w powietrzu kucnięty „mantle” `airStepCrouch 0.32`
  → **najwyższa krawędź, na którą da się wejść: 1.25 m** (`gora.test.ts`: MANTLE = 0.931 + 0.32).
  **Skok z rozbiegu przenosi 4.43 m** w poziomie (`gora.test.ts`: REACH). Siatka chodu botów: 0.5 m,
  jump-up 0.88 m (`mapWalk.ts`).
- Stąd język osłon: 0.8 (wskoczyć), 1.3–1.5 (nie wejdziesz; 1.35 chowa kucniętego, stojąc widać
  głowę), ≥ 2.0 pełna, ≥ 2.8 konstrukcje. **Gracz na aucie 1.45 m + mantle 1.25 = 2.7 m** — wszystko
  poniżej 2.7 m obok auta jest osiągalne; sprawdza to test łańcucha (§4.6).

### 4.3 Bronie — zasięgi (`packages/shared/src/weapons.ts`; `range` = pełne obrażenia do, `rangeMax` = minimum od)

| broń | obrażenia | range / rangeMax (m) |
|---|---|---|
| pistol P9 | 26 | 22 / 45 |
| revolver R-44 | 55 | 28 / 55 |
| machinepistol MP-11 | 17 | 11 / 27 |
| smg K-7 | 18 | 16 / 38 |
| smg2 VZ-9 | 15 | 13 / 32 |
| carbine C-20 (półauto) | 34 | 38 / 78 |
| rifle AR-31 (auto) | 27 | 32 / 70 |
| lmg MG-4 | 24 | 34 / 75 |
| shotgun S12 | 9 × 10 | 9 / 22 |
| autoshotgun SG-6 | 11 | 7 / 18 |
| dmr M-1 | 63 | 60 / 120 |
| sniper SR-50 (głowa = kill na każdym dystansie) | 85 | 100 / 200 |
| clippers (melee) | 45 | 2.1 |

Wniosek: „bardzo daleko” w tej grze to **40–70 m** (DMR / snajperka / carbine; karabin już z
falloffem), „średnio” 15–30 m, „blisko” < 10 m (strzelby, SMG). Obrażeń i zasięgów **nie wolno
zmieniać** (decyzja L6 w `docs/PLAN_2_1.md`).

### 4.4 Format mapy (`packages/shared/src/map.ts`)

```
MapDef   { id, name, solids: Solid[], props: PropHint[], lights: LightHint[], spawns: SpawnPoint[],
           arenaSpawns?: SpawnPoint[], stations: Station[], flags: Flag[], sites?: BombSite[],
           huntSpawnMinM?: number, killY: number, bounds: Box }
Solid    { box: Box, mat: MaterialTag, name?, invisible?: boolean, look?: SolidLook, yaw? }
PropHint { kind: PropKind, x, y, z, yaw?, scale?, text?, color?, variant?, w?, h? }
LightHint{ kind: "point"|"spot", x, y, z, color, intensity, range, dx?, dy?, dz?, angle?, shadows?, priority? }
SpawnPoint { x, y, z, yaw, team: 0|1 }   Station { x, y, z, name }   Flag { id, name, x, y, z }
BombSite { id, name, x, y, z }
```

- **Kolizja = `box`**, zawsze. Bryła bez `look` rysuje się jako pudełko z materiałem (UV kafelkowane
  1 jednostka/m, cięte na ≤ 12 m); bryła z `look` jest „ubrana” jako obiekt (koła, drzwi, żebra)
  **wewnątrz** swojego boxa (`apps/client/src/game/world/dressing.ts`). `invisible: true` = tylko
  kolizja (ściany graniczne).
- `MaterialTag` — wszystkie istniejące (**nowy tag = nowy wpis w `SPECS` w
  `apps/client/src/game/world/materials.ts`, inaczej `pnpm typecheck` pada; i nowa siatka w każdej
  strefie 12 m / 24 m, więc najpierw użyj istniejących**): `wall_sand wall_teal floor_tile
  floor_concrete floor_wood floor_asphalt floor_metal wall_plaster wall_brick wall_tile wall_concrete
  wall_panel ceiling counter wood metal paint glass mirror leather brass rubber none paint_red
  paint_blue paint_green paint_white paint_yellow paint_orange corrugated_red corrugated_blue
  corrugated_green glass_dark glass_car fence concrete_block soil foliage`.
  Dopasowania dla DOLNEJ: droga gruntowa → `soil`; podjazd → `floor_concrete`; tynk domu →
  `paint_white` / `wall_plaster`; dachówka → `paint_red` / `wall_brick` (bryła dachu); sztachety →
  `wood`; tuje i żywopłot → `foliage` (bryła 3 m — pełna, nieprzejrzysta osłona; zatrzymuje kule jak
  każda bryła); pnie sosen → `wood` (słupy 0.6 m, korona jako `foliage` wysoko); czarny barak →
  `wall_panel` (ciemny) + `glass_dark`; blaszana hala → `corrugated_blue / green / red` (szarej nie
  ma; albo dodać `corrugated_grey` z pomiarem draw-calli); siatka budowlana → `fence` (**cutout:
  widać przez nią, ale bryła zatrzymuje kule** — tylko na granicy mapy, nigdy jako osłona w środku);
  słupy energetyczne → `concrete_block`; toi-toi → `paint_blue`; kontenery → `look: "skip"` /
  `"dumpster"`; auta → `look: "car"` (1.45 m) / `"van"` (2.0+ m).
- `SolidLook` (gotowe „ubrania” bryły): `van car truck container dumpster crate lockers drums planter
  cabinet bin pallets machine skip shelter_roof portacabin kiosk_counter`. Nieznany look **cicho**
  rysuje zwykłe pudełko (`dressing.ts`, gałąź `default`), więc nowy look trzeba naprawdę
  zaimplementować i obejrzeć. `planter` rysuje krzaki z `foliage` (może udawać niski żywopłot).
- `PropKind` (bez kolizji, tylko wygląd): `barber_chair mirror shelf sign lamp trash crate dumpster
  pole sink counter_top neon graffiti vent poster bottle_row towel_stack board clippers terminal
  receipt sticker tube_light cable pendant wheel ac_unit pipe barber_pole`. `lamp` ma warianty
  `post | wall | head`; `pole` (słup 0.12 m × h) i `cable` (przewód) są do słupów energetycznych;
  `wheel` = opona (detailing); `neon` z `text`. **Rekwizyt nigdy nie jest osłoną** — fotel fryzjerski
  w GÓRZE ma pod sobą niewidzialną bryłę 0.8 × 1.45 × 0.9 m; tu tak samo.
- Światła: paleta nazwana `DISTRICT_LIGHTS = { amber "#ffbf70" (front, publiczne), mercury "#9adce5"
  (praca, serwis), accent "#fa709a" (tylko szyldy) }` — używać tych trzech + księżyc. Limity: ≤ 2
  generatory cieni (tylko światła z `shadows: true`), materiały mapy liczą ≤ 5 świateł naraz
  (rekwizyty 4); każde światło ma sferę zasięgu, poza którą `buildMap` wyklucza je z siatek;
  `LIGHT_GAIN 1.4`. Księżyc: kierunkowy, jedyny rzucający cień, renderowany raz (świat statyczny).
  Niebo i mgła są **globalne** (`MapBuilder.ts:282–283`: poza NIGHT_DISTRICT `fogDensity 0.012`,
  `fogColor (0.035, 0.035, 0.05)`) — mapa jest **nocna**; dzień wymagałby zmiany `MapBuilder`, nie
  danych mapy (§9, P3).

### 4.5 Rejestracja mapy i wybór mapy duelu
- Nowa mapa = nowy plik `packages/shared/src/dolna.ts` eksportujący `DOLNA: MapDef` (wzór:
  `gora.ts`, 313 linii, z helperami `S()` / `O()` i tabelą `GORA_EXTENTS` dla narzędzi), wpis w
  `MAPS` i `MAP_ORDER` (`map.ts:647–657`). Minimapa (`apps/client/src/ui/Minimap.tsx:76`) i rozmiar w
  menu (`Menu.tsx`, `mapSize`) liczą się same z `solids` / `bounds`.
- Duel i turniej **wymuszają** `DUEL_MAP_ID` (`map.ts:656`; `TdmRoom.ts:359`; `Menu.tsx:460` filtruje
  listę map do tej jednej; `Loading.tsx:39` tak samo; `apps/client/src/gallery/fixtures.ts:213`).
  Żeby DOLNA była wybieralna obok GÓRY: lista `DUEL_MAP_IDS` zamiast jednej stałej, `TdmRoom`
  przyjmuje `options.map`, jeśli jest na liście, a lobby turnieju (`TournamentLobbyRoom.ts:91, 230`)
  już dziś przekazuje `map` do aren. To zmiana poza danymi mapy — w prompcie jako osobny, mały
  pakiet, po decyzji właściciela (§9, P1).
- **Dekoracje dzielnicy nie działają na innych mapach**: `hasDistrictDressing(map)` = `map.id ===
  "night_district"` (`MapBuilder.ts:59`); `architecture.ts` / `streetscape.ts` są przypięte po nazwach
  brył NIGHT_DISTRICT. Wszystko na DOLNEJ musi być w danych mapy (bryły z `look`, rekwizyty, światła).
- Plany taktyczne (`plans.ts`) są przypięte do `NIGHT_DISTRICT.solids` — DOLNA ich nie dostaje.
- `sites` **trzeba** zdefiniować (dwa, A/B), bo `sitesOf(map)` bez nich wraca do współrzędnych
  NIGHT_DISTRICT (x −35 / 43, `bomb.ts:48`), które na małej mapie leżą poza granicą.

### 4.6 Testy, które mapa musi przejść (odpalane dla każdej mapy w `MAPS`; `pnpm test`)
`packages/shared/src/map.test.ts`:
- ≥ **6 spawnów na drużynę**; każdy z podłogą ≤ 0.7 m pod stopami i wolną objętością 0.7 × 1.8 m;
  każdy `arenaSpawn` tak samo i osiągalny; wszystkie spawny w `bounds` i nad `killY`.
- Wszystkie spawny **połączone pieszo** na siatce 0.5 m (krok 0.4, jump-up 0.88); zbiór osiągalny
  **> 400 komórek** (GÓRA: 1 940 osiągalnych z 2 816).
- **Żaden spawn drużyny 0 nie widzi żadnego spawnu drużyny 1** (raycast oko–oko na 1.62 m).
- Rekwizyty w `bounds`, kotwica nie w bryle; rekwizyty ścienne (`sign board poster graffiti neon
  sticker vent ac_unit mirror shelf`) ≤ 0.12 m od bryły (0.3 dla `shelf` / `ac_unit` / `sign`);
  podłogowe (`trash crate dumpster pole barber_chair wheel`, `lamp` post) z gruntem ≤ 0.5 m pod
  kotwicą; `lamp head` tuż nad słupem.
- **≥ 3 stacje zakupów**, poza bryłami, osiągalne, **rozrzut > 30 m w x**.
- Żadne dwie bryły tego samego materiału nie nakładają się > 0.35 m we wszystkich trzech osiach.
- Tryb pościgu ma gdzie wrócić z chaserem (`huntSpawnMinM`); żaden spawn w strefie flagi
  (`DOM.radius` 3.5 m).

`mapFlags.test.ts`: flagi dokładnie `A`, `B`, `C`, na podłodze z headroomem, osiągalne, parami > 14 m.

`floorAudit.test.ts` / `floorAudit.ts`: **zero** par koplanarnych górnych ścian (1 mm i 5 mm,
≥ 0.25 m²) — podłogę kłaść jako nienakładające się panele **do** ścian, nigdy **pod** nie; **≤ 30
brył + rekwizytów w 7.5 m od każdego miejsca bomby**; zero koplanarnych ścian bocznych na
przenikających się bryłach.

Test własny mapy (wzór `gora.test.ts`, 279 linii): starty ukryte stojąc i kucając; **łańcuch
wspinaczek** (krok, skok 0.93 + mantle 0.32, skok z rozbiegu 4.43 m) od podłogi po każdą górną
ścianę — dowód, że dach, ogrodzenie i hala są nieosiągalne; trzy wysokości osłon; każda bryła stoi
na czymś; brak komórek-ślepych zaułków; schody dla bota (stopnie ≤ 0.4); ta sama długość ścieżki z
obu startów do tych samych miejsc (dla DOLNEJ: Δ ≤ 250 ms zamiast identyczności).

### 4.7 Narzędzia (dane → liczby → obraz)
- `apps/client/e2e/tools/map-audit.ts <id>` — 7 kontroli z danych: koplanarność, niedostępne dekle,
  biegi schodów, rekwizyty vs podłoga, **spójność osłon (rekwizyt bez bryły = błąd fairness)**,
  pokrycie światłem i paleta, balans drużyn (ścieżki). Działa na dowolnej mapie z `MAPS`.
- `map-duel.ts` — audyt fair 1 v 1 (starty niewidoczne, symetria, czasy sprintu z obu startów,
  liczba wyjść w 15 / 30 m, mediana / p90 / max linii wzroku, łańcuch wspinaczek, „nic nie lata”);
  `map-plan.ts` — plan ASCII z brył (2 znaki/m w X, 1 linia/m w Z, glify wg wysokości);
  `map-rotation.ts` — czasy rotacji z prawdziwego `simulateBody`. **Wszystkie trzy są przypięte do
  `GORA`** — pierwszy commit sesji wykonawczej to ich uogólnienie na `argv[2]` (id mapy) albo
  bliźniak `map-dolna.ts`; dla DOLNEJ symetria 180° zostaje zastąpiona tabelą „to samo miejsce z obu
  startów, Δ ms”.
- Render bez GPU: `apps/client/map-review.html?map=dolna&preset=medium` (Playwright + SwiftShader;
  wzór `apps/client/e2e/tools/gora-shots.mjs` → `apps/client/e2e/out/g/shots/*.png`; kamerę ustawia
  się przez `window.review.view(pos, target)`). Wyjścia narzędzi lądują w
  `apps/client/e2e/out/<drop>/` (gitignored) i są cytowane w ledgerze.
- Uruchamianie: `./apps/server/node_modules/.bin/tsx <tool>.ts > apps/client/e2e/out/dolna/<plik>.md`;
  gra: `FB_DEV_TOOLS=1 pnpm dev` (klient :5174, serwer :2567).

### 4.8 Twarde reguły i kierunek artystyczny (z `docs/MAP_1_REWORK.md` §2–§3; obowiązują)
- **Nie ruszać `PLAYER`**; kolizja to box (dekoracja nigdy nie zmienia boxa); **żadnych nowych pól
  schematu Colyseus**; **żadnych zmian balansu** (obrażenia, `WeaponDef`, tick, snapshot — L6); **bez
  PR bez prośby**; identyfikatory i komentarze po **angielsku**, teksty widoczne po **polsku**; Babylon
  tylko przez deep importy; docblock modułu mówi **DLACZEGO**; czysta logika do `packages/shared`
  (testy w node vitest, bez jsdom); jedna suita Playwright naraz; rytuał `docs/PLAN_2_1.md` (ledger
  przed raportem) obowiązkowy.
- „Low-poly na serio”: **sylwetka najpierw** (każdy obszar rozpoznawalny z konturu z 30 m w nocy —
  dom z kopertowym dachem i dwoma kominami, hala z blachy, czarny barak, szpaler tui, sosny jako pnie
  z płaską koroną), fazowanie krawędzi 3–6 cm jako dekoracja (nie przez zmniejszanie boxa), płaskie
  cieniowanie i stała drabinka teselacji (6 / 8 / 10 / 12), wymiary na siatce **0.05 / 0.1 / 0.25 m**,
  mniej-a-śmielej materiałów, **2–3 barwy światła + księżyc** (amber / mercury / accent), emisja
  (neon, jarzeniówki, okna) jako gwiazda nocy — każdy świecący rekwizyt ma praktyczne światło albo jest
  celowo zgaszony; mgła i niebo jako świadome pokrętła. **Nie**: więcej rzędów okien, więcej wariantów
  cegły, brud, wyższe tekstury, gładkie walce, materiały per obiekt.
- Znane pułapki: schody spotykane „z boku” blokują ciało (GÓRA, wpis w Deferred `PLAN_2_1.md`) —
  schody spotyka się **prosto**, z lądowaniem szerszym niż bieg; podłoga pod ścianami = z-fighting;
  nowy `MaterialTag` = draw-calle; `fence` zatrzymuje kule; rekwizyt-osłona bez bryły = błąd
  fairness; wszystko, co ma < 2.7 m i stoi obok auta lub kontenera, jest osiągalne.

## 5. Propozycja układu (szkic — do zmierzenia; do promptu jako punkt wyjścia, nie jako decyzja)

<!-- §5: wypełniane po naradzie projektantów (Załącznik B) -->

## 6. Porządek pracy sesji wykonawczej (ma być w prompcie wykonawczym, w tej kolejności)
1. Przeczytać `docs/PLAN_2_1.md` (kontrakt), `docs/ARCHITECTURE.md`, `docs/MAP_2.md` (§8 testy i
   „Rebuilt as the 1v1 roof”), `docs/MAP_1_REWORK.md` §2–§5, `packages/shared/src/gora.ts` i
   `gora.test.ts` — przez `grep -n` i zakresy linii; gałąź `drop/g-dolna`; jeden drop; nic na `main`.
2. **Najpierw narzędzie**: uogólnić `map-plan.ts`, `map-duel.ts`, `map-rotation.ts` na id mapy (albo
   `map-dolna.ts`), zachowując wynik dla GÓRY bit w bit; commit 1.
3. **Projekt na papierze** w `docs/MAP_3_DOLNA.md` (sekcja „Projekt”): tabela ekstentów (obszar → box),
   plan ASCII z tej tabeli, lista wszystkich brył z wysokością wg języka osłon, starty i pozostałe
   spawny, stacje, flagi, miejsca bomby, trzy walki, linie wzroku, callouty, lista decyzji do podpisu
   (jak D-G1…D-G6 w `MAP_2.md`). **Stop: podpis właściciela.**
4. Geometria `packages/shared/src/dolna.ts` w małych commitach (podłoga i granica → dom i płot →
   barak i hala → ulica i budowa → rekwizyty → światła), po każdym `pnpm test` (suita wspólna) i
   `map-audit.ts dolna`.
5. `dolna.test.ts` na wzór `gora.test.ts` (Δ ≤ 250 ms zamiast symetrii), potem `map-duel` /
   `map-rotation` / `map-plan` → `apps/client/e2e/out/dolna/*.md`.
6. Render: `map-review.html?map=dolna` z ~10 kamer (oba starty, brama, garaż, barak, hala, ulica z
   obu końców, z góry) → `out/dolna/shots/`; recenzent-oko (inny agent) ocenia: czy coś lata /
   przenika, czy sylwetki są czytelne, czy osłona wygląda jak osłona.
7. Integracja (po P1): `MAPS`, `MAP_ORDER`, wybór mapy duelu, `Loading.tsx` / `Menu.tsx`,
   `fixtures.ts`; live: duel z botem na DOLNEJ przez `apps/client/e2e/tools/tournament.mjs` /
   `duel-check.mjs`.
8. Bramki: `pnpm typecheck`, `pnpm test`, `pnpm build`, e2e (jedna suita); ledger + Decisions +
   Deferred w `docs/PLAN_2_1.md`, commit `plan: ledger <data> drop G`; raport ≤ 20 linii.

## 7. Definicja ukończenia (liczby, nie przymiotniki)
- Wszystkie testy z §4.6 zielone dla `dolna`; `map-audit.ts dolna`: 0 koplanarnych ≥ 1 m², 0
  niedostępnych dekli, 0 rekwizytów zatopionych lub latających, 0 osłon bez bryły.
- `map-duel` (uogólniony): starty niewidoczne 0 par na wszystkie (stojąc i kucając); Δ czasów sprintu
  do ≥ 8 miejsc ≤ 250 ms; ≥ 3 wyjścia na start w 15 m; mediana linii 8–12 m, p90 ≤ 25 m, max ≥ 50 m
  (ulica); łańcuch wspinaczek: dach domu, baraku i hali oraz ogrodzenie nieosiągalne (chyba że perch —
  wtedy równy czas z obu stron).
- Render: 10 zrzutów, recenzent-oko bez zastrzeżeń „lata / przenika”; draw-calle w widoku ulicy nie
  wyższe niż NIGHT_DISTRICT w widoku ulicy (`map-review.mjs`, `metrics.json`).
- Live: jeden pełny duel z botem na DOLNEJ do 6 (narzędzie), bez błędów w konsoli; bot dochodzi do
  każdego calloutu (ścieżka istnieje).
- Ledger w `PLAN_2_1.md` ze ścieżkami dowodów.

## 8. Stop i pytaj (sesja wykonawcza zatrzymuje się, gdy…)
…zmiana dotknęłaby `PLAYER`, `WeaponDef`, `DUEL.roundMs` (60 s może być za krótkie na mapę 70 m — to
decyzja właściciela, nie agenta), pola schematu, `DUEL_MAP_ID` / logiki wyboru mapy bez P1, nowego
`MaterialTag` / `SolidLook` bez pomiaru draw-calli, albo gdy projekt na papierze nie ma podpisu.

## 9. Pytania do właściciela (prompt wykonawczy ma je zawierać z domyślnymi odpowiedziami)
- **P1** DOLNA **zastępuje** GÓRĘ jako `DUEL_MAP_ID`, czy obie są wybieralne (lista `DUEL_MAP_IDS` +
  wybór w lobby)? *Domyślnie: obie wybieralne, DOLNA domyślna dla turnieju.*
- **P2** Która elewacja ma balkon (ogrodowa / boczna / frontowa) i po której stronie domu stoi altana
  → hala? Proszę o szkic w pięć kresek: ulica, dom, bramy, balkon, altana. *Domyślnie: balkon na
  elewacji ogrodowej, hala w tylnym rogu działki po przeciwnej stronie niż podjazd.*
- **P3** Noc (jak cała gra: latarnia, neon barbera, jarzeniówki hali, lampa na domu, reflektor
  budowy) czy próba dnia? *Domyślnie: noc.*
- **P4** Tuje i sztachety: czy kule przez nie przechodzą? W silniku każda bryła zatrzymuje kule;
  tuje jako bryła = pełna, nieprzejrzysta osłona; jako rekwizyt = nic. *Domyślnie: tuje = bryła
  (osłona i granica), płot sztachetowy = bryła 1.5 m (kucnięcie chowa, stojąc widać głowę).*
- **P5** Które wnętrza są otwarte: garaż w domu (przelotowy do ogrodu?), parter domu, szkielet
  budowy? *Domyślnie: garaż przelotowy (brama frontowa otwarta + drzwi do ogrodu), dom zamknięty,
  budowa: tylko parter bez stropu jako drugi kraniec.*
- **P6** Perch: dach hali osiągalny (drabina / schody z obu stron) czy nie? *Domyślnie: nie w
  pierwszym cięciu.*
- **P7** Runda 60 s zostaje? *Domyślnie: zostaje; zmierzyć czas spotkania narzędziem i wrócić z
  liczbą.*
- **P8** Nazwa: DOLNA. Callouty do akceptacji z listy R9.

## 10. Format PROMPTU WYKONAWCZEGO, który masz oddać
Po polsku, bez kodu, jedna wiadomość gotowa do wklejenia, w tej kolejności i z tymi nagłówkami:
1. **Rola i sesja** (lead delegujący wg `docs/MASTER_PROMPT.md` / `docs/ULTRON.md`; jedna gałąź;
   jeden drop G; nic na `main`; bez PR).
2. **Zlecenie właściciela** (jego słowa + R1–R10).
3. **Miejsce** — pełny opis z §2 (wszystkie obiekty, wymiary, modyfikacje 1–3, co jest w grze, co
   tłem, niejasności).
4. **Fakty o silniku** — §4 w całości, liczby dosłownie, ścieżki plików dosłownie.
5. **Układ startowy** — §5 (plan ASCII, ekstenty, starty, trzy walki, callouty) z dopiskiem
   „propozycja do zmierzenia”.
6. **Porządek pracy** — §6.
7. **Definicja ukończenia** — §7.
8. **Stop i pytaj** — §8.
9. **Pytania do właściciela z domyślnymi odpowiedziami** — §9 (właściciel dopisze odpowiedzi przed
   wklejeniem).
10. **Raport końcowy** — ≤ 20 linii, bez kodu, ze ścieżkami dowodów.

Długość: tyle, ile trzeba, żeby nic z §2–§9 nie zginęło; nie skracaj tabel z liczbami.

=== KONIEC PROMPTU ===

---

## Załącznik A — skąd są liczby (dla repo; nie wklejać)

Każdy fakt w §1 i §4 ma źródło w kodzie z dnia 2026-09-26 (gałąź `claude/confident-cray-nneqme`,
od `11f2bb6`). Sesja wykonawcza ma je zmierzyć ponownie, nie wierzyć tej tabeli.

| Fakt | Źródło |
|---|---|
| `DUEL`: prepMs 15 000, buyTailMs 5 000, roundMs 60 000, breakMs 5 000, wins 6, halfRounds 3, matchMs 15 min, economy.floor 2 500 | `packages/shared/src/modes.ts:302–349`, `cs.ts:20` (`CS_ROUND.freezeMs`) |
| `CS_ECONOMY`: start 800, max 16 000, win 3 250, lossBase 1 400 | `packages/shared/src/cs.ts:29–37` |
| Duel: obaj na PIERWSZYM spawnie strony | `apps/server/src/rooms/TdmRoom.ts:1445` (`map.spawns.find(v => v.team === spawnTeam)`) |
| Duel wymusza `DUEL_MAP_ID`; menu i loading filtrują do niej | `TdmRoom.ts:355–359`, `packages/shared/src/map.ts:656`, `apps/client/src/ui/Menu.tsx:460`, `Loading.tsx:39`, `gallery/fixtures.ts:213` |
| Lobby turnieju przekazuje `map` do aren | `apps/server/src/rooms/TournamentLobbyRoom.ts:91, 230` |
| `TOURNAMENT.sizes [4, 8]`; lobby do 32 | `modes.ts:293–300`; ledger Drop V w `docs/PLAN_2_1.md` |
| Granaty: frag 6 m, molotov 3.2 m / 6 s, flash 14 m, smoke 3.5 m / 12 s, shell 4.5 m | `packages/shared/src/grenades.ts:44–60` |
| `PLAYER`: halfWidth 0.35, height 1.8, crouchHeight 1.25, eyeHeight 1.62, crouchEyeHeight 1.08, headFraction 0.18, walk 5.4, sprint 7.6, crouch 2.7, jumpVelocity 6.4, gravity −22, stepHeight 0.4 | `packages/shared/src/constants.ts:94–120` |
| `MOVE.airStepCrouch 0.32`; slide ~0.8 s | `packages/shared/src/movement.ts:29, 60–82` |
| APEX 0.931 m, MANTLE 1.251 m, REACH (skok z rozbiegu) 4.43 m | `packages/shared/src/gora.test.ts:17–18, 104` |
| Siatka chodu 0.5 m, JUMP_UP 0.88 m | `packages/shared/src/mapWalk.ts:11–13` |
| Zasięgi broni (tabela §4.3) | `packages/shared/src/weapons.ts:81–294` |
| Układ współrzędnych, `MapDef`, `Solid`, `PropHint`, `LightHint`, `MaterialTag`, `SolidLook`, `PropKind`, `DISTRICT_LIGHTS`, `boxFrom` | `packages/shared/src/map.ts:1–120`, `collision.ts:298` |
| Rejestr map `MAPS`, `DEFAULT_MAP_ID`, `DUEL_MAP_ID`, `MAP_ORDER`, `sitesOf` | `packages/shared/src/map.ts:647–660` |
| `BOMB_SITES` domyślne (x −35 / 43) | `packages/shared/src/bomb.ts:46–51` |
| `SPECS: Record<MaterialTag, Spec>` (nowy tag = typecheck) | `apps/client/src/game/world/materials.ts:35–74` |
| `dressing.ts` — looki i gałąź `default` (zwykłe pudełko) | `apps/client/src/game/world/dressing.ts:80–278` |
| `props.ts` — rodzaje rekwizytów, `lamp` warianty, `pole`, `cable`, `wheel` | `apps/client/src/game/world/props.ts:189–362` |
| `hasDistrictDressing` = tylko `night_district` | `apps/client/src/game/world/MapBuilder.ts:52–59` |
| Księżyc jedynym cieniem; `LIGHT_GAIN 1.4`; mgła 0.012 / (0.035, 0.035, 0.05) poza dzielnicą | `MapBuilder.ts:49, 201–209, 282–283` |
| Strefy scalania 12 m / 24 m (tagi „detail”) | `MapBuilder.ts:88–98` |
| Plany taktyczne przypięte do `NIGHT_DISTRICT.solids` | `packages/shared/src/plans.ts:16, 41` |
| Minimapa z `solids`; rozmiar mapy w menu z `bounds` | `apps/client/src/ui/Minimap.tsx:76–81`, `Menu.tsx:52–57` |
| Testy wspólne (progi §4.6) | `packages/shared/src/map.test.ts:25–139`, `mapFlags.test.ts:16–26`, `floorAudit.ts:25–29`, `floorAudit.test.ts:39` |
| `DOM.radius 3.5` | `packages/shared/src/dom.ts:17` |
| `OSTRZYZENI.huntSpawnMinM 14`; GÓRA `huntSpawnMinM 6` | `modes.ts:237`, `gora.ts:297` |
| GÓRA: 34 × 22 m, `bounds` 36 × 24, klatka 4.4 m, perch 2.0, lip 1.35, komórki 2 816 / osiągalne 1 940 | `gora.ts:1–60, 301`; pomiar `measure.mts` w tej sesji |
| Narzędzia `map-audit.ts` (dowolna mapa), `map-duel.ts` / `map-plan.ts` / `map-rotation.ts` (przypięte do GORA), `map-review.mjs`, `gora-shots.mjs`, `map-review.html?map=` | `apps/client/e2e/tools/*.ts|mjs:1–40`, `apps/client/map-review.html:11–13` |
| Twarde reguły i kierunek artystyczny | `docs/MAP_1_REWORK.md` §2 (l. 62–122), §3 (l. 124–147), §5 (l. 210–270) |
| Wymagania testowe GÓRY i „Rebuilt as the 1v1 roof” (mediana 7.6, p90 15.0, 0 ms, 7.9 %) | `docs/MAP_2.md` §8 (l. 338–372), l. 549–700 |
| Schody spotykane z boku blokują ciało | `docs/PLAN_2_1.md`, Deferred, wpis Drop T 2026-09-23 |

## Załącznik B — jak powstał §5 (przebieg tej sesji)

<!-- wypełniane po naradzie -->
