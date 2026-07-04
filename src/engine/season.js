import { COUNTRY_BY_CODE } from '../data/countries.js';
import { CLUB_CONTINENTAL_CUPS, BALLON_NAME, GOLDEN_BOOT_NAME } from '../data/clubs.js';
import { growAttributes, overallRating, ATTR_KEYS, ATTR_LABELS } from './player.js';
import { simulateMatch, simulateTeamMatch, rollPenaltyOpportunity, PENALTY_CHOICES } from './match.js';
import { generateMatchLineup } from './lineup.js';
import { PRESS_QUESTIONS } from './events.js';
import { tryAnnualCareerStates, RARE_STATE_DEFS, narrativeFor } from './rareStates.js';
import {
  familyYearlyEvent,
  partnerYearlyEvent,
  partyDecision,
  gamblingDecision,
  viceSpiralCheck,
  dopingRedemptionCheck,
  illegalBettingEvent,
  HOBBIES,
  TRAVEL_OPTIONS,
} from './personalLife.js';
import { getLeagueSystem, generateOffers, attemptContractRenewal, checkForcedTransferListing } from './transferMarket.js';
import { payYearlySalary } from './finance.js';
import {
  isWorldCupYear,
  isContinentalYear,
  attemptQualification,
  simulateTournamentRun,
  CONTINENTAL_CUP_NAME,
} from './nationalTeam.js';

function clamp(v, min = 0, max = 100) {
  return Math.max(min, Math.min(max, v));
}

function applyDelta(state, effect) {
  if (!effect) return;
  if (effect.moraleD) state.player.morale = clamp(state.player.morale + effect.moraleD);
  if (effect.formD) state.player.form = clamp(state.player.form + effect.formD);
  if (effect.menD) state.player.attrs.men = clamp(state.player.attrs.men + effect.menD);
  if (effect.famedD) state.fame = clamp(state.fame + effect.famedD);
}

function flushFeed(state, feed) {
  for (const f of feed) {
    state.feed.push({ year: state.year, age: state.player.age, worldYear: state.worldYearStart + state.year - 1, type: f.type, text: f.text });
  }
}

const RETIREMENT_AGE_HARD = 40;

/** Se llama antes de mostrar los popups de decisión del año: decide de forma
 * determinista (consumiendo el rng) si hay rueda de prensa y con qué pregunta. */
export function rollPressConferenceQuestion(state) {
  if (!state.rng.chance(0.3)) return null;
  const q = state.rng.pick(PRESS_QUESTIONS);
  return q;
}

/**
 * Genera un calendario de todos-contra-todos (ida y vuelta) para los clubes
 * de una división, con el método del círculo: n-1 jornadas para la ida,
 * las mismas jornadas invertidas para la vuelta. Cada jornada es un array de
 * pares [clubA, clubB]; el jugador está en exactamente un par por jornada.
 */
function generateRoundRobinSchedule(clubs, rng) {
  const teams = rng.shuffle(clubs.slice());
  const n = teams.length;
  const fixed = teams[0];
  let rotating = teams.slice(1);
  const half = n / 2;
  const firstLeg = [];
  for (let r = 0; r < n - 1; r++) {
    const current = [fixed, ...rotating];
    const pairs = [];
    for (let j = 0; j < half; j++) pairs.push([current[j], current[n - 1 - j]]);
    firstLeg.push(pairs);
    rotating.unshift(rotating.pop());
  }
  const secondLeg = firstLeg.map((pairs) => pairs.map(([a, b]) => [b, a]));
  return [...firstLeg, ...secondLeg];
}

function emptyTableStats(clubs) {
  const stats = {};
  for (const c of clubs) {
    stats[c.id] = { id: c.id, name: c.name, played: 0, wins: 0, draws: 0, losses: 0, gf: 0, ga: 0, points: 0 };
  }
  return stats;
}

/** Acumula el resultado de un partido (a vs b) en la tabla en vivo. */
function updateTableStats(tableStats, aId, bId, aGoals, bGoals) {
  const a = tableStats[aId];
  const b = tableStats[bId];
  if (!a || !b) return;
  a.played++;
  b.played++;
  a.gf += aGoals;
  a.ga += bGoals;
  b.gf += bGoals;
  b.ga += aGoals;
  if (aGoals > bGoals) {
    a.wins++;
    a.points += 3;
    b.losses++;
  } else if (aGoals < bGoals) {
    b.wins++;
    b.points += 3;
    a.losses++;
  } else {
    a.draws++;
    b.draws++;
    a.points += 1;
    b.points += 1;
  }
}

