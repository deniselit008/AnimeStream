/**
 * High-Performance In-Memory Cache with TTL and Hit/Miss Statistics
 */
const { CACHE_TTL_MS } = require('./config');

class MemoryCache {
  constructor(maxSize = 1000) {
    this.store = new Map();
    this.maxSize = maxSize;
    this.hits = 0;
    this.misses = 0;

    // Periodically clean up expired entries every 5 minutes
    setInterval(() => this.purgeExpired(), 5 * 60 * 1000).unref();
  }

  get(key) {
    const item = this.store.get(key);
    if (!item) {
      this.misses++;
      return null;
    }
    if (Date.now() > item.expiresAt) {
      this.store.delete(key);
      this.misses++;
      return null;
    }
    // Refresh position to maintain LRU (least recently used) order
    this.store.delete(key);
    this.store.set(key, item);
    this.hits++;
    return item.value;
  }

  set(key, value, ttlMs = CACHE_TTL_MS) {
    if (value === undefined || value === null) return;

    // Evict oldest entry if capacity reached
    if (this.store.size >= this.maxSize && !this.store.has(key)) {
      const oldestKey = this.store.keys().next().value;
      if (oldestKey !== undefined) {
        this.store.delete(oldestKey);
      }
    }

    // Delete first so re-insertion places it at the end of the Map
    this.store.delete(key);
    this.store.set(key, {
      value,
      expiresAt: Date.now() + ttlMs,
      createdAt: Date.now()
    });
  }

  has(key) {
    const item = this.store.get(key);
    if (!item) return false;
    if (Date.now() > item.expiresAt) {
      this.store.delete(key);
      return false;
    }
    return true;
  }

  delete(key) {
    return this.store.delete(key);
  }

  clear() {
    this.store.clear();
    this.hits = 0;
    this.misses = 0;
  }

  purgeExpired() {
    const now = Date.now();
    for (const [key, item] of this.store.entries()) {
      if (now > item.expiresAt) {
        this.store.delete(key);
      }
    }
  }

  getStats() {
    this.purgeExpired();
    const totalRequests = this.hits + this.misses;
    const hitRate = totalRequests > 0 ? ((this.hits / totalRequests) * 100).toFixed(1) + '%' : '0%';
    return {
      size: this.store.size,
      hits: this.hits,
      misses: this.misses,
      hitRate,
      keys: Array.from(this.store.keys()).slice(0, 50)
    };
  }
}

const cache = new MemoryCache();

module.exports = {
  MemoryCache,
  cache
};
