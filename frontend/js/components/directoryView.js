/**
 * Anime Directory View Component (Directorio de Anime)
 * Multi-faceted catalog filtering by Category/Genre, Type, Year, Status, and Source.
 */
import { Api } from '../api.js?v=3.0';
import { Icons, escapeHtml, getSourceBadgeClass, getDefaultPoster, fixEncoding, slugifyGenre } from '../utils.js?v=3.0';

const GENRES = [
  { id: 'all', label: 'Todos los géneros' },
  { id: 'accion', label: 'Acción' },
  { id: 'aventura', label: 'Aventura' },
  { id: 'ciencia-ficcion', label: 'Ciencia Ficción' },
  { id: 'comedia', label: 'Comedia' },
  { id: 'deportes', label: 'Deportes' },
  { id: 'drama', label: 'Drama' },
  { id: 'ecchi', label: 'Ecchi' },
  { id: 'escolares', label: 'Escolares' },
  { id: 'espacial', label: 'Espacial' },
  { id: 'fantasia', label: 'Fantasía' },
  { id: 'harem', label: 'Harem' },
  { id: 'historico', label: 'Histórico' },
  { id: 'isekai', label: 'Isekai' },
  { id: 'magia', label: 'Magia' },
  { id: 'mecha', label: 'Mecha' },
  { id: 'misterio', label: 'Misterio' },
  { id: 'musica', label: 'Música' },
  { id: 'psicologico', label: 'Psicológico' },
  { id: 'romance', label: 'Romance' },
  { id: 'seinen', label: 'Seinen' },
  { id: 'shoujo', label: 'Shoujo' },
  { id: 'shounen', label: 'Shounen' },
  { id: 'sobrenatural', label: 'Sobrenatural' },
  { id: 'suspenso', label: 'Suspenso' },
  { id: 'terror', label: 'Terror' }
];

const TYPES = [
  { id: 'all', label: 'Todos los tipos' },
  { id: 'tv', label: 'TV Anime (Serie)' },
  { id: 'movie', label: 'Película' },
  { id: 'ova', label: 'OVA' },
  { id: 'special', label: 'Especial' },
  { id: 'ona', label: 'ONA' }
];

const STATUSES = [
  { id: 'all', label: 'Todos los estados' },
  { id: 'emision', label: 'En emisión' },
  { id: 'finalizado', label: 'Finalizado' }
];

const SOURCES = [
  { id: 'all', label: 'Todas las fuentes' },
  { id: 'animeav1', label: 'AnimeAV1' },
  { id: 'jkanime', label: 'JKAnime' },
  { id: 'tioanime', label: 'TioAnime' }
];

// Generate years 2026 down to 1980 (47 years)
const YEARS = ['all', ...Array.from({ length: 47 }, (_, i) => String(2026 - i))];

