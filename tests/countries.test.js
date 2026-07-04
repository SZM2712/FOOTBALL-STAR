import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COUNTRIES, pickBirthCountry } from '../src/data/countries.js';
import { Rng } from '../src/state/rng.js';

test('la base de datos tiene una cantidad amplia de países (~200) sin duplicados', () => {
  assert.ok(COUNTRIES.length >= 150, `se esperaban al menos 150 países, hay ${COUNTRIES.length}`);
  const codes = new Set(COUNTRIES.map((c) => c.code));
  assert.equal(codes.size, COUNTRIES.length, 'no debe haber códigos de país duplicados');
});

test('todos los países tienen los campos requeridos y tiers válidos', () => {
  for (const c of COUNTRIES) {
    assert.ok(c.name && c.confed && c.tier >= 1 && c.tier <= 6, `país inválido: ${JSON.stringify(c)}`);
    assert.ok(c.nt >= 0 && c.nt <= 100, `fuerza de selección fuera de rango: ${c.code}`);
    assert.ok(Array.isArray(c.routes) && c.routes.length > 0, `país sin ruta de emigración: ${c.code}`);
    assert.ok(c.weight > 0, `peso de nacimiento inválido: ${c.code}`);
  }
});

test('el nacimiento está ponderado hacia tiers altos pero cualquier país es posible', () => {
  const rng = new Rng('birth-distribution-test');
  const tierCounts = {};
  const codeCounts = {};
  const trials = 50000;
  for (let i = 0; i < trials; i++) {
    const c = pickBirthCountry(rng);
    tierCounts[c.tier] = (tierCounts[c.tier] || 0) + 1;
    codeCounts[c.code] = (codeCounts[c.code] || 0) + 1;
  }
  assert.ok(tierCounts[1] > tierCounts[6], 'tier 1 debe salir más seguido que tier 6');
  const tier6Countries = COUNTRIES.filter((c) => c.tier === 6);
  const anyTier6Hit = tier6Countries.some((c) => codeCounts[c.code] > 0);
  assert.ok(anyTier6Hit, 'en 50.000 intentos, al menos un país tier 6 debería haber salido alguna vez');
});
