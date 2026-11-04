/**
 * Client-Side Autonomous Anime Scraper Engine for AnimeStream
 * Runs directly on Android mobile devices without needing a PC or secondary server.
 * Connects natively via AndroidBridge.fetchUrl to bypass browser CORS completely.
 */

// Helper to execute native HTTP fetch via Android bridge or fallback
export async function fetchHtml(url, headers = {}) {
  if (typeof window !== 'undefined' && window.AndroidBridge && typeof window.AndroidBridge.fetchUrl === 'function') {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        try {
          const raw = window.AndroidBridge.fetchUrl(url, JSON.stringify(headers));
          const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
          if (parsed.status >= 200 && parsed.status < 400) {
            resolve(parsed.body || '');
          } else {
            reject(new Error(parsed.error || `HTTP ${parsed.status} al conectar con ${url}`));
          }
        } catch (err) {
          reject(err);
        }
      }, 0);
    });
  }

  // Standard fetch fallback (with timeout)
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch(url, { headers, signal: controller.signal });
    clearTimeout(timeoutId);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } catch (e) {
    clearTimeout(timeoutId);
    throw e;
  }
}

function parseDocument(html) {
  const parser = new DOMParser();
  return parser.parseFromString(html, 'text/html');
}

function fixText(str) {
  if (!str) return '';
  return String(str).trim();
}

