/**
 * Gamepad & Xbox TV Navigation Engine
 * Provides full Xbox controller navigation, spatial focus, TV 10-foot UI,
 * and media player controls for Xbox (Microsoft Edge) and generic gamepads.
 */

let gamepadLoopActive = false;
let lastNavTime = 0;
const NAV_COOLDOWN_MS = 180; // Debounce rate for directional navigation
let focusedElement = null;

// Button state tracking to prevent repeated triggers on hold
const prevButtonStates = {};

/**
 * Detects if running on Xbox (Microsoft Edge on Xbox One, Xbox Series S, Xbox Series X)
 */
export function isXboxEnvironment() {
  const ua = (navigator.userAgent || '').toLowerCase();
  return /xbox|xbox one|xbox series/i.test(ua) || (typeof window.Windows !== 'undefined');
}

export function initGamepadSupport() {
  const onXbox = isXboxEnvironment();

  // Xbox 10-foot experience optimizations
  if (onXbox) {
    document.body.classList.add('xbox-device');
    document.body.classList.add('gamepad-active');
    console.log('[AnimeStream] Dispositivo Xbox detectado. Optimizando experiencia TV de 10 pies.');
  }

  // Disable Edge's virtual mouse cursor to enable direct standard gamepad inputs
  if ('gamepadInputEmulation' in navigator) {
    try {
      navigator.gamepadInputEmulation = 'gamepad';
      console.log('[AnimeStream] gamepadInputEmulation = "gamepad" activado en Edge.');
    } catch (err) {
      console.warn('[AnimeStream] Error configurando gamepadInputEmulation:', err);
    }
  }

  // Create Xbox HUD controller guide bar
  createGamepadHud();

  // Listen for gamepad connection
  window.addEventListener('gamepadconnected', (e) => {
    console.log('[AnimeStream] Mando conectado:', e.gamepad.id);
    document.body.classList.add('gamepad-active');
    updateHudVisibility(true);
    if (!gamepadLoopActive) {
      gamepadLoopActive = true;
      requestAnimationFrame(pollGamepad);
    }
    // Auto-focus first visible element if none focused
    ensureInitialFocus();
  });

  window.addEventListener('gamepaddisconnected', () => {
    const gamepads = getActiveGamepads();
    if (gamepads.length === 0 && !onXbox) {
      document.body.classList.remove('gamepad-active');
      updateHudVisibility(false);
      gamepadLoopActive = false;
    }
  });

  // Start polling if on Xbox or if gamepads already present
  if (onXbox || getActiveGamepads().length > 0) {
    document.body.classList.add('gamepad-active');
    updateHudVisibility(true);
    if (!gamepadLoopActive) {
      gamepadLoopActive = true;
      requestAnimationFrame(pollGamepad);
    }
    setTimeout(ensureInitialFocus, 300);
  }

  // Handle route change to reset/ensure focus only when gamepad or Xbox mode is active
  window.addEventListener('hashchange', () => {
    if (document.body.classList.contains('gamepad-active') || document.body.classList.contains('xbox-device')) {
      setTimeout(ensureInitialFocus, 400);
    }
  });

  // TV / Remote Control / Keyboard spatial navigation support
  initKeyboardTvNavigation();
}

function getActiveGamepads() {
  if (typeof navigator.getGamepads !== 'function') return [];
  const gp = navigator.getGamepads();
  const res = [];
  for (let i = 0; i < gp.length; i++) {
    if (gp[i]) res.push(gp[i]);
  }
  return res;
}

function pollGamepad(timestamp) {
  const gamepads = getActiveGamepads();

  if (gamepads.length > 0) {
    for (let i = 0; i < gamepads.length; i++) {
      const pad = gamepads[i];
      if (pad && pad.connected) {
        handleGamepadInput(pad, timestamp);
        break; // Primary controller handling
      }
    }
  }

  requestAnimationFrame(pollGamepad);
}

