/**
 * Unified REST API Router for AnimeStream Node.js
 */
const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { cache } = require('../cache');
const { httpClient, getHeaders, fixEncoding, REQUEST_TIMEOUT_MS } = require('../config');
const {
  animeav1Provider,
  jkanimeProvider,
  tioanimeProvider,
  detectProviderByUrl
} = require('../providers');
const { fetchMalRelations, cleanTitleForMal } = require('../services/malService');
const {
  getHlsPlayerHtml,
  handleHlsM3u8,
  handleHlsSegment,
  handleImageProxy,
  isPrivateOrBlockedHost,
  assertSafeRedirect,
  proxyHttpAgent,
  proxyHttpsAgent
} = require('../services/streamProxy');
const { sanitizePlayerHtml } = require('../services/playerSanitizer');
const {
  parseMalXml,
  decompressBufferIfNeeded,
  findLatestLocalMalFile
} = require('../services/malXmlParser');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

function escapeAttr(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// ==============================================================================
// 1. LATEST EPISODES
// ==============================================================================
router.get('/latest', async (req, res) => {
  const source = (req.query.source || 'all').toLowerCase();
  const cacheKey = `latest_${source}`;
  const cached = cache.get(cacheKey);
  if (cached) return res.json(cached);

  const tasks = [];
  const providersActive = [];

  if (['all', 'animeav1', 'av1'].includes(source)) {
    tasks.push(animeav1Provider.getLatest().catch(err => {
      console.error('[AnimeAV1 Error latest]:', err.message);
      return [];
    }));
    providersActive.push('AnimeAV1');
  }
  if (['all', 'jkanime', 'jk'].includes(source)) {
    tasks.push(jkanimeProvider.getLatest().catch(err => {
      console.error('[JKAnime Error latest]:', err.message);
      return [];
    }));
    providersActive.push('JKAnime');
  }
  if (['all', 'tioanime', 'tio'].includes(source)) {
    tasks.push(tioanimeProvider.getLatest().catch(err => {
      console.error('[TioAnime Error latest]:', err.message);
      return [];
    }));
    providersActive.push('TioAnime');
  }

  const results = await Promise.all(tasks);
  const validLists = results.filter(list => Array.isArray(list) && list.length > 0);

  let combined = [];
  if (source === 'all' && validLists.length > 1) {
    const maxLen = Math.max(...validLists.map(l => l.length));
    for (let i = 0; i < maxLen; i++) {
      for (const list of validLists) {
        if (i < list.length) {
          combined.push(list[i]);
        }
      }
    }
  } else if (validLists.length > 0) {
    combined = validLists.flat();
  }

  if (combined.length > 0) {
    cache.set(cacheKey, combined);
  }

  return res.json(combined);
});

// ==============================================================================
// 2. MULTI-SOURCE SEARCH
// ==============================================================================
router.get('/search', async (req, res) => {
  const query = (req.query.q || '').trim();
  if (!query) {
    return res.status(400).json({ detail: 'El parámetro q es obligatorio' });
  }

  const source = (req.query.source || 'all').toLowerCase();
  const cacheKey = `search_${query.toLowerCase()}_${source}`;
  const cached = cache.get(cacheKey);
  if (cached) return res.json(cached);

  const tasks = [];
  const labels = [];

  if (['all', 'animeav1', 'av1'].includes(source)) {
    tasks.push(animeav1Provider.search(query));
    labels.push('AnimeAV1');
  }
  if (['all', 'jkanime', 'jk'].includes(source)) {
    tasks.push(jkanimeProvider.search(query));
    labels.push('JKAnime');
  }
  if (['all', 'tioanime', 'tio'].includes(source)) {
    tasks.push(tioanimeProvider.search(query));
    labels.push('TioAnime');
  }

  const settled = await Promise.allSettled(tasks);
  const combinedResults = [];
  const errors = [];

  settled.forEach((result, idx) => {
    const label = labels[idx];
    if (result.status === 'fulfilled' && Array.isArray(result.value)) {
      combinedResults.push(...result.value);
    } else {
      const errMsg = result.reason?.message || 'Error en scraping';
      console.error(`[Search Error ${label}]:`, errMsg);
      errors.push({ source: label, error: errMsg });
    }
  });

  const responsePayload = {
    query,
    results: combinedResults,
    errors
  };

  if (combinedResults.length > 0) {
    cache.set(cacheKey, responsePayload);
  }

  return res.json(responsePayload);
});

// ==============================================================================
// 3. FILTERABLE DIRECTORY
// ==============================================================================
router.get('/directory', async (req, res) => {
  const genre = req.query.genre ? String(req.query.genre).trim() : null;
  const typeFilter = req.query.type ? String(req.query.type).trim() : null;
  const year = req.query.year ? String(req.query.year).trim() : null;
  const status = req.query.status ? String(req.query.status).trim() : null;
  const source = (req.query.source ? String(req.query.source).trim() : 'all').toLowerCase();
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);

  const cacheKey = `dir_${genre}_${typeFilter}_${year}_${status}_${source}_${page}`.toLowerCase();
  const cached = cache.get(cacheKey);
  if (cached) return res.json(cached);

  const tasks = [];
  if (['all', 'animeav1', 'av1'].includes(source)) {
    tasks.push(animeav1Provider.getDirectory(genre, typeFilter, year, status, page).catch(() => []));
  }
  if (['all', 'jkanime', 'jk'].includes(source)) {
    tasks.push(jkanimeProvider.getDirectory(genre, typeFilter, year, status, page).catch(() => []));
  }
  if (['all', 'tioanime', 'tio'].includes(source)) {
    tasks.push(tioanimeProvider.getDirectory(genre, typeFilter, year, status, page).catch(() => []));
  }

  const results = await Promise.all(tasks);
  const validLists = results.filter(list => Array.isArray(list) && list.length > 0);

  let combined = [];
  if (validLists.length > 1) {
    const maxLen = Math.max(...validLists.map(l => l.length));
    for (let i = 0; i < maxLen; i++) {
      for (const list of validLists) {
        if (i < list.length) {
          combined.push(list[i]);
        }
      }
    }
  } else if (validLists.length === 1) {
    combined = validLists[0];
  }

  const responseData = {
    items: combined,
    page,
    has_next: combined.length > 0,
    total: combined.length
  };

  if (combined.length > 0) {
    cache.set(cacheKey, responseData);
  }

  return res.json(responseData);
});

