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

/**
 * Detects the appropriate provider instance based on target URL domain
 */
function detectProviderByUrl(url) {
  if (!url || typeof url !== 'string') return null;
  const lower = url.toLowerCase();
  if (lower.includes('animeav1.com')) return animeav1Provider;
  if (lower.includes('jkanime.net')) return jkanimeProvider;
  if (lower.includes('tioanime.com')) return tioanimeProvider;
  return null;
}

module.exports = {
  animeav1Provider,
  jkanimeProvider,
  tioanimeProvider,
  providers,
  detectProviderByUrl
};
