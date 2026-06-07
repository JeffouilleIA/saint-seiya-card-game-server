@echo off
chcp 65001 >nul
title Chevalier TCG — Serveur réseau
cd /d "%~dp0"

where node >nul 2>&1
if errorlevel 1 (
  echo Node.js n'est pas installe.
  echo Installez-le sur https://nodejs.org puis relancez.
  pause
  exit /b 1
)

if not exist "..\Chevalier1\index.html" (
  echo Dossier Chevalier1 introuvable a cote de ce projet.
  echo Attendu : "%~dp0..\Chevalier1"
  pause
  exit /b 1
)

echo Liberation du port 3000 si occupe...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3000" ^| findstr "LISTENING"') do (
  echo   Arret du processus PID %%a
  taskkill /F /PID %%a >nul 2>&1
)
timeout /t 1 /nobreak >nul

echo Demarrage du serveur Chevalier TCG...
start "Chevalier TCG — Serveur réseau" cmd /k "cd /d "%~dp0" && node server.js"

timeout /t 2 /nobreak >nul
start "" "http://localhost:3000"

echo.
echo PC       : http://localhost:3000
echo Reseau   : voir la fenetre serveur pour l'adresse IP (meme Wi-Fi)
echo Fermez la fenetre serveur pour arreter.
timeout /t 5 /nobreak >nul