/** Convierte la tabla en vivo (acumulada jornada a jornada) al formato que
 * consume la UI, ordenada por puntos y diferencia de gol. */
function buildLiveLeagueTable(state, ps) {
  const rows = Object.values(ps.tableStats).map((s) => ({
    id: s.id,
    name: s.name,
    played: s.played,
    wins: s.wins,
    draws: s.draws,
    losses: s.losses,
    gf: s.gf,
    ga: s.ga,
    points: s.points,
    isPlayer: s.id === state.club.id,
  }));
  rows.sort((a, b) => b.points - a.points || (b.gf - b.ga) - (a.gf - a.ga) || b.gf - a.gf);
  rows.forEach((r, i) => (r.position = i + 1));
  return { leagueName: ps.leagueSystem.leagueName, divisionLabel: ps.division.label, year: state.year, rows };
}

function emptySeasonStats() {
  return {
    matches: 0,
    goals: 0,
    assists: 0,
    yellow: 0,
    red: 0,
    ratings: [],
    wins: 0,
    draws: 0,
    losses: 0,
    teamGoalsFor: 0,
    teamGoalsAgainst: 0,
  };
}

/**
 * Arranca la temporada: aplica todas las decisiones de pre-temporada
 * (entrenamiento, rueda de prensa, ocio, vicios, evento de vida personal,
 * familia/pareja) y prepara el calendario de partidos de club, si tiene
 * club. No juega ningún partido todavía: eso lo hace playNextMatch().
 * decisions: { trainingFocus, pressQuestion, pressAnswerIndex, hobby,
 * travel, party, gambling, personalLifeEvent, personalLifeChoiceIndex }
 */
