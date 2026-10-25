"""
Thread-safe in-memory Cache with TTL (Time To Live).
Default TTL: 15 minutes (900 seconds).
"""
import time
import threading
from typing import Any, Optional, Dict
from functools import wraps
from backend.app.core.config import CACHE_TTL_SECONDS

class MemoryCache:
    def __init__(self, default_ttl: int = CACHE_TTL_SECONDS):
        self._cache: Dict[str, Dict[str, Any]] = {}
        self._lock = threading.RLock()
        self.default_ttl = default_ttl
        self.hits = 0
        self.misses = 0

    def get(self, key: str) -> Optional[Any]:
        with self._lock:
            item = self._cache.get(key)
            if not item:
                self.misses += 1
                return None
            if time.time() > item["expires_at"]:
                del self._cache[key]
                self.misses += 1
                return None
            self.hits += 1
            return item["data"]

    def set(self, key: str, value: Any, ttl: Optional[int] = None) -> None:
        if ttl is None:
            ttl = self.default_ttl
        with self._lock:
            self._cache[key] = {
                "data": value,
                "expires_at": time.time() + ttl,
                "created_at": time.time()
            }

    def delete(self, key: str) -> bool:
        with self._lock:
            if key in self._cache:
                del self._cache[key]
                return True
            return False

    def clear(self) -> None:
        with self._lock:
            self._cache.clear()
            self.hits = 0
            self.misses = 0

    def cleanup_expired(self) -> int:
        """Remove expired keys."""
        now = time.time()
        removed = 0
        with self._lock:
            expired_keys = [k for k, v in self._cache.items() if now > v["expires_at"]]
            for k in expired_keys:
                del self._cache[k]
                removed += 1
        return removed

    def stats(self) -> Dict[str, Any]:
        with self._lock:
            self.cleanup_expired()
            total_reqs = self.hits + self.misses
            ratio = round(self.hits / total_reqs, 2) if total_reqs > 0 else 1.0
            return {
                "total_keys": len(self._cache),
                "hits": self.hits,
                "misses": self.misses,
                "hit_ratio": ratio,
                "default_ttl": self.default_ttl,
                "sample_keys": list(self._cache.keys())[:10]
            }

# Global cache instance
cache = MemoryCache(default_ttl=CACHE_TTL_SECONDS)
