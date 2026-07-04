import { Rng } from './rng.js';
import { pickBirthCountry, COUNTRY_BY_CODE } from '../data/countries.js';
import { generateLeagueSystem } from '../data/clubs.js';
import { createPlayer } from '../engine/player.js';
import { RareStateTracker, rollGenerational } from '../engine/rareStates.js';
import { initPersonalLife } from '../engine/personalLife.js';
import { initChildhood } from '../engine/childhood.js';
import { randomPersonName } from '../data/names.js';

/** Crea una partida nueva en fase 'childhood' (0 años, recién nacido).
 * El jugador profesional (club, contrato, atributos) se genera recién al
 * cumplir los 16, en finishChildhood(), con los modificadores acumulados
 * durante la infancia. */
export function createGame(seed) {
  const rng = new Rng(seed);
  const country = pickBirthCountry(rng);
  const generational = rollGenerational(rng);
  const personalLife = initPersonalLife(rng, country.confed);

  const state = {
    seed: rng.seed,
    rng,
    createdAt: Date.now(),
    birthWorldYear: 2002,
    worldYearStart: 2018, // año en que debuta como profesional (16 años)
    year: 1,
    phase: 'childhood',
    childAge: 0,
    childName: randomPersonName(rng, country.confed),
    pendingGenerational: generational,
    childhood: initChildhood(),
    country,
    nationality: country.code,
    player: null,
    club: null,
    contract: null,
    agent: { tier: 'familiar' },
    money: 0.02,
    peakMoney: 0.02,
    fame: 0,
    leagueSystems: {},
    rareTracker: new RareStateTracker(),
    personalLife,
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
  return state;
}

/** Cierra la infancia a los 16 años: crea al jugador profesional aplicando
 * los modificadores acumulados, y arma su primer club/contrato. */
export function finishChildhood(state) {
  const country = state.country;
  const player = createPlayer(state.rng, country, {
    name: state.childName,
    potential: state.pendingGenerational ? 99 : undefined,
    childhood: state.childhood.modifiers,
  });
  player.generational = state.pendingGenerational;
  state.player = player;
  state.phase = 'career';
  state.year = 1;

  const homeLeague = generateLeagueSystem(country, state.rng);
  const division = homeLeague.divisions[homeLeague.divisions.length - 1];
  const startIdx = Math.max(0, division.clubs.length - state.rng.int(1, Math.min(4, division.clubs.length)));
  const startClub = division.clubs[startIdx];

  state.leagueSystems[country.code] = homeLeague;
  state.club = { ...startClub, leagueName: homeLeague.leagueName, division: division.level, countryCode: country.code };
  state.contract = {
    salaryM: Math.max(0.01, Math.round((startClub.budgetM / 40) * 100) / 100),
    years: 2,
    clauseM: Math.round(startClub.budgetM * 0.5 * 10) / 10,
  };
  state.fame = 2;

  const feed = [`Firmas tu primer contrato profesional con ${state.club.name} a los 16 años.`];
  if (player.generational) {
    feed.push('⭐ Los ojeadores ya lo sabían: naciste para ser una Leyenda Generacional. O para nunca estar a la altura de esa etiqueta.');
  }
  return feed;
}

export function pushFeed(state, text, type = 'normal') {
  const age = state.player ? state.player.age : state.childAge;
  const worldYear = state.player ? state.worldYearStart + state.year - 1 : state.birthWorldYear + state.childAge;
  state.feed.push({ year: state.year, age, worldYear, type, text });
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
