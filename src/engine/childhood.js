// Etapa de infancia (0-15 años), previa al debut profesional a los 16.
// Se divide en 4 tramos con decisiones (algunas controlables por el
// jugador, otras no) que van acumulando modificadores sobre el potencial,
// los atributos iniciales, el carisma y la propensión a lesiones del
// futbolista que se creará al llegar a los 16 años.

function clampMod(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

export const CHILDHOOD_STAGES = [
  { id: 'cuna', ageFrom: 0, ageTo: 3, title: 'Primeros años', prompt: null },
  { id: 'ninez', ageFrom: 3, ageTo: 8, title: 'Niñez', prompt: '¿Cómo pasas tus primeros años?' },
  { id: 'descubrimiento', ageFrom: 8, ageTo: 12, title: 'Descubrimiento del fútbol', prompt: '¿Cómo entras al mundo del fútbol?' },
  { id: 'cantera', ageFrom: 12, ageTo: 16, title: 'Adolescencia y cantera', prompt: '¿En qué te enfocas antes de debutar?' },
];

export function optionsForStage(stageId) {
  return { ninez: NINEZ_OPTIONS, descubrimiento: DESCUBRIMIENTO_OPTIONS, cantera: CANTERA_OPTIONS }[stageId];
}

export function initChildhood() {
  return {
    stageIndex: 0,
    modifiers: { potentialMod: 0, attrMods: {}, carismaMod: 0, injuryMod: 0 },
  };
}

function addAttr(mods, key, delta) {
  mods.attrMods[key] = (mods.attrMods[key] || 0) + delta;
}

/** Etapa 1: no hay decisión real (es un bebé); se narra sola según la
 * familia y el contexto económico ya generados al nacer. No controlable. */
export function rollCunaEvent(state, rng) {
  const pl = state.personalLife;
  const mods = state.childhood.modifiers;
  const lines = [];

  if (pl.family.humble) {
    addAttr(mods, 'men', 1);
    mods.carismaMod += 2;
    lines.push('Creces en una familia humilde. Aprendes temprano a valorar cada oportunidad.');
  } else {
    mods.injuryMod -= 0.01;
    lines.push('Creces con más comodidades que la mayoría de los chicos de tu barrio.');
  }

  if (pl.family.father.archetype.id === 'exigente') {
    addAttr(mods, 'men', 1);
    lines.push('Desde que caminas, tu padre ya te habla de disciplina y sacrificio.');
  } else if (pl.family.mother.archetype.id === 'protectora') {
    mods.injuryMod -= 0.01;
    lines.push('Tu madre cuida cada paso que das como si el mundo fuera de cristal.');
  }

  if (rng.chance(0.08)) {
    mods.potentialMod += 1;
    lines.push('Un pariente que jugó semiprofesional dice que "este niño tiene algo distinto".');
  }

  return lines;
}

export const NINEZ_OPTIONS = [
  {
    id: 'calle',
    label: 'Jugar en la calle con amigos todo el día',
    apply: (mods) => {
      addAttr(mods, 'dri', 2);
      addAttr(mods, 'pac', 1);
      mods.carismaMod += 4;
    },
  },
  {
    id: 'disciplina',
    label: 'Disciplina y estudio en casa',
    apply: (mods) => {
      addAttr(mods, 'men', 3);
      mods.carismaMod -= 2;
    },
  },
  {
    id: 'ayudar',
    label: 'Ayudar en las tareas del hogar',
    apply: (mods) => {
      addAttr(mods, 'phy', 1);
      addAttr(mods, 'men', 2);
      mods.carismaMod += 1;
    },
  },
];

export const DESCUBRIMIENTO_OPTIONS = [
  {
    id: 'barrio',
    label: 'Escuela de fútbol del barrio',
    apply: (mods) => {
      addAttr(mods, 'dri', 2);
      addAttr(mods, 'pas', 1);
    },
  },
  {
    id: 'cantera',
    label: 'Pruebas en la cantera de un club grande',
    apply: (mods, rng, state) => {
      const country = state.country;
      const passes = rng.chance(country.tier <= 3 ? 0.5 : 0.25);
      if (passes) {
        mods.potentialMod += 2;
        return 'Pasas la prueba. Un ojeador anota tu nombre en su cuaderno.';
      }
      addAttr(mods, 'men', 1);
      return 'No te eligen esta vez. Vuelves a practicar solo, más motivado que nunca.';
    },
  },
  {
    id: 'callejero',
    label: 'Fútbol callejero, sin escuela formal',
    apply: (mods) => {
      addAttr(mods, 'dri', 3);
      addAttr(mods, 'pac', 1);
      addAttr(mods, 'men', -1);
    },
  },
];

export const CANTERA_OPTIONS = [
  {
    id: 'tecnico',
    label: 'Enfocarte en lo técnico: tiro, pase y regate',
    apply: (mods) => {
      addAttr(mods, 'sho', 2);
      addAttr(mods, 'pas', 2);
      addAttr(mods, 'dri', 2);
    },
  },
  {
    id: 'fisico',
    label: 'Enfocarte en lo físico: ritmo y potencia',
    apply: (mods) => {
      addAttr(mods, 'pac', 3);
      addAttr(mods, 'phy', 2);
    },
  },
  {
    id: 'mental',
    label: 'Enfocarte en la cabeza: concentración y carácter',
    apply: (mods) => {
      addAttr(mods, 'men', 3);
      mods.carismaMod += 2;
    },
  },
];

export function rollChildhoodSubEvent(state, rng) {
  const mods = state.childhood.modifiers;
  if (state.pendingGenerational && rng.chance(0.5)) {
    return 'Los entrenadores ya murmuran que nunca vieron a nadie de tu edad jugar así.';
  }
  if (rng.chance(0.12)) {
    addAttr(mods, 'phy', 2);
    return 'Un estirón de crecimiento te da una ventaja física notable sobre chicos de tu edad.';
  }
  if (rng.chance(0.08)) {
    mods.injuryMod += 0.03;
    return 'Una lesión infantil te deja unas semanas sin jugar. Nada grave, pero lo recuerdas.';
  }
  return null;
}

/** Aplica la decisión de una etapa y avanza a la siguiente (o marca el fin
 * de la infancia si ya se cumplieron los 16). Devuelve { feed, finished }. */
export function advanceChildhoodStage(state, optionId, rng) {
  const stage = CHILDHOOD_STAGES[state.childhood.stageIndex];
  const mods = state.childhood.modifiers;
  const feed = [];

  if (stage.id === 'cuna') {
    feed.push(...rollCunaEvent(state, rng));
  } else {
    const pool = { ninez: NINEZ_OPTIONS, descubrimiento: DESCUBRIMIENTO_OPTIONS, cantera: CANTERA_OPTIONS }[stage.id];
    const chosen = pool.find((o) => o.id === optionId) || pool[0];
    const result = chosen.apply(mods, rng, state);
    feed.push(typeof result === 'string' ? result : `Eliges: ${chosen.label}.`);
    const sub = rollChildhoodSubEvent(state, rng);
    if (sub) feed.push(sub);
  }

  state.childAge = stage.ageTo;
  state.childhood.stageIndex++;
  const finished = state.childhood.stageIndex >= CHILDHOOD_STAGES.length;
  return { feed, finished, ageNow: stage.ageTo };
}
