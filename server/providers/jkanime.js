/**
 * JKAnime Provider Adapter for Node.js
 */
const cheerio = require('cheerio');
const { httpClient, getHeaders, fixEncoding } = require('../config');

class JKAnimeProvider {
  constructor() {
    this.name = 'JKAnime';
    this.baseUrl = 'https://jkanime.net';
  }

  _formatUrl(pathOrUrl) {
    if (!pathOrUrl) return '';
    if (pathOrUrl.startsWith('http://') || pathOrUrl.startsWith('https://')) {
      return pathOrUrl;
    }
    if (!pathOrUrl.startsWith('/')) {
      pathOrUrl = '/' + pathOrUrl;
    }
    return `${this.baseUrl}${pathOrUrl}`;
  }

  async getLatest() {
    const url = `${this.baseUrl}/`;
    const headers = getHeaders();
    const res = await httpClient.get(url, { headers });
    const $ = cheerio.load(res.data);
    const items = [];
    const seen = new Set();

    $('a').each((_, el) => {
      const href = $(el).attr('href') || '';
      const m = href.match(/(?:https:\/\/jkanime\.net)?\/([^/]+)\/(\d+)\/?$/);
      if (!m) return;

      const slug = m[1];
      const epStr = m[2];
      const epNum = parseInt(epStr, 10) || epStr;
      const seenKey = `${slug}_${epNum}`;
      if (seen.has(seenKey)) return;
      seen.add(seenKey);

      const card = $(el).closest('.col, .item, .card, .anime') || $(el);
      const imgEl = card.find('.set-bg, img').first();
      let imgSrc = imgEl.attr('data-setbg') || imgEl.attr('src');
      if (!imgSrc) {
        imgSrc = `https://cdn.jkdesa.com/assets/images/animes/image/${slug}.jpg`;
      }

      // Clean Title
      const titleEl = card.find('h5, h6, h4, h3').first();
      let rawTitle = titleEl.text().trim();
      if (!rawTitle) {
        const text = card.text().split(/\s*\|\s*/);
        const parts = text.map(p => p.trim()).filter(p =>
          p && !p.startsWith('Ep') &&
          !['Hoy', 'Ayer', 'Detalles', 'Ver ahora', 'Nuevo', 'ONA', 'Special'].includes(p) &&
          !/^(Lunes|Martes|Miércoles|Miercoles|Jueves|Viernes|Sábado|Sabado|Domingo)\s+\d+/i.test(p)
        );
        rawTitle = parts.length > 0 ? parts[parts.length - 1] : slug.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
      }

      rawTitle = rawTitle.replace(new RegExp(`\\s*-\\s*${epNum}$`), '').trim();
      rawTitle = fixEncoding(rawTitle);

      items.push({
        title: rawTitle,
        episode: epNum,
        image: imgSrc,
        url: `https://jkanime.net/${slug}/${epNum}/`,
        animeUrl: `https://jkanime.net/${slug}/`,
        source: this.name
      });
    });

    return items;
  }

  async search(query) {
    const encoded = encodeURIComponent(query.trim());
    const url = `${this.baseUrl}/buscar/${encoded}/`;
    const headers = getHeaders(this.baseUrl);
    const res = await httpClient.get(url, { headers });
    const $ = cheerio.load(res.data);
    const results = [];
    const seen = new Set();

    $('a').each((_, el) => {
      const href = $(el).attr('href') || '';
      const m = href.match(/(?:https:\/\/jkanime\.net)?\/([^/]+)\/?$/);
      if (!m) return;

      const slug = m[1];
      if (seen.has(slug) || ['buscar', 'directorio', 'horario', 'top'].includes(slug)) return;
      seen.add(slug);

      const card = $(el).closest('.anime__item, .col, .item, .card') || $(el);
      const titleEl = card.find('h5, h6, h4, h3, .title').first();
      let title = titleEl.text().trim();
      if (!title) {
        title = slug.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
      }
      title = fixEncoding(title);

      const imgEl = card.find('.set-bg, img').first();
      let image = imgEl.attr('data-setbg') || imgEl.attr('src');
      if (!image) {
        image = `https://cdn.jkdesa.com/assets/images/animes/image/${slug}.jpg`;
      }

      const synopsis = fixEncoding(card.find('p').text().trim() || null);

      results.push({
        title,
        url: `https://jkanime.net/${slug}/`,
        image,
        source: this.name,
        synopsis: synopsis || null,
        type: 'Anime'
      });
    });

    return results;
  }

