import { createGame, serializeGame, deserializeGame, finishChildhood, pushFeed } from './state/gameState.js';
import {
  startSeason,
  playNextMatch,
  finishSeason,
  isMatchdayPending,
  rollPressConferenceQuestion,
  rollManagerTalk,
  MANAGER_TALK_OPTIONS,
  rollPenaltyOpportunityForMatch,
  rollBigChanceOpportunityForMatch,
  rollBenchChallenge,
  BENCH_CHALLENGE_OPTIONS,
  hasPendingSubReaction,
  resolveSubReaction,
  SUB_REACTIONS,
} from './engine/season.js';
import { PENALTY_CHOICES } from './engine/match.js';
import { rollNationalizationOpportunity } from './engine/nationalTeam.js';
import { buyLuxury, LIFESTYLE_PACKAGES, rollPersonalLifeEvent } from './engine/personalLife.js';
import { acceptOffer, rejectOffer, AGENT_TIERS, generateSponsorships } from './engine/transferMarket.js';
import { collectSponsorships } from './engine/finance.js';
import { overallRating, POSITION_LABELS, ATTR_KEYS, ATTR_LABELS } from './engine/player.js';
import { computeLegacy, buildCareerSummary, buildClubHistory } from './engine/legacy.js';
import { RARE_STATE_DEFS } from './engine/rareStates.js';
import { COUNTRY_BY_CODE } from './data/countries.js';
import { CHILDHOOD_STAGES, optionsForStage, advanceChildhoodStage } from './engine/childhood.js';
import {
  startCoachCareer,
  simulateCoachSeason,
  acceptCoachOffer,
  rejectCoachOffer,
  computeCoachLegacy,
  rollUnderperformerTalk,
  PLAYER_TALK_OPTIONS,
} from './engine/coachCareer.js';
import { showModal, showInfoModal, showMatchSummary, showTimingChallenge, showLiveMatch, escapeHtml } from './ui/modal.js';
import { renderPlayerCard } from './ui/components/playerCard.js';
import { renderAttributeBars } from './ui/components/attributeBars.js';
import { renderFeed } from './ui/components/feed.js';
import { joinRoom, claimClub, subscribeRoom } from './multiplayer/sharedMarket.js';

let game = null;
let activeTab = 'diario';
let busy = false;
let pendingDecisions = null; // decisiones de pre-temporada, vivas entre startSeason y finishSeason

// ---- Mercado de fichajes compartido (multijugador liviano por sala) ----
let mpStatus = 'idle'; // idle | connecting | joined | error
let mpRoomCode = null;
let mpPlayerName = null;
let mpClaimedClubIds = new Set();
let mpActivity = [];
let mpPlayers = [];
let mpError = null;
let mpUnsubscribe = null;

const app = document.getElementById('app');

function fmtMoney(m) {
  if (m == null || Number.isNaN(m)) return '€0';
  if (Math.abs(m) >= 1) return `€${m.toFixed(1)}M`;
  return `€${Math.max(0, Math.round(m * 1000))}k`;
}

function relationshipLabel(v) {
  if (v >= 75) return 'Excelente';
  if (v >= 50) return 'Buena';
  if (v >= 35) return 'Tensa';
  if (v >= 20) return 'Mala';
  return 'Rota';
}

function render() {
  if (!game) {
    app.innerHTML = renderCreationScreen();
    attachCreationHandlers();
    return;
  }
  if (game.phase === 'childhood') {
    app.innerHTML = renderChildhoodScreen();
    attachChildhoodHandlers();
    return;
  }
  if (game.phase === 'coaching') {
    if (game.coach.retired) {
      app.innerHTML = renderFinalLegacyScreen();
      attachRetirementHandlers();
      return;
    }
    app.innerHTML = renderCoachScreen();
    attachCoachHandlers();
    return;
  }
  if (game.retired) {
    app.innerHTML = renderRetirementScreen(game);
    attachRetirementHandlers();
    return;
  }
  app.innerHTML = renderGameShell();
  attachGameHandlers();
}

// ---------------------------------------------------------------------------
// Infancia (0-15 años)
// ---------------------------------------------------------------------------
function renderChildhoodScreen() {
  const pl = game.personalLife;
  const stage = CHILDHOOD_STAGES[game.childhood.stageIndex];
  return `
    <div class="topbar">
      <div class="stat"><span class="flag">${game.country.flag}</span><b>${game.childAge}a</b></div>
      <div class="stat">🗓️<b>${game.birthWorldYear + game.childAge}</b></div>
    </div>
    <div class="screen">
      <div class="card">
        <h3>${escapeHtml(game.childName)}</h3>
        <p>${escapeHtml(pl.family.father.archetype.text)}. ${escapeHtml(pl.family.mother.archetype.text)}.</p>
      </div>
      <div class="card">
        <h3>Infancia</h3>
        ${renderFeed(game.feed)}
      </div>
    </div>
    <div class="advance-bar">
      <button class="btn primary advance-btn" data-advance-childhood ${busy ? 'disabled' : ''}>
        ${stage ? `Continuar: ${stage.title} ▶` : 'Debutar como profesional ▶'}
      </button>
    </div>
  `;
}

function attachChildhoodHandlers() {
  const btn = app.querySelector('[data-advance-childhood]');
  if (btn) btn.addEventListener('click', handleAdvanceChildhood);
}

async function handleAdvanceChildhood() {
  if (busy) return;
  busy = true;
  render();

  const stage = CHILDHOOD_STAGES[game.childhood.stageIndex];
  let optionId = null;
  if (stage.prompt) {
    const pool = optionsForStage(stage.id);
    optionId = await showModal({
      title: stage.title,
      desc: stage.prompt,
      options: pool.map((o) => ({ label: o.label, value: o.id })),
    });
  }

  const { feed, finished } = advanceChildhoodStage(game, optionId, game.rng);
  for (const text of feed) pushFeed(game, text, 'event');

  let transitionFeed = [];
  if (finished) {
    transitionFeed = finishChildhood(game);
    for (const text of transitionFeed) pushFeed(game, text, 'rare');
  }

  busy = false;
  render();

  const modalText = finished ? transitionFeed.join(' ') : feed.join(' ');
  if (modalText) {
    await showInfoModal({
      title: finished ? '⚽ ¡Debut profesional!' : stage.title,
      text: modalText,
      rare: finished,
    });
    render();
  }
}

