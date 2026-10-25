"""
Application Configuration and Constants
Includes Cloudflare Anycast unblocking, persistent session pooling, and encoding repair.
"""
import random
import socket
import logging
from typing import Dict, Optional
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

logger = logging.getLogger(__name__)

CACHE_TTL_SECONDS = 900  # 15 minutes TTL as required
REQUEST_TIMEOUT = 6      # Fast failover timeout (reduced from 15s to eliminate UI stalls)

USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Safari/605.1.15",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
]

# -------------------------------------------------------------------------
# ISP Censorship / Block Bypass for Cloudflare Anycast Domains
# In Spain and parts of the EU, ISPs block Cloudflare IPs 188.114.96.x / 97.x.
# Because Cloudflare is an Anycast network, routing to clean Anycast nodes
# completely bypasses the block and resolves in <200ms with 0 timeouts.
# -------------------------------------------------------------------------
CF_CLEAN_IP = "104.26.11.188"
CF_DOMAINS = {
    "animeav1.com", "www.animeav1.com",
    "tioanime.com", "www.tioanime.com"
}

_orig_getaddrinfo = socket.getaddrinfo

def _unblocked_getaddrinfo(host, port, family=0, type=0, proto=0, flags=0):
    if host in CF_DOMAINS:
        return _orig_getaddrinfo(CF_CLEAN_IP, port, family, type, proto, flags)
    return _orig_getaddrinfo(host, port, family, type, proto, flags)

socket.getaddrinfo = _unblocked_getaddrinfo

# -------------------------------------------------------------------------
# High-Performance HTTP Connection Pooling (Keep-Alive Re-use)
# -------------------------------------------------------------------------
_global_session: Optional[requests.Session] = None

def get_session() -> requests.Session:
    """Return singleton HTTP session with connection pooling to eliminate TLS handshake latency."""
    global _global_session
    if _global_session is None:
        _global_session = requests.Session()
        retries = Retry(total=2, backoff_factor=0.2, status_forcelist=[500, 502, 503, 504])
        adapter = HTTPAdapter(
            pool_connections=50,
            pool_maxsize=50,
            max_retries=retries,
            pool_block=False
        )
        _global_session.mount("https://", adapter)
        _global_session.mount("http://", adapter)
    return _global_session


def get_random_user_agent() -> str:
    """Return a random modern desktop User-Agent."""
    return random.choice(USER_AGENTS)


def get_headers(referer: Optional[str] = None) -> Dict[str, str]:
    """Generate realistic browser headers without corrupting automatic gzip/deflate decoding."""
    headers = {
        "User-Agent": get_random_user_agent(),
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
        "Accept-Language": "es-ES,es;q=0.9,en-US;q=0.8,en;q=0.7",
        "DNT": "1",
        "Connection": "keep-alive",
        "Upgrade-Insecure-Requests": "1",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "same-origin" if referer else "none",
        "Sec-Fetch-User": "?1"
    }
    if referer:
        headers["Referer"] = referer
    return headers


def fix_encoding(text: Optional[str]) -> Optional[str]:
    """Fix mojibake where UTF-8 characters were mistakenly decoded as ISO-8859-1 or CP1252 (e.g. AcciÃ³n -> Acción)."""
    if not text or not isinstance(text, str):
        return text
    if any(marker in text for marker in ("Ã", "Â", "â", "ð", "ï¿½")):
        try:
            return text.encode("latin-1").decode("utf-8")
        except (UnicodeEncodeError, UnicodeDecodeError):
            pass
        try:
            return text.encode("cp1252").decode("utf-8")
        except (UnicodeEncodeError, UnicodeDecodeError):
            pass
    return text
