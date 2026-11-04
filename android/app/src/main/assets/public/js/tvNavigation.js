/**
 * AnimeStream Smart TV Navigation Engine
 * Tailored for Smart TVs (Hisense / VIDAA OS, Tizen, WebOS, Android TV)
 * Provides 2D D-Pad Spatial Navigation, Remote Back handling, Media Keys,
 * and high-visibility couch-friendly focus management.
 */
import { showToast } from './utils.js?v=3.0';

const STORAGE_KEY = 'animestream_tv_mode';

class TVNavigationEngine {
  constructor() {
    this.isTv = this.detectSmartTV();
    this.enabled = this.loadState();
    this.currentFocus = null;
    this.helperTimer = null;
    this.helperEl = null;
    this.initialized = false;
  }

  detectSmartTV() {
    try {
      const ua = (navigator.userAgent || '').toLowerCase();
      // Detect VIDAA OS, Hisense, and other common Smart TV browsers
      return /vidaa|hisense|smart-?tv|hbbtv|tizen|web0?s|googletv|android tv|crkey|v0401/i.test(ua);
    } catch (e) {
      return false;
    }
  }

  loadState() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved !== null) {
        return saved === 'true';
      }
      // If detected as TV device, default to true, otherwise false
      return this.isTv;
    } catch (e) {
      return this.isTv;
    }
  }

  saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, String(this.enabled));
    } catch (e) {}
  }

  init() {
    if (this.initialized) return;
    this.initialized = true;

    if (this.enabled) {
      document.body.classList.add('tv-mode');
    }

    this.bindEvents();
    this.createHelperBar();

    if (this.enabled) {
      // Auto-focus prominent element on start
      setTimeout(() => this.focusFirstElement(), 500);
      console.log(`[AnimeStream TV] Modo Smart TV iniciado (VIDAA/Hisense & Smart TVs compatible).`);
    }
  }

  isEnabled() {
    return this.enabled;
  }

  toggle(forceState = null) {
    this.enabled = forceState !== null ? forceState : !this.enabled;
    this.saveState();

    if (this.enabled) {
      document.body.classList.add('tv-mode');
      this.focusFirstElement();
      this.showHelperBar(5000);
      showToast('📺 Modo Smart TV activado (Navegación con Mando)', 'success');
    } else {
      document.body.classList.remove('tv-mode');
      if (this.currentFocus) {
        this.currentFocus.classList.remove('tv-focused');
      }
      this.hideHelperBar();
      showToast('Modo Smart TV desactivado', 'info');
    }

    window.dispatchEvent(new CustomEvent('animestream-tv-change', {
      detail: { enabled: this.enabled }
    }));

    return this.enabled;
  }

  bindEvents() {
    window.addEventListener('keydown', (e) => this.handleKeyDown(e), true);

    // Track click to update currentFocus
    document.addEventListener('focusin', (e) => {
      if (this.enabled && e.target && e.target !== this.currentFocus) {
        this.setFocus(e.target, false);
      }
    });

    // When route changes, update focus on new page
    window.addEventListener('hashchange', () => {
      if (this.enabled) {
        setTimeout(() => this.focusFirstElement(), 250);
      }
    });

    // Listen for TV remote commands forwarded from inside player iframe
    window.addEventListener('message', (e) => {
      if (!this.enabled) return;
      if (e.data && e.data.type === 'TV_REMOTE_BACK') {
        this.handleBackButton();
      }
    });
  }

  handleKeyDown(e) {
    const keyCode = e.keyCode || e.which;
    const key = e.key || '';

    // If TV Mode is disabled, auto-activate if user starts using TV Remote D-Pad / Back
    const isTvRemoteKey = [37, 38, 39, 40, 461, 10009, 415, 19, 403, 404, 405, 406].includes(keyCode) ||
                          ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'BrowserBack', 'MediaPlay', 'MediaPause'].includes(key);

    if (!this.enabled && isTvRemoteKey) {
      this.toggle(true);
    }

    if (!this.enabled) return;

    // Show remote helper on any key press
    this.showHelperBar();

    // Check if user is typing in search bar or form inputs
    const activeEl = document.activeElement;
    const isTyping = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA') && activeEl.type !== 'submit';

    // 1. Back / Return buttons (VIDAA 461, Tizen 10009, Backspace 8, Escape 27)
    if (keyCode === 461 || keyCode === 10009 || keyCode === 8 || keyCode === 27 || key === 'Back' || key === 'BrowserBack' || key === 'GoBack') {
      e.preventDefault();
      e.stopPropagation();
      this.handleBackButton();
      return;
    }

    // 2. Color buttons (Red, Green, Yellow, Blue)
    if (keyCode === 403 || key === 'ColorF0Red') { // Red: Home
      e.preventDefault();
      window.location.hash = '#/';
      return;
    } else if (keyCode === 404 || key === 'ColorF1Green') { // Green: Directory
      e.preventDefault();
      window.location.hash = '#/directory';
      return;
    } else if (keyCode === 405 || key === 'ColorF2Yellow') { // Yellow: Mi Lista
      e.preventDefault();
      window.location.hash = '#/library';
      return;
    } else if (keyCode === 406 || key === 'ColorF3Blue') { // Blue: Favorites
      e.preventDefault();
      window.location.hash = '#/favorites';
      return;
    }

    // 3. Media playback buttons (Play, Pause, Stop, Seek)
    if (keyCode === 415 || key === 'MediaPlay') {
      e.preventDefault();
      this.dispatchPlayerCommand('play');
      return;
    } else if (keyCode === 19 || key === 'MediaPause') {
      e.preventDefault();
      this.dispatchPlayerCommand('pause');
      return;
    } else if (keyCode === 10252 || key === 'MediaPlayPause') {
      e.preventDefault();
      this.dispatchPlayerCommand('toggle_play');
      return;
    } else if (keyCode === 417 || key === 'MediaFastForward') {
      e.preventDefault();
      this.dispatchPlayerCommand('seek_forward');
      return;
    } else if (keyCode === 412 || key === 'MediaRewind') {
      e.preventDefault();
      this.dispatchPlayerCommand('seek_backward');
      return;
    }

    // If currently typing in an input and pressing Left/Right/Up/Down, don't move spatial focus unless Escape/Enter
    if (isTyping) {
      if (keyCode === 13) { // Enter on search submits
        return;
      }
      if (keyCode === 38 || keyCode === 40) { // Up/Down escapes input
        activeEl.blur();
      } else {
        return;
      }
    }

    // 4. D-Pad Directional Navigation
    let direction = null;
    if (keyCode === 38 || key === 'ArrowUp' || key === 'Up') direction = 'UP';
    else if (keyCode === 40 || key === 'ArrowDown' || key === 'Down') direction = 'DOWN';
    else if (keyCode === 37 || key === 'ArrowLeft' || key === 'Left') direction = 'LEFT';
    else if (keyCode === 39 || key === 'ArrowRight' || key === 'Right') direction = 'RIGHT';

    if (direction) {
      e.preventDefault();
      e.stopPropagation();
      this.moveFocus(direction);
      return;
    }

    // 5. Enter / OK button
    if (keyCode === 13 || key === 'Enter' || key === 'Select' || key === 'VK_ENTER') {
      e.preventDefault();
      e.stopPropagation();
      this.activateFocusedElement();
      return;
    }
  }

  handleBackButton() {
    // A. Check if modal overlay is open (AdBlock modal, Network modal, etc.)
    const modal = document.querySelector('.modal-backdrop, .modal-overlay, #network-modal');
    if (modal) {
      const closeBtn = modal.querySelector('.modal-close-btn, #btn-modal-close, #btn-close-network-modal-footer, .btn-close-modal-action');
      if (closeBtn) closeBtn.click();
      else modal.remove();
      return;
    }

    // B. Check if search input has focus -> blur it
    const searchInput = document.getElementById('nav-search-input');
    if (document.activeElement === searchInput) {
      searchInput.blur();
      this.focusFirstElement();
      return;
    }

    // C. View specific return logic
    const hash = window.location.hash || '#/';
    if (hash.startsWith('#/watch')) {
      // If in watch view, go back to anime technical sheet if available
      const params = new URLSearchParams(hash.split('?')[1] || '');
      const animeUrl = params.get('animeUrl');
      if (animeUrl) {
        window.location.hash = `#/anime?url=${encodeURIComponent(animeUrl)}`;
      } else {
        window.history.back();
      }
    } else if (hash.startsWith('#/anime') || hash.startsWith('#/directory') || hash.startsWith('#/search') || hash.startsWith('#/library') || hash.startsWith('#/favorites') || hash.startsWith('#/history')) {
      window.location.hash = '#/';
    } else {
      showToast('Presiona el botón Salir del mando para salir de la app', 'info');
    }
  }

  dispatchPlayerCommand(cmd) {
    const iframe = document.getElementById('main-player-iframe');
    if (!iframe || !iframe.contentWindow) return;

    try {
      const win = iframe.contentWindow;
      if (cmd === 'toggle_play' && typeof win.togglePlay === 'function') {
        win.togglePlay();
        return;
      }
      if (cmd === 'play' && win.video && typeof win.video.play === 'function') {
        win.video.play();
        return;
      }
      if (cmd === 'pause' && win.video && typeof win.video.pause === 'function') {
        win.video.pause();
        return;
      }
      if (cmd === 'seek_forward' && typeof win.seekRelative === 'function') {
        win.seekRelative(10);
        return;
      }
      if (cmd === 'seek_backward' && typeof win.seekRelative === 'function') {
        win.seekRelative(-10);
        return;
      }
    } catch (e) {}

    // PostMessage fallback
    try {
      iframe.contentWindow.postMessage({ type: 'PLAYER_CMD', cmd }, '*');
    } catch (e) {}
  }

  getFocusableElements() {
    // If modal is open, scope strictly inside modal
    const modal = document.querySelector('.modal-backdrop, .modal-overlay, #network-modal');
    const container = modal || document;

    const selector = `
      a[href], 
      button:not([disabled]), 
      input:not([disabled]):not([type="hidden"]), 
      select:not([disabled]), 
      [tabindex="0"],
      .anime-card:not(.lib-card), 
      .continue-card,
      .server-tab, 
      .episode-pill, 
      .relation-card,
      .genre-tag
    `;

    const nodes = Array.from(container.querySelectorAll(selector));
    return nodes.filter(el => {
      // Must be visible on screen
      if (!el.offsetParent && el.tagName !== 'BODY') return false;
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return false;
      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || parseFloat(style.opacity) <= 0.05) return false;

      // Avoid duplicate stops inside standard cards where the card container itself is the target
      if (el.tagName === 'A' && el.closest('.anime-card:not(.lib-card), .continue-card, .relation-card')) {
        return false;
      }

      return true;
    });
  }

  setFocus(el, shouldScroll = true) {
    if (!el) return;

    if (this.currentFocus && this.currentFocus !== el) {
      this.currentFocus.classList.remove('tv-focused');
    }

    this.currentFocus = el;
    el.classList.add('tv-focused');

    try {
      el.focus({ preventScroll: true });
    } catch (e) {}

    if (shouldScroll) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
    }
  }

  focusFirstElement() {
    const focusables = this.getFocusableElements();
    if (focusables.length === 0) return;

    // Prefer prominent content element (hero button, first anime card, or watch tab)
    const preferred = focusables.find(el => 
      el.classList.contains('hero-actions') || 
      el.classList.contains('server-tab') || 
      el.classList.contains('anime-card') || 
      el.id === 'nav-search-input'
    );

    this.setFocus(preferred || focusables[0]);
  }

  moveFocus(direction) {
    const focusables = this.getFocusableElements();
    if (focusables.length === 0) return;

    if (!this.currentFocus || !document.contains(this.currentFocus) || !this.currentFocus.offsetParent) {
      this.focusFirstElement();
      return;
    }

    const curRect = this.currentFocus.getBoundingClientRect();
    const curCenter = {
      x: curRect.left + curRect.width / 2,
      y: curRect.top + curRect.height / 2
    };

    let bestCandidate = null;
    let minDistance = Infinity;

    for (const cand of focusables) {
      if (cand === this.currentFocus) continue;

      const candRect = cand.getBoundingClientRect();
      const candCenter = {
        x: candRect.left + candRect.width / 2,
        y: candRect.top + candRect.height / 2
      };

      const dx = candCenter.x - curCenter.x;
      const dy = candCenter.y - curCenter.y;

      let isValidDirection = false;
      let primaryDist = 0;
      let secondaryDist = 0;
      let hasAxisOverlap = false;

      if (direction === 'UP') {
        if (candCenter.y < curCenter.y - 4) {
          isValidDirection = true;
          primaryDist = curCenter.y - candCenter.y;
          secondaryDist = Math.abs(dx);
          hasAxisOverlap = Math.max(0, Math.min(curRect.right, candRect.right) - Math.max(curRect.left, candRect.left)) > 0;
        }
      } else if (direction === 'DOWN') {
        if (candCenter.y > curCenter.y + 4) {
          isValidDirection = true;
          primaryDist = candCenter.y - curCenter.y;
          secondaryDist = Math.abs(dx);
          hasAxisOverlap = Math.max(0, Math.min(curRect.right, candRect.right) - Math.max(curRect.left, candRect.left)) > 0;
        }
      } else if (direction === 'LEFT') {
        if (candCenter.x < curCenter.x - 4) {
          isValidDirection = true;
          primaryDist = curCenter.x - candCenter.x;
          secondaryDist = Math.abs(dy);
          hasAxisOverlap = Math.max(0, Math.min(curRect.bottom, candRect.bottom) - Math.max(curRect.top, candRect.top)) > 0;
        }
      } else if (direction === 'RIGHT') {
        if (candCenter.x > curCenter.x + 4) {
          isValidDirection = true;
          primaryDist = candCenter.x - curCenter.x;
          secondaryDist = Math.abs(dy);
          hasAxisOverlap = Math.max(0, Math.min(curRect.bottom, candRect.bottom) - Math.max(curRect.top, candRect.top)) > 0;
        }
      }

      if (isValidDirection) {
        // Weighted distance score: heavy penalty for perpendicular drift
        let score = primaryDist + (secondaryDist * 2.2);
        // Bonus if overlapping along the travel axis
        if (hasAxisOverlap) {
          score *= 0.65;
        }

        if (score < minDistance) {
          minDistance = score;
          bestCandidate = cand;
        }
      }
    }

    if (bestCandidate) {
      this.setFocus(bestCandidate);
    }
  }

  activateFocusedElement() {
    if (!this.currentFocus) {
      this.focusFirstElement();
      return;
    }

    const el = this.currentFocus;

    if (el.tagName === 'INPUT' || el.tagName === 'SELECT') {
      el.focus();
    } else if (el.tagName === 'A' || el.tagName === 'BUTTON') {
      el.click();
    } else {
      // If container (e.g. .anime-card, .continue-card), click its primary link
      const link = el.querySelector('a[href], button');
      if (link) {
        link.click();
      } else {
        el.click();
      }
    }
  }

  createHelperBar() {
    if (document.getElementById('tv-remote-hud')) return;

    this.helperEl = document.createElement('div');
    this.helperEl.id = 'tv-remote-hud';
    this.helperEl.className = 'tv-hud-bar';
    this.helperEl.innerHTML = `
      <div class="tv-hud-pill">
        <span class="tv-hud-badge">📺 Smart TV</span>
        <span class="tv-hud-item"><kbd>▲▼◄►</kbd> Mover</span>
        <span class="tv-hud-item"><kbd>OK</kbd> Seleccionar</span>
        <span class="tv-hud-item"><kbd>Atrás</kbd> Volver</span>
        <span class="tv-hud-colors">
          <span style="color:#ef4444;">●</span> Inicio
          <span style="color:#10b981;">●</span> Directorio
          <span style="color:#f59e0b;">●</span> Mi Lista
          <span style="color:#3b82f6;">●</span> Favoritos
        </span>
      </div>
    `;

    document.body.appendChild(this.helperEl);
  }

  showHelperBar(duration = 4000) {
    if (!this.helperEl) return;
    this.helperEl.classList.add('visible');

    if (this.helperTimer) clearTimeout(this.helperTimer);
    this.helperTimer = setTimeout(() => {
      this.hideHelperBar();
    }, duration);
  }

  hideHelperBar() {
    if (this.helperEl) {
      this.helperEl.classList.remove('visible');
    }
  }
}

export const TVNavigation = new TVNavigationEngine();
