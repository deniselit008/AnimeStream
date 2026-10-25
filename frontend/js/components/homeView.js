/**
 * Home View Component
 * Featured hero banner, Continue Watching carousel/grid, and Latest Episodes grid.
 */
import { Api } from '../api.js?v=3.0';
import { Storage } from '../storage.js?v=3.0';
import { Icons, escapeHtml, getSourceBadgeClass, resolveAnimeCover, getDefaultPoster } from '../utils.js?v=3.0';

export async function renderHome(container) {
  container.innerHTML = `
    <div class="home-container">
      <!-- Hero Banner Placeholder -->
      <div id="hero-banner-mount"></div>

      <!-- Continue Watching Section -->
      <div id="continue-watching-mount"></div>

      <!-- Latest Episodes Section -->
      <section class="section">
        <div class="section-header">
          <h2 class="section-title">
            ${Icons.play} Últimos Episodios en Emisión
          </h2>
          <div class="filter-pills" id="home-source-filters">
            <button class="btn-pill active" data-source="all">Todos</button>
            <button class="btn-pill" data-source="animeav1">AnimeAV1</button>
            <button class="btn-pill" data-source="jkanime">JKAnime</button>
            <button class="btn-pill" data-source="tioanime">TioAnime</button>
          </div>
        </div>

        <!-- Latest Grid Container -->
        <div class="anime-grid" id="latest-episodes-grid">
          ${renderSkeletons(12)}
        </div>
      </section>
    </div>
  `;

  // Render Continue Watching
  renderContinueWatching(container.querySelector('#continue-watching-mount'));

  // Load Latest Episodes
  await loadLatestEpisodes(container, 'all');

  // Filter Pills Event Listener
  const filterBtns = container.querySelectorAll('#home-source-filters .btn-pill');
  filterBtns.forEach(btn => {
    btn.addEventListener('click', async () => {
      filterBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const source = btn.dataset.source;
      const grid = container.querySelector('#latest-episodes-grid');
      grid.innerHTML = renderSkeletons(10);
      await loadLatestEpisodes(container, source);
    });
  });
}

function renderSkeletons(count = 10) {
  return Array(count).fill(0).map(() => `<div class="skeleton-card"></div>`).join('');
}

function renderContinueWatching(mount) {
  if (!mount) return;
  try {
    const history = Storage.getHistory();
    if (!history || !Array.isArray(history) || history.length === 0) {
      mount.innerHTML = '';
      return;
    }

    const items = history.slice(0, 6);
    mount.innerHTML = `
      <section class="section continue-watching-section">
        <div class="section-header">
          <h2 class="section-title">
            ${Icons.history} Continuar Viendo
          </h2>
          <a href="#/history" class="btn btn-outline" style="padding: 6px 14px; font-size: 0.85rem;">
            Ver todo el historial (${history.length})
          </a>
        </div>
        <div class="anime-grid">
          ${items.map(item => {
            const coverUrl = resolveAnimeCover(item);
            const defaultSvg = getDefaultPoster(item.animeTitle, item.source);
            return `
            <div class="anime-card">
              <a href="#/watch?url=${encodeURIComponent(item.url)}&image=${encodeURIComponent(item.image || '')}&title=${encodeURIComponent(item.animeTitle || '')}&animeUrl=${encodeURIComponent(item.animeUrl || '')}" class="anime-card-media">
                <img 
                  src="${escapeHtml(coverUrl)}" 
                  alt="${escapeHtml(item.animeTitle)}" 
                  class="anime-card-img" 
                  loading="lazy"
                  onerror="this.onerror=null; this.src='${defaultSvg}';"
                />
                <div class="play-overlay">
                  <div class="play-btn-circle">${Icons.play}</div>
                </div>
                <div class="card-badge-top-left">
                  <span class="badge ${getSourceBadgeClass(item.source)}">
                    ${escapeHtml(item.source)}
                  </span>
                </div>
                <div class="card-badge-bottom-right">
                  <span class="badge badge-episode">Ep. ${escapeHtml(String(item.episode))}</span>
                </div>
              </a>
              <div class="anime-card-info">
                <a href="#/watch?url=${encodeURIComponent(item.url)}&image=${encodeURIComponent(item.image || '')}&title=${encodeURIComponent(item.animeTitle || '')}" class="anime-card-title" title="${escapeHtml(item.animeTitle)}">
                  ${escapeHtml(item.animeTitle)}
                </a>
                <div class="anime-card-meta">
                  <span>Episodio ${escapeHtml(String(item.episode))}</span>
                  <a href="#/anime?url=${encodeURIComponent(item.animeUrl)}" title="Ficha del anime" style="color: var(--accent-primary);">
                    Ficha
                  </a>
                </div>
              </div>
            </div>
          `}).join('')}
        </div>
      </section>
    `;
  } catch (err) {
    console.warn('Error rendering continue watching:', err);
    mount.innerHTML = '';
  }
}

