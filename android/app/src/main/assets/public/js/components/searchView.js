/**
 * Search View Component
 * Multi-source real-time search with error shielding and source tabs.
 */
import { Api } from '../api.js?v=3.0';
import { Icons, escapeHtml, getSourceBadgeClass } from '../utils.js?v=3.0';

export async function renderSearch(container, query, source = 'all') {
  container.innerHTML = `
    <div class="search-view-container">
      <div class="section-header" style="gap: 16px; align-items: center; margin-bottom: 24px;">
        <div style="flex: 1; min-width: 240px;">
          <h2 class="section-title">
            ${Icons.search} Resultados para: <span style="color: var(--accent-primary);">"${escapeHtml(query)}"</span>
          </h2>
          <p style="color: var(--text-dim); font-size: 0.9rem; margin-top: 4px;" id="search-count-label">
            Buscando simultáneamente en todos los proveedores...
          </p>
        </div>

        <!-- Inline Re-Search Form on Search Page -->
        <form id="search-view-inline-form" style="display: flex; gap: 8px; flex: 1; max-width: 440px; min-width: 240px;">
          <input 
            type="text" 
            id="search-view-inline-input" 
            class="search-input" 
            value="${escapeHtml(query)}" 
            placeholder="Buscar otro anime en tiempo real..." 
            style="background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-sm); padding: 8px 14px; flex: 1; color: var(--text-main);"
            autocomplete="off"
          />
          <button type="submit" class="btn btn-primary" style="padding: 8px 16px; white-space: nowrap; display: inline-flex; align-items: center; gap: 6px;">
            ${Icons.search} Buscar
          </button>
        </form>

        <div class="filter-pills" id="search-source-filters">
          <button class="btn-pill ${source === 'all' ? 'active' : ''}" data-source="all">Todos</button>
          <button class="btn-pill ${source === 'animeav1' ? 'active' : ''}" data-source="animeav1">AnimeAV1</button>
          <button class="btn-pill ${source === 'jkanime' ? 'active' : ''}" data-source="jkanime">JKAnime</button>
          <button class="btn-pill ${source === 'tioanime' ? 'active' : ''}" data-source="tioanime">TioAnime</button>
        </div>
      </div>

      <!-- Errors / Fallback Notice -->
      <div id="search-warnings-mount"></div>

      <!-- Results Grid -->
      <div class="anime-grid" id="search-results-grid">
        ${renderSkeletons(8)}
      </div>
    </div>
  `;

  // Attach inline search submission
  const inlineForm = container.querySelector('#search-view-inline-form');
  const inlineInput = container.querySelector('#search-view-inline-input');
  if (inlineForm && inlineInput) {
    inlineForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const newQuery = inlineInput.value.trim();
      if (newQuery) {
        const navInput = document.querySelector('#nav-search-input');
        if (navInput) navInput.value = newQuery;

        const targetHash = `#/search?q=${encodeURIComponent(newQuery)}&source=${source}`;
        if (window.location.hash === targetHash) {
          renderSearch(container, newQuery, source);
        } else {
          window.location.hash = targetHash;
        }
      }
    });
  }

  // Attach filter event
  const filterBtns = container.querySelectorAll('#search-source-filters .btn-pill');
  filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const newSource = btn.dataset.source;
      const targetHash = `#/search?q=${encodeURIComponent(query)}&source=${newSource}`;
      if (window.location.hash === targetHash) {
        renderSearch(container, query, newSource);
      } else {
        window.location.hash = targetHash;
      }
    });
  });

  // Perform search
  const grid = container.querySelector('#search-results-grid');
  const countLabel = container.querySelector('#search-count-label');
  const warningsMount = container.querySelector('#search-warnings-mount');

  if (!query || !query.trim()) {
    countLabel.textContent = 'Ingresa un término de búsqueda';
    grid.innerHTML = `
      <div style="grid-column: 1/-1; text-align: center; padding: 60px 20px; color: var(--text-muted);">
        <div style="font-size: 3rem; margin-bottom: 12px;">🔍</div>
        <h3 style="color: #fff; margin-bottom: 8px;">Buscador de Anime</h3>
        <p style="color: var(--text-dim); max-width: 400px; margin: 0 auto 20px;">
          Escribe el título de una serie en la barra superior para buscar en tiempo real en todos los servidores.
        </p>
        <a href="#/" class="btn btn-primary">Volver al Inicio</a>
      </div>
    `;
    return;
  }

  try {
    const data = await Api.search(query, source);
    const results = data.results || [];
    const errors = data.errors || [];

    // Show warnings if one provider had issues
    if (errors.length > 0) {
      warningsMount.innerHTML = errors.map(e => `
        <div class="alert-banner">
          <div>
            ${Icons.alert} <strong>Aviso de fuente (${escapeHtml(e.source)}):</strong> No se pudieron obtener resultados de esta fuente. Mostrando resultados de la fuente alternativa.
          </div>
        </div>
      `).join('');
    }

    countLabel.textContent = `${results.length} animes encontrados`;

    if (results.length === 0) {
      grid.innerHTML = `
        <div style="grid-column: 1/-1; text-align: center; padding: 60px 20px; color: var(--text-muted);">
          <div style="font-size: 3rem; margin-bottom: 12px;">🔍</div>
          <h3 style="color: #fff; margin-bottom: 8px;">No se encontraron animes para "${escapeHtml(query)}"</h3>
          <p style="color: var(--text-dim); max-width: 400px; margin: 0 auto 20px;">
            Intenta con otro término de búsqueda o verifica que no haya faltas de ortografía.
          </p>
          <a href="#/" class="btn btn-primary">Volver al Inicio</a>
        </div>
      `;
      return;
    }

    grid.innerHTML = results.map(item => {
      const fallbackImg = `https://via.placeholder.com/240x340/161f30/94a3b8?text=${encodeURIComponent(item.title)}`;
      return `
        <div class="anime-card">
          <a href="#/anime?url=${encodeURIComponent(item.url)}" class="anime-card-media poster" title="${escapeHtml(item.title)}">
            <img 
              src="${escapeHtml(item.image || fallbackImg)}" 
              alt="${escapeHtml(item.title)}" 
              class="anime-card-img" 
              loading="lazy"
              onerror="this.src='${fallbackImg}'"
            />
            <div class="play-overlay">
              <div class="play-btn-circle">${Icons.play}</div>
            </div>
            <div class="card-badge-top-left">
              <span class="badge ${getSourceBadgeClass(item.source)}">
                ${escapeHtml(item.source)}
              </span>
            </div>
          </a>

          <div class="anime-card-info">
            <a href="#/anime?url=${encodeURIComponent(item.url)}" class="anime-card-title" title="${escapeHtml(item.title)}">
              ${escapeHtml(item.title)}
            </a>
            <div class="anime-card-meta">
              <span>${escapeHtml(item.type || 'Anime')}</span>
              <a href="#/anime?url=${encodeURIComponent(item.url)}" style="color: var(--accent-primary); font-weight: 600;">
                Ver ficha →
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
          ${Icons.alert} <strong>Error en la búsqueda:</strong> ${escapeHtml(err.message)}
        </div>
        <button class="btn btn-secondary" onclick="window.location.reload()">Reintentar</button>
      </div>
    `;
  }
}

function renderSkeletons(count = 8) {
  return Array(count).fill(0).map(() => `<div class="skeleton-card" style="height: 320px;"></div>`).join('');
}