function handleGamepadInput(pad, timestamp) {
  const buttons = pad.buttons;
  const axes = pad.axes;
  const now = timestamp || Date.now();

  const isPressed = (index) => {
    if (!buttons || !buttons[index]) return false;
    const b = buttons[index];
    return typeof b === 'object' ? b.pressed : b > 0.5;
  };

  const wasJustPressed = (index) => {
    const pressed = isPressed(index);
    const key = pad.index + '_' + index;
    const prev = !!prevButtonStates[key];
    prevButtonStates[key] = pressed;
    return pressed && !prev;
  };

  // Xbox Controller W3C Mapping:
  // Button 0: A (Green) -> Select / Confirm
  // Button 1: B (Red)   -> Back / Cancel / Close Modal
  // Button 2: X (Blue)  -> Play-Pause / Favorite
  // Button 3: Y (Yellow)-> Quick Search (Opens Xbox Virtual Keyboard)
  // Button 4: LB        -> Prev Episode / Prev Page
  // Button 5: RB        -> Next Episode / Next Page
  // Button 6: LT        -> Seek -10s
  // Button 7: RT        -> Seek +10s
  // Button 8: View      -> Back
  // Button 9: Menu      -> Fullscreen
  // Button 12: D-Pad Up
  // Button 13: D-Pad Down
  // Button 14: D-Pad Left
  // Button 15: D-Pad Right

  const isWatchView = window.location.hash.indexOf('#/watch') === 0;

  // --- 1. ACTION BUTTONS (Single-press triggers) ---

  // Button 0: A (Confirm / Select)
  if (wasJustPressed(0)) {
    const activeEl = document.activeElement;
    const isInteractive = activeEl && activeEl !== document.body && 
      (activeEl.tagName === 'BUTTON' || activeEl.tagName === 'A' || 
       activeEl.classList.contains('server-tab') || activeEl.classList.contains('episode-btn') || 
       activeEl.classList.contains('btn') || activeEl.classList.contains('genre-pill'));

    if (isInteractive) {
      triggerFocusedElementClick();
    } else if (isWatchView) {
      triggerPlayerCommand('toggle_play');
    } else {
      triggerFocusedElementClick();
    }
  }

  // Button 1: B (Back / Close Modal)
  if (wasJustPressed(1)) {
    handleBackButton(isWatchView);
  }

  // Button 2: X (Toggle Play/Pause or Favorite)
  if (wasJustPressed(2)) {
    if (isWatchView) {
      triggerPlayerCommand('toggle_play');
    } else {
      const favBtn = document.querySelector('#btn-toggle-fav, #btn-favorite');
      if (favBtn) favBtn.click();
    }
  }

  // Button 3: Y (Quick Search - Triggers Xbox OS On-Screen Virtual Keyboard)
  if (wasJustPressed(3)) {
    const searchInput = document.querySelector('#search-view-inline-input, #nav-search-input, #global-search-input');
    if (searchInput) {
      searchInput.focus();
      searchInput.select();
      setFocusedClass(searchInput);
    }
  }

  // Button 4: LB (Previous Episode or Catalog Page)
  if (wasJustPressed(4)) {
    if (isWatchView) {
      const prevEpBtn = document.querySelector('#btn-prev-ep');
      if (prevEpBtn && !prevEpBtn.disabled) prevEpBtn.click();
    } else {
      const prevPageBtn = document.querySelector('#btn-dir-prev');
      if (prevPageBtn && !prevPageBtn.disabled) prevPageBtn.click();
    }
  }

  // Button 5: RB (Next Episode or Catalog Page)
  if (wasJustPressed(5)) {
    if (isWatchView) {
      const nextEpBtn = document.querySelector('#btn-next-ep');
      if (nextEpBtn && !nextEpBtn.disabled) nextEpBtn.click();
    } else {
      const nextPageBtn = document.querySelector('#btn-dir-next');
      if (nextPageBtn && !nextPageBtn.disabled) nextPageBtn.click();
    }
  }

  // Button 6: LT (Seek -10s in Player)
  if (wasJustPressed(6) && isWatchView) {
    triggerPlayerCommand('seek_backward', -10);
  }

  // Button 7: RT (Seek +10s in Player)
  if (wasJustPressed(7) && isWatchView) {
    triggerPlayerCommand('seek_forward', 10);
  }

  // Button 8: View / Back Button
  if (wasJustPressed(8)) {
    handleBackButton(isWatchView);
  }

  // Button 9: Menu / Start Button (Toggle Fullscreen)
  if (wasJustPressed(9)) {
    toggleBrowserFullscreen();
  }

  // --- 2. DIRECTIONAL NAVIGATION (D-Pad & Analog Stick) ---
  const dpadUp = isPressed(12) || (axes && axes[1] < -0.5);
  const dpadDown = isPressed(13) || (axes && axes[1] > 0.5);
  const dpadLeft = isPressed(14) || (axes && axes[0] < -0.5);
  const dpadRight = isPressed(15) || (axes && axes[0] > 0.5);

  if (dpadUp || dpadDown || dpadLeft || dpadRight) {
    if (now - lastNavTime >= NAV_COOLDOWN_MS) {
      lastNavTime = now;

      // In Watch View, D-Pad controls player volume & seek directly
      if (isWatchView) {
        if (dpadUp) triggerPlayerCommand('volume_up', 0.05);
        else if (dpadDown) triggerPlayerCommand('volume_down', -0.05);
        else if (dpadLeft) triggerPlayerCommand('seek_backward', -10);
        else if (dpadRight) triggerPlayerCommand('seek_forward', 10);
      } else {
        // Standard Spatial Navigation across cards and buttons
        let dir = null;
        if (dpadUp) dir = 'up';
        else if (dpadDown) dir = 'down';
        else if (dpadLeft) dir = 'left';
        else if (dpadRight) dir = 'right';

        if (dir) navigateSpatial(dir);
      }
    }
  }
}