export function startSeason(state, decisions = {}) {
  const rng = state.rng;
  const feed = [];
  const push = (text, type = 'normal') => feed.push({ text, type });

  // ---- Entrenamiento: enfoque en un atributo concreto (o invisible) ----
  const trainingBonus = {};
  const focus = decisions.trainingFocus;
  if (focus === 'invisible') {
    trainingBonus.men = 3;
    state.player.consecutiveInvisibleTraining = (state.player.consecutiveInvisibleTraining || 0) + 1;
    state.player.form = clamp(state.player.form + 8);
    state.rareTracker.profile.physicalCareStreak = (state.rareTracker.profile.physicalCareStreak || 0) + 0.5;
    state.player.trainingFocusStreak = { attr: 'invisible', count: 1 };
  } else if (focus && ATTR_KEYS.includes(focus)) {
    const streak = state.player.trainingFocusStreak || { attr: null, count: 0 };
    const newCount = streak.attr === focus ? streak.count + 1 : 1;
    state.player.trainingFocusStreak = { attr: focus, count: newCount };
    const streakBonus = Math.min(3, newCount - 1);
    trainingBonus[focus] = 5 + streakBonus;
    state.player.consecutiveInvisibleTraining = 0;

    // Con 7 atributos posibles (solo 2 "físicos"), un desliz aislado no debe
    // borrar de golpe la racha acumulada: decae de a poco en vez de resetear.
    if (focus === 'phy' || focus === 'pac') {
      state.rareTracker.profile.physicalCareStreak = (state.rareTracker.profile.physicalCareStreak || 0) + 1;
      state.rareTracker.profile.physicalNeglectStreak = Math.max(0, (state.rareTracker.profile.physicalNeglectStreak || 0) - 1);
    } else {
      state.rareTracker.profile.physicalNeglectStreak = (state.rareTracker.profile.physicalNeglectStreak || 0) + 1;
      state.rareTracker.profile.physicalCareStreak = Math.max(0, (state.rareTracker.profile.physicalCareStreak || 0) - 1);
    }

    // Especialización sostenida: el techo mismo puede subir. Con constancia
    // real (varios años seguidos en el mismo atributo) esto debería ser
    // alcanzable, no un golpe de suerte aislado: un jugador dedicado tiene
    // que poder superar su potencial de partida, aunque cueste.
    if (newCount >= 3 && (state.player.potentialNudges || 0) < 6 && rng.chance(0.14)) {
      state.player.potential = Math.min(99, state.player.potential + 1);
      state.player.potentialNudges = (state.player.potentialNudges || 0) + 1;
      push(`Años de trabajo en ${ATTR_LABELS[focus]} rinden frutos: superas tus propios límites y tu techo como jugador crece.`, 'rare');
    }
  }

  // ---- Rueda de prensa (si la UI la resolvió antes de llamar) ----
  if (decisions.pressQuestion && decisions.pressAnswerIndex != null) {
    const opt = decisions.pressQuestion.options[decisions.pressAnswerIndex];
    if (opt) {
      applyDelta(state, { moraleD: opt.moraleD, famedD: opt.famedD });
      state.personalLife.reputation = clamp(state.personalLife.reputation + (opt.pressD || 0) / 2);
      if (opt.loyaltySignal) state.rareTracker.signal('humilityStreak');
      push(`Rueda de prensa: "${decisions.pressQuestion.q}" → "${opt.label}"`, 'event');
    }
  }

  // ---- Ocio: hobby y vacaciones ----
  if (decisions.hobby && HOBBIES[decisions.hobby]) {
    HOBBIES[decisions.hobby].apply(state);
    push(`Este año dedicas tiempo libre a: ${HOBBIES[decisions.hobby].label}.`);
  }
  if (decisions.travel && TRAVEL_OPTIONS[decisions.travel]) {
    const msg = TRAVEL_OPTIONS[decisions.travel].apply(state, rng);
    push(`Vacaciones: ${TRAVEL_OPTIONS[decisions.travel].label}.`);
    if (msg) push(msg, 'negative');
  }

  // ---- Fiestas / vicios ----
  for (const m of partyDecision(state, rng, decisions.party || 'ninguna')) push(m, 'negative');
  for (const m of gamblingDecision(state, rng, decisions.gambling || 'no')) push(m, 'negative');
  for (const m of viceSpiralCheck(state, rng)) push(m, m.includes('Caída Libre') || m.includes('redención') ? 'rare' : 'negative');
  const dopingRedemption = dopingRedemptionCheck(state, rng);
  if (dopingRedemption) push(dopingRedemption, dopingRedemption.includes('redención') ? 'rare' : 'event');
  const illegal = illegalBettingEvent(state, rng);
  if (illegal) {
    push(illegal, 'rare');
    state.retired = true;
    state.retirementReason = 'expulsado';
  }

  // ---- Evento interactivo de vida personal (resuelto en la UI antes de llamar) ----
  if (decisions.personalLifeEvent && decisions.personalLifeChoiceIndex != null) {
    const opt = decisions.personalLifeEvent.options[decisions.personalLifeChoiceIndex];
    if (opt) {
      const text = opt.run(state, rng);
      if (text) push(text, 'event');
    }
  }

  // ---- Vida personal: familia y pareja ----
  const fam = familyYearlyEvent(state, rng);
  if (fam) {
    push(fam.text, 'event');
    applyDelta(state, fam);
  }
  const part = partnerYearlyEvent(state, rng);
  if (part) {
    push(part.text, part.scandal ? 'negative' : 'event');
    applyDelta(state, part);
  }

  // ---- Calendario de partidos de club para esta temporada ----
  let hasMatches = false;
  if (!state.retired && !state.club) {
    push('Sigues sin equipo. Entrenas por tu cuenta mientras tu agente busca una oportunidad.', 'negative');
  } else if (!state.retired && state.club) {
    const leagueSystem = getLeagueSystem(state, state.club.countryCode);
    const division = leagueSystem.divisions[state.club.division] || leagueSystem.divisions[0];
    const schedule = generateRoundRobinSchedule(division.clubs, rng);
    hasMatches = true;
    state.pendingSeason = {
      trainingBonus,
      matchIndex: 0,
      matchesInSeason: schedule.length,
      leagueSystem,
      division,
      schedule,
      tableStats: emptyTableStats(division.clubs),
      seasonStats: emptySeasonStats(),
      weeksOut: Math.ceil(state.suspensionWeeks || 0),
    };
    state.suspensionWeeks = 0;
    state.leagueTable = buildLiveLeagueTable(state, state.pendingSeason);
  }
  if (!hasMatches) {
    state.pendingSeason = { trainingBonus, matchIndex: 0, matchesInSeason: 0, seasonStats: emptySeasonStats() };
  }

  flushFeed(state, feed);
  return feed;
}

/** Se llama ANTES de playNextMatch (misma idea que rollPressConferenceQuestion):
 * decide de forma determinista si el próximo partido incluye un penal a tu
 * favor, para que la UI pueda mostrar la decisión de dónde patear antes de
 * resolver el partido. Guarda el resultado en pendingSeason.pendingPenalty. */
export function rollPenaltyOpportunityForMatch(state) {
  const ps = state.pendingSeason;
  if (!ps || ps.matchIndex >= ps.matchesInSeason || ps.weeksOut > 0) {
    if (ps) ps.pendingPenalty = false;
    return false;
  }
  const has = rollPenaltyOpportunity(state.player, state.rng);
  ps.pendingPenalty = has;
  return has;
}

