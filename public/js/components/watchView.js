/**
 * Video Player View Component (Sala de Reproducción)
 * 16:9 adaptable player, multiple server switcher, next/prev controls, and fallbacks.
 */
import { Api, getApiBase, isStandaloneMode } from '../api.js?v=5.0';
import { Storage } from '../storage.js?v=5.0';
import { Icons, escapeHtml, showToast, getSourceBadgeClass, fixEncoding, formatTime, resolveAnimeCover, safeHttpUrl } from '../utils.js?v=5.0';
import { AdBlock } from '../adblock.js?v=5.0';

let currentWatchKeyDownHandler = null;
let currentIdleCursorTimer = null;
let currentCursorListeners = null;
let currentCleanPlayerInterval = null;
let currentAdblockChangeListener = null;
let currentPlayerMessageListener = null;
let currentAutoPlayCountdownTimer = null;
let currentVideoPollInterval = null;
let currentResumeBannerTimer = null;
let currentHudTimer = null;
let currentSpeedCloseListener = null;
let currentUnloadHandler = null;

let lastActiveWatchUrl = null;
let lastActiveCurrentTime = 0;
let lastActiveDuration = 0;
let lastActiveAnimeTitle = '';
let lastActiveEpisode = '';
let activeWatchToken = 0;

export function cleanupWatchView() {
  activeWatchToken++;
  if (lastActiveWatchUrl && lastActiveCurrentTime >= 5) {
    Storage.savePlaybackPosition(lastActiveWatchUrl, lastActiveCurrentTime, lastActiveDuration, lastActiveAnimeTitle, lastActiveEpisode);
  }
  lastActiveWatchUrl = null;
  lastActiveCurrentTime = 0;
  lastActiveDuration = 0;

  if (currentUnloadHandler) {
    window.removeEventListener('beforeunload', currentUnloadHandler);
    window.removeEventListener('pagehide', currentUnloadHandler);
    currentUnloadHandler = null;
  }

  if (currentAutoPlayCountdownTimer) {
    clearInterval(currentAutoPlayCountdownTimer);
    currentAutoPlayCountdownTimer = null;
  }
  if (currentVideoPollInterval) {
    clearInterval(currentVideoPollInterval);
    currentVideoPollInterval = null;
  }
  if (currentResumeBannerTimer) {
    clearTimeout(currentResumeBannerTimer);
    currentResumeBannerTimer = null;
  }
  if (currentHudTimer) {
    clearTimeout(currentHudTimer);
    currentHudTimer = null;
  }
  if (currentSpeedCloseListener) {
    document.removeEventListener('click', currentSpeedCloseListener);
    currentSpeedCloseListener = null;
  }
  if (currentPlayerMessageListener) {
    window.removeEventListener('message', currentPlayerMessageListener);
    currentPlayerMessageListener = null;
  }
  if (currentCleanPlayerInterval) {
    clearInterval(currentCleanPlayerInterval);
    currentCleanPlayerInterval = null;
  }
  if (currentAdblockChangeListener) {
    window.removeEventListener('animestream-adblock-change', currentAdblockChangeListener);
    currentAdblockChangeListener = null;
  }
  try {
    const iframe = document.getElementById('main-player-iframe');
    if (iframe) {
      iframe.src = 'about:blank';
      iframe.remove();
    }
  } catch (_) {}
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

  const mount = document.getElementById('main-content-mount');
  if (mount) mount.classList.remove('cinema-mode');
  const watchWrap = document.querySelector('.watch-container');
  if (watchWrap) watchWrap.classList.remove('cinema-mode');
}