function handleBackButton(isWatchView) {
  // 1. If any modal is active (e.g. AdBlock modal, search dropdown), close it first
  const activeModal = document.querySelector('.adblock-modal-backdrop, .modal.is-active, .modal[open]');
  if (activeModal) {
    const closeBtn = activeModal.querySelector('.adblock-modal-close, .modal-close');
    if (closeBtn) {
      closeBtn.click();
      return;
    }
    activeModal.remove();
    return;
  }

  // 2. Watch view back navigation
  if (isWatchView) {
    const backBtn = document.querySelector('.watch-back-btn, #btn-back-to-anime');
    if (backBtn) {
      backBtn.click();
    } else {
      window.history.back();
    }
  } else {
    window.history.back();
  }
}

function triggerFocusedElementClick() {
  const current = document.activeElement || focusedElement;
  if (current && typeof current.click === 'function') {
    current.click();
  }
}

function triggerPlayerCommand(cmd, value = 0) {
  const iframe = document.querySelector('#main-player-iframe');
  if (iframe) {
    let handled = false;
    try {
      const win = iframe.contentWindow;
      if (win) {
        if (cmd === 'volume_up' && typeof win.changeVolume === 'function') {
          win.changeVolume(0.05);
          handled = true;
        } else if (cmd === 'volume_down' && typeof win.changeVolume === 'function') {
          win.changeVolume(-0.05);
          handled = true;
        } else if (cmd === 'seek_forward' && typeof win.seekRelative === 'function') {
          win.seekRelative(10);
          handled = true;
        } else if (cmd === 'seek_backward' && typeof win.seekRelative === 'function') {
          win.seekRelative(-10);
          handled = true;
        } else if (cmd === 'toggle_play' && typeof win.togglePlay === 'function') {
          win.togglePlay();
          handled = true;
        }
      }
    } catch (e) {}

    if (!handled && iframe.contentWindow) {
      iframe.contentWindow.postMessage({ type: 'PLAYER_CMD', cmd, value }, '*');
    }
  }
}

function toggleBrowserFullscreen() {
  const doc = document;
  const isFs = doc.fullscreenElement || doc.webkitFullscreenElement || doc.mozFullScreenElement;
  if (!isFs) {
    const el = doc.documentElement;
    if (el.requestFullscreen) {
      el.requestFullscreen().catch(() => {});
    } else if (el.webkitRequestFullscreen) {
      el.webkitRequestFullscreen();
    }
  } else {
    if (doc.exitFullscreen) {
      doc.exitFullscreen().catch(() => {});
    } else if (doc.webkitExitFullscreen) {
      doc.webkitExitFullscreen();
    }
  }
}

// Spatial Navigation: Finds closest interactive element in directional cone
function navigateSpatial(direction) {
  const candidates = getFocusableElements();
  if (candidates.length === 0) return;

  let current = document.activeElement;
  if (!current || current === document.body || !document.contains(current)) {
    candidates[0].focus();
    setFocusedClass(candidates[0]);
    return;
  }

  const currentRect = current.getBoundingClientRect();
  const currentCenter = {
    x: currentRect.left + currentRect.width / 2,
    y: currentRect.top + currentRect.height / 2
  };

  let bestCandidate = null;
  let minScore = Infinity;

  candidates.forEach(cand => {
    if (cand === current) return;
    const candRect = cand.getBoundingClientRect();
    if (candRect.width === 0 || candRect.height === 0) return;

    const candCenter = {
      x: candRect.left + candRect.width / 2,
      y: candRect.top + candRect.height / 2
    };

    const dx = candCenter.x - currentCenter.x;
    const dy = candCenter.y - currentCenter.y;

    let inDirection = false;
    let primaryDist = 0;
    let secondaryDist = 0;

    switch (direction) {
      case 'up':
        inDirection = dy < -8;
        primaryDist = -dy;
        secondaryDist = Math.abs(dx);
        break;
      case 'down':
        inDirection = dy > 8;
        primaryDist = dy;
        secondaryDist = Math.abs(dx);
        break;
      case 'left':
        inDirection = dx < -8;
        primaryDist = -dx;
        secondaryDist = Math.abs(dy);
        break;
      case 'right':
        inDirection = dx > 8;
        primaryDist = dx;
        secondaryDist = Math.abs(dy);
        break;
    }

    if (inDirection) {
      // Prioritize straight-line alignment over diagonal displacement
      const score = primaryDist + secondaryDist * 2.2;
      if (score < minScore) {
        minScore = score;
        bestCandidate = cand;
      }
    }
  });

  if (bestCandidate) {
    bestCandidate.focus();
    setFocusedClass(bestCandidate);
    bestCandidate.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
  }
}

