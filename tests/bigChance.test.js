import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Rng } from '../src/state/rng.js';
import { rollBigChanceOpportunity, resolveBigChance, resolvePenalty } from '../src/engine/match.js';
import { createGame, finishChildhood } from '../src/state/gameState.js';
import { startSeason, playNextMatch, rollBigChanceOpportunityForMatch } from '../src/engine/season.js';
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

test('rollBigChanceOpportunity depende de la posición: delanteros mucho más que defensas', () => {
  const rng = new Rng('bigchance-chance');
  const del = { position: 'DEL' };
  const def = { position: 'DEF' };
  let delHits = 0;
  let defHits = 0;
  const trials = 20000;
  for (let i = 0; i < trials; i++) {
    if (rollBigChanceOpportunity(del, rng)) delHits++;
    if (rollBigChanceOpportunity(def, rng)) defHits++;
  }
  assert.ok(delHits > defHits, 'un delantero debe tener más grandes ocasiones que un defensa');
});

test('resolveBigChance: mejor timing (shotQuality alto) convierte más seguido', () => {
  const rng = new Rng('bigchance-resolve');
  const player = { attrs: { sho: 60, dri: 60 } };
  let scoredLow = 0;
  let scoredHigh = 0;
  const trials = 4000;
  for (let i = 0; i < trials; i++) {
    if (resolveBigChance(player, 0.1, rng).scored) scoredLow++;
    if (resolveBigChance(player, 0.95, rng).scored) scoredHigh++;
  }
  assert.ok(scoredHigh > scoredLow, 'un timing casi perfecto debería convertir más que un timing malo');
});

test('resolvePenalty: mejor timing suma sobre la elección de dónde patear', () => {
  const rng = new Rng('penalty-timing');
  const player = { attrs: { sho: 60, men: 60 } };
  let scoredLow = 0;
  let scoredHigh = 0;
  const trials = 4000;
  for (let i = 0; i < trials; i++) {
    if (resolvePenalty(player, 'medio', rng, 0.05).scored) scoredLow++;
    if (resolvePenalty(player, 'medio', rng, 0.95).scored) scoredHigh++;
  }
  assert.ok(scoredHigh > scoredLow, 'un timing casi perfecto debería sumar chances de convertir el penal');
});

test('rollBigChanceOpportunityForMatch nunca dispara si estás lesionado, suspendido o en el banco', () => {
  const state = createGame('bigchance-guard-1');
  playChildhood(state);
  startSeason(state, basicDecisions);
  state.pendingSeason.weeksOut = 4;
  for (let i = 0; i < 30; i++) {
    assert.equal(rollBigChanceOpportunityForMatch(state), false);
  }
});

test('si hay gran ocasión, el feed narra el desenlace del remate', () => {
  const state = createGame('bigchance-integration-1');
  playChildhood(state);
  startSeason(state, basicDecisions);

  let sawBigChance = false;
  for (let i = 0; i < 40 && !sawBigChance && state.pendingSeason && state.pendingSeason.matchIndex < state.pendingSeason.matchesInSeason; i++) {
    state.pendingSeason.pendingBigChance = true;
    const feed = playNextMatch(state, { shotQuality: 0.9 });
    if (feed.some((f) => f.text.includes('⚡'))) sawBigChance = true;
  }
  assert.ok(sawBigChance, 'debería poder forzarse una gran ocasión y ver su desenlace narrado en el feed');
});