// ==============================================================================
// 4. ANIME DETAILS & RELATIONS
// ==============================================================================
router.get('/anime', async (req, res) => {
  const url = req.query.url;
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ detail: 'URL del anime requerida' });
  }

  const provider = detectProviderByUrl(url);
  if (!provider) {
    return res.status(400).json({
      detail: 'URL no soportada. Debe pertenecer a animeav1.com, jkanime.net o tioanime.com'
    });
  }

  const cacheKey = `anime_${url.trim().toLowerCase()}`;
  const cached = cache.get(cacheKey);
  if (cached) return res.json(cached);

  try {
    const animeInfo = await provider.getAnime(url);

    // Attach franchise relations from MAL if already cached
    const cleanTitle = cleanTitleForMal(animeInfo.title);
    const cachedRel = cache.get(`mal_rel_av_v2_${cleanTitle.toLowerCase()}`);
    animeInfo.relations = cachedRel || [];

    cache.set(cacheKey, animeInfo);
    return res.json(animeInfo);
  } catch (err) {
    console.error(`Error getAnime for ${url}:`, err.message);
    return res.status(502).json({
      detail: `No se pudo extraer la información del anime (${provider.name}). Causa: ${err.message}`
    });
  }
});

router.get('/anime/relations', async (req, res) => {
  const title = (req.query.title || '').trim();
  if (!title) {
    return res.status(400).json({ detail: 'Título requerido' });
  }
  const relations = await fetchMalRelations(title);
  return res.json(relations);
});