async function loadLatestEpisodes(container, source = 'all') {
  const grid = container.querySelector('#latest-episodes-grid');
  const heroMount = container.querySelector('#hero-banner-mount');

  try {
    const episodes = await Api.getLatest(source);
    if (!episodes || episodes.length === 0) {
      grid.innerHTML = `
        <div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--text-dim);">
          No se pudieron cargar los últimos episodios. Por favor, intenta de nuevo o cambia de fuente.
        </div>
      `;
      return;
    }

    // Render Hero Banner from the first high-quality item if on 'all'
    if (source === 'all' && heroMount && !heroMount.querySelector('.hero-banner')) {
      const featured = episodes.find(e => e.image) || episodes[0];
      if (featured) {
        heroMount.innerHTML = `
          <div class="hero-banner">
            <img src="${escapeHtml(featured.image)}" class="hero-backdrop" alt="${escapeHtml(featured.title)}" onerror="this.style.display='none'" />
            <div class="hero-gradient"></div>
            <div class="hero-content">
              <div class="hero-badges">
                <span class="badge ${getSourceBadgeClass(featured.source)}">
                  ${escapeHtml(featured.source)}
                </span>
                <span class="badge badge-episode">Episodio ${escapeHtml(String(featured.episode))}</span>
                <span class="badge badge-status">Último Estreno</span>
              </div>
              <h1 class="hero-title">${escapeHtml(featured.title)}</h1>
              <p class="hero-synopsis">
                Disfruta del episodio recién publicado de ${escapeHtml(featured.title)} en calidad HD sin anuncios invasivos. Disponible a través de múltiples reproductores rápidos.
              </p>
              <div class="hero-actions">
                <a href="#/watch?url=${encodeURIComponent(featured.url)}" class="btn btn-primary">
                  ${Icons.play} Reproducir Ep. ${escapeHtml(String(featured.episode))}
                </a>
                <a href="#/anime?url=${encodeURIComponent(featured.animeUrl)}" class="btn btn-secondary">
                  Ficha Técnica
                </a>
              </div>
            </div>
          </div>
        `;
      }
    }

    // Render Cards
    grid.innerHTML = episodes.map(ep => {
      const isSeen = Storage.isSeen(ep.url);
      const fallbackImg = getDefaultPoster(ep.title, ep.source);
      const watchHref = `#/watch?url=${encodeURIComponent(ep.url)}&image=${encodeURIComponent(ep.image || '')}&title=${encodeURIComponent(ep.title || '')}&animeUrl=${encodeURIComponent(ep.animeUrl || '')}`;
      return `
        <div class="anime-card">
          <a href="${watchHref}" class="anime-card-media" title="Ver ${escapeHtml(ep.title)} - Episodio ${ep.episode}">
            <img 
              src="${escapeHtml(ep.image || fallbackImg)}" 
              alt="${escapeHtml(ep.title)}" 
              class="anime-card-img" 
              loading="lazy"
              onerror="this.onerror=null; this.src='${fallbackImg}'"
            />
            <div class="play-overlay">
              <div class="play-btn-circle">${Icons.play}</div>
            </div>
            
            <div class="card-badge-top-left">
              <span class="badge ${getSourceBadgeClass(ep.source)}">
                ${escapeHtml(ep.source)}
              </span>
            </div>

            <div class="card-badge-bottom-right">
              <span class="badge badge-episode">Ep. ${escapeHtml(String(ep.episode))}</span>
            </div>

            ${isSeen ? `
              <div class="card-seen-indicator">
                ${Icons.check} Visto
              </div>
            ` : ''}
          </a>

          <div class="anime-card-info">
            <a href="${watchHref}" class="anime-card-title" title="${escapeHtml(ep.title)}">
              ${escapeHtml(ep.title)}
            </a>
            <div class="anime-card-meta">
              <span>Capítulo ${escapeHtml(String(ep.episode))}</span>
              <a href="#/anime?url=${encodeURIComponent(ep.animeUrl)}" title="Ver ficha técnica" style="color: var(--accent-primary); font-weight: 500;">
                Ficha →
              </a>
            </div>
          </div>
        </div>
      `;
    }).join('');

  } catch (err) {
    grid.innerHTML = `
      <div class="alert-banner error" style="grid-column: 1/-1;">
        <div>
          <strong>Error de conexión con el proveedor:</strong> ${escapeHtml(err.message)}
        </div>
        <button class="btn btn-secondary" onclick="window.location.reload()">Reintentar</button>
      </div>
    `;
  }
}
