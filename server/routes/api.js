/**
 * Unified REST API Router for AnimeStream Node.js
 */
const express = require('express');
const multer = require('multer');
const fs = require('fs');
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
  handleImageProxy
} = require('../services/streamProxy');
const { sanitizePlayerHtml } = require('../services/playerSanitizer');
const {
  parseMalXml,
  decompressBufferIfNeeded,
  findLatestLocalMalFile
} = require('../services/malXmlParser');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

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

  if (targetUrl.startsWith('/')) {
    return res.redirect(307, targetUrl);
  }

  if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
    targetUrl = 'https://' + targetUrl;
  }

  try {
    const headers = getHeaders(ref);
    if (!ref) {
      try {
        const parsed = new URL(targetUrl);
        headers['Referer'] = `${parsed.protocol}//${parsed.host}/`;
      } catch (_) {}
    }

    const response = await httpClient.get(targetUrl, {
      headers,
      timeout: REQUEST_TIMEOUT_MS,
      responseType: 'text'
    });

    const contentType = (response.headers['content-type'] || '').toLowerCase();

    // Direct video stream (.mp4, video/*) -> HTML5 player
    if (contentType.includes('video/') || targetUrl.toLowerCase().endsWith('.mp4') || targetUrl.toLowerCase().endsWith('.webm')) {
      const videoHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Reproductor AnimeStream</title>
  <style>
    html, body { margin:0; padding:0; width:100%; height:100%; background:#000; overflow:hidden; display:flex; align-items:center; justify-content:center; }
    video { width:100%; height:100%; object-fit:contain; }
  </style>
</head>
<body>
  <video src="${targetUrl}" controls autoplay playsinline></video>
</body>
</html>`;
      res.set({
        'Content-Type': 'text/html; charset=utf-8',
        'X-Frame-Options': 'ALLOWALL',
        'Access-Control-Allow-Origin': '*'
      });
      return res.send(videoHtml);
    }

    // Calculate base_href
    let baseHref = targetUrl;
    try {
      const u = new URL(targetUrl);
      const pathParts = u.pathname.split('/');
      pathParts.pop();
      baseHref = `${u.protocol}//${u.host}${pathParts.join('/')}/`;
    } catch (_) {}

    const cleanHtml = sanitizePlayerHtml(response.data, baseHref, adblock);

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
        <p style="margin: 0 0 18px; font-size: 0.9rem; color: #94a3b8; max-width: 480px;">${err.message}</p>
        <div>
          <a href="${targetUrl}" target="_blank" rel="noopener noreferrer" style="background: #ff6b00; color: #fff; text-decoration: none; padding: 10px 20px; border-radius: 8px; font-size: 0.9rem; font-weight: 600;">Abrir en pestaña externa</a>
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

module.exports = router;
