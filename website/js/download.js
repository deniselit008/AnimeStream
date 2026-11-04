/**
 * AnimeStream for Windows - Interactive Download Engine & GitHub Release Fetcher
 * Fetches latest releases from GitHub API with fallback protection and localStorage caching,
 * ensuring the download button and metadata ALWAYS reflect the latest available version.
 */

(function () {
  'use strict';

  // Repository Configuration
  const GITHUB_CONFIG = {
    owner: 'deniselit008',
    repo: 'AnimeStream',
    fallbackVersion: '1.0.5',
    fallbackSizeMB: '24.3 MB',
    fallbackAssetUrl: 'https://github.com/deniselit008/AnimeStream/releases/download/1.0.5/AnimeStream.1.0.5.exe',
    fallbackReleaseUrl: 'https://github.com/deniselit008/AnimeStream/releases/latest',
    fallbackZipUrl: 'https://github.com/deniselit008/AnimeStream/archive/refs/heads/main.zip',
    storageKey: 'animestream_release_cache_v2'
  };

  // State
  let latestReleaseData = null;

  // Format bytes to human readable string
  function formatBytes(bytes, decimals = 1) {
    if (!bytes || bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }

  // Format ISO Date to Spanish locale
  function formatDate(isoString) {
    if (!isoString) return '';
    try {
      const date = new Date(isoString);
      return date.toLocaleDateString('es-ES', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    } catch (e) {
      return '';
    }
  }

  // Normalize tag to guarantee 'v' prefix for display
  function normalizeDisplayTag(tag) {
    if (!tag) return `v${GITHUB_CONFIG.fallbackVersion}`;
    return tag.toString().startsWith('v') ? tag.toString() : `v${tag}`;
  }

  /**
   * Fetch the latest valid Windows release from GitHub API
   * Uses releases/latest first, falls back to releases list, and caches to localStorage
   */
  async function fetchLatestWindowsRelease() {
    // 1. Try local cache first for instant rendering (0 delay)
    try {
      const cached = localStorage.getItem(GITHUB_CONFIG.storageKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed && parsed.tag) {
          latestReleaseData = parsed;
          updateUIWithReleaseData(parsed);
        }
      }
    } catch (e) {
      // Ignore localStorage issues
    }

    try {
      let releaseObj = null;
      let targetAsset = null;

      // 2. Fetch directly from the official /releases/latest endpoint
      try {
        const latestResp = await fetch(`https://api.github.com/repos/${GITHUB_CONFIG.owner}/${GITHUB_CONFIG.repo}/releases/latest`, {
          headers: { 'Accept': 'application/vnd.github.v3+json' },
          cache: 'no-cache'
        });
        if (latestResp.ok) {
          releaseObj = await latestResp.json();
        }
      } catch (err) {
        console.warn('[AnimeStream Web] releases/latest endpoint fetch notice:', err.message);
      }

      // 3. Fallback: query the full releases list if /latest did not resolve
      if (!releaseObj || releaseObj.message === 'Not Found') {
        const listResp = await fetch(`https://api.github.com/repos/${GITHUB_CONFIG.owner}/${GITHUB_CONFIG.repo}/releases`, {
          headers: { 'Accept': 'application/vnd.github.v3+json' }
        });
        if (listResp.ok) {
          const releases = await listResp.json();
          if (Array.isArray(releases) && releases.length > 0) {
            releaseObj = releases.find(r => !r.draft) || releases[0];
          }
        }
      }

      if (!releaseObj) {
        throw new Error('No valid releases found via GitHub API');
      }

      // 4. Resolve the best downloadable binary: prioritize .exe, then .zip, then any installer
      if (Array.isArray(releaseObj.assets) && releaseObj.assets.length > 0) {
        targetAsset = releaseObj.assets.find(a => a.name.toLowerCase().endsWith('.exe'))
                   || releaseObj.assets.find(a => a.name.toLowerCase().endsWith('.zip'))
                   || releaseObj.assets.find(a => a.name.toLowerCase().endsWith('.msi'))
                   || releaseObj.assets[0];
      }

      const cleanTag = releaseObj.tag_name || GITHUB_CONFIG.fallbackVersion;
      const displayTag = normalizeDisplayTag(cleanTag);
      const assetUrl = targetAsset 
        ? targetAsset.browser_download_url 
        : `https://github.com/${GITHUB_CONFIG.owner}/${GITHUB_CONFIG.repo}/releases/download/${cleanTag}/AnimeStream.${cleanTag}.exe`;
      const assetName = targetAsset ? targetAsset.name : `AnimeStream.${cleanTag}.exe`;
      const assetSize = targetAsset && targetAsset.size ? formatBytes(targetAsset.size) : GITHUB_CONFIG.fallbackSizeMB;

      latestReleaseData = {
        tag: cleanTag,
        displayTag: displayTag,
        name: releaseObj.name || `AnimeStream ${displayTag}`,
        publishedAt: formatDate(releaseObj.published_at) || 'Noviembre 2026',
        assetUrl: assetUrl,
        assetName: assetName,
        assetSize: assetSize,
        downloadCount: targetAsset ? targetAsset.download_count : 0,
        releaseUrl: releaseObj.html_url || GITHUB_CONFIG.fallbackReleaseUrl,
        zipUrl: releaseObj.zipball_url || GITHUB_CONFIG.fallbackZipUrl,
        body: releaseObj.body || '',
        fetchedAt: Date.now()
      };

      // 5. Cache to localStorage for fast subsequent loads
      try {
        localStorage.setItem(GITHUB_CONFIG.storageKey, JSON.stringify(latestReleaseData));
      } catch (e) {}

      updateUIWithReleaseData(latestReleaseData);

    } catch (err) {
      console.warn('[AnimeStream Web] Usando versión de respaldo (fallback):', err.message);
      if (!latestReleaseData) {
        const fallbackTag = GITHUB_CONFIG.fallbackVersion;
        const displayTag = normalizeDisplayTag(fallbackTag);
        latestReleaseData = {
          tag: fallbackTag,
          displayTag: displayTag,
          name: `AnimeStream ${displayTag}`,
          publishedAt: 'Noviembre 2026',
          assetUrl: GITHUB_CONFIG.fallbackAssetUrl,
          assetName: `AnimeStream.${fallbackTag}.exe`,
          assetSize: GITHUB_CONFIG.fallbackSizeMB,
          downloadCount: 0,
          releaseUrl: GITHUB_CONFIG.fallbackReleaseUrl,
          zipUrl: GITHUB_CONFIG.fallbackZipUrl,
          body: '',
          fetchedAt: Date.now()
        };
        updateUIWithReleaseData(latestReleaseData);
      }
    }
  }

  /**
   * Update all DOM elements with latest release data dynamically
   */
  function updateUIWithReleaseData(data) {
    if (!data) return;
    const displayTag = data.displayTag || normalizeDisplayTag(data.tag);

    // 1. Update all download CTA buttons
    const downloadBtns = document.querySelectorAll('.js-download-btn');
    downloadBtns.forEach(btn => {
      btn.href = data.assetUrl || GITHUB_CONFIG.fallbackReleaseUrl;
      btn.setAttribute('download', data.assetName || `AnimeStream.${data.tag}.exe`);
      btn.setAttribute('title', `Descargar AnimeStream ${displayTag} para Windows`);

      // Update subtitle if exists inside button
      const subText = btn.querySelector('.download-btn-sub');
      if (subText) {
        subText.innerHTML = `Versión <strong>${displayTag}</strong> • ${data.assetSize} • Windows 64-bit`;
      }
    });

    // 2. Update version text elements
    const versionElements = document.querySelectorAll('.js-version-tag');
    versionElements.forEach(el => {
      el.textContent = displayTag;
    });

    // 3. Update size text elements
    const sizeElements = document.querySelectorAll('.js-file-size');
    sizeElements.forEach(el => {
      el.textContent = data.assetSize;
    });

    // 4. Update date elements
    const dateElements = document.querySelectorAll('.js-release-date');
    dateElements.forEach(el => {
      if (data.publishedAt) {
        el.textContent = data.publishedAt;
      }
    });

    // 5. Update alternative links
    const sourceZipLink = document.querySelector('.js-source-zip-link');
    if (sourceZipLink && data.zipUrl) {
      sourceZipLink.href = data.zipUrl;
    }

    const githubReleasesLink = document.querySelector('.js-github-releases-link');
    if (githubReleasesLink && data.releaseUrl) {
      githubReleasesLink.href = data.releaseUrl;
    }

    // 6. Update Schema.org softwareVersion in JSON-LD
    const schemaScript = document.querySelector('script[type="application/ld+json"]');
    if (schemaScript) {
      try {
        const schemas = JSON.parse(schemaScript.textContent);
        if (Array.isArray(schemas)) {
          const appSchema = schemas.find(s => s['@type'] === 'SoftwareApplication');
          if (appSchema) {
            appSchema.softwareVersion = data.tag;
            appSchema.fileSize = data.assetSize;
            appSchema.downloadUrl = data.assetUrl;
            schemaScript.textContent = JSON.stringify(schemas, null, 2);
          }
        }
      } catch (e) {
        // Ignore json parse error
      }
    }
  }

  /**
   * Modal handling for post-click download instructions
   */
  function setupDownloadModal() {
    const modal = document.getElementById('downloadModal');
    const closeBtn = document.getElementById('modalCloseBtn');
    const downloadBtns = document.querySelectorAll('.js-download-btn');

    if (!modal) return;

    downloadBtns.forEach(btn => {
      btn.addEventListener('click', function (e) {
        // If clicking inside the modal itself, don't re-trigger
        if (btn.closest('#downloadModal')) return;

        // Open instructions modal
        setTimeout(() => {
          modal.classList.add('open');
        }, 400);
      });
    });

    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        modal.classList.remove('open');
      });
    }

    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.classList.remove('open');
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && modal.classList.contains('open')) {
        modal.classList.remove('open');
      }
    });
  }

  /**
   * Accessible FAQ Accordion
   */
  function setupFaqAccordion() {
    const faqItems = document.querySelectorAll('.faq-item');

    faqItems.forEach(item => {
      const questionBtn = item.querySelector('.faq-question');
      if (!questionBtn) return;

      questionBtn.addEventListener('click', () => {
        const isActive = item.classList.contains('active');

        // Close all items
        faqItems.forEach(otherItem => {
          otherItem.classList.remove('active');
          const otherBtn = otherItem.querySelector('.faq-question');
          if (otherBtn) otherBtn.setAttribute('aria-expanded', 'false');
        });

        // Toggle current item
        if (!isActive) {
          item.classList.add('active');
          questionBtn.setAttribute('aria-expanded', 'true');
        }
      });
    });
  }

  /**
   * Mobile Menu Toggle
   */
  function setupMobileMenu() {
    const toggleBtn = document.getElementById('mobileMenuToggle');
    const navLinks = document.getElementById('navLinks');

    if (toggleBtn && navLinks) {
      toggleBtn.addEventListener('click', () => {
        navLinks.classList.toggle('open');
        const isExpanded = navLinks.classList.contains('open');
        toggleBtn.setAttribute('aria-expanded', isExpanded);
      });

      // Close menu when clicking any nav link
      navLinks.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', () => {
          navLinks.classList.remove('open');
          toggleBtn.setAttribute('aria-expanded', 'false');
        });
      });
    }
  }

  /**
   * Back To Top Button
   */
  function setupBackToTop() {
    const btn = document.getElementById('backToTopBtn');
    if (!btn) return;

    window.addEventListener('scroll', () => {
      if (window.scrollY > 400) {
        btn.classList.add('visible');
      } else {
        btn.classList.remove('visible');
      }
    }, { passive: true });

    btn.addEventListener('click', () => {
      window.scrollTo({
        top: 0,
        behavior: 'smooth'
      });
    });
  }

  /**
   * Copy to clipboard helper
   */
  window.copyToClipboard = function (text, message = 'Copiado al portapapeles') {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        showToast(message);
      }).catch(() => {
        fallbackCopy(text, message);
      });
    } else {
      fallbackCopy(text, message);
    }
  };

  function fallbackCopy(text, message) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    try {
      document.execCommand('copy');
      showToast(message);
    } catch (e) {
      showToast('Error al copiar');
    }
    document.body.removeChild(textarea);
  }

  function showToast(message) {
    let toast = document.getElementById('siteToast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'siteToast';
      toast.className = 'toast';
      document.body.appendChild(toast);
    }
    toast.innerHTML = `<span>📋</span> <span>${message}</span>`;
    toast.classList.add('show');
    setTimeout(() => {
      toast.classList.remove('show');
    }, 3000);
  }

  // Initialize on DOM load
  document.addEventListener('DOMContentLoaded', () => {
    fetchLatestWindowsRelease();
    setupDownloadModal();
    setupFaqAccordion();
    setupMobileMenu();
    setupBackToTop();

    // Check if URL has ?download=true
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('download') === 'true' || urlParams.get('download') === 'auto') {
      const primaryBtn = document.querySelector('.js-download-btn');
      if (primaryBtn) {
        setTimeout(() => {
          primaryBtn.click();
        }, 600);
      }
    }
  });

})();
