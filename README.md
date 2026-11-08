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

### Opción A: Inicio 100% Silencioso en Windows (SIN ventana de consola CMD)
Haz doble clic sobre:
```cmd
AnimeStream.vbs
```
Inicia Electron de forma instantánea y completamente silenciosa en segundo plano, sin dejar ninguna ventana negra de CMD abierta.

---

### Opción B: Modo Escritorio Nativo (Electron App con verificación)
Haz doble clic sobre:
```cmd
iniciar_electron.bat
```
O desde la consola:
```bash
npm run electron
```
Verifica que las dependencias estén instaladas, lanza la ventana de Electron en un proceso desacoplado y cierra la consola de inmediato.

---

### Opción C: Modo Servidor Web (Navegador y Red Local)
Haz doble clic sobre:
```cmd
iniciar.bat
```
O desde la consola:
```bash
npm start
```
Inicia el servidor en `http://localhost:3000` y abre automáticamente tu navegador web por defecto.

---

## 📡 Conexión con Smart TV y Móviles (Sin Consola CMD)

Ya no necesitas revisar la consola negra para saber la IP local. Una vez abierta la aplicación (en escritorio o navegador):
1. Haz clic en el botón **"📡 Dispositivos"** situado en la barra de navegación superior.
2. Se abrirá una tarjeta con:
   - La **dirección URL local optimizada** (filtrando adaptadores virtuales de VMware, VirtualBox o VPNs como Radmin/Hamachi para garantizar la IP correcta de tu Wi-Fi/Ethernet).
   - Un botón de **1-clic para copiar** el enlace.
   - Un **código QR dinámico** para escanear con la cámara de tu móvil o tablet Android.
   - Una guía paso a paso para mandos a distancia de Smart TV (LG WebOS, Samsung Tizen, Hisense VIDAA y Android TV).

---

## 📦 Soporte Multiplataforma (.exe, Binario ELF y .apk)

AnimeStream soporta de manera nativa y oficial las tres principales plataformas:

| Plataforma | Formato de Salida | Método de Compilación |
|---|---|---|
| **Windows** | Ejecutable `.exe` (Instalador NSIS y Portable) | `npm run build:win` |
| **Linux** | Binario ELF independiente (`.AppImage` y `.deb`) | `npm run build:linux` |
| **Android** | Paquete instalador nativo (`.apk`) | `cd android && ./gradlew assembleDebug` |

> [!NOTE]
> **Compatibilidad con macOS:** La compatibilidad con sistemas macOS ha sido formalmente retirada para enfocar todos los recursos en Windows (.exe), Linux (ELF) y Android (.apk).

### Generación de Instaladores y Exportación Local
Para generar todos los paquetes de exportación en tu propio equipo en un solo paso:
```cmd
exportar_todo.bat
```
O con Node:
```bash
npm run export:all
```
Los archivos e instrucciones listos para cada sistema se guardarán en la carpeta `dist/exports/`.

### Automatización en GitHub Releases
Cada vez que se crea una etiqueta de versión (`v*`) o se ejecuta el flujo `.github/workflows/build-all-platforms.yml` en GitHub Actions, se compilan automáticamente:
- `AnimeStream.Setup.exe` y `AnimeStream.exe` (Windows)
- `AnimeStream.AppImage` (Linux ELF)
- `AnimeStream.apk` (Android)
Y se adjuntan directamente al Release oficial de GitHub, actualizando automáticamente los botones de la página web.

---

## 🏛️ Estructura del Proyecto

```
AnimeStream/
├── android/                      # Proyecto nativo Gradle para compilar AnimeStream.apk
│   ├── app/
│   │   ├── build.gradle          # Configuración SDK 34, min SDK 21
│   │   └── src/main/java/        # MainActivity con WebView y soporte pantalla completa
│   ├── gradlew & gradlew.bat     # Wrappers de compilación Gradle
│   └── settings.gradle
├── electron/
│   ├── main.js                   # Proceso principal de Electron (ventanas y menú)
│   └── preload.js                # Context bridge seguro
├── server/
│   ├── index.js                  # Servidor Express, socket pooling y detección de IP LAN
│   ├── config.js                 # Constantes y Cloudflare Anycast unblocking
│   ├── cache.js                  # Caché thread-safe en memoria con TTL
│   ├── providers/
│   │   ├── animeav1.js           # Scraper concurrente de AnimeAV1
│   │   ├── jkanime.js            # Scraper estructurado de JKAnime
│   │   ├── tioanime.js           # Scraper optimizado de TioAnime
│   │   └── index.js              # Registro y detector de proveedores
│   ├── services/
│   │   ├── malService.js         # Extractor de franquicias audiovisuales MyAnimeList
│   │   ├── streamProxy.js        # Proxy y reescritor de manifiestos HLS
│   │   ├── playerSanitizer.js    # Sanitizador anti-anuncios
│   │   └── malXmlParser.js       # Parser de listas MyAnimeList (.xml/.xml.gz)
│   └── routes/
│       └── api.js                # Endpoints REST y /api/network-info
├── public/                       # Frontend SPA moderno
│   ├── index.html                # Plantilla HTML con manifest PWA y Service Worker
│   ├── manifest.json             # Manifiesto standalone para Android y escritorio
│   ├── sw.js                     # Service Worker con caché offline
│   ├── css/
│   │   └── style.css             # Estilos glassmorphism, modo cine y modal de dispositivos
│   └── js/
│       ├── app.js                # Enrutador por hash
│       ├── api.js                # Cliente asíncrono
│       ├── adblock.js            # Motor AdBlock
│       ├── tvNavigation.js       # Navegación 2D para Smart TV
│       └── components/
│           ├── navbar.js         # Barra con autocompletado y botón "📡 Dispositivos"
│           ├── networkModal.js   # Modal interactivo con IP y código QR
│           └── ...               # Vistas (home, search, anime, watch, library, etc.)
├── scripts/
│   └── export-all.js             # Exportador a Windows (.exe), Linux (ELF) y Android (.apk)
├── website/                      # Landing page oficial alojada en GitHub Pages
│   ├── index.html                # Centro de descargas multi-plataforma
│   ├── css/style.css             # Tarjetas de descarga responsivas
│   └── js/download.js            # Conector dinámico a GitHub Releases API
├── AnimeStream.vbs               # Lanzador silencioso sin consola CMD
├── iniciar.bat                   # Lanzador servidor web
├── iniciar_electron.bat          # Lanzador aplicación Electron desacoplada
├── iniciar_linux.sh              # Lanzador nativo para Linux
├── exportar_todo.bat             # Asistente de exportación multi-plataforma
├── package.json                  # Scripts de compilación (.exe, .AppImage) y dependencias
└── README.md                     # Documentación general
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

---

## 💬 Comunidad y Soporte

¿Tienes dudas, sugerencias o quieres enterarte de las últimas novedades de AnimeStream?
- **Cuenta Oficial en X (Twitter)**: [@animestreaem7f (https://x.com/animestreaem7f)](https://x.com/animestreaem7f)
- **Reporte de Errores**: Abre un [Issue en GitHub](https://github.com/deniselit008/AnimeStream/issues)
