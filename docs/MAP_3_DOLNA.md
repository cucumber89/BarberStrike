# MAP 3 — DOLNA: prompt na mapę turniejową 1 v 1 (działka + ulica)

**Status: prompt do wklejenia, 2026-09-26. Drop W (trzecia mapa: DOLNA). Kod gry nietknięty —
właściciel pracuje lokalnie.** Ten plik jest tym, o co poprosił właściciel: promptem, który wkleja
się do innego czatu (z obsługą obrazów), żeby ten wygenerował **właściwy prompt** (brief wykonawczy)
dla sesji Claude Code w tym repo. Każda liczba w §1 i §4 pochodzi z kodu na dzień 2026-09-26 i
została sprawdzona przez osobnych kontrolerów (Załącznik A podaje `file:line`); §5 (układ) jest
propozycją z narady projektantów, **zmierzoną** prawdziwą symulacją gry (Załącznik B), ale
niezbudowaną — sesja wykonawcza mierzy ją ponownie narzędziami repo.

## Jak tego użyć

0. **Zanim cokolwiek wkleisz do Claude Code:** zmerguj tę gałąź (`claude/confident-cray-nneqme`,
   sam ten plik i wpis w `docs/PLAN_2_1.md`) do `main` i wypchnij swoje lokalne zmiany w grze. Sesja
   wykonawcza czyta ten plik **z repo** i ma zaczynać od aktualnego `main`.
1. Skopiuj wszystko między `=== POCZĄTEK PROMPTU ===` a `=== KONIEC PROMPTU ===` do czatu z obsługą
   obrazów i **dołącz trzy zdjęcia**: (1) Street View wzdłuż ulicy, (2) front domu zza ulicy,
   (3) widok satelitarny 3D. Ten czat jest jedynym ogniwem, które widzi zdjęcia — dlatego to on
   poprawia opis miejsca (§2) i sprawdza układ (§5) ze zdjęciami.
2. Czat odda **PROMPT WYKONAWCZY** (2–4 strony, format w §10). W jego sekcji pytań wpisz odpowiedzi
   (albo zostaw domyślne) — zwłaszcza P1 i P2.
3. Wklej prompt wykonawczy jako ZLECENIE na końcu `docs/ULTRON.md` (albo po `docs/MASTER_PROMPT.md`)
   w nowej sesji Claude Code w repo. Sesja 1 kończy się projektem na papierze do Twojego podpisu;
   sesja 2 buduje geometrię (§6).

Skrót: blok można też wkleić **bezpośrednio** do Claude Code, dopisując na końcu: *„§0 i §10 nie
obowiązują — jesteś sesją wykonawczą; wykonaj §6 od Sesji 1, krok 1; pytania z §9a traktuj jak
odpowiedzi domyślne, chyba że poniżej wpisano inne”*.

---

=== POCZĄTEK PROMPTU ===

## 0. Twoja rola i co masz oddać

