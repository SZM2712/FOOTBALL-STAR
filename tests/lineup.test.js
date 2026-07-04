import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Rng } from '../src/state/rng.js';
import { generateSquad, ratePerformance } from '../src/engine/lineup.js';
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

test('generateSquad arma 11 jugadores con una formación 1-4-4-2 completa', () => {
  const rng = new Rng('lineup-1');
  const squad = generateSquad(rng, 'UEFA');
  assert.equal(squad.length, 11);
  const byPos = { POR: 0, DEF: 0, MED: 0, DEL: 0 };
  for (const p of squad) byPos[p.position]++;
  assert.deepEqual(byPos, { POR: 1, DEF: 4, MED: 4, DEL: 2 });
});

test('ratePerformance reparte los goles del equipo entre la alineación (coherente con el marcador)', () => {
  const rng = new Rng('lineup-2');
  const squad = generateSquad(rng, 'CONMEBOL');
  const lineup = ratePerformance({ squad, rng, teamGoals: 4, oppGoals: 0 });
  const totalGoals = lineup.reduce((s, p) => s + p.goals, 0);
  assert.equal(totalGoals, 4, 'la suma de goles de la alineación debe coincidir con el marcador del equipo');
  const totalAssists = lineup.reduce((s, p) => s + p.assists, 0);
  assert.ok(totalAssists <= 4, 'no puede haber más asistencias que goles');
});

test('ratePerformance respeta el aporte real del jugador (userEntry) sin duplicarlo', () => {
  const rng = new Rng('lineup-3');
  const squad = generateSquad(rng, 'UEFA');
  const lineup = ratePerformance({
    squad,
    rng,
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
  const squadA = generateSquad(rng, 'UEFA');
  const squadB = generateSquad(rng, 'UEFA');
  let winnerBetterCount = 0;
  const trials = 60;
  for (let i = 0; i < trials; i++) {
    const winner = ratePerformance({ squad: squadA, rng, teamGoals: 4, oppGoals: 0 });
    const loser = ratePerformance({ squad: squadB, rng, teamGoals: 0, oppGoals: 4 });
    const avg = (l) => l.reduce((s, p) => s + p.rating, 0) / l.length;
    if (avg(winner) > avg(loser)) winnerBetterCount++;
  }
  assert.ok(winnerBetterCount > trials * 0.8, `el ganador debería calificar mejor casi siempre (${winnerBetterCount}/${trials})`);
});

test('el mismo plantel conserva los mismos nombres partido a partido (misma referencia de squad)', () => {
  const rng = new Rng('lineup-5');
  const squad = generateSquad(rng, 'UEFA');
  const namesA = ratePerformance({ squad, rng, teamGoals: 1, oppGoals: 0 }).map((p) => p.name).sort();
  const namesB = ratePerformance({ squad, rng, teamGoals: 0, oppGoals: 2 }).map((p) => p.name).sort();
  assert.deepEqual(namesA, namesB, 'los 11 nombres deben ser los mismos en ambos partidos, solo cambia su rendimiento');
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

test('el plantel de tu propio club es coherente entre jornadas: no cambian los nombres de un partido a otro', () => {
  const state = createGame('lineup-integration-2');
  playChildhood(state);
  simulateSeason(state, basicDecisions);
  const firstSeasonHomeNames = new Set(state.lastMatchLineups.home.players.filter((p) => !p.isUser).map((p) => p.name));

  simulateSeason(state, basicDecisions);
  if (state.club) {
    const secondSeasonHomeNames = new Set(state.lastMatchLineups.home.players.filter((p) => !p.isUser).map((p) => p.name));
    const overlap = [...firstSeasonHomeNames].filter((n) => secondSeasonHomeNames.has(n));
    assert.ok(overlap.length >= 8, 'la mayoría de los compañeros deberían seguir siendo los mismos de un año a otro en el mismo club');
  }
});
