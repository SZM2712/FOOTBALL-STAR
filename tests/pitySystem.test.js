import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RareStateTracker, tryAnnualCareerStates, pickPityState, PITY_WINDOW } from '../src/engine/rareStates.js';
import { Rng } from '../src/state/rng.js';

function basePlayer(overrides = {}) {
  return { age: 24, attrs: { men: 60 }, ...overrides };
}

test('el pity system garantiza un estado raro (o Noche de Leyenda) hacia el año 15 si no ha ocurrido ninguno', () => {
  const tracker = new RareStateTracker();
  const rng = new Rng('pity-forced');
  const player = basePlayer();
  let triggered = null;
  for (let year = 1; year <= PITY_WINDOW[1]; year++) {
    const result = tryAnnualCareerStates(tracker, player, year, rng);
    if (result) {
      triggered = result;
      break;
    }
  }
  assert.ok(triggered, 'debería haberse forzado algún estado raro (o garantía de La Zona) para el año 15');
  assert.ok(tracker.pityResolved, 'el pity system debe marcarse como resuelto');
});

test('pickPityState respeta el perfil de decisiones del jugador', () => {
  const rng = new Rng('pity-profile');
  const neglectProfile = { physicalNeglectStreak: 9, physicalCareStreak: 0, seasonsAtCurrentClub: 0, partyRiskEvents: 0 };
  assert.equal(pickPityState(neglectProfile, basePlayer(), rng), 'CRISTAL');

  const loyalProfile = { physicalNeglectStreak: 0, physicalCareStreak: 0, seasonsAtCurrentClub: 11, rejectedBigOffers: 3, partyRiskEvents: 0 };
  assert.equal(pickPityState(loyalProfile, basePlayer(), rng), 'IDOLO_ETERNO');

  const partyProfile = { physicalNeglectStreak: 0, physicalCareStreak: 0, seasonsAtCurrentClub: 0, partyRiskEvents: 5 };
  assert.equal(pickPityState(partyProfile, basePlayer(), rng), 'CAIDA_LIBRE');

  const neutralProfile = { physicalNeglectStreak: 0, physicalCareStreak: 0, seasonsAtCurrentClub: 0, partyRiskEvents: 0 };
  assert.equal(pickPityState(neutralProfile, basePlayer({ age: 24 }), rng), 'LA_ZONA_GUARANTEE');
});

test('si un estado raro natural ya ocurrió antes del año 15, el pity system no debe forzar otro', () => {
  const tracker = new RareStateTracker();
  tracker.start('IDOLO_ETERNO', 3);
  const rng = new Rng('pity-skip');
  const player = basePlayer();
  for (let year = 4; year <= 20; year++) {
    tryAnnualCareerStates(tracker, player, year, rng);
  }
  assert.equal(tracker.history.length, 0, 'el único estado debe seguir activo, no resuelto ni reemplazado');
  assert.equal(tracker.active.id, 'IDOLO_ETERNO');
});
