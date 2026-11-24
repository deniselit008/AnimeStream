/**
 * Third-Party Video Player Sanitizer & AdBlock Shield for Node.js
 * Removes hostile ad network scripts, unblocks restricted iframes, and neutralizes popups and clickjacking traps.
 */

const AD_DOMAINS = [
  'popads', 'popcash', 'adcash', 'adsterra', 'propellerads', 'exoclick',
  'monetag', 'clickadu', 'histats', 'doubleclick', 'googlesyndication',
  'bet365', '1xbet', 'mgid', 'onclickperformance', 'trafficfactory',
  'juicyads', 'hilltopads', 'ad-maven', 'ezmob', 'realsrv', 'zeroredirect',
  'deloton', 'deloplen', 'onclasrv', 'adsco', 'creativecdn', 'tsyndicate', 'adtrue', 'vidoomy',
  'cortahewt', 'dirdumaigre', 'sxlzbz', 'adkeeper', 'adrun', 'adserver', 'syndication',
  'alwingulla', 'stape', 'propu.sh', 'notix', 'pushwhoosh',
  'flawlessimmunizeguy', 'phruk.org', 'subgumgutwise', 'lumbarssweepup',
  'greentrafsa', 'advtpe', 'shottervills', 'greatdexchange', 'mdstats',
  'pixibay', 'mc.yandex', 'yandex.ru',
  'xads.js', 'ev-static', 'highcpmgate', 'coinhive', 'crypto-loot',
  'chaturbate', 'bongacams', 'stripchat', 'livejasmin', 'faphouse',
  'spankbang', 'eporner', 'pornhub', 'xvideos', 'hentaijk',
  'adultfriendfinder', 'crakrevenue', 'clickdealer', 'ero-advertising',
  'plugrush', 'adcolony', 'applovin', 'ironSource', 'springserve',
  'spotxchange', 'connatix', 'scorecardresearch', 'quantserve',
  'clarity.ms', 'adblade', 'adform', 'casalemedia', 'indexexchange',
  'gumgum', 'kargo', 'sharethrough', 'triplelift', 'nativeads',
  'revcontent', 'zemanta', 'adnow', 'content.ad'
];

