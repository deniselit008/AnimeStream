/**
 * AnimeAV1 Provider Adapter for Node.js
 */
const cheerio = require('cheerio');
const { httpClient, getHeaders, fixEncoding, REQUEST_TIMEOUT_MS } = require('../config');

class AnimeAV1Provider {
  constructor() {
    this.name = 'AnimeAV1';
    this.baseUrl = 'https://animeav1.com';
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
    const headers = getHeaders();
    const res = await httpClient.get(this.baseUrl, { headers });
    const $ = cheerio.load(res.data);
    const items = [];
    const seen = new Set();

    $('a').each((_, el) => {
      const href = $(el).attr('href') || '';
      const m = href.match(/^\/media\/([^/]+)\/(\d+)$/);
      if (!m) return;

      const slug = m[1];
      const epStr = m[2];
      const epNum = parseInt(epStr, 10) || epStr;
      const seenKey = `${slug}_${epNum}`;
      if (seen.has(seenKey)) return;
      seen.add(seenKey);

      // Card image search
      const parent = $(el).closest('.item, .card, .group, .relative') || $(el).parent();
      const imgEl = parent.find('img').first();
      let imgSrc = imgEl.attr('src') || imgEl.attr('data-src');
      if (imgSrc && !imgSrc.startsWith('http')) {
        imgSrc = this._formatUrl(imgSrc);
      }

      // Clean Title
      let rawText = $(el).text().replace(/\s+/g, ' ').trim();
      let title = rawText.replace(/^Ver\s+/i, '');
      title = title.replace(new RegExp(`\\s+${epNum}$`), '').trim();
      if (!title) {
        title = slug.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
      }
      title = fixEncoding(title);

      items.push({
        title,
        episode: epNum,
        image: imgSrc || null,
        url: this._formatUrl(href),
        animeUrl: this._formatUrl(`/media/${slug}`),
        source: this.name
      });
    });

    return items;
  }

