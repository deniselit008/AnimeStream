"""
API Routes for AnimeStream Aggregator
Unified REST API endpoints with in-memory caching, error resilience, and rich OpenAPI documentation.
"""
import asyncio
import re
import os
import glob
import gzip
import logging
from typing import List, Optional
from xml.etree import ElementTree as ET
import requests
from fastapi import APIRouter, HTTPException, Query, Path, Response, UploadFile, File
from fastapi.responses import HTMLResponse

from backend.app.core.cache import cache
from backend.app.core.config import get_headers, REQUEST_TIMEOUT, get_random_user_agent
from backend.app.core.mal import fetch_mal_relations
from backend.app.models import (
    EpisodeItem,
    SearchResultItem,
    SearchResponse,
    AnimeDetail,
    AnimeRelationItem,
    WatchDetail,
    DirectoryItem,
    DirectoryResponse,
    MALParseResponse,
    CacheStatsResponse,
    MessageResponse,
    ErrorDetail
)
from backend.app.providers import (
    animeav1Provider,
    jkanimeProvider,
    tioanimeProvider,
    detect_provider_by_url
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api")


# ==============================================================================
# 1. CATÁLOGO Y EMISIÓN (Últimos episodios)
# ==============================================================================

@router.get(
    "/latest",
    response_model=List[EpisodeItem],
    tags=["Catálogo y Emisión"],
    summary="Obtener últimos episodios en emisión",
    response_description="Lista unificada de los episodios más recientes publicados en las fuentes seleccionadas.",
    responses={
        200: {
            "description": "Lista de episodios devuelta con éxito (desde caché o scraping en tiempo real).",
            "model": List[EpisodeItem]
        },
        502: {
            "description": "Error al conectar con los proveedores de anime.",
            "model": ErrorDetail
        }
    }
)
async def get_latest_episodes(
    source: Optional[str] = Query(
        "all",
        description="Filtro de proveedor de origen: `all` (combinar todos de forma entrelazada), `animeav1`, `jkanime` o `tioanime`.",
        examples=["all"]
    )
):
    """
    ### 📡 Extracción en Tiempo Real de Últimos Capítulos

    Consulta simultáneamente las portadas de los proveedores configurados (**AnimeAV1**, **JKAnime** y **TioAnime**):
    - **Entrelazado Equitativo:** Cuando `source=all`, intercala los capítulos de cada portal para ofrecer una portada variada.
    - **Aislamiento de Errores:** Si uno de los servidores externos no responde o está en mantenimiento, la respuesta devuelve los capítulos de los demás sin interrumpir la experiencia.
    - **Caché en Memoria:** Las respuestas válidas se almacenan en caché durante **15 minutos** para evitar la sobrecarga de los proveedores de origen.
    """
    cache_key = f"latest_{source.lower() if source else 'all'}"
    cached_data = cache.get(cache_key)
    if cached_data:
        return cached_data

    tasks = []
    src = source.lower() if source else "all"

    if src in ["all", "animeav1", "av1"]:
        tasks.append(asyncio.to_thread(animeav1Provider.get_latest))
    if src in ["all", "jkanime", "jk"]:
        tasks.append(asyncio.to_thread(jkanimeProvider.get_latest))
    if src in ["all", "tioanime", "tio"]:
        tasks.append(asyncio.to_thread(tioanimeProvider.get_latest))

    results = await asyncio.gather(*tasks, return_exceptions=True)

    combined_episodes: List[EpisodeItem] = []
    valid_lists = []
    for res in results:
        if isinstance(res, Exception):
            logger.error(f"Provider error fetching latest: {res}")
            continue
        if isinstance(res, list):
            valid_lists.append(res)
            combined_episodes.extend(res)

    # Interleave results if multiple providers returned data
    if src == "all" and len(valid_lists) > 1:
        interleaved: List[EpisodeItem] = []
        max_len = max(len(lst) for lst in valid_lists)
        for i in range(max_len):
            for lst in valid_lists:
                if i < len(lst):
                    interleaved.append(lst[i])
        combined_episodes = interleaved

    # Cache if we have results
    if combined_episodes:
        cache.set(cache_key, combined_episodes)

    return combined_episodes


# ==============================================================================
# 2. BÚSQUEDA MULTI-FUENTE
# ==============================================================================

@router.get(
    "/search",
    response_model=SearchResponse,
    tags=["Búsqueda Multi-Fuente"],
    summary="Búsqueda global simultánea de animes",
    response_description="Objeto con la consulta original, la lista agregada de animes coincidentes y los errores controlados si algún proveedor falló.",
    responses={
        200: {
            "description": "Búsqueda completada exitosamente.",
            "model": SearchResponse
        }
    }
)
async def search_anime(
    q: str = Query(
        ...,
        min_length=1,
        description="Nombre, título o palabra clave del anime a buscar.",
        examples=["Sousou no Frieren"]
    ),
    source: Optional[str] = Query(
        "all",
        description="Filtrar por proveedor específico: `all`, `animeav1`, `jkanime` o `tioanime`.",
        examples=["all"]
    )
):
    """
    ### 🔍 Búsqueda Concurrente Multifuente con Resiliencia Total

    Ejecuta la búsqueda de forma paralela en los buscadores de **AnimeAV1**, **JKAnime** y **TioAnime**:
    - **Comportamiento `Promise.allSettled`:** Si una web externa impone un captcha o tarda demasiado, sus errores se reportan en el campo `errors` y los resultados del resto de sitios se entregan de inmediato.
    - **Normalización de Formato:** Transforma los resultados heterogéneos de cada web en un esquema unificado con título, URL canónica, póster y tipo de producción.
    - **Caché Instantánea:** Almacena búsquedas frecuentes en memoria durante **15 minutos**.
    """
    query = q.strip()
    cache_key = f"search_{query.lower()}_{source.lower() if source else 'all'}"
    cached_data = cache.get(cache_key)
    if cached_data:
        return cached_data

    tasks = []
    labels = []
    src = source.lower() if source else "all"

    if src in ["all", "animeav1", "av1"]:
        tasks.append(asyncio.to_thread(animeav1Provider.search, query))
        labels.append("AnimeAV1")
    if src in ["all", "jkanime", "jk"]:
        tasks.append(asyncio.to_thread(jkanimeProvider.search, query))
        labels.append("JKAnime")
    if src in ["all", "tioanime", "tio"]:
        tasks.append(asyncio.to_thread(tioanimeProvider.search, query))
        labels.append("TioAnime")

    results = await asyncio.gather(*tasks, return_exceptions=True)

    combined_results: List[SearchResultItem] = []
    errors = []

    for label, res in zip(labels, results):
        if isinstance(res, Exception):
            logger.error(f"Error searching {label}: {res}")
            errors.append({"source": label, "error": str(res)})
            continue
        if isinstance(res, list):
            combined_results.extend(res)

    response_payload = {
        "query": query,
        "results": combined_results,
        "errors": errors
    }

    if combined_results:
        cache.set(cache_key, response_payload)

    return response_payload


# ==============================================================================
# 3. DIRECTORIO FILTRABLE
# ==============================================================================

@router.get(
    "/directory",
    response_model=DirectoryResponse,
    tags=["Directorio Filtrable"],
    summary="Explorar catálogo filtrable de animes",
    response_description="Listado de animes paginado según los criterios de género, tipo, año y estado.",
    responses={
        200: {
            "description": "Página del catálogo devuelta correctamente.",
            "model": DirectoryResponse
        }
    }
)
async def get_directory(
    genre: Optional[str] = Query(
        None,
        description="Filtro por uno o varios géneros/temáticas separados por coma (ej: `accion`, `fantasia` o `accion,fantasia`).",
        examples=["accion,fantasia"]
    ),
    type: Optional[str] = Query(
        None,
        description="Filtro por tipo de producción: `tv` (Serie TV), `movie` (Película), `ova` (OVA), `special` (Especial), `ona` (ONA).",
        examples=["tv"]
    ),
    year: Optional[str] = Query(
        None,
        description="Filtro por año de lanzamiento (desde `2026` hasta `1980`).",
        examples=["2024"]
    ),
    status: Optional[str] = Query(
        None,
        description="Filtro por estado de emisión: `emision` (En emisión) o `finalizado` (Finalizado).",
        examples=["emision"]
    ),
    source: Optional[str] = Query(
        "all",
        description="Filtrar por proveedor específico o combinar todos: `all`, `animeav1`, `jkanime`, `tioanime`.",
        examples=["all"]
    ),
    page: int = Query(
        1,
        ge=1,
        description="Número de página para la paginación (comienza en 1).",
        examples=[1]
    )
):
    """
    ### 📂 Explorador y Filtro Avanzado de Anime

    Permite navegar por el catálogo completo combinando múltiples criterios de clasificación:
    - **Filtro Multi-Género:** Permite filtrar por una o más categorías a la vez (ej: Acción + Fantasía).
    - **Años Extendidos:** Navega desde 2026 hasta los años 80 (1980).
    - **Formatos:** Series de Televisión, Películas cinemáticas, OVAs, ONAs y Especiales.
    - **Paginación Dinámica:** Conserva los parámetros activos en llamadas consecutivas (`page=1`, `page=2`, etc.).
    """
    def _clean(val):
        return val.strip() if isinstance(val, str) and val.strip() else None

    c_genre = _clean(genre)
    if c_genre:
        cleaned_genres = sorted(list(set(g.strip().lower() for g in c_genre.split(",") if g.strip() and g.strip().lower() != "all")))
        c_genre = ",".join(cleaned_genres) if cleaned_genres else None

    c_type = _clean(type)
    c_year = _clean(year)
    c_status = _clean(status)
    c_source = _clean(source) or "all"
    c_page = page if isinstance(page, int) and page >= 1 else 1

    cache_key = f"dir_{c_genre}_{c_type}_{c_year}_{c_status}_{c_source}_{c_page}".lower()
    cached = cache.get(cache_key)
    if cached:
        return cached

    tasks = []
    src = c_source.lower()

    if src in ["all", "animeav1", "av1"]:
        tasks.append(asyncio.to_thread(animeav1Provider.get_directory, c_genre, c_type, c_year, c_status, c_page))
    if src in ["all", "jkanime", "jk"]:
        tasks.append(asyncio.to_thread(jkanimeProvider.get_directory, c_genre, c_type, c_year, c_status, c_page))
    if src in ["all", "tioanime", "tio"]:
        tasks.append(asyncio.to_thread(tioanimeProvider.get_directory, c_genre, c_type, c_year, c_status, c_page))

    results = await asyncio.gather(*tasks, return_exceptions=True)

    valid_lists: List[List[DirectoryItem]] = []
    for res in results:
        if isinstance(res, Exception):
            logger.error(f"Provider error fetching directory: {res}")
            continue
        if isinstance(res, list):
            valid_lists.append(res)

    # Interleave results if multiple providers
    combined: List[DirectoryItem] = []
    if len(valid_lists) > 1:
        max_len = max(len(lst) for lst in valid_lists) if valid_lists else 0
        for i in range(max_len):
            for lst in valid_lists:
                if i < len(lst):
                    combined.append(lst[i])
    elif len(valid_lists) == 1:
        combined = valid_lists[0]

    response_data = DirectoryResponse(
        items=combined,
        page=c_page,
        has_next=len(combined) > 0,
        total=len(combined)
    )

    if combined:
        cache.set(cache_key, response_data)

    return response_data


# ==============================================================================
# 4. DETALLES DEL ANIME (Ficha técnica y episodios)
# ==============================================================================

@router.get(
    "/anime",
    response_model=AnimeDetail,
    tags=["Detalles del Anime"],
    summary="Obtener ficha técnica y lista de episodios",
    response_description="Ficha completa del anime con portada, banner, sinopsis, géneros, estado y array de episodios ordenados.",
    responses={
        200: {
            "description": "Ficha del anime recuperada satisfactoriamente.",
            "model": AnimeDetail
        },
        400: {
            "description": "URL no válida o proveedor no soportado.",
            "model": ErrorDetail
        },
        502: {
            "description": "Fallo al raspar la página del anime desde el proveedor de origen.",
            "model": ErrorDetail
        }
    }
)
async def get_anime_details(
    url: str = Query(
        ...,
        description="URL canónica de la ficha del anime en AnimeAV1, JKAnime o TioAnime.",
        examples=["https://jkanime.net/dragon-ball-super-beerus/"]
    )
):
    """
    ### 📑 Extracción de Ficha Técnica y Episodios

    Analiza la página principal de un anime en el proveedor especificado:
    - **Detección Automática:** Identifica la plataforma de origen a partir del dominio (`animeav1.com`, `jkanime.net`, `tioanime.com`).
    - **Lista Completa de Episodios:** Extrae todos los números de capítulos ordenados cronológicamente (gestionando paginación AJAX en series largas como *One Piece* o *Naruto*).
    - **Metadatos Enriquecidos:** Recupera título original, sinopsis traducida, lista de géneros y estado de publicación (*En emisión* / *Finalizado*).
    """
    provider = detect_provider_by_url(url)
    if not provider:
        raise HTTPException(
            status_code=400,
            detail="URL no soportada. Debe pertenecer a animeav1.com, jkanime.net o tioanime.com"
        )

    cache_key = f"anime_{url.strip().lower()}"
    cached_data = cache.get(cache_key)
    if cached_data:
        return cached_data

    try:
        anime_info = await asyncio.to_thread(provider.get_anime, url)

        # Enqueue or fetch franchise relations from MyAnimeList
        if not getattr(anime_info, 'relations', None):
            try:
                relations = await asyncio.wait_for(
                    asyncio.to_thread(fetch_mal_relations, anime_info.title),
                    timeout=2.5
                )
                anime_info.relations = relations
            except Exception as rel_err:
                logger.debug(f"Could not load MAL relations for {anime_info.title}: {rel_err}")

        cache.set(cache_key, anime_info)
        return anime_info
    except Exception as e:
        logger.error(f"Error fetching anime detail from {url}: {e}", exc_info=True)
        raise HTTPException(
            status_code=502,
            detail=f"No se pudo extraer la información del anime ({provider.name}). Causa: {str(e)}"
        )


@router.get(
    "/anime/relations",
    response_model=List[AnimeRelationItem],
    tags=["Detalles del Anime"],
    summary="Obtener obras relacionadas (secuelas, precuelas, películas) desde MyAnimeList",
    response_description="Lista completa de animes y producciones del universo de la franquicia ordenadas lógicamente."
)
async def get_anime_relations(
    title: str = Query(..., min_length=1, description="Título del anime a consultar en MyAnimeList.", examples=["Naruto"])
):
    """
    ### 🔗 Franquicia y Animes Relacionados (MyAnimeList)

    Busca en MyAnimeList las obras vinculadas a la franquicia:
    - **Secuelas (`Sequel`):** Temporadas posteriores y continuaciones canónicas.
    - **Precuelas (`Prequel`):** Orígenes y temporadas anteriores.
    - **Historias Paralelas (`Side Story`):** OVAs, especiales y películas complementarias.
    - **Películas y Resúmenes (`Summary`):** Recopilatorios y películas de cine.
    - **Spin-offs:** Series derivadas de personajes o universos alternativos.
    - **Adaptaciones:** Manga y novelas ligeras de origen.
    """
    clean_title = title.strip()
    return await asyncio.to_thread(fetch_mal_relations, clean_title)


# ==============================================================================
# 5. SALA DE REPRODUCCIÓN Y STREAMING
# ==============================================================================

@router.get(
    "/watch",
    response_model=WatchDetail,
    tags=["Sala de Reproducción y Streaming"],
    summary="Obtener servidores de vídeo para un episodio",
    response_description="Detalles del episodio actual, navegación (episodio anterior y siguiente) y listado de servidores embebidos.",
    responses={
        200: {
            "description": "Servidores de vídeo extraídos con éxito.",
            "model": WatchDetail
        },
        400: {
            "description": "URL no válida o proveedor no soportado.",
            "model": ErrorDetail
        },
        502: {
            "description": "No se pudieron obtener los reproductores del capítulo.",
            "model": ErrorDetail
        }
    }
)
async def get_watch_episode(
    url: str = Query(
        ...,
        description="URL canónica del episodio en AnimeAV1, JKAnime o TioAnime.",
        examples=["https://animeav1.com/media/dark-machine-the-animation/2"]
    )
):
    """
    ### 🎬 Extracción de Reproductores y Navegación

    Extrae todos los servidores de vídeo disponibles para un capítulo específico:
    - **Multiservidor:** Obtiene iframes directos hacia servicios como *HLS Directo, Mega, Voe, Desu, Magi, YourUpload, MP4Upload, etc.*
    - **Enlaces de Navegación:** Identifica las URLs del capítulo previo (`prevUrl`) y posterior (`nextUrl`) para permitir navegación fluida.
    - **Proxy HLS Automático:** Si el capítulo proviene de un servidor HLS protegido por hotlinking, devuelve la ruta hacia el proxy local `/api/hls/player/{hash}`.
    """
    provider = detect_provider_by_url(url)
    if not provider:
        raise HTTPException(
            status_code=400,
            detail="URL no soportada. Debe pertenecer a animeav1.com, jkanime.net o tioanime.com"
        )

    cache_key = f"watch_{url.strip().lower()}"
    cached_data = cache.get(cache_key)
    if cached_data:
        return cached_data

    try:
        watch_info = await asyncio.to_thread(provider.get_watch, url)
        cache.set(cache_key, watch_info)
        return watch_info
    except Exception as e:
        logger.error(f"Error fetching watch info from {url}: {e}", exc_info=True)
        raise HTTPException(
            status_code=502,
            detail=f"No se pudieron extraer los reproductores del episodio ({provider.name}). Causa: {str(e)}"
        )


# Setup persistent session for HLS stream proxying
zilla_session = requests.Session()
adapter = requests.adapters.HTTPAdapter(pool_connections=25, pool_maxsize=25)
zilla_session.mount("https://", adapter)

def get_hls_player_html(hash_id: str) -> str:
    return f"""<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reproductor HLS HD</title>
  <script src="/js/vendor/hls.min.js" onerror="this.onerror=null; this.src='https://cdn.jsdelivr.net/npm/hls.js@latest';"></script>
  <style>
    * {{ margin: 0; padding: 0; box-sizing: border-box; }}
    html, body {{ width: 100%; height: 100%; background: #000; overflow: hidden; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }}
    #video-wrapper {{ position: relative; width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; }}
    video {{ width: 100%; height: 100%; object-fit: contain; outline: none; }}
    .loading-overlay {{
      position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center;
      background: rgba(11, 15, 25, 0.95); color: #f8fafc; font-size: 15px; gap: 14px; z-index: 10;
      transition: opacity 0.3s ease;
    }}
    .spinner {{
      width: 44px; height: 44px; border: 4px solid rgba(255,255,255,0.15); border-top-color: #f47521;
      border-radius: 50%; animation: spin 0.8s linear infinite;
    }}
    .error-msg {{ color: #ef4444; font-weight: 600; text-align: center; max-width: 80%; line-height: 1.5; }}
    @keyframes spin {{ to {{ transform: rotate(360deg); }} }}

    /* On-Screen Feedback HUD (Volume & Seek) */
    .player-hud {{
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%) scale(0.9);
      background: rgba(10, 15, 30, 0.92);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      color: #fff;
      padding: 16px 28px;
      border-radius: 14px;
      font-size: 1.25rem;
      font-weight: 700;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 10px;
      border: 1px solid rgba(244, 117, 33, 0.45);
      box-shadow: 0 12px 36px rgba(0, 0, 0, 0.75);
      pointer-events: none;
      opacity: 0;
      transition: opacity 0.12s ease, transform 0.12s ease;
      z-index: 100;
    }}
    .player-hud.visible {{
      opacity: 1;
      transform: translate(-50%, -50%) scale(1);
    }}
    .hud-bar {{
      width: 160px;
      height: 8px;
      background: rgba(255, 255, 255, 0.2);
      border-radius: 4px;
      overflow: hidden;
      display: none;
    }}
    .hud-bar-fill {{
      height: 100%;
      background: #f47521;
      border-radius: 4px;
      transition: width 0.08s ease;
    }}
  </style>
</head>
<body>
  <div id="video-wrapper">
    <div id="loading" class="loading-overlay">
      <div class="spinner"></div>
      <span id="loading-text">Cargando reproductor HLS en alta definición...</span>
    </div>
    <div id="player-hud" class="player-hud">
      <span id="hud-text"></span>
      <div id="hud-bar" class="hud-bar">
        <div id="hud-bar-fill" class="hud-bar-fill"></div>
      </div>
    </div>
    <video id="video" controls playsinline tabindex="0"></video>
  </div>
  <script>
    const video = document.getElementById('video');
    const loading = document.getElementById('loading');
    const loadingText = document.getElementById('loading-text');
    const hud = document.getElementById('player-hud');
    const hudText = document.getElementById('hud-text');
    const hudBar = document.getElementById('hud-bar');
    const hudBarFill = document.getElementById('hud-bar-fill');
    const wrapper = document.getElementById('video-wrapper');
    const source = '/api/hls/m3u8/{hash_id}';
    const STORAGE_KEY_VOLUME = 'animestream_player_volume';
    let hudTimer = null;

    // Restore saved volume level from previous episode / session
    try {{
      const savedVol = localStorage.getItem(STORAGE_KEY_VOLUME);
      if (savedVol !== null && !isNaN(Number(savedVol))) {{
        video.volume = Math.max(0, Math.min(1, parseFloat(savedVol)));
      }} else {{
        video.volume = 1.0;
      }}
    }} catch (e) {{
      video.volume = 1.0;
    }}

    function formatTime(secs) {{
      if (!secs || isNaN(secs) || secs < 0) return '00:00';
      const m = Math.floor(secs / 60);
      const s = Math.floor(secs % 60);
      return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
    }}

    function showHUD(text, percent = null) {{
      hudText.textContent = text;
      if (percent !== null) {{
        hudBar.style.display = 'block';
        hudBarFill.style.width = Math.max(0, Math.min(100, Math.round(percent))) + '%';
      }} else {{
        hudBar.style.display = 'none';
      }}
      hud.classList.add('visible');
      if (hudTimer) clearTimeout(hudTimer);
      hudTimer = setTimeout(() => hud.classList.remove('visible'), 1200);
    }}

    // Exported globally on window so parent frames can call directly
    window.changeVolume = function(delta) {{
      if (video.muted) video.muted = false;
      let newVol = Math.round((video.volume + delta) * 100) / 100;
      newVol = Math.max(0, Math.min(1, newVol));
      video.volume = newVol;
      try {{
        localStorage.setItem(STORAGE_KEY_VOLUME, String(newVol));
      }} catch (e) {{}}
      const pct = Math.round(newVol * 100);
      const icon = newVol === 0 ? '🔇' : (newVol < 0.5 ? '🔉' : '🔊');
      showHUD(icon + ' Volumen: ' + pct + '%', pct);
      return pct;
    }};

    // Also persist volume whenever user interacts with native controls slider
    video.addEventListener('volumechange', function() {{
      if (!video.muted) {{
        try {{
          localStorage.setItem(STORAGE_KEY_VOLUME, String(Math.round(video.volume * 100) / 100));
        }} catch (e) {{}}
      }}
    }});

    window.seekRelative = function(delta) {{
      const dur = video.duration || 0;
      const newTime = Math.max(0, Math.min(dur || 999999, video.currentTime + delta));
      video.currentTime = newTime;
      const sign = delta > 0 ? '+10s' : '-10s';
      const icon = delta > 0 ? '⏩' : '⏪';
      showHUD(icon + ' ' + sign + ' (' + formatTime(newTime) + (dur ? ' / ' + formatTime(dur) : '') + ')');
      return newTime;
    }};

    window.togglePlay = function() {{
      if (video.paused) {{
        video.play().catch(() => {{}});
        showHUD('▶ Reproduciendo');
      }} else {{
        video.pause();
        showHUD('⏸ Pausado');
      }}
    }};

    window.toggleMute = function() {{
      video.muted = !video.muted;
      if (video.muted) {{
        showHUD('🔇 Silenciado', 0);
      }} else {{
        const pct = Math.round(video.volume * 100);
        showHUD('🔊 Volumen: ' + pct + '%', pct);
      }}
    }};

    window.toggleFullscreen = function() {{
      const isFs = document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement;
      if (!isFs) {{
        if (wrapper.requestFullscreen) {{
          wrapper.requestFullscreen().catch(() => {{
            if (video.requestFullscreen) video.requestFullscreen().catch(() => {{}});
          }});
        }} else if (wrapper.webkitRequestFullscreen) {{
          wrapper.webkitRequestFullscreen();
        }} else if (video.webkitEnterFullscreen) {{
          video.webkitEnterFullscreen();
        }}
      }} else {{
        if (document.exitFullscreen) {{
          document.exitFullscreen().catch(() => {{}});
        }} else if (document.webkitExitFullscreen) {{
          document.webkitExitFullscreen();
        }}
      }}
    }};

    // Handle Keyboard Shortcuts inside player iframe (CAPTURE PHASE to override Chromium defaults)
    function handlePlayerKey(e) {{
      const k = e.key || e.code;
      if (k === 'ArrowUp' || e.code === 'ArrowUp') {{
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        window.changeVolume(0.05);
        return false;
      }}
      if (k === 'ArrowDown' || e.code === 'ArrowDown') {{
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        window.changeVolume(-0.05);
        return false;
      }}
      if (k === 'ArrowRight' || e.code === 'ArrowRight') {{
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        window.seekRelative(10);
        return false;
      }}
      if (k === 'ArrowLeft' || e.code === 'ArrowLeft') {{
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        window.seekRelative(-10);
        return false;
      }}
      if (k === ' ' || e.code === 'Space') {{
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        window.togglePlay();
        return false;
      }}
      if (k === 'm' || k === 'M' || e.code === 'KeyM') {{
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        window.toggleMute();
        return false;
      }}
      if (k === 'f' || k === 'F' || e.code === 'KeyF') {{
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        window.toggleFullscreen();
        return false;
      }}
    }}

    // Bind with capture=true on window, document and video to prevent native 5s seek and 10% volume
    window.addEventListener('keydown', handlePlayerKey, true);
    document.addEventListener('keydown', handlePlayerKey, true);
    video.addEventListener('keydown', handlePlayerKey, true);

    // Handle commands dispatched from parent window via postMessage
    window.addEventListener('message', function(e) {{
      if (!e.data || e.data.type !== 'PLAYER_CMD') return;
      switch (e.data.cmd) {{
        case 'volume_up':
          window.changeVolume(0.05);
          break;
        case 'volume_down':
          window.changeVolume(-0.05);
          break;
        case 'seek_forward':
          window.seekRelative(10);
          break;
        case 'seek_backward':
          window.seekRelative(-10);
          break;
        case 'toggle_play':
          window.togglePlay();
          break;
        case 'toggle_mute':
          window.toggleMute();
          break;
      }}
    }});

    function hideLoading() {{
      loading.style.opacity = '0';
      setTimeout(() => loading.style.display = 'none', 300);
    }}

    function showError(msg) {{
      loading.innerHTML = '<div class="error-msg">⚠️ ' + msg + '</div>';
    }}

    if (Hls.isSupported()) {{
      const hls = new Hls({{
        enableWorker: true,
        lowLatencyMode: false,
        maxBufferLength: 30,
        maxMaxBufferLength: 60
      }});
      hls.loadSource(source);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, function () {{
        hideLoading();
        video.play().catch(() => {{}});
      }});
      hls.on(Hls.Events.ERROR, function (event, data) {{
        console.warn('HLS Event:', data);
        if (data.fatal) {{
          switch (data.type) {{
            case Hls.ErrorTypes.NETWORK_ERROR:
              loadingText.textContent = 'Reconectando con la transmisión HLS...';
              hls.startLoad();
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              loadingText.textContent = 'Optimizando búfer multimedia...';
              hls.recoverMediaError();
              break;
            default:
              showError('No se pudo reproducir este flujo HLS. Por favor selecciona otro servidor.');
              hls.destroy();
              break;
          }}
        }}
      }});
    }} else if (video.canPlayType('application/vnd.apple.mpegurl')) {{
      video.src = source;
      video.addEventListener('loadedmetadata', function () {{
        hideLoading();
        video.play().catch(() => {{}});
      }});
      video.addEventListener('error', function () {{
        showError('Error al reproducir el flujo HLS.');
      }});
    }} else {{
      showError('Tu navegador no soporta HLS.');
    }}
  </script>
</body>
</html>
"""


@router.get(
    "/hls/player/{hash_id}",
    response_class=HTMLResponse,
    tags=["Sala de Reproducción y Streaming"],
    summary="Reproductor HTML5 embebible para flujo HLS",
    response_description="Documento HTML con hls.js preconfigurado para reproducir la transmisión HLS de forma fluida."
)
async def get_hls_player(
    hash_id: str = Path(
        ...,
        description="Identificador hash hexadecimal del flujo de vídeo.",
        examples=["3586d5b0201df9527045f57c57eb9241"]
    )
):
    """
    ### 📺 Reproductor Embebible Local (HLS Player)

    Genera una página HTML optimizada para reproducir transmisiones HLS (`.m3u8`):
    - Incluye soporte nativo para **Hls.js** local con fallback.
    - Maneja reintentos automáticos ante cortes de red o microbúferes.
    - Apunta al proxy interno `/api/hls/m3u8/{hash_id}` para garantizar que el navegador nunca reciba un error `403 Forbidden`.
    """
    clean_hash = re.sub(r"[^a-fA-F0-9]", "", hash_id)
    html = get_hls_player_html(clean_hash)
    return HTMLResponse(content=html, headers={"Access-Control-Allow-Origin": "*"})


@router.get(
    "/hls/m3u8/{hash_id}",
    tags=["Sala de Reproducción y Streaming"],
    summary="Proxy y reescritor de manifiesto HLS .m3u8",
    response_description="Manifiesto HLS con URLs de segmentos MPEG-TS reescritas hacia el proxy local.",
    responses={
        200: {
            "description": "Manifiesto .m3u8 reescrito devuelto con cabeceras CORS y tipo MIME application/vnd.apple.mpegurl."
        },
        502: {
            "description": "Fallo al obtener el manifiesto HLS remoto.",
            "model": ErrorDetail
        }
    }
)
async def get_hls_m3u8(
    hash_id: str = Path(
        ...,
        description="Identificador hash del vídeo HLS a retransmitir.",
        examples=["3586d5b0201df9527045f57c57eb9241"]
    )
):
    """
    ### 🔄 Proxy y Reescritor de Listas de Reproducción HLS (.m3u8)

    Descarga el manifiesto `.m3u8` original enviando las cabeceras `Referer` y `Origin` que el CDN remoto exige:
    - **Reescritura de Segmentos:** Convierte todas las URLs absolutas de segmentos en rutas locales `/api/hls/seg/{hash_id}/{filename}`.
    - **Bypass de CORS:** Aplica cabeceras `Access-Control-Allow-Origin: *` para permitir la reproducción en cualquier cliente web.
    """
    clean_hash = re.sub(r"[^a-fA-F0-9]", "", hash_id)
    ua = get_random_user_agent()

    # Step 1: Initialize session on play page
    h_play = {
        "User-Agent": ua,
        "Referer": "https://animeav1.com/"
    }
    try:
        await asyncio.to_thread(
            zilla_session.get, f"https://player.zilla-networks.com/play/{clean_hash}", headers=h_play, timeout=8
        )
    except Exception:
        pass

    # Step 2: Fetch m3u8 playlist
    h_m3u8 = {
        "User-Agent": ua,
        "Referer": f"https://player.zilla-networks.com/play/{clean_hash}",
        "Origin": "https://player.zilla-networks.com",
        "Sec-Fetch-Dest": "empty",
        "Sec-Fetch-Mode": "cors",
        "Sec-Fetch-Site": "same-origin"
    }

    try:
        r_m3u8 = await asyncio.to_thread(
            zilla_session.get, f"https://player.zilla-networks.com/m3u8/{clean_hash}", headers=h_m3u8, timeout=REQUEST_TIMEOUT
        )
        if r_m3u8.status_code != 200:
            raise HTTPException(status_code=r_m3u8.status_code, detail="No se pudo obtener el manifiesto HLS")

        # Rewrite absolute segment links to local proxy endpoints
        rewritten = re.sub(
            rf"https://player\.zilla-networks\.com/segs/{clean_hash}/([a-zA-Z0-9_\-\.]+)",
            rf"/api/hls/seg/{clean_hash}/\1",
            r_m3u8.text
        )

        return Response(
            content=rewritten,
            media_type="application/vnd.apple.mpegurl",
            headers={
                "Access-Control-Allow-Origin": "*",
                "Cache-Control": "public, max-age=300"
            }
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching m3u8 for {clean_hash}: {e}")
        raise HTTPException(status_code=502, detail=f"Error al obtener el manifiesto HLS: {str(e)}")


@router.get(
    "/hls/seg/{hash_id}/{filename}",
    tags=["Sala de Reproducción y Streaming"],
    summary="Proxy de fragmentos de vídeo MPEG-TS (.ts)",
    response_description="Fragmento binario de vídeo MPEG-TS (.ts) transmitido directamente desde el CDN remoto.",
    responses={
        200: {
            "description": "Fragmento binario de vídeo devuelto correctamente."
        },
        502: {
            "description": "Error al descargar el segmento de vídeo desde el CDN remoto.",
            "model": ErrorDetail
        }
    }
)
async def get_hls_segment(
    hash_id: str = Path(..., description="Hash del vídeo HLS."),
    filename: str = Path(..., description="Nombre del archivo de segmento (ej: `seg-1-v1-a1.ts`).")
):
    """
    ### 📦 Proxy Inverso de Segmentos de Vídeo (.ts)

    Transmite de forma transparente los bloques binarios de vídeo a través del servidor local:
    - Conserva las cabeceras `Referer` y `Sec-Fetch-Site` requeridas para eludir el hotlinking.
    - Devuelve `Cache-Control: public, max-age=86400` para que el navegador guarde en búfer local los fragmentos ya descargados.
    """
    clean_hash = re.sub(r"[^a-fA-F0-9]", "", hash_id)
    clean_file = re.sub(r"[^a-zA-Z0-9_\-\.]", "", filename)

    h_seg = {
        "User-Agent": get_random_user_agent(),
        "Referer": f"https://player.zilla-networks.com/play/{clean_hash}",
        "Origin": "https://player.zilla-networks.com",
        "Sec-Fetch-Dest": "empty",
        "Sec-Fetch-Mode": "cors",
        "Sec-Fetch-Site": "same-origin"
    }

    try:
        r_seg = await asyncio.to_thread(
            zilla_session.get, f"https://player.zilla-networks.com/segs/{clean_hash}/{clean_file}", headers=h_seg, timeout=REQUEST_TIMEOUT
        )
        if r_seg.status_code != 200:
            raise HTTPException(status_code=r_seg.status_code, detail="Segmento no disponible")

        content_type = "video/mp2t" if clean_file.endswith((".ts", ".html")) else "application/octet-stream"
        return Response(
            content=r_seg.content,
            media_type=content_type,
            headers={
                "Access-Control-Allow-Origin": "*",
                "Cache-Control": "public, max-age=86400"
            }
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching segment {clean_file} for {clean_hash}: {e}")
        raise HTTPException(status_code=502, detail=f"Error al transmitir segmento HLS: {str(e)}")


# ==============================================================================
# AD-BLOCKING DOMAINS & SANITIZER
# ==============================================================================

AD_DOMAINS = [
    "popads", "popcash", "adcash", "adsterra", "propellerads", "exoclick",
    "monetag", "clickadu", "histats", "doubleclick", "googlesyndication",
    "bet365", "1xbet", "mgid", "onclickperformance", "trafficfactory",
    "juicyads", "hilltopads", "ad-maven", "ezmob", "realsrv", "zeroredirect",
    "deloton", "adsco", "creativecdn", "tsyndicate", "adtrue", "vidoomy"
]

def sanitize_player_html(html: str) -> str:
    """Removes aggressive third-party ad scripts, popunders, and injects protective AdBlock shield."""
    if not html:
        return html

    # 1. Remove script and iframe tags loading known ad network domains
    for domain in AD_DOMAINS:
        html = re.sub(rf'<script[^>]*src=[\'"][^\'"]*{re.escape(domain)}[^\'"]*[\'"][^>]*>.*?</script>', '', html, flags=re.I | re.S)
        html = re.sub(rf'<script[^>]*src=[\'"][^\'"]*{re.escape(domain)}[^\'"]*[\'"][^>]*/>', '', html, flags=re.I)
        html = re.sub(rf'<iframe[^>]*src=[\'"][^\'"]*{re.escape(domain)}[^\'"]*[\'"][^>]*>.*?</iframe>', '', html, flags=re.I | re.S)

    # 2. Inject protective AdBlock Shield script inside player head
    shield_script = """<script>
    (function() {
      // AnimeStream Embedded AdBlock & Anti-Popup Shield
      try {
        window.open = function(url) {
          console.warn('[AnimeStream AdBlock] Bloqueado popup no deseado:', url);
          return null;
        };
        window.alert = function() {};
        window.confirm = function() { return false; };
        window.prompt = function() { return null; };

        // Prevent top navigation hijack
        try {
          Object.defineProperty(window, 'top', { get: function() { return window; } });
        } catch(e) {}

        // Remove clickjacking transparent overlays
        function purgeAdOverlays() {
          try {
            var items = document.querySelectorAll('div, a, span, section');
            for (var i = 0; i < items.length; i++) {
              var el = items[i];
              if (el.tagName === 'VIDEO' || el.querySelector('video') || el.classList.contains('jw-video')) continue;
              var s = window.getComputedStyle(el);
              var pos = s.position;
              var zi = parseInt(s.zIndex, 10) || 0;
              var op = parseFloat(s.opacity);
              if ((pos === 'fixed' || pos === 'absolute') && zi >= 50 && (op < 0.1 || s.visibility === 'hidden' || s.backgroundColor === 'transparent')) {
                var r = el.getBoundingClientRect();
                if (r.width >= window.innerWidth * 0.5 && r.height >= window.innerHeight * 0.5) {
                  el.remove();
                }
              }
            }
          } catch(e) {}
        }
        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', purgeAdOverlays);
        } else {
          purgeAdOverlays();
        }
        setInterval(purgeAdOverlays, 800);
      } catch(e) {}
    })();
    </script>"""

    if "<head>" in html:
        html = html.replace("<head>", f"<head>\n{shield_script}", 1)
    elif "<HEAD>" in html:
        html = html.replace("<HEAD>", f"<HEAD>\n{shield_script}", 1)
    else:
        html = f"{shield_script}\n{html}"

    return html


@router.get(
    "/proxy-player",
    response_class=HTMLResponse,
    tags=["Sala de Reproducción y Streaming"],
    summary="Proxy HTML con AdBlocker integrado para reproductores de terceros",
    response_description="Página HTML del reproductor remoto limpia de publicidad, popups y cabeceras restrictivas X-Frame-Options."
)
async def proxy_player(
    url: str = Query(..., description="URL del reproductor embebido que restringe incrustaciones."),
    ref: Optional[str] = Query(None, description="Cabecera Referer que espera el servidor de vídeo."),
    adblock: bool = Query(True, description="Activar filtro de limpieza y bloqueo de anuncios/popups.")
):
    """
    ### 🛡️ Desactivador de Restricciones Iframe con Escudo AdBlock

    Descarga el código HTML del reproductor remoto eliminando las cabeceras restrictivas y anuncios:
    - Neutraliza scripts de redes publicitarias agresivas y popunders.
    - Inyecta escudo anti-clickjacking para evitar secuestro de clics.
    - Elimina `Content-Security-Policy` restrictivo y `X-Frame-Options: SAMEORIGIN / DENY`.
    - Sobrescribe con `X-Frame-Options: ALLOWALL` y `Access-Control-Allow-Origin: *`.
    """
    try:
        headers = get_headers(referer=ref)
        res = await asyncio.to_thread(requests.get, url, headers=headers, timeout=REQUEST_TIMEOUT)

        excluded_headers = ["content-security-policy", "x-frame-options", "content-encoding", "transfer-encoding"]
        response_headers = {
            k: v for k, v in res.headers.items()
            if k.lower() not in excluded_headers
        }
        response_headers["X-Frame-Options"] = "ALLOWALL"
        response_headers["Access-Control-Allow-Origin"] = "*"

        content_html = sanitize_player_html(res.text) if adblock else res.text

        return HTMLResponse(content=content_html, status_code=res.status_code, headers=response_headers)
    except Exception as e:
        logger.error(f"Proxy player error for {url}: {e}")
        return HTMLResponse(
            content=f"<h3>Error al cargar el reproductor:</h3><p>{str(e)}</p>",
            status_code=502
        )


# ==============================================================================
# 6. BIBLIOTECA MYANIMELIST
# ==============================================================================

def parse_mal_xml(xml_content: str):
    root = ET.fromstring(xml_content)
    user_name = root.findtext("myinfo/user_name", "Usuario")

    status_mapping = {
        "Watching": ("watching", "Viendo"),
        "1": ("watching", "Viendo"),
        "Completed": ("completed", "Visto"),
        "2": ("completed", "Visto"),
        "On-Hold": ("on_hold", "Pausado"),
        "3": ("on_hold", "Pausado"),
        "Dropped": ("dropped", "Abandonado"),
        "4": ("dropped", "Abandonado"),
        "Plan to Watch": ("plan_to_watch", "Pendiente"),
        "6": ("plan_to_watch", "Pendiente"),
    }

    animes = []
    stats = {
        "watching": 0,
        "completed": 0,
        "on_hold": 0,
        "dropped": 0,
        "plan_to_watch": 0,
    }

    for a in root.findall("anime"):
        title = a.findtext("series_title", "").strip()
        if not title:
            continue

        raw_status = a.findtext("my_status", "Plan to Watch").strip()
        status_key, status_label = status_mapping.get(raw_status, ("plan_to_watch", "Pendiente"))

        if status_key in stats:
            stats[status_key] += 1

        try:
            total_eps = int(a.findtext("series_episodes", "0") or 0)
        except Exception:
            total_eps = 0

        try:
            watched_eps = int(a.findtext("my_watched_episodes", "0") or 0)
        except Exception:
            watched_eps = 0

        try:
            raw_score = a.findtext("my_score", "0") or "0"
            score = int(float(str(raw_score).strip()))
        except Exception:
            score = 0

        stype = a.findtext("series_type", "TV").strip()
        aid = a.findtext("series_animedb_id", "").strip()

        animes.append({
            "id": aid,
            "title": title,
            "type": stype,
            "totalEpisodes": total_eps,
            "watchedEpisodes": watched_eps,
            "score": score,
            "status": status_key,
            "statusLabel": status_label,
            "updatedAt": a.findtext("my_finish_date") or a.findtext("my_start_date") or None
        })

    return {
        "username": user_name,
        "total": len(animes),
        "stats": stats,
        "animes": animes
    }


@router.post(
    "/library/parse-mal",
    response_model=MALParseResponse,
    tags=["Biblioteca MyAnimeList"],
    summary="Importar archivo de exportación de MyAnimeList (.xml / .xml.gz)",
    response_description="Estructura JSON con estadísticas de seguimiento y lista de animes clasificados por estado.",
    responses={
        200: {
            "description": "Lista de MyAnimeList procesada e importada satisfactoriamente.",
            "model": MALParseResponse
        },
        400: {
            "description": "Formato de archivo inválido o XML corrupto.",
            "model": ErrorDetail
        }
    }
)
async def parse_mal_upload(
    file: UploadFile = File(
        ...,
        description="Archivo de exportación de MyAnimeList, ya sea comprimido en GZIP (`.xml.gz`) o en texto plano (`.xml`)."
    )
):
    """
    ### 📥 Importación Manual de MyAnimeList

    Procesa archivos descargados desde `https://myanimelist.net/panel.php?go=export`:
    - **Soporte GZIP Automático:** Detecta y descomprime de inmediato archivos `.xml.gz` en memoria sin requerir herramientas externas.
    - **Clasificación Automática:** Agrupa en *Viendo (`watching`)*, *Visto (`completed`)*, *Pausado (`on_hold`)*, *Abandonado (`dropped`)* y *Pendiente (`plan_to_watch`)*.
    - **Metadatos del Usuario:** Extrae puntuaciones personales (0-10), recuento de episodios vistos y fecha de actualización.
    """
    try:
        content = await file.read()
        filename = (file.filename or "").lower()
        if filename.endswith(".gz") or content[:2] == b"\x1f\x8b":
            xml_text = gzip.decompress(content).decode("utf-8", errors="ignore")
        else:
            xml_text = content.decode("utf-8", errors="ignore")

        data = parse_mal_xml(xml_text)
        return data
    except Exception as e:
        logger.error(f"Error parsing uploaded MAL file: {e}")
        raise HTTPException(
            status_code=400,
            detail=f"No se pudo procesar el archivo de MyAnimeList: {str(e)}"
        )


@router.get(
    "/library/local-file",
    response_model=MALParseResponse,
    tags=["Biblioteca MyAnimeList"],
    summary="Auto-detectar e importar lista de MyAnimeList local",
    response_description="Detecta de forma inteligente y carga el archivo animelist*.xml.gz más reciente del equipo local.",
    responses={
        200: {
            "description": "Resultado de la búsqueda local (con datos del archivo si fue encontrado).",
            "model": MALParseResponse
        }
    }
)
async def detect_local_mal_file():
    """
    ### 📂 Detección Automática de Exportaciones en el Ordenador

    Escanea las carpetas habituales de descargas y documentos en busca del archivo de MyAnimeList:
    - Carpetas inspeccionadas: `~/Downloads`, `~/Descargas`, `~/Desktop`, `~/Escritorio`, `~/Documents` y la raíz del proyecto.
    - Patrón de búsqueda: `animelist*.xml.gz` y `animelist*.xml`.
    - Si encuentra varios, selecciona automáticamente el **más reciente** según fecha de modificación.
    """
    try:
        user_home = os.path.expanduser("~")
        search_dirs = [
            os.path.join(user_home, "Downloads"),
            os.path.join(user_home, "Descargas"),
            os.path.join(user_home, "Escritorio"),
            os.path.join(user_home, "Desktop"),
            os.path.join(user_home, "Documentos"),
            os.path.join(user_home, "Documents"),
            "D:\\Downloads",
            "D:\\Descargas",
            os.getcwd(),
            os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
        ]

        matches = []
        for sdir in search_dirs:
            if os.path.exists(sdir):
                matches.extend(glob.glob(os.path.join(sdir, "animelist*.xml.gz")))
                matches.extend(glob.glob(os.path.join(sdir, "animelist*.xml")))
                matches.extend(glob.glob(os.path.join(sdir, "*animelist*.xml*")))

        matches = list(set(matches))
        if not matches:
            return {
                "found": False,
                "message": "No se encontró ningún archivo animelist*.xml.gz en carpetas locales",
                "total": 0,
                "animes": [],
                "stats": {"watching": 0, "completed": 0, "on_hold": 0, "dropped": 0, "plan_to_watch": 0}
            }

        matches.sort(key=lambda p: os.path.getmtime(p), reverse=True)
        target_path = matches[0]

        if target_path.endswith(".gz"):
            with gzip.open(target_path, "rt", encoding="utf-8", errors="ignore") as f:
                xml_text = f.read()
        else:
            with open(target_path, "r", encoding="utf-8", errors="ignore") as f:
                xml_text = f.read()

        data = parse_mal_xml(xml_text)
        data["found"] = True
        data["filename"] = os.path.basename(target_path)
        data["path"] = target_path
        return data
    except Exception as e:
        logger.error(f"Error detecting local MAL file: {e}")
        return {
            "found": False,
            "error": str(e),
            "total": 0,
            "animes": [],
            "stats": {"watching": 0, "completed": 0, "on_hold": 0, "dropped": 0, "plan_to_watch": 0}
        }


# ==============================================================================
# 7. SISTEMA Y CACHÉ
# ==============================================================================

@router.get(
    "/cache/stats",
    response_model=CacheStatsResponse,
    tags=["Sistema y Caché"],
    summary="Consultar métricas de la caché en memoria",
    response_description="Estadísticas de aciertos (hits), fallos (misses), ratio de efectividad y llaves activas."
)
async def get_cache_stats():
    """
    ### 📊 Métricas de Eficiencia del Sistema

    Devuelve el estado de la memoria caché interna en tiempo real:
    - **`hits`**: Número de peticiones resueltas en <1ms sin consultar a los sitios de origen.
    - **`misses`**: Peticiones que requirieron scraping en vivo.
    - **`hit_ratio`**: Porcentaje de acierto de la caché.
    - **`total_keys`**: Entradas activas actualmente en memoria.
    """
    return cache.stats()


@router.post(
    "/cache/clear",
    response_model=MessageResponse,
    tags=["Sistema y Caché"],
    summary="Vaciar caché en memoria",
    response_description="Confirmación del vaciado de todas las llaves en caché."
)
async def clear_cache():
    """
    ### 🧹 Purgado Instantáneo de Memoria

    Elimina todas las claves almacenadas en memoria forzando una recarga limpia y fresca desde los sitios de origen en las siguientes peticiones.
    """
    cache.clear()
    return {"message": "Caché en memoria limpiada exitosamente"}


@router.get(
    "/image-proxy",
    tags=["Sistema y Caché"],
    summary="Proxy de imágenes con cabeceras anti-bloqueo",
    response_description="Flujo binario de la imagen cargada con cabeceras limpias de CORS y caché.",
    responses={
        200: {
            "description": "Imagen devuelta con éxito (image/jpeg, image/png, image/webp)."
        },
        502: {
            "description": "Error al descargar la imagen remota.",
            "model": ErrorDetail
        }
    }
)
async def proxy_image(
    url: str = Query(
        ...,
        description="URL absoluta de la imagen a través del proxy.",
        examples=["https://cdn.animeav1.com/covers/4497.jpg"]
    )
):
    """
    ### 🖼️ Proxy de Imágenes Transparentes

    Evita enlaces rotos por hotlinking o políticas de CORS al servir carátulas y capturas remotas:
    - Simula cabeceras de navegador de escritorio.
    - Aplica cabeceras `Cache-Control: public, max-age=604800, immutable` para persistir las imágenes en la caché del navegador durante 7 días.
    """
    # Attempt 1: Using curl_cffi for Cloudflare TLS impersonation
    try:
        from curl_cffi import requests as cffi_requests
        headers = {
            "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8"
        }
        r = await asyncio.to_thread(
            cffi_requests.get, url, headers=headers, impersonate="chrome120", timeout=REQUEST_TIMEOUT
        )
        if r.status_code == 200:
            content_type = r.headers.get("Content-Type", "image/jpeg")
            return Response(
                content=r.content,
                media_type=content_type,
                headers={
                    "Access-Control-Allow-Origin": "*",
                    "Cache-Control": "public, max-age=604800, immutable"
                }
            )
    except Exception:
        pass

    # Attempt 2: Resilient fallback to standard requests
    try:
        headers = get_headers()
        headers["Accept"] = "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8"
        r = await asyncio.to_thread(requests.get, url, headers=headers, timeout=REQUEST_TIMEOUT)
        if r.status_code != 200:
            raise HTTPException(status_code=r.status_code, detail="No se pudo cargar la imagen")

        content_type = r.headers.get("Content-Type", "image/jpeg")
        return Response(
            content=r.content,
            media_type=content_type,
            headers={
                "Access-Control-Allow-Origin": "*",
                "Cache-Control": "public, max-age=604800, immutable"
            }
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in image-proxy for {url}: {e}")
        raise HTTPException(status_code=502, detail=f"Error al obtener imagen: {str(e)}")
