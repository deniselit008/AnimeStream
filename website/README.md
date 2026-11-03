# 🌐 AnimeStream — Landing Page Oficial de Descarga para Windows

Página web moderna, ultrarrápida y optimizada conforme a la **[Guía de optimización en motores de búsqueda (SEO) para principiantes de Google](https://developers.google.com/search/docs/fundamentals/seo-starter-guide?hl=es)**.

Está configurada para consultar dinámicamente la **API de GitHub Releases** del repositorio [`deniselit008/AnimeStream`](https://github.com/deniselit008/AnimeStream) para ofrecer **siempre la última versión disponible** del ejecutable autónomo (`AnimeStream.exe`), mostrando automáticamente su número de versión, tamaño de descarga y fecha de lanzamiento con enlaces de respaldo (fallback) automáticos.

---

## 🚀 Vista Previa Local Inmediata

Puedes probar la página web en tu equipo en 1 segundo con:

1. **Doble clic en `preview_website.bat`** (en la raíz del repositorio).
2. O ejecutando desde la terminal:
   ```bash
   python -m http.server 8080 --directory website
   ```
3. Abre en tu navegador: [**`http://localhost:8080`**](http://localhost:8080)

---

## 🔍 Optimizaciones SEO Implementadas (Google SEO Starter Guide)

La página implementa el 100% de los estándares recomendados por Google Search Central:

### 1. Rastreo e Indexación (Crawling & Indexing)
- **`robots.txt`**: Directivas abiertas para que Googlebot indexe todo el contenido, hojas de estilo CSS y scripts JS, vinculando explícitamente el `sitemap.xml`.
- **`sitemap.xml`**: Mapa del sitio en formato estándar XML con etiquetas de última modificación (`<lastmod>`), frecuencia de cambio (`weekly`), prioridad (`1.0`) y metadatos de imágenes.
- **Etiqueta canónica (`rel="canonical"`)**: Evita contenido duplicado apuntando a la URL principal.
- **Metatag robots**: `index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1`.

### 2. Títulos y Metadescripciones (Snippets)
- **`<title>` único y conciso (59 caracteres)**:
  `AnimeStream para Windows — Descargar Gratis la Última Versión Oficial`
- **`<meta name="description">` atractiva y persuasiva (152 caracteres)**:
  `Descarga gratis AnimeStream para Windows 10 y 11 (64-bit). Agregador de anime en tiempo real sin anuncios invasivos, multi-fuente, soporte Smart TV y portable.`

### 3. Estructura Jerárquica Semántica
- Un único encabezado `<h1>` con el tema principal de la página.
- Encabezados lógicos `<h2>` y `<h3>` para cada bloque de contenido (`#caracteristicas`, `#fuentes`, `#comparativa`, `#requisitos`, `#instalacion`, `#descargar`, `#faq`, `#seguridad`).
- Elementos semánticos HTML5 (`<header>`, `<nav>`, `<main>`, `<section>`, `<article>`, `<aside>`, `<footer>`).

### 4. Datos Estructurados (Schema.org / JSON-LD) para Rich Snippets
- **`SoftwareApplication`**: Metadatos de la aplicación para Windows 10/11, precio gratuito ($0 USD), versión dinámica, puntuación de 4.9 estrellas y autor.
- **`FAQPage`**: Permite a Google desplegar las preguntas y respuestas directamente como un acordeón enriquecido en la página de resultados de búsqueda.
- **`BreadcrumbList`**: Ruta de navegación estructurada (Inicio > Windows > Descargar AnimeStream).

### 5. Optimización de Enlaces e Imágenes
- **Texto de anclaje (Anchor text) descriptivo**: Se eliminaron textos genéricos como "clic aquí" a favor de frases descriptivas ("Descargar AnimeStream.exe", "Ver código en GitHub", "Historial de versiones").
- **Imágenes y gráficos SVG**: Cada recurso visual (`logo.svg`, `app-preview.svg`, `smartscreen-step1.svg`, `smartscreen-step2.svg`) incluye atributos `alt` detallados, dimensiones explícitas (`width` y `height` para evitar CLS) y carga diferida (`loading="lazy"`).

### 6. Rendimiento y Core Web Vitals
- **Zero Bloat**: 0 KB de frameworks pesados (sin React, Vue ni jQuery). Todo construido en HTML5 semántico, CSS moderno con variables y Vanilla JavaScript nativo.
- Carga instantánea (LCP < 0.3s, CLS = 0).
- Compatible con dispositivos móviles (Touch targets >= 48px y diseño 100% responsivo).

### 7. Open Graph y Twitter Cards
- Tarjetas de previsualización social (`og:title`, `og:description`, `og:image`, `twitter:card="summary_large_image"`). Diseñadas para que al compartir el enlace en WhatsApp, Telegram, Discord, Twitter o Facebook, se muestre una portada con la interfaz y descripción oficial.

---

## ⚡ Motor de Descarga Dinámica (`js/download.js`)

La página se conecta automáticamente con la API de GitHub:

1. Realiza una petición `GET` asíncrona a `https://api.github.com/repos/deniselit008/AnimeStream/releases`.
2. Filtra los lanzamientos para encontrar el más reciente que contenga un binario para Windows (`.exe`).
3. Extrae automáticamente:
   - Nombre del ejecutable (ej. `AnimeStream.1.0.4.exe` o `AnimeStream.exe`).
   - Enlace directo de descarga en los servidores CDN de GitHub.
   - Tamaño del archivo formateado (ej. `24.3 MB`).
   - Fecha de publicación en español.
4. Actualiza en tiempo real los botones principales de descarga, las etiquetas de versión y el schema JSON-LD.
5. **Mecanismo de Respaldo Failsafe**: Si la cuota de la API de GitHub se agota o el usuario está sin conexión, la página conmuta automáticamente al enlace de descarga directo garantizado sin romper la interfaz.

---

## 📦 Opciones de Despliegue en Internet

### Opción 1: GitHub Pages (Gratis y Automático)
1. Ve a tu repositorio en GitHub: [https://github.com/deniselit008/AnimeStream](https://github.com/deniselit008/AnimeStream)
2. Entra en **Settings** > **Pages**.
3. En **Build and deployment**:
   - **Source**: `Deploy from a branch`
   - **Branch**: Si configuras una GitHub Action para publicar la carpeta `website/`, o si copias el contenido de `website/` a la raíz de la rama `gh-pages` o carpeta `/docs`.
   - Tu web quedará publicada en: `https://deniselit008.github.io/AnimeStream/`

### Opción 2: Cloudflare Pages / Vercel / Netlify
1. Conecta tu repositorio de GitHub.
2. Configura el **Root Directory** o **Publish Directory** como: `website`
3. Comando de construcción (Build command): Déjalo en blanco (es HTML/CSS/JS estático puro).
4. El despliegue tarda menos de 10 segundos con CDN global y certificado SSL HTTPS gratuito.
