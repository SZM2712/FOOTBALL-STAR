import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateLeagueSystem } from '../src/data/clubs.js';
import { REAL_CLUB_TWISTS } from '../src/data/realClubNames.js';
import { COUNTRY_BY_CODE } from '../src/data/countries.js';
import { Rng } from '../src/state/rng.js';

test('los países "reconocibles" usan nombres de clubes inspirados en clubes reales (con variación) en primera división', () => {
  const rng = new Rng('clubs-test-es');
  const spain = COUNTRY_BY_CODE.ES;
  const league = generateLeagueSystem(spain, rng);
  const topDivisionNames = league.divisions[0].clubs.map((c) => c.name);
  const overlap = topDivisionNames.filter((n) => REAL_CLUB_TWISTS.ES.includes(n));
  assert.ok(overlap.length > 0, 'debería haber al menos un club con nombre inspirado en un club real de España');
});

test('ningún nombre de club coincide EXACTAMENTE con un club real conocido', () => {
  const REAL_EXACT_NAMES = ['Real Madrid', 'Barcelona', 'Manchester United', 'Liverpool', 'Bayern Múnich', 'Boca Juniors', 'River Plate'];
  const rng = new Rng('clubs-test-no-exact-match');
  for (const code of Object.keys(REAL_CLUB_TWISTS)) {
    const country = COUNTRY_BY_CODE[code];
    if (!country) continue;
    const league = generateLeagueSystem(country, rng);
    for (const club of league.divisions[0].clubs) {
      assert.ok(!REAL_EXACT_NAMES.includes(club.name), `el club "${club.name}" no debe coincidir con un nombre real exacto`);
    }
  }
});

test('los países sin lista curada siguen usando nombres 100% inventados', () => {
  const rng = new Rng('clubs-test-nepal');
  const nepal = COUNTRY_BY_CODE.NP;
  assert.ok(nepal, 'Nepal debe existir en la base de países');
  const league = generateLeagueSystem(nepal, rng);
  assert.ok(league.divisions[0].clubs.length > 0);
  // no debe lanzar error ni depender de REAL_CLUB_TWISTS.NP (que no existe)
  assert.equal(REAL_CLUB_TWISTS.NP, undefined);
});
