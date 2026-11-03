# 🎬 AnimeStream — Edición Node.js & Electron

[![Node.js](https://img.shields.io/badge/Node.js-v20%20%7C%20v22+-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/Express-5.x-000000?logo=express&logoColor=white)](https://expressjs.com/)
[![Electron](https://img.shields.io/badge/Electron-Desktop%20App-47848F?logo=electron&logoColor=white)](https://www.electronjs.org/)
[![AdBlock](https://img.shields.io/badge/AdBlock-Nativo%20Integrado-10b981?logo=adblock&logoColor=white)](https://github.com)
[![MyAnimeList](https://img.shields.io/badge/MyAnimeList-Franchise%20Sync-2e51a2?logo=myanimelist&logoColor=white)](https://myanimelist.net)

> **Reescritura completa y moderna en Node.js y Electron** de la plataforma AnimeStream.
> Todo el backend, lógica de extracción en tiempo real, proxies de streaming HLS, AdBlocker integrado y la interfaz de usuario han sido reconstruidos para ofrecer máxima velocidad, resiliencia y una estética cinematográfica de última generación.

---

## 🌟 Novedades de la Versión Node.js & Electron

1. **⚡ Backend Nativo en Node.js (Express & Cheerio):**
   - Conexiones ultra rápidas con Keep-Alive y Connection Pooling reutilizable.
   - Scrapers concurrentes y tolerantes a fallos (`Promise.allSettled`) para **AnimeAV1**, **JKAnime** y **TioAnime**.
   - Bypass inteligente de censura de operadoras (Anycast Clean Routing para Cloudflare).

2. **💻 Modo Escritorio Nativo con Electron:**
   - Ejecutable como aplicación de escritorio independiente con aceleración por hardware.
   - Control de ventana nativo, atajos de teclado globales y menús de acceso rápido.
   - Reproducción sin restricciones de CORS ni bloqueos de hotlinking para servidores como Mega, Voe, Okru, Mp4upload, etc.

3. **🎨 Interfaz Ultra Moderna (Crunchyroll & Netflix Aesthetic):**
   - **Glassmorphism y Neon Glow:** Fondos OLED profundos (`#07090e`), bordes translúcidos con desenfoque de cristal (`backdrop-filter: blur(24px)`) y acentos de color naranja fuego / cian / violeta.
   - **Buscador con Autocompletado en Vivo:** Al escribir en la barra de búsqueda, se despliega una tarjeta flotante instantánea con miniaturas de anime y resultados en tiempo real sin recargar la página.
   - **Hero Carousel Dinámico:** Portada cinemática con animes destacados en emisión, carátula panorámica, botón de reproducción directa y selector de favoritos a 1-clic.
   - **Modo Cine & Luz Ambiental:** Sala de reproducción con botón de *Modo Cine* para maximizar la pantalla y efecto de luz ambiental posterior sincronizada.
   - **Atajos de Teclado:**
     - `C`: Activar / desactivar Modo Cine.
     - `F`: Pantalla completa.
     - `N`: Episodio siguiente.
     - `P`: Episodio anterior.

4. **📺 Compatibilidad Total con Smart TV (Hisense / VIDAA / WebOS / Tizen):**
   - Motor de navegación espacial 2D (`tvNavigation.js`) con anillo de enfoque de alto contraste.
   - Soporte para cruceta (D-Pad), botón OK/Enter, botón Atrás del mando (código 461 en VIDAA, 10009 en Tizen) y botones de colores.
   - Servidor local accesible en la red Wi-Fi/Ethernet para reproducir directamente en el navegador del televisor.

5. **🛡️ Escudo AdBlocker Integrado:**
   - Bloqueo preventivo de popups, scripts de redes publicitarias invasivas y trampas de secuestro de clics (clickjacking).
   - Servidor Proxy HTML (`/api/proxy-player`) que elimina cabeceras restrictivas `X-Frame-Options` y `Content-Security-Policy`.

6. **🔗 Franquicia y Secuelas con MyAnimeList:**
   - Detección automática de secuelas, precuelas, películas, OVAs y especiales con carátulas en alta definición y navegación interactiva.

7. **📚 Gestor de Biblioteca e Importador MAL:**
   - Permite importar listas de MyAnimeList (`.xml` y `.xml.gz`) tanto por subida manual como por detección automática de archivos en la carpeta de descargas del equipo.

---

## 🚀 Cómo Ejecutar la Aplicación

Tienes dos opciones listas para usar de 1-clic:

### Opción A: Modo Web (Navegador y Red Local / Smart TV)
Haz doble clic sobre:
```cmd
iniciar.bat
```
O desde la consola:
```bash
npm start
```
Esto iniciará el servidor en `http://localhost:3000` y abrirá automáticamente tu navegador web por defecto. También mostrará en pantalla la dirección IP de tu red local (por ejemplo `http://192.168.1.XX:3000`) para ver el anime en tu Smart TV o móvil.

---

### Opción B: Modo Escritorio Nativo (Electron App)
Haz doble clic sobre:
```cmd
iniciar_electron.bat
```
O desde la consola:
```bash
npm run electron
```
Esto levantará la aplicación nativa de escritorio con su propia ventana optimizada.

---

## 🏛️ Estructura del Código Reescrito

```
prueba/
├── server/
│   ├── index.js                  # Servidor Express, socket pooling y fallback SPA
│   ├── config.js                 # Constantes, Cloudflare Anycast unblocking y UTF-8 repair
│   ├── cache.js                  # Caché thread-safe en memoria con TTL de 15 min
│   ├── providers/
│   │   ├── animeav1.js           # Scraper concurrente de AnimeAV1
│   │   ├── jkanime.js            # Scraper estructurado de JKAnime
│   │   ├── tioanime.js           # Scraper optimizado de TioAnime
│   │   └── index.js              # Registro y detector de proveedores
│   ├── services/
│   │   ├── malService.js         # Extractor de franquicias audiovisuales MyAnimeList
│   │   ├── streamProxy.js        # Proxy y reescritor de manifiestos HLS y segmentos MPEG-TS
│   │   ├── playerSanitizer.js    # Sanitizador anti-anuncios y deshabilitador de restricciones iframe
│   │   └── malXmlParser.js       # Parser de archivos exportados de MyAnimeList (.xml/.xml.gz)
│   └── routes/
│       └── api.js                # Endpoints REST unificados (/api/*)
├── electron/
│   ├── main.js                   # Proceso principal de Electron (gestión de ventanas y menú)
│   └── preload.js                # Context bridge seguro
├── public/                       # Frontend SPA moderno
│   ├── index.html                # Plantilla HTML con tipografía Google Fonts
│   ├── css/
│   │   └── style.css             # Estilos de diseño streaming, glassmorphism y modo cine
│   ├── js/
│   │   ├── app.js                # Enrutador por hash (#/, #/watch, #/anime, etc.)
│   │   ├── api.js                # Cliente asíncrono hacia el backend
│   │   ├── adblock.js            # Motor AdBlock integrado
│   │   ├── tvNavigation.js       # Motor de navegación espacial 2D para mandos de TV
│   │   ├── storage.js            # Persistencia de biblioteca, historial y favoritos
│   │   ├── utils.js              # Iconos SVG y funciones auxiliares
│   │   └── components/
│   │       ├── navbar.js         # Barra superior con autocompletado en vivo
│   │       ├── homeView.js       # Hero banner dinámico y últimos episodios
│   │       ├── searchView.js     # Búsqueda multifuente
│   │       ├── animeView.js      # Ficha técnica y lista interactiva de capítulos
│   │       ├── watchView.js      # Sala de streaming con Modo Cine y atajos de teclado
│   │       ├── directoryView.js  # Directorio con filtros avanzados
│   │       ├── libraryView.js    # Gestor de biblioteca ("Mi Lista")
│   │       ├── favoritesView.js  # Colección de favoritos
│   │       └── historyView.js    # Historial de reproducción
│   └── vendor/
│       └── hls.min.js            # Reproductor HLS local offline
├── run.js                        # Lanzador de consola con apertura automática de navegador
├── iniciar.bat                   # Lanzador para Windows (Modo Web)
├── iniciar_electron.bat          # Lanzador para Windows (Modo Electron)
├── package.json                  # Dependencias y scripts npm
└── README.md                     # Esta documentación
```

---

## 📡 Endpoints de la API REST

| Método | Endpoint | Descripción |
|---|---|---|
| `GET` | `/api/latest?source=all` | Últimos episodios en emisión de todas las fuentes. |
| `GET` | `/api/search?q=:query&source=all` | Búsqueda global simultánea con tolerancia a fallos. |
| `GET` | `/api/directory?genre=...&page=1` | Catálogo filtrable por género, año, estado y tipo. |
| `GET` | `/api/anime?url=:canonicalUrl` | Ficha técnica completa y episodios ordenados. |
| `GET` | `/api/anime/relations?title=:title` | Obras relacionadas desde MyAnimeList. |
| `GET` | `/api/watch?url=:canonicalUrl` | Servidores de vídeo (HLS, Mega, Voe, etc.) y navegación. |
| `GET` | `/api/hls/player/:hash` | Reproductor HTML5 nativo para transmisiones HLS. |
| `GET` | `/api/hls/m3u8/:hash` | Proxy y reescritor de listas de reproducción `.m3u8`. |
| `GET` | `/api/hls/seg/:hash/:file` | Proxy de fragmentos de vídeo `.ts`. |
| `GET` | `/api/proxy-player?url=...` | Desactivador de restricciones Iframe con filtro AdBlock. |
| `GET` | `/api/image-proxy?url=...` | Proxy de imágenes con cabeceras de caché persistente. |
| `POST`| `/api/library/parse-mal` | Importación de archivos `.xml` o `.xml.gz` de MyAnimeList. |
| `GET` | `/api/library/local-file` | Detección automática del archivo exportado más reciente. |
| `GET` | `/api/cache/stats` | Estadísticas de aciertos y memoria caché. |
| `POST`| `/api/cache/clear` | Vaciado manual de la memoria caché. |
| `GET` | `/api/health` | Estado del servidor y tiempo de actividad. |
