/**
 * Network & Devices Modal Component
 * Displays local network IPs, Smart TV connection guides, and QR code inside the app.
 */
import { escapeHtml } from '../utils.js?v=4.0';

let deferredInstallPrompt = null;

// Capture PWA install prompt event if available on mobile/desktop
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
  });
}

export function openNetworkModal() {
  let modal = document.getElementById('network-modal');

  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'network-modal';
    modal.className = 'modal-overlay';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    document.body.appendChild(modal);

    // Event listeners to close
    modal.addEventListener('click', (e) => {
      if (e.target === modal || e.target.closest('.modal-close-btn')) {
        closeNetworkModal();
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && modal.classList.contains('open')) {
        closeNetworkModal();
      }
    });
  }

  // Show loading state
  modal.innerHTML = `
    <div class="network-modal-card">
      <button class="modal-close-btn" aria-label="Cerrar ventana">✕</button>
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

  modal.classList.add('open');

  // Fetch from server
  fetch('/api/network-info')
    .then(r => r.json())
    .then(data => {
      renderNetworkModalContent(modal, data);
    })
    .catch(err => {
      modal.querySelector('.network-modal-card').innerHTML = `
        <button class="modal-close-btn" aria-label="Cerrar ventana">✕</button>
        <div class="modal-header-row">
          <div class="modal-icon-badge" style="background:rgba(239,68,68,0.2); color:#ef4444;">⚠️</div>
          <div>
            <h2 class="modal-title">Error al consultar red local</h2>
            <p class="modal-subtitle">${escapeHtml(err.message)}</p>
          </div>
        </div>
        <p style="margin-top:16px; color:var(--text-muted); font-size:0.9rem;">
          Asegúrate de que el servidor local de AnimeStream esté activo. Puedes acceder directamente en: 
          <code>http://localhost:3000</code>
        </p>
      `;
    });
}

export function closeNetworkModal() {
  const modal = document.getElementById('network-modal');
  if (modal) {
    modal.classList.remove('open');
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

      <div class="modal-footer-status">
        <span>🟢 Servidor activo en puerto <strong>${data.port || 3000}</strong></span>
        <span>•</span>
        <span>Node.js ${escapeHtml(data.nodeVersion || '')}</span>
        <span>•</span>
        <span>Escudo AdBlock y Proxy HLS Activos</span>
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
