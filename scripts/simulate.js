// Corre N carreras automáticas de principio a fin para verificar que la
// distribución de estados raros, retiros y legados sea la esperada.
// Uso: node scripts/simulate.js [N]

import { createGame } from '../src/state/gameState.js';
import { simulateSeason } from '../src/engine/season.js';
import { acceptOffer, rejectOffer } from '../src/engine/transferMarket.js';
import { computeLegacy, LEGACY_TITLES } from '../src/engine/legacy.js';
import { HOBBIES, TRAVEL_OPTIONS } from '../src/engine/personalLife.js';
import { MAX_RARE_STATES_PER_CAREER } from '../src/engine/rareStates.js';

const N = Number(process.argv[2]) || 1000;

function autoDecide(state) {
  return {
    training: state.rng.pick(['fisico', 'tecnico', 'invisible', 'tecnico', 'fisico']),
    hobby: state.rng.pick(Object.keys(HOBBIES)),
    travel: state.rng.pick(Object.keys(TRAVEL_OPTIONS)),
    party: state.rng.pick(['ninguna', 'ninguna', 'ninguna', 'moderada', 'intensa']),
    nationalizationChoice: state.rng.chance(0.5) ? 'accept' : 'reject',
  };
}

function runCareer(seed) {
  const state = createGame(seed);
  let iterations = 0;
  while (!state.retired && state.player.age < 40 && iterations < 30) {
    if (state.currentOffers && state.currentOffers.length) {
      if (state.rng.chance(0.18)) {
        acceptOffer(state, state.rng.pick(state.currentOffers));
      } else {
        for (const o of state.currentOffers) rejectOffer(state, o);
      }
    }
    simulateSeason(state, autoDecide(state));
    iterations++;
  }
  state.retired = true;
  return state;
}

function main() {
  const rareStateCounts = {};
  const legacyCounts = {};
  let generationalCount = 0;
  let generationalFulfilled = 0;
  let totalLegendaryNights = 0;
  let careersWithAtLeastOneRareState = 0;
  let careersOverLimit = 0;
  let totalYears = 0;
  const retirementReasons = {};

  for (let i = 0; i < N; i++) {
    const state = runCareer(`sim-${i}`);
    const tracker = state.rareTracker;
    const allStates = tracker.history.map((h) => h.id).concat(tracker.active ? [tracker.active.id] : []);
    if (allStates.length > MAX_RARE_STATES_PER_CAREER) careersOverLimit++;
    // La Zona / Noches de Leyenda cuentan como estado raro propio (catálogo de positivos).
    if (allStates.length > 0 || tracker.legendaryNights > 0) careersWithAtLeastOneRareState++;
    for (const id of allStates) rareStateCounts[id] = (rareStateCounts[id] || 0) + 1;
    if (tracker.legendaryNights > 0) rareStateCounts.LA_ZONA = (rareStateCounts.LA_ZONA || 0) + 1;

    totalLegendaryNights += tracker.legendaryNights;
    totalYears += state.stats.seasons.length;
    retirementReasons[state.retirementReason || 'ninguna'] = (retirementReasons[state.retirementReason || 'ninguna'] || 0) + 1;

    if (state.player.generational) {
      generationalCount++;
      const legacy = computeLegacy(state);
      if (legacy.title === LEGACY_TITLES.GENERACIONAL) generationalFulfilled++;
    }

    const legacy = computeLegacy(state);
    legacyCounts[legacy.title] = (legacyCounts[legacy.title] || 0) + 1;
  }

  console.log(`\n=== Simulación de ${N} carreras completas ===\n`);
  console.log(`Generacionales: ${generationalCount} (${((generationalCount / N) * 100).toFixed(3)}% — esperado ~0.1%)`);
  console.log(`  De esos, cumplieron el potencial: ${generationalFulfilled}/${generationalCount || 1}`);
  console.log(`Carreras con al menos 1 estado raro (pity system): ${careersWithAtLeastOneRareState}/${N} (${((careersWithAtLeastOneRareState / N) * 100).toFixed(1)}%)`);
  console.log(`Carreras que excedieron el máximo de ${MAX_RARE_STATES_PER_CAREER} estados: ${careersOverLimit} (debería ser 0)`);
  console.log(`Noches de Leyenda totales: ${totalLegendaryNights} (promedio ${(totalLegendaryNights / N).toFixed(2)} por carrera)`);
  console.log(`Duración media de carrera: ${(totalYears / N).toFixed(1)} años`);

  console.log('\n--- Distribución de estados raros ---');
  for (const [id, count] of Object.entries(rareStateCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${id.padEnd(20)} ${count} (${((count / N) * 100).toFixed(1)}%)`);
  }

  console.log('\n--- Distribución de legados ---');
  for (const [title, count] of Object.entries(legacyCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${title.padEnd(28)} ${count} (${((count / N) * 100).toFixed(1)}%)`);
  }

  console.log('\n--- Motivos de retiro ---');
  for (const [reason, count] of Object.entries(retirementReasons)) {
    console.log(`  ${reason.padEnd(15)} ${count} (${((count / N) * 100).toFixed(1)}%)`);
  }

  const problems = [];
  if (careersOverLimit > 0) problems.push('Hay carreras con más de 3 estados raros.');
  if (careersWithAtLeastOneRareState / N < 0.85) problems.push('El pity system no está garantizando estados raros en suficientes carreras.');
  if (generationalCount / N > 0.005) problems.push('La tasa de Generacionales es demasiado alta.');

  if (problems.length) {
    console.log('\n⚠️  PROBLEMAS DE BALANCE DETECTADOS:');
    problems.forEach((p) => console.log(`  - ${p}`));
    process.exitCode = 1;
  } else {
    console.log('\n✅ Balance dentro de los rangos esperados.');
  }
}

main();
