@echo off
setlocal
chcp 65001 >nul
title Compilador de AnimeStream a Ejecutable (.exe)

echo =================================================================
echo 🛠️  AnimeStream - Generador de Ejecutable Independiente (.exe)
echo =================================================================
echo.
echo Este script creará un archivo AnimeStream.exe 100%% autónomo.
echo Los usuarios finales NO necesitarán tener Python instalado.
echo.
echo =================================================================

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
echo [ERROR] No se pudo encontrar Python en tu sistema.
echo.
pause
exit /b 1

:found_python
echo [✓] Usando Python: %PY_CMD%
echo.
echo [1/3] Verificando PyInstaller...

"%PY_CMD%" -m PyInstaller --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [!] PyInstaller no está instalado en este entorno de Python. Instalándolo ahora...
    "%PY_CMD%" -m pip install pyinstaller
    if %errorlevel% neq 0 (
        echo [ERROR] No se pudo instalar PyInstaller. Comprueba tu conexión a internet.
        pause
        exit /b 1
    )
)

echo [✓] PyInstaller detectado correctamente.
echo.
echo [2/3] Compilando AnimeStream a .exe (esto puede tardar 1-2 minutos)...
echo.

"%PY_CMD%" -m PyInstaller --noconfirm --clean --onefile ^
    --name "AnimeStream" ^
    --add-data "frontend;frontend" ^
    --hidden-import "uvicorn.logging" ^
    --hidden-import "uvicorn.loops" ^
    --hidden-import "uvicorn.loops.auto" ^
    --hidden-import "uvicorn.protocols" ^
    --hidden-import "uvicorn.protocols.http" ^
    --hidden-import "uvicorn.protocols.http.auto" ^
    --hidden-import "uvicorn.protocols.websockets" ^
    --hidden-import "uvicorn.protocols.websockets.auto" ^
    --hidden-import "curl_cffi" ^
    run.py

if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Ocurrió un fallo durante la compilación.
    pause
    exit /b 1
)

echo.
echo =================================================================
echo [3/3] ¡Compilación Exitosa!
echo =================================================================
echo.
echo Tu archivo ejecutable ha sido generado en:
echo 📁 dist\AnimeStream.exe
echo.
echo Puedes copiar ese archivo AnimeStream.exe a cualquier ordenador con
echo Windows y funcionará directamente con doble clic, sin instalar Python.
echo =================================================================
echo.
pause
