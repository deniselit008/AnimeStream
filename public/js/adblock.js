/**
 * AnimeStream Integrated AdBlocker Engine
 * Protects against popups, popunders, clickjacking overlays, deceptive redirects,
 * and intrusive ad scripts in embedded third-party video players and web pages.
 */
import { Icons, escapeHtml, showToast } from './utils.js?v=5.0';

const STORAGE_KEYS = {
  ENABLED: 'animestream_adblock_enabled',
  COUNT: 'animestream_adblock_blocked_count'
};

class AdBlockEngine {
  constructor() {
    this.enabled = this.loadEnabled();
    this.blockedCount = this.loadBlockedCount();
    this.originalWindowOpen = window.open;
    this.observer = null;
    this.initialized = false;
    this._activeModalCleanup = null;
  }

  loadEnabled() {
    try {
      const val = localStorage.getItem(STORAGE_KEYS.ENABLED);
      return val === null ? true : val === 'true';
    } catch (e) {
      return true;
    }
  }

  loadBlockedCount() {
    try {
      const val = localStorage.getItem(STORAGE_KEYS.COUNT);
      return val ? parseInt(val, 10) || 0 : 0;
    } catch (e) {
      return 0;
    }
  }

  saveState() {
    try {
      localStorage.setItem(STORAGE_KEYS.ENABLED, String(this.enabled));
      localStorage.setItem(STORAGE_KEYS.COUNT, String(this.blockedCount));
    } catch (e) {}
  }

  init() {
    if (this.initialized) return;
    this.initialized = true;

    // 1. Inject cosmetic ad-hiding CSS
    this.injectCosmeticStyles();

    // 2. Intercept window.open popups/popunders
    this.interceptPopups();

    // 3. Monitor DOM mutations for rogue ad overlays and deceptive banners
    this.initDomProtection();

    // 4. Listen for native Electron WebRequest/Popup blocks & sanitized iframe blocks
    if (typeof window !== 'undefined') {
      if (window.electronAPI && typeof window.electronAPI.onAdblockHit === 'function') {
        window.electronAPI.onAdblockHit((reason) => {
          this.recordBlock(reason || 'Anuncio de red bloqueado (Electron)');
        });
      }
      if (window.electronAPI && typeof window.electronAPI.setAdblockEnabled === 'function') {
        window.electronAPI.setAdblockEnabled(this.enabled);
      }
      window.addEventListener('message', (e) => {
        if (e.data && e.data.type === 'ANIMESTREAM_ADBLOCK_HIT') {
          this.recordBlock(e.data.reason || 'Anuncio bloqueado en reproductor');
        }
      });
      window.addEventListener('animestream-android-adblock-hit', (e) => {
        this.recordBlock(`Bloqueado (Android): ${e.detail || 'Tracker publicitario'}`);
      });
    }

    console.log(`[AnimeStream] AdBlocker Engine iniciado. Estado: ${this.enabled ? 'ACTIVO' : 'PAUSADO'} (Total bloqueados: ${this.blockedCount})`);
  }

  isEnabled() {
    return this.enabled;
  }

  toggle() {
    this.enabled = !this.enabled;
    this.saveState();
    this.updateCosmeticStyles();
    if (typeof window !== 'undefined' && window.electronAPI && typeof window.electronAPI.setAdblockEnabled === 'function') {
      window.electronAPI.setAdblockEnabled(this.enabled);
    }
    this.dispatchUpdate();
    showToast(
      this.enabled ? '🛡️ Escudo AdBlock activado' : '⚠️ Escudo AdBlock pausado',
      this.enabled ? 'success' : 'info'
    );
    return this.enabled;
  }

  resetCounter() {
    this.blockedCount = 0;
    this.saveState();
    this.dispatchUpdate();
    showToast('Contador de AdBlock reiniciado a 0', 'info');
  }

  recordBlock(reason = 'Anuncio bloqueado') {
    if (!this.enabled) return;
    this.blockedCount++;
    this.saveState();
    this.dispatchUpdate();
    console.log(`[AnimeStream AdBlock] Bloqueado: ${reason} (Total: ${this.blockedCount})`);
  }

  dispatchUpdate() {
    // Also update live DOM badges immediately in case modal or navbar listeners haven't refreshed
    const navCountEl = document.getElementById('nav-adblock-count');
    if (navCountEl) navCountEl.textContent = String(this.blockedCount);
    const modalCountEl = document.getElementById('adblock-modal-count');
    if (modalCountEl) modalCountEl.textContent = String(this.blockedCount);

    window.dispatchEvent(new CustomEvent('animestream-adblock-change', {
      detail: { enabled: this.enabled, count: this.blockedCount }
    }));
  }

