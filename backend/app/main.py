"""
FastAPI Main Application Entry Point & OpenAPI Configuration
Configures interactive Swagger UI, ReDoc documentation, CORS middleware and static asset mounting.
"""
import os
import mimetypes
from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

# Explicitly ensure Windows registry didn't corrupt JS/CSS mimetypes
mimetypes.add_type("text/javascript", ".js")
mimetypes.add_type("text/css", ".css")

from backend.app.api.routes import router as api_router

# Setup paths (Compatible with standard Python and PyInstaller .exe bundle)
import sys

def get_frontend_dir() -> Path:
    # 1. Check if running inside PyInstaller bundle
    if getattr(sys, "frozen", False):
        meipass = getattr(sys, "_MEIPASS", None)
        if meipass and (Path(meipass) / "frontend").exists():
            return Path(meipass) / "frontend"
        exe_dir = Path(sys.executable).parent
        if (exe_dir / "frontend").exists():
            return exe_dir / "frontend"

    # 2. Standard development workspace mode
    base_dir = Path(__file__).resolve().parent.parent.parent
    return base_dir / "frontend"

FRONTEND_DIR = get_frontend_dir()

tags_metadata = [
    {
        "name": "Catálogo y Emisión",
        "description": "Endpoints para consultar los **últimos episodios recién estrenados** en portada, agregando de manera concurrente AnimeAV1, JKAnime y TioAnime con rotación de cabeceras y caché de 15 minutos.",
    },
    {
        "name": "Búsqueda Multi-Fuente",
        "description": "Búsqueda global simultánea entre todos los proveedores soportados (`Promise.allSettled`). Si un proveedor de terceros experimenta latencia o caída, el sistema devuelve los resultados válidos del resto con **cero caídas**.",
    },
    {
        "name": "Directorio Filtrable",
        "description": "Exploración exhaustiva del catálogo de anime con filtros unificados por **género (26 categorías)**, **tipo** (*TV Anime, Película, OVA, Especial, ONA*), **año de estreno** (*2026-2000*) y **estado** (*En emisión, Finalizado*).",
    },
    {
        "name": "Detalles del Anime",
        "description": "Extracción profunda de la **ficha técnica** del anime seleccionado: sinopsis completa, póster en alta resolución, géneros, estado de emisión y la lista completa y ordenada de todos los episodios disponibles.",
    },
    {
        "name": "Sala de Reproducción y Streaming",
        "description": "Extracción de **servidores de vídeo embebidos** (*Mega, Desu, Magi, Voe, MP4Upload, etc.*), proxy inverso de manifiestos HLS (`.m3u8`) y segmentos de vídeo (`.ts`), y servidor proxy para eludir bloqueos de `Referer` y `Cloudflare 403`.",
    },
    {
        "name": "Biblioteca MyAnimeList",
        "description": "Motor de procesamiento e importación local de exportaciones de **MyAnimeList** (`.xml` y `.xml.gz`). Permite auto-detección en el disco duro o subida manual mediante formulario multipart.",
    },
    {
        "name": "Sistema y Caché",
        "description": "Monitoreo en tiempo real de la **memoria caché interna (TTL de 15 min)**, estadísticas de aciertos/fallos (`hit_ratio`), purga instantánea y proxy de imágenes transparente.",
    },
]

app_description = """
## 🎬 AnimeStream Aggregator API — v1.0.0

Plataforma unificada y motor de agregación de anime en tiempo real que indexa, normaliza y transmite contenido desde tres de los proveedores más populares de habla hispana:
* **AnimeAV1** (`animeav1.com`)
* **JKAnime** (`jkanime.net`)
* **TioAnime** (`tioanime.com`)

---

### 🏛️ Características de la Arquitectura
* **Cero Datos Estáticos:** Toda la información se extrae dinámicamente en tiempo real analizando el DOM y los scripts estructurados de cada proveedor.
* **Caché en Memoria Thread-Safe (TTL 15 min):** Minimiza el número de peticiones a los sitios de origen y reduce los tiempos de respuesta por debajo de **50ms**.
* **Proxy de Streaming HLS Antihotlinking:** Resuelve listas de reproducción (`.m3u8`) y reescribe dinámicamente las rutas de los segmentos (`.ts`) para eludir restricciones de cabecera `Referer` o bloqueos 403 de Cloudflare.
* **Tolerancia a Fallos Multifuente:** Si un sitio de terceros cae o modifica sus selectores CSS, la API aísla el error y entrega de inmediato los datos de los proveedores funcionales.
* **Soporte Local y LAN:** Funciona sin conexión a servicios cloud de pago, autodetectando la IP en red local para reproducir contenido en móviles, tablets y Smart TVs.

---

### 📖 Documentación Interactiva
* [Swagger UI Interactivo](/docs) — Prueba de peticiones y esquemas JSON directamente en el navegador.
* [ReDoc Visualizer](/redoc) — Visualización limpia y estructurada de la especificación técnica.
* [OpenAPI JSON Schema](/openapi.json) — Definición OpenAPI 3.0 en formato estándar para importar en Postman, Insomnia o herramientas de automatización.
"""

app = FastAPI(
    title="AnimeStream Aggregator API",
    description=app_description,
    version="1.0.0",
    openapi_tags=tags_metadata,
    contact={
        "name": "AnimeStream Core Team",
        "url": "https://github.com/AnimeStream-spec/AnimeStream",
    },
    license_info={
        "name": "MIT License",
        "url": "https://opensource.org/licenses/MIT",
    },
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json"
)

# CORS Middleware to prevent any CORS blockages
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# No-Cache Middleware for frontend assets to prevent browser stale-cache issues
@app.middleware("http")
async def add_no_cache_headers(request, call_next):
    response = await call_next(request)
    path = request.url.path
    if path == "/" or any(path.endswith(ext) for ext in (".html", ".js", ".css", ".json")):
        response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
    return response

# Register API routes
app.include_router(api_router)

# Mount static frontend files if directory exists
if FRONTEND_DIR.exists():
    app.mount("/static", StaticFiles(directory=str(FRONTEND_DIR)), name="static")

    @app.get("/", include_in_schema=False)
    async def serve_index():
        index_file = FRONTEND_DIR / "index.html"
        if index_file.exists():
            return FileResponse(str(index_file))
        return {"message": "Frontend not found"}

    # Also mount root static fallback for css/js/assets
    app.mount("/", StaticFiles(directory=str(FRONTEND_DIR), html=True), name="frontend_root")
