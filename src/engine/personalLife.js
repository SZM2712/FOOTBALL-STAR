import { randomPersonName } from '../data/names.js';

const FATHER_ARCHETYPES = [
  { id: 'exigente', text: 'un padre exigente que fue futbolista frustrado y vive tu carrera como propia' },
  { id: 'ausente', text: 'un padre que trabajó siempre lejos de casa para sostener a la familia' },
  { id: 'entrenador', text: 'un padre que fue tu primer entrenador en el potrero del barrio' },
];
const MOTHER_ARCHETYPES = [
  { id: 'protectora', text: 'una madre protectora que teme que el fútbol te cambie' },
  { id: 'motor', text: 'una madre que sostuvo la casa entera para que pudieras entrenar' },
  { id: 'fan', text: 'una madre que no se pierde un partido, ni en la tribuna ni por streaming' },
];

export function generateFamily(rng, confed) {
  return {
    father: { name: randomPersonName(rng, confed), archetype: rng.pick(FATHER_ARCHETYPES), relationship: 65 + rng.int(-10, 15), alive: true },
    mother: { name: randomPersonName(rng, confed), archetype: rng.pick(MOTHER_ARCHETYPES), relationship: 70 + rng.int(-10, 15), alive: true },
    humble: rng.chance(0.55),
  };
}

export function initPersonalLife(rng, confed) {
  return {
    family: generateFamily(rng, confed),
    familyLog: [],
    partner: null,
    married: false,
    divorces: 0,
    children: [],
    friends: { barrio: 60, vestuario: 55, fama: 30 },
    vices: { alcohol: 0, gambling: 0, drugs: 0, addiction: null, rehabAttempts: 0, recovered: false },
    hobbies: [],
    reputation: 55,
    purchases: [],
    lifetimeBanned: false,
    financeMisfortune: 0,
  };
}

/** Eventos familiares del año: enfermedad, orgullo, presión económica, muerte. */
export function familyYearlyEvent(state, rng) {
  const pl = state.personalLife;
  if (pl.family.humble && state.player.age < 22 && rng.chance(0.12)) {
    pl.familyLog.push('presionEconomica');
    return {
      text: 'Tu familia hipotecó la casa para pagar tu academia. Cada entrenamiento pesa un poco más.',
      moraleD: -3,
      menD: 2,
    };
  }
  if (rng.chance(0.05)) {
    const parent = rng.pick(['father', 'mother']);
    if (pl.family[parent].alive) {
      pl.family[parent].alive = false;
      return {
        text: `Pierdes a tu ${parent === 'father' ? 'padre' : 'madre'}. El golpe es enorme, pero decides dedicarle cada gol que viene.`,
        moraleD: -12,
        formD: -10,
        dedicatoria: true,
      };
    }
  }
  if (state.fame > 50 && rng.chance(0.04)) {
    return { text: 'Tu familia disfruta con orgullo de verte en la televisión nacional.', moraleD: 4 };
  }
  return null;
}

export function partnerYearlyEvent(state, rng) {
  const pl = state.personalLife;
  if (!pl.partner && state.fame > 15 && rng.chance(0.18)) {
    pl.partner = { name: randomPersonName(rng, state.country.confed), famous: state.fame > 55 && rng.chance(0.5), yearsWith: 0 };
    return { text: `Comienzas una relación con ${pl.partner.name}.` };
  }
  if (pl.partner) {
    pl.partner.yearsWith++;
    if (!pl.married && pl.partner.yearsWith >= 2 && rng.chance(0.22)) {
      pl.married = true;
      return { text: `Te casas con ${pl.partner.name}. Todo el país futbolero comenta la boda.`, moraleD: 6, famedD: pl.partner.famous ? 8 : 2 };
    }
    if (rng.chance(0.05)) {
      const infidelityRisk = pl.vices.alcohol > 40 || state.fame > 70;
      if (infidelityRisk && rng.chance(0.35)) {
        return {
          text: 'Una infidelidad sale a la luz. La prensa rosa se ceba contigo.',
          moraleD: -8,
          famedD: -6,
          scandal: true,
        };
      }
    }
    if (pl.married && rng.chance(0.05)) {
      pl.married = false;
      pl.divorces++;
      const lossPct = rng.range(0.3, 0.5);
      const lost = state.money * lossPct;
      state.money -= lost;
      pl.partner = null;
      pl.financeMisfortune += lost;
      return { text: `Te divorcias de tu pareja. El reparto de bienes te cuesta €${lost.toFixed(1)}M.`, moraleD: -10 };
    }
    if (pl.married && state.player.age >= 22 && rng.chance(0.14)) {
      const name = randomPersonName(rng, state.country.confed).split(' ')[0];
      pl.children.push({ name, bornYear: state.year, talent: rng.chance(0.15) });
      return { text: `¡Nace tu hijo/a ${name}! La vida cambia de prioridades.`, moraleD: 8 };
    }
  }
  return null;
}

