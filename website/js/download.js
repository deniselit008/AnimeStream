/**
 * AnimeStream - Multiplatform Download Engine & GitHub Release Fetcher
 * Supports:
 *  - Windows: .exe (Installer & Portable)
 *  - Android: .apk (Native Package)
 *  - Linux: ELF Binary (.AppImage / .deb)
 *
 * Dynamically queries the GitHub API to always deliver the newest version release assets
 * with local caching and offline fallback protection.
 */

(function () {
  'use strict';

  // Repository & Fallback Configuration
  const GITHUB_CONFIG = {
    owner: 'deniselit008',
    repo: 'AnimeStream',
    fallbackVersion: '1.2.1',
    storageKey: 'animestream_release_cache_v7',
    fallbackReleaseUrl: 'https://github.com/deniselit008/AnimeStream/releases/latest',
    fallbackZipUrl: 'https://github.com/deniselit008/AnimeStream/archive/refs/heads/main.zip',
    platforms: {
      windows: {
        ext: '.exe',
        defaultName: 'AnimeStream.Setup.1.2.1.exe',
        fallbackSize: '123 MB',
        fallbackUrl: 'https://github.com/deniselit008/AnimeStream/releases/download/1.2.1/AnimeStream.Setup.1.2.1.exe',
        portableName: 'AnimeStream.1.2.1.exe',
        portableSize: '111 MB',
        portableUrl: 'https://github.com/deniselit008/AnimeStream/releases/download/1.2.1/AnimeStream.1.2.1.exe',
        systemLabel: 'Windows 10 / 11 (64-bit)'
      },
      android: {
        ext: '.apk',
        defaultName: 'AnimeStream.apk',
        fallbackSize: '6.1 MB',
        fallbackUrl: 'https://github.com/deniselit008/AnimeStream/releases/download/1.2.1/AnimeStream.apk',
        systemLabel: 'Android 7.0+ (Móvil, Tablet & TV)'
      },
      linux: {
        ext: '.AppImage',
        defaultName: 'AnimeStream-1.2.1.AppImage',
        fallbackSize: '129 MB',
        fallbackUrl: 'https://github.com/deniselit008/AnimeStream/releases/download/1.2.1/AnimeStream-1.2.1.AppImage',
        debName: 'animestream-node_1.2.1_amd64.deb',
        debSize: '103 MB',
        debUrl: 'https://github.com/deniselit008/AnimeStream/releases/download/1.2.1/animestream-node_1.2.1_amd64.deb',
        systemLabel: 'Linux x64 (Binario ELF AppImage & paquete .deb)'
      }
    }
  };

  // State
  let releaseCache = null;

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
   * Fetch latest releases from GitHub API and extract platform assets
   */
  async function fetchLatestReleases() {
    // 1. Try local cache first for instant UI response
    try {
      const cached = localStorage.getItem(GITHUB_CONFIG.storageKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed && parsed.tag) {
          releaseCache = parsed;
          updateUIWithReleaseData(parsed);
        }
      }
    } catch (e) {}

    try {
      let releaseObj = null;

      // 2. Query /releases/latest endpoint
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

      // 3. Fallback: query full releases list
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

      const cleanTag = releaseObj.tag_name || GITHUB_CONFIG.fallbackVersion;
      const displayTag = normalizeDisplayTag(cleanTag);
      const assets = Array.isArray(releaseObj.assets) ? releaseObj.assets : [];

      // Find platform assets
      // 1. Windows Installer: prioritizes setup/installer .exe
      const winInstallerAsset = assets.find(a => {
        const n = a.name.toLowerCase();
        return (n.includes('setup') || n.includes('installer')) && n.endsWith('.exe');
      }) || assets.find(a => a.name.toLowerCase().endsWith('.msi'))
         || assets.find(a => a.name.toLowerCase().endsWith('.exe'));

      // 2. Windows Portable: .exe without setup/installer
      const winPortableAsset = assets.find(a => {
        const n = a.name.toLowerCase();
        return !n.includes('setup') && !n.includes('installer') && n.endsWith('.exe');
      });
      
      const androidAsset = assets.find(a => a.name.toLowerCase().endsWith('.apk'));

      const linuxAppImageAsset = assets.find(a => a.name.toLowerCase().endsWith('.appimage'));
      const linuxDebAsset = assets.find(a => a.name.toLowerCase().endsWith('.deb'));
      const linuxAsset = linuxAppImageAsset || linuxDebAsset;

      releaseCache = {
        tag: cleanTag,
        displayTag: displayTag,
        name: releaseObj.name || `AnimeStream ${displayTag}`,
        publishedAt: formatDate(releaseObj.published_at) || 'Noviembre 2026',
        releaseUrl: releaseObj.html_url || GITHUB_CONFIG.fallbackReleaseUrl,
        zipUrl: releaseObj.zipball_url || GITHUB_CONFIG.fallbackZipUrl,
        windows: {
          url: winInstallerAsset ? winInstallerAsset.browser_download_url : GITHUB_CONFIG.platforms.windows.fallbackUrl,
          name: winInstallerAsset ? winInstallerAsset.name : GITHUB_CONFIG.platforms.windows.defaultName,
          size: winInstallerAsset && winInstallerAsset.size ? formatBytes(winInstallerAsset.size) : GITHUB_CONFIG.platforms.windows.fallbackSize,
          count: winInstallerAsset ? winInstallerAsset.download_count : 0,
          portableUrl: winPortableAsset ? winPortableAsset.browser_download_url : GITHUB_CONFIG.platforms.windows.portableUrl,
          portableName: winPortableAsset ? winPortableAsset.name : GITHUB_CONFIG.platforms.windows.portableName,
          portableSize: winPortableAsset && winPortableAsset.size ? formatBytes(winPortableAsset.size) : GITHUB_CONFIG.platforms.windows.portableSize
        },
        android: {
          url: androidAsset ? androidAsset.browser_download_url : GITHUB_CONFIG.platforms.android.fallbackUrl,
          name: androidAsset ? androidAsset.name : GITHUB_CONFIG.platforms.android.defaultName,
          size: androidAsset && androidAsset.size ? formatBytes(androidAsset.size) : GITHUB_CONFIG.platforms.android.fallbackSize,
          count: androidAsset ? androidAsset.download_count : 0
        },
        linux: {
          url: linuxAsset ? linuxAsset.browser_download_url : GITHUB_CONFIG.platforms.linux.fallbackUrl,
          name: linuxAsset ? linuxAsset.name : GITHUB_CONFIG.platforms.linux.defaultName,
          size: linuxAsset && linuxAsset.size ? formatBytes(linuxAsset.size) : GITHUB_CONFIG.platforms.linux.fallbackSize,
          count: linuxAsset ? linuxAsset.download_count : 0,
          debUrl: linuxDebAsset ? linuxDebAsset.browser_download_url : GITHUB_CONFIG.platforms.linux.debUrl,
          debName: linuxDebAsset ? linuxDebAsset.name : GITHUB_CONFIG.platforms.linux.debName,
          debSize: linuxDebAsset && linuxDebAsset.size ? formatBytes(linuxDebAsset.size) : GITHUB_CONFIG.platforms.linux.debSize,
          debCount: linuxDebAsset ? linuxDebAsset.download_count : 0
        },
        fetchedAt: Date.now()
      };

      try {
        localStorage.setItem(GITHUB_CONFIG.storageKey, JSON.stringify(releaseCache));
      } catch (e) {}

      updateUIWithReleaseData(releaseCache);

    } catch (err) {
      console.warn('[AnimeStream Web] Usando versión de respaldo (fallback):', err.message);
      if (!releaseCache) {
        const fallbackTag = GITHUB_CONFIG.fallbackVersion;
        const displayTag = normalizeDisplayTag(fallbackTag);
        releaseCache = {
          tag: fallbackTag,
          displayTag: displayTag,
          name: `AnimeStream ${displayTag}`,
          publishedAt: 'Noviembre 2026',
          releaseUrl: GITHUB_CONFIG.fallbackReleaseUrl,
          zipUrl: GITHUB_CONFIG.fallbackZipUrl,
          windows: {
            url: GITHUB_CONFIG.platforms.windows.fallbackUrl,
            name: GITHUB_CONFIG.platforms.windows.defaultName,
            size: GITHUB_CONFIG.platforms.windows.fallbackSize,
            count: 0,
            portableUrl: GITHUB_CONFIG.platforms.windows.portableUrl,
            portableName: GITHUB_CONFIG.platforms.windows.portableName,
            portableSize: GITHUB_CONFIG.platforms.windows.portableSize
          },
          android: {
            url: GITHUB_CONFIG.platforms.android.fallbackUrl,
            name: GITHUB_CONFIG.platforms.android.defaultName,
            size: GITHUB_CONFIG.platforms.android.fallbackSize,
            count: 0
          },
          linux: {
            url: GITHUB_CONFIG.platforms.linux.fallbackUrl,
            name: GITHUB_CONFIG.platforms.linux.defaultName,
            size: GITHUB_CONFIG.platforms.linux.fallbackSize,
            count: 0,
            debUrl: GITHUB_CONFIG.platforms.linux.debUrl,
            debName: GITHUB_CONFIG.platforms.linux.debName,
            debSize: GITHUB_CONFIG.platforms.linux.debSize,
            debCount: 0
          },
          fetchedAt: Date.now()
        };
        updateUIWithReleaseData(releaseCache);
      }
    }
  }

  /**
   * Update all DOM elements with latest release data dynamically
   */
  function updateUIWithReleaseData(data) {
    if (!data) return;
    const displayTag = data.displayTag || normalizeDisplayTag(data.tag);

    // 1. Update version text elements across the whole page
    document.querySelectorAll('.js-version-tag').forEach(el => {
      el.textContent = displayTag;
    });

    // 2. Update release date elements
    document.querySelectorAll('.js-release-date').forEach(el => {
      if (data.publishedAt) el.textContent = data.publishedAt;
    });

    // 3. Update Windows Download Buttons (Installer)
    const winBtns = document.querySelectorAll('.js-download-btn, .js-download-win');
    winBtns.forEach(btn => {
      btn.href = data.windows.url;
      btn.setAttribute('download', data.windows.name);
      btn.setAttribute('data-platform', 'windows');
      btn.setAttribute('title', `Descargar Instalador de AnimeStream ${displayTag} para Windows (.exe)`);

      const subText = btn.querySelector('.download-btn-sub');
      if (subText) {
        subText.innerHTML = `Instalador <strong>${displayTag}</strong> • ${data.windows.size} • Windows 64-bit`;
      }
    });

    // 3.1. Update Windows Portable Links
    const winPortableLinks = document.querySelectorAll('.js-download-win-portable');
    winPortableLinks.forEach(link => {
      link.href = data.windows.portableUrl;
      link.setAttribute('download', data.windows.portableName);
      link.setAttribute('data-platform', 'windows-portable');
      link.setAttribute('title', `Descargar versión portable de AnimeStream ${displayTag} (.exe sin instalación)`);
    });

    // 4. Update Android Download Buttons
    const androidBtns = document.querySelectorAll('.js-download-android');
    androidBtns.forEach(btn => {
      btn.href = data.android.url;
      btn.setAttribute('download', data.android.name);
      btn.setAttribute('data-platform', 'android');
      btn.setAttribute('title', `Descargar AnimeStream ${displayTag} para Android (.apk)`);

      const subText = btn.querySelector('.download-btn-sub');
      if (subText) {
        subText.innerHTML = `Versión <strong>${displayTag}</strong> • ${data.android.size} • Android APK`;
      }
    });

    // 5. Update Linux Download Buttons (.AppImage)
    const linuxBtns = document.querySelectorAll('.js-download-linux');
    linuxBtns.forEach(btn => {
      btn.href = data.linux.url;
      btn.setAttribute('download', data.linux.name);
      btn.setAttribute('data-platform', 'linux');
      btn.setAttribute('title', `Descargar AnimeStream ${displayTag} para Linux (Binario ELF AppImage)`);

      const subText = btn.querySelector('.download-btn-sub');
      if (subText) {
        subText.innerHTML = `Versión <strong>${displayTag}</strong> • ${data.linux.size} • Linux ELF AppImage`;
      }
    });

    // 5.1. Update Linux Debian / Ubuntu (.deb) Links & Buttons
    const linuxDebBtns = document.querySelectorAll('.js-download-linux-deb');
    linuxDebBtns.forEach(btn => {
      btn.href = data.linux.debUrl;
      btn.setAttribute('download', data.linux.debName);
      btn.setAttribute('data-platform', 'linux-deb');
      btn.setAttribute('title', `Descargar paquete para Debian/Ubuntu (${data.linux.debName})`);
    });

    // 6. Update platform file sizes in pills/cards
    document.querySelectorAll('.js-file-size, .js-file-size-win').forEach(el => {
      el.textContent = data.windows.size;
    });
    document.querySelectorAll('.js-file-size-win-portable').forEach(el => {
      el.textContent = data.windows.portableSize;
    });
    document.querySelectorAll('.js-file-size-android').forEach(el => {
      el.textContent = data.android.size;
    });
    document.querySelectorAll('.js-file-size-linux').forEach(el => {
      el.textContent = data.linux.size;
    });
    document.querySelectorAll('.js-file-size-linux-deb').forEach(el => {
      el.textContent = data.linux.debSize;
    });

    // 7. Update links to GitHub
    const sourceZipLink = document.querySelector('.js-source-zip-link');
    if (sourceZipLink && data.zipUrl) sourceZipLink.href = data.zipUrl;

    const githubReleasesLink = document.querySelector('.js-github-releases-link');
    if (githubReleasesLink && data.releaseUrl) githubReleasesLink.href = data.releaseUrl;
  }

  /**
   * Modal handling for post-click download instructions with platform intelligence
   */
  function setupDownloadModal() {
    const modal = document.getElementById('downloadModal');
    const closeBtn = document.getElementById('modalCloseBtn');
    const titleEl = document.getElementById('modalTitle');
    const descEl = document.getElementById('modalDesc');
    const tipEl = document.getElementById('modalTip');
    const retryBtn = document.getElementById('modalRetryBtn');

    if (!modal) return;

    // Attach click listeners to all download triggers
    document.addEventListener('click', function (e) {
      const btn = e.target.closest('.js-download-btn, .js-download-win, .js-download-win-portable, .js-download-android, .js-download-linux, .js-download-linux-deb');
      if (!btn) return;
      if (btn.closest('#downloadModal')) return; // ignore modal's internal button

      const platform = btn.getAttribute('data-platform') || 'windows';
      const tag = releaseCache ? releaseCache.displayTag : `v${GITHUB_CONFIG.fallbackVersion}`;

      // Customize modal content based on platform
      if (platform === 'android') {
        if (titleEl) titleEl.textContent = '¡Descargando AnimeStream APK para Android!';
        if (descEl) descEl.innerHTML = `Tu descarga de <strong>AnimeStream.apk</strong> (${tag}) ha comenzado.`;
        if (tipEl) {
          tipEl.innerHTML = `
            <p><strong>🤖 Cómo instalar en Android:</strong></p>
            <ol style="margin-top:6px; padding-left:18px; line-height:1.5;">
              <li>Abre el archivo <strong>AnimeStream.apk</strong> desde la barra de notificaciones o tu carpeta de Descargas.</li>
              <li>Si tu navegador lo solicita, pulsa en <em>"Ajustes"</em> y activa la casilla <em>"Permitir desde esta fuente"</em>.</li>
              <li>Pulsa <strong>"Instalar"</strong> y ¡a disfrutar de tu anime en pantalla completa!</li>
            </ol>
          `;
        }
        if (retryBtn && releaseCache) {
          retryBtn.href = releaseCache.android.url;
          retryBtn.textContent = 'Reintentar Descarga APK';
        }
      } else if (platform === 'linux-deb') {
        if (titleEl) titleEl.textContent = '¡Descargando paquete Debian / Ubuntu (.deb)!';
        const debName = releaseCache ? releaseCache.linux.debName : 'animestream-node_1.2.1_amd64.deb';
        if (descEl) descEl.innerHTML = `Tu descarga de <strong>${debName}</strong> (${tag}) ha comenzado.`;
        if (tipEl) {
          tipEl.innerHTML = `
            <p><strong>📦 Cómo instalar el paquete .deb en Ubuntu/Debian/Mint:</strong></p>
            <ol style="margin-top:6px; padding-left:18px; line-height:1.5;">
              <li>Haz doble clic sobre el archivo <code>.deb</code> descargado para abrirlo con el Centro de Software.</li>
              <li>O desde la terminal en tu carpeta de descargas, ejecuta:
                <br><code style="display:inline-block; margin-top:4px; padding:3px 8px; background:rgba(0,0,0,0.3); border-radius:4px;">sudo dpkg -i ${debName}</code>
              </li>
              <li>Si te solicita dependencias faltantes, corrígelas con: <code>sudo apt-get install -f</code></li>
            </ol>
          `;
        }
        if (retryBtn && releaseCache) {
          retryBtn.href = releaseCache.linux.debUrl;
          retryBtn.textContent = 'Reintentar Descarga paquete .deb';
        }
      } else if (platform === 'linux') {
        if (titleEl) titleEl.textContent = '¡Descargando AnimeStream para Linux (ELF)!';
        if (descEl) descEl.innerHTML = `Tu descarga de <strong>AnimeStream.AppImage</strong> (${tag}) ha comenzado.`;
        if (tipEl) {
          tipEl.innerHTML = `
            <p><strong>🐧 Cómo ejecutar en Linux:</strong></p>
            <ol style="margin-top:6px; padding-left:18px; line-height:1.5;">
              <li>Abre una terminal en la carpeta donde descargaste el archivo.</li>
              <li>Dale permisos de ejecución: <code>chmod +x AnimeStream*.AppImage</code></li>
              <li>Ejecútalo con <code>./AnimeStream*.AppImage</code> o haz doble clic desde tu gestor de archivos.</li>
            </ol>
          `;
        }
        if (retryBtn && releaseCache) {
          retryBtn.href = releaseCache.linux.url;
          retryBtn.textContent = 'Reintentar Descarga Linux AppImage';
        }
      } else if (platform === 'windows-portable') {
        // Windows Portable
        if (titleEl) titleEl.textContent = '¡Descargando AnimeStream Portable!';
        const pName = releaseCache ? releaseCache.windows.portableName : 'AnimeStream.1.2.1.exe';
        if (descEl) descEl.innerHTML = `Tu descarga de la versión portable <strong>${pName}</strong> (${tag}) ha comenzado.`;
        if (tipEl) {
          tipEl.innerHTML = `
            <p><strong>📦 Versión Portable (Sin instalación):</strong></p>
            <p style="margin-top:4px;">
              Este ejecutable es 100% portable y autónomo. No requiere instalación. Haz doble clic para abrirlo directamente. Si Windows Defender muestra la advertencia de SmartScreen, pulsa en <strong>Más información</strong> y luego en <strong>Ejecutar de todas formas</strong>.
            </p>
          `;
        }
        if (retryBtn && releaseCache) {
          retryBtn.href = releaseCache.windows.portableUrl;
          retryBtn.textContent = 'Reintentar Descarga Portable (.exe)';
        }
      } else {
        // Windows Installer
        if (titleEl) titleEl.textContent = '¡Descargando el Instalador de Windows!';
        const iName = releaseCache ? releaseCache.windows.name : 'AnimeStream.Setup.1.2.1.exe';
        if (descEl) descEl.innerHTML = `Tu descarga del instalador oficial <strong>${iName}</strong> (${tag}) ha comenzado.`;
        if (tipEl) {
          tipEl.innerHTML = `
            <p><strong>💡 Pasos para el Instalador de Windows:</strong></p>
            <ol style="margin-top:6px; padding-left:18px; line-height:1.5;">
              <li>Haz doble clic sobre el instalador descargado.</li>
              <li>Si aparece la pantalla azul de SmartScreen, haz clic en <strong>Más información</strong> y luego en <strong>Ejecutar de todas formas</strong>.</li>
              <li>El asistente instalará AnimeStream y creará los accesos directos en el Menú Inicio y Escritorio automáticamente.</li>
            </ol>
          `;
        }
        if (retryBtn && releaseCache) {
          retryBtn.href = releaseCache.windows.url;
          retryBtn.textContent = 'Reintentar Descarga Instalador (.exe)';
        }
      }

      // Open instructions modal
      setTimeout(() => {
        modal.classList.add('open');
      }, 400);
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
    fetchLatestReleases();
    setupDownloadModal();
    setupFaqAccordion();
    setupMobileMenu();
    setupBackToTop();

    // Check if URL has ?download=true
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('download') === 'true' || urlParams.get('download') === 'auto') {
      const primaryBtn = document.querySelector('.js-download-btn, .js-download-win');
      if (primaryBtn) {
        setTimeout(() => {
          primaryBtn.click();
        }, 600);
      }
    }
  });

})();
