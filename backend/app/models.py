"""
Data Models and Unified Schemas for AnimeStream Aggregator
Fully typed Pydantic v2 models with rich field descriptions and realistic schema examples.
"""
from typing import List, Optional, Union, Dict, Any
from pydantic import BaseModel, Field, ConfigDict


class EpisodeItem(BaseModel):
    title: str = Field(
        ...,
        description="Título oficial o normalizado de la serie de anime.",
        examples=["Sousou no Frieren 2nd Season"]
    )
    episode: Union[int, str] = Field(
        ...,
        description="Número del episodio emitido (entero o identificador alfanumérico en especiales).",
        examples=[4]
    )
    image: Optional[str] = Field(
        None,
        description="URL de la captura del episodio o carátula de portada.",
        examples=["https://cdn.animeav1.com/thumbnails/4497.jpg"]
    )
    url: str = Field(
        ...,
        description="URL completa o ruta para ver el episodio en la plataforma agregada.",
        examples=["https://animeav1.com/media/dark-machine-the-animation/2"]
    )
    animeUrl: str = Field(
        ...,
        description="URL completa hacia la ficha técnica principal del anime.",
        examples=["https://animeav1.com/media/dark-machine-the-animation"]
    )
    source: str = Field(
        ...,
        description="Proveedor de origen que emitió el capítulo: 'AnimeAV1', 'JKAnime' o 'TioAnime'.",
        examples=["AnimeAV1"]
    )

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "title": "Sousou no Frieren 2nd Season",
                "episode": 4,
                "image": "https://cdn.animeav1.com/thumbnails/4497.jpg",
                "url": "https://animeav1.com/media/dark-machine-the-animation/2",
                "animeUrl": "https://animeav1.com/media/dark-machine-the-animation",
                "source": "AnimeAV1"
            }
        }
    )


class SearchResultItem(BaseModel):
    title: str = Field(
        ...,
        description="Título del anime encontrado en la búsqueda.",
        examples=["One Piece"]
    )
    url: str = Field(
        ...,
        description="URL de la ficha técnica del anime en la fuente de origen.",
        examples=["https://jkanime.net/one-piece/"]
    )
    image: Optional[str] = Field(
        None,
        description="URL de la imagen de portada o póster del anime.",
        examples=["https://cdn.jkdesa.com/assets/images/animes/image/one-piece.jpg"]
    )
    source: str = Field(
        ...,
        description="Nombre del proveedor donde se encontró el resultado.",
        examples=["JKAnime"]
    )
    synopsis: Optional[str] = Field(
        None,
        description="Breve fragmento o sinopsis del anime si está disponible en la búsqueda.",
        examples=["Gol D. Roger fue conocido como el 'Rey de los Piratas'..."]
    )
    type: Optional[str] = Field(
        "Anime",
        description="Formato de la producción (TV, Película, OVA, Especial).",
        examples=["TV Anime"]
    )

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "title": "One Piece",
                "url": "https://jkanime.net/one-piece/",
                "image": "https://cdn.jkdesa.com/assets/images/animes/image/one-piece.jpg",
                "source": "JKAnime",
                "synopsis": "Gol D. Roger fue conocido como el 'Rey de los Piratas'...",
                "type": "TV Anime"
            }
        }
    )


class SearchErrorItem(BaseModel):
    source: str = Field(..., description="Nombre del proveedor que falló.", examples=["TioAnime"])
    error: str = Field(..., description="Mensaje técnico del error capturado.", examples=["Timeout connecting to upstream"])


class SearchResponse(BaseModel):
    query: str = Field(..., description="Término de búsqueda ingresado.", examples=["Naruto"])
    results: List[SearchResultItem] = Field(..., description="Lista agregada y unificada de animes encontrados.")
    errors: List[SearchErrorItem] = Field(
        default_factory=list,
        description="Lista de proveedores que experimentaron errores temporales sin afectar a los demás."
    )

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "query": "Naruto",
                "results": [
                    {
                        "title": "Naruto Shippuden",
                        "url": "https://tioanime.com/anime/naruto-shippuden",
                        "image": "https://tioanime.com/uploads/thumbs/naruto-shippuden.jpg",
                        "source": "TioAnime",
                        "synopsis": "Naruto Uzumaki regresa tras 2 años y medio de entrenamiento...",
                        "type": "TV Anime"
                    }
                ],
                "errors": []
            }
        }
    )


