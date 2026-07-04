import { randomPersonName } from '../data/names.js';

// Formación fija 1-4-4-2: alcanza para tener 11 nombres inventados por
// equipo con una distribución de posiciones creíble, sin necesidad de
// modelar tácticas reales.
const FORMATION = [
  ['POR', 1],
  ['DEF', 4],
  ['MED', 4],
  ['DEL', 2],
];

function baseRatingFor(position, teamGoals, oppGoals, rng) {
  const gd = teamGoals - oppGoals;
  let base = 6.0 + gd * 0.15;
  if (position === 'POR' || position === 'DEF') base -= oppGoals * 0.12;
  if (position === 'MED' || position === 'DEL') base += teamGoals * 0.05;
  base += rng.gaussian(0, 0.45);
  return Math.max(4.0, Math.min(9.3, Math.round(base * 10) / 10));
}

/**
 * Inventa una alineación de 11 jugadores para un club en un partido puntual,
 * con calificación, goles y asistencias coherentes con el marcador real
 * (el equipo que gana tiende a calificar mejor, y los goles/asistencias del
 * equipo se reparten entre mediocampistas/delanteros). Si se pasa
 * `userEntry`, reemplaza a un jugador de su misma posición por sus stats
 * reales (el jugador que controla el usuario no se duplica).
 */
export function generateMatchLineup({ rng, confed, teamGoals, oppGoals, ownGoals = 0, ownAssists = 0, userEntry = null }) {
  const slots = [];
  for (const [position, count] of FORMATION) {
    for (let i = 0; i < count; i++) slots.push(position);
  }

  const lineup = slots.map((position) => ({
    name: randomPersonName(rng, confed),
    position,
    rating: baseRatingFor(position, teamGoals, oppGoals, rng),
    goals: 0,
    assists: 0,
  }));

  // El jugador real ocupa su lugar ANTES de repartir goles/asistencias
  // inventados, para que el resto del equipo complete exactamente lo que
  // falta del marcador (y no se pisen los goles de un suplente inventado).
  let userIdx = -1;
  if (userEntry) {
    const idx = lineup.findIndex((p) => p.position === userEntry.position);
    userIdx = idx >= 0 ? idx : 0;
    lineup[userIdx] = {
      name: userEntry.name,
      position: userEntry.position,
      rating: userEntry.rating,
      goals: userEntry.goals,
      assists: userEntry.assists,
      isUser: true,
    };
  }

  const attackers = lineup
    .map((p, i) => ({ i, w: p.position === 'DEL' ? 3 : p.position === 'MED' ? 1.4 : 0.25 }))
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

  lineup.sort((a, b) => b.rating - a.rating);
  return lineup;
}
