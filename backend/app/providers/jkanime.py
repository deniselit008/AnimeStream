"""
JKAnime Provider Adapter
"""
import re
import urllib.parse
from typing import List, Optional
import requests
from bs4 import BeautifulSoup

from backend.app.core.config import get_headers, REQUEST_TIMEOUT, fix_encoding
from backend.app.models import EpisodeItem, SearchResultItem, AnimeDetail, EpisodeRef, WatchDetail, VideoServer, DirectoryItem
from backend.app.providers.base import BaseAnimeProvider

class JKAnimeProvider(BaseAnimeProvider):
    name = "JKAnime"
    base_url = "https://jkanime.net"

    def _format_url(self, path_or_url: str) -> str:
        if path_or_url.startswith("http://") or path_or_url.startswith("https://"):
            return path_or_url
        if not path_or_url.startswith("/"):
            path_or_url = "/" + path_or_url
        return f"{self.base_url}{path_or_url}"

    def get_latest(self) -> List[EpisodeItem]:
        """Fetch latest published episodes from JKAnime homepage."""
        url = f"{self.base_url}/"
        headers = get_headers()
        res = requests.get(url, headers=headers, timeout=REQUEST_TIMEOUT)
        res.raise_for_status()
        res.encoding = "utf-8"

        soup = BeautifulSoup(res.text, "html.parser")
        items: List[EpisodeItem] = []
        seen = set()

        for a in soup.find_all("a", href=re.compile(r"(?:https://jkanime\.net)?/([^/]+)/(\d+)/?$")):
            href = a["href"]
            m = re.match(r"(?:https://jkanime\.net)?/([^/]+)/(\d+)/?", href)
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

            card = a.find_parent(class_=re.compile(r"col|item|card|anime")) or a
            img_el = card.find(class_=re.compile(r"set-bg")) or card.find("img")
            img_src = None
            if img_el:
                img_src = img_el.get("data-setbg") or img_el.get("src")

            # High-resolution fallback poster if specific thumbnail is not present
            if not img_src:
                img_src = f"https://cdn.jkdesa.com/assets/images/animes/image/{slug}.jpg"

            # Clean Title
            title_el = card.find(["h5", "h6", "h4", "h3"])
            raw_title = title_el.get_text(strip=True) if title_el else ""
            if not raw_title:
                text = card.get_text(" | ", strip=True)
                parts = [
                    p.strip() for p in text.split("|")
                    if p.strip() and not p.strip().startswith("Ep")
                    and p.strip() not in ["Hoy", "Ayer", "Detalles", "Ver ahora", "Nuevo", "ONA", "Special"]
                    and not re.search(r"^(Lunes|Martes|Miércoles|Miercoles|Jueves|Viernes|Sábado|Sabado|Domingo)\s+\d+", p.strip(), flags=re.I)
                ]
                raw_title = parts[-1] if parts else slug.replace("-", " ").title()

            # Clean episode suffix if present in title
            raw_title = re.sub(rf"\s*-\s*{re.escape(str(ep_num))}$", "", raw_title).strip()
            raw_title = fix_encoding(raw_title)

            items.append(EpisodeItem(
                title=raw_title,
                episode=ep_num,
                image=img_src,
                url=f"https://jkanime.net/{slug}/{ep_num}/",
                animeUrl=f"https://jkanime.net/{slug}/",
                source=self.name
            ))

        return items

    def search(self, query: str) -> List[SearchResultItem]:
        """Search anime on JKAnime."""
        encoded_query = urllib.parse.quote(query.strip())
        url = f"{self.base_url}/buscar/{encoded_query}/"
        headers = get_headers(referer=self.base_url)
        res = requests.get(url, headers=headers, timeout=REQUEST_TIMEOUT)
        res.raise_for_status()
        res.encoding = "utf-8"

        soup = BeautifulSoup(res.text, "html.parser")
        results: List[SearchResultItem] = []
        seen = set()

        for card in soup.select(".anime__item, .col-lg-2, .col-md-4, .col-6"):
            a = card.find("a", href=re.compile(r"(?:https://jkanime\.net)?/([^/]+)/$"))
            if not a:
                continue
            href = a["href"]
            slug = href.split("/")[-2]
            if slug in seen or slug in ["buscar", "horario", "directorio", "genero"]:
                continue
            seen.add(slug)

            img_el = card.find(class_=re.compile(r"set-bg")) or card.find("img")
            img_src = img_el.get("data-setbg") or img_el.get("src") if img_el else None
            if not img_src:
                img_src = f"https://cdn.jkdesa.com/assets/images/animes/image/{slug}.jpg"

            title_el = card.find(["h5", "h6", "h4", "h3"])
            title = title_el.get_text(strip=True) if title_el else slug.replace("-", " ").title()
            title = fix_encoding(title)

            results.append(SearchResultItem(
                title=title,
                url=f"https://jkanime.net/{slug}/",
                image=img_src,
                source=self.name,
                type="Anime"
            ))

        return results

    def get_anime(self, url: str) -> AnimeDetail:
        """Fetch anime metadata and full sorted episode list from JKAnime."""
        session = requests.Session()
        target_url = self._format_url(url)
        if not target_url.endswith("/"):
            target_url += "/"

        headers = get_headers(referer=self.base_url)
        res = session.get(target_url, headers=headers, timeout=REQUEST_TIMEOUT)
        res.raise_for_status()
        res.encoding = "utf-8"

        soup = BeautifulSoup(res.text, "html.parser")
        slug = target_url.rstrip("/").split("/")[-1]

        # 1. Title
        og_title = soup.find("meta", property="og:title")
        title = ""
        if og_title and og_title.get("content"):
            title = og_title["content"].split(" - anime")[0].strip()
        if not title:
            h3_candidates = [h.get_text(strip=True) for h in soup.find_all("h3") if h.get_text(strip=True) not in ["Buscado recientemente:", "Temporadas y relacionados", "Más secciones", "Te recomendamos"]]
            title = h3_candidates[0] if h3_candidates else slug.replace("-", " ").title()
        title = fix_encoding(title)

        # 2. Poster
        og_img = soup.find("meta", property="og:image")
        image = og_img["content"] if og_img and og_img.get("content") else f"https://cdn.jkdesa.com/assets/images/animes/image/{slug}.jpg"

        # 3. Synopsis
        desc_meta = soup.find("meta", attrs={"name": "description"})
        synopsis = desc_meta["content"].strip() if desc_meta and desc_meta.get("content") else ""
        synopsis = fix_encoding(synopsis)

        # 4. Genres
        genres = list(dict.fromkeys([
            fix_encoding(g.get_text(strip=True))
            for g in soup.find_all("a", href=re.compile(r"/genero/"))
            if g.get_text(strip=True)
        ]))

        # 5. Status
        status = "En emisión"
        for li in soup.find_all(["li", "p", "div"]):
            txt = li.get_text(" ", strip=True)
            if "Estado:" in txt:
                if "Finalizado" in txt:
                    status = "Finalizado"
                break

        # 6. Episodes List via AJAX or fallback
        token_meta = soup.find("meta", {"name": "csrf-token"})
        token = token_meta.get("content") if token_meta else ""

        aid = None
        guardar = soup.find(id="guardar-anime")
        if guardar and guardar.get("data-anime"):
            aid = guardar["data-anime"]
        if not aid:
            m_aid = re.search(r"ajax/episodes/(\d+)", res.text)
            if m_aid:
                aid = m_aid.group(1)

        episodes: List[EpisodeRef] = []
        total_eps = 0

        if aid:
            try:
                post_headers = headers.copy()
                post_headers.update({
                    "X-Requested-With": "XMLHttpRequest",
                    "Referer": target_url
                })
                if token:
                    post_headers["X-CSRF-TOKEN"] = token

                r_eps = session.post(
                    f"{self.base_url}/ajax/episodes/{aid}/1",
                    data={"_token": token},
                    headers=post_headers,
                    timeout=REQUEST_TIMEOUT
                )
                if r_eps.status_code == 200:
                    eps_json = r_eps.json()
                    total_eps = eps_json.get("total", 0)
                    # Page 1 items thumbnail mapping
                    page1_thumbs = {}
                    for item in eps_json.get("data", []):
                        ep_n = item.get("number")
                        img_filename = item.get("image")
                        if ep_n and img_filename:
                            page1_thumbs[ep_n] = f"https://cdn.jkdesa.com/assets/images/animes/video/image_thumb/{img_filename}"
            except Exception:
                pass

        # If total_eps was found, generate full list 1..total_eps
        if total_eps > 0:
            for i in range(1, total_eps + 1):
                episodes.append(EpisodeRef(
                    number=i,
                    title=f"Episodio {i}",
                    url=f"{self.base_url}/{slug}/{i}/",
                    image=page1_thumbs.get(i) if 'page1_thumbs' in locals() else None
                ))
        else:
            # Fallback to direct DOM links on page
            for a in soup.find_all("a", href=re.compile(rf"(?:{re.escape(self.base_url)})?/{re.escape(slug)}/(\d+)/?$")):
                m = re.match(rf"(?:{re.escape(self.base_url)})?/{re.escape(slug)}/(\d+)/?", a["href"])
                if m:
                    num = int(m.group(1))
                    episodes.append(EpisodeRef(
                        number=num,
                        title=f"Episodio {num}",
                        url=f"{self.base_url}/{slug}/{num}/"
                    ))

        # Sort ascending by episode number
        episodes.sort(key=lambda x: int(x.number) if isinstance(x.number, int) or str(x.number).isdigit() else 0)

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
        """Extract video player embed URLs for JKAnime episode."""
        target_url = self._format_url(url)
        if not target_url.endswith("/"):
            target_url += "/"

        headers = get_headers(referer=self.base_url)
        res = requests.get(target_url, headers=headers, timeout=REQUEST_TIMEOUT)
        res.raise_for_status()
        res.encoding = "utf-8"

        soup = BeautifulSoup(res.text, "html.parser")
        txt = res.text

        m_slug_ep = re.search(r"https://jkanime\.net/([^/]+)/(\d+)/?", target_url)
        slug = m_slug_ep.group(1) if m_slug_ep else ""
        ep_num = int(m_slug_ep.group(2)) if m_slug_ep else 1
        anime_url = f"{self.base_url}/{slug}/"

        # Anime Title
        anime_title = ""
        og_title = soup.find("meta", property="og:title")
        if og_title and og_title.get("content"):
            content = og_title["content"].split(" - anime")[0].strip()
            content = re.split(r"\s+(?:Sub\s+Espa|Online|gratis|HD|-)", content, flags=re.I)[0].strip()
            content = re.sub(rf"\s*-\s*{ep_num}$", "", content).strip()
            content = re.sub(rf"\s+{ep_num}$", "", content).strip()
            anime_title = re.sub(r"^\s*Ver\s+", "", content, flags=re.I).strip()

        if not anime_title or anime_title.lower().startswith("episodio"):
            title_el = soup.find("h1") or soup.find("h2")
            if title_el:
                raw_t = title_el.get_text(strip=True)
                raw_t = re.split(r"\s+(?:Sub\s+Espa|Online|gratis|HD|-)", raw_t, flags=re.I)[0].strip()
                raw_t = re.sub(rf"\s*-\s*{ep_num}$", "", raw_t).strip()
                raw_t = re.sub(rf"\s+{ep_num}$", "", raw_t).strip()
                if not raw_t.lower().startswith("episodio"):
                    anime_title = raw_t

        if not anime_title or anime_title.lower().startswith("episodio"):
            anime_title = slug.replace("-", " ").title()
        anime_title = fix_encoding(anime_title)

        # Prev / Next
        prev_url = f"{self.base_url}/{slug}/{ep_num - 1}/" if ep_num > 1 else None
        next_url = f"{self.base_url}/{slug}/{ep_num + 1}/"

        # Audio determination (DUB vs SUB)
        is_dub = any(k in (slug + " " + anime_title).lower() for k in ["latino", "castellano", "doblado", "dub"])
        audio_type = "DUB" if is_dub else "SUB"
        audio_prefix = f"[{audio_type}] "

        # Video Servers
        servers: List[VideoServer] = []
        video_embeds = re.findall(r'video\[\d+\]\s*=\s*[\'"]<iframe[^>]+src=[\'"]([^\'"]+)[\'"]', txt)
        server_names = [a.get_text(strip=True) for a in soup.select(".bg-servers a")]

        for idx, embed_url in enumerate(video_embeds):
            s_name = server_names[idx] if idx < len(server_names) else f"Servidor {idx + 1}"
            servers.append(VideoServer(name=f"{audio_prefix}{s_name}", embed=embed_url, audio=audio_type))

        # Check for remote video mirrors (Mediafire, Mega, etc.) in servers JSON
        m_remote_servers = re.search(r'var servers\s*=\s*(\[.*?\]);', txt)
        if m_remote_servers:
            try:
                import base64
                import json
                remote_data = json.loads(m_remote_servers.group(1))
                for s in remote_data:
                    name = s.get("server", "Descarga")
                    rem = s.get("remote")
                    if rem:
                        try:
                            decoded_url = base64.b64decode(rem).decode("utf-8").strip()
                            if decoded_url.startswith("http"):
                                servers.append(VideoServer(name=f"{audio_prefix}{name} (Mirror)", embed=decoded_url, audio=audio_type))
                        except Exception:
                            pass
            except Exception:
                pass

        # Image
        image = None
        og_img = soup.find("meta", property="og:image")
        if og_img and og_img.get("content"):
            image = og_img["content"]
        if not image:
            image = f"https://cdn.jkdesa.com/assets/images/animes/image/{slug}.jpg"

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
        """Fetch filtered catalog items from JKAnime /directorio/."""
        type_map = {
            "tv": "animes",
            "serie": "animes",
            "movie": "peliculas",
            "pelicula": "peliculas",
            "ova": "ovas",
            "special": "especiales",
            "especial": "especiales",
            "ona": "onas",
        }
        status_map = {
            "emision": "emision",
            "finalizado": "finalizados",
            "finalizados": "finalizados",
        }

        params = {}
        if genre and genre != "all":
            genre_list = [g.strip().lower() for g in genre.split(",") if g.strip() and g.strip() != "all"]
            if genre_list:
                params["genero"] = genre_list[0]
        if type_filter and type_filter != "all":
            mapped_type = type_map.get(type_filter.lower().strip(), type_filter.lower().strip())
            params["tipo"] = mapped_type
        if status and status != "all":
            mapped_status = status_map.get(status.lower().strip(), status.lower().strip())
            params["estado"] = mapped_status
        if year and year != "all":
            params["fecha"] = str(year).strip()
        if page > 1:
            params["p"] = str(page)

        query_string = urllib.parse.urlencode(params)
        url = f"{self.base_url}/directorio/?{query_string}" if query_string else f"{self.base_url}/directorio/"

        headers = get_headers(referer=self.base_url)
        res = requests.get(url, headers=headers, timeout=REQUEST_TIMEOUT)
        res.raise_for_status()
        res.encoding = "utf-8"

        items: List[DirectoryItem] = []
        m = re.search(r'var animes = ({.*?});\s*\n', res.text)
        if m:
            import json
            try:
                data = json.loads(m.group(1))
                anime_list = data.get("data", [])
                for a in anime_list:
                    title = fix_encoding(a.get("title", "").strip())
                    anime_url = a.get("url") or f"{self.base_url}/{a.get('slug')}/"
                    image = a.get("image") or f"https://cdn.jkdesa.com/assets/images/animes/image/{a.get('slug')}.jpg"
                    synopsis = fix_encoding(a.get("synopsis", ""))
                    
                    raw_tipo = a.get("tipo") or a.get("type") or "TV Anime"
                    tipo_norm = "TV Anime"
                    if "pel" in raw_tipo.lower():
                        tipo_norm = "Película"
                    elif "ova" in raw_tipo.lower():
                        tipo_norm = "OVA"
                    elif "ona" in raw_tipo.lower():
                        tipo_norm = "ONA"
                    elif "esp" in raw_tipo.lower():
                        tipo_norm = "Especial"

                    raw_estado = a.get("estado") or a.get("status") or "En emisión"
                    estado_norm = "En emisión" if "emi" in raw_estado.lower() or "curr" in raw_estado.lower() else "Finalizado"

                    items.append(DirectoryItem(
                        title=title,
                        url=anime_url,
                        image=image,
                        source=self.name,
                        type=tipo_norm,
                        status=estado_norm,
                        year=year if (year and year != "all") else None,
                        synopsis=synopsis
                    ))
            except Exception:
                pass

        return items