export async function renderDirectory(container, params = new URLSearchParams()) {
  const rawGenre = params.get('genre') || '';
  const selectedGenres = new Set();

  if (rawGenre && rawGenre !== 'all') {
    rawGenre.split(',').forEach(gItem => {
      const cleanItem = fixEncoding(gItem.trim());
      if (!cleanItem) return;
      const slug = slugifyGenre(cleanItem);
      const match = GENRES.find(g =>
        g.id !== 'all' && (
          g.id.toLowerCase() === slug ||
          g.id.toLowerCase() === cleanItem.toLowerCase() ||
          slugifyGenre(g.label) === slug ||
          g.label.toLowerCase() === cleanItem.toLowerCase()
        )
      );
      if (match) {
        selectedGenres.add(match.id);
      } else if (slug && slug !== 'all') {
        selectedGenres.add(slug);
      }
    });
  }

  const currentGenreParam = selectedGenres.size > 0 ? Array.from(selectedGenres).join(',') : 'all';
  const currentType = params.get('type') || 'all';
  const currentYear = params.get('year') || 'all';
  const currentStatus = params.get('status') || 'all';
  const currentSource = params.get('source') || 'all';
  const currentPage = parseInt(params.get('page') || '1', 10);

  // Build active filters summary
  const activeFilters = [];
  selectedGenres.forEach(gId => {
    const gObj = GENRES.find(g => g.id === gId);
    activeFilters.push({
      type: 'genre',
      value: gId,
      label: gObj ? gObj.label : gId
    });
  });
  if (currentType !== 'all') {
    const tObj = TYPES.find(t => t.id === currentType);
    activeFilters.push({
      type: 'type',
      value: currentType,
      label: `Tipo: ${tObj ? tObj.label : currentType}`
    });
  }
  if (currentYear !== 'all') {
    activeFilters.push({
      type: 'year',
      value: currentYear,
      label: `Año: ${currentYear}`
    });
  }
  if (currentStatus !== 'all') {
    const sObj = STATUSES.find(s => s.id === currentStatus);
    activeFilters.push({
      type: 'status',
      value: currentStatus,
      label: `Estado: ${sObj ? sObj.label : currentStatus}`
    });
  }
  if (currentSource !== 'all') {
    const srcObj = SOURCES.find(s => s.id === currentSource);
    activeFilters.push({
      type: 'source',
      value: currentSource,
      label: `Fuente: ${srcObj ? srcObj.label : currentSource}`
    });
  }

  container.innerHTML = `
    <div class="directory-view section">
      <!-- Directory Header -->
      <div class="directory-header">
        <div>
          <h1 class="section-title" style="font-size: 1.85rem; margin-bottom: 6px;">
            ${Icons.compass} Directorio de Anime
          </h1>
          <p style="color: var(--text-muted); font-size: 0.95rem;">
            Explora y filtra animes por categorías múltiples, tipo, año (hasta los 80), estado de emisión y fuente.
          </p>
        </div>
      </div>

      <!-- Filter Controls Panel -->
      <div class="directory-filter-card">
        <!-- Multi-Category Selector -->
        <div class="filter-genre-section">
          <div class="filter-genre-header">
            <div style="display: flex; align-items: center; gap: 8px;">
              <label class="filter-label" style="margin-bottom: 0;">
                Categorías / Géneros (Selecciona una o más)
              </label>
              <span class="badge ${selectedGenres.size > 0 ? 'badge-primary' : ''}" style="font-size: 0.75rem;">
                ${selectedGenres.size === 0 ? 'Todos' : `${selectedGenres.size} seleccionada${selectedGenres.size > 1 ? 's' : ''}`}
              </span>
            </div>
            ${selectedGenres.size > 0 ? `
              <button id="btn-clear-genres" type="button" style="font-size: 0.8rem; color: var(--accent-primary); cursor: pointer; background: none; border: none; padding: 2px 6px; font-weight: 500;">
                Limpiar géneros (✕)
              </button>
            ` : ''}
          </div>
          <div class="genre-pills-container">
            ${GENRES.filter(g => g.id !== 'all').map(g => {
              const isSelected = selectedGenres.has(g.id);
              return `
                <button 
                  type="button" 
                  class="genre-pill ${isSelected ? 'active' : ''}" 
                  data-genre="${g.id}"
                  title="${isSelected ? 'Quitar ' + escapeHtml(g.label) : 'Añadir filtro ' + escapeHtml(g.label)}"
                >
                  ${isSelected ? '<span style="font-weight: bold; margin-right: 2px;">✓</span> ' : ''}${escapeHtml(g.label)}
                </button>
              `;
            }).join('')}
          </div>
        </div>

        <!-- Filter Grid -->
        <div class="directory-filter-grid">
          <!-- Tipo -->
          <div class="filter-group">
            <label class="filter-label">Tipo de Anime</label>
            <select id="dir-filter-type" class="directory-select">
              ${TYPES.map(t => `
                <option value="${t.id}" ${t.id === currentType ? 'selected' : ''}>
                  ${escapeHtml(t.label)}
                </option>
              `).join('')}
            </select>
          </div>

          <!-- Año (1980 - 2026) -->
          <div class="filter-group">
            <label class="filter-label">Año (1980 - 2026)</label>
            <select id="dir-filter-year" class="directory-select">
              <option value="all" ${currentYear === 'all' ? 'selected' : ''}>Todos los años (1980 - 2026)</option>
              ${YEARS.filter(y => y !== 'all').map(y => `
                <option value="${y}" ${y === currentYear ? 'selected' : ''}>${y}</option>
              `).join('')}
            </select>
          </div>

          <!-- Estado -->
          <div class="filter-group">
            <label class="filter-label">Estado</label>
            <select id="dir-filter-status" class="directory-select">
              ${STATUSES.map(s => `
                <option value="${s.id}" ${s.id === currentStatus ? 'selected' : ''}>
                  ${escapeHtml(s.label)}
                </option>
              `).join('')}
            </select>
          </div>

          <!-- Fuente -->
          <div class="filter-group">
            <label class="filter-label">Fuente</label>
            <select id="dir-filter-source" class="directory-select">
              ${SOURCES.map(src => `
                <option value="${src.id}" ${src.id === currentSource ? 'selected' : ''}>
                  ${escapeHtml(src.label)}
                </option>
              `).join('')}
            </select>
          </div>
        </div>

        <!-- Active Filters Bar if any -->
        ${activeFilters.length > 0 ? `
          <div class="active-filters-bar">
            <span style="color: var(--text-muted); font-weight: 500; font-size: 0.8rem; margin-right: 4px;">Filtros activos:</span>
            ${activeFilters.map(af => `
              <span class="active-filter-tag" data-remove-filter="${af.type}" data-remove-val="${af.value}" title="Quitar este filtro">
                ${escapeHtml(af.label)} <span class="tag-close">✕</span>
              </span>
            `).join('')}
            <button id="btn-quick-reset" type="button" style="background: none; border: none; color: var(--accent-primary); font-size: 0.78rem; cursor: pointer; text-decoration: underline; margin-left: 6px;">
              Quitar todos
            </button>
          </div>
        ` : ''}

        <!-- Filter Actions -->
        <div class="directory-actions-row">
          <button id="btn-reset-filters" class="btn btn-outline" style="font-size: 0.88rem; padding: 7px 16px;">
            ${Icons.trash} Limpiar todos los filtros
          </button>
          <div id="dir-results-info" style="color: var(--text-dim); font-size: 0.9rem;">
            Cargando catálogo...
          </div>
        </div>
      </div>

      <!-- Catalog Grid Mount -->
      <div id="directory-grid-mount" class="anime-grid">
        ${renderSkeletons(18)}
      </div>

      <!-- Pagination Bar Mount -->
      <div id="directory-pagination-mount" class="directory-pagination-bar" style="margin-top: 36px;"></div>
    </div>
  `;

  // Attach Filter Change Handlers
  const typeSel = container.querySelector('#dir-filter-type');
  const yearSel = container.querySelector('#dir-filter-year');
  const statusSel = container.querySelector('#dir-filter-status');
  const sourceSel = container.querySelector('#dir-filter-source');
  const resetBtn = container.querySelector('#btn-reset-filters');
  const quickResetBtn = container.querySelector('#btn-quick-reset');
  const clearGenresBtn = container.querySelector('#btn-clear-genres');

  function applyFilters(page = 1) {
    const q = new URLSearchParams();
    if (selectedGenres.size > 0) {
      q.set('genre', Array.from(selectedGenres).join(','));
    }
    if (typeSel.value !== 'all') q.set('type', typeSel.value);
    if (yearSel.value !== 'all') q.set('year', yearSel.value);
    if (statusSel.value !== 'all') q.set('status', statusSel.value);
    if (sourceSel.value !== 'all') q.set('source', sourceSel.value);
    if (page > 1) q.set('page', String(page));

    const qs = q.toString();
    window.location.hash = qs ? `#/directory?${qs}` : `#/directory`;
  }

  // Genre pills click listeners (multi-select toggle)
  const genrePills = container.querySelectorAll('.genre-pill');
  genrePills.forEach(pill => {
    pill.addEventListener('click', () => {
      const gId = pill.dataset.genre;
      if (selectedGenres.has(gId)) {
        selectedGenres.delete(gId);
      } else {
        selectedGenres.add(gId);
      }
      applyFilters(1);
    });
  });

  if (clearGenresBtn) {
    clearGenresBtn.addEventListener('click', () => {
      selectedGenres.clear();
      applyFilters(1);
    });
  }

  // Active filter tags removal
  const removeFilterBtns = container.querySelectorAll('[data-remove-filter]');
  removeFilterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const fType = btn.dataset.removeFilter;
      const fVal = btn.dataset.removeVal;
      if (fType === 'genre') {
        selectedGenres.delete(fVal);
      } else if (fType === 'type') {
        typeSel.value = 'all';
      } else if (fType === 'year') {
        yearSel.value = 'all';
      } else if (fType === 'status') {
        statusSel.value = 'all';
      } else if (fType === 'source') {
        sourceSel.value = 'all';
      }
      applyFilters(1);
    });
  });

  [typeSel, yearSel, statusSel, sourceSel].forEach(sel => {
    sel.addEventListener('change', () => applyFilters(1));
  });

  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      window.location.hash = `#/directory`;
    });
  }

  if (quickResetBtn) {
    quickResetBtn.addEventListener('click', () => {
      window.location.hash = `#/directory`;
    });
  }

  // Fetch Directory Items
  await loadCatalog(container, {
    genre: currentGenreParam,
    type: currentType,
    year: currentYear,
    status: currentStatus,
    source: currentSource,
    page: currentPage
  });
}