function sanitizePlayerHtml(html, baseHref = null, active = true) {
  if (!html || typeof html !== 'string') return html;

  let cleaned = html;

  // 1. Strip CSP and X-Frame-Options meta tags so player scripts can load
  cleaned = cleaned.replace(/<meta[^>]*http-equiv=['"](?:content-security-policy|x-frame-options)['"][^>]*>/gi, '');

  // 2. Neutralize framebusting scripts targeting top or parent window navigation
  cleaned = cleaned.replace(/(?:window\.)?top\.location/g, 'window.location');
  cleaned = cleaned.replace(/(?:window\.)?parent\.location/g, 'window.location');

  // 3. Inject <base href="..."> for relative resources
  if (baseHref) {
    cleaned = cleaned.replace(/<base[^>]*>/gi, '');
    const safeHref = String(baseHref).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const baseTag = `<base href="${safeHref}">`;
    if (/<head>/i.test(cleaned)) {
      cleaned = cleaned.replace(/<head>/i, `<head>\n${baseTag}`);
    } else {
      cleaned = `${baseTag}\n${cleaned}`;
    }
  }

  if (active) {
    // 3. Remove script and iframe tags loading known ad network domains (bounded attribute match so < inside JS is never eaten)
    for (const domain of AD_DOMAINS) {
      const escapedDomain = domain.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const scriptRegex = new RegExp(`<script(?:\\s+[^<>]*)?\\s+src=['"][^'"]*${escapedDomain}[^'"]*['"][^<>]*>[\\s\\S]*?</script>`, 'gi');
      const scriptSelfClose = new RegExp(`<script(?:\\s+[^<>]*)?\\s+src=['"][^'"]*${escapedDomain}[^'"]*['"][^<>]*/>`, 'gi');
      const iframeRegex = new RegExp(`<iframe(?:\\s+[^<>]*)?\\s+src=['"][^'"]*${escapedDomain}[^'"]*['"][^<>]*>[\\s\\S]*?</iframe>`, 'gi');
      cleaned = cleaned.replace(scriptRegex, '').replace(scriptSelfClose, '').replace(iframeRegex, '');
    }

    // 4. Inject non-destructive protective shield, cosmetic suppression styles and cursor auto-hide
    const shieldScript = `<style>
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
      body.hide-cursor, body.hide-cursor * {
        cursor: none !important;
      }
    </style>
    <script>
    (function() {
      try {
        // Capture reference to genuine parent window before anti-framebuster sandboxing
        var realParent = null;
        try {
          if (window.parent && window.parent !== window) {
            realParent = window.parent;
          } else if (window.opener && window.opener !== window) {
            realParent = window.opener;
          }
        } catch (_) {}

        // 🛡️ ANTI-FRAMEBUSTER SHIELD: Strictly prevent proxied players from hijacking window.top or parent
        try {
          Object.defineProperty(window, 'top', {
            get: function() { return window; },
            set: function() {},
            configurable: false
          });
          Object.defineProperty(window, 'parent', {
            get: function() { return window; },
            set: function() {},
            configurable: false
          });
          Object.defineProperty(window, 'frameElement', {
            get: function() { return null; },
            configurable: false
          });
        } catch (_) {}

        var idleT = null;
        function resetC() {
          document.body.classList.remove('hide-cursor');
          if (idleT) clearTimeout(idleT);
          idleT = setTimeout(function() {
            document.body.classList.add('hide-cursor');
          }, 2500);
        }
        window.addEventListener('mousemove', resetC);
        window.addEventListener('mousedown', resetC);
        window.addEventListener('touchstart', resetC, { passive: true });
        resetC();

        function notifyAdBlocked(reason) {
          try {
            if (realParent) {
              realParent.postMessage({ type: 'ANIMESTREAM_ADBLOCK_HIT', reason: reason }, '*');
            }
          } catch (e) {}
        }

        window.open = function(url) {
          console.warn('[AnimeStream AdBlock] Bloqueado popup publicitario:', url);
          notifyAdBlocked('Popup bloqueado: ' + String(url || '').slice(0, 50));
          return {
            closed: true,
            focus: function() {},
            close: function() {},
            location: { href: '' }
          };
        };
        window.alert = function() { notifyAdBlocked('Alerta publicitaria bloqueada'); };
        window.confirm = function() { return false; };
        window.prompt = function() { return null; };
        window.modal_confirm = function(titulo, msj, callback, callback_cancel) {
          if (typeof callback === 'function') {
            try { callback(); } catch (_) {}
          }
        };
        window.onbeforeunload = null;

        function purgeClickjacking() {
          try {
            // Remove explicit overlay ad containers, fake modals, and click traps
            var overlays = document.querySelectorAll(
              '#overlayads, .overlayads, [id*="overlayad"], [class*="overlayad"], ' +
              '#confirm_modal, #modal-back, .play-overlay, ' +
              'div[class*="modal-backdrop"], .ad-banner, .advertisement, ' +
              '[id*="popunder"], [class*="popunder"], ' +
              'div[style*="z-index: 2147483647"], div[style*="z-index: 9999999"], ' +
              'a[target="_blank"][style*="position: absolute"], a[target="_blank"][style*="position: fixed"]'
            );
            for (var o = 0; o < overlays.length; o++) {
              overlays[o].remove();
              notifyAdBlocked('Overlay publicitario eliminado');
            }

            var traps = document.querySelectorAll('a[target="_blank"], a[href^="http"], div');
            for (var i = 0; i < traps.length; i++) {
              var el = traps[i];
              if (el.querySelector('video, iframe') || el.closest('.dplayer, .jwplayer, .video-js, [class*="player"], [id*="player"]')) {
                continue;
              }
              var s = window.getComputedStyle(el);
              if ((s.position === 'fixed' || s.position === 'absolute') && (parseInt(s.zIndex, 10) >= 1000)) {
                var op = parseFloat(s.opacity);
                if (op < 0.05 || s.visibility === 'hidden') {
                  var r = el.getBoundingClientRect();
                  if (r.width >= window.innerWidth * 0.7 && r.height >= window.innerHeight * 0.7) {
                    el.remove();
                    notifyAdBlocked('Capa clickjacking invisible eliminada');
                  }
                }
              }
            }
          } catch(e) {}
        }

        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', purgeClickjacking);
        } else {
          purgeClickjacking();
        }
        setInterval(purgeClickjacking, 1200);

        // Video Remote Control & Time Tracking Bridge
        function getActiveVideo() {
          return document.querySelector('video');
        }

        var pendingCmds = [];
        function applyPendingCmds(v) {
          if (!v || pendingCmds.length === 0) return;
          while (pendingCmds.length > 0) {
            var d = pendingCmds.shift();
            try {
              if (d.cmd === 'seek_to') {
                var target = (typeof d.seconds === 'number' && !isNaN(d.seconds) && d.seconds >= 0) ? d.seconds : 0;
                if (v.readyState >= 1) {
                  var dur = (typeof v.duration === 'number' && !isNaN(v.duration) && v.duration > 0) ? v.duration : 999999;
                  v.currentTime = Math.max(0, Math.min(dur, target));
                } else {
                  v.addEventListener('loadedmetadata', function() {
                    var dur = (typeof v.duration === 'number' && !isNaN(v.duration) && v.duration > 0) ? v.duration : 999999;
                    v.currentTime = Math.max(0, Math.min(dur, target));
                  }, { once: true });
                }
              } else if (d.cmd === 'set_rate') {
                var r = parseFloat(d.rate);
                v.playbackRate = (!isNaN(r) && r > 0) ? r : 1.0;
              }
            } catch (_) {}
          }
        }

        window.addEventListener('message', function(e) {
          if (!e.data || e.data.type !== 'PLAYER_CMD') return;
          var v = getActiveVideo();
          if (!v) {
            if (e.data.cmd === 'seek_to' || e.data.cmd === 'set_rate') {
              pendingCmds.push(e.data);
              if (pendingCmds.length > 5) pendingCmds.shift();
            }
            return;
          }
          var d = e.data;
          try {
            var dur = (typeof v.duration === 'number' && !isNaN(v.duration) && v.duration > 0) ? v.duration : 999999;
            var cur = (typeof v.currentTime === 'number' && !isNaN(v.currentTime) && v.currentTime >= 0) ? v.currentTime : 0;
            if (d.cmd === 'seek_relative') {
              var s = d.seconds !== undefined ? d.seconds : (d.delta !== undefined ? d.delta : 10);
              var numS = (typeof s === 'number' && !isNaN(s)) ? s : 10;
              v.currentTime = Math.max(0, Math.min(dur, cur + numS));
            } else if (d.cmd === 'seek_forward') {
              v.currentTime = Math.max(0, Math.min(dur, cur + 10));
            } else if (d.cmd === 'seek_backward') {
              v.currentTime = Math.max(0, Math.min(dur, cur - 10));
            } else if (d.cmd === 'seek_to') {
              var target = (typeof d.seconds === 'number' && !isNaN(d.seconds) && d.seconds >= 0) ? d.seconds : 0;
              if (v.readyState >= 1) {
                v.currentTime = Math.max(0, Math.min(dur, target));
              } else {
                v.addEventListener('loadedmetadata', function() {
                  var dur = (typeof v.duration === 'number' && !isNaN(v.duration) && v.duration > 0) ? v.duration : 999999;
                  v.currentTime = Math.max(0, Math.min(dur, target));
                }, { once: true });
              }
            } else if (d.cmd === 'set_rate') {
              var r = parseFloat(d.rate);
              v.playbackRate = (!isNaN(r) && r > 0) ? r : 1.0;
            } else if (d.cmd === 'play') {
              if (v.paused) v.play().catch(function(){});
            } else if (d.cmd === 'pause') {
              if (!v.paused) v.pause();
            } else if (d.cmd === 'toggle_play') {
              if (v.paused) v.play().catch(function(){}); else v.pause();
            } else if (d.cmd === 'toggle_mute') {
              v.muted = !v.muted;
            } else if (d.cmd === 'volume_up') {
              var curVol = (!isNaN(v.volume)) ? v.volume : 1;
              v.volume = Math.min(1, Math.round((curVol + 0.05) * 100) / 100);
            } else if (d.cmd === 'volume_down') {
              var curVol = (!isNaN(v.volume)) ? v.volume : 1;
              v.volume = Math.max(0, Math.round((curVol - 0.05) * 100) / 100);
            }
          } catch (_) {}
        });

        function hookVideoBridge() {
          try {
            var v = getActiveVideo();
            if (!v || v._asBridgeHooked) return;
            v._asBridgeHooked = true;
            applyPendingCmds(v);
            v.addEventListener('timeupdate', function() {
              try {
                if (realParent) {
                  realParent.postMessage({
                    type: 'ANIMESTREAM_TIME_UPDATE',
                    currentTime: v.currentTime,
                    duration: v.duration || 0,
                    playbackRate: v.playbackRate || 1.0
                  }, '*');
                }
              } catch (_) {}
            });
            v.addEventListener('pause', function() {
              try {
                if (realParent) {
                  realParent.postMessage({ type: 'ANIMESTREAM_PAUSE' }, '*');
                }
              } catch (_) {}
            });
            v.addEventListener('ended', function() {
              try {
                if (realParent) {
                  realParent.postMessage({ type: 'ANIMESTREAM_ENDED' }, '*');
                }
              } catch (_) {}
            });
          } catch (_) {}
        }
        setInterval(hookVideoBridge, 1000);
      } catch(e) {}
    })();
    </script>`;

    if (/<head>/i.test(cleaned)) {
      cleaned = cleaned.replace(/<head>/i, `<head>\n${shieldScript}`);
    } else {
      cleaned = `${shieldScript}\n${cleaned}`;
    }
  }

  return cleaned;
}

module.exports = {
  AD_DOMAINS,
  sanitizePlayerHtml
};