// ==============================================================================
// 1. ANIMEAV1 CLIENT SCRAPER
// ==============================================================================
export const ClientAnimeAV1 = {
  name: 'AnimeAV1',
  baseUrl: 'https://animeav1.com',

  formatUrl(pathOrUrl) {
    if (!pathOrUrl) return '';
    if (pathOrUrl.startsWith('http://') || pathOrUrl.startsWith('https://')) return pathOrUrl;
    if (!pathOrUrl.startsWith('/')) pathOrUrl = '/' + pathOrUrl;
    return `${this.baseUrl}${pathOrUrl}`;
  },

  async getLatest() {
    const html = await fetchHtml(this.baseUrl);
    const doc = parseDocument(html);
    const items = [];
    const seen = new Set();

    const links = doc.querySelectorAll('a');
    links.forEach(a => {
      const href = a.getAttribute('href') || '';
      const m = href.match(/^\/media\/([^/]+)\/(\d+)$/);
      if (!m) return;

      const slug = m[1];
      const epNum = parseInt(m[2], 10);
      const key = `${slug}_${epNum}`;
      if (seen.has(key)) return;
      seen.add(key);

      const parent = a.closest('.item, .card, .group, .relative') || a.parentElement;
      const img = parent ? parent.querySelector('img') : null;
      let imgSrc = img ? (img.getAttribute('src') || img.getAttribute('data-src')) : null;
      if (imgSrc && !imgSrc.startsWith('http')) imgSrc = this.formatUrl(imgSrc);

      let title = a.textContent.replace(/\s+/g, ' ').replace(/^Ver\s+/i, '').replace(new RegExp(`\\s+${epNum}$`), '').trim();
      if (!title) title = slug.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

      items.push({
        title: fixText(title),
        episode: epNum,
        image: imgSrc || null,
        url: this.formatUrl(href),
        animeUrl: this.formatUrl(`/media/${slug}`),
        source: this.name
      });
    });

    return items;
  },

  async search(query) {
    const url = `${this.baseUrl}/catalogo?search=${encodeURIComponent(query.trim())}`;
    const html = await fetchHtml(url);
    const doc = parseDocument(html);
    const results = [];
    const seen = new Set();

    const links = doc.querySelectorAll('a');
    links.forEach(a => {
      const href = a.getAttribute('href') || '';
      const m = href.match(/^\/media\/([^/]+)$/);
      if (!m) return;

      const slug = m[1];
      if (seen.has(slug) || ['catalogo', 'horario', 'pages'].includes(slug)) return;
      seen.add(slug);

      const parent = a.closest('article, [class*="group"], .card, .item, .media') || a.parentElement;
      const titleEl = parent ? parent.querySelector('h3, h4, h5, .title') : null;
      let title = titleEl ? titleEl.textContent.trim() : a.textContent.replace(/^Ver\s+/i, '').trim();
      if (!title) title = slug.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

      const img = parent ? parent.querySelector('img') : null;
      let image = img ? (img.getAttribute('src') || img.getAttribute('data-src')) : null;
      if (image && !image.startsWith('http')) image = this.formatUrl(image);

      results.push({
        title: fixText(title),
        url: this.formatUrl(href),
        image: image || null,
        source: this.name,
        type: 'Anime'
      });
    });

    return results;
  },

  async getAnime(targetUrl) {
    const fullUrl = this.formatUrl(targetUrl);
    const html = await fetchHtml(fullUrl);
    const doc = parseDocument(html);

    let title = doc.querySelector('h1')?.textContent.trim();
    if (!title) {
      const mTitle = html.match(/title:"([^"]+)"/);
      title = mTitle ? mTitle[1] : fullUrl.split('/').pop().replace(/-/g, ' ');
    }

    let synopsis = '';
    const mSyn = html.match(/synopsis:"(.*?)"[,}]/);
    if (mSyn) {
      try { synopsis = JSON.parse(`"${mSyn[1]}"`); } catch (_) { synopsis = mSyn[1]; }
    }
    if (!synopsis) {
      synopsis = doc.querySelector('meta[property="og:description"]')?.getAttribute('content') || '';
    }

    let image = doc.querySelector('img.aspect-poster, img[class*="aspect-poster"]')?.getAttribute('src') || doc.querySelector('img')?.getAttribute('src');
    if (image && !image.startsWith('http')) image = this.formatUrl(image);

    let backdrop = doc.querySelector('img.backdrop, img[class*="backdrop"]')?.getAttribute('src');
    if (backdrop && !backdrop.startsWith('http')) backdrop = this.formatUrl(backdrop);

    const genres = [];
    doc.querySelectorAll('a[href*="/catalogo?genre="]').forEach(a => {
      const g = a.textContent.trim();
      if (g && !genres.includes(g)) genres.push(g);
    });

    let status = 'En emisión';
    const mStatus = html.match(/status:(\d+)/);
    if (mStatus && mStatus[1] === '1') status = 'Finalizado';

    const slug = fullUrl.split('/').pop();
    const episodes = [];
    const seenEps = new Set();

    const mEps = [...html.matchAll(/\{id:(\d+),number:(\d+)\}/g)];
    const mMediaId = html.match(/media:\{id:(\d+)/);
    const mid = mMediaId ? mMediaId[1] : '';

    if (mEps.length > 0) {
      mEps.forEach(mep => {
        const epNum = parseInt(mep[2], 10);
        if (seenEps.has(epNum)) return;
        seenEps.add(epNum);
        const thumb = mid ? `https://cdn.animeav1.com/screenshots/${mid}/${epNum}.jpg` : null;
        episodes.push({
          number: epNum,
          title: `Episodio ${epNum}`,
          url: this.formatUrl(`/media/${slug}/${epNum}`),
          image: thumb
        });
      });
    }

    if (episodes.length === 0) {
      const epRegex = new RegExp(`^/media/${slug}/(\\d+)$`);
      doc.querySelectorAll('a').forEach(a => {
        const href = a.getAttribute('href') || '';
        const m = href.match(epRegex);
        if (m) {
          const epNum = parseInt(m[1], 10);
          if (!seenEps.has(epNum)) {
            seenEps.add(epNum);
            episodes.push({
              number: epNum,
              title: `Episodio ${epNum}`,
              url: this.formatUrl(href),
              image: null
            });
          }
        }
      });
    }

    episodes.sort((a, b) => a.number - b.number);

    return {
      title: fixText(title),
      url: fullUrl,
      image,
      backdrop,
      synopsis: fixText(synopsis),
      genres,
      status,
      source: this.name,
      episodes,
      relations: []
    };
  },

  async getWatch(targetUrl) {
    const fullUrl = this.formatUrl(targetUrl);
    const html = await fetchHtml(fullUrl);
    const doc = parseDocument(html);

    const mSlugEp = fullUrl.match(/\/media\/([^/]+)\/(\d+)/);
    const slug = mSlugEp ? mSlugEp[1] : '';
    const epNum = mSlugEp ? parseInt(mSlugEp[2], 10) : 1;
    const animeUrl = this.formatUrl(`/media/${slug}`);

    let animeTitle = '';
    const mTitle = html.match(/media:\{[^{}]*title:"([^"]+)"/);
    if (mTitle && !['episodio', 'episodios'].includes(mTitle[1].toLowerCase())) {
      animeTitle = mTitle[1];
    }
    if (!animeTitle) {
      const rawH1 = doc.querySelector('h1')?.textContent.trim();
      if (rawH1 && !rawH1.toLowerCase().startsWith('episodio')) {
        animeTitle = rawH1.replace(new RegExp(`\\s+${epNum}$`), '').trim();
      }
    }
    if (!animeTitle) animeTitle = slug.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

    let prevUrl = doc.querySelector('a[aria-label="Anterior"]')?.getAttribute('href');
    if (prevUrl) prevUrl = this.formatUrl(prevUrl);
    else if (epNum > 1) prevUrl = this.formatUrl(`/media/${slug}/${epNum - 1}`);

    let nextUrl = doc.querySelector('a[aria-label="Siguiente"]')?.getAttribute('href');
    if (nextUrl) nextUrl = this.formatUrl(nextUrl);

    const servers = [];
    const seenEmbeds = new Set();
    const audios = [];

    const mEmbeds = html.match(/embeds:\{(.*?)\},\s*(?:downloads|subtitles|mirrors):/s);
    if (mEmbeds) {
      const rawBlock = mEmbeds[1];
      for (const variant of ['SUB', 'DUB']) {
        const varMatch = rawBlock.match(new RegExp(`${variant}:\\[(.*?)\\]`, 's'));
        if (varMatch) {
          const sList = [...varMatch[1].matchAll(/\{server:"([^"]+)",url:"([^"]+)"\}/g)];
          if (sList.length > 0 && !audios.includes(variant)) audios.push(variant);

          for (const s of sList) {
            const sName = s[1].trim();
            const sUrl = s[2];
            const labelPrefix = `[${variant}] `;

            if (!seenEmbeds.has(`${sUrl}_${variant}`)) {
              seenEmbeds.add(`${sUrl}_${variant}`);
              servers.push({
                name: `${labelPrefix}${sName}`,
                embed: sUrl,
                audio: variant
              });
            }
          }
        }
      }
    }

    let image = doc.querySelector('meta[property="og:image"]')?.getAttribute('content');
    if (image && !image.startsWith('http')) image = this.formatUrl(image);

    return {
      animeTitle: fixText(animeTitle),
      episode: epNum,
      url: fullUrl,
      animeUrl,
      image,
      source: this.name,
      prevUrl,
      nextUrl,
      servers,
      audios: audios.length > 0 ? audios : ['SUB']
    };
  },

  async getDirectory(genre = null, type = null, year = null, status = null, page = 1) {
    const params = new URLSearchParams();
    if (genre && genre !== 'all') params.set('genre', genre);
    if (type && type !== 'all') params.set('type', type);
    if (year && year !== 'all') params.set('year', year);
    if (status && status !== 'all') params.set('status', status === 'finalizado' ? '1' : '0');
    if (page && page > 1) params.set('page', page);

    const qs = params.toString();
    const url = `${this.baseUrl}/catalogo${qs ? '?' + qs : ''}`;
    const html = await fetchHtml(url);
    const doc = parseDocument(html);
    const results = [];
    const seen = new Set();

    doc.querySelectorAll('a').forEach(a => {
      const href = a.getAttribute('href') || '';
      const m = href.match(/^\/media\/([^/]+)$/);
      if (!m) return;
      const slug = m[1];
      if (seen.has(slug) || ['catalogo', 'horario'].includes(slug)) return;
      seen.add(slug);

      const parent = a.closest('article, [class*="group"], .card, .item, .media') || a.parentElement;
      const titleEl = parent ? parent.querySelector('h3, h4, h5, .title') : null;
      let title = titleEl ? titleEl.textContent.trim() : a.textContent.trim();
      if (!title) title = slug.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

      const img = parent ? parent.querySelector('img') : null;
      let image = img ? (img.getAttribute('src') || img.getAttribute('data-src')) : null;
      if (image && !image.startsWith('http')) image = this.formatUrl(image);

      results.push({
        title: fixText(title),
        url: this.formatUrl(href),
        image: image || null,
        source: this.name,
        type: 'Anime'
      });
    });

    return results;
  }
};

