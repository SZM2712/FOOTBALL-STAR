import { test } from 'node:test';
import assert from 'node:assert/strict';
import { laZonaProbability, RareStateTracker, rollGenerational, GENERATIONAL_PROBABILITY, MAX_RARE_STATES_PER_CAREER } from '../src/engine/rareStates.js';
import { Rng } from '../src/state/rng.js';

function basePlayer(overrides = {}) {
  return {
    form: 50,
    monthsSinceInjury: 20,
    attrs: { men: 60 },
    chemistry: 50,
    consecutiveInvisibleTraining: 0,
    recentRatings: [6, 6, 6, 6, 6],
    generational: false,
    ...overrides,
  };
}

test('La Zona: probabilidad base baja (~0.5%) sin condiciones especiales', () => {
  const p = laZonaProbability(basePlayer(), { highPressure: false });
  assert.ok(p >= 0.004 && p <= 0.01, `esperaba ~0.5%, obtuvo ${p}`);
});

test('La Zona: hasta 8% cuando se cumplen TODAS las condiciones', () => {
  const perfectPlayer = basePlayer({
    form: 96,
    monthsSinceInjury: 12,
    attrs: { men: 92 },
    chemistry: 90,
    consecutiveInvisibleTraining: 4,
    recentRatings: [8.2, 8.5, 9.0, 8.1, 8.8],
  });
  const p = laZonaProbability(perfectPlayer, { highPressure: true });
  assert.ok(p >= 0.075 && p <= 0.08, `esperaba ~8%, obtuvo ${p}`);
});

test('La Zona: jugador Generacional multiplica la probabilidad por 5', () => {
  const normal = basePlayer({ form: 80, attrs: { men: 80 }, chemistry: 70 });
  const generational = basePlayer({ form: 80, attrs: { men: 80 }, chemistry: 70, generational: true });
  const pNormal = laZonaProbability(normal, { highPressure: true });
  const pGen = laZonaProbability(generational, { highPressure: true });
  assert.ok(pGen > pNormal * 4, `la probabilidad generacional (${pGen}) debería ser ~5x la normal (${pNormal})`);
});

test('La probabilidad de nacer Generacional es 1 en 1000 (0.1%)', () => {
  assert.equal(GENERATIONAL_PROBABILITY, 0.001);
  const rng = new Rng('generational-check');
  let hits = 0;
  const trials = 200000;
  for (let i = 0; i < trials; i++) if (rollGenerational(rng)) hits++;
  const rate = hits / trials;
  assert.ok(rate > 0.0005 && rate < 0.002, `tasa observada ${rate} debería rondar 0.001`);
});

test('nunca hay dos estados raros de carrera activos a la vez', () => {
  const tracker = new RareStateTracker();
  assert.equal(tracker.canStartNew(), true);
  tracker.start('LA_MALDICION', 3);
  assert.equal(tracker.canStartNew(), false);
  assert.equal(tracker.active.id, 'LA_MALDICION');
});

test('máximo 3 estados raros por carrera', () => {
  const tracker = new RareStateTracker();
  tracker.start('IDOLO_ETERNO', 2);
  tracker.resolve('fin-forzado-test');
  tracker.start('LA_MALDICION', 5);
  tracker.resolve('fin-forzado-test');
  tracker.start('CRISTAL', 8);
  assert.equal(tracker.history.length + (tracker.active ? 1 : 0), MAX_RARE_STATES_PER_CAREER);
  tracker.resolve('fin-forzado-test');
  assert.equal(tracker.canStartNew(), false, 'tras 3 estados no debe poder iniciar uno más');
});
