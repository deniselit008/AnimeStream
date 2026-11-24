/**
 * HLS Stream Proxy and Player Service for Node.js
 * Rewrites .m3u8 playlists and proxies MPEG-TS segments to bypass hotlink restrictions and CORS errors.
 */
const http = require('http');
const https = require('https');
const { httpClient, getRandomUserAgent, REQUEST_TIMEOUT_MS, unblockedLookup } = require('../config');

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

    // Exposed control APIs
    window.seekRelative = function(delta) {
      if (video) {
        const dur = (isFinite(video.duration) && video.duration > 0) ? video.duration : 999999;
        const cur = (isFinite(video.currentTime) && video.currentTime >= 0) ? video.currentTime : 0;
        const d = isFinite(delta) ? delta : 10;
        video.currentTime = Math.max(0, Math.min(dur, cur + d));
        showHUD((d > 0 ? '+' : '') + Math.round(d) + 's');
      }
    };
    window.seekTo = function(seconds) {
      if (video) {
        const s = (isFinite(seconds) && seconds >= 0) ? seconds : 0;
        if (video.readyState >= 1) {
          const dur = (isFinite(video.duration) && video.duration > 0) ? video.duration : 999999;
          video.currentTime = Math.max(0, Math.min(dur, s));
        } else {
          video.addEventListener('loadedmetadata', () => {
            const dur = (isFinite(video.duration) && video.duration > 0) ? video.duration : 999999;
            video.currentTime = Math.max(0, Math.min(dur, s));
          }, { once: true });
        }
      }
    };
    window.setPlaybackRate = function(rate) {
      if (video) {
        const r = parseFloat(rate);
        video.playbackRate = (isFinite(r) && r > 0) ? r : 1.0;
        showHUD('⚡ ' + video.playbackRate + 'x');
      }
    };
    window.changeVolume = function(delta) {
      if (video) {
        const curVol = isFinite(video.volume) ? video.volume : 1;
        video.volume = Math.max(0, Math.min(1, Math.round((curVol + delta) * 100) / 100));
        showHUD('Volumen: ' + Math.round(video.volume * 100) + '%', Math.round(video.volume * 100));
      }
    };
    window.togglePlay = function() {
      if (!video) return;
      if (video.paused) { video.play().catch(() => {}); showHUD('▶ Reproduciendo'); }
      else { video.pause(); showHUD('⏸ Pausa'); }
    };
    window.toggleMute = function() {
      if (!video) return;
      video.muted = !video.muted;
      showHUD(video.muted ? '🔇 Silenciado' : '🔊 Sonido');
    };

    // Listen for parent messages
    window.addEventListener('message', (e) => {
      if (!e.data || e.data.type !== 'PLAYER_CMD') return;
      const d = e.data;
      if (d.cmd === 'seek_relative') {
        const s = d.seconds !== undefined ? d.seconds : (d.delta !== undefined ? d.delta : 10);
        window.seekRelative(s);
      } else if (d.cmd === 'seek_forward') {
        window.seekRelative(10);
      } else if (d.cmd === 'seek_backward') {
        window.seekRelative(-10);
      } else if (d.cmd === 'seek_to') {
        window.seekTo(d.seconds);
      } else if (d.cmd === 'set_rate') {
        window.setPlaybackRate(d.rate);
      } else if (d.cmd === 'play') {
        if (video && video.paused) { video.play().catch(() => {}); showHUD('▶ Reproduciendo'); }
      } else if (d.cmd === 'pause') {
        if (video && !video.paused) { video.pause(); showHUD('⏸ Pausa'); }
      } else if (d.cmd === 'toggle_play') {
        window.togglePlay();
      } else if (d.cmd === 'toggle_mute') {
        window.toggleMute();
      } else if (d.cmd === 'volume_up') {
        window.changeVolume(0.05);
      } else if (d.cmd === 'volume_down') {
        window.changeVolume(-0.05);
      }
    });

    // Notify parent window of progress and completion
    video.addEventListener('timeupdate', () => {
      try {
        if (window.parent && window.parent !== window) {
          window.parent.postMessage({
            type: 'ANIMESTREAM_TIME_UPDATE',
            currentTime: video.currentTime,
            duration: video.duration || 0,
            playbackRate: video.playbackRate || 1.0
          }, '*');
        }
      } catch (_) {}
    });

    video.addEventListener('pause', () => {
      try {
        if (window.parent && window.parent !== window) {
          window.parent.postMessage({ type: 'ANIMESTREAM_PAUSE' }, '*');
        }
      } catch (_) {}
    });

    video.addEventListener('ended', () => {
      try {
        if (window.parent && window.parent !== window) {
          window.parent.postMessage({ type: 'ANIMESTREAM_ENDED' }, '*');
        }
      } catch (_) {}
    });

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
  let cookieHeader = '';

  // Step 1: Pre-warm session cookie
  try {
    const playRes = await httpClient.get(`https://player.zilla-networks.com/play/${cleanHash}`, {
      headers: {
        'User-Agent': ua,
        'Referer': 'https://animeav1.com/'
      },
      timeout: 6000
    });
    const setCookies = playRes.headers?.['set-cookie'];
    if (Array.isArray(setCookies) && setCookies.length > 0) {
      cookieHeader = setCookies.map(c => c.split(';')[0]).join('; ');
    }
  } catch (_) {}

  // Step 2: Fetch .m3u8 playlist
  try {
    const reqHeaders = {
      'User-Agent': ua,
      'Referer': `https://player.zilla-networks.com/play/${cleanHash}`,
      'Origin': 'https://player.zilla-networks.com',
      'Sec-Fetch-Dest': 'empty',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Site': 'same-origin'
    };
    if (cookieHeader) reqHeaders['Cookie'] = cookieHeader;

    const m3u8Res = await httpClient.get(`https://player.zilla-networks.com/m3u8/${cleanHash}`, {
      headers: reqHeaders,
      timeout: REQUEST_TIMEOUT_MS
    });

    const rawM3u8 = typeof m3u8Res.data === 'string' ? m3u8Res.data : JSON.stringify(m3u8Res.data);

    // Rewrite absolute, URI attributes (#EXT-X-KEY / #EXT-X-MAP), and relative segment links to local proxy endpoints
    const rewritten = rawM3u8
      .replace(
        new RegExp(`https://player\\.zilla-networks\\.com/segs/${cleanHash}/([a-zA-Z0-9_\\-\\.]+)(?:\\?[^\\s"']*)?`, 'g'),
        `/api/hls/seg/${cleanHash}/$1`
      )
      .split(/\r?\n/)
      .map(rawLine => {
        const line = rawLine.trim();
        if (!line) return '';
        if (line.startsWith('#')) {
          return line.replace(/URI="([^"]+)"/gi, (full, uri) => {
            if (uri.startsWith(`/api/hls/seg/${cleanHash}/`) || uri.startsWith('http://') || uri.startsWith('https://')) {
              return full;
            }
            const cleanUri = uri.replace(/^\/segs\/[^/]+\//, '').split('?')[0].replace(/[^a-zA-Z0-9_\-\.]/g, '');
            return cleanUri ? `URI="/api/hls/seg/${cleanHash}/${cleanUri}"` : full;
          });
        }
        if (line.startsWith('/segs/')) {
          const segFile = line.replace(/^\/segs\/[^/]+\//, '').split('?')[0].replace(/[^a-zA-Z0-9_\-\.]/g, '');
          return (segFile && !segFile.includes('..') && segFile !== '.') ? `/api/hls/seg/${cleanHash}/${segFile}` : line;
        }
        if (line.startsWith('/') || line.startsWith('http://') || line.startsWith('https://')) return line;
        const cleanSeg = line.split('?')[0].replace(/[^a-zA-Z0-9_\-\.]/g, '');
        return (cleanSeg && !cleanSeg.includes('..') && cleanSeg !== '.') ? `/api/hls/seg/${cleanHash}/${cleanSeg}` : line;
      })
      .join('\n');

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
  if (!cleanHash || !cleanFile || cleanFile === '.' || cleanFile === '..' || cleanFile.includes('..')) {
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

    segRes.data.on('error', () => {
      if (!res.headersSent) {
        try { res.status(502).end(); } catch (_) {}
      }
    });

    res.on('close', () => {
      if (!res.writableEnded && typeof segRes.data.destroy === 'function') {
        try { segRes.data.destroy(); } catch (_) {}
      }
    });

    return segRes.data.pipe(res);
  } catch (err) {
    return res.status(502).json({ detail: `Error al descargar segmento HLS: ${err.message}` });
  }
}

