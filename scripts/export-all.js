/**
 * AnimeStream - Multiplatform Exporter
 * Generates ready-to-use distribution packages for Windows (.exe), Linux (ELF binary), and Android (.apk).
 * Note: macOS compatibility has been explicitly removed as requested.
 */
const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const DIST_DIR = path.join(ROOT_DIR, 'dist');
const EXPORT_DIR = path.join(DIST_DIR, 'exports');

console.log('=================================================================');
console.log('📦  AnimeStream - Exportador Multiplataforma');
console.log('=================================================================');
console.log('Plataformas objetivo: Windows (.exe), Linux (ELF Binary), Android (.apk)');
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
// 1. WINDOWS PACKAGE (.exe & Silent Portable)
// -----------------------------------------------------------------------------
console.log('[1/3] Preparando paquete para Windows (.exe y modo silencioso)...');
const winDir = path.join(EXPORT_DIR, 'AnimeStream-Windows');
if (!fs.existsSync(winDir)) fs.mkdirSync(winDir, { recursive: true });

['electron', 'server', 'public'].forEach(folder => {
  copyRecursiveSync(path.join(ROOT_DIR, folder), path.join(winDir, folder), ['.git']);
});

['package.json', 'run.js', 'iniciar.bat', 'iniciar_electron.bat', 'AnimeStream.vbs'].forEach(file => {
  const src = path.join(ROOT_DIR, file);
  if (fs.existsSync(src)) fs.copyFileSync(src, path.join(winDir, file));
});

fs.writeFileSync(path.join(winDir, 'LEEME_WINDOWS.txt'), 
`=================================================================
AnimeStream para Windows (Ejecutable .exe y Portable)
=================================================================

ARCHIVOS INCLUIDOS:
1. AnimeStream.vbs       -> Lanzador 100% silencioso (SIN ventana de consola CMD).
2. iniciar_electron.bat  -> Lanzador en ventana nativa de escritorio Electron.
3. iniciar.bat           -> Lanzador con servidor local para Smart TV y navegador.

COMPILACIÓN DE INSTALADOR .EXE NATIVO:
Para compilar el instalador "AnimeStream-Setup.exe" y "AnimeStream-Portable.exe":
  npm run build:win
=================================================================
`);

console.log('  ✔ Paquete Windows creado en dist/exports/AnimeStream-Windows');

// -----------------------------------------------------------------------------
// 2. LINUX PACKAGE (ELF Binary & Standalone Launcher)
// -----------------------------------------------------------------------------
console.log('[2/3] Preparando paquete para Linux (Binario ELF & AppImage)...');
const linuxDir = path.join(EXPORT_DIR, 'AnimeStream-Linux');
if (!fs.existsSync(linuxDir)) fs.mkdirSync(linuxDir, { recursive: true });

['electron', 'server', 'public'].forEach(folder => {
  copyRecursiveSync(path.join(ROOT_DIR, folder), path.join(linuxDir, folder), ['.git']);
});

['package.json', 'run.js', 'iniciar_linux.sh'].forEach(file => {
  const src = path.join(ROOT_DIR, file);
  if (fs.existsSync(src)) fs.copyFileSync(src, path.join(linuxDir, file));
});

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
AnimeStream para Linux (Binarios ELF & AppImage)
=================================================================

COMO EJECUTAR EN CUALQUIER DISTRO (Ubuntu, Debian, Fedora, Arch):
1. Abre una terminal en esta carpeta.
2. Otorga permisos de ejecución:
   chmod +x iniciar_linux.sh
3. Ejecuta directamente:
   ./iniciar_linux.sh

COMPILACIÓN DE BINARIO ELF (.AppImage y .deb):
Para generar el ejecutable ELF portátil universal (.AppImage):
  npm run build:linux
=================================================================
`);

console.log('  ✔ Paquete Linux creado en dist/exports/AnimeStream-Linux');

// -----------------------------------------------------------------------------
// 3. ANDROID PACKAGE (.apk Native Project)
// -----------------------------------------------------------------------------
console.log('[3/3] Preparando paquete para Android (.apk)...');
const androidExportDir = path.join(EXPORT_DIR, 'AnimeStream-Android');
if (!fs.existsSync(androidExportDir)) fs.mkdirSync(androidExportDir, { recursive: true });

// Sync Android project structure
copyRecursiveSync(path.join(ROOT_DIR, 'android'), path.join(androidExportDir, 'project'), ['.gradle', 'build', '.idea']);

// Sync public web assets into android assets
const androidAssetsDir = path.join(ROOT_DIR, 'android', 'app', 'src', 'main', 'assets', 'public');
if (!fs.existsSync(androidAssetsDir)) fs.mkdirSync(androidAssetsDir, { recursive: true });
copyRecursiveSync(path.join(ROOT_DIR, 'public'), androidAssetsDir);

// Copy assets to exported android project as well
copyRecursiveSync(path.join(ROOT_DIR, 'public'), path.join(androidExportDir, 'project', 'app', 'src', 'main', 'assets', 'public'));

fs.writeFileSync(path.join(androidExportDir, 'COMO_COMPILAR_Y_USAR_APK.txt'),
`=================================================================
AnimeStream para Android (.apk)
=================================================================

Este directorio contiene el proyecto nativo completo de Android para generar "AnimeStream.apk".

OPCIÓN 1 (Compilación con Gradle en Terminal):
1. Entra a la carpeta "project/":
   cd project
2. Ejecuta el compilador de Gradle:
   En Windows: gradlew.bat assembleRelease  (o assembleDebug)
   En Linux:   ./gradlew assembleRelease    (o assembleDebug)
3. Tu archivo "AnimeStream.apk" se generará en:
   project/app/build/outputs/apk/release/AnimeStream.apk

OPCIÓN 2 (Con Android Studio):
1. Abre Android Studio.
2. Selecciona "Open an Existing Project" y elige la carpeta "project/".
3. Ve a Build -> Build Bundle(s) / APK(s) -> Build APK(s).

OPCIÓN 3 (Compilación Automática en GitHub Releases):
Cada vez que se publica una nueva versión, el flujo de GitHub Actions
compila automáticamente "AnimeStream.apk" y lo adjunta a la pestaña
de Releases para descargarlo en tu móvil con un solo clic.
=================================================================
`);

console.log('  ✔ Paquete Android (.apk project) creado en dist/exports/AnimeStream-Android');
console.log('-----------------------------------------------------------------');
console.log('🎉 ¡Todos los paquetes han sido exportados exitosamente en dist/exports/!');
console.log('=================================================================');