// ==============================================================================
// 2. TIOANIME CLIENT SCRAPER
// ==============================================================================
export const ClientTioAnime = {
  name: 'TioAnime',
  baseUrl: 'https://tioanime.com',

  formatUrl(pathOrUrl) {
    if (!pathOrUrl) return '';
    if (pathOrUrl.startsWith('http://') || pathOrUrl.startsWith('https://')) return pathOrUrl;
    if (!pathOrUrl.startsWith('/')) pathOrUrl = '/' + pathOrUrl;
    return `${this.baseUrl}${pathOrUrl}`;
  },

  async getLatest() {
    const html = await fetchHtml(this.baseUrl);
    const doc = parseDocument(html);
    const items = [];
    const seen = new Set();

    doc.querySelectorAll('a[href^="/ver/"]').forEach(a => {
      const href = a.getAttribute('href') || '';
      const m = href.match(/^\/ver\/(.+)-(\d+)$/);
      if (!m) return;

      const slug = m[1];
      const epNum = parseInt(m[2], 10);
      const key = `${slug}_${epNum}`;
      if (seen.has(key)) return;
      seen.add(key);

      const parent = a.closest('article, .col, .item, .episode, .card') || a.parentElement;
      const titleEl = parent ? parent.querySelector('h3, h4, h5, span.title, .title') : null;
      let title = titleEl ? titleEl.textContent.trim() : slug.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
      title = title.replace(new RegExp(`\\s+${epNum}$`), '').trim();

      const img = parent ? parent.querySelector('img') : null;
      let imgSrc = img ? img.getAttribute('src') : null;
      if (imgSrc && !imgSrc.startsWith('http')) imgSrc = this.formatUrl(imgSrc);

      items.push({
        title: fixText(title),
        episode: epNum,
        image: imgSrc || null,
        url: this.formatUrl(href),
        animeUrl: this.formatUrl(`/anime/${slug}`),
        source: this.name
      });
    });

    return items;
  },

  async search(query) {
    const url = `${this.baseUrl}/directorio?q=${encodeURIComponent(query.trim())}`;
    const html = await fetchHtml(url);
    const doc = parseDocument(html);
    const results = [];
    const seen = new Set();

    doc.querySelectorAll('a[href^="/anime/"]').forEach(a => {
      const href = a.getAttribute('href') || '';
      const slug = href.replace(/\/+$/, '').split('/').pop();
      if (!slug || seen.has(slug) || ['directorio', 'programacion'].includes(slug)) return;
      seen.add(slug);

      const parent = a.closest('article, .col, .item, .anime, .card') || a.parentElement;
      const titleEl = parent ? parent.querySelector('h3, h4, h5, span.title, .title') : null;
      let title = titleEl ? titleEl.textContent.trim() : slug.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

      const img = parent ? parent.querySelector('img') : null;
      let imgSrc = img ? img.getAttribute('src') : null;
      if (imgSrc && !imgSrc.startsWith('http')) imgSrc = this.formatUrl(imgSrc);

      results.push({
        title: fixText(title),
        url: this.formatUrl(href),
        image: imgSrc || null,
        source: this.name,
        type: 'Anime'
      });
    });

    return results;
  },

  async getAnime(targetUrl) {
    const fullUrl = this.formatUrl(targetUrl);
    const html = await fetchHtml(fullUrl);
    const doc = parseDocument(html);
    const slug = fullUrl.replace(/\/+$/, '').split('/').pop();

    let title = doc.querySelector('h1.title')?.textContent.trim() || slug.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    let image = doc.querySelector('.thumb img')?.getAttribute('src');
    if (image && !image.startsWith('http')) image = this.formatUrl(image);

    let synopsis = doc.querySelector('.sinopsis')?.textContent.trim() || '';

    const genres = [];
    doc.querySelectorAll('.genres a').forEach(a => {
      const g = a.textContent.trim();
      if (g && !genres.includes(g)) genres.push(g);
    });

    let status = 'En emisión';
    const statusBtn = doc.querySelector('.status .btn');
    if (statusBtn && statusBtn.textContent.includes('Finalizado')) status = 'Finalizado';

    const episodes = [];
    const mEps = html.match(/var episodes = (\[.*?\]);/);
    if (mEps) {
      try {
        const epsData = JSON.parse(mEps[1]);
        for (const ep of epsData) {
          const epNum = Array.isArray(ep) ? ep[0] : ep;
          episodes.push({
            number: epNum,
            title: `Episodio ${epNum}`,
            url: this.formatUrl(`/ver/${slug}-${epNum}`),
            image: `https://tioanime.com/uploads/thumbs/${epNum}.jpg`
          });
        }
      } catch (_) {}
    }

    episodes.sort((a, b) => a.number - b.number);

    return {
      title: fixText(title),
      url: fullUrl,
      image,
      synopsis: fixText(synopsis),
      genres,
      status,
      source: this.name,
      episodes,
      relations: []
    };
  },

  async getWatch(targetUrl) {
    const fullUrl = this.formatUrl(targetUrl);
    const html = await fetchHtml(fullUrl);
    const doc = parseDocument(html);

    const mSlugEp = fullUrl.match(/\/ver\/(.+)-(\d+)\/?$/);
    const slug = mSlugEp ? mSlugEp[1] : '';
    const epNum = mSlugEp ? parseInt(mSlugEp[2], 10) : 1;
    const animeUrl = this.formatUrl(`/anime/${slug}`);

    let animeTitle = slug.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

    const prevUrl = epNum > 1 ? this.formatUrl(`/ver/${slug}-${epNum - 1}`) : null;
    const nextUrl = this.formatUrl(`/ver/${slug}-${epNum + 1}`);

    const isDub = ['latino', 'castellano', 'doblado', 'dub'].some(k => (slug + ' ' + animeTitle).toLowerCase().includes(k));
    const audioType = isDub ? 'DUB' : 'SUB';
    const audioPrefix = `[${audioType}] `;

    const servers = [];
    const mVid = html.match(/var videos = (\[.*?\]);/);
    if (mVid) {
      try {
        const vidData = JSON.parse(mVid[1]);
        for (const v of vidData) {
          servers.push({
            name: `${audioPrefix}${v[0]}`,
            embed: v[1],
            audio: audioType
          });
        }
      } catch (_) {}
    }

    let image = doc.querySelector('img')?.getAttribute('src');
    if (image && !image.startsWith('http')) image = this.formatUrl(image);

    return {
      animeTitle: fixText(animeTitle),
      episode: epNum,
      url: fullUrl,
      animeUrl,
      image,
      source: this.name,
      prevUrl,
      nextUrl,
      servers,
      audios: [audioType]
    };
  },

  async getDirectory(genre = null, type = null, year = null, status = null, page = 1) {
    const params = new URLSearchParams();
    if (genre && genre !== 'all') params.set('genero', genre.toLowerCase());
    if (type && type !== 'all') params.set('tipo', type.toLowerCase());
    if (year && year !== 'all') params.set('year', year);
    if (status && status !== 'all') params.set('status', status === 'finalizado' ? '2' : '1');
    if (page && page > 1) params.set('p', page);

    const qs = params.toString();
    const url = `${this.baseUrl}/directorio${qs ? '?' + qs : ''}`;
    const html = await fetchHtml(url);
    const doc = parseDocument(html);
    const results = [];
    const seen = new Set();

    doc.querySelectorAll('a[href^="/anime/"]').forEach(a => {
      const href = a.getAttribute('href') || '';
      const slug = href.replace(/\/+$/, '').split('/').pop();
      if (!slug || seen.has(slug) || ['directorio', 'programacion'].includes(slug)) return;
      seen.add(slug);

      const parent = a.closest('article, .col, .item, .anime, .card') || a.parentElement;
      const titleEl = parent ? parent.querySelector('h3, h4, h5, span.title, .title') : null;
      let title = titleEl ? titleEl.textContent.trim() : slug.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

      const img = parent ? parent.querySelector('img') : null;
      let imgSrc = img ? img.getAttribute('src') : null;
      if (imgSrc && !imgSrc.startsWith('http')) imgSrc = this.formatUrl(imgSrc);

      results.push({
        title: fixText(title),
        url: this.formatUrl(href),
        image: imgSrc || null,
        source: this.name,
        type: 'Anime'
      });
    });

    return results;
  }
};

