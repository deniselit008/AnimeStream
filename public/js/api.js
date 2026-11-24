/**
 * API Client for Anime Aggregator Backend
 * Seamlessly switches between Node.js backend endpoints (PC/Web/TV) and
 * the native autonomous client scraper on Android mobile (100% standalone without PC).
 */
import { ClientScraper, fetchHtml } from './clientScraper.js?v=5.0';

const RELATION_MAP = {
  'sequel': 'Secuela',
  'prequel': 'Precuela',
  'side story': 'Historia paralela',
  'spin-off': 'Spin-off',
  'spin off': 'Spin-off',
  'alternative setting': 'Ambientación alternativa',
  'alternative version': 'Versión alternativa',
  'alternative': 'Versión alternativa',
  'summary': 'Resumen / Película',
  'parent story': 'Historia principal',
  'parent': 'Historia principal',
  'full story': 'Historia completa',
  'character': 'Especial de personaje',
  'other': 'Especial / Otro',
  'adaptation': 'Adaptación original'
};

export function isStandaloneMode() {
  if (typeof window === 'undefined') return false;
  // If user explicitly configured a remote/PC server URL, use that server
  const saved = localStorage.getItem('animestream_server_url') || 
                (window.AndroidBridge && typeof window.AndroidBridge.getServerUrl === 'function' && window.AndroidBridge.getServerUrl());
  if (saved && typeof saved === 'string' && saved.startsWith('http') && !saved.includes('appassets')) {
    return false;
  }
  // If running inside Android APK with native fetch bridge, run 100% autonomously on device
  if (window.AndroidBridge && typeof window.AndroidBridge.fetchUrl === 'function') {
    return true;
  }
  // If running inside local Android assets
  if (window.location.host.includes('appassets.androidplatform.net') || window.location.protocol === 'file:') {
    return true;
  }
  return false;
}

export function getApiBase() {
  if (typeof window !== 'undefined') {
    if (window.location.protocol.startsWith('http') && !window.location.host.includes('appassets.androidplatform.net')) {
      return '/api';
    }
    const saved = localStorage.getItem('animestream_server_url') || 
                  (window.AndroidBridge && typeof window.AndroidBridge.getServerUrl === 'function' && window.AndroidBridge.getServerUrl());
    if (saved && typeof saved === 'string' && saved.startsWith('http')) {
      return saved.replace(/\/+$/, '') + '/api';
    }
  }
  return '/api';
}

