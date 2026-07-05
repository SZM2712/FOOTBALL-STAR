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

/** Minijuego de tiempo: un indicador recorre una barra de ida y vuelta: tocar
 * "¡Rematar!" en el momento justo (centro de la barra) da la mejor calidad
 * de remate. Resuelve con un valor 0-1 (1 = timing perfecto). */
export function showTimingChallenge({ title, desc, buttonLabel = '¡Rematar!' }) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal">
        <h2>${escapeHtml(title)}</h2>
        ${desc ? `<p class="desc">${escapeHtml(desc)}</p>` : ''}
        <div class="timing-track">
          <div class="timing-sweetspot"></div>
          <div class="timing-marker"></div>
        </div>
        <button class="btn primary block" data-shoot>${escapeHtml(buttonLabel)}</button>
      </div>
    `;
    const marker = overlay.querySelector('.timing-marker');
    const btn = overlay.querySelector('[data-shoot]');
    const start = performance.now();
    const period = 900;
    let raf;
    let stopped = false;
    let pos = 0;

    function tick(now) {
      if (stopped) return;
      const t = ((now - start) % (period * 2)) / period;
      pos = t <= 1 ? t : 2 - t;
      marker.style.left = `${pos * 100}%`;
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);

    btn.addEventListener('click', () => {
      stopped = true;
      cancelAnimationFrame(raf);
      const quality = Math.max(0, 1 - Math.abs(pos * 100 - 50) / 50);
      overlay.remove();
      resolve(quality);
    });
    document.body.appendChild(overlay);
  });
}

/** Ventana de partido en vivo: revela el marcador y las líneas del feed de
 * a poco, con un contador de minuto que avanza en simultáneo, para que se
 * sienta como ver el partido y no como leer un resumen de golpe. Se puede
 * saltar en cualquier momento. Resuelve cuando termina (o se salta). */
export function showLiveMatch({ lines, matchesInSeason, matchIndex }) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal live-match">
        <h2>Jornada ${matchIndex + 1}${matchesInSeason ? ` / ${matchesInSeason}` : ''}</h2>
        <div class="live-clock"><span data-minute>0'</span></div>
        <div class="live-progress"><span data-progress-fill></span></div>
        <div class="pitch" data-pitch>
          <div class="pitch-halfway"></div>
          <div class="pitch-circle"></div>
          <div class="pitch-goal left"></div>
          <div class="pitch-goal right"></div>
          <div class="pitch-ball" data-ball>⚽</div>
        </div>
        <div class="feed live-match-feed" data-live-feed></div>
        <button class="btn block" data-skip>Adelantar ▶▶</button>
      </div>
    `;
    const minuteEl = overlay.querySelector('[data-minute]');
    const fillEl = overlay.querySelector('[data-progress-fill]');
    const feedEl = overlay.querySelector('[data-live-feed]');
    const skipBtn = overlay.querySelector('[data-skip]');
    const ballEl = overlay.querySelector('[data-ball]');

    function moveBallRandomly() {
      const pct = 12 + Math.random() * 76;
      ballEl.style.left = `${pct}%`;
    }

    function celebrateGoal() {
      const towardsRight = Math.random() < 0.5;
      ballEl.style.left = towardsRight ? '90%' : '10%';
      ballEl.classList.add('goal-flash');
      setTimeout(() => ballEl.classList.remove('goal-flash'), 700);
    }

    const total = lines.length || 1;
    let i = 0;
    let done = false;
    let timeoutId = null;

    function revealNext() {
      if (done) return;
      if (i >= lines.length) {
        done = true;
        minuteEl.textContent = "90'+";
        fillEl.style.width = '100%';
        overlay.remove();
        resolve();
        return;
      }
      const l = lines[i];
      const minute = Math.min(90, Math.round(((i + 1) / total) * 90));
      minuteEl.textContent = `${minute}'`;
      fillEl.style.width = `${(minute / 90) * 100}%`;
      const div = document.createElement('div');
      div.className = `feed-entry ${l.type || 'normal'} live-reveal`;
      div.innerHTML = `<div class="text">${escapeHtml(l.text)}</div>`;
      feedEl.appendChild(div);
      feedEl.scrollTop = feedEl.scrollHeight;
      if (l.text.includes('GOL')) celebrateGoal();
      else moveBallRandomly();
      i++;
      const delay = l.type === 'rare' ? 900 : 550;
      timeoutId = setTimeout(revealNext, delay);
    }

    skipBtn.addEventListener('click', () => {
      if (timeoutId) clearTimeout(timeoutId);
      while (i < lines.length) {
        const l = lines[i];
        const div = document.createElement('div');
        div.className = `feed-entry ${l.type || 'normal'}`;
        div.innerHTML = `<div class="text">${escapeHtml(l.text)}</div>`;
        feedEl.appendChild(div);
        i++;
      }
      done = true;
      minuteEl.textContent = "90'+";
      fillEl.style.width = '100%';
      feedEl.scrollTop = feedEl.scrollHeight;
      setTimeout(() => {
        overlay.remove();
        resolve();
      }, 200);
    });

    document.body.appendChild(overlay);
    moveBallRandomly();
    timeoutId = setTimeout(revealNext, 400);
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
