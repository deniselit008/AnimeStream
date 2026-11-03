@echo off
setlocal
chcp 65001 >nul
title AnimeStream - Vista Previa de la Página Web de Descargas

echo =================================================================
echo 🌐 AnimeStream - Servidor Local de la Página de Descargas (SEO)
echo =================================================================
echo.
echo Iniciando servidor web local en http://localhost:8080 ...
echo Presiona Ctrl+C en esta consola para detener el servidor.
echo.

where python >nul 2>nul
if %errorlevel% equ 0 (
    start http://localhost:8080/
    python -m http.server 8080 --directory website
) else (
    echo Python no está disponible en PATH. Abriendo directamente en el navegador...
    start "" "%~dp0website\index.html"
)