// ==============================================================================
// 5. WATCH ROOM & STREAMING
// ==============================================================================
router.get('/watch', async (req, res) => {
  const url = req.query.url;
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ detail: 'URL del episodio requerida' });
  }

  const provider = detectProviderByUrl(url);
  if (!provider) {
    return res.status(400).json({
      detail: 'URL no soportada. Debe pertenecer a animeav1.com, jkanime.net o tioanime.com'
    });
  }

  const cacheKey = `watch_${url.trim().toLowerCase()}`;
  const cached = cache.get(cacheKey);
  if (cached) return res.json(cached);

  try {
    const watchInfo = await provider.getWatch(url);
    cache.set(cacheKey, watchInfo);
    return res.json(watchInfo);
  } catch (err) {
    console.error(`Error getWatch for ${url}:`, err.message);
    return res.status(502).json({
      detail: `No se pudieron extraer los reproductores del episodio (${provider.name}). Causa: ${err.message}`
    });
  }
});

// HLS Embebbed Player HTML
router.get('/hls/player/:hash_id', (req, res) => {
  const hashId = (req.params.hash_id || '').replace(/[^a-fA-F0-9]/g, '');
  if (!hashId) {
    return res.status(400).send('Hash HLS inválido');
  }
  const html = getHlsPlayerHtml(hashId);
  res.set({
    'Content-Type': 'text/html; charset=utf-8',
    'Access-Control-Allow-Origin': '*'
  });
  return res.send(html);
});

// HLS .m3u8 Playlist Rewriter Proxy
router.get('/hls/m3u8/:hash_id', (req, res) => {
  return handleHlsM3u8(req.params.hash_id, req, res);
});

// HLS MPEG-TS Chunks Proxy
router.get('/hls/seg/:hash_id/:filename', (req, res) => {
  return handleHlsSegment(req.params.hash_id, req.params.filename, req, res);
});