class EpisodeRef(BaseModel):
    number: Union[int, str] = Field(..., description="Número del episodio.", examples=[1])
    title: str = Field(..., description="Etiqueta descriptiva del episodio.", examples=["Episodio 1"])
    url: str = Field(..., description="URL para reproducir este capítulo específico.", examples=["https://jkanime.net/one-piece/1/"])
    image: Optional[str] = Field(None, description="Miniatura del episodio si está disponible.")

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "number": 1,
                "title": "Episodio 1",
                "url": "https://jkanime.net/one-piece/1/",
                "image": "https://cdn.jkdesa.com/assets/images/animes/video/image_thumb/jkvideo_c457d7ae48d08a6b84bc0b1b9bd7d474.jpg"
            }
        }
    )


class AnimeRelationItem(BaseModel):
    title: str = Field(..., description="Título de la obra o producción relacionada.", examples=["Naruto: Shippuuden"])
    relation: str = Field(..., description="Tipo de relación en español ('Secuela', 'Precuela', 'Historia paralela', 'Spin-off', etc.).", examples=["Secuela"])
    raw_relation: str = Field(..., description="Tipo de relación original en inglés en MyAnimeList ('Sequel', 'Prequel', etc.).", examples=["Sequel"])
    type: Optional[str] = Field(None, description="Formato de la obra ('TV', 'Película', 'OVA', 'Especial', 'Manga', etc.).", examples=["TV"])
    image: Optional[str] = Field(None, description="URL de la carátula o póster del anime relacionado.")
    mal_id: Optional[int] = Field(None, description="Identificador numérico en MyAnimeList.")
    mal_url: Optional[str] = Field(None, description="URL canónica en MyAnimeList.")

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "title": "Naruto: Shippuuden",
                "relation": "Secuela",
                "raw_relation": "Sequel",
                "type": "TV",
                "image": "https://cdn.myanimelist.net/r/50x70/images/anime/1565/111305.jpg",
                "mal_id": 1735,
                "mal_url": "https://myanimelist.net/anime/1735/Naruto__Shippuuden"
            }
        }
    )


class AnimeDetail(BaseModel):
    title: str = Field(..., description="Título oficial del anime.", examples=["Dragon Ball Super: Beerus"])
    url: str = Field(..., description="URL de origen de la ficha del anime.", examples=["https://jkanime.net/dragon-ball-super-beerus/"])
    image: Optional[str] = Field(None, description="Póster vertical principal en alta definición.", examples=["https://cdn.jkdesa.com/assets/images/animes/image/dragon-ball-super-beerus.jpg"])
    backdrop: Optional[str] = Field(None, description="Imagen horizontal de fondo o banner panorámico.")
    synopsis: str = Field("", description="Sinopsis completa del argumento en español.")
    genres: List[str] = Field(default_factory=list, description="Lista de géneros y categorías temáticas.", examples=[["Acción", "Aventura", "Fantasía", "Shounen"]])
    status: str = Field("En emisión", description="Estado actual de transmisión ('En emisión' o 'Finalizado').", examples=["En emisión"])
    source: str = Field(..., description="Proveedor donde reside esta ficha ('AnimeAV1', 'JKAnime' o 'TioAnime').", examples=["JKAnime"])
    episodes: List[EpisodeRef] = Field(default_factory=list, description="Lista completa y ordenada de todos los episodios disponibles.")
    relations: List[AnimeRelationItem] = Field(default_factory=list, description="Lista de producciones y animes relacionados (secuelas, precuelas, películas, etc.).")

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "title": "Dragon Ball Super: Beerus",
                "url": "https://jkanime.net/dragon-ball-super-beerus/",
                "image": "https://cdn.jkdesa.com/assets/images/animes/image/dragon-ball-super-beerus.jpg",
                "backdrop": "https://cdn.animeav1.com/backdrops/4497.jpg",
                "synopsis": "Nueva edición mejorada con la última tecnología visual...",
                "genres": ["Acción", "Aventura", "Fantasía", "Shounen"],
                "status": "En emisión",
                "source": "JKAnime",
                "episodes": [
                    {
                        "number": 1,
                        "title": "Episodio 1",
                        "url": "https://jkanime.net/dragon-ball-super-beerus/1/",
                        "image": None
                    },
                    {
                        "number": 2,
                        "title": "Episodio 2",
                        "url": "https://jkanime.net/dragon-ball-super-beerus/2/",
                        "image": None
                    }
                ]
            }
        }
    )