/** Inventa las alineaciones de 11 jugadores de ambos clubes para el partido
 * recién jugado (goles/asistencias/calificación coherentes con el
 * marcador), y las deja en state.lastMatchLineups para que la UI las
 * muestre en la pantalla de resumen. Es solo flavor de esa ventana: no se
 * persiste como parte de las estadísticas de carrera. */
function attachMatchLineups(state, opp, result, includeUser) {
  const confed = COUNTRY_BY_CODE[state.club.countryCode]?.confed || 'UEFA';
  const oppConfed = COUNTRY_BY_CODE[opp.countryCode]?.confed || confed;
  const userEntry = includeUser
    ? {
        name: state.player.name,
        position: state.player.position,
        rating: result.matchRating,
        goals: result.goals,
        assists: result.assists,
      }
    : null;
  const home = generateMatchLineup({
    rng: state.rng,
    confed,
    teamGoals: result.teamGoals,
    oppGoals: result.oppGoals,
    ownGoals: includeUser ? result.goals : 0,
    ownAssists: includeUser ? result.assists : 0,
    userEntry,
  });
  const away = generateMatchLineup({ rng: state.rng, confed: oppConfed, teamGoals: result.oppGoals, oppGoals: result.teamGoals });
  state.lastMatchLineups = {
    home: { clubName: state.club.name, players: home },
    away: { clubName: opp.name, players: away },
  };
}

/** Simula exactamente el próximo partido de la temporada en curso (requiere
 * haber llamado startSeason antes). decisions.penaltyChoice: id de
 * PENALTY_CHOICES si rollPenaltyOpportunityForMatch marcó que hay penal.
 * Devuelve el feed de ese partido. */
