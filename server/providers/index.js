/**
 * Provider Registry and Routing Detector for AnimeStream
 */
const animeav1Provider = require('./animeav1');
const jkanimeProvider = require('./jkanime');
const tioanimeProvider = require('./tioanime');

const providers = {
  animeav1: animeav1Provider,
  jkanime: jkanimeProvider,
  tioanime: tioanimeProvider
};

const PROVIDER_HOSTS = [
  { domains: ['animeav1.com'], provider: animeav1Provider },
  { domains: ['jkanime.net'], provider: jkanimeProvider },
  { domains: ['tioanime.com'], provider: tioanimeProvider }
];

/**
 * Detects the appropriate provider instance based on validated target URL hostname
 */
function detectProviderByUrl(url) {
  if (!url || typeof url !== 'string') return null;
  let trimmed = url.trim();
  if (trimmed.startsWith('//')) trimmed = 'https:' + trimmed;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    if (parsed.username || parsed.password) return null;
    const host = parsed.hostname.toLowerCase().replace(/\.+$/, '');
    for (const entry of PROVIDER_HOSTS) {
      if (entry.domains.some(d => host === d || host.endsWith('.' + d))) {
        return entry.provider;
      }
    }
  } catch (_) {
    return null;
  }
  return null;
}

module.exports = {
  animeav1Provider,
  jkanimeProvider,
  tioanimeProvider,
  providers,
  detectProviderByUrl
};
