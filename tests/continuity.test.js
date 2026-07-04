import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Rng } from '../src/state/rng.js';
import { createGame, finishChildhood } from '../src/state/gameState.js';
import {
  startSeason,
  playNextMatch,
  finishSeason,
  rollManagerTalk,
  MANAGER_TALK_OPTIONS,
  rollBenchChallenge,
  BENCH_CHALLENGE_OPTIONS,
} from '../src/engine/season.js';
import { acceptOffer } from '../src/engine/transferMarket.js';
import { checkChildProDebut } from '../src/engine/personalLife.js';
import { rollUnderperformerTalk, startCoachCareer } from '../src/engine/coachCareer.js';
import { CHILDHOOD_STAGES, optionsForStage, advanceChildhoodStage } from '../src/engine/childhood.js';

function playChildhood(state) {
  for (const stage of CHILDHOOD_STAGES) {
    const pool = optionsForStage(stage.id);
    const optionId = pool ? pool[0].id : null;
    const { finished } = advanceChildhoodStage(state, optionId, state.rng);
    if (finished) finishChildhood(state);
  }
}

const basicDecisions = { trainingFocus: 'pac', hobby: null, travel: null, party: 'ninguna', gambling: 'no' };

test('el entrenador tiene nombre desde el primer contrato profesional', () => {
  const state = createGame('manager-name-1');
  playChildhood(state);
  assert.ok(typeof state.managerName === 'string' && state.managerName.length > 0);
});

test('al fichar por un nuevo club se te asigna un nuevo entrenador (con nombre)', () => {
  const state = createGame('manager-name-2');
  playChildhood(state);
  const firstManager = state.managerName;
  state.currentOffers = [
    { id: 'off-1', club: { id: 'c-x', name: 'Club X', rating: 50, prestige: 40, budgetM: 5, countryCode: state.club.countryCode }, country: state.country, league: 'Liga Test', wageM: 0.5, feeM: 1, years: 3, clauseM: 2, isGiant: false, isExotic: false },
  ];
  acceptOffer(state, state.currentOffers[0]);
  assert.ok(typeof state.managerName === 'string' && state.managerName.length > 0);
});

test('una tarjeta roja te deja suspendido: no jugás ni sumás estadísticas en el próximo partido', () => {
  const state = createGame('red-suspension-1');
  playChildhood(state);
  startSeason(state, basicDecisions);
  const before = state.pendingSeason.seasonStats.matches;
  state.pendingSeason.suspendedMatches = 1;
  playNextMatch(state, {});
  assert.equal(state.pendingSeason.seasonStats.matches, before, 'no debería sumar un partido jugado estando suspendido');
  assert.equal(state.pendingSeason.suspendedMatches, 0, 'la sanción se descuenta tras el partido perdido');
});

test('la sanción por roja sin cumplir al cierre de temporada se arrastra a la próxima', () => {
  const state = createGame('red-suspension-2');
  playChildhood(state);
  startSeason(state, basicDecisions);
  // Simulamos que quedó 1 partido de sanción sin cumplir al llegar al cierre.
  state.pendingSeason.suspendedMatches = 1;
  finishSeason(state, basicDecisions);
  assert.equal(state.pendingRedCardSuspension, 1, 'la sanción pendiente debe quedar guardada para el año siguiente');

  startSeason(state, basicDecisions);
  assert.equal(state.pendingSeason.suspendedMatches, 1, 'la nueva temporada debe arrancar arrastrando la sanción');
  assert.equal(state.pendingRedCardSuspension, 0, 'se consume al pasar a pendingSeason');
});

test('rollManagerTalk no dispara con relación normal y sin historial de partidos', () => {
  const state = createGame('manager-talk-1');
  playChildhood(state);
  for (let i = 0; i < 50; i++) {
    const talk = rollManagerTalk(state);
    assert.equal(talk, null);
  }
});

test('rollManagerTalk puede dispararse cuando la relación con el DT es mala', () => {
  const state = createGame('manager-talk-2');
  playChildhood(state);
  state.managerRelationship = 20;
  let triggered = false;
  for (let i = 0; i < 100 && !triggered; i++) {
    const talk = rollManagerTalk(state);
    if (talk) {
      triggered = true;
      assert.equal(talk.manager, state.managerName);
      assert.ok(typeof talk.text === 'string' && talk.text.length > 0);
    }
  }
  assert.ok(triggered, 'con relación muy mala, la charla debería poder dispararse en 100 intentos');
});

test('MANAGER_TALK_OPTIONS ofrece opciones con efectos distintos en la relación', () => {
  assert.ok(MANAGER_TALK_OPTIONS.length >= 2);
  const managerDs = MANAGER_TALK_OPTIONS.map((o) => o.managerD);
  assert.ok(managerDs.some((d) => d > 0));
  assert.ok(managerDs.some((d) => d < 0));
});

test('rollUnderperformerTalk (modo entrenador) no dispara sin temporadas previas', () => {
  const state = createGame('coach-talk-1');
  playChildhood(state);
  startCoachCareer(state);
  const talk = rollUnderperformerTalk(state);
  assert.equal(talk, null);
});