export function playNextMatch(state, decisions = {}) {
  const ps = state.pendingSeason;
  if (!ps || ps.matchIndex >= ps.matchesInSeason) return [];
  const rng = state.rng;
  const feed = [];
  const push = (text, type = 'normal') => feed.push({ text, type });
  const m = ps.matchIndex;

  // ---- Resto de la división: se simula la jornada completa para que la
  // tabla se actualice en vivo, no solo la fila del jugador. ----
  const round = ps.schedule[m];
  let opp = null;
  for (const [a, b] of round) {
    if (a.id === state.club.id) opp = b;
    else if (b.id === state.club.id) opp = a;
    else {
      const r = simulateTeamMatch(a.rating, b.rating, rng);
      updateTableStats(ps.tableStats, a.id, b.id, r.teamGoals, r.oppGoals);
    }
  }

  if (ps.weeksOut > 0) {
    ps.weeksOut -= 2;
    const r = simulateTeamMatch(state.club.rating, opp.rating, rng);
    updateTableStats(ps.tableStats, state.club.id, opp.id, r.teamGoals, r.oppGoals);
    attachMatchLineups(state, opp, r, false);
    push(`J${m + 1}: sigues de baja, no viajas con el plantel (${state.club.name} ${r.teamGoals}-${r.oppGoals} ${opp.name}).`, 'negative');
  } else {
    const isLateSeason = m >= ps.matchesInSeason - 3;
    const matchCtx = {
      highPressure: isLateSeason && rng.chance(0.45),
      competition: ps.leagueSystem.leagueName,
      fatigue: Math.min(1, m / ps.matchesInSeason),
    };
    const penaltyChoice = ps.pendingPenalty ? decisions.penaltyChoice || 'medio' : null;
    const result = simulateMatch(state.player, state.club.rating, opp.rating, rng, matchCtx, state.rareTracker, penaltyChoice);
    ps.pendingPenalty = false;
    updateTableStats(ps.tableStats, state.club.id, opp.id, result.teamGoals, result.oppGoals);
    attachMatchLineups(state, opp, result, true);

    ps.seasonStats.matches++;
    ps.seasonStats.goals += result.goals;
    ps.seasonStats.assists += result.assists;
    ps.seasonStats.ratings.push(result.matchRating);
    ps.seasonStats.teamGoalsFor += result.teamGoals;
    ps.seasonStats.teamGoalsAgainst += result.oppGoals;
    if (result.result === 'win') ps.seasonStats.wins++;
    else if (result.result === 'draw') ps.seasonStats.draws++;
    else ps.seasonStats.losses++;
    if (result.yellow) ps.seasonStats.yellow++;
    if (result.red) ps.seasonStats.red++;
    state.player.recentRatings = (state.player.recentRatings || []).concat(result.matchRating).slice(-10);

    if (result.penalty) {
      const label = PENALTY_CHOICES[penaltyChoice]?.label || 'al medio';
      if (result.penalty.delegate) {
        push(`Penal a favor: se lo cedés a un compañero. ${result.penalty.scored ? 'Anota.' : 'Falla.'}`, 'event');
      } else if (result.penalty.outcome === 'gol') {
        push(`Penal a favor. Elegís "${label}"... ¡GOL!`, 'event');
      } else if (result.penalty.outcome === 'atajado') {
        push(`Penal a favor. Elegís "${label}"... el arquero adivina y ataja.`, 'negative');
      } else {
        push(`Penal a favor. Elegís "${label}"... la pelota se va afuera.`, 'negative');
      }
    }

    const resultChar = result.result === 'win' ? 'W' : result.result === 'draw' ? 'E' : 'P';
    const personalBits = [];
    if (result.goals > 0) personalBits.push(`⚽x${result.goals}`);
    if (result.assists > 0) personalBits.push(`🅰️x${result.assists}`);
    if (result.yellow) personalBits.push('🟨');
    if (result.red) personalBits.push('🟥');
    const personalSuffix = personalBits.length ? ` — ${personalBits.join(' ')}` : '';
    push(
      `J${m + 1}${matchCtx.highPressure ? ' 🔥' : ''}: ${state.club.name} ${result.teamGoals}-${result.oppGoals} ${opp.name} (${resultChar})${personalSuffix}`,
      result.result === 'loss' ? 'negative' : 'normal'
    );

    if (result.inZona) {
      state.rareTracker.legendaryNights++;
      push(`🌟 NOCHE DE LEYENDA: ${result.events[0]?.text || 'entras en La Zona y el partido es completamente tuyo.'}`, 'rare');
    } else {
      for (const ev of result.events) push(ev.text, 'event');
    }

    if (result.red) {
      if (result.redCardType === 'merecida') {
        state.player.morale = clamp(state.player.morale - 6);
        state.personalLife.reputation = clamp(state.personalLife.reputation - 4);
        push('Expulsión merecida: una entrada imprudente que el árbitro no puede dejar pasar.', 'negative');
      } else {
        state.player.morale = clamp(state.player.morale - 2);
        state.personalLife.reputation = clamp(state.personalLife.reputation + 2);
        push('Expulsión injusta: el árbitro se equivoca y la prensa te respalda.', 'negative');
      }
    }

    // La tanda de una final es de por sí un evento raro (llegar a la final):
    // dispara La Maldición garantizado. Un penal errado en un partido de
    // presión normal es mucho más frecuente, así que solo una fracción de
    // esas fallas se vuelve el inicio de La Maldición.
    const maldicionEligible = state.rareTracker.canStartNew() && !state.rareTracker.hasHad('LA_MALDICION');
    if (maldicionEligible && result.missedPenalty && !result.pressurePenaltyMiss) {
      state.rareTracker.start('LA_MALDICION', state.year);
      state.rareTracker.signal('pressureFailures');
      push('Fallas un penal decisivo en la tanda de una final. La Maldición ha comenzado.', 'rare');
    } else if (maldicionEligible && result.pressurePenaltyMiss && rng.chance(0.18)) {
      state.rareTracker.start('LA_MALDICION', state.year);
      state.rareTracker.signal('pressureFailures');
      push('Fallas un penal decisivo en un partido de máxima presión. La Maldición ha comenzado.', 'rare');
    }

    if (result.injury) {
      ps.weeksOut = result.injury.weeksOut;
      push(result.injury.text, result.injury.severity === 'grave' ? 'rare' : 'negative');
      if (result.injury.severity === 'grave') {
        state.player.monthsSinceInjury = 0;
        if (state.rareTracker.canStartNew() && !state.rareTracker.hasHad('CRISTAL') && rng.chance(0.035)) {
          state.rareTracker.start('CRISTAL', state.year);
          state.player.injuryProneness = Math.min(0.95, state.player.injuryProneness * 3);
          push('Tu cuerpo nunca vuelve a ser el mismo tras esta lesión grave. Cristal.', 'rare');
        }
      }
    } else {
      state.player.monthsSinceInjury = (state.player.monthsSinceInjury || 0) + 1;
    }

    // ---- Sustitución: si el partido va mal, el DT te puede sacar antes de
    // tiempo. Cómo reaccionás (reclamo/calma) se resuelve aparte, con
    // resolveSubReaction, para que la UI pueda mostrar la elección. ----
    const canBeSubbed = !result.red && !result.inZona;
    if (canBeSubbed) {
      const subProb = result.matchRating <= 5.6 ? 0.32 : result.matchRating <= 6.6 ? 0.1 : 0.02;
      if (rng.chance(subProb)) {
        ps.pendingSubReaction = { matchIndex: m };
        push('Te sacan del campo antes de tiempo. El entrenador no está conforme con tu partido.', 'event');
      }
    }
  }

  ps.matchIndex++;
  state.leagueTable = buildLiveLeagueTable(state, ps);
  flushFeed(state, feed);
  return feed;
}

