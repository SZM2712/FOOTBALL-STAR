import { Rng } from './rng.js';
import { pickBirthCountry, COUNTRY_BY_CODE } from '../data/countries.js';
import { generateLeagueSystem } from '../data/clubs.js';
import { createPlayer } from '../engine/player.js';
import { RareStateTracker, rollGenerational } from '../engine/rareStates.js';
import { initPersonalLife } from '../engine/personalLife.js';

export function createGame(seed) {
  const rng = new Rng(seed);
  const country = pickBirthCountry(rng);
  const generational = rollGenerational(rng);
  const player = createPlayer(rng, country, generational ? { potential: 99 } : {});
  player.generational = generational;

  const homeLeague = generateLeagueSystem(country, rng);
  const division = homeLeague.divisions[homeLeague.divisions.length - 1];
  const startIdx = Math.max(0, division.clubs.length - rng.int(1, Math.min(4, division.clubs.length)));
  const startClub = division.clubs[startIdx];

  const state = {
    seed: rng.seed,
    rng,
    createdAt: Date.now(),
    worldYearStart: 2018,
    year: 1,
    country,
    nationality: country.code,
    player,
    club: { ...startClub, leagueName: homeLeague.leagueName, division: division.level, countryCode: country.code },
    contract: { salaryM: Math.max(0.01, Math.round((startClub.budgetM / 40) * 100) / 100), years: 2, clauseM: Math.round(startClub.budgetM * 0.5 * 10) / 10 },
    agent: { tier: 'familiar' },
    money: 0.02,
    peakMoney: 0.02,
    fame: 2,
    leagueSystems: { [country.code]: homeLeague },
    rareTracker: new RareStateTracker(),
    personalLife: initPersonalLife(rng, country.confed),
    nationalTeam: {
      debuted: false,
      caps: 0,
      goals: 0,
      nationalizationUsed: false,
      tournamentsPlayed: [],
      prestigeLocked: false,
    },
    stats: { career: { matches: 0, goals: 0, assists: 0, yellow: 0, red: 0 }, seasons: [] },
    trophies: [],
    feed: [],
    currentOffers: [],
    retired: false,
    retirementReason: null,
    suspensionWeeks: 0,
    transferredThisYear: false,
    bigOfferRejectedThisYear: false,
  };

  pushFeed(state, `Naces en ${country.name} ${country.flag}. El sueño del fútbol empieza aquí.`, 'event');
  if (generational) {
    pushFeed(state, 'Desde muy joven, todos hablan de ti como si fueras distinto a los demás.', 'rare');
  }
  return state;
}

export function pushFeed(state, text, type = 'normal') {
  state.feed.push({
    year: state.year,
    age: state.player.age,
    worldYear: state.worldYearStart + state.year - 1,
    type,
    text,
  });
}

export function serializeGame(state) {
  const clone = { ...state };
  clone.rng = state.rng.toJSON();
  clone.rareTracker = state.rareTracker.toJSON();
  delete clone.currentOffers; // se regeneran
  return JSON.stringify(clone, null, 2);
}

export function deserializeGame(json) {
  const raw = JSON.parse(json);
  raw.rng = Rng.fromJSON(raw.rng);
  raw.rareTracker = RareStateTracker.fromJSON(raw.rareTracker);
  raw.country = COUNTRY_BY_CODE[raw.country.code] || raw.country;
  raw.currentOffers = raw.currentOffers || [];
  return raw;
}
