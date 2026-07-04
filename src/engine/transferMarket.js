import { COUNTRY_BY_CODE } from '../data/countries.js';
import { generateLeagueSystem } from '../data/clubs.js';
import { overallRating } from './player.js';
import { randomPersonName } from '../data/names.js';

export const AGENT_TIERS = {
  familiar: { label: 'Agente familiar', commission: 0.05, offerQuality: 0.75, offerCount: [1, 2] },
  local: { label: 'Agente local', commission: 0.09, offerQuality: 1.0, offerCount: [2, 3] },
  super: { label: 'Superagente', commission: 0.16, offerQuality: 1.3, offerCount: [3, 5] },
};

export function getLeagueSystem(state, countryCode) {
  if (!state.leagueSystems[countryCode]) {
    const country = COUNTRY_BY_CODE[countryCode];
    state.leagueSystems[countryCode] = generateLeagueSystem(country, state.rng);
  }
  return state.leagueSystems[countryCode];
}

function marketValue(player, fame) {
  const rating = overallRating(player);
  const ageFactor = player.age <= 23 ? 1.35 : player.age <= 29 ? 1.0 : Math.max(0.25, 1 - (player.age - 29) * 0.11);
  const potentialFactor = 1 + Math.max(0, player.potential - rating) / 120;
  const base = Math.pow(1.16, rating - 55) * 0.8;
  return Math.max(0.05, base * ageFactor * potentialFactor * (0.85 + fame / 300));
}

export function estimateValueM(state) {
  return Math.round(marketValue(state.player, state.fame) * 10) / 10;
}

/** Rango de tiers de país "creíble" para el nivel actual del jugador. Tier 1
 * es la élite: un jugador de rating alto debe atraer interés de las ligas
 * top, no de cualquier país del mundo (bug anterior: la fórmula ampliaba el
 * rango hacia tiers débiles a medida que subía el rating, permitiendo
 * ofertas de países como Fiyi para una superestrella). */
function credibleTierRange(rating) {
  if (rating >= 85) return [1, 2];
  if (rating >= 75) return [1, 3];
  if (rating >= 65) return [2, 4];
  if (rating >= 55) return [3, 5];
  return [4, 6];
}

function closestByRating(clubs, rating) {
  return clubs.reduce((best, c) => (Math.abs(c.rating - rating) < Math.abs(best.rating - rating) ? c : best), clubs[0]);
}

function clamp(v, min = 0, max = 100) {
  return Math.max(min, Math.min(max, v));
}

/** Decide si el club quiere renovarte cuando el contrato llega a su fin.
 * La relación con el entrenador pesa: si te llevás mal, el club es mucho
 * más propenso a dejarte ir aunque tu nivel futbolístico lo justifique. */
function renewalChance(player, club, rating, managerRelationship = 55) {
  let p = 0.82;
  if (player.age >= 35) p -= 0.3;
  else if (player.age >= 31) p -= 0.1;
  if (rating < club.rating - 12) p -= 0.25;
  else if (rating >= club.rating + 5) p += 0.1;
  p += (managerRelationship - 55) / 150;
  return Math.max(0.1, Math.min(0.96, p));
}

/** Se llama cuando state.contract.years llega a 0: o el club renueva en
 * condiciones acordes al nivel actual, o el jugador queda libre (sin club
 * ni contrato) y debe buscar acomodo en el mercado de fichajes. */
export function attemptContractRenewal(state, rng) {
  if (!state.club || !state.contract) return null;
  const rating = overallRating(state.player);
  const wantsRenew = rng.chance(renewalChance(state.player, state.club, rating, state.managerRelationship));

  if (wantsRenew) {
    const valueM = estimateValueM(state);
    const years = rng.int(2, 4);
    const salaryM = Math.max(0.02, Math.round((valueM / 4) * rng.range(0.85, 1.3) * 100) / 100);
    const clauseM = Math.round(valueM * rng.range(1.4, 2.2) * 10) / 10;
    state.contract = { salaryM, years, clauseM };
    state.managerRelationship = clamp(state.managerRelationship + 10);
    return { renewed: true, text: `Renuevas tu contrato con ${state.club.name} por ${years} años más.` };
  }

  const clubName = state.club.name;
  state.club = null;
  state.contract = null;
  state.managerRelationship = 55;
  state.managerName = null;
  return {
    renewed: false,
    text: `Tu contrato con ${clubName} llega a su fin y el club decide no renovarte. Eres agente libre: tendrás que buscar equipo en el mercado.`,
  };
}

/** Chequeo aparte de la renovación: si la relación con el cuerpo técnico
 * está muy deteriorada, el club puede prescindir de vos aunque el contrato
 * todavía tenga años por delante (venta o rescisión anticipada). */
export function checkForcedTransferListing(state, rng) {
  if (!state.club || !state.contract) return null;
  if (state.managerRelationship > 25) return null;
  if (!rng.chance(0.22)) return null;
  const clubName = state.club.name;
  state.club = null;
  state.contract = null;
  state.managerRelationship = 55;
  state.managerName = null;
  return `Tu relación con el cuerpo técnico de ${clubName} se rompió: el club decide prescindir de vos antes de que termine tu contrato.`;
}

