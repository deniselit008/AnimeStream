/**
 * Anime Detail View Component
 * Technical sheet, synopsis, genres, add to favorites, franchise relations (MAL), and searchable/invertible episode list.
 */
import { Api } from '../api.js?v=3.0';
import { Storage } from '../storage.js?v=3.0';
import { Icons, escapeHtml, showToast, getSourceBadgeClass, getRelationBadgeClass, fixEncoding, slugifyGenre } from '../utils.js?v=3.0';

export async function renderAnime(container, animeUrl) {
  container.innerHTML = `
    <div class="anime-detail-container">
      <div style="display: flex; justify-content: center; padding: 80px 0;">
        <div class="spinner"></div>
      </div>
    </div>
  `;

  try {
    const anime = await Api.getAnime(animeUrl);
    if (anime) {
      anime.title = fixEncoding(anime.title);
      anime.synopsis = fixEncoding(anime.synopsis);
      if (anime.genres) {
        anime.genres = anime.genres.map(g => fixEncoding(g));
      }
    }
    let isFav = Storage.isFavorite(anime.url);
    let isAscending = true;
    let allEpisodes = anime.episodes || [];
    let currentRelations = anime.relations || [];
    let activeRelationFilter = 'all';

    function filterRelations(items, filter) {
      if (filter === 'sequel_prequel') {
        return items.filter(it => {
          const raw = (it.raw_relation || '').toLowerCase();
          return raw.includes('sequel') || raw.includes('prequel') || raw.includes('parent');
        });
      } else if (filter === 'movies') {
        return items.filter(it => {
          const raw = (it.raw_relation || '').toLowerCase();
          const t = (it.type || '').toLowerCase();
          return raw.includes('summary') || t.includes('película') || t.includes('movie');
        });
      } else if (filter === 'spin_side') {
        return items.filter(it => {
          const raw = (it.raw_relation || '').toLowerCase();
          const t = (it.type || '').toLowerCase();
          return raw.includes('spin') || raw.includes('side') || t.includes('ova') || t.includes('special');
        });
      } else if (filter === 'other') {
        return items.filter(it => {
          const raw = (it.raw_relation || '').toLowerCase();
          return raw.includes('other') || raw.includes('character') || raw.includes('alternative');
        });
      }
      return items;
    }

    function buildRelationsHtml(items, filter = 'all') {
      if (!items || items.length === 0) {
        return '';
      }

      const filtered = filterRelations(items, filter);

      // Check available categories to show filter pills only when relevant
      const hasSequelPrequel = items.some(it => {
        const raw = (it.raw_relation || '').toLowerCase();
        return raw.includes('sequel') || raw.includes('prequel') || raw.includes('parent');
      });
      const hasMovies = items.some(it => {
        const raw = (it.raw_relation || '').toLowerCase();
        const t = (it.type || '').toLowerCase();
        return raw.includes('summary') || t.includes('película') || t.includes('movie');
      });
      const hasSpinSide = items.some(it => {
        const raw = (it.raw_relation || '').toLowerCase();
        const t = (it.type || '').toLowerCase();
        return raw.includes('spin') || raw.includes('side') || t.includes('ova') || t.includes('special');
      });

      return `
        <section class="relations-section" id="anime-relations-section">
          <div class="relations-header">
            <div class="relations-title-group">
              <h2>
                ${Icons.link} Franquicia y Relacionados
                <span class="badge badge-episode" style="font-size: 0.78rem;">${items.length}</span>
              </h2>
              <p>Secuelas, precuelas, películas y obras vinculadas en MyAnimeList</p>
            </div>

            ${items.length > 4 ? `
              <div class="relations-filters" id="relations-filter-pills">
                <button class="btn-pill ${filter === 'all' ? 'active' : ''}" data-rel-filter="all">
                  Todos (${items.length})
                </button>
                ${hasSequelPrequel ? `
                  <button class="btn-pill ${filter === 'sequel_prequel' ? 'active' : ''}" data-rel-filter="sequel_prequel">
                    Secuelas & Precuelas
                  </button>
                ` : ''}
                ${hasMovies ? `
                  <button class="btn-pill ${filter === 'movies' ? 'active' : ''}" data-rel-filter="movies">
                    Películas & Resúmenes
                  </button>
                ` : ''}
                ${hasSpinSide ? `
                  <button class="btn-pill ${filter === 'spin_side' ? 'active' : ''}" data-rel-filter="spin_side">
                    OVAs & Spin-offs
                  </button>
                ` : ''}
              </div>
            ` : ''}
          </div>

          <div class="relations-grid">
            ${filtered.length > 0 ? filtered.map(rel => {
              const cleanSearchTerm = rel.title.replace(/\s*\(TV\)|\s*\(Movie\)|\s*\(OVA\)/gi, '').trim();
              const searchHref = `#/search?q=${encodeURIComponent(cleanSearchTerm)}`;
              const badgeClass = getRelationBadgeClass(rel.relation);

              return `
                <a href="${searchHref}" class="relation-card" title="Buscar y ver '${escapeHtml(rel.title)}' en AnimeStream">
                  <div class="relation-media">
                    ${rel.image ? `
                      <img 
                        src="${escapeHtml(rel.image)}" 
                        alt="${escapeHtml(rel.title)}" 
                        class="relation-img" 
                        loading="lazy" 
                        referrerpolicy="no-referrer"
                        onerror="if (!this.dataset.retried && this.src && !this.src.includes('/api/image-proxy')) { this.dataset.retried='1'; this.src='/api/image-proxy?url=' + encodeURIComponent('${escapeHtml(rel.image)}'); } else { this.style.display='none'; if (this.nextElementSibling) this.nextElementSibling.style.display='flex'; }"
                      />
                      <div class="relation-fallback-cover" style="display: none;">
                        <span style="font-size: 1.8rem; margin-bottom: 4px;">🎬</span>
                        <span style="font-weight: 700; font-size: 0.8rem; color: #fff;">${escapeHtml(rel.relation)}</span>
                      </div>
                    ` : `
                      <div class="relation-fallback-cover">
                        <span style="font-size: 1.8rem; margin-bottom: 4px;">🎬</span>
                        <span style="font-weight: 700; font-size: 0.8rem; color: #fff;">${escapeHtml(rel.relation)}</span>
                      </div>
                    `}

                    <!-- Badges overlay -->
                    <div class="relation-badges-top">
                      <span class="badge ${badgeClass}" style="box-shadow: 0 2px 6px rgba(0,0,0,0.5);">
                        ${escapeHtml(rel.relation)}
                      </span>
                      ${rel.type ? `
                        <span class="relation-type-badge">${escapeHtml(rel.type)}</span>
                      ` : ''}
                    </div>
                  </div>

                  <div class="relation-body">
                    <div class="relation-card-name" title="${escapeHtml(rel.title)}">
                      ${escapeHtml(rel.title)}
                    </div>

                    <div class="relation-footer-actions">
                      <span class="relation-stream-btn">
                        ${Icons.search} Buscar
                      </span>

                      ${rel.mal_url ? `
                        <span 
                          class="relation-mal-link" 
                          data-mal-href="${escapeHtml(rel.mal_url)}"
                          title="Ver ficha oficial en MyAnimeList"
                        >
                          MAL ${Icons.external}
                        </span>
                      ` : ''}
                    </div>
                  </div>
                </a>
              `;
            }).join('') : `
              <div style="grid-column: 1/-1; text-align: center; padding: 30px; color: var(--text-dim);">
                No hay obras relacionadas en esta categoría.
              </div>
            `}
          </div>
        </section>
      `;
    }

    function buildHtml() {
      const fallbackPoster = 'https://via.placeholder.com/300x420/161f30/94a3b8?text=Poster';
      return `
        <!-- Detail Hero Header -->
        <div class="detail-hero">
          ${anime.backdrop || anime.image ? `
            <img src="${escapeHtml(anime.backdrop || anime.image)}" class="detail-backdrop" alt="Backdrop" />
          ` : ''}
          <div class="detail-gradient"></div>

          <div class="detail-container">
            <!-- Poster -->
            <div class="detail-poster-wrapper">
              <img 
                src="${escapeHtml(anime.image || fallbackPoster)}" 
                alt="${escapeHtml(anime.title)}" 
                class="detail-poster" 
                onerror="this.src='${fallbackPoster}'"
              />
            </div>

            <!-- Metadata Info -->
            <div class="detail-info">
              <div class="detail-badges">
                <span class="badge ${getSourceBadgeClass(anime.source)}">
                  ${escapeHtml(anime.source)}
                </span>
                <span class="badge badge-status ${anime.status === 'Finalizado' ? 'finalized' : ''}">
                  ${escapeHtml(anime.status || 'En emisión')}
                </span>
                <span class="badge badge-episode">
                  ${allEpisodes.length} Episodios
                </span>
              </div>

              <h1 class="detail-title">${escapeHtml(anime.title)}</h1>

              <!-- Genres / Categories -->
              ${anime.genres && anime.genres.length > 0 ? `
                <div class="detail-genres">
                  ${anime.genres.map(g => {
                    const cleanG = fixEncoding(g);
                    const genreSlug = slugifyGenre(cleanG);
                    return `
                      <a 
                        href="#/directory?genre=${encodeURIComponent(genreSlug)}" 
                        class="genre-tag clickable-genre" 
                        title="Ver animes de la categoría ${escapeHtml(cleanG)}"
                      >
                        ${escapeHtml(cleanG)}
                      </a>
                    `;
                  }).join('')}
                </div>
              ` : ''}

              <!-- Synopsis with intelligent clamping -->
              <div class="detail-synopsis-wrapper">
                <p class="detail-synopsis ${anime.synopsis && anime.synopsis.length > 280 ? 'is-clamped' : ''}" id="detail-synopsis-text">
                  ${escapeHtml(anime.synopsis || 'Sin descripción disponible.')}
                </p>
                ${anime.synopsis && anime.synopsis.length > 280 ? `
                  <button type="button" class="btn-toggle-synopsis" id="btn-toggle-synopsis" title="Expandir o contraer descripción">
                    <span id="synopsis-toggle-text">Leer más</span>
                    <span id="synopsis-toggle-icon">${Icons.chevronDown}</span>
                  </button>
                ` : ''}
              </div>

              <!-- Actions -->
              <div class="detail-actions">
                ${allEpisodes.length > 0 ? `
                  <a href="#/watch?url=${encodeURIComponent(allEpisodes[0].url)}" class="btn btn-primary">
                    ${Icons.play} Ver Episodio 1
                  </a>
                ` : ''}

                <!-- Favorite Toggle Button -->
                <button class="btn btn-secondary" id="btn-toggle-fav">
                  <span id="fav-icon">${isFav ? Icons.heartFilled : Icons.heart}</span>
                  <span id="fav-text">${isFav ? 'En Favoritos' : 'Añadir a Favoritos'}</span>
                </button>

                <!-- Library Status Tracker -->
                <div style="display: flex; align-items: center; gap: 8px; background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-sm); padding: 4px 10px;">
                  <span style="font-size: 0.82rem; color: var(--text-dim); display: flex; align-items: center; gap: 4px; white-space: nowrap;">
                    ${Icons.bookmark} Mi Lista:
                  </span>
                  <select id="select-lib-status" class="directory-select" style="padding: 4px 8px; font-size: 0.82rem; border: none; background: transparent;">
                    <option value="none">-- No en mi lista --</option>
                    <option value="watching">Viendo</option>
                    <option value="completed">Visto</option>
                    <option value="plan_to_watch">Pendiente</option>
                    <option value="on_hold">Pausado</option>
                    <option value="dropped">Abandonado</option>
                  </select>
                </div>

                <!-- Original Source Link -->
                <a href="${escapeHtml(anime.url)}" target="_blank" rel="noopener noreferrer" class="btn btn-outline" title="Ver en página oficial">
                  ${Icons.external} Abrir en ${escapeHtml(anime.source)}
                </a>
              </div>
            </div>
          </div>
        </div>

        <!-- Franchise & Related Anime Section Mount -->
        <div id="relations-mount">
          ${currentRelations && currentRelations.length > 0 
            ? buildRelationsHtml(currentRelations, activeRelationFilter)
            : `
              <div class="relations-section" style="padding: 16px 20px; opacity: 0.75;">
                <div style="display: flex; align-items: center; gap: 10px; font-size: 0.88rem; color: var(--text-dim);">
                  <div class="spinner" style="width: 16px; height: 16px; border-width: 2px;"></div>
                  <span>Buscando obras de la franquicia en MyAnimeList...</span>
                </div>
              </div>
            `}
        </div>

        <!-- Episodes List Section -->
        <section class="section">
          <div class="episodes-control-bar">
            <div style="display: flex; align-items: center; gap: 10px;">
              <h2 style="font-size: 1.25rem; font-weight: 700; color: #fff;">Lista de Capítulos</h2>
              <span class="badge badge-episode" id="episodes-count-badge">${allEpisodes.length}</span>
            </div>

            <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
              <!-- Quick Number Filter -->
              <input 
                type="text" 
                id="ep-filter-input" 
                class="ep-search-input" 
                placeholder="Filtrar por número (ej. 1, 24)..." 
              />
              
              <!-- Invert Order Button -->
              <button class="btn btn-outline" id="btn-invert-order" title="Invertir orden">
                ${Icons.sort} <span id="invert-label">Orden Ascendente</span>
              </button>
            </div>
          </div>

          <!-- Episodes Grid -->
          <div class="episodes-grid" id="episodes-grid-mount">
            ${renderEpisodesList(allEpisodes)}
          </div>
        </section>
      `;
    }

    function renderEpisodesList(eps) {
      if (eps.length === 0) {
        return `
          <div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--text-dim);">
            No se encontraron episodios con ese número.
          </div>
        `;
      }
      return eps.map(ep => {
        const isSeen = Storage.isSeen(ep.url);
        const watchHref = `#/watch?url=${encodeURIComponent(ep.url)}&image=${encodeURIComponent(anime.image || '')}&title=${encodeURIComponent(anime.title || '')}&animeUrl=${encodeURIComponent(anime.url || '')}`;
        return `
          <a href="${watchHref}" class="ep-btn-card ${isSeen ? 'seen' : ''}" title="Ver Episodio ${ep.number}">
            <span class="ep-btn-num">${escapeHtml(String(ep.number))}</span>
            <span class="ep-btn-label">Capítulo</span>
          </a>
        `;
      }).join('');
    }

    container.innerHTML = buildHtml();

    // Attach Relations events (Filters & MAL external link clicks)
    function attachRelationsEvents() {
      const relMount = container.querySelector('#relations-mount');
      if (!relMount) return;

      // Filter pills
      const filterPills = relMount.querySelectorAll('[data-rel-filter]');
      filterPills.forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          activeRelationFilter = btn.dataset.relFilter;
          relMount.innerHTML = buildRelationsHtml(currentRelations, activeRelationFilter);
          attachRelationsEvents();
        });
      });

      // External MAL links
      const malLinks = relMount.querySelectorAll('.relation-mal-link');
      malLinks.forEach(link => {
        link.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          const targetUrl = link.dataset.malHref;
          if (targetUrl) {
            window.open(targetUrl, '_blank', 'noopener,noreferrer');
          }
        });
      });
    }

    attachRelationsEvents();

    // If relations were not included in initial response, fetch in background
    if (!currentRelations || currentRelations.length === 0) {
      Api.getRelations(anime.title).then(fetched => {
        const relMount = container.querySelector('#relations-mount');
        if (fetched && fetched.length > 0) {
          currentRelations = fetched;
          if (relMount) {
            relMount.innerHTML = buildRelationsHtml(currentRelations, activeRelationFilter);
            attachRelationsEvents();
          }
        } else if (relMount) {
          relMount.innerHTML = '';
        }
      }).catch(err => {
        console.debug('Background MAL relations error:', err);
        const relMount = container.querySelector('#relations-mount');
        if (relMount) relMount.innerHTML = '';
      });
    }

    // Attach Synopsis Expand / Collapse Toggle
    const toggleSynopsisBtn = container.querySelector('#btn-toggle-synopsis');
    const synopsisText = container.querySelector('#detail-synopsis-text');
    if (toggleSynopsisBtn && synopsisText) {
      let isSynopsisExpanded = false;
      toggleSynopsisBtn.addEventListener('click', (e) => {
        e.preventDefault();
        isSynopsisExpanded = !isSynopsisExpanded;
        if (isSynopsisExpanded) {
          synopsisText.classList.remove('is-clamped');
          const textEl = container.querySelector('#synopsis-toggle-text');
          const iconEl = container.querySelector('#synopsis-toggle-icon');
          if (textEl) textEl.textContent = 'Leer menos';
          if (iconEl) iconEl.innerHTML = Icons.chevronUp;
        } else {
          synopsisText.classList.add('is-clamped');
          const textEl = container.querySelector('#synopsis-toggle-text');
          const iconEl = container.querySelector('#synopsis-toggle-icon');
          if (textEl) textEl.textContent = 'Leer más';
          if (iconEl) iconEl.innerHTML = Icons.chevronDown;
        }
      });
    }

    // Attach Favorite Toggle
    const favBtn = container.querySelector('#btn-toggle-fav');
    favBtn.addEventListener('click', () => {
      isFav = Storage.toggleFavorite(anime);
      container.querySelector('#fav-icon').innerHTML = isFav ? Icons.heartFilled : Icons.heart;
      container.querySelector('#fav-text').textContent = isFav ? 'En Favoritos' : 'Añadir a Favoritos';
      showToast(isFav ? 'Añadido a tus favoritos' : 'Eliminado de tus favoritos', 'success');
    });

    // Attach Library Status Selector
    const libSelect = container.querySelector('#select-lib-status');
    const existingLibItem = Storage.getLibraryItem(anime.title);
    if (existingLibItem && libSelect) {
      libSelect.value = existingLibItem.status || 'plan_to_watch';
    }

    if (libSelect) {
      libSelect.addEventListener('change', () => {
        const val = libSelect.value;
        if (val === 'none') {
          Storage.removeLibraryItem(anime.title);
          showToast(`Eliminado de Mi Lista`, 'info');
        } else {
          Storage.saveLibraryItem({
            title: anime.title,
            type: 'TV',
            totalEpisodes: allEpisodes.length,
            status: val,
            image: anime.image,
            animeUrl: anime.url
          });
          const labels = {
            watching: 'Viendo',
            completed: 'Visto',
            plan_to_watch: 'Pendiente',
            on_hold: 'Pausado',
            dropped: 'Abandonado'
          };
          showToast(`Guardado en Mi Lista como "${labels[val] || val}"`, 'success');
        }
      });
    }

    // Attach Invert Order
    const invertBtn = container.querySelector('#btn-invert-order');
    const invertLabel = container.querySelector('#invert-label');
    const epGrid = container.querySelector('#episodes-grid-mount');
    const epFilter = container.querySelector('#ep-filter-input');

    function updateGrid() {
      const query = epFilter.value.trim().toLowerCase();
      let filtered = allEpisodes.filter(e => String(e.number).toLowerCase().includes(query));
      if (!isAscending) {
        filtered = [...filtered].reverse();
      }
      epGrid.innerHTML = renderEpisodesList(filtered);
    }

    invertBtn.addEventListener('click', () => {
      isAscending = !isAscending;
      invertLabel.textContent = isAscending ? 'Orden Ascendente' : 'Orden Descendente';
      updateGrid();
    });

    epFilter.addEventListener('input', () => {
      updateGrid();
    });

  } catch (err) {
    container.innerHTML = `
      <div class="alert-banner error" style="margin-top: 40px;">
        <div>
          ${Icons.alert} <strong>No se pudo cargar la información del anime:</strong> ${escapeHtml(err.message)}
        </div>
        <div style="display: flex; gap: 10px;">
          <a href="${escapeHtml(animeUrl)}" target="_blank" rel="noopener noreferrer" class="btn btn-secondary">
            ${Icons.external} Abrir enlace original
          </a>
          <button class="btn btn-primary" onclick="window.history.back()">Volver</button>
        </div>
      </div>
    `;
  }
}