// ---------------------------------------------------------------------------
// Creación
// ---------------------------------------------------------------------------
function renderCreationScreen() {
  return `
    <div class="screen">
      <div class="hero">
        <div class="emoji">⚽</div>
        <h1>LEYENDA</h1>
        <p>Simulador de carrera futbolística. Naces en cualquier país del mundo.<br/>Tu destino: llegar lo más lejos posible.</p>
      </div>
      <div class="card col">
        <h3>Nueva carrera</h3>
        <div class="field">
          <label for="seed-input">Semilla (opcional, para compartir carreras)</label>
          <input id="seed-input" type="text" placeholder="Déjalo vacío para una semilla aleatoria" maxlength="24" />
        </div>
        <button class="btn primary block" data-new-game>Nacer y empezar</button>
      </div>
      <div class="card col">
        <h3>Cargar partida</h3>
        <p>¿Ya tenías una carrera en marcha? Carga tu archivo .json exportado.</p>
        <input type="file" accept="application/json" data-load-file />
      </div>
    </div>
  `;
}

function attachCreationHandlers() {
  app.querySelector('[data-new-game]').addEventListener('click', () => {
    const seedInput = app.querySelector('#seed-input').value.trim();
    game = createGame(seedInput || undefined);
    activeTab = 'diario';
    render();
  });
  app.querySelector('[data-load-file]').addEventListener('change', async (ev) => {
    const file = ev.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      game = deserializeGame(text);
      activeTab = 'diario';
      render();
    } catch (e) {
      alert('No se pudo leer el archivo de partida. ¿Seguro que es un JSON válido de LEYENDA?');
    }
  });
}

// ---------------------------------------------------------------------------
// Shell del juego (topbar + tabs + contenido)
// ---------------------------------------------------------------------------
function renderAdvanceBar() {
  const ps = game.pendingSeason;
  if (!ps || ps.matchesInSeason === 0) {
    return `<div class="advance-bar"><button class="btn primary advance-btn" data-advance-year ${busy ? 'disabled' : ''}>Avanzar año ▶</button></div>`;
  }
  if (ps.matchIndex < ps.matchesInSeason) {
    return `
      <div class="advance-bar">
        <button class="btn primary advance-btn" data-play-match ${busy ? 'disabled' : ''}>Jugar próximo partido ▶ (J${ps.matchIndex + 1}/${ps.matchesInSeason})</button>
        <button class="btn block" style="margin-top:8px" data-sim-rest ${busy ? 'disabled' : ''}>Simular resto de la temporada</button>
      </div>`;
  }
  return `<div class="advance-bar"><button class="btn primary advance-btn" data-close-season ${busy ? 'disabled' : ''}>Cerrar temporada ▶</button></div>`;
}

function renderGameShell() {
  const tabs = [
    ['diario', 'Diario'],
    ['mercado', 'Mercado'],
    ['seleccion', 'Selección'],
    ['vida', 'Vida'],
    ['palmares', 'Palmarés'],
    ['ajustes', 'Ajustes'],
  ];
  return `
    <div class="topbar">
      <div class="stat"><span class="flag">${game.country.flag}</span><b>${game.player.age}a</b></div>
      <div class="stat">💰<b>${fmtMoney(game.money)}</b></div>
      <div class="stat">🌟<b>${Math.round(game.fame)}</b></div>
      <div class="stat">🏆<b>${game.trophies.length}</b></div>
      <div class="stat">🗓️<b>${game.worldYearStart + game.year - 1}</b></div>
    </div>
    <div class="tabbar">
      ${tabs.map(([id, label]) => `<button class="tab ${activeTab === id ? 'active' : ''}" data-tab="${id}">${label}</button>`).join('')}
    </div>
    <div class="screen" data-tab-content>
      ${renderTabContent()}
    </div>
    ${activeTab !== 'ajustes' ? renderAdvanceBar() : ''}
  `;
}

function renderTabContent() {
  switch (activeTab) {
    case 'diario':
      return renderDiarioTab();
    case 'mercado':
      return renderMercadoTab();
    case 'seleccion':
      return renderSeleccionTab();
    case 'vida':
      return renderVidaTab();
    case 'palmares':
      return renderPalmaresTab();
    case 'ajustes':
      return renderAjustesTab();
    default:
      return '';
  }
}

function renderDiarioTab() {
  return `
    ${renderPlayerCard(game)}
    <div class="card">
      <h3>Atributos</h3>
      ${renderAttributeBars(game.player)}
    </div>
    <div class="card">
      <h3>Diario</h3>
      ${renderFeed(game.feed)}
    </div>
  `;
}

function renderLeagueTableCard(table) {
  if (!table) return '';
  return `
    <div class="card">
      <h3>Tabla de posiciones · ${escapeHtml(table.leagueName)}</h3>
      <div class="table-scroll">
        <table class="league-table">
          <thead>
            <tr><th>#</th><th>Club</th><th>PJ</th><th>G</th><th>E</th><th>P</th><th>GF</th><th>GC</th><th>DG</th><th>Pts</th></tr>
          </thead>
          <tbody>
            ${table.rows
              .map(
                (r) => `
              <tr class="${r.isPlayer ? 'me' : ''}">
                <td>${r.position}</td>
                <td>${escapeHtml(r.name)}</td>
                <td>${r.played}</td>
                <td>${r.wins}</td>
                <td>${r.draws}</td>
                <td>${r.losses}</td>
                <td>${r.gf}</td>
                <td>${r.ga}</td>
                <td>${r.gf - r.ga}</td>
                <td>${r.points}</td>
              </tr>`
              )
              .join('')}
          </tbody>
        </table>
      </div>
      <p class="muted" style="margin-top:6px">Temporada ${table.year}: toda la división se juega jornada a jornada, la tabla se actualiza en vivo con cada partido.</p>
    </div>
  `;
}

