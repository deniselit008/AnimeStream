/**
 * MyAnimeList Franchise & Relations Extractor for Node.js
 * Scrapes official MAL entries and franchise relations with high-definition posters.
 * Strictly excludes non-audiovisual media (manga, light novels, etc.).
 */
const cheerio = require('cheerio');
const { httpClient, getHeaders, fixEncoding } = require('../config');
const { cache } = require('../cache');

const RELATION_MAP = {
  'sequel': 'Secuela',
  'prequel': 'Precuela',
  'side story': 'Historia paralela',
  'spin-off': 'Spin-off',
  'spin off': 'Spin-off',
  'alternative setting': 'Ambientación alternativa',
  'alternative version': 'Versión alternativa',
  'summary': 'Resumen / Película',
  'parent story': 'Historia principal',
  'full story': 'Historia completa',
  'character': 'Especial de personaje',
  'other': 'Especial / Otro'
};

const TYPE_MAP = {
  'tv': 'TV',
  'movie': 'Película',
  'ova': 'OVA',
  'ona': 'ONA',
  'special': 'Especial',
  'tv special': 'Especial TV',
  'music': 'Musical',
  'cm': 'Comercial / Corto'
};

const PRIORITY_ORDER = {
  'sequel': 1,
  'prequel': 2,
  'parent story': 3,
  'summary': 4,
  'side story': 5,
  'spin-off': 6,
  'spin off': 6,
  'alternative setting': 7,
  'alternative version': 7,
  'character': 8,
  'other': 9
};

const PHYSICAL_MEDIA_KEYWORDS = new Set([
  'manga', 'light novel', 'novel', 'one-shot', 'oneshot',
  'doujinshi', 'manhwa', 'manhua', 'book', 'comic'
]);

function cleanTitleForMal(title) {
  if (!title) return '';
  let t = title.replace(/[\(\[\{](audio\s+latino|latino|castellano|español|sub\s*español|sub|dub|doblaje|uncensored|sin\s+censura)[^\)\]\}]*[\)\]\}]/gi, '');
  t = t.replace(/\b(audio\s+latino|español\s+latino|en\s+emision|finalizado|hd|fhd)\b/gi, '');
  return t.replace(/\s+/g, ' ').trim();
}