/** true si el partido recién jugado te sacó del campo y falta resolver tu
 * reacción (reclamo/calma) antes de seguir con la temporada. */
export function hasPendingSubReaction(state) {
  return !!state.pendingSeason?.pendingSubReaction;
}

export const SUB_REACTIONS = {
  reclamar: { label: 'Reclamarle al entrenador', managerD: -10, moraleD: 4 },
  calma: { label: 'Aceptarlo con profesionalismo', managerD: 6, moraleD: -1 },
};

/** Resuelve la reacción del jugador a haber sido sustituido: afecta la
 * relación con el entrenador (y, con ella, tus chances de renovación) y la
 * moral. No consume rng: se puede llamar en cualquier momento después de
 * playNextMatch sin afectar la paridad de la simulación por lotes. */
export function resolveSubReaction(state, choiceId) {
  const ps = state.pendingSeason;
  if (!ps || !ps.pendingSubReaction) return [];
  const choice = SUB_REACTIONS[choiceId] || SUB_REACTIONS.calma;
  state.managerRelationship = clamp(state.managerRelationship + choice.managerD);
  state.player.morale = clamp(state.player.morale + choice.moraleD);
  ps.pendingSubReaction = null;
  const feed = [
    {
      text:
        choiceId === 'reclamar'
          ? 'Le reclamás al entrenador en pleno vestuario. Te desahogás, pero la relación se resiente.'
          : 'Te lo tomás con calma y profesionalismo. El cuerpo técnico lo valora.',
      type: choiceId === 'reclamar' ? 'negative' : 'event',
    },
  ];
  flushFeed(state, feed);
  return feed;
}

/** true si ya se jugaron todos los partidos de la temporada en curso (o si
 * el jugador no tenía club, en cuyo caso no hay nada que jugar). */
export function isMatchdayPending(state) {
  const ps = state.pendingSeason;
  return !!ps && ps.matchIndex < ps.matchesInSeason;
}

/**
 * Cierra la temporada: copa continental, premios individuales, selección
 * nacional, envejecimiento/crecimiento, estados raros, finanzas, contrato,
 * retiro y ofertas para el próximo año. Requiere que ya se hayan jugado
 * todos los partidos (isMatchdayPending debe ser false).
 */
