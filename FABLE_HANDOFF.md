# BARBERSTRIKE — notatka do Fable 5.1

## Cel użytkownika
Dopracować całą grę w spójnym stylu low poly: logiczna mapa, budynki, wnętrza, teren zewnętrzny i bezpieczne spawny; tryby Deathmatch, Bomb Plant oraz Domination A/B/C; lepsze bronie i granaty. Boty mają zachowywać się wiarygodnie, dawać czas na reakcję i respektować dym — nie strzelać jak terminatory. Modele tworzyć jako geometrię w grze, bez generowania obrazków i pobierania nowych assetów.

## Ważne decyzje
- Użytkownik wyraźnie usunął krótkie rundy 12 s walki / 5 s pauzy. NIE przywracać ich w TDM, FFA ani Domination. Indywidualny respawn po 3 s, krótszy z Fade; żywi zachowują pozycje i stan.
- Bomb Plant ma być osobnym, kompletnym trybem z podłożeniem, odliczaniem i rozbrojeniem. Ewentualne rundy dotyczą wyłącznie tego trybu.
- Wprowadzać i testować zmiany, nie kończyć na planie. Nie wysyłać pytań o zgodę na zwykłe zmiany.

## Projekt i uruchomienie
Folder: C:/Users/aleks/OneDrive/Pulpit/SideQuest/sidequest/frankibarber
pnpm workspace: apps/client (React + Babylon.js), apps/server (Colyseus), packages/shared (zasady, ruch, mapa i kolizje).
`pnpm dev`: klient http://localhost:5174, serwer :2567. Do narzędzi testowych serwer wymaga FB_DEV_TOOLS=1.
`pnpm test`, `pnpm typecheck`, `pnpm build`. Test przeglądarkowy: w apps/client `pnpm exec playwright test`; PW_CHROMIUM=C:/Program Files/Google/Chrome/Application/chrome.exe.

## Co jest już zrobione przed tym zleceniem
- Proceduralne postacie z maskami, kamizelkami, kolorami drużyn i animacją. Nie usuwać wspólnych materiałów przy usunięciu postaci. Broń botów powstaje dopiero przy wyposażeniu.
- Geometria broni ze ściętymi krawędziami; poprawione celowniki, chwyt dłoni i pozycja magazynków. Game.ts wyłącza podmianę postaci/broni na importowane modele, opcjonalne modele scenerii nadal działają.
- Na mapie są dwa stoiska nocnego targu, osłony drogowe i podest ze schodami prowadzący na kontenery.
- Boty dobierają dystans do broni, wycofują się z pustym magazynkiem i stabilniej wybierają cel. Nadal wymagają poprawy percepcji i reakcji na granaty.
- Usunięte powtarzane fazy przygotowania i zbiorowe respawny. Testy zasad, typy, build i test dwóch klientów zabicie → indywidualny respawn przeszły.
- Wszystkie te zmiany są NIEZACOMMITOWANE. Nie resetować ich. Sprawdzić git diff przed pracą.

## Główne pliki
- Mapa i spawny: packages/shared/src/map.ts; walidacja map.test.ts, nav.test.ts i mapFlags.test.ts.
- Budynki i dekoracje: apps/client/src/game/world/{MapBuilder,dressing,props,materials}.ts.
- Boty: apps/server/src/bots/BotBrain.ts oraz packages/shared/src/bots.ts; percepcja i granaty w apps/server/src/rooms/TdmRoom.ts.
- Tryby: packages/shared/src/{types,modes}.ts, apps/server/src/{schema,match}.ts, TdmRoom.ts, klient Game.ts/store.ts/ui/Hud.tsx.
- Broń/postacie: apps/client/src/game/view/{geometry,Character,Viewmodel,weaponMeshes}.ts.
- Narzędzie podglądów: apps/client/e2e/tools/art-review.mjs; SHOT_DIR ustawia folder obrazków.

