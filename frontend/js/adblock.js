/**
 * AnimeStream Integrated AdBlocker Engine
 * Protects against popups, popunders, clickjacking overlays, deceptive redirects,
 * and intrusive ad scripts in embedded third-party video players and web pages.
 */
import { Icons, escapeHtml, showToast } from './utils.js';

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

    console.log(`[AnimeStream] AdBlocker Engine iniciado. Estado: ${this.enabled ? 'ACTIVO' : 'PAUSADO'} (Total bloqueados: ${this.blockedCount})`);
  }

  isEnabled() {
    return this.enabled;
  }

  toggle() {
    this.enabled = !this.enabled;
    this.saveState();
    this.updateCosmeticStyles();
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
      [id*="ad-"], [class*="ad-"]:not(.anime-card):not(.active),
      [id*="ads-"], [class*="ads-"],
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
    const purgeOverlays = () => {
      if (!this.enabled) return;
      try {
        // Query potential transparent overlay traps
        const candidates = document.querySelectorAll('div, a, span');
        candidates.forEach(el => {
          // Never touch our legitimate player, video or app nodes
          if (el.id === 'main-player-iframe' || el.closest('#app') && !el.classList.contains('ad-element')) {
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
          }
        });
      } catch (e) {}
    };

    if (window.MutationObserver) {
      this.observer = new MutationObserver(() => {
        purgeOverlays();
      });
      if (document.body) {
        this.observer.observe(document.body, { childList: true, subtree: true });
      }
    }

    // Periodic sweep
    setInterval(purgeOverlays, 1500);
  }

  // Show interactive AdBlock stats & settings modal
  showModal() {
    let modalOverlay = document.getElementById('adblock-modal-overlay');
    if (modalOverlay) {
      modalOverlay.remove();
    }

    modalOverlay = document.createElement('div');
    modalOverlay.id = 'adblock-modal-overlay';
    modalOverlay.className = 'modal-backdrop';

    const isAct = this.enabled;

    modalOverlay.innerHTML = `
      <div class="modal-card" style="max-width: 480px;">
        <div class="modal-header">
          <div style="display: flex; align-items: center; gap: 10px;">
            <div style="width: 36px; height: 36px; border-radius: 50%; background: ${isAct ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)'}; display: flex; align-items: center; justify-content: center; color: ${isAct ? '#10b981' : '#ef4444'};">
              ${Icons.shieldCheck || Icons.shield}
            </div>
            <div>
              <h3 style="margin: 0; font-size: 1.15rem; color: #fff;">Escudo AdBlocker Integrado</h3>
              <p style="margin: 0; font-size: 0.8rem; color: var(--text-dim);">Protección nativa para PC, Smart TV y Móvil</p>
            </div>
          </div>
          <button class="modal-close-btn" id="btn-close-adblock-modal">✕</button>
        </div>

        <div class="modal-body" style="padding: 20px 24px; display: flex; flex-direction: column; gap: 16px;">
          <!-- Status Banner -->
          <div style="display: flex; align-items: center; justify-content: space-between; padding: 14px 18px; background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-sm);">
            <div>
              <div style="font-size: 0.95rem; font-weight: 700; color: ${isAct ? '#10b981' : '#94a3b8'};">
                ${isAct ? '● Escudo Activado' : '○ Escudo Pausado'}
              </div>
              <div style="font-size: 0.8rem; color: var(--text-dim); margin-top: 2px;">
                ${isAct ? 'Protegiendo contra anuncios y ventanas emergentes' : 'La protección está temporalmente desactivada'}
              </div>
            </div>
            <button 
              id="btn-modal-toggle-adblock" 
              class="btn ${isAct ? 'btn-primary' : 'btn-secondary'}" 
              style="padding: 7px 16px; font-size: 0.84rem;"
            >
              ${isAct ? 'Pausar' : 'Activar'}
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
          <button id="btn-modal-reset-count" class="btn btn-outline" style="padding: 6px 12px; font-size: 0.8rem; color: var(--text-dim);">
            Reiniciar contador
          </button>
          <button id="btn-modal-close" class="btn btn-primary" style="padding: 6px 18px; font-size: 0.85rem;">
            Aceptar
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(modalOverlay);

    // Attach modal events
    const closeModal = () => modalOverlay.remove();
    modalOverlay.querySelector('#btn-close-adblock-modal').addEventListener('click', closeModal);
    modalOverlay.querySelector('#btn-modal-close').addEventListener('click', closeModal);
    modalOverlay.addEventListener('click', (e) => {
      if (e.target === modalOverlay) closeModal();
    });

    modalOverlay.querySelector('#btn-modal-toggle-adblock').addEventListener('click', () => {
      this.toggle();
      this.showModal(); // Re-render updated state
    });

    modalOverlay.querySelector('#btn-modal-reset-count').addEventListener('click', () => {
      this.resetCounter();
      const countEl = modalOverlay.querySelector('#adblock-modal-count');
      if (countEl) countEl.textContent = '0';
    });
  }
}

export const AdBlock = new AdBlockEngine();
