import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, finishChildhood } from '../src/state/gameState.js';
import { simulateSeason } from '../src/engine/season.js';
import { CHILDHOOD_STAGES, optionsForStage, advanceChildhoodStage } from '../src/engine/childhood.js';
import {
  startCoachCareer,
  simulateCoachSeason,
  computeCoachLegacy,
  COACH_RETIREMENT_AGE_HARD,
} from '../src/engine/coachCareer.js';

function playChildhood(state) {
  for (const stage of CHILDHOOD_STAGES) {
    const pool = optionsForStage(stage.id);
    const optionId = pool ? pool[0].id : null;
    const { finished } = advanceChildhoodStage(state, optionId, state.rng);
    if (finished) finishChildhood(state);
  }
}

function playToRetirement(state, maxYears = 25) {
  let iterations = 0;
  while (!state.retired && iterations < maxYears) {
    simulateSeason(state, { trainingFocus: 'pac', hobby: null, travel: null, party: 'ninguna', gambling: 'no' });
    iterations++;
  }
}

test('startCoachCareer arranca la fase "coaching" con un club y reputación acorde al legado', () => {
  const state = createGame('coach-test-1');
  playChildhood(state);
  playToRetirement(state);
  assert.equal(state.retired, true);

  const feed = startCoachCareer(state);
  assert.equal(state.phase, 'coaching');
  assert.ok(state.coach);
  assert.ok(state.coach.club, 'debe arrancar con un club asignado');
  assert.ok(state.coach.reputation >= 20 && state.coach.reputation <= 70, 'la reputación inicial debe ser modesta');
  assert.ok(feed.length > 0);
});

test('simulateCoachSeason avanza la edad y el año del entrenador, y genera ofertas', () => {
  const state = createGame('coach-test-2');
  playChildhood(state);
  playToRetirement(state);
  startCoachCareer(state);

  const ageBefore = state.coach.age;
  simulateCoachSeason(state, { tactic: 'equilibrado', investment: 'cantera' });
  assert.equal(state.coach.age, ageBefore + 1);
  assert.equal(state.coach.year, 2);
  assert.ok(Array.isArray(state.coach.currentOffers));
});

test('el entrenador se retira automáticamente al llegar a la edad límite', () => {
  const state = createGame('coach-test-3');
  playChildhood(state);
  playToRetirement(state);
  startCoachCareer(state);
  state.coach.age = COACH_RETIREMENT_AGE_HARD - 1;

  simulateCoachSeason(state, { tactic: 'equilibrado', investment: 'cantera' });
  assert.equal(state.coach.retired, true);
});

test('computeCoachLegacy devuelve un título y no revienta si no hay coach', () => {
  const state = createGame('coach-test-4');
  playChildhood(state);
  assert.equal(computeCoachLegacy(state), null);

  playToRetirement(state);
  startCoachCareer(state);
  for (let i = 0; i < 5; i++) simulateCoachSeason(state, { tactic: 'ofensivo', investment: 'fichajes' });

  const legacy = computeCoachLegacy(state);
  assert.ok(legacy.title);
  assert.ok(typeof legacy.score === 'number');
});
