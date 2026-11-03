/**
 * Standalone Web Runner for AnimeStream (Node.js)
 * Usage: node run.js
 */
const { startServer } = require('./server/index');
const { exec } = require('child_process');

function openBrowser(url) {
  try {
    if (process.platform === 'win32') {
      exec(`start "" "${url}"`, () => {});
    } else if (process.platform === 'darwin') {
      exec(`open "${url}"`, () => {});
    } else {
      exec(`xdg-open "${url}"`, () => {});
    }
  } catch (_) {
    try {
      const openPkg = require('open');
      const fn = typeof openPkg === 'function' ? openPkg : openPkg?.default;
      if (typeof fn === 'function') {
        fn(url).catch(() => {});
      }
    } catch (__) {}
  }
}

async function main() {
  try {
    const { localUrl, lanUrl, port } = await startServer(3000);

    console.log('='.repeat(65));
    console.log('🎬  AnimeStream (Node.js Edition) - Servidor Iniciado');
    console.log('='.repeat(65));
    console.log(` ▶  En este ordenador:        ${localUrl}`);
    if (lanUrl) {
      console.log(` ▶  En Smart TV / Móvil:       ${lanUrl}`);
    }
    console.log(` ▶  Estado API Health:        ${localUrl}/api/health`);
    console.log('-'.repeat(65));
    console.log(' Presiona Ctrl + C en esta consola para detener el servidor.');
    console.log('='.repeat(65));

    // Open default browser after 800ms
    setTimeout(() => {
      openBrowser(localUrl);
    }, 800);
  } catch (err) {
    console.error('Error al iniciar AnimeStream:', err);
    process.exit(1);
  }
}

main();