// Third-Party Proxy Player (Bypasses X-Frame-Options, strips ads, injects protective shield)
router.get('/proxy-player', async (req, res) => {
  let targetUrl = req.query.url;
  const ref = req.query.ref;
  const adblock = req.query.adblock !== 'false' && req.query.adblock !== false;

  if (!targetUrl || typeof targetUrl !== 'string') {
    return res.status(400).send('URL requerida');
  }

  targetUrl = targetUrl.trim();
  if (targetUrl.startsWith('//')) {
    targetUrl = 'https:' + targetUrl;
  } else if (/^\/api\/hls\/player\/[a-fA-F0-9]+\/?$/.test(targetUrl)) {
    return res.redirect(307, targetUrl);
  } else if (targetUrl.startsWith('/')) {
    return res.status(400).send('Ruta relativa no permitida');
  }

  if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
    targetUrl = 'https://' + targetUrl;
  }

  // SSRF Protection: Reject loopback, private networks, and metadata endpoints
  let parsedTarget;
  try {
    parsedTarget = new URL(targetUrl);
  } catch (_) {
    return res.status(400).send('URL inválida');
  }

  const hostname = parsedTarget.hostname.toLowerCase();
  if (isPrivateOrBlockedHost(hostname)) {
    return res.status(403).send('Acceso denegado a hosts locales o privados');
  }

  try {
    const pathnameLower = parsedTarget.pathname.toLowerCase();
    const buildDirectVideoHtml = (videoSrc) => `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Reproductor AnimeStream</title>
  <style>
    html, body { margin:0; padding:0; width:100%; height:100%; background:#000; overflow:hidden; display:flex; align-items:center; justify-content:center; }
    video { width:100%; height:100%; object-fit:contain; }
    body.hide-cursor, body.hide-cursor * { cursor: none !important; }
  </style>
</head>
<body>
  <video id="video" src="${escapeAttr(videoSrc)}" controls autoplay playsinline></video>
  <script>
    const video = document.getElementById('video');
    let idleT = null;
    function resetC() {
      document.body.classList.remove('hide-cursor');
      if (idleT) clearTimeout(idleT);
      idleT = setTimeout(() => document.body.classList.add('hide-cursor'), 2500);
    }
    window.addEventListener('mousemove', resetC);
    window.addEventListener('mousedown', resetC);
    window.addEventListener('touchstart', resetC, { passive: true });
    resetC();

    window.seekRelative = function(delta) {
      if (video) {
        const dur = (isFinite(video.duration) && video.duration > 0) ? video.duration : 999999;
        const cur = (isFinite(video.currentTime) && video.currentTime >= 0) ? video.currentTime : 0;
        const d = isFinite(delta) ? delta : 10;
        video.currentTime = Math.max(0, Math.min(dur, cur + d));
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
      }
    };
    window.changeVolume = function(delta) {
      if (video) {
        const curVol = isFinite(video.volume) ? video.volume : 1;
        video.volume = Math.max(0, Math.min(1, Math.round((curVol + delta) * 100) / 100));
      }
    };
    window.togglePlay = function() {
      if (!video) return;
      if (video.paused) video.play().catch(() => {}); else video.pause();
    };
    window.toggleMute = function() {
      if (!video) return;
      video.muted = !video.muted;
    };

    window.addEventListener('message', (e) => {
      if (!e.data || e.data.type !== 'PLAYER_CMD') return;
      const d = e.data;
      if (d.cmd === 'seek_relative') window.seekRelative(d.seconds !== undefined ? d.seconds : (d.delta !== undefined ? d.delta : 10));
      else if (d.cmd === 'seek_forward') window.seekRelative(10);
      else if (d.cmd === 'seek_backward') window.seekRelative(-10);
      else if (d.cmd === 'seek_to') window.seekTo(d.seconds);
      else if (d.cmd === 'set_rate') window.setPlaybackRate(d.rate);
      else if (d.cmd === 'play') { if (video && video.paused) video.play().catch(() => {}); }
      else if (d.cmd === 'pause') { if (video && !video.paused) video.pause(); }
      else if (d.cmd === 'toggle_play') window.togglePlay();
      else if (d.cmd === 'toggle_mute') window.toggleMute();
      else if (d.cmd === 'volume_up') window.changeVolume(0.05);
      else if (d.cmd === 'volume_down') window.changeVolume(-0.05);
    });

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
  </script>
</body>
</html>`;

    // Direct video URLs (.mp4/.webm/.m4v, including signed query strings): avoid buffering huge binary video in RAM
    if (pathnameLower.endsWith('.mp4') || pathnameLower.endsWith('.webm') || pathnameLower.endsWith('.m4v')) {
      res.set({
        'Content-Type': 'text/html; charset=utf-8',
        'X-Frame-Options': 'ALLOWALL',
        'Access-Control-Allow-Origin': '*'
      });
      return res.send(buildDirectVideoHtml(targetUrl));
    }

    const headers = getHeaders(ref);
    if (!ref) {
      try {
        headers['Referer'] = `${parsedTarget.protocol}//${parsedTarget.host}/`;
      } catch (_) {}
    }

    const response = await httpClient.get(targetUrl, {
      headers,
      timeout: REQUEST_TIMEOUT_MS,
      responseType: 'text',
      maxContentLength: 5 * 1024 * 1024,
      beforeRedirect: assertSafeRedirect,
      httpAgent: proxyHttpAgent,
      httpsAgent: proxyHttpsAgent
    });

    const contentType = (response.headers['content-type'] || '').toLowerCase();

    // Direct video stream reported by Content-Type -> HTML5 player
    if (contentType.includes('video/')) {
      res.set({
        'Content-Type': 'text/html; charset=utf-8',
        'X-Frame-Options': 'ALLOWALL',
        'Access-Control-Allow-Origin': '*'
      });
      return res.send(buildDirectVideoHtml(targetUrl));
    }

    // Calculate base_href
    let baseHref = targetUrl;
    try {
      const u = new URL(targetUrl);
      const pathParts = u.pathname.split('/');
      pathParts.pop();
      baseHref = `${u.protocol}//${u.host}${pathParts.join('/')}/`;
    } catch (_) {}

    const rawBody = typeof response.data === 'string' ? response.data : JSON.stringify(response.data ?? '');
    const cleanHtml = sanitizePlayerHtml(rawBody, baseHref, adblock);

    res.set({
      'Content-Type': 'text/html; charset=utf-8',
      'X-Frame-Options': 'ALLOWALL',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
    });
    return res.status(response.status).send(cleanHtml);
  } catch (err) {
    return res.status(502).send(`
      <div style="font-family: sans-serif; background: #07090e; color: #f8fafc; padding: 30px; text-align: center; height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; box-sizing: border-box;">
        <div style="font-size: 2.5rem; margin-bottom: 12px;">⚠️</div>
        <h3 style="margin: 0 0 10px; font-size: 1.2rem; color: #ef4444;">No se pudo cargar el reproductor remoto</h3>
        <p style="margin: 0 0 18px; font-size: 0.9rem; color: #94a3b8; max-width: 480px;">${escapeAttr(err.message)}</p>
        <div>
          <a href="${escapeAttr(targetUrl)}" target="_blank" rel="noopener noreferrer" style="background: #ff6b00; color: #fff; text-decoration: none; padding: 10px 20px; border-radius: 8px; font-size: 0.9rem; font-weight: 600;">Abrir en pestaña externa</a>
        </div>
      </div>
    `);
  }
});

