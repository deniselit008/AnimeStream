/**
 * Network & Devices Modal Component
 * Displays local network IPs, Smart TV connection guides, and QR code inside the app.
 */
import { escapeHtml } from '../utils.js?v=5.0';
import { isStandaloneMode } from '../api.js?v=5.0';

let deferredInstallPrompt = null;
let escHandler = null;

// Capture PWA install prompt event if available on mobile/desktop
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
  });
}

function isAndroidLocalEnv() {
  if (typeof window === 'undefined') return false;
  return (
    window.location.protocol === 'file:' ||
    window.location.host.includes('appassets.androidplatform.net') ||
    (window.AndroidBridge && isStandaloneMode())
  );
}

export function openNetworkModal() {
  // Always clean up any existing modal instance
  closeNetworkModal();

  const modal = document.createElement('div');
  modal.id = 'network-modal';
  modal.className = 'modal-overlay open';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  document.body.appendChild(modal);

  // Unified click handler to close on backdrop or any close button
  modal.addEventListener('click', (e) => {
    if (e.target === modal || e.target.closest('.modal-close-btn') || e.target.closest('.btn-close-modal-action')) {
      closeNetworkModal();
    }
  });

  // Global ESC key listener
  escHandler = (e) => {
    if (e.key === 'Escape') {
      closeNetworkModal();
    }
  };
  document.addEventListener('keydown', escHandler);

  // On Android standalone mode / local APK without PC server connected, show manual PC connection UI directly!
  if (isAndroidLocalEnv() || isStandaloneMode()) {
    renderAndroidManualConnectModal(modal);
    return;
  }

  // Show loading state
  modal.innerHTML = `
    <div class="network-modal-card">
      <button class="modal-close-btn" aria-label="Cerrar ventana" title="Cerrar">✕</button>
      <div class="modal-header-row">
        <div class="modal-icon-badge">📡</div>
        <div>
          <h2 class="modal-title">Conectar Dispositivos &amp; Red Local</h2>
          <p class="modal-subtitle">Obteniendo información de interfaces de red...</p>
        </div>
      </div>
      <div class="network-loading-spinner">
        <div class="spinner"></div>
      </div>
    </div>
  `;

  // Fetch from local PC server
  fetch('/api/network-info')
    .then(r => r.json())
    .then(data => {
      if (document.getElementById('network-modal')) {
        renderNetworkModalContent(modal, data);
      }
    })
    .catch(() => {
      if (document.getElementById('network-modal')) {
        renderAndroidManualConnectModal(modal);
      }
    });
}

