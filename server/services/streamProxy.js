/**
 * HLS Stream Proxy and Player Service for Node.js
 * Rewrites .m3u8 playlists and proxies MPEG-TS segments to bypass hotlink restrictions and CORS errors.
 */
const { httpClient, getRandomUserAgent, REQUEST_TIMEOUT_MS } = require('../config');

function getHlsPlayerHtml(hashId) {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reproductor HLS HD</title>
  <script src="/vendor/hls.min.js" onerror="this.onerror=null; this.src='https://cdn.jsdelivr.net/npm/hls.js@latest';"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 100%; height: 100%; background: #000; overflow: hidden; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    #video-wrapper { position: relative; width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; }
    video { width: 100%; height: 100%; object-fit: contain; outline: none; }
    .loading-overlay {
      position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center;
      background: rgba(11, 15, 25, 0.95); color: #f8fafc; font-size: 15px; gap: 14px; z-index: 10;
      transition: opacity 0.3s ease;
    }
    .spinner {
      width: 44px; height: 44px; border: 4px solid rgba(255,255,255,0.15); border-top-color: #f47521;
      border-radius: 50%; animation: spin 0.8s linear infinite;
    }
    .error-msg { color: #ef4444; font-weight: 600; text-align: center; max-width: 80%; line-height: 1.5; }
    @keyframes spin { to { transform: rotate(360deg); } }

    .player-hud {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%) scale(0.9);
      background: rgba(10, 15, 30, 0.92);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      color: #fff;
      padding: 16px 28px;
      border-radius: 14px;
      font-size: 1.25rem;
      font-weight: 700;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 10px;
      border: 1px solid rgba(244, 117, 33, 0.45);
      box-shadow: 0 12px 36px rgba(0, 0, 0, 0.75);
      pointer-events: none;
      opacity: 0;
      transition: opacity 0.12s ease, transform 0.12s ease;
      z-index: 100;
    }
    .player-hud.visible {
      opacity: 1;
      transform: translate(-50%, -50%) scale(1);
    }
    .hud-bar {
      width: 160px;
      height: 8px;
      background: rgba(255, 255, 255, 0.2);
      border-radius: 4px;
      overflow: hidden;
      display: none;
    }
    .hud-bar-fill {
      height: 100%;
      background: #f47521;
      border-radius: 4px;
      transition: width 0.08s ease;
    }
    body.hide-cursor, body.hide-cursor * {
      cursor: none !important;
    }
  </style>
</head>
<body>
  <div id="video-wrapper">
    <div id="loading" class="loading-overlay">
      <div class="spinner"></div>
      <span id="loading-text">Cargando reproductor HLS en alta definición...</span>
    </div>
    <div id="player-hud" class="player-hud">
      <span id="hud-text"></span>
      <div id="hud-bar" class="hud-bar">
        <div id="hud-bar-fill" class="hud-bar-fill"></div>
      </div>
    </div>
    <video id="video" controls playsinline tabindex="0"></video>
  </div>
  <script>
    const video = document.getElementById('video');
    const loading = document.getElementById('loading');
    const loadingText = document.getElementById('loading-text');
    const hud = document.getElementById('player-hud');
    const hudText = document.getElementById('hud-text');
    const hudBar = document.getElementById('hud-bar');
    const hudBarFill = document.getElementById('hud-bar-fill');
    const source = '/api/hls/m3u8/${hashId}';
    const STORAGE_KEY_VOLUME = 'animestream_player_volume';
    let hudTimer = null;
    let idleCursorTimer = null;

    function resetIdleCursor() {
      document.body.classList.remove('hide-cursor');
      if (idleCursorTimer) clearTimeout(idleCursorTimer);
      idleCursorTimer = setTimeout(() => {
        document.body.classList.add('hide-cursor');
      }, 2500);
    }
    window.addEventListener('mousemove', resetIdleCursor);
    window.addEventListener('mousedown', resetIdleCursor);
    window.addEventListener('touchstart', resetIdleCursor, { passive: true });
    resetIdleCursor();

    try {
      const savedVol = localStorage.getItem(STORAGE_KEY_VOLUME);
      if (savedVol !== null && !isNaN(Number(savedVol))) {
        video.volume = Math.max(0, Math.min(1, parseFloat(savedVol)));
      } else {
        video.volume = 1.0;
      }
    } catch (_) {}

    function showHUD(text, percent = null) {
      hudText.textContent = text;
      if (percent !== null) {
        hudBar.style.display = 'block';
        hudBarFill.style.width = Math.max(0, Math.min(100, percent)) + '%';
      } else {
        hudBar.style.display = 'none';
      }
      hud.classList.add('visible');
      if (hudTimer) clearTimeout(hudTimer);
      hudTimer = setTimeout(() => hud.classList.remove('visible'), 1200);
    }

    video.addEventListener('volumechange', () => {
      try { localStorage.setItem(STORAGE_KEY_VOLUME, video.volume.toString()); } catch (_) {}
    });

    function initHls() {
      if (window.Hls && Hls.isSupported()) {
        const hls = new Hls({
          maxBufferLength: 30,
          maxMaxBufferLength: 60,
          enableWorker: true,
          lowLatencyMode: false
        });
        hls.loadSource(source);
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          loading.style.opacity = '0';
          setTimeout(() => loading.style.display = 'none', 300);
          video.play().catch(() => {});
        });
        hls.on(Hls.Events.ERROR, (event, data) => {
          if (data.fatal) {
            switch(data.type) {
              case Hls.ErrorTypes.NETWORK_ERROR:
                hls.startLoad();
                break;
              case Hls.ErrorTypes.MEDIA_ERROR:
                hls.recoverMediaError();
                break;
              default:
                loading.style.display = 'flex';
                loading.style.opacity = '1';
                loading.innerHTML = '<span class="error-msg">⚠️ No se pudo reproducir este vídeo HLS.<br>Por favor prueba con otro servidor alternativo.</span>';
                hls.destroy();
                break;
            }
          }
        });
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = source;
        video.addEventListener('loadedmetadata', () => {
          loading.style.display = 'none';
          video.play().catch(() => {});
        });
      } else {
        loading.innerHTML = '<span class="error-msg">Tu navegador no soporta streaming HLS.</span>';
      }
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initHls);
    } else {
      initHls();
    }
  </script>