  async search(query) {
    const encoded = encodeURIComponent(query.trim());
    const url = `${this.baseUrl}/catalogo?search=${encoded}`;
    const headers = getHeaders(this.baseUrl);
    const res = await httpClient.get(url, { headers });
    const $ = cheerio.load(res.data);
    const results = [];
    const seen = new Set();

    $('a').each((_, el) => {
      const href = $(el).attr('href') || '';
      const m = href.match(/^\/media\/([^/]+)$/);
      if (!m) return;

      const slug = m[1];
      if (seen.has(slug) || ['catalogo', 'horario', 'pages'].includes(slug)) return;
      seen.add(slug);

      const card = $(el).closest('.card, .item, .media, .group') || $(el);
      const titleEl = card.find('h3, h4, h5, .title').first();
      let title = titleEl.text().trim();
      if (!title) {
        const text = $(el).text().trim();
        title = text.replace(/^Ver\s+/i, '').trim();
      }
      if (!title) {
        title = slug.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
      }
      title = fixEncoding(title);

      const imgEl = card.find('img').first();
      let image = imgEl.attr('src') || imgEl.attr('data-src');
      if (image && !image.startsWith('http')) {
        image = this._formatUrl(image);
      }

      results.push({
        title,
        url: this._formatUrl(href),
        image: image || null,
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

    // 1. Title
    const h1 = $('h1').first();
    let title = h1.text().trim();
    if (!title) {
      const mTitle = txt.match(/title:"([^"]+)"/);
      title = mTitle ? mTitle[1] : fullUrl.split('/').pop().replace(/-/g, ' ');
    }
    title = fixEncoding(title);

    // 2. Synopsis
    let synopsis = '';
    const mSyn = txt.match(/synopsis:"(.*?)"[,}]/);
    if (mSyn) {
      try {
        synopsis = JSON.parse(`"${mSyn[1]}"`);
      } catch (_) {
        synopsis = mSyn[1];
      }
    }
    if (!synopsis) {
      const metaDesc = $('meta[property="og:description"]').attr('content') || $('meta[name="description"]').attr('content');
      if (metaDesc) synopsis = metaDesc.trim();
    }
    synopsis = fixEncoding(synopsis);

    // 3. Poster & Backdrop
    let image = $('img.aspect-poster, img[class*="aspect-poster"]').attr('src') || $('img').first().attr('src');
    if (image && !image.startsWith('http')) image = this._formatUrl(image);

    let backdrop = $('img.backdrop, img[class*="backdrop"]').attr('src');
    if (backdrop && !backdrop.startsWith('http')) backdrop = this._formatUrl(backdrop);

    // 4. Genres
    const genres = [];
    const mGenres = [...txt.matchAll(/name:"([^"]+)",type:\d+,slug:"([^"]+)"/g)];
    if (mGenres.length > 0) {
      for (const mg of mGenres) {
        const cleanG = fixEncoding(mg[1]);
        if (!genres.includes(cleanG)) genres.push(cleanG);
      }
    }
    if (genres.length === 0) {
      $('a[href*="/catalogo?genre="]').each((_, el) => {
        const gText = $(el).text().trim();
        if (gText && !genres.includes(gText)) genres.push(fixEncoding(gText));
      });
    }

    // 5. Status
    let status = 'En emisión';
    const mStatus = txt.match(/status:(\d+)/);
    if (mStatus && mStatus[1] === '1') {
      status = 'Finalizado';
    }

    // 6. Episodes List
    const slug = fullUrl.split('/').pop();
    const episodes = [];
    const seenEps = new Set();

    // From script SvelteKit payload
    const mEps = [...txt.matchAll(/\{id:(\d+),number:(\d+)\}/g)];
    const mMediaId = txt.match(/media:\{id:(\d+)/);
    const mid = mMediaId ? mMediaId[1] : '';

    if (mEps.length > 0) {
      for (const mep of mEps) {
        const epNum = parseInt(mep[2], 10);
        if (seenEps.has(epNum)) continue;
        seenEps.add(epNum);
        const thumb = mid ? `https://cdn.animeav1.com/screenshots/${mid}/${epNum}.jpg` : null;
        episodes.push({
          number: epNum,
          title: `Episodio ${epNum}`,
          url: this._formatUrl(`/media/${slug}/${epNum}`),
          image: thumb
        });
      }
    }

    // Fallback to DOM episode links
    if (episodes.length === 0) {
      const epRegex = new RegExp(`^/media/${slug}/(\\d+)$`);
      $('a').each((_, el) => {
        const href = $(el).attr('href') || '';
        const m = href.match(epRegex);
        if (m) {
          const epNum = parseInt(m[1], 10);
          if (!seenEps.has(epNum)) {
            seenEps.add(epNum);
            episodes.push({
              number: epNum,
              title: `Episodio ${epNum}`,
              url: this._formatUrl(href),
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
      backdrop,
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

    const mSlugEp = fullUrl.match(/\/media\/([^/]+)\/(\d+)/);
    const slug = mSlugEp ? mSlugEp[1] : '';
    const epNum = mSlugEp ? parseInt(mSlugEp[2], 10) : 1;
    const animeUrl = this._formatUrl(`/media/${slug}`);

    // Anime Title
    let animeTitle = '';
    const mTitle = txt.match(/media:\{[^{}]*title:"([^"]+)"/);
    if (mTitle && !['episodio', 'episodios'].includes(mTitle[1].toLowerCase())) {
      animeTitle = mTitle[1];
    }
    if (!animeTitle) {
      const rawH1 = $('h1').text().trim();
      if (rawH1 && !rawH1.toLowerCase().startsWith('episodio')) {
        animeTitle = rawH1.replace(new RegExp(`\\s+${epNum}$`), '').trim();
      }
    }
    if (!animeTitle) {
      animeTitle = slug.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    }
    animeTitle = fixEncoding(animeTitle);

    // Prev / Next
    let prevUrl = null;
    let nextUrl = null;
    const prevBtn = $('a[aria-label="Anterior"]').attr('href');
    if (prevBtn) {
      prevUrl = this._formatUrl(prevBtn);
    } else if (epNum > 1) {
      prevUrl = this._formatUrl(`/media/${slug}/${epNum - 1}`);
    }

    const nextBtn = $('a[aria-label="Siguiente"]').attr('href');
    if (nextBtn) {
      nextUrl = this._formatUrl(nextBtn);
    }

    // Video servers
    const servers = [];
    const seenEmbeds = new Set();
    const audios = [];

    // 1. Structured embeds: { SUB: [...], DUB: [...] }
    const mEmbeds = txt.match(/embeds:\{(.*?)\},\s*(?:downloads|subtitles|mirrors):/s);
    if (mEmbeds) {
      const rawBlock = mEmbeds[1];
      for (const variant of ['SUB', 'DUB']) {
        const varMatch = rawBlock.match(new RegExp(`${variant}:\\[(.*?)\\]`, 's'));
        if (varMatch) {
          const sList = [...varMatch[1].matchAll(/\{server:"([^"]+)",url:"([^"]+)"\}/g)];
          if (sList.length > 0 && !audios.includes(variant)) {
            audios.push(variant);
          }
          for (const s of sList) {
            const sName = s[1].trim();
            const sUrl = s[2];
            const labelPrefix = `[${variant}] `;

            if (sUrl.includes('zilla-networks.com') || sName.toUpperCase() === 'HLS') {
              const mHash = sUrl.match(/([a-fA-F0-9]{32})/);
              if (mHash) {
                const hlsHash = mHash[1];
                const hlsEmbed = `/api/hls/player/${hlsHash}`;
                if (!seenEmbeds.has(`${hlsEmbed}_${variant}`)) {
                  seenEmbeds.add(`${hlsEmbed}_${variant}`);
                  servers.push({
                    name: `${labelPrefix}HLS (Reproductor HD)`,
                    embed: hlsEmbed,
                    audio: variant
                  });
                }
                if (!seenEmbeds.has(`${sUrl}_${variant}`)) {
                  seenEmbeds.add(`${sUrl}_${variant}`);
                  servers.push({
                    name: `${labelPrefix}HLS (Zilla Mirror)`,
                    embed: sUrl,
                    audio: variant
                  });
                }
                continue;
              }
            }

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

    // Fallback if no structured embeds were captured
    if (servers.length === 0) {
      const mServers = [...txt.matchAll(/\{server:"([^"]+)",url:"([^"]+)"\}/g)];
      for (const ms of mServers) {
        const sName = ms[1].trim();
        const sUrl = ms[2];
        if (seenEmbeds.has(sUrl)) continue;
        seenEmbeds.add(sUrl);

        if (sUrl.includes('zilla-networks.com') || sName.toUpperCase() === 'HLS') {
          const mHash = sUrl.match(/([a-fA-F0-9]{32})/);
          if (mHash) {
            servers.unshift({ name: '[SUB] HLS (Reproductor HD)', embed: `/api/hls/player/${mHash[1]}`, audio: 'SUB' });
            servers.push({ name: '[SUB] HLS (Zilla Mirror)', embed: sUrl, audio: 'SUB' });
            continue;
          }
        }
        servers.push({ name: `[SUB] ${sName}`, embed: sUrl, audio: 'SUB' });
      }
      audios.push('SUB');
    }

    // Fallback DOM iframes
    $('iframe').each((_, el) => {
      const src = $(el).attr('src');
      if (src && src.startsWith('http') && !seenEmbeds.has(src)) {
        if (!['google', 'analytics', 'turnstile', 'recaptcha', 'discord'].some(b => src.includes(b))) {
          seenEmbeds.add(src);
          servers.unshift({ name: '[SUB] Principal', embed: src, audio: 'SUB' });
          if (!audios.includes('SUB')) audios.unshift('SUB');
        }
      }
    });

    if (audios.length === 0) audios.push('SUB');

    // Image thumbnail
    let image = null;
    const mMid = txt.match(/media:\{id:(\d+)/);
    if (mMid) {
      image = `https://cdn.animeav1.com/thumbnails/${mMid[1]}.jpg`;
    }
    if (!image) {
      const posterImg = $('img.aspect-poster, img.aspect-video').attr('src');
      if (posterImg) image = this._formatUrl(posterImg);
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
      audios
    };
  }

  async getDirectory(genre = null, typeFilter = null, year = null, status = null, page = 1) {
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
    if (typeFilter && typeFilter !== 'all') {
      const mapped = typeMap[typeFilter.toLowerCase().trim()] || typeFilter.toLowerCase().trim();
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
    if (page > 1) {
      params.set('page', String(page));
    }

    const qs = params.toString();
    const url = qs ? `${this.baseUrl}/catalogo?${qs}` : `${this.baseUrl}/catalogo`;
    const headers = getHeaders(this.baseUrl);
    const res = await httpClient.get(url, { headers });
    const $ = cheerio.load(res.data);
    const items = [];
    const seenUrls = new Set();

    $('a[href^="/media/"]').each((_, el) => {
      const href = $(el).attr('href') || '';
      if (!href.match(/^\/media\/[^/]+$/) || seenUrls.has(href)) return;
      seenUrls.add(href);

      const animeUrl = `${this.baseUrl}${href}`;
      let rawTitle = $(el).text().replace(/\s+/g, ' ').trim();
      let title = rawTitle.replace(/^Ver\s+/i, '').trim();
      if (!title) {
        title = href.replace('/media/', '').replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
      }
      title = fixEncoding(title);

      const parent = $(el).parent() || $(el);
      const imgTag = parent.find('img').first();
      let image = null;
      if (imgTag.length > 0) {
        const src = imgTag.attr('src') || imgTag.attr('data-src');
        if (src) image = this._formatUrl(src);
      }

      let tipoNorm = 'TV Anime';
      if (typeFilter) {
        const tf = typeFilter.toLowerCase();
        if (tf.includes('pel') || tf.includes('movie')) tipoNorm = 'Película';
        else if (tf.includes('ova')) tipoNorm = 'OVA';
        else if (tf.includes('ona')) tipoNorm = 'ONA';
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

module.exports = new AnimeAV1Provider();
