@echo off
title INFERNO ETF - serwer (zamknij to okno, zeby wylaczyc strone)
cd /d "%~dp0"

echo.
echo   ==============================
echo     INFERNO ETF - uruchamianie
echo   ==============================
echo.

where npm >nul 2>nul
if errorlevel 1 (
  echo [BLAD] Nie znaleziono Node.js / npm. Zainstaluj Node.js LTS z nodejs.org
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo Pierwsze uruchomienie - instaluje biblioteki, to potrwa 1-2 minuty...
  call npm install
)

if not exist ".env.local" (
  echo [UWAGA] Brak pliku .env.local - czat AI nie bedzie dzialal bez klucza GEMINI_API_KEY.
  echo.
)

rem Czeka w tle, az strona odpowie, i otwiera ja w przegladarce.
start "" /min powershell -NoProfile -WindowStyle Hidden -Command "$u='http://localhost:3000'; for($i=0;$i -lt 90;$i++){ try { Invoke-WebRequest $u -UseBasicParsing -TimeoutSec 3 | Out-Null; break } catch { Start-Sleep 1 } }; Start-Process $u"

echo Strona startuje... przegladarka otworzy sie sama.
echo Zeby wylaczyc strone: zamknij to okno albo nacisnij Ctrl+C.
echo.
call npm run dev
pause
