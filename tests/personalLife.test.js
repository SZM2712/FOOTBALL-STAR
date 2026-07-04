import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, finishChildhood } from '../src/state/gameState.js';
import { rollPersonalLifeEvent } from '../src/engine/personalLife.js';
import { CHILDHOOD_STAGES, optionsForStage, advanceChildhoodStage } from '../src/engine/childhood.js';

function playChildhood(state) {
  for (const stage of CHILDHOOD_STAGES) {
    const pool = optionsForStage(stage.id);
    const optionId = pool ? pool[0].id : null;
    const { finished } = advanceChildhoodStage(state, optionId, state.rng);
    if (finished) finishChildhood(state);
  }
}

test('rollPersonalLifeEvent nunca ofrece "conocer a alguien" si ya hay pareja', () => {
  const state = createGame('personal-life-1');
  playChildhood(state);
  state.personalLife.partner = { name: 'Test Partner', famous: false, yearsWith: 3 };

  for (let i = 0; i < 200; i++) {
    const ev = rollPersonalLifeEvent(state, state.rng);
    if (ev) assert.notEqual(ev.id, 'conocerAlguien', 'no debería ofrecer conocer a alguien con pareja ya existente');
  }
});

test('rollPersonalLifeEvent nunca ofrece "propuesta" ni "hijo en camino" sin pareja', () => {
  const state = createGame('personal-life-2');
  playChildhood(state);
  assert.equal(state.personalLife.partner, null);

  for (let i = 0; i < 200; i++) {
    const ev = rollPersonalLifeEvent(state, state.rng);
    if (ev) {
      assert.notEqual(ev.id, 'propuesta');
      assert.notEqual(ev.id, 'hijoEnCamino');
    }
  }
});

test('elegir "iniciar una relación" en conocerAlguien realmente crea la pareja', () => {
  const state = createGame('personal-life-3');
  playChildhood(state);

  let event = null;
  for (let i = 0; i < 500 && !event; i++) {
    const ev = rollPersonalLifeEvent(state, state.rng);
    if (ev && ev.id === 'conocerAlguien') event = ev;
  }
  assert.ok(event, 'debería haber podido generar el evento conocerAlguien en 500 intentos');

  const iniciarOpt = event.options.find((o) => o.label.includes('Iniciar'));
  const text = iniciarOpt.run(state, state.rng);
  assert.ok(state.personalLife.partner, 'debe existir una pareja tras elegir iniciar la relación');
  assert.ok(text.includes(state.personalLife.partner.name));
});

test('el evento de negocio nunca aparece si no hay dinero suficiente', () => {
  const state = createGame('personal-life-4');
  playChildhood(state);
  state.money = 0;

  for (let i = 0; i < 300; i++) {
    const ev = rollPersonalLifeEvent(state, state.rng);
    if (ev) assert.notEqual(ev.id, 'negocio');
  }
});
