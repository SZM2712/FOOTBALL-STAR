import { overallRating } from './player.js';
import { laZonaProbability } from './rareStates.js';
import { rollMatchEvents, rollInjury } from './events.js';

export function poissonSample(rng, lambda) {
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

/** Resultado de un partido a nivel de equipo, sin estadísticas individuales
 * (usado por el modo Entrenador, donde no hay un jugador que controlar). */
export function simulateTeamMatch(teamRating, oppRating, rng) {
  const diff = teamRating - oppRating;
  const teamGoals = Math.max(0, poissonSample(rng, 1.35 + diff / 22));
  const oppGoals = Math.max(0, poissonSample(rng, 1.35 - diff / 22));
  return {
    teamGoals,
    oppGoals,
    result: teamGoals > oppGoals ? 'win' : teamGoals === oppGoals ? 'draw' : 'loss',
  };
}

const GOAL_BIAS = { DEL: 0.85, MED: 0.32, DEF: 0.08, POR: 0.01 };
const ASSIST_BIAS = { DEL: 0.28, MED: 0.6, DEF: 0.22, POR: 0.04 };

// ---------------------------------------------------------------------------
// Penales: una decisión real, no un dado ciego. La chance de que TE toque
// patear depende de tu posición; una vez que te toca, vos elegís cómo.
// ---------------------------------------------------------------------------
const PENALTY_OPPORTUNITY_CHANCE = { DEL: 0.11, MED: 0.06, DEF: 0.02, POR: 0 };

export function rollPenaltyOpportunity(player, rng) {
  const p = PENALTY_OPPORTUNITY_CHANCE[player.position] || 0;
  return rng.chance(p);
}

export const PENALTY_CHOICES = {
  angulo: { label: 'Ángulo superior — arriesgado, casi imparable si entra', baseScore: 0.6, missBias: 0.7 },
  medio: { label: 'Al medio, con potencia', baseScore: 0.72, missBias: 0.15 },
  esquinaBaja: { label: 'Esquina baja ajustada — el más seguro', baseScore: 0.8, missBias: 0.25 },
  vaselina: { label: 'Picadita / vaselina', baseScore: 0.58, missBias: 0.35, mentalityWeighted: true },
  cederlo: { label: 'Cedérselo a un compañero', baseScore: 0.75, missBias: 0.5, delegate: true },
};

/** Resuelve un penal ya concedido. outcome: 'gol' | 'atajado' | 'errado'.
 * Si delegate=true (se lo cede a un compañero), no cuenta como gol/atajada
 * personal: solo afecta el marcador del equipo. timingQuality (0-1, default
 * 0.5 = neutro) viene del minijuego de tiempo: acertar el timing suma sobre
 * la elección de dónde patear, fallarlo resta. */
export function resolvePenalty(player, choiceId, rng, timingQuality = 0.5) {
  const choice = PENALTY_CHOICES[choiceId] || PENALTY_CHOICES.medio;
  let scoreProb = choice.baseScore;
  if (!choice.delegate) {
    scoreProb += (player.attrs.sho - 60) / 300;
    scoreProb += (player.attrs.men - 60) / 350;
    if (choice.mentalityWeighted) scoreProb += (player.attrs.men - 60) / 200;
    scoreProb += (timingQuality - 0.5) * 0.3;
  }
  scoreProb = Math.max(0.25, Math.min(0.93, scoreProb));

  const scored = rng.chance(scoreProb);
  if (scored) return { scored: true, delegate: !!choice.delegate, outcome: 'gol' };
  const missed = rng.chance(choice.missBias);
  return { scored: false, delegate: !!choice.delegate, outcome: missed ? 'errado' : 'atajado' };
}

// ---------------------------------------------------------------------------
// Grandes ocasiones de gol en juego (no penales): la chance de que se te dé
// una depende de tu posición; una vez que aparece, un minijuego de tiempo
// (afuera, en la UI) decide qué tan bien la definís.
// ---------------------------------------------------------------------------
const BIG_CHANCE_OPPORTUNITY_CHANCE = { DEL: 0.24, MED: 0.14, DEF: 0.05, POR: 0.01 };

export function rollBigChanceOpportunity(player, rng) {
  const p = BIG_CHANCE_OPPORTUNITY_CHANCE[player.position] || 0;
  return rng.chance(p);
}

/** Resuelve una gran ocasión ya concedida. shotQuality (0-1) viene del
 * minijuego de tiempo: 0.5 es un remate promedio, 1 es timing perfecto, 0 es
 * pifiarla por completo. outcome: 'gol' | 'atajado' | 'errado'. */
export function resolveBigChance(player, shotQuality, rng) {
  let scoreProb = 0.22 + shotQuality * 0.5;
  scoreProb += (player.attrs.sho - 60) / 260;
  scoreProb += (player.attrs.dri - 60) / 400;
  scoreProb = Math.max(0.06, Math.min(0.92, scoreProb));

  const scored = rng.chance(scoreProb);
  if (scored) return { scored: true, outcome: 'gol' };
  const wide = rng.chance(Math.max(0.15, 0.55 - shotQuality * 0.3));
  return { scored: false, outcome: wide ? 'errado' : 'atajado' };
}

// ---------------------------------------------------------------------------
// Tarjetas rojas: merecidas vs. injustas, con consecuencias distintas.
// ---------------------------------------------------------------------------
export function rollRedCardType(rng) {
  return rng.chance(0.58) ? 'merecida' : 'injusta';
}

/**
 * Simula un partido de club/selección. matchCtx: { highPressure, competition,
 * isFinal, benchFactor, readinessBonus }. benchFactor (0-1, default 1): si
 * entrás de cambio, la fracción de minutos que jugaste, así tus chances de
 * gol/asistencia/tarjeta/lesión se ajustan a los minutos reales en cancha.
 * readinessBonus: cómo te preparaste mentalmente para tu chance desde el
 * banco (ver rollBenchChallenge en season.js), sube o baja tu efectividad.
 * penaltyChoice: id de PENALTY_CHOICES si esta jugada incluye un penal a favor.
 * penaltyTimingQuality: 0-1 del minijuego de tiempo del penal (0.5=neutro).
 * bigChanceQuality: si rollBigChanceOpportunity dio true, 0-1 del minijuego
 * de tiempo del remate (viene de la UI, no es un dado ciego).
 * Devuelve un resultado completo con estadísticas del jugador y eventos narrativos.
 */
export function simulateMatch(
  player,
  teamRating,
  oppRating,
  rng,
  matchCtx = {},
  tracker = null,
  penaltyChoice = null,
  penaltyTimingQuality = 0.5,
  bigChanceQuality = null
) {
  const diff = teamRating - oppRating;
  let teamGoals = Math.max(0, poissonSample(rng, 1.35 + diff / 22));
  const oppGoals = Math.max(0, poissonSample(rng, 1.35 - diff / 22));

  const benchFactor = matchCtx.benchFactor ?? 1;
  const readinessBonus = matchCtx.readinessBonus || 0;

  const rating = overallRating(player);
  const relativeQuality = Math.max(-0.5, Math.min(0.9, (rating - teamRating) / 35));

  const zonaP = laZonaProbability(player, matchCtx, tracker);
  const inZona = rng.chance(zonaP);
  if (inZona && tracker?.guaranteedZona) {
    tracker.guaranteedZona = false; // la garantía del pity system se consume una sola vez
  }

  const formFactor = 0.55 + (player.form / 100) * 0.75;
  const moraleFactor = 0.85 + (player.morale / 100) * 0.3;
  let effectiveness = formFactor * moraleFactor * (1 + relativeQuality) * (inZona ? 1.4 : 1) * (1 + readinessBonus / 150);
  effectiveness = Math.max(0.15, effectiveness);

  const goalLambda = teamGoals * (GOAL_BIAS[player.position] || 0.1) * effectiveness * 0.55 * benchFactor;
  const assistLambda = teamGoals * (ASSIST_BIAS[player.position] || 0.1) * effectiveness * 0.55 * benchFactor;

  let goals = Math.min(teamGoals + 1, poissonSample(rng, goalLambda));
  const assists = Math.min(4, poissonSample(rng, assistLambda));

  let penalty = null;
  if (penaltyChoice) {
    penalty = resolvePenalty(player, penaltyChoice, rng, penaltyTimingQuality);
    if (penalty.scored) {
      teamGoals += 1;
      if (!penalty.delegate) goals += 1;
    }
  }

  let bigChance = null;
  if (bigChanceQuality != null) {
    bigChance = resolveBigChance(player, bigChanceQuality, rng);
    if (bigChance.scored) {
      teamGoals += 1;
      goals += 1;
    }
  }

  // missedPenalty (tanda de penales de una final) dispara La Maldición de
  // forma garantizada: ya es un evento raro en sí (llegar a una final).
  // pressurePenaltyMiss (penal errado en un partido de presión normal) es
  // mucho más frecuente, así que su chance de disparar La Maldición se
  // pondera aparte, en season.js, para no inflar ese estado raro.
  let missedPenalty = false;
  if (matchCtx.isFinal && matchCtx.penaltyShootout && rng.chance(0.18)) {
    missedPenalty = true;
  }
  const pressurePenaltyMiss = !!(penalty && !penalty.scored && !penalty.delegate && matchCtx.highPressure);
  if (pressurePenaltyMiss) {
    missedPenalty = true;
  }

  const result = teamGoals > oppGoals ? 'win' : teamGoals === oppGoals ? 'draw' : 'loss';

  // rating de partido 1-10
  let base = 6.0;
  base += (teamGoals - oppGoals) * 0.18;
  base += goals * 0.9;
  base += assists * 0.55;
  base += relativeQuality * 1.5;
  if (inZona) base += 1.6;
  if (missedPenalty) base -= 1.8;
  if (bigChance && !bigChance.scored) base -= 0.5;
  base += rng.gaussian(0, 0.5);
  const matchRating = Math.max(3.2, Math.min(10, Math.round(base * 10) / 10));

  const fatigue = (matchCtx.fatigue || 0) * benchFactor;
  const injury = rollInjury(player, rng, fatigue);

  const events = rollMatchEvents(player, rng, {
    goals,
    assists,
    highPressure: !!matchCtx.highPressure,
    position: player.position,
    goodMatch: matchRating >= 7.5,
    missedPenalty,
  });

  const red = rng.chance(0.012 * benchFactor);
  const redCardType = red ? rollRedCardType(rng) : null;

  return {
    teamGoals,
    oppGoals,
    result,
    goals,
    assists,
    matchRating,
    inZona,
    penalty,
    bigChance,
    missedPenalty,
    pressurePenaltyMiss,
    injury,
    events,
    yellow: rng.chance(0.16 * benchFactor),
    red,
    redCardType,
  };
}