Jesteś projektantem poziomów (level designer po latach w Counter-Strike'u) i redaktorem
technicznym. Dostajesz trzy zdjęcia prawdziwego miejsca oraz ten dokument: opis miejsca i zmian,
które właściciel chce w nim wprowadzić (§2), wymagania rozgrywki (§3), twarde fakty o silniku gry i
jej pipeline map (§4 — przepisane z kodu, nie do dyskusji), **zmierzoną propozycję układu** (§5),
porządek pracy sesji, która mapę zbuduje (§6–§8), pytania do właściciela (§9) i format wyjścia
(§10).

Masz oddać JEDEN dokument: **PROMPT WYKONAWCZY** dla agenta (Claude Code), który pracuje w
repozytorium gry BarberStrike, widzi ten plik (`docs/MAP_3_DOLNA.md`) w repo, ale **nie widzi
zdjęć**. Nie buduj mapy, nie pisz kodu. Format wyjścia jest w §10 — trzymaj się go co do sekcji.

Kto co napisał i co ma pierwszeństwo: ten blok napisał lead (agent) na podstawie zdjęć i rozmowy z
właścicielem. „Notatki właściciela” to blok **Zmiany właściciela** w §2 i cytat w §3. Hierarchia:
**notatki właściciela > zdjęcia > opis leada w §2 > propozycja układu w §5.**

Zasady dla Ciebie:
- Piszesz po polsku; identyfikatory, nazwy plików, pól i materiałów zostają po angielsku, dokładnie
  tak, jak w §4.
- **Nie wymyślasz faktów o repo.** Wszystko, co wiesz o kodzie, jest w §4. Jeśli czegoś tam nie ma,
  a jest potrzebne, wpisujesz to do sekcji **9b** promptu wykonawczego („sprawdź w kodzie: …”), nie
  jako fakt.
- **§4, §6, §7 i §8 NIE przepisujesz.** Sesja wykonawcza przeczyta je w repo; przepisywanie tabel z
  liczbami przez czat to główne źródło przekłamań. W prompcie wstawiasz jedno zdanie:
  *„Obowiązują §4, §6, §7 i §8 z `docs/MAP_3_DOLNA.md`; liczby zmierz ponownie wg Załącznika A.”*
- **Przepisujesz w całości** tylko: §2 (miejsce) — poprawione i uzupełnione o to, co widzisz na
  zdjęciach, a czego w §2 nie ma (osobna lista „Ze zdjęć, poza opisem leada”); §3 R1–R11 (dosłownie);
  §5 (układ) — **sprawdzony ze zdjęciami**: gdzie zdjęcie mówi co innego niż §5 (pozycja obiektu,
  proporcje, strona domu), poprawiasz i oznaczasz każdą zmianę „[zmiana wg zdjęcia Zx]”, nie
  przebudowujesz układu od nowa; §9 z domyślnymi odpowiedziami (9a) i listą do sprawdzenia w kodzie
  (9b).
- Liczby z kodu (§1, §4) przepisujesz dosłownie tam, gdzie je cytujesz. Każdą liczbę, która nie
  pochodzi z kodu, oznaczasz jednym znacznikiem: **(szac.)** = do zmierzenia narzędziem albo przyjęcia
  z ±20 %; liczby proponowane przez leada (barak 8 × 4 × 2.8 m, hala 12 × 7 × 4 m) — **(propozycja —
  potwierdza właściciel)**.
- Gdzie zdjęcie i opis się różnią — powiedz to w prompcie i zostaw pytanie w 9a.
- Bez kodu do wykonania (żadnych implementacji, żadnych fragmentów `dolna.ts`). Ścieżki plików,
  numery linii i nazwy narzędzi, które cytujesz, przepisujesz dosłownie — to fakty, nie kod.
- Jeśli całość nie mieści się w jednej wiadomości, podziel na „PROMPT WYKONAWCZY 1/2” i „2/2” z tym
  samym nagłówkiem i ciągłą numeracją sekcji; nie skracaj tabel ani list.

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
- Zabójstwo wygrywa rundę, wymiana to remis, zegar oddaje rundę temu, kto ma więcej HP (równe HP =
  remis).
- Ekonomia CS (`cs.ts`, `CS_ECONOMY`): $800 na start połowy, $3 250 za wygraną, drabinka za
  przegrane od $1 400, limit $16 000, kasa za zabójstwo wg broni; jedyna różnica: **podłoga $2 500**
  w każdej rundzie poza pierwszą w połowie. Kto przeżył, zachowuje broń; kto zginął, wraca z
  pistoletem.
- Bez perków i bez granatnika w tym trybie (`economy.ts`, `modeAllowsItem`). Granaty są
  (`grenades.ts`): frag (promień 6 m), molotov (3.2 m, pali 6 s), nóż rzucany (70 obrażeń przy
  trafieniu), flash (14 m), smoke (3.5 m, 12 s).
- **Obaj gracze startują na PIERWSZYM punkcie spawnu swojej strony**
  (`apps/server/src/rooms/TdmRoom.ts:1445`: `this.map.spawns.find((v) => v.team === spawnTeam)`),
  bez losowania; dopiero gdy strona nie ma żadnego spawnu, wchodzi zwykłe `pickSpawn`. Pozostałe
  spawny strony są dla innych trybów.
- Turniej: w pokoju (`turniej`, 4 lub 8 osób, pary po kolei) i lobby z równoległymi arenami (do 32
  uczestników, każda para w osobnym pokoju `tdm mode=duel`). Każda arena duelu i turnieju **wymusza
  mapę `DUEL_MAP_ID`** po stronie serwera (`TdmRoom.ts:359`), dziś `gora`. DOLNA musi więc albo
  zastąpić GÓRĘ, albo wymagać małej zmiany, żeby duel przyjmował mapę z lobby (§9a, P1).

## 2. Miejsce — co jest na zdjęciach i co właściciel zmienia

Prawdziwe miejsce: **ul. Dolna**, gruntowa uliczka na przedmieściu (Mazowsze), zdjęcia z marca, w
słońcu. Mapa obejmuje **jedną działkę z domem i odcinek ulicy przed nią**; drugą krawędzią mapy jest
tylna ściana parteru domu w budowie po drugiej stronie ulicy (niewidzialna bryła graniczna za
szkieletem); pobocze z sosnami, toi-toiem i kontenerami jest w grze. Nazwa mapy: **DOLNA**, id
`dolna`.

**Orientacja w osiach silnika (konwencja leada; §5 jej używa):** ulica biegnie wzdłuż osi **X**
(długa oś mapy), działka rozciąga się w **+Z** od ulicy (płot frontowy na z ≈ 5, tył działki na
z ≈ 50), pobocze z sosnami i parter budowy w **−Z**; front domu (bramy garażowe) patrzy w −Z, balkon
na elewacji +Z (ogrodowej). Właściciel potwierdza w P2.

Trzy zdjęcia:

**Z1 — Street View, wzdłuż ulicy** (kamera na środku drogi, patrzy wzdłuż niej).
- Droga gruntowa, piaszczysto-błotna, ok. **5–6 m** szerokości (szac.), koleiny i kałuże, bez
  krawężników; biegnie prosto **≥ 150 m** do skrzyżowania z asfaltem (tam latarnia uliczna).
- **Lewa strona (strona działki):** wysoki, gęsty **żywopłot z tui (3–4 m)** wzdłuż granicy, dalej
  **brązowy drewniany płot sztachetowy (~1.6 m w rzeczywistości; w grze bryła 1.5 m, §3 R3)** na
  betonowym cokole ze słupkami; za nim dom: białe tynki, **kopertowy dach z brązowej dachówki, dwa
  kominy**; dwa **betonowe słupy energetyczne** z przewodami tuż przy jezdni; dalej kolejne płoty,
  tuje i domy sąsiadów.
- **Prawa strona:** rząd wysokich **sosen (15–20 m, gołe pnie, korony wysoko)** na piaszczystym
  poboczu; za nimi **nowoczesny biały dom-kostka w budowie** (płaski dach, ciemne pasy okien),
  ogrodzony **siatką budowlaną na słupkach** i drewnianym parkanem; przy drodze **niebieska toaleta
  przenośna (toi-toi)** i **kontenery/kubły budowlane**; dalej po prawej **zaparkowane: ciemne auto
  osobowe i biały dostawczak (van)** na poboczu.

**Z2 — front domu, zza ulicy** (dom nr 17).
- Dom **piętrowy, ok. 10 × 10–11 m** w rzucie (szac.), białe/kremowe tynki, **dach kopertowy** z
  brązowej dachówki, dwa ceglane kominy. Parter od frontu: **dwie ciemne bramy garażowe** (lewa
  cofnięta, w niszy ~1 m; prawa w licu ściany) — garaż na dwa auta w bryle domu; piętro: dwa okna z
  roletami, między nimi lampa ścienna; tabliczka „17” przy prawym narożniku na ~2.5 m.
- **Płot frontowy**: brązowe pionowe sztachety z prześwitami, ~1.6 m (szac.), słupki betonowe, cokół;
  **furtka** (ok. 1 m w rzeczywistości; w grze 1.5 m albo zamknięta — §3 R2, P9) na lewo od środka,
  **brama wjazdowa dwuskrzydłowa (ok. 3–3.5 m)** po prawej, prowadzi na podjazd do garażu; skrzynka
  na listy na słupku.
- Po lewej domu **3–4 wysokie tuje (6–7 m)** i żywopłot; po prawej tuje i krzewy; za domem po prawej
  **dom sąsiada** (szaro-brązowy dach dwuspadowy) i coś pod ciemną plandeką (auto/przyczepa).
- Przed płotem: piaszczyste pobocze i droga.

**Z3 — widok satelitarny 3D** (rozmyta siatka 3D; kierunki do potwierdzenia).
- Działka **prostokątna, ok. 22–25 m szeroka i 40–50 m głęboka** (szac.), dom w przedniej części,
  **trawnik** z tyłu i z boku; ulica „Dolna” biegnie wzdłuż górno-lewej krawędzi (stoi tam
  zaparkowane ciemne auto); numer „19” na sąsiedniej działce po lewej.
- Na jednej z elewacji **balkon z jasną balustradą** na piętrze, pod nim ciemny otwór/wnęka na
  parterze; na sąsiedniej elewacji mały **taras/ganek ze schodkami**.
- W ogrodzie: **zielona zjeżdżalnia** (plac zabaw) na trawniku, kilka drzew, szpalery tui na
  granicach; w rogu przy płocie (dolny-lewy róg zdjęcia) **altana/wiata z brązowym dachem**; domy
  sąsiadów z brązowymi dachami z dwóch stron.
- ⚠ **Niejasność:** na Z2 front (z bramami garażowymi) nie ma balkonu, a na Z3 balkon wydaje się być
  na elewacji od strony ulicy. Lead przyjął, że balkon jest na **elewacji ogrodowej** (+Z). Szkic
  (ulica, dom, bramy, balkon, altana — pięć kresek) dostarcza **właściciel razem z odpowiedzią na
  P2**, dopisując go pod P2 przed wklejeniem promptu; bez szkicu sesja pracuje z domyślną
  odpowiedzią P2 i oznacza układ domu „do potwierdzenia” w projekcie na papierze.

**Zmiany właściciela (to jest „mapa”, nie rzeczywistość — obowiązują bezwzględnie):**
1. **Pod balkonem stoi duży CZARNY BARAK — to jest BARBER SHOP.** Czarna, prostokątna, parterowa
   buda (**8 × 4 m, 2.8 m** — propozycja, potwierdza właściciel; P10), **dostawiona do ściany domu
   pod balkonem bez szczeliny** (box baraka styka się z boxem domu); w środku fotele fryzjerskie,
   lustra, lada, neon; **obowiązkowo dwa wyjścia** (drzwi od strony podjazdu i drzwi od ogrodu),
   żeby był korytarzem walki, nie ślepym pokojem (R2).
2. **Tam, gdzie na Z3 jest altana przy płocie, stoi OGROMNY BLASZANY GARAŻ — DETAILING
   SAMOCHODÓW.** Hala z blachy falistej (**12 × 7 m, 4 m** — propozycja, potwierdza właściciel; P11),
   **brama rolowana otwarta od strony domu/ogrodu**, **małe drzwi w ścianie bocznej od strony tui** —
   dwa wyjścia (R2); w środku auto na podnośniku, szafki narzędziowe, beczki, opony, wąż,
   jarzeniówki.
3. Reszta jak na zdjęciach: dom z garażem w bryle, płot ze sztachet z furtką i bramą, tuje na
   granicach, ulica przed działką, po drugiej stronie sosny, budowa, toi-toi, kontenery, van i auto,
   słupy energetyczne z przewodami.

Co jest **w grze** (można tam wejść): cała działka (podjazd, garaż w domu, barak, blaszana hala,
ogród, przejścia między domem a tujami), płot z furtką i bramą, ulica na całym odcinku mapy,
pobocze po drugiej stronie z sosnami, toi-toiem i kontenerami, i **parter (szkielet) domu w
budowie** jako drugi kraniec (P12). **Tłem**: piętro domu (zamknięte; balkon tylko wizualnie, chyba że
P6c), domy sąsiadów, dalsza część ulicy poza granicą mapy, korony sosen.

## 3. Wymagania rozgrywki — „jak z CS:GO, klarowna, prosta”

Właściciel: *„mapa pod turniej, taka jak z CS:GO — klarowna, prosta, ale daje dużo możliwości osłony
odpowiednich do wielkości gracza; możliwość walki na bardzo daleko, ale i blisko; dobrze odwzorowana,
mapa obejmuje działkę i ulicę przed”.* Przetłumaczone na wymagania, które da się zmierzyć:

- **R1. Trzy czytelne strefy walki, jedna długa linia.** (a) **ULICA** — jedna prosta, długa linia
  strzału **≥ 50 m** (dystans DMR / snajperki, §4.3), przerywana osłonami (van, auto, słupy,
  kontenery, toi-toi), ale z co najmniej jednym miejscem, z którego widać cały odcinek;
  (b) **PODJAZD / FRONT** — dystans średni **12–25 m** (brama, furtka, płot, podjazd, front garażu);
  (c) **WNĘTRZA** — barak barbera, garaż w domu, blaszana hala: **< 10 m**, narożniki, drzwi, osłona
  z foteli, auta, szafek. Gracz wybiera dystans swoim ruchem, nie losem.
- **R2. Dwa–trzy wejścia z ulicy na działkę** (brama wjazdowa, furtka, ewentualnie dziura w płocie /
  przejście przy tujach) i **dwie–trzy drogi przez działkę** (przez garaż domu, przez barak, wzdłuż
  tui). Żadna droga nie jest ślepa; każde wnętrze ma dwa wyjścia. **Każde przejście, które ma być
  trasą, ma ≥ 1.5 m światła w grze** — siatka chodu 0.5 m + ciało 0.7 m nie mieści się w 1.2 m
  (lekcja GÓRY, `docs/MAP_2.md` „As built”); furtka ze zdjęcia ma ~1 m, więc w grze jest 1.5 m
  albo zamknięta (P9).
- **R3. Osłona mówi jednym językiem, dopasowanym do gracza** (ciało 0.70 m szer. × 1.80 m; kucnięcie
  1.25 m; oczy 1.62 / 1.08 m): **0.8 m** — niska, można na nią wskoczyć (skrzynia, opona, ławka);
  **1.3 albo 1.45–1.5 m** — kucnięcie chowa całego, stojąc wystaje głowa, z ziemi NIE DA SIĘ na nią
  wejść (mantle to 1.25 m) — płot sztachetowy 1.5, auto 1.45, kontener 1.3; **≥ 2.0 m** — pełna
  (van, toi-toi, barak, hala, ściany); **≥ 2.8 m** — konstrukcje, na które nikt nie wchodzi. Każda
  osłona jest szersza niż ciało (**≥ 0.9 m**) albo świadomie „częściowa” (słup 0.35 m). Uwaga: na
  auto 1.45 m wejdzie się z każdej bryły obok, której góra jest ≤ 1.25 m poniżej dachu auta
  (skrzynia 0.8, opona) — i wtedy z dachu auta osiągalne jest wszystko do **2.7 m**; dlatego przy
  autach, vanie i kontenerach nie stawia się niskich osłon, chyba że świadomie; dowodzi tego test
  łańcucha (§4.6). Osłona wizualna bez bryły kolizyjnej jest błędem (§4.7).
- **R4. Starty ukryte i równe.** Oba starty niewidoczne z siebie nawzajem (stojąc i kucając, w obie
  strony); z każdego startu **≥ 3 wyjścia w 15 m ścieżki**; czasy sprintu (prawdziwy `simulateBody`)
  mierzone do **ośmiu miejsc**: BRAMA, FURTKA, GARAŻ (domu), BARAK (drzwi), HALA (brama), ULICA
  (środek odcinka), TOJ (pobocze przy budowie), drugi start — i do **miejsc spornych**, czyli tych, o
  które obie strony walczą naprawdę: na prawdziwym, niesymetrycznym miejscu są to punkty **na ulicy**
  (zachód przy słupie, środek przy vanie, wschód przy aucie; §5, D-W2), a nie brama, garaż czy hala,
  które należą do jednego „domu”. Dla miejsc spornych czasy **różnią się ≤ 250 ms** (zmierzone w §5:
  ≤ 150 ms); miara GÓRY to 0 ms dzięki symetrii 180°. To, co każdy „dom” ma u siebie za darmo,
  wyrównuje zmiana stron co 3 rundy — ale runda decydująca (11.) jest grana na tej stronie, którą da
  zmiana, więc ≤ 250 ms na miejscach spornych to warunek, nie życzenie.
- **R5. Linie wzroku z liczbami.** Twarde: jedna linia **≥ 50 m** (ulica); żadna linia dłuższa niż
  ulica w granicach mapy; **żadne miejsce nie widzi obu startów**; żadna wyżej położona pozycja nie
  jest osiągalna z jednej strony szybciej niż z drugiej o więcej niż 250 ms. Progi rozkładu są
  **celami zmierzonymi na propozycji z §5**, nie regułą GÓRY (7.6 / 15.0 m na 34 × 22 m): mediana
  czystej linii między dwoma osiągalnymi punktami **8–12 m** (zmierzone 11.2), **p90 ≤ 30 m ogółem i
  ≤ 25 m poza parami ulica↔ulica** (zmierzone 28.3 / 21.9; D-W7 — na ulicy tylko van i toi-toi
  przewyższają oko stojącego, bo tak mówi język osłon z R3). Sesja mierzy je po pierwszym pełnym
  układzie i, jeśli odbiegają, proponuje nowy próg z liczbą w Decisions (jak D-G3 dla
  `huntSpawnMinM`) — **nie zabudowuje ulicy, żeby trafić w liczbę.**
- **R6. Nic nie wychodzi z mapy, nic nie lata.** Tuje, płoty, siatki i niewidzialne ściany zamykają
  arenę; test łańcucha wspinaczek (§4.6, wzór `gora.test.ts`) dowodzi, że **nikt nie wejdzie na dach
  domu, hali ani baraka** ani na balkon, chyba że projekt świadomie robi z któregoś perch (P6 —
  wtedy jest osiągalny schodami/drabiną z obu stron w równym czasie i ma lip 1.35 m jak GÓRA). Każda
  bryła stoi na ziemi albo na innej bryle.
- **R7. Rozmiar i orientacja:** ulica **~60 m** długości w granicach mapy, wzdłuż osi X; działka
  **~24 × 42 m** w +Z; pobocze z sosnami, plac i parter budowy w −Z; całość **64 × 70 m** (`bounds`
  z §5; szac. ±20 %). To sześć razy więcej niż GÓRA (34 × 22 m, 748 m²) — cena za długą linię. Runda
  ma 60 s: mapa musi być tak czytelna, żeby dwie osoby znalazły się w 10–15 s (starty **35–45 m
  ścieżki** od siebie; zmierzone 44.3 m).
- **R8. Odwzorowanie:** każdy obiekt ze zdjęć jest na mapie w swojej pozycji względem domu i ulicy
  (lista w §2); proporcje domu, płotu, bramy i szerokości ulicy trzymają się szacunków ±20 %.
  Stylistyka gry to **noc + low-poly na serio** (§4.8): dom, tuje, sosny, blacha i sztachety mają być
  rozpoznawalne z sylwetki, nie z tekstury.
- **R9. Callouty po polsku**, krótkie, jedno słowo, na każde miejsce, np.: ULICA, SOSNY, BUDOWA, VAN,
  TOJ (toi-toi), SŁUP, BRAMA, FURTKA, PODJAZD, GARAŻ, BARAK, FOTEL, HALA, PODNOŚNIK, TUJE, OGRÓD,
  ZJEŻDŻALNIA, BALKON. Identyfikatory w kodzie po angielsku, teksty widoczne po polsku.
- **R10. Inne tryby też muszą działać** (testy są wspólne): ≥ 6 spawnów na drużynę (pierwszy = start
  duelu), `arenaSpawns` co najmniej 8 jak GÓRA (`gora.ts:266–271`), rozproszone po trzech strefach
  (FFA / Gun Game / Ostrzyżeni), 3 stacje zakupów rozrzucone > 30 m w osi x, flagi A/B/C > 14 m od
  siebie, dwa miejsca bomby po przeciwnych stronach z równym dojściem, `huntSpawnMinM` dobrane do
  rozmiaru mapy (GÓRA: 6 m na 39 m przekątnej; NIGHT_DISTRICT: 14 m na 121 m). Czy DOLNA ma być
  grywalna w tych trybach naprawdę, czy tylko przejść testy — P1.
- **R11. Prostota z liczbami** („klarowna, prosta”): **≤ 12 calloutów**; **3 strefy walki (R1) + ≤ 2
  łączniki**; z każdego startu do każdego calloutu trasa bota ma **≤ 3 zakręty**; **≤ 140 brył
  kolizyjnych** (GÓRA ma 89), rekwizytów bez limitu; każda strefa ma **jedną sylwetkę-landmark**
  (dom, hala, barak, szpaler sosen, van) rozpoznawalną na planie ASCII bez legendy.

## 4. Fakty o silniku i pipeline map (przepisane z kodu, 2026-09-26; sprawdzone)

### 4.1 Układ współrzędnych i jednostki
Metry. `+X` = wschód, `+Y` = góra, `+Z` = północ; `yaw 0` patrzy w `+Z`. Podłoga zwykle na `y = 0`
(bryła podłogi od `y = −1` do `0`). Każda bryła to AABB: `boxFrom(minX, minY, minZ, sizeX, sizeY,
sizeZ)`; bryły nie obracają się (pole `yaw` obraca tylko „ubranie” bryły z `look`).

### 4.2 Gracz i ruch (`packages/shared/src/constants.ts` `PLAYER`, `movement.ts` `MOVE`)
- Ciało: `halfWidth 0.35` (0.70 m szer.), `height 1.8`, `crouchHeight 1.25`, `eyeHeight 1.62`,
  `crouchEyeHeight 1.08`; głowa = górne 18 % ciała (`headFraction`).
- Prędkości: chód **5.4 m/s**, sprint **7.6**, kucanie 2.7; slide z sprintu (0.8 s); tac-sprint na
  budżecie.
- Skok: `jumpVelocity 6.4`, `gravity −22` → **apex 0.93 m**; `stepHeight 0.4` (stopnie ≤ 0.4 m
  przechodzi się bez skoku; GÓRA używa 0.3334); w powietrzu kucnięty „mantle” `airStepCrouch 0.32`
  → **najwyższa krawędź, na którą da się wejść z ziemi: 1.25 m** (`gora.test.ts:17–18`: MANTLE =
  0.931 + 0.32). **Skok z rozbiegu przenosi ~4.42 m** w poziomie (`gora.test.ts:104`: REACH =
  2·6.4/22 · 7.6; komentarz w teście zaokrągla do 4.43). Siatka chodu botów: 0.5 m, jump-up 0.88 m
  (`mapWalk.ts:11–13`).
- Stąd język osłon: 0.8 (wskoczyć), 1.3 / 1.45–1.5 (z ziemi nie wejdziesz; 1.35 chowa kucniętego,
  stojąc widać głowę), ≥ 2.0 pełna, ≥ 2.8 konstrukcje. Łańcuch: z bryły 0.8 m na auto 1.45 m, z auta
  na wszystko do **2.7 m**; z kontenera 2.5 m na wszystko do **3.75 m** — sprawdza to test łańcucha
  (§4.6).

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
| autoshotgun SG-6 | 8 × 11 | 7 / 18 |
| dmr M-1 | 63 | 60 / 120 |
| sniper SR-50 (głowa = kill na każdym dystansie przy 100 HP) | 85 | 100 / 200 |
| launcher GL-1 (granatnik, pocisk łukiem; obrażenia z `GRENADES.shell`; nie w duelu) | — | 40 / 40 |
| clippers (melee) | 45 | 2.1 |

Wniosek: „bardzo daleko” w tej grze to **40–70 m** — pełne obrażenia mają tam tylko DMR i snajperka;
carbine (od 38 m) i karabin (od 32 m) są już w falloffie; „średnio” 15–30 m, „blisko” < 10 m
(strzelby, SMG). Obrażeń i zasięgów **nie wolno zmieniać** (reguła Dropu B w `docs/PLAN_2_1.md`:
„TTK numbers … are already tuned — do not move damage”; L6 blokuje autorytet serwera, tick i
snapshot).

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
  `apps/client/src/game/world/materials.ts:35–74`, inaczej `pnpm typecheck` pada; i nowa siatka w
  każdej strefie 12 m / 24 m, więc najpierw użyj istniejących**): `wall_sand wall_teal floor_tile
  floor_concrete floor_wood floor_asphalt floor_metal wall_plaster wall_brick wall_tile wall_concrete
  wall_panel ceiling counter wood metal paint glass mirror leather brass rubber none paint_red
  paint_blue paint_green paint_white paint_yellow paint_orange corrugated_red corrugated_blue
  corrugated_green glass_dark glass_car fence concrete_block soil foliage`.
- **Dopasowania dla DOLNEJ** (istniejące tagi/looki; każdy obiekt z §2 ma swoje): droga gruntowa →
  `soil`; podjazd → `floor_concrete`; tynk domu → `paint_white` / `wall_plaster`; **dach kopertowy →
  2–3 schodkowo zmniejszające się płyty `paint_red` na stropie (sylwetka piramidy; AABB nie ma
  skosów)**; okna i rolety → panele `glass_dark` 0.05 m w licu ściany; sztachety → `wood`; **żywopłot
  z tui na granicach → bryła `foliage` 3.0 m (klasa ≥ 2.8, nieprzejrzysta, zamyka arenę)**;
  **pojedyncze wysokie tuje przy domu → bryły `foliage` 0.9 × 0.9 × 6.0 m** (stoją na ziemi, test
  łańcucha dowodzi, że nie da się na nie wejść); pnie sosen → `wood` 0.6 × 0.6 × 6 m (osłona
  częściowa; korona jako `foliage` wysoko, nad głową); **czarny barak → `look: "portacabin"`** (ciało
  w kolorze materiału bryły — daj `wall_panel`, albedo `#403630`, ciemny; ma okna `glass_dark`, drzwi
  i próg; sprawdź w 9b, czy drzwi wypadają tam, gdzie chcesz) **albo** ściany `wall_panel` +
  `glass_dark`; blaszana hala → `corrugated_blue / green / red` (szarej nie ma; albo dodać
  `corrugated_grey` z pomiarem draw-calli); siatka budowlana → `fence` (**cutout: widać przez nią, ale
  bryła zatrzymuje kule** — tylko na granicy mapy, nigdy jako osłona w środku); słupy energetyczne →
  `concrete_block` 0.35 × 0.35 × 8 m; toi-toi → `paint_blue` 1.1 × 1.1 × 2.3; kontenery → `look:
  "skip"` / `"dumpster"`; auta → `look: "car"` (1.45 m) / `"van"` (≥ 2.0 m); **zjeżdżalnia → 2 bryły
  `paint_green` (podest 1.2 × 1.2 × 1.5 m + zjazd 2.5 × 0.6, schodkowo 0.8 → 1.5 m; osłona klasy
  1.45–1.5)**; taras/ganek → bryła `floor_concrete` ≤ 0.4 m (jeden stopień) albo tło; skrzynka na
  listy → `sign` na słupku bramy; tabliczka „17” → `sign` z `text: "17"` na 2.5 m; lampa piętra →
  `lamp` wariant `wall`; koleiny i kałuże → nic (podłoga `soil` jest płaska).
