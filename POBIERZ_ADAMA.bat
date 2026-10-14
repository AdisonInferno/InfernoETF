@echo off
cd /d "%~dp0"
echo === Zapisuje Twoje zmiany ===
git add -A
git commit -m "Zmiany lokalne" >nul 2>&1
echo === Pobieram zmiany Adama ===
git fetch origin
git merge origin/adam --no-edit
echo === Wysylam na GitHuba ===
git push
echo.
echo GOTOWE. Jesli wyzej jest CONFLICT albo error - zrob screenshot i wyslij Claude.
pause