function renderAndroidManualConnectModal(modal) {
  const savedServer = localStorage.getItem('animestream_server_url') ||
    (window.AndroidBridge && typeof window.AndroidBridge.getServerUrl === 'function' ? window.AndroidBridge.getServerUrl() : '') || '';
  const deviceIp = (window.AndroidBridge && typeof window.AndroidBridge.getDeviceWifiIp === 'function')
    ? window.AndroidBridge.getDeviceWifiIp()
    : '';
  const isConnectedToPc = !!savedServer;

  modal.innerHTML = `
    <div class="network-modal-card">
      <button class="modal-close-btn" aria-label="Cerrar ventana" title="Cerrar">✕</button>

      <div class="modal-header-row">
        <div class="modal-icon-badge">📡</div>
        <div>
          <h2 class="modal-title">Conexión Manual con PC / Red Local</h2>
          <p class="modal-subtitle">Vincula esta app móvil con tu ordenador o úsala de forma autónoma sin PC</p>
        </div>
      </div>

      ${deviceIp && deviceIp !== '0.0.0.0' ? `
        <div style="margin: 12px 0; padding: 10px 14px; background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.28); border-radius: 10px; font-size: 0.85rem; color: #a7f3d0;">
          📶 IP Wi-Fi actual de este dispositivo: <strong>${escapeHtml(deviceIp)}</strong>
        </div>
      ` : ''}

      <div style="margin-top: 14px; padding: 16px; background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 12px;">
        <label for="manual-pc-ip-input" style="display: block; font-size: 0.86rem; font-weight: 600; color: #fff; margin-bottom: 8px;">
          🖥️ Dirección IP o URL de AnimeStream en tu PC:
        </label>
        <div style="display: flex; gap: 8px; flex-wrap: wrap;">
          <input
            type="text"
            id="manual-pc-ip-input"
            value="${escapeHtml(savedServer)}"
            placeholder="Ej: 192.168.1.50:3000"
            style="flex: 1; min-width: 180px; background: var(--bg-card); border: 1px solid var(--border-light); border-radius: 8px; padding: 10px 12px; color: #fff; font-size: 0.92rem; outline: none;"
            autocomplete="off"
          />
          <button class="btn btn-primary btn-sm" id="btn-manual-connect-pc" style="padding: 10px 18px; font-weight: 600;">
            🔗 Conectar
          </button>
        </div>
        <p id="manual-connect-status" style="font-size: 0.8rem; color: var(--text-dim); margin-top: 8px; line-height: 1.45;">
          En tu ordenador abre AnimeStream → pulsa <strong>Dispositivos 📡</strong> → copia la IP local (ej. <code>192.168.1.50:3000</code>) y conéctate estando en el mismo Wi-Fi.
        </p>
      </div>

      ${isConnectedToPc ? `
        <div style="margin-top: 14px; display: flex; justify-content: space-between; align-items: center; gap: 10px; padding: 12px 14px; background: rgba(244, 117, 33, 0.1); border: 1px solid rgba(244, 117, 33, 0.3); border-radius: 10px;">
          <span style="font-size: 0.84rem; color: #fed7aa;">Conectado actualmente a: <strong>${escapeHtml(savedServer)}</strong></span>
          <button class="btn btn-secondary btn-sm" id="btn-switch-standalone" style="padding: 6px 12px; font-size: 0.8rem;">
            📱 Volver a Modo Autónomo
          </button>
        </div>
      ` : `
        <div style="margin-top: 14px; padding: 12px 14px; background: rgba(255, 255, 255, 0.03); border: 1px solid var(--border-color); border-radius: 10px; font-size: 0.84rem; color: var(--text-muted);">
          ✅ Actualmente estás usando el <strong>Modo Autónomo 100% Independiente</strong> (no necesitas tener un PC encendido).
        </div>
      `}

      <div class="network-x-banner" style="margin-top: 16px;">
        <span>💬 ¿Dudas, sugerencias o novedades? Síguenos en X</span>
        <a href="https://x.com/animestreaem7f" target="_blank" rel="noopener noreferrer" class="btn-x-mini">@animestreaem7f</a>
      </div>

      <div style="margin-top: 18px; display: flex; justify-content: flex-end;">
        <button class="btn btn-secondary btn-close-modal-action" style="padding: 8px 24px; cursor: pointer;">Cerrar</button>
      </div>
    </div>
  `;

  const connectBtn = modal.querySelector('#btn-manual-connect-pc');
  const ipInput = modal.querySelector('#manual-pc-ip-input');
  const statusEl = modal.querySelector('#manual-connect-status');

  if (connectBtn && ipInput) {
    connectBtn.addEventListener('click', async () => {
      let raw = ipInput.value.trim();
      if (!raw) {
        if (statusEl) {
          statusEl.style.color = '#f87171';
          statusEl.textContent = '⚠️ Introduce la IP o URL de tu ordenador (ejemplo: 192.168.1.50:3000)';
        }
        return;
      }

      if (!raw.startsWith('http://') && !raw.startsWith('https://')) {
        raw = `http://${raw}`;
      }
      try {
        const parsed = new URL(raw);
        const rawHadPort = /:\d+$/.test(parsed.host);
        if (!rawHadPort && parsed.protocol === 'http:' && parsed.hostname !== 'localhost' && !parsed.hostname.includes('appassets')) {
          parsed.port = '3000';
        }
        raw = `${parsed.protocol}//${parsed.host}`;
      } catch (_) {
        raw = raw.replace(/\/+$/, '');
      }

      connectBtn.disabled = true;
      connectBtn.textContent = 'Conectando...';
      if (statusEl) {
        statusEl.style.color = '#94a3b8';
        statusEl.textContent = `Verificando conexión con ${raw}...`;
      }

      try {
        const controller = new AbortController();
        const tid = setTimeout(() => controller.abort(), 5000);
        let res;
        try {
          res = await fetch(`${raw}/api/health`, { signal: controller.signal });
        } finally {
          clearTimeout(tid);
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        localStorage.setItem('animestream_server_url', raw);
        if (window.AndroidBridge && typeof window.AndroidBridge.connectToServer === 'function') {
          window.AndroidBridge.connectToServer(raw);
        } else {
          window.location.reload();
        }
      } catch (err) {
        connectBtn.disabled = false;
        connectBtn.textContent = '🔗 Conectar';
        if (statusEl) {
          statusEl.style.color = '#f87171';
          statusEl.textContent = `❌ No se pudo conectar con ${raw}. Verifica que AnimeStream esté abierto en tu PC y que ambos estén en la misma red Wi-Fi.`;
        }
      }
    });
  }

  const standaloneBtn = modal.querySelector('#btn-switch-standalone');
  if (standaloneBtn) {
    standaloneBtn.addEventListener('click', () => {
      localStorage.removeItem('animestream_server_url');
      if (window.AndroidBridge && typeof window.AndroidBridge.resetServer === 'function') {
        window.AndroidBridge.resetServer();
      } else {
        window.location.reload();
      }
      closeNetworkModal();
    });
  }
}

export function closeNetworkModal() {
  if (escHandler) {
    document.removeEventListener('keydown', escHandler);
    escHandler = null;
  }
  const modal = document.getElementById('network-modal');
  if (modal) {
    modal.classList.remove('open');
    modal.remove();
  }
}

function renderNetworkModalContent(modal, data) {
  const primaryUrl = data.lanUrl || `http://localhost:${data.port || 3000}`;
  const primaryIp = data.lanIp || '127.0.0.1';
  const interfaces = data.interfaces || [];

  // Generate QR code SVG if vendor available, or clean fallback
  let qrHtml = '';
  if (typeof window.generateQRCodeSVG === 'function') {
    qrHtml = window.generateQRCodeSVG(primaryUrl, 160);
  }

  modal.innerHTML = `
    <div class="network-modal-card">
      <button class="modal-close-btn" aria-label="Cerrar ventana">✕</button>
      
      <div class="modal-header-row">
        <div class="modal-icon-badge">📡</div>
        <div>
          <h2 class="modal-title">Conectar Dispositivos &amp; Red Local</h2>
          <p class="modal-subtitle">Abre AnimeStream en tu Smart TV, móvil Android, tablet u otro ordenador</p>
        </div>
      </div>

      <!-- Main Highlighted URL Box -->
      <div class="network-primary-box">
        <div class="network-primary-info">
          <span class="network-badge">Recomendado para Móvil y Smart TV</span>
          <div class="network-url-display" id="net-primary-url">${escapeHtml(primaryUrl)}</div>
          <p class="network-hint">Introduce esta dirección en el navegador de cualquier dispositivo conectado al mismo Wi-Fi.</p>
        </div>
        <div class="network-primary-actions">
          <button class="btn btn-primary btn-sm" id="btn-copy-primary-url">
            <span>📋</span> <span id="label-copy-primary">Copiar Enlace</span>
          </button>
          ${deferredInstallPrompt ? `
            <button class="btn btn-secondary btn-sm" id="btn-install-pwa">
              <span>📲</span> <span>Instalar en Android</span>
            </button>
          ` : ''}
          ${(typeof window !== 'undefined' && ((window.AndroidBridge && window.AndroidBridge.isAndroidApp) || localStorage.getItem('animestream_server_url'))) ? `
            <button class="btn btn-outline btn-sm" id="btn-change-mobile-server" style="color: #f87171; border-color: rgba(239, 68, 68, 0.4);" title="Desconectar o cambiar IP del servidor">
              <span>🔄</span> <span>Cambiar Servidor</span>
            </button>
          ` : ''}
        </div>
      </div>

      <!-- Quick Scan & Guides Grid -->
      <div class="network-grid-row">
        <!-- QR Code Card -->
        <div class="network-card">
          <h3 class="network-card-title">📱 Escanear con Móvil (Android / iOS)</h3>
          <div class="qr-container">
            ${qrHtml}
          </div>
          <p class="qr-caption">Apunta con la cámara de tu móvil para entrar al instante sin escribir nada.</p>
        </div>

        <!-- Smart TV Guide Card -->
        <div class="network-card">
          <h3 class="network-card-title">📺 Cómo abrir en tu Smart TV</h3>
          <ol class="tv-guide-steps">
            <li>Conecta tu televisor a la misma red Wi-Fi de tu casa.</li>
            <li>Abre la aplicación <strong>Navegador Web</strong> de tu TV (Hisense VIDAA, LG WebOS, Samsung Tizen o Android TV).</li>
            <li>Escribe en la barra de direcciones: <code>${escapeHtml(primaryUrl)}</code></li>
            <li>¡Listo! Usa la cruceta (D-Pad) y botones de colores de tu mando para navegar sin ratón.</li>
          </ol>
        </div>
      </div>

      <!-- All Detected Adapters -->
      <div class="network-adapters-section">
        <h4 class="adapters-title">Todas las interfaces de red detectadas (${interfaces.length}):</h4>
        <div class="adapters-list">
          <div class="adapter-item">
            <div class="adapter-info">
              <span class="adapter-name">Local (Este ordenador)</span>
              <span class="adapter-ip">http://localhost:${data.port || 3000}</span>
            </div>
            <button class="btn-copy-mini" data-copy="http://localhost:${data.port || 3000}">Copiar</button>
          </div>
          ${interfaces.map(iface => `
            <div class="adapter-item ${iface.ip === primaryIp ? 'active-adapter' : ''}">
              <div class="adapter-info">
                <span class="adapter-name">${escapeHtml(iface.name)} ${iface.ip === primaryIp ? '(Wi-Fi / LAN Principal)' : ''}</span>
                <span class="adapter-ip">${escapeHtml(iface.url)}</span>
              </div>
              <button class="btn-copy-mini" data-copy="${escapeHtml(iface.url)}">Copiar</button>
            </div>
          `).join('')}
        </div>
      </div>

      <div class="network-x-banner">
        <span>💬 ¿Dudas, sugerencias o novedades? Síguenos en X</span>
        <a href="https://x.com/animestreaem7f" target="_blank" rel="noopener noreferrer" class="btn-x-mini">@animestreaem7f</a>
      </div>

      <div class="network-modal-footer">
        <div class="modal-footer-status">
          <span>🟢 Servidor activo en puerto <strong>${data.port || 3000}</strong></span>
          <span>•</span>
          <span>Node.js ${escapeHtml(data.nodeVersion || '')}</span>
          <span>•</span>
          <span>Escudo AdBlock y Proxy HLS Activos</span>
        </div>
        <button class="btn btn-secondary btn-close-modal-action" id="btn-close-network-modal-footer" title="Cerrar ventana">
          Cerrar
        </button>
      </div>
    </div>
  `;

  // Copy primary button
  const copyBtn = modal.querySelector('#btn-copy-primary-url');
  const copyLabel = modal.querySelector('#label-copy-primary');
  if (copyBtn) {
    copyBtn.addEventListener('click', () => {
      copyTextToClipboard(primaryUrl, () => {
        if (copyLabel) copyLabel.textContent = '¡Copiado!';
        setTimeout(() => {
          if (copyLabel) copyLabel.textContent = 'Copiar Enlace';
        }, 2000);
      });
    });
  }

  // Mini copy buttons
  modal.querySelectorAll('.btn-copy-mini').forEach(btn => {
    btn.addEventListener('click', () => {
      const text = btn.getAttribute('data-copy');
      copyTextToClipboard(text, () => {
        btn.textContent = '✓ Copiado';
        setTimeout(() => {
          btn.textContent = 'Copiar';
        }, 2000);
      });
    });
  });

  // PWA install button if active
  const installBtn = modal.querySelector('#btn-install-pwa');
  if (installBtn && deferredInstallPrompt) {
    installBtn.addEventListener('click', async () => {
      deferredInstallPrompt.prompt();
      const { outcome } = await deferredInstallPrompt.userChoice;
      if (outcome === 'accepted') {
        deferredInstallPrompt = null;
        installBtn.style.display = 'none';
      }
    });
  }

  // Change Mobile Server button
  const changeServerBtn = modal.querySelector('#btn-change-mobile-server');
  if (changeServerBtn) {
    changeServerBtn.addEventListener('click', () => {
      localStorage.removeItem('animestream_server_url');
      if (window.AndroidBridge && typeof window.AndroidBridge.resetServer === 'function') {
        window.AndroidBridge.resetServer();
      } else {
        window.location.hash = '#/connect';
      }
      closeNetworkModal();
    });
  }
}

function copyTextToClipboard(text, callback) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(callback).catch(() => {
      fallbackCopy(text, callback);
    });
  } else {
    fallbackCopy(text, callback);
  }
}

function fallbackCopy(text, callback) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  try {
    document.execCommand('copy');
    if (callback) callback();
  } catch (e) {}
  document.body.removeChild(ta);
}