// ==============================================================================
// 3. JKANIME CLIENT SCRAPER
// ==============================================================================
export const ClientJKAnime = {
  name: 'JKAnime',
  baseUrl: 'https://jkanime.net',

  formatUrl(pathOrUrl) {
    if (!pathOrUrl) return '';
    if (pathOrUrl.startsWith('http://') || pathOrUrl.startsWith('https://')) return pathOrUrl;
    if (!pathOrUrl.startsWith('/')) pathOrUrl = '/' + pathOrUrl;
    return `${this.baseUrl}${pathOrUrl}`;
  },

  async getLatest() {
    const html = await fetchHtml(this.baseUrl);
    const doc = parseDocument(html);
    const items = [];
    const seen = new Set();

    doc.querySelectorAll('section.contenido a, .maxilist a, .anime__item a').forEach(a => {
      const href = a.getAttribute('href') || '';
      if (href.startsWith('http') && !href.includes('jkanime.net')) return;

      const m = href.match(/(?:https:\/\/jkanime\.net)?\/([^/]+)\/(\d+)\/?$/);
      if (!m) return;

      const slug = m[1];
      const epNum = parseInt(m[2], 10);
      const key = `${slug}_${epNum}`;
      if (seen.has(key)) return;
      seen.add(key);

      const card = a.closest('.col, .item, .card, .anime') || a;
      const titleEl = card.querySelector('h5, h6, h4, h3, .card-title');
      let title = titleEl ? titleEl.textContent.trim() : slug.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
      title = title.replace(new RegExp(`\\s*-\\s*${epNum}$`), '').trim();

      const img = card.querySelector('.set-bg, img');
      let imgSrc = img ? (img.getAttribute('data-setbg') || img.getAttribute('src')) : null;
      if (!imgSrc) imgSrc = `https://cdn.jkdesa.com/assets/images/animes/image/${slug}.jpg`;

      items.push({
        title: fixText(title),
        episode: epNum,
        image: imgSrc,
        url: `https://jkanime.net/${slug}/${epNum}/`,
        animeUrl: `https://jkanime.net/${slug}/`,
        source: this.name
      });
    });

    return items;
  },

  async search(query) {
    const url = `${this.baseUrl}/buscar/${encodeURIComponent(query.trim())}/`;
    const html = await fetchHtml(url);
    const doc = parseDocument(html);
    const results = [];
    const seen = new Set();

    doc.querySelectorAll('.anime__item').forEach(item => {
      const a = item.querySelector('a[href*="jkanime.net/"], a[href^="/"]');
      if (!a) return;
      const href = a.getAttribute('href') || '';
      const m = href.match(/(?:https:\/\/jkanime\.net)?\/([^/]+)\/?$/);
      if (!m) return;

      const slug = m[1];
      if (seen.has(slug) || ['buscar', 'directorio', 'horario', 'top'].includes(slug)) return;
      seen.add(slug);

      const titleEl = item.querySelector('h5, h6, h4, .title');
      let title = titleEl ? titleEl.textContent.trim() : slug.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

      const img = item.querySelector('.set-bg, img');
      let image = img ? (img.getAttribute('data-setbg') || img.getAttribute('src')) : null;
      if (!image) image = `https://cdn.jkdesa.com/assets/images/animes/image/${slug}.jpg`;

      results.push({
        title: fixText(title),
        url: `https://jkanime.net/${slug}/`,
        image,
        source: this.name,
        type: 'Anime'
      });
    });

    return results;
  },

  async getAnime(targetUrl) {
    let fullUrl = this.formatUrl(targetUrl);
    if (!fullUrl.endsWith('/')) fullUrl += '/';
    const html = await fetchHtml(fullUrl);
    const doc = parseDocument(html);
    const slug = fullUrl.replace(/\/+$/, '').split('/').pop();

    let title = doc.querySelector('meta[property="og:title"]')?.getAttribute('content')?.split(' - anime')[0].trim();
    if (!title) title = slug.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

    let image = doc.querySelector('meta[property="og:image"]')?.getAttribute('content') || `https://cdn.jkdesa.com/assets/images/animes/image/${slug}.jpg`;
    let synopsis = doc.querySelector('meta[name="description"]')?.getAttribute('content') || '';

    const genres = [];
    doc.querySelectorAll('a[href*="/genero/"]').forEach(a => {
      const g = a.textContent.trim();
      if (g && !genres.includes(g)) genres.push(g);
    });

    let status = 'En emisión';
    doc.querySelectorAll('li, p, div').forEach(el => {
      if (el.textContent.includes('Estado:') && el.textContent.includes('Finalizado')) {
        status = 'Finalizado';
      }
    });

    const episodes = [];
    let totalEps = 0;
    const mTotal = html.match(/ajax\/episodes\/(\d+)/);
    if (mTotal) {
      try {
        const aid = mTotal[1];
        const epsJson = await fetchHtml(`https://jkanime.net/ajax/episodes/${aid}/1`, {
          'X-Requested-With': 'XMLHttpRequest',
          'Referer': fullUrl
        });
        const parsed = JSON.parse(epsJson);
        totalEps = parsed.total || (parsed.data ? parsed.data.length : 0);
        for (let e = 1; e <= totalEps; e++) {
          episodes.push({
            number: e,
            title: `Episodio ${e}`,
            url: `https://jkanime.net/${slug}/${e}/`,
            image: `https://cdn.jkdesa.com/assets/images/animes/image/${slug}.jpg`
          });
        }
      } catch (_) {}
    }

    if (episodes.length === 0) {
      for (let e = 1; e <= 12; e++) {
        episodes.push({
          number: e,
          title: `Episodio ${e}`,
          url: `https://jkanime.net/${slug}/${e}/`,
          image: `https://cdn.jkdesa.com/assets/images/animes/image/${slug}.jpg`
        });
      }
    }

    return {
      title: fixText(title),
      url: fullUrl,
      image,
      synopsis: fixText(synopsis),
      genres,
      status,
      source: this.name,
      episodes,
      relations: []
    };
  },

  async getWatch(targetUrl) {
    let fullUrl = this.formatUrl(targetUrl);
    if (!fullUrl.endsWith('/')) fullUrl += '/';
    const html = await fetchHtml(fullUrl);
    const doc = parseDocument(html);

    const mSlugEp = fullUrl.match(/https:\/\/jkanime\.net\/([^/]+)\/(\d+)\/?/);
    const slug = mSlugEp ? mSlugEp[1] : '';
    const epNum = mSlugEp ? parseInt(mSlugEp[2], 10) : 1;
    const animeUrl = `${this.baseUrl}/${slug}/`;

    let animeTitle = '';
    const ogTitle = doc.querySelector('meta[property="og:title"]')?.getAttribute('content');
    if (ogTitle) {
      animeTitle = ogTitle.split(' - anime')[0].split(/\s+(?:Sub\s+Espa|Online|gratis|HD|-)/i)[0].replace(new RegExp(`\\s+${epNum}$`), '').trim();
    }
    if (!animeTitle) animeTitle = slug.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

    const prevUrl = epNum > 1 ? `${this.baseUrl}/${slug}/${epNum - 1}/` : null;
    const nextUrl = `${this.baseUrl}/${slug}/${epNum + 1}/`;

    const isDub = ['latino', 'castellano', 'doblado', 'dub'].some(k => (slug + ' ' + animeTitle).toLowerCase().includes(k));
    const audioType = isDub ? 'DUB' : 'SUB';
    const audioPrefix = `[${audioType}] `;

    const servers = [];
    const videoEmbeds = [...html.matchAll(/video\[\d+\]\s*=\s*['"]<iframe[^>]+src=['"]([^'"]+)['"]/g)].map(m => m[1]);
    const serverNameEls = doc.querySelectorAll('.bg-servers a');
    const serverNames = Array.from(serverNameEls).map(el => el.textContent.trim());

    videoEmbeds.forEach((embedUrl, idx) => {
      const sName = serverNames[idx] || `Servidor ${idx + 1}`;
      servers.push({
        name: `${audioPrefix}${sName}`,
        embed: embedUrl,
        audio: audioType
      });
    });

    const mRemote = html.match(/var servers\s*=\s*(\[.*?\]);/);
    if (mRemote) {
      try {
        const remoteData = JSON.parse(mRemote[1]);
        for (const s of remoteData) {
          if (s.remote) {
            try {
              const decoded = atob(s.remote).trim();
              if (decoded.startsWith('http')) {
                servers.push({
                  name: `${audioPrefix}${s.server || 'Descarga'} (Mirror)`,
                  embed: decoded,
                  audio: audioType
                });
              }
            } catch (_) {}
          }
        }
      } catch (_) {}
    }

    let image = doc.querySelector('meta[property="og:image"]')?.getAttribute('content') || `https://cdn.jkdesa.com/assets/images/animes/image/${slug}.jpg`;

    return {
      animeTitle: fixText(animeTitle),
      episode: epNum,
      url: fullUrl,
      animeUrl,
      image,
      source: this.name,
      prevUrl,
      nextUrl,
      servers,
      audios: [audioType]
    };
  },

  async getDirectory(genre = null, type = null, year = null, status = null, page = 1) {
    const params = new URLSearchParams();
    if (genre && genre !== 'all') params.set('genero', genre.toLowerCase());
    if (page && page > 1) params.set('page', page);

    const qs = params.toString();
    const url = `${this.baseUrl}/directorio/${qs ? '?' + qs : ''}`;
    const html = await fetchHtml(url);
    const doc = parseDocument(html);
    const results = [];
    const seen = new Set();

    doc.querySelectorAll('.anime__item').forEach(item => {
      const a = item.querySelector('a[href*="jkanime.net/"], a[href^="/"]');
      if (!a) return;
      const href = a.getAttribute('href') || '';
      const m = href.match(/(?:https:\/\/jkanime\.net)?\/([^/]+)\/?$/);
      if (!m) return;

      const slug = m[1];
      if (seen.has(slug) || ['buscar', 'directorio', 'horario', 'top'].includes(slug)) return;
      seen.add(slug);

      const titleEl = item.querySelector('h5, h6, h4, .title');
      let title = titleEl ? titleEl.textContent.trim() : slug.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

      const img = item.querySelector('.set-bg, img');
      let image = img ? (img.getAttribute('data-setbg') || img.getAttribute('src')) : null;
      if (!image) image = `https://cdn.jkdesa.com/assets/images/animes/image/${slug}.jpg`;

      results.push({
        title: fixText(title),
        url: `https://jkanime.net/${slug}/`,
        image,
        source: this.name,
        type: 'Anime'
      });
    });

    return results;
  }
};

// ==============================================================================
// 4. CLIENT SCRAPER COORDINATOR & DISPATCHER
// ==============================================================================
export const ClientScraper = {
  detectProvider(url) {
    const lower = String(url || '').toLowerCase();
    if (lower.includes('animeav1.com')) return ClientAnimeAV1;
    if (lower.includes('tioanime.com')) return ClientTioAnime;
    if (lower.includes('jkanime.net')) return ClientJKAnime;
    return ClientAnimeAV1;
  },

  async getLatest(source = 'all') {
    const providers = [];
    const src = String(source || 'all').toLowerCase();
    if (['all', 'animeav1', 'av1'].includes(src)) providers.push(ClientAnimeAV1);
    if (['all', 'tioanime', 'tio'].includes(src)) providers.push(ClientTioAnime);
    if (['all', 'jkanime', 'jk'].includes(src)) providers.push(ClientJKAnime);

    const settled = await Promise.allSettled(providers.map(p => p.getLatest()));
    const items = [];
    settled.forEach(res => {
      if (res.status === 'fulfilled' && Array.isArray(res.value)) {
        items.push(...res.value);
      }
    });

    // Shuffle & prioritize diverse sources
    return items.sort(() => Math.random() - 0.5);
  },

  async search(query, source = 'all') {
    const providers = [];
    const src = String(source || 'all').toLowerCase();
    if (['all', 'animeav1', 'av1'].includes(src)) providers.push(ClientAnimeAV1);
    if (['all', 'tioanime', 'tio'].includes(src)) providers.push(ClientTioAnime);
    if (['all', 'jkanime', 'jk'].includes(src)) providers.push(ClientJKAnime);

    const settled = await Promise.allSettled(providers.map(p => p.search(query)));
    const results = [];
    settled.forEach(res => {
      if (res.status === 'fulfilled' && Array.isArray(res.value)) {
        results.push(...res.value);
      }
    });
    return results;
  },

  async getAnime(url) {
    const provider = this.detectProvider(url);
    return provider.getAnime(url);
  },

  async getWatch(url) {
    const provider = this.detectProvider(url);
    return provider.getWatch(url);
  },

  async getDirectory(params = {}) {
    const source = (params.source || 'all').toLowerCase();
    let provider = ClientAnimeAV1;
    if (source === 'tioanime') provider = ClientTioAnime;
    if (source === 'jkanime') provider = ClientJKAnime;
    return provider.getDirectory(params.genre, params.type, params.year, params.status, params.page || 1);
  }
};
