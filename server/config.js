/**
 * Configuration and Core Utilities for AnimeStream Node.js
 * Includes Cloudflare Anycast ISP unblocking, Keep-Alive connection pooling, and UTF-8 encoding repair.
 */
const https = require('https');
const http = require('http');
const dns = require('dns');
const axios = require('axios');

const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes TTL
const REQUEST_TIMEOUT_MS = 8000;      // 8s timeout for quick failover

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
];

// Cloudflare Anycast clean node IP to bypass ISP blockades in Spain / EU
const CF_CLEAN_IP = '104.26.11.188';
const CF_DOMAIN_SUFFIXES = [
  'animeav1.com',
  'tioanime.com',
  'zilla-networks.com',
  'jkanime.net'
];

/**
 * Custom DNS lookup to resolve Cloudflare-blocked domains to clean Anycast nodes
 */
function unblockedLookup(hostname, options, callback) {
  if (typeof options === 'function') {
    callback = options;
    options = {};
  }

  const isCfTarget = CF_DOMAIN_SUFFIXES.some(d => hostname === d || hostname.endsWith('.' + d));
  if (isCfTarget) {
    if (options && options.all) {
      return callback(null, [{ address: CF_CLEAN_IP, family: 4 }]);
    }
    return callback(null, CF_CLEAN_IP, 4);
  }

  dns.lookup(hostname, options, (err, address, family) => {
    if (err) return callback(err, address, family);

    // If resolved IP is in the known blocked 188.114.96.x / 97.x ranges, redirect to clean node
    if (typeof address === 'string' && (address.startsWith('188.114.96.') || address.startsWith('188.114.97.'))) {
      return callback(null, CF_CLEAN_IP, 4);
    }
    return callback(null, address, family);
  });
}

// Global Keep-Alive Agents for ultra-fast connection reuse
const httpsAgent = new https.Agent({
  keepAlive: true,
  maxSockets: 64,
  maxFreeSockets: 32,
  timeout: REQUEST_TIMEOUT_MS,
  lookup: unblockedLookup
});

const httpAgent = new http.Agent({
  keepAlive: true,
  maxSockets: 64,
  maxFreeSockets: 32,
  timeout: REQUEST_TIMEOUT_MS,
  lookup: unblockedLookup
});

// Singleton Axios instance configured for high-performance scraping
const httpClient = axios.create({
  timeout: REQUEST_TIMEOUT_MS,
  httpAgent,
  httpsAgent,
  maxRedirects: 5,
  validateStatus: (status) => status >= 200 && status < 400
});

function getRandomUserAgent() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

function getHeaders(referer = null) {
  const headers = {
    'User-Agent': getRandomUserAgent(),
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
    'Sec-Ch-Ua': '"Chromium";v="124", "Google Chrome";v="124"',
    'Sec-Ch-Ua-Mobile': '?0',
    'Sec-Ch-Ua-Platform': '"Windows"',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': referer ? 'same-origin' : 'none',
    'Sec-Fetch-User': '?1',
    'Upgrade-Insecure-Requests': '1'
  };
  if (referer) {
    headers['Referer'] = referer;
  }
  return headers;
}

/**
 * Repairs common double-encoded UTF-8 / latin-1 mojibake strings
 */
function fixEncoding(str) {
  if (!str || typeof str !== 'string') return str;
  let text = str;
  try {
    if (/[\u00C0-\u00FF]/.test(text) && /[\u0080-\u00BF]/.test(text)) {
      const buffer = Buffer.from(text, 'binary');
      const decoded = buffer.toString('utf-8');
      if (!decoded.includes('')) {
        text = decoded;
      }
    }
  } catch (_) {}

  // Explicit replacements for common Spanish mojibake patterns
  text = text
    .replace(/Ã¡/g, 'á')
    .replace(/Ã©/g, 'é')
    .replace(/Ã­/g, 'í')
    .replace(/Ã³/g, 'ó')
    .replace(/Ãº/g, 'ú')
    .replace(/Ã±/g, 'ñ')
    .replace(/Ã/g, 'Á')
    .replace(/Ã‰/g, 'É')
    .replace(/Ã/g, 'Í')
    .replace(/Ã“/g, 'Ó')
    .replace(/Ãš/g, 'Ú')
    .replace(/Ã‘/g, 'Ñ')
    .replace(/Â¿/g, '¿')
    .replace(/Â¡/g, '¡')
    .replace(/Â/g, '')
    .trim();

  return text;
}

module.exports = {
  CACHE_TTL_MS,
  REQUEST_TIMEOUT_MS,
  USER_AGENTS,
  CF_CLEAN_IP,
  CF_DOMAIN_SUFFIXES,
  httpClient,
  getRandomUserAgent,
  getHeaders,
  fixEncoding
};
