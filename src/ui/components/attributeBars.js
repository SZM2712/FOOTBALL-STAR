import { ATTR_KEYS, ATTR_LABELS } from '../../engine/player.js';

export function renderAttributeBars(player) {
  return ATTR_KEYS.map(
    (k) => `
    <div class="attr-row">
      <div class="label">${ATTR_LABELS[k]}</div>
      <div class="attr-bar"><span style="width:${player.attrs[k]}%"></span></div>
      <div class="val">${player.attrs[k]}</div>
    </div>`
  ).join('');
}