// Image Proxy
router.get('/image-proxy', (req, res) => {
  return handleImageProxy(req.query.url, req, res);
});

// ==============================================================================
// 6. MYANIMELIST LIBRARY PARSER
// ==============================================================================
router.post('/library/parse-mal', upload.single('file'), (req, res) => {
  try {
    let xmlContent = '';
    if (req.file && req.file.buffer) {
      xmlContent = decompressBufferIfNeeded(req.file.buffer, req.file.originalname);
    } else if (req.body && typeof req.body === 'string') {
      xmlContent = req.body;
    } else {
      return res.status(400).json({ detail: 'No se recibió ningún archivo o contenido XML' });
    }

    const data = parseMalXml(xmlContent);
    return res.json(data);
  } catch (err) {
    return res.status(400).json({ detail: `Error al procesar archivo MAL: ${err.message}` });
  }
});

router.get('/library/local-file', (req, res) => {
  try {
    const filePath = findLatestLocalMalFile();
    if (!filePath) {
      return res.status(404).json({ detail: 'No se encontró ningún archivo de MyAnimeList local' });
    }

    const fileBuffer = fs.readFileSync(filePath);
    const xmlContent = decompressBufferIfNeeded(fileBuffer, path.basename(filePath));
    const data = parseMalXml(xmlContent);
    data.localFilePath = filePath;
    return res.json(data);
  } catch (err) {
    return res.status(500).json({ detail: `Error leyendo archivo local: ${err.message}` });
  }
});

// ==============================================================================
// 7. CACHE & SYSTEM STATS
// ==============================================================================
router.get('/cache/stats', (req, res) => {
  return res.json(cache.getStats());
});

router.post('/cache/clear', (req, res) => {
  cache.clear();
  return res.json({ message: 'Caché en memoria limpiada exitosamente' });
});

router.get('/health', (req, res) => {
  return res.json({
    status: 'ok',
    runtime: 'Node.js ' + process.version,
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString()
  });
});

router.get('/network-info', (req, res) => {
  const os = require('os');
  const interfaces = os.networkInterfaces();
  const ips = [];
  const port = req.socket.localPort || process.env.PORT || 3000;

  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        ips.push({
          name: name,
          ip: iface.address,
          url: `http://${iface.address}:${port}`
        });
      }
    }
  }

  // Prioritize real LAN IP (192.168.x, 10.x, or 172.16-31.x) over VPNs like Radmin/Hamachi/VirtualBox
  let primaryLanIp = '127.0.0.1';
  const realLan = ips.find(i => 
    !i.name.toLowerCase().includes('virtual') &&
    !i.name.toLowerCase().includes('radmin') &&
    !i.name.toLowerCase().includes('hamachi') &&
    !i.name.toLowerCase().includes('vmware') &&
    !i.name.toLowerCase().includes('wsl') &&
    !i.ip.startsWith('192.168.56.') &&
    (i.ip.startsWith('192.168.') || i.ip.startsWith('10.') || i.ip.startsWith('172.'))
  );

  if (realLan) {
    primaryLanIp = realLan.ip;
  } else if (ips.length > 0) {
    primaryLanIp = ips[0].ip;
  }

  return res.json({
    status: 'ok',
    port: port,
    localUrl: `http://localhost:${port}`,
    lanIp: primaryLanIp,
    lanUrl: `http://${primaryLanIp}:${port}`,
    interfaces: ips,
    platform: process.platform,
    hostname: os.hostname(),
    nodeVersion: process.version,
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString()
  });
});

module.exports = router;
