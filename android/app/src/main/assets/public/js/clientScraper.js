/**
 * Client-Side Autonomous Anime Scraper Engine for AnimeStream
 * Runs directly on Android mobile devices without needing a PC or secondary server.
 * Connects natively via AndroidBridge.fetchUrl to bypass browser CORS completely.
 */

import { fixEncoding } from './utils.js?v=5.0';

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
  return fixEncoding(String(str)).trim();
}

// ==============================================================================
// 1. ANIMEAV1 CLIENT SCRAPER
// ==============================================================================
export const ClientAnimeAV1 = {
  name: 'AnimeAV1',
  baseUrl: 'https://animeav1.com',

  formatUrl(pathOrUrl) {
    if (!pathOrUrl) return '';
    if (pathOrUrl.startsWith('//')) return 'https:' + pathOrUrl;
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
      if (a.closest('header, nav, footer, aside')) return;
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
    const cleanSlug = fullUrl.split('?')[0].replace(/\/+$/, '').split('/').pop() || '';
    const html = await fetchHtml(fullUrl);
    const doc = parseDocument(html);

    let title = doc.querySelector('h1')?.textContent.trim();
    if (!title) {
      const mTitle = html.match(/title:"([^"]+)"/);
      title = mTitle ? mTitle[1] : cleanSlug.replace(/-/g, ' ');
    }

    let synopsis = '';
    const mSyn = html.match(/synopsis:"(.*?)"[,}]/);
    if (mSyn) {
      try { synopsis = JSON.parse(`"${mSyn[1]}"`); } catch (_) { synopsis = mSyn[1]; }
    }
    if (!synopsis) {
      synopsis = doc.querySelector('meta[property="og:description"]')?.getAttribute('content') || '';
    }

    const mMediaIdPre = html.match(/media:\{id:(\d+)/);
    const midPre = mMediaIdPre ? mMediaIdPre[1] : '';
    let image = doc.querySelector('img.aspect-poster, img[class*="aspect-poster"]')?.getAttribute('src') ||
                doc.querySelector('meta[property="og:image"]')?.getAttribute('content');
    if (image && !image.startsWith('http')) image = this.formatUrl(image);
    if ((!image || image.toLowerCase().includes('logo')) && midPre) {
      image = `https://cdn.animeav1.com/thumbnails/${midPre}.jpg`;
    }

    let backdrop = doc.querySelector('img.backdrop, img[class*="backdrop"]')?.getAttribute('src');
    if (backdrop && !backdrop.startsWith('http')) backdrop = this.formatUrl(backdrop);

    const genres = [];
    const mGenres = [...html.matchAll(/name:"([^"]+)",type:\d+,slug:"([^"]+)"/g)];
    mGenres.forEach(mg => {
      const cleanG = fixText(mg[1]);
      if (cleanG && !genres.includes(cleanG)) genres.push(cleanG);
    });
    if (genres.length === 0) {
      doc.querySelectorAll('a[href*="/catalogo?genre="]').forEach(a => {
        const g = fixText(a.textContent);
        if (g && !genres.includes(g)) genres.push(g);
      });
    }

    let status = 'En emisión';
    const mStatus = html.match(/status:(\d+)/);
    if (mStatus && mStatus[1] === '1') status = 'Finalizado';

    const slug = cleanSlug;
    const episodes = [];
    const seenEps = new Set();

    const mEps = [...html.matchAll(/\{id:(\d+),number:(\d+)\}/g)];
    const mid = midPre;

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

    if (episodes.length === 0 && slug) {
      const escapedSlug = slug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const epRegex = new RegExp(`^/media/${escapedSlug}/(\\d+)$`);
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

    const isHiddenServer = (name, url) => {
      const target = `${name || ''} ${url || ''}`.toLowerCase();
      return target.includes('mixdrop') ||
             target.includes('mp4upload') ||
             target.includes('streamtape') ||
             target.includes('doodstream') ||
             target.includes('dood') ||
             target.includes('dsvplay') ||
             target.includes('mdbekjwqa');
    };

    const mEmbeds = html.match(/embeds:\{(.*?)\}(?:,\s*(?:downloads|subtitles|mirrors|[a-zA-Z0-9_]+:)|\s*\})/s);
    if (mEmbeds) {
      const rawBlock = mEmbeds[1];
      for (const variant of ['SUB', 'DUB']) {
        const varMatch = rawBlock.match(new RegExp(`${variant}:\\[(.*?)\\]`, 's'));
        if (varMatch) {
          const sList = [...varMatch[1].matchAll(/\{server:"([^"]+)",url:"([^"]+)"\}/g)];

          for (const s of sList) {
            const sName = s[1].trim();
            const sUrl = s[2];
            const labelPrefix = `[${variant}] `;

            if (isHiddenServer(sName, sUrl)) continue;

            if (sUrl.includes('zilla-networks.com') || sName.toUpperCase() === 'HLS') {
              const mHash = sUrl.match(/([a-fA-F0-9]{32})/);
              if (mHash) {
                const hlsHash = mHash[1];
                // Native Android WebView HLS local proxy endpoint (handled seamlessly in MainActivity.java)
                const hlsEmbed = (typeof window !== 'undefined' && window.AndroidBridge)
                  ? `https://appassets.androidplatform.net/android-hls/player/${hlsHash}`
                  : `/api/hls/player/${hlsHash}`;
                if (!seenEmbeds.has(`${hlsEmbed}_${variant}`)) {
                  seenEmbeds.add(`${hlsEmbed}_${variant}`);
                  if (!audios.includes(variant)) audios.push(variant);
                  servers.push({
                    name: `${labelPrefix}HLS (Reproductor HD)`,
                    embed: hlsEmbed,
                    audio: variant
                  });
                }
                continue;
              }
            }

            if (!/^https?:\/\//i.test(sUrl) && !sUrl.startsWith('//')) {
              continue;
            }
            const cleanUrl = sUrl.startsWith('//') ? 'https:' + sUrl : sUrl;

            if (!seenEmbeds.has(`${cleanUrl}_${variant}`)) {
              seenEmbeds.add(`${cleanUrl}_${variant}`);
              if (!audios.includes(variant)) audios.push(variant);
              servers.push({
                name: `${labelPrefix}${sName}`,
                embed: cleanUrl,
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
    const typeMap = {
      tv: 'serie',
      serie: 'serie',
      movie: 'pelicula',
      pelicula: 'pelicula',
      ova: 'ova',
      special: 'especial',
      especial: 'especial',
      ona: 'ona'
    };
    const statusMap = {
      emision: 'emision',
      finalizado: 'finalizado',
      finalizados: 'finalizado'
    };

    const params = new URLSearchParams();
    if (genre && genre !== 'all') {
      const gList = genre.split(',').map(g => g.trim().toLowerCase()).filter(g => g && g !== 'all');
      if (gList.length > 0) params.set('genre', gList.join(','));
    }
    if (type && type !== 'all') {
      const mapped = typeMap[type.toLowerCase().trim()] || type.toLowerCase().trim();
      params.set('category', mapped);
    }
    if (status && status !== 'all') {
      const mapped = statusMap[status.toLowerCase().trim()] || status.toLowerCase().trim();
      params.set('status', mapped);
    }
    if (year && year !== 'all') {
      params.set('minYear', String(year).trim());
      params.set('maxYear', String(year).trim());
    }
    if (page && page > 1) {
      params.set('page', String(page));
    }

    const qs = params.toString();
    const url = `${this.baseUrl}/catalogo${qs ? '?' + qs : ''}`;
    const html = await fetchHtml(url);
    const doc = parseDocument(html);
    const results = [];
    const seen = new Set();

    doc.querySelectorAll('a[href^="/media/"]').forEach(a => {
      const href = a.getAttribute('href') || '';
      if (!href.match(/^\/media\/[^/]+$/) || seen.has(href)) return;
      seen.add(href);

      const parent = a.closest('article, [class*="group"], .card, .item, .media') || a.parentElement;
      const titleEl = parent ? parent.querySelector('h3, h4, h5, .title') : null;
      let rawTitle = titleEl ? titleEl.textContent : a.textContent;
      let title = rawTitle.replace(/\s+/g, ' ').replace(/^Ver\s+/i, '').trim();
      if (!title) {
        title = href.replace('/media/', '').replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
      }

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
    if (pathOrUrl.startsWith('//')) return 'https:' + pathOrUrl;
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
      if (a.closest('header, nav, footer, aside')) return;
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
    if (!image && slug) image = `https://tioanime.com/uploads/thumbs/${slug}.jpg`;

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
    const seenEps = new Set();
    const mEps = html.match(/var episodes = (\[.*?\]);/);
    if (mEps) {
      try {
        const epsData = JSON.parse(mEps[1]);
        const sortedNums = epsData
          .map(ep => parseInt(Array.isArray(ep) ? ep[0] : ep, 10))
          .filter(n => !isNaN(n) && n > 0)
          .sort((a, b) => a - b);
        for (const epNum of sortedNums) {
          if (seenEps.has(epNum)) continue;
          seenEps.add(epNum);
          episodes.push({
            number: epNum,
            title: `Episodio ${epNum}`,
            url: this.formatUrl(`/ver/${slug}-${epNum}`),
            image: null
          });
        }
      } catch (_) {}
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
    const fullUrl = this.formatUrl(targetUrl);
    const html = await fetchHtml(fullUrl);
    const doc = parseDocument(html);

    const mSlugEp = fullUrl.match(/\/ver\/(.+)-(\d+)\/?$/);
    const slug = mSlugEp ? mSlugEp[1] : '';
    const epNum = mSlugEp ? parseInt(mSlugEp[2], 10) : 1;
    const animeUrl = this.formatUrl(`/anime/${slug}`);

    let animeTitle = slug.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

    let prevUrl = null;
    const prevEl = doc.querySelector('.fa-arrow-left, [class*="arrow-left"]')?.closest('a');
    const prevHref = prevEl?.getAttribute('href');
    if (prevHref && prevHref !== '#' && prevHref.includes('/ver/')) {
      prevUrl = this.formatUrl(prevHref);
    } else if (epNum > 1) {
      prevUrl = this.formatUrl(`/ver/${slug}-${epNum - 1}`);
    }

    let nextUrl = null;
    const nextEl = doc.querySelector('.fa-arrow-right, [class*="arrow-right"]')?.closest('a');
    const nextHref = nextEl?.getAttribute('href');
    if (nextHref && nextHref !== '#' && nextHref.includes('/ver/')) {
      nextUrl = this.formatUrl(nextHref);
    }

    const isDub = ['latino', 'castellano', 'doblado', 'dub'].some(k => (slug + ' ' + animeTitle).toLowerCase().includes(k));
    const audioType = isDub ? 'DUB' : 'SUB';
    const audioPrefix = `[${audioType}] `;

    const isHiddenServer = (name, url) => {
      const target = `${name || ''} ${url || ''}`.toLowerCase();
      return target.includes('mixdrop') ||
             target.includes('mp4upload') ||
             target.includes('streamtape') ||
             target.includes('doodstream') ||
             target.includes('dood') ||
             target.includes('dsvplay') ||
             target.includes('mdbekjwqa');
    };

    const servers = [];
    const mVid = html.match(/var videos = (\[.*?\]);/);
    if (mVid) {
      try {
        const vidData = JSON.parse(mVid[1]);
        for (const v of vidData) {
          const sName = v[0] || 'Servidor';
          let sEmbed = typeof v[1] === 'string' ? v[1].trim() : '';
          if (sEmbed.startsWith('//')) sEmbed = 'https:' + sEmbed;
          if (!/^https?:\/\//i.test(sEmbed)) continue;
          if (isHiddenServer(sName, sEmbed)) continue;
          servers.push({
            name: `${audioPrefix}${sName}`,
            embed: sEmbed,
            audio: audioType
          });
        }
      } catch (_) {}
    }

    let image = null;
    const ogImg = doc.querySelector('meta[property="og:image"]')?.getAttribute('content') ||
                  doc.querySelector('meta[name="twitter:image"]')?.getAttribute('content');
    if (ogImg && !ogImg.toLowerCase().includes('logo')) {
      image = this.formatUrl(ogImg);
    } else if (slug) {
      image = `https://tioanime.com/uploads/thumbs/${slug}.jpg`;
    }

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
    const typeMap = {
      tv: '0',
      serie: '0',
      movie: '1',
      pelicula: '1',
      ova: '2',
      special: '3',
      especial: '3'
    };
    const statusMap = {
      emision: '1',
      finalizado: '2',
      finalizados: '2'
    };

    const params = [];
    if (genre && genre !== 'all') {
      const gList = genre.split(',').map(g => g.trim().toLowerCase()).filter(g => g && g !== 'all');
      for (const g of gList) {
        params.push(['genero[]', g]);
      }
    }
    if (type && type !== 'all') {
      const mapped = typeMap[type.toLowerCase().trim()];
      if (mapped !== undefined) params.push(['type[]', mapped]);
    }
    if (status && status !== 'all') {
      const mapped = statusMap[status.toLowerCase().trim()];
      if (mapped !== undefined) params.push(['status', mapped]);
    }
    if (year && year !== 'all') {
      const yInt = parseInt(year, 10);
      if (!isNaN(yInt)) {
        params.push(['year', `${yInt},${yInt + 1}`]);
      } else {
        params.push(['year', String(year)]);
      }
    }
    if (page && page > 1) {
      params.push(['p', String(page)]);
    }

    const qs = params.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
    const url = qs ? `${this.baseUrl}/directorio?${qs}` : `${this.baseUrl}/directorio`;
    const html = await fetchHtml(url);
    const doc = parseDocument(html);
    const results = [];
    const seen = new Set();

    doc.querySelectorAll('article.anime, .anime, a[href^="/anime/"]').forEach(el => {
      if (el.closest('header, nav, footer, aside')) return;
      let a = el.tagName === 'A' ? el : el.querySelector('a');
      if (!a) return;
      const href = a.getAttribute('href') || '';
      const slug = href.replace(/\/+$/, '').split('/').pop();
      if (!slug || seen.has(slug) || ['directorio', 'programacion'].includes(slug)) return;
      seen.add(slug);

      const titleEl = el.querySelector('h3.title, .title') || a;
      let title = titleEl ? titleEl.textContent.trim() : slug.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

      const img = el.querySelector('img');
      let imgSrc = img ? img.getAttribute('src') : null;
      if (imgSrc && imgSrc.toLowerCase().includes('logo')) imgSrc = null;
      if (imgSrc && !imgSrc.startsWith('http')) imgSrc = this.formatUrl(imgSrc);
      if (!imgSrc && slug) imgSrc = `https://tioanime.com/uploads/thumbs/${slug}.jpg`;

      const typeEl = el.querySelector('span.type, .badge');
      const tipo = typeEl ? typeEl.textContent.trim() : 'TV Anime';
      const estadoNorm = (status && status.toLowerCase().includes('fin')) ? 'Finalizado' : 'En emisión';

      results.push({
        title: fixText(title),
        url: this.formatUrl(href),
        image: imgSrc || null,
        source: this.name,
        type: fixText(tipo),
        status: estadoNorm,
        year: year && year !== 'all' ? String(year) : null
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
    if (pathOrUrl.startsWith('//')) return 'https:' + pathOrUrl;
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
      if (imgSrc && !imgSrc.startsWith('http')) imgSrc = this.formatUrl(imgSrc);
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

    const EXCLUDED_SLUGS = new Set([
      'buscar', 'directorio', 'horario', 'top', 'editar-perfil', 'jkanime.net',
      'guardados', 'favoritos', 'historial', 'login', 'registro', 'recuperar',
      'privacidad', 'terminos', 'dmca', 'contacto', 'noticias', 'blog',
      'calendario', 'aleatorio', 'buscados', 'buscados-recientemente',
      'emision', 'finalizados', 'estrenos', 'peliculas', 'ovas', 'especiales'
    ]);

    doc.querySelectorAll('.anime__item').forEach(item => {
      if (item.closest('.anime__sidebar, .product__sidebar, .sidebar, aside, header, nav, footer')) return;
      const sectionEl = item.closest('section');
      const sectionHeading = (sectionEl
        ? sectionEl.querySelector(':scope > .section-title, :scope > div > .section-title, :scope > h4')?.textContent
        : item.closest('div[class*="col"]')?.querySelector(':scope > .section-title, :scope > h4')?.textContent
      )?.toLowerCase() || '';
      if (sectionHeading.includes('buscado') || sectionHeading.includes('top ') || sectionHeading.includes('popular')) return;

      const a = item.querySelector('a[href*="jkanime.net/"], a[href^="/"]');
      if (!a) return;
      const href = a.getAttribute('href') || '';
      if (href.startsWith('http') && !href.includes('jkanime.net')) return;

      const m = href.match(/(?:https:\/\/jkanime\.net)?\/([^/?#]+)\/?$/);
      if (!m) return;

      const slug = m[1].toLowerCase();
      if (seen.has(slug) || EXCLUDED_SLUGS.has(slug) || slug.includes('hentai') || slug.includes('.php') || slug.includes('.html')) return;
      seen.add(slug);

      const titleEl = item.querySelector('.anime__item__text h5 a, h5 a, h5, h6, h4, .title');
      let title = titleEl ? titleEl.textContent.trim() : slug.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

      const typeText = item.querySelector('.anime__item__text ul li.anime, ul li')?.textContent?.trim() || 'Anime';
      if (/\b(noticia|blog|articulo|manga|novela)\b/i.test(typeText)) return;

      const img = item.querySelector('.set-bg, img');
      let image = img ? (img.getAttribute('data-setbg') || img.getAttribute('src')) : null;
      if (image && !image.startsWith('http')) image = this.formatUrl(image);
      if (!image) image = `https://cdn.jkdesa.com/assets/images/animes/image/${m[1]}.jpg`;

      results.push({
        title: fixText(title),
        url: `https://jkanime.net/${m[1]}/`,
        image,
        source: this.name,
        type: typeText
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

    if (episodes.length === 0 && slug) {
      const escapedSlug = slug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const epRegex = new RegExp(`(?:https?://jkanime\\.net)?/${escapedSlug}/(\\d+)/?$`);
      const seenDomEps = new Set();
      doc.querySelectorAll('a').forEach(a => {
        const href = a.getAttribute('href') || '';
        const m = href.match(epRegex);
        if (m) {
          const num = parseInt(m[1], 10);
          if (!isNaN(num) && !seenDomEps.has(num)) {
            seenDomEps.add(num);
            episodes.push({
              number: num,
              title: `Episodio ${num}`,
              url: `https://jkanime.net/${slug}/${num}/`,
              image: `https://cdn.jkdesa.com/assets/images/animes/image/${slug}.jpg`
            });
          }
        }
      });
      episodes.sort((a, b) => a.number - b.number);
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

    let prevUrl = null;
    let nextUrl = null;
    for (const a of doc.querySelectorAll('a')) {
      const t = a.textContent.trim().toLowerCase();
      const h = a.getAttribute('href');
      if (h && (t === 'siguiente' || a.querySelector('.fa-arrow-right, .fa-chevron-right'))) {
        nextUrl = this.formatUrl(h);
      }
      if (h && (t === 'anterior' || a.querySelector('.fa-arrow-left, .fa-chevron-left'))) {
        prevUrl = this.formatUrl(h);
      }
    }
    if (!prevUrl && epNum > 1) {
      prevUrl = `${this.baseUrl}/${slug}/${epNum - 1}/`;
    }
    if (prevUrl && !prevUrl.endsWith('/')) prevUrl += '/';
    if (nextUrl && !nextUrl.endsWith('/')) nextUrl += '/';

    const isDub = ['latino', 'castellano', 'doblado', 'dub'].some(k => (slug + ' ' + animeTitle).toLowerCase().includes(k));
    const audioType = isDub ? 'DUB' : 'SUB';
    const audioPrefix = `[${audioType}] `;

    const isHiddenServer = (name, url) => {
      const target = `${name || ''} ${url || ''}`.toLowerCase();
      return target.includes('mixdrop') ||
             target.includes('mp4upload') ||
             target.includes('streamtape') ||
             target.includes('doodstream') ||
             target.includes('dood') ||
             target.includes('dsvplay') ||
             target.includes('mdbekjwqa');
    };

    const servers = [];
    const videoEmbeds = [...html.matchAll(/video\[\d+\]\s*=\s*['"]<iframe[^>]+src=['"]([^'"]+)['"]/g)].map(m => m[1]);
    const serverNameEls = doc.querySelectorAll('.bg-servers a');
    const serverNames = Array.from(serverNameEls).map(el => el.textContent.trim());

    videoEmbeds.forEach((rawEmbedUrl, idx) => {
      let embedUrl = typeof rawEmbedUrl === 'string' ? rawEmbedUrl.trim() : '';
      if (embedUrl.startsWith('//')) embedUrl = 'https:' + embedUrl;
      if (!/^https?:\/\//i.test(embedUrl)) return;
      const rawName = serverNames[idx] || `Servidor ${idx + 1}`;
      const sName = rawName.replace(/\s*\((?:mirror|Mirror)\)\s*/gi, '').trim();
      if (isHiddenServer(sName, embedUrl)) return;
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
                const rawName = s.server || 'Descarga';
                const cleanName = rawName.replace(/\s*\((?:mirror|Mirror)\)\s*/gi, '').trim();
                if (cleanName.toLowerCase().includes('mediafire') || decoded.includes('mediafire.com')) {
                  continue;
                }
                if (decoded.endsWith('/embed/') || decoded.endsWith('/embed')) {
                  continue;
                }
                if (isHiddenServer(cleanName, decoded)) {
                  continue;
                }
                servers.push({
                  name: `${audioPrefix}${cleanName}`,
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
    const typeMap = {
      tv: 'animes',
      serie: 'animes',
      movie: 'peliculas',
      pelicula: 'peliculas',
      ova: 'ovas',
      special: 'especiales',
      especial: 'especiales',
      ona: 'onas'
    };
    const statusMap = {
      emision: 'emision',
      finalizado: 'finalizados',
      finalizados: 'finalizados'
    };

    const params = new URLSearchParams();
    if (genre && genre !== 'all') {
      const gList = genre.split(',').map(g => g.trim().toLowerCase()).filter(g => g && g !== 'all');
      if (gList.length > 0) params.set('genero', gList[0]);
    }
    if (type && type !== 'all') {
      const mapped = typeMap[type.toLowerCase().trim()] || type.toLowerCase().trim();
      params.set('tipo', mapped);
    }
    if (status && status !== 'all') {
      const mapped = statusMap[status.toLowerCase().trim()] || status.toLowerCase().trim();
      params.set('estado', mapped);
    }
    if (year && year !== 'all') {
      params.set('fecha', String(year).trim());
    }
    if (page && page > 1) {
      params.set('p', String(page));
    }

    const qs = params.toString();
    const url = `${this.baseUrl}/directorio/${qs ? '?' + qs : ''}`;
    const html = await fetchHtml(url);
    const results = [];
    const seen = new Set();

    // 1. Parse JSON object embedded in var animes = ({...});
    const m = html.match(/var animes = ({.*?});/s);
    if (m) {
      try {
        const data = JSON.parse(m[1]);
        const list = data.data || [];
        for (const a of list) {
          const title = a.title || '';
          const slug = a.slug || '';
          if (!slug || seen.has(slug)) continue;
          seen.add(slug);

          const animeUrl = a.url || `${this.baseUrl}/${slug}/`;
          const image = a.image || `https://cdn.jkdesa.com/assets/images/animes/image/${slug}.jpg`;
          const rawTipo = a.tipo || a.type || 'TV Anime';
          let tipoNorm = 'TV Anime';
          if (rawTipo.toLowerCase().includes('pel')) tipoNorm = 'Película';
          else if (rawTipo.toLowerCase().includes('ova')) tipoNorm = 'OVA';
          else if (rawTipo.toLowerCase().includes('esp')) tipoNorm = 'Especial';
          else if (rawTipo.toLowerCase().includes('ona')) tipoNorm = 'ONA';

          const rawEstado = a.estado || a.status || 'En emisión';
          const estadoNorm = (rawEstado.toLowerCase().includes('emi') || rawEstado.toLowerCase().includes('curr')) ? 'En emisión' : 'Finalizado';

          results.push({
            title: fixText(title),
            url: animeUrl,
            image,
            synopsis: fixText(a.synopsis || ''),
            source: this.name,
            type: tipoNorm,
            status: estadoNorm,
            year: year && year !== 'all' ? String(year) : null
          });
        }
      } catch (_) {}
    }

    // 2. Fallback to DOM elements if var animes was not found
    if (results.length === 0) {
      const doc = parseDocument(html);
      const DIR_EXCLUDED_SLUGS = new Set([
        'buscar', 'directorio', 'horario', 'top', 'editar-perfil', 'jkanime.net',
        'guardados', 'favoritos', 'historial', 'login', 'registro', 'recuperar',
        'privacidad', 'terminos', 'dmca', 'contacto', 'noticias', 'blog',
        'calendario', 'aleatorio', 'buscados', 'buscados-recientemente',
        'emision', 'finalizados', 'estrenos', 'peliculas', 'ovas', 'especiales'
      ]);
      doc.querySelectorAll('.anime__item, .custom_item, article, .card').forEach(item => {
        if (item.closest('.anime__sidebar, .product__sidebar, .sidebar, aside, header, nav, footer')) return;
        const a = item.querySelector('a[href*="jkanime.net/"], a[href^="/"]');
        if (!a) return;
        const href = a.getAttribute('href') || '';
        if (href.startsWith('http') && !href.includes('jkanime.net')) return;
        const mSlug = href.match(/(?:https:\/\/jkanime\.net)?\/([^/?#]+)\/?$/);
        if (!mSlug) return;

        const rawSlug = mSlug[1];
        const slugLower = rawSlug.toLowerCase();
        if (seen.has(slugLower) || DIR_EXCLUDED_SLUGS.has(slugLower) || slugLower.includes('hentai') || slugLower.includes('.php') || slugLower.includes('.html')) return;
        seen.add(slugLower);

        const titleEl = item.querySelector('h5, h6, h4, .title');
        let title = titleEl ? titleEl.textContent.trim() : rawSlug.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

        const img = item.querySelector('.set-bg, img');
        let image = img ? (img.getAttribute('data-setbg') || img.getAttribute('src')) : null;
        if (image && !image.startsWith('http')) image = this.formatUrl(image);
        if (!image) image = `https://cdn.jkdesa.com/assets/images/animes/image/${rawSlug}.jpg`;

        results.push({
          title: fixText(title),
          url: `https://jkanime.net/${rawSlug}/`,
          image,
          source: this.name,
          type: 'TV Anime'
        });
      });
    }

    return results;
  }
};

// ==============================================================================
// 4. CLIENT SCRAPER COORDINATOR & DISPATCHER
// ==============================================================================
export const ClientScraper = {
  detectProvider(url) {
    if (!url || typeof url !== 'string') return null;
    let trimmed = url.trim();
    if (trimmed.startsWith('//')) trimmed = 'https:' + trimmed;
    try {
      const parsed = new URL(trimmed);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
      if (parsed.username || parsed.password) return null;
      const host = parsed.hostname.toLowerCase().replace(/\.+$/, '');
      if (host === 'animeav1.com' || host.endsWith('.animeav1.com')) return ClientAnimeAV1;
      if (host === 'tioanime.com' || host.endsWith('.tioanime.com')) return ClientTioAnime;
      if (host === 'jkanime.net' || host.endsWith('.jkanime.net')) return ClientJKAnime;
    } catch (_) {
      return null;
    }
    return null;
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
    const labels = [];
    const src = String(source || 'all').toLowerCase();
    if (['all', 'animeav1', 'av1'].includes(src)) {
      providers.push(ClientAnimeAV1);
      labels.push('AnimeAV1');
    }
    if (['all', 'tioanime', 'tio'].includes(src)) {
      providers.push(ClientTioAnime);
      labels.push('TioAnime');
    }
    if (['all', 'jkanime', 'jk'].includes(src)) {
      providers.push(ClientJKAnime);
      labels.push('JKAnime');
    }

    const settled = await Promise.allSettled(providers.map(p => p.search(query)));
    const results = [];
    const errors = [];
    settled.forEach((res, idx) => {
      if (res.status === 'fulfilled' && Array.isArray(res.value)) {
        results.push(...res.value);
      } else {
        errors.push({ source: labels[idx] || 'Fuente', error: res.reason?.message || 'Error' });
      }
    });
    return {
      query,
      results,
      errors
    };
  },

  async getAnime(url) {
    const provider = this.detectProvider(url);
    if (!provider) {
      throw new Error('URL no soportada. Debe pertenecer a animeav1.com, jkanime.net o tioanime.com');
    }
    return provider.getAnime(url);
  },

  async getWatch(url) {
    const provider = this.detectProvider(url);
    if (!provider) {
      throw new Error('URL no soportada. Debe pertenecer a animeav1.com, jkanime.net o tioanime.com');
    }
    return provider.getWatch(url);
  },

  async getDirectory(params = {}) {
    const source = (params.source || 'all').toLowerCase();
    const providers = [];
    if (['all', 'animeav1', 'av1'].includes(source)) providers.push(ClientAnimeAV1);
    if (['all', 'tioanime', 'tio'].includes(source)) providers.push(ClientTioAnime);
    if (['all', 'jkanime', 'jk'].includes(source)) providers.push(ClientJKAnime);

    const settled = await Promise.allSettled(
      providers.map(p => p.getDirectory(params.genre, params.type, params.year, params.status, params.page || 1))
    );

    const validLists = [];
    settled.forEach(res => {
      if (res.status === 'fulfilled' && Array.isArray(res.value) && res.value.length > 0) {
        validLists.push(res.value);
      }
    });

    let combined = [];
    if (validLists.length > 1) {
      const maxLen = Math.max(...validLists.map(l => l.length));
      for (let i = 0; i < maxLen; i++) {
        for (const list of validLists) {
          if (i < list.length) {
            combined.push(list[i]);
          }
        }
      }
    } else if (validLists.length === 1) {
      combined = validLists[0];
    }

    return {
      items: combined,
      page: parseInt(params.page, 10) || 1,
      has_next: combined.length > 0,
      total: combined.length
    };
  }
};
