/**
 * Anime Library & Tracking View Component (Mi Lista / Importación MAL)
 * Manages anime watchlist: Viendo, Visto, Pendiente, Pausado, Abandonado.
 * Supports native XML/XML.GZ MyAnimeList import, JSON backup export, and one-click streaming search.
 */
import { Storage } from '../storage.js?v=3.0';
import { Api } from '../api.js?v=3.0';
import { Icons, escapeHtml, showToast, getDefaultPoster, resolveAnimeCover } from '../utils.js?v=3.0';

const STATUS_LABELS = {
  all: 'Todos',
  watching: 'Viendo',
  completed: 'Vistos',
  plan_to_watch: 'Pendientes',
  on_hold: 'Pausados',
  dropped: 'Abandonados'
};

const STATUS_COLORS = {
  watching: '#10b981',    // Emerald
  completed: '#6366f1',   // Indigo
  plan_to_watch: '#f59e0b',// Amber
  on_hold: '#8b5cf6',     // Purple
  dropped: '#ef4444'      // Red
};

const ITEMS_PER_PAGE = 24;

export async function renderLibrary(container, params = new URLSearchParams()) {
  let activeTab = params.get('status') || 'all';
  let searchQuery = '';
  let sortBy = 'recent';
  let currentPage = 1;

  container.innerHTML = `
    <div class="library-view section">
      <!-- Library Header -->
      <div class="library-header">
        <div>
          <h1 class="section-title" style="font-size: 1.85rem; margin-bottom: 6px;">
            ${Icons.bookmark} Mi Lista de Anime
          </h1>
          <p style="color: var(--text-muted); font-size: 0.95rem;">
            Controla tu registro de animes: en emisión, completados, pausados, abandonados y por ver. Sincronizado localmente y con importación directa desde MyAnimeList.
          </p>
        </div>

        <div style="display: flex; gap: 10px; flex-wrap: wrap;">
          <button id="btn-open-import" class="btn btn-primary" style="display: flex; align-items: center; gap: 8px;">
            ${Icons.upload} Importar de MyAnimeList
          </button>
          <button id="btn-export-backup" class="btn btn-outline" style="display: flex; align-items: center; gap: 8px;" title="Descargar copia de seguridad en JSON">
            ${Icons.download} Exportar Copia
          </button>
        </div>
      </div>

      <!-- Quick Stats Banner -->
      <div class="library-stats-bar" id="library-stats-mount"></div>

      <!-- Controls & Filter Toolbar -->
      <div class="library-controls-card">
        <!-- Tabs -->
        <div class="library-tabs" id="library-status-tabs">
          <button class="lib-tab ${activeTab === 'all' ? 'active' : ''}" data-status="all">
            Todos <span class="lib-count" id="count-all">0</span>
          </button>
          <button class="lib-tab ${activeTab === 'watching' ? 'active' : ''}" data-status="watching">
            Viendo <span class="lib-count" id="count-watching">0</span>
          </button>
          <button class="lib-tab ${activeTab === 'completed' ? 'active' : ''}" data-status="completed">
            Vistos <span class="lib-count" id="count-completed">0</span>
          </button>
          <button class="lib-tab ${activeTab === 'plan_to_watch' ? 'active' : ''}" data-status="plan_to_watch">
            Pendientes <span class="lib-count" id="count-plan_to_watch">0</span>
          </button>
          <button class="lib-tab ${activeTab === 'on_hold' ? 'active' : ''}" data-status="on_hold">
            Pausados <span class="lib-count" id="count-on_hold">0</span>
          </button>
          <button class="lib-tab ${activeTab === 'dropped' ? 'active' : ''}" data-status="dropped">
            Abandonados <span class="lib-count" id="count-dropped">0</span>
          </button>
        </div>

        <!-- Search and Sort Bar -->
        <div class="library-filter-row">
          <div style="position: relative; flex: 1; min-width: 240px;">
            <input 
              type="text" 
              id="lib-search-input" 
              class="search-input" 
              placeholder="Buscar anime en tu lista por título..." 
              style="padding-left: 38px; width: 100%;"
            />
            <span style="position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: var(--text-dim);">
              ${Icons.search}
            </span>
          </div>

          <div style="display: flex; align-items: center; gap: 10px;">
            <label style="font-size: 0.85rem; color: var(--text-dim); white-space: nowrap;">Ordenar por:</label>
            <select id="lib-sort-select" class="directory-select" style="padding: 8px 12px;">
              <option value="recent">Añadidos recientemente</option>
              <option value="score">Mayor puntuación (★)</option>
              <option value="title_asc">Título (A - Z)</option>
              <option value="progress">Más episodios vistos</option>
            </select>
            <button id="btn-clear-all" class="btn btn-outline" style="color: var(--danger); border-color: rgba(239, 68, 68, 0.4); padding: 8px 12px;" title="Vaciar toda la lista">
              ${Icons.trash}
            </button>
          </div>
        </div>
      </div>

      <!-- Library Grid Mount -->
      <div id="library-grid-mount" class="anime-grid"></div>

      <!-- Pagination Mount -->
      <div id="library-pagination-mount" class="directory-pagination-bar"></div>

      <!-- Import Modal Container -->
      <div id="import-modal-mount"></div>
    </div>
  `;

  // Update tabs, stats, and grid
  function refreshView() {
    const allItems = Storage.getLibrary();
    const stats = Storage.getLibraryStats();

    // Update Counts in UI
    container.querySelector('#count-all').textContent = stats.total;
    container.querySelector('#count-watching').textContent = stats.watching;
    container.querySelector('#count-completed').textContent = stats.completed;
    container.querySelector('#count-plan_to_watch').textContent = stats.plan_to_watch;
    container.querySelector('#count-on_hold').textContent = stats.on_hold;
    container.querySelector('#count-dropped').textContent = stats.dropped;

    // Filter Items
    let filtered = allItems;
    if (activeTab !== 'all') {
      filtered = filtered.filter(item => item.status === activeTab);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      filtered = filtered.filter(item => (item.title || '').toLowerCase().includes(q));
    }

    // Sort Items
    if (sortBy === 'score') {
      filtered.sort((a, b) => (b.score || 0) - (a.score || 0));
    } else if (sortBy === 'title_asc') {
      filtered.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
    } else if (sortBy === 'progress') {
      filtered.sort((a, b) => (b.watchedEpisodes || 0) - (a.watchedEpisodes || 0));
    } else {
      filtered.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    }

    renderGrid(filtered, currentPage);
  }

  function renderGrid(items, page) {
    const grid = container.querySelector('#library-grid-mount');
    const pagination = container.querySelector('#library-pagination-mount');

    if (items.length === 0) {
      grid.innerHTML = `
        <div style="grid-column: 1/-1; text-align: center; padding: 60px 20px; color: var(--text-muted);">
          <div style="font-size: 3rem; margin-bottom: 12px;">📑</div>
          <h3 style="color: #fff; margin-bottom: 8px;">No hay animes en esta sección</h3>
          <p style="color: var(--text-dim); margin-bottom: 20px;">
            ${searchQuery ? 'No se encontraron animes que coincidan con la búsqueda.' : 'Importa tu lista de MyAnimeList o añade animes desde el catálogo.'}
          </p>
          <button class="btn btn-primary" id="btn-empty-import">
            ${Icons.upload} Importar archivo MyAnimeList (.xml.gz)
          </button>
        </div>
      `;
      pagination.innerHTML = '';
      const emptyBtn = grid.querySelector('#btn-empty-import');
      if (emptyBtn) emptyBtn.addEventListener('click', () => openImportModal());
      return;
    }

    // Pagination slice
    const totalPages = Math.ceil(items.length / ITEMS_PER_PAGE);
    if (page > totalPages) page = totalPages;
    const startIndex = (page - 1) * ITEMS_PER_PAGE;
    const pageItems = items.slice(startIndex, startIndex + ITEMS_PER_PAGE);

    grid.innerHTML = pageItems.map(item => {
      const statusColor = STATUS_COLORS[item.status] || '#6366f1';
      const defaultPoster = getDefaultPoster(item.title, 'MyAnimeList');
      const coverUrl = resolveAnimeCover({ image: item.image, title: item.title });

      return `
        <div class="anime-card lib-card" data-id="${escapeHtml(String(item.id))}">
          <div class="anime-card-media poster" style="position: relative;">
            <img 
              src="${escapeHtml(coverUrl)}" 
              alt="${escapeHtml(item.title)}" 
              class="anime-card-img" 
              loading="lazy" 
              onerror="this.onerror=null; this.src='${defaultPoster}';"
            />

            <!-- Status Indicator Ribbon -->
            <div style="position: absolute; top: 10px; left: 10px; z-index: 4;">
              <span class="lib-status-pill" style="background: ${statusColor}; color: #fff;">
                ${escapeHtml(STATUS_LABELS[item.status] || item.statusLabel || 'En lista')}
              </span>
            </div>

            <!-- Score Badge if rated -->
            ${item.score > 0 ? `
              <div style="position: absolute; top: 10px; right: 10px; z-index: 4;">
                <span class="lib-score-badge">
                  ${Icons.star} ${item.score}/10
                </span>
              </div>
            ` : ''}

            <!-- Type Badge -->
            <div style="position: absolute; bottom: 10px; left: 10px; z-index: 4;">
              <span class="badge" style="background: rgba(15, 23, 42, 0.85); color: #cbd5e1; font-size: 0.72rem; border: 1px solid rgba(255,255,255,0.1);">
                ${escapeHtml(item.type || 'TV')}
              </span>
            </div>
          </div>

          <div class="anime-card-info" style="gap: 8px;">
            <h4 class="anime-card-title" title="${escapeHtml(item.title)}" style="font-size: 0.92rem; font-weight: 600; line-height: 1.3;">
              ${escapeHtml(item.title)}
            </h4>

            <!-- Progress & Episode Stepper -->
            <div class="lib-progress-row">
              <span style="font-size: 0.82rem; color: var(--text-dim);">Episodios:</span>
              <div class="lib-stepper">
                <button class="btn-stepper btn-sub-ep" data-id="${escapeHtml(String(item.id))}" title="Restar episodio">
                  ${Icons.minus}
                </button>
                <span class="lib-ep-display">
                  <strong>${item.watchedEpisodes}</strong> / ${item.totalEpisodes > 0 ? item.totalEpisodes : '?'}
                </span>
                <button class="btn-stepper btn-add-ep" data-id="${escapeHtml(String(item.id))}" title="Sumar episodio">
                  ${Icons.plus}
                </button>
              </div>
            </div>

            <!-- Status Changer Selector -->
            <div style="display: flex; gap: 6px; align-items: center; margin-top: 2px;">
              <select class="directory-select lib-status-select" data-id="${escapeHtml(String(item.id))}" style="padding: 5px 8px; font-size: 0.8rem; flex: 1;">
                <option value="watching" ${item.status === 'watching' ? 'selected' : ''}>Viendo</option>
                <option value="completed" ${item.status === 'completed' ? 'selected' : ''}>Visto</option>
                <option value="plan_to_watch" ${item.status === 'plan_to_watch' ? 'selected' : ''}>Pendiente</option>
                <option value="on_hold" ${item.status === 'on_hold' ? 'selected' : ''}>Pausado</option>
                <option value="dropped" ${item.status === 'dropped' ? 'selected' : ''}>Abandonado</option>
              </select>

              <button class="btn-icon btn-del-item" data-id="${escapeHtml(String(item.id))}" title="Eliminar de mi lista" style="color: var(--danger); padding: 5px 7px;">
                ${Icons.trash}
              </button>
            </div>

            <!-- One-Click Stream Search Button -->
            <a 
              href="#/search?q=${encodeURIComponent(item.title)}" 
              class="btn btn-secondary" 
              style="width: 100%; font-size: 0.82rem; padding: 6px 10px; margin-top: 4px; justify-content: center; gap: 6px;"
              title="Buscar en AnimeAV1, JKAnime y TioAnime para reproducir"
            >
              ${Icons.play} Ver en AnimeStream
            </a>
          </div>
        </div>
      `;
    }).join('');

    // Attach Stepper & Status Change Listeners
    grid.querySelectorAll('.btn-add-ep').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const id = btn.dataset.id;
        const it = items.find(i => String(i.id) === id);
        if (it) {
          const max = it.totalEpisodes > 0 ? it.totalEpisodes : 9999;
          if (it.watchedEpisodes < max) {
            it.watchedEpisodes++;
            if (it.totalEpisodes > 0 && it.watchedEpisodes === it.totalEpisodes) {
              it.status = 'completed';
              it.statusLabel = 'Visto';
            }
            Storage.saveLibraryItem(it);
            refreshView();
          }
        }
      });
    });

    grid.querySelectorAll('.btn-sub-ep').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const id = btn.dataset.id;
        const it = items.find(i => String(i.id) === id);
        if (it && it.watchedEpisodes > 0) {
          it.watchedEpisodes--;
          Storage.saveLibraryItem(it);
          refreshView();
        }
      });
    });

    grid.querySelectorAll('.lib-status-select').forEach(sel => {
      sel.addEventListener('change', () => {
        const id = sel.dataset.id;
        const it = items.find(i => String(i.id) === id);
        if (it) {
          it.status = sel.value;
          it.statusLabel = STATUS_LABELS[sel.value] || 'En lista';
          Storage.saveLibraryItem(it);
          refreshView();
          showToast(`Estado cambiado a "${it.statusLabel}"`, 'success');
        }
      });
    });

    grid.querySelectorAll('.btn-del-item').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        const it = items.find(i => String(i.id) === id);
        if (it && confirm(`¿Eliminar "${it.title}" de tu lista?`)) {
          Storage.removeLibraryItem(id);
          refreshView();
          showToast(`Eliminado de tu lista`, 'info');
        }
      });
    });

    // Render Pagination Bar
    if (totalPages > 1) {
      pagination.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: center; gap: 12px;">
          <button id="btn-lib-prev" class="btn btn-secondary" ${page <= 1 ? 'disabled style="opacity: 0.4; cursor: not-allowed;"' : ''}>
            ${Icons.arrowLeft} Anterior
          </button>
          <span style="font-size: 0.9rem; color: #fff; padding: 6px 14px; background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-sm);">
            Página ${page} de ${totalPages} (${items.length} animes)
          </span>
          <button id="btn-lib-next" class="btn btn-primary" ${page >= totalPages ? 'disabled style="opacity: 0.4; cursor: not-allowed;"' : ''}>
            Siguiente ${Icons.arrowRight}
          </button>
        </div>
      `;

      const prevBtn = pagination.querySelector('#btn-lib-prev');
      const nextBtn = pagination.querySelector('#btn-lib-next');
      if (prevBtn && page > 1) {
        prevBtn.addEventListener('click', () => {
          currentPage = page - 1;
          renderGrid(items, currentPage);
          window.scrollTo({ top: 200, behavior: 'smooth' });
        });
      }
      if (nextBtn && page < totalPages) {
        nextBtn.addEventListener('click', () => {
          currentPage = page + 1;
          renderGrid(items, currentPage);
          window.scrollTo({ top: 200, behavior: 'smooth' });
        });
      }
    } else {
      pagination.innerHTML = '';
    }
  }

  // Attach Tab Clicks
  const tabBtns = container.querySelectorAll('.lib-tab');
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      tabBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeTab = btn.dataset.status;
      currentPage = 1;
      refreshView();
    });
  });

  // Attach Search Input
  const searchInput = container.querySelector('#lib-search-input');
  searchInput.addEventListener('input', (e) => {
    searchQuery = e.target.value;
    currentPage = 1;
    refreshView();
  });

  // Attach Sort Selector
  const sortSelect = container.querySelector('#lib-sort-select');
  sortSelect.addEventListener('change', (e) => {
    sortBy = e.target.value;
    currentPage = 1;
    refreshView();
  });

  // Clear All Button
  const clearAllBtn = container.querySelector('#btn-clear-all');
  clearAllBtn.addEventListener('click', () => {
    const list = Storage.getLibrary();
    if (list.length === 0) return;
    if (confirm(`¿Estás seguro de que deseas vaciar toda tu biblioteca (${list.length} animes)? Esta acción no se puede deshacer.`)) {
      Storage.clearLibrary();
      currentPage = 1;
      refreshView();
      showToast('Biblioteca vaciada con éxito', 'info');
    }
  });

  // Export Backup (JSON)
  const exportBtn = container.querySelector('#btn-export-backup');
  exportBtn.addEventListener('click', () => {
    const data = Storage.getLibrary();
    if (data.length === 0) {
      showToast('No tienes animes en tu lista para exportar', 'error');
      return;
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `animestream_library_backup_${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast(`Exportados ${data.length} animes en archivo JSON`, 'success');
  });

  // Open Import Modal
  const openImportBtn = container.querySelector('#btn-open-import');
  openImportBtn.addEventListener('click', () => openImportModal());

  async function openImportModal() {
    const modalMount = container.querySelector('#import-modal-mount');
    
    // Check for auto-detected file in local Downloads
    let localDetected = null;
    try {
      const checkRes = await Api.detectLocalMalFile();
      if (checkRes && checkRes.found) {
        localDetected = checkRes;
      }
    } catch (e) {
      // Local check optional
    }

    modalMount.innerHTML = `
      <div class="modal-overlay" id="import-modal-backdrop">
        <div class="modal-card">
          <div class="modal-header">
            <h3 style="font-size: 1.25rem; font-weight: 700; color: #fff; display: flex; align-items: center; gap: 8px;">
              ${Icons.upload} Importar desde MyAnimeList
            </h3>
            <button class="btn-icon" id="btn-close-modal" style="font-size: 1.2rem; color: var(--text-dim);">&times;</button>
          </div>

          <div class="modal-body">
            <!-- 1. Auto-detected File Banner if present -->
            ${localDetected ? `
              <div class="auto-detect-card">
                <div style="display: flex; align-items: center; gap: 12px;">
                  <div style="font-size: 1.8rem;">⚡</div>
                  <div style="flex: 1;">
                    <strong style="color: #10b981; font-size: 0.95rem;">¡Archivo detectado en Descargas!</strong>
                    <p style="color: #cbd5e1; font-size: 0.85rem; margin-top: 2px;">
                      <strong>${escapeHtml(localDetected.filename)}</strong> — Usuario <strong>${escapeHtml(localDetected.username)}</strong> (${localDetected.total} animes)
                    </p>
                  </div>
                </div>
                <button id="btn-auto-import" class="btn btn-primary" style="margin-top: 10px; width: 100%; justify-content: center;">
                  ${Icons.check} Importar este archivo ahora (${localDetected.total} animes)
                </button>
              </div>
            ` : ''}

            <!-- 2. Manual Dropzone -->
            <div style="margin-top: ${localDetected ? '16px' : '0'};">
              <label class="filter-label" style="margin-bottom: 8px; display: block;">
                O selecciona tu archivo de MyAnimeList (.xml.gz o .xml)
              </label>
              
              <div class="dropzone" id="mal-dropzone">
                <div style="font-size: 2.2rem; margin-bottom: 8px;">📂</div>
                <p style="color: #fff; font-weight: 600; font-size: 0.95rem; margin-bottom: 4px;">
                  Haz clic aquí o arrastra tu archivo de MyAnimeList
                </p>
                <p style="color: var(--text-dim); font-size: 0.82rem;">
                  Soporta archivos <strong>.xml.gz</strong> y <strong>.xml</strong> descargados de MyAnimeList
                </p>
                <input type="file" id="mal-file-input" accept=".xml,.gz" style="display: none;" />
              </div>
            </div>

            <!-- Import Mode Selection -->
            <div style="margin-top: 16px; background: rgba(255,255,255,0.03); border: 1px solid var(--border-color); border-radius: var(--radius-sm); padding: 12px;">
              <label class="filter-label" style="margin-bottom: 8px; display: block;">Modo de Importación</label>
              <div style="display: flex; flex-direction: column; gap: 8px;">
                <label style="display: flex; align-items: center; gap: 8px; font-size: 0.88rem; color: #fff; cursor: pointer;">
                  <input type="radio" name="import_mode" value="replace" checked />
                  <span><strong>Reemplazar mi lista</strong> (recomendado para cargar tu catálogo completo de MyAnimeList)</span>
                </label>
                <label style="display: flex; align-items: center; gap: 8px; font-size: 0.88rem; color: var(--text-muted); cursor: pointer;">
                  <input type="radio" name="import_mode" value="merge" />
                  <span><strong>Combinar con mi lista actual</strong> (mantener animes existentes y agregar los nuevos)</span>
                </label>
              </div>
            </div>

            <!-- Status Indicator / Spinner during processing -->
            <div id="import-status-box" style="display: none; margin-top: 14px; text-align: center; padding: 12px;">
              <div class="spinner" style="margin: 0 auto 8px auto;"></div>
              <p id="import-status-text" style="color: var(--text-dim); font-size: 0.88rem;">Procesando catálogo...</p>
            </div>
          </div>
        </div>
      </div>
    `;

    const backdrop = modalMount.querySelector('#import-modal-backdrop');
    const closeBtn = modalMount.querySelector('#btn-close-modal');
    const dropzone = modalMount.querySelector('#mal-dropzone');
    const fileInput = modalMount.querySelector('#mal-file-input');
    const autoBtn = modalMount.querySelector('#btn-auto-import');
    const statusBox = modalMount.querySelector('#import-status-box');
    const statusText = modalMount.querySelector('#import-status-text');

    function closeModal() {
      modalMount.innerHTML = '';
    }

    closeBtn.addEventListener('click', closeModal);
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) closeModal();
    });

    // Auto Import Button Handler
    if (autoBtn && localDetected) {
      autoBtn.addEventListener('click', async () => {
        const mode = modalMount.querySelector('input[name="import_mode"]:checked').value;
        statusBox.style.display = 'block';
        statusText.textContent = `Importando ${localDetected.total} animes de ${localDetected.username}...`;
        autoBtn.disabled = true;

        setTimeout(() => {
          const count = Storage.importLibrary(localDetected.animes, mode);
          closeModal();
          refreshView();
          showToast(`¡Éxito! Se han importado ${count} animes desde MyAnimeList.`, 'success', 5000);
        }, 300);
      });
    }

    // Dropzone Handlers
    dropzone.addEventListener('click', () => fileInput.click());
    dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone.classList.add('dragover');
    });
    dropzone.addEventListener('dragleave', () => {
      dropzone.classList.remove('dragover');
    });
    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.classList.remove('dragover');
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        handleFileUpload(e.dataTransfer.files[0]);
      }
    });

    fileInput.addEventListener('change', () => {
      if (fileInput.files && fileInput.files.length > 0) {
        handleFileUpload(fileInput.files[0]);
      }
    });

    async function handleFileUpload(file) {
      const mode = modalMount.querySelector('input[name="import_mode"]:checked').value;
      statusBox.style.display = 'block';
      statusText.textContent = `Leyendo y procesando ${file.name}...`;

      try {
        let parsed = null;
        
        // 1. Try in-browser native decompression and XML parsing (ultra-fast, zero-network)
        try {
          let xmlText = '';
          if (file.name.endsWith('.gz') || file.type.includes('gzip')) {
            if (typeof DecompressionStream !== 'undefined') {
              const ds = new DecompressionStream('gzip');
              const decompressed = file.stream().pipeThrough(ds);
              const resp = new Response(decompressed);
              xmlText = await resp.text();
            }
          } else {
            xmlText = await file.text();
          }

          if (xmlText && xmlText.includes('<anime>')) {
            const parser = new DOMParser();
            const doc = parser.parseFromString(xmlText, 'text/xml');
            const userNode = doc.querySelector('myinfo > user_name');
            const userName = (userNode && userNode.textContent) ? userNode.textContent : 'Usuario';
            const animeNodes = doc.querySelectorAll('anime');

            const statusMapping = {
              'Watching': { status: 'watching', label: 'Viendo' },
              '1': { status: 'watching', label: 'Viendo' },
              'Completed': { status: 'completed', label: 'Visto' },
              '2': { status: 'completed', label: 'Visto' },
              'On-Hold': { status: 'on_hold', label: 'Pausado' },
              '3': { status: 'on_hold', label: 'Pausado' },
              'Dropped': { status: 'dropped', label: 'Abandonado' },
              '4': { status: 'dropped', label: 'Abandonado' },
              'Plan to Watch': { status: 'plan_to_watch', label: 'Pendiente' },
              '6': { status: 'plan_to_watch', label: 'Pendiente' }
            };

            const animes = [];
            animeNodes.forEach(node => {
              const titleNode = node.querySelector('series_title');
              const title = (titleNode && titleNode.textContent) ? titleNode.textContent.trim() : null;
              if (!title) return;
              const statusNode = node.querySelector('my_status');
              const rawStatus = (statusNode && statusNode.textContent) ? statusNode.textContent.trim() : 'Plan to Watch';
              const map = statusMapping[rawStatus] || { status: 'plan_to_watch', label: 'Pendiente' };

              const idNode = node.querySelector('series_animedb_id');
              const typeNode = node.querySelector('series_type');
              const epNode = node.querySelector('series_episodes');
              const watchedNode = node.querySelector('my_watched_episodes');
              const scoreNode = node.querySelector('my_score');

              animes.push({
                id: (idNode && idNode.textContent) ? idNode.textContent.trim() : '',
                title,
                type: (typeNode && typeNode.textContent) ? typeNode.textContent.trim() : 'TV',
                totalEpisodes: parseInt((epNode && epNode.textContent) || '0', 10) || 0,
                watchedEpisodes: parseInt((watchedNode && watchedNode.textContent) || '0', 10) || 0,
                score: parseInt((scoreNode && scoreNode.textContent) || '0', 10) || 0,
                status: map.status,
                statusLabel: map.label,
                updatedAt: Date.now()
              });
            });

            if (animes.length > 0) {
              parsed = { username: userName, total: animes.length, animes };
            }
          }
        } catch (clientErr) {
          console.warn('Client-side parse fallback to backend:', clientErr);
        }

        // 2. Fallback to backend parser if client-side parse was skipped
        if (!parsed) {
          parsed = await Api.parseMalUpload(file);
        }

        if (!parsed || !parsed.animes || parsed.animes.length === 0) {
          throw new Error('No se encontraron registros de anime válidos en el archivo.');
        }

        const count = Storage.importLibrary(parsed.animes, mode);
        closeModal();
        refreshView();
        showToast(`¡Éxito! Se importaron ${count} animes de ${parsed.username || 'MyAnimeList'}.`, 'success', 5000);
      } catch (err) {
        statusBox.style.display = 'none';
        alert(`Error al procesar el archivo: ${err.message}`);
      }
    }
  }

  // Initial load
  refreshView();
}