## Aktualny etap tego zlecenia
Wdrożone i zweryfikowane. Zlecony pakiet zmian zakończony 2026-09-06; poniżej zakres i historia sprawdzeń:
- shared/smoke.ts: wspólna sfera dymu, narastanie/zanik, maks. 4 chmury. Serwer blokuje widzenie botów; klient rysuje gęsty low-poly rdzeń i cząsteczki. Flash obejmuje teraz również boty bez socketu. Boty mają 120° widzenia, wolniejszą reakcję, serie z przerwami i uciekają przed widocznym ogniem.
- Bomb Plant jako czwarty tryb: shared/bomb.ts, schema BombState, metody w TdmRoom; 90 s na plant, 3 s podkładanie, 40 s lont, 5 s defuse, pierwszy do 4 wygranych, zmiana stron i 5 s przerwy WYŁĄCZNIE w Bomb. T przytrzymane/stanie w miejscu, serwerowy timeout przy puszczeniu/utracie połączenia, przerwanie obrażeniami. Śmierć i późne dołączenie czekają na kolejną rundę. Boty realizują cele. UI, minimapa i proceduralny ładunek w view/BombSites.ts.
- world/architecture.ts: scalana geometria elewacji, okna, gzymsy, markiza, ramy witryn, detale wnętrz, szafki i oznaczenia podłoża. Środkowy garaż jest teraz przechodni ze stołem, oświetleniem i osłoną tylnego wyjścia.
- Spawny silniej unikają widocznych przeciwników, bliskiego wroga i ognia. Molotov nie pali przez ściany, maks. 3 aktywne obszary zgodnie z klientem. Efekty granatów czyszczone przy zmianie rundy. Smugi i efekty pocisków kończą się na kolizji ściany.
- Dodane testy bomb.test.ts, server/rooms/Bomb.test.ts, smoke.test.ts i percepcji botów. Pierwszy typecheck przed ostatnią partią zmian przeszedł. Pierwsze pełne testy wykryły błąd danych testowych (id gracza nadpisane id miejsca) i graffiti wiszące w nowym przejściu garażu. Oba poprawione. Drożność wszystkich spawnów, brak widoczności między spawnami drużyn i dostępność A/B/C już przeszły. Ponownie uruchomione pełne pnpm test i pnpm typecheck. Pozostają poprawki wykrytych błędów, build, sprawdzenie przeglądarkowe/obrazki i aktualizacja tej notatki.
- Dalsza walidacja: 118 testów shared i 115 klienta przeszło (pełny zestaw plus nowy test spawnów). Naprawiono bota zatrzymującego się tuż przed celem: po utknięciu teraz zachowuje cel i wyznacza nową trasę. Test ruchu na prawdziwej mapie przeszedł. Poprawiono też pomocnicze faceOff w testach, które ustawiało kierunek sesji, ale nie kierunek widzenia bota po dodaniu FOV.
- Wszystkie nowe testy bomby przeszły, w tym bot samodzielnie podkładający ładunek. Testy serwera potwierdzają działanie flasha bez socketu i rzeczywiste blokowanie LOS przez dym aż do wygaśnięcia.
- PRZEGLĄDARKA: 3 testy przeszły: dwóch graczy plant → defuse → zmiana stron; TDM ruch → strzał → zabicie → indywidualny respawn; wejście w dym zasłania widok, wyjście odsłania. Dym ma dodatkową zasłonę od wewnątrz, bo sama dwustronna sfera nie ukrywałaby pobliskich postaci znajdujących się wewnątrz chmury.
- Podglądy bez błędów JS, obejrzano sklep z zewnątrz, wnętrze i garaż. Obrazy: C:/Users/aleks/.codex/visualizations/2026/09/06/01a076ef-bc53-7f10-93ae-65e17998a0ee/barberstrike-upgrade. Narzędzie art-review.mjs używa teraz low/WebGL2, skala 0.8 dla renderera programowego. Pierwsza próba medium przekroczyła limit ładowania; nie traktować FPS programowego renderera jako wydajności sprzętu użytkownika.
- WYNIK KOŃCOWY: 118 testów shared, 115 klienta i pełny ponowny zestaw 100 testów serwera — wszystkie zielone, łącznie 333. Trzy testy przeglądarkowe również przeszły. Pełny typecheck i build przeszły; po ostatnim dopięciu wybuchu bomby oraz zakazu plantowania w powietrzu / podczas rzutu granatem ponowny typecheck i build serwera też przeszły. git diff --check bez błędów. Wszystkie zmiany pozostają niezacommitowane.
- Aby zagrać: odświeżyć http://localhost:5174, wybrać tryb w lobby. T przytrzymane = plant/defuse; stać nieruchomo. TDM/FFA/DOM nadal nie mają powtarzanych rund. Runda i oczekiwanie na odrodzenie dotyczą tylko Bomb Plant.
- Ostatnie polecenie użytkownika: „update notatki i lecimy dalej”. Kontynuować tę samą pracę, bez zatrzymywania na notatce.

