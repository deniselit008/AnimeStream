/**
/**
 * Mobile Connection Setup View Component
 * Provides seamless pairing between the Android Mobile App and the local AnimeStream server.
 */
import { escapeHtml, showToast, Icons } from '../utils.js?v=4.0';

export function renderMobileConnect(container, options = {}) {
  const isError = options.error === 'unreachable';
  const failingServer = options.server || localStorage.getItem('animestream_server_url') || '';

  // Attempt to guess local subnet
  let defaultIp = 'http://192.168.1.';
  try {
    if (window.AndroidBridge && typeof window.AndroidBridge.getDeviceWifiIp === 'function') {
      const deviceIp = window.AndroidBridge.getDeviceWifiIp();
      if (deviceIp && deviceIp.includes('.')) {
        const parts = deviceIp.split('.');
        defaultIp = `http://${parts[0]}.${parts[1]}.${parts[2]}.`;
      }
    }
  } catch (e) {}

  container.innerHTML = `
    <div class="mobile-connect-wrapper" style="min-height: 80vh; display: flex; align-items: center; justify-content: center; padding: 24px 16px;">
      <div class="mobile-connect-card" style="max-width: 500px; width: 100%; background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-lg); padding: 32px 24px; box-shadow: 0 20px 40px rgba(0,0,0,0.6); text-align: center;">
        
        <div style="font-size: 3.5rem; margin-bottom: 12px; filter: drop-shadow(0 0 15px var(--accent-glow));">
          ${isError ? '⚠️' : '📱'}
        </div>

        <h1 style="font-size: 1.6rem; font-weight: 800; margin-bottom: 8px; color: var(--text-main);">
          ${isError ? 'Servidor no disponible' : 'Conectar con AnimeStream'}
        </h1>

        <p style="color: var(--text-muted); font-size: 0.95rem; line-height: 1.5; margin-bottom: 24px;">
          ${isError 
            ? `No se pudo establecer conexión con <code>${escapeHtml(failingServer)}</code>. Asegúrate de que AnimeStream esté abierto en tu ordenador conectado a la misma red Wi-Fi.` 
            : 'Para ver todo el catálogo y reproducir anime sin publicidad, conecta esta aplicación con tu servidor local AnimeStream.'}
        </p>

        <!-- Guide Box -->
        <div style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); border-radius: var(--radius-md); padding: 16px; text-align: left; margin-bottom: 24px; font-size: 0.88rem; color: var(--text-dim);">
          <div style="font-weight: 700; color: var(--accent-primary); margin-bottom: 8px; display: flex; align-items: center; gap: 6px;">
            <span>ℹ️</span> ¿Cómo encontrar la dirección de tu PC?
          </div>
          <ol style="margin: 0; padding-left: 20px; line-height: 1.6;">
            <li>Abre <strong>AnimeStream</strong> en tu ordenador.</li>
            <li>Haz clic en el botón <strong>"📡 Dispositivos"</strong> en la esquina superior.</li>
            <li>Copia o introduce la dirección que aparece en pantalla (ej: <code>http://192.168.1.50:3000</code>).</li>
          </ol>
        </div>

        <!-- Connection Form -->
        <form id="mobile-connect-form" style="display: flex; flex-direction: column; gap: 14px;">
          <div style="text-align: left;">
            <label for="server-url-input" style="display: block; font-size: 0.82rem; font-weight: 600; color: var(--text-muted); margin-bottom: 6px;">
              Dirección del Servidor AnimeStream:
            </label>
            <input 
              type="text" 
              id="server-url-input" 
              placeholder="${defaultIp}XX:3000" 
              value="${failingServer || defaultIp}" 
              autocomplete="off" 
              autocapitalize="none"
              style="width: 100%; padding: 12px 14px; background: rgba(0,0,0,0.4); border: 1px solid var(--border-color); border-radius: var(--radius-md); color: #fff; font-family: monospace; font-size: 1rem; outline: none; transition: border-color 0.2s;"
            />
          </div>

          <div id="connect-status-message" style="display: none; padding: 10px; border-radius: var(--radius-sm); font-size: 0.88rem; text-align: center;"></div>

          <button type="submit" id="btn-submit-connect" class="btn btn-primary" style="padding: 14px; font-size: 1rem; font-weight: 700; border-radius: var(--radius-md); justify-content: center; gap: 8px;">
            <span>🚀 Conectar Ahora</span>
          </button>

          <button type="button" id="btn-auto-discover" class="btn btn-secondary" style="padding: 12px; font-size: 0.9rem; border-radius: var(--radius-md); justify-content: center; gap: 8px;">
            <span>🔍 Buscar Servidor en mi Wi-Fi</span>
          </button>
        </form>

        <div style="margin-top: 24px; font-size: 0.78rem; color: var(--text-dim); line-height: 1.4;">
          Tip: Si la conexión falla, comprueba que tu móvil y el PC estén conectados al mismo router y que el firewall de Windows permita conexiones locales en el puerto 3000.
        </div>

      </div>
    </div>
  `;

  const form = container.querySelector('#mobile-connect-form');
  const input = container.querySelector('#server-url-input');
  const statusMsg = container.querySelector('#connect-status-message');
  const btnSubmit = container.querySelector('#btn-submit-connect');
  const btnDiscover = container.querySelector('#btn-auto-discover');

  function showStatus(text, type = 'info') {
    statusMsg.style.display = 'block';
    if (type === 'error') {
      statusMsg.style.background = 'rgba(239, 68, 68, 0.15)';
      statusMsg.style.border = '1px solid rgba(239, 68, 68, 0.4)';
      statusMsg.style.color = '#f87171';
    } else if (type === 'success') {
      statusMsg.style.background = 'rgba(16, 185, 129, 0.15)';
      statusMsg.style.border = '1px solid rgba(16, 185, 129, 0.4)';
      statusMsg.style.color = '#34d399';
    } else {
      statusMsg.style.background = 'rgba(59, 130, 246, 0.15)';
      statusMsg.style.border = '1px solid rgba(59, 130, 246, 0.4)';
      statusMsg.style.color = '#60a5fa';
    }
    statusMsg.innerHTML = text;
  }

  async function testAndConnect(targetUrl) {
    let cleanUrl = targetUrl.trim();
    if (!cleanUrl) {
      showStatus('Por favor introduce una dirección URL o IP', 'error');
      return;
    }
    if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
      cleanUrl = 'http://' + cleanUrl;
    }
    // Append default port :3000 if user only typed IP
    if (!cleanUrl.match(/:\d+$/) && !cleanUrl.includes('://localhost') && !cleanUrl.includes('appassets')) {
      cleanUrl = cleanUrl.replace(/\/+$/, '') + ':3000';
    }
    cleanUrl = cleanUrl.replace(/\/+$/, '');

    btnSubmit.disabled = true;
    btnSubmit.innerHTML = `<span class="spinner" style="width:18px;height:18px;"></span> Probando conexión...`;
    showStatus(`Verificando comunicación con <strong>${escapeHtml(cleanUrl)}</strong>...`, 'info');

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);

      const resp = await fetch(`${cleanUrl}/api/network-info`, {
        signal: controller.signal,
        headers: { 'Accept': 'application/json' }
      });
      clearTimeout(timeoutId);

      if (resp.ok) {
        showStatus('¡Conexión establecida con éxito! Cargando catálogo...', 'success');
        localStorage.setItem('animestream_server_url', cleanUrl);

        if (window.AndroidBridge && typeof window.AndroidBridge.connectToServer === 'function') {
          setTimeout(() => {
            window.AndroidBridge.connectToServer(cleanUrl);
          }, 600);
        } else {
          setTimeout(() => {
            window.location.href = cleanUrl;
          }, 800);
        }
        return true;
      } else {
        showStatus(`El servidor respondió con código HTTP ${resp.status}. Asegúrate de que sea AnimeStream.`, 'error');
      }
    } catch (e) {
      showStatus(`No se pudo conectar a <strong>${escapeHtml(cleanUrl)}</strong>. Comprueba la IP y que el PC esté encendido.`, 'error');
    } finally {
      btnSubmit.disabled = false;
      btnSubmit.innerHTML = `<span>🚀 Conectar Ahora</span>`;
    }
    return false;
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    testAndConnect(input.value);
  });

  btnDiscover.addEventListener('click', async () => {
    btnDiscover.disabled = true;
    btnDiscover.innerHTML = `<span class="spinner" style="width:16px;height:16px;"></span> Escaneando red local...`;
    showStatus('Buscando servidor AnimeStream en tu red Wi-Fi...', 'info');

    let baseSubnet = '192.168.1';
    try {
      if (window.AndroidBridge && typeof window.AndroidBridge.getDeviceWifiIp === 'function') {
        const ip = window.AndroidBridge.getDeviceWifiIp();
        if (ip && ip.split('.').length === 4) {
          const p = ip.split('.');
          baseSubnet = `${p[0]}.${p[1]}.${p[2]}`;
        }
      }
    } catch (e) {}

    // Probe common candidate hosts in parallel batches
    const candidateHosts = [];
    // Priority hosts
    for (let i = 2; i <= 60; i++) candidateHosts.push(`http://${baseSubnet}.${i}:3000`);
    for (let i = 100; i <= 150; i++) candidateHosts.push(`http://${baseSubnet}.${i}:3000`);
    // Also try alternative subnets if default was 192.168.1
    if (baseSubnet === '192.168.1') {
      for (let i = 2; i <= 25; i++) candidateHosts.push(`http://192.168.0.${i}:3000`);
    }

    let found = false;
    const batchSize = 10;
    for (let b = 0; b < candidateHosts.length; b += batchSize) {
      if (found) break;
      const batch = candidateHosts.slice(b, b + batchSize);
      showStatus(`Escaneando dispositivos Wi-Fi (${b + 1} de ${candidateHosts.length})...`, 'info');

      const promises = batch.map(url => {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 1200);
        return fetch(`${url}/api/network-info`, { signal: ctrl.signal })
          .then(r => {
            clearTimeout(t);
            if (r.ok) return url;
            throw new Error();
          })
          .catch(() => {
            clearTimeout(t);
            return null;
          });
      });

      const results = await Promise.all(promises);
      const validUrl = results.find(u => u !== null);
      if (validUrl) {
        found = true;
        input.value = validUrl;
        showStatus(`¡Servidor AnimeStream encontrado en <strong>${validUrl}</strong>! Conectando...`, 'success');
        await testAndConnect(validUrl);
        break;
      }
    }

    if (!found) {
      showStatus('No se encontró automáticamente el servidor. Introduce la IP manualmente desde tu PC (botón "Dispositivos").', 'error');
    }
    btnDiscover.disabled = false;
    btnDiscover.innerHTML = `<span>🔍 Buscar Servidor en mi Wi-Fi</span>`;
  });
}
