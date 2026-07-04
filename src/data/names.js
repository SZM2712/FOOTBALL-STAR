// Generadores de nombres ficticios (personas, lugares, clubes) para que cada
// partida tenga variedad sin depender de nombres reales con copyright.

const SYLLABLES_LATIN = ['ca', 'ro', 'sa', 'lo', 'ri', 'ta', 'ma', 'no', 'va', 'du', 'bre', 'lan', 'gos', 'via', 'mira', 'cor', 'te', 'bal', 'fu', 'sol'];
const SYLLABLES_SLAVIC = ['zo', 'vic', 'ka', 'ne', 'sla', 'gra', 'nov', 'sky', 'ra', 'do', 'bel', 'mir', 'ovo', 'ska'];
const SYLLABLES_NORDIC = ['bjo', 'fjo', 'ny', 'sto', 'holm', 'vik', 'lund', 'gard', 'ny', 'ro', 'sen'];
const SYLLABLES_AFRO = ['ka', 'bo', 'lu', 'we', 'ma', 'ndi', 'ta', 'so', 'yo', 'ba', 'ki', 'zu'];
const SYLLABLES_ASIAN = ['shin', 'ta', 'ko', 'mi', 'jo', 'wa', 'sei', 'ryu', 'han', 'yo', 'zen'];

function poolForConfed(confed, tier) {
  switch (confed) {
    case 'UEFA': return SYLLABLES_LATIN.concat(SYLLABLES_SLAVIC, SYLLABLES_NORDIC);
    case 'CAF': return SYLLABLES_AFRO;
    case 'AFC': return SYLLABLES_ASIAN;
    default: return SYLLABLES_LATIN;
  }
}

export function randomPlaceName(rng, confed) {
  const pool = poolForConfed(confed);
  const n = rng.int(2, 3);
  let name = '';
  for (let i = 0; i < n; i++) name += rng.pick(pool);
  return name.charAt(0).toUpperCase() + name.slice(1);
}

const CLUB_PREFIXES = ['Deportivo', 'Atlético', 'Real', 'Sporting', 'Racing', 'Unión', 'Independiente', 'Nacional', 'Estrella', 'Juventud', 'Alianza', 'Vencedor', 'Porvenir', 'Fénix', 'Defensores'];
const CLUB_SUFFIX_BY_CONFED = {
  UEFA: ['FC', 'United', 'City', 'Rovers', 'Town', 'Athletic', 'CF', 'SC'],
  CONMEBOL: ['FC', 'Club', 'Atlético'],
  CONCACAF: ['FC', 'United', 'Rovers', 'Deportivo'],
  CAF: ['FC', 'United', 'Sporting', 'Stars'],
  AFC: ['FC', 'United', 'City', 'Warriors'],
  OFC: ['FC', 'United', 'Islanders'],
};

export function randomClubName(rng, confed) {
  const place = randomPlaceName(rng, confed);
  const style = rng.int(0, 2);
  if (style === 0) {
    const prefix = rng.pick(CLUB_PREFIXES);
    return `${prefix} ${place}`;
  }
  if (style === 1) {
    const suffix = rng.pick(CLUB_SUFFIX_BY_CONFED[confed] || CLUB_SUFFIX_BY_CONFED.UEFA);
    return `${place} ${suffix}`;
  }
  return `${rng.pick(CLUB_PREFIXES)} ${place} ${rng.pick(CLUB_SUFFIX_BY_CONFED[confed] || ['FC'])}`;
}

const FIRST_NAMES_BY_CONFED = {
  UEFA: ['Marco', 'Luca', 'Hugo', 'Mateo', 'Nico', 'Sven', 'Piotr', 'Dario', 'Théo', 'Erik', 'Kevin', 'Alex', 'Bruno', 'Iker', 'Rafa'],
  CONMEBOL: ['Santiago', 'Mateo', 'Bruno', 'Facundo', 'Emiliano', 'Rodrigo', 'Thiago', 'Gonzalo', 'Joaquín', 'Agustín'],
  CONCACAF: ['Carlos', 'José', 'Diego', 'Luis', 'Kevin', 'Andrés', 'Miguel', 'Alan'],
  CAF: ['Kwame', 'Aziz', 'Moussa', 'Emeka', 'Sipho', 'Youssef', 'Amadou', 'Kofi'],
  AFC: ['Kenji', 'Min-jun', 'Arman', 'Rashid', 'Wei', 'Suk', 'Hiro'],
  OFC: ['Sione', 'Manu', 'Tavita', 'Kalani'],
};
const LAST_NAME_SYLLABLES = SYLLABLES_LATIN.concat(SYLLABLES_SLAVIC, SYLLABLES_AFRO, SYLLABLES_ASIAN);

export function randomPersonName(rng, confed) {
  const first = rng.pick(FIRST_NAMES_BY_CONFED[confed] || FIRST_NAMES_BY_CONFED.UEFA);
  let last = '';
  const n = rng.int(2, 3);
  for (let i = 0; i < n; i++) last += rng.pick(LAST_NAME_SYLLABLES);
  last = last.charAt(0).toUpperCase() + last.slice(1);
  return `${first} ${last}`;
}
