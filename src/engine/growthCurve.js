// Curva de edad: qué fracción del potencial rinde un jugador a cada edad,
// modulada por posición (porteros y centrales duran más).
// Función pura y testeable.

const POSITION_MODIFIERS = {
  POR: { peakExtension: 6, declineRate: 0.012, riseSpeed: 0.9 },
  DEF: { peakExtension: 3, declineRate: 0.018, riseSpeed: 1.0 },
  MED: { peakExtension: 0, declineRate: 0.024, riseSpeed: 1.05 },
  DEL: { peakExtension: -1, declineRate: 0.03, riseSpeed: 1.1 },
};

export const PEAK_START = 26;
export const PEAK_END_BASE = 30;
export const DECLINE_START_BASE = 31;

/**
 * Devuelve un factor ~[0.3, 1.05] que representa qué porcentaje de su
 * potencial rinde el jugador a esta edad.
 */
export function ageFactor(age, position = 'MED', extraLongevity = 0) {
  const mod = POSITION_MODIFIERS[position] || POSITION_MODIFIERS.MED;
  const peakEnd = PEAK_END_BASE + mod.peakExtension + extraLongevity;

  if (age <= 15) return 0.4;
  if (age <= 23) {
    // crecimiento fuerte 16-23
    const t = (age - 15) / 8;
    return 0.42 + 0.46 * Math.min(1, t) * mod.riseSpeed;
  }
  if (age <= PEAK_START) {
    // acercamiento al pico 23-26
    const t = (age - 23) / (PEAK_START - 23);
    return Math.min(1.0, 0.88 + 0.12 * t);
  }
  if (age <= peakEnd) {
    return 1.0; // pico 26-29 (o más para POR/DEF)
  }
  // declive desde los 31 (o más tarde según posición)
  const yearsIntoDecline = age - peakEnd;
  const decline = mod.declineRate * yearsIntoDecline * yearsIntoDecline * 0.5 + mod.declineRate * yearsIntoDecline * 0.5;
  return Math.max(0.25, 1.0 - decline);
}

export function isGrowthPhase(age) {
  return age < PEAK_START;
}

export function isDeclinePhase(age, position, extraLongevity = 0) {
  const mod = POSITION_MODIFIERS[position] || POSITION_MODIFIERS.MED;
  return age > PEAK_END_BASE + mod.peakExtension + extraLongevity;
}
