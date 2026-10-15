@echo off
cd /d "%~dp0"
echo === Zapisuje Twoje zmiany ===
git add -A
git commit -m "Zmiany lokalne" >nul 2>&1
echo === Pobieram nowosci (Claude, kolega) ===
git pull --no-edit
echo === Wysylam na GitHuba ===
echo === Odswiezam dziennik zmian ===
node scripts\changelog.mjs
git add CHANGELOG.md
git commit -m "Dziennik zmian" >nul 2>&1
git push
echo.
echo GOTOWE. Jesli wyzej jest slowo CONFLICT albo error - zrob screenshot i wyslij Claude.
pause