class VideoServer(BaseModel):
    name: str = Field(..., description="Nombre del servidor o reproductor de vídeo.", examples=["HLS Directo", "Mega", "Desu", "Voe"])
    embed: str = Field(..., description="URL embebible del iframe o flujo protegido por proxy.", examples=["/api/hls/player/3586d5b0201df9527045f57c57eb9241"])
    audio: Optional[str] = Field("SUB", description="Tipo de audio: 'SUB' (Subtitulado) o 'DUB' (Doblado / Español / Latino).", examples=["SUB", "DUB"])

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "name": "HLS Directo (HD)",
                "embed": "/api/hls/player/3586d5b0201df9527045f57c57eb9241",
                "audio": "SUB"
            }
        }
    )


class WatchDetail(BaseModel):
    animeTitle: str = Field(..., description="Título de la serie a la que pertenece el episodio.", examples=["Dragon Ball Super: Beerus"])
    episode: Union[int, str] = Field(..., description="Número del episodio actual.", examples=[2])
    url: str = Field(..., description="URL de origen del capítulo.", examples=["https://jkanime.net/dragon-ball-super-beerus/2/"])
    animeUrl: str = Field(..., description="URL de la ficha principal del anime.", examples=["https://jkanime.net/dragon-ball-super-beerus/"])
    image: Optional[str] = Field(None, description="Miniatura de portada del episodio.")
    source: str = Field(..., description="Proveedor del episodio ('AnimeAV1', 'JKAnime' o 'TioAnime').", examples=["JKAnime"])
    prevUrl: Optional[str] = Field(None, description="URL del episodio anterior si existe.", examples=["https://jkanime.net/dragon-ball-super-beerus/1/"])
    nextUrl: Optional[str] = Field(None, description="URL del episodio siguiente si ya ha sido emitido.")
    servers: List[VideoServer] = Field(default_factory=list, description="Lista de todos los servidores de vídeo disponibles para este episodio.")
    audios: List[str] = Field(default_factory=lambda: ["SUB"], description="Lista de audios disponibles en este episodio ('SUB', 'DUB').", examples=[["SUB", "DUB"]])

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "animeTitle": "Dragon Ball Super: Beerus",
                "episode": 2,
                "url": "https://jkanime.net/dragon-ball-super-beerus/2/",
                "animeUrl": "https://jkanime.net/dragon-ball-super-beerus/",
                "image": "https://cdn.jkdesa.com/assets/images/animes/video/image_thumb/jkvideo_a378ee299a8f0f56f60bef587e56eadf.jpg",
                "source": "JKAnime",
                "prevUrl": "https://jkanime.net/dragon-ball-super-beerus/1/",
                "nextUrl": None,
                "servers": [
                    {"name": "[SUB] Desu", "embed": "https://jkanime.net/jkplayer/um?e=...", "audio": "SUB"},
                    {"name": "[SUB] Magi", "embed": "https://jkanime.net/jkplayer/umv?e=...", "audio": "SUB"}
                ],
                "audios": ["SUB"]
            }
        }
    )


