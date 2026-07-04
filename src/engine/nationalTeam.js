import { COUNTRY_BY_CODE, topRivals } from '../data/countries.js';
import { simulateMatch } from './match.js';
import { overallRating } from './player.js';

export const CONTINENTAL_CUP_NAME = {
  UEFA: 'Eurocopa',
  CONMEBOL: 'Copa América',
  CONCACAF: 'Copa Oro',
  CAF: 'Copa Africana de Naciones',
  AFC: 'Copa Asiática',
  OFC: 'Copa de Naciones de la OFC',
};

const WC_THRESHOLD = { UEFA: 58, CONMEBOL: 66, CONCACAF: 55, CAF: 56, AFC: 57, OFC: 82 };
const CONT_THRESHOLD = { UEFA: 48, CONMEBOL: 38, CONCACAF: 40, CAF: 44, AFC: 44, OFC: 52 };

export function isWorldCupYear(worldYear) {
  return worldYear % 4 === 2;
}
export function isContinentalYear(worldYear) {
  return worldYear % 4 === 0;
}

function logistic(x) {
  return 1 / (1 + Math.exp(-x));
}

function qualifyProbability(nt, confed, thresholdTable, playerBoost) {
  const threshold = thresholdTable[confed] ?? 55;
  return Math.max(0.01, Math.min(0.97, logistic((nt + playerBoost - threshold) / 11)));
}

export function attemptQualification(state, kind) {
  const country = COUNTRY_BY_CODE[state.nationality];
  const nt = country.nt;
  const rating = overallRating(state.player);
  const playerBoost = Math.max(0, (rating - nt) / 6);
  const table = kind === 'world' ? WC_THRESHOLD : CONT_THRESHOLD;
  const p = qualifyProbability(nt, country.confed, table, playerBoost);
  const qualified = state.rng.chance(p);
  const isEpic = qualified && country.tier >= 4;
  return { qualified, isEpic, probability: p, country };
}

const ROUND_SEQUENCE = ['Fase de grupos', 'Octavos de final', 'Cuartos de final', 'Semifinal', 'Final'];

/** Simula el recorrido del combinado nacional en un torneo, ronda a ronda,
 * usando al jugador como referencia individual (para stats/estados raros). */
export function simulateTournamentRun(state, kind, tournamentName) {
  const country = COUNTRY_BY_CODE[state.nationality];
  const rivals = topRivals(country.confed, country.code, 6);
  const feed = [];
  let round = 0;
  let eliminated = false;
  let champion = false;
  const playerStatsAgg = { goals: 0, assists: 0, matches: 0 };

  const difficultyStep = kind === 'world' ? 6 : 4;
  while (!eliminated && round < ROUND_SEQUENCE.length) {
    const roundName = ROUND_SEQUENCE[round];
    const isFinal = roundName === 'Final';
    const oppBase = rivals.length ? rivals[round % rivals.length].nt : 55;
    const oppRating = oppBase + round * difficultyStep * 0.5;
    const matchCtx = { highPressure: true, competition: tournamentName, isFinal, penaltyShootout: isFinal && state.rng.chance(0.3), fatigue: state.player.fatigueLevel || 0 };
    const result = simulateMatch(state.player, country.nt + Math.round((overallRating(state.player) - country.nt) / 3), oppRating, state.rng, matchCtx, state.rareTracker);

    playerStatsAgg.matches++;
    playerStatsAgg.goals += result.goals;
    playerStatsAgg.assists += result.assists;

    if (result.inZona) {
      state.rareTracker.legendaryNights++;
      feed.push(`🌟 NOCHE DE LEYENDA en ${roundName} de ${tournamentName}: ${state.player.name} entra en La Zona y decide el partido.`);
    }
    if (result.missedPenalty && state.rareTracker.canStartNew()) {
      state.rareTracker.start('LA_MALDICION', state.year);
      feed.push(`${state.player.name} falla el penal decisivo en la ${roundName} de ${tournamentName}. La Maldición ha comenzado.`);
    }
    for (const ev of result.events) feed.push(ev.text);

    if (result.result === 'loss' || (result.result === 'draw' && isFinal && !matchCtx.penaltyShootout)) {
      eliminated = true;
      feed.push(`${country.name} queda eliminada en ${roundName} de ${tournamentName}.`);
    } else if (isFinal) {
      champion = true;
      eliminated = true;
      feed.push(`🏆 ¡${country.name} es CAMPEÓN de ${tournamentName}! ${state.player.name} levanta el trofeo.`);
    } else {
      feed.push(`${country.name} avanza a la siguiente ronda de ${tournamentName} (${roundName}).`);
      round++;
    }
  }

  return { reachedRound: ROUND_SEQUENCE[Math.min(round, ROUND_SEQUENCE.length - 1)], champion, feed, playerStatsAgg };
}

/** Evento de ascendencia / nacionalización, disponible una sola vez antes del debut. */
export function rollNationalizationOpportunity(state) {
  const country = COUNTRY_BY_CODE[state.nationality];
  if (state.nationalTeam.debuted || state.nationalTeam.nationalizationUsed) return null;
  if (country.tier < 4) return null;
  if (!state.rng.chance(0.05)) return null;
  const candidates = Object.values(COUNTRY_BY_CODE).filter((c) => c.tier <= 2 && c.code !== country.code);
  const target = state.rng.pick(candidates);
  return { fromCountry: country, toCountry: target };
}

export function applyNationalization(state, targetCountryCode) {
  state.nationality = targetCountryCode;
  state.nationalTeam.nationalizationUsed = true;
  state.nationalTeam.originalNationality = state.player.originalCountryCode;
}
