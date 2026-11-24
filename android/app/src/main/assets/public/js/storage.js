/**
 * LocalStorage Persistence Manager
 * Manages watch history, favorites, seen episode markers, and resume points.
 */
import { resolveAnimeCover } from './utils.js?v=5.0';

const KEYS = {
  HISTORY: 'animestream_history',
  FAVORITES: 'animestream_favorites',
  SEEN: 'animestream_seen',
  LAST_PLAYED: 'animestream_last_played',
  LIBRARY: 'animestream_library',
  VOLUME: 'animestream_player_volume',
  PLAYBACK_POSITIONS: 'animestream_playback_positions',
  PLAYBACK_SPEED: 'animestream_playback_speed'
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

  // --- Playback Speed Persistence ---
  getPlaybackSpeed() {
    try {
      const v = localStorage.getItem(KEYS.PLAYBACK_SPEED);
      if (v !== null) {
        const num = parseFloat(v);
        if ([0.75, 1.0, 1.25, 1.5, 2.0].includes(num)) {
          return num;
        }
      }
      return 1.0;
    } catch (e) {
      return 1.0;
    }
  },

  setPlaybackSpeed(speed) {
    try {
      const num = parseFloat(speed);
      const valid = [0.75, 1.0, 1.25, 1.5, 2.0].includes(num) ? num : 1.0;
      localStorage.setItem(KEYS.PLAYBACK_SPEED, String(valid));
    } catch (e) {}
  },

  // --- Exact Playback Positions (Resume Playback) ---
  getPlaybackPositions() {
    try {
      const data = localStorage.getItem(KEYS.PLAYBACK_POSITIONS);
      return data ? JSON.parse(data) : {};
    } catch (e) {
      return {};
    }
  },

  getPlaybackPosition(url) {
    if (!url) return null;
    try {
      const map = this.getPlaybackPositions();
      const entry = map[url];
      if (!entry) return null;
      // If position is valid (at least 10s into episode, and not within last 15s of video)
      if (entry.currentTime >= 10 && (!entry.duration || entry.currentTime < entry.duration - 15)) {
        return entry;
      }
      return null;
    } catch (e) {
      return null;
    }
  },

  savePlaybackPosition(url, currentTime, duration = 0, animeTitle = '', episode = '') {
    if (!url || isNaN(currentTime) || !isFinite(currentTime) || currentTime < 5) return;
    try {
      const map = this.getPlaybackPositions();
      const existingEntry = map[url];
      const sec = Math.floor(currentTime);
      const passedDur = (isFinite(duration) && duration > 0) ? Math.floor(duration) : 0;
      const dur = passedDur > 0 ? passedDur : (existingEntry?.duration || 0);
      const progress = dur > 0 ? (sec / dur) : (existingEntry?.progress || 0);

      // If episode finished (within last 15s), clear resume position so it restarts from 0
      if (dur > 30 && sec >= dur - 15) {
        delete map[url];
        localStorage.setItem(KEYS.PLAYBACK_POSITIONS, JSON.stringify(map));
        this.updateHistoryProgress(url, sec, dur, 1.0);
        return;
      }

      map[url] = {
        url,
        currentTime: sec,
        duration: dur,
        progress: Math.min(1, Math.max(0, Math.round(progress * 100) / 100)),
        updatedAt: Date.now(),
        animeTitle: animeTitle || existingEntry?.animeTitle || '',
        episode: episode || existingEntry?.episode || ''
      };

      // Prune oldest if exceeds 200 items
      const keys = Object.keys(map);
      if (keys.length > 200) {
        const sorted = keys.sort((a, b) => (map[a].updatedAt || 0) - (map[b].updatedAt || 0));
        for (let i = 0; i < keys.length - 200; i++) {
          delete map[sorted[i]];
        }
      }

      localStorage.setItem(KEYS.PLAYBACK_POSITIONS, JSON.stringify(map));
      this.updateHistoryProgress(url, sec, dur, progress);
    } catch (e) {
      console.error('Storage savePlaybackPosition error:', e);
    }
  },

  clearPlaybackPosition(url) {
    if (!url) return;
    try {
      const map = this.getPlaybackPositions();
      if (map[url]) {
        delete map[url];
        localStorage.setItem(KEYS.PLAYBACK_POSITIONS, JSON.stringify(map));
      }
    } catch (e) {}
  },

  updateHistoryProgress(url, currentTime, duration = 0, progress = 0) {
    if (!url || !isFinite(currentTime)) return;
    try {
      let history = this.getHistory();
      const idx = history.findIndex(h => h.url === url);
      const sec = Math.max(0, Math.floor(currentTime));
      if (idx !== -1) {
        history[idx].currentTime = sec;
        if (isFinite(duration) && duration > 0) history[idx].duration = Math.floor(duration);
        const finalDur = history[idx].duration || 0;
        const rawProg = progress > 0 ? progress : (finalDur > 0 ? sec / finalDur : 0);
        history[idx].progress = Math.min(1, Math.max(0, Math.round(rawProg * 100) / 100));
        history[idx].watchedAt = Date.now();
        localStorage.setItem(KEYS.HISTORY, JSON.stringify(history));
      }
      const lastPlayed = this.getLastPlayed();
      if (lastPlayed && lastPlayed.url === url) {
        lastPlayed.currentTime = sec;
        if (isFinite(duration) && duration > 0) lastPlayed.duration = Math.floor(duration);
        const finalDur = lastPlayed.duration || 0;
        const rawProg = progress > 0 ? progress : (finalDur > 0 ? sec / finalDur : 0);
        lastPlayed.progress = Math.min(1, Math.max(0, Math.round(rawProg * 100) / 100));
        localStorage.setItem(KEYS.LAST_PLAYED, JSON.stringify(lastPlayed));
      }
    } catch (e) {}
  },

  // --- Watch History ---
  getHistory() {
    try {
      const data = localStorage.getItem(KEYS.HISTORY);
      if (!data) return [];
      const list = JSON.parse(data);
      if (!Array.isArray(list)) return [];
      // Auto-heal legacy entries missing images or holding provider logos
      return list
        .filter(item => item && typeof item === 'object' && Boolean(item.url || item.episodeUrl || item.animeUrl))
        .map(item => {
          if (!item.url && item.episodeUrl) item.url = item.episodeUrl;
          const lowerImg = (item.image || '').toLowerCase();
          if (!item.image || lowerImg.includes('placeholder.com') || lowerImg === 'undefined' ||
              lowerImg.includes('/assets/img/logo') || lowerImg.includes('/logo.png') ||
              lowerImg.includes('/logo-dark') || lowerImg.includes('/logo-light')) {
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
      const existing = history.find(h => h.url === item.url);
      const savedPos = this.getPlaybackPosition(item.url);

      // Remove existing entry for same episode url if exists
      history = history.filter(h => h.url !== item.url);
      
      const currentTime = item.currentTime !== undefined ? item.currentTime : (savedPos?.currentTime || existing?.currentTime || 0);
      const duration = item.duration !== undefined ? item.duration : (savedPos?.duration || existing?.duration || 0);
      const progress = item.progress !== undefined ? item.progress : (savedPos?.progress || existing?.progress || (duration > 0 ? currentTime / duration : 0));

      const newEntry = {
        animeTitle: item.animeTitle || item.title || 'Anime',
        episode: item.episode,
        url: item.url,
        animeUrl: item.animeUrl || '',
        image: resolveAnimeCover(item),
        source: item.source || 'Anime',
        watchedAt: Date.now(),
        currentTime: Math.floor(currentTime),
        duration: Math.floor(duration),
        progress: Math.min(1, Math.max(0, Math.round(progress * 100) / 100))
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

      this.clearPlaybackPosition(url);

      const lastPlayed = this.getLastPlayed();
      if (lastPlayed && lastPlayed.url === url) {
        localStorage.removeItem(KEYS.LAST_PLAYED);
      }
      return true;
    } catch (e) {
      return false;
    }
  },

  clearHistory() {
    try {
      localStorage.removeItem(KEYS.HISTORY);
      localStorage.removeItem(KEYS.LAST_PLAYED);
      localStorage.removeItem(KEYS.PLAYBACK_POSITIONS);
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
    if (!url) return false;
    const map = this.getSeenMap();
    return Boolean(map[url]);
  },

  markSeen(url, seen = true) {
    try {
      if (!url) return;
      const map = this.getSeenMap();
      if (seen) {
        map[url] = Date.now();
        // Prune if map exceeds 2000 entries to prevent localStorage quota exhaustion
        const keys = Object.keys(map);
        if (keys.length > 2000) {
          const sorted = keys.sort((a, b) => (map[b] || 0) - (map[a] || 0));
          const prunedMap = {};
          for (let i = 0; i < 1500; i++) {
            prunedMap[sorted[i]] = map[sorted[i]];
          }
          localStorage.setItem(KEYS.SEEN, JSON.stringify(prunedMap));
          return;
        }
      } else {
        delete map[url];
      }
      localStorage.setItem(KEYS.SEEN, JSON.stringify(map));
    } catch (e) {}
  },

  toggleSeen(url) {
    if (!url) return false;
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
      return Array.isArray(list) ? list.filter(item => item && typeof item === 'object' && item.url) : [];
    } catch (e) {
      return [];
    }
  },

  isFavorite(animeUrl) {
    const list = this.getFavorites();
    return list.some(item => item.url === animeUrl);
  },

  addFavorite(anime) {
    try {
      if (!anime || !anime.url) return false;
      let favorites = this.getFavorites();
      if (!favorites.some(f => f.url === anime.url)) {
        favorites.unshift({
          title: anime.title || 'Anime',
          url: anime.url,
          image: resolveAnimeCover(anime),
          source: anime.source || 'Anime',
          addedAt: Date.now()
        });
        localStorage.setItem(KEYS.FAVORITES, JSON.stringify(favorites));
      }
      return true;
    } catch (e) {
      console.error('Storage addFavorite error:', e);
      return false;
    }
  },

  removeFavorite(url) {
    try {
      if (!url) return false;
      let favorites = this.getFavorites();
      favorites = favorites.filter(f => f.url !== url);
      localStorage.setItem(KEYS.FAVORITES, JSON.stringify(favorites));
      return true;
    } catch (e) {
      console.error('Storage removeFavorite error:', e);
      return false;
    }
  },

  toggleFavorite(anime) {
    if (!anime || !anime.url) return false;
    try {
      let favorites = this.getFavorites();
      const exists = favorites.some(f => f.url === anime.url);

      if (exists) {
        favorites = favorites.filter(f => f.url !== anime.url);
      } else {
        favorites.unshift({
          title: anime.title || 'Anime',
          url: anime.url,
          image: resolveAnimeCover(anime),
          source: anime.source || 'Anime',
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
      return Array.isArray(list) ? list.filter(item => item && typeof item === 'object' && item.title) : [];
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
      if (!item || !item.title) return null;
      let list = this.getLibrary();
      const cleanTitle = (item.title || '').toLowerCase().trim();
      
      const existingIdx = list.findIndex(i => 
        (item.id && i.id && String(i.id) === String(item.id)) ||
        (i.title && i.title.toLowerCase().trim() === cleanTitle)
      );
      const existing = existingIdx >= 0 ? list[existingIdx] : null;

      const total = item.totalEpisodes !== undefined 
        ? Math.max(0, parseInt(item.totalEpisodes, 10) || 0)
        : (existing?.totalEpisodes || 0);

      let watched = item.watchedEpisodes !== undefined
        ? Math.max(0, parseInt(item.watchedEpisodes, 10) || 0)
        : (existing?.watchedEpisodes || 0);

      const targetStatus = item.status || existing?.status || 'plan_to_watch';

      // If marked as completed and total is known, auto-sync watched to total
      if (targetStatus === 'completed' && total > 0 && item.watchedEpisodes === undefined) {
        watched = total;
      }

      const STATUS_LABELS_DEFAULT = {
        watching: 'Viendo',
        completed: 'Visto',
        plan_to_watch: 'Pendiente',
        on_hold: 'Pausado',
        dropped: 'Abandonado'
      };

      const rawScore = item.score !== undefined ? (parseInt(item.score, 10) || 0) : (existing?.score || 0);
      const entry = {
        id: item.id || existing?.id || `local_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        title: item.title,
        type: item.type || existing?.type || 'TV',
        totalEpisodes: total,
        watchedEpisodes: total > 0 ? Math.min(total, watched) : watched,
        score: Math.min(10, Math.max(0, rawScore)),
        status: targetStatus,
        statusLabel: item.statusLabel || existing?.statusLabel || STATUS_LABELS_DEFAULT[targetStatus] || 'En lista',
        image: item.image || existing?.image || null,
        animeUrl: item.animeUrl || existing?.animeUrl || null,
        updatedAt: Date.now()
      };

      if (existingIdx >= 0) {
        list[existingIdx] = { ...existing, ...entry };
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
      const target = String(idOrTitle || '').toLowerCase().trim();
      list = list.filter(i =>
        String(i.id || '').toLowerCase().trim() !== target &&
        (i.title || '').toLowerCase().trim() !== target
      );
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
        const total = Math.max(0, parseInt(it.totalEpisodes, 10) || 0);
        const rawWatched = Math.max(0, parseInt(it.watchedEpisodes, 10) || 0);
        map.set(key, {
          id: it.id || existing.id || `mal_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          title: it.title,
          type: it.type || existing.type || 'TV',
          totalEpisodes: total,
          watchedEpisodes: total > 0 ? Math.min(total, rawWatched) : rawWatched,
          score: Math.min(10, Math.max(0, parseInt(it.score, 10) || 0)),
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
