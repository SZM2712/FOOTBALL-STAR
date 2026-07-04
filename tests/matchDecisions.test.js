import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Rng } from '../src/state/rng.js';
import { rollPenaltyOpportunity, resolvePenalty, rollRedCardType, PENALTY_CHOICES } from '../src/engine/match.js';
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

test('la chance de penal depende de la posición: delanteros mucho más que defensas', () => {
  const rng = new Rng('penalty-chance');
  const del = { position: 'DEL' };
  const def = { position: 'DEF' };
  const por = { position: 'POR' };
  let delHits = 0;
  let defHits = 0;
  let porHits = 0;
  const trials = 20000;
  for (let i = 0; i < trials; i++) {
    if (rollPenaltyOpportunity(del, rng)) delHits++;
    if (rollPenaltyOpportunity(def, rng)) defHits++;
    if (rollPenaltyOpportunity(por, rng)) porHits++;
  }
  assert.ok(delHits > defHits, 'un delantero debe tener más penales que un defensa');
  assert.equal(porHits, 0, 'un portero nunca debería patear penales en esta simulación');
});

test('resolvePenalty responde a la elección: esquina baja es más segura que ángulo superior', () => {
  const rng = new Rng('penalty-resolve');
  const player = { attrs: { sho: 60, men: 60 } };
  let scoredAngulo = 0;
  let scoredEsquina = 0;
  const trials = 5000;
  for (let i = 0; i < trials; i++) {
    if (resolvePenalty(player, 'angulo', rng).scored) scoredAngulo++;
    if (resolvePenalty(player, 'esquinaBaja', rng).scored) scoredEsquina++;
  }
  assert.ok(scoredEsquina > scoredAngulo, 'la esquina baja debería convertirse más seguido que el ángulo superior');
});

test('cederle el penal a un compañero no depende de los atributos del jugador', () => {
  const rng1 = new Rng('penalty-delegate');
  const rng2 = new Rng('penalty-delegate');
  const weakPlayer = { attrs: { sho: 20, men: 20 } };
  const strongPlayer = { attrs: { sho: 95, men: 95 } };
  let weakScored = 0;
  let strongScored = 0;
  for (let i = 0; i < 3000; i++) {
    if (resolvePenalty(weakPlayer, 'cederlo', rng1).scored) weakScored++;
    if (resolvePenalty(strongPlayer, 'cederlo', rng2).scored) strongScored++;
  }
  const diff = Math.abs(weakScored - strongScored) / 3000;
  assert.ok(diff < 0.06, 'cederlo no debería depender de los atributos del jugador que cede el penal');
});

test('rollRedCardType siempre devuelve merecida o injusta, con ambas alcanzables', () => {
  const rng = new Rng('red-card-type');
  const seen = new Set();
  for (let i = 0; i < 200; i++) seen.add(rollRedCardType(rng));
  assert.ok(seen.has('merecida'));
  assert.ok(seen.has('injusta'));
  assert.equal(seen.size, 2);
});

test('PENALTY_CHOICES incluye la opción de cederlo a un compañero', () => {
  assert.ok(PENALTY_CHOICES.cederlo);
  assert.equal(PENALTY_CHOICES.cederlo.delegate, true);
});

test('el evento de dopaje solo se ofrece si no te atraparon antes', () => {
  const state = createGame('doping-event-1');
  playChildhood(state);
  state.personalLife.vices.dopajeCaught = true;

  for (let i = 0; i < 300; i++) {
    const ev = rollPersonalLifeEvent(state, state.rng);
    if (ev) assert.notEqual(ev.id, 'dopajeTentacion');
  }
});

test('aceptar el riesgo de dopaje sube atributos pero puede terminar en sanción', () => {
  const state = createGame('doping-event-2');
  playChildhood(state);

  let event = null;
  for (let i = 0; i < 500 && !event; i++) {
    const ev = rollPersonalLifeEvent(state, state.rng);
    if (ev && ev.id === 'dopajeTentacion') event = ev;
  }
  assert.ok(event, 'debería poder generarse el evento de dopaje en 500 intentos');

  const aceptar = event.options.find((o) => o.label.includes('Aceptar'));
  const formBefore = state.player.form;
  const text = aceptar.run(state, state.rng);
  assert.ok(state.personalLife.vices.dopaje >= 1);
  assert.ok(state.player.form >= formBefore, 'la forma debería subir (salvo que ya estuviera en el tope)');
  assert.ok(typeof text === 'string' && text.length > 0);
});
