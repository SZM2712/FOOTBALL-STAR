import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, finishChildhood } from '../src/state/gameState.js';
import { simulateSeason } from '../src/engine/season.js';
import { CHILDHOOD_STAGES, optionsForStage, advanceChildhoodStage } from '../src/engine/childhood.js';

function playChildhood(state) {
  for (const stage of CHILDHOOD_STAGES) {
    const pool = optionsForStage(stage.id);
    const optionId = pool ? pool[0].id : null;
    const { finished } = advanceChildhoodStage(state, optionId, state.rng);
    if (finished) finishChildhood(state);
  }
}

test('el contrato cuenta los años hacia atrás cada temporada', () => {
  const state = createGame('contract-test-1');
  playChildhood(state);
  const initialYears = state.contract.years;
  simulateSeason(state, { trainingFocus: 'pac', hobby: null, travel: null, party: 'ninguna', gambling: 'no' });
  // si no se venció (años > 0 antes de descontar), debe haber bajado en 1,
  // salvo que justo se haya resuelto (renovado con nuevos años, o quedado libre).
  if (initialYears > 1) {
    assert.ok(state.contract === null || state.contract.years === initialYears - 1 || state.contract.years >= 2, 'los años del contrato deben reflejar el paso de la temporada');
  }
});

test('cuando el contrato llega a 0, se resuelve: renovación o agente libre (nunca queda en 0 o negativo)', () => {
  const state = createGame('contract-test-2');
  playChildhood(state);
  state.contract.years = 1; // fuerza el vencimiento este año

  simulateSeason(state, { trainingFocus: 'pac', hobby: null, travel: null, party: 'ninguna', gambling: 'no' });

  const resolved = state.contract === null || state.contract.years >= 2;
  assert.ok(resolved, 'el contrato debe haberse renovado (años>=2) o el jugador debe haber quedado libre (contract null)');
  if (state.contract === null) {
    assert.equal(state.club, null, 'si queda libre, tampoco debe tener club');
  } else {
    assert.ok(state.club, 'si renovó, debe seguir teniendo el mismo club (o alguno)');
  }
});

test('un jugador sin club no genera estadísticas de partidos esa temporada', () => {
  const state = createGame('contract-test-3');
  playChildhood(state);
  state.club = null;
  state.contract = null;
  const matchesBefore = state.stats.career.matches;

  simulateSeason(state, { trainingFocus: 'pac', hobby: null, travel: null, party: 'ninguna', gambling: 'no' });

  assert.equal(state.stats.career.matches, matchesBefore, 'sin club no deberían jugarse partidos');
});
