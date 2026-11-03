/**
 * AnimeStream Express Server Entrypoint
 */
const express = require('express');
const cors = require('cors');
const path = require('path');
const http = require('http');
const net = require('net');
const os = require('os');
const apiRouter = require('./routes/api');

function getLanIp() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return '127.0.0.1';
}

function findAvailablePort(startPort = 3000, maxAttempts = 20) {
  return new Promise((resolve) => {
    function tryPort(port) {
      if (port >= startPort + maxAttempts) {
        return resolve(startPort);
      }
      const server = net.createServer();
      server.unref();
      server.on('error', () => {
        tryPort(port + 1);
      });
      server.listen(port, () => {
        server.close(() => {
          resolve(port);
        });
      });
    }
    tryPort(startPort);
  });
}

function createApp() {
  const app = express();

  // Middleware
  app.use(cors({ origin: '*' }));
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // API Routes
  app.use('/api', apiRouter);

  // Serve static public folder
  const publicDir = path.join(__dirname, '..', 'public');
  app.use(express.static(publicDir));

  // SPA fallback
  app.use((req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(publicDir, 'index.html'));
  });

  return app;
}

async function startServer(preferredPort = 3000) {
  const app = createApp();
  const port = await findAvailablePort(preferredPort);
  const server = http.createServer(app);

  return new Promise((resolve, reject) => {
    server.listen(port, '0.0.0.0', () => {
      const lanIp = getLanIp();
      const localUrl = `http://localhost:${port}`;
      const lanUrl = lanIp !== '127.0.0.1' ? `http://${lanIp}:${port}` : null;

      resolve({
        server,
        port,
        localUrl,
        lanUrl,
        lanIp
      });
    });
    server.on('error', reject);
  });
}

module.exports = {
  createApp,
  startServer,
  getLanIp,
  findAvailablePort
};

// Start standalone if executed directly
if (require.main === module) {
  startServer().then(({ port, localUrl, lanUrl }) => {
    console.log('='.repeat(65));
    console.log('🎬 AnimeStream (Node.js) - Servidor Iniciado Exitosamente');
    console.log('='.repeat(65));
    console.log(` ▶ En este equipo:      ${localUrl}`);
    if (lanUrl) {
      console.log(` ▶ Smart TV / Móvil:    ${lanUrl}`);
    }
    console.log('='.repeat(65));
  }).catch(err => {
    console.error('Error al iniciar el servidor:', err);
    process.exit(1);
  });
}
