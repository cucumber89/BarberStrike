@echo off
chcp 65001 >nul
title BarberStrike - stream

rem ==========================================================================
rem  BARBERSTRIKE - start streamu jednym kliknieciem (Windows)
rem
rem  1. Otwiera widownie BarberStrike w trybie streamera (pelny ekran,
rem     bez przyciskow): sama znajduje mecz i sama przelacza kamere.
rem  2. Uruchamia Twitch Studio.
rem  3. Wylacza usypianie komputera, zeby stream nie padl w nocy.
rem
rem  Zeby pokazywac tylko jeden pokoj (np. final turnieju), dopisz do adresu
rem  &room=NAZWA, np.:  set "URL=https://barberstrike.click/viewer?stream=1&room=final"
rem ==========================================================================

set "URL=https://barberstrike.click/viewer?stream=1"

rem --- przegladarka: Chrome, a jak go nie ma, to Edge (jest w kazdym Windowsie)
set "BROWSER=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not exist "%BROWSER%" set "BROWSER=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if not exist "%BROWSER%" set "BROWSER=%LocalAppData%\Google\Chrome\Application\chrome.exe"
if not exist "%BROWSER%" set "BROWSER=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
if not exist "%BROWSER%" set "BROWSER=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
if not exist "%BROWSER%" goto nobrowser

rem Osobny profil przegladarki: okno zawsze otwiera sie na nowo, na pelnym
rem ekranie, bez paska adresu, i nie miesza sie z Twoimi kartami.
echo Otwieram widownie: %URL%
start "" "%BROWSER%" --user-data-dir="%LocalAppData%\BarberStrikeStream" --app="%URL%" --start-fullscreen --no-first-run --no-default-browser-check --disable-features=Translate --disable-session-crashed-bubble
goto studio

:nobrowser
echo [!] Nie znalazlem Chrome ani Edge. Otworz recznie: %URL%

:studio
rem --- Twitch Studio: szukamy jego skrotu w menu Start
set "TS="
for /f "delims=" %%F in ('where /r "%AppData%\Microsoft\Windows\Start Menu\Programs" "Twitch*Studio*.lnk" 2^>nul') do if not defined TS set "TS=%%F"
for /f "delims=" %%F in ('where /r "%ProgramData%\Microsoft\Windows\Start Menu\Programs" "Twitch*Studio*.lnk" 2^>nul') do if not defined TS set "TS=%%F"
if defined TS (
  echo Uruchamiam Twitch Studio...
  start "" "%TS%"
) else (
  echo [!] Nie znalazlem Twitch Studio - uruchom je recznie z menu Start.
)

rem --- komputer ma nie zasypiac, gdy jest podlaczony do pradu
powercfg /change standby-timeout-ac 0 >nul 2>&1
powercfg /change monitor-timeout-ac 0 >nul 2>&1

echo.
echo Gotowe. W Twitch Studio kliknij "Rozpocznij transmisje" (Go Live).
echo To okno zamknie sie samo za 15 sekund.
timeout /t 15 >nul