export async function renderWatch(container, episodeUrl, queryParams = null) {
  cleanupWatchView();
  const myWatchToken = activeWatchToken;

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
    if (myWatchToken !== activeWatchToken) return;
    if (watchData) {
      watchData.animeTitle = fixEncoding(watchData.animeTitle);
      const isBadImg = !watchData.image || 
        typeof watchData.image !== 'string' ||
        watchData.image.toLowerCase().includes('/assets/img/logo') ||
        watchData.image.toLowerCase().includes('/logo.png') ||
        watchData.image.toLowerCase().includes('/logo-dark') ||
        watchData.image.toLowerCase().includes('/logo-light') ||
        watchData.image.includes('placeholder.com');
      if (isBadImg) {
        if (initialImage && !initialImage.toLowerCase().includes('logo') && !initialImage.startsWith('data:')) {
          watchData.image = initialImage;
        } else {
          const resolved = resolveAnimeCover({
            image: null,
            animeTitle: watchData.animeTitle || initialTitle,
            title: watchData.animeTitle || initialTitle,
            url: watchData.url || episodeUrl,
            animeUrl: watchData.animeUrl || initialAnimeUrl,
            source: watchData.source
          });
          if (resolved && !resolved.startsWith('data:')) {
            watchData.image = resolved;
          }
        }
      }
    }
    const allServers = watchData.servers || [];

    // Audio categorization (SUB vs DUB)
    const availableAudios = Array.from(new Set(allServers.map(s => s.audio || 'SUB')));
    let currentAudio = availableAudios.includes('SUB') ? 'SUB' : (availableAudios[0] || 'SUB');

    let currentServerIndex = 0;
    let useProxy = false;
    let isSeen = Storage.isSeen(watchData.url);

    lastActiveWatchUrl = watchData.url;
    lastActiveAnimeTitle = watchData.animeTitle || initialTitle;
    lastActiveEpisode = String(watchData.episode || '');

    let currentPlaybackRate = Storage.getPlaybackSpeed();
    let hasResumed = false;
    let hasAppliedLocalResume = false;
    let iframeHasLoaded = false;
    let isCinemaActive = false;
    let autoPlayCountdownActive = false;
    let autoPlayCancelled = false;
    let autoPlayCountdownSeconds = 5;
    let lastPositionPersistTime = 0;

    function persistPosition(force = false) {
      const now = Date.now();
      if (force || now - lastPositionPersistTime >= 2500) {
        lastPositionPersistTime = now;
        if (lastActiveWatchUrl && lastActiveCurrentTime >= 5) {
          Storage.savePlaybackPosition(lastActiveWatchUrl, lastActiveCurrentTime, lastActiveDuration, lastActiveAnimeTitle, lastActiveEpisode);
        }
      }
    }

    if (currentUnloadHandler) {
      window.removeEventListener('beforeunload', currentUnloadHandler);
      window.removeEventListener('pagehide', currentUnloadHandler);
    }
    currentUnloadHandler = () => {
      persistPosition(true);
    };
    window.addEventListener('beforeunload', currentUnloadHandler);
    window.addEventListener('pagehide', currentUnloadHandler);

    function showPlayerHUD(text) {
      const hud = container.querySelector('#player-screen-hud');
      const hudText = container.querySelector('#player-hud-text');
      if (hud && hudText) {
        hudText.textContent = text;
        hud.classList.add('visible');
        if (currentHudTimer) clearTimeout(currentHudTimer);
        currentHudTimer = setTimeout(() => {
          if (hud) hud.classList.remove('visible');
        }, 1200);
      }
    }

    function findVideo() {
      try {
        const iframe = container.querySelector('#main-player-iframe');
        if (!iframe) return null;
        const win = iframe.contentWindow;
        if (!win) return null;
        if (win.video && win.video.tagName === 'VIDEO') return win.video;
        const doc = iframe.contentDocument || win.document;
        if (doc) {
          const v = doc.querySelector('video');
          if (v) return v;
        }
      } catch (_) {}
      return null;
    }

    function sendPlayerCmd(cmd, payload = {}) {
      const v = findVideo();
      let handled = false;
      if (v) {
        try {
          const cur = (isFinite(v.currentTime) && v.currentTime >= 0) ? v.currentTime : 0;
          const dur = (isFinite(v.duration) && v.duration > 0) ? v.duration : 999999;

          if (cmd === 'seek_relative') {
            const s = payload.seconds !== undefined ? payload.seconds : (payload.delta !== undefined ? payload.delta : 10);
            const numS = isFinite(s) ? s : 10;
            v.currentTime = Math.max(0, Math.min(dur, cur + numS));
            handled = true;
          } else if (cmd === 'seek_to') {
            const target = (payload.seconds !== undefined && isFinite(payload.seconds) && payload.seconds >= 0) ? payload.seconds : 0;
            if (v.readyState >= 1) {
              v.currentTime = Math.max(0, Math.min(dur, target));
            } else {
              v.addEventListener('loadedmetadata', () => {
                const d2 = (isFinite(v.duration) && v.duration > 0) ? v.duration : 999999;
                v.currentTime = Math.max(0, Math.min(d2, target));
              }, { once: true });
            }
            handled = true;
          } else if (cmd === 'set_rate') {
            const r = parseFloat(payload.rate);
            v.playbackRate = (isFinite(r) && r > 0) ? r : 1.0;
            handled = true;
          } else if (cmd === 'toggle_play') {
            if (v.paused) v.play().catch(() => {}); else v.pause();
            handled = true;
          } else if (cmd === 'toggle_mute') {
            v.muted = !v.muted;
            handled = true;
          } else if (cmd === 'volume_up') {
            const curVol = isFinite(v.volume) ? v.volume : 1;
            v.volume = Math.min(1, Math.round((curVol + 0.05) * 100) / 100);
            Storage.setPlayerVolume(v.volume);
            handled = true;
          } else if (cmd === 'volume_down') {
            const curVol = isFinite(v.volume) ? v.volume : 1;
            v.volume = Math.max(0, Math.round((curVol - 0.05) * 100) / 100);
            Storage.setPlayerVolume(v.volume);
            handled = true;
          }
        } catch (_) {}
      }

      try {
        const iframe = container.querySelector('#main-player-iframe');
        if (iframe && iframe.contentWindow) {
          iframe.contentWindow.postMessage({ type: 'PLAYER_CMD', cmd, ...payload }, '*');
        }
      } catch (_) {}

      return handled;
    }

    function skipOpEd(seconds = 85) {
      sendPlayerCmd('seek_relative', { seconds, delta: seconds });
      showPlayerHUD(`⏩ +${seconds}s (Opening saltado)`);
      showToast(`⏩ Saltados ${seconds}s de Opening/Ending`, 'info', 2000);

      const floatBtn = container.querySelector('#player-floating-skip-op');
      if (floatBtn) {
        floatBtn.style.transform = 'scale(0.92)';
        setTimeout(() => { if (floatBtn) floatBtn.style.transform = ''; }, 150);
      }
    }

    function changePlaybackSpeed(rate) {
      const num = parseFloat(rate) || 1.0;
      currentPlaybackRate = num;
      Storage.setPlaybackSpeed(num);
      sendPlayerCmd('set_rate', { rate: num });

      const label = container.querySelector('#current-speed-text');
      if (label) label.textContent = `${num}x`;

      const menuItems = container.querySelectorAll('.speed-menu-item');
      menuItems.forEach(item => {
        const r = parseFloat(item.dataset.speed);
        item.classList.toggle('active', r === num);
      });

      const menu = container.querySelector('#speed-dropdown-menu');
      if (menu) menu.style.display = 'none';

      showPlayerHUD(`⚡ Velocidad: ${num}x`);
      showToast(`⚡ Velocidad cambiada a ${num}x`, 'info', 1800);
    }

    function triggerAutoPlayCountdown() {
      if (!watchData.nextUrl || autoPlayCountdownActive || autoPlayCancelled) return;
      autoPlayCountdownActive = true;
      autoPlayCountdownSeconds = 5;

      const overlay = container.querySelector('#player-next-countdown-overlay');
      if (!overlay) return;
      overlay.style.display = 'block';

      const numEl = overlay.querySelector('#countdown-number');
      const circleEl = overlay.querySelector('#countdown-progress-bar');

      const updateCircle = (sec) => {
        if (numEl) numEl.textContent = String(sec);
        if (circleEl) {
          const pct = Math.round(((5 - sec) / 5) * 100);
          circleEl.setAttribute('stroke-dasharray', `${pct}, 100`);
        }
      };

      updateCircle(5);

      if (currentAutoPlayCountdownTimer) clearInterval(currentAutoPlayCountdownTimer);
      currentAutoPlayCountdownTimer = setInterval(() => {
        autoPlayCountdownSeconds--;
        if (autoPlayCountdownSeconds <= 0) {
          clearInterval(currentAutoPlayCountdownTimer);
          currentAutoPlayCountdownTimer = null;
          Storage.markSeen(watchData.url, true);
          Storage.clearPlaybackPosition(watchData.url);
          lastActiveWatchUrl = null;
          lastActiveCurrentTime = 0;
          if (overlay) overlay.style.display = 'none';
          window.location.hash = `#/watch?url=${encodeURIComponent(watchData.nextUrl)}&image=${encodeURIComponent(watchData.image || initialImage)}&title=${encodeURIComponent(watchData.animeTitle || initialTitle)}&animeUrl=${encodeURIComponent(watchData.animeUrl || initialAnimeUrl)}`;
        } else {
          updateCircle(autoPlayCountdownSeconds);
        }
      }, 1000);
    }

    function cancelAutoPlayCountdown() {
      autoPlayCancelled = true;
      autoPlayCountdownActive = false;
      if (currentAutoPlayCountdownTimer) {
        clearInterval(currentAutoPlayCountdownTimer);
        currentAutoPlayCountdownTimer = null;
      }
      const overlay = container.querySelector('#player-next-countdown-overlay');
      if (overlay) overlay.style.display = 'none';
      showToast('Reproducción automática cancelada', 'info', 2000);
    }

    function checkAndApplyResume(v) {
      if (!v && !iframeHasLoaded) return;
      if (v && hasAppliedLocalResume) return;
      if (!v && hasResumed) return;

      const pos = Storage.getPlaybackPosition(watchData.url);
      if (!pos || pos.currentTime < 10) return;

      const resumeSeconds = pos.currentTime;
      const shouldShowBanner = !hasResumed;
      hasResumed = true;
      if (v) hasAppliedLocalResume = true;

      const performSeek = () => {
        try {
          if (v) {
            const dur = (isFinite(v.duration) && v.duration > 0) ? v.duration : 999999;
            v.currentTime = Math.max(0, Math.min(dur, resumeSeconds));
          }
        } catch (_) {}
        sendPlayerCmd('seek_to', { seconds: resumeSeconds });
      };

      if (v) {
        if (v.readyState >= 1) {
          performSeek();
        } else {
          v.addEventListener('loadedmetadata', performSeek, { once: true });
          v.addEventListener('canplay', performSeek, { once: true });
        }
      } else {
        performSeek();
      }

      if (!shouldShowBanner) return;

      // Show floating resume banner
      const banner = container.querySelector('#player-resume-banner');
      const timeEl = container.querySelector('#resume-time-text');
      if (banner && timeEl) {
        timeEl.textContent = formatTime(resumeSeconds);
        banner.style.display = 'block';

        if (currentResumeBannerTimer) clearTimeout(currentResumeBannerTimer);
        currentResumeBannerTimer = setTimeout(() => {
          if (banner) {
            banner.style.opacity = '0';
            banner.style.transition = 'opacity 0.4s ease';
            setTimeout(() => {
              banner.style.display = 'none';
              banner.style.opacity = '1';
            }, 400);
          }
        }, 6000);
      }
    }

    function handleTimeUpdate(currentTime, duration, playbackRate) {
      if (isFinite(currentTime) && currentTime > 0) {
        lastActiveCurrentTime = currentTime;
      }
      if (isFinite(duration) && duration > 0) {
        lastActiveDuration = duration;
      }

      persistPosition(false);

      // Check Auto-Play threshold: video has <= 5 seconds remaining
      if (watchData.nextUrl && lastActiveDuration > 30 && lastActiveCurrentTime >= lastActiveDuration - 5 && !autoPlayCountdownActive && !autoPlayCancelled) {
        triggerAutoPlayCountdown();
      }

      // If user seeks backwards past the 8-second mark from the end, cancel countdown
      if (autoPlayCountdownActive && lastActiveDuration > 30 && lastActiveCurrentTime < lastActiveDuration - 8) {
        if (currentAutoPlayCountdownTimer) {
          clearInterval(currentAutoPlayCountdownTimer);
          currentAutoPlayCountdownTimer = null;
        }
        autoPlayCountdownActive = false;
        const overlay = container.querySelector('#player-next-countdown-overlay');
        if (overlay) overlay.style.display = 'none';
      }
      // If user seeks backward significantly, reset autoPlayCancelled so auto-play can trigger when reaching end again
      if (autoPlayCancelled && lastActiveDuration > 30 && lastActiveCurrentTime < lastActiveDuration - 15) {
        autoPlayCancelled = false;
      }
    }

    function handleVideoEnded() {
      lastActiveCurrentTime = 0;
      Storage.markSeen(watchData.url, true);
      Storage.clearPlaybackPosition(watchData.url);
      Storage.updateHistoryProgress(watchData.url, 0, lastActiveDuration, 1.0);
      if (watchData.nextUrl && !autoPlayCancelled) {
        triggerAutoPlayCountdown();
      }
    }

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
      if (!rawEmbedUrl || typeof rawEmbedUrl !== 'string') return '';
      let cleanUrl = rawEmbedUrl.trim();
      if (cleanUrl.startsWith('//')) cleanUrl = 'https:' + cleanUrl;
      // Local endpoints (such as /api/hls/player/...) resolved via getApiBase()
      if (cleanUrl.startsWith('/api/')) {
        const base = getApiBase();
        return cleanUrl.replace('/api', base);
      }
      if (!/^https?:\/\//i.test(cleanUrl)) {
        return '';
      }
      if (useProxy) {
        const adb = AdBlock.isEnabled() ? '1' : '0';
        return `${getApiBase()}/proxy-player?url=${encodeURIComponent(cleanUrl)}&ref=${encodeURIComponent(watchData.animeUrl || watchData.url)}&adblock=${adb}`;
      }
      return cleanUrl;
    }

    function getExternalTabUrl(rawEmbedUrl) {
      if (!rawEmbedUrl || typeof rawEmbedUrl !== 'string') return '#';
      const trimmed = rawEmbedUrl.trim();
      const hlsMatch = trimmed.match(/(?:\/api\/hls\/player\/|\/android-hls\/player\/)([a-fA-F0-9]{16,})/);
      if (hlsMatch) {
        return `https://player.zilla-networks.com/play/${hlsMatch[1]}`;
      }
      return safeHttpUrl(trimmed);
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
        <div class="watch-container ${isCinemaActive ? 'cinema-mode' : ''}">
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
            <a href="${escapeHtml(watchData.url)}" target="_blank" rel="noopener noreferrer" class="btn btn-outline external-link" data-external-url="${escapeHtml(watchData.url)}" style="padding: 8px 14px; font-size: 0.88rem;" title="Abrir página original en caso de fallo">
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
              ${(!embedSrc.startsWith('http://localhost') && !embedSrc.includes('appassets.androidplatform.net') && !embedSrc.startsWith('/')) ? 'referrerpolicy="no-referrer"' : ''}
              ${shouldApplySandbox(currentServer?.embed, currentServer?.name) ? 'sandbox="allow-scripts allow-same-origin allow-forms allow-presentation allow-downloads allow-fullscreen"' : ''}
            ></iframe>

            <!-- Floating Skip OP/ED (+85s) Button on Player -->
            <button id="player-floating-skip-op" class="player-floating-skip-btn" title="Saltar Opening / Ending (+85s) [Tecla S]">
              <span class="skip-btn-icon">⏩</span>
              <span class="skip-btn-text">Saltar Intro (+85s)</span>
              <span class="skip-btn-badge">S</span>
            </button>

            <!-- Resume Playback Notification Banner -->
            <div id="player-resume-banner" class="player-resume-banner" style="display: none;">
              <div class="resume-content">
                <span class="resume-icon">⏱️</span>
                <span class="resume-text">Reanudando en <strong id="resume-time-text">0:00</strong></span>
                <div class="resume-actions">
                  <button id="btn-resume-restart" class="btn btn-secondary btn-xs" style="padding: 3px 8px; font-size: 0.78rem;">Volver al inicio (0:00)</button>
                  <button id="btn-resume-dismiss" class="btn-resume-close" title="Cerrar">✕</button>
                </div>
              </div>
            </div>

            <!-- Floating Next Episode Countdown Overlay (Auto-Play) -->
            <div id="player-next-countdown-overlay" class="player-next-countdown-overlay" style="display: none;">
              <div class="countdown-card">
                <div class="countdown-header">
                  <span class="countdown-badge">Siguiente Episodio</span>
                  <button id="btn-cancel-countdown" class="btn-cancel-countdown" title="Cancelar reproducción automática">✕</button>
                </div>
                <div class="countdown-body">
                  <div class="countdown-circle">
                    <svg viewBox="0 0 36 36" class="circular-chart">
                      <path class="circle-bg" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"/>
                      <path id="countdown-progress-bar" class="circle" stroke-dasharray="0, 100" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"/>
                    </svg>
                    <span id="countdown-number" class="countdown-number">5</span>
                  </div>
                  <div class="countdown-info">
                    <div class="countdown-ep-title" id="countdown-ep-title">${escapeHtml(watchData.animeTitle)} - ${(!isNaN(parseInt(watchData.episode, 10))) ? ('Ep. ' + (parseInt(watchData.episode, 10) + 1)) : 'Siguiente'}</div>
                    <div class="countdown-sub">Reproduciendo automáticamente...</div>
                  </div>
                </div>
                <div class="countdown-actions">
                  <button id="btn-play-next-now" class="btn btn-primary btn-sm">▶ Reproducir ahora</button>
                  <button id="btn-dismiss-countdown" class="btn btn-secondary btn-sm">Cancelar</button>
                </div>
              </div>
            </div>

            <!-- Player On-Screen HUD -->
            <div id="player-screen-hud" class="player-screen-hud">
              <span id="player-hud-text"></span>
            </div>
          ` : `
            <div class="player-loading-spinner">
              ${Icons.alert}
              <p>No se encontraron servidores de vídeo para este episodio.</p>
              <a href="${escapeHtml(watchData.url)}" target="_blank" rel="noopener noreferrer" class="btn btn-primary external-link" data-external-url="${escapeHtml(watchData.url)}">
                Ver en la web oficial
              </a>
            </div>
          `}
        </div>

        <!-- Audio Variants Bar (SUB vs DUB) -->
        ${availableAudios.length > 1 ? `
          <div class="audio-tabs-bar" style="display: flex; align-items: center; gap: 10px; margin-top: 14px; padding: 6px 14px; background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-sm); flex-wrap: wrap;">
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
              const cleanName = server.name.replace(/^\[(SUB|DUB)\]\s*/i, '').replace(/\s*\((?:mirror|Mirror)\)\s*/gi, '').trim();
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
            <div class="watch-toolbar-actions" style="margin-left: auto; display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
              <!-- Skip OP/ED (+85s) Button -->
              <button 
                id="btn-skip-op" 
                class="btn btn-outline" 
                style="padding: 4px 10px; font-size: 0.8rem; display: inline-flex; align-items: center; gap: 5px;"
                title="Saltar Opening / Ending (+85s) [Tecla S]"
              >
                <span>⏩ +85s OP/ED</span>
              </button>

              <!-- Playback Speed Selector Dropdown -->
              <div class="speed-dropdown-wrapper">
                <button 
                  id="btn-speed-toggle" 
                  class="btn btn-outline" 
                  style="padding: 4px 10px; font-size: 0.8rem; display: inline-flex; align-items: center; gap: 5px;"
                  title="Velocidad de reproducción"
                >
                  <span>⚡ <span id="current-speed-text">${currentPlaybackRate}x</span></span>
                  ${Icons.chevronDown}
                </button>
                <div id="speed-dropdown-menu" class="speed-dropdown-menu" style="display: none;">
                  ${[0.75, 1.0, 1.25, 1.5, 2.0].map(r => `
                    <button class="speed-menu-item ${r === currentPlaybackRate ? 'active' : ''}" data-speed="${r}">
                      <span>${r}x</span>
                      ${r === 1.0 ? '<span class="speed-normal-tag">(Normal)</span>' : ''}
                    </button>
                  `).join('')}
                </div>
              </div>

              <!-- Cinema Mode Toggle -->
              <button 
                id="btn-toggle-cinema" 
                class="btn btn-outline ${isCinemaActive ? 'active' : ''}" 
                style="padding: 4px 10px; font-size: 0.8rem; display: inline-flex; align-items: center; gap: 5px;"
                title="Modo Cine (expande el reproductor) [Tecla C]"
              >
                <span>${isCinemaActive ? '🎬 Modo Normal' : '🎬 Modo Cine'}</span>
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
                href="${escapeHtml(getExternalTabUrl(currentServer.embed))}" 
                target="_blank" 
                rel="noopener noreferrer" 
                class="btn btn-outline external-link" 
                data-external-url="${escapeHtml(getExternalTabUrl(currentServer.embed))}"
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
              <a id="btn-prev-ep" href="#/watch?url=${encodeURIComponent(watchData.prevUrl)}&image=${encodeURIComponent(watchData.image || initialImage)}&title=${encodeURIComponent(watchData.animeTitle || initialTitle)}&animeUrl=${encodeURIComponent(watchData.animeUrl || initialAnimeUrl)}" class="btn btn-secondary">
                ${Icons.arrowLeft} Episodio Anterior
              </a>
            ` : `
              <button id="btn-prev-ep" class="btn btn-secondary" disabled style="opacity: 0.4; cursor: not-allowed;">
                ${Icons.arrowLeft} Primer Episodio
              </button>
            `}

            <!-- Next Episode -->
            ${watchData.nextUrl ? `
              <a id="btn-next-ep" href="#/watch?url=${encodeURIComponent(watchData.nextUrl)}&image=${encodeURIComponent(watchData.image || initialImage)}&title=${encodeURIComponent(watchData.animeTitle || initialTitle)}&animeUrl=${encodeURIComponent(watchData.animeUrl || initialAnimeUrl)}" class="btn btn-primary">
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
        </div>
      `;
    }

    container.innerHTML = buildHtml();

    function attachEvents() {
      const visibleServers = getVisibleServers();

      function resetAutoPlayCountdownState() {
        autoPlayCountdownActive = false;
        if (currentAutoPlayCountdownTimer) {
          clearInterval(currentAutoPlayCountdownTimer);
          currentAutoPlayCountdownTimer = null;
        }
        const overlay = container.querySelector('#player-next-countdown-overlay');
        if (overlay) overlay.style.display = 'none';
      }

      // Audio Tabs (SUB vs DUB)
      const audioBtns = container.querySelectorAll('.audio-tab-btn');
      audioBtns.forEach(btn => {
        btn.addEventListener('click', () => {
          const selectedAudio = btn.dataset.audio;
          if (selectedAudio !== currentAudio) {
            persistPosition(true);
            resetAutoPlayCountdownState();
            hasResumed = false;
            hasAppliedLocalResume = false;
            iframeHasLoaded = false;
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
            persistPosition(true);
            resetAutoPlayCountdownState();
            hasResumed = false;
            hasAppliedLocalResume = false;
            iframeHasLoaded = false;
            currentServerIndex = idx;
            const iframe = container.querySelector('#main-player-iframe');
            if (iframe) {
              iframe.src = 'about:blank';
              updateIframeSandbox(iframe, vServers[idx].embed, vServers[idx].name);
              iframe.src = getEmbedUrl(vServers[idx].embed);
              serverBtns.forEach(b => b.classList.remove('active'));
              btn.classList.add('active');
              
              const newTabLink = container.querySelector('#link-open-new-tab');
              if (newTabLink) {
                const safeLink = getExternalTabUrl(vServers[idx].embed);
                newTabLink.href = safeLink;
                newTabLink.setAttribute('data-external-url', safeLink);
              }

              restartVideoPolling();
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
          persistPosition(true);
          resetAutoPlayCountdownState();
          hasResumed = false;
          hasAppliedLocalResume = false;
          iframeHasLoaded = false;
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
            iframe.src = 'about:blank';
            updateIframeSandbox(iframe, vServers[currentServerIndex].embed, vServers[currentServerIndex].name);
            const nextSrc = getEmbedUrl(vServers[currentServerIndex].embed);
            iframe.src = nextSrc;
            const newTabLink = container.querySelector('#link-open-new-tab');
            if (newTabLink) {
              const extUrl = getExternalTabUrl(vServers[currentServerIndex].embed);
              newTabLink.href = extUrl;
              newTabLink.setAttribute('data-external-url', extUrl);
            }
            restartVideoPolling();
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
        if (currentAdblockChangeListener) {
          window.removeEventListener('animestream-adblock-change', currentAdblockChangeListener);
        }
        currentAdblockChangeListener = (e) => {
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
        };
        window.addEventListener('animestream-adblock-change', currentAdblockChangeListener);
      }

      // Cinema Mode toggle
      const cinemaBtn = container.querySelector('#btn-toggle-cinema');
      const watchWrap = container.querySelector('.watch-container') || container;
      if (cinemaBtn) {
        cinemaBtn.addEventListener('click', () => {
          isCinemaActive = !isCinemaActive;
          watchWrap.classList.toggle('cinema-mode', isCinemaActive);
          cinemaBtn.classList.toggle('active', isCinemaActive);
          cinemaBtn.innerHTML = isCinemaActive ? '<span>🎬 Modo Normal</span>' : '<span>🎬 Modo Cine</span>';
          showToast(isCinemaActive ? 'Modo Cine activado' : 'Modo Cine desactivado', 'info');
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

      // Skip OP/ED (+85s) Button in Toolbar and Floating on Player
      const skipToolbarBtn = container.querySelector('#btn-skip-op');
      if (skipToolbarBtn) {
        skipToolbarBtn.addEventListener('click', () => skipOpEd(85));
      }
      const skipFloatingBtn = container.querySelector('#player-floating-skip-op');
      if (skipFloatingBtn) {
        skipFloatingBtn.addEventListener('click', () => skipOpEd(85));
      }

      // Playback Speed dropdown toggle and selection
      const speedBtn = container.querySelector('#btn-speed-toggle');
      const speedMenu = container.querySelector('#speed-dropdown-menu');
      if (speedBtn && speedMenu) {
        speedBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          const isShown = speedMenu.style.display === 'flex';
          speedMenu.style.display = isShown ? 'none' : 'flex';
        });

        const speedItems = container.querySelectorAll('.speed-menu-item');
        speedItems.forEach(item => {
          item.addEventListener('click', (e) => {
            e.stopPropagation();
            changePlaybackSpeed(item.dataset.speed);
          });
        });

        if (currentSpeedCloseListener) {
          document.removeEventListener('click', currentSpeedCloseListener);
        }
        currentSpeedCloseListener = (e) => {
          if (speedMenu && !speedBtn.contains(e.target)) {
            speedMenu.style.display = 'none';
          }
        };
        document.addEventListener('click', currentSpeedCloseListener);
      }

      // Resume banner actions
      const resumeRestartBtn = container.querySelector('#btn-resume-restart');
      if (resumeRestartBtn) {
        resumeRestartBtn.addEventListener('click', () => {
          sendPlayerCmd('seek_to', { seconds: 0 });
          lastActiveCurrentTime = 0;
          Storage.clearPlaybackPosition(watchData.url);
          Storage.updateHistoryProgress(watchData.url, 0, lastActiveDuration, 0);
          const banner = container.querySelector('#player-resume-banner');
          if (banner) banner.style.display = 'none';
          showPlayerHUD('⏪ Desde el inicio (0:00)');
          showToast('Reproducción reiniciada desde 0:00', 'info', 1800);
        });
      }
      const resumeDismissBtn = container.querySelector('#btn-resume-dismiss');
      if (resumeDismissBtn) {
        resumeDismissBtn.addEventListener('click', () => {
          const banner = container.querySelector('#player-resume-banner');
          if (banner) banner.style.display = 'none';
        });
      }

      // Next Episode Auto-Play actions
      const playNextNowBtn = container.querySelector('#btn-play-next-now');
      if (playNextNowBtn) {
        playNextNowBtn.addEventListener('click', () => {
          if (currentAutoPlayCountdownTimer) {
            clearInterval(currentAutoPlayCountdownTimer);
            currentAutoPlayCountdownTimer = null;
          }
          Storage.markSeen(watchData.url, true);
          Storage.clearPlaybackPosition(watchData.url);
          lastActiveWatchUrl = null;
          lastActiveCurrentTime = 0;
          const overlay = container.querySelector('#player-next-countdown-overlay');
          if (overlay) overlay.style.display = 'none';
          window.location.hash = `#/watch?url=${encodeURIComponent(watchData.nextUrl)}&image=${encodeURIComponent(watchData.image || initialImage)}&title=${encodeURIComponent(watchData.animeTitle || initialTitle)}&animeUrl=${encodeURIComponent(watchData.animeUrl || initialAnimeUrl)}`;
        });
      }
      const cancelCountdownBtn = container.querySelector('#btn-cancel-countdown');
      if (cancelCountdownBtn) {
        cancelCountdownBtn.addEventListener('click', cancelAutoPlayCountdown);
      }
      const dismissCountdownBtn = container.querySelector('#btn-dismiss-countdown');
      if (dismissCountdownBtn) {
        dismissCountdownBtn.addEventListener('click', cancelAutoPlayCountdown);
      }

      // Setup Video Element Hooks & State Synchronization
      function setupVideoHooks() {
        const v = findVideo();
        if (v) {
          try { v.volume = Storage.getPlayerVolume(); } catch (_) {}
          try { v.playbackRate = currentPlaybackRate; } catch (_) {}

          checkAndApplyResume(v);

          if (!v._asWatchHooked) {
            v._asWatchHooked = true;
            v.addEventListener('timeupdate', () => {
              handleTimeUpdate(v.currentTime, v.duration, v.playbackRate);
            });
            v.addEventListener('pause', () => {
              persistPosition(true);
            });
            v.addEventListener('ended', () => {
              handleVideoEnded();
            });
            v.addEventListener('ratechange', () => {
              if (v.playbackRate && v.playbackRate !== currentPlaybackRate) {
                currentPlaybackRate = v.playbackRate;
                const label = container.querySelector('#current-speed-text');
                if (label) label.textContent = `${currentPlaybackRate}x`;
              }
            });
          }
        } else {
          // Cross-origin embed where v cannot be accessed directly:
          // Apply resume notification & postMessage commands
          checkAndApplyResume(null);
          sendPlayerCmd('set_rate', { rate: currentPlaybackRate });
        }
      }

      function restartVideoPolling() {
        if (currentVideoPollInterval) clearInterval(currentVideoPollInterval);
        let pollCount = 0;
        currentVideoPollInterval = setInterval(() => {
          pollCount++;
          if (pollCount >= 5) {
            iframeHasLoaded = true;
          }
          setupVideoHooks();
          if (pollCount > 30) {
            clearInterval(currentVideoPollInterval);
            currentVideoPollInterval = null;
          }
        }, 500);
      }

      // Sync player volume, resume, speed & clean ads when iframe loads + periodic sweep
      const iframe = container.querySelector('#main-player-iframe');
      if (iframe) {
        iframe.addEventListener('load', () => {
          const curSrc = (iframe.getAttribute('src') || '').trim();
          if (!curSrc || curSrc === 'about:blank') return;
          try {
            if (iframe.contentWindow && iframe.contentWindow.location && iframe.contentWindow.location.href === 'about:blank') {
              return;
            }
          } catch (_) {}
          iframeHasLoaded = true;
          AdBlock.cleanThirdPartyPlayer(iframe);
          setupVideoHooks();
        });

        restartVideoPolling();

        // Periodic sweep for delayed rogue clickjacking traps and popunder triggers
        if (currentCleanPlayerInterval) clearInterval(currentCleanPlayerInterval);
        currentCleanPlayerInterval = setInterval(() => {
          AdBlock.cleanThirdPartyPlayer(iframe);
        }, 1200);
      }

      // Hook postMessage listener for remote player communications
      if (currentPlayerMessageListener) {
        window.removeEventListener('message', currentPlayerMessageListener);
      }
      currentPlayerMessageListener = (e) => {
        if (!e.data) return;
        const d = e.data;
        if (d.type === 'ANIMESTREAM_TIME_UPDATE') {
          handleTimeUpdate(d.currentTime, d.duration, d.playbackRate);
        } else if (d.type === 'ANIMESTREAM_ENDED') {
          handleVideoEnded();
        } else if (d.type === 'ANIMESTREAM_PAUSE') {
          persistPosition(true);
        }
      };
      window.addEventListener('message', currentPlayerMessageListener);

      // Seen button
      const seenBtn = container.querySelector('#btn-toggle-seen');
      if (seenBtn) {
        seenBtn.addEventListener('click', () => {
          isSeen = Storage.toggleSeen(watchData.url);
          container.querySelector('#seen-text').textContent = isSeen ? 'Marcar como No Visto' : 'Marcar como Visto';
          showToast(isSeen ? 'Episodio marcado como visto ✓' : 'Episodio marcado como no visto', 'success');
        });
      }

      // Setup Cursor Auto-Hide for Player & Fullscreen
      if (currentCursorListeners) {
        currentCursorListeners.cleanup();
        currentCursorListeners = null;
      }
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
    }

    attachEvents();

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

      // Escape key: dismiss active autoplay countdown if visible
      if ((k === 'Escape' || keyCode === 27) && autoPlayCountdownActive) {
        e.preventDefault();
        cancelAutoPlayCountdown();
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
      if (k === 'c' || k === 'C') {
        e.preventDefault();
        const cinemaBtn = container.querySelector('#btn-toggle-cinema');
        if (cinemaBtn) cinemaBtn.click();
        return;
      }
      if (k === 'f' || k === 'F') {
        e.preventDefault();
        const fsBtn = container.querySelector('#btn-toggle-fullscreen');
        if (fsBtn) fsBtn.click();
        return;
      }
      if ((k === 'n' || k === 'N') && watchData.nextUrl) {
        e.preventDefault();
        persistPosition(true);
        if (currentAutoPlayCountdownTimer) {
          clearInterval(currentAutoPlayCountdownTimer);
          currentAutoPlayCountdownTimer = null;
        }
        autoPlayCountdownActive = false;
        lastActiveWatchUrl = null;
        lastActiveCurrentTime = 0;
        window.location.hash = `#/watch?url=${encodeURIComponent(watchData.nextUrl)}&image=${encodeURIComponent(watchData.image || initialImage)}&title=${encodeURIComponent(watchData.animeTitle || initialTitle)}&animeUrl=${encodeURIComponent(watchData.animeUrl || initialAnimeUrl)}`;
        return;
      }
      if ((k === 'p' || k === 'P') && watchData.prevUrl) {
        e.preventDefault();
        persistPosition(true);
        if (currentAutoPlayCountdownTimer) {
          clearInterval(currentAutoPlayCountdownTimer);
          currentAutoPlayCountdownTimer = null;
        }
        autoPlayCountdownActive = false;
        lastActiveWatchUrl = null;
        lastActiveCurrentTime = 0;
        window.location.hash = `#/watch?url=${encodeURIComponent(watchData.prevUrl)}&image=${encodeURIComponent(watchData.image || initialImage)}&title=${encodeURIComponent(watchData.animeTitle || initialTitle)}&animeUrl=${encodeURIComponent(watchData.animeUrl || initialAnimeUrl)}`;
        return;
      }
      // Keyboard shortcut: S (Skip Opening/Ending +85s)
      if (k === 's' || k === 'S') {
        e.preventDefault();
        skipOpEd(85);
        return;
      }

      // Keyboard shortcuts: < / , to slow down, > / . to speed up
      const speedLevels = [0.75, 1.0, 1.25, 1.5, 2.0];
      if (k === '>' || k === '.' || k === ']' || (e.shiftKey && (k === '.' || k === '>'))) {
        e.preventDefault();
        const curIdx = speedLevels.indexOf(currentPlaybackRate);
        const nextIdx = Math.min(speedLevels.length - 1, curIdx !== -1 ? curIdx + 1 : 1);
        changePlaybackSpeed(speedLevels[nextIdx]);
        return;
      }
      if (k === '<' || k === ',' || k === '[' || (e.shiftKey && (k === ',' || k === '<'))) {
        e.preventDefault();
        const curIdx = speedLevels.indexOf(currentPlaybackRate);
        const prevIdx = Math.max(0, curIdx !== -1 ? curIdx - 1 : 1);
        changePlaybackSpeed(speedLevels[prevIdx]);
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

        if (cmd === 'seek_forward' || cmd === 'seek_backward') {
          sendPlayerCmd('seek_relative', { seconds: deltaSeek, delta: deltaSeek });
          showPlayerHUD((deltaSeek > 0 ? '+' : '') + deltaSeek + 's');
        } else {
          sendPlayerCmd(cmd);
          if (cmd === 'volume_up') showPlayerHUD('Volumen ▲');
          else if (cmd === 'volume_down') showPlayerHUD('Volumen ▼');
          else if (cmd === 'toggle_mute') showPlayerHUD('Silenciar / Sonido');
        }
      }
    };

    currentWatchKeyDownHandler = handleKeyDown;
    window.addEventListener('keydown', currentWatchKeyDownHandler, true);

  } catch (err) {
    if (myWatchToken !== activeWatchToken) return;
    container.innerHTML = `
      <div class="alert-banner error" style="margin-top: 40px;">
        <div>
          ${Icons.alert} <strong>No se pudo cargar el episodio:</strong> ${escapeHtml(err.message)}
        </div>
        <div style="display: flex; gap: 10px;">
          <a href="${escapeHtml(safeHttpUrl(episodeUrl))}" target="_blank" rel="noopener noreferrer" class="btn btn-secondary external-link" data-external-url="${escapeHtml(safeHttpUrl(episodeUrl))}">
            ${Icons.external} Ver en la web original
          </a>
          <button class="btn btn-primary" onclick="window.history.back()">Volver</button>
        </div>
      </div>
    `;
  }
}
