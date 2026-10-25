"""
MyAnimeList Franchise & Relations Extractor
Extracts strictly audiovisual related anime entries (sequels, prequels, spin-offs, movies, OVAs, specials)
from MyAnimeList public APIs and HTML pages with high-definition poster resolution and resilient caching.
Excludes all physical/print media (mangas, light novels, novels, etc.).
"""
import re
import logging
from typing import List, Dict, Any, Optional
from concurrent.futures import ThreadPoolExecutor
import requests
from bs4 import BeautifulSoup
from ..models import AnimeRelationItem
from .cache import cache

logger = logging.getLogger(__name__)

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
    'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120"',
    'Sec-Ch-Ua-Mobile': '?0',
    'Sec-Ch-Ua-Platform': '"Windows"'
}

RELATION_MAP: Dict[str, str] = {
    "sequel": "Secuela",
    "prequel": "Precuela",
    "side story": "Historia paralela",
    "spin-off": "Spin-off",
    "spin off": "Spin-off",
    "alternative setting": "Ambientación alternativa",
    "alternative version": "Versión alternativa",
    "summary": "Resumen / Película",
    "parent story": "Historia principal",
    "full story": "Historia completa",
    "character": "Especial de personaje",
    "other": "Especial / Otro"
}

TYPE_MAP: Dict[str, str] = {
    "tv": "TV",
    "movie": "Película",
    "ova": "OVA",
    "ona": "ONA",
    "special": "Especial",
    "tv special": "Especial TV",
    "music": "Musical",
    "cm": "Comercial / Corto"
}

# Relation priority for sorted display
PRIORITY_ORDER = {
    "sequel": 1,
    "prequel": 2,
    "parent story": 3,
    "summary": 4,
    "side story": 5,
    "spin-off": 6,
    "spin off": 6,
    "alternative setting": 7,
    "alternative version": 7,
    "character": 8,
    "other": 9
}

PHYSICAL_MEDIA_KEYWORDS = {
    'manga', 'light novel', 'novel', 'one-shot', 'oneshot',
    'doujinshi', 'manhwa', 'manhua', 'book', 'comic'
}


def clean_title_for_mal(title: str) -> str:
    """Removes streaming audio, dub, and resolution tags to ensure clean MAL match."""
    t = re.sub(
        r'[\(\[\{](audio\s+latino|latino|castellano|español|sub\s*español|sub|dub|doblaje|uncensored|sin\s+censura)[^\)\]\}]*[\)\]\}]',
        '',
        title,
        flags=re.I
    )
    t = re.sub(r'\b(audio\s+latino|español\s+latino|en\s+emision|finalizado|hd|fhd)\b', '', t, flags=re.I)
    t = re.sub(r'\s+', ' ', t).strip()
    return t


def make_high_res_mal_image(url: Optional[str]) -> Optional[str]:
    """
    Transforms low-resolution MAL thumbnails (/r/50x70/, /r/100x140/, spacer.gif)
    into direct original high-resolution poster URLs without blurriness.
    """
    if not url:
        return None
    url = url.strip()
    if not url or "spacer.gif" in url or "questionmark" in url:
        return None
    # Strip thumbnail dimension path e.g. /r/50x70/ or /r/116x180/
    hd_url = re.sub(r'/r/\d+x\d+/', '/', url)
    # Strip signature/sizing query params e.g. ?s=...
    hd_url = hd_url.split('?')[0]
    return hd_url


