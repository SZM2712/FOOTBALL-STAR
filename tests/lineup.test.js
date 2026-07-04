import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Rng } from '../src/state/rng.js';
import { generateMatchLineup } from '../src/engine/lineup.js';
import { createGame, finishChildhood } from '../src/state/gameState.js';
import { simulateSeason } from '../src/engine/season.js';
import { CHILDHOOD_STAGES, optionsForStage, advanceChildhoodStage } from '../src/engine/childhood.js';

function playChildhood(state) {
  for (const stage of CHILDHOOD_STAGES) {
    const pool = optionsForStage(stage.id);
    const optionId = pool ? pool[0].id : null;
    const { finished } = advanceChildhoodStage(state, optionId, state.rng);
    if (finished) finishChildhood(state);
  }
}

test('generateMatchLineup arma 11 jugadores con una formación 1-4-4-2 completa', () => {
  const rng = new Rng('lineup-1');
  const lineup = generateMatchLineup({ rng, confed: 'UEFA', teamGoals: 2, oppGoals: 1 });
  assert.equal(lineup.length, 11);
  const byPos = { POR: 0, DEF: 0, MED: 0, DEL: 0 };
  for (const p of lineup) byPos[p.position]++;
  assert.deepEqual(byPos, { POR: 1, DEF: 4, MED: 4, DEL: 2 });
});

test('generateMatchLineup reparte los goles del equipo entre la alineación (coherente con el marcador)', () => {
  const rng = new Rng('lineup-2');
  const lineup = generateMatchLineup({ rng, confed: 'CONMEBOL', teamGoals: 4, oppGoals: 0 });
  const totalGoals = lineup.reduce((s, p) => s + p.goals, 0);
  assert.equal(totalGoals, 4, 'la suma de goles de la alineación debe coincidir con el marcador del equipo');
  const totalAssists = lineup.reduce((s, p) => s + p.assists, 0);
  assert.ok(totalAssists <= 4, 'no puede haber más asistencias que goles');
});

test('generateMatchLineup respeta el aporte real del jugador (userEntry) sin duplicarlo', () => {
  const rng = new Rng('lineup-3');
  const lineup = generateMatchLineup({
    rng,
    confed: 'UEFA',
    teamGoals: 3,
    oppGoals: 1,
    ownGoals: 2,
    ownAssists: 1,
    userEntry: { name: 'Pruebita Test', position: 'DEL', rating: 9.1, goals: 2, assists: 1 },
  });
  const mine = lineup.find((p) => p.isUser);
  assert.ok(mine, 'debe existir la entrada del jugador real');
  assert.equal(mine.name, 'Pruebita Test');
  assert.equal(mine.goals, 2);
  assert.equal(mine.assists, 1);
  const totalGoals = lineup.reduce((s, p) => s + p.goals, 0);
  assert.equal(totalGoals, 3, 'el resto del equipo completa los goles restantes, sin superar el marcador');
  assert.equal(lineup.filter((p) => p.isUser).length, 1, 'no debe haber una entrada duplicada del jugador');
});

test('el equipo que gana claramente tiende a calificar mejor que el que pierde', () => {
  const rng = new Rng('lineup-4');
  let winnerBetterCount = 0;
  const trials = 60;
  for (let i = 0; i < trials; i++) {
    const winner = generateMatchLineup({ rng, confed: 'UEFA', teamGoals: 4, oppGoals: 0 });
    const loser = generateMatchLineup({ rng, confed: 'UEFA', teamGoals: 0, oppGoals: 4 });
    const avg = (l) => l.reduce((s, p) => s + p.rating, 0) / l.length;
    if (avg(winner) > avg(loser)) winnerBetterCount++;
  }
  assert.ok(winnerBetterCount > trials * 0.8, `el ganador debería calificar mejor casi siempre (${winnerBetterCount}/${trials})`);
});

const basicDecisions = { trainingFocus: 'pac', hobby: null, travel: null, party: 'ninguna', gambling: 'no' };

test('tras jugar una temporada, state.lastMatchLineups queda con las alineaciones del último partido', () => {
  const state = createGame('lineup-integration-1');
  playChildhood(state);
  assert.equal(state.lastMatchLineups, null);

  simulateSeason(state, basicDecisions);

  assert.ok(state.lastMatchLineups, 'debe haberse generado una alineación tras jugar partidos');
  assert.equal(state.lastMatchLineups.home.players.length, 11);
  assert.equal(state.lastMatchLineups.away.players.length, 11);
});