export function finishSeason(state, decisions = {}) {
  const rng = state.rng;
  const feed = [];
  const push = (text, type = 'normal') => feed.push({ text, type });
  const ps = state.pendingSeason || { trainingBonus: {}, seasonStats: emptySeasonStats() };
  const seasonStats = ps.seasonStats;

  if (!state.retired && state.club && ps.leagueSystem) {
    const avgRating = seasonStats.ratings.length
      ? seasonStats.ratings.reduce((a, b) => a + b, 0) / seasonStats.ratings.length
      : 6.0;
    state.player.form = clamp(Math.round(state.player.form * 0.4 + avgRating * 10 * 0.6));

    state.stats.career.matches += seasonStats.matches;
    state.stats.career.goals += seasonStats.goals;
    state.stats.career.assists += seasonStats.assists;
    state.stats.career.yellow += seasonStats.yellow;
    state.stats.career.red += seasonStats.red;
    state.stats.seasons.push({
      year: state.year,
      age: state.player.age,
      club: state.club.name,
      matches: seasonStats.matches,
      goals: seasonStats.goals,
      assists: seasonStats.assists,
      avgRating: Math.round(avgRating * 100) / 100,
      wins: seasonStats.wins,
      draws: seasonStats.draws,
      losses: seasonStats.losses,
      teamGoalsFor: seasonStats.teamGoalsFor,
      teamGoalsAgainst: seasonStats.teamGoalsAgainst,
    });

    state.fame = clamp(
      state.fame + seasonStats.goals * 0.6 + seasonStats.assists * 0.3 + (avgRating - 6) * 3 + state.club.prestige / 40
    );

    // ---- Copa continental de clubes ----
    if (state.club.prestige >= 55 && rng.chance(0.55)) {
      const cupNames = CLUB_CONTINENTAL_CUPS[state.club.countryCode ? COUNTRY_BY_CODE[state.club.countryCode]?.confed : 'UEFA'] || CLUB_CONTINENTAL_CUPS.UEFA;
      const cupName = state.club.prestige >= 80 ? cupNames.top : cupNames.second;
      let advancing = true;
      let round = 0;
      const roundNames = ['fase de grupos', 'octavos', 'cuartos', 'semifinal', 'final'];
      while (advancing && round < roundNames.length) {
        const isFinal = roundNames[round] === 'final';
        const oppRating = state.club.rating + rng.range(-8, 12);
        const ctx = { highPressure: true, competition: cupName, isFinal, penaltyShootout: isFinal && rng.chance(0.25) };
        const r = simulateMatch(state.player, state.club.rating, oppRating, rng, ctx, state.rareTracker);
        if (r.inZona) push(`🌟 NOCHE DE LEYENDA en ${cupName} (${roundNames[round]}): decides el partido tú solo.`, 'rare');
        if (r.result === 'loss') {
          advancing = false;
          push(`Eliminado de la ${cupName} en ${roundNames[round]}.`, 'event');
        } else if (isFinal) {
          advancing = false;
          state.trophies.push({ year: state.year, name: cupName, withClub: state.club.name });
          push(`🏆 ¡${state.club.name} conquista la ${cupName}!`, 'rare');
        } else {
          round++;
        }
      }
    }

    // ---- Premios individuales ----
    if (avgRating >= 8.0 && seasonStats.goals >= 18 && rng.chance(0.3)) {
      state.trophies.push({ year: state.year, name: GOLDEN_BOOT_NAME, withClub: state.club.name });
      push(`🥇 Ganas la ${GOLDEN_BOOT_NAME} de tu liga.`, 'event');
    }
    if (avgRating >= 8.4 && (seasonStats.goals + seasonStats.assists) >= 25 && rng.chance(0.15)) {
      state.trophies.push({ year: state.year, name: BALLON_NAME, withClub: state.club.name });
      push(`🏅 ¡Ganas el ${BALLON_NAME}! Eres el mejor jugador del mundo esta temporada.`, 'rare');
    }
  }

  // ---- Selección nacional ----
  if (!state.retired) {
    // La oportunidad (si la hay) se resuelve UNA sola vez, en la UI, antes de
    // llamar a startSeason (ver rollNationalizationOpportunity), y se pasa
    // aquí ya resuelta para no consumir el rng dos veces.
    const nat = decisions.nationalizationOffer || null;
    if (nat && decisions.nationalizationChoice) {
      if (decisions.nationalizationChoice === 'accept') {
        state.nationality = nat.toCountry.code;
        state.nationalTeam.nationalizationUsed = true;
        push(`Te nacionalizas por ${nat.toCountry.name}. Para algunos eres pragmático, para tu país natal, un traidor.`, 'event');
      } else {
        state.nationalTeam.nationalizationUsed = true;
        push(`Rechazas la nacionalización y decides representar a ${nat.fromCountry.name} hasta el final.`, 'event');
      }
    }

    const rating = overallRating(state.player);
    const country = COUNTRY_BY_CODE[state.nationality];
    const callProb = clamp((rating - country.nt + 25) / 60, 0.02, 0.95);
    if (!state.nationalTeam.prestigeLocked && rng.chance(callProb) && decisions.acceptNationalCall !== false) {
      if (!state.nationalTeam.debuted) {
        state.nationalTeam.debuted = true;
        push(`¡Debut con la selección de ${country.name}!`, 'event');
      }
      state.nationalTeam.caps++;

      const worldYear = state.worldYearStart + state.year - 1;
      if (isWorldCupYear(worldYear)) {
        const q = attemptQualification(state, 'world');
        if (q.qualified) {
          const label = q.isEpic ? `¡HAZAÑA HISTÓRICA! ${country.name} clasifica al Mundial` : `${country.name} clasifica al Mundial`;
          push(`${label}.`, q.isEpic ? 'rare' : 'event');
          const run = simulateTournamentRun(state, 'world', 'Mundial');
          for (const t of run.feed) push(t, t.includes('LEYENDA') || t.includes('CAMPEÓN') ? 'rare' : 'event');
          state.nationalTeam.goals += run.playerStatsAgg.goals;
          state.nationalTeam.tournamentsPlayed.push({ year: state.year, name: 'Mundial', reached: run.reachedRound, champion: run.champion });
          if (run.champion) state.trophies.push({ year: state.year, name: 'Mundial', withClub: country.name });
          state.player.fatigueLevel = 0.3;
        } else {
          push(`${country.name} no logra clasificar al Mundial.`, 'event');
        }
      } else if (isContinentalYear(worldYear)) {
        const cupName = CONTINENTAL_CUP_NAME[country.confed];
        const q = attemptQualification(state, 'continental');
        if (q.qualified) {
          push(`${country.name} disputará la ${cupName}.`, 'event');
          const run = simulateTournamentRun(state, 'continental', cupName);
          for (const t of run.feed) push(t, t.includes('LEYENDA') || t.includes('CAMPEÓN') ? 'rare' : 'event');
          state.nationalTeam.tournamentsPlayed.push({ year: state.year, name: cupName, reached: run.reachedRound, champion: run.champion });
          if (run.champion) state.trophies.push({ year: state.year, name: cupName, withClub: country.name });
          state.player.fatigueLevel = 0.2;
        }
      }
    }
  }

  // ---- Fidelidad al club: una señal por año, no por oferta rechazada ----
  if (!state.transferredThisYear) {
    state.rareTracker.profile.seasonsAtCurrentClub = (state.rareTracker.profile.seasonsAtCurrentClub || 0) + 1;
  }
  if (state.bigOfferRejectedThisYear) {
    state.rareTracker.signal('rejectedBigOffers');
  }
  state.transferredThisYear = false;
  state.bigOfferRejectedThisYear = false;

  // ---- Crecimiento y envejecimiento ----
  const attrsBefore = { ...state.player.attrs };
  growAttributes(state.player, rng, ps.trainingBonus || {});
  const deltas = ATTR_KEYS.map((k) => ({ k, d: state.player.attrs[k] - attrsBefore[k] })).filter((x) => x.d !== 0);
  if (deltas.length) {
    const summary = deltas
      .sort((a, b) => Math.abs(b.d) - Math.abs(a.d))
      .map((x) => `${ATTR_LABELS[x.k]} ${x.d > 0 ? '+' : ''}${x.d}`)
      .join(', ');
    push(`Progreso de la temporada: ${summary}.`);
  }
  state.player.age += 1;
  state.year += 1;

  // ---- Estados raros: resolución anual + chequeo ----
  const resolvedId = state.rareTracker.tickYear(state.year);
  if (resolvedId) {
    push(`El estado "${RARE_STATE_DEFS[resolvedId].name}" llega a su fin.`, 'rare');
  }
  const started = tryAnnualCareerStates(state.rareTracker, state.player, state.year, rng);
  if (started && started !== 'LA_ZONA_GUARANTEE') {
    push(`⭐ ${RARE_STATE_DEFS[started].name}: ${narrativeFor(started)}`, 'rare');
  } else if (started === 'LA_ZONA_GUARANTEE') {
    push('Sientes que algo especial se acerca. Tu próximo partido de máxima presión será inolvidable.', 'rare');
  }

  // ---- Finanzas ----
  payYearlySalary(state);
  state.peakMoney = Math.max(state.peakMoney, state.money);

  // ---- Relación con el cuerpo técnico rota: venta o salida anticipada ----
  if (state.club && state.contract && state.contract.years > 0) {
    const forcedOut = checkForcedTransferListing(state, rng);
    if (forcedOut) push(forcedOut, 'negative');
  }

  // ---- Vencimiento de contrato ----
  if (state.club && state.contract) {
    state.contract.years -= 1;
    if (state.contract.years <= 0) {
      const resolution = attemptContractRenewal(state, rng);
      if (resolution) push(resolution.text, resolution.renewed ? 'event' : 'negative');
    }
  }

  // ---- Retiro automático por edad límite ----
  if (state.player.age >= RETIREMENT_AGE_HARD) {
    state.retired = true;
    state.retirementReason = state.retirementReason || 'edad';
  }

  // ---- Nuevas ofertas de mercado para el próximo año ----
  state.currentOffers = state.retired ? [] : generateOffers(state);

  state.pendingSeason = null;
  flushFeed(state, feed);
  return feed;
}

/**
 * Conveniencia: simula la temporada completa de punta a punta (arranque,
 * todos los partidos, cierre) en un solo llamado. La usan los tests y
 * scripts/simulate.js; la UI en cambio usa startSeason/playNextMatch/
 * finishSeason por separado para poder avanzar partido a partido.
 */
export function simulateSeason(state, decisions = {}) {
  const feed = [];
  feed.push(...startSeason(state, decisions));
  while (isMatchdayPending(state)) {
    rollPenaltyOpportunityForMatch(state);
    feed.push(...playNextMatch(state, decisions));
    if (hasPendingSubReaction(state)) {
      feed.push(...resolveSubReaction(state, decisions.subReactionChoice || 'calma'));
    }
  }
  feed.push(...finishSeason(state, decisions));
  return feed;
}
