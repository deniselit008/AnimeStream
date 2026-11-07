/**
 * API Client for Anime Aggregator Backend
 * Seamlessly switches between Node.js backend endpoints (PC/Web/TV) and
 * the native autonomous client scraper on Android mobile (100% standalone without PC).
 */
import { ClientScraper, fetchHtml } from './clientScraper.js?v=4.0';

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

    // 2. Query Jikan API (using fetchHtml to bypass Android CORS via AndroidBridge)
    try {
      const searchRaw = await fetchHtml(`https://api.jikan.moe/v4/anime?q=${encodeURIComponent(cleanTitle)}&limit=1`);
      const searchData = typeof searchRaw === 'string' ? JSON.parse(searchRaw) : searchRaw;
      const malId = searchData?.data?.[0]?.mal_id;
      if (malId) {
        const relRaw = await fetchHtml(`https://api.jikan.moe/v4/anime/${malId}/relations`);
        const relData = typeof relRaw === 'string' ? JSON.parse(relRaw) : relRaw;
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
      console.debug('[Api.getRelations] Fallback relations error:', e.message || e);
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
