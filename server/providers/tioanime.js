/**
 * TioAnime Provider Adapter for Node.js
 */
const cheerio = require('cheerio');
const { httpClient, getHeaders, fixEncoding } = require('../config');

class TioAnimeProvider {
  constructor() {
    this.name = 'TioAnime';
    this.baseUrl = 'https://tioanime.com';
  }

  _formatUrl(pathOrUrl) {
    if (!pathOrUrl) return '';
    if (pathOrUrl.startsWith('//')) {
      return 'https:' + pathOrUrl;
    }
    if (pathOrUrl.startsWith('http://') || pathOrUrl.startsWith('https://')) {
      return pathOrUrl;
    }
    if (!pathOrUrl.startsWith('/')) {
      pathOrUrl = '/' + pathOrUrl;
    }
    return `${this.baseUrl}${pathOrUrl}`;
  }

  async getLatest() {
    const headers = getHeaders();
    const res = await httpClient.get(this.baseUrl, { headers });
    const $ = cheerio.load(res.data);
    const items = [];
    const seen = new Set();

    $('a[href^="/ver/"]').each((_, el) => {
      const href = $(el).attr('href') || '';
      const m = href.match(/^\/ver\/(.+)-(\d+)$/);
      if (!m) return;

      const slug = m[1];
      const epStr = m[2];
      const epNum = parseInt(epStr, 10) || epStr;
      const seenKey = `${slug}_${epNum}`;
      if (seen.has(seenKey)) return;
      seen.add(seenKey);

      const cardEl = $(el).closest('article, .col, .item, .episode, .card');
      const parent = cardEl.length ? cardEl : $(el);
      const titleEl = parent.find('h3, h4, h5, span.title, .title').first();
      let rawTitle = titleEl.text().trim() || slug.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
      let title = rawTitle.replace(new RegExp(`\\s+${epNum}$`), '').trim();
      title = fixEncoding(title);

      const imgEl = parent.find('img').first();
      let imgSrc = imgEl.attr('src');
      if (imgSrc && !imgSrc.startsWith('http')) {
        imgSrc = this._formatUrl(imgSrc);
      }

      items.push({
        title,
        episode: epNum,
        image: imgSrc || null,
        url: this._formatUrl(href),
        animeUrl: this._formatUrl(`/anime/${slug}`),
        source: this.name
      });
    });

    return items;
  }

  async search(query) {
    const encoded = encodeURIComponent(query.trim());
    const url = `${this.baseUrl}/directorio?q=${encoded}`;
    const headers = getHeaders(this.baseUrl);
    const res = await httpClient.get(url, { headers });
    const $ = cheerio.load(res.data);
    const results = [];
    const seen = new Set();

    $('a[href^="/anime/"]').each((_, el) => {
      if ($(el).closest('header, nav, footer, aside').length) return;
      const href = $(el).attr('href') || '';
      const slug = href.replace(/\/+$/, '').split('/').pop();
      if (!slug || seen.has(slug) || ['directorio', 'programacion'].includes(slug)) return;
      seen.add(slug);

      const parent = $(el).closest('article, .col, .item, .anime, .card');
      const container = parent.length ? parent : $(el).parent();
      const titleEl = container.find('h3, h4, h5, span.title, .title').first();
      let title = titleEl.text().trim() || slug.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
      title = fixEncoding(title);

      const imgEl = container.find('img').first();
      let imgSrc = imgEl.attr('src');
      if (imgSrc && !imgSrc.startsWith('http')) {
        imgSrc = this._formatUrl(imgSrc);
      }

      results.push({
        title,
        url: this._formatUrl(href),
        image: imgSrc || null,
        source: this.name,
        type: 'Anime'
      });
    });

    return results;
  }

