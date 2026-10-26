/**
 * Navbar Component
 */
import { Icons, escapeHtml } from '../utils.js?v=3.0';
import { AdBlock } from '../adblock.js?v=3.0';

let navbarInitialized = false;

export function renderNavbar(container, activeRoute = '', query = '', source = 'all', onRerun = null) {
  if (!container) return;

  // Initialize Navbar DOM structure once so listeners and focus are never destroyed
  if (!navbarInitialized || !container.querySelector('.navbar')) {
    navbarInitialized = true;
    const isAdblockOn = AdBlock.isEnabled();
    const blockedCount = AdBlock.loadBlockedCount();

    container.innerHTML = `
      <header class="navbar">
        <div class="navbar-container">
          <!-- Logo -->
          <a href="#/" class="logo-link">
            <div class="logo-icon">
              <svg viewBox="0 0 24 24"><polygon points="6 3 20 12 6 21 6 3"/></svg>
            </div>
            <span>Anime<span style="color: var(--accent-primary);">Stream</span></span>
          </a>

          <!-- Search Bar -->
          <div class="search-wrapper">
            <form class="search-form" id="nav-search-form">
              <input 
                type="text" 
                class="search-input" 
                id="nav-search-input" 
                placeholder="Buscar anime en tiempo real (ej. One Piece, Naruto...)" 
                autocomplete="off"
              />
              <select class="source-select-nav" id="nav-source-select" title="Filtrar por fuente">
                <option value="all">Todas las fuentes</option>
                <option value="animeav1">AnimeAV1</option>
                <option value="jkanime">JKAnime</option>
                <option value="tioanime">TioAnime</option>
              </select>
              <button type="submit" class="search-btn" title="Buscar">
                ${Icons.search}
              </button>
            </form>
          </div>

          <!-- Navigation Links & AdBlock Badge -->
          <div style="display: flex; align-items: center; gap: 14px;">
            <nav class="nav-links">
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
          </div>
        </div>
      </header>
    `;

    // Attach search event
    const form = container.querySelector('#nav-search-form');
    const input = container.querySelector('#nav-search-input');
    const sourceSelect = container.querySelector('#nav-source-select');

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const q = input.value.trim();
      if (q) {
        const src = sourceSelect ? sourceSelect.value : 'all';
        const targetHash = `#/search?q=${encodeURIComponent(q)}&source=${src}`;
        
        // If the hash is identical, the browser won't fire hashchange.
        // We force re-running the route handler so searching the same query works every time!
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

    // Attach AdBlock Modal trigger
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

    // Reactive listener for AdBlock updates attached ONCE
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

  // Update active navigation link
  const navLinks = container.querySelectorAll('.nav-links .nav-link');
  navLinks.forEach(link => {
    const route = link.dataset.route;
    if ((route === '/' && (activeRoute === '' || activeRoute === '/')) ||
        (route !== '/' && activeRoute.startsWith(route))) {
      link.classList.add('active');
    } else {
      link.classList.remove('active');
    }
  });

  // Keep search input and source dropdown synchronized with current query if on search page
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

