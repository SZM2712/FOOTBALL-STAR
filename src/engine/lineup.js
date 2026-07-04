import { randomPersonName } from '../data/names.js';

// Formación fija 1-4-4-2 para los titulares, más un banco de 5 suplentes
// (1 arquero + 4 jugadores de campo): alcanza para tener nombres inventados
// creíbles por equipo sin necesidad de modelar tácticas reales.
const STARTER_FORMATION = [
  ['POR', 1],
  ['DEF', 4],
  ['MED', 4],
  ['DEL', 2],
];
const BENCH_FORMATION = [
  ['POR', 1],
  ['DEF', 2],
  ['MED', 1],
  ['DEL', 1],
];

/**
 * Inventa la identidad fija (nombre + posición + si es titular o suplente)
 * del plantel de un club: se genera UNA sola vez por club (ver
 * getClubSquad en season.js, que la cachea) y no vuelve a cambiar, para que
 * el mismo club siempre tenga a los mismos jugadores partido a partido,
 * temporada a temporada.
 */
export function generateSquad(rng, confed) {
  const build = (formation, starter) => {
    const slots = [];
    for (const [position, count] of formation) {
      for (let i = 0; i < count; i++) slots.push(position);
    }
    return slots.map((position) => ({ name: randomPersonName(rng, confed), position, starter }));
  };
  return [...build(STARTER_FORMATION, true), ...build(BENCH_FORMATION, false)];
}

function baseRatingFor(position, teamGoals, oppGoals, rng) {
  const gd = teamGoals - oppGoals;
  let base = 6.0 + gd * 0.15;
  if (position === 'POR' || position === 'DEF') base -= oppGoals * 0.12;
  if (position === 'MED' || position === 'DEL') base += teamGoals * 0.05;
  base += rng.gaussian(0, 0.45);
  return Math.max(4.0, Math.min(9.3, Math.round(base * 10) / 10));
}

const POSITION_ORDER = { POR: 0, DEF: 1, MED: 2, DEL: 3 };

/**
 * A partir del plantel fijo de un club (su identidad no cambia), calcula la
 * calificación/goles/asistencias/cambios de ESTE partido puntual, coherentes
 * con el marcador real (el equipo que gana tiende a calificar mejor, y los
 * goles/asistencias se reparten entre mediocampistas/delanteros, pesados por
 * los minutos que cada uno jugó). Simula además 0-3 cambios de banco por
 * partido, con el minuto en que entraron/salieron.
 *
 * Si se pasa `userEntry`, reemplaza al jugador de esa posición por sus
 * stats reales (el jugador que controla el usuario no se duplica, y
 * siempre es el mismo puesto del plantel el que se superpone con él). Si
 * `userEntry.subOffMinute` está definido, el usuario arranca titular y sale
 * sustituido a ese minuto. Si `userEntry.subOnMinute` está definido, el
 * usuario arranca en el banco y entra de cambio a ese minuto, reemplazando
 * a un titular como cualquier otro suplente.
 */
