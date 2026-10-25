@echo off
setlocal
chcp 65001 >nul
title AnimeStream Aggregator

echo ========================================================
echo        Iniciando AnimeStream en tu ordenador...
echo ========================================================
echo.

set PY_CMD=

if exist "%LOCALAPPDATA%\Programs\Python\Python315\python.exe" (
    set "PATH=%LOCALAPPDATA%\Programs\Python\Python315;%LOCALAPPDATA%\Programs\Python\Python315\Scripts;%PATH%"
    set "PY_CMD=%LOCALAPPDATA%\Programs\Python\Python315\python.exe"
    goto :found_python
)

if exist "%LOCALAPPDATA%\Programs\Python\Python314\python.exe" (
    set "PATH=%LOCALAPPDATA%\Programs\Python\Python314;%LOCALAPPDATA%\Programs\Python\Python314\Scripts;%PATH%"
    set "PY_CMD=%LOCALAPPDATA%\Programs\Python\Python314\python.exe"
    goto :found_python
)

where py >nul 2>nul
if %errorlevel% equ 0 (
    set "PY_CMD=py"
    goto :found_python
)

where python >nul 2>nul
if %errorlevel% equ 0 (
    set "PY_CMD=python"
    goto :found_python
)

:no_python
echo [ERROR] No se pudo encontrar Python en tu ordenador.
echo Asegúrate de tener Python instalado en tu sistema.
echo.
pause
exit /b 1

:found_python
echo [✓] Usando Python: %PY_CMD%
echo.

echo Comprobando e instalando dependencias necesarias...
"%PY_CMD%" -m pip install -q -r requirements.txt

echo.
echo Iniciando servidor web local...
"%PY_CMD%" run.py

pause
