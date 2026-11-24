/**
 * MyAnimeList XML Export Parser and Local File Finder for Node.js
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const zlib = require('zlib');
const { XMLParser } = require('fast-xml-parser');
const { fixEncoding } = require('../config');

const STATUS_MAPPING = {
  'Watching': ['watching', 'Viendo'],
  '1': ['watching', 'Viendo'],
  'Completed': ['completed', 'Visto'],
  '2': ['completed', 'Visto'],
  'On-Hold': ['on_hold', 'Pausado'],
  '3': ['on_hold', 'Pausado'],
  'Dropped': ['dropped', 'Abandonado'],
  '4': ['dropped', 'Abandonado'],
  'Plan to Watch': ['plan_to_watch', 'Pendiente'],
  '6': ['plan_to_watch', 'Pendiente']
};

function parseMalXml(xmlContent) {
  if (!xmlContent || typeof xmlContent !== 'string') {
    throw new Error('Contenido XML vacío o no válido');
  }

  const parser = new XMLParser({
    ignoreAttributes: false,
    parseTagValue: false,
    trimValues: true
  });
  const parsed = parser.parse(xmlContent);
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('No se pudo estructurar el contenido XML');
  }

  const myanimelist = parsed.myanimelist || parsed;
  const userName = (myanimelist.myinfo && myanimelist.myinfo.user_name) || 'Usuario';

  let rawAnimes = myanimelist.anime || [];
  if (!Array.isArray(rawAnimes)) {
    rawAnimes = [rawAnimes];
  }

  const animes = [];
  const stats = {
    watching: 0,
    completed: 0,
    on_hold: 0,
    dropped: 0,
    plan_to_watch: 0
  };

  for (const a of rawAnimes) {
    if (!a || typeof a !== 'object') continue;
    const rawTitleVal = (typeof a.series_title === 'string')
      ? a.series_title
      : (a.series_title !== undefined && a.series_title !== null && typeof a.series_title !== 'object' ? String(a.series_title) : '');
    const title = rawTitleVal.trim();
    if (!title) continue;

    const rawStatus = String(a.my_status || 'Plan to Watch').trim();
    const [statusKey, statusLabel] = STATUS_MAPPING[rawStatus] || ['plan_to_watch', 'Pendiente'];

    if (stats[statusKey] !== undefined) {
      stats[statusKey]++;
    }

    const totalEps = Math.max(0, parseInt(a.series_episodes, 10) || 0);
    const watchedEps = Math.max(0, parseInt(a.my_watched_episodes, 10) || 0);
    const score = Math.min(10, Math.max(0, parseInt(a.my_score, 10) || 0));
    const stype = (a.series_type || 'TV').trim();
    const aid = String(a.series_animedb_id || '').trim();

    animes.push({
      id: aid,
      title: fixEncoding(title),
      type: stype,
      totalEpisodes: totalEps,
      watchedEpisodes: watchedEps,
      score,
      status: statusKey,
      statusLabel,
      updatedAt: a.my_finish_date || a.my_start_date || null
    });
  }

  return {
    username: userName,
    total: animes.length,
    stats,
    animes
  };
}

function decompressBufferIfNeeded(buffer, filename = '') {
  if (!buffer) return '';
  if (!Buffer.isBuffer(buffer)) {
    return typeof buffer === 'string' ? buffer : String(buffer);
  }
  try {
    if (filename.toLowerCase().endsWith('.gz') || (buffer.length >= 2 && buffer[0] === 0x1f && buffer[1] === 0x8b)) {
      return zlib.gunzipSync(buffer).toString('utf-8');
    }
  } catch (_) {
    return buffer.toString('utf-8');
  }
  return buffer.toString('utf-8');
}

/**
 * Searches common folders for the most recent animelist*.xml / .xml.gz file
 */
function findLatestLocalMalFile() {
  const home = os.homedir();
  const searchDirs = [
    path.join(home, 'Downloads'),
    path.join(home, 'Descargas'),
    path.join(home, 'Desktop'),
    path.join(home, 'Escritorio'),
    path.join(home, 'Documents'),
    path.join(home, 'Documentos'),
    'D:\\Downloads',
    'D:\\Descargas',
    process.cwd()
  ];

  let candidateFiles = [];

  for (const dir of searchDirs) {
    try {
      if (fs.existsSync(dir)) {
        const files = fs.readdirSync(dir);
        for (const f of files) {
          const lower = f.toLowerCase();
          if (lower.startsWith('animelist') && (lower.endsWith('.xml') || lower.endsWith('.xml.gz'))) {
            const fullPath = path.join(dir, f);
            try {
              const stat = fs.statSync(fullPath);
              candidateFiles.push({ path: fullPath, mtime: stat.mtimeMs });
            } catch (_) {}
          }
        }
      }
    } catch (_) {}
  }

  if (candidateFiles.length === 0) return null;

  candidateFiles.sort((a, b) => b.mtime - a.mtime);
  return candidateFiles[0].path;
}

module.exports = {
  parseMalXml,
  decompressBufferIfNeeded,
  findLatestLocalMalFile
};