  async getAnime(targetUrl) {
    let fullUrl = this._formatUrl(targetUrl);
    if (!fullUrl.endsWith('/')) fullUrl += '/';

    const headers = getHeaders(this.baseUrl);
    const res = await httpClient.get(fullUrl, { headers });
    const txt = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
    const $ = cheerio.load(txt);
    const slug = fullUrl.replace(/\/+$/, '').split('/').pop();

    // 1. Title
    const ogTitle = $('meta[property="og:title"]').attr('content');
    let title = '';
    if (ogTitle) {
      title = ogTitle.split(' - anime')[0].trim();
    }
    if (!title) {
      const h3s = $('h3').map((_, el) => $(el).text().trim()).get();
      const validH3 = h3s.filter(h => !['Buscado recientemente:', 'Temporadas y relacionados', 'Más secciones', 'Te recomendamos'].includes(h));
      title = validH3[0] || slug.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    }
    title = fixEncoding(title);

    // 2. Poster
    const ogImg = $('meta[property="og:image"]').attr('content');
    const image = ogImg || `https://cdn.jkdesa.com/assets/images/animes/image/${slug}.jpg`;

    // 3. Synopsis
    const descMeta = $('meta[name="description"]').attr('content');
    const synopsis = fixEncoding(descMeta ? descMeta.trim() : '');

    // 4. Genres
    const genres = [];
    $('a[href*="/genero/"]').each((_, el) => {
      const g = $(el).text().trim();
      if (g && !genres.includes(g)) genres.push(fixEncoding(g));
    });

    // 5. Status
    let status = 'En emisión';
    $('li, p, div').each((_, el) => {
      const t = $(el).text();
      if (t.includes('Estado:')) {
        if (t.includes('Finalizado')) status = 'Finalizado';
        return false;
      }
    });

    // 6. Episodes via AJAX or fallback
    const token = $('meta[name="csrf-token"]').attr('content') || '';
    let aid = $('#guardar-anime').attr('data-anime');
    if (!aid) {
      const mAid = txt.match(/ajax\/episodes\/(\d+)/);
      if (mAid) aid = mAid[1];
    }

    const episodes = [];
    let totalEps = 0;
    const page1Thumbs = {};

    if (aid) {
      try {
        const postHeaders = {
          ...headers,
          'X-Requested-With': 'XMLHttpRequest',
          'Referer': fullUrl,
          'Content-Type': 'application/x-www-form-urlencoded'
        };
        if (token) postHeaders['X-CSRF-TOKEN'] = token;

        const rEps = await httpClient.post(
          `${this.baseUrl}/ajax/episodes/${aid}/1`,
          `_token=${encodeURIComponent(token)}`,
          { headers: postHeaders }
        );
        if (rEps.data && typeof rEps.data === 'object') {
          totalEps = rEps.data.total || 0;
          const dataList = rEps.data.data || [];
          for (const item of dataList) {
            if (item.number && item.image) {
              page1Thumbs[item.number] = `https://cdn.jkdesa.com/assets/images/animes/video/image_thumb/${item.image}`;
            }
          }
        }
      } catch (_) {}
    }

    if (totalEps > 0) {
      for (let i = 1; i <= totalEps; i++) {
        episodes.push({
          number: i,
          title: `Episodio ${i}`,
          url: `${this.baseUrl}/${slug}/${i}/`,
          image: page1Thumbs[i] || null
        });
      }
    } else {
      const regex = new RegExp(`(?:${this.baseUrl})?/${slug}/(\\d+)/?$`);
      $('a').each((_, el) => {
        const href = $(el).attr('href') || '';
        const m = href.match(regex);
        if (m) {
          const num = parseInt(m[1], 10);
          if (!episodes.some(e => e.number === num)) {
            episodes.push({
              number: num,
              title: `Episodio ${num}`,
              url: `${this.baseUrl}/${slug}/${num}/`,
              image: null
            });
          }
        }
      });
    }

    episodes.sort((a, b) => a.number - b.number);

    return {
      title,
      url: fullUrl,
      image,
      synopsis,
      genres,
      status,
      source: this.name,
      episodes,
      relations: []
    };
  }

