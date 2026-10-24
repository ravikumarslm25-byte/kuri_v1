@echo off
REM ============================================================
REM  Kuri - The Digital Oracle : kiosk launcher (Windows 10/11)
REM  Put a shortcut to this file in shell:startup so it runs at login.
REM ============================================================
set KURI_DIR=C:\kuri\kiosk
set PORT=4173
set CHROME="C:\Program Files\Google\Chrome\Application\chrome.exe"
set PROFILE=C:\kuri\chrome-profile
REM Leave KURI_URL empty (recommended): the kiosk runs its own local copy and still starts
REM with no internet; readings sync to the server when it is back.
REM Or set it to your server to always load the latest app from there (needs internet at start):
REM   set KURI_URL=https://kuri.example.com/
set KURI_URL=
if "%KURI_URL%"=="" set KURI_URL=http://localhost:%PORT%/

REM 1. Local web server for the kiosk app (works with no internet)
if "%KURI_URL%"=="http://localhost:%PORT%/" (
  start "kuri-server" /min cmd /c "cd /d %KURI_DIR% && node scripts\serve.mjs %PORT%"
  timeout /t 3 /nobreak >nul
)

REM 2. Close any Chrome left over from a previous run of the kiosk profile
taskkill /im chrome.exe /f >nul 2>&1
timeout /t 1 /nobreak >nul

REM 3. Chrome full-screen kiosk.
REM    --kiosk-printing : window.print() goes straight to the DEFAULT printer, no dialog
REM    --use-fake-ui-for-media-stream : auto-allow the cameras (dedicated kiosk only)
%CHROME% ^
  --user-data-dir=%PROFILE% ^
  --kiosk --kiosk-printing ^
  --use-fake-ui-for-media-stream ^
  --autoplay-policy=no-user-gesture-required ^
  --noerrdialogs --disable-infobars --disable-session-crashed-bubble ^
  --disable-pinch --overscroll-history-navigation=0 ^
  --disable-features=TranslateUI,Translate ^
  --check-for-update-interval=31536000 ^
  %KURI_URL%
