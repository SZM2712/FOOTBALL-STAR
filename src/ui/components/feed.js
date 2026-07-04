import { escapeHtml } from '../modal.js';

export function renderFeed(entries, limit = 60) {
  const slice = entries.slice(-limit).reverse();
  if (!slice.length) {
    return '<p class="muted center">Tu historia empieza ahora. Avanza el año para escribir el primer capítulo.</p>';
  }
  return `<div class="feed">${slice
    .map((e) => {
      const cls = e.type === 'rare' ? 'rare' : e.type === 'negative' ? 'negative' : e.type === 'event' ? 'event' : '';
      return `
      <div class="feed-entry ${cls}">
        <div class="meta">${e.worldYear} · ${e.age} años</div>
        <div class="text">${escapeHtml(e.text)}</div>
      </div>`;
    })
    .join('')}</div>`;
}