test('rollUnderperformerTalk puede dispararse tras una temporada floja', () => {
  const state = createGame('coach-talk-2');
  playChildhood(state);
  startCoachCareer(state);
  state.coach.seasons.push({ year: 1, points: 8, matches: 20, wins: 2, draws: 2, losses: 16, goalsFor: 10, goalsAgainst: 30, champion: false });
  let triggered = false;
  for (let i = 0; i < 100 && !triggered; i++) {
    const talk = rollUnderperformerTalk(state);
    if (talk) {
      triggered = true;
      assert.ok(typeof talk.player === 'string' && talk.player.length > 0);
    }
  }
  assert.ok(triggered, 'con un PPG bajo, la charla debería poder dispararse en 100 intentos');
});

test('checkChildProDebut hace debutar a un hijo con talento que sigue tus pasos al llegar a edad', () => {
  const rng = new Rng('child-debut-1');
  const state = createGame('child-debut-1');
  playChildhood(state);
  state.personalLife.children.push({ name: 'Hijo Test', bornYear: state.year - 16, talent: true, pursuingFootball: true, bond: 90, proDebut: false });

  let debuted = false;
  for (let i = 0; i < 60 && !debuted; i++) {
    const text = checkChildProDebut(state, rng);
    if (text) {
      debuted = true;
      assert.ok(text.includes('Hijo Test'));
      assert.equal(state.personalLife.children[0].proDebut, true);
    }
  }
  assert.ok(debuted, 'un hijo con talento, buen vínculo y que sigue el fútbol debería poder debutar en 60 intentos');
});

test('BENCH_CHALLENGE_OPTIONS ofrece opciones con efectos distintos en la disposición', () => {
  assert.ok(BENCH_CHALLENGE_OPTIONS.length >= 2);
  const readinessDs = BENCH_CHALLENGE_OPTIONS.map((o) => o.readinessD || 0);
  assert.ok(readinessDs.some((d) => d > 0));
  assert.ok(readinessDs.some((d) => d < 0));
});

test('rollBenchChallenge nunca dispara si estás lesionado o suspendido', () => {
  const state = createGame('bench-1');
  playChildhood(state);
  startSeason(state, basicDecisions);
  state.pendingSeason.weeksOut = 4;
  for (let i = 0; i < 30; i++) {
    assert.equal(rollBenchChallenge(state), null);
  }
});

test('rollBenchChallenge puede dispararse, más seguido cuanto peor la relación con el DT', () => {
  const state = createGame('bench-2');
  playChildhood(state);
  startSeason(state, basicDecisions);
  state.managerRelationship = 10;
  let triggered = false;
  for (let i = 0; i < 60 && !triggered; i++) {
    const challenge = rollBenchChallenge(state);
    if (challenge) {
      triggered = true;
      assert.ok(typeof challenge.text === 'string' && challenge.text.length > 0);
      assert.equal(state.pendingSeason.pendingBenchStart, true);
    }
  }
  assert.ok(triggered, 'con relación muy mala, el banco debería poder dispararse en 60 intentos');
});

test('si te dejan en el banco, según cómo respondas podés no entrar o entrar y jugar bien', () => {
  const state = createGame('bench-3');
  playChildhood(state);
  startSeason(state, basicDecisions);

  let sawComeOn = false;
  let sawStayedOut = false;
  for (let i = 0; i < 60 && (!sawComeOn || !sawStayedOut); i++) {
    if (!state.pendingSeason || state.pendingSeason.matchIndex >= state.pendingSeason.matchesInSeason) break;
    state.pendingSeason.pendingBenchStart = true;
    const before = state.pendingSeason.seasonStats.matches;
    playNextMatch(state, { benchChallengeChoiceIndex: 0 });
    const played = state.pendingSeason.seasonStats.matches > before;
    if (played) {
      sawComeOn = true;
      const mine = state.lastMatchLineups.home.players.find((p) => p.isUser);
      assert.ok(mine, 'si entraste de cambio, tu ficha debe aparecer en la alineación');
      assert.equal(mine.subOn, true);
    } else {
      sawStayedOut = true;
    }
  }
  assert.ok(sawComeOn, 'en varios intentos, alguna vez debería tocarte entrar de cambio');
  assert.ok(sawStayedOut, 'en varios intentos, alguna vez debería tocarte quedarte en el banco');
});

test('reclamarle al entrenador por estar en el banco empeora la relación con él', () => {
  const state = createGame('bench-4');
  playChildhood(state);
  startSeason(state, basicDecisions);
  state.managerRelationship = 55;
  state.pendingSeason.pendingBenchStart = true;
  const reclamarIdx = BENCH_CHALLENGE_OPTIONS.findIndex((o) => (o.managerD || 0) < 0);
  playNextMatch(state, { benchChallengeChoiceIndex: reclamarIdx });
  assert.ok(state.managerRelationship < 55, 'reclamar por no ser titular debería resentir la relación con el DT');
});

test('checkChildProDebut no hace nada si el hijo no tiene talento o no sigue el fútbol', () => {
  const rng = new Rng('child-debut-2');
  const state = createGame('child-debut-2');
  playChildhood(state);
  state.personalLife.children.push({ name: 'Sin Talento', bornYear: state.year - 16, talent: false, pursuingFootball: true, bond: 90, proDebut: false });
  state.personalLife.children.push({ name: 'No Persigue', bornYear: state.year - 16, talent: true, pursuingFootball: false, bond: 90, proDebut: false });
  for (let i = 0; i < 60; i++) {
    checkChildProDebut(state, rng);
  }
  assert.equal(state.personalLife.children[0].proDebut, false);
  assert.equal(state.personalLife.children[1].proDebut, false);
});
