#!/usr/bin/env bash
# AnimeStream - Lanzador para macOS (Intel & Apple Silicon M1/M2/M3)
set -e

cd "$(dirname "$0")"

echo "========================================================="
echo "🎬  AnimeStream (macOS Edition) - Iniciando aplicación..."
echo "========================================================="

# Verificar existencia de Node.js
if ! command -v node &> /dev/null; then
    echo "[ERROR] Node.js no está instalado en este Mac."
    echo "Puedes instalarlo fácilmente con Homebrew: brew install node"
    echo "O descargando el instalador oficial desde: https://nodejs.org/"
    exit 1
fi

# Instalar dependencias si no existen
if [ ! -d "node_modules" ]; then
    echo "[i] Instalando dependencias necesarias con npm..."
    npm install
fi

# Lanzar Electron si está disponible, o modo web
if [ -f "node_modules/.bin/electron" ]; then
    echo "[i] Lanzando ventana de escritorio nativa (Electron)..."
    ./node_modules/.bin/electron electron/main.js &
else
    echo "[i] Iniciando servidor y abriendo navegador..."
    node run.js
fi
