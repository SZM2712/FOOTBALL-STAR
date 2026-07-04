import { randomPersonName, randomFemaleName } from '../data/names.js';

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
    mother: { name: randomFemaleName(rng, confed), archetype: rng.pick(MOTHER_ARCHETYPES), relationship: 70 + rng.int(-10, 15), alive: true },
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
    vices: { alcohol: 0, gambling: 0, drugs: 0, dopaje: 0, dopajeCaught: false, dopajeRedeemed: false, addiction: null, rehabAttempts: 0, recovered: false },
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

/** Payoff de haber apoyado a un hijo con talento: si sigue el fútbol y
 * llega a edad de firmar, hay una chance real de debutar como profesional.
 * Se llama una vez por año (mismo momento que familyYearlyEvent). */
export function checkChildProDebut(state, rng) {
  const pl = state.personalLife;
  for (const kid of pl.children) {
    if (kid.proDebut || !kid.talent || kid.pursuingFootball !== true) continue;
    const age = state.year - kid.bornYear;
    if (age < 16 || age > 20) continue;
    const chance = 0.3 + (kid.bond - 65) / 250;
    if (rng.chance(Math.max(0.1, Math.min(0.7, chance)))) {
      kid.proDebut = true;
      state.fame = clamp(state.fame + 3);
      pl.reputation = clamp(pl.reputation + 4);
      return `Tu hijo/a ${kid.name} firma su primer contrato profesional. Lo ves debutar desde la tribuna, con el pecho hinchado: el apellido sigue en las canchas.`;
    }
  }
  return null;
}

/** Eventos pasivos de pareja: solo lo que realmente no se puede "elegir"
 * (que te descubran, o una ruptura repentina). Conocer a alguien, casarte,
 * tener hijos, etc. ahora son decisiones interactivas: ver
 * rollPersonalLifeEvent() más abajo. */
export function partnerYearlyEvent(state, rng) {
  const pl = state.personalLife;
  if (pl.partner) {
    pl.partner.yearsWith++;
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
  }
  return null;
}

// ---------------------------------------------------------------------------
// Eventos interactivos de vida personal: cada uno se resuelve con una
// decisión real del jugador (2-3 opciones), no solo con narración pasiva.
// rollPersonalLifeEvent() elige como mucho UNO por año.
// ---------------------------------------------------------------------------

function clampMoney(v) {
  return Math.max(0, v);
}