export const HOBBIES = {
  videojuegos: { label: 'Videojuegos', apply: (s) => { s.player.carisma = clamp(s.player.carisma + 1); s.player.chemistry = clamp(s.player.chemistry + 2); } },
  lectura: { label: 'Lectura', apply: (s) => { s.player.attrs.men = clamp(s.player.attrs.men + 2); } },
  musica: { label: 'Música', apply: (s) => { s.player.carisma = clamp(s.player.carisma + 3); } },
  negocios: { label: 'Negocios', apply: (s) => { s.money += Math.max(0.1, s.fame / 25); } },
  golf: { label: 'Golf', apply: (s) => { s.fame = clamp(s.fame + 1); } },
  filantropia: { label: 'Filantropía', apply: (s) => { s.personalLife.reputation = clamp(s.personalLife.reputation + 4); s.fame = clamp(s.fame + 2); } },
};

export const TRAVEL_OPTIONS = {
  descanso: { label: 'Descanso total', apply: (s) => { s.player.form = clamp(s.player.form + 10); } },
  cultural: { label: 'Viaje cultural', apply: (s) => { s.player.attrs.men = clamp(s.player.attrs.men + 2); } },
  ibiza: {
    label: 'Fiesta en Ibiza',
    apply: (s, rng) => {
      s.player.carisma = clamp(s.player.carisma + 4);
      s.personalLife.vices.alcohol = clamp(s.personalLife.vices.alcohol + 8);
      if (rng.chance(0.15)) return 'Una foto filtrada de la fiesta genera revuelo mediático.';
      return null;
    },
  },
  pueblo: {
    label: 'Volver a tu pueblo natal',
    apply: (s) => {
      s.rareTracker.signal('humilityStreak');
      s.personalLife.reputation = clamp(s.personalLife.reputation + 3);
    },
  },
};

function clamp(v, min = 0, max = 100) {
  return Math.max(min, Math.min(max, v));
}

/** Paquetes de "vida fuera de la cancha": combinan hobby + vacaciones +
 * vida social + apuestas en UNA sola decisión con identidad propia, en vez
 * de tres modales sueltos y repetitivos. Cada uno es una apuesta distinta:
 * calma vs. ambición vs. fama vs. riesgo. */
export const LIFESTYLE_PACKAGES = [
  {
    id: 'familiar',
    label: 'Vida tranquila junto a los tuyos',
    desc: 'Cerca de la familia, lejos del ruido mediático.',
    hobby: 'lectura',
    travel: 'pueblo',
    party: 'ninguna',
    gambling: 'no',
  },
  {
    id: 'ambicion',
    label: 'Ambición y negocios',
    desc: 'Construyes algo propio fuera de la cancha.',
    hobby: 'negocios',
    travel: 'cultural',
    party: 'ninguna',
    gambling: 'no',
  },
  {
    id: 'estrella',
    label: 'Vida de estrella mediática',
    desc: 'Cámaras, fama y mucho carisma... con riesgo de escándalo.',
    hobby: 'musica',
    travel: 'ibiza',
    party: 'intensa',
    gambling: 'no',
  },
  {
    id: 'foco',
    label: 'Foco total en el fútbol',
    desc: 'Nada te distrae de tu profesión.',
    hobby: null,
    travel: 'descanso',
    party: 'ninguna',
    gambling: 'no',
  },
  {
    id: 'riesgo',
    label: 'Vivir al límite',
    desc: 'Apuestas, fiestas y adrenalina fuera de la cancha.',
    hobby: 'videojuegos',
    travel: 'ibiza',
    party: 'moderada',
    gambling: 'ocasional',
  },
  {
    id: 'social',
    label: 'Salidas con el grupo, sin excesos',
    desc: 'Equilibrio entre diversión y responsabilidad.',
    hobby: 'golf',
    travel: 'cultural',
    party: 'moderada',
    gambling: 'no',
  },
  {
    id: 'filantropo',
    label: 'Causas benéficas y comunidad',
    desc: 'Devuelves algo a la gente que te vio crecer.',
    hobby: 'filantropia',
    travel: 'pueblo',
    party: 'ninguna',
    gambling: 'no',
  },
];

