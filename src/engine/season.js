import { COUNTRY_BY_CODE } from '../data/countries.js';
import { CLUB_CONTINENTAL_CUPS, BALLON_NAME, GOLDEN_BOOT_NAME } from '../data/clubs.js';
import { growAttributes, overallRating, ATTR_KEYS, ATTR_LABELS } from './player.js';
import { simulateMatch } from './match.js';
import { PRESS_QUESTIONS } from './events.js';
import {
  tryAnnualCareerStates,
  RARE_STATE_DEFS,
  narrativeFor,
} from './rareStates.js';
import {
  familyYearlyEvent,
  partnerYearlyEvent,
  partyDecision,
  gamblingDecision,
  viceSpiralCheck,
  illegalBettingEvent,
  HOBBIES,
  TRAVEL_OPTIONS,
} from './personalLife.js';
import { getLeagueSystem, generateOffers } from './transferMarket.js';
import { payYearlySalary } from './finance.js';
import {
  isWorldCupYear,
  isContinentalYear,
  attemptQualification,
  simulateTournamentRun,
  rollNationalizationOpportunity,
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

const RETIREMENT_AGE_HARD = 40;

/** Se llama antes de mostrar los popups de decisión del año: decide de forma
 * determinista (consumiendo el rng) si hay rueda de prensa y con qué pregunta. */
export function rollPressConferenceQuestion(state) {
  if (!state.rng.chance(0.3)) return null;
  const q = state.rng.pick(PRESS_QUESTIONS);
  return q;
}

/**
 * Simula una temporada completa (un año de carrera): entrenamiento, partidos
 * de club, competiciones continentales, calendario de selección, vida
 * personal, finanzas, envejecimiento y chequeo de estados raros.
 * decisions: { training, hobby, travel, party, acceptNationalCall }
 */
export function simulateSeason(state, decisions = {}) {
  const rng = state.rng;
  const feed = [];
  const push = (text, type = 'normal') => feed.push({ text, type });

  // ---- 1. Entrenamiento: enfoque en un atributo concreto (o invisible) ----
  // Elegir el mismo atributo varios años seguidos da un bono creciente
  // (especializarte), cambiar de foco reinicia la racha (versatilidad).
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

    // Especialización sostenida: rara vez, el techo mismo sube un punto.
    if (newCount >= 4 && (state.player.potentialNudges || 0) < 3 && rng.chance(0.06)) {
      state.player.potential = Math.min(99, state.player.potential + 1);
      state.player.potentialNudges = (state.player.potentialNudges || 0) + 1;
      push(`Años de trabajo en ${ATTR_LABELS[focus]} rinden frutos: superas tus propios límites y tu techo como jugador crece.`, 'rare');
    }
  }

  // ---- 1.5 Rueda de prensa (si la UI la resolvió antes de llamar) ----
  if (decisions.pressQuestion && decisions.pressAnswerIndex != null) {
    const opt = decisions.pressQuestion.options[decisions.pressAnswerIndex];
    if (opt) {
      applyDelta(state, { moraleD: opt.moraleD, famedD: opt.famedD });
      state.personalLife.reputation = clamp(state.personalLife.reputation + (opt.pressD || 0) / 2);
      if (opt.loyaltySignal) state.rareTracker.signal('humilityStreak');
      push(`Rueda de prensa: "${decisions.pressQuestion.q}" → "${opt.label}"`, 'event');
    }
  }

  // ---- 2. Ocio: hobby y vacaciones ----
  if (decisions.hobby && HOBBIES[decisions.hobby]) {
    HOBBIES[decisions.hobby].apply(state);
    push(`Este año dedicas tiempo libre a: ${HOBBIES[decisions.hobby].label}.`);
  }
  if (decisions.travel && TRAVEL_OPTIONS[decisions.travel]) {
    const msg = TRAVEL_OPTIONS[decisions.travel].apply(state, rng);
    push(`Vacaciones: ${TRAVEL_OPTIONS[decisions.travel].label}.`);
    if (msg) push(msg, 'negative');
  }

  // ---- 3. Fiestas / vicios ----
  for (const m of partyDecision(state, rng, decisions.party || 'ninguna')) push(m, 'negative');
  for (const m of gamblingDecision(state, rng, decisions.gambling || 'no')) push(m, 'negative');
  for (const m of viceSpiralCheck(state, rng)) push(m, m.includes('Caída Libre') || m.includes('redención') ? 'rare' : 'negative');
  const illegal = illegalBettingEvent(state, rng);
  if (illegal) {
    push(illegal, 'rare');
    state.retired = true;
    state.retirementReason = 'expulsado';
  }

  // ---- 4. Vida personal: familia y pareja ----
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

  // ---- 5. Temporada de club ----
  if (!state.retired) {
    const leagueSystem = getLeagueSystem(state, state.club.countryCode);
    const division = leagueSystem.divisions[state.club.division] || leagueSystem.divisions[0];
    const numClubs = division.clubs.length;
    const matchesInSeason = Math.max(10, (numClubs - 1) * 2);
    const rivalPool = division.clubs.filter((c) => c.id !== state.club.id);
    const seasonStats = { matches: 0, goals: 0, assists: 0, yellow: 0, red: 0, ratings: [] };
    let weeksOut = Math.ceil((state.suspensionWeeks || 0));
    state.suspensionWeeks = 0;

    for (let m = 0; m < matchesInSeason; m++) {
      if (weeksOut > 0) {
        weeksOut -= 2;
        continue;
      }
      const isLateSeason = m >= matchesInSeason - 3;
      const opp = rng.pick(rivalPool.length ? rivalPool : division.clubs);
      const matchCtx = {
        highPressure: isLateSeason && rng.chance(0.45),
        competition: leagueSystem.leagueName,
        fatigue: Math.min(1, m / matchesInSeason),
      };
      const result = simulateMatch(state.player, state.club.rating, opp.rating, rng, matchCtx, state.rareTracker);

      seasonStats.matches++;
      seasonStats.goals += result.goals;
      seasonStats.assists += result.assists;
      seasonStats.ratings.push(result.matchRating);
      if (result.yellow) seasonStats.yellow++;
      if (result.red) seasonStats.red++;
      state.player.recentRatings = (state.player.recentRatings || []).concat(result.matchRating).slice(-10);

      if (result.inZona) {
        state.rareTracker.legendaryNights++;
        push(
          `🌟 NOCHE DE LEYENDA: ${result.events[0]?.text || 'entras en La Zona y el partido es completamente tuyo.'}`,
          'rare'
        );
      } else {
        for (const ev of result.events) push(ev.text, 'event');
      }

      if (result.missedPenalty && state.rareTracker.canStartNew() && !state.rareTracker.hasHad('LA_MALDICION')) {
        state.rareTracker.start('LA_MALDICION', state.year);
        state.rareTracker.signal('pressureFailures');
        push('Fallas un penal decisivo en un partido de máxima presión. La Maldición ha comenzado.', 'rare');
      }

      if (result.injury) {
        weeksOut = result.injury.weeksOut;
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
    }

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

  // ---- 6. Selección nacional ----
  if (!state.retired) {
    // La oportunidad (si la hay) se resuelve UNA sola vez, en la UI, antes de
    // llamar a simulateSeason (ver rollNationalizationOpportunity), y se pasa
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

  // ---- 6.5 Fidelidad al club: una señal por año, no por oferta rechazada ----
  if (!state.transferredThisYear) {
    state.rareTracker.profile.seasonsAtCurrentClub = (state.rareTracker.profile.seasonsAtCurrentClub || 0) + 1;
  }
  if (state.bigOfferRejectedThisYear) {
    state.rareTracker.signal('rejectedBigOffers');
  }
  state.transferredThisYear = false;
  state.bigOfferRejectedThisYear = false;

  // ---- 7. Crecimiento y envejecimiento ----
  const attrsBefore = { ...state.player.attrs };
  growAttributes(state.player, rng, trainingBonus);
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

  // ---- 8. Estados raros: resolución anual + chequeo ----
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

  // ---- 9. Finanzas ----
  payYearlySalary(state);
  state.peakMoney = Math.max(state.peakMoney, state.money);

  // ---- 10. Retiro automático por edad límite ----
  if (state.player.age >= RETIREMENT_AGE_HARD) {
    state.retired = true;
    state.retirementReason = state.retirementReason || 'edad';
  }

  // ---- 11. Nuevas ofertas de mercado para el próximo año ----
  state.currentOffers = state.retired ? [] : generateOffers(state);

  for (const f of feed) {
    state.feed.push({ year: state.year, age: state.player.age, worldYear: state.worldYearStart + state.year - 1, type: f.type, text: f.text });
  }

  return feed;
}
