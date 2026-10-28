# 🎬 AnimeStream — Agregador y Reproductor de Anime en Tiempo Real

[![FastAPI](https://img.shields.io/badge/FastAPI-0.115+-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![Python](https://img.shields.io/badge/Python-3.10%20%7C%203.14%20%7C%203.15-3776AB?logo=python&logoColor=white)](https://python.org)
[![Vanilla JS](https://img.shields.io/badge/Frontend-Vanilla%20SPA%20ES6+-F7DF1E?logo=javascript&logoColor=black)](https://developer.mozilla.org/es/docs/Web/JavaScript)
[![AdBlock](https://img.shields.io/badge/AdBlock-Nativo%20Integrado-10b981?logo=adblock&logoColor=white)](https://github.com)
[![MyAnimeList](https://img.shields.io/badge/MyAnimeList-Jikan%20API%20v4-2e51a2?logo=myanimelist&logoColor=white)](https://myanimelist.net)

Plataforma web moderna, rápida y lista para producción que actúa como agregador y reproductor de anime en tiempo real. Extrae y unifica de manera concurrente el catálogo y los servidores de vídeo de tres de las fuentes de habla hispana más importantes:
- **AnimeAV1** (`https://animeav1.com/`)
- **JKAnime** (`https://jkanime.net/`)
- **TioAnime** (`https://tioanime.com/`)

Todo el contenido se procesa **en tiempo real sin bases de datos estáticas** ni desactualizaciones, integrando además información de franquicias (secuelas, precuelas y películas) vía **MyAnimeList (MAL)** y un potente **AdBlocker nativo integrado**.

---

## 🌟 Novedades y Características Destacadas

- 🛡️ **Escudo AdBlocker Integrado:** Protección activa contra popups, popunders, redirecciones forzadas y capas transparentes de secuestro de clics (anti-clickjacking), con panel de control interactivo para activar o desactivar la protección a 1-clic y visor en vivo de anuncios bloqueados.
- 🔗 **Franquicias y Relacionados Audiovisuales (MyAnimeList):** Descubre automáticamente las secuelas, precuelas, películas, OVAs y especiales relacionados con cada anime, excluyendo mangas u obras físicas y mostrando únicamente contenido audiovisual en alta definición con búsqueda instantánea.
- ⚡ **Carga Ultra Rápida (0.3s):** Optimización de red con enrutamiento Anycast para resolver bloqueos de operadores en Cloudflare, sesiones HTTP persistentes y obtención asíncrona de metadatos en segundo plano.
- 📑 **Ficha Técnica Inteligente:** Recuadro de portada con relación de aspecto fija (2:3) protegida contra deformaciones y sinopsis colapsable con botón inteligente **"Leer más / Leer menos"**.
- 🔍 **Buscador Reactivo y Filtro Multi-Fuente:** Búsqueda rápida con selector de fuentes (Todas, AnimeAV1, JKAnime, TioAnime) y soporte para búsquedas consecutivas sin fallos de navegación.
- 📦 **Ejecutable Portable (`AnimeStream.exe`):** Incluye un ejecutable independiente de 1-clic para Windows que empaqueta el servidor, backend y frontend sin necesidad de instalar dependencias ni configurar entornos.
- 📚 **Gestor de Biblioteca ("Mi Lista"):** Compatible con exportaciones de MyAnimeList (`.xml`, `.xml.gz`) con detección automática de archivos locales y categorización (Viendo, Visto, Pendiente, Pausado, Abandonado).

---

## 🏛️ Arquitectura del Proyecto

El sistema sigue una arquitectura modular y desacoplada de alto rendimiento:

```
Anime/
├── backend/
│   ├── app/
│   │   ├── api/
│   │   │   └── routes.py             # Endpoints REST (/api/latest, /api/search, /api/anime, /api/watch, etc.)
│   │   ├── core/
│   │   │   ├── config.py             # Configuración, Anycast clean routing, cabeceras y User-Agents
│   │   │   └── cache.py              # Sistema de caché thread-safe en memoria con TTL de 15 min
│   │   ├── models.py                 # Esquemas de datos unificados y tipados con Pydantic
│   │   ├── providers/
│   │   │   ├── base.py               # Interfaz abstracta BaseAnimeProvider
│   │   │   ├── animeav1.py           # Scraping concurrente para AnimeAV1
│   │   │   ├── jkanime.py            # Scraping estructurado para JKAnime
│   │   │   └── tioanime.py           # Scraping optimizado para TioAnime
│   │   └── main.py                   # Servidor FastAPI, middleware CORS y servicio de estáticos
│   └── requirements.txt              # Requisitos Python del backend
├── frontend/
│   ├── index.html                    # Shell SPA con diseño oscuro cinematográfico
│   ├── css/
│   │   └── style.css                 # Diseño moderno streaming (Crunchyroll/Netflix), 100% responsivo
│   └── js/
│       ├── app.js                    # Enrutador por hash (#/, #/search, #/anime, #/watch, etc.)
│       ├── api.js                    # Cliente HTTP asíncrono hacia la API REST
│       ├── adblock.js                # Motor de AdBlock integrado con interceptor DOM y popups
│       ├── storage.js                # Persistencia local (localStorage) para biblioteca, historial y favoritos
│       ├── utils.js                  # Iconografía SVG, toasts, debounce y utilidades de formato
│       └── components/
│           ├── navbar.js             # Barra superior con buscador en tiempo real y botón de AdBlock
│           ├── homeView.js           # Portada, Hero Banner, Continuar Viendo y Últimos Episodios
│           ├── searchView.js         # Vista de búsqueda multi-fuente con filtros
│           ├── animeView.js          # Ficha técnica, relaciones MAL, sinopsis colapsable y capítulos
│           ├── watchView.js          # Sala de reproducción con pestañas de servidores y modo proxy
│           ├── directoryView.js      # Catálogo y directorio con filtros de género, año y estado
│           ├── libraryView.js        # Mi Lista: Viendo, Vistos, Pendientes e importador MAL (.xml/.xml.gz)
│           ├── favoritesView.js      # Colección de animes favoritos
│           └── historyView.js        # Historial cronológico con tiempo relativo y borrado
├── dist/
│   └── AnimeStream.exe               # Ejecutable portable autocontenido para Windows (sin dependencias)
├── docs/
│   ├── API.md                        # Documentación técnica completa de los endpoints REST
│   └── openapi.json                  # Especificación OpenAPI 3.0 exportada
├── AnimeStream.spec                  # Configuración de compilación con PyInstaller
├── iniciar.bat                       # Lanzador directo de 1-clic con apertura automática de navegador
├── requirements.txt                  # Dependencias del proyecto
├── run.py                            # Punto de entrada para arranque local con Uvicorn
└── README.md                         # Documentación general del repositorio
```

---

## 🚀 Inicio Rápido

Tienes dos formas sencillas de ejecutar AnimeStream:

### Opción 1: Ejecutable Portable (Recomendado para usuarios de Windows)
Simplemente haz doble clic sobre:
```
dist\AnimeStream.exe
```
O ejecuta el script `iniciar.bat`. El servidor se iniciará automáticamente y se abrirá en tu navegador predeterminado. No requiere instalar Python ni ninguna librería externa.

---

### Opción 2: Desde el código fuente (Python)

#### 1. Requisitos previos
- **Python 3.10 o superior** (probado y 100% compatible con Python 3.14 y 3.15).

#### 2. Instalación de dependencias
Abre una terminal o consola de comandos en la carpeta raíz y ejecuta:
```bash
pip install -r requirements.txt
```

#### 3. Ejecución
Inicia el servidor local:
```bash
python run.py
```

- **Plataforma Web:** Abre en tu navegador [http://localhost:8000](http://localhost:8000)
- **Documentación Swagger UI:** [http://localhost:8000/docs](http://localhost:8000/docs)
- **Documentación ReDoc:** [http://localhost:8000/redoc](http://localhost:8000/redoc)

---

## 🎨 Características de la Interfaz (UI/UX)

- **Modo Oscuro Streaming:** Paleta oscura profesional (`#0b0f19`, `#161f30`) con acentos naranja y etiquetas distintivas por proveedor:
  - **AnimeAV1:** Púrpura brillante.
  - **JKAnime:** Cian / Turquesa.
  - **TioAnime:** Naranja / Ámbar.
- **Hero Banner Interactivo:** Portada destacada aleatoria con botón de reproducción inmediata del primer episodio.
- **Buscador en Tiempo Real:** Campo de búsqueda rápida con selector de fuente (`Todas`, `AnimeAV1`, `JKAnime`, `TioAnime`), resistente a búsquedas consecutivas repetidas.
- **Ficha Técnica Optimizada:**
  - **Marco de Portada Fijo:** Proporción vertical 2:3 bloqueada que nunca se deforma ni se estira sin importar el tamaño del texto.
  - **Sinopsis Inteligente:** Clampeo automático a 4 líneas con botón interactivo **"Leer más" / "Leer menos"** para mantener la vista simétrica y limpia.
  - **Obras Relacionadas (MyAnimeList):** Sección de franquicia con carátulas en alta resolución y pestañas clasificadoras:
    - *Secuelas & Precuelas*
    - *Películas & Resúmenes*
    - *OVAs & Spin-offs*
    *(Filtro estricto que descarta mangas, novelas ligeras y material impreso, enfocándose 100% en producciones audiovisuales).*
  - **Buscador de Capítulos:** Filtro instantáneo por número de capítulo (ej. `24`) y botón para invertir el orden (Ascendente / Descendente).
  - **Favoritos y Mi Lista:** Botón de corazón interactivo y menú desplegable para actualizar el estado del anime en tu biblioteca.
- **Sala de Reproducción Cinematográfica:**
  - Contenedor centrado 16:9 con soporte para pantalla completa.
  - Selector superior de servidores de vídeo para cambiar de opción de streaming al instante.
  - Botón **"Modo Proxy"** para neutralizar bloqueos por hotlinking o errores 403 Forbidden.
  - Botón directo de **AdBlock** en la barra de herramientas del reproductor para verificar o pausar la protección.
  - Navegación rápida con botones **← Capítulo Anterior** y **Siguiente Capítulo →**.
  - Marcador de "Visto" / "No visto" con sincronización en el catálogo.

---

## 🛡️ Escudo AdBlocker Integrado

AnimeStream incorpora una suite de protección de vanguardia diseñada específicamente para anular la publicidad agresiva habitual en los reproductores de terceros:

1. **Anti-Popups & Popunders:** Intercepta la llamada nativa `window.open()`, impidiendo que los reproductores abran nuevas ventanas o pestañas no deseadas.
2. **Anti-Clickjacking:** Escaneo y eliminación automática en tiempo real de capas transparentes invisibles (`z-index >= 1000`) superpuestas sobre el vídeo.
3. **Sandbox Iframe Aislado:** Restricción estricta de privilegios del iframe (`allow-scripts`, `allow-same-origin`, etc.) revocando `allow-top-navigation` para impedir redirecciones del sitio principal.
4. **Proxy Sanitizer:** Filtrado en el servidor que purga scripts maliciosos de redes de publicidad invasivas antes de servir el reproductor.
5. **Panel Interactivo y Estado en Vivo:**
   - Indicador en la barra superior: `🛡️ AdBlock ON` o `⚠️ AdBlock OFF`, junto con el contador de elementos bloqueados.
   - Modal completo accesible con un clic para ver estadísticas, reiniciar contadores o **Desactivar / Activar el AdBlocker** en cualquier momento.

---

## ⚡ Rendimiento y Conectividad

- **Enrutamiento Anycast Anticaídas:** Configuración de nodos limpios para sortear bloqueos de DNS o proveedores de Internet frente a servidores protegidos por Cloudflare (reducción de latencia de 15 segundos a menos de 0.3 segundos).
- **Carga en Segundo Plano no Bloqueante:** Las consultas a MyAnimeList se realizan de forma asíncrona tras entregar la ficha del anime, permitiendo que la página cargue de forma inmediata sin esperas.
- **Caché en Memoria Thread-Safe (TTL 15 min):** Acelera drásticamente las consultas repetidas de directorios, búsquedas y fichas técnicas con respuestas inferiores a 20 ms.
- **Connection Pooling:** Sesiones HTTP reusables para minimizar el handshake TLS en cada consulta.

---

## 📡 Resumen de la API REST

| Módulo | Endpoint | Método | Descripción |
| :--- | :--- | :---: | :--- |
| **Emisión** | `/api/latest` | `GET` | Últimos episodios publicados entrelazando las 3 fuentes. |
| **Búsqueda** | `/api/search` | `GET` | Búsqueda concurrente con aislamiento de fallos (`Promise.allSettled`). |
| **Directorio** | `/api/directory` | `GET` | Catálogo filtrable por género (26 categorías), tipo, año y estado. |
| **Detalles** | `/api/anime` | `GET` | Ficha técnica, lista de capítulos y metadatos. |
| **Franquicia** | `/api/anime/relations` | `GET` | Obras audiovisuales relacionadas desde MyAnimeList. |
| **Reproducción** | `/api/watch` | `GET` | Enlaces y servidores de vídeo extraídos. |
| **Proxy de Vídeo** | `/api/proxy-player` | `GET` | Bypass de cabeceras Referer y filtros de seguridad. |
| **Streaming HLS** | `/api/hls/m3u8/{hash}` | `GET` | Proxy reescritor de listas HLS con bypass anti-hotlinking. |
| **Biblioteca MAL** | `/api/library/parse-mal` | `POST` | Importación y descompresión de archivos de exportación MAL. |
| **Biblioteca Local**| `/api/library/local-file` | `GET` | Detección automática de archivos `.xml` / `.xml.gz` en el PC. |
| **Proxy Imágenes** | `/api/image-proxy` | `GET` | Servidor proxy de carátulas con cabeceras CORS y caché de 7 días. |
| **Caché** | `/api/cache/stats` | `GET` | Métricas en vivo del sistema de caché. |

> Para conocer parámetros, payloads y ejemplos cURL, consulta la guía técnica en [**`docs/API.md`**](docs/API.md).

---

## 📦 Compilación del Ejecutable

Si deseas volver a generar el ejecutable portable desde el código fuente:

```bash
pip install pyinstaller
pyinstaller AnimeStream.spec --noconfirm
```

El binario actualizado quedará disponible en la carpeta `dist/AnimeStream.exe`.
