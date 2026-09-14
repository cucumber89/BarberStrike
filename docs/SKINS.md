# Skiny broni: warstwowe tekstury proceduralne

Skiny są kosmetyczne. Nie zmieniają geometrii, celowników, anchorów, animacji ani statystyk broni;
serwer ich nie zna poza jednym zdezynfekowanym polem kosmetycznym (`packages/shared/src/skinsField.ts`).

## Katalog

`packages/skins/src/catalog.ts` zawiera 59 przepisów w ośmiu kolekcjach (`COLLECTIONS`): Zakład,
Barber Underground, Nocna Zmiana, Monopolowy, Zielony Salon, Masa, Po Godzinach (18+, `nsfw`) i
Złota Półka. Każdy przepis ma stabilne ID w kebab-case (zapisane kolekcje graczy odwołują się do nich;
19 pierwotnych ID jest pilnowanych testem), nazwę do 22 znaków, opis do 64, rzadkość, kolekcję,
listę broni (`"all"` albo jawną tablicę) i skalarne `params`. Żadnych bitmap w repozytorium.

Wszystkie przepisy używają jednego generatora `layered`. Parametry to warstwy:

| warstwa | params |
| --- | --- |
| materiał bazowy | `base` (lacquer, steel, polymer, wood, chrome, carbon, concrete, gold, cloth, paper, neon), `colors` = `baza,tusz,akcent,jasny,dodatkowy`, `partTint` |
| wzór pomocniczy | `pattern` (stripes, chevron, hazard, camo, hex, checker, dots, flames, waves, bricks, plaid, leopard, zebra, circuit, helix, folk, rays, grid, splatter, scales), `patternOn` (stock, front, grip, mag, receiver, all), `patternColors`, `patternScale`, `patternAngle`, `patternAlpha` |
| ilustracja główna | `hero` (nazwa z `MOTIFS`), `heroScale`, `heroDz/Dy/Rot`, `heroSide`, `heroGlow`, `heroLabel`, `panel`, `drips`, `dripColor` |
| napisy | `receiverLegend` (duży napis obok ilustracji), `stockText`, `frontText`, `magText`, `receiverText`, `stencil`, `textColor`, `textStroke`, `italic`, `glowText` |
| części | `stockMotif`, `frontMotif`, `magMotif`, `gripMotif` (+ `Scale`, `Dz`, `Dy`, `Rot`) |
| naklejki i znaki | `stickers` (`motyw` albo `!SŁOWO`), `serial`, `noSerial`, `accentBand`; znak kolekcji zawsze |
| zużycie | `wear` (fabryczna patyna dodawana do `wear` egzemplarza), `grain`, `edges` |
| emisja | `glow` (kolor) włącza drugą, emisyjną teksturę o połowie rozdzielczości |

Biblioteka motywów (`motifs.ts`) to ok. 70 ilustracji rysowanych w przestrzeni jednostkowej
(czaszka z pompadourem, brzytwa, nożyczki, słupek, blok, klatka, tag, butelka, kieliszek, kapsel,
liść, dym, oko, grzybek, hantel, strzykawka, usta, podwiązka, korona, filigran, laur itd.). Naklejki,
tabliczki z numerem seryjnym, legendy i znaki kolekcji są w `decals.ts`, materiały w `materials.ts`,
wzory w `patterns.ts`, rysy/odpryski/brud w `wear.ts`.

## Ramka broni i UV

Tekstura jest **rzutem bocznym broni**, nie kaflem. `buildFrame` (`frame.ts`) buduje z AABB części
proceduralnego modelu (`proceduralParts`) ramkę `SkinFrame`: zakres `z` mapowany na `u`, dwa pasy w
`v` dla prawej (górna połowa) i lewej (dolna połowa) burty, oraz strefy: `receiver` (= `parts[0]`,
albo największa malowana płaszczyzna, gdy odbiornik jest stalowy), `magazine`, `stock`, `front`,
`grip` (największa pojedyncza płaszczyzna w regionie, nie suma). `frameUv` odwzorowuje każdą ścianę
do pasa burty, którą dotyka; nic się nie powtarza. Klient używa `sideProjectUvs` w
`weaponMeshes.buildParts` i tej samej ramki w `SkinRegistry` (`weaponFrame(id)`).

Rozmiar tekstury dobiera ramka (1024², 2048×1024 albo 1024×512, ≤ 8 MB), ok. 1500–3000 px/m.
Pistolety i SMG dostają 1024², karabiny 2048×1024. Tekstura emisyjna ma połowę wymiarów.

Napisy są rysowane przez `Brush.text`, który odwraca transformację y-up i lustrzy tekst na lewej
burcie, więc czytają się poprawnie z obu stron. Ilustracje kierunkowe zachowują zwrot świata.

## Runtime

`SkinRegistry.forScene(scene)` maluje jeden zestaw na `(broń, skin, wear)`: `DynamicTexture`
albedo (+ opcjonalnie emisyjna), klonowane materiały dla ról `pattern`; `steel`, `rubber`, `brass`,
`lens` zostają fabryczne (wyjątek: rewolwer i strzelba mają stalowy odbiornik, więc tam stal przyjmuje
wzór; celowniki są mosiężne). Zadania są szeregowane co 50 ms poza pętlą renderowania; nic nie jest
malowane co klatkę. LRU trzyma do 10 zestawów, nigdy nie zwalnia zestawu z aktywną dzierżawą.
`SkinBinding` przywraca fabryczne materiały przed zwolnieniem dzierżawy. Metaliczność jest umiarkowana,
bo sceny nie mają tekstury środowiska: chrom i złoto żyją w samym malowaniu.

Miniatury kart, rolki skrzynki i nagrody (`SkinArt.tsx`) rysują ten sam przepis na płótnie 2D
(prawa burta, kadr `receiver` albo `body`), raz na klucz, z leniwym malowaniem poza ekranem.

## Szafa i skrzynki

Szafa pokazuje wszystkie skiny pasujące do broni pogrupowane kolekcjami; zablokowane można obejrzeć
na modelu, założyć tylko posiadane. Pula Skrzynki Dzielnicy to cały `catalog` bez duplikatów, dopóki
coś zostało do wylosowania. Najrzadsze nagrody: `zloty` — Korona Frankiego i Złota Brzytwa.

## Przegląd i testy

`pnpm dev`, potem `http://localhost:5174/e2e/tools/skin-review.html`: karty wg kolekcji, widoki
(prawa, lewa, zbliżenia, przód, tył, góra), suwak zużycia i podgląd całej tekstury obu burt.
`node apps/client/e2e/tools/skin-review-shots.mjs --weapons rifle,pistol --views close,close-left`
robi zrzuty do `apps/client/e2e/out/skins/` (`--sheet 1` dla arkuszy kolekcji); używa wbudowanego
Chromium z `PW_CHROMIUM` albo `/opt/pw-browsers/chromium`.

Testy: `packages/skins/src/skins.test.ts` (rejestracja, unikalne ID, broń i rzadkość, warstwy
graficzne w każdym skinie, brak skinów jednokolorowych i różniących się tylko kolorem, złożoność
legendarnych, pass emisyjny, ramka i lustrzenie napisów, złote hashe strumienia operacji),
`apps/client/src/game/view/skin*.test.ts` (UV burt, ramki wszystkich broni, cache i zwalnianie),
`profile.test.ts` (stare ID, pula skrzynki bez duplikatów, nowe kolekcje).