/** Fiestas y vicios: sistema de riesgo/recompensa que puede derivar en adicción. */
export function partyDecision(state, rng, intensity) {
  const pl = state.personalLife;
  const feed = [];
  if (intensity === 'ninguna') return feed;
  const carismaGain = intensity === 'moderada' ? 2 : 5;
  const riskBase = intensity === 'moderada' ? 0.06 : 0.16;
  state.player.carisma = clamp(state.player.carisma + carismaGain);
  pl.friends.fama = clamp(pl.friends.fama + carismaGain);
  pl.vices.alcohol = clamp(pl.vices.alcohol + (intensity === 'moderada' ? 4 : 12));

  if (rng.chance(riskBase)) {
    const roll = rng.float();
    if (roll < 0.4) {
      state.player.form = clamp(state.player.form - 8);
      feed.push('Fotos de la fiesta se filtran. Tu forma física resiente los excesos.');
    } else if (roll < 0.7 && state.rareTracker.canStartNew()) {
      feed.push('Una lesión tonta tras la fiesta te deja fuera varias semanas.');
      state.player.fitness = clamp(state.player.fitness - 25);
    } else {
      pl.reputation = clamp(pl.reputation - 10);
      feed.push('Escándalo en la prensa por tus excesos. Tu reputación cae.');
      state.rareTracker.signal('partyRiskEvents');
    }
  }
  return feed;
}

/** Apuestas/alcohol/drogas como espiral realista de adicción. */
export function viceSpiralCheck(state, rng) {
  const pl = state.personalLife;
  const feed = [];
  if (pl.vices.addiction) {
    const v = pl.vices.addiction;
    state.player.form = clamp(state.player.form - 6);
    state.player.attrs.men = clamp(state.player.attrs.men - 3);
    if (rng.chance(0.22)) {
      pl.vices.rehabAttempts++;
      if (rng.chance(0.45 + pl.vices.rehabAttempts * 0.1)) {
        pl.vices.addiction = null;
        pl.vices.recovered = true;
        feed.push(`Tras un largo proceso de rehabilitación, superas la adicción a ${v}. Historia de redención.`);
      } else {
        feed.push(`Recaída en tu adicción a ${v}. El camino de vuelta es más largo de lo esperado.`);
      }
    }
    if (rng.chance(0.1)) {
      feed.push(`Control antidopaje positivo relacionado con ${v}. Sanción de la federación.`);
      state.suspensionWeeks = (state.suspensionWeeks || 0) + rng.int(26, 104);
      if (rng.chance(0.4) && state.rareTracker.canStartNew() && !state.rareTracker.hasHad('CAIDA_LIBRE')) {
        state.rareTracker.start('CAIDA_LIBRE', state.year);
        feed.push('El escándalo espiral: bancado, marginado, tu valor de mercado se desploma. Caída Libre.');
      }
    }
    return feed;
  }
  if (pl.vices.alcohol > 55 && rng.chance(0.08)) {
    pl.vices.addiction = 'alcohol';
    feed.push('Lo que empezó como fiestas ocasionales se convirtió en una adicción al alcohol.');
  } else if (pl.vices.gambling > 55 && rng.chance(0.08)) {
    pl.vices.addiction = 'apuestas';
    feed.push('Las apuestas dejaron de ser un pasatiempo: ahora es una adicción que controla tu vida.');
  }
  return feed;
}

/** Decisión explícita de apostar (separada de las fiestas). Alimenta el
 * medidor de vicio "gambling" y, en el extremo, el riesgo de apuestas
 * ilegales en partidos propios. */
export function gamblingDecision(state, rng, intensity) {
  const pl = state.personalLife;
  if (!intensity || intensity === 'no') return [];
  const gain = intensity === 'ocasional' ? 6 : 16;
  pl.vices.gambling = clamp(pl.vices.gambling + gain);
  const feed = [];
  if (intensity === 'fuerte' && rng.chance(0.08)) {
    state.money = Math.max(0, state.money - state.money * rng.range(0.05, 0.2));
    feed.push('Una mala racha en las apuestas te cuesta una parte seria de tus ahorros.');
  }
  return feed;
}

export function illegalBettingEvent(state, rng) {
  const gambling = state.personalLife.vices.gambling;
  if (gambling <= 0) return null;
  const p = 0.0006 * (gambling / 10);
  if (rng.chance(p)) {
    state.personalLife.lifetimeBanned = true;
    return 'Se descubre que apostaste ilegalmente en partidos propios. Sanción de por vida: quedas Expulsado del Fútbol.';
  }
  return null;
}

export function buyLuxury(state, item) {
  const catalog = {
    casa: { cost: 4, label: 'una mansión' },
    auto: { cost: 1.2, label: 'un auto de lujo' },
    clubAmateur: { cost: 2.5, label: 'el club amateur de tu pueblo natal' },
  };
  const def = catalog[item];
  if (!def || state.money < def.cost) return null;
  state.money -= def.cost;
  state.personalLife.purchases.push(item);
  return `Compras ${def.label}.`;
}