function isPrivateIpv4(ipv4) {
  const parts = ipv4.split('.').map(n => parseInt(n, 10));
  if (parts.length !== 4 || parts.some(n => isNaN(n) || n < 0 || n > 255)) return false;
  const [a, b] = parts;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  return false;
}

function isPrivateOrBlockedHost(rawHost) {
  if (!rawHost || typeof rawHost !== 'string') return true;
  // Strip IPv6 brackets and trailing FQDN dots (e.g. [::1], localhost., 127.0.0.1.)
  const host = rawHost.replace(/^\[|\]$/g, '').toLowerCase().trim().replace(/\.+$/, '');
  if (!host) return true;

  // Loopback & Unspecified
  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host === '0.0.0.0' ||
    host === '::' ||
    host === '::1' ||
    host === '0:0:0:0:0:0:0:1' ||
    host === '0:0:0:0:0:0:0:0'
  ) {
    return true;
  }

  // IPv4-mapped IPv6 addresses (e.g. ::ffff:127.0.0.1 or normalized ::ffff:7f00:1)
  const v6HexMapped = host.match(/^(?:0{0,4}:){0,5}(?:::)?ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (v6HexMapped) {
    const hi = parseInt(v6HexMapped[1], 16);
    const lo = parseInt(v6HexMapped[2], 16);
    const ipv4 = `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`;
    return isPrivateIpv4(ipv4);
  }
  const v6DotMapped = host.match(/^(?:0{0,4}:){0,5}(?:::)?ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (v6DotMapped) {
    return isPrivateIpv4(v6DotMapped[1]);
  }

  // Standard IPv4 ranges (RFC 1918, Loopback, Link-Local, Unspecified, CGNAT)
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    return isPrivateIpv4(host);
  }

  // Link-Local IPv6 (fe80::/10 -> fe80..febf)
  if (/^fe[89ab][0-9a-f]:/.test(host)) {
    return true;
  }

  // IPv6 Unique Local (fc00::/7)
  if (/^f[cd][0-9a-f]{0,2}:/.test(host)) {
    return true;
  }

  // Local / mDNS / internal domains
  if (host.endsWith('.local') || host.endsWith('.internal') || host.endsWith('.lan') || host.endsWith('.home')) {
    return true;
  }

  return false;
}