function renderMercadoTab() {
  const offers = game.currentOffers || [];
  return `
    <div class="card">
      <h3>Tu club actual</h3>
      ${
        game.club && game.contract
          ? `
      <div class="row between">
        <div>
          <div style="font-weight:700">${escapeHtml(game.club.name)}</div>
          <div class="muted">${escapeHtml(game.club.leagueName)} · Rating ${game.club.rating}</div>
        </div>
        <div class="pill accent">${fmtMoney(game.contract.salaryM)}/año</div>
      </div>
      <p class="muted" style="margin-top:6px">Contrato: ${game.contract.years} año${game.contract.years === 1 ? '' : 's'} restante${game.contract.years === 1 ? '' : 's'} · Cláusula ${fmtMoney(game.contract.clauseM)}</p>
      <p class="muted" style="margin-top:6px">Relación con ${escapeHtml(game.managerName || 'el entrenador')}: ${relationshipLabel(game.managerRelationship)} (${Math.round(game.managerRelationship)}/100)</p>`
          : `<p class="muted">Eres agente libre. No tienes club ni contrato: elige una de las ofertas de abajo para volver a competir.</p>`
      }
    </div>
    ${renderLeagueTableCard(game.leagueTable)}
    ${renderMultiplayerCard()}
    <div class="card">
      <h3>Agente</h3>
      <div class="scroll-x">
        ${Object.entries(AGENT_TIERS)
          .map(
            ([id, t]) => `
          <button class="btn ${game.agent.tier === id ? 'primary' : ''}" data-agent="${id}" style="flex:1">
            ${t.label}<br/><span class="muted" style="font-size:11px">Comisión ${(t.commission * 100).toFixed(0)}%</span>
          </button>`
          )
          .join('')}
      </div>
    </div>
    <div class="card">
      <h3>Ofertas de fichaje</h3>
      ${
        offers.length
          ? offers
              .map((o) => {
                const taken = mpStatus === 'joined' && mpClaimedClubIds.has(o.club.id);
                return `
        <div class="card" style="margin-bottom:8px${taken ? ';opacity:.55' : ''}">
          <div class="row between">
            <div>
              <div style="font-weight:700">${escapeHtml(o.club.name)} ${o.isGiant ? '<span class="pill gold">Gigante</span>' : ''} ${o.isExotic ? '<span class="pill purple">Exótico</span>' : ''}</div>
              <div class="muted">${escapeHtml(o.league)} · Rating ${o.club.rating}</div>
              <div class="muted">Salario ${fmtMoney(o.wageM)}/año · Fee ${fmtMoney(o.feeM)} · ${o.years} años</div>
              ${taken ? '<div class="muted" style="color:var(--danger)">🔒 Ya fichado por otro jugador de tu sala</div>' : ''}
            </div>
          </div>
          <div class="row" style="margin-top:8px">
            <button class="btn primary" data-accept-offer="${o.id}" style="flex:1" ${taken ? 'disabled' : ''}>Aceptar</button>
            <button class="btn" data-reject-offer="${o.id}" style="flex:1">Rechazar</button>
          </div>
        </div>`;
              })
              .join('')
          : '<p class="muted">No tienes ofertas este año.</p>'
      }
    </div>
    <div class="card">
      <h3>Patrocinios</h3>
      ${renderSponsorships()}
    </div>
  `;
}

function renderMultiplayerCard() {
  if (mpStatus === 'joined') {
    return `
    <div class="card">
      <h3>Mercado compartido · Sala "${escapeHtml(mpRoomCode)}"</h3>
      <p class="muted">En la sala: ${mpPlayers.length ? mpPlayers.map((p) => escapeHtml(p)).join(', ') : '...'}</p>
      <div class="feed" style="margin-top:8px; max-height:160px; overflow-y:auto">
        ${
          mpActivity.length
            ? mpActivity.map((a) => `<div class="feed-entry event"><div class="text">${escapeHtml(a.text)}</div></div>`).join('')
            : '<p class="muted">Todavía no hay actividad en la sala.</p>'
        }
      </div>
      <button class="btn" data-leave-room style="margin-top:10px">Salir de la sala</button>
    </div>`;
  }
  return `
    <div class="card">
      <h3>Mercado compartido (multijugador)</h3>
      <p class="muted">Unite a una sala con tus amigos: si alguien ficha un club, nadie más de la sala lo puede fichar.</p>
      <div class="field" style="margin-top:8px">
        <label>Código de sala</label>
        <input type="text" id="mp-room-input" placeholder="ej: mundial2026" style="width:100%; padding:8px; border-radius:8px; background:var(--bg-elev-1); border:1px solid var(--border); color:var(--text)" />
      </div>
      <div class="field" style="margin-top:8px">
        <label>Tu nombre</label>
        <input type="text" id="mp-name-input" placeholder="ej: ${escapeHtml(game.player.name.split(' ')[0])}" style="width:100%; padding:8px; border-radius:8px; background:var(--bg-elev-1); border:1px solid var(--border); color:var(--text)" />
      </div>
      <button class="btn primary block" data-join-room style="margin-top:10px" ${mpStatus === 'connecting' ? 'disabled' : ''}>
        ${mpStatus === 'connecting' ? 'Conectando...' : 'Unirse a la sala'}
      </button>
      ${mpStatus === 'error' ? `<p class="muted" style="color:var(--danger); margin-top:6px">${escapeHtml(mpError || 'No se pudo conectar.')}</p>` : ''}
    </div>`;
}

function renderSponsorships() {
  const offers = generateSponsorships(game);
  if (!offers.length) return '<p class="muted">Necesitas más fama para atraer patrocinadores.</p>';
  return offers
    .map(
      (o) => `
    <div class="row between" style="margin-bottom:6px">
      <div>${escapeHtml(o.name)}</div>
      <button class="btn accent" data-sponsor="${o.id}">Firmar (${fmtMoney(o.payM)})</button>
    </div>`
    )
    .join('');
}