function renderSkeletons(count = 12) {
  return Array(count).fill(0).map(() => `<div class="skeleton-card" style="aspect-ratio: 2/3;"></div>`).join('');
}

async function loadCatalog(container, filters) {
  const gridMount = container.querySelector('#directory-grid-mount');
  const infoMount = container.querySelector('#dir-results-info');
  const pagMount = container.querySelector('#directory-pagination-mount');

  try {
    const res = await Api.getDirectory(filters);
    const items = res.items || [];

    if (items.length === 0) {
      infoMount.innerHTML = `0 animes encontrados`;
      gridMount.innerHTML = `
        <div style="grid-column: 1/-1; text-align: center; padding: 60px 20px; color: var(--text-muted);">
          <div style="font-size: 2.8rem; margin-bottom: 12px;">🔍</div>
          <h3 style="color: #fff; margin-bottom: 8px;">No se encontraron resultados</h3>
          <p style="color: var(--text-dim); margin-bottom: 20px;">
            Intenta cambiar o suavizar los filtros seleccionados para ver más animes disponibles.
          </p>
          <button class="btn btn-primary" onclick="window.location.hash='#/directory'">
            Restablecer filtros
          </button>
        </div>
      `;
      pagMount.innerHTML = '';
      return;
    }

    infoMount.innerHTML = `Mostrando <strong>${items.length}</strong> animes (Página ${filters.page})`;

    // Render Anime Cards
    gridMount.innerHTML = items.map(item => {
      const fallbackSvg = getDefaultPoster(item.title, item.source);
      return `
        <div class="anime-card">
          <a href="#/anime?url=${encodeURIComponent(item.url)}" class="anime-card-media" style="aspect-ratio: 2/3;" title="${escapeHtml(item.title)}">
            <img 
              src="${escapeHtml(item.image || fallbackSvg)}" 
              alt="${escapeHtml(item.title)}" 
              class="anime-card-img" 
              loading="lazy"
              onerror="this.onerror=null; this.src='${fallbackSvg}';"
            />
            <div class="play-overlay">
              <div class="play-btn-circle">${Icons.play}</div>
            </div>

            <!-- Top Left: Source Badge -->
            <div class="card-badge-top-left">
              <span class="badge ${getSourceBadgeClass(item.source)}">
                ${escapeHtml(item.source)}
              </span>
            </div>

            <!-- Top Right: Status Badge -->
            ${item.status ? `
              <div style="position: absolute; top: 10px; right: 10px; z-index: 5;">
                <span class="badge badge-status" style="font-size: 0.72rem; padding: 2px 7px;">
                  ${escapeHtml(item.status)}
                </span>
              </div>
            ` : ''}

            <!-- Bottom Left: Type Badge -->
            ${item.type ? `
              <div style="position: absolute; bottom: 10px; left: 10px; z-index: 5;">
                <span class="badge badge-episode" style="font-size: 0.72rem; padding: 2px 7px;">
                  ${escapeHtml(item.type)}
                </span>
              </div>
            ` : ''}

            <!-- Bottom Right: Year Badge if available -->
            ${item.year ? `
              <div class="card-badge-bottom-right">
                <span class="badge" style="background: rgba(15, 23, 42, 0.85); color: #cbd5e1; font-size: 0.72rem; border: 1px solid rgba(255,255,255,0.1);">
                  ${escapeHtml(item.year)}
                </span>
              </div>
            ` : ''}
          </a>

          <div class="anime-card-info">
            <a href="#/anime?url=${encodeURIComponent(item.url)}" class="anime-card-title" title="${escapeHtml(item.title)}">
              ${escapeHtml(item.title)}
            </a>
            <div class="anime-card-meta">
              <span style="color: var(--accent-primary); font-size: 0.82rem;">${escapeHtml(item.type || 'Anime')}</span>
              <span style="color: var(--text-dim); font-size: 0.82rem;">${escapeHtml(item.status || '')}</span>
            </div>
          </div>
        </div>
      `;
    }).join('');

    // Render Pagination Controls
    const prevPage = filters.page > 1 ? filters.page - 1 : null;
    const nextPage = res.has_next ? filters.page + 1 : null;

    pagMount.innerHTML = `
      <div style="display: flex; justify-content: center; align-items: center; gap: 14px;">
        <button 
          id="btn-dir-prev" 
          class="btn btn-secondary" 
          ${!prevPage ? 'disabled style="opacity: 0.4; cursor: not-allowed;"' : ''}
        >
          ${Icons.arrowLeft} Página Anterior
        </button>

        <span style="font-weight: 600; color: #fff; padding: 6px 14px; background: var(--card-bg); border: 1px solid var(--border-color); border-radius: var(--radius-sm); font-size: 0.9rem;">
          Página ${filters.page}
        </span>

        <button 
          id="btn-dir-next" 
          class="btn btn-primary" 
          ${!nextPage ? 'disabled style="opacity: 0.4; cursor: not-allowed;"' : ''}
        >
          Página Siguiente ${Icons.arrowRight}
        </button>
      </div>
    `;

    // Pagination Click Listeners
    const prevBtn = pagMount.querySelector('#btn-dir-prev');
    const nextBtn = pagMount.querySelector('#btn-dir-next');

    if (prevBtn && prevPage) {
      prevBtn.addEventListener('click', () => {
        navigateToPage(filters, prevPage);
      });
    }

    if (nextBtn && nextPage) {
      nextBtn.addEventListener('click', () => {
        navigateToPage(filters, nextPage);
      });
    }

  } catch (err) {
    gridMount.innerHTML = `
      <div class="alert-banner error" style="grid-column: 1/-1;">
        <div>
          <strong>Error al cargar el directorio:</strong> ${escapeHtml(err.message)}
        </div>
        <button class="btn btn-secondary" onclick="window.location.reload()">Reintentar</button>
      </div>
    `;
    infoMount.innerHTML = `Error de conexión`;
  }
}

function navigateToPage(filters, page) {
  const q = new URLSearchParams();
  if (filters.genre && filters.genre !== 'all') q.set('genre', filters.genre);
  if (filters.type && filters.type !== 'all') q.set('type', filters.type);
  if (filters.year && filters.year !== 'all') q.set('year', filters.year);
  if (filters.status && filters.status !== 'all') q.set('status', filters.status);
  if (filters.source && filters.source !== 'all') q.set('source', filters.source);
  if (page > 1) q.set('page', String(page));

  const qs = q.toString();
  window.location.hash = qs ? `#/directory?${qs}` : `#/directory`;
}
