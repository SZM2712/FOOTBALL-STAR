import { overallRating } from './player.js';
import { laZonaProbability } from './rareStates.js';
import { rollMatchEvents, rollInjury } from './events.js';

function poissonSample(rng, lambda) {
  if (lambda <= 0) return 0;
  const L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= rng.float();
  } while (p > L && k < 12);
  return k - 1;
}

const GOAL_BIAS = { DEL: 0.85, MED: 0.32, DEF: 0.08, POR: 0.01 };
const ASSIST_BIAS = { DEL: 0.28, MED: 0.6, DEF: 0.22, POR: 0.04 };

/**
 * Simula un partido de club/selección. matchCtx: { highPressure, competition, isFinal }
 * Devuelve un resultado completo con estadísticas del jugador y eventos narrativos.
 */
export function simulateMatch(player, teamRating, oppRating, rng, matchCtx = {}, tracker = null) {
  const diff = teamRating - oppRating;
  const teamGoals = Math.max(0, poissonSample(rng, 1.35 + diff / 22));
  const oppGoals = Math.max(0, poissonSample(rng, 1.35 - diff / 22));

  const rating = overallRating(player);
  const relativeQuality = Math.max(-0.5, Math.min(0.9, (rating - teamRating) / 35));

  const zonaP = laZonaProbability(player, matchCtx, tracker);
  const inZona = rng.chance(zonaP);
  if (inZona && tracker?.guaranteedZona) {
    tracker.guaranteedZona = false; // la garantía del pity system se consume una sola vez
  }

  const formFactor = 0.55 + (player.form / 100) * 0.75;
  const moraleFactor = 0.85 + (player.morale / 100) * 0.3;
  let effectiveness = formFactor * moraleFactor * (1 + relativeQuality) * (inZona ? 1.4 : 1);
  effectiveness = Math.max(0.15, effectiveness);

  const goalLambda = teamGoals * (GOAL_BIAS[player.position] || 0.1) * effectiveness * 0.55;
  const assistLambda = teamGoals * (ASSIST_BIAS[player.position] || 0.1) * effectiveness * 0.55;

  const goals = Math.min(teamGoals + 1, poissonSample(rng, goalLambda));
  const assists = Math.min(4, poissonSample(rng, assistLambda));

  let missedPenalty = false;
  if (matchCtx.isFinal && matchCtx.penaltyShootout && rng.chance(0.18)) {
    missedPenalty = true;
  }

  // rating de partido 1-10
  let base = 6.0;
  base += (teamGoals - oppGoals) * 0.18;
  base += goals * 0.9;
  base += assists * 0.55;
  base += relativeQuality * 1.5;
  if (inZona) base += 1.6;
  if (missedPenalty) base -= 1.8;
  base += rng.gaussian(0, 0.5);
  const matchRating = Math.max(3.2, Math.min(10, Math.round(base * 10) / 10));

  const fatigue = matchCtx.fatigue || 0;
  const injury = rollInjury(player, rng, fatigue);

  const events = rollMatchEvents(player, rng, {
    goals,
    assists,
    highPressure: !!matchCtx.highPressure,
    position: player.position,
    goodMatch: matchRating >= 7.5,
    missedPenalty,
  });

  return {
    teamGoals,
    oppGoals,
    result: teamGoals > oppGoals ? 'win' : teamGoals === oppGoals ? 'draw' : 'loss',
    goals,
    assists,
    matchRating,
    inZona,
    missedPenalty,
    injury,
    events,
    yellow: rng.chance(0.16),
    red: rng.chance(0.012),
  };
}
