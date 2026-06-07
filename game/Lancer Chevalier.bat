@echo off
chcp 65001 >nul
title Chevalier TCG
cd /d "%~dp0"

where node >nul 2>&1
if errorlevel 1 (
  echo Node.js n'est pas installe.
  echo Installez-le sur https://nodejs.org puis relancez ce fichier.
  pause
  exit /b 1
)

echo Chevalier TCG - demarrage du serveur...
start "Chevalier TCG - Serveur" cmd /k "cd /d "%~dp0" && node server.js"

timeout /t 2 /nobreak >nul
start "" "http://localhost:8080"

echo Navigateur ouvert sur http://localhost:8080
echo Fermez la fenetre "Chevalier TCG - Serveur" pour arreter le jeu.
timeout /t 4 /nobreak >nul
