#!/usr/bin/env bash
# AnimeStream - Lanzador para Linux (Ubuntu, Debian, Fedora, Arch, Mint)
set -e

cd "$(dirname "$0")"

echo "========================================================="
echo "🎬  AnimeStream (Linux Edition) - Iniciando aplicación..."
echo "========================================================="

# Verificar existencia de Node.js
if ! command -v node &> /dev/null; then
    echo "[ERROR] Node.js no está instalado en este sistema."
    echo "Instálalo usando tu gestor de paquetes:"
    echo "  Ubuntu/Debian: sudo apt install nodejs npm"
    echo "  Fedora:        sudo dnf install nodejs npm"
    echo "  Arch:          sudo pacman -S nodejs npm"
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