- `SolidLook` (gotowe „ubrania” bryły): `van car truck container dumpster crate lockers drums planter
  cabinet bin pallets machine skip shelter_roof portacabin kiosk_counter`. Nieznany look **cicho**
  rysuje zwykłe pudełko (`dressing.ts`, gałąź `default`), więc nowy look trzeba naprawdę
  zaimplementować i obejrzeć. `planter` rysuje krzaki z `foliage` (może udawać niski żywopłot).
- `PropKind` (bez kolizji, tylko wygląd): `barber_chair mirror shelf sign lamp trash crate dumpster
  pole sink counter_top neon graffiti vent poster bottle_row towel_stack board clippers terminal
  receipt sticker tube_light cable pendant wheel ac_unit pipe barber_pole`. `lamp` ma warianty
  `post | wall | head`; `pole` (słup 0.12 m × h) i `cable` (przewód) są do słupów energetycznych;
  `wheel` = opona (detailing); `neon` z `text`; `sign` z `text`, `w`, `h`. **Rekwizyt nigdy nie jest
  osłoną** — fotel fryzjerski w GÓRZE ma pod sobą bryłę 0.8 × 1.45 × 0.9 m; tu tak samo.
- Światła: paleta nazwana `DISTRICT_LIGHTS = { amber "#ffbf70" (front, publiczne), mercury "#9adce5"
  (praca, serwis), accent "#fa709a" (tylko szyldy) }` — stała w `map.ts:80`, do użycia na każdej
  mapie; używać tych trzech + księżyc. Limity: w kodzie jest **dokładnie jeden generator cieni —
  księżyc** (`MapBuilder.ts:220`); pole `shadows` w `LightHint` jest zadeklarowane, ale `buildMap`
  go nie czyta (reguła „≤ 2 generatory” to `ARCHITECTURE.md`, nie kod). Materiały mapy liczą ≤ 5
  świateł naraz (`materials.ts:144`), rekwizyty 4 (`props.ts:33`); ambient + księżyc zajmują 2 sloty,
  więc na siatkę przypadają **≤ 3 światła praktyczne**; każde światło ma sferę zasięgu, poza którą
  `buildMap` wyklucza je z siatek; `LIGHT_GAIN 1.4`. Księżyc: kierunkowy, renderowany raz (świat
  statyczny). Niebo i mgła są **globalne** (`MapBuilder.ts:282–283`: poza NIGHT_DISTRICT
  `fogDensity 0.012`, `fogColor (0.035, 0.035, 0.05)`) — mapa jest **nocna**; dzień wymagałby zmiany
  `MapBuilder`, nie danych mapy (§9a, P3).

### 4.5 Rejestracja mapy i wybór mapy duelu (fakty; co z nich zrobić — §6 krok 7)
- Nowa mapa = nowy plik `packages/shared/src/dolna.ts` eksportujący `DOLNA: MapDef` (wzór:
  `gora.ts`, 313 linii, z helperami `S()` / `O()` i tabelą `GORA_EXTENTS` dla narzędzi), wpis w
  `MAPS` (`map.ts:647`) — od tej chwili suita wspólna i `map-audit.ts` ją widzą — oraz w `MAP_ORDER`
  (`map.ts:657`) — od tej chwili jest w menu **każdego** trybu (`apps/client/src/ui/invite.ts:25`,
  `mapChoices`; test `invite.test.ts:27` wylicza nazwy). Minimapa (`Minimap.tsx:76`) i rozmiar w menu
  (`Menu.tsx:52–57`, `mapSize`) liczą się same z `solids` / `bounds`; glif planu w menu ma
  domyślny `GenericPlan` (`menuArt.tsx:144`), a `/viewer` domyślne widoki dzielnicy
  (`ViewerScene.ts:64`, `viewpointsFor`).
- Duel i turniej **wymuszają** `DUEL_MAP_ID` po stronie serwera (`map.ts:656`; `TdmRoom.ts:359`) i
  w `Loading.tsx:39` (`pickedMap` dla `duel` i `turniej`). W menu tylko tryb `duel` filtruje listę map
  do tej jednej (`Menu.tsx:457–461`, podpis `map-fixed`); panel turnieju pokazuje wszystkie mapy, bo
  ten wybór dotyczy rozgrzewki, nie par (`Menu.tsx:638–653`). `gallery/fixtures.ts:213` czyta
  `MAPS[DUEL_MAP_ID]`; `App.tsx:153` komentuje to samo. Lobby turnieju już przekazuje `map` do aren
  (`TournamentLobbyRoom.ts:91, 230`), więc „mała zmiana” z P1 dotyczy `TdmRoom.ts:359` i klienta.
- **Kontrakty testów, które zmienia pakiet P1** (zmiana testu w tym samym commicie, z
  uzasadnieniem): `apps/client/src/ui/hud/copy.test.ts:84` (`mapTitle(DUEL_MAP_ID) === "GÓRA
  (DACH)"`), `errors.test.ts:95–97` (`pickedMap("duel"|"turniej") === DUEL_MAP_ID`),
  `invite.test.ts:27` (lista nazw z `MAP_ORDER`), `apps/client/e2e/startup.spec.ts:121`
  (`map-fixed` widoczne w duelu).
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
  podłogowe (`trash crate dumpster pole barber_chair wheel`, `lamp` post) z gruntem ≤ 0.2 m pod
  kotwicą; `lamp head` tuż nad słupem.
- **≥ 3 stacje zakupów**, poza bryłami, osiągalne, **rozrzut > 30 m w x**.
- Żadne dwie bryły tego samego materiału nie nakładają się > 0.35 m we wszystkich trzech osiach.
- Tryb pościgu ma gdzie wrócić z chaserem (`huntSpawnMinM`); żaden spawn bliżej niż 1.5 ×
  `DOM.radius` = 5.25 m od flagi (w poziomie).

`mapFlags.test.ts`: flagi dokładnie `A`, `B`, `C`, na podłodze z headroomem, osiągalne, parami > 14 m.

`floorAudit.test.ts` / `floorAudit.ts`: **zero** par koplanarnych górnych ścian (1 mm i 5 mm,
≥ 0.25 m²) — podłogę kłaść jako nienakładające się panele **do** ścian, nigdy **pod** nie; audyt
zgłasza tylko bryły **przenikające się**, bryły, które stykają się ścianką (podłoga −1..0 pod ścianą od
0), są w porządku; **≤ 30 brył + rekwizytów w 7.5 m od każdego miejsca bomby**; zero koplanarnych
ścian bocznych na przenikających się bryłach.

Test własny mapy (wzór `gora.test.ts`, 279 linii): starty ukryte stojąc i kucając; **łańcuch
wspinaczek** (krok, skok 0.93 + mantle 0.32, skok z rozbiegu 4.42 m) od podłogi po każdą górną
ścianę — dowód, że dach, ogrodzenie i hala są nieosiągalne; trzy wysokości osłon (**pasma testu:
low ≤ 0.83, crouch 1.3 ± 0.01 lub 1.45 ± 0.06 i > 1.251, full ≥ 1.9**); każda bryła stoi na czymś;
brak komórek-ślepych zaułków; schody dla bota (stopnie ≤ 0.4); ścieżki z obu startów do bliźniaczych
miejsc różne o < 1.0 m (dla DOLNEJ: Δ ≤ 250 ms do ośmiu miejsc z R4, z jawnej tabeli
`DOLNA_PLACES` zamiast obrotu 180°); `findPath` między każdą parą calloutów — 0 par bez ścieżki.

### 4.7 Narzędzia (dane → liczby → obraz)
- `apps/client/e2e/tools/map-audit.ts <id>` — 7 kontroli z danych: koplanarność, niedostępne dekle
  (2a „ALMOST connected” = defekt; 2b „Isolated” = dach/perch, oczekiwane), biegi schodów, rekwizyty
  vs podłoga, **spójność osłon (rekwizyt bez bryły = błąd fairness)**, pokrycie światłem i paleta,
  balans drużyn (ścieżki). Robi `MAPS[argv[2]] ?? NIGHT_DISTRICT` — **nieznane id po cichu audytuje
  dzielnicę**; uogólnienie w §6 krok 2 ma kończyć błędem na nieznanym id.
- `map-duel.ts` (audyt fair 1 v 1: starty niewidoczne, symetria 180°, czasy sprintu z obu startów
  przez `rot()`, wyjścia w 15 / 30 m, mediana / p90 / max linii wzroku, łańcuch wspinaczek, „nic nie
  lata”) i `map-plan.ts` (plan ASCII, 2 znaki/m w X, 1 linia/m w Z, glify wg wysokości, **ekstenty na
  sztywno −18…18 × −12…12**) są przypięte do `GORA` (import z `gora.ts`, brak `argv`);
  `map-rotation.ts` ma na sztywno DWIE mapy (sekcja 3 NIGHT_DISTRICT, sekcja 4 GÓRA) plus model ruchu
  na płaskim świecie. Żadne nie czyta `argv[2]`.
- Render bez GPU: `apps/client/map-review.html?map=<id>&preset=medium` (Playwright + SwiftShader).
  **Uwaga:** strona robi `MAPS[param] ?? NIGHT_DISTRICT` (`map-review.html:12`) — nieznane id po
  cichu renderuje dzielnicę; kamera startowa dla każdej mapy poza dzielnicą jest na sztywno startem W
  GÓRY (`:13–14`), więc kadr ustawia się przez `window.review.view(pos, target)` (wzór
  `apps/client/e2e/tools/gora-shots.mjs`: sekcja 1 — kadry + `engine._drawCalls` na stdout; sekcja 2 —
  duel z jednym botem na prawdziwym serwerze, HUD czytany co 5 s przez 60 s; sekcja 3 — `/viewer`).
  `map-review.mjs` (zrzuty + `metrics.json` z draw-callami) **nie przyjmuje `map=`** — otwiera
  `?preset=` i ma kamery dzielnicy na sztywno. `tournament.mjs` gra pełną drabinkę z botami (na
  `DUEL_MAP_ID`; tryby `LOBBY=1`, `GRACE=1`). **`duel-check.mjs`, cytowany w `docs/MAP_2.md` i w
  ledgerze, nie istnieje w repo** — nie wywoływać.
- Wyjścia narzędzi lądują w `apps/client/e2e/out/dolna/` (gitignored; `out/g/` to GÓRA) i są
  cytowane w ledgerze. Uruchamianie: `./apps/server/node_modules/.bin/tsx <tool>.ts >
  apps/client/e2e/out/dolna/<plik>.md`; gra: `FB_DEV_TOOLS=1 pnpm dev` (klient :5174, serwer :2567).

### 4.8 Twarde reguły, kierunek artystyczny i pułapki (z `docs/MAP_1_REWORK.md` §2–§3, §5.2, §8.2, §14.2; `docs/MAP_2.md` „As built”; Deferred w `docs/PLAN_2_1.md`)
- **Nie ruszać `PLAYER`**; kolizja to box (dekoracja nigdy nie zmienia boxa); **żadnych nowych pól
  schematu Colyseus**; **żadnych zmian balansu** (obrażenia, `WeaponDef`, tick, snapshot); **bez PR
  bez prośby**; identyfikatory i komentarze po **angielsku**, teksty widoczne po **polsku**; Babylon
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
- Pułapki: **schody spotykane „z boku” zostawiają ruch zablokowany** (GÓRA: każdy start poza
  zachodnią głową schodów kończy trasę na perch zablokowaną — Deferred, Drop T 2026-09-23) — schody
  spotyka się prosto, z lądowaniem szerszym niż bieg; **przejścia ≥ 1.5 m** (R2); płyta podłogi
  pod/na innej płycie albo ściany nachodzące w narożach = z-fighting; nowy `MaterialTag` =
  draw-calle; `fence` zatrzymuje kule; rekwizyt-osłona bez bryły = błąd fairness; wszystko < 2.7 m
  obok auta i < 3.75 m obok kontenera jest osiągalne.

### 4.9 Jak pracuje sesja w tym repo (`docs/MASTER_PROMPT.md`, `docs/ULTRON.md`, `.claude/skills/plan-keeper/SKILL.md`)
Lead **deleguje, nie czyta całych plików**: najpierw rytuał plan-keepera (`docs/PLAN_2_1.md` w
całości, ostatnie 5 wierszy ledgera, Deferred; trzy linie: który drop, co skończyła ostatnia sesja,
co skończy ta; gałąź `drop/<litera>-<slug>`, nigdy `main`); potem zwiad przez subagentów (lista
plików + jedno pytanie, odpowiedź ≤ 300 słów z `file:line`, bez wklejania kodu); **narzędzie przed
funkcją** (pierwszy commit dropu to przyrząd, którym wszyscy potem mierzą); małe commity (temat w
trybie rozkazującym, treść mówi DLACZEGO); **recenzent ≠ implementer** (inny agent próbuje zepsuć
zmianę); dla obrazów **recenzent-oko** dostaje katalog zrzutów i oddaje tabelę `plik — werdykt —
powód` (lata / przenika / sylwetka / czy osłona wygląda jak osłona); bramki `pnpm typecheck`,
`pnpm test`, `pnpm build`, narzędzie dropu; **wiersz ledgera przed raportem** (sesja bez wiersza „nie
istniała”), Decisions i Deferred; raport ≤ 20 linii, bez kodu, z listą **„co wymaga prawdziwego GPU
albo playtestu”**. Wszystko, co zauważysz poza dropem → jedna linia w Deferred, nie „przy okazji”.

## 5. Propozycja układu (zmierzona; do sprawdzenia ze zdjęciami i do ponownego zmierzenia w repo)

Prototyp: `apps/client/e2e/tools/dolna/proto-final.ts`, pomiar: `apps/client/e2e/tools/dolna/measure-final.md`, plan: `apps/client/e2e/tools/dolna/plan-final.txt` — liczby poniżej pochodzą z tego pomiaru: harness tej sesji (`apps/client/e2e/tools/dolna/measure.mts`, `plan.mts`) na prawdziwym `simulateBody` i siatce chodu repo, odtwarzający liczby `map-duel.ts` dla GÓRY; sesja wykonawcza mierzy ponownie narzędziami repo. Powtórka: `./apps/server/node_modules/.bin/tsx apps/client/e2e/tools/dolna/measure.mts apps/client/e2e/tools/dolna/proto-final.ts`.

### 5.1 Idea