  async getWatch(targetUrl) {
    let fullUrl = this._formatUrl(targetUrl);
    if (!fullUrl.endsWith('/')) fullUrl += '/';

    const headers = getHeaders(this.baseUrl);
    const res = await httpClient.get(fullUrl, { headers });
    const txt = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
    const $ = cheerio.load(txt);

    const mSlugEp = fullUrl.match(/https:\/\/jkanime\.net\/([^/]+)\/(\d+)\/?/);
    const slug = mSlugEp ? mSlugEp[1] : '';
    const epNum = mSlugEp ? parseInt(mSlugEp[2], 10) : 1;
    const animeUrl = `${this.baseUrl}/${slug}/`;

    // Anime Title
    let animeTitle = '';
    const ogTitle = $('meta[property="og:title"]').attr('content');
    if (ogTitle) {
      let content = ogTitle.split(' - anime')[0].trim();
      content = content.split(/\s+(?:Sub\s+Espa|Online|gratis|HD|-)/i)[0].trim();
      content = content.replace(new RegExp(`\\s*-\\s*${epNum}$`), '').trim();
      content = content.replace(new RegExp(`\\s+${epNum}$`), '').trim();
      animeTitle = content.replace(/^\s*Ver\s+/i, '').trim();
    }
    if (!animeTitle || animeTitle.toLowerCase().startsWith('episodio')) {
      const titleEl = $('h1, h2').first();
      if (titleEl.length > 0) {
        let rawT = titleEl.text().trim();
        rawT = rawT.split(/\s+(?:Sub\s+Espa|Online|gratis|HD|-)/i)[0].trim();
        rawT = rawT.replace(new RegExp(`\\s*-\\s*${epNum}$`), '').trim();
        rawT = rawT.replace(new RegExp(`\\s+${epNum}$`), '').trim();
        if (!rawT.toLowerCase().startsWith('episodio')) animeTitle = rawT;
      }
    }
    if (!animeTitle || animeTitle.toLowerCase().startsWith('episodio')) {
      animeTitle = slug.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    }
    animeTitle = fixEncoding(animeTitle);

    // Prev / Next
    const prevUrl = epNum > 1 ? `${this.baseUrl}/${slug}/${epNum - 1}/` : null;
    const nextUrl = `${this.baseUrl}/${slug}/${epNum + 1}/`;

    // Audio determination
    const isDub = ['latino', 'castellano', 'doblado', 'dub'].some(k => (slug + ' ' + animeTitle).toLowerCase().includes(k));
    const audioType = isDub ? 'DUB' : 'SUB';
    const audioPrefix = `[${audioType}] `;

    // Video Servers
    const servers = [];
    const videoEmbeds = [...txt.matchAll(/video\[\d+\]\s*=\s*['"]<iframe[^>]+src=['"]([^'"]+)['"]/g)].map(m => m[1]);
    const serverNames = $('.bg-servers a').map((_, el) => $(el).text().trim()).get();

    videoEmbeds.forEach((embedUrl, idx) => {
      const sName = serverNames[idx] || `Servidor ${idx + 1}`;
      servers.push({
        name: `${audioPrefix}${sName}`,
        embed: embedUrl,
        audio: audioType
      });
    });

    // Remote mirrors from JSON
    const mRemote = txt.match(/var servers\s*=\s*(\[.*?\]);/);
    if (mRemote) {
      try {
        const remoteData = JSON.parse(mRemote[1]);
        for (const s of remoteData) {
          const name = s.server || 'Descarga';
          if (s.remote) {
            try {
              const decoded = Buffer.from(s.remote, 'base64').toString('utf-8').trim();
              if (decoded.startsWith('http')) {
                servers.push({
                  name: `${audioPrefix}${name} (Mirror)`,
                  embed: decoded,
                  audio: audioType
                });
              }
            } catch (_) {}
          }
        }
      } catch (_) {}
    }

    // Thumbnail
    let image = $('meta[property="og:image"]').attr('content');
    if (!image) {
      image = `https://cdn.jkdesa.com/assets/images/animes/image/${slug}.jpg`;
    }

    return {
      animeTitle,
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
  }

  async getDirectory(genre = null, typeFilter = null, year = null, status = null, page = 1) {
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
    if (typeFilter && typeFilter !== 'all') {
      const mapped = typeMap[typeFilter.toLowerCase().trim()] || typeFilter.toLowerCase().trim();
      params.set('tipo', mapped);
    }
    if (status && status !== 'all') {
      const mapped = statusMap[status.toLowerCase().trim()] || status.toLowerCase().trim();
      params.set('estado', mapped);
    }
    if (year && year !== 'all') {
      params.set('fecha', String(year).trim());
    }
    if (page > 1) {
      params.set('p', String(page));
    }

    const qs = params.toString();
    const url = qs ? `${this.baseUrl}/directorio/?${qs}` : `${this.baseUrl}/directorio/`;
    const headers = getHeaders(this.baseUrl);
    const res = await httpClient.get(url, { headers });
    const txt = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
    const items = [];

    const m = txt.match(/var animes = ({.*?});\s*\n/);
    if (m) {
      try {
        const data = JSON.parse(m[1]);
        const list = data.data || [];
        for (const a of list) {
          const title = fixEncoding(a.title || '');
          const animeUrl = a.url || `${this.baseUrl}/${a.slug}/`;
          const image = a.image || `https://cdn.jkdesa.com/assets/images/animes/image/${a.slug}.jpg`;
          const synopsis = fixEncoding(a.synopsis || '');

          const rawTipo = a.tipo || a.type || 'TV Anime';
          let tipoNorm = 'TV Anime';
          if (rawTipo.toLowerCase().includes('pel')) tipoNorm = 'Película';
          else if (rawTipo.toLowerCase().includes('ova')) tipoNorm = 'OVA';
          else if (rawTipo.toLowerCase().includes('ona')) tipoNorm = 'ONA';
          else if (rawTipo.toLowerCase().includes('esp')) tipoNorm = 'Especial';

          const rawEstado = a.estado || a.status || 'En emisión';
          const estadoNorm = (rawEstado.toLowerCase().includes('emi') || rawEstado.toLowerCase().includes('curr')) ? 'En emisión' : 'Finalizado';

          items.push({
            title,
            url: animeUrl,
            image,
            source: this.name,
            type: tipoNorm,
            status: estadoNorm,
            year: year && year !== 'all' ? String(year) : null,
            synopsis
          });
        }
      } catch (_) {}
    }

    return items;
  }
}

module.exports = new JKAnimeProvider();
