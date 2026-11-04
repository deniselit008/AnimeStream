/**
 * API Client for Anime Aggregator Backend
 * Seamlessly switches between Node.js backend endpoints (PC/Web/TV) and
 * the native autonomous client scraper on Android mobile (100% standalone without PC).
 */
import { ClientScraper } from './clientScraper.js?v=4.0';

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
      return ClientScraper.search(query, source);
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
    try {
      const res = await fetch(`https://api.jikan.moe/v4/anime?q=${encodeURIComponent(title)}&limit=1`);
      if (res.ok) {
        const data = await res.json();
        const malId = data.data?.[0]?.mal_id;
        if (malId) {
          const relRes = await fetch(`https://api.jikan.moe/v4/anime/${malId}/relations`);
          if (relRes.ok) {
            const relData = await relRes.json();
            const rels = [];
            (relData.data || []).forEach(r => {
              (r.entry || []).forEach(e => {
                if (e.type === 'anime') {
                  rels.push({
                    title: e.name,
                    relation: r.relation,
                    url: `#/search?q=${encodeURIComponent(e.name)}`
                  });
                }
              });
            });
            return rels;
          }
        }
      }
    } catch (_) {}

    // Fallback to PC API if available
    try {
      const res = await fetch(`${getApiBase()}/anime/relations?title=${encodeURIComponent(title)}`);
      if (res.ok) return res.json();
    } catch (_) {}
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
