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

test('cada temporada jugada genera una tabla de posiciones con la fila del jugador incluida', () => {
  const state = createGame('league-table-1');
  playChildhood(state);
  assert.equal(state.leagueTable, null);

  simulateSeason(state, { trainingFocus: 'pac', hobby: null, travel: null, party: 'ninguna', gambling: 'no' });

  assert.ok(state.leagueTable, 'debe existir una tabla tras jugar una temporada');
  const myRow = state.leagueTable.rows.find((r) => r.isPlayer);
  assert.ok(myRow, 'la tabla debe incluir la fila del jugador');
  assert.ok(myRow.position >= 1 && myRow.position <= state.leagueTable.rows.length);
});

test('la tabla está ordenada por puntos (y diferencia de gol como desempate)', () => {
  const state = createGame('league-table-2');
  playChildhood(state);
  simulateSeason(state, { trainingFocus: 'pac', hobby: null, travel: null, party: 'ninguna', gambling: 'no' });

  const rows = state.leagueTable.rows;
  for (let i = 1; i < rows.length; i++) {
    const prev = rows[i - 1];
    const curr = rows[i];
    const prevGD = prev.gf - prev.ga;
    const currGD = curr.gf - curr.ga;
    const ok = prev.points > curr.points || (prev.points === curr.points && prevGD >= currGD);
    assert.ok(ok, `fila ${i - 1} (${prev.points}pts/${prevGD}GD) debe ir antes que fila ${i} (${curr.points}pts/${currGD}GD)`);
  }
});

test('no hay tabla mientras el jugador está sin club', () => {
  const state = createGame('league-table-3');
  playChildhood(state);
  state.club = null;
  state.contract = null;
  const before = state.leagueTable;
  simulateSeason(state, { trainingFocus: 'pac', hobby: null, travel: null, party: 'ninguna', gambling: 'no' });
  assert.equal(state.leagueTable, before, 'la tabla no debería actualizarse si no hubo temporada de club');
});
