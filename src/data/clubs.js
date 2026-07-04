import { randomClubName } from './names.js';
import { REAL_CLUB_TWISTS } from './realClubNames.js';

// Cada tier define cuántas divisiones tiene el país, cuántos clubes por
// división, y el rango de rating/presupuesto de sus clubes. Todo ficticio.
const TIER_CONFIG = {
  1: { divisions: 2, clubsPerDivision: [18, 16], ratingRange: [[72, 94], [58, 74]], budgetBase: 180 },
  2: { divisions: 2, clubsPerDivision: [16, 14], ratingRange: [[62, 84], [48, 64]], budgetBase: 60 },
  3: { divisions: 1, clubsPerDivision: [14], ratingRange: [[52, 72]], budgetBase: 20 },
  4: { divisions: 1, clubsPerDivision: [12], ratingRange: [[40, 60]], budgetBase: 6 },
  5: { divisions: 1, clubsPerDivision: [10], ratingRange: [[26, 46]], budgetBase: 1.2 },
  6: { divisions: 1, clubsPerDivision: [8], ratingRange: [[14, 30]], budgetBase: 0.2 },
};

const DIVISION_LABEL = ['Primera División', 'Segunda División', 'Tercera División'];

export function generateLeagueSystem(country, rng) {
  const cfg = TIER_CONFIG[country.tier];
  const divisions = [];
  for (let d = 0; d < cfg.divisions; d++) {
    const [lo, hi] = cfg.ratingRange[d];
    const count = cfg.clubsPerDivision[d];
    const clubs = [];
    for (let i = 0; i < count; i++) {
      const t = 1 - i / (count - 1 || 1); // 1 = mejor equipo, 0 = peor
      const rating = Math.round(lo + (hi - lo) * t + rng.range(-3, 3));
      const budget = Math.max(0.05, cfg.budgetBase * (0.25 + t * 1.5) * rng.range(0.7, 1.3));
      clubs.push({
        id: `${country.code}-${d}-${i}`,
        name: randomClubName(rng, country.confed),
        countryCode: country.code,
        division: d,
        rating: Math.max(10, Math.min(96, rating)),
        budgetM: Math.round(budget * 10) / 10,
        prestige: Math.round(t * 100),
      });
    }
    // En la máxima división de los países más "reconocibles", los clubes
    // de mayor prestigio toman un nombre inspirado en un club real célebre
    // (con una pequeña variación de letras, nunca el nombre exacto).
    if (d === 0 && REAL_CLUB_TWISTS[country.code]) {
      const realNames = rng.shuffle(REAL_CLUB_TWISTS[country.code]);
      for (let i = 0; i < Math.min(realNames.length, clubs.length); i++) {
        clubs[i].name = realNames[i];
      }
    }
    divisions.push({
      level: d,
      label: DIVISION_LABEL[d] || `División ${d + 1}`,
      clubs,
    });
  }
  return {
    countryCode: country.code,
    leagueName:
      country.tier >= 5
        ? `Liga Amateur de ${country.name}`
        : `Liga Nacional de ${country.name}`,
    divisions,
  };
}

/** Copas continentales de clubes, ficticias, una por confederación, con
 * un segundo nivel para las ligas medianas/pequeñas. */
export const CLUB_CONTINENTAL_CUPS = {
  UEFA: { top: 'Copa Estelar de Europa', second: 'Copa Aurora Europea' },
  CONMEBOL: { top: 'Copa Suprema Sudamericana', second: 'Copa Plata Sudamericana' },
  CONCACAF: { top: 'Copa Águila Concacaf', second: 'Copa Alianza Concacaf' },
  CAF: { top: 'Copa Baobab Africana', second: 'Copa Sabana Africana' },
  AFC: { top: 'Copa Oriente de Asia', second: 'Copa Dragón Asiática' },
  OFC: { top: 'Copa Pacífico de Oceanía', second: 'Copa Pacífico de Oceanía' },
};

export const CLUB_WORLD_CUP_NAME = 'Copa Intercontinental de Clubes';
export const BALLON_NAME = 'Balón de Platino';
export const GOLDEN_BOOT_NAME = 'Bota Dorada';

export function bestClubsFor(leagueSystem, n = 4) {
  return leagueSystem.divisions[0].clubs.slice(0, n);
}
