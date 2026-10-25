/**
 * LocalStorage Persistence Manager
 * Manages watch history, favorites, seen episode markers, and resume points.
 */
import { resolveAnimeCover } from './utils.js';

const KEYS = {
  HISTORY: 'animestream_history',
  FAVORITES: 'animestream_favorites',
  SEEN: 'animestream_seen',
  LAST_PLAYED: 'animestream_last_played',
  LIBRARY: 'animestream_library',
  VOLUME: 'animestream_player_volume'
};

export const Storage = {
  // --- Volume Persistence ---
  getPlayerVolume() {
    try {
      const v = localStorage.getItem(KEYS.VOLUME);
      if (v !== null && !isNaN(Number(v))) {
        return Math.max(0, Math.min(1, parseFloat(v)));
      }
      return 1.0;
    } catch (e) {
      return 1.0;
    }
  },

  setPlayerVolume(vol) {
    try {
      const clamped = Math.max(0, Math.min(1, Math.round(vol * 100) / 100));
      localStorage.setItem(KEYS.VOLUME, String(clamped));
    } catch (e) {}
  },

  // --- Watch History ---
  getHistory() {
    try {
      const data = localStorage.getItem(KEYS.HISTORY);
      if (!data) return [];
      const list = JSON.parse(data);
      if (!Array.isArray(list)) return [];
      // Auto-heal legacy entries missing images
      return list.map(item => {
        if (!item.image || item.image.includes('placeholder.com') || item.image === 'undefined') {
          item.image = resolveAnimeCover(item);
        }
        return item;
      });
    } catch (e) {
      console.error('Storage getHistory error:', e);
      return [];
    }
  },

  saveToHistory(item) {
    try {
      let history = this.getHistory();
      // Remove existing entry for same episode url if exists
      history = history.filter(h => h.url !== item.url);
      
      const newEntry = {
        animeTitle: item.animeTitle || item.title || 'Anime',
        episode: item.episode,
        url: item.url,
        animeUrl: item.animeUrl || '',
        image: resolveAnimeCover(item),
        source: item.source || 'Anime',
        watchedAt: Date.now()
      };

      // Put latest first, limit to 50 items
      history.unshift(newEntry);
      if (history.length > 50) history = history.slice(0, 50);

      localStorage.setItem(KEYS.HISTORY, JSON.stringify(history));
      localStorage.setItem(KEYS.LAST_PLAYED, JSON.stringify(newEntry));

      // Mark episode as seen automatically
      this.markSeen(item.url, true);
      return true;
    } catch (e) {
      console.error('Storage saveToHistory error:', e);
      return false;
    }
  },

  removeFromHistory(url) {
    try {
      let history = this.getHistory();
      history = history.filter(h => h.url !== url);
      localStorage.setItem(KEYS.HISTORY, JSON.stringify(history));
      return true;
    } catch (e) {
      return false;
    }
  },

  clearHistory() {
    try {
      localStorage.removeItem(KEYS.HISTORY);
      localStorage.removeItem(KEYS.LAST_PLAYED);
      return true;
    } catch (e) {
      return false;
    }
  },

  getLastPlayed() {
    try {
      const data = localStorage.getItem(KEYS.LAST_PLAYED);
      return data ? JSON.parse(data) : null;
    } catch (e) {
      return null;
    }
  },

  // --- Seen Episodes ---
  getSeenMap() {
    try {
      const data = localStorage.getItem(KEYS.SEEN);
      return data ? JSON.parse(data) : {};
    } catch (e) {
      return {};
    }
  },

  isSeen(url) {
    const map = this.getSeenMap();
    return Boolean(map[url]);
  },

  markSeen(url, seen = true) {
    try {
      const map = this.getSeenMap();
      if (seen) {
        map[url] = Date.now();
      } else {
        delete map[url];
      }
      localStorage.setItem(KEYS.SEEN, JSON.stringify(map));
    } catch (e) {}
  },

  toggleSeen(url) {
    const current = this.isSeen(url);
    this.markSeen(url, !current);
    return !current;
  },

  // --- Favorites ---
  getFavorites() {
    try {
      const data = localStorage.getItem(KEYS.FAVORITES);
      if (!data) return [];
      const list = JSON.parse(data);
      return Array.isArray(list) ? list : [];
    } catch (e) {
      return [];
    }
  },

  isFavorite(animeUrl) {
    const list = this.getFavorites();
    return list.some(item => item.url === animeUrl);
  },

  toggleFavorite(anime) {
    try {
      let favorites = this.getFavorites();
      const exists = favorites.some(f => f.url === anime.url);

      if (exists) {
        favorites = favorites.filter(f => f.url !== anime.url);
      } else {
        favorites.unshift({
          title: anime.title,
          url: anime.url,
          image: anime.image,
          source: anime.source,
          addedAt: Date.now()
        });
      }

      localStorage.setItem(KEYS.FAVORITES, JSON.stringify(favorites));
      return !exists;
    } catch (e) {
      console.error('Storage toggleFavorite error:', e);
      return false;
    }
  },

  // --- Anime Library / Tracking ---
  getLibrary() {
    try {
      const data = localStorage.getItem(KEYS.LIBRARY);
      if (!data) return [];
      const list = JSON.parse(data);
      return Array.isArray(list) ? list : [];
    } catch (e) {
      console.error('Storage getLibrary error:', e);
      return [];
    }
  },

  getLibraryStats() {
    const list = this.getLibrary();
    const stats = {
      total: list.length,
      watching: 0,
      completed: 0,
      on_hold: 0,
      dropped: 0,
      plan_to_watch: 0
    };
    list.forEach(item => {
      if (stats[item.status] !== undefined) {
        stats[item.status]++;
      }
    });
    return stats;
  },

  getLibraryItem(title) {
    if (!title) return null;
    const clean = title.toLowerCase().trim();
    const list = this.getLibrary();
    return list.find(item => item.title && item.title.toLowerCase().trim() === clean) || null;
  },

  saveLibraryItem(item) {
    try {
      let list = this.getLibrary();
      const cleanTitle = (item.title || '').toLowerCase().trim();
      
      const existingIdx = list.findIndex(i => 
        (item.id && i.id && String(i.id) === String(item.id)) ||
        (i.title && i.title.toLowerCase().trim() === cleanTitle)
      );

      const entry = {
        id: item.id || `local_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        title: item.title,
        type: item.type || 'TV',
        totalEpisodes: parseInt(item.totalEpisodes, 10) || 0,
        watchedEpisodes: parseInt(item.watchedEpisodes, 10) || 0,
        score: parseInt(item.score, 10) || 0,
        status: item.status || 'plan_to_watch',
        statusLabel: item.statusLabel || 'Pendiente',
        image: item.image || null,
        animeUrl: item.animeUrl || null,
        updatedAt: Date.now()
      };

      if (existingIdx >= 0) {
        list[existingIdx] = { ...list[existingIdx], ...entry };
      } else {
        list.unshift(entry);
      }

      localStorage.setItem(KEYS.LIBRARY, JSON.stringify(list));
      return entry;
    } catch (e) {
      console.error('Storage saveLibraryItem error:', e);
      return null;
    }
  },

  removeLibraryItem(idOrTitle) {
    try {
      let list = this.getLibrary();
      const target = String(idOrTitle).toLowerCase().trim();
      list = list.filter(i => String(i.id) !== target && i.title.toLowerCase().trim() !== target);
      localStorage.setItem(KEYS.LIBRARY, JSON.stringify(list));
      return true;
    } catch (e) {
      return false;
    }
  },

  importLibrary(items, mode = 'replace') {
    try {
      if (!Array.isArray(items)) return 0;

      let current = mode === 'replace' ? [] : this.getLibrary();
      const map = new Map();

      // If merging, index existing
      if (mode === 'merge') {
        current.forEach(it => {
          const key = it.title ? it.title.toLowerCase().trim() : String(it.id);
          map.set(key, it);
        });
      }

      // Add new items
      items.forEach(it => {
        const key = it.title ? it.title.toLowerCase().trim() : String(it.id);
        const existing = map.get(key) || {};
        map.set(key, {
          id: it.id || existing.id || `mal_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          title: it.title,
          type: it.type || existing.type || 'TV',
          totalEpisodes: parseInt(it.totalEpisodes, 10) || 0,
          watchedEpisodes: parseInt(it.watchedEpisodes, 10) || 0,
          score: parseInt(it.score, 10) || 0,
          status: it.status || 'plan_to_watch',
          statusLabel: it.statusLabel || 'Pendiente',
          image: it.image || existing.image || null,
          animeUrl: it.animeUrl || existing.animeUrl || null,
          updatedAt: it.updatedAt || Date.now()
        });
      });

      const result = Array.from(map.values());
      localStorage.setItem(KEYS.LIBRARY, JSON.stringify(result));
      return result.length;
    } catch (e) {
      console.error('Storage importLibrary error:', e);
      return 0;
    }
  },

  clearLibrary() {
    try {
      localStorage.removeItem(KEYS.LIBRARY);
      return true;
    } catch (e) {
      return false;
    }
  }
};
