/**
 * AnimeStream - Multiplatform Exporter
 * Generates ready-to-use distribution packages for Windows, Mac, Linux, and Android.
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT_DIR = path.resolve(__dirname, '..');
const DIST_DIR = path.join(ROOT_DIR, 'dist');
const EXPORT_DIR = path.join(DIST_DIR, 'exports');

console.log('=================================================================');
console.log('📦  AnimeStream - Exportador Multiplataforma');
console.log('=================================================================');
console.log('Plataformas objetivo: Windows, macOS, Linux, Android');
console.log('-----------------------------------------------------------------');

// Ensure directories
if (!fs.existsSync(DIST_DIR)) fs.mkdirSync(DIST_DIR, { recursive: true });
if (!fs.existsSync(EXPORT_DIR)) fs.mkdirSync(EXPORT_DIR, { recursive: true });

function copyRecursiveSync(src, dest, ignorePatterns = []) {
  if (!fs.existsSync(src)) return;
  const stats = fs.statSync(src);
  if (stats.isDirectory()) {
    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
    fs.readdirSync(src).forEach(childItemName => {
      if (ignorePatterns.some(pattern => childItemName.includes(pattern))) return;
      copyRecursiveSync(path.join(src, childItemName), path.join(dest, childItemName), ignorePatterns);
    });
  } else {
    fs.copyFileSync(src, dest);
  }
}

// -----------------------------------------------------------------------------
// 1. WINDOWS PORTABLE & SILENT PACKAGE
// -----------------------------------------------------------------------------
console.log('[1/4] Preparando paquete para Windows (Portable & Sin CMD)...');
const winDir = path.join(EXPORT_DIR, 'AnimeStream-Windows');
if (!fs.existsSync(winDir)) fs.mkdirSync(winDir, { recursive: true });

['electron', 'server', 'public'].forEach(folder => {
  copyRecursiveSync(path.join(ROOT_DIR, folder), path.join(winDir, folder), ['.git']);
});

['package.json', 'run.js', 'iniciar.bat', 'iniciar_electron.bat', 'AnimeStream.vbs'].forEach(file => {
  const src = path.join(ROOT_DIR, file);
  if (fs.existsSync(src)) fs.copyFileSync(src, path.join(winDir, file));
});

// Add a quick README for Windows
fs.writeFileSync(path.join(winDir, 'LEEME_WINDOWS.txt'), 
`=================================================================
AnimeStream para Windows (Node.js & Electron Edition)
=================================================================

COMO USAR:
1. Haz doble clic en "AnimeStream.vbs" para iniciar de forma silenciosa
   (SIN ventana de consola CMD).
2. O haz doble clic en "iniciar_electron.bat" para iniciar en ventana de escritorio.
3. Para Smart TV / Movil: en la app pulsa en el boton "Dispositivos" para ver tu IP local.
=================================================================
`);

console.log('  ✔ Paquete Windows creado en dist/exports/AnimeStream-Windows');

// -----------------------------------------------------------------------------
// 2. LINUX PACKAGE (AppImage & Script Launcher)
// -----------------------------------------------------------------------------
console.log('[2/4] Preparando paquete para Linux (Ubuntu, Debian, Fedora, Arch)...');
const linuxDir = path.join(EXPORT_DIR, 'AnimeStream-Linux');
if (!fs.existsSync(linuxDir)) fs.mkdirSync(linuxDir, { recursive: true });

['electron', 'server', 'public'].forEach(folder => {
  copyRecursiveSync(path.join(ROOT_DIR, folder), path.join(linuxDir, folder), ['.git']);
});

['package.json', 'run.js', 'iniciar_linux.sh'].forEach(file => {
  const src = path.join(ROOT_DIR, file);
  if (fs.existsSync(src)) fs.copyFileSync(src, path.join(linuxDir, file));
});

// Create Linux .desktop launcher
fs.writeFileSync(path.join(linuxDir, 'AnimeStream.desktop'),
`[Desktop Entry]
Name=AnimeStream
Comment=Agregador y reproductor de anime en tiempo real
Exec=bash -c "cd $(dirname %k) && ./iniciar_linux.sh"
Icon=video-display
Terminal=false
Type=Application
Categories=AudioVideo;Player;
`);

fs.writeFileSync(path.join(linuxDir, 'LEEME_LINUX.txt'),
`=================================================================
AnimeStream para Linux
=================================================================

COMO USAR:
1. Abre una terminal en esta carpeta.
2. Dale permisos de ejecucion: chmod +x iniciar_linux.sh
3. Ejecuta: ./iniciar_linux.sh
=================================================================
`);

console.log('  ✔ Paquete Linux creado en dist/exports/AnimeStream-Linux');

// -----------------------------------------------------------------------------
// 3. MACOS PACKAGE
// -----------------------------------------------------------------------------
console.log('[3/4] Preparando paquete para macOS (Intel & Apple Silicon)...');
const macDir = path.join(EXPORT_DIR, 'AnimeStream-macOS');
if (!fs.existsSync(macDir)) fs.mkdirSync(macDir, { recursive: true });

['electron', 'server', 'public'].forEach(folder => {
  copyRecursiveSync(path.join(ROOT_DIR, folder), path.join(macDir, folder), ['.git']);
});

['package.json', 'run.js', 'iniciar_mac.sh'].forEach(file => {
  const src = path.join(ROOT_DIR, file);
  if (fs.existsSync(src)) fs.copyFileSync(src, path.join(macDir, file));
});

fs.writeFileSync(path.join(macDir, 'LEEME_MAC.txt'),
`=================================================================
AnimeStream para macOS
=================================================================

COMO USAR:
1. Abre Terminal en esta carpeta.
2. Dale permisos: chmod +x iniciar_mac.sh
3. Ejecuta: ./iniciar_mac.sh
=================================================================
`);

console.log('  ✔ Paquete macOS creado en dist/exports/AnimeStream-macOS');

// -----------------------------------------------------------------------------
// 4. ANDROID PWA & STANDALONE BUNDLE
// -----------------------------------------------------------------------------
console.log('[4/4] Preparando paquete para Android (PWA & WebAPK)...');
const androidDir = path.join(EXPORT_DIR, 'AnimeStream-Android');
if (!fs.existsSync(androidDir)) fs.mkdirSync(androidDir, { recursive: true });

// Copy public web app assets
copyRecursiveSync(path.join(ROOT_DIR, 'public'), path.join(androidDir, 'app'));

fs.writeFileSync(path.join(androidDir, 'COMO_USAR_EN_ANDROID.txt'),
`=================================================================
AnimeStream en Dispositivos Android (Móviles & Tablets)
=================================================================

MÉTODO 1 (Recomendado - Instalación Nativa 1-Clic PWA):
1. Asegúrate de que AnimeStream esté iniciado en tu ordenador.
2. Abre la app en el PC y pulsa en "Dispositivos" (en el menú superior)
   para ver tu código QR o dirección IP local (ej. http://192.168.0.100:3000).
3. Con tu móvil Android conectado al mismo Wi-Fi:
   - Escanea el código QR con la cámara de tu móvil, O
   - Abre Google Chrome / Brave en Android y entra a http://192.168.0.100:3000.
4. Toca en el menú de Chrome (los 3 puntos arriba a la derecha) y selecciona:
   👉 "Instalar aplicación" (o "Añadir a pantalla de inicio").
5. ¡Listo! Se creará un icono nativo de AnimeStream en tu cajón de aplicaciones
   de Android que se abre a pantalla completa como cualquier app descargada.

MÉTODO 2 (Smart TV con Android TV):
1. En tu televisor abre la app del Navegador web (como JioPages, Puffin o Downloader).
2. Entra a tu IP local con el puerto 3000.
3. Puedes navegar usando la cruceta y botones de colores de tu mando a distancia.
=================================================================
`);

console.log('  ✔ Paquete Android creado en dist/exports/AnimeStream-Android');
console.log('-----------------------------------------------------------------');
console.log('🎉 ¡Todos los paquetes han sido exportados exitosamente en dist/exports/!');
console.log('=================================================================');
