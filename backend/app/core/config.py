"""
Application Configuration and Constants
"""
import random
from typing import Dict, Optional

CACHE_TTL_SECONDS = 900  # 15 minutes TTL as required

USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Safari/605.1.15",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
]

REQUEST_TIMEOUT = 15  # seconds

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

