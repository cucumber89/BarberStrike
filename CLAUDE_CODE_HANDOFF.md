# Handoff — Franki Barber FPS

Stan na 2026-09-03. Projekt: przeglądarkowy multiplayer FPS (React/Vite + Babylon.js 9, Colyseus 0.18, wspólny pakiet packages/shared). Użytkownik chce rozwijać go w pełnoprawną, humorystyczną strzelankę FPS, z priorytetem: feeling strzelania, animacje, wygląd broni, mapa i stabilność.

## Co zrobiono

1. **Uruchomiono i przetestowano grę lokalnie** w dwóch klientach. Działają: menu, lobby, tworzenie/dołączanie, start meczu, FFA, ekonomia, granaty, ADS, strzał i przeładowanie P9.
2. **Naprawiono rozjazd rozrzutu pocisków klient/serwer**:
   - packages/shared/src/weapons.ts — dodano SpreadContext oraz wspólne effectiveSpread().
   - apps/client/src/game/combat/WeaponController.ts i apps/server/src/rooms/TdmRoom.ts korzystają teraz z identycznego wzoru (ruch, powietrze, kucanie, ADS, bloom).
   - dodano packages/shared/src/weapons.test.ts.
3. **Naprawiono blokadę strzału/ADS po sprincie** w apps/client/src/game/player/LocalPlayer.ts: sprint korzysta ze wspólnego sprintActive(), a nie z nieaktualnego stanu klawisza W.
   - dodano apps/client/src/game/player/LocalPlayer.test.ts.
4. **Naprawiono zasłanianie skrótów w ekranie Controls** na 1280×720: stopka jest elementem przepływu, nie nakładką (apps/client/src/ui/styles.css). Zweryfikowano ręcznie i obrazem po przewinięciu.
5. Tuż przed przekazaniem zastosowano jeszcze patch serwerowy, który **trzeba teraz zweryfikować testami**:
   - zaakceptowany strzał/rzut ma zdejmować spawn protection;
   - po zakończeniu meczu serwer odrzuca strzały/rzuty i czyści aktywne pociski/tracery;
   - zmiany: apps/server/src/rooms/TdmRoom.ts, apps/server/src/rooms/TdmRoom.test.ts, apps/server/src/rooms/Drop2.test.ts.

## Wyniki testów przed ostatnim patchem serwera

- pnpm --filter @frankibarber/shared test — **80 testów OK**.
- pnpm --filter @frankibarber/client test LocalPlayer.test.ts — **OK**.
- pnpm --filter @frankibarber/server test TdmRoom.test.ts — **29 testów OK** (przed nowymi testami spawn shield/end match).
- pnpm typecheck — **OK** dla shared/server/client.

## Zrób najpierw

    git diff --check
    pnpm --filter @frankibarber/server test
    pnpm test
    pnpm typecheck
    pnpm build

Jeśli nowy test w Drop2.test.ts narzeka na "ended", zaimportuj MatchPhase i ustaw h.state.phase = MatchPhase.Ended.

## Ważne znalezione problemy do kontynuacji

### P1 — sieć i uczciwość rozgrywki

- FireMessage.seq zawsze jest 0, a kierunek (d) jest w pełni zaufany od klienta. Docelowo powiązać strzał z zaakceptowanym numerem wejścia i wyprowadzać pozycję/kierunek z historii serwera. **Nie dodawaj prostego porównania z surowym yaw/pitch** — klient ma recoil i sway.
- Brak niezależnego limitu częstości pakietów Fire; obecny cooldown ogranicza obrażenia, ale nie spam sieciowy.
- Lokalny gracz widzi przewidywany tracer, zanim nadejdzie wynik serwera — warto przejść na potwierdzony tracer albo oznaczyć go jako przewidywany.
- Rozłączony gracz może potencjalnie dalej uczestniczyć w logice flag/odrodzenia; przejrzeć ścieżki CTF oraz startu meczu.

### P1 — mapa i czytelność wizualna

