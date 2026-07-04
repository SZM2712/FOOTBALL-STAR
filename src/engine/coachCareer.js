// Modo Entrenador: segunda carrera post-retiro. En vez de gestionar un
// plantel jugador por jugador, dirigís un club a nivel de rating de
// equipo (táctica + inversión), con temporadas simuladas partido a partido
// contra los rivales de tu división, copa continental y ofertas de clubes
// más grandes según tu reputación como DT. Reutiliza deliberadamente la
// infraestructura de países/ligas/partidos ya existente para no duplicar
// todo el motor del juego con una gestión de plantel completa.

import { COUNTRY_BY_CODE } from '../data/countries.js';
import { CLUB_CONTINENTAL_CUPS } from '../data/clubs.js';
import { simulateTeamMatch } from './match.js';
import { getLeagueSystem } from './transferMarket.js';
import { computeLegacy } from './legacy.js';
import { isWorldCupYear, isContinentalYear, CONTINENTAL_CUP_NAME } from './nationalTeam.js';

export const COACH_RETIREMENT_AGE_HARD = 75;

function clamp(v, min = 0, max = 100) {
  return Math.max(min, Math.min(max, v));
}

function pickStartingClub(state, rng) {
  const country = COUNTRY_BY_CODE[state.nationality] || state.country;
  const league = getLeagueSystem(state, country.code);
  const division = league.divisions[0];
  const target = state.coach.reputation;
  const compatible = division.clubs.filter((c) => Math.abs(c.rating - target) < 15);
  const club = rng.pick(compatible.length ? compatible : division.clubs);
  return { ...club, leagueName: league.leagueName };
}

/** Se llama desde la pantalla de retiro como jugador: arranca la segunda
 * carrera como entrenador, con reputación inicial modesta derivada de tu
 * legado como jugador (hasta una Leyenda empieza de abajo en el banco). */
export function startCoachCareer(state) {
  const legacy = computeLegacy(state);
  const reputation = clamp(20 + (legacy.score || 0) / 15, 20, 70);
  state.coach = {
    active: true,
    age: state.player.age,
    year: 1,
    reputation,
    club: null,
    leagueName: null,
    nationalTeamJob: null,
    seasons: [],
    trophies: [],
    currentOffers: [],
    retired: false,
    retirementReason: null,
  };
  const club = pickStartingClub(state, state.rng);
  state.coach.club = club;
  state.phase = 'coaching';
  return [
    `Cuelgas los botines y te sentás en el banco por primera vez: ${club.name} te da la bienvenida como entrenador.`,
  ];
}