def is_strictly_audiovisual(item_url: str, raw_relation: str, media_type: Optional[str]) -> bool:
    """
    Ensures that ONLY audiovisual entries (TV, Movie, OVA, ONA, Special, Music)
    are retained, strictly excluding any physical/print publications (Manga, Light Novel, Novel, etc.).
    """
    url_lower = (item_url or "").lower()
    # 1. Any MAL URL pointing to /manga/ is a physical print media
    if '/manga/' in url_lower:
        return False

    rel_lower = (raw_relation or "").lower()
    type_lower = (media_type or "").lower()

    # 2. Check for physical media keywords in type or relation
    for kw in PHYSICAL_MEDIA_KEYWORDS:
        if kw in type_lower or kw in rel_lower:
            return False

    # 3. On MAL, "Adaptation" for an anime entry always points to the original source manga/novel
    if rel_lower == 'adaptation':
        return False

    # 4. If URL points to /anime/, it's guaranteed to be an audiovisual production
    if '/anime/' in url_lower:
        return True

    # 5. Check if type matches audiovisual types
    valid_audiovisual = {'tv', 'movie', 'película', 'ova', 'ona', 'special', 'especial', 'music', 'musical', 'cm'}
    if type_lower in valid_audiovisual:
        return True

    # By default, if it's not confirmed audiovisual, do not include
    return False


def fetch_poster_meta(title: str) -> tuple[str, Optional[str], Optional[str]]:
    """
    Quickly resolves high-definition poster and precise media type for secondary anime entries.
    """
    try:
        url = f"https://myanimelist.net/search/prefix.json?type=anime&keyword={requests.utils.quote(title)}&v=1"
        r = requests.get(url, headers=HEADERS, timeout=4)
        if r.status_code == 200:
            cats = r.json().get('categories', [])
            items = cats[0].get('items', []) if cats else []
            if items:
                best = items[0]
                img = make_high_res_mal_image(best.get('image_url'))
                mtype = best.get('payload', {}).get('media_type')
                return title, img, mtype
    except Exception:
        pass
    return title, None, None


