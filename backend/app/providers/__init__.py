"""
Unified Anime Providers Initialization
Supports AnimeAV1, JKAnime, and TioAnime
"""
from typing import Optional, Dict
from backend.app.providers.animeav1 import AnimeAV1Provider
from backend.app.providers.jkanime import JKAnimeProvider
from backend.app.providers.tioanime import TioAnimeProvider
from backend.app.providers.base import BaseAnimeProvider

animeav1Provider = AnimeAV1Provider()
jkanimeProvider = JKAnimeProvider()
tioanimeProvider = TioAnimeProvider()

PROVIDERS: Dict[str, BaseAnimeProvider] = {
    "animeav1": animeav1Provider,
    "jkanime": jkanimeProvider,
    "tioanime": tioanimeProvider,
}

def get_provider_by_name(name: str) -> Optional[BaseAnimeProvider]:
    clean = name.lower().replace("-", "").replace(" ", "").replace(".", "")
    if "animeav1" in clean or "av1" in clean:
        return animeav1Provider
    if "jkanime" in clean or "jk" in clean:
        return jkanimeProvider
    if "tioanime" in clean or "tio" in clean:
        return tioanimeProvider
    return None

def detect_provider_by_url(url: str) -> Optional[BaseAnimeProvider]:
    low = url.lower()
    if "animeav1.com" in low:
        return animeav1Provider
    if "jkanime.net" in low:
        return jkanimeProvider
    if "tioanime.com" in low:
        return tioanimeProvider
    return None
