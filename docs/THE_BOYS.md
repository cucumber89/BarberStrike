# The Boys

Tryb drużynowy inspirowany TF2, zastępuje FFA w menu. Serwer zachowuje zgodność ze starymi pokojami FFA.

## Pętla meczu
Dwie automatycznie równoważone drużyny walczą o A/B/C. Przejęcie trwa 6 sekund; Scout liczy się jak dwóch graczy (4 sekundy solo). Obecność obu drużyn blokuje przejmowanie. Każdy posiadany punkt daje 1 punkt drużyny co 3 sekundy i $10 każdemu członkowi drużyny, również oczekującemu na respawn. Wygrywa 100 punktów lub wyższy wynik po upływie czasu. Zabójstwa dają gotówkę, nie wynik drużyny. Przejęcie daje standardową nagrodę osobistą. Ciągłe odrodzenia pozwalają wracać do walki.

## Klasy
1. Scout: 85 HP, +15% ruchu, szybsze przejmowanie; darmowe SMG, zakup SMG2/shotgun.
2. Assault: 110 HP, normalna szybkość; darmowy rifle i frag przy respawnie, zakup shotgun/launcher.
3. Heavy: 150 HP, -15% ruchu; darmowy LMG, zakup shotgun do ciasnych przejść. Trzyma punkt kosztem mobilności.
4. Medic: 100 HP, +5% ruchu; darmowe SMG, zakup shotgun. Leczy sojuszników 6 HP/s podczas walki i 10 HP/s po 3 s bez obrażeń, w promieniu 6 m i przy widoczności. Bez samoleczenia i kumulowania medyków; $2 i 1 wynik osobisty za faktycznie uleczony HP.
5. Marksman: 90 HP; darmowy DMR, zakup sniper; regeneracja 5 HP/s po 4 s bez obrażeń.

Każdy ma pistol i clippers, może kupić revolver. Granaty, pancerz i czasowe buffy są ograniczone według definicji klasy w packages/shared/src/boys.ts. Modele i parametry broni pozostają w istniejącym systemie Fable.

## Wybór i ekonomia
Wybór klasy w lobby, zmiana przez B także po śmierci. Zmiana jest kolejkowana do odrodzenia: zachowuje gotówkę, usuwa poprzedni ekwipunek i buffy. Bez resetowania zdrowia w środku walki. Przy tej samej klasie pozostaje standardowa ekonomia odrodzeń. Darmowej broni nie można sprzedać ani uzyskać za nią zwrotu przy wymianie. Zakupy dostępne tylko w dotychczasowych oknach zakupowych i przy stacjach. Boty mają różne klasy, kupują zgodny sprzęt i korzystają z istniejącej logiki celów.

## Balans
Wersja początkowa do playtestów: Scout flankuje, Heavy broni, Assault otwiera drogę, Medic utrzymuje drużynę, Marksman osłania podejścia. Dochód z terenu ogranicza dominację samego fragowania. Nie ma nowych modeli broni ani aktywnych umiejętności; role wynikają ze sprzętu, pasywnych zdolności i celu mapy. Docelowo balans należy ocenić w rozgrywce z ludźmi.

Boty-medycy szukają rannych sojuszników w odległości do 18 m. Nad widocznymi sojusznikami widać rolę i HP; tabela wyników oraz panel klas pokazują skład drużyny. Powrót do broni startowej w sklepie kosztuje $0, zastępuje obecną broń bez zwrotu (zakupioną broń można wcześniej sprzedać).

## Wejście i zakupy
Nowy klient dołącza jako oczekujący: nie pojawia się na mapie, nie przyspiesza startu meczu i nie dostaje dochodu przed gotowością. Ekran ładowania czeka na gotową scenę i dwie wyrenderowane klatki. Przycisk ENTER MATCH dopiero wysyła gotowość, daje spawn i rozpoczyna okno zakupów. Okno wynosi 30 sekund (także faza zakupów BOMB). Powtórzenie komunikatu gotowości nie odnawia życia ani czasu zakupów. Ładowanie można anulować; spóźnione połączenie jest zamykane. Sklep ma zakładki WEAPONS / GRENADES / GEAR / CLASSES.
