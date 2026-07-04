// Banco de eventos narrativos aleatorios de partido y utilidades de lesión.

export const MATCH_EVENTS = {
  hatTrickClasico: {
    p: 0.12,
    when: (ctx) => ctx.goals >= 3,
    text: (p) => `¡Hat-trick de ${p.name}! El estadio entero canta su nombre.`,
  },
  golazoChilena: {
    p: 0.05,
    when: (ctx) => ctx.goals >= 1,
    text: (p) => `${p.name} conecta una chilena imposible. Hasta el rival aplaude de pie.`,
  },
  penalFallado: {
    p: 0.06,
    when: (ctx) => ctx.highPressure && ctx.missedPenalty,
    text: (p) => `${p.name} falla un penal decisivo. El silencio del estadio pesa una tonelada.`,
    tag: 'penalFallado',
  },
  expulsionPolemica: {
    p: 0.02,
    when: () => true,
    text: (p) => `Expulsión muy discutida para ${p.name}. El árbitro no quiere ni mirar la repetición.`,
  },
  asistenciaOlimpica: {
    p: 0.08,
    when: (ctx) => ctx.assists >= 1,
    text: (p) => `${p.name} reparte una asistencia de otro planeta para el gol del triunfo.`,
  },
  atajadaMilagro: {
    p: 0.1,
    when: (ctx) => ctx.position === 'POR' && ctx.goodMatch,
    text: (p) => `${p.name} saca una mano milagrosa bajo el travesaño en el último minuto.`,
  },
  golDeUltimoMinuto: {
    p: 0.09,
    when: (ctx) => ctx.goals >= 1 && ctx.highPressure,
    text: (p) => `¡Gol de ${p.name} en el descuento! La grada se vuelve loca.`,
  },
};

export function rollMatchEvents(player, rng, ctx) {
  const events = [];
  for (const [key, def] of Object.entries(MATCH_EVENTS)) {
    if (!def.when(ctx)) continue;
    if (rng.chance(def.p)) events.push({ key, tag: def.tag, text: def.text(player) });
  }
  return events;
}

const INJURY_SEVERITY = ['leve', 'moderada', 'grave'];

/** Devuelve null o { severity, weeksOut, text } */
export function rollInjury(player, rng, fatigue = 0) {
  const base = 0.015 + player.injuryProneness * 0.06 + fatigue * 0.02;
  if (!rng.chance(base)) return null;
  const roll = rng.float();
  let severity;
  if (roll < 0.55) severity = 'leve';
  else if (roll < 0.88) severity = 'moderada';
  else severity = 'grave';
  const weeksOut = severity === 'leve' ? rng.int(1, 3) : severity === 'moderada' ? rng.int(4, 10) : rng.int(16, 40);
  return {
    severity,
    weeksOut,
    text:
      severity === 'grave'
        ? `Lesión grave: ${player.name} se rompe en pleno partido. La recuperación será larga.`
        : severity === 'moderada'
        ? `Lesión moderada para ${player.name}, se pierde varias semanas.`
        : `Molestia física para ${player.name}, nada preocupante por ahora.`,
  };
}

export const PRESS_QUESTIONS = [
  {
    q: '¿Cómo respondes a las críticas por tu bajón de nivel?',
    options: [
      { label: 'Con humildad: "Trabajaré más duro"', moraleD: 4, famedD: -1, pressD: 6 },
      { label: 'Con arrogancia: "Ya demostré lo que valgo"', moraleD: -2, famedD: 3, pressD: -8 },
      { label: 'Evasiva: "Solo pienso en el próximo partido"', moraleD: 1, famedD: 0, pressD: 0 },
    ],
  },
  {
    q: 'Un rival te provocó en la previa. ¿Qué respondes?',
    options: [
      { label: 'Ignorarlo con clase', moraleD: 2, famedD: 1, pressD: 2 },
      { label: 'Responder con fuego en la prensa', moraleD: 3, famedD: 4, pressD: -4 },
      { label: 'Pedir que hablen los goles', moraleD: 1, famedD: 2, pressD: 3 },
    ],
  },
  {
    q: 'Te preguntan si te vas del club el próximo verano.',
    options: [
      { label: '"Mi futuro está aquí"', moraleD: 3, famedD: 0, pressD: 5, loyaltySignal: true },
      { label: '"Eso lo decide mi agente"', moraleD: -1, famedD: -1, pressD: -3 },
      { label: 'No responder directamente', moraleD: 0, famedD: 0, pressD: 0 },
    ],
  },
];