function assertSafeRedirect(options) {
  const targetProto = (options && options.protocol) ? String(options.protocol).toLowerCase() : '';
  if (targetProto && targetProto !== 'http:' && targetProto !== 'https:') {
    throw new Error('Redirección bloqueada: protocolo no permitido');
  }
  let host = options && options.hostname;
  if (!host && options && options.href) {
    try {
      const parsed = new URL(options.href);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new Error('Redirección bloqueada: protocolo no permitido');
      }
      host = parsed.hostname;
    } catch (e) {
      throw new Error('Redirección bloqueada: URL inválida');
    }
  }
  if (isPrivateOrBlockedHost(host)) {
    throw new Error('Redirección SSRF bloqueada hacia red privada o local');
  }
}

function ssrfSafeLookup(hostname, options, callback) {
  if (typeof options === 'function') {
    callback = options;
    options = {};
  }
  unblockedLookup(hostname, options, (err, address, family) => {
    if (err) return callback(err, address, family);
    if (Array.isArray(address)) {
      const blocked = address.find(entry => !entry || isPrivateOrBlockedHost(entry.address));
      if (blocked) {
        return callback(new Error('Acceso SSRF denegado tras resolución DNS a red privada'));
      }
      return callback(null, address);
    }
    if (isPrivateOrBlockedHost(address)) {
      return callback(new Error('Acceso SSRF denegado tras resolución DNS a red privada'));
    }
    return callback(null, address, family);
  });
}

const proxyHttpAgent = new http.Agent({
  keepAlive: true,
  timeout: REQUEST_TIMEOUT_MS,
  lookup: ssrfSafeLookup
});

const proxyHttpsAgent = new https.Agent({
  keepAlive: true,
  timeout: REQUEST_TIMEOUT_MS,
  lookup: ssrfSafeLookup
});

function isAllowedImageUrl(urlStr) {
  try {
    const parsed = new URL(urlStr);
    if (!['http:', 'https:'].includes(parsed.protocol)) return false;
    return !isPrivateOrBlockedHost(parsed.hostname);
  } catch (_) {
    return false;
  }
}

async function handleImageProxy(url, req, res) {
  if (!url || typeof url !== 'string' || !isAllowedImageUrl(url)) {
    return res.status(400).json({ detail: 'URL de imagen no permitida o no válida' });
  }

  try {
    const imgRes = await httpClient.get(url, {
      headers: {
        'User-Agent': getRandomUserAgent(),
        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
      },
      responseType: 'stream',
      timeout: REQUEST_TIMEOUT_MS,
      beforeRedirect: assertSafeRedirect,
      httpAgent: proxyHttpAgent,
      httpsAgent: proxyHttpsAgent
    });

    const contentType = imgRes.headers['content-type'] || 'image/jpeg';
    res.set({
      'Content-Type': contentType,
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=604800, immutable'
    });

    imgRes.data.on('error', () => {
      if (!res.headersSent) {
        try { res.status(502).end(); } catch (_) {}
      }
    });

    res.on('close', () => {
      if (!res.writableEnded && typeof imgRes.data.destroy === 'function') {
        try { imgRes.data.destroy(); } catch (_) {}
      }
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
  handleImageProxy,
  isPrivateOrBlockedHost,
  assertSafeRedirect,
  proxyHttpAgent,
  proxyHttpsAgent
};
