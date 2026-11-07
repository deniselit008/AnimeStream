/**
 * Video Player View Component (Sala de Reproducción)
 * 16:9 adaptable player, multiple server switcher, next/prev controls, and fallbacks.
 */
import { Api, getApiBase, isStandaloneMode } from '../api.js?v=4.2';
import { Storage } from '../storage.js?v=3.0';
import { Icons, escapeHtml, showToast, getSourceBadgeClass, fixEncoding } from '../utils.js?v=3.0';
import { AdBlock } from '../adblock.js?v=3.0';

let currentWatchKeyDownHandler = null;
let currentIdleCursorTimer = null;
let currentCursorListeners = null;

export function cleanupWatchView() {
  if (currentWatchKeyDownHandler) {
    window.removeEventListener('keydown', currentWatchKeyDownHandler, true);
    currentWatchKeyDownHandler = null;
  }
  if (currentIdleCursorTimer) {
    clearTimeout(currentIdleCursorTimer);
    currentIdleCursorTimer = null;
  }
  if (currentCursorListeners) {
    currentCursorListeners.cleanup();
    currentCursorListeners = null;
  }
  document.body.classList.remove('fullscreen-hide-cursor');
}

export async function renderWatch(container, episodeUrl, queryParams = null) {
  cleanupWatchView();

  const initialImage = (queryParams && queryParams.get('image')) || '';
  const initialTitle = (queryParams && queryParams.get('title')) || '';
  const initialAnimeUrl = (queryParams && queryParams.get('animeUrl')) || '';

  container.innerHTML = `
    <div class="watch-container">
      <div style="display: flex; justify-content: center; padding: 100px 0;">
        <div class="spinner"></div>
      </div>
    </div>
  `;

  try {
    const watchData = await Api.getWatch(episodeUrl);
    if (watchData) {
      watchData.animeTitle = fixEncoding(watchData.animeTitle);
    }
    const allServers = watchData.servers || [];

    // Audio categorization (SUB vs DUB)
    const availableAudios = Array.from(new Set(allServers.map(s => s.audio || 'SUB')));
    let currentAudio = availableAudios.includes('SUB') ? 'SUB' : (availableAudios[0] || 'SUB');

    let currentServerIndex = 0;
    let useProxy = false;
    let isSeen = Storage.isSeen(watchData.url);

    // Save to history automatically with image preserved
    Storage.saveToHistory({
      animeTitle: watchData.animeTitle || initialTitle,
      episode: watchData.episode,
      url: watchData.url,
      animeUrl: watchData.animeUrl || initialAnimeUrl,
      image: watchData.image || initialImage,
      source: watchData.source
    });

    function shouldApplySandbox(serverUrl, serverName) {
      // In Electron desktop app, native Chromium request filtering & setWindowOpenHandler
      // provide 100% popup & ad blocking without breaking video players.
      if (typeof window !== 'undefined' && window.electronAPI && window.electronAPI.isElectron) {
        return false;
      }
      // In Android APK, native WebView client blocks all popup windows, external redirects,
      // and intrusive ad domains at the Java layer.
      // Do NOT apply HTML sandbox attribute on Android so players (VOE, Mega, Mp4Upload, Streamtape, YourUpload, Zilla)
      // can decrypt, load media, and run smoothly without "no permite modo sandbox" or security errors!
      if (typeof window !== 'undefined' && window.AndroidBridge) {
        return false;
      }
      if (!AdBlock.isEnabled()) {
        return false;
      }
      const url = String(serverUrl || '').toLowerCase();
      const name = String(serverName || '').toLowerCase();
      // VOE explicitly fails with "no permite modo sandbox" if sandbox attribute is present
      if (url.includes('voe.') || name.includes('voe')) {
        return false;
      }
      return true;
    }

    function updateIframeSandbox(iframe, serverUrl, serverName) {
      if (!iframe) return;
      if (shouldApplySandbox(serverUrl, serverName)) {
        iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-presentation allow-downloads allow-fullscreen');
      } else {
        iframe.removeAttribute('sandbox');
      }
    }

    function getEmbedUrl(rawEmbedUrl) {
      if (!rawEmbedUrl) return '';
      // Local endpoints (such as /api/hls/player/...) resolved via getApiBase()
      if (rawEmbedUrl.startsWith('/api/')) {
        const base = getApiBase();
        return rawEmbedUrl.replace('/api', base);
      }
      if (rawEmbedUrl.startsWith('/') || rawEmbedUrl.startsWith('data:')) {
        return rawEmbedUrl;
      }
      if (useProxy) {
        const adb = AdBlock.isEnabled() ? '1' : '0';
        return `${getApiBase()}/proxy-player?url=${encodeURIComponent(rawEmbedUrl)}&ref=${encodeURIComponent(watchData.animeUrl || watchData.url)}&adblock=${adb}`;
      }
      return rawEmbedUrl;
    }

    function getVisibleServers() {
      if (availableAudios.length <= 1) return allServers;
      const filtered = allServers.filter(s => (s.audio || 'SUB') === currentAudio);
      return filtered.length > 0 ? filtered : allServers;
    }

    function buildHtml() {
      const visibleServers = getVisibleServers();
      const currentServer = visibleServers[currentServerIndex] || visibleServers[0] || null;
      const embedSrc = currentServer ? getEmbedUrl(currentServer.embed) : '';

      return `
        <!-- Watch Header -->
        <div class="watch-header">
          <div class="watch-title-group">
            <h1 class="watch-title">
              ${escapeHtml(watchData.animeTitle)} <span style="color: var(--accent-primary);">- Episodio ${escapeHtml(String(watchData.episode))}</span>
            </h1>
            <span class="badge ${getSourceBadgeClass(watchData.source)}">
              ${escapeHtml(watchData.source)}
            </span>
          </div>

          <div style="display: flex; gap: 10px; align-items: center;">
            <a href="#/anime?url=${encodeURIComponent(watchData.animeUrl)}" class="btn btn-secondary" style="padding: 8px 14px; font-size: 0.88rem;">
              Ficha del Anime
            </a>
            <!-- Fallback button: Open original website -->
            <a href="${escapeHtml(watchData.url)}" target="_blank" rel="noopener noreferrer" class="btn btn-outline" style="padding: 8px 14px; font-size: 0.88rem;" title="Abrir página original en caso de fallo">
              ${Icons.external} Ver en ${escapeHtml(watchData.source)}
            </a>
          </div>
        </div>

        <!-- 16:9 Adaptable Player Container -->
        <div class="player-wrapper">
          ${embedSrc ? `
            <iframe 
              id="main-player-iframe"
              class="player-iframe" 
              src="${escapeHtml(embedSrc)}" 
              allowfullscreen="true" 
              webkitallowfullscreen="true" 
              mozallowfullscreen="true" 
              allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
              referrerpolicy="no-referrer"
              ${shouldApplySandbox(currentServer?.embed, currentServer?.name) ? 'sandbox="allow-scripts allow-same-origin allow-forms allow-presentation allow-downloads allow-fullscreen"' : ''}
            ></iframe>
          ` : `
            <div class="player-loading-spinner">
              ${Icons.alert}
              <p>No se encontraron servidores de vídeo para este episodio.</p>
              <a href="${escapeHtml(watchData.url)}" target="_blank" class="btn btn-primary">
                Ver en la web oficial
              </a>
            </div>
          `}
        </div>

        <!-- Audio Variants Bar (SUB vs DUB) -->
        ${availableAudios.length > 1 ? `
          <div class="audio-tabs-bar" style="display: flex; align-items: center; gap: 10px; margin-top: 14px; padding: 6px 14px; background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-sm);">
            <span style="font-size: 0.84rem; font-weight: 600; color: var(--text-muted); display: flex; align-items: center; gap: 6px;">
              🎧 Idioma / Audio:
            </span>
            <div style="display: flex; gap: 6px;">
              <button 
                class="audio-tab-btn btn btn-xs ${currentAudio === 'SUB' ? 'btn-primary' : 'btn-secondary'}" 
                data-audio="SUB"
                style="padding: 5px 12px; font-size: 0.82rem; border-radius: 6px;"
              >
                🇯🇵 Subtitulado (SUB)
              </button>
              <button 
                class="audio-tab-btn btn btn-xs ${currentAudio === 'DUB' ? 'btn-primary' : 'btn-secondary'}" 
                data-audio="DUB"
                style="padding: 5px 12px; font-size: 0.82rem; border-radius: 6px;"
              >
                🇲🇽/🇪🇸 Doblado (DUB)
              </button>
            </div>
          </div>
        ` : ''}

        <!-- Server Selector Tabs -->
        <div class="server-tabs-bar" style="margin-top: 12px;">
          <span class="server-tab-label">Servidores (${visibleServers.length}):</span>
          <div id="servers-buttons-container" style="display: flex; flex-wrap: wrap; gap: 8px;">
            ${visibleServers.map((server, idx) => {
              const cleanName = server.name.replace(/^\[(SUB|DUB)\]\s*/i, '');
              const audioBadge = server.audio ? `[${escapeHtml(server.audio)}] ` : '';
              return `
                <button 
                  class="server-tab ${idx === currentServerIndex ? 'active' : ''}" 
                  data-index="${idx}"
                  title="Cambiar al servidor ${escapeHtml(server.name)}"
                >
                  ${audioBadge}${escapeHtml(cleanName)}
                </button>
              `;
            }).join('')}
          </div>

          ${currentServer ? `
            <div style="margin-left: auto; display: flex; align-items: center; gap: 8px;">
              <!-- Cinema Mode Toggle -->
              <button 
                id="btn-toggle-cinema" 
                class="btn btn-outline" 
                style="padding: 4px 10px; font-size: 0.8rem; display: inline-flex; align-items: center; gap: 5px;"
                title="Modo Cine (expande el reproductor) [Tecla C]"
              >
                <span>🎬 Modo Cine</span>
              </button>

              <!-- Fullscreen Toggle -->
              <button 
                id="btn-toggle-fullscreen" 
                class="btn btn-outline" 
                style="padding: 4px 10px; font-size: 0.8rem; display: inline-flex; align-items: center; gap: 5px;"
                title="Pantalla Completa [Tecla F]"
              >
                <span>⛶ Pantalla Completa</span>
              </button>

              <!-- Open Embed directly in new tab -->
              <a 
                id="link-open-new-tab"
                href="${escapeHtml(currentServer.embed)}" 
                target="_blank" 
                rel="noopener noreferrer" 
                class="btn btn-outline" 
                style="padding: 4px 10px; font-size: 0.8rem;" 
                title="Abrir este reproductor en pestaña externa"
              >
                ${Icons.external} Pestaña nueva
              </a>

              <!-- AdBlock Shield Status / Modal Toggle -->
              <button 
                id="btn-player-adblock" 
                class="btn btn-outline ${AdBlock.isEnabled() ? 'active' : ''}" 
                style="padding: 4px 10px; font-size: 0.8rem; display: inline-flex; align-items: center; gap: 5px;"
                title="Escudo AdBlock: Bloquea anuncios, ventanas emergentes y redirecciones externas"
              >
                ${AdBlock.isEnabled() ? Icons.shieldCheck : Icons.shield}
                <span>AdBlock ${AdBlock.isEnabled() ? 'ON' : 'OFF'}</span>
              </button>

              <!-- Proxy Mode Toggle (Visible solo con servidor PC/Remoto) -->
              ${!isStandaloneMode() ? `
              <button 
                id="btn-toggle-proxy" 
                class="btn btn-outline ${useProxy ? 'active' : ''}" 
                style="padding: 4px 10px; font-size: 0.8rem;"
                title="Activar en caso de pantalla negra o error 403 de hotlinking"
              >
                ${useProxy ? 'Proxy ON' : 'Proxy OFF'}
              </button>
              ` : ''}
            </div>
          ` : ''}
        </div>

        <!-- Navigation Controls Bar -->
        <div class="watch-controls-bar">
          <div class="watch-nav-btns">
            <!-- Prev Episode -->
            ${watchData.prevUrl ? `
              <a id="btn-prev-ep" href="#/watch?url=${encodeURIComponent(watchData.prevUrl)}" class="btn btn-secondary">
                ${Icons.arrowLeft} Episodio Anterior
              </a>
            ` : `
              <button id="btn-prev-ep" class="btn btn-secondary" disabled style="opacity: 0.4; cursor: not-allowed;">
                ${Icons.arrowLeft} Primer Episodio
              </button>
            `}

            <!-- Next Episode -->
            ${watchData.nextUrl ? `
              <a id="btn-next-ep" href="#/watch?url=${encodeURIComponent(watchData.nextUrl)}" class="btn btn-primary">
                Episodio Siguiente ${Icons.arrowRight}
              </a>
            ` : `
              <button id="btn-next-ep" class="btn btn-secondary" disabled style="opacity: 0.4; cursor: not-allowed;">
                Último Episodio
              </button>
            `}
          </div>

          <!-- Mark Seen Button -->
          <button class="btn btn-outline" id="btn-toggle-seen">
            ${Icons.check} <span id="seen-text">${isSeen ? 'Marcar como No Visto' : 'Marcar como Visto'}</span>
          </button>
        </div>
      `;
    }

    container.innerHTML = buildHtml();

    function attachEvents() {
      const visibleServers = getVisibleServers();

      // Audio Tabs (SUB vs DUB)
      const audioBtns = container.querySelectorAll('.audio-tab-btn');
      audioBtns.forEach(btn => {
        btn.addEventListener('click', () => {
          const selectedAudio = btn.dataset.audio;
          if (selectedAudio !== currentAudio) {
            currentAudio = selectedAudio;
            currentServerIndex = 0;
            container.innerHTML = buildHtml();
            attachEvents();
            showToast(`Cambiado a versión: ${selectedAudio === 'DUB' ? 'Doblada (Español)' : 'Subtitulada (SUB)'}`, 'info');
          }
        });
      });

      // Server switching tabs
      const serverBtns = container.querySelectorAll('.server-tab');
      serverBtns.forEach(btn => {
        btn.addEventListener('click', () => {
          const idx = parseInt(btn.dataset.index, 10);
          const vServers = getVisibleServers();
          if (idx !== currentServerIndex && vServers[idx]) {
            currentServerIndex = idx;
            const iframe = container.querySelector('#main-player-iframe');
            if (iframe) {
              updateIframeSandbox(iframe, vServers[idx].embed, vServers[idx].name);
              iframe.src = getEmbedUrl(vServers[idx].embed);
              serverBtns.forEach(b => b.classList.remove('active'));
              btn.classList.add('active');
              
              const newTabLink = container.querySelector('#link-open-new-tab');
              if (newTabLink) newTabLink.href = vServers[idx].embed;

              showToast(`Cambiado a servidor: ${vServers[idx].name}`, 'info');
            }
          }
        });
      });

      // Proxy toggle button
      const proxyBtn = container.querySelector('#btn-toggle-proxy');
      if (proxyBtn) {
        proxyBtn.addEventListener('click', () => {
          if (isStandaloneMode()) {
            showToast('El modo Proxy requiere conexión con un servidor PC. En móvil autónomo se reproduce directamente.', 'info');
            return;
          }
          useProxy = !useProxy;
          proxyBtn.textContent = useProxy ? 'Proxy ON' : 'Proxy OFF';
          if (useProxy) {
            proxyBtn.classList.add('active');
            showToast('Modo Proxy activado (eludirá bloqueos de referer y CORS)', 'info');
          } else {
            proxyBtn.classList.remove('active');
            showToast('Modo Proxy desactivado', 'info');
          }
          const iframe = container.querySelector('#main-player-iframe');
          const vServers = getVisibleServers();
          if (iframe && vServers[currentServerIndex]) {
            const nextSrc = getEmbedUrl(vServers[currentServerIndex].embed);
            iframe.src = nextSrc;
            const newTabLink = container.querySelector('#link-open-new-tab');
            if (newTabLink) newTabLink.href = vServers[currentServerIndex].embed;
          }
        });
      }

      // AdBlock shield button in player toolbar
      const adblockBtn = container.querySelector('#btn-player-adblock');
      if (adblockBtn) {
        adblockBtn.addEventListener('click', (e) => {
          e.preventDefault();
          if (typeof AdBlock.openModal === 'function') {
            AdBlock.openModal();
          } else if (typeof AdBlock.showModal === 'function') {
            AdBlock.showModal();
          }
        });

        // Keep player button reactive to AdBlock toggles
        window.addEventListener('animestream-adblock-change', (e) => {
          const btn = container.querySelector('#btn-player-adblock');
          if (btn && e.detail) {
            const isAct = e.detail.enabled;
            if (isAct) {
              btn.classList.add('active');
            } else {
              btn.classList.remove('active');
            }
            btn.innerHTML = `${isAct ? Icons.shieldCheck : Icons.shield} <span>AdBlock ${isAct ? 'ON' : 'OFF'}</span>`;

            // Update iframe sandbox and reload if proxy is active
            const iframe = container.querySelector('#main-player-iframe');
            const vServers = getVisibleServers();
            if (iframe && vServers[currentServerIndex]) {
              updateIframeSandbox(iframe, vServers[currentServerIndex].embed, vServers[currentServerIndex].name);
              if (useProxy) {
                iframe.src = getEmbedUrl(vServers[currentServerIndex].embed);
              }
            }
          }
        });
      }

      // Cinema Mode toggle
      const cinemaBtn = container.querySelector('#btn-toggle-cinema');
      const watchWrap = container.querySelector('.watch-container') || container;
      if (cinemaBtn) {
        cinemaBtn.addEventListener('click', () => {
          const isCinema = watchWrap.classList.toggle('cinema-mode');
          cinemaBtn.classList.toggle('active', isCinema);
          cinemaBtn.innerHTML = isCinema ? '<span>🎬 Modo Normal</span>' : '<span>🎬 Modo Cine</span>';
          showToast(isCinema ? 'Modo Cine activado' : 'Modo Cine desactivado', 'info');
        });
      }

      // Fullscreen toggle
      const fsBtn = container.querySelector('#btn-toggle-fullscreen');
      const playerWrapper = container.querySelector('.player-wrapper');
      if (fsBtn && playerWrapper) {
        fsBtn.addEventListener('click', () => {
          if (!document.fullscreenElement) {
            playerWrapper.requestFullscreen().catch(() => {
              const iframe = container.querySelector('#main-player-iframe');
              if (iframe && iframe.requestFullscreen) iframe.requestFullscreen();
            });
          } else {
            document.exitFullscreen().catch(() => {});
          }
        });
      }

      // Sync player volume & clean ads when iframe loads
      const iframe = container.querySelector('#main-player-iframe');
      if (iframe) {
        iframe.addEventListener('load', () => {
          // Clean transparent clickjacking overlays if reachable
          AdBlock.cleanThirdPartyPlayer(iframe);

          try {
            const win = iframe.contentWindow;
            const savedVol = Storage.getPlayerVolume();
            if (win && win.video) {
              win.video.volume = savedVol;
            }
          } catch (e) {}
        });
      }

      // Seen button
      const seenBtn = container.querySelector('#btn-toggle-seen');
      if (seenBtn) {
        seenBtn.addEventListener('click', () => {
          isSeen = Storage.toggleSeen(watchData.url);
          container.querySelector('#seen-text').textContent = isSeen ? 'Marcar como No Visto' : 'Marcar como Visto';
          showToast(isSeen ? 'Episodio marcado como visto ✓' : 'Episodio marcado como no visto', 'success');
        });
      }
    }

    attachEvents();

    // Setup Cursor Auto-Hide for Player & Fullscreen
    const playerWrapper = container.querySelector('.player-wrapper');
    if (playerWrapper) {
      const showCursor = () => {
        playerWrapper.classList.remove('hide-cursor');
        document.body.classList.remove('fullscreen-hide-cursor');
        if (currentIdleCursorTimer) {
          clearTimeout(currentIdleCursorTimer);
        }
        currentIdleCursorTimer = setTimeout(() => {
          playerWrapper.classList.add('hide-cursor');
          if (document.fullscreenElement) {
            document.body.classList.add('fullscreen-hide-cursor');
          }
        }, 2500);
      };

      const onMouseLeave = () => {
        if (!document.fullscreenElement) {
          if (currentIdleCursorTimer) {
            clearTimeout(currentIdleCursorTimer);
            currentIdleCursorTimer = null;
          }
          playerWrapper.classList.remove('hide-cursor');
          document.body.classList.remove('fullscreen-hide-cursor');
        }
      };

      playerWrapper.addEventListener('mousemove', showCursor);
      playerWrapper.addEventListener('mousedown', showCursor);
      playerWrapper.addEventListener('touchstart', showCursor, { passive: true });
      playerWrapper.addEventListener('mouseleave', onMouseLeave);

      const onFullscreenChange = () => {
        showCursor();
        if (!document.fullscreenElement) {
          document.body.classList.remove('fullscreen-hide-cursor');
        }
      };
      document.addEventListener('fullscreenchange', onFullscreenChange);

      currentCursorListeners = {
        cleanup: () => {
          playerWrapper.removeEventListener('mousemove', showCursor);
          playerWrapper.removeEventListener('mousedown', showCursor);
          playerWrapper.removeEventListener('touchstart', showCursor);
          playerWrapper.removeEventListener('mouseleave', onMouseLeave);
          document.removeEventListener('fullscreenchange', onFullscreenChange);
        }
      };

      // Start initial cursor hide timer
      showCursor();
    }

    // Global keyboard listener for player controls (Volume ±5% & Seek ±10s)
    const handleKeyDown = (e) => {
      // 1. Never intercept if modifier keys are pressed (Ctrl, Alt, Meta/Windows/Command)
      // This protects ALL system and browser shortcuts (Ctrl+C, Ctrl+F, Ctrl+N, Ctrl+P, Alt+Left, Alt+F4, Ctrl+W, etc.)
      if (e.ctrlKey || e.altKey || e.metaKey) {
        return;
      }

      // 2. Don't intercept if user is typing in form controls or editable areas
      const activeEl = document.activeElement;
      if (activeEl && (['INPUT', 'TEXTAREA', 'SELECT'].indexOf(activeEl.tagName) !== -1 || activeEl.isContentEditable)) {
        return;
      }

      const k = e.key || e.code;
      const keyCode = e.keyCode || e.which;

      // Smart TV Remote Back key (VIDAA 461, Tizen 10009): delegate to TVNavigation
      if (keyCode === 461 || keyCode === 10009) {
        return;
      }

      // Do not intercept F11 (let native browser/Electron menu handle fullscreen)
      if (k === 'F11' || keyCode === 122) {
        return;
      }

      // If TV mode is active or user is currently focused on interactive UI (buttons, server tabs, links),
      // allow arrow keys to perform spatial navigation instead of intercepting them for volume/seek.
      const isArrow = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].indexOf(k) !== -1 || (keyCode >= 37 && keyCode <= 40);
      const isTvMode = document.body.classList.contains('tv-mode');
      const isNavigatingUI = activeEl && (
        activeEl.tagName === 'BUTTON' ||
        activeEl.tagName === 'A' ||
        activeEl.classList.contains('tv-focused') ||
        activeEl.classList.contains('server-tab') ||
        activeEl.classList.contains('btn')
      );

      if (isArrow && (isTvMode || isNavigatingUI)) {
        const isPlayerFocused = activeEl && (activeEl.id === 'main-player-iframe' || activeEl.closest('.player-wrapper'));
        if (!isPlayerFocused) {
          return; // Let spatial navigation engine handle moving focus
        }
      }

      if ((k === ' ' || e.code === 'Space') && isNavigatingUI) {
        return; // Let native button click handle space
      }

      // Keyboard shortcuts: C (Cinema Mode), F (Fullscreen), N (Next Ep), P (Prev Ep)
      if ((k === 'c' || k === 'C') && !isNavigatingUI) {
        e.preventDefault();
        const cinemaBtn = container.querySelector('#btn-toggle-cinema');
        if (cinemaBtn) cinemaBtn.click();
        return;
      }
      if ((k === 'f' || k === 'F') && !isNavigatingUI) {
        e.preventDefault();
        const fsBtn = container.querySelector('#btn-toggle-fullscreen');
        if (fsBtn) fsBtn.click();
        return;
      }
      if ((k === 'n' || k === 'N') && !isNavigatingUI && watchData.nextUrl) {
        e.preventDefault();
        window.location.hash = `#/watch?url=${encodeURIComponent(watchData.nextUrl)}`;
        return;
      }
      if ((k === 'p' || k === 'P') && !isNavigatingUI && watchData.prevUrl) {
        e.preventDefault();
        window.location.hash = `#/watch?url=${encodeURIComponent(watchData.prevUrl)}`;
        return;
      }

      let cmd = null;
      let deltaVol = 0;
      let deltaSeek = 0;

      if (k === 'ArrowUp' || e.code === 'ArrowUp') {
        cmd = 'volume_up';
        deltaVol = 0.05;
      } else if (k === 'ArrowDown' || e.code === 'ArrowDown') {
        cmd = 'volume_down';
        deltaVol = -0.05;
      } else if (k === 'ArrowRight' || e.code === 'ArrowRight') {
        cmd = 'seek_forward';
        deltaSeek = 10;
      } else if (k === 'ArrowLeft' || e.code === 'ArrowLeft') {
        cmd = 'seek_backward';
        deltaSeek = -10;
      } else if (k === ' ' || e.code === 'Space') {
        cmd = 'toggle_play';
      } else if (k === 'm' || k === 'M' || e.code === 'KeyM') {
        cmd = 'toggle_mute';
      }

      if (cmd) {
        e.preventDefault();
        e.stopPropagation();

        const iframe = container.querySelector('#main-player-iframe');
        if (iframe) {
          let directCallSucceeded = false;
          try {
            const win = iframe.contentWindow;
            if (win) {
              if (deltaVol !== 0 && typeof win.changeVolume === 'function') {
                win.changeVolume(deltaVol);
                directCallSucceeded = true;
              } else if (deltaSeek !== 0 && typeof win.seekRelative === 'function') {
                win.seekRelative(deltaSeek);
                directCallSucceeded = true;
              } else if (cmd === 'toggle_play' && typeof win.togglePlay === 'function') {
                win.togglePlay();
                directCallSucceeded = true;
              } else if (cmd === 'toggle_mute' && typeof win.toggleMute === 'function') {
                win.toggleMute();
                directCallSucceeded = true;
              }
            }
          } catch (err) {}

          if (!directCallSucceeded && iframe.contentWindow) {
            iframe.contentWindow.postMessage({ type: 'PLAYER_CMD', cmd }, '*');
          }
        }
      }
    };

    currentWatchKeyDownHandler = handleKeyDown;
    window.addEventListener('keydown', currentWatchKeyDownHandler, true);

  } catch (err) {
    container.innerHTML = `
      <div class="alert-banner error" style="margin-top: 40px;">
        <div>
          ${Icons.alert} <strong>No se pudo cargar el episodio:</strong> ${escapeHtml(err.message)}
        </div>
        <div style="display: flex; gap: 10px;">
          <a href="${escapeHtml(episodeUrl)}" target="_blank" rel="noopener noreferrer" class="btn btn-secondary">
            ${Icons.external} Ver en la web original
          </a>
          <button class="btn btn-primary" onclick="window.history.back()">Volver</button>
        </div>
      </div>
    `;
  }
}
