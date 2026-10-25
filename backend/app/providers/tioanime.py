"""
TioAnime Provider Adapter
"""
import re
import urllib.parse
import json
from typing import List, Optional
import requests
from bs4 import BeautifulSoup

from backend.app.core.cache import cache
from backend.app.core.config import get_headers, REQUEST_TIMEOUT, fix_encoding
from backend.app.models import EpisodeItem, SearchResultItem, AnimeDetail, EpisodeRef, WatchDetail, VideoServer, DirectoryItem
from backend.app.providers.base import BaseAnimeProvider

class TioAnimeProvider(BaseAnimeProvider):
    name = "TioAnime"
    base_url = "https://tioanime.com"

    def _format_url(self, path_or_url: str) -> str:
        if path_or_url.startswith("http://") or path_or_url.startswith("https://"):
            return path_or_url
        if not path_or_url.startswith("/"):
            path_or_url = "/" + path_or_url
        return f"{self.base_url}{path_or_url}"

    def get_latest(self) -> List[EpisodeItem]:
        """Fetch latest published episodes on TioAnime homepage."""
        url = self.base_url
        headers = get_headers()
        res = requests.get(url, headers=headers, timeout=REQUEST_TIMEOUT)
        res.raise_for_status()
        res.encoding = "utf-8"

        soup = BeautifulSoup(res.text, "html.parser")
        items: List[EpisodeItem] = []
        seen = set()

        for a in soup.find_all("a", href=re.compile(r"^/ver/")):
            href = a["href"]
            m = re.match(r"^/ver/(.+)-(\d+)$", href)
            if not m:
                continue
            slug, ep_str = m.group(1), m.group(2)
            try:
                ep_num = int(ep_str)
            except ValueError:
                ep_num = ep_str

            if (slug, ep_num) in seen:
                continue
            seen.add((slug, ep_num))

            parent = a.find_parent("article") or a.find_parent(class_=re.compile(r"col|item|episode|card")) or a
            title_el = parent.find(["h3", "h4", "h5", "span"])
            raw_title = title_el.get_text(strip=True) if title_el else slug.replace("-", " ").title()
            title = re.sub(rf"\s+{re.escape(str(ep_num))}$", "", raw_title).strip()
            title = fix_encoding(title)

            img_el = parent.find("img")
            img_src = img_el.get("src") if img_el else None
            if img_src and not img_src.startswith("http"):
                img_src = self._format_url(img_src)

            items.append(EpisodeItem(
                title=title,
                episode=ep_num,
                image=img_src,
                url=self._format_url(href),
                animeUrl=self._format_url(f"/anime/{slug}"),
                source=self.name
            ))

        return items

    def search(self, query: str) -> List[SearchResultItem]:
        """Search anime catalogue on TioAnime."""
        encoded_query = urllib.parse.quote(query.strip())
        url = f"{self.base_url}/directorio?q={encoded_query}"
        headers = get_headers(referer=self.base_url)
        res = requests.get(url, headers=headers, timeout=REQUEST_TIMEOUT)
        res.raise_for_status()
        res.encoding = "utf-8"

        soup = BeautifulSoup(res.text, "html.parser")
        results: List[SearchResultItem] = []
        seen = set()

        for a in soup.find_all("a", href=re.compile(r"^/anime/")):
            href = a["href"]
            slug = href.split("/")[-1]
            if slug in seen or slug in ["directorio", "programacion"]:
                continue
            seen.add(slug)

            parent = a.find_parent("article") or a.find_parent(class_=re.compile(r"col|item|anime|card")) or a
            title_el = parent.find(["h3", "h4", "h5", "span"])
            title = title_el.get_text(strip=True) if title_el else slug.replace("-", " ").title()
            title = fix_encoding(title)

            img_el = parent.find("img")
            img_src = img_el.get("src") if img_el else None
            if img_src and not img_src.startswith("http"):
                img_src = self._format_url(img_src)

            results.append(SearchResultItem(
                title=title,
                url=self._format_url(href),
                image=img_src,
                source=self.name,
                type="Anime"
            ))

        return results

    def get_anime(self, url: str) -> AnimeDetail:
        """Fetch anime technical sheet and complete episode list from TioAnime."""
        target_url = self._format_url(url)
        headers = get_headers(referer=self.base_url)
        res = requests.get(target_url, headers=headers, timeout=REQUEST_TIMEOUT)
        res.raise_for_status()
        res.encoding = "utf-8"

        soup = BeautifulSoup(res.text, "html.parser")
        slug = target_url.rstrip("/").split("/")[-1]

        # 1. Title
        title_el = soup.find("h1", class_="title")
        title = title_el.get_text(strip=True) if title_el else slug.replace("-", " ").title()
        title = fix_encoding(title)

        # 2. Poster
        thumb_el = soup.find("div", class_="thumb")
        img_el = thumb_el.find("img") if thumb_el else None
        image = self._format_url(img_el["src"]) if img_el and img_el.get("src") else None

        # 3. Synopsis
        sinopsis_el = soup.find("p", class_="sinopsis")
        synopsis = sinopsis_el.get_text(strip=True) if sinopsis_el else ""
        synopsis = fix_encoding(synopsis)

        # 4. Genres
        genres = [fix_encoding(g.get_text(strip=True)) for g in soup.select(".genres a, .generos a, p.genres a")]

        # 5. Status
        status = "En emisión"
        status_el = soup.find(class_=re.compile(r"status"))
        if status_el and "finalizado" in status_el.get_text().lower():
            status = "Finalizado"

        # 6. Episodes from script: var episodes = [2, 1];
        episodes: List[EpisodeRef] = []
        m_eps = re.search(r"var episodes = (\[.*?\]);", res.text)
        if m_eps:
            try:
                ep_nums = json.loads(m_eps.group(1))
                for num in sorted(ep_nums):
                    episodes.append(EpisodeRef(
                        number=num,
                        title=f"Episodio {num}",
                        url=self._format_url(f"/ver/{slug}-{num}")
                    ))
            except Exception:
                pass

        return AnimeDetail(
            title=title,
            url=target_url,
            image=image,
            synopsis=synopsis,
            genres=genres,
            status=status,
            source=self.name,
            episodes=episodes
        )

    def get_watch(self, url: str) -> WatchDetail:
        """Extract video player embed URLs for TioAnime episode."""
        target_url = self._format_url(url)
        headers = get_headers(referer=self.base_url)
        res = requests.get(target_url, headers=headers, timeout=REQUEST_TIMEOUT)
        res.raise_for_status()
        res.encoding = "utf-8"

        m_slug_ep = re.search(r"/ver/(.+)-(\d+)/?$", target_url)
        slug = m_slug_ep.group(1) if m_slug_ep else ""
        ep_num = int(m_slug_ep.group(2)) if m_slug_ep else 1
        anime_url = self._format_url(f"/anime/{slug}")

        # Extract title from breadcrumbs or slug
        anime_title = slug.replace("-", " ").title()
        anime_title = fix_encoding(anime_title)

        # Prev / Next
        prev_url = self._format_url(f"/ver/{slug}-{ep_num - 1}") if ep_num > 1 else None
        next_url = self._format_url(f"/ver/{slug}-{ep_num + 1}")

        # Audio determination (DUB vs SUB)
        is_dub = any(k in (slug + " " + anime_title).lower() for k in ["latino", "castellano", "doblado", "dub"])
        audio_type = "DUB" if is_dub else "SUB"
        audio_prefix = f"[{audio_type}] "

        # Servers from script: var videos = [["Mega","https:\/\/...",0,0], ...]
        servers: List[VideoServer] = []
        m_vid = re.search(r"var videos = (\[.*?\]);", res.text)
        if m_vid:
            try:
                vid_data = json.loads(m_vid.group(1))
                for v in vid_data:
                    s_name, s_url = v[0], v[1]
                    servers.append(VideoServer(name=f"{audio_prefix}{s_name}", embed=s_url, audio=audio_type))
            except Exception:
                pass

        # Image
        image = None
        anime_cached = cache.get(f"anime_{anime_url.lower()}")
        if anime_cached and getattr(anime_cached, "image", None):
            image = anime_cached.image
        else:
            try:
                anime_detail = self.get_anime(anime_url)
                image = anime_detail.image
            except Exception:
                pass

        return WatchDetail(
            animeTitle=anime_title,
            episode=ep_num,
            url=target_url,
            animeUrl=anime_url,
            image=image,
            source=self.name,
            prevUrl=prev_url,
            nextUrl=next_url,
            servers=servers,
            audios=[audio_type]
        )

    def get_directory(
        self,
        genre: Optional[str] = None,
        type_filter: Optional[str] = None,
        year: Optional[str] = None,
        status: Optional[str] = None,
        page: int = 1
    ) -> List[DirectoryItem]:
        """Fetch filtered catalog items from TioAnime /directorio."""
        type_map = {
            "tv": "0",
            "serie": "0",
            "movie": "1",
            "pelicula": "1",
            "ova": "2",
            "special": "3",
            "especial": "3",
        }
        status_map = {
            "emision": "1",
            "finalizado": "2",
            "finalizados": "2",
        }

        params = []
        if genre and genre != "all":
            genre_list = [g.strip().lower() for g in genre.split(",") if g.strip() and g.strip() != "all"]
            for g in genre_list:
                params.append(("genero[]", g))
        if type_filter and type_filter != "all":
            mapped_type = type_map.get(type_filter.lower().strip())
            if mapped_type is not None:
                params.append(("type[]", mapped_type))
        if status and status != "all":
            mapped_status = status_map.get(status.lower().strip())
            if mapped_status is not None:
                params.append(("status", mapped_status))
        if year and year != "all":
            try:
                y_int = int(year)
                params.append(("year", f"{y_int},{y_int + 1}"))
            except ValueError:
                params.append(("year", str(year)))
        if page > 1:
            params.append(("p", str(page)))

        query_string = urllib.parse.urlencode(params)
        url = f"{self.base_url}/directorio?{query_string}" if query_string else f"{self.base_url}/directorio"

        headers = get_headers(referer=self.base_url)
        res = requests.get(url, headers=headers, timeout=REQUEST_TIMEOUT)
        res.raise_for_status()
        res.encoding = "utf-8"

        soup = BeautifulSoup(res.text, "html.parser")
        items: List[DirectoryItem] = []
        articles = soup.find_all("article", class_="anime")

        for art in articles:
            a_tag = art.find("a")
            if not a_tag or not a_tag.get("href"):
                continue
            href = a_tag["href"]
            anime_url = f"{self.base_url}{href}" if href.startswith("/") else href
            
            title_tag = art.find("h3", class_="title") or art.find(["h3", "h2", "h4", "span"])
            title = title_tag.get_text(strip=True) if title_tag else "Anime"
            title = fix_encoding(title)

            img_tag = art.find("img")
            image = None
            if img_tag:
                src = img_tag.get("src")
                if src:
                    image = f"{self.base_url}{src}" if src.startswith("/") else src

            tipo_norm = "TV Anime"
            if type_filter:
                tf = type_filter.lower()
                if "pel" in tf or "movie" in tf:
                    tipo_norm = "Película"
                elif "ova" in tf:
                    tipo_norm = "OVA"
                elif "esp" in tf or "special" in tf:
                    tipo_norm = "Especial"

            estado_norm = "En emisión" if (status and "emi" in status.lower()) else ("Finalizado" if (status and "fin" in status.lower()) else "En emisión")

            items.append(DirectoryItem(
                title=title,
                url=anime_url,
                image=image,
                source=self.name,
                type=tipo_norm,
                status=estado_norm,
                year=year if (year and year != "all") else None
            ))

        return items
