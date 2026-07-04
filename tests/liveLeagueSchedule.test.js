import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Rng } from '../src/state/rng.js';
import { createGame, finishChildhood } from '../src/state/gameState.js';
import {
  simulateSeason,
  startSeason,
  playNextMatch,
  rollPenaltyOpportunityForMatch,
  rollBenchChallenge,
  hasPendingSubReaction,
  resolveSubReaction,
} from '../src/engine/season.js';
import { checkForcedTransferListing } from '../src/engine/transferMarket.js';
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

test('la tabla en vivo incluye a todos los clubes de la división, no solo al jugador', () => {
  const state = createGame('live-schedule-1');
  playChildhood(state);
  simulateSeason(state, basicDecisions);

  assert.ok(state.leagueTable.rows.length >= 8, 'la división más chica tiene 8 clubes');
  const ids = new Set(state.leagueTable.rows.map((r) => r.id));
  assert.equal(ids.size, state.leagueTable.rows.length, 'no debería haber clubes duplicados en la tabla');
});

test('cada club (incluido el del jugador) juega exactamente el mismo número de partidos: todos-contra-todos completo', () => {
  const state = createGame('live-schedule-2');
  playChildhood(state);
  simulateSeason(state, basicDecisions);

  const rows = state.leagueTable.rows;
  const expectedPlayed = rows[0].played;
  for (const r of rows) {
    assert.equal(r.played, expectedPlayed, `${r.name} debería haber jugado ${expectedPlayed} partidos como el resto`);
    assert.equal(r.wins + r.draws + r.losses, r.played, 'wins+draws+losses debe sumar los partidos jugados');
  }
});

test('la tabla se actualiza jornada a jornada, no solo al cierre de temporada', () => {
  const state = createGame('live-schedule-3');
  playChildhood(state);

  const before = state.leagueTable;
  assert.equal(before, null);

  startSeason(state, basicDecisions);
  assert.ok(state.leagueTable, 'debe existir una tabla apenas arranca la temporada (0 partidos jugados)');
  assert.ok(state.leagueTable.rows.every((r) => r.played === 0));

  rollBenchChallenge(state);
  rollPenaltyOpportunityForMatch(state);
  playNextMatch(state, basicDecisions);
  assert.ok(
    state.leagueTable.rows.every((r) => r.played === 1),
    'tras jugar una jornada, todos los clubes deberían tener 1 partido jugado'
  );
});

test('managerRelationship arranca en 55 y resolveSubReaction lo mueve en la dirección correcta', () => {
  const state = createGame('manager-rel-1');
  playChildhood(state);
  assert.equal(state.managerRelationship, 55);

  state.pendingSeason = { pendingSubReaction: { matchIndex: 0 } };
  const moraleBefore = state.player.morale;
  resolveSubReaction(state, 'reclamar');
  assert.ok(state.managerRelationship < 55, 'reclamarle al DT debería empeorar la relación');
  assert.ok(state.player.morale >= moraleBefore, 'reclamar debería subir un poco la moral (desahogo)');
  assert.equal(hasPendingSubReaction(state), false, 'la reacción pendiente debe quedar resuelta');

  state.managerRelationship = 55;
  state.pendingSeason = { pendingSubReaction: { matchIndex: 1 } };
  resolveSubReaction(state, 'calma');
  assert.ok(state.managerRelationship > 55, 'tomarlo con calma debería mejorar la relación con el DT');
});

test('hasPendingSubReaction es false sin temporada en curso o sin sustitución pendiente', () => {
  const state = createGame('manager-rel-2');
  playChildhood(state);
  assert.equal(hasPendingSubReaction(state), false);
  state.pendingSeason = { pendingSubReaction: null };
  assert.equal(hasPendingSubReaction(state), false);
});

test('una relación muy mala con el DT puede forzar una salida anticipada del club', () => {
  const rng = new Rng('forced-transfer-1');
  const state = createGame('manager-rel-3');
  playChildhood(state);
  state.managerRelationship = 5;
  let releasedAtLeastOnce = false;
  for (let i = 0; i < 200 && state.club; i++) {
    const msg = checkForcedTransferListing(state, rng);
    if (msg) {
      releasedAtLeastOnce = true;
      assert.equal(state.club, null);
      assert.equal(state.contract, null);
      assert.equal(state.managerRelationship, 55);
    }
  }
  assert.ok(releasedAtLeastOnce, 'con relación=5 y 200 intentos, debería forzarse la salida al menos una vez');
});

test('una relación excelente con el DT nunca fuerza una salida anticipada', () => {
  const rng = new Rng('forced-transfer-2');
  const state = createGame('manager-rel-4');
  playChildhood(state);
  state.managerRelationship = 90;
  for (let i = 0; i < 200; i++) {
    const msg = checkForcedTransferListing(state, rng);
    assert.equal(msg, null, 'con relación=90 no debería forzarse ninguna salida');
  }
});
