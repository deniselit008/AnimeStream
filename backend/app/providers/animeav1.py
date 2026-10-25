"""
AnimeAV1 Provider Adapter
"""
import re
import urllib.parse
from typing import List, Optional
import requests
from bs4 import BeautifulSoup

from backend.app.core.config import get_headers, REQUEST_TIMEOUT, fix_encoding
from backend.app.models import EpisodeItem, SearchResultItem, AnimeDetail, EpisodeRef, WatchDetail, VideoServer, DirectoryItem
from backend.app.providers.base import BaseAnimeProvider

class AnimeAV1Provider(BaseAnimeProvider):
    name = "AnimeAV1"
    base_url = "https://animeav1.com"

    def _format_url(self, path_or_url: str) -> str:
        if path_or_url.startswith("http://") or path_or_url.startswith("https://"):
            return path_or_url
        if not path_or_url.startswith("/"):
            path_or_url = "/" + path_or_url
        return f"{self.base_url}{path_or_url}"

    def get_latest(self) -> List[EpisodeItem]:
        """Fetch latest episodes published on AnimeAV1 homepage."""
        url = self.base_url
        headers = get_headers()
        res = requests.get(url, headers=headers, timeout=REQUEST_TIMEOUT)
        res.raise_for_status()
        res.encoding = "utf-8"

        soup = BeautifulSoup(res.text, "html.parser")
        items: List[EpisodeItem] = []
        seen = set()

        for a in soup.find_all("a", href=re.compile(r"^/media/([^/]+)/(\d+)$")):
            href = a["href"]
            m = re.match(r"^/media/([^/]+)/(\d+)$", href)
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

            # Find image
            parent = a.find_parent(class_=re.compile(r"item|card|group|relative")) or a.parent
            img_el = parent.find("img") if parent else a.find("img")
            img_src = None
            if img_el:
                img_src = img_el.get("src") or img_el.get("data-src")
                if img_src and not img_src.startswith("http"):
                    img_src = self._format_url(img_src)

            # Clean Title
            raw_text = a.get_text(" ", strip=True)
            title = re.sub(r"^Ver\s+", "", raw_text, flags=re.I)
            title = re.sub(rf"\s+{re.escape(str(ep_num))}$", "", title).strip()
            if not title:
                title = slug.replace("-", " ").title()
            title = fix_encoding(title)

            items.append(EpisodeItem(
                title=title,
                episode=ep_num,
                image=img_src,
                url=self._format_url(href),
                animeUrl=self._format_url(f"/media/{slug}"),
                source=self.name
            ))

        return items

    def search(self, query: str) -> List[SearchResultItem]:
        """Search AnimeAV1 catalog."""
        encoded_query = urllib.parse.quote(query.strip())
        url = f"{self.base_url}/catalogo?search={encoded_query}"
        headers = get_headers(referer=self.base_url)
        res = requests.get(url, headers=headers, timeout=REQUEST_TIMEOUT)
        res.raise_for_status()
        res.encoding = "utf-8"

        soup = BeautifulSoup(res.text, "html.parser")
        results: List[SearchResultItem] = []
        seen = set()

        for a in soup.find_all("a", href=re.compile(r"^/media/([^/]+)$")):
            href = a["href"]
            slug = href.split("/")[-1]
            if slug in seen or slug in ["catalogo", "horario", "pages"]:
                continue
            seen.add(slug)

            card = a.find_parent(class_=re.compile(r"card|item|media|group")) or a
            img_el = card.find("img") if card else a.find("img")
            img_src = None
            title = ""
            if img_el:
                img_src = img_el.get("src") or img_el.get("data-src")
                if img_src and not img_src.startswith("http"):
                    img_src = self._format_url(img_src)
                alt = img_el.get("alt", "")
                title = alt.replace("Portada de ", "").replace("Cover of ", "").strip()

            if not title:
                raw_text = a.get_text(" ", strip=True)
                title = re.sub(r"^Ver\s+", "", raw_text, flags=re.I).strip()
            if not title:
                title = slug.replace("-", " ").title()
            title = fix_encoding(title)

            results.append(SearchResultItem(
                title=title,
                url=self._format_url(href),
                image=img_src,
                source=self.name,
                type="Anime"
            ))

        return results

    def get_anime(self, url: str) -> AnimeDetail:
        """Fetch anime details and episode list from AnimeAV1."""
        target_url = self._format_url(url)
        headers = get_headers(referer=self.base_url)
        res = requests.get(target_url, headers=headers, timeout=REQUEST_TIMEOUT)
        res.raise_for_status()
        res.encoding = "utf-8"

        soup = BeautifulSoup(res.text, "html.parser")
        txt = res.text

        # 1. Title
        h1 = soup.find("h1")
        title = h1.get_text(strip=True) if h1 else ""
        if not title:
            m_title = re.search(r'title:"([^"]+)"', txt)
            title = m_title.group(1) if m_title else target_url.split("/")[-1].replace("-", " ").title()
        title = fix_encoding(title)

        # 2. Synopsis
        synopsis = ""
        m_syn = re.search(r'synopsis:"(.*?)"[,}]', txt)
        if m_syn:
            try:
                synopsis = m_syn.group(1).encode("utf-8").decode("unicode_escape")
            except Exception:
                synopsis = m_syn.group(1)
        if not synopsis:
            meta_desc = soup.find("meta", property="og:description") or soup.find("meta", attrs={"name": "description"})
            if meta_desc and meta_desc.get("content"):
                synopsis = meta_desc["content"].strip()
        synopsis = fix_encoding(synopsis)

        # 3. Poster & Backdrop
        poster_img = soup.find("img", class_=re.compile(r"aspect-poster"))
        image = poster_img.get("src") if poster_img else None
        if image and not image.startswith("http"):
            image = self._format_url(image)

        backdrop_img = soup.find("img", class_=re.compile(r"backdrop"))
        backdrop = backdrop_img.get("src") if backdrop_img else None
        if backdrop and not backdrop.startswith("http"):
            backdrop = self._format_url(backdrop)

        # 4. Genres
        genres = []
        m_genres = re.findall(r'name:"([^"]+)",type:\d+,slug:"([^"]+)"', txt)
        if m_genres:
            genres = list(dict.fromkeys([fix_encoding(g[0]) for g in m_genres]))
        if not genres:
            for g_link in soup.find_all("a", href=re.compile(r"/catalogo\?genre=")):
                g_text = g_link.get_text(strip=True)
                if g_text:
                    clean_g = fix_encoding(g_text)
                    if clean_g not in genres:
                        genres.append(clean_g)

        # 5. Status
        status = "En emisión"
        m_status = re.search(r'status:(\d+)', txt)
        if m_status:
            code = m_status.group(1)
            status = "Finalizado" if code == "1" else "En emisión"

        # 6. Episodes List
        slug = target_url.split("/")[-1]
        episodes: List[EpisodeRef] = []
        seen_eps = set()

        # Try script data first (contains all episodes)
        m_eps = re.findall(r'\{id:(\d+),number:(\d+)\}', txt)
        if m_eps:
            for ep_id, ep_num_str in m_eps:
                ep_num = int(ep_num_str)
                if ep_num in seen_eps:
                    continue
                seen_eps.add(ep_num)
                # Find media id to form thumbnail URL
                m_media_id = re.search(r'media:\{id:(\d+)', txt)
                mid = m_media_id.group(1) if m_media_id else ""
                thumb = f"https://cdn.animeav1.com/screenshots/{mid}/{ep_num}.jpg" if mid else None
                episodes.append(EpisodeRef(
                    number=ep_num,
                    title=f"Episodio {ep_num}",
                    url=self._format_url(f"/media/{slug}/{ep_num}"),
                    image=thumb
                ))

        # Fallback to DOM episode links
        if not episodes:
            for a in soup.find_all("a", href=re.compile(rf"^/media/{re.escape(slug)}/(\d+)$")):
                m = re.match(rf"^/media/{re.escape(slug)}/(\d+)$", a["href"])
                if m:
                    ep_num = int(m.group(1))
                    if ep_num not in seen_eps:
                        seen_eps.add(ep_num)
                        episodes.append(EpisodeRef(
                            number=ep_num,
                            title=f"Episodio {ep_num}",
                            url=self._format_url(a["href"]),
                            image=None
                        ))

        # Sort ascending by episode number
        episodes.sort(key=lambda x: int(x.number) if isinstance(x.number, int) or str(x.number).isdigit() else 0)

        return AnimeDetail(
            title=title,
            url=target_url,
            image=image,
            backdrop=backdrop,
            synopsis=synopsis,
            genres=genres,
            status=status,
            source=self.name,
            episodes=episodes
        )

    def get_watch(self, url: str) -> WatchDetail:
        """Extract video servers and episode watch player URLs from AnimeAV1."""
        target_url = self._format_url(url)
        headers = get_headers(referer=self.base_url)
        res = requests.get(target_url, headers=headers, timeout=REQUEST_TIMEOUT)
        res.raise_for_status()
        res.encoding = "utf-8"

        soup = BeautifulSoup(res.text, "html.parser")
        txt = res.text

        # Extract slug and ep
        m_slug_ep = re.search(r"/media/([^/]+)/(\d+)", target_url)
        slug = m_slug_ep.group(1) if m_slug_ep else ""
        ep_num = int(m_slug_ep.group(2)) if m_slug_ep else 1
        anime_url = self._format_url(f"/media/{slug}")

        # Title extraction: prioritize SvelteKit media object
        anime_title = ""
        m_title = re.search(r'media:\{[^{}]*title:"([^"]+)"', txt)
        if m_title and m_title.group(1).lower() not in ["episodio", "episodios"]:
            anime_title = m_title.group(1)
        if not anime_title:
            h1 = soup.find("h1")
            raw_title = h1.get_text(strip=True) if h1 else ""
            if raw_title and not raw_title.lower().startswith("episodio"):
                anime_title = re.sub(rf"\s+{ep_num}$", "", raw_title).strip()
        if not anime_title:
            anime_title = slug.replace("-", " ").title()
        anime_title = fix_encoding(anime_title)

        # Navigation links
        prev_url = None
        next_url = None
        prev_btn = soup.find("a", attrs={"aria-label": "Anterior"})
        if prev_btn and prev_btn.get("href"):
            prev_url = self._format_url(prev_btn["href"])
        elif ep_num > 1:
            prev_url = self._format_url(f"/media/{slug}/{ep_num - 1}")

        next_btn = soup.find("a", attrs={"aria-label": "Siguiente"})
        if next_btn and next_btn.get("href"):
            next_url = self._format_url(next_btn["href"])

        # Servers with structured SUB / DUB extraction
        servers: List[VideoServer] = []
        seen_embeds = set()
        audios: List[str] = []

        # 1. Parse structured embeds block if available: embeds:{ SUB:[...], DUB:[...] }
        m_embeds = re.search(r'embeds:\{(.*?)\},\s*(?:downloads|subtitles|mirrors):', txt, re.S)
        if m_embeds:
            raw_block = m_embeds.group(1)
            for variant in ["SUB", "DUB"]:
                var_match = re.search(rf'{variant}:\[(.*?)\]', raw_block, re.S)
                if var_match:
                    s_list = re.findall(r'\{server:"([^"]+)",url:"([^"]+)"\}', var_match.group(1))
                    if s_list and variant not in audios:
                        audios.append(variant)
                    for s_name, s_url in s_list:
                        clean_name = s_name.strip()
                        label_prefix = f"[{variant}] "
                        if "zilla-networks.com" in s_url or clean_name.upper() == "HLS":
                            m_hash = re.search(r"([a-fA-F0-9]{32})", s_url)
                            if m_hash:
                                hls_hash = m_hash.group(1)
                                hls_embed = f"/api/hls/player/{hls_hash}"
                                if (hls_embed, variant) not in seen_embeds:
                                    seen_embeds.add((hls_embed, variant))
                                    servers.append(VideoServer(
                                        name=f"{label_prefix}HLS (Reproductor HD)",
                                        embed=hls_embed,
                                        audio=variant
                                    ))
                                if (s_url, variant) not in seen_embeds:
                                    seen_embeds.add((s_url, variant))
                                    servers.append(VideoServer(
                                        name=f"{label_prefix}HLS (Zilla Mirror)",
                                        embed=s_url,
                                        audio=variant
                                    ))
                                continue
                        if (s_url, variant) not in seen_embeds:
                            seen_embeds.add((s_url, variant))
                            servers.append(VideoServer(
                                name=f"{label_prefix}{clean_name}",
                                embed=s_url,
                                audio=variant
                            ))

        # Fallback if no structured embeds were captured
        if not servers:
            m_servers = re.findall(r'\{server:"([^"]+)",url:"([^"]+)"\}', txt)
            for s_name, s_url in m_servers:
                if s_url not in seen_embeds:
                    seen_embeds.add(s_url)
                    clean_name = s_name.strip()
                    if "zilla-networks.com" in s_url or clean_name.upper() == "HLS":
                        m_hash = re.search(r"([a-fA-F0-9]{32})", s_url)
                        if m_hash:
                            hls_hash = m_hash.group(1)
                            servers.insert(0, VideoServer(name="[SUB] HLS (Reproductor HD)", embed=f"/api/hls/player/{hls_hash}", audio="SUB"))
                            servers.append(VideoServer(name="[SUB] HLS (Zilla Mirror)", embed=s_url, audio="SUB"))
                            continue
                    servers.append(VideoServer(name=f"[SUB] {clean_name}", embed=s_url, audio="SUB"))
            audios = ["SUB"]

        # 2. Iframes in DOM
        for ifr in soup.find_all("iframe"):
            src = ifr.get("src")
            if src and src.startswith("http") and src not in seen_embeds:
                if not any(bad in src for bad in ["google", "analytics", "turnstile", "recaptcha", "discord"]):
                    seen_embeds.add(src)
                    servers.insert(0, VideoServer(name="[SUB] Principal", embed=src, audio="SUB"))
                    if "SUB" not in audios:
                        audios.insert(0, "SUB")

        if not audios:
            audios = ["SUB"]

        # 3. Image
        image = None
        m_mid = re.search(r'media:\{id:(\d+)', txt)
        if m_mid:
            mid = m_mid.group(1)
            image = f"https://cdn.animeav1.com/thumbnails/{mid}.jpg"
        if not image:
            poster_img = soup.find("img", class_=re.compile(r"aspect-poster|aspect-video"))
            if poster_img and poster_img.get("src"):
                image = self._format_url(poster_img["src"])

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
            audios=audios
        )

    def get_directory(
        self,
        genre: Optional[str] = None,
        type_filter: Optional[str] = None,
        year: Optional[str] = None,
        status: Optional[str] = None,
        page: int = 1
    ) -> List[DirectoryItem]:
        """Fetch filtered catalog items from AnimeAV1 /catalogo."""
        type_map = {
            "tv": "serie",
            "serie": "serie",
            "movie": "pelicula",
            "pelicula": "pelicula",
            "ova": "ova",
            "special": "especial",
            "especial": "especial",
            "ona": "ona",
        }
        status_map = {
            "emision": "emision",
            "finalizado": "finalizado",
            "finalizados": "finalizado",
        }

        params = {}
        if genre and genre != "all":
            genre_list = [g.strip().lower() for g in genre.split(",") if g.strip() and g.strip() != "all"]
            if genre_list:
                params["genre"] = ",".join(genre_list)
        if type_filter and type_filter != "all":
            mapped_type = type_map.get(type_filter.lower().strip(), type_filter.lower().strip())
            params["category"] = mapped_type
        if status and status != "all":
            mapped_status = status_map.get(status.lower().strip(), status.lower().strip())
            params["status"] = mapped_status
        if year and year != "all":
            params["minYear"] = str(year).strip()
            params["maxYear"] = str(year).strip()
        if page > 1:
            params["page"] = str(page)

        query_string = urllib.parse.urlencode(params)
        url = f"{self.base_url}/catalogo?{query_string}" if query_string else f"{self.base_url}/catalogo"

        headers = get_headers(referer=self.base_url)
        res = requests.get(url, headers=headers, timeout=REQUEST_TIMEOUT)
        res.raise_for_status()
        res.encoding = "utf-8"

        soup = BeautifulSoup(res.text, "html.parser")
        items: List[DirectoryItem] = []
        cards = soup.find_all("a", href=re.compile(r"^/media/[^/]+$"))

        seen_urls = set()
        for c in cards:
            href = c["href"]
            if href in seen_urls:
                continue
            seen_urls.add(href)
            anime_url = f"{self.base_url}{href}"
            
            raw_title = c.get_text(" ", strip=True)
            title = re.sub(r"^\s*Ver\s+", "", raw_title, flags=re.I).strip()
            if not title:
                title = href.replace("/media/", "").replace("-", " ").title()
            title = fix_encoding(title)

            parent = c.parent or c
            img_tag = parent.find("img")
            image = None
            if img_tag:
                src = img_tag.get("src")
                if src:
                    image = self._format_url(src)

            tipo_norm = "TV Anime"
            if type_filter:
                tf = type_filter.lower()
                if "pel" in tf or "movie" in tf:
                    tipo_norm = "Película"
                elif "ova" in tf:
                    tipo_norm = "OVA"
                elif "ona" in tf:
                    tipo_norm = "ONA"
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