  // Intercept window.open (Popups & Popunders)
  interceptPopups() {
    const self = this;
    window.open = function(url, target, features) {
      if (!self.enabled) {
        return self.originalWindowOpen.call(window, url, target, features);
      }

      // Check if URL is legitimate internal navigation or user-requested
      if (typeof url === 'string') {
        const isLegit = url.startsWith('/') ||
                        url.startsWith('#') ||
                        url.includes(window.location.host) ||
                        url.startsWith('blob:') ||
                        url.startsWith('about:blank');

        if (!isLegit) {
          self.recordBlock(`Popup publicitario bloqueado: ${url.slice(0, 40)}...`);
          showToast('🛡️ Ventana emergente publicitaria bloqueada', 'info', 2500);
          // Return dummy window object to satisfy scripts expecting a window reference
          return {
            closed: true,
            focus: () => {},
            close: () => {},
            location: { href: '' }
          };
        }
      }

      return self.originalWindowOpen.call(window, url, target, features);
    };
  }

  // Inject cosmetic hiding styles for banners, popunders, and deceptive overlays
  injectCosmeticStyles() {
    let styleEl = document.getElementById('animestream-adblock-css');
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = 'animestream-adblock-css';
      document.head.appendChild(styleEl);
    }
    this.updateCosmeticStyles();
  }

  updateCosmeticStyles() {
    const styleEl = document.getElementById('animestream-adblock-css');
    if (!styleEl) return;

    if (!this.enabled) {
      styleEl.textContent = '';
      return;
    }

    styleEl.textContent = `
      /* AnimeStream AdBlock Cosmetic Filtering */
      #overlayads, .overlayads, [id*="overlayad"], [class*="overlayad"],
      #confirm_modal, #modal-back,
      div[class*="modal-backdrop"]:not(#adblock-modal-overlay),
      a[target="_blank"][style*="position: absolute"], a[target="_blank"][style*="position: fixed"],
      [id^="ad-"], [id*="-ad-"], [class^="ad-"]:not(.active), [class*=" ad-"]:not(.active), [class*="-ad-"]:not(.anime-card),
      [id^="ads-"], [id*="-ads-"], [class^="ads-"], [class*=" ads-"], [class*="-ads-"],
      [id*="banner-ad"], [class*="banner-ad"],
      [class*="popunder"], [id*="popunder"],
      [class*="popup-ad"], [id*="popup-ad"],
      iframe[src*="adsterra"], iframe[src*="popads"], iframe[src*="propellerads"],
      iframe[src*="monetag"], iframe[src*="exoclick"], iframe[src*="clickadu"],
      iframe[src*="yandex"], iframe[src*="doubleclick"], iframe[src*="googlesyndication"],
      .ad-banner, .advertisement, .ad-box, .commercial-unit,
      .overlay-ad, .ad-container, .adsbygoogle {
        display: none !important;
        visibility: hidden !important;
        opacity: 0 !important;
        pointer-events: none !important;
        height: 0 !important;
        width: 0 !important;
      }
    `;
  }

  // Deceptive transparent overlay remover (Clickjacking Killer)
  initDomProtection() {
    let purgeTimer = null;
    const purgeOverlays = () => {
      if (!this.enabled) return;
      try {
        // Query potential transparent overlay traps (direct body siblings or rogue ad elements)
        const candidates = document.querySelectorAll('body > div:not(#app):not(#network-modal):not(#adblock-modal-overlay), body > a, body > span, .ad-element');
        candidates.forEach(el => {
          // Never touch our legitimate player, video or app nodes
          if (el.id === 'main-player-iframe') return;
          if (el.closest('#app') && !el.classList.contains('ad-element')) return;

          // Only examine outside app or suspected rogue overlays
          if (!el.hasAttribute('data-adblock-checked')) {
            el.setAttribute('data-adblock-checked', '1');
            const s = window.getComputedStyle(el);
            const isFloating = s.position === 'fixed' || s.position === 'absolute';
            const zIndex = parseInt(s.zIndex, 10) || 0;
            const opacity = parseFloat(s.opacity);

            // Detect invisible full-screen clickjacking traps (z-index >= 1000 and transparent)
            if (isFloating && zIndex >= 1000 && (opacity < 0.05 || s.visibility === 'hidden')) {
              const r = el.getBoundingClientRect();
              if (r.width >= window.innerWidth * 0.7 && r.height >= window.innerHeight * 0.7) {
                if (!el.querySelector('video') && !el.querySelector('iframe')) {
                  el.remove();
                  this.recordBlock('Capa de secuestro de clics (Clickjacking overlay) eliminada');
                }
              }
            }
          }
        });
      } catch (e) {}
    };

    const schedulePurge = () => {
      if (purgeTimer) return;
      purgeTimer = setTimeout(() => {
        purgeTimer = null;
        purgeOverlays();
      }, 120);
    };

    if (window.MutationObserver) {
      this.observer = new MutationObserver(() => {
        schedulePurge();
      });
      if (document.body) {
        this.observer.observe(document.body, { childList: true, subtree: true });
      }
    }

    // Periodic sweep
    setInterval(purgeOverlays, 2500);
  }

  // Open modal (alias for showModal)
  openModal() {
    this.showModal();
  }

  // Show interactive AdBlock stats & settings modal
  showModal() {
    if (typeof this._activeModalCleanup === 'function') {
      this._activeModalCleanup();
      this._activeModalCleanup = null;
    }

    let modalOverlay = document.getElementById('adblock-modal-overlay');
    if (modalOverlay) {
      modalOverlay.remove();
    }

    modalOverlay = document.createElement('div');
    modalOverlay.id = 'adblock-modal-overlay';
    modalOverlay.className = 'modal-backdrop';

    const isAct = this.enabled;

    modalOverlay.innerHTML = `
      <div class="modal-card" style="max-width: 480px; width: 92%;">
        <div class="modal-header">
          <div style="display: flex; align-items: center; gap: 10px;">
            <div style="width: 38px; height: 38px; border-radius: 50%; background: ${isAct ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)'}; display: flex; align-items: center; justify-content: center; color: ${isAct ? '#10b981' : '#ef4444'};">
              ${Icons.shieldCheck || Icons.shield}
            </div>
            <div>
              <h3 style="margin: 0; font-size: 1.15rem; color: #fff;">Escudo AdBlocker Integrado</h3>
              <p style="margin: 0; font-size: 0.8rem; color: var(--text-dim);">Protección nativa para PC, Smart TV y Móvil</p>
            </div>
          </div>
          <button class="modal-close-btn" id="btn-close-adblock-modal" title="Cerrar">✕</button>
        </div>

        <div class="modal-body" style="padding: 20px 24px; display: flex; flex-direction: column; gap: 16px;">
          <!-- Status Banner & Toggle Button -->
          <div style="display: flex; align-items: center; justify-content: space-between; padding: 16px 18px; background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-sm);">
            <div>
              <div style="font-size: 0.98rem; font-weight: 700; color: ${isAct ? '#10b981' : '#f87171'}; display: flex; align-items: center; gap: 8px;">
                <span style="display: inline-block; width: 9px; height: 9px; border-radius: 50%; background: ${isAct ? '#10b981' : '#ef4444'}; box-shadow: 0 0 8px ${isAct ? '#10b981' : '#ef4444'};"></span>
                ${isAct ? 'Escudo Activado' : 'Escudo Desactivado'}
              </div>
              <div style="font-size: 0.8rem; color: var(--text-dim); margin-top: 3px;">
                ${isAct ? 'Bloqueando popups, ventanas y redirecciones' : 'La protección está actualmente desactivada'}
              </div>
            </div>
            <button 
              id="btn-modal-toggle-adblock" 
              class="btn ${isAct ? 'btn-danger' : 'btn-primary'}" 
              style="padding: 8px 18px; font-size: 0.86rem; font-weight: 600; cursor: pointer; white-space: nowrap; border-radius: var(--radius-sm);"
            >
              ${isAct ? 'Desactivar AdBlock' : 'Activar AdBlock'}
            </button>
          </div>

          <!-- Counter Box -->
          <div style="text-align: center; padding: 18px; background: rgba(16, 185, 129, 0.08); border: 1px solid rgba(16, 185, 129, 0.25); border-radius: var(--radius-sm);">
            <div style="font-size: 2.2rem; font-weight: 800; color: #10b981; line-height: 1;" id="adblock-modal-count">
              ${this.blockedCount}
            </div>
            <div style="font-size: 0.82rem; color: #cbd5e1; margin-top: 6px; font-weight: 500;">
              Anuncios, popups y redirecciones bloqueados
            </div>
          </div>

          <!-- Feature List -->
          <div style="display: flex; flex-direction: column; gap: 8px; font-size: 0.84rem; color: var(--text-muted);">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="color: #10b981;">✓</span> Bloqueo estricto de popups y nuevas pestañas no deseadas.
            </div>
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="color: #10b981;">✓</span> Anti-Clickjacking: Eliminación de capas transparentes invisibles.
            </div>
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="color: #10b981;">✓</span> Aislamiento seguro Iframe Sandbox sin secuestro de navegación.
            </div>
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="color: #10b981;">✓</span> Proxy anti-adware en servidores de terceros.
            </div>
          </div>
        </div>

        <div class="modal-footer" style="padding: 14px 24px; display: flex; justify-content: space-between; align-items: center; border-top: 1px solid var(--border-color);">
          <button id="btn-modal-reset-count" class="btn btn-outline" style="padding: 6px 14px; font-size: 0.82rem; color: var(--text-dim);">
            Reiniciar contador
          </button>
          <button id="btn-modal-close" class="btn btn-primary" style="padding: 6px 20px; font-size: 0.85rem;">
            Aceptar
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(modalOverlay);

    // Attach modal events
    const onKeyDown = (e) => {
      if (e.key === 'Escape') closeModal();
    };
    const closeModal = () => {
      window.removeEventListener('keydown', onKeyDown);
      if (this._activeModalCleanup === closeModal) {
        this._activeModalCleanup = null;
      }
      if (modalOverlay.parentNode) modalOverlay.remove();
    };
    this._activeModalCleanup = closeModal;
    window.addEventListener('keydown', onKeyDown);

    modalOverlay.querySelector('#btn-close-adblock-modal').addEventListener('click', closeModal);
    modalOverlay.querySelector('#btn-modal-close').addEventListener('click', closeModal);
    modalOverlay.addEventListener('click', (e) => {
      if (e.target === modalOverlay) closeModal();
    });

    modalOverlay.querySelector('#btn-modal-toggle-adblock').addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggle();
      this.showModal(); // Re-render updated state
    });

    modalOverlay.querySelector('#btn-modal-reset-count').addEventListener('click', (e) => {
      e.stopPropagation();
      this.resetCounter();
      const countEl = modalOverlay.querySelector('#adblock-modal-count');
      if (countEl) countEl.textContent = '0';
    });
  }

  // Clean third party player iframe transparent clickjacking overlays if reachable
  cleanThirdPartyPlayer(iframe) {
    if (!this.enabled || !iframe) return;
    try {
      const doc = iframe.contentDocument || iframe.contentWindow?.document;
      if (doc) {
        // 1. Inject cosmetic suppression CSS if not already present
        if (!doc.getElementById('animestream-shield-style')) {
          const st = doc.createElement('style');
          st.id = 'animestream-shield-style';
          st.textContent = `
            #overlayads, .overlayads, [id*="overlayad"], [class*="overlayad"],
            #confirm_modal, #modal-back, .play-overlay,
            .ad-banner, .advertisement, [id*="popunder"], [class*="popunder"],
            div[style*="z-index: 2147483647"], div[style*="z-index: 9999999"],
            a[target="_blank"][style*="position: absolute"], a[target="_blank"][style*="position: fixed"] {
              display: none !important;
              visibility: hidden !important;
              pointer-events: none !important;
              width: 0 !important;
              height: 0 !important;
            }
          `;
          (doc.head || doc.body || doc.documentElement).appendChild(st);
        }

        // 2. Remove rogue ad elements, fake modals and clickjacking overlays
        const ads = doc.querySelectorAll(
          '#overlayads, .overlayads, [id*="overlayad"], [class*="overlayad"], ' +
          '#confirm_modal, #modal-back, .play-overlay, ' +
          '.ad-banner, .advertisement, [id^="ad_"], [id*="_ad_"], [class*="popunder"], [id*="popunder"], ' +
          'div[style*="z-index: 2147483647"], div[style*="z-index: 9999999"], ' +
          'a[target="_blank"][style*="position: absolute"], a[target="_blank"][style*="position: fixed"]'
        );
        ads.forEach(ad => {
          ad.remove();
          this.recordBlock('Elemento publicitario dentro del reproductor eliminado');
        });

        // 3. Neutralize window.open and window.modal_confirm inside iframe
        try {
          const win = iframe.contentWindow;
          if (win) {
            win.open = () => null;
            win.modal_confirm = (titulo, msj, callback, callback_cancel) => {
              if (typeof callback === 'function') {
                try { callback(); } catch (_) {}
              }
            };
          }
        } catch (_) {}
      }
    } catch (e) {
      // Cross-origin SOP prevents touching iframes from outside origin - expected and safe
    }
  }
}

export const AdBlock = new AdBlockEngine();
