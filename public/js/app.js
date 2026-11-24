/**
 * Main Application Coordinator & Hash Router
 */
import { renderNavbar } from './components/navbar.js?v=5.0';
import { renderHome, cleanupHomeView } from './components/homeView.js?v=5.0';
import { renderSearch, cleanupSearchView } from './components/searchView.js?v=5.0';
import { renderAnime, cleanupAnimeView } from './components/animeView.js?v=5.0';
import { renderWatch, cleanupWatchView } from './components/watchView.js?v=5.0';
import { renderFavorites } from './components/favoritesView.js?v=5.0';
import { renderHistory } from './components/historyView.js?v=5.0';
import { renderDirectory, cleanupDirectoryView } from './components/directoryView.js?v=5.0';
import { renderLibrary } from './components/libraryView.js?v=5.0';
import { renderMobileConnect } from './components/mobileConnectView.js?v=5.0';
import { AdBlock } from './adblock.js?v=5.0';
import { TVNavigation } from './tvNavigation.js?v=5.0';
import { openExternalUrl, escapeHtml } from './utils.js?v=5.0';

// Initialize AdBlock & Smart TV Navigation engines
AdBlock.init();
TVNavigation.init();

let routeSequence = 0;

function parseHash() {
  const hash = window.location.hash.slice(1) || '/';
  const [path, queryString] = hash.split('?');
  const params = new URLSearchParams(queryString || '');
  return { path, params };
}

async function handleRoute() {
  const mySeq = ++routeSequence;
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

    // Cleanup active async view tokens & listeners when leaving their respective views
    if (path !== '/watch') {
      cleanupWatchView();
    }
    if (path !== '' && path !== '/') {
      cleanupHomeView();
    }
    if (path !== '/anime') {
      cleanupAnimeView();
    }
    if (path !== '/directory') {
      cleanupDirectoryView();
    }
    if (path !== '/search') {
      cleanupSearchView();
    }

    // Route Dispatcher
    const urlParams = new URLSearchParams(window.location.search);
    const isUnreachable = urlParams.get('error') === 'unreachable';
    const unreachableServer = urlParams.get('server') || '';
    const savedServer = localStorage.getItem('animestream_server_url') || 
                        (window.AndroidBridge && typeof window.AndroidBridge.getServerUrl === 'function' && window.AndroidBridge.getServerUrl());

    // Move ?error=unreachable query string into clean hash route so subsequent navigation isn't trapped
    if (isUnreachable) {
      try {
        window.history.replaceState(null, '', window.location.pathname + '#/connect?error=unreachable' + (unreachableServer ? `&server=${encodeURIComponent(unreachableServer)}` : ''));
      } catch (_) {}
    }

    if (path === '/connect' || (isUnreachable && savedServer)) {
      renderMobileConnect(contentMount, {
        error: isUnreachable ? 'unreachable' : params.get('error'),
        server: unreachableServer || params.get('server') || savedServer
      });
      return;
    }

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
    if (mySeq !== routeSequence) return;
    console.error('Routing execution error:', err);
    contentMount.innerHTML = `
      <div style="text-align: center; padding: 60px 20px;">
        <h2 style="color: #ef4444; margin-bottom: 12px;">Error al cargar la vista</h2>
        <p style="color: #94a3b8; margin-bottom: 20px;">${escapeHtml(err.message || 'Error desconocido')}</p>
        <button class="btn btn-primary" onclick="window.location.reload()">Reintentar</button>
      </div>
    `;
  }
}

// Intercept external link clicks to open in default browser on Electron & Android
document.addEventListener('click', (e) => {
  const link = e.target.closest('a[target="_blank"], a.external-link, [data-external-url]');
  if (link) {
    let href = link.getAttribute('data-external-url') || link.getAttribute('href');
    if (href && href.startsWith('//')) href = 'https:' + href;
    if (href && (href.startsWith('http://') || href.startsWith('https://')) && !href.includes('appassets.androidplatform.net')) {
      if ((window.electronAPI && typeof window.electronAPI.openExternal === 'function') ||
          (window.AndroidBridge && typeof window.AndroidBridge.openExternal === 'function')) {
        e.preventDefault();
        openExternalUrl(href);
      }
    }
  }
});

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