- P9 i ręce są prawie czarne w nocnym oświetleniu. W apps/client/src/game/view/weaponMeshes.ts materiały mają bardzo wysokie metallic przy braku environment texture. Bezpieczny pierwszy krok: rozjaśnić albedo, metal ok. 0.55, steel ok. 0.70, dodać bardzo słabą chłodną emisję; rękawice ustawić na ciemny, ale czytelny brąz/szary.
- P9 o nazwie „Straight Razor” ma zwykłą sylwetkę pistoletu. Można dodać mały stylizowany grzbiet/hinge brzytwy, bez zmiany punktu wylotu pocisku ani ADS.
- W apps/client/src/game/world/dressing.ts modele auta/vana/ciężarówki zaczynają się odpowiednio nad ziemią (~0.32/0.38/0.55 m), podczas gdy collider jest pełnym blokiem od ziemi: gracz zahacza o niewidzialną dolną część. Szybka, bezpieczna poprawka: ciemny low-poly chassis/skirt pod nadwoziem. Docelowo collider powinien składać się z rzeczywistych brył auta.
- glass_dark jest całkiem nieprzezroczyste; przy pojazdach utworzyć osobny półprzezroczysty materiał, nie zmieniać globalnego materiału w ciemno.
- Kolizje mapy oparte na AABB mogą rozjeżdżać się z dekoracjami o nieregularnych formach — jedna definicja danych powinna tworzyć i geometrię, i collider.

### P2 — wydajność i odczucia

- Każdy zdalny gracz buduje wiele osobnych modeli; rozważyć instances/thin instances dla statycznych powtarzalnych elementów.
- Dodaj bibliotekę krótkich, nazwanych klipów animacji (idle, walk, sprint, reload, inspect, equip) oraz stany przerwania/przejść. Na obecnym proceduralnym viewmodelu najpierw dopracować recoil, reload timing i inspect; później GLB.
- Realny test GPU jest nadal potrzebny. WebGL2 był czysty; w in-app WebGPU raz pojawił się niepowtarzalny błąd swapchain Chromium (Destroyed texture ... WebGPUSwapBufferProvider). Nie traktować go jeszcze jako pewnej regresji gry.

## Zalecana kolejność dalszej pracy

1. Zakończ i uruchom testy patcha serwerowego (spawn shield / koniec meczu).
2. Popraw czytelność P9/rąk i dodaj low-poly podwozia pojazdów; zrób screenshot przed/po.
3. Dodaj testy wejścia: niecałkowity seq, niepoprawne buttons, spam Fire.
4. Przeprojektuj walidację strzału na serwerze z historią inputu (nie półśrodek).
5. Zrób serię playtestów: 2 klientów, ruch/ADS/sprint/fire/reload, granat, śmierć/respawn, koniec meczu, mapa i kolizje.
6. Dopiero potem wejść w import licencjonowanych low-poly GLB i pełny pipeline animacji.

## Przydatne źródła

- Colyseus — [server input](https://docs.colyseus.io/netcode/server-input), [determinism](https://docs.colyseus.io/netcode/determinism), [lag compensation](https://docs.colyseus.io/netcode/lag-compensation)
- Babylon.js — [instances](https://doc.babylonjs.com/features/featuresDeepDive/mesh/copies/instances), [animated characters](https://doc.babylonjs.com/features/featuresDeepDive/animation/animatedCharacter/)
- [Blender glTF export](https://docs.blender.org/manual/en/5.0/addons/import_export/scene_gltf2.html)
- MDN — [WebGL best practices](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices)

## Uwagi robocze

- Nie zmieniaj silnika: obecny stack jest wystarczający; największy zwrot da dopracowanie pętli strzelania, sieci i asset pipeline.
- Zachowaj istniejące zmiany użytkownika; repo na początku było czyste, ale po tej sesji ma celowe, niezatwierdzone zmiany opisane wyżej.
- Skrypty developerskie zależą od FB_DEV_TOOLS=1; wcześniejsze trzy „nieudane” testy E2E były tylko skutkiem braku tej zmiennej, nie błędem gry.