const PERSONAL_EVENTS = {
  conocerAlguien: {
    eligible: (state) => !state.personalLife.partner,
    chance: (state) => 0.2 + state.fame / 400,
    build: (state, rng) => {
      const name = randomFemaleName(rng, state.country.confed);
      return {
        id: 'conocerAlguien',
        title: 'Alguien nuevo en tu vida',
        desc: `Conoces a ${name} en una salida con amigos y hay una conexión real. ¿Qué haces?`,
        options: [
          {
            label: 'Iniciar una relación',
            run: (state, rng) => {
              state.personalLife.partner = { name, famous: state.fame > 55 && rng.chance(0.5), yearsWith: 0 };
              return `Comienzas una relación con ${name}.`;
            },
          },
          {
            label: 'Mantenerte enfocado en tu carrera',
            run: (state) => {
              state.player.attrs.men = clamp(state.player.attrs.men + 1);
              return 'Decides que, por ahora, tu única prioridad es el fútbol.';
            },
          },
        ],
      };
    },
  },

  propuesta: {
    eligible: (state) => state.personalLife.partner && !state.personalLife.married && state.personalLife.partner.yearsWith >= 2,
    chance: () => 0.35,
    build: (state) => {
      const name = state.personalLife.partner.name;
      return {
        id: 'propuesta',
        title: 'Un siguiente paso',
        desc: `Sientes que es momento de dar el siguiente paso con ${name}.`,
        options: [
          {
            label: 'Proponerle matrimonio',
            run: (state) => {
              state.personalLife.married = true;
              state.fame = clamp(state.fame + (state.personalLife.partner.famous ? 8 : 2));
              state.player.morale = clamp(state.player.morale + 6);
              return `Te casas con ${name}. Todo el país futbolero comenta la boda.`;
            },
          },
          {
            label: 'Esperar un poco más',
            run: () => 'Decides que todavía no es el momento. Todo sigue como está.',
          },
          {
            label: 'Terminar la relación',
            run: (state) => {
              state.personalLife.partner = null;
              state.player.morale = clamp(state.player.morale - 4);
              return `Terminas tu relación con ${name}.`;
            },
          },
        ],
      };
    },
  },

  hijoEnCamino: {
    eligible: (state) => state.personalLife.married && state.player.age >= 22,
    chance: () => 0.16,
    build: (state) => {
      const name = state.personalLife.partner.name;
      return {
        id: 'hijoEnCamino',
        title: 'Noticias en casa',
        desc: `${name} te cuenta que están esperando un hijo. ¿Cómo te preparas?`,
        options: [
          {
            label: 'Pedir tiempo al club para estar presente',
            run: (state, rng) => {
              const childName = randomPersonName(rng, state.country.confed).split(' ')[0];
              state.personalLife.children.push({ name: childName, bornYear: state.year, talent: rng.chance(0.15), bond: 70, pursuingFootball: null, proDebut: false });
              state.player.morale = clamp(state.player.morale + 10);
              state.player.form = clamp(state.player.form - 3);
              return `¡Nace tu hijo/a ${childName}! Eliges estar presente, aunque el ritmo de entrenamiento resiente un poco.`;
            },
          },
          {
            label: 'Mantener el ritmo profesional al máximo',
            run: (state, rng) => {
              const childName = randomPersonName(rng, state.country.confed).split(' ')[0];
              state.personalLife.children.push({ name: childName, bornYear: state.year, talent: rng.chance(0.15), bond: 55, pursuingFootball: null, proDebut: false });
              state.player.morale = clamp(state.player.morale + 4);
              state.fame = clamp(state.fame + 1);
              return `¡Nace tu hijo/a ${childName}! Sigues entrenando al máximo nivel; tu familia lo entiende, aunque cuesta.`;
            },
          },
        ],
      };
    },
  },

  hijoNecesitaAtencion: {
    eligible: (state) => state.personalLife.children.some((c) => state.year - c.bornYear >= 2 && state.year - c.bornYear <= 13),
    chance: () => 0.16,
    build: (state, rng) => {
      const kid = rng.pick(state.personalLife.children.filter((c) => state.year - c.bornYear >= 2 && state.year - c.bornYear <= 13));
      return {
        id: 'hijoNecesitaAtencion',
        title: `${kid.name} te necesita`,
        desc: `${kid.name} tiene un acto escolar importante justo en medio de la pretemporada. ¿Qué haces?`,
        options: [
          {
            label: 'Estar presente, cueste lo que cueste',
            run: (state) => {
              kid.bond = clamp(kid.bond + 10);
              state.player.morale = clamp(state.player.morale + 5);
              state.player.form = clamp(state.player.form - 3);
              return `Vas al acto de ${kid.name}. La cara que pone al verte ahí no tiene precio, aunque el cuerpo técnico nota tu ausencia en la pretemporada.`;
            },
          },
          {
            label: 'Priorizar el trabajo con el equipo',
            run: (state) => {
              kid.bond = clamp(kid.bond - 8);
              state.player.form = clamp(state.player.form + 2);
              state.managerRelationship = clamp(state.managerRelationship + 3);
              return `Te quedás entrenando. ${kid.name} lo entiende, pero se nota que le hubiese gustado verte ahí.`;
            },
          },
        ],
      };
    },
  },

  hijoSigueTusPasos: {
    eligible: (state) =>
      state.personalLife.children.some((c) => c.talent && c.pursuingFootball == null && state.year - c.bornYear >= 13 && state.year - c.bornYear <= 16),
    chance: () => 0.2,
    build: (state, rng) => {
      const candidates = state.personalLife.children.filter(
        (c) => c.talent && c.pursuingFootball == null && state.year - c.bornYear >= 13 && state.year - c.bornYear <= 16
      );
      const kid = rng.pick(candidates);
      return {
        id: 'hijoSigueTusPasos',
        title: `${kid.name} quiere seguir tus pasos`,
        desc: `${kid.name} te pide que lo lleves a probarse en las inferiores de tu club. Se nota que tiene algo especial con la pelota.`,
        options: [
          {
            label: 'Apoyarlo de lleno en el fútbol',
            run: (state) => {
              kid.pursuingFootball = true;
              kid.bond = clamp(kid.bond + 8);
              state.player.morale = clamp(state.player.morale + 4);
              return `Llevás a ${kid.name} a probarse. Los ojeadores del club se van impresionados.`;
            },
          },
          {
            label: 'Dejar que elija su propio camino',
            run: (state) => {
              kid.pursuingFootball = false;
              kid.bond = clamp(kid.bond + 4);
              state.personalLife.reputation = clamp(state.personalLife.reputation + 2);
              return `Le decís que el camino lo elige él. Se lo agradece, aunque en el fondo esperabas otra respuesta.`;
            },
          },
        ],
      };
    },
  },

  tentacion: {
    eligible: (state) => !!state.personalLife.partner,
    chance: () => 0.06,
    build: () => ({
      id: 'tentacion',
      title: 'Una tentación',
      desc: 'En un evento privado, alguien coquetea contigo abiertamente. Tu pareja no está cerca.',
      options: [
        {
          label: 'Resistir y mantenerte fiel',
          run: (state) => {
            state.player.attrs.men = clamp(state.player.attrs.men + 2);
            state.personalLife.reputation = clamp(state.personalLife.reputation + 2);
            return 'Resistes la tentación. Te vas a casa tranquilo.';
          },
        },
        {
          label: 'Ceder a la tentación',
          run: (state, rng) => {
            if (rng.chance(0.5)) {
              const wasMarried = state.personalLife.married;
              const lost = wasMarried ? state.money * rng.range(0.2, 0.4) : 0;
              state.money = clampMoney(state.money - lost);
              state.personalLife.divorces += wasMarried ? 1 : 0;
              state.personalLife.financeMisfortune += lost;
              state.personalLife.partner = null;
              state.personalLife.married = false;
              state.player.morale = clamp(state.player.morale - 10);
              state.fame = clamp(state.fame - 8);
              return wasMarried
                ? `Se filtra todo. Tu matrimonio termina y el reparto te cuesta €${lost.toFixed(1)}M.`
                : 'Se filtra todo. Tu relación termina en medio de un escándalo mediático.';
            }
            state.player.carisma = clamp(state.player.carisma + 2);
            return 'Cedes a la tentación. Por esta vez, nadie se entera.';
          },
        },
      ],
    }),
  },

  enfermedad: {
    eligible: () => true,
    chance: () => 0.05,
    build: () => ({
      id: 'enfermedad',
      title: 'Fiebre antes del partido',
      desc: 'Te despiertas con fiebre alta justo antes de un partido clave. El cuerpo técnico espera tu decisión.',
      options: [
        {
          label: 'Jugar igual, el equipo te necesita',
          run: (state, rng) => {
            if (rng.chance(0.4)) {
              state.player.form = clamp(state.player.form - 15);
              state.player.fitness = clamp(state.player.fitness - 20);
              return 'Juegas con fiebre y el cuerpo te pasa factura. Rindes muy por debajo de tu nivel.';
            }
            state.player.morale = clamp(state.player.morale + 4);
            state.personalLife.reputation = clamp(state.personalLife.reputation + 2);
            return 'Juegas con fiebre y sacas fuerzas de donde no hay. La afición lo valora.';
          },
        },
        {
          label: 'Pedir descanso y cuidarte',
          run: (state) => {
            state.player.form = clamp(state.player.form + 5);
            state.player.chemistry = clamp(state.player.chemistry - 2);
            return 'Te quedas afuera para cuidarte. Te recuperas bien, aunque algunos compañeros lo notan.';
          },
        },
      ],
    }),
  },

  negocio: {
    eligible: (state) => state.money >= 1,
    chance: () => 0.1,
    build: () => ({
      id: 'negocio',
      title: 'Una oportunidad de negocio',
      desc: 'Un ex compañero te propone invertir en su nuevo emprendimiento.',
      options: [
        {
          label: 'Invertir fuerte',
          run: (state, rng) => {
            const amount = state.money * 0.3;
            state.money -= amount;
            if (rng.chance(0.45)) {
              state.personalLife.financeMisfortune += amount;
              return `Inviertes fuerte (€${amount.toFixed(1)}M) y el negocio se hunde. Pierdes todo.`;
            }
            const gain = amount * rng.range(1.5, 3);
            state.money += gain;
            return `Inviertes fuerte (€${amount.toFixed(1)}M) y el negocio despega. Ganancia: €${gain.toFixed(1)}M.`;
          },
        },
        {
          label: 'Invertir poco, por las dudas',
          run: (state, rng) => {
            const amount = state.money * 0.08;
            state.money -= amount;
            if (rng.chance(0.4)) {
              state.personalLife.financeMisfortune += amount;
              return `Inviertes poco (€${amount.toFixed(1)}M) y aun así lo pierdes. Al menos no dolió tanto.`;
            }
            const gain = amount * rng.range(1.2, 2);
            state.money += gain;
            return `Inviertes con cautela (€${amount.toFixed(1)}M) y recuperas con ganancia: €${gain.toFixed(1)}M.`;
          },
        },
        {
          label: 'No arriesgar tus ahorros',
          run: () => 'Prefieres no arriesgar tus ahorros esta vez.',
        },
      ],
    }),
  },

  vestuario: {
    eligible: () => true,
    chance: () => 0.1,
    build: () => ({
      id: 'vestuario',
      title: 'Tensión en el vestuario',
      desc: 'Un compañero te acusa frente al plantel de no pasarle el balón lo suficiente.',
      options: [
        {
          label: 'Hablarlo en privado con él',
          run: (state) => {
            state.player.chemistry = clamp(state.player.chemistry + 5);
            state.personalLife.friends.vestuario = clamp(state.personalLife.friends.vestuario + 8);
            return 'Hablas con él en privado y aclaran las cosas. El vestuario respira mejor.';
          },
        },
        {
          label: 'Ignorarlo y seguir a lo tuyo',
          run: (state) => {
            state.player.chemistry = clamp(state.player.chemistry - 4);
            state.personalLife.friends.vestuario = clamp(state.personalLife.friends.vestuario - 6);
            return 'Ignoras el reclamo. La tensión queda flotando en el vestuario.';
          },
        },
        {
          label: 'Responder con dureza frente a todos',
          run: (state) => {
            state.player.chemistry = clamp(state.player.chemistry - 8);
            state.personalLife.friends.vestuario = clamp(state.personalLife.friends.vestuario - 12);
            state.fame = clamp(state.fame + 2);
            return 'Le respondes con dureza delante de todos. Los medios se enteran igual.';
          },
        },
      ],
    }),
  },

  mentorORival: {
    eligible: () => true,
    chance: () => 0.06,
    build: (state) => {
      const isYoung = state.player.age <= 21;
      return {
        id: 'mentorORival',
        title: isYoung ? 'Un consejo del veterano' : 'El rival de tu generación',
        desc: isYoung
          ? 'El veterano del plantel te lleva aparte y te da un consejo que no pediste.'
          : 'Un rival de tu misma generación te desafía públicamente antes del próximo cruce.',
        options: isYoung
          ? [
              {
                label: 'Escuchar con humildad',
                run: (state) => {
                  state.player.attrs.men = clamp(state.player.attrs.men + 3);
                  state.personalLife.friends.vestuario = clamp(state.personalLife.friends.vestuario + 3);
                  return 'Escuchas con humildad. El consejo te queda grabado para siempre.';
                },
              },
              {
                label: 'Hacerlo a tu manera',
                run: (state) => {
                  state.player.carisma = clamp(state.player.carisma + 2);
                  return 'Agradeces el consejo, pero decides seguir haciendo las cosas a tu manera.';
                },
              },
            ]
          : [
              {
                label: 'Competir con respeto',
                run: (state) => {
                  state.fame = clamp(state.fame + 2);
                  state.player.attrs.men = clamp(state.player.attrs.men + 2);
                  return 'Respondes con respeto. La prensa valora tu clase.';
                },
              },
              {
                label: 'Responder con provocación',
                run: (state) => {
                  state.fame = clamp(state.fame + 4);
                  state.player.chemistry = clamp(state.player.chemistry - 3);
                  return 'Respondes con fuego. La previa del partido ya es un espectáculo aparte.';
                },
              },
            ],
      };
    },
  },

  entrenadorPadre: {
    eligible: (state) => state.personalLife.family.father.alive && state.player.age <= 26,
    chance: (state) => (state.personalLife.family.father.archetype.id === 'exigente' ? 0.12 : 0.06),
    build: (state) => ({
      id: 'entrenadorPadre',
      title: 'Una oferta de tu padre',
      desc: `${state.personalLife.family.father.name} te ofrece volver a ser tu entrenador personal en la pretemporada, como cuando eras chico.`,
      options: [
        {
          label: 'Aceptar: entrenar con él',
          run: (state) => {
            state.player.attrs.men = clamp(state.player.attrs.men + 3);
            state.personalLife.family.father.relationship = clamp(state.personalLife.family.father.relationship + 8);
            if (state.rng.chance(0.25)) {
              state.player.form = clamp(state.player.form - 5);
              return `Entrenas con ${state.personalLife.family.father.name}, pero sus métodos ya quedaron viejos. Se acercan, aunque tu forma resiente un poco.`;
            }
            state.player.form = clamp(state.player.form + 6);
            return `Entrenas con ${state.personalLife.family.father.name}. Vuelven a sentirse como en el potrero del barrio, y rinde.`;
          },
        },
        {
          label: 'Rechazar con cariño',
          run: (state) => {
            state.personalLife.family.father.relationship = clamp(state.personalLife.family.father.relationship - 4);
            return 'Le agradeces, pero preferís seguir con el cuerpo técnico del club. Se lo toma bien, aunque un poco dolido.';
          },
        },
      ],
    }),
  },

  ahorrosFamilia: {
    eligible: (state) => state.personalLife.family.humble && state.player.age <= 23 && (state.personalLife.family.father.alive || state.personalLife.family.mother.alive),
    chance: () => 0.08,
    build: (state) => ({
      id: 'ahorrosFamilia',
      title: 'Los ahorros de tus padres',
      desc: 'Tus padres te ofrecen sus ahorros de toda la vida para pagarte un mejor preparador físico y un agente con más contactos.',
      options: [
        {
          label: 'Aceptar el sacrificio',
          run: (state, rng) => {
            const gift = Math.min(state.money + 2, rng.range(0.5, 1.5));
            state.money += gift;
            state.player.attrs.phy = clamp(state.player.attrs.phy + 2);
            state.personalLife.reputation = clamp(state.personalLife.reputation + 3);
            return `Aceptas. Con lo poco que tienen, te dan €${gift.toFixed(1)}M y toda su fe. No pensás defraudarlos.`;
          },
        },
        {
          label: 'Rechazar: que se queden con lo suyo',
          run: (state) => {
            state.player.attrs.men = clamp(state.player.attrs.men + 2);
            state.personalLife.reputation = clamp(state.personalLife.reputation + 5);
            return 'Rechazas el ofrecimiento. Prefieres que guarden sus ahorros; te las arreglarás solo.';
          },
        },
      ],
    }),
  },

  mudanzaFamilia: {
    eligible: (state) => (state.personalLife.family.father.alive || state.personalLife.family.mother.alive) && state.player.age >= 20,
    chance: () => 0.05,
    build: () => ({
      id: 'mudanzaFamilia',
      title: 'Tus padres quieren estar más cerca',
      desc: 'Tus padres te ofrecen mudarse a la ciudad donde jugás, para acompañarte de cerca en esta etapa.',
      options: [
        {
          label: 'Aceptar: que se muden con vos',
          run: (state) => {
            if (state.personalLife.family.father.alive) state.personalLife.family.father.relationship = clamp(state.personalLife.family.father.relationship + 6);
            if (state.personalLife.family.mother.alive) state.personalLife.family.mother.relationship = clamp(state.personalLife.family.mother.relationship + 6);
            state.player.morale = clamp(state.player.morale + 5);
            if (state.personalLife.partner && state.rng.chance(0.2)) {
              state.player.morale = clamp(state.player.morale - 4);
              return 'Se mudan cerca tuyo. Los tenés siempre presentes, aunque tu pareja siente que perdieron algo de espacio propio.';
            }
            return 'Se mudan cerca tuyo. Tenerlos tan presentes te da una paz que no sabías que necesitabas.';
          },
        },
        {
          label: 'Mantener la distancia por ahora',
          run: (state) => {
            if (state.personalLife.family.father.alive) state.personalLife.family.father.relationship = clamp(state.personalLife.family.father.relationship - 3);
            if (state.personalLife.family.mother.alive) state.personalLife.family.mother.relationship = clamp(state.personalLife.family.mother.relationship - 3);
            return 'Les pedís un poco más de tiempo. Lo entienden, aunque se nota la distancia en las llamadas.';
          },
        },
      ],
    }),
  },

  dopajeTentacion: {
    eligible: (state) => !state.personalLife.vices.dopajeCaught && state.player.age <= 34,
    chance: (state) => 0.05 + (state.player.form < 50 ? 0.03 : 0),
    build: () => ({
      id: 'dopajeTentacion',
      title: 'Una oferta poco limpia',
      desc: 'Un preparador poco escrupuloso te ofrece algo para rendir más este año. "Nadie lo va a notar", dice.',
      options: [
        {
          label: 'Rechazar. Jugar limpio.',
          run: (state) => {
            state.personalLife.reputation = clamp(state.personalLife.reputation + 3);
            return 'Rechazas la oferta. Duermes tranquilo esa noche.';
          },
        },
        {
          label: 'Aceptar el riesgo',
          run: (state, rng) => {
            const pl = state.personalLife;
            pl.vices.dopaje += 1;
            state.player.form = clamp(state.player.form + 15);
            state.player.attrs.phy = clamp(state.player.attrs.phy + 3);
            state.player.attrs.pac = clamp(state.player.attrs.pac + 2);
            const caughtNow = rng.chance(0.22 + pl.vices.dopaje * 0.05);
            if (caughtNow) {
              pl.vices.dopajeCaught = true;
              state.suspensionWeeks = (state.suspensionWeeks || 0) + rng.int(26, 52);
              pl.reputation = clamp(pl.reputation - 35);
              state.fame = clamp(state.fame - 20);
              if (state.rareTracker.canStartNew() && !state.rareTracker.hasHad('CAIDA_LIBRE') && rng.chance(0.5)) {
                state.rareTracker.start('CAIDA_LIBRE', state.year);
                return 'Control antidopaje positivo. Todo se derrumba de golpe: sanción larga y tu nombre queda marcado. Caída Libre.';
              }
              return 'Control antidopaje positivo. Sanción larga y un golpe durísimo a tu reputación.';
            }
            return 'Aceptas el riesgo. Rindes mejor este año... y nadie parece haberse dado cuenta. Por ahora.';
          },
        },
      ],
    }),
  },
};

