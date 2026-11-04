@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul
cd /d "%~dp0"
title AnimeStream - Exportador Multiplataforma

echo ========================================================
echo   AnimeStream - Exportar a Windows, Mac, Linux y Android
echo ========================================================
echo.

set "NODE_CMD="
if exist "%LOCALAPPDATA%\Programs\nodejs\node.exe" (
    set "PATH=%LOCALAPPDATA%\Programs\nodejs;!PATH!"
    set "NODE_CMD=%LOCALAPPDATA%\Programs\nodejs\node.exe"
    goto :run_export
)
if exist "C:\Program Files\nodejs\node.exe" (
    set "PATH=C:\Program Files\nodejs;!PATH!"
    set "NODE_CMD=C:\Program Files\nodejs\node.exe"
    goto :run_export
)
where node >nul 2>nul
if %errorlevel% equ 0 (
    set "NODE_CMD=node"
    goto :run_export
)

echo [ERROR] No se pudo encontrar Node.js en tu sistema.
pause
exit /b 1

:run_export
"%NODE_CMD%" scripts\export-all.js
echo.
echo ========================================================
echo Puedes encontrar todos los paquetes listos en:
echo %~dp0dist\exports
echo ========================================================
echo.
pause
