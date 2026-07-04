import { COUNTRY_BY_CODE } from '../data/countries.js';
import { generateLeagueSystem } from '../data/clubs.js';
import { overallRating } from './player.js';

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

/** Genera ofertas de fichaje coherentes con nivel/edad/liga del jugador. */
export function generateOffers(state) {
  const { rng, player, fame, agent } = state;
  const tier = AGENT_TIERS[agent.tier];
  const rating = overallRating(player);
  const valueM = estimateValueM(state);
  const [minN, maxN] = tier.offerCount;
  const n = rng.int(minN, maxN);
  const offers = [];

  const candidateCountries = Object.values(COUNTRY_BY_CODE)
    .filter((c) => c.tier <= Math.max(2, Math.min(6, Math.round(rating / 14))))
    .sort(() => rng.float() - 0.5)
    .slice(0, 12);

  for (let i = 0; i < n; i++) {
    const country = rng.pick(candidateCountries.length ? candidateCountries : Object.values(COUNTRY_BY_CODE));
    const league = getLeagueSystem(state, country.code);
    const division = league.divisions[0];
    // clubes cuyo rating es compatible con el nivel del jugador
    const compatibleClubs = division.clubs.filter((c) => Math.abs(c.rating - rating) < 22);
    const club = rng.pick(compatibleClubs.length ? compatibleClubs : division.clubs);
    if (!club || club.id === state.club?.id) continue;

    const prestigeGap = club.prestige - (state.club?.prestige ?? 50);
    const isGiant = prestigeGap > 35 && rng.chance(0.3);
    const isExotic = country.tier >= 4 && club.budgetM > 40 && rng.chance(0.22);

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
  const prevSalaryM = state.contract.salaryM || 0;
  state.money += signingBonus;
  state.club = { ...offer.club, leagueName: offer.league, countryCode: offer.country.code };
  state.contract = { salaryM: offer.wageM, years: offer.years, clauseM: offer.clauseM };
  state.rareTracker.profile.seasonsAtCurrentClub = 0;
  state.transferredThisYear = true;

  const feed = [`Fichaje: ${state.player.name} firma por ${offer.club.name} (${offer.league}).`];

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
  const isBig = offer.feeM > estimateValueM(state) * 1.1 || offer.wageM > (state.contract.salaryM || 0.1) * 1.6;
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
