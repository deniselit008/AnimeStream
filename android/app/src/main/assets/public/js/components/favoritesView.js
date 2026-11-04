/**
 * Favorites View Component
 */
import { Storage } from '../storage.js?v=3.0';
import { Icons, escapeHtml, showToast, getSourceBadgeClass } from '../utils.js?v=3.0';

export function renderFavorites(container) {
  const favorites = Storage.getFavorites();

  container.innerHTML = `
    <div class="favorites-view">
      <div class="section-header">
        <h2 class="section-title">
          ${Icons.heartFilled} Mis Animes Favoritos (${favorites.length})
        </h2>
      </div>

      ${favorites.length === 0 ? `
        <div style="text-align: center; padding: 80px 20px; color: var(--text-muted);">
          <div style="font-size: 3rem; margin-bottom: 12px;">🤍</div>
          <h3 style="color: #fff; margin-bottom: 8px;">Aún no tienes animes favoritos</h3>
          <p style="color: var(--text-dim); margin-bottom: 24px;">
            Guarda tus series preferidas pulsando el botón "Añadir a Favoritos" en la ficha de cualquier anime.
          </p>
          <a href="#/" class="btn btn-primary">Explorar Animes</a>
        </div>
      ` : `
        <div class="anime-grid">
          ${favorites.map(item => `
            <div class="anime-card">
              <a href="#/anime?url=${encodeURIComponent(item.url)}" class="anime-card-media poster">
                <img 
                  src="${escapeHtml(item.image || 'https://via.placeholder.com/240x340/161f30/94a3b8?text=Poster')}" 
                  alt="${escapeHtml(item.title)}" 
                  class="anime-card-img" 
                  loading="lazy"
                />
                <div class="play-overlay">
                  <div class="play-btn-circle">${Icons.play}</div>
                </div>
                <div class="card-badge-top-left">
                  <span class="badge ${getSourceBadgeClass(item.source)}">
                    ${escapeHtml(item.source)}
                  </span>
                </div>
              </a>
              <div class="anime-card-info">
                <a href="#/anime?url=${encodeURIComponent(item.url)}" class="anime-card-title">
                  ${escapeHtml(item.title)}
                </a>
                <div class="anime-card-meta">
                  <a href="#/anime?url=${encodeURIComponent(item.url)}" style="color: var(--accent-primary); font-weight: 500;">
                    Ficha Técnica
                  </a>
                  <button 
                    class="btn-icon btn-remove-fav" 
                    data-url="${escapeHtml(item.url)}" 
                    title="Eliminar de favoritos"
                    style="padding: 4px 8px;"
                  >
                    ${Icons.trash}
                  </button>
                </div>
              </div>
            </div>
          `).join('')}
        </div>
      `}
    </div>
  `;

  // Attach remove events
  const removeBtns = container.querySelectorAll('.btn-remove-fav');
  removeBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const url = btn.dataset.url;
      Storage.toggleFavorite({ url });
      showToast('Eliminado de tus favoritos', 'info');
      renderFavorites(container);
    });
  });
}