## Lista zakresu (zrealizowana; zachować przy dalszych zmianach)
1. Boty: dym blokuje widzenie, sensowne pole widzenia/pamięć celu, przerwa po utracie widoczności, ograniczenie ciągłych trafień; testy.
2. Kompletny Bomb Plant: stan serwera, cele, akcja podkładania/rozbrajania, zasady wygranej, boty realizujące cele, HUD i oznaczenia świata.
3. Mapa: czytelne strefy i dojścia, wnętrza z osłonami, budynki z detalami, linie ognia i spawny zgodne z fizyczną geometrią; utrzymać drożność tras.
4. Granaty/broń: czytelność efektów i sygnałów, spójne działanie po stronie serwera i klienta.
5. Testy jednostkowe, typecheck/build, próba w przeglądarce i podglądy. Nie przedstawiać FPS z renderera programowego jako wydajności na GPU użytkownika.

## NOWE ZLECENIE — 2026-09-06, większa mapa i taktyczny Bomb (W TRAKCIE)
Użytkownik chce znacznie większej, dopracowanej mapy i bomby w stylu CS:GO. To jest aktywne zlecenie; poprzednie podsumowanie testów dotyczy poprzedniej wersji.
- Dodano shared/districtExpansion.ts: 18 m rozszerzenia na zachód i wschód, szerokość gry 98 zamiast 62 m (+58% powierzchni); warsztat i kawiarnia z wnętrzami, osłony na dwóch placach, po 3 przejścia łączące stare i nowe części. Cele bomby A(-35,24), B(43,24); DOM A/C te same place, B sklep.
- Osobne arenaSpawns (8) wykorzystywane razem ze starymi spawnami w TDM/FFA. Bomb i DOM zachowują spawny drużyn. Boty mają nowe miejsca patrolu.
- world/architecture.ts rozszerzone o fasady, markizy, okna i detale nowych budynków. Nowe materiały wall_sand / wall_teal i spokojniejsze proceduralne tekstury tynku/betonu. Brak nowych importowanych assetów.
- Bomb: 10 s zakupów na zamrożonym spawnie przed każdą rundą, 115 s na plant, plant 3.2 s, defuse 10 s, lont 40 s. Krótki mecz do 7, 12 rund / remis 6:6, strony po 6 rundach. Start $800, wygrana $3250, premie za porażki rosną 1400..3400. Utrata ekwipunku po śmierci, zachowanie u ocalałych, reset wyposażenia i pieniędzy w połowie. Zakupy tylko w przygotowaniu, brak perków w Bomb i brak tarczy po starcie. HUD zakupów / połowy i klientowe warunki sklepu dopięte.
- Pierwsze testy mapy i nowych lokalizacji flag przeszły. Naprawiono brak metallic w nowych materiałach; zmieniono stare oczekiwania testów bomby na nowe zasady. Test navPerf miał błędne odtwarzanie środka komórki (cx/2 zamiast cx/2-.25); poprawione, trzeba ponowić. Trwa pełny test serwera. Konieczne: nowe testy ekonomii i połowy, sprawdzenie wszystkich dodatkowych spawnów, typecheck/build, e2e bomby/DM/DOM i nowe obrazy. Nie deklarować jeszcze zakończenia.