def fetch_mal_relations(title: str) -> List[AnimeRelationItem]:
    """
    Finds franchise and related entries on MyAnimeList for a given anime title.
    Returns a typed list of AnimeRelationItem instances, filtered strictly to audiovisual works.
    """
    clean_title = clean_title_for_mal(title)
    if not clean_title:
        return []

    cache_key = f"mal_rel_av_v2_{clean_title.lower()}"
    cached_data = cache.get(cache_key)
    if cached_data is not None:
        return cached_data

    relations: List[AnimeRelationItem] = []
    seen_titles = set()

    try:
        search_url = f"https://myanimelist.net/search/prefix.json?type=anime&keyword={requests.utils.quote(clean_title)}&v=1"
        r = requests.get(search_url, headers=HEADERS, timeout=7)
        items = []

        if r.status_code == 200:
            cats = r.json().get('categories', [])
            items = cats[0].get('items', []) if cats else []

        # Fallback with first two words if title had complex subtitle
        if not items:
            words = clean_title.split()
            if len(words) > 2:
                short_title = ' '.join(words[:2])
                r2 = requests.get(
                    f"https://myanimelist.net/search/prefix.json?type=anime&keyword={requests.utils.quote(short_title)}&v=1",
                    headers=HEADERS,
                    timeout=7
                )
                if r2.status_code == 200:
                    cats2 = r2.json().get('categories', [])
                    items = cats2[0].get('items', []) if cats2 else []

        if not items:
            cache.set(cache_key, [])
            return []

        best = items[0]
        mal_url = best.get('url')
        if not mal_url:
            cache.set(cache_key, [])
            return []

        page_res = requests.get(mal_url, headers=HEADERS, timeout=9)
        if page_res.status_code != 200:
            cache.set(cache_key, [])
            return []

        soup = BeautifulSoup(page_res.text, 'html.parser')
        related_div = soup.find('div', class_='related-entries')
        if not related_div:
            cache.set(cache_key, [])
            return []

        # 1. Parse prominent visual entry tiles (Sequels, Prequels, etc.)
        for entry in related_div.find_all('div', class_='entry'):
            content = entry.find('div', class_='content')
            if not content:
                continue

            rel_el = content.find('div', class_='relation')
            title_el = content.find('div', class_='title')
            img_el = entry.find('img')

            if not title_el or not title_el.find('a'):
                continue

            a_tag = title_el.find('a')
            item_title = a_tag.get_text(strip=True)
            item_url = a_tag.get('href', '')

            raw_relation = "Other"
            media_type = None
            if rel_el:
                rel_text = rel_el.get_text('\n', strip=True)
                lines = [line.strip() for line in rel_text.splitlines() if line.strip()]
                if lines:
                    raw_relation = lines[0]
                if len(lines) > 1:
                    media_type = lines[1].strip('()')

            # Strictly exclude physical media (Manga, Light Novel, Novel, etc.)
            if not is_strictly_audiovisual(item_url, raw_relation, media_type):
                continue

            img_src = ""
            if img_el:
                img_src = img_el.get('data-src') or img_el.get('src') or ''
            hd_image = make_high_res_mal_image(img_src)

            id_match = re.search(r'/(anime|manga)/(\d+)', item_url)
            mal_id = int(id_match.group(2)) if id_match else None

            norm_rel = raw_relation.lower()
            rel_label = RELATION_MAP.get(norm_rel, raw_relation)
            type_label = TYPE_MAP.get((media_type or "").lower(), media_type) if media_type else None

            if item_title and item_title.lower() not in seen_titles:
                seen_titles.add(item_title.lower())
                relations.append(AnimeRelationItem(
                    title=item_title,
                    relation=rel_label,
                    raw_relation=raw_relation,
                    type=type_label or media_type,
                    image=hd_image,
                    mal_id=mal_id,
                    mal_url=item_url
                ))

        # 2. Parse secondary relation tables (Side stories, Spin-offs, Summaries, OVAs, etc.)
        for tr in related_div.find_all('tr'):
            tds = tr.find_all('td')
            if len(tds) < 2:
                continue

            raw_rel = tds[0].get_text(strip=True).rstrip(':')
            norm_rel = raw_rel.lower()
            rel_label = RELATION_MAP.get(norm_rel, raw_rel)

            for a in tds[1].find_all('a'):
                href = a.get('href', '')
                item_title = a.get_text(strip=True)
                if not item_title or item_title.lower() in seen_titles:
                    continue

                # Strictly exclude physical media (Manga, Light Novel, Novel, etc.)
                if not is_strictly_audiovisual(href, raw_rel, None):
                    continue

                seen_titles.add(item_title.lower())
                id_match = re.search(r'/anime/(\d+)', href)
                mal_id = int(id_match.group(1)) if id_match else None

                relations.append(AnimeRelationItem(
                    title=item_title,
                    relation=rel_label,
                    raw_relation=raw_rel,
                    type=None,
                    image=None,
                    mal_id=mal_id,
                    mal_url=href
                ))

        # 3. Concurrently fetch high-definition posters and media types for items missing images
        items_needing_meta = [it.title for it in relations if not it.image or not it.type]
        if items_needing_meta:
            max_workers = min(6, len(items_needing_meta))
            with ThreadPoolExecutor(max_workers=max_workers) as executor:
                resolved_list = list(executor.map(fetch_poster_meta, items_needing_meta))
                meta_dict = {res[0]: (res[1], res[2]) for res in resolved_list}

            for it in relations:
                if it.title in meta_dict:
                    resolved_img, resolved_type = meta_dict[it.title]
                    if not it.image and resolved_img:
                        it.image = resolved_img
                    if not it.type and resolved_type:
                        it.type = TYPE_MAP.get(resolved_type.lower(), resolved_type)

        # Sort logically: Sequels and Prequels first, followed by Movies/Summaries, OVAs, Spin-offs, etc.
        def relation_sort_key(item: AnimeRelationItem) -> int:
            r = item.raw_relation.lower()
            for k, prio in PRIORITY_ORDER.items():
                if k in r:
                    return prio
            return 99

        relations.sort(key=relation_sort_key)
        cache.set(cache_key, relations)
        return relations

    except Exception as e:
        logger.warning(f"Could not extract MAL relations for '{title}': {e}")
        cache.set(cache_key, [])
        return []
