// Generador pseudoaleatorio determinista (mulberry32) para que cada
// carrera tenga una semilla reproducible y compartible.

export function hashSeed(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
}

export function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randomSeed() {
  return Math.random().toString(36).slice(2, 10).toUpperCase();
}

/** RNG con API cómoda encima de mulberry32, ligado a una semilla de texto.
 * El estado interno (this.a) es serializable para poder guardar/cargar
 * partidas de forma exactamente reproducible. */
export class Rng {
  constructor(seed, internalState) {
    this.seed = seed || randomSeed();
    if (internalState !== undefined) {
      this.a = internalState;
    } else {
      const seeder = hashSeed(this.seed);
      this.a = seeder();
    }
  }

  /** [0, 1) */
  float() {
    this.a |= 0;
    this.a = (this.a + 0x6d2b79f5) | 0;
    let t = Math.imul(this.a ^ (this.a >>> 15), 1 | this.a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  toJSON() {
    return { seed: this.seed, a: this.a };
  }

  static fromJSON(json) {
    return new Rng(json.seed, json.a);
  }

  /** [min, max) */
  range(min, max) {
    return min + this.float() * (max - min);
  }

  /** entero en [min, max] inclusive */
  int(min, max) {
    return Math.floor(this.range(min, max + 1));
  }

  /** true con probabilidad p (0-1) */
  chance(p) {
    return this.float() < p;
  }

  /** elige un elemento del arreglo */
  pick(arr) {
    return arr[this.int(0, arr.length - 1)];
  }

  /** elige un elemento ponderado: items = [{item, weight}] */
  weighted(items, weightFn = (x) => x.weight) {
    const total = items.reduce((s, it) => s + weightFn(it), 0);
    let r = this.float() * total;
    for (const it of items) {
      r -= weightFn(it);
      if (r <= 0) return it;
    }
    return items[items.length - 1];
  }

  /** distribución normal aproximada (Box-Muller) */
  gaussian(mean = 0, stdev = 1) {
    const u = 1 - this.float();
    const v = this.float();
    const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    return z * stdev + mean;
  }

  shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = this.int(0, i);
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
}
