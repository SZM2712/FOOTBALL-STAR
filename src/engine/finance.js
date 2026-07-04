import { AGENT_TIERS } from './transferMarket.js';

export function payYearlySalary(state) {
  if (!state.contract) return 0;
  const tier = AGENT_TIERS[state.agent.tier];
  const gross = state.contract.salaryM || 0;
  const net = gross * (1 - tier.commission);
  state.money += net;
  return net;
}

export function collectSponsorships(state, chosenIds, offers) {
  let total = 0;
  for (const id of chosenIds) {
    const offer = offers.find((o) => o.id === id);
    if (offer) total += offer.payM;
  }
  state.money += total;
  return total;
}

/** Riesgo de bancarrota post-retiro: mala gestión financiera acumulada. */
export function bankruptcyRisk(state) {
  const pl = state.personalLife;
  let risk = 0;
  risk += pl.divorces * 0.25;
  risk += pl.vices.addiction ? 0.3 : 0;
  risk += pl.financeMisfortune > state.peakMoney * 0.4 ? 0.25 : 0;
  risk += pl.purchases.length > 6 ? 0.15 : 0;
  risk += state.money < state.peakMoney * 0.15 ? 0.3 : 0;
  return Math.max(0, Math.min(1, risk));
}

export function isBankrupt(state, rng) {
  return rng.chance(bankruptcyRisk(state));
}