function makeHighResMalImage(url) {
  if (!url || typeof url !== 'string') return null;
  const clean = url.trim();
  if (!clean || clean.includes('spacer.gif') || clean.includes('questionmark')) {
    return null;
  }
  let hd = clean.replace(/\/r\/\d+x\d+\//, '/');
  hd = hd.split('?')[0];
  return hd;
}

function isStrictlyAudiovisual(itemUrl, rawRelation, mediaType) {
  const urlLower = (itemUrl || '').toLowerCase();
  if (urlLower.includes('/manga/')) return false;

  const relLower = (rawRelation || '').toLowerCase();
  const typeLower = (mediaType || '').toLowerCase();

  for (const kw of PHYSICAL_MEDIA_KEYWORDS) {
    if (typeLower.includes(kw) || relLower.includes(kw)) return false;
  }

  if (relLower === 'adaptation') return false;
  if (urlLower.includes('/anime/')) return true;

  const validAudiovisual = ['tv', 'movie', 'película', 'ova', 'ona', 'special', 'especial', 'music', 'musical', 'cm'];
  if (validAudiovisual.includes(typeLower)) return true;

  return false;
}

async function fetchPosterMeta(title) {
  try {
    const url = `https://myanimelist.net/search/prefix.json?type=anime&keyword=${encodeURIComponent(title)}&v=1`;
    const res = await httpClient.get(url, { headers: getHeaders('https://myanimelist.net'), timeout: 4000 });
    const cats = res.data?.categories || [];
    const items = cats.length > 0 ? (cats[0].items || []) : [];
    if (items.length > 0) {
      const best = items[0];
      const img = makeHighResMalImage(best.image_url);
      const mtype = best.payload?.media_type;
      return { title, image: img, type: mtype };
    }
  } catch (_) {}
  return { title, image: null, type: null };
}

async function fetchMalRelations(title) {
  const cleanTitle = cleanTitleForMal(title);
  if (!cleanTitle) return [];

  const cacheKey = `mal_rel_av_v2_${cleanTitle.toLowerCase()}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const relations = [];
  const seenTitles = new Set();

  try {
    const searchUrl = `https://myanimelist.net/search/prefix.json?type=anime&keyword=${encodeURIComponent(cleanTitle)}&v=1`;
    let res = await httpClient.get(searchUrl, { headers: getHeaders('https://myanimelist.net'), timeout: 6000 });
    let cats = res.data?.categories || [];
    let items = cats.length > 0 ? (cats[0].items || []) : [];

    // Fallback search with first two words if title had long subtitle
    if (items.length === 0) {
      const words = cleanTitle.split(/\s+/);
      if (words.length > 2) {
        const shortTitle = words.slice(0, 2).join(' ');
        const r2 = await httpClient.get(`https://myanimelist.net/search/prefix.json?type=anime&keyword=${encodeURIComponent(shortTitle)}&v=1`, {
          headers: getHeaders('https://myanimelist.net'),
          timeout: 6000
        });
        cats = r2.data?.categories || [];
        items = cats.length > 0 ? (cats[0].items || []) : [];
      }
    }

    if (items.length === 0) {
      cache.set(cacheKey, [], 60 * 60 * 1000);
      return [];
    }

    const best = items[0];
    const malUrl = best.url;
    if (!malUrl) {
      cache.set(cacheKey, [], 60 * 60 * 1000);
      return [];
    }

    const pageRes = await httpClient.get(malUrl, { headers: getHeaders('https://myanimelist.net'), timeout: 8000 });
    const $ = cheerio.load(pageRes.data);
    const relatedDiv = $('div.related-entries');
    if (relatedDiv.length === 0) {
      cache.set(cacheKey, [], 60 * 60 * 1000);
      return [];
    }

    // 1. Prominent visual entry tiles
    relatedDiv.find('div.entry').each((_, el) => {
      const content = $(el).find('div.content');
      if (content.length === 0) return;

      const aTag = content.find('div.title a').first();
      if (aTag.length === 0) return;

      const itemTitle = aTag.text().trim();
      const itemUrl = aTag.attr('href') || '';

      const relEl = content.find('div.relation');
      let rawRelation = 'Other';
      let mediaType = null;
      if (relEl.length > 0) {
        const lines = relEl.text().split('\n').map(l => l.trim()).filter(Boolean);
        if (lines.length > 0) rawRelation = lines[0];
        if (lines.length > 1) mediaType = lines[1].replace(/[()]/g, '');
      }

      if (!isStrictlyAudiovisual(itemUrl, rawRelation, mediaType)) return;

      const imgEl = $(el).find('img').first();
      const imgSrc = imgEl.attr('data-src') || imgEl.attr('src') || '';
      const hdImage = makeHighResMalImage(imgSrc);

      const idMatch = itemUrl.match(/\/(anime|manga)\/(\d+)/);
      const malId = idMatch ? parseInt(idMatch[2], 10) : null;

      const normRel = rawRelation.toLowerCase();
      const relLabel = RELATION_MAP[normRel] || rawRelation;
      const typeLabel = TYPE_MAP[(mediaType || '').toLowerCase()] || mediaType;

      if (itemTitle && !seenTitles.has(itemTitle.toLowerCase())) {
        seenTitles.add(itemTitle.toLowerCase());
        relations.push({
          title: itemTitle,
          relation: relLabel,
          raw_relation: rawRelation,
          type: typeLabel || mediaType,
          image: hdImage,
          mal_id: malId,
          mal_url: itemUrl
        });
      }
    });

    // 2. Secondary relation tables (Side stories, Spin-offs, etc.)
    relatedDiv.find('tr').each((_, tr) => {
      const tds = $(tr).find('td');
      if (tds.length < 2) return;

      const rawRel = $(tds[0]).text().trim().replace(/:$/, '');
      const normRel = rawRel.toLowerCase();
      const relLabel = RELATION_MAP[normRel] || rawRel;

      $(tds[1]).find('a').each((_, a) => {
        const href = $(a).attr('href') || '';
        const itemTitle = $(a).text().trim();
        if (!itemTitle || seenTitles.has(itemTitle.toLowerCase())) return;

        if (!isStrictlyAudiovisual(href, rawRel, null)) return;

        seenTitles.add(itemTitle.toLowerCase());
        const idMatch = href.match(/\/anime\/(\d+)/);
        const malId = idMatch ? parseInt(idMatch[1], 10) : null;

        relations.push({
          title: itemTitle,
          relation: relLabel,
          raw_relation: rawRel,
          type: null,
          image: null,
          mal_id: malId,
          mal_url: href
        });
      });
    });

    // 3. Concurrently fetch high-definition posters for items missing image
    const needingMeta = relations.filter(r => !r.image || !r.type);
    if (needingMeta.length > 0) {
      const metaPromises = needingMeta.slice(0, 8).map(r => fetchPosterMeta(r.title));
      const resolved = await Promise.allSettled(metaPromises);
      for (const res of resolved) {
        if (res.status === 'fulfilled' && res.value?.title) {
          const match = relations.find(r => r.title === res.value.title);
          if (match) {
            if (!match.image && res.value.image) match.image = res.value.image;
            if (!match.type && res.value.type) {
              match.type = TYPE_MAP[res.value.type.toLowerCase()] || res.value.type;
            }
          }
        }
      }
    }

    // Sort relations by franchise priority
    relations.sort((a, b) => {
      const pA = PRIORITY_ORDER[(a.raw_relation || '').toLowerCase()] || 99;
      const pB = PRIORITY_ORDER[(b.raw_relation || '').toLowerCase()] || 99;
      return pA - pB;
    });

    cache.set(cacheKey, relations, 24 * 60 * 60 * 1000);
    return relations;
  } catch (err) {
    console.error('Error fetching MAL relations:', err.message);
    return [];
  }
}

module.exports = {
  cleanTitleForMal,
  makeHighResMalImage,
  fetchMalRelations
};
