export function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** Muestra un modal de decisión con 2-4 opciones y resuelve con el `value`
 * de la opción elegida. */
export function showModal({ title, desc, options }) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal">
        <h2>${escapeHtml(title)}</h2>
        ${desc ? `<p class="desc">${escapeHtml(desc)}</p>` : ''}
        <div class="btn-list" data-options></div>
      </div>
    `;
    const list = overlay.querySelector('[data-options]');
    options.forEach((opt, i) => {
      const btn = document.createElement('button');
      btn.className = 'btn block' + (opt.primary ? ' primary' : '');
      btn.textContent = opt.label;
      btn.addEventListener('click', () => {
        overlay.remove();
        resolve(opt.value !== undefined ? opt.value : i);
      });
      list.appendChild(btn);
    });
    document.body.appendChild(overlay);
  });
}

function subBadge(p) {
  if (p.subOff) return `<br/><span class="sub-badge out">🔄 sale ${p.subOffMinute}'</span>`;
  if (p.subOn) return `<br/><span class="sub-badge in">🔄 entra ${p.subOnMinute}'${p.replaced ? ` por ${escapeHtml(p.replaced)}` : ''}</span>`;
  return '';
}

function renderLineupTable(team) {
  if (!team) return '';
  const rows = team.players
    .map(
      (p) => `
      <tr class="${p.isUser ? 'me' : ''}">
        <td>${escapeHtml(p.name)}${subBadge(p)}</td>
        <td>${p.position}</td>
        <td>${p.rating.toFixed(1)}</td>
        <td>${p.goals || ''}</td>
        <td>${p.assists || ''}</td>
      </tr>`
    )
    .join('');
  return `
    <div class="lineup-block">
      <div class="lineup-title">${escapeHtml(team.clubName)}</div>
      <div class="table-scroll">
        <table class="lineup-table">
          <thead><tr><th>Jugador</th><th>Pos</th><th>Calif</th><th>G</th><th>A</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>`;
}

/** Muestra la pantalla de resumen de un partido: todas sus líneas de feed
 * (marcador, goles/asistencias, eventos), las alineaciones inventadas de
 * ambos equipos con su calificación del partido y, si corresponde, la
 * elección de cómo reaccionar a haber sido sustituido. Resuelve con el
 * value de la reacción elegida, o null si no había ninguna pendiente. */
export function showMatchSummary({ lines, reactionOptions, lineups }) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    const linesHtml = lines
      .map((l) => `<div class="feed-entry ${l.type || 'normal'}"><div class="text">${escapeHtml(l.text)}</div></div>`)
      .join('');
    const lineupsHtml = lineups ? `${renderLineupTable(lineups.home)}${renderLineupTable(lineups.away)}` : '';
    overlay.innerHTML = `
      <div class="modal">
        <h2>Resumen del partido</h2>
        <div class="feed match-summary-feed">${linesHtml}</div>
        ${lineupsHtml}
        <div class="btn-list" data-options></div>
      </div>
    `;
    const list = overlay.querySelector('[data-options]');
    const opts = reactionOptions && reactionOptions.length ? reactionOptions : [{ label: 'Continuar', value: null, primary: true }];
    opts.forEach((opt, i) => {
      const btn = document.createElement('button');
      btn.className = 'btn block' + (opt.primary ? ' primary' : '');
      btn.textContent = opt.label;
      btn.addEventListener('click', () => {
        overlay.remove();
        resolve(opt.value !== undefined ? opt.value : i);
      });
      list.appendChild(btn);
    });
    document.body.appendChild(overlay);
  });
}

/** Muestra un banner informativo (usado para estados raros y eventos
 * especiales) con un solo botón de "Continuar". */
export function showInfoModal({ title, text, rare = false, negative = false }) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal">
        <div class="rare-banner ${negative ? 'negative' : ''}">
          <div class="title">${escapeHtml(title)}</div>
          <div class="sub">${escapeHtml(text)}</div>
        </div>
        <button class="btn primary block" data-continue>Continuar</button>
      </div>
    `;
    overlay.querySelector('[data-continue]').addEventListener('click', () => {
      overlay.remove();
      resolve();
    });
    document.body.appendChild(overlay);
  });
}
