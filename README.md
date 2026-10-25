# AnimeStream — Agregador y Reproductor de Anime en Tiempo Real

Plataforma web completa y funcional lista para producción que actúa como agregador y reproductor de anime en tiempo real extrayendo y unificando el catálogo de tres de las principales fuentes de habla hispana:
- **AnimeAV1** (`https://animeav1.com/`)
- **JKAnime** (`https://jkanime.net/`)
- **TioAnime** (`https://tioanime.com/`)

---

## 🏛️ Arquitectura del Sistema

El proyecto está diseñado bajo una arquitectura desacoplada y orientada a microservicios/adaptadores:

```
AnimeStream/
├── backend/
│   ├── app/
│   │   ├── api/
│   │   │   └── routes.py             # Endpoints REST (/api/latest, /api/search, /api/anime, /api/watch, etc.)
│   │   ├── core/
│   │   │   ├── config.py             # Configuración, rotación de User-Agents y cabeceras HTTP
│   │   │   └── cache.py              # Sistema de caché thread-safe en memoria con TTL de 15 min
│   │   ├── models.py                 # Esquemas de datos unificados con Pydantic
│   │   ├── providers/
│   │   │   ├── base.py               # Interfaz abstracta BaseAnimeProvider
│   │   │   ├── animeav1.py           # Adaptador de scraping para AnimeAV1
│   │   │   ├── jkanime.py            # Adaptador de scraping para JKAnime
│   │   │   └── tioanime.py           # Adaptador de scraping para TioAnime
│   │   └── main.py                   # Servidor FastAPI, CORS y montaje de estáticos
│   └── requirements.txt
├── frontend/
│   ├── index.html                    # Shell moderno SPA en modo oscuro
│   ├── css/
│   │   └── style.css                 # Diseño estilo streaming (Crunchyroll/Netflix), 100% responsive
│   └── js/
│       ├── app.js                    # Enrutador por hash (#/, #/search, #/anime, #/watch, #/favorites, #/history)
│       ├── api.js                    # Cliente HTTP hacia la API REST
│       ├── storage.js                # Persistencia local (localStorage) para historial, favoritos y vistos
│       ├── utils.js                  # Iconos SVG, debounce, formato de fechas y toasts
│       └── components/
│           ├── navbar.js             # Barra superior con buscador en tiempo real y selector de fuente
│           ├── homeView.js           # Portada, Hero Banner, Continuar Viendo y Últimos Episodios
│           ├── searchView.js         # Vista de búsqueda multi-fuente con filtros
│           ├── animeView.js          # Ficha técnica, favoritos y selector rápido de episodios
│           ├── watchView.js          # Reproductor 16:9 adaptable, pestañas de servidores y controles
│           ├── directoryView.js      # Directorio y catálogo con filtros de género, tipo, año y estado
│           ├── libraryView.js        # Mi Lista: Viendo, Vistos, Pendientes con importación MAL (.xml.gz)
│           ├── favoritesView.js      # Lista de animes favoritos
│           └── historyView.js        # Historial de reproducción con opción de borrado
├── docs/
│   ├── API.md                        # Guía técnica exhaustiva de la API REST
│   └── openapi.json                  # Especificación OpenAPI 3.0 exportada
├── iniciar.bat                       # Lanzador directo de 1-clic para Windows
├── requirements.txt                  # Dependencias del proyecto
├── run.py                            # Script de arranque del servidor
└── README.md
```

---

## 🚀 Requisitos e Instalación

### Requisitos previos
- **Python 3.10 o superior** (probado y compatible con Python 3.14).

### Instalación de dependencias
Abre una terminal en la raíz del proyecto y ejecuta:
```bash
pip install -r backend/requirements.txt
```

Las dependencias clave son:
- `fastapi` y `uvicorn`: API asíncrona de alto rendimiento.
- `beautifulsoup4`: Análisis del DOM HTML.
- `requests`: Peticiones HTTP seguras y pooling de conexiones.
- `pydantic`: Validación estricta y serialización del esquema JSON unificado.

---

## ⚡ Ejecución de la Aplicación

Ejecuta el script de inicio:
```bash
python run.py
```

