import { randomPersonName } from '../data/names.js';
import { ageFactor } from './growthCurve.js';

export const POSITIONS = ['POR', 'DEF', 'MED', 'DEL'];
export const POSITION_LABELS = { POR: 'Portero', DEF: 'Defensa', MED: 'Mediocampista', DEL: 'Delantero' };
export const SUBROLES = {
  POR: ['Portero de área', 'Portero líbero'],
  DEF: ['Central', 'Lateral'],
  MED: ['Mediocentro', 'Volante de creación', 'Volante de contención'],
  DEL: ['Extremo', 'Delantero centro'],
};

export const ATTR_KEYS = ['pac', 'sho', 'pas', 'dri', 'def', 'phy', 'men'];
export const ATTR_LABELS = { pac: 'Ritmo', sho: 'Tiro', pas: 'Pase', dri: 'Regate', def: 'Defensa', phy: 'Físico', men: 'Mentalidad' };

export const POSITION_WEIGHTS = {
  POR: { pac: 0.05, sho: 0.02, pas: 0.15, dri: 0.03, def: 0.4, phy: 0.2, men: 0.15 },
  DEF: { pac: 0.15, sho: 0.05, pas: 0.15, dri: 0.1, def: 0.35, phy: 0.15, men: 0.05 },
  MED: { pac: 0.12, sho: 0.13, pas: 0.28, dri: 0.2, def: 0.12, phy: 0.1, men: 0.05 },
  DEL: { pac: 0.22, sho: 0.3, pas: 0.1, dri: 0.2, def: 0.03, phy: 0.1, men: 0.05 },
};

export function overallRating(player) {
  const w = POSITION_WEIGHTS[player.position];
  let total = 0;
  for (const k of ATTR_KEYS) total += player.attrs[k] * w[k];
  return Math.round(total);
}

function samplePotential(rng) {
  // distribución sesgada: la mayoría entre 60-80, cola alta rara.
  const base = 58 + rng.gaussian(12, 8);
  return Math.max(58, Math.min(94, Math.round(base)));
}

/**
 * options.childhood: modificadores acumulados durante la infancia (0-15),
 * ver engine/childhood.js. Todos son opcionales y por defecto neutros.
 */
export function createPlayer(rng, country, options = {}) {
  const position = options.position || rng.pick(POSITIONS);
  const subRole = rng.pick(SUBROLES[position]);
  const ch = options.childhood || {};
  const potential = options.potential ?? Math.max(58, Math.min(97, samplePotential(rng) + (ch.potentialMod || 0)));
  const startAge = 16;
  const factor = ageFactor(startAge, position);

  const attrs = {};
  for (const k of ATTR_KEYS) {
    const w = POSITION_WEIGHTS[position][k];
    // atributos relevantes a la posición parten más altos, el resto más bajos
    const base = potential * factor * (0.55 + w * 1.6);
    const childBonus = ch.attrMods?.[k] || 0;
    attrs[k] = clampAttr(Math.round(base + childBonus + rng.gaussian(0, 4)));
  }

  return {
    id: `p-${Math.floor(rng.float() * 1e9).toString(36)}`,
    name: options.name || randomPersonName(rng, country.confed),
    countryCode: country.code,
    originalCountryCode: country.code,
    position,
    subRole,
    age: startAge,
    attrs,
    potential,
    injuryProneness: Math.max(0.02, Math.min(0.5, rng.gaussian(0.1, 0.05) + (ch.injuryMod || 0))),
    carisma: Math.round(Math.max(15, Math.min(95, rng.gaussian(50, 15) + (ch.carismaMod || 0)))),
    chemistry: 55,
    morale: 70,
    form: 60,
    fitness: 100,
    generational: false,
    retired: false,
    yearsProCounter: 0,
    consecutiveInvisibleTraining: 0,
    monthsSinceInjury: 999,
    extraLongevity: 0,
  };
}

export function clampAttr(v) {
  return Math.max(15, Math.min(99, v));
}

export function growAttributes(player, rng, trainingBonus = {}) {
  const factor = ageFactor(player.age, player.position, player.extraLongevity || 0);
  for (const k of ATTR_KEYS) {
    const w = POSITION_WEIGHTS[player.position][k];
    const targetCeiling = player.potential * factor * (0.55 + w * 1.6);
    const current = player.attrs[k];
    const pull = (targetCeiling - current) * 0.35;
    const bonus = trainingBonus[k] || 0;
    const noise = rng.gaussian(0, 1.2);
    player.attrs[k] = clampAttr(Math.round(current + pull + bonus + noise));
  }
}