export function ratePerformance({ squad, rng, teamGoals, oppGoals, ownGoals = 0, ownAssists = 0, userEntry = null }) {
  const starters = squad.filter((p) => p.starter);
  const bench = squad.filter((p) => !p.starter);

  const lineup = starters.map((p) => ({
    name: p.name,
    position: p.position,
    rating: baseRatingFor(p.position, teamGoals, oppGoals, rng),
    goals: 0,
    assists: 0,
    minutesFraction: 1,
  }));

  let userIdx = -1;
  if (userEntry && !userEntry.subOnMinute) {
    const idx = lineup.findIndex((p) => p.position === userEntry.position);
    userIdx = idx >= 0 ? idx : 0;
    lineup[userIdx] = {
      name: userEntry.name,
      position: userEntry.position,
      rating: userEntry.rating,
      goals: userEntry.goals,
      assists: userEntry.assists,
      minutesFraction: userEntry.subOffMinute ? userEntry.subOffMinute / 90 : 1,
      isUser: true,
    };
  }

  // ---- Cambios: hasta 3 por equipo, más el del usuario si corresponde ----
  let benchIdx = 0;
  const subbedOffIdx = new Set();
  function substitute(outIdx, minute, replacement = null) {
    if (!replacement && benchIdx >= bench.length) return;
    const sub = replacement || bench[benchIdx++];
    lineup[outIdx].subOff = true;
    lineup[outIdx].subOffMinute = minute;
    lineup[outIdx].minutesFraction = minute / 90;
    lineup.push({
      name: sub.name,
      position: sub.position,
      rating:
        sub.rating != null ? sub.rating : Math.max(5.5, Math.min(8.0, 6.0 + (baseRatingFor(sub.position, teamGoals, oppGoals, rng) - 6.0) * 0.5)),
      goals: sub.goals || 0,
      assists: sub.assists || 0,
      isUser: !!sub.isUser,
      subOn: true,
      subOnMinute: minute,
      replaced: lineup[outIdx].name,
      minutesFraction: (90 - minute) / 90,
    });
    subbedOffIdx.add(outIdx);
    return lineup.length - 1;
  }

  if (userEntry && userEntry.subOffMinute) {
    substitute(userIdx, userEntry.subOffMinute);
  } else if (userEntry && userEntry.subOnMinute) {
    // El usuario arranca en el banco: sale el titular peor calificado (que
    // no sea el arquero) y entra el usuario en su lugar, al minuto ya
    // decidido en season.js (rollBenchChallenge + resolución en playNextMatch).
    const eligible = lineup.map((p, idx) => ({ idx, p })).filter(({ p }) => p.position !== 'POR');
    if (eligible.length) {
      eligible.sort((a, b) => a.p.rating - b.p.rating);
      userIdx = substitute(eligible[0].idx, userEntry.subOnMinute, {
        name: userEntry.name,
        position: userEntry.position,
        rating: userEntry.rating,
        goals: userEntry.goals,
        assists: userEntry.assists,
        isUser: true,
      });
    }
  }

  let plannedSubs = 0;
  for (let i = 0; i < 3; i++) {
    if (!rng.chance(0.5)) break;
    plannedSubs++;
  }
  for (let i = 0; i < plannedSubs; i++) {
    const eligible = lineup
      .map((p, idx) => ({ idx, p }))
      .filter(({ idx, p }) => idx < starters.length && p.position !== 'POR' && idx !== userIdx && !subbedOffIdx.has(idx));
    if (!eligible.length || benchIdx >= bench.length) break;
    // Se prioriza sacar al que peor viene calificando (cambio táctico/por rendimiento).
    eligible.sort((a, b) => a.p.rating - b.p.rating);
    const pick = eligible[Math.min(eligible.length - 1, rng.int(0, 1))];
    const minute = Math.max(46, Math.min(89, 46 + i * 13 + rng.int(-6, 6)));
    substitute(pick.idx, minute);
  }

  // ---- Reparto de goles/asistencias, pesado por minutos jugados ----
  const attackers = lineup
    .map((p, i) => ({ i, w: (p.position === 'DEL' ? 3 : p.position === 'MED' ? 1.4 : 0.25) * p.minutesFraction }))
    .filter((x) => x.w > 0 && x.i !== userIdx);
  const totalWeight = attackers.reduce((s, x) => s + x.w, 0);
  function pickWeighted() {
    let r = rng.float() * totalWeight;
    for (const x of attackers) {
      if (r < x.w) return x.i;
      r -= x.w;
    }
    return attackers[attackers.length - 1].i;
  }

  const remainingGoals = Math.max(0, teamGoals - ownGoals);
  const assistedGoals = Math.round(teamGoals * (0.6 + rng.float() * 0.25));
  const remainingAssists = Math.max(0, assistedGoals - ownAssists);

  for (let g = 0; g < remainingGoals && attackers.length; g++) {
    const idx = pickWeighted();
    lineup[idx].goals++;
    lineup[idx].rating = Math.min(9.8, lineup[idx].rating + 0.5);
  }
  for (let a = 0; a < remainingAssists && attackers.length; a++) {
    const idx = pickWeighted();
    lineup[idx].assists++;
    lineup[idx].rating = Math.min(9.8, lineup[idx].rating + 0.3);
  }

  for (const p of lineup) delete p.minutesFraction;
  // Orden de formación (arquero a delantero), no por calificación: los
  // titulares primero en su orden natural, los suplentes al final en el
  // orden en que entraron.
  lineup.sort((a, b) => {
    if (!!a.subOn !== !!b.subOn) return a.subOn ? 1 : -1;
    if (a.subOn && b.subOn) return a.subOnMinute - b.subOnMinute;
    return POSITION_ORDER[a.position] - POSITION_ORDER[b.position];
  });
  return lineup;
}