export const Api = {
  async getLatest(source = 'all') {
    if (isStandaloneMode()) {
      return ClientScraper.getLatest(source);
    }
    const res = await fetch(`${getApiBase()}/latest?source=${encodeURIComponent(source)}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Error al obtener los últimos episodios');
    }
    return res.json();
  },

  async search(query, source = 'all') {
    if (isStandaloneMode()) {
      const data = await ClientScraper.search(query, source);
      if (Array.isArray(data)) {
        return { query, results: data, errors: [] };
      }
      return data || { query, results: [], errors: [] };
    }
    const res = await fetch(`${getApiBase()}/search?q=${encodeURIComponent(query)}&source=${encodeURIComponent(source)}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Error en la búsqueda');
    }
    return res.json();
  },

  async getAnime(url) {
    if (isStandaloneMode()) {
      return ClientScraper.getAnime(url);
    }
    const res = await fetch(`${getApiBase()}/anime?url=${encodeURIComponent(url)}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'No se pudo cargar la información del anime');
    }
    return res.json();
  },

  async getRelations(title) {
    if (!title) return [];
    const cleanTitle = title
      .replace(/[\(\[\{](audio\s+latino|latino|castellano|español|sub\s*español|sub|dub|doblaje|uncensored|sin\s+censura)[^\)\]\}]*[\)\]\}]/gi, '')
      .replace(/\b(audio\s+latino|español\s+latino|en\s+emision|finalizado|hd|fhd)\b/gi, '')
      .replace(/\s+/g, ' ')
      .trim();

    // 1. If not standalone (PC/server mode), query backend relations endpoint first
    if (!isStandaloneMode()) {
      try {
        const res = await fetch(`${getApiBase()}/anime/relations?title=${encodeURIComponent(cleanTitle)}`);
        if (res.ok) {
          const list = await res.json();
          if (Array.isArray(list) && list.length > 0) return list;
        }
      } catch (_) {}
    }

    // Helper to query Jikan API with dual network strategy (Direct CORS fetch + AndroidBridge fallback)
    async function queryJikanApi(endpoint) {
      const jikanUrl = `https://api.jikan.moe/v4/${endpoint}`;
      // Direct browser fetch first (Jikan supports public CORS)
      try {
        const controller = new AbortController();
        const tid = setTimeout(() => controller.abort(), 7000);
        try {
          const res = await fetch(jikanUrl, {
            headers: { 'Accept': 'application/json' },
            signal: controller.signal
          });
          if (res.ok) {
            return await res.json();
          }
        } finally {
          clearTimeout(tid);
        }
      } catch (_) {}

      // Fallback via fetchHtml / AndroidBridge
      try {
        const raw = await fetchHtml(jikanUrl, { 'Accept': 'application/json' });
        if (raw && typeof raw === 'string' && raw.trim().startsWith('{')) {
          return JSON.parse(raw);
        }
        return typeof raw === 'object' ? raw : null;
      } catch (_) {}

      return null;
    }

    // Generate clean title variants if full title misses Jikan match
    const titleVariants = [cleanTitle];
    const baseTitle = cleanTitle
      .replace(/:\s*[^:]+$/, '')
      .replace(/\b(2nd|3rd|4th|final|next)\s+season\b/gi, '')
      .replace(/\b(temporada|parte|part|season)\s*\d+\b/gi, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (baseTitle && baseTitle.length >= 3 && baseTitle.toLowerCase() !== cleanTitle.toLowerCase()) {
      titleVariants.push(baseTitle);
    }

    // 2. Query AniList GraphQL (Fast, public CORS, 100% reliable on Android & PC)
    try {
      const aniQuery = `query ($search: String) {
        Media(search: $search, type: ANIME) {
          id
          title { romaji english userPreferred }
          relations {
            edges {
              relationType
              node {
                id
                title { romaji english userPreferred }
                type
                coverImage { extraLarge large medium }
                siteUrl
              }
            }
          }
        }
      }`;

      for (const variant of titleVariants) {
        try {
          const controller = new AbortController();
          const tid = setTimeout(() => controller.abort(), 6000);
          let aniRes;
          try {
            aniRes = await fetch('https://graphql.anilist.co', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
              },
              body: JSON.stringify({ query: aniQuery, variables: { search: variant } }),
              signal: controller.signal
            });
          } finally {
            clearTimeout(tid);
          }

          if (aniRes.ok) {
            const aniData = await aniRes.json();
            const edges = aniData?.data?.Media?.relations?.edges || [];
            if (edges.length > 0) {
              const rels = [];
              const seen = new Set();
              edges.forEach(edge => {
                const node = edge.node;
                if (!node || node.type !== 'ANIME') return;
                const rTitle = node.title?.romaji || node.title?.english || node.title?.userPreferred;
                if (!rTitle) return;
                const lower = rTitle.toLowerCase();
                if (seen.has(lower)) return;
                seen.add(lower);

                const rawRel = edge.relationType || 'OTHER';
                const normRel = rawRel.toLowerCase().replace(/_/g, ' ');
                const relLabel = RELATION_MAP[normRel] || rawRel;
                const cleanTerm = rTitle.replace(/\s*\(TV\)|\s*\(Movie\)|\s*\(OVA\)/gi, '').trim();

                rels.push({
                  title: rTitle,
                  relation: relLabel,
                  raw_relation: rawRel,
                  type: 'Anime',
                  mal_id: node.id,
                  mal_url: node.siteUrl || `https://anilist.co/anime/${node.id}`,
                  image: node.coverImage?.extraLarge || node.coverImage?.large || node.coverImage?.medium || null,
                  url: `#/search?q=${encodeURIComponent(cleanTerm)}`
                });
              });
              if (rels.length > 0) {
                return rels;
              }
            }
          }
        } catch (_) {}
      }
    } catch (e) {
      console.debug('[Api.getRelations] AniList error:', e);
    }

    // 3. Query Jikan API (Fallback)
    try {
      let malId = null;
      for (const variant of titleVariants) {
        const searchData = await queryJikanApi(`anime?q=${encodeURIComponent(variant)}&limit=1`);
        if (searchData?.data?.[0]?.mal_id) {
          malId = searchData.data[0].mal_id;
          break;
        }
      }

      if (malId) {
        const relData = await queryJikanApi(`anime/${malId}/relations`);
        const rels = [];
        const seen = new Set();
        (relData?.data || []).forEach(r => {
          const rawRel = r.relation || '';
          const normRel = rawRel.toLowerCase();
          const relLabel = RELATION_MAP[normRel] || rawRel;

          (r.entry || []).forEach(e => {
            if (e.type === 'anime' && e.name) {
              const lowerName = e.name.toLowerCase();
              if (seen.has(lowerName)) return;
              seen.add(lowerName);

              const cleanTerm = e.name.replace(/\s*\(TV\)|\s*\(Movie\)|\s*\(OVA\)/gi, '').trim();
              rels.push({
                title: e.name,
                relation: relLabel,
                raw_relation: rawRel,
                type: 'Anime',
                mal_id: e.mal_id || null,
                mal_url: e.url || (e.mal_id ? `https://myanimelist.net/anime/${e.mal_id}` : null),
                image: null,
                url: `#/search?q=${encodeURIComponent(cleanTerm)}`
              });
            }
          });
        });
        if (rels.length > 0) {
          return rels;
        }
      }
    } catch (e) {
      console.debug('[Api.getRelations] Jikan relations error:', e.message || e);
    }

    // 3. Fallback: Direct MyAnimeList HTML scraping via AndroidBridge (if Jikan was rate-limited/429)
    try {
      const malSearchHtml = await fetchHtml(`https://myanimelist.net/anime.php?q=${encodeURIComponent(cleanTitle)}&cat=anime`);
      if (malSearchHtml && typeof malSearchHtml === 'string') {
        const doc = new DOMParser().parseFromString(malSearchHtml, 'text/html');
        const firstLink = doc.querySelector('a[href*="/anime/"]');
        const href = firstLink?.getAttribute('href') || '';
        const mId = href.match(/myanimelist\.net\/anime\/(\d+)/);
        if (mId) {
          const pageHtml = await fetchHtml(`https://myanimelist.net/anime/${mId[1]}`);
          const pageDoc = new DOMParser().parseFromString(pageHtml, 'text/html');
          const rels = [];
          const seen = new Set();

          // Tile layout (.related-entries .entry)
          pageDoc.querySelectorAll('.related-entries .entry, table.anime_detail_related_anime tr').forEach(row => {
            let rawRel = '';
            const relEl = row.querySelector('.relation, td:first-child');
            if (relEl) rawRel = relEl.textContent.replace(/:/g, '').trim();
            const normRel = rawRel.toLowerCase();
            if (!rawRel) return;
            const relLabel = RELATION_MAP[normRel] || rawRel;

            row.querySelectorAll('a[href*="/anime/"]').forEach(a => {
              const aHref = a.getAttribute('href') || '';
              const titleText = a.textContent.trim();
              if (!titleText || !aHref.includes('/anime/')) return;
              const lowerName = titleText.toLowerCase();
              if (seen.has(lowerName)) return;
              seen.add(lowerName);

              const imgEl = row.querySelector('img');
              let imgSrc = imgEl ? (imgEl.getAttribute('data-src') || imgEl.getAttribute('src')) : null;
              if (imgSrc) {
                imgSrc = imgSrc.replace(/\/r\/\d+x\d+\//, '/').split('?')[0];
              }
              const fullMalUrl = aHref.startsWith('http') ? aHref : `https://myanimelist.net${aHref}`;
              const cleanTerm = titleText.replace(/\s*\(TV\)|\s*\(Movie\)|\s*\(OVA\)/gi, '').trim();

              rels.push({
                title: titleText,
                relation: relLabel,
                raw_relation: rawRel,
                type: 'Anime',
                mal_id: null,
                mal_url: fullMalUrl,
                image: imgSrc || null,
                url: `#/search?q=${encodeURIComponent(cleanTerm)}`
              });
            });
          });

          if (rels.length > 0) return rels;
        }
      }
    } catch (e) {
      console.debug('[Api.getRelations] Direct MAL HTML fallback error:', e.message || e);
    }

    return [];
  },

  async getWatch(url) {
    if (isStandaloneMode()) {
      return ClientScraper.getWatch(url);
    }
    const res = await fetch(`${getApiBase()}/watch?url=${encodeURIComponent(url)}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'No se pudo cargar la sala de reproducción');
    }
    return res.json();
  },

  async getDirectory(params = {}) {
    if (isStandaloneMode()) {
      return ClientScraper.getDirectory(params);
    }
    const query = new URLSearchParams();
    if (params.genre && params.genre !== 'all') {
      const gVal = Array.isArray(params.genre)
        ? params.genre.filter(g => g && g !== 'all').join(',')
        : String(params.genre).trim();
      if (gVal && gVal !== 'all') query.set('genre', gVal);
    }
    if (params.type && params.type !== 'all') query.set('type', params.type);
    if (params.year && params.year !== 'all') query.set('year', params.year);
    if (params.status && params.status !== 'all') query.set('status', params.status);
    if (params.source && params.source !== 'all') query.set('source', params.source);
    if (params.page && params.page > 1) query.set('page', params.page);

    const qs = query.toString();
    const url = qs ? `${getApiBase()}/directory?${qs}` : `${getApiBase()}/directory`;
    const res = await fetch(url);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Error al obtener el catálogo del directorio');
    }
    return res.json();
  },

  async parseMalUpload(file) {
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch(`${getApiBase()}/library/parse-mal`, {
      method: 'POST',
      body: formData
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Error al procesar el archivo de MyAnimeList');
    }
    return res.json();
  },

  async detectLocalMalFile() {
    try {
      const res = await fetch(`${getApiBase()}/library/local-file`);
      if (!res.ok) return { found: false };
      return res.json();
    } catch (e) {
      return { found: false };
    }
  }
};