function renderSeleccionTab() {
  const country = COUNTRY_BY_CODE[game.nationality];
  const nt = game.nationalTeam;
  return `
    <div class="card">
      <h3>Selección nacional</h3>
      <div class="row" style="gap:14px">
        <div class="flag" style="font-size:36px">${country.flag}</div>
        <div>
          <div style="font-weight:700">${country.name}</div>
          <div class="muted">Fuerza de la selección: ${country.nt}/100</div>
        </div>
      </div>
      <div class="grid2" style="margin-top:12px">
        <div class="stat-tile"><div class="n">${nt.caps}</div><div class="l">Partidos</div></div>
        <div class="stat-tile"><div class="n">${nt.goals}</div><div class="l">Goles</div></div>
      </div>
      ${nt.prestigeLocked ? '<p class="muted" style="margin-top:8px">Tu contrato como Mercenario de Oro te cerró las puertas de la selección.</p>' : ''}
    </div>
    <div class="card">
      <h3>Torneos disputados</h3>
      ${
        nt.tournamentsPlayed.length
          ? nt.tournamentsPlayed
              .map((t) => `<div class="row between"><span>${escapeHtml(t.name)} (${t.year})</span><span class="pill ${t.champion ? 'gold' : ''}">${t.champion ? 'Campeón' : t.reached}</span></div>`)
              .join('')
          : '<p class="muted">Todavía no has disputado ningún torneo internacional.</p>'
      }
    </div>
  `;
}

function renderVidaTab() {
  const pl = game.personalLife;
  return `
    <div class="card">
      <h3>Familia</h3>
      <p>${pl.family.father.alive ? '👨' : '🕊️'} Tu padre es ${escapeHtml(pl.family.father.archetype.text)}.</p>
      <p>${pl.family.mother.alive ? '👩' : '🕊️'} Tu madre es ${escapeHtml(pl.family.mother.archetype.text)}.</p>
    </div>
    <div class="card">
      <h3>Pareja e hijos</h3>
      <p>${pl.partner ? `En pareja con ${escapeHtml(pl.partner.name)}${pl.married ? ' (casados)' : ''}.` : 'Actualmente soltero/a.'}</p>
      ${
        pl.children.length
          ? pl.children
              .map((c) => {
                const age = game.year - c.bornYear;
                const status = c.proDebut
                  ? ' — ¡debutó como profesional! 🎉'
                  : c.pursuingFootball === true
                  ? ' (sigue tus pasos en el fútbol)'
                  : '';
                return `<p>${escapeHtml(c.name)} (${age} años) · vínculo: ${relationshipLabel(c.bond)}${status}</p>`;
              })
              .join('')
          : '<p>Sin hijos por ahora.</p>'
      }
    </div>
    <div class="card">
      <h3>Vestuario y entorno</h3>
      <div class="attr-row"><div class="label">Vestuario</div><div class="attr-bar"><span style="width:${pl.friends.vestuario}%"></span></div><div class="val">${pl.friends.vestuario}</div></div>
      <div class="attr-row"><div class="label">Barrio</div><div class="attr-bar"><span style="width:${pl.friends.barrio}%"></span></div><div class="val">${pl.friends.barrio}</div></div>
      <div class="attr-row"><div class="label">Amigos de la fama</div><div class="attr-bar"><span style="width:${pl.friends.fama}%"></span></div><div class="val">${pl.friends.fama}</div></div>
    </div>
    <div class="card">
      <h3>Vicios y reputación</h3>
      <div class="attr-row"><div class="label">Alcohol</div><div class="attr-bar"><span style="width:${pl.vices.alcohol}%"></span></div><div class="val">${pl.vices.alcohol}</div></div>
      <div class="attr-row"><div class="label">Apuestas</div><div class="attr-bar"><span style="width:${pl.vices.gambling}%"></span></div><div class="val">${pl.vices.gambling}</div></div>
      <div class="attr-row"><div class="label">Reputación</div><div class="attr-bar"><span style="width:${pl.reputation}%"></span></div><div class="val">${pl.reputation}</div></div>
      ${pl.vices.addiction ? `<p class="muted" style="color:var(--danger)">Adicción activa: ${escapeHtml(pl.vices.addiction)}.</p>` : ''}
      ${pl.vices.recovered ? '<p class="muted" style="color:var(--accent)">Historia de redención: superaste tu adicción.</p>' : ''}
    </div>
    <div class="card">
      <h3>Compras de lujo</h3>
      <div class="row wrap">
        <button class="btn" data-buy="casa">Comprar mansión (€4M)</button>
        <button class="btn" data-buy="auto">Auto de lujo (€1.2M)</button>
        <button class="btn" data-buy="clubAmateur">Club de tu pueblo (€2.5M)</button>
      </div>
      ${pl.purchases.length ? `<p class="muted" style="margin-top:8px">Ya tienes: ${pl.purchases.join(', ')}</p>` : ''}
    </div>
  `;
}

function renderPalmaresTab() {
  const rareHistory = game.rareTracker.history
    .map((h) => ({ name: RARE_STATE_DEFS[h.id]?.name, year: h.startedYear }))
    .concat(game.rareTracker.active ? [{ name: RARE_STATE_DEFS[game.rareTracker.active.id]?.name + ' (activo)', year: game.rareTracker.active.startedYear }] : []);
  return `
    <div class="card">
      <h3>Trofeos (${game.trophies.length})</h3>
      ${
        game.trophies.length
          ? game.trophies.map((t) => `<div class="row between"><span>${escapeHtml(t.name)}</span><span class="muted">${t.withClub} · ${t.year}</span></div>`).join('')
          : '<p class="muted">Aún no ganaste nada. El tiempo dirá.</p>'
      }
    </div>
    <div class="card">
      <h3>Estadísticas de carrera</h3>
      <div class="grid2">
        <div class="stat-tile"><div class="n">${game.stats.career.matches}</div><div class="l">Partidos</div></div>
        <div class="stat-tile"><div class="n">${game.stats.career.goals}</div><div class="l">Goles</div></div>
        <div class="stat-tile"><div class="n">${game.stats.career.assists}</div><div class="l">Asistencias</div></div>
        <div class="stat-tile"><div class="n">${game.rareTracker.legendaryNights}</div><div class="l">Noches de Leyenda</div></div>
      </div>
    </div>
    <div class="card">
      <h3>Historial por equipo</h3>
      ${
        buildClubHistory(game)
          .map(
            (c) => `
        <div class="row between" style="align-items:flex-start;margin-bottom:8px">
          <div>
            <div style="font-weight:700">${escapeHtml(c.club)}</div>
            <div class="muted">${c.years} temporada${c.years === 1 ? '' : 's'} · ${c.matches} PJ · ${c.goals}G ${c.assists}A · rating ${c.avgRating}</div>
            ${c.trophies.length ? `<div class="muted">🏆 ${c.trophies.map(escapeHtml).join(', ')}</div>` : ''}
          </div>
        </div>`
          )
          .join('') || '<p class="muted">Todavía no jugaste para ningún club.</p>'
      }
    </div>
    <div class="card">
      <h3>Estados raros vividos</h3>
      ${rareHistory.length ? rareHistory.map((h) => `<div class="row between"><span>${escapeHtml(h.name || '')}</span><span class="muted">año ${h.year}</span></div>`).join('') : '<p class="muted">Ninguno todavía.</p>'}
    </div>
  `;
}