class DirectoryItem(BaseModel):
    title: str = Field(..., description="Título del anime en el catálogo.", examples=["Sousou no Frieren"])
    url: str = Field(..., description="URL hacia la ficha del anime.", examples=["https://animeav1.com/media/sousou-no-frieren"])
    image: Optional[str] = Field(None, description="Póster del anime.", examples=["https://cdn.animeav1.com/covers/4200.jpg"])
    source: str = Field(..., description="Fuente agregada ('AnimeAV1', 'JKAnime' o 'TioAnime').", examples=["AnimeAV1"])
    type: Optional[str] = Field("TV Anime", description="Formato del contenido: TV Anime, Película, OVA, Especial, ONA.")
    status: Optional[str] = Field("En emisión", description="Estado de publicación: En emisión o Finalizado.")
    year: Optional[str] = Field(None, description="Año de lanzamiento o estreno.", examples=["2024"])
    genres: List[str] = Field(default_factory=list, description="Etiquetas de géneros asociados.", examples=[["Aventura", "Drama", "Fantasía"]])
    synopsis: Optional[str] = Field(None, description="Resumen o sinopsis introductoria del anime.")

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "title": "Sousou no Frieren",
                "url": "https://animeav1.com/media/sousou-no-frieren",
                "image": "https://cdn.animeav1.com/covers/4200.jpg",
                "source": "AnimeAV1",
                "type": "TV Anime",
                "status": "Finalizado",
                "year": "2023",
                "genres": ["Aventura", "Drama", "Fantasía"],
                "synopsis": "El rey demonio ha sido derrotado y el grupo del héroe se disuelve..."
            }
        }
    )


class DirectoryResponse(BaseModel):
    items: List[DirectoryItem] = Field(..., description="Lista de animes correspondientes a los filtros y página solicitados.")
    page: int = Field(1, description="Número de página devuelta.", examples=[1])
    has_next: bool = Field(True, description="Indica si existen páginas subsiguientes en el catálogo.")
    total: Optional[int] = Field(None, description="Cantidad de animes en la página actual.", examples=[30])

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "items": [
                    {
                        "title": "Sousou no Frieren",
                        "url": "https://animeav1.com/media/sousou-no-frieren",
                        "image": "https://cdn.animeav1.com/covers/4200.jpg",
                        "source": "AnimeAV1",
                        "type": "TV Anime",
                        "status": "Finalizado",
                        "year": "2023",
                        "genres": ["Aventura", "Fantasía"]
                    }
                ],
                "page": 1,
                "has_next": True,
                "total": 1
            }
        }
    )


class MALAnimeItem(BaseModel):
    id: str = Field(..., description="ID numérico de la serie en MyAnimeList.", examples=["52991"])
    title: str = Field(..., description="Título de la obra según la exportación de MAL.", examples=["Sousou no Frieren"])
    type: str = Field("TV", description="Tipo de producción (TV, Movie, OVA, Special, ONA).", examples=["TV"])
    totalEpisodes: int = Field(0, description="Total de episodios oficiales de la serie.", examples=[28])
    watchedEpisodes: int = Field(0, description="Episodios vistos por el usuario.", examples=[28])
    score: int = Field(0, description="Puntuación personal otorgada por el usuario (0-10).", examples=[10])
    status: str = Field(..., description="Identificador normalizado del estado: 'watching', 'completed', 'on_hold', 'dropped', 'plan_to_watch'.", examples=["completed"])
    statusLabel: str = Field(..., description="Etiqueta en español: 'Viendo', 'Visto', 'Pausado', 'Abandonado', 'Pendiente'.", examples=["Visto"])
    updatedAt: Optional[str] = Field(None, description="Fecha de inicio o finalización registrada.", examples=["2024-03-24"])

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "id": "52991",
                "title": "Sousou no Frieren",
                "type": "TV",
                "totalEpisodes": 28,
                "watchedEpisodes": 28,
                "score": 10,
                "status": "completed",
                "statusLabel": "Visto",
                "updatedAt": "2024-03-24"
            }
        }
    )


