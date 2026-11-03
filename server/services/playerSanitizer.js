/**
 * Third-Party Video Player Sanitizer & AdBlock Shield for Node.js
 * Removes hostile ad network scripts, unblocks restricted iframes, and neutralizes popups and clickjacking traps.
 */

const AD_DOMAINS = [
  'popads', 'popcash', 'adcash', 'adsterra', 'propellerads', 'exoclick',
  'monetag', 'clickadu', 'histats', 'doubleclick', 'googlesyndication',
  'bet365', '1xbet', 'mgid', 'onclickperformance', 'trafficfactory',
  'juicyads', 'hilltopads', 'ad-maven', 'ezmob', 'realsrv', 'zeroredirect',
  'deloton', 'adsco', 'creativecdn', 'tsyndicate', 'adtrue', 'vidoomy'
];

function sanitizePlayerHtml(html, baseHref = null, active = true) {
  if (!html || typeof html !== 'string') return html;

  let cleaned = html;

  // 1. Strip CSP and X-Frame-Options meta tags so player scripts can load
  cleaned = cleaned.replace(/<meta[^>]*http-equiv=['"](?:content-security-policy|x-frame-options)['"][^>]*>/gi, '');

  // 2. Inject <base href="..."> for relative resources
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

    // 4. Inject non-destructive protective shield
    const shieldScript = `<script>
    (function() {
      try {
        window.open = function(url) {
          console.warn('[AnimeStream AdBlock] Bloqueado popup publicitario:', url);
          return {
            closed: true,
            focus: function() {},
            close: function() {},
            location: { href: '' }
          };
        };
        window.alert = function() {};
        window.confirm = function() { return false; };
        window.prompt = function() { return null; };
        window.onbeforeunload = null;

        function purgeClickjacking() {
          try {
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