function renderAjustesTab() {
  return `
    <div class="card">
      <h3>Guardar partida</h3>
      <p>Semilla: <b>${escapeHtml(game.seed)}</b></p>
      <button class="btn primary block" data-export>Descargar partida (.json)</button>
    </div>
    <div class="card">
      <h3>Cargar otra partida</h3>
      <input type="file" accept="application/json" data-load-file2 />
    </div>
    <div class="card">
      <h3>Peligro</h3>
      <button class="btn danger block" data-restart>Abandonar carrera y empezar de nuevo</button>
    </div>
  `;
}

function attachGameHandlers() {
  app.querySelectorAll('[data-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      activeTab = btn.getAttribute('data-tab');
      render();
    });
  });

  const advanceBtn = app.querySelector('[data-advance-year]');
  if (advanceBtn) advanceBtn.addEventListener('click', handleAdvanceYear);
  const playMatchBtn = app.querySelector('[data-play-match]');
  if (playMatchBtn) playMatchBtn.addEventListener('click', handlePlayNextMatch);
  const simRestBtn = app.querySelector('[data-sim-rest]');
  if (simRestBtn) simRestBtn.addEventListener('click', handleSimRestOfSeason);
  const closeSeasonBtn = app.querySelector('[data-close-season]');
  if (closeSeasonBtn) closeSeasonBtn.addEventListener('click', handleCloseSeason);

  const joinRoomBtn = app.querySelector('[data-join-room]');
  if (joinRoomBtn) joinRoomBtn.addEventListener('click', handleJoinRoom);
  const leaveRoomBtn = app.querySelector('[data-leave-room]');
  if (leaveRoomBtn) leaveRoomBtn.addEventListener('click', handleLeaveRoom);

  app.querySelectorAll('[data-agent]').forEach((btn) => {
    btn.addEventListener('click', () => {
      game.agent.tier = btn.getAttribute('data-agent');
      render();
    });
  });

  app.querySelectorAll('[data-accept-offer]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-accept-offer');
      const offer = game.currentOffers.find((o) => o.id === id);
      if (!offer) return;

      if (mpStatus === 'joined') {
        btn.disabled = true;
        const won = await claimClub(mpRoomCode, offer.club, mpPlayerName);
        if (!won) {
          mpClaimedClubIds.add(offer.club.id);
          render();
          return;
        }
      }

      acceptOffer(game, offer);
      game.currentOffers = [];
      render();
    });
  });
  app.querySelectorAll('[data-reject-offer]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-reject-offer');
      const offer = game.currentOffers.find((o) => o.id === id);
      if (offer) {
        rejectOffer(game, offer);
        game.currentOffers = game.currentOffers.filter((o) => o.id !== id);
      }
      render();
    });
  });

  app.querySelectorAll('[data-sponsor]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-sponsor');
      const offers = generateSponsorships(game);
      collectSponsorships(game, [id], offers);
      render();
    });
  });

  app.querySelectorAll('[data-buy]').forEach((btn) => {
    btn.addEventListener('click', () => {
      buyLuxury(game, btn.getAttribute('data-buy'));
      render();
    });
  });

  const exportBtn = app.querySelector('[data-export]');
  if (exportBtn) exportBtn.addEventListener('click', exportGame);

  const loadFile2 = app.querySelector('[data-load-file2]');
  if (loadFile2) {
    loadFile2.addEventListener('change', async (ev) => {
      const file = ev.target.files[0];
      if (!file) return;
      const text = await file.text();
      game = deserializeGame(text);
      activeTab = 'diario';
      render();
    });
  }

  const restartBtn = app.querySelector('[data-restart]');
  if (restartBtn) {
    restartBtn.addEventListener('click', () => {
      if (confirm('¿Seguro que quieres abandonar esta carrera? Se perderá si no la exportaste.')) {
        game = null;
        render();
      }
    });
  }
}

