import { overallRating } from './player.js';
import { isBankrupt } from './finance.js';
import { RARE_STATE_DEFS } from './rareStates.js';

export const LEGACY_TITLES = {
  GENERACIONAL: 'Leyenda Generacional',
  TALENTO_PERDIDO: 'El Talento que Pudo Ser',
  LEYENDA: 'Leyenda',
  CRACK: 'Crack',
  BUEN_PROFESIONAL: 'Buen Profesional',
  JORNALERO: 'Jornalero',
  PROMESA_FRUSTRADA: 'Promesa Frustrada',
  GLORIA_Y_RUINA: 'Gloria y Ruina',
  EXPULSADO: 'Expulsado del Fútbol',
};

function careerScore(state) {
  const career = state.stats.career;
  const seasons = state.stats.seasons;
  const avg = seasons.length ? seasons.reduce((s, se) => s + se.avgRating, 0) / seasons.length : 6;
  let score = 0;
  score += career.goals * 0.4 + career.assists * 0.25;
  score += state.trophies.length * 8;
  score += state.rareTracker.legendaryNights * 5;
  score += state.nationalTeam.caps * 0.3;
  score += (avg - 6) * 20;
  return Math.max(0, Math.round(score));
}

export function computeLegacy(state) {
  const rating = overallRating(state.player);

  if (state.retirementReason === 'expulsado') {
    return {
      title: LEGACY_TITLES.EXPULSADO,
      score: 0,
      narrative: 'Las apuestas ilegales terminaron con todo. Ni tu talento te salva de una sanción de por vida.',
    };
  }

  if (state.player.generational) {
    const fulfilled = rating >= state.player.potential - 6 && state.trophies.length >= 3;
    if (fulfilled) {
      return {
        title: LEGACY_TITLES.GENERACIONAL,
        score: careerScore(state) + 200,
        narrative:
          state.country.tier >= 5
            ? `Naciste Generacional en ${state.country.name}, un país sin tradición futbolística. Cumpliste cada expectativa y te convertiste en la historia más épica que ese país podrá contar jamás.`
            : 'Los medios te compararon con los más grandes desde los quince años. Cumpliste cada expectativa: eres la Leyenda Generacional de tu tiempo.',
      };
    }
    return {
      title: LEGACY_TITLES.TALENTO_PERDIDO,
      score: careerScore(state),
      narrative: 'Todos vieron el potencial. El potencial nunca vio la cancha. El final más trágico posible: pudiste ser el mejor de todos.',
    };
  }

  const score = careerScore(state);
  const bankrupt = isBankrupt(state, state.rng);

  let title;
  if (score >= 260) title = LEGACY_TITLES.LEYENDA;
  else if (score >= 160) title = LEGACY_TITLES.CRACK;
  else if (score >= 80) title = LEGACY_TITLES.BUEN_PROFESIONAL;
  else if (score >= 30) title = LEGACY_TITLES.JORNALERO;
  else title = LEGACY_TITLES.PROMESA_FRUSTRADA;

  if (bankrupt && score >= 80) {
    return {
      title: LEGACY_TITLES.GLORIA_Y_RUINA,
      baseTitle: title,
      score,
      narrative: 'Ganaste todo lo que el fútbol podía darte. La mala gestión de tu fortuna se llevó el resto. Gloria en la cancha, ruina fuera de ella.',
    };
  }

  return { title, score, narrative: narrativeForTitle(title) };
}

function narrativeForTitle(title) {
  switch (title) {
    case LEGACY_TITLES.LEYENDA:
      return 'Tu nombre quedará en las conversaciones de bar durante generaciones.';
    case LEGACY_TITLES.CRACK:
      return 'Una carrera sólida y admirada, aunque la cima absoluta se te resistió.';
    case LEGACY_TITLES.BUEN_PROFESIONAL:
      return 'Viviste del fútbol con dignidad. No todos pueden decir lo mismo.';
    case LEGACY_TITLES.JORNALERO:
      return 'Nunca fuiste una estrella, pero cada club que representaste supo que podía contar contigo.';
    default:
      return 'El fútbol te dio menos de lo que soñabas de niño.';
  }
}

/** Agrega las temporadas jugadas por club: partidos, goles, asistencias,
 * rating promedio (ponderado por partidos) y títulos ganados ahí. */
export function buildClubHistory(state) {
  const byClub = new Map();
  for (const season of state.stats.seasons) {
    if (!byClub.has(season.club)) {
      byClub.set(season.club, {
        club: season.club,
        years: 0,
        fromYear: season.year,
        toYear: season.year,
        matches: 0,
        goals: 0,
        assists: 0,
        ratingWeighted: 0,
        trophies: [],
      });
    }
    const entry = byClub.get(season.club);
    entry.years += 1;
    entry.fromYear = Math.min(entry.fromYear, season.year);
    entry.toYear = Math.max(entry.toYear, season.year);
    entry.matches += season.matches;
    entry.goals += season.goals;
    entry.assists += season.assists;
    entry.ratingWeighted += (season.avgRating || 6) * Math.max(1, season.matches);
  }
  for (const t of state.trophies) {
    const entry = byClub.get(t.withClub);
    if (entry) entry.trophies.push(t.name);
  }
  return [...byClub.values()]
    .map((e) => ({
      club: e.club,
      years: e.years,
      fromYear: e.fromYear,
      toYear: e.toYear,
      matches: e.matches,
      goals: e.goals,
      assists: e.assists,
      avgRating: Math.round((e.ratingWeighted / Math.max(1, e.matches)) * 100) / 100,
      trophies: e.trophies,
    }))
    .sort((a, b) => a.fromYear - b.fromYear);
}

export function buildCareerSummary(state) {
  const clubs = [...new Set(state.stats.seasons.map((s) => s.club))];
  const clubHistory = buildClubHistory(state);
  const rareHistory = state.rareTracker.history.map((h) => ({
    name: RARE_STATE_DEFS[h.id]?.name,
    startedYear: h.startedYear,
    resolution: h.resolution,
  }));
  if (state.rareTracker.active) {
    rareHistory.push({ name: RARE_STATE_DEFS[state.rareTracker.active.id]?.name, startedYear: state.rareTracker.active.startedYear, resolution: 'activo al retirarse' });
  }
  return {
    name: state.player.name,
    country: state.country.name,
    flag: state.country.flag,
    position: state.player.position,
    yearsActive: state.stats.seasons.length,
    clubs,
    clubHistory,
    goals: state.stats.career.goals,
    assists: state.stats.career.assists,
    matches: state.stats.career.matches,
    caps: state.nationalTeam.caps,
    capsGoals: state.nationalTeam.goals,
    trophies: state.trophies,
    legendaryNights: state.rareTracker.legendaryNights,
    rareStates: rareHistory,
    generational: state.player.generational,
    finalMoneyM: Math.round(state.money * 10) / 10,
    seed: state.seed,
  };
}
