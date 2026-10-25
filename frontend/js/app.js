/**
 * Main Application Coordinator & Hash Router
 */
import { renderNavbar } from './components/navbar.js?v=3.0';
import { renderHome } from './components/homeView.js?v=3.0';
import { renderSearch } from './components/searchView.js?v=3.0';
import { renderAnime } from './components/animeView.js?v=3.1';
import { renderWatch, cleanupWatchView } from './components/watchView.js?v=3.0';
import { renderFavorites } from './components/favoritesView.js?v=3.0';
import { renderHistory } from './components/historyView.js?v=3.0';
import { renderDirectory } from './components/directoryView.js?v=3.0';
import { renderLibrary } from './components/libraryView.js?v=3.0';
import { AdBlock } from './adblock.js?v=3.0';

// Initialize AdBlock engine immediately to intercept popups and third-party trackers
AdBlock.init();

function parseHash() {
  const hash = window.location.hash.slice(1) || '/';
  const [path, queryString] = hash.split('?');
  const params = new URLSearchParams(queryString || '');
  return { path, params };
}

async function handleRoute() {
  const { path, params } = parseHash();
  const navMount = document.getElementById('navbar-mount');
  const contentMount = document.getElementById('main-content-mount');

  if (!navMount || !contentMount) {
    console.error('Mount points not found in DOM');
    return;
  }

  try {
    const q = params.get('q') || '';
    const source = params.get('source') || 'all';

    // Render / update Navbar with active path and current search parameters
    renderNavbar(navMount, path, q, source, () => handleRoute());

    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'instant' });

    // Cleanup player listeners when leaving watch view
    if (path !== '/watch') {
      cleanupWatchView();
    }

    // Route Dispatcher
    if (path === '' || path === '/') {
      await renderHome(contentMount);
    } else if (path === '/directory') {
      await renderDirectory(contentMount, params);
    } else if (path === '/library') {
      await renderLibrary(contentMount, params);
    } else if (path === '/search') {
      const q = params.get('q') || '';
      const source = params.get('source') || 'all';
      await renderSearch(contentMount, q, source);
    } else if (path === '/anime') {
      const url = params.get('url');
      if (url) {
        await renderAnime(contentMount, url);
      } else {
        window.location.hash = '#/';
      }
    } else if (path === '/watch') {
      const url = params.get('url');
      if (url) {
        await renderWatch(contentMount, url, params);
      } else {
        window.location.hash = '#/';
      }
    } else if (path === '/favorites') {
      renderFavorites(contentMount);
    } else if (path === '/history') {
      renderHistory(contentMount);
    } else {
      // 404 Fallback
      contentMount.innerHTML = `
        <div style="text-align: center; padding: 100px 20px;">
          <h1 style="font-size: 3rem; margin-bottom: 12px; color: var(--accent-primary);">404</h1>
          <p style="color: var(--text-muted); margin-bottom: 24px;">Página no encontrada.</p>
          <a href="#/" class="btn btn-primary">Volver al Inicio</a>
        </div>
      `;
    }
  } catch (err) {
    console.error('Routing execution error:', err);
    contentMount.innerHTML = `
      <div style="text-align: center; padding: 60px 20px;">
        <h2 style="color: #ef4444; margin-bottom: 12px;">Error al cargar la vista</h2>
        <p style="color: #94a3b8; margin-bottom: 20px;">${err.message || 'Error desconocido'}</p>
        <button class="btn btn-primary" onclick="window.location.reload()">Reintentar</button>
      </div>
    `;
  }
}

// Initialize Router safely on any document state
window.addEventListener('hashchange', () => {
  handleRoute().catch(console.error);
});

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    handleRoute().catch(console.error);
  });
} else {
  handleRoute().catch(console.error);
}