function exportGame() {
  const json = serializeGame(game);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `leyenda-${game.seed}-${game.player.age}anos.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Flujo de "Avanzar año"
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Retiro y legado
// ---------------------------------------------------------------------------
function renderRetirementScreen(state) {
  const legacy = computeLegacy(state);
  const summary = buildCareerSummary(state);
  const isDark = /Talento que Pudo Ser|Ruina|Expulsado/.test(legacy.title);
  return `
    <div class="screen">
      <div class="rare-banner ${isDark ? 'negative' : ''}" style="margin-top:20px">
        <div class="title">${escapeHtml(legacy.title)}</div>
        <div class="sub">${escapeHtml(legacy.narrative)}</div>
      </div>
      ${renderPlayerCard(state)}
      <div class="card">
        <h3>Resumen de carrera</h3>
        <div class="grid2">
          <div class="stat-tile"><div class="n">${summary.yearsActive}</div><div class="l">Temporadas</div></div>
          <div class="stat-tile"><div class="n">${summary.goals}</div><div class="l">Goles</div></div>
          <div class="stat-tile"><div class="n">${summary.assists}</div><div class="l">Asistencias</div></div>
          <div class="stat-tile"><div class="n">${summary.trophies.length}</div><div class="l">Títulos</div></div>
          <div class="stat-tile"><div class="n">${summary.caps}</div><div class="l">Partidos con ${summary.country}</div></div>
          <div class="stat-tile"><div class="n">${summary.legendaryNights}</div><div class="l">Noches de Leyenda</div></div>
        </div>
        <p class="muted" style="margin-top:10px">Clubes: ${summary.clubs.map(escapeHtml).join(', ') || '—'}</p>
        <p class="muted">Fortuna final: ${fmtMoney(summary.finalMoneyM)}</p>
      </div>
      <div class="card">
        <h3>Historial por equipo</h3>
        ${
          summary.clubHistory.length
            ? summary.clubHistory
                .map(
                  (c) => `
          <div class="row between" style="align-items:flex-start;margin-bottom:8px">
            <div>
              <div style="font-weight:700">${escapeHtml(c.club)}</div>
              <div class="muted">${c.years} temporada${c.years === 1 ? '' : 's'} · ${c.matches} PJ · ${c.goals}G ${c.assists}A · rating ${c.avgRating}</div>
              ${c.trophies.length ? `<div class="muted">🏆 ${c.trophies.map(escapeHtml).join(', ')}</div>` : ''}
            </div>
          </div>`
                )
                .join('')
            : '<p class="muted">Sin historial de clubes.</p>'
        }
      </div>
      <div class="card">
        <h3>Estados raros vividos</h3>
        ${
          summary.rareStates.length
            ? summary.rareStates.map((h) => `<div class="row between"><span>${escapeHtml(h.name || '')}</span><span class="muted">año ${h.startedYear} · ${escapeHtml(h.resolution || '')}</span></div>`).join('')
            : '<p class="muted">Una carrera sin sobresaltos... hasta donde se sabe.</p>'
        }
      </div>
      <div class="card col">
        <h3>Semilla de esta carrera</h3>
        <p><b>${escapeHtml(summary.seed)}</b> — compártela para que otros vivan la misma historia.</p>
        ${
          state.retirementReason !== 'expulsado'
            ? '<button class="btn primary block" data-continue-coaching>Continuar como entrenador ▶</button>'
            : ''
        }
        <button class="btn block" data-export-final>Descargar historial (.json)</button>
        <button class="btn block" data-new-career>Empezar una nueva carrera</button>
      </div>
    </div>
  `;
}

function attachRetirementHandlers() {
  app.querySelector('[data-export-final]')?.addEventListener('click', exportGame);
  app.querySelector('[data-new-career]')?.addEventListener('click', () => {
    game = null;
    render();
  });
  app.querySelector('[data-continue-coaching]')?.addEventListener('click', () => {
    const feedTexts = startCoachCareer(game);
    for (const t of feedTexts) pushFeed(game, t, 'rare');
    render();
  });
}

// ---------------------------------------------------------------------------
// Modo Entrenador (segunda carrera post-retiro)
// ---------------------------------------------------------------------------
function renderCoachScreen() {
  const coach = game.coach;
  const offers = coach.currentOffers || [];
  const employer = coach.nationalTeamJob ? COUNTRY_BY_CODE[coach.nationalTeamJob] : coach.club;
  return `
    <div class="topbar">
      <div class="stat"><span class="flag">🧢</span><b>${coach.age}a</b></div>
      <div class="stat">⭐<b>${Math.round(coach.reputation)}</b></div>
      <div class="stat">🏆<b>${coach.trophies.length}</b></div>
      <div class="stat">🗓️<b>${game.worldYearStart + game.year - 1 + coach.year}</b></div>
    </div>
    <div class="screen">
      <div class="card">
        <h3>Modo Entrenador</h3>
        ${
          coach.nationalTeamJob
            ? `<p>Dirigís a la selección de <b>${escapeHtml(employer.name)}</b> ${employer.flag}</p>`
            : coach.club
            ? `<p>Entrenador de <b>${escapeHtml(coach.club.name)}</b> · ${escapeHtml(coach.club.leagueName)} · Rating ${coach.club.rating}</p><p class="muted">Presupuesto: ${fmtMoney(coach.club.budgetM)}</p>`
            : '<p class="muted">Sin banco. Buscando una oportunidad.</p>'
        }
        <div class="attr-row" style="margin-top:8px"><div class="label">Reputación</div><div class="attr-bar"><span style="width:${coach.reputation}%"></span></div><div class="val">${Math.round(coach.reputation)}</div></div>
      </div>
      <div class="card">
        <h3>Diario</h3>
        ${renderFeed(game.feed)}
      </div>
      <div class="card">
        <h3>Ofertas</h3>
        ${
          offers.length
            ? offers
                .map(
                  (o) => `
          <div class="card" style="margin-bottom:8px">
            ${
              o.type === 'nationalTeam'
                ? `<div style="font-weight:700">Selección de ${escapeHtml(o.country.name)} ${o.country.flag}</div>`
                : `<div style="font-weight:700">${escapeHtml(o.club.name)}</div><div class="muted">${escapeHtml(o.league)} · Rating ${o.club.rating}</div>`
            }
            <div class="row" style="margin-top:8px">
              <button class="btn primary" data-accept-coach-offer="${o.id}" style="flex:1">Aceptar</button>
              <button class="btn" data-reject-coach-offer="${o.id}" style="flex:1">Rechazar</button>
            </div>
          </div>`
                )
                .join('')
            : '<p class="muted">No tienes ofertas este año.</p>'
        }
      </div>
    </div>
    <div class="advance-bar">
      <button class="btn primary advance-btn" data-advance-coach-year ${busy ? 'disabled' : ''}>Avanzar temporada ▶</button>
      <button class="btn block" style="margin-top:8px" data-retire-coach>Retirarte del banco</button>
    </div>
  `;
}

function attachCoachHandlers() {
  const advanceBtn = app.querySelector('[data-advance-coach-year]');
  if (advanceBtn) advanceBtn.addEventListener('click', handleAdvanceCoachYear);

  app.querySelectorAll('[data-accept-coach-offer]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-accept-coach-offer');
      const offer = game.coach.currentOffers.find((o) => o.id === id);
      if (offer) {
        const feedTexts = acceptCoachOffer(game, offer);
        for (const t of feedTexts) pushFeed(game, t, 'event');
      }
      game.coach.currentOffers = [];
      render();
    });
  });
  app.querySelectorAll('[data-reject-coach-offer]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-reject-coach-offer');
      rejectCoachOffer();
      game.coach.currentOffers = game.coach.currentOffers.filter((o) => o.id !== id);
      render();
    });
  });

  const retireBtn = app.querySelector('[data-retire-coach]');
  if (retireBtn) {
    retireBtn.addEventListener('click', () => {
      if (confirm('¿Seguro que querés retirarte del banco? No hay vuelta atrás.')) {
        game.coach.retired = true;
        game.coach.retirementReason = 'decision';
        render();
      }
    });
  }
}

async function handleAdvanceCoachYear() {
  if (busy || game.coach.retired) return;
  busy = true;
  render();

  const decisions = {};
  const playerTalk = rollUnderperformerTalk(game);
  if (playerTalk) {
    decisions.playerTalk = playerTalk;
    decisions.playerTalkChoiceIndex = await showModal({
      title: `Charla con ${playerTalk.player}`,
      desc: playerTalk.text,
      options: PLAYER_TALK_OPTIONS.map((o, i) => ({ label: o.label, value: i })),
    });
  }
  if (game.coach.club && !game.coach.nationalTeamJob) {
    decisions.tactic = await showModal({
      title: 'Táctica de la temporada',
      desc: '¿Con qué filosofía encarás esta temporada?',
      options: [
        { label: 'Ofensiva: ir por todo', value: 'ofensivo' },
        { label: 'Equilibrada', value: 'equilibrado' },
        { label: 'Defensiva: no perder el arco en cero', value: 'defensivo' },
      ],
    });
    decisions.investment = await showModal({
      title: 'Inversión del club',
      desc: '¿En qué invertís el presupuesto de este año?',
      options: [
        { label: 'Cantera juvenil (crecimiento lento y barato)', value: 'cantera' },
        { label: 'Fichajes estrella (caro, resultados rápidos)', value: 'fichajes' },
        { label: 'Estabilidad financiera (ahorrar)', value: 'estabilidad' },
      ],
    });
  }

  const feedEntries = simulateCoachSeason(game, decisions);
  for (const t of feedEntries) pushFeed(game, t, t.includes('🏆') ? 'rare' : 'event');

  busy = false;
  render();
}

function renderFinalLegacyScreen() {
  const playerLegacy = computeLegacy(game);
  const coachLegacy = computeCoachLegacy(game);
  const summary = buildCareerSummary(game);
  return `
    <div class="screen">
      <div class="rare-banner" style="margin-top:20px">
        <div class="title">${escapeHtml(playerLegacy.title)} · ${escapeHtml(coachLegacy.title)}</div>
        <div class="sub">${escapeHtml(coachLegacy.narrative)}</div>
      </div>
      <div class="card">
        <h3>Carrera como jugador</h3>
        <p class="muted">${escapeHtml(playerLegacy.narrative)}</p>
        <div class="grid2" style="margin-top:8px">
          <div class="stat-tile"><div class="n">${summary.goals}</div><div class="l">Goles</div></div>
          <div class="stat-tile"><div class="n">${summary.trophies.length}</div><div class="l">Títulos jugador</div></div>
        </div>
      </div>
      <div class="card">
        <h3>Carrera como entrenador</h3>
        <div class="grid2">
          <div class="stat-tile"><div class="n">${coachLegacy.seasons}</div><div class="l">Temporadas dirigidas</div></div>
          <div class="stat-tile"><div class="n">${coachLegacy.titles}</div><div class="l">Títulos como DT</div></div>
          <div class="stat-tile"><div class="n">${coachLegacy.reputation}</div><div class="l">Reputación final</div></div>
        </div>
        ${
          game.coach.trophies.length
            ? game.coach.trophies.map((t) => `<div class="row between"><span>${escapeHtml(t.name)}</span><span class="muted">${escapeHtml(t.withClub)} · ${t.year}</span></div>`).join('')
            : ''
        }
      </div>
      <div class="card col">
        <h3>Semilla de esta carrera</h3>
        <p><b>${escapeHtml(summary.seed)}</b></p>
        <button class="btn primary block" data-export-final>Descargar historial (.json)</button>
        <button class="btn block" data-new-career>Empezar una nueva carrera</button>
      </div>
    </div>
  `;
}

function showTrainingModal() {
  const streak = game.player.trainingFocusStreak || { attr: null, count: 0 };
  const attrOptions = ATTR_KEYS.map((k) => {
    const isStreak = streak.attr === k && streak.count >= 1;
    const bonusNote = isStreak ? ` (racha x${streak.count + 1}: mejor ganancia)` : '';
    return {
      label: `${ATTR_LABELS[k]} — actual ${game.player.attrs[k]}${bonusNote}`,
      value: k,
    };
  });
  const options = attrOptions.concat([
    { label: 'Invisible: descanso, nutrición, psicología', value: 'invisible' },
  ]);
  const prompt =
    game.player.age >= 32
      ? 'A esta edad cada decisión pesa el doble. ¿Qué trabajas este año?'
      : 'Elige un atributo para enfocar este año. Repetir el mismo foco varios años seguidos da mejor rendimiento.';
  return showModal({ title: 'Entrenamiento', desc: prompt, options });
}

async function showRareModals(entries) {
  const rareEntries = entries.filter((f) => f.type === 'rare');
  for (const r of rareEntries) {
    await showInfoModal({ title: '⭐ Momento especial', text: r.text, rare: true, negative: /Maldición|Cristal|Caída|expulsado|Expulsado/.test(r.text) });
  }
}

async function handleAdvanceYear() {
  if (busy || game.retired) return;
  busy = true;
  render();

  const decisions = {};

  const nat = rollNationalizationOpportunity(game);
  if (nat) {
    decisions.nationalizationOffer = nat;
    decisions.nationalizationChoice = await showModal({
      title: 'Oportunidad de nacionalización',
      desc: `Por ascendencia, podrías representar a ${nat.toCountry.name} en lugar de ${nat.fromCountry.name}. Es tu única oportunidad antes de debutar, y no hay vuelta atrás.`,
      options: [
        { label: `Aceptar y jugar para ${nat.toCountry.name}`, value: 'accept' },
        { label: `Seguir siendo fiel a ${nat.fromCountry.name}`, value: 'reject' },
      ],
    });
  }

  const pressQ = rollPressConferenceQuestion(game);
  if (pressQ) {
    decisions.pressQuestion = pressQ;
    decisions.pressAnswerIndex = await showModal({
      title: 'Rueda de prensa',
      desc: pressQ.q,
      options: pressQ.options.map((o, i) => ({ label: o.label, value: i })),
    });
  }

  const managerTalk = rollManagerTalk(game);
  if (managerTalk) {
    decisions.managerTalk = managerTalk;
    decisions.managerTalkChoiceIndex = await showModal({
      title: `Charla con ${managerTalk.manager}`,
      desc: managerTalk.text,
      options: MANAGER_TALK_OPTIONS.map((o, i) => ({ label: o.label, value: i })),
    });
  }

  const personalEvent = rollPersonalLifeEvent(game, game.rng);
  if (personalEvent) {
    decisions.personalLifeEvent = personalEvent;
    decisions.personalLifeChoiceIndex = await showModal({
      title: personalEvent.title,
      desc: personalEvent.desc,
      options: personalEvent.options.map((o, i) => ({ label: o.label, value: i })),
    });
  }

  decisions.trainingFocus = await showTrainingModal();

  const pkg = await showModal({
    title: 'Vida fuera de la cancha',
    desc: '¿Cómo llevas este año lejos de la cancha?',
    options: game.rng.shuffle(LIFESTYLE_PACKAGES).slice(0, 4).map((p) => ({ label: p.label, value: p })),
  });
  decisions.hobby = pkg.hobby;
  decisions.travel = pkg.travel;
  decisions.party = pkg.party;
  decisions.gambling = pkg.gambling;

  pendingDecisions = decisions;
  const feedEntries = startSeason(game, decisions);
  busy = false;
  render();
  await showRareModals(feedEntries);

  if (!isMatchdayPending(game)) {
    await handleCloseSeason();
  }
}

async function handleJoinRoom() {
  const roomInput = document.getElementById('mp-room-input');
  const nameInput = document.getElementById('mp-name-input');
  const roomCode = (roomInput?.value || '').trim();
  const playerName = (nameInput?.value || '').trim() || game.player.name.split(' ')[0];
  if (!roomCode) return;

  mpStatus = 'connecting';
  mpError = null;
  render();

  try {
    await joinRoom(roomCode, playerName);
    mpUnsubscribe = await subscribeRoom(roomCode, {
      onClaims: (ids) => {
        mpClaimedClubIds = ids;
        render();
      },
      onActivity: (items) => {
        mpActivity = items;
        render();
      },
      onPlayers: (names) => {
        mpPlayers = names;
        render();
      },
    });
    mpRoomCode = roomCode;
    mpPlayerName = playerName;
    mpStatus = 'joined';
  } catch (e) {
    mpStatus = 'error';
    mpError = 'No se pudo conectar al mercado compartido. Revisá tu conexión e intentá de nuevo.';
  }
  render();
}

function handleLeaveRoom() {
  if (mpUnsubscribe) mpUnsubscribe();
  mpUnsubscribe = null;
  mpStatus = 'idle';
  mpRoomCode = null;
  mpPlayerName = null;
  mpClaimedClubIds = new Set();
  mpActivity = [];
  mpPlayers = [];
  render();
}

async function handlePlayNextMatch() {
  if (busy || game.retired) return;
  busy = true;
  render();

  const benchChallenge = rollBenchChallenge(game);
  let benchChallengeChoiceIndex = null;
  if (benchChallenge) {
    benchChallengeChoiceIndex = await showModal({
      title: `Te dejan en el banco`,
      desc: benchChallenge.text,
      options: BENCH_CHALLENGE_OPTIONS.map((o, i) => ({ label: o.label, value: i })),
    });
  }

  const hasPenalty = rollPenaltyOpportunityForMatch(game);
  let penaltyChoice = null;
  let penaltyTimingQuality = 0.5;
  if (hasPenalty) {
    penaltyChoice = await showModal({
      title: '¡Penal a tu favor!',
      desc: '¿A dónde tirás?',
      options: Object.entries(PENALTY_CHOICES).map(([id, c]) => ({ label: c.label, value: id })),
    });
    penaltyTimingQuality = await showTimingChallenge({
      title: 'Ejecutá el penal',
      desc: 'Tocá "¡Rematar!" cuando el indicador esté en el centro de la barra.',
    });
  }

  const hasBigChance = rollBigChanceOpportunityForMatch(game);
  let shotQuality = null;
  if (hasBigChance) {
    shotQuality = await showTimingChallenge({
      title: '⚡ ¡Gran ocasión!',
      desc: 'Se abre el arco. Tocá "¡Rematar!" con el mejor timing posible.',
    });
  }

  const feedEntries = playNextMatch(game, { penaltyChoice, penaltyTimingQuality, shotQuality, benchChallengeChoiceIndex });
  busy = false;
  render();

  const matchIndex = (game.pendingSeason?.matchIndex ?? 1) - 1;
  const matchesInSeason = game.pendingSeason?.matchesInSeason;
  await showLiveMatch({ lines: feedEntries, matchIndex, matchesInSeason });

  const reactionOptions = hasPendingSubReaction(game)
    ? Object.entries(SUB_REACTIONS).map(([id, r]) => ({ label: r.label, value: id }))
    : null;
  const reaction = await showMatchSummary({ lines: [], reactionOptions, lineups: game.lastMatchLineups });
  if (reaction) {
    resolveSubReaction(game, reaction);
    render();
  }

  if (!isMatchdayPending(game)) {
    await handleCloseSeason();
  }
}

async function handleSimRestOfSeason() {
  if (busy || game.retired) return;
  busy = true;
  render();
  let allFeed = [];
  while (isMatchdayPending(game)) {
    rollBenchChallenge(game);
    rollPenaltyOpportunityForMatch(game);
    rollBigChanceOpportunityForMatch(game);
    allFeed = allFeed.concat(
      playNextMatch(game, { penaltyChoice: 'medio', penaltyTimingQuality: 0.5, shotQuality: 0.55, benchChallengeChoiceIndex: 1 })
    );
    if (hasPendingSubReaction(game)) {
      allFeed = allFeed.concat(resolveSubReaction(game, 'calma'));
    }
  }
  busy = false;
  render();
  await showRareModals(allFeed);
  await handleCloseSeason();
}

async function handleCloseSeason() {
  if (busy) return;
  busy = true;
  render();
  const feedEntries = finishSeason(game, pendingDecisions || {});
  pendingDecisions = null;
  busy = false;
  render();
  await showRareModals(feedEntries);
  render();
}

render();
