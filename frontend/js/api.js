/**
 * API Client for Anime Aggregator Backend
 */

const API_BASE = '/api';

export const Api = {
  async getLatest(source = 'all') {
    const res = await fetch(`${API_BASE}/latest?source=${encodeURIComponent(source)}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Error al obtener los últimos episodios');
    }
    return res.json();
  },

  async search(query, source = 'all') {
    const res = await fetch(`${API_BASE}/search?q=${encodeURIComponent(query)}&source=${encodeURIComponent(source)}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Error en la búsqueda');
    }
    return res.json();
  },

  async getAnime(url) {
    const res = await fetch(`${API_BASE}/anime?url=${encodeURIComponent(url)}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'No se pudo cargar la información del anime');
    }
    return res.json();
  },

  async getRelations(title) {
    const res = await fetch(`${API_BASE}/anime/relations?title=${encodeURIComponent(title)}`);
    if (!res.ok) {
      return [];
    }
    return res.json();
  },

  async getWatch(url) {
    const res = await fetch(`${API_BASE}/watch?url=${encodeURIComponent(url)}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'No se pudo cargar la sala de reproducción');
    }
    return res.json();
  },

  async getDirectory(params = {}) {
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
    const url = qs ? `${API_BASE}/directory?${qs}` : `${API_BASE}/directory`;
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
    const res = await fetch(`${API_BASE}/library/parse-mal`, {
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
      const res = await fetch(`${API_BASE}/library/local-file`);
      if (!res.ok) return { found: false };
      return res.json();
    } catch (e) {
      return { found: false };
    }
  }
};