/** Genera ofertas de fichaje coherentes con nivel/edad/liga del jugador. */
export function generateOffers(state) {
  const { rng, player, fame, agent } = state;
  const tier = AGENT_TIERS[agent.tier];
  const rating = overallRating(player);
  const valueM = estimateValueM(state);
  const [minN, maxN] = tier.offerCount;
  // Un agente libre está mucho más disponible en el mercado: más clubes
  // pican, sin costo de traspaso de por medio.
  const freeAgentBoost = state.club ? 0 : 2;
  const n = rng.int(minN, maxN) + freeAgentBoost;
  const offers = [];

  const [tierLo, tierHi] = credibleTierRange(rating);
  const candidateCountries = Object.values(COUNTRY_BY_CODE)
    .filter((c) => c.tier >= tierLo && c.tier <= tierHi)
    .sort(() => rng.float() - 0.5)
    .slice(0, 12);

  for (let i = 0; i < n; i++) {
    const country = rng.pick(candidateCountries.length ? candidateCountries : Object.values(COUNTRY_BY_CODE));
    const league = getLeagueSystem(state, country.code);
    const division = league.divisions[0];
    // clubes cuyo rating es compatible con el nivel del jugador; si ninguno
    // cae en rango, el más parecido (nunca uno al azar sin relación).
    const compatibleClubs = division.clubs.filter((c) => Math.abs(c.rating - rating) < 22);
    const club = compatibleClubs.length ? rng.pick(compatibleClubs) : closestByRating(division.clubs, rating);
    if (!club || club.id === state.club?.id) continue;

    const prestigeGap = club.prestige - (state.club?.prestige ?? 50);
    const isGiant = prestigeGap > 35 && rng.chance(0.3);
    // "Exótico" = liga rica pero sin tradición de élite (tier 2-3: al estilo
    // de las ligas del golfo o asiáticas), no cualquier país débil.
    const isExotic = country.tier >= 2 && country.tier <= 3 && club.budgetM > 35 && rng.chance(0.22);

    const baseWage = Math.max(0.02, (valueM / 4) * (0.7 + rng.range(0, 0.6)) * tier.offerQuality);
    const wageM = isExotic ? baseWage * rng.range(2.4, 3.4) : baseWage;
    const feeM = Math.round(valueM * rng.range(0.7, 1.35) * 10) / 10;
    const years = rng.int(2, 5);

    offers.push({
      id: `off-${state.year}-${i}-${club.id}`,
      club,
      country,
      league: league.leagueName,
      wageM: Math.round(wageM * 100) / 100,
      feeM,
      years,
      isGiant,
      isExotic,
      clauseM: Math.round(feeM * rng.range(1.4, 2.2) * 10) / 10,
    });
  }
  return offers;
}

/** Acepta una oferta: mueve de club, actualiza contrato, dinero y dispara
 * los estados raros mixtos "Mercenario de Oro" / "El Traspaso Maldito". */
export function acceptOffer(state, offer) {
  const tier = AGENT_TIERS[state.agent.tier];
  const signingBonus = offer.feeM * 0.05 * (1 - tier.commission);
  const prevSalaryM = state.contract?.salaryM || 0;
  state.money += signingBonus;
  state.club = { ...offer.club, leagueName: offer.league, countryCode: offer.country.code };
  state.contract = { salaryM: offer.wageM, years: offer.years, clauseM: offer.clauseM };
  state.rareTracker.profile.seasonsAtCurrentClub = 0;
  state.transferredThisYear = true;
  state.managerRelationship = 55;
  state.managerName = randomPersonName(state.rng, offer.country.confed);

  const feed = [
    `Fichaje: ${state.player.name} firma por ${offer.club.name} (${offer.league}).`,
    `Tu nuevo entrenador es ${state.managerName}.`,
  ];

  if (offer.isExotic && state.rareTracker.canStartNew() && offer.wageM > prevSalaryM * 1.5) {
    if (state.rng.chance(0.3)) {
      state.rareTracker.start('MERCENARIO_DE_ORO', state.year);
      state.nationalTeam.prestigeLocked = true;
      feed.push('Un club rico de una liga exótica triplica tu salario. La fortuna tiene un precio: tu prestigio y tu selección.');
    }
  } else if (offer.isGiant && state.rareTracker.canStartNew()) {
    if (state.rng.chance(0.35)) {
      state.rareTracker.start('TRASPASO_MALDITO', state.year);
      feed.push('Fichaste por un gigante. La presión es inmediata: el vestuario no perdona a los recién llegados.');
    }
  }

  return feed;
}

export function rejectOffer(state, offer) {
  const isBig = offer.feeM > estimateValueM(state) * 1.1 || offer.wageM > (state.contract?.salaryM || 0.1) * 1.6;
  if (isBig) {
    // se acumula una única vez por año en season.js, sin importar cuántas
    // ofertas grandes se rechacen en la misma ventana de mercado.
    state.bigOfferRejectedThisYear = true;
  }
  return isBig
    ? [`Rechazas una oferta millonaria de ${offer.club.name}. La afición lo nota.`]
    : [`Rechazas la oferta de ${offer.club.name}.`];
}

export function generateSponsorships(state) {
  const { fame, player } = state;
  const slots = [];
  if (fame > 20) slots.push({ id: 'boots', name: 'Marca deportiva local', payM: Math.round((fame / 12) * 10) / 10 });
  if (fame > 45) slots.push({ id: 'drinks', name: 'Bebida energética regional', payM: Math.round((fame / 8) * 10) / 10 });
  if (fame > 70) slots.push({ id: 'global', name: 'Marca global de estilo de vida', payM: Math.round((fame / 5 + player.carisma / 20) * 10) / 10 });
  return slots;
}
