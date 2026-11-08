/**
 * Modern Floating Navbar Component with Live Autocomplete Suggestions
 */
import { Icons, escapeHtml, getSourceBadgeClass, resolveAnimeCover, getDefaultPoster } from '../utils.js?v=4.1';
import { AdBlock } from '../adblock.js?v=4.0';
import { TVNavigation } from '../tvNavigation.js?v=4.0';
import { Api } from '../api.js?v=4.0';
import { openNetworkModal } from './networkModal.js?v=4.1';

let navbarInitialized = false;
let autocompleteDebounceTimer = null;

export function renderNavbar(container, activeRoute = '', query = '', source = 'all', onRerun = null) {
  if (!container) return;

  if (!navbarInitialized || !container.querySelector('.navbar')) {
    navbarInitialized = true;
    const isAdblockOn = AdBlock.isEnabled();
    const blockedCount = AdBlock.loadBlockedCount();
    const isTvOn = TVNavigation.isEnabled();

    container.innerHTML = `
      <header class="navbar">
        <div class="navbar-container">
          <!-- Top Row: Logo & Action Badges -->
          <div class="navbar-top-row">
            <!-- Logo -->
            <a href="#/" class="logo-link">
              <div class="logo-icon">
                <svg viewBox="0 0 24 24"><polygon points="6 3 20 12 6 21 6 3"/></svg>
              </div>
              <span>Anime<span class="text-gradient">Stream</span></span>
            </a>

            <!-- Quick Action Badges (Top right on mobile, inline on desktop) -->
            <div class="nav-badges-group">
              <!-- Integrated AdBlock Status Button -->
              <button 
                id="nav-btn-adblock" 
                class="nav-adblock-btn ${isAdblockOn ? '' : 'disabled'}" 
                title="Escudo AdBlocker Integrado: ${isAdblockOn ? 'Activo' : 'Desactivado'} (Clic para gestionar)"
              >
                <span id="nav-adblock-icon">${isAdblockOn ? '🛡️' : '⚠️'}</span>
                <span id="nav-adblock-label">AdBlock ${isAdblockOn ? 'ON' : 'OFF'}</span>
                <span class="adblock-count-badge" id="nav-adblock-count">${blockedCount}</span>
              </button>

              <!-- Smart TV Mode Button (Desktop only) -->
              <button 
                id="nav-btn-tv-mode" 
                class="nav-tv-btn ${isTvOn ? 'active' : ''}" 
                title="Modo Smart TV: Navegación por cruceta/mando a distancia"
              >
                <span>📺</span>
                <span id="nav-tv-label">Smart TV</span>
              </button>

              <!-- Network & Device Cast IPs Button -->
              <button 
                id="nav-btn-network" 
                class="nav-network-btn" 
                title="Dispositivos &amp; Red Local: Ver IPs para conectar Smart TV o Móvil"
              >
                <span class="network-radar-icon">📡</span>
                <span class="nav-network-label">Dispositivos</span>
              </button>

              <!-- Official X Account Link -->
              <a 
                href="https://x.com/animestreaem7f" 
                target="_blank" 
                rel="noopener noreferrer" 
                class="nav-x-btn" 
                id="nav-btn-x" 
                title="Síguenos en X (Twitter): @animestreaem7f"
              >
                <span class="x-icon-svg">${Icons.x}</span>
                <span class="nav-x-label">X</span>
              </a>
            </div>
          </div>

          <!-- Modern Search Bar with Live Suggestions Dropdown -->
          <div class="search-wrapper">
            <form class="search-form" id="nav-search-form" autocomplete="off">
              <span class="search-icon-inside">${Icons.search}</span>
              <input 
                type="text" 
                class="search-input" 
                id="nav-search-input" 
                placeholder="Buscar anime en tiempo real (ej. Frieren, One Piece...)" 
                autocomplete="off"
                spellcheck="false"
              />
              <select class="source-select-nav" id="nav-source-select" title="Filtrar por fuente">
                <option value="all">Todas</option>
                <option value="animeav1">AnimeAV1</option>
                <option value="jkanime">JKAnime</option>
                <option value="tioanime">TioAnime</option>
              </select>
              <button type="submit" class="search-btn" id="nav-search-btn" title="Buscar">
                <span>Buscar</span>
              </button>
            </form>

            <!-- Floating Live Autocomplete Card -->
            <div class="search-suggestions-dropdown" id="nav-search-suggestions"></div>
          </div>

          <!-- Desktop Navigation Links (Hidden on mobile) -->
          <nav class="nav-links desktop-nav-links">
            <a href="#/" class="nav-link" data-route="/">
              ${Icons.home} <span>Inicio</span>
            </a>
            <a href="#/directory" class="nav-link" data-route="/directory">
              ${Icons.compass} <span>Directorio</span>
            </a>
            <a href="#/library" class="nav-link" data-route="/library">
              ${Icons.bookmark} <span>Mi Lista</span>
            </a>
            <a href="#/favorites" class="nav-link" data-route="/favorites">
              ${Icons.heart} <span>Favoritos</span>
            </a>
            <a href="#/history" class="nav-link" data-route="/history">
              ${Icons.history} <span>Historial</span>
            </a>
          </nav>
        </div>
      </header>

      <!-- Native Mobile Bottom Navigation Bar (Fixed at bottom on mobile) -->
      <nav class="mobile-bottom-nav">
        <a href="#/" class="bottom-nav-item" data-route="/">
          ${Icons.home}
          <span>Inicio</span>
        </a>
        <a href="#/directory" class="bottom-nav-item" data-route="/directory">
          ${Icons.compass}
          <span>Directorio</span>
        </a>
        <a href="#/library" class="bottom-nav-item" data-route="/library">
          ${Icons.bookmark}
          <span>Mi Lista</span>
        </a>
        <a href="#/favorites" class="bottom-nav-item" data-route="/favorites">
          ${Icons.heart}
          <span>Favoritos</span>
        </a>
        <a href="#/history" class="bottom-nav-item" data-route="/history">
          ${Icons.history}
          <span>Historial</span>
        </a>
      </nav>
    `;

    // Search Form submission
    const form = container.querySelector('#nav-search-form');
    const input = container.querySelector('#nav-search-input');
    const sourceSelect = container.querySelector('#nav-source-select');
    const suggestionsDropdown = container.querySelector('#nav-search-suggestions');

    function closeSuggestions() {
      if (suggestionsDropdown) {
        suggestionsDropdown.classList.remove('open');
        suggestionsDropdown.innerHTML = '';
      }
    }

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      closeSuggestions();
      const q = input.value.trim();
      if (q) {
        const src = sourceSelect ? sourceSelect.value : 'all';
        const targetHash = `#/search?q=${encodeURIComponent(q)}&source=${src}`;
        if (window.location.hash === targetHash) {
          if (typeof onRerun === 'function') {
            onRerun();
          } else {
            window.dispatchEvent(new HashChangeEvent('hashchange'));
          }
        } else {
          window.location.hash = targetHash;
        }
      }
    });

    // Real-time Autocomplete Debounce
    input.addEventListener('input', () => {
      const q = input.value.trim();
      if (autocompleteDebounceTimer) clearTimeout(autocompleteDebounceTimer);

      if (q.length < 2) {
        closeSuggestions();
        return;
      }

      autocompleteDebounceTimer = setTimeout(async () => {
        try {
          const res = await Api.search(q, sourceSelect ? sourceSelect.value : 'all');
          const results = Array.isArray(res) ? res : (res?.results || []);
          if (results.length === 0) {
            suggestionsDropdown.innerHTML = `
              <div class="suggestion-empty">No se encontraron animes para "${escapeHtml(q)}"</div>
            `;
            suggestionsDropdown.classList.add('open');
            return;
          }

          const topResults = results.slice(0, 6);
          suggestionsDropdown.innerHTML = `
            <div class="suggestions-header">Sugerencias rápidas:</div>
            ${topResults.map(item => {
              const coverUrl = resolveAnimeCover(item);
              const fallbackSvg = getDefaultPoster(item.title, item.source);
              return `
                <a href="#/anime?url=${encodeURIComponent(item.url)}" class="suggestion-item">
                  <img 
                    src="${escapeHtml(coverUrl)}" 
                    class="suggestion-thumb" 
                    alt="${escapeHtml(item.title)}" 
                    loading="lazy" 
                    referrerpolicy="no-referrer"
                    onerror="if (!this.dataset.retried && this.src && !this.src.includes('/api/image-proxy') && '${escapeHtml(item.image || '')}') { this.dataset.retried='1'; this.src='/api/image-proxy?url=' + encodeURIComponent('${escapeHtml(item.image || '')}'); } else { this.onerror=null; this.src='${escapeHtml(fallbackSvg)}'; }"
                  />
                  <div class="suggestion-info">
                    <div class="suggestion-title">${escapeHtml(item.title)}</div>
                    <div class="suggestion-meta">
                      <span class="badge ${getSourceBadgeClass(item.source)}">${escapeHtml(item.source)}</span>
                      <span class="suggestion-type">${escapeHtml(item.type || 'Anime')}</span>
                    </div>
                  </div>
                </a>
              `;
            }).join('')}
            <div class="suggestions-footer" id="view-all-results-btn">
              Ver todos los resultados para "<strong>${escapeHtml(q)}</strong>" &rarr;
            </div>
          `;
          suggestionsDropdown.classList.add('open');

          const viewAll = suggestionsDropdown.querySelector('#view-all-results-btn');
          if (viewAll) {
            viewAll.addEventListener('click', () => {
              form.dispatchEvent(new Event('submit'));
            });
          }

          const items = suggestionsDropdown.querySelectorAll('.suggestion-item');
          items.forEach(it => {
            it.addEventListener('click', () => closeSuggestions());
          });
        } catch (_) {
          closeSuggestions();
        }
      }, 250);
    });

    // Close suggestions when clicking outside, navigating or pressing Escape
    document.addEventListener('click', (e) => {
      if (!form.contains(e.target) && !suggestionsDropdown.contains(e.target)) {
        closeSuggestions();
      }
    });

    window.addEventListener('hashchange', () => {
      closeSuggestions();
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        form.dispatchEvent(new Event('submit'));
      } else if (e.key === 'Escape') {
        closeSuggestions();
      }
    });

    const searchBtn = container.querySelector('#nav-search-btn');
    if (searchBtn) {
      searchBtn.addEventListener('click', (e) => {
        e.preventDefault();
        form.dispatchEvent(new Event('submit'));
      });
    }

    // AdBlock Modal Trigger
    const adblockBtn = container.querySelector('#nav-btn-adblock');
    if (adblockBtn) {
      adblockBtn.addEventListener('click', (e) => {
        e.preventDefault();
        if (typeof AdBlock.openModal === 'function') {
          AdBlock.openModal();
        } else if (typeof AdBlock.showModal === 'function') {
          AdBlock.showModal();
        }
      });
    }

    // Smart TV Mode Trigger
    const tvBtn = container.querySelector('#nav-btn-tv-mode');
    if (tvBtn) {
      tvBtn.addEventListener('click', (e) => {
        e.preventDefault();
        TVNavigation.toggle();
      });
    }

    // Network & Devices Modal Trigger
    const netBtn = container.querySelector('#nav-btn-network');
    if (netBtn) {
      netBtn.addEventListener('click', (e) => {
        e.preventDefault();
        openNetworkModal();
      });
    }

    window.addEventListener('animestream-tv-change', (e) => {
      const btn = container.querySelector('#nav-btn-tv-mode');
      if (btn && e.detail) {
        if (e.detail.enabled) {
          btn.classList.add('active');
          btn.title = 'Modo Smart TV: Activo (Navegación con cruceta)';
        } else {
          btn.classList.remove('active');
          btn.title = 'Modo Smart TV: Desactivado';
        }
      }
    });

    window.addEventListener('animestream-adblock-change', (e) => {
      const btn = container.querySelector('#nav-btn-adblock');
      const badge = container.querySelector('#nav-adblock-count');
      const icon = container.querySelector('#nav-adblock-icon');
      const label = container.querySelector('#nav-adblock-label');
      if (btn && badge && e.detail) {
        badge.textContent = e.detail.count;
        if (e.detail.enabled) {
          btn.classList.remove('disabled');
          btn.title = `Escudo AdBlocker Integrado: Activo (${e.detail.count} bloqueados)`;
          if (icon) icon.textContent = '🛡️';
          if (label) label.textContent = 'AdBlock ON';
        } else {
          btn.classList.add('disabled');
          btn.title = 'Escudo AdBlocker Integrado: Desactivado';
          if (icon) icon.textContent = '⚠️';
          if (label) label.textContent = 'AdBlock OFF';
        }
      }
    });
  }

  // Update active navigation link (desktop & mobile bottom nav)
  const navLinks = container.querySelectorAll('.nav-links .nav-link, .mobile-bottom-nav .bottom-nav-item');
  navLinks.forEach(link => {
    const route = link.dataset.route;
    if ((route === '/' && (activeRoute === '' || activeRoute === '/')) ||
        (route !== '/' && activeRoute.startsWith(route))) {
      link.classList.add('active');
    } else {
      link.classList.remove('active');
    }
  });

  const input = container.querySelector('#nav-search-input');
  const sourceSelect = container.querySelector('#nav-source-select');
  if (activeRoute === '/search' && query) {
    if (input && document.activeElement !== input) {
      input.value = query;
    }
    if (sourceSelect && source) {
      sourceSelect.value = source;
    }
  }
}