  async getAnime(targetUrl) {
    const fullUrl = this._formatUrl(targetUrl);
    const headers = getHeaders(this.baseUrl);
    const res = await httpClient.get(fullUrl, { headers });
    const txt = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
    const $ = cheerio.load(txt);
    const slug = fullUrl.replace(/\/+$/, '').split('/').pop();

    // 1. Title
    const titleEl = $('h1.title').first();
    let title = titleEl.text().trim() || slug.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    title = fixEncoding(title);

    // 2. Poster
    const thumbEl = $('.thumb img').first();
    let image = thumbEl.attr('src');
    if (image && !image.startsWith('http')) image = this._formatUrl(image);
    if (!image && slug) image = `https://tioanime.com/uploads/thumbs/${slug}.jpg`;

    // 3. Synopsis
    const sinopsisEl = $('p.sinopsis').first();
    let synopsis = sinopsisEl.text().trim();
    synopsis = fixEncoding(synopsis);

    // 4. Genres
    const genres = [];
    $('.genres a, .generos a, p.genres a').each((_, el) => {
      const g = $(el).text().trim();
      if (g && !genres.includes(g)) genres.push(fixEncoding(g));
    });

    // 5. Status
    let status = 'En emisión';
    const statusEl = $('[class*="status"]').first();
    if (statusEl.length > 0 && statusEl.text().toLowerCase().includes('finalizado')) {
      status = 'Finalizado';
    }

    // 6. Episodes from script: var episodes = [2, 1];
    const episodes = [];
    const seenEps = new Set();
    const mEps = txt.match(/var episodes = (\[.*?\]);/);
    if (mEps) {
      try {
        const rawList = JSON.parse(mEps[1]);
        const nums = rawList
          .map(ep => parseInt(Array.isArray(ep) ? ep[0] : ep, 10))
          .filter(n => !isNaN(n) && n > 0)
          .sort((a, b) => a - b);
        for (const num of nums) {
          if (seenEps.has(num)) continue;
          seenEps.add(num);
          episodes.push({
            number: num,
            title: `Episodio ${num}`,
            url: this._formatUrl(`/ver/${slug}-${num}`),
            image: null
          });
        }
      } catch (_) {}
    }

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
    const fullUrl = this._formatUrl(targetUrl);
    const headers = getHeaders(this.baseUrl);
    const res = await httpClient.get(fullUrl, { headers });
    const txt = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
    const $ = cheerio.load(txt);

    const mSlugEp = fullUrl.match(/\/ver\/(.+)-(\d+)\/?$/);
    const slug = mSlugEp ? mSlugEp[1] : '';
    const epNum = mSlugEp ? parseInt(mSlugEp[2], 10) : 1;
    const animeUrl = this._formatUrl(`/anime/${slug}`);

    // Anime Title
    let animeTitle = slug.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    animeTitle = fixEncoding(animeTitle);

    // Prev / Next
    let prevUrl = null;
    const prevHref = $('.fa-arrow-left, [class*="arrow-left"]').closest('a').attr('href');
    if (prevHref && prevHref !== '#' && prevHref.includes('/ver/')) {
      prevUrl = this._formatUrl(prevHref);
    } else if (epNum > 1) {
      prevUrl = this._formatUrl(`/ver/${slug}-${epNum - 1}`);
    }

    let nextUrl = null;
    const nextHref = $('.fa-arrow-right, [class*="arrow-right"]').closest('a').attr('href');
    if (nextHref && nextHref !== '#' && nextHref.includes('/ver/')) {
      nextUrl = this._formatUrl(nextHref);
    }

    // Audio determination
    const isDub = ['latino', 'castellano', 'doblado', 'dub'].some(k => (slug + ' ' + animeTitle).toLowerCase().includes(k));
    const audioType = isDub ? 'DUB' : 'SUB';
    const audioPrefix = `[${audioType}] `;

    // Servers from script: var videos = [["Mega","https:\/\/...",0,0], ...]
    const servers = [];
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

    const mVid = txt.match(/var videos = (\[.*?\]);/);
    if (mVid) {
      try {
        const vidData = JSON.parse(mVid[1]);
        for (const v of vidData) {
          const sName = v[0];
          let sUrl = typeof v[1] === 'string' ? v[1].trim() : '';
          if (sUrl.startsWith('//')) sUrl = 'https:' + sUrl;
          if (!/^https?:\/\//i.test(sUrl)) {
            continue;
          }
          if (isHiddenServer(sName, sUrl)) {
            continue;
          }
          servers.push({
            name: `${audioPrefix}${sName}`,
            embed: sUrl,
            audio: audioType
          });
        }
      } catch (_) {}
    }

    // Thumbnail fallback from canonical thumbs or meta tags (avoid picking up navbar logo)
    let image = null;
    const ogImg = $('meta[property="og:image"]').attr('content') || $('meta[name="twitter:image"]').attr('content');
    if (ogImg && !ogImg.toLowerCase().includes('logo')) {
      image = this._formatUrl(ogImg);
    } else if (slug) {
      image = `https://tioanime.com/uploads/thumbs/${slug}.jpg`;
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
    if (typeFilter && typeFilter !== 'all') {
      const mapped = typeMap[typeFilter.toLowerCase().trim()];
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
    if (page > 1) {
      params.push(['p', String(page)]);
    }

    const qs = params.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
    const url = qs ? `${this.baseUrl}/directorio?${qs}` : `${this.baseUrl}/directorio`;
    const headers = getHeaders(this.baseUrl);
    const res = await httpClient.get(url, { headers });
    const $ = cheerio.load(res.data);
    const items = [];

    $('article.anime').each((_, el) => {
      const aTag = $(el).find('a').first();
      const href = aTag.attr('href');
      if (!href) return;

      const animeUrl = this._formatUrl(href);
      const titleTag = $(el).find('h3.title, h3, h2, h4, span.title').first();
      let title = titleTag.text().trim() || 'Anime';
      title = fixEncoding(title);

      const imgTag = $(el).find('img').first();
      let image = null;
      if (imgTag.length > 0 && imgTag.attr('src')) {
        image = this._formatUrl(imgTag.attr('src'));
      }

      let tipoNorm = 'TV Anime';
      if (typeFilter) {
        const tf = typeFilter.toLowerCase();
        if (tf.includes('pel') || tf.includes('movie')) tipoNorm = 'Película';
        else if (tf.includes('ova')) tipoNorm = 'OVA';
        else if (tf.includes('esp') || tf.includes('special')) tipoNorm = 'Especial';
      }

      const estadoNorm = (status && status.toLowerCase().includes('fin')) ? 'Finalizado' : 'En emisión';

      items.push({
        title,
        url: animeUrl,
        image,
        source: this.name,
        type: tipoNorm,
        status: estadoNorm,
        year: year && year !== 'all' ? String(year) : null
      });
    });

    return items;
  }
}

module.exports = new TioAnimeProvider();
