import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, finishChildhood } from '../src/state/gameState.js';
import { generateOffers } from '../src/engine/transferMarket.js';
import { CHILDHOOD_STAGES, optionsForStage, advanceChildhoodStage } from '../src/engine/childhood.js';

function playChildhood(state) {
  for (const stage of CHILDHOOD_STAGES) {
    const pool = optionsForStage(stage.id);
    const optionId = pool ? pool[0].id : null;
    const { finished } = advanceChildhoodStage(state, optionId, state.rng);
    if (finished) finishChildhood(state);
  }
}

test('un jugador de nivel mundial solo recibe ofertas de países de tier 1-2 (nunca de un país como Fiyi)', () => {
  const state = createGame('transfer-realism-star');
  playChildhood(state);
  state.player.attrs = { pac: 90, sho: 92, pas: 88, dri: 91, def: 30, phy: 85, men: 90 };
  state.fame = 90;

  for (let i = 0; i < 100; i++) {
    const offers = generateOffers(state);
    for (const o of offers) {
      assert.ok(o.country.tier <= 2, `una superestrella no debería recibir ofertas de ${o.country.name} (tier ${o.country.tier})`);
    }
  }
});

test('un jugador flojo solo recibe ofertas de países de tier 4-6', () => {
  const state = createGame('transfer-realism-weak');
  playChildhood(state);
  state.player.attrs = { pac: 40, sho: 38, pas: 40, dri: 38, def: 25, phy: 40, men: 38 };

  for (let i = 0; i < 100; i++) {
    const offers = generateOffers(state);
    for (const o of offers) {
      assert.ok(o.country.tier >= 4, `un jugador flojo no debería recibir ofertas de ${o.country.name} (tier ${o.country.tier})`);
    }
  }
});

test('el club de la oferta nunca queda desconectado del rating del jugador (fallback usa el más parecido)', () => {
  const state = createGame('transfer-realism-fallback');
  playChildhood(state);
  state.player.attrs = { pac: 75, sho: 78, pas: 74, dri: 76, def: 40, phy: 70, men: 72 };

  for (let i = 0; i < 50; i++) {
    const offers = generateOffers(state);
    for (const o of offers) {
      assert.ok(o.club.rating > 20, 'el club ofertante debería tener un rating mínimamente creíble');
    }
  }
});