DOLNA to dwa „domy" i środek między nimi, jak na mapie z CS. Dom pierwszy to **działka barbera**: czarny barak pod balkonem jest kieszenią startową drużyny 0, garaż w bryle domu i trzy otwory w linii frontu (dziura w tujach, furtka, brama) są jej linią przednią, blaszana hala detailingu w tylnym rogu ogrodu jest jej tyłem. Dom drugi to **budowa po drugiej stronie ulicy**: parter-szkielet jest kieszenią startową drużyny 1, trzy otwory w siatce budowlanej (luka zachodnia, brama budowy, luka wschodnia) są jej linią przednią. **Środek to ULICA**: jedna prosta linia 60 m i 5.2 m szerokości, przerywana z boku (nie w poprzek) dwoma autami, vanem, toi-toiem, dwoma kontenerami, słupami i pniami sosen — pas korony drogi (z −5.5…−3.5) widzi całe 60 m, resztę ulicy widać na 10–20 m. Trzy walki: ULICA (daleko, 40–60 m, DMR/snajperka), PODJAZD/FRONT (średnio, 12–25 m: brama, furtka, płot 1.5 m, podjazd, front garażu, dziura w tujach) i WNĘTRZA (blisko, < 10 m: garaż z autem, barak z fotelami, hala z autem na podnośniku, szkielet budowy z przepierzeniem). Jest to uczciwe, bo miejsca, o które się walczy, leżą na ulicy, i z obu startów dobiega się do nich w tym samym czasie (cztery punkty sporne: zachód ulicy przy słupie, środek przy vanie, wschód przy aucie — najgorsza różnica **150 ms**, próg 250), a starty są od siebie 44.3 m ścieżki, ukryte stojąc i kucając, i żadne miejsce na mapie nie widzi obu naraz; to, co każdy „dom" ma u siebie za darmo (garaż, barak, hala po jednej stronie; szkielet i plac po drugiej), wyrównuje zmiana stron co 3 rundy. Zdjęcia są uszanowane w położeniu każdej rzeczy względem domu i ulicy: dom 10 × 10 z dwiema bramami garażowymi od ulicy, płot sztachetowy 1.5 m z furtką na lewo od środka i bramą 3.2 m po prawej, tuje na granicach i rząd wysokich tui na lewo od domu, żywopłoty sąsiadów wzdłuż ulicy, po drugiej stronie szpaler sosen na piaszczystym poboczu, siatka budowlana, toi-toi, kontenery, van i ciemne auto, dwa słupy energetyczne, w ogrodzie drzewa, zjeżdżalnia i to coś pod plandeką; dwie zmiany właściciela — czarny barak 8 × 4 pod balkonem (elewacja ogrodowa, +Z) i blaszana hala 12 × 7 × 4 w miejscu altany — są bryłami gry, każda z dwoma wyjściami.

### 5.2 Plan

```
dolna — 64 × 70 m, north up, 2 chars/m in X. # ≥2.8  = 2.0–2.8  + 1.2–1.6  . 0.5–1.0  / stairs  ~ boundary  : invisible  o/O duel starts  x spawns  $ station  F flag  A/B sites
          -30       -25       -20       -15       -10       -5        0         5         10        15        20        25        30  
   44                                                                                                                                 
   43                                        ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~                                       
   42                                        ~····########################····················~                                       
   41                                        ~····=··············x···....#····················~                                       
   40                                        ~····=······················#····················~                                       
   39                                        ~·········=·····=··$······..#····················~                                       
   38                                        ~····=······················#····················~                                       
   37                                        ~····=·······A········..····#·······.....++······~                                       
   36                                        ~····####········############····················~                                       
   35                                        ~················································~                                       
   34                                        ~································####············~                                       
   33                                        ~································####············~                                       
   32                                        ~···········································x····~                                       
   31                                        ~················································~                                       
   30                                        ~··································====··········~                                       
   29                                        ~··········x·······················====··········~                                       
   28                                        ~······················####········====··········~                                       
   27                                        ~······················####········====··········~                                       
   26                                        ~·······#######··································~                                       
   25                                        ~·······#######··································~                                       
   24                                        ~·······#######······x···························~                                       
   23                                        ~·······························x················~                                       
   22                                        ~················································~                                       
   21                                        ~················································~                                       
   20                                        ~················=##############=················~                                       
   19                                        ~················=··············=················~                                       
   18                                        ~#######··········o·····················#######··~                                       
   17                                        ~#######································#######··~                                       
   16                                        ~#######·········=··+···+···....=·······#######··~                                       
   15                                        ~#######·······####################·····#######··~                                       
   14                                        ~··············####################··············~                                       
   13                                        ~··············####################··············~                                       
   12                                        ~···························#######··············~                                       
   11                                        ~·······················+++·#######··············~                                       
   10                                        ~··············=········+++·#######··············~                                       
    9                                        ~··············=········+++·##############·······~                                       
    8                                        ~··············=········+++·##############·······~                                       
    7                                        ~··············=········+++·##############·······~                                       
    6                                        ~··············==·····======##############·······~                                       
    5                                        ~·······####·····································~                                       
    4                                        ~·······####······························F······~                                       
    3                                        ~·······####·····································~                                       
    2                                        ~·······####·····································~                                       
    1                                        ~·······####·····································~                                       
    0    :~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~···~~~~~~~~~~~~~~···~~~~~~~~~~~~~~~~······~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~:   
   -1    :························································································································:   
   -2    :······························································································+++++++++·················:   
   -3    :······························································································+++++++++·················:   
   -4    :··················································································································$·····:   
   -5    :··································++++··················································································:   
   -6    :··········$··············+++++++++++++·················==========·············++++++····································:   
   -7    :·························+++++++++·····················==========·==··········++++++····································:   
   -8    ::::::::::::::::::::::::::::::::::::::···::::::::::·······::::::::::::···:::::::::::::::::::::::::::::::::::::::::::::::::   
   -9                                    :············································:                                               
  -10                                    :············································:                                               
  -11                                    :·········································x··:                                               
  -12                                    :··....····B····························++···:                                               
  -13                                    :··....·································++···:                                               
  -14                                    :············································:                                               
  -15                                    :············································:                                               
  -16                                    :············································:                                               
  -17                                    :············=···====================········:                                               
  -18                                    :······x·························+++=········:                                               
  -19                                    :····················x··············=········:                                               
  -20                                    :············=··········#·····x·····=········:                                               
  -21                                    :············=··········#··········x·········:                                               
  -22                                    :············=··········#······..···=········:                                               
  -23                                    :············=·O········#······..···=········:                                               
  -24                                    :·············######################·········:                                               
  -25                                                                                                                                 
```

Co widać: **dolna część planu to ulica** — rząd `:` na z −8 to niewidzialna ściana za sosnami (pnie `##` na z −7…−8), między z −7 a −1 biegnie droga (`+++` to kontenery i auta 1.3/1.45 m, `====` to van 2.2 m z toi-toiem `==` obok, na x 3), na z 0 linia frontu (`~` żywopłoty sąsiadów i tuje, przerwy `···` to od lewej: DZIURA w tujach x −11.5…−10, FURTKA x −3…−1.5, BRAMA x 6.5…9.7). **Nad ulicą działka** (+Z): rząd `####` na x −8.6…−6.4 z 0…5 to szpaler tui na lewo od domu, blok `####` x −5…5, z 5…15 to dom (lewa dolna część z `+++` to garaż z autem, otwarta lewa brama na x −4…−1.5), nad nim `=…=` x −4…4, z 15…20 to BARAK ze startem `o` przy zachodnich drzwiach, po bokach domu `#######` to korony drzew (z 14…18), w ogrodzie krzak `#######` (x −8.5…−5, z 23…26), drzewa, przyczepa pod plandeką `====` (x 5…7, z 26…30), zjeżdżalnia `..++` (x 5…9, z 36…37), a w lewym górnym rogu HALA `#` x −10…2, z 35…42 (brama rolowana to przerwa w dolnej ścianie x −8…−4, `=` w lewej ścianie to drzwi boczne na szczelinę wzdłuż tui). **Pod ulicą budowa** (−Z): `:` to siatka budowlana x −14…8 z trzema przerwami (luka zachodnia x −11.5…−10 w linii DZIURY, brama x −4.85…−1.65, luka wschodnia x 4.25…5.75), pryzma piasku `....` i cegły `++` na placu, na dole SZKIELET x −8…4, z −24.6…−17.3 z przepierzeniem `#` i startem `O` w zachodnim pokoju. Orientacja: +X w prawo wzdłuż ulicy, +Z w górę w głąb działki; 2 znaki na metr w X, 1 wiersz na metr w Z.

### 5.3 Ekstenty

| obszar (callout) | box minX..maxX × minZ..maxZ | co to jest |
|---|---|---|
| ULICA | −30..30 × −6.7..−1.5 (droga) + −1.5..−0.5 (pobocze od działki) | droga gruntowa 5.2 m `soil`, 60 m; korona z −5.5..−3.5 widzi całość |
| SOSNY | −30..30 × −8.3..−6.7 | dalsze pobocze z 15 pniami sosen; przed budową (x −14..8) pas przy siatce |
| BUDOWA (plac) | −14..8 × −17.3..−8.3 | plac budowy za siatką: piasek, cegły, wejście do szkieletu |
| BUDOWA (szkielet) | −8..4 × −24.6..−17.3 | parter domu w budowie, ściany 2.8, przepierzenie x −2.3, start T1; tylna ściana = krawędź mapy |
| PODJAZD (front) | −11.8..11.8 × −0.5..5.3 | betonowy przedogródek za płotem: furtka, brama, front garażu; szpaler tui x −8.6..−6.4 dzieli go |
| PODJAZD (przejazd wschodni) | 5..11.8 × 5.3..15.3 | betonowy pas między domem a wschodnim żywopłotem, tuje x 5..8.6 z 5.3..9.3 zostawiają 3.2 m |
| TUJE (kieszeń + przejście zachodnie) | −11.8..−5 × 0.1..15.3 | kieszeń za dziurą (x −11.8..−8.6, z 0.1..5.3) i trawnik między domem a zachodnim żywopłotem |
| GARAŻ | −4.7..1.3 × 5.6..12.1 | wnęka garażowa w domu: lewa brama otwarta (x −3.95..−1.55), tylne drzwi 1.5 m w ścianie zachodniej (z 10.25..11.75), auto |
| DOM (zamknięty) | −5..5 × 5.3..15.3 | bryła domu 6.5 m + dach dwustopniowy; tylko garaż jest w grze |
| BARAK | −4..4 × 15.3..19.6 | czarny barak barbera, 2.8 m, drzwi W (z 16.25..17.75) i E (to samo), start T0 |
| OGRÓD | −11.8..11.8 × 19.6..42 (bez hali) | trawnik z drzewami, krzakiem, przyczepą pod plandeką, zjeżdżalnią |
| HALA | −10..2 × 35..42 | blaszana hala 12 × 7 × 4: brama rolowana 4 m w ścianie S (x −8..−4), drzwi boczne 1.5 m w ścianie W (z 37.75..39.25) na szczelinę x −11.8..−10 wzdłuż tui |
| granica | −32..32 × −26..44 (`bounds`) | żywopłoty 3 m (działka i sąsiedzi), niewidzialne ściany 5 m na końcach ulicy, za sosnami i wokół budowy, siatka 2 m z niewidzialnym pasem do 5 m |

### 5.4 Bryły

