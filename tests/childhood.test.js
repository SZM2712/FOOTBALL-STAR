import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, finishChildhood } from '../src/state/gameState.js';
import { CHILDHOOD_STAGES, advanceChildhoodStage, optionsForStage } from '../src/engine/childhood.js';

test('la partida arranca en fase childhood, a los 0 años, sin jugador todavía', () => {
  const state = createGame('childhood-test-1');
  assert.equal(state.phase, 'childhood');
  assert.equal(state.childAge, 0);
  assert.equal(state.player, null);
  assert.equal(state.club, null);
});

test('las 4 etapas de infancia llevan de los 0 a los 16 años y crean al jugador profesional', () => {
  const state = createGame('childhood-test-2');
  for (const stage of CHILDHOOD_STAGES) {
    const pool = optionsForStage(stage.id);
    const optionId = pool ? pool[0].id : null;
    const { finished } = advanceChildhoodStage(state, optionId, state.rng);
    if (!finished) {
      assert.equal(state.childAge, stage.ageTo);
    }
  }
  assert.equal(state.childAge, 16);

  finishChildhood(state);
  assert.equal(state.phase, 'career');
  assert.ok(state.player, 'debe existir un jugador tras finishChildhood');
  assert.equal(state.player.age, 16);
  assert.ok(state.club, 'debe tener un club asignado al debutar');
  assert.ok(state.contract, 'debe tener contrato al debutar');
});

test('las decisiones de la cantera (12-16) modifican los atributos iniciales del jugador', () => {
  const stateFisico = createGame('childhood-fisico');
  const stateTecnico = createGame('childhood-tecnico');

  // avanzar las primeras 3 etapas igual en ambas
  for (const state of [stateFisico, stateTecnico]) {
    advanceChildhoodStage(state, null, state.rng); // cuna
    advanceChildhoodStage(state, 'disciplina', state.rng); // niñez
    advanceChildhoodStage(state, 'barrio', state.rng); // descubrimiento
  }

  advanceChildhoodStage(stateFisico, 'fisico', stateFisico.rng);
  advanceChildhoodStage(stateTecnico, 'tecnico', stateTecnico.rng);

  finishChildhood(stateFisico);
  finishChildhood(stateTecnico);

  // el enfoque físico en la cantera debería reflejarse en más ritmo/físico relativo a técnica
  const fisicoPacPhy = stateFisico.player.attrs.pac + stateFisico.player.attrs.phy;
  const tecnicoPacPhy = stateTecnico.player.attrs.pac + stateTecnico.player.attrs.phy;
  const fisicoTechnical = stateFisico.player.attrs.sho + stateFisico.player.attrs.pas + stateFisico.player.attrs.dri;
  const tecnicoTechnical = stateTecnico.player.attrs.sho + stateTecnico.player.attrs.pas + stateTecnico.player.attrs.dri;

  assert.ok(fisicoPacPhy > tecnicoPacPhy, 'enfoque físico debería dar más ritmo+físico que el enfoque técnico');
  assert.ok(tecnicoTechnical > fisicoTechnical, 'enfoque técnico debería dar más tiro+pase+regate que el enfoque físico');
});

test('un jugador Generacional siempre llega a los 16 con potencial 99', () => {
  // probamos varias semillas hasta encontrar una Generacional (0.1% de probabilidad)
  let found = false;
  for (let i = 0; i < 5000 && !found; i++) {
    const state = createGame(`gen-search-${i}`);
    if (state.pendingGenerational) {
      for (const stage of CHILDHOOD_STAGES) {
        const pool = optionsForStage(stage.id);
        advanceChildhoodStage(state, pool ? pool[0].id : null, state.rng);
      }
      finishChildhood(state);
      assert.equal(state.player.potential, 99);
      assert.equal(state.player.generational, true);
      found = true;
    }
  }
  assert.ok(found, 'debería haberse encontrado al menos una semilla Generacional en 5000 intentos');
});
