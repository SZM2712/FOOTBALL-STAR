import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, finishChildhood } from '../src/state/gameState.js';
import { startSeason, playNextMatch, finishSeason, isMatchdayPending, simulateSeason } from '../src/engine/season.js';
import { CHILDHOOD_STAGES, optionsForStage, advanceChildhoodStage } from '../src/engine/childhood.js';

function playChildhood(state) {
  for (const stage of CHILDHOOD_STAGES) {
    const pool = optionsForStage(stage.id);
    const optionId = pool ? pool[0].id : null;
    const { finished } = advanceChildhoodStage(state, optionId, state.rng);
    if (finished) finishChildhood(state);
  }
}

const basicDecisions = { trainingFocus: 'pac', hobby: null, travel: null, party: 'ninguna', gambling: 'no' };

test('startSeason no juega ningún partido: matchIndex arranca en 0 y hay partidos pendientes', () => {
  const state = createGame('season-steps-1');
  playChildhood(state);

  startSeason(state, basicDecisions);
  assert.ok(state.pendingSeason);
  assert.equal(state.pendingSeason.matchIndex, 0);
  assert.ok(state.pendingSeason.matchesInSeason > 0, 'un jugador con club debe tener partidos que jugar');
  assert.equal(isMatchdayPending(state), true);
  assert.equal(state.stats.career.matches, 0, 'todavía no se jugó ningún partido');
});

test('playNextMatch juega exactamente un partido por llamada', () => {
  const state = createGame('season-steps-2');
  playChildhood(state);
  startSeason(state, basicDecisions);

  const total = state.pendingSeason.matchesInSeason;
  playNextMatch(state);
  assert.equal(state.pendingSeason.matchIndex, 1);
  assert.ok(isMatchdayPending(state) || total === 1);

  playNextMatch(state);
  assert.equal(state.pendingSeason.matchIndex, 2);
});

test('jugar todos los partidos y cerrar la temporada avanza la edad y limpia pendingSeason', () => {
  const state = createGame('season-steps-3');
  playChildhood(state);
  const ageBefore = state.player.age;
  startSeason(state, basicDecisions);

  let guard = 0;
  while (isMatchdayPending(state) && guard < 100) {
    playNextMatch(state);
    guard++;
  }
  assert.ok(guard < 100, 'no debería quedar en un loop infinito');
  assert.equal(isMatchdayPending(state), false);

  finishSeason(state, basicDecisions);
  assert.equal(state.pendingSeason, null);
  assert.equal(state.player.age, ageBefore + 1);
  assert.ok(state.stats.career.matches > 0, 'debe haber estadísticas de partidos jugados');
  assert.ok(state.leagueTable, 'debe haberse construido una tabla de posiciones');
});

test('simulateSeason (wrapper de compatibilidad) produce el mismo resultado final que start+play*+finish', () => {
  const stateA = createGame('season-steps-4');
  playChildhood(stateA);
  simulateSeason(stateA, basicDecisions);

  const stateB = createGame('season-steps-4');
  playChildhood(stateB);
  startSeason(stateB, basicDecisions);
  while (isMatchdayPending(stateB)) playNextMatch(stateB);
  finishSeason(stateB, basicDecisions);

  assert.equal(stateA.player.age, stateB.player.age);
  assert.equal(stateA.stats.career.matches, stateB.stats.career.matches);
  assert.equal(stateA.stats.career.goals, stateB.stats.career.goals);
  assert.equal(stateA.year, stateB.year);
});

test('un jugador sin club: startSeason no deja partidos pendientes (se puede cerrar la temporada de inmediato)', () => {
  const state = createGame('season-steps-5');
  playChildhood(state);
  state.club = null;
  state.contract = null;

  startSeason(state, basicDecisions);
  assert.equal(isMatchdayPending(state), false);
  assert.equal(state.pendingSeason.matchesInSeason, 0);
});
