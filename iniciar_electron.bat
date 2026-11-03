@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul
cd /d "%~dp0"
title AnimeStream Desktop (Electron Edition)

echo ========================================================
echo     Iniciando AnimeStream en modo Escritorio (Electron)...
echo ========================================================
echo.

set "NODE_CMD="

if exist "%LOCALAPPDATA%\Programs\nodejs\node.exe" (
    set "PATH=%LOCALAPPDATA%\Programs\nodejs;!PATH!"
    set "NODE_CMD=%LOCALAPPDATA%\Programs\nodejs\node.exe"
    goto :found_node
)

if exist "C:\Program Files\nodejs\node.exe" (
    set "PATH=C:\Program Files\nodejs;!PATH!"
    set "NODE_CMD=C:\Program Files\nodejs\node.exe"
    goto :found_node
)

where node >nul 2>nul
if %errorlevel% equ 0 (
    set "NODE_CMD=node"
    goto :found_node
)

:no_node
echo [ERROR] No se pudo encontrar Node.js en tu ordenador.
echo Asegurate de tener Node.js instalado o descargalo desde https://nodejs.org/
echo.
pause
exit /b 1

:found_node
echo [?] Node.js detectado correctamente.
echo.

if not exist "node_modules\" (
    echo [i] Instalando dependencias necesarias con npm...
    call npm install
    echo.
)

echo [i] Lanzando aplicacion de escritorio Electron...
echo.
call npm run electron
pause