function simulateClubSeason(state, decisions) {
  const rng = state.rng;
  const coach = state.coach;
  const club = coach.club;
  const feed = [];

  const tacticMod = { ofensivo: 4, defensivo: -1, equilibrado: 1 }[decisions.tactic] || 0;
  const leagueSystem = getLeagueSystem(state, club.countryCode);
  const division = leagueSystem.divisions[club.division] || leagueSystem.divisions[0];
  const rivals = division.clubs.filter((c) => c.id !== club.id);
  const matchesInSeason = Math.max(10, (division.clubs.length - 1) * 2);

  let points = 0;
  let wins = 0;
  let draws = 0;
  let losses = 0;
  let goalsFor = 0;
  let goalsAgainst = 0;
  for (let m = 0; m < matchesInSeason; m++) {
    const opp = rng.pick(rivals.length ? rivals : division.clubs);
    const r = simulateTeamMatch(club.rating + tacticMod, opp.rating, rng);
    goalsFor += r.teamGoals;
    goalsAgainst += r.oppGoals;
    if (r.result === 'win') {
      points += 3;
      wins++;
    } else if (r.result === 'draw') {
      points += 1;
      draws++;
    } else {
      losses++;
    }
  }

  const betterRivals = division.clubs.filter((c) => c.rating > club.rating).length;
  const percentile = 1 - betterRivals / Math.max(1, division.clubs.length - 1);
  const expectedPPG = 1.0 + percentile * 1.3;
  const actualPPG = points / matchesInSeason;
  const overPerformance = actualPPG - expectedPPG;
  const championThreshold = 2.15 - percentile * 0.3;
  const champion = actualPPG >= championThreshold;
  const directorTitle = champion ? leagueSystem.leagueName : null;

  if (champion) {
    coach.trophies.push({ year: coach.year, name: leagueSystem.leagueName, withClub: club.name });
    feed.push(`🏆 ¡Ganas el título de ${leagueSystem.leagueName} al frente de ${club.name}!`);
  } else if (percentile < 0.15 && actualPPG < 0.9) {
    feed.push(`Temporada para el olvido: ${club.name} pelea el descenso en ${leagueSystem.leagueName}.`);
  } else {
    feed.push(`${club.name} termina la temporada de ${leagueSystem.leagueName} con ${points} puntos (${wins}G-${draws}E-${losses}P).`);
  }

  // ---- Copa continental de clubes (si el club tiene prestigio suficiente) ----
  if (club.prestige >= 55 && rng.chance(0.5)) {
    const cupNames = CLUB_CONTINENTAL_CUPS[COUNTRY_BY_CODE[club.countryCode]?.confed] || CLUB_CONTINENTAL_CUPS.UEFA;
    const cupName = club.prestige >= 80 ? cupNames.top : cupNames.second;
    let advancing = true;
    let round = 0;
    const roundNames = ['fase de grupos', 'octavos', 'cuartos', 'semifinal', 'final'];
    while (advancing && round < roundNames.length) {
      const isFinal = roundNames[round] === 'final';
      const oppRating = club.rating + rng.range(-8, 12);
      const r = simulateTeamMatch(club.rating + tacticMod, oppRating, rng);
      if (r.result === 'loss' || (r.result === 'draw' && isFinal && rng.chance(0.5))) {
        advancing = false;
        feed.push(`Eliminados de la ${cupName} en ${roundNames[round]}.`);
      } else if (isFinal) {
        advancing = false;
        coach.trophies.push({ year: coach.year, name: cupName, withClub: club.name });
        feed.push(`🏆 ¡${club.name} conquista la ${cupName} bajo tu dirección!`);
      } else {
        round++;
      }
    }
  }

  // ---- Inversión ----
  if (decisions.investment === 'cantera') {
    club.rating = Math.min(96, club.rating + rng.range(0.3, 1.2));
    club.budgetM = Math.round((club.budgetM + club.budgetM * 0.05) * 10) / 10;
  } else if (decisions.investment === 'fichajes') {
    const cost = club.budgetM * 0.4;
    if (club.budgetM > 2) {
      club.budgetM = Math.round((club.budgetM - cost) * 10) / 10;
      club.rating = Math.min(97, club.rating + rng.range(1, 3));
      feed.push(`Refuerzas la plantilla invirtiendo €${cost.toFixed(1)}M.`);
    } else {
      feed.push('No hay presupuesto para grandes fichajes esta temporada.');
    }
  } else if (decisions.investment === 'estabilidad') {
    club.budgetM = Math.round((club.budgetM + club.budgetM * 0.15) * 10) / 10;
  }

  const reputationDelta = clamp(overPerformance * 8, -12, 15);
  coach.reputation = clamp(coach.reputation + reputationDelta, 5, 99);

  coach.seasons.push({
    year: coach.year,
    club: club.name,
    leagueName: leagueSystem.leagueName,
    points,
    matches: matchesInSeason,
    wins,
    draws,
    losses,
    goalsFor,
    goalsAgainst,
    champion,
  });

  return feed;
}

/** Simula una temporada del modo Entrenador. decisions: { tactic, investment, offerChoice } */
export function simulateCoachSeason(state, decisions = {}) {
  const rng = state.rng;
  const coach = state.coach;
  const feed = [];

  if (coach.nationalTeamJob) {
    const country = COUNTRY_BY_CODE[coach.nationalTeamJob];
    const worldYear = state.worldYearStart + state.year - 1 + coach.year;
    const boost = Math.max(0, (coach.reputation - 50) / 6);
    if (isWorldCupYear(worldYear) || isContinentalYear(worldYear)) {
      const kind = isWorldCupYear(worldYear) ? 'Mundial' : CONTINENTAL_CUP_NAME[country.confed];
      const threshold = isWorldCupYear(worldYear) ? 60 : 46;
      const p = Math.max(0.03, Math.min(0.95, 1 / (1 + Math.exp(-(country.nt + boost - threshold) / 11))));
      if (rng.chance(p)) {
        const deep = rng.chance(0.3 + boost / 100);
        if (deep) {
          coach.trophies.push({ year: coach.year, name: kind, withClub: country.name });
          coach.reputation = clamp(coach.reputation + 12, 5, 99);
          feed.push(`🏆 ¡Llevás a ${country.name} a la gloria en el ${kind}!`);
        } else {
          coach.reputation = clamp(coach.reputation + 4, 5, 99);
          feed.push(`Clasificás con ${country.name} al ${kind}, aunque el equipo cae en una ronda intermedia.`);
        }
      } else {
        coach.reputation = clamp(coach.reputation - 6, 5, 99);
        feed.push(`${country.name} no logra clasificar al ${kind} bajo tu dirección. La prensa te presiona.`);
      }
    } else {
      feed.push(`Un año tranquilo al frente de ${country.name}: amistosos y trabajo de base.`);
    }
  } else if (coach.club) {
    feed.push(...simulateClubSeason(state, decisions));
  } else {
    feed.push('Sigues sin banco. Tu representante sigue buscando una oportunidad.');
  }

  coach.age += 1;
  coach.year += 1;

  if (coach.age >= COACH_RETIREMENT_AGE_HARD) {
    coach.retired = true;
    coach.retirementReason = coach.retirementReason || 'edad';
  }

  coach.currentOffers = coach.retired ? [] : generateCoachOffers(state);

  return feed;
}

