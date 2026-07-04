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

/** Muestra la pantalla de resumen de un partido: todas sus líneas de feed
 * (marcador, goles/asistencias, eventos) y, si corresponde, la elección de
 * cómo reaccionar a haber sido sustituido. Resuelve con el value de la
 * reacción elegida, o null si no había ninguna reacción pendiente. */
export function showMatchSummary({ lines, reactionOptions }) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    const linesHtml = lines
      .map((l) => `<div class="feed-entry ${l.type || 'normal'}"><div class="text">${escapeHtml(l.text)}</div></div>`)
      .join('');
    overlay.innerHTML = `
      <div class="modal">
        <h2>Resumen del partido</h2>
        <div class="feed match-summary-feed">${linesHtml}</div>
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