- **Aplicación Web:** Abre en tu navegador [http://127.0.0.1:8000](http://127.0.0.1:8000)
- **Documentación Swagger Interactiva:** [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)
- **Documentación ReDoc:** [http://127.0.0.1:8000/redoc](http://127.0.0.1:8000/redoc)

---

## 📡 Endpoints de la API REST Unificada

Todos los endpoints devuelven respuestas JSON homogéneas e interoperables independientemente de la fuente. Para consultar la guía técnica completa con parámetros, cabeceras y ejemplos cURL detallados, consulta [**`docs/API.md`**](docs/API.md).

### Resumen de Módulos y Rutas:

| Módulo | Endpoint | Método | Descripción |
| :--- | :--- | :---: | :--- |
| **Catálogo y Emisión** | `/api/latest` | `GET` | Últimos episodios en emisión entrelazados (`AnimeAV1`, `JKAnime`, `TioAnime`). |
| **Búsqueda Multi-Fuente** | `/api/search` | `GET` | Búsqueda global concurrente con aislamiento de fallos (`Promise.allSettled`). |
| **Directorio Filtrable** | `/api/directory` | `GET` | Catálogo filtrable por género (26 categorías), tipo, año y estado. |
| **Detalles del Anime** | `/api/anime` | `GET` | Ficha técnica completa, géneros, sinopsis, lista de capítulos y relaciones de franquicia. |
| **Relacionados y Franquicia** | `/api/anime/relations` | `GET` | Extracción en tiempo real de secuelas, precuelas, películas y spin-offs desde MyAnimeList. |
| **Sala de Reproducción** | `/api/watch` | `GET` | Extracción de reproductores de vídeo embebidos y navegación de episodios. |
| **Streaming HLS** | `/api/hls/player/{hash}` | `GET` | Reproductor HTML5 embebible con soporte HLS local. |
| **Streaming HLS** | `/api/hls/m3u8/{hash}` | `GET` | Proxy y reescritor de manifiestos `.m3u8` con bypass de hotlinking. |
| **Streaming HLS** | `/api/hls/seg/{hash}/{file}` | `GET` | Proxy inverso de fragmentos de vídeo binarios MPEG-TS (`.ts`). |
| **Bypass Hotlinking** | `/api/proxy-player` | `GET` | Proxy HTML que anula restricciones de cabecera `Referer` y `X-Frame-Options`. |
| **Biblioteca MAL** | `/api/library/parse-mal` | `POST` | Importación y descompresión de exportaciones de MyAnimeList (`.xml`, `.xml.gz`). |
| **Biblioteca MAL** | `/api/library/local-file` | `GET` | Auto-detección inteligente del archivo exportado en carpetas locales del PC. |
| **Sistema y Caché** | `/api/cache/stats` | `GET` | Monitoreo en tiempo real de métricas de la caché interna (hits, misses, ratio). |
| **Sistema y Caché** | `/api/cache/clear` | `POST` | Purgado instantáneo de la memoria caché. |
| **Sistema y Caché** | `/api/image-proxy` | `GET` | Proxy de carátulas con cabeceras limpias de CORS y caché de 7 días. |

> 💡 **Prueba Interactiva en Vivo:** Puedes ejecutar y probar cada uno de estos endpoints directamente desde tu navegador accediendo a la consola interactiva **[Swagger UI (`/docs`)](http://localhost:8000/docs)** o **[ReDoc (`/redoc`)](http://localhost:8000/redoc)** con el servidor en marcha.

---

## 🎨 Características de la Interfaz de Usuario (UI/UX)

- **Modo Oscuro Streaming:** Paleta oscura cuidada (`#0b0f19`, `#161f30`) con acentos naranja y badges distintivos para cada fuente (**AnimeAV1** en púrpura y **JKAnime** en cian).
- **Hero Banner Interactivo:** Portada destacada con opción de reproducción inmediata y sinopsis del anime.
- **Sección "Continuar Viendo":** Retoma tus animes directamente desde donde los dejaste.
- **Buscador en Tiempo Real:** Barra de búsqueda con selector de fuente rápido (Todas, Solo AnimeAV1, Solo JKAnime).
- **Ficha del Anime:**
  - Sinopsis completa y etiquetas de género.
  - **Apartado de Obras Relacionadas y Franquicia (MyAnimeList):** visualización clasificada de secuelas, precuelas, películas, OVAs, spin-offs y adaptaciones originales, con filtros por categoría y búsqueda en streaming a 1-clic.
  - Botón interactivo de **Añadir a Favoritos** con corazón animado.
  - Buscador rápido por número de episodio (ej. teclea `12` para encontrar al instante el capítulo 12 entre cientos de episodios).
  - Botón para invertir el orden de los capítulos (Ascendente / Descendente).
- **Sala de Reproducción:**
  - Contenedor centrado 16:9 con atributo `allowFullScreen`.
  - Selector superior de pestañas de servidores: cambia de servidor instantáneamente sin recargar la página.
  - Botón para abrir el reproductor en pestaña nueva en caso de bloqueos por adblock.
  - Botón "Modo Proxy" para evitar bloqueos por hotlinking o cabeceras Referer.
  - Controles de navegación rápida: **← Episodio Anterior** y **Episodio Siguiente →**.
  - Botón de enlace original directo a la web fuente como fallback.
  - Marcador de "Visto / No visto".
- **Persistencia en Local (`localStorage`):**
  - Guarda automáticamente el historial de capítulos vistos con fecha relativa ("Hace 10 min", "Ayer").
  - Guarda los animes marcados como favoritos.
  - Recuerda el último episodio reproducido.

---

## 🎮 Compatibilidad con Xbox (Microsoft Edge & Gamepad TV UI)

AnimeStream incluye soporte de primer nivel para **Xbox One, Xbox Series S y Xbox Series X** a través de **Microsoft Edge**:

- **Desactivación del Cursor Virtual de Edge:** Configura automáticamente `navigator.gamepadInputEmulation = 'gamepad'`, eliminando el puntero circular virtual de Edge y permitiendo una navegación directa y nativa por el DOM con el mando de la consola.
- **Interfaz TV de 10 Pies (10-Foot UI):** Detecta el entorno de Xbox (`.xbox-device`) aplicando márgenes de seguridad para sobreexploración de pantallas (overscan TV safe area), fuentes ampliadas y realces visuales con el verde oficial de Xbox (`#107c10`).
- **Mapeo Completo del Mando de Xbox:**
  - **Botón `A` (Verde):** Seleccionar enlace / botón enfocado o Alternar Reproducción / Pausa.
  - **Botón `B` (Rojo):** Volver atrás / Cerrar ventanas modales.
  - **Botón `X` (Azul):** Alternar Play/Pausa en vídeo o Añadir/Quitar de Favoritos en fichas.
  - **Botón `Y` (Amarillo):** Acceso rápido al buscador (despliega automáticamente el teclado virtual del sistema Xbox).
  - **`LB` / `RB`:** Episodio Anterior / Episodio Siguiente o cambio de página en catálogo.
  - **`LT` / `RT`:** Retroceder / Avanzar 10 segundos en el reproductor.
  - **`D-Pad` & Sticks:** Navegación espacial omnidireccional fluida / Control de volumen (±5%).
  - **Botón `View`:** Volver atrás.
  - **Botón `Menu` (☰):** Pantalla completa.
- **Barra de Ayuda HUD:** Guía flotante con las insignias de colores oficiales del mando de Xbox.

---

## 🛡️ AdBlocker Integrado

AnimeStream incorpora un potente motor de bloqueo de publicidad diseñado específicamente para los servidores de streaming de anime:

- **Anti-Popups y Anti-Popunders:** Intercepta y neutraliza cualquier llamada `window.open()` y scripts que intentan abrir pestañas o ventanas publicitarias en segundo plano.
- **Protección Anti-Clickjacking:** Escanea y elimina automáticamente capas transparentes superpuestas (`div` invisibles con z-index alto) que los servidores de terceros sitúan sobre el botón de reproducir para forzar clics publicitarios.
- **Sandboxing de Iframes:** El reproductor se ejecuta en un sandbox estricto que revoca `allow-top-navigation`, impidiendo que un servidor externo redirija la pestaña principal de AnimeStream a sitios de spam o malware.
- **Filtrado en Servidor (Proxy Sanitizer):** El endpoint `/api/proxy-player` elimina etiquetas `<script>`, `<iframe>` y enlaces a redes de anuncios conocidas (PopAds, PropellerAds, AdCash, Exoclick, etc.) antes de que lleguen al navegador, e inyecta un script guardián que previene bloqueos de clic.
- **Contador y Modal en Vivo:** Indicador en la barra de navegación que muestra en tiempo real cuántos anuncios o popups han sido neutralizados, con modal explicativo y control de encendido/apagado.

---

## 🛡️ Robustez y Manejo de Errores

1. **Cero Datos Estáticos:** Las extracciones son 100% dinámicas en tiempo real mediante BeautifulSoup y requests.
2. **Caché en Memoria (TTL 15 Minutos):** Sistema thread-safe que reduce drásticamente las peticiones a los servidores de origen, mejorando la velocidad de navegación por debajo de 50ms en peticiones cacheadas.
3. **Rotación de Cabeceras:** Envía User-Agents realistas de navegadores de escritorio modernos y cabeceras completas (`Accept-Language`, `Referer`, `Sec-Fetch-*`).
4. **Fallback Transparente:** En caso de que un servidor de origen esté caído o presente bloqueos, la interfaz muestra avisos claros y proporciona un botón para abrir el enlace original en una nueva pestaña o cambiar a la fuente alternativa con un solo clic.
