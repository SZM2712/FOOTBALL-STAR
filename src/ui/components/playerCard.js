import { overallRating, POSITION_LABELS } from '../../engine/player.js';
import { escapeHtml } from '../modal.js';

export function renderPlayerCard(state) {
  const p = state.player;
  const rating = overallRating(p);
  const country = state.country;
  return `
    <div class="player-card ${p.generational ? 'generacional' : ''}">
      <div class="pc-top">
        <div>
          <div class="rating">${rating}</div>
          <div class="pos">${POSITION_LABELS[p.position]} · ${escapeHtml(p.subRole)}</div>
        </div>
        <div class="flag">${country.flag}</div>
      </div>
      <div class="name">${escapeHtml(p.name)}</div>
      <div class="club">${state.club ? escapeHtml(state.club.name) : 'Sin club'} · ${state.club ? escapeHtml(state.club.leagueName) : ''}</div>
      ${p.generational ? '<div class="pill gold" style="margin-top:8px">⭐ GENERACIONAL</div>' : ''}
    </div>
  `;
}