/** Camino de redención tras un control antidopaje positivo: con tiempo y
 * buen comportamiento, la reputación se puede reconstruir de a poco. */
export function dopingRedemptionCheck(state, rng) {
  const pl = state.personalLife;
  if (!pl.vices.dopajeCaught || pl.vices.dopajeRedeemed) return null;
  if (pl.reputation >= 55) {
    pl.vices.dopajeRedeemed = true;
    return 'Con años de trabajo limpio y resultados, la gente empieza a olvidar el episodio del dopaje. Historia de redención.';
  }
  if (rng.chance(0.15)) {
    pl.reputation = clamp(pl.reputation + 5);
    return 'Trabajás en silencio para reconstruir tu imagen tras el escándalo de dopaje.';
  }
  return null;
}

/** Se llama una sola vez por año, antes de simulateSeason (mismo patrón que
 * rollPressConferenceQuestion): decide de forma determinista si hay un
 * evento interactivo de vida personal este año, y cuál. */
export function rollPersonalLifeEvent(state, rng) {
  const ids = rng.shuffle(Object.keys(PERSONAL_EVENTS));
  for (const id of ids) {
    const def = PERSONAL_EVENTS[id];
    if (!def.eligible(state)) continue;
    if (!rng.chance(def.chance(state))) continue;
    return def.build(state, rng);
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
