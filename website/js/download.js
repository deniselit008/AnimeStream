/**
 * AnimeStream for Windows - Interactive Download Engine & GitHub Release Fetcher
 * Fetches latest releases from GitHub API with fallback protection,
 * handles interactive FAQ accordion, download modal, and system checks.
 */

(function () {
  'use strict';

  // Repository Configuration
  const GITHUB_CONFIG = {
    owner: 'deniselit008',
    repo: 'AnimeStream',
    fallbackVersion: '1.0.4',
    fallbackSizeMB: '24.3 MB',
    fallbackAssetUrl: 'https://github.com/deniselit008/AnimeStream/releases/download/1.0.4/AnimeStream.1.0.4.exe',
    fallbackReleaseUrl: 'https://github.com/deniselit008/AnimeStream/releases/latest',
    fallbackZipUrl: 'https://github.com/deniselit008/AnimeStream/archive/refs/heads/main.zip'
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

  /**
   * Fetch the latest valid Windows release from GitHub
   */
  async function fetchLatestWindowsRelease() {
    const apiUrl = `https://api.github.com/repos/${GITHUB_CONFIG.owner}/${GITHUB_CONFIG.repo}/releases`;

    try {
      const response = await fetch(apiUrl, {
        headers: {
          'Accept': 'application/vnd.github.v3+json'
        }
      });

      if (!response.ok) {
        throw new Error(`GitHub API HTTP ${response.status}`);
      }

      const releases = await response.json();
      if (!Array.isArray(releases) || releases.length === 0) {
        throw new Error('No releases found');
      }

      // Find the first release that contains a Windows .exe asset
      let targetRelease = null;
      let targetAsset = null;

      for (const rel of releases) {
        if (rel.draft) continue;
        if (Array.isArray(rel.assets) && rel.assets.length > 0) {
          // Look for an .exe file
          const exeAsset = rel.assets.find(a => 
            a.name.toLowerCase().endsWith('.exe')
          );
          if (exeAsset) {
            targetRelease = rel;
            targetAsset = exeAsset;
            break;
          }
        }
      }

      // If no release had assets, default to the latest release entry
      if (!targetRelease) {
        targetRelease = releases[0];
      }

      latestReleaseData = {
        tag: targetRelease.tag_name || GITHUB_CONFIG.fallbackVersion,
        name: targetRelease.name || `AnimeStream ${targetRelease.tag_name}`,
        publishedAt: formatDate(targetRelease.published_at),
        assetUrl: targetAsset ? targetAsset.browser_download_url : GITHUB_CONFIG.fallbackAssetUrl,
        assetName: targetAsset ? targetAsset.name : `AnimeStream.${targetRelease.tag_name}.exe`,
        assetSize: targetAsset ? formatBytes(targetAsset.size) : GITHUB_CONFIG.fallbackSizeMB,
        downloadCount: targetAsset ? targetAsset.download_count : 0,
        releaseUrl: targetRelease.html_url || GITHUB_CONFIG.fallbackReleaseUrl,
        zipUrl: targetRelease.zipball_url || GITHUB_CONFIG.fallbackZipUrl,
        body: targetRelease.body || ''
      };

      updateUIWithReleaseData(latestReleaseData);

    } catch (err) {
      console.warn('[AnimeStream Web] Usando versión de respaldo (fallback):', err.message);
      // Fallback UI
      updateUIWithReleaseData({
        tag: GITHUB_CONFIG.fallbackVersion,
        name: `AnimeStream ${GITHUB_CONFIG.fallbackVersion}`,
        publishedAt: 'Reciente',
        assetUrl: GITHUB_CONFIG.fallbackAssetUrl,
        assetName: `AnimeStream.${GITHUB_CONFIG.fallbackVersion}.exe`,
        assetSize: GITHUB_CONFIG.fallbackSizeMB,
        downloadCount: 0,
        releaseUrl: GITHUB_CONFIG.fallbackReleaseUrl,
        zipUrl: GITHUB_CONFIG.fallbackZipUrl,
        body: ''
      });
    }
  }

  /**
   * Update all DOM elements with latest release data
   */
  function updateUIWithReleaseData(data) {
    // 1. Update all download CTA buttons
    const downloadBtns = document.querySelectorAll('.js-download-btn');
    downloadBtns.forEach(btn => {
      btn.href = data.assetUrl;
      btn.setAttribute('download', data.assetName);
      
      const subText = btn.querySelector('.download-btn-sub');
      if (subText) {
        subText.textContent = `Versión ${data.tag} • ${data.assetSize} • Windows 64-bit`;
      }
    });

    // 2. Update version text elements
    const versionElements = document.querySelectorAll('.js-version-tag');
    versionElements.forEach(el => {
      el.textContent = data.tag.startsWith('v') ? data.tag : `v${data.tag}`;
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
        const schema = JSON.parse(schemaScript.textContent);
        if (schema && schema['@type'] === 'SoftwareApplication') {
          schema.softwareVersion = data.tag;
          schema.downloadUrl = data.assetUrl;
          schemaScript.textContent = JSON.stringify(schema, null, 2);
        }
      } catch (e) {
        // Ignore schema json parse error
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
      btn.addEventListener('click', function () {
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