| nazwa (prefix) | co to jest w rzeczywistości | rozmiar (m) | pozycja | klasa wysokości | mat / look |
|---|---|---|---|---|---|
| ground_road, ground_verge_n, ground_verge_s | droga gruntowa i dwa pobocza | 60 × 1 × 5.2 / 1.0 / 1.6 | z −6.7..−1.5 / −1.5..−0.5 / −8.3..−6.7, y −1..0 | grunt | soil |
| ground_site | plac budowy | 23 × 1 × 16.8 | x −14.5..8.5, z −25.1..−8.3 | grunt | soil |
| ground_front, ground_drive, ground_garage | beton: przedogródek, przejazd wschodni, pod domem | 24.8 × 5.8 / 7.4 × 10 / 10 × 10 | z −0.5..5.3 / x 5..12.4 z 5.3..15.3 / x −5..5 | grunt | floor_concrete |
| ground_lawn_w, ground_lawn_n | trawnik zachodni i ogród | 7.4 × 10 / 24.8 × 27.3 | x −12.4..−5 z 5.3..15.3 / z 15.3..42.6 | grunt | soil |
| ground_nb_w, ground_nb_e | stopy żywopłotów sąsiadów | 17.6 × 0.6 | z −0.5..0.1, x ±12.4..±30 | grunt | soil |
| hedge_w, hedge_e, hedge_n | żywopłot z tui na granicach działki | 0.6 × 3 × 43.1 / 23.6 × 3 × 0.6 | x −12.4..−11.8 i 11.8..12.4, z −0.5..42.6; z 42..42.6 | granica (≥ 2.8) | foliage |
| hedge_front_w_j0/j1 | tuje w linii frontu na lewo od płotu, z DZIURĄ 1.5 m | 0.3 / 4.0 × 3 × 0.6 | x −11.8..−11.5 i −10..−6, z −0.5..0.1 | granica | foliage |
| fence_front_j0/j1/j2 | płot sztachetowy z FURTKĄ 1.5 m (x −3..−1.5) i BRAMĄ 3.2 m (x 6.5..9.7) | 3 / 8 / 2.1 × 1.5 × 0.3 | x −6..−3, −1.5..6.5, 9.7..11.8; z −0.5..−0.2 | 1.45–1.5 (kucnięcie chowa, stojąc widać głowę; z ziemi nie wejdziesz) | wood |
| hedge_nb_w, hedge_nb_e | żywopłoty sąsiadów wzdłuż ulicy | 17.6 × 3 × 0.6 | x −30..−12.4 i 12.4..30, z −0.5..0.1 | granica | foliage |
| wall_edge_w/e, wall_edge_s_w/s_e, wall_edge_site_w/e/s, wall_edge_site_top_0–3 | niewidzialne ściany: końce ulicy, za sosnami, wokół budowy, pas nad siatką | 0.5 × 5 × 8.9 / 16–22 × 5 × 0.5 / 0.5 × 5 × 15.8 / 23 × 5 × 0.5 / 2.25–5.9 × 3 × 0.3 | x ±30..±30.5; z −8.8..−8.3; x −14.5..−14 i 8..8.5; z −25.1..−24.6; y 2..5 nad panelami siatki | granica (invisible) | none |
| fence_site_j0–j3 | siatka budowlana z luką W 1.5 m (x −11.5..−10), bramą 3.2 m (x −4.85..−1.65) i luką E 1.5 m (x 4.25..5.75) | 2.5 / 5.15 / 5.9 / 2.25 × 2 × 0.3 | z −8.6..−8.3 | granica (2.0 + pas niewidzialny do 5; kule zatrzymuje, widać przez nią) | fence |
| house_main_e, house_main_n | dom nr 17 (zamknięta bryła, piętro) | 3.7 × 6.5 × 10 / 6.3 × 6.5 × 3.2 | x 1.3..5 z 5.3..15.3 / x −5..1.3 z 12.1..15.3 | ≥ 2.8 | paint_white |
| garage_wall_w_j0/j1/_band | zachodnia ściana garażu z tylnymi drzwiami 1.5 m (z 10.25..11.75), nadproże 2.2 | 0.3 × 2.2 × 4.95 / 0.35; pas 0.3 × 4.3 × 6.8 | x −5..−4.7 | ≥ 2.8 (ściana), otwór | paint_white |
| garage_wall_s_j0/j1/_band | front garażu: lewa brama (w niszy) OTWARTA x −3.95..−1.55, prawa (w licu) zamknięta = ściana | 0.75 / 2.85 × 2.2 × 0.3; pas 6 × 4.3 × 0.3 | z 5.3..5.6 | ≥ 2.8, otwór 2.4 m | paint_white |
| roof_house_1, roof_house_2 | dach kopertowy jako dwie schodkowe płyty (sylwetka piramidy) | 9.2 × 1 × 9.2 / 6 × 1 × 6 | y 6.5..7.5 / 7.5..8.5, na domu | ≥ 2.8 (nieosiągalny) | paint_red |
| garage_car | auto w garażu | 1.8 × 1.45 × 4.4 | x −0.7..1.1, z 6.3..10.7 | 1.45 | glass_car / car |
| shed_wall_w_j0/j1/_band, shed_wall_e_*, shed_wall_n | czarny BARAK 8 × 4.3 × 2.8 dostawiony do domu pod balkonem; drzwi W i E 1.5 m (z 16.25..17.75), nadproża 2.2 | ściany 0.3 grube; N 7.4 × 2.8 × 0.3 | x −4..4, z 15.3..19.6 | ≥ 2.8 (2.8 = konstrukcja), otwory | wall_panel (albedo #403630) |
| roof_shed | dach baraku | 7.8 × 0.25 × 4.1 | y 2.5..2.75 | ≥ 2.8 klasa (top 2.75 poza zasięgiem 2.7; udowodnione łańcuchem) | wall_panel |
| shed_chair_1, shed_chair_2 | fotele fryzjerskie (proxy kolizyjne jak w GÓRZE; rekwizyt `barber_chair` na nich) | 0.8 × 1.45 × 0.9 | x −2.6..−1.8 i −0.6..0.2, z 15.5..16.4 | 1.45 (celowo „częściowa": 0.8 szer.) | leather |
| shed_counter | lada barbera | 1.9 × 0.8 × 0.9 | x 1.5..3.4, z 15.5..16.4 | 0.8 | counter |
| hall_wall_s_j0/j1/_band | ściana S hali z BRAMĄ ROLOWANĄ 4 m (x −8..−4), nadproże 3.0 | 2 / 6 × 3 × 0.6; pas 12 × 1 × 0.6 | z 35..35.6 | ≥ 2.8, otwór 4 m | corrugated_blue |
| hall_wall_w_j0/j1/_band | ściana W hali z drzwiami bocznymi 1.5 m (z 37.75..39.25) od strony tui | 0.3 × 2.2 × 2.15 ×2; pas 0.3 × 1.8 × 5.8 | x −10..−9.7 | ≥ 2.8, otwór | corrugated_blue |
| hall_wall_e, hall_wall_n | ściany E i N hali | 0.3 × 4 × 5.8 / 12 × 4 × 0.6 | x 1.7..2; z 41.4..42 | ≥ 2.8 | corrugated_blue |
| roof_hall | dach hali | 11.8 × 0.25 × 6.8 | y 3.7..3.95 | ≥ 2.8 (nieosiągalny) | corrugated_blue |
| hall_lift_post_w/e | słupy podnośnika dwukolumnowego | 0.4 × 2 × 0.4 | x −7.6 i −4.3, z 38.2..38.6 | ≥ 2.0 (celowo częściowa) | metal |
| hall_car_raised | auto na podnośniku (przechodzi się pod nim, 2.0 m) | 4.4 × 1.45 × 1.8 | x −8..−3.6, y 2..3.45, z 37.5..39.3 | zawieszone na słupach, 0.25 m do dachu — nie do wejścia | glass_car / car |
| hall_cabinets | szafki narzędziowe | 3.4 × 2 × 0.6 | x −9.5..−6.1, z 40.8..41.4 | ≥ 2.0 | metal / lockers |
| hall_drums_1/2, hall_tyres_1/2 | beczki i opony | 1 × 0.8 × 1 | x −0.4..1.7 z 40.2..41.2; (−1.4, 36.2), (0.3, 38) | 0.8 | metal / drums; rubber |
| thuja_front_w | 3–4 wysokie tuje na lewo od domu (Z2), jako rząd N–S od żywopłotu do narożnika domu | 2.2 × 6 × 5.2 | x −8.6..−6.4, z 0.1..5.3 | ≥ 2.8 | foliage |
| thuja_se | tuje i krzewy po prawej domu | 3.6 × 6 × 4 | x 5..8.6, z 5.3..9.3 | ≥ 2.8 | foliage |
| tree_w/e/mid/n (_trunk + _crown) | drzewa w ogrodzie: pień 1.4 m + korona od 1.4 m (blokuje oko stojące) | pień 0.6 × 1.4 × 0.6; korona 3.4 / 3.4 / 2.4 / 2.4 × 3.1, y 1.4..4.5 | (−10.1, 16), (9.4, 16), (0, 27), (5, 33) | pień 1.4 (klasa 1.45 ±0.06), korona nad głową | wood; foliage |
| shrub_w | krzak (bez / lilak) w ogrodzie po zachodniej stronie | 3.5 × 3 × 3 | x −8.5..−5, z 23..26 | ≥ 2.8 | foliage |
| trailer_tarp | „coś pod ciemną plandeką" za domem po prawej (Z2) | 2 × 2 × 4 | x 5.2..7.2, z 26..30 | ≥ 2.0 | glass_dark / container |
| slide_tower, slide_ramp | zielona zjeżdżalnia: podest + zjazd | 1.2 × 1.3 × 1.2 / 2.4 × 0.8 × 0.8 | x 7.8..9 z 36..37.2 / x 5.4..7.8 z 36.2..37 | 1.3 / 0.8 (z rampy na podest) | paint_green |
| pole_w, pole_e | betonowe słupy energetyczne (przewody = rekwizyt `cable`) | 0.35 × 8 × 0.35 | (−16.2, −1.65), (13.85, −1.65) | ≥ 2.8, celowo częściowa | concrete_block |
| pine_w28…pine_e28_5 (15) | pnie sosen na poboczu (korony wysoko = rekwizyt/tło) | 0.6 × 6 × 0.6 | x −28, −25, −22, −19, −16, −8, −6, 2, 13.5, 16, 18.5, 21, 23.5, 26, 28.5; z −8.3..−7.7 | ≥ 2.8, celowo częściowa | wood |
| car_dark_2 | ciemne auto na poboczu przy budowie, na zachód od luki W siatki | 4.4 × 1.45 × 1.8 | x −17.6..−13.2, z −7.5..−5.7 | 1.45 | glass_car / car |
| skip_1 | kontener budowlany przed luką W siatki (szczelina 1.5 m za nim) | 2 × 1.3 × 2 | x −13.2..−11.2, z −6.8..−4.8 | 1.3 | metal / skip |
| van_white | biały van na pasie południowym, środek odcinka | 5 × 2.2 × 2 | x −2.5..2.5, z −7.5..−5.5 | ≥ 2.0 | paint_white / van |
| toitoi | niebieska toaleta przenośna obok vana | 1.1 × 2.3 × 1.1 | x 3..4.1, z −8.3..−7.2 | ≥ 2.0 (nieosiągalna: nic ≤ 1.3 w 4.42 m) | paint_blue |
| skip_2 | drugi kontener, pas południowy | 3 × 1.3 × 2 | x 9..12, z −7.5..−5.5 | 1.3 | metal / skip |
| car_dark | ciemne auto na pasie północnym, wschód (Z3: auto przy działce) | 4.4 × 1.45 × 1.8 | x 17..21.4, z −3.5..−1.7 | 1.45 | glass_car / car |
| shell_wall_n_j0/j1/_band | ściana N szkieletu z drzwiami 1.5 m na zachodnim końcu (x −7.7..−6.2) | 0.3 / 10.2 × 2.2 × 0.3; pas 12 × 0.6 × 0.3 | z −17.6..−17.3 | 2.8, otwór | paint_white |
| shell_wall_e_*, shell_wall_w_* | ściany E i W szkieletu z drzwiami 1.5 m (E: z −22.25..−20.75; W: z −19.75..−18.25) | 0.3 × 2.2 × 2.05–4.55; pasy 0.3 × 0.6 × 6.7 | x 3.7..4 / −8..−7.7 | 2.8, otwory | paint_white |
| shell_wall_s, shell_partition | tylna ściana szkieletu (krawędź mapy) i przepierzenie dzielące dwa pokoje | 11.4 × 2.8 × 0.3 / 0.3 × 2.8 × 4.7 | z −24.6..−24.3 / x −2.3..−2, z −24.3..−19.6 | 2.8 | paint_white |
| shell_pallets, shell_mixer | palety i betoniarka w pokoju wschodnim | 1.2 × 0.8 × 1.2 / 1.2 × 1.3 × 1.2 | (1..2.2, −23.5..−22.3) / (2.2..3.4, −19..−17.8) | 0.8 / 1.3 | wood / pallets; metal / machine |
| site_sand, site_bricks | pryzma piasku i paleta cegieł na placu | 2 × 0.8 × 2 / 1.2 × 1.3 × 1.2 | (−13..−11, −14..−12) / (5.5..6.7, −13.5..−12.3) | 0.8 / 1.3 | soil; wood / pallets |

Razem **127 brył** (w tym 11 płyt gruntu i 14 niewidzialnych). Rekwizyty (bez kolizji, do dopisania w Sesji 2): `barber_chair` ×2 na proxy, `mirror`, `neon` „BARBER", `sign` „17" na 2.5 m przy prawym narożniku, `sign` skrzynka na słupku bramy, `lamp wall` między oknami piętra, panele `glass_dark` okien i rolet, kominy ×2 (`vent`/bryła dekoracyjna na dachu), balkon (`board`/`shelf` na elewacji +Z nad barakiem — tylko wizualnie, P6a), `pole` + `cable` na słupach, korony sosen wysoko, `wheel` ×n, `tube_light` w hali, `pipe` (wąż), `lamp post` = latarnia poza granicą (tło).

### 5.5 Starty, spawny, stacje, flagi, miejsca bomby

- **Start T0 (działka)**: `(−3.4, 0, 17.0)`, yaw −π/2 (patrzy na zachód, w zachodnie drzwi baraku 1.1 m dalej). Chowa go barak (ściany 2.8, drzwi W i E przesunięte względem osi przejść) i dom; widzą go 338 z 5279 powierzchni (6.4 %), najdalsza 14.7 m (z zachodniego trawnika przez drzwi W). Wyjścia w 15 m ścieżki: drzwi W baraku 1.0 m → trawnik zachodni; tylne drzwi garażu 7.9 m; drzwi E baraku 8.0 m → przejazd wschodni; ogród (0, 22) 9.9 m; przejazd wschodni (9.5, 12) 14.8 m — **5 wyjść**.
- **Start T1 (budowa)**: `(−7.0, 0, −23.6)`, yaw 0 (patrzy na północ, w drzwi N szkieletu). Chowa go szkielet: drzwi N na zachodnim końcu ściany (x −7.7..−6.2) leżą poza osią bramy budowy, drzwi W (z −19.75..−18.25) rzutują ze startu na panel siatki, nie na lukę; widzi go 216 powierzchni (4.1 %), najdalsza 14.5 m. Wyjścia w 15 m: drzwi W 5.1 m; drzwi N 7.0 m; drzwi E 13.2 m — **3 wyjścia** (brama budowy 15.7 m tuż za progiem).
- Oba starty niewidoczne wzajemnie stojąc/kucając (wszystkie pary spawnów T0×T1); **0 komórek widzi oba starty** (sprawdzenie własne `both.mts`, R5). Linia prosta start–start 40.8 m, ścieżka **44.3 m, 5.85 s** sprintu.
- **Spawny T0** (`team: 0`, pierwszy = start): (−3.4, 0, 17.0, −π/2); (−7, 0, 28.5, π); (−2, 0, 23, π); (3.5, 0, 22, π); (9.5, 0, 31, π); (−2.5, 0, 40, π) [w hali].
- **Spawny T1** (`team: 1`): (−7, 0, −23.6, 0); (−4, 0, −20, 0); (0.5, 0, −21, 0); (3, 0, −21.5, 0); (−11, 0, −19, 0) [pas zachodni placu]; (6.5, 0, −11.5, 0) [plac przy luce E].
- **arenaSpawns** (8, po trzech strefach): (−27, 0, −4, π/2) ULICA-W; (27, 0, −6, −π/2) ULICA-E; (10.5, 0, 12, π) PODJAZD; (−10.5, 0, 3.5, π) TUJE-kieszeń; (−6, 0, 39.5, 0) HALA; (3, 0, −12.5, 0) BUDOWA; (3, 0, 30, π) OGRÓD; (−11, 0, −22, 0) BUDOWA-W.
- **Stacje** (rozrzut 52 m w x): HALA (−3, 0, 38); SOSNY (−25, 0, −6.5); ULICA (27, 0, −5).
- **Flagi** (min. odległość 23.4 m): A HALA (−6, 0, 36.5); B PODJAZD (8.5, 0, 3); C BUDOWA (−9, 0, −12.5).
- **Miejsca bomby**: A HALA (−6, 0, 36.5) — obciążenie 15 brył w 7.5 m; B BUDOWA (−9, 0, −12.5) — 12 brył; równe dojście: A jest tyłem T0, B tyłem T1 (w DOM/BOMB obie drużyny startują z 6 spawnów po swojej stronie; P1 domyślnie: tylko duel/turniej w pierwszym cięciu).
- `huntSpawnMinM: 10` (przekątna `bounds` 94.8 m; GÓRA 6 na 39, dzielnica 14 na 121), `killY: −8`, `bounds: boxFrom(−32, −2, −26, 64, 20, 70)` → x −32..32, y −2..18, z −26..44.

### 5.6 Trzy walki

**ULICA** (callouty ULICA, SOSNY, VAN, BRAMA/FURTKA/TUJE jako wejścia, BUDOWA jako wyjścia): jedna prosta linia 58.6 m po koronie drogi (z −5.5..−3.5) od końca do końca; kto ją trzyma z DMR M-1 (60 m pełnych obrażeń) albo SR-50, widzi każdego, kto przekracza ulicę — ale sam stoi na 1.7 m pasie bez osłony, bo osłony stoją z boku: na pasie południowym przy budowie auto (1.45), kontener (1.3), van (2.2) z toi-toiem (2.3), drugi kontener (1.3), na północnym auto (1.45) przy wschodnim słupie, do tego dwa słupy 0.35 i pnie sosen 0.6. Kucając za autem albo kontenerem jesteś schowany przed całą ulicą (osłona klasy 1.3–1.45 chowa kucającego), stojąc pokazujesz głowę; van i toi-toi chowają całego. Cztery miejsca sporne (zachód przy słupie, środek przy vanie, wschód przy aucie) są równo daleko z obu startów (Δ ≤ 150 ms). Dystans 30–60 m: DMR, snajperka, karabinek C-20 (38 m) i AR-31 (32 m) już w falloffie.

**PODJAZD / FRONT** (BRAMA, FURTKA, TUJE, PODJAZD, GARAŻ jako próg): pas 12–25 m między linią frontu a domem i wzdłuż przejazdu wschodniego. Płot sztachetowy 1.5 m to osłona „kucnij i zniknij" po obu stronach; brama 3.2 m otwiera dłuższą diagonalę na front garażu i przejazd (do 20 m), furtka 1.5 m to wąskie gardło naprzeciw otwartej lewej bramy garażu (7 m), dziura w tujach prowadzi tylko do kieszeni za szpalerem tui i dalej na zachodni trawnik (rząd tui 6 m odcina kieszeń od reszty frontu). Kto wchodzi z ulicy, wybiera jedno z trzech wejść; kto broni, stoi za płotem, w niszy garażu albo za tujami. Dystans 12–25 m: karabin, C-20, rewolwer R-44 (28 m), P9 (22 m).

**WNĘTRZA** (GARAŻ, BARAK, HALA, BUDOWA-szkielet, OGRÓD jako łącznik): garaż 6 × 6.5 z autem i 4 m nawą od bramy do tylnych drzwi; barak 8 × 4.3 przelotowy W–E z dwoma fotelami (1.45) i ladą (0.8) — wchodzi się z trawnika, wychodzi na przejazd, nigdy do ślepego pokoju; hala 12 × 7 z autem nad głową na dwóch słupach, szafkami 2.0 i beczkami, brama rolowana od ogrodu i drzwi boczne na 1.8 m szczelinę wzdłuż tui (pętla wokół hali); szkielet budowy 12 × 7.3 z przepierzeniem i trzema drzwiami. Wszystko < 10 m, narożniki i drzwi 1.5 m: strzelby S12 (9 m) i SG-6 (7 m), SMG K-7/VZ-9, MP-11, clippers. Łączniki: przejście zachodnie (TUJE) i przejazd wschodni (PODJAZD) — po jednym z każdej strony domu, obydwa cięte koronami drzew na wysokości oczu.

### 5.7 Callouty

1. **ULICA** — droga, cały odcinek 60 m (z „zachód/środek/wschód" jako dopowiedzenie).
2. **SOSNY** — dalsze pobocze ze szpalerem pni, między ulicą a siatką budowy.
3. **BUDOWA** — plac za siatką i szkielet parteru (start T1).
4. **VAN** — biały van z toi-toiem na środku odcinka, pas południowy.
5. **BRAMA** — brama wjazdowa 3.2 m i podjazd tuż za nią.
6. **FURTKA** — furtka 1.5 m naprzeciw garażu.
7. **TUJE** — dziura w tujach, kieszeń za szpalerem i zachodnie przejście wzdłuż żywopłotu.
8. **PODJAZD** — betonowy przedogródek i przejazd wschodni do ogrodu.
9. **GARAŻ** — wnęka garażowa domu z autem, przelotowa do zachodniego trawnika.
10. **BARAK** — czarny barber shop pod balkonem (start T0).
11. **OGRÓD** — trawnik za domem: drzewa, krzak, przyczepa pod plandeką, zjeżdżalnia.
12. **HALA** — blaszana hala detailingu w tylnym lewym rogu.

(Słup, kontenery, auto i toi-toi są punktami orientacyjnymi wewnątrz ULICY/VANU, nie osobnymi calloutami — limit R11 to 12.)

### 5.8 Pomiary

Z `measure-final.md` (harness tej sesji, `simulateBody` + siatka chodu repo, sprint trzymany, prawdziwy mover):

- `127 solids · 0 props · 0 lights · 12 team spawns (+8 arena) · 3 stations · 3 flags · 2 sites · bounds 64.0 × 70.0 m · 7504 walk cells, 5279 reachable from spawn 0 (1320 m²).`
- Suita wspólna (emulowana): spawny 6 + 6 ok, wszystkie wolne/na podłodze/w granicach/osiągalne, zbiór osiągalny 5279 > 400, żaden spawn T0 nie widzi spawnu T1, stacje 3 z rozrzutem 52.0 m, flagi ABC min 23.4 m, 0 spawnów w strefie flagi, miejsca bomby własne i w granicach (obciążenie A 15+0, B 12+0), 0 głębokich nakładań tego samego materiału, audyt podłóg 0/0, `huntSpawnMinM 10` na przekątnej 94.8 m.
- **Starty ukryte**: `all pairs, standing/crouching both ends: none visible — ok`. Powierzchnie widzące start T0: **338 z 5279 (6.4 %), najdalsza 14.7 m**; start T1: **216 z 5279 (4.1 %), najdalsza 14.5 m** (GÓRA: 7.9 %, 9 m). **Start do startu pieszo: 44.3 m, 5.85 s** (R7: 35–45 m).
- **Trasy z obu startów** (to samo miejsce z każdej strony):

| Place | T0 path (m) | T0 (s) | T1 path (m) | T1 (s) | Δ (ms) |
|---|---|---|---|---|---|
| *street_w | 30.1 | 3.92 | 29.2 | 3.88 | 33 |
| *street_mid | 24.4 | 3.17 | 23.1 | 3.02 | 150 |
| *street_e | 34.9 | 4.53 | 34.2 | 4.55 | 17 |
| *pole_w | 25.6 | 3.33 | 25.7 | 3.38 | 50 |
| gate | 26.5 | 3.43 | 30.2 | 4.00 | 567 |
| wicket | 20.0 | 2.60 | 24.1 | 3.15 | 550 |
| hedge_gap | 19.7 | 2.57 | 24.3 | 3.18 | 617 |
| garage_door | 14.4 | 1.88 | 30.3 | 3.97 | 2083 |
| shed_w_door | 1.0 | 0.10 | 43.2 | 5.65 | 5550 |
| hall_mouth | 18.7 | 2.43 | 60.6 | 7.90 | 5467 |
| site_gate | 28.6 | 3.72 | 15.7 | 2.05 | 1667 |
| site_gap_w | 28.2 | 3.68 | 15.8 | 2.07 | 1617 |
| site_gap_e | 31.9 | 4.13 | 21.4 | 2.78 | 1350 |
| toj | 30.5 | 3.93 | 23.7 | 3.13 | 800 |
| skips | 30.9 | 4.02 | 28.7 | 3.83 | 183 |
| car | 37.8 | 4.92 | 37.2 | 4.95 | 33 |
| street_w_end | 36.6 | 4.78 | 36.3 | 4.80 | 17 |
| street_e_end | 45.9 | 5.98 | 45.2 | 6.00 | 17 |
| other_start_T1 | 44.3 | 5.85 | 0.0 | 0.00 | 5850 |
| other_start_T0 | 0.0 | 0.00 | 44.1 | 5.75 | 5750 |

  Najgorsza różnica ogółem 5850 ms (miejsca jednej strony — oczekiwane); **najgorsza różnica na 4 miejscach spornych: 150 ms — ok** (R4 ≤ 250). Żadna trasa nie utknęła (0 × STUCK), 0 par bez ścieżki. Osiem miejsc R4: BRAMA 3.43/4.00 s, FURTKA 2.60/3.15, GARAŻ 1.88/3.97, BARAK 0.10/5.65, HALA 2.43/7.90, ULICA (środek) 3.17/3.02, TOJ 3.93/3.13, drugi start 5.85/5.75.
- **Wyjścia**: T0 w 15 m — **5** (shed_w_door, shed_e_door, garage_back_door, east_lane, garden_n), w 30 m 6 z 10 — ok; T1 w 15 m — **3** (shell_door_n, shell_door_e, shell_door_w), w 30 m 5 z 10 — ok.
- **Linie wzroku** (oko stojące → oko stojące, tylko powierzchnie osiągalne): `5279 surfaces (1320 m²), 200000 pairs, 39496 clear (19.7 %): median 11.2 m, p90 28.3 m, p99 49.6 m, longest 58.6 m (−29.25, 0, −4.75) → (29.25, 0, −1.75)`. Linie czyste ponad 10 m: **56.1 %**; 15 m: **35.3 %**; 20 m: **21.7 %**; 30 m: **8.6 %**; 40 m: **3.3 %**; 50 m: **0.9 %**. R5: mediana 8–12 → ok; **p90 ≤ 25 → FAIL (28.3)**; najdłuższa ≥ 50 → ok (58.6 m, na ulicy; żadna linia nie jest dłuższa niż ulica). (GÓRA: mediana 7.6, p90 15.0, najdłuższa 34.) Rozbicie własne (`sight2.mts`, ta sama próba 200 000 par): bez par ulica↔ulica **mediana 10.1, p90 21.9, p99 35.1, > 25 m 6.6 %**; tylko ulica↔ulica: mediana 16.1, p90 40.5, > 25 m 30.5 %.
- **Łańcuch wspinaczek**: `mantle 1.25 m beside a top; sprint jump 4.42 m across; 21 standable tops of 127.` **Blaty osiągalne ≥ 1.9 m: none.** **Granica/dach osiągalne: none — ok** (dach domu, baraku, hali, żywopłoty, siatka, balkon: nieosiągalne).
- **Osłony (R3)**: `low (0.5–1.0) 8 · crouch (1.2–1.6) 17 · full (2.0–2.8) 26 · structure (≥ 2.8) 36 · off the language: none — ok`. **Nic nie lata**: `solids not standing on the ground or on another solid: none — ok`. Osłony węższe niż ciało w obu osiach (celowo częściowe): jamby drzwi garażu i szkieletu (0.3–0.75 m), fotele 0.8 m, słupy podnośnika 0.4, pnie drzew 0.6.
- **Werdykt harnessu**: `1 failing checks: p90 sight line over 25 m` — wszystko inne przechodzi.

### 5.9 Decyzje do podpisu

- **D-W1 — kieszenie startowe: T0 w baraku, T1 w szkielecie budowy.** Start T0 stoi przy zachodnich drzwiach baraku (5 wyjść w 15 m), T1 w tylnym rogu zachodniego pokoju szkieletu (3 wyjścia). *Alternatywa:* T0 w hali (tył działki: 60 m do budowy, runda 60 s za krótka) albo T1 na poboczu przy sosnach (bez kieszeni — widoczny z ulicy).
- **D-W2 — ulica jako środek; miejsca sporne = cztery punkty na ulicy** (zachód przy słupie, środek przy vanie, wschód przy aucie, słup zachodni), nie BRAMA/FURTKA/GARAŻ/BARAK/HALA, jak literalnie mówi R4 — na prawdziwym, niesymetrycznym miejscu te pięć należy do jednego „domu" (Δ 550–5467 ms) i nie da się ich wyrównać bez obrotu mapy o 180°, co łamie R8. Zmiana stron co 3 rundy wyrównuje to, co każdy ma u siebie. *Alternatywa:* literalne R4 → mapa symetryczna, czyli nie ta działka.
- **D-W3 — dziura w tujach jako trzecie wejście** (1.5 m, x −11.5..−10) w jednej linii z zachodnią luką siatki: „zachodnia aleja" przez ulicę; dziura prowadzi do kieszeni za szpalerem tui, nie na front. *Alternatywa:* zamknięta → dwa wejścia (brama, furtka), T0 na zachód ulicy +4 m, Δ street_w ~500 ms bez dalszych zmian.
- **D-W4 — furtka otwarta i poszerzona do 1.5 m** (ze zdjęcia ~1 m; P9 domyślnie), brama otwarta 3.2 m. *Alternatywa:* furtka zamknięta (osłona 1.5 m) → T0 do środka ulicy przez bramę +8 m, balans ulicy do przebudowy.
- **D-W5 — w garażu OTWARTA jest LEWA brama (ta w niszy), prawa zamknięta** — odwrotnie niż domyślna odpowiedź P5. Powód zmierzony: lewa brama leży w osi furtki i tylnych drzwi garażu; prawa otwarta wydłuża trasę T0 do ulicy o ~2.5 m (330 ms), co wymusza cofnięcie szkieletu T1 o 2.5 m i start–start 47 m > 45 (R7). Nisza (~1 m) jest tu tylko wizualna (otwór w licu). *Alternatywa:* jak P5 → R7 albo R4 do ponownego wyważenia.
- **D-W6 — drzewa w ogrodzie jako przerywacze linii**: pień 1.4 m + korona od 1.4 do 4.5 m (blokuje oko stojące 1.62; kucając 1.25 da się pod nią przejść — celowa „niska" droga), korona tree_w dotyka zachodniego żywopłotu (inaczej przejście zachodnie było jedną linią 61 m od hali do budowy); do tego krzak 3 m w ogrodzie (graft z prototypu „Wierny miejscu"). *Alternatywa:* same pnie 0.5 × 5 m (fidelity) → ogród i przejścia jako linie 25–36 m.
- **D-W7 — próg p90 (R5)**: zmierzone **p90 28.3 m** przy medianie 11.2; bez par ulica↔ulica p90 21.9. Jedyne uczciwe osłony na ulicy wyższe od oka (1.62) to van i toi-toi; auta 1.45 i kontenery 1.3 przerywają linie kucającego, nie stojącego — taki jest język osłon z R3. Proponowany próg: **p90 ≤ 30 m ogółem i p90 ≤ 25 m poza parami ulica↔ulica** (obie liczby spełnione). *Alternatywa:* van w poprzek korony drogi (wtedy p90 ~26, ale to zabudowanie ulicy, którego R5 zakazuje) albo próg 25 utrzymany = mapa nie przechodzi.
- **D-W8 — barak z DWOMA drzwiami**: zachodnie (od trawnika/ogrodu) i wschodnie (od podjazdu), oba 1.5 m, na tej samej wysokości z 16.25..17.75; bez trzecich drzwi północnych z prototypu CS2. *Alternatywa:* trzecie drzwi N → 6 wyjść T0, ale kieszeń startowa widoczna z ogrodu.
- **D-W9 — hala dokładnie 12 × 7 × 4, odsunięta 1.8 m od zachodniego żywopłotu; drzwi boczne w ścianie zachodniej „od strony tui", brama rolowana 4 m w ścianie południowej „od domu/ogrodu"** (oba prototypy miały drzwi w ścianie wschodniej). Auto na podnośniku = bryła zawieszona 2.0 m nad podłogą (przechodzi się pod nią), nie osłona 1.45. *Alternatywa:* drzwi we wschodniej ścianie → bez pętli wzdłuż tui; auto na ziemi jako osłona 1.45 (P11 domyślnie) → hala traci nawę.
- **D-W10 — szpaler 3–4 wysokich tui na lewo od domu jako rząd N–S w przedogródku** (x −8.6..−6.4, od żywopłotu do narożnika domu; odczyt Z2 z prototypu „Wierny miejscu"), dzielący front na kieszeń zachodnią i podjazd. *Alternatywa:* tuje obok domu (CS2) → front jest jedną otwartą płytą 24 × 6 m.
- **D-W11 — obiekty na ulicy przestawione (P12 domyślnie)**: ciemne auto nr 2 i kontener 1 na pasie południowym przed zachodnią luką siatki (kontener wprost przed luką, auto zamyka szczelinę za nim — to gałka wyrównująca czas T1 na zachód ulicy), van + toi-toi na środku odcinka przy budowie, kontener 2 na x 9..12, ciemne auto nr 1 na pasie północnym na x 17..21 (auto z Z3 przy działce). *Alternatywa:* jak na Z1 (wszystko po prawej, dalej na wschód) → Δ street_w 450–630 ms.
- **D-W12 — proporcje zmienione względem zdjęć dla R7**: przedogródek 5.5 m od płotu do domu, dom 10 × 10 (Z2: 10 × 10–11), barak 8 × 4.3 (ściany 0.3; 4.0 proponowane), szkielet budowy przysunięty do ulicy (plac 8.7 m głęboki, tylna ściana szkieletu = krawędź mapy), droga 5.2 m, pobocze z sosnami 1.6 m — wszystko w ±20 % R8. *Alternatywa:* wymiary jak w §2 → start–start 49 m (R7 35–45 niespełnione).
- **D-W13 — dach kopertowy jako dwie schodkowe płyty `paint_red`; balkon, kominy, tabliczka „17", lampa, skrzynka i przewody jako rekwizyty bez kolizji; balkon nie jest perch (P6a)** — dowód: dach baraku 2.75 m poza zasięgiem 2.7, żaden osiągalny blat ≥ 1.9 m na mapie. *Alternatywa:* P6c (BALKON jako perch ze schodami z obu stron) → +2 biegi schodów, nowy pomiar.
- **D-W14 — front budowy jako `fence` (siatka: widać, kule stają) z pasem niewidzialnym nad panelami; trzy przerwy 1.5 / 3.2 / 1.5 m; spawny drużynowe T1 na placu i w szkielecie.** *Alternatywa:* drewniany parkan `wood` (nieprzezroczysty) → ulica nie widzi placu, T1 wychodzi „na ślepo".

### 5.10 Ryzyka i co nie jest zmierzone

- **Brak renderu.** Wszystko powyżej to dane i symulacja; sylwetki (dom z dachem-piramidą, czarny barak, blacha hali, szpaler tui, pnie sosen) i to, czy osłona wygląda jak osłona, sprawdzi dopiero `map-review.html?map=dolna` przez SwiftShader — a czytelność w nocy na prawdziwym GPU tylko playtest.
- **60 s rundy vs 44.3 m ścieżki start–start**: spotkanie w środku ulicy po ~3.1 s sprintu z obu stron, ale gracz, który idzie tyłem (hala ↔ szkielet) potrzebuje 60.6 m = 7.9 s; rundy „na zegar" (kto ma więcej HP) będą częstsze niż na GÓRZE. Nie zmierzone: realny czas spotkania z botem (P7).
- **Balkon**: przyjęty na elewacji ogrodowej (+Z) nad barakiem (P2 domyślnie), tylko wizualnie; jeśli właściciel wskaże inną elewację, barak i start T0 przesuwają się z nim i cały pomiar jest do powtórzenia.
- **Wnęka lewej bramy garażu** jest tylko otworem w licu (bez cofnięcia o 1 m) — kosmetyka do Sesji 2, bez wpływu na trasy.
- **Korony drzew od 1.4 m**: pod koroną można przejść kucając (1.25 m) — mover harnessu tego nie robi (siatka chodu liczy ciało stojące), więc realny gracz ma tam dodatkową, wolną (2.7 m/s) drogę; do sprawdzenia, czy to nie otwiera linii, których pomiar nie widzi.
- **Mover harnessu** obcina zakręty o 0.6 m przy wąskich (1.5 m) przejściach podchodzonych na ukos; w tej wersji 0 × STUCK, ale każda zmiana pozycji drzwi/luk musi być mierzona ponownie (`map-duel` w repo ma ten sam model).
- **Nie zmierzone przez harness**: R11 „≤ 3 zakręty na trasę bota" (trasy ULICA–HALA i ULICA–szkielet mają 3–4 załamania — do sprawdzenia narzędziem `findPath` w repo), draw-calle (`metrics.json`), obciążenie świateł (0 świateł w prototypie), rekwizyty (0 w prototypie — proxy foteli już są bryłami).
- **SwiftShader** renderuje bez GPU: mgła, emisja neonu i jarzeniówek oraz kontrast czarnego baraku w nocy wymagają prawdziwego GPU.
- **Do sprawdzenia ze zdjęciami przez czat odbierający**: pozycje vana (tu x −2.5..2.5 po stronie budowy, środek odcinka), obu aut (tu jedno na pasie południowym x −17.6..−13.2, drugie na północnym x 17..21.4), kontenerów (x −13.2..−11.2 i 9..12), toi-toia (x 3..4.1 obok vana), czy dziura w tujach istnieje naprawdę czy jest dodana (D-W3), która brama garażowa jest w niszy i czy to ona ma być otwarta (D-W5), strona balkonu (P2), miejsce altany → hali (tu tylny LEWY róg, x −10..2), szerokość drogi 5.2 m i głębokość przedogródka 5.5 m.

## 6. Porządek pracy (dwie sesje; ma być w prompcie wykonawczym w tej kolejności)

**Drop W — DOLNA** jest wpisany w `docs/PLAN_2_1.md` §Drops (ta sesja), gałąź `drop/w-dolna`,
decyzje D-W1…, wyjścia narzędzi w `apps/client/e2e/out/dolna/`. Zlecenie właściciela z 2026-09-26
jest jego wyraźnym słowem i uchyla dla tej mapy bramkę playtestu A–D z `MASTER_PROMPT.md` (wpis w
Decisions).

**Sesja 1 — projekt na papierze (kończy się podpisem):**
1. Rytuał plan-keepera (§4.9). Potem zwiad przez subagentów (≤ 300 słów, `file:line`):
   `docs/MAP_2.md` §8 i l. 549–700, `docs/MAP_1_REWORK.md` §2–§5, `packages/shared/src/gora.ts`,
   `gora.test.ts`, narzędzia z §4.7 — wskazane zakresy, nie całe pliki.
2. **Najpierw narzędzie** (commit 1): `map-plan.ts` — rozmiar z `map.bounds`, etykiety z tablicy
   calloutów mapy; `map-duel.ts` — sekcja symetrii tylko, gdy mapa ją deklaruje, dla DOLNEJ jawna
   tabela `DOLNA_PLACES` (miejsce → współrzędne, oba starty do tego samego punktu); `map-rotation.ts`
   — starty i miejsca z `MAPS[id]`; `map-audit.ts` — błąd na nieznanym id; `map-review.mjs` —
   `MAP=<id>` i kamery z `VIEWS=<plik json>`, `metrics.json` jak dziś. Dowód „bit w bit dla GÓRY”:
   `diff` wyników przed i po → `out/dolna/tools-diff.md`.
3. **Projekt na papierze** — sekcja `## Projekt` dopisana na końcu tego pliku (po Załączniku B; §2 i §5
   zostają nietknięte): tabela ekstentów (obszar → box), plan ASCII z tej tabeli, lista wszystkich brył
   z wysokością wg języka osłon, starty i pozostałe spawny, stacje, flagi, miejsca bomby, trzy walki,
   linie wzroku, callouty, **lista decyzji do podpisu D-W1…** (jak D-G1…D-G6 w `MAP_2.md`). Punkt wyjścia: prototyp
   `apps/client/e2e/tools/dolna/proto-final.ts` (127 brył, zmierzony harnessem z tego katalogu —
   `measure.mts`, `plan.mts`); liczby z §5 zmierzone ponownie narzędziami repo na prototypie
   przeniesionym do `packages/shared/src/dolna.ts` **bez wpisu do `MAPS`** (narzędzia importują plik
   wprost). Wiersz ledgera ze statusem `blocked: waiting for the
   owner's sign-off of the paper design`, commit `plan: ledger <data> drop W`, raport ≤ 20 linii z
   listą decyzji. **Stop.**

**Sesja 2 — geometria (po podpisie):**
4. **4a.** Pierwszy commit geometrii = kompletny szkielet `DOLNA` (podłoga, granica, 6 + 6 spawnów,
   `arenaSpawns`, 3 stacje > 30 m w x, flagi A/B/C, 2 `sites`, `huntSpawnMinM`, `killY`, `bounds`)
   **razem z wpisem do `MAPS`** (nie do `MAP_ORDER` — to należy do P1) — suita wspólna i
   `map-audit.ts dolna` muszą być zielone od tego commitu. **4b.** Dom i płot → barak i hala → ulica
   i budowa → rekwizyty → światła, po każdym `pnpm test` i `map-audit.ts dolna`.
5. `dolna.test.ts` na wzór `gora.test.ts` (Δ ≤ 250 ms do ośmiu miejsc z R4 zamiast symetrii;
   ścieżka między każdą parą calloutów), potem `map-duel` / `map-rotation` / `map-plan` →
   `out/dolna/*.md`.
6. Render: `map-review.html?map=dolna` z ~10 kamer (oba starty, brama, garaż, barak, hala, ulica z
   obu końców, z góry) → `out/dolna/shots/` przez bliźniaka `gora-shots.mjs` (`dolna-shots.mjs`);
   recenzent-oko (inny agent) oddaje tabelę `plik — werdykt — powód`.
7. **Pakiet P1** (po odpowiedzi właściciela; osobne commity): `map.ts` (`DUEL_MAP_IDS` +
   `DEFAULT_DUEL_MAP_ID` albo podmiana `DUEL_MAP_ID`), `TdmRoom.ts:359` (przyjmuje `options.map`, jeśli
   jest na liście), `Menu.tsx:457–461`, `Loading.tsx:38–39`, `fixtures.ts:213`, `App.tsx:153`,
   `MAP_ORDER` albo filtr „tylko duel” — **i ich testy** (§4.5) w tym samym commicie; opcjonalnie
   `menuArt.tsx` (glif DOLNEJ) i `ViewerScene.ts` (`DOLNA_VIEWPOINTS`). Live: pełny duel z botem na
   DOLNEJ przez `dolna-shots.mjs` z pętlą śledzenia do końca meczu (nie 60 s), log do
   `out/dolna/live.md`; drabinka przez `tournament.mjs` (gra na mapie duelu — po P1).
8. Bramki: `pnpm typecheck`, `pnpm test`, `pnpm build`, e2e (jedna suita); ledger + Decisions +
   Deferred w `docs/PLAN_2_1.md`, commit `plan: ledger <data> drop W`; raport ≤ 20 linii **z listą
   „nieudowodnione”** (§7).

## 7. Definicja ukończenia (liczby, nie przymiotniki)

Sesja 1 jest skończona, gdy istnieje sekcja `## Projekt` z tabelą ekstentów, planem ASCII z niej
wyrenderowanym, listą brył, startami, trzema walkami, calloutami, pomiarami z narzędzi repo i listą
D-W1…, a ledger ma wiersz `blocked: waiting for sign-off`.

Sesja 2 jest skończona, gdy:
- wszystkie testy z §4.6 są zielone dla `dolna`; `map-audit.ts dolna`: 0 par koplanarnych ≥ 0.25 m²,
  sekcja 2a (ALMOST connected) pusta poza bryłami z listy osłon 1.3–1.5 m i konstrukcji ≥ 2.8 m
  wymienionymi po nazwie w `## Projekt`, 0 rekwizytów zatopionych lub latających, 0 osłon bez bryły;
- `map-duel` (uogólniony): starty niewidoczne 0 par na wszystkie (stojąc i kucając); Δ czasów sprintu
  do ośmiu miejsc z R4 ≤ 250 ms dla miejsc spornych; ≥ 3 wyjścia na start w 15 m; jedna linia ≥ 50
  m; mediana 8–12 m, p90 ≤ 30 m ogółem i ≤ 25 m poza parami ulica↔ulica (R5, D-W7) albo nowy próg z
  liczbą w Decisions; łańcuch
  wspinaczek: dach domu, baraku i hali, balkon i ogrodzenie nieosiągalne (chyba że perch z P6 — wtedy
  równy czas z obu stron); R11: ≤ 12 calloutów, ≤ 140 brył, ≤ 3 zakręty na trasę;
- render: 10 zrzutów, tabela recenzenta-oka z 0 werdyktów „lata” / „przenika” / „nieczytelna
  sylwetka” (każdy zarzut odtwarza audytor); `drawCalls` widoku „ulica” DOLNEJ ≤ `drawCalls` widoku
  `street` NIGHT_DISTRICT z tego samego przebiegu `map-review.mjs` (preset medium, 1440 × 900), oba w
  `out/dolna/metrics.json`;
- live: jeden pełny duel z botem na DOLNEJ do 6 bez błędów w konsoli, w śladzie bota ≥ 3 różne strefy
  calloutów; `dolna.test.ts`: 0 par calloutów bez ścieżki;
- ledger w `PLAN_2_1.md` ze ścieżkami dowodów **i obowiązkowa lista „nieudowodnione”** (w raporcie i
  w Deferred): (a) czytelność na prawdziwym GPU (render tu to SwiftShader), (b) czy 60 s rundy
  wystarcza na mapę 70 m — tylko dwoje ludzi, (c) każdy świadomie zostawiony boost/perch z wysokością i
  skąd osiągalny, (d) czy asymetria ≤ 250 ms jest odczuwalna. Bez tej listy sesja nie pisze „mapa
  gotowa”.

## 8. Stop i pytaj (sesja wykonawcza zatrzymuje się, gdy…)
…zmiana dotknęłaby `PLAYER`, `WeaponDef`, `DUEL.roundMs` (60 s może być za krótkie na mapę 70 m — to
decyzja właściciela, nie agenta; P7), pola schematu, `DUEL_MAP_ID` / logiki wyboru mapy poza
pakietem P1, nowego `MaterialTag` / `SolidLook` bez pomiaru draw-calli, albo gdy projekt na papierze
nie ma podpisu (Sesja 2 nie zaczyna się bez niego).

## 9. Pytania

**9a — do właściciela.** Prompt wykonawczy ma zawierać przed listą zdanie do sesji: *„Jeśli przy
pytaniu nie ma odpowiedzi właściciela, przyjmij domyślną i odnotuj to w Decisions; P1 i P2
potwierdź z właścicielem w raporcie Sesji 1.”* Właściciel dopisuje odpowiedzi w tym miejscu przed
wklejeniem.
- **P1** DOLNA **zastępuje** GÓRĘ jako mapa duelu, czy obie są wybieralne (lista `DUEL_MAP_IDS` +
  wybór w lobby)? I: czy DOLNA ma być w `MAP_ORDER` dla wszystkich trybów (TDM / DOM / BOMB /
  Ostrzyżeni / Gun Game — wtedy flagi i miejsca bomby projektujemy na serio), czy tylko dla
  duelu/turnieju (wtedy R10 to minimum testowe, a menu innych trybów jej nie pokazuje — filtr w
  `Menu.tsx:460`)? *Domyślnie: obie wybieralne, DOLNA domyślna dla turnieju; tylko duel/turniej w
  pierwszym cięciu, reszta trybów po playteście.*
- **P2** Która elewacja ma balkon (ogrodowa / boczna / frontowa) i po której stronie domu stoi altana
  → hala? Szkic w pięć kresek: ulica, dom, bramy, balkon, altana. *Domyślnie (konwencja z §2): ulica
  wzdłuż X, działka w +Z, front domu (bramy) w −Z, balkon na elewacji +Z (ogrodowej), hala w tylnym
  rogu działki po przeciwnej stronie niż podjazd.*
- **P3** Noc (jak cała gra: latarnia, neon barbera, jarzeniówki hali, lampa na domu, reflektor
  budowy) czy próba dnia? *Domyślnie: noc.*
- **P4** Tuje i sztachety: czy kule przez nie przechodzą? W silniku każda bryła zatrzymuje kule; tuje
  jako bryła = pełna, nieprzejrzysta osłona; jako rekwizyt = nic. *Domyślnie: tuje = bryła (osłona i
  granica), płot sztachetowy = bryła 1.5 m (kucnięcie chowa, stojąc widać głowę; ~1.6 m na zdjęciu
  mieści się w ±20 % R8).*
- **P5** Które wnętrza są otwarte: garaż w domu (przelotowy do ogrodu?), parter domu, szkielet
  budowy? *Domyślnie: otwarta jest LEWA brama garażu (ta w niszy — leży w osi furtki i tylnych drzwi;
  pomiar D-W5 w §5), prawa zamknięta; z garażu drzwi do ogrodu (garaż przelotowy); dom zamknięty;
  budowa: parter bez stropu jako drugi kraniec.*
- **P6** Perch: (a) brak, (b) dach hali (drabina/schody z obu stron, równy czas), (c) **BALKON** nad
  barakiem (schody z ogrodu i z baraku, lip = balustrada 1.35 m jak GÓRA; widzi ulicę i ogród, nie
  widzi żadnego startu — gotowy „Balcony” z Inferno)? *Domyślnie: (a) w pierwszym cięciu; wtedy dach
  baraku ≥ 2.8 m i żadna bryła ≥ 1.3 m bliżej niż 4.5 m od baraku (skok z rozbiegu 4.42 m), inaczej
  balkon jest osiągalny — dowód w `dolna.test.ts`.*
- **P7** Runda 60 s zostaje? *Domyślnie: zostaje; zmierzyć czas spotkania narzędziem i wrócić z
  liczbą.*
- **P8** Nazwa: DOLNA. Callouty do akceptacji z listy R9 (≤ 12).
- **P9** Furtka: otwarta 1.5 m (trasa) czy zamknięta (tylko osłona 1.5 m)? Brama wjazdowa: otwarta
  (3.2 m) czy uchylona (1.5 m)? *Domyślnie: furtka otwarta 1.5 m, brama otwarta 3.2 m.*
- **P10** Barak barbera: wymiary (domyślnie 8 × 4 m, 2.8 m), przylega do ściany domu pod balkonem
  (jedno wejście od podjazdu, jedno od ogrodu, przez barak) czy stoi 1.5 m od niej (korytarz pod
  balkonem)? Ile drzwi i gdzie? *Domyślnie: przylega, drzwi od podjazdu i od ogrodu.*
- **P11** Hala detailingu: wymiary (domyślnie 12 × 7 m, 4 m), brama rolowana otwarta od strony
  domu/ogrodu czy podjazdu, małe drzwi z której ściany? Czy auto na podnośniku w środku ma być osłoną
  (bryła `car` 1.45 m) czy tylko tłem? *Domyślnie: brama od domu/ogrodu, drzwi od tui; auto na
  podnośniku zawieszone 2.0 m nad podłogą (przechodzi się pod nim; D-W9), szafki 2.0 i beczki 0.8 jako
  osłony.*
- **P12** Granice ulicy: (a) niewidzialna ściana + tuje sąsiadów po obu stronach działki (60–70 m),
  czy (b) do skrzyżowania z asfaltem i latarnią? Druga strona: tylko pobocze z sosnami i toi-toiem
  (płot budowy = granica) czy też parter domu w budowie jako strefa? Van i auto tam, gdzie na Z1
  (po prawej, przy budowie) czy przestawione tak, żeby przerywały linię ulicy co ~20 m? *Domyślnie:
  (a); parter budowy jako drugi kraniec; van i auto przestawione, żeby przerywały linię.*

**9b — do sprawdzenia w kodzie przez sesję wykonawczą przed projektem** (nic z tego nie jest faktem):
- **S1** `look: "portacabin"` — gdzie w boxie wypadają drzwi i próg (`dressing.ts:252–265`) i czy
  ciało bierze kolor z `mat` bryły; jeśli drzwi wypadają nie po tej stronie, co trasa — ściany z
  `wall_panel` + `glass_dark` i otwory w bryłach.
- **S2** `gora-shots.mjs` sekcja 2 — jak wydłużyć śledzenie do końca meczu (`phase === "result"`)
  dla `dolna-shots.mjs`.
- **S3** `tournament.mjs` — czy przyjmuje mapę (po P1 dopisać `MAP=<id>`), ile trwa para.
- **S4** `map-review.mjs` — najprostsze `MAP=` + `VIEWS=` bez zmiany domyślnego przebiegu dzielnicy.

## 10. Format PROMPTU WYKONAWCZEGO, który masz oddać
Po polsku, jedna wiadomość (albo 1/2 + 2/2), w tej kolejności i z tymi nagłówkami, **z numeracją
sekcji jak w tym dokumencie** (2, 3, 5, 9), żeby odsyłacze się zgadzały:
1. **Rola i sesja** — lead delegujący wg `docs/MASTER_PROMPT.md` / `docs/ULTRON.md` i §4.9; Drop W,
   gałąź `drop/w-dolna`, nic na `main`, bez PR; zdanie: *„Obowiązują §4, §6, §7 i §8 z
   `docs/MAP_3_DOLNA.md`; liczby zmierz ponownie wg Załącznika A; zacznij od `git checkout main &&
   git pull`.”*
2. **Zlecenie właściciela** — jego słowa (§3, cytat) + R1–R11 dosłownie.
3. **§2 Miejsce** — pełny opis z §2, poprawiony wg zdjęć, z listą „Ze zdjęć, poza opisem leada”
   i z konwencją orientacji.
4. **§5 Układ startowy** — §5 sprawdzony ze zdjęciami (plan ASCII, ekstenty, starty, trzy walki,
   callouty, pomiary), każda zmiana oznaczona „[zmiana wg zdjęcia Zx]”, z dopiskiem „propozycja do
   ponownego zmierzenia w repo”.
5. **§9 Pytania** — 9a z odpowiedziami właściciela (albo domyślnymi) i zdaniem o domyślnych; 9b.
6. **Raport końcowy** — ≤ 20 linii, bez kodu, ze ścieżkami dowodów i listą „nieudowodnione” (§7).

Długość: tyle, ile trzeba, żeby nic z §2, §3, §5 i §9 nie zginęło; nie skracaj tabel ani list.

=== KONIEC PROMPTU ===

---

## Załącznik A — skąd są liczby (dla repo; nie wklejać)

Każdy fakt w §1 i §4 ma źródło w kodzie z dnia 2026-09-26 (gałąź `claude/confident-cray-nneqme`,
od `11f2bb6`), sprawdzone przez dziewięciu kontrolerów sekcji (325 twierdzeń, 22 poprawki naniesione).
Sesja wykonawcza ma je zmierzyć ponownie, nie wierzyć tej tabeli.

| Fakt | Źródło |
|---|---|
| `DUEL`: prepMs 15 000, buyTailMs 5 000, roundMs 60 000, breakMs 5 000, wins 6, halfRounds 3, matchMs 15 min, economy.floor 2 500 | `packages/shared/src/modes.ts:302–354`, `cs.ts:18–27` (`CS_ROUND`) |
| `CS_ECONOMY`: start 800, max 16 000, win 3 250, lossBase 1 400 | `packages/shared/src/cs.ts:29–44` |
| Wynik rundy: kill / wymiana = remis / zegar = więcej HP | `modes.ts:415–428` (`duelRoundWinner`); broń po śmierci: `TdmRoom.ts:1685–1717` |
| `modeAllowsItem`: duel bez perków i granatnika | `packages/shared/src/economy.ts:110–118` |
| Duel: obaj na PIERWSZYM spawnie strony, fallback `pickSpawn` | `apps/server/src/rooms/TdmRoom.ts:1445` |
| Duel/turniej wymusza `DUEL_MAP_ID`; `duel` obejmuje `turniej` | `TdmRoom.ts:290, 355–359`, `packages/shared/src/map.ts:656`, `Loading.tsx:39`, `Menu.tsx:457–461, 638–653`, `gallery/fixtures.ts:213`, `App.tsx:153` |
| Testy przypięte do mapy duelu | `apps/client/src/ui/hud/copy.test.ts:84`, `errors.test.ts:95–97`, `invite.test.ts:27`, `apps/client/e2e/startup.spec.ts:121` |
| Lobby turnieju przekazuje `map` do aren; limit 32 | `apps/server/src/rooms/TournamentLobbyRoom.ts:91, 226–230`, `packages/shared/src/lobbyProtocol.ts:22` |
| `TOURNAMENT.sizes [4, 8]` | `modes.ts:293–300` |
| Granaty: frag 6 m, molotov 3.2 m / 6 s, nóż 70, flash 14 m, smoke 3.5 m / 12 s, shell 4.5 m | `packages/shared/src/grenades.ts:44–60` |
| `PLAYER`: halfWidth 0.35, height 1.8, crouchHeight 1.25, eyeHeight 1.62, crouchEyeHeight 1.08, headFraction 0.18, walk 5.4, sprint 7.6, crouch 2.7, jumpVelocity 6.4, gravity −22, stepHeight 0.4 | `packages/shared/src/constants.ts:94–118` |
| `MOVE.airStepCrouch 0.32`; slide 0.8 s | `packages/shared/src/movement.ts:29, 75` |
| APEX 0.931 m, MANTLE 1.251 m, REACH 4.42 m (komentarz: 4.43) | `packages/shared/src/gora.test.ts:17–18, 104–105` |
| Pasma testu osłon: crouch 1.3 ± 0.01 lub 1.45 ± 0.06, full ≥ 1.9 | `gora.test.ts:184–196` |
| Ścieżki z obu startów różne o < 1.0 m | `gora.test.ts:59–61` |
| Siatka chodu 0.5 m, JUMP_UP 0.88 m | `packages/shared/src/mapWalk.ts:11–13` |
| Zasięgi broni (tabela §4.3), `damageAtDistance` | `packages/shared/src/weapons.ts:81–294, 355–361` |
| „Do not move damage” | `docs/PLAN_2_1.md:103`, `docs/MAP_1_REWORK.md:133`; L6 `PLAN_2_1.md:30–31` |
| Układ współrzędnych, `MapDef`, `Solid`, `PropHint`, `LightHint`, `MaterialTag`, `SolidLook`, `PropKind`, `DISTRICT_LIGHTS`, `boxFrom` | `packages/shared/src/map.ts:1–120`, `collision.ts:298` |
| Rejestr map `MAPS`, `DEFAULT_MAP_ID`, `DUEL_MAP_ID`, `MAP_ORDER`, `sitesOf`; `mapChoices` z `MAP_ORDER` | `packages/shared/src/map.ts:647–660`, `apps/client/src/ui/invite.ts:25` |
| `BOMB_SITES` domyślne (x −35 / 43) | `packages/shared/src/bomb.ts:46–51` |
| `SPECS: Record<MaterialTag, Spec>`; `wall_panel` albedo `#403630`; maxSimultaneousLights 5 / 4 | `apps/client/src/game/world/materials.ts:35–74, 144`, `props.ts:33` |
| `dressing.ts` — looki, `portacabin`, gałąź `default` | `apps/client/src/game/world/dressing.ts:80–278` |
| `props.ts` — rodzaje rekwizytów, `sign` (`text`, `w`, `h`), `lamp` warianty, `pole`, `cable`, `wheel` | `apps/client/src/game/world/props.ts:189–362` |
| `hasDistrictDressing` = tylko `night_district` | `apps/client/src/game/world/MapBuilder.ts:52–59` |
| Jeden generator cieni (księżyc); `LIGHT_GAIN 1.4`; mgła 0.012 / (0.035, 0.035, 0.05); strefy 12 / 24 m; ≤ 3 praktyczne na siatkę | `MapBuilder.ts:49, 88–98, 201–240, 245–277, 282–283` |
| Plany taktyczne przypięte do `NIGHT_DISTRICT.solids` | `packages/shared/src/plans.ts:16, 41` |
| Minimapa z `solids`; rozmiar mapy w menu z `bounds`; `GenericPlan`; `viewpointsFor` | `apps/client/src/ui/Minimap.tsx:76–81`, `Menu.tsx:52–57`, `menuArt.tsx:144`, `game/viewer/ViewerScene.ts:64` |
| Testy wspólne (progi §4.6) | `packages/shared/src/map.test.ts:25–139, 188–190`, `mapFlags.test.ts:16–26`, `floorAudit.ts:25–29, 105–107`, `floorAudit.test.ts:39` |
| `DOM.radius 3.5`, `heightTolerance` | `packages/shared/src/dom.ts:17–19` |
| `OSTRZYZENI.huntSpawnMinM 14`; GÓRA `huntSpawnMinM 6`; GÓRA `arenaSpawns` 8 | `modes.ts:237`, `gora.ts:266–271, 297` |
| GÓRA: 34 × 22 m, `bounds` 36 × 24, klatka 4.4 m, perch 2.0, lip 1.35, 89 brył, komórki 2 816 / osiągalne 1 940 | `gora.ts:1–60, 301`; pomiar `measure.mts` w tej sesji (Załącznik B) |
| Przejścia 1.5 m, nie 1.2 | `docs/MAP_2.md:524` |
| Narzędzia: `map-audit.ts` (fallback na dzielnicę), `map-duel.ts` / `map-plan.ts` (GORA, ekstenty −18…18), `map-rotation.ts` (dwie mapy), `map-review.mjs` (bez `map=`), `gora-shots.mjs` (`view`, `_drawCalls`, 12 × 5 s), `tournament.mjs` (`LOBBY`, `GRACE`), `map-review.html` (fallback, kamera GÓRY) | `apps/client/e2e/tools/*:1–60`, `gora-shots.mjs:43–53, 106`, `apps/client/map-review.html:11–14` |
| `duel-check.mjs` nie istnieje | `ls apps/client/e2e/tools/`; cytowany w `docs/MAP_2.md:693` |
| Twarde reguły, kierunek artystyczny, pułapki | `docs/MAP_1_REWORK.md` §2 (l. 62–122), §3 (l. 124–147), §5.2 (l. 225–231), §8.2, §14.2 |
| Wymagania testowe GÓRY i „Rebuilt as the 1v1 roof” (mediana 7.6, p90 15.0, 0 ms, 7.9 %) | `docs/MAP_2.md` §8 (l. 338–372), l. 549–700 |
| Schody spotykane z boku | `docs/PLAN_2_1.md`, Deferred, Drop T 2026-09-23 |
| Rytuał sesji | `docs/MASTER_PROMPT.md`, `docs/ULTRON.md`, `.claude/skills/plan-keeper/SKILL.md` |

## Załącznik B — jak powstał §5 (przebieg tej sesji)

1. **Narzędzie przed projektem.** `apps/client/e2e/tools/dolna/measure.mts` — harness, który dowolny
   prototyp `MapDef` przepuszcza przez to, co robią `map.test.ts`, `mapFlags.test.ts`,
   `floorAudit.ts` i `map-duel.ts` (siatka chodu, `findPath`, prawdziwy `simulateBody` ze sprintem,
   raycasty oko–oko, łańcuch wspinaczek), z jedną zmianą: trasy z obu startów idą do **tego samego**
   punktu zamiast do bliźniaka 180°. Sprawdzony na GÓRZE: 7.8 % powierzchni widzi start, najdalsza
   8.2 m, start–start 39.1 m — te same liczby, które podaje `map-duel.ts`. `plan.mts` rysuje plan
   ASCII z brył, jak `map-plan.ts`, ale dla dowolnych `bounds`.
2. **Narada.** Trzech projektantów o różnych szkołach (wierny CS2 / wierny miejscu / minimalista
   czytelności) dostało §1–§4 i §9 z domyślnymi odpowiedziami oraz harness; każdy miał oddać
   zmierzony prototyp. Dwa dojechały do pomiaru: „wierny CS2” (127 brył, wszystkie kontrole poza
   p90 25.0 m, sporne Δ 167 ms, start–start 49 m) i „wierny miejscu” (112 brył, trzy trasy
   zablokowane przy furtce i drzwiach 1.0–1.2 m — ta sama lekcja, którą GÓRA zapłaciła w
   `MAP_2.md` „As built”). Trzeci i trzech sędziów nie zdążyło — limit sesji; sądem była tabela
   pomiarów.
3. **Synteza.** Jeden agent wziął zwycięzcę, przeszczepił z drugiego odczyt zdjęć (rząd tui w
   przedogródku, krzak w ogrodzie) i naprawił to, czego brief wymaga: przejścia ≥ 1.5 m, start–start
   44.3 m (szkielet budowy przysunięty 4 m), starty ukryte na 14.5 m, sporne Δ 150 ms, żadna trasa
   zablokowana, nic osiągalnego ≥ 1.9 m, 0 brył latających — dwanaście pomiarów. Jedyna czerwona
   kontrola, p90 28.3 m, została **zostawiona i nazwana** (D-W7): na ulicy tylko van i toi-toi są
   wyższe od oka, bo tak mówi język osłon, a zabudowanie ulicy jest zakazane w R5.
4. **Co nie jest w tym pomiarze:** render (0 świateł, 0 rekwizytów w prototypie), kucnięcie pod
   koronami drzew (mover liczy ciało stojące), zakręty tras z R11, draw-calle — lista w §5.10; sesja
   wykonawcza mierzy wszystko ponownie narzędziami repo (§6, Sesja 1, krok 3).
