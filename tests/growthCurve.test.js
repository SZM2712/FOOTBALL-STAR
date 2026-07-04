import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ageFactor } from '../src/engine/growthCurve.js';

test('crecimiento fuerte entre los 16 y los 23 años', () => {
  const a16 = ageFactor(16, 'MED');
  const a19 = ageFactor(19, 'MED');
  const a23 = ageFactor(23, 'MED');
  assert.ok(a16 < a19, '16 debe ser menor que 19');
  assert.ok(a19 < a23, '19 debe ser menor que 23');
});

test('pico de rendimiento entre 26 y 29 años (~1.0)', () => {
  for (const age of [26, 27, 28, 29]) {
    const f = ageFactor(age, 'MED');
    assert.ok(f >= 0.98 && f <= 1.01, `edad ${age} debería estar en el pico, obtuvo ${f}`);
  }
});

test('declive a partir de los 31 para posiciones estándar', () => {
  const peak = ageFactor(29, 'MED');
  const declined = ageFactor(34, 'MED');
  assert.ok(declined < peak, 'debe declinar tras el pico');
  const veryOld = ageFactor(38, 'MED');
  assert.ok(veryOld < declined, 'el declive debe acentuarse con más edad');
});

test('porteros y centrales duran más que delanteros', () => {
  const gkAt35 = ageFactor(35, 'POR');
  const defAt35 = ageFactor(35, 'DEF');
  const forwardAt35 = ageFactor(35, 'DEL');
  assert.ok(gkAt35 > forwardAt35, 'un portero a los 35 debe rendir mejor que un delantero');
  assert.ok(defAt35 > forwardAt35, 'un defensa central a los 35 debe rendir mejor que un delantero');
});

test('el factor nunca baja del piso mínimo ni supera ~1.05', () => {
  for (const age of [16, 20, 25, 30, 35, 40, 45]) {
    for (const pos of ['POR', 'DEF', 'MED', 'DEL']) {
      const f = ageFactor(age, pos);
      assert.ok(f >= 0.2 && f <= 1.05, `factor fuera de rango para ${pos} a los ${age}: ${f}`);
    }
  }
});