/** Genera ofertas de bancos según tu reputación como DT (y, si es alta,
 * una posibilidad de dirigir una selección nacional). */
export function generateCoachOffers(state) {
  const rng = state.rng;
  const coach = state.coach;
  const offers = [];
  const n = rng.int(1, 3);

  const candidateCountries = Object.values(COUNTRY_BY_CODE)
    .filter((c) => c.tier <= Math.max(2, Math.min(6, Math.round(coach.reputation / 14))))
    .sort(() => rng.float() - 0.5)
    .slice(0, 10);

  for (let i = 0; i < n; i++) {
    const country = rng.pick(candidateCountries.length ? candidateCountries : Object.values(COUNTRY_BY_CODE));
    const league = getLeagueSystem(state, country.code);
    const division = league.divisions[0];
    const compatible = division.clubs.filter((c) => Math.abs(c.rating - coach.reputation) < 20);
    const club = rng.pick(compatible.length ? compatible : division.clubs);
    if (!club || club.id === coach.club?.id) continue;
    offers.push({
      type: 'club',
      id: `coach-off-${coach.year}-${i}-${club.id}`,
      club,
      country,
      league: league.leagueName,
      salaryM: Math.max(0.05, Math.round((club.prestige / 20) * rng.range(0.7, 1.3) * 10) / 10),
    });
  }

  if (coach.reputation >= 72 && !coach.nationalTeamJob && rng.chance(0.12)) {
    const country = COUNTRY_BY_CODE[state.nationality];
    offers.push({
      type: 'nationalTeam',
      id: `coach-nt-${coach.year}`,
      country,
      salaryM: Math.round((coach.reputation / 15) * 10) / 10,
    });
  }

  return offers;
}

export function acceptCoachOffer(state, offer) {
  const coach = state.coach;
  if (offer.type === 'nationalTeam') {
    coach.nationalTeamJob = offer.country.code;
    coach.club = null;
    return [`Aceptas dirigir a la selección de ${offer.country.name}.`];
  }
  coach.club = { ...offer.club, leagueName: offer.league, countryCode: offer.country.code };
  coach.nationalTeamJob = null;
  return [`Firmas como entrenador de ${offer.club.name} (${offer.league}).`];
}

export function rejectCoachOffer() {
  return [];
}

const COACH_LEGACY_TITLES = {
  ENTRENADOR_LEGENDARIO: 'Entrenador Legendario',
  BUEN_ESTRATEGA: 'Buen Estratega',
  ENTRENADOR_CORRECTO: 'Entrenador Correcto',
  ENTRENADOR_OLVIDABLE: 'Entrenador Olvidable',
};

export function computeCoachLegacy(state) {
  const coach = state.coach;
  if (!coach) return null;
  const titles = coach.trophies.length;
  const seasons = coach.seasons.length;
  const score = titles * 20 + coach.reputation + seasons * 1.5;

  let title;
  let narrative;
  if (score >= 140) {
    title = COACH_LEGACY_TITLES.ENTRENADOR_LEGENDARIO;
    narrative = 'Del vestuario al banco: te convertiste en una leyenda también dirigiendo.';
  } else if (score >= 95) {
    title = COACH_LEGACY_TITLES.BUEN_ESTRATEGA;
    narrative = 'Construiste una carrera sólida como estratega, respetada en cada vestuario que pisaste.';
  } else if (score >= 60) {
    title = COACH_LEGACY_TITLES.ENTRENADOR_CORRECTO;
    narrative = 'Cumpliste en el banco, sin sobresaltos ni gloria excesiva.';
  } else {
    title = COACH_LEGACY_TITLES.ENTRENADOR_OLVIDABLE;
    narrative = 'El banco nunca fue lo tuyo. Se recuerda más tu etapa como jugador.';
  }

  return { title, score: Math.round(score), narrative, titles, seasons, reputation: Math.round(coach.reputation) };
}

export { COACH_LEGACY_TITLES };