</body>
</html>`;
}

async function handleHlsM3u8(hashId, req, res) {
  const cleanHash = (hashId || '').replace(/[^a-fA-F0-9]/g, '');
  if (!cleanHash) {
    return res.status(400).json({ detail: 'Hash inválido' });
  }

  const ua = getRandomUserAgent();

  // Step 1: Pre-warm session cookie
  try {
    await httpClient.get(`https://player.zilla-networks.com/play/${cleanHash}`, {
      headers: {
        'User-Agent': ua,
        'Referer': 'https://animeav1.com/'
      },
      timeout: 6000
    });
  } catch (_) {}

  // Step 2: Fetch .m3u8 playlist
  try {
    const m3u8Res = await httpClient.get(`https://player.zilla-networks.com/m3u8/${cleanHash}`, {
      headers: {
        'User-Agent': ua,
        'Referer': `https://player.zilla-networks.com/play/${cleanHash}`,
        'Origin': 'https://player.zilla-networks.com',
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'same-origin'
      },
      timeout: REQUEST_TIMEOUT_MS
    });

    const rawM3u8 = typeof m3u8Res.data === 'string' ? m3u8Res.data : JSON.stringify(m3u8Res.data);

    // Rewrite absolute segment links to local proxy endpoints
    const rewritten = rawM3u8.replace(
      new RegExp(`https://player\\.zilla-networks\\.com/segs/${cleanHash}/([a-zA-Z0-9_\\-\\.]+)`, 'g'),
      `/api/hls/seg/${cleanHash}/$1`
    );

    res.set({
      'Content-Type': 'application/vnd.apple.mpegurl',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=300'
    });
    return res.send(rewritten);
  } catch (err) {
    return res.status(502).json({ detail: `Error al obtener el manifiesto HLS: ${err.message}` });
  }
}

async function handleHlsSegment(hashId, filename, req, res) {
  const cleanHash = (hashId || '').replace(/[^a-fA-F0-9]/g, '');
  const cleanFile = (filename || '').replace(/[^a-zA-Z0-9_\-\.]/g, '');
  if (!cleanHash || !cleanFile) {
    return res.status(400).json({ detail: 'Parámetros inválidos' });
  }

  try {
    const segUrl = `https://player.zilla-networks.com/segs/${cleanHash}/${cleanFile}`;
    const segRes = await httpClient.get(segUrl, {
      headers: {
        'User-Agent': getRandomUserAgent(),
        'Referer': `https://player.zilla-networks.com/play/${cleanHash}`,
        'Origin': 'https://player.zilla-networks.com',
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'same-origin'
      },
      responseType: 'stream',
      timeout: REQUEST_TIMEOUT_MS
    });

    const contentType = cleanFile.endsWith('.ts') ? 'video/mp2t' : 'application/octet-stream';
    res.set({
      'Content-Type': contentType,
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=86400'
    });
    return segRes.data.pipe(res);
  } catch (err) {
    return res.status(502).json({ detail: `Error al descargar segmento HLS: ${err.message}` });
  }
}

async function handleImageProxy(url, req, res) {
  if (!url || typeof url !== 'string' || !url.startsWith('http')) {
    return res.status(400).json({ detail: 'URL de imagen no válida' });
  }

  try {
    const imgRes = await httpClient.get(url, {
      headers: {
        'User-Agent': getRandomUserAgent(),
        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
      },
      responseType: 'stream',
      timeout: REQUEST_TIMEOUT_MS
    });

    const contentType = imgRes.headers['content-type'] || 'image/jpeg';
    res.set({
      'Content-Type': contentType,
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=604800, immutable'
    });
    return imgRes.data.pipe(res);
  } catch (err) {
    return res.status(502).json({ detail: `Error al obtener imagen remota: ${err.message}` });
  }
}

module.exports = {
  getHlsPlayerHtml,
  handleHlsM3u8,
  handleHlsSegment,
  handleImageProxy
};
