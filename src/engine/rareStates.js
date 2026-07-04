// Motor centralizado de "Estados Raros". Todo lo relacionado a probabilidad,
// elegibilidad, pity system y efectos vive aquí para que sea testeable de
// forma aislada (ver tests/rareStates.test.js).

export const RARE_STATE_DEFS = {
  LA_ZONA: {
    id: 'LA_ZONA',
    name: 'La Zona',
    category: 'positivo',
    perMatch: true,
    desc: 'Todo lo que tocas se convierte en gol. Esta noche eres intocable.',
  },
  SEGUNDO_AIRE: {
    id: 'SEGUNDO_AIRE',
    name: 'Segundo Aire',
    category: 'positivo',
    duration: 2,
    desc: 'El cuerpo dice que ya pasó tu mejor momento. Tú decides ignorarlo.',
  },
  IDOLO_ETERNO: {
    id: 'IDOLO_ETERNO',
    name: 'Ídolo Eterno',
    category: 'positivo',
    permanent: true,
    desc: 'Rechazaste la fortuna por una camiseta. Ahora esa camiseta es tuya para siempre.',
  },
  LA_MALDICION: {
    id: 'LA_MALDICION',
    name: 'La Maldición',
    category: 'negativo',
    duration: 2,
    desc: 'Un penal, una final, un silencio de estadio. La prensa no te lo perdona.',
  },
  CRISTAL: {
    id: 'CRISTAL',
    name: 'Cristal',
    category: 'negativo',
    permanent: true,
    desc: 'Tu cuerpo ya no es el mismo. Cada partido es una apuesta.',
  },
  CAIDA_LIBRE: {
    id: 'CAIDA_LIBRE',
    name: 'Caída Libre',
    category: 'negativo',
    duration: 2,
    desc: 'El escándalo se comió tu carrera antes de que pudieras defenderte.',
  },
  MERCENARIO_DE_ORO: {
    id: 'MERCENARIO_DE_ORO',
    name: 'Mercenario de Oro',
    category: 'mixto',
    permanent: true,
    irreversible: true,
    desc: 'Elegiste la fortuna. El prestigio y la selección ya no te esperan.',
  },
  TRASPASO_MALDITO: {
    id: 'TRASPASO_MALDITO',
    name: 'El Traspaso Maldito',
    category: 'mixto',
    duration: 2,
    desc: 'Fichaste por un gigante. El gigante no te quiere.',
  },
  CAMALEON: {
    id: 'CAMALEON',
    name: 'Camaleón',
    category: 'mixto',
    duration: 2,
    desc: 'Un entrenador ve en ti algo que ni tú sabías que existía.',
  },
};

export const MAX_RARE_STATES_PER_CAREER = 3;
export const GENERATIONAL_PROBABILITY = 0.001;
export const PITY_WINDOW = [5, 15];

export function rollGenerational(rng) {
  return rng.chance(GENERATIONAL_PROBABILITY);
}

/**
 * Probabilidad de "La Zona" en un partido concreto.
 * Base 0.5%, hasta 8% si se cumplen TODAS las condiciones (x5 si es Generacional).
 */
export function laZonaProbability(player, matchCtx, tracker) {
  if (tracker?.guaranteedZona && matchCtx.highPressure) return 1;

  const conditions = [
    player.form >= 95 && player.monthsSinceInjury >= 12,
    player.attrs.men >= 90,
    player.chemistry >= 85,
    (player.consecutiveInvisibleTraining || 0) >= 3,
    matchCtx.highPressure === true,
    Array.isArray(player.recentRatings) &&
      player.recentRatings.length >= 5 &&
      player.recentRatings.slice(-5).every((r) => r >= 8.0),
  ];
  const met = conditions.filter(Boolean).length;
  const frac = met / conditions.length;
  let p = 0.005 + (0.08 - 0.005) * Math.pow(frac, 3);
  if (player.generational) p *= 5;
  return Math.min(player.generational ? 0.25 : 0.08, p);
}

/** Registro de progreso que acumula señales de decisiones del jugador
 * a lo largo de la carrera; alimenta tanto los chequeos anuales como
 * el pity system. */
export class RareStateTracker {
  constructor(json) {
    if (json) {
      Object.assign(this, json);
      return;
    }
    this.active = null; // { id, startedYear, yearsRemaining }
    this.history = []; // [{ id, startedYear, endedYear, resolution }]
    this.profile = {
      physicalCareStreak: 0,
      physicalNeglectStreak: 0,
      invisibleTrainingStreak: 0,
      rejectedBigOffers: 0,
      seasonsAtCurrentClub: 0,
      partyRiskEvents: 0,
      humilityStreak: 0,
      pressureFailures: 0,
      pressureSuccesses: 0,
    };
    this.legendaryNights = 0;
    this.guaranteedZona = false;
    this.pityResolved = false;
  }

