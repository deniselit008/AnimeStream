/**
 * Watch History View Component
 */
import { Storage } from '../storage.js?v=3.0';
import { Icons, escapeHtml, timeAgo, showToast, getSourceBadgeClass, resolveAnimeCover, getDefaultPoster } from '../utils.js?v=3.0';

export function renderHistory(container) {
  const history = Storage.getHistory();

  container.innerHTML = `
    <div class="history-view">
      <div class="section-header">
        <h2 class="section-title">
          ${Icons.history} Historial de Reproducción (${history.length})
        </h2>
        ${history.length > 0 ? `
          <button class="btn btn-outline" id="btn-clear-history" style="color: var(--danger); border-color: rgba(239, 68, 68, 0.4);">
            ${Icons.trash} Borrar todo el historial
          </button>
        ` : ''}
      </div>

      ${history.length === 0 ? `
        <div style="text-align: center; padding: 80px 20px; color: var(--text-muted);">
          <div style="font-size: 3rem; margin-bottom: 12px;">📺</div>
          <h3 style="color: #fff; margin-bottom: 8px;">Tu historial está vacío</h3>
          <p style="color: var(--text-dim); margin-bottom: 24px;">
            Los episodios que reproduzcas se guardarán automáticamente aquí para que retomes la reproducción cuando quieras.
          </p>
          <a href="#/" class="btn btn-primary">Empezar a ver anime</a>
        </div>
      ` : `
        <div class="anime-grid">
          ${history.map(item => {
            const coverUrl = resolveAnimeCover(item);
            const defaultSvg = getDefaultPoster(item.animeTitle, item.source);
            return `
            <div class="anime-card">
              <a href="#/watch?url=${encodeURIComponent(item.url)}&image=${encodeURIComponent(item.image || '')}&title=${encodeURIComponent(item.animeTitle || '')}" class="anime-card-media">
                <img 
                  src="${escapeHtml(coverUrl)}" 
                  alt="${escapeHtml(item.animeTitle)}" 
                  class="anime-card-img" 
                  loading="lazy"
                  onerror="this.onerror=null; this.src='${defaultSvg}';"
                />
                <div class="play-overlay">
                  <div class="play-btn-circle">${Icons.play}</div>
                </div>
                <div class="card-badge-top-left">
                  <span class="badge ${getSourceBadgeClass(item.source)}">
                    ${escapeHtml(item.source)}
                  </span>
                </div>
                <div class="card-badge-bottom-right">
                  <span class="badge badge-episode">Ep. ${escapeHtml(String(item.episode))}</span>
                </div>
                <div class="card-seen-indicator">
                  ${Icons.check} Visto
                </div>
              </a>
              <div class="anime-card-info">
                <a href="#/watch?url=${encodeURIComponent(item.url)}&image=${encodeURIComponent(item.image || '')}&title=${encodeURIComponent(item.animeTitle || '')}" class="anime-card-title">
                  ${escapeHtml(item.animeTitle)}
                </a>
                <div class="anime-card-meta">
                  <span>${timeAgo(item.watchedAt)}</span>
                  <button 
                    class="btn-icon btn-remove-history" 
                    data-url="${escapeHtml(item.url)}" 
                    title="Eliminar del historial"
                    style="padding: 4px 8px;"
                  >
                    ${Icons.trash}
                  </button>
                </div>
              </div>
            </div>
          `;
        }).join('')}
        </div>
      `}
    </div>
  `;

  // Attach clear all event
  const clearBtn = container.querySelector('#btn-clear-history');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      if (confirm('¿Estás seguro de que deseas borrar todo tu historial de reproducción?')) {
        Storage.clearHistory();
        showToast('Historial borrado correctamente', 'info');
        renderHistory(container);
      }
    });
  }

  // Attach single item delete
  const removeBtns = container.querySelectorAll('.btn-remove-history');
  removeBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const url = btn.dataset.url;
      Storage.removeFromHistory(url);
      showToast('Episodio eliminado del historial', 'info');
      renderHistory(container);
    });
  });
}