class MALStats(BaseModel):
    watching: int = Field(0, description="Cantidad de animes actualmente en emisión que el usuario está viendo.", examples=[12])
    completed: int = Field(0, description="Cantidad de animes completados / vistos.", examples=[145])
    on_hold: int = Field(0, description="Cantidad de animes en pausa.", examples=[5])
    dropped: int = Field(0, description="Cantidad de animes abandonados.", examples=[3])
    plan_to_watch: int = Field(0, description="Cantidad de animes pendientes de ver.", examples=[88])

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "watching": 12,
                "completed": 145,
                "on_hold": 5,
                "dropped": 3,
                "plan_to_watch": 88
            }
        }
    )


class MALParseResponse(BaseModel):
    username: str = Field("Usuario", description="Nombre de usuario del propietario de la lista en MyAnimeList.", examples=["denis"])
    total: int = Field(0, description="Número total de animes procesados en el archivo.", examples=[253])
    stats: MALStats = Field(default_factory=MALStats, description="Desglose estadístico por categoría de seguimiento.")
    animes: List[MALAnimeItem] = Field(default_factory=list, description="Colección completa de animes importados.")
    found: Optional[bool] = Field(None, description="Indica si se auto-detectó un archivo en el sistema de archivos local.", examples=[True])
    message: Optional[str] = Field(None, description="Mensaje explicativo si no se encontró archivo local.", examples=["No se encontró ningún archivo animelist*.xml.gz en carpetas locales"])
    error: Optional[str] = Field(None, description="Descripción de error si ocurrió una excepción durante la lectura.")
    filename: Optional[str] = Field(None, description="Nombre del archivo local encontrado.", examples=["animelist_1792544888_-_18719935.xml.gz"])
    path: Optional[str] = Field(None, description="Ruta absoluta local del archivo detectado.", examples=["C:\\Users\\denis\\Downloads\\animelist_1792544888_-_18719935.xml.gz"])

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "username": "denis",
                "total": 253,
                "stats": {
                    "watching": 12,
                    "completed": 145,
                    "on_hold": 5,
                    "dropped": 3,
                    "plan_to_watch": 88
                },
                "animes": [
                    {
                        "id": "52991",
                        "title": "Sousou no Frieren",
                        "type": "TV",
                        "totalEpisodes": 28,
                        "watchedEpisodes": 28,
                        "score": 10,
                        "status": "completed",
                        "statusLabel": "Visto"
                    }
                ],
                "found": True,
                "filename": "animelist_1792544888_-_18719935.xml.gz"
            }
        }
    )


class CacheStatsResponse(BaseModel):
    total_keys: int = Field(..., description="Total de entradas activas en la memoria caché.", examples=[42])
    hits: int = Field(..., description="Peticiones atendidas directamente desde la memoria caché.", examples=[128])
    misses: int = Field(..., description="Peticiones que requirieron consulta fresca a los proveedores de origen.", examples=[42])
    hit_ratio: float = Field(..., description="Porcentaje de acierto de la caché (0.0 a 1.0).", examples=[0.75])
    default_ttl: int = Field(..., description="Tiempo de vida predeterminado en segundos (900s = 15 min).", examples=[900])
    sample_keys: List[str] = Field(default_factory=list, description="Muestra de claves activas.", examples=[["latest_all", "dir_accion_none_none_none_all_1"]])

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "total_keys": 42,
                "hits": 128,
                "misses": 42,
                "hit_ratio": 0.75,
                "default_ttl": 900,
                "sample_keys": ["latest_all", "dir_accion_none_none_none_all_1"]
            }
        }
    )


class MessageResponse(BaseModel):
    message: str = Field(..., description="Mensaje informativo o de confirmación de la operación.", examples=["Caché en memoria limpiada exitosamente"])


class ErrorDetail(BaseModel):
    detail: str = Field(..., description="Descripción detallada del error ocurrido.", examples=["URL no soportada. Debe pertenecer a animeav1.com, jkanime.net o tioanime.com"])