  signal(key, delta = 1) {
    this.profile[key] = (this.profile[key] || 0) + delta;
  }

  canStartNew() {
    return !this.active && this.history.length < MAX_RARE_STATES_PER_CAREER;
  }

  start(id, careerYear, meta = {}) {
    if (!this.canStartNew()) return false;
    const def = RARE_STATE_DEFS[id];
    this.active = { id, startedYear: careerYear, yearsRemaining: def.duration || null, meta };
    return true;
  }

  /** Avanza un año el estado activo (si lo hay), resolviéndolo si corresponde. */
  tickYear(careerYear) {
    if (!this.active) return null;
    const def = RARE_STATE_DEFS[this.active.id];
    if (def.permanent) return null; // permanentes no expiran solos
    if (this.active.yearsRemaining != null) {
      this.active.yearsRemaining -= 1;
      if (this.active.yearsRemaining <= 0) {
        return this.resolve('expiró');
      }
    }
    return null;
  }

  resolve(resolution) {
    if (!this.active) return null;
    const finished = { ...this.active, endedYear: null, resolution };
    this.history.push(finished);
    const id = this.active.id;
    this.active = null;
    return id;
  }

  isActive(id) {
    return this.active?.id === id;
  }

  hasHad(id) {
    return this.history.some((h) => h.id === id) || this.active?.id === id;
  }

  toJSON() {
    return {
      active: this.active,
      history: this.history,
      profile: this.profile,
      legendaryNights: this.legendaryNights,
      guaranteedZona: this.guaranteedZona,
      pityResolved: this.pityResolved,
    };
  }

  static fromJSON(json) {
    return new RareStateTracker(json);
  }
}

/**
 * Chequeo anual de estados de carrera (no La Zona, que es por partido).
 * Devuelve el id del estado iniciado, o null.
 */
export function tryAnnualCareerStates(tracker, player, careerYear, rng) {
  if (!tracker.canStartNew()) {
    return null;
  }

  const candidates = [];

  if (
    player.age >= 32 &&
    tracker.profile.physicalCareStreak >= 5 &&
    !tracker.hasHad('SEGUNDO_AIRE')
  ) {
    candidates.push({ id: 'SEGUNDO_AIRE', p: 0.04 });
  }

  if (tracker.profile.rejectedBigOffers >= 3 && !tracker.hasHad('IDOLO_ETERNO')) {
    candidates.push({ id: 'IDOLO_ETERNO', p: 0.012 });
  }

  for (const c of candidates) {
    if (rng.chance(c.p)) {
      tracker.start(c.id, careerYear);
      return c.id;
    }
  }

  // Pity system: garantiza al menos un estado raro entre los años 5 y 15.
  const [wStart, wEnd] = PITY_WINDOW;
  if (!tracker.pityResolved && tracker.history.length === 0 && !tracker.active) {
    const forcedNow = careerYear >= wEnd || (careerYear >= wStart && rng.chance(0.12));
    if (forcedNow) {
      const chosen = pickPityState(tracker.profile, player, rng);
      tracker.pityResolved = true;
      if (chosen === 'LA_ZONA_GUARANTEE') {
        tracker.guaranteedZona = true;
      } else {
        tracker.start(chosen, careerYear, { pity: true });
      }
      return chosen;
    }
  }

  return null;
}

/** Elige qué estado forzar en el pity system según el perfil de decisiones. */
export function pickPityState(profile, player, rng) {
  if (profile.physicalNeglectStreak >= profile.physicalCareStreak + 4 && profile.physicalNeglectStreak >= 8) {
    return 'CRISTAL';
  }
  if (profile.seasonsAtCurrentClub >= 10 && profile.rejectedBigOffers >= 3) {
    return 'IDOLO_ETERNO';
  }
  if (profile.partyRiskEvents >= 4) {
    return 'CAIDA_LIBRE';
  }
  if (player.age >= 30 && profile.physicalCareStreak >= 3) {
    return 'SEGUNDO_AIRE';
  }
  // sin perfil dominante: se garantiza una Noche de Leyenda (La Zona)
  return 'LA_ZONA_GUARANTEE';
}

export function narrativeFor(id) {
  return RARE_STATE_DEFS[id]?.desc || '';
}