function getFocusableElements() {
  const selector = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), .genre-pill, .server-tab, .server-btn, .episode-btn, .anime-card-media, .audio-tab-btn';
  const nodes = document.querySelectorAll(selector);
  const visible = [];

  for (let i = 0; i < nodes.length; i++) {
    const el = nodes[i];
    const rect = el.getBoundingClientRect();
    // Exclude hidden or zero-size elements
    if (rect.width > 0 && rect.height > 0 && window.getComputedStyle(el).display !== 'none' && window.getComputedStyle(el).visibility !== 'hidden') {
      visible.push(el);
    }
  }
  return visible;
}

function setFocusedClass(el) {
  if (focusedElement && focusedElement !== el) {
    focusedElement.classList.remove('gamepad-focused');
  }
  focusedElement = el;
  if (el) {
    el.classList.add('gamepad-focused');
  }
}

function ensureInitialFocus() {
  if (!document.body.classList.contains('gamepad-active') && !document.body.classList.contains('xbox-device')) {
    return;
  }
  const candidates = getFocusableElements();
  if (candidates.length > 0) {
    // Focus first prominent content element (prefer cards or search)
    const priorityEl = document.querySelector('.anime-card a, #search-view-inline-input, #nav-search-input, #global-search-input') || candidates[0];
    if (priorityEl) {
      priorityEl.focus();
      setFocusedClass(priorityEl);
    }
  }
}

function createGamepadHud() {
  if (document.getElementById('gamepad-hud')) return;

  const hud = document.createElement('div');
  hud.id = 'gamepad-hud';
  hud.className = 'gamepad-hud';
  hud.innerHTML = `
    <span class="hud-item"><span class="gamepad-btn gamepad-btn-a">A</span> Seleccionar</span>
    <span class="hud-item"><span class="gamepad-btn gamepad-btn-b">B</span> Volver</span>
    <span class="hud-item"><span class="gamepad-btn gamepad-btn-x">X</span> Pausa/Fav</span>
    <span class="hud-item"><span class="gamepad-btn gamepad-btn-y">Y</span> Buscar</span>
    <span class="hud-item"><span class="gamepad-btn gamepad-btn-shoulder">LB/RB</span> Caps/Pág</span>
    <span class="hud-item"><span class="gamepad-btn gamepad-btn-shoulder">LT/RT</span> ±10s</span>
    <span class="hud-item"><span class="gamepad-btn gamepad-btn-dpad">D-Pad</span> Mover / Vol</span>
    <span class="hud-item"><span class="gamepad-btn gamepad-btn-menu">☰</span> Menú</span>
  `;
  document.body.appendChild(hud);
}

function updateHudVisibility(visible) {
  const hud = document.getElementById('gamepad-hud');
  if (hud) {
    hud.style.display = visible ? 'flex' : 'none';
  }
}

/**
 * Spatial keyboard navigation for TV remotes and keyboards on Xbox/PC
 */
function initKeyboardTvNavigation() {
  window.addEventListener('keydown', (e) => {
    const isWatch = window.location.hash.indexOf('#/watch') === 0;
    const activeEl = document.activeElement;
    const isInput = activeEl && ['INPUT', 'TEXTAREA', 'SELECT'].indexOf(activeEl.tagName) !== -1;

    if (isInput) return;

    if (e.key === 'Escape' || e.key === 'Backspace') {
      e.preventDefault();
      handleBackButton(isWatch);
      return;
    }

    // If in Watch view, watchView.js already handles Arrow keys for Seek and Volume
    if (isWatch) return;

    let dir = null;
    if (e.key === 'ArrowUp') dir = 'up';
    else if (e.key === 'ArrowDown') dir = 'down';
    else if (e.key === 'ArrowLeft') dir = 'left';
    else if (e.key === 'ArrowRight') dir = 'right';

    if (dir) {
      e.preventDefault();
      navigateSpatial(dir);
    }
  });
}

