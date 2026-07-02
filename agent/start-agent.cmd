@echo off
setlocal
cd /d "%~dp0"

if not exist node_modules (
  echo [agent] installation des dependances...
  call npm install
  if errorlevel 1 (
    echo [agent] echec de "npm install".
    pause
    exit /b 1
  )
)

echo [agent] demarrage du serveur local (http://localhost:5175 par defaut)...
echo [agent] laissez cette fenetre ouverte pendant vos scans. Fermez-la ou utilisez
echo [agent] le bouton "arreter l'agent" dans l'onglet Decouverte reseau pour l'arreter.
echo.

call npm run serve

pause
