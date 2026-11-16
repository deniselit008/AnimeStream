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
    const baseTag = `<base href="${baseHref}">`;
    if (/<head>/i.test(cleaned)) {
      cleaned = cleaned.replace(/<head>/i, `<head>\n${baseTag}`);
    } else {
      cleaned = `${baseTag}\n${cleaned}`;
    }
  }

  if (active) {
    // 3. Remove script and iframe tags loading known ad network domains
    for (const domain of AD_DOMAINS) {
      const scriptRegex = new RegExp(`<script[^>]*src=['"][^'"]*${domain}[^'"]*['"][^>]*>.*?</script>`, 'gis');
      const scriptSelfClose = new RegExp(`<script[^>]*src=['"][^'"]*${domain}[^'"]*['"][^>]*/>`, 'gi');
      const iframeRegex = new RegExp(`<iframe[^>]*src=['"][^'"]*${domain}[^'"]*['"][^>]*>.*?</iframe>`, 'gis');
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
            if (window.top && window.top !== window) {
              window.top.postMessage({ type: 'ANIMESTREAM_ADBLOCK_HIT', reason: reason }, '*');
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
