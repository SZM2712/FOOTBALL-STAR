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

test('generateSquad arma 11 titulares (1-4-4-2) más 5 suplentes de banco', () => {
  const rng = new Rng('lineup-1');
  const squad = generateSquad(rng, 'UEFA');
  const starters = squad.filter((p) => p.starter);
  const bench = squad.filter((p) => !p.starter);
  assert.equal(starters.length, 11);
  assert.equal(bench.length, 5);
  const byPos = { POR: 0, DEF: 0, MED: 0, DEL: 0 };
  for (const p of starters) byPos[p.position]++;
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
  const squadNames = new Set(squad.map((p) => p.name));
  const namesA = ratePerformance({ squad, rng, teamGoals: 1, oppGoals: 0 }).map((p) => p.name);
  const namesB = ratePerformance({ squad, rng, teamGoals: 0, oppGoals: 2 }).map((p) => p.name);
  for (const n of [...namesA, ...namesB]) {
    assert.ok(squadNames.has(n), `${n} debería ser parte del plantel fijo del club (titular o suplente)`);
  }
});

test('ratePerformance puede simular cambios de banco, con minuto y a quién reemplazan', () => {
  const rng = new Rng('lineup-subs-1');
  let sawSub = false;
  for (let i = 0; i < 40 && !sawSub; i++) {
    const squad = generateSquad(rng, 'UEFA');
    const lineup = ratePerformance({ squad, rng, teamGoals: 1, oppGoals: 1 });
    const subsOn = lineup.filter((p) => p.subOn);
    const subsOff = lineup.filter((p) => p.subOff);
    if (subsOn.length && subsOff.length) {
      sawSub = true;
      for (const subOn of subsOn) {
        assert.ok(subOn.subOnMinute >= 46 && subOn.subOnMinute <= 89, 'el cambio debe entrar en la segunda mitad');
        const pairedOff = subsOff.find((p) => p.name === subOn.replaced);
        assert.ok(pairedOff, `debe existir el jugador que salió (${subOn.replaced}) reemplazado por ${subOn.name}`);
        assert.equal(subOn.subOnMinute, pairedOff.subOffMinute, 'el que entra y el que sale comparten el mismo minuto');
      }
    }
  }
  assert.ok(sawSub, 'en 40 partidos simulados debería haber aparecido al menos un cambio');
});

test('si el usuario sale sustituido, su entrada queda marcada con el minuto exacto', () => {
  const rng = new Rng('lineup-subs-2');
  const squad = generateSquad(rng, 'UEFA');
  const lineup = ratePerformance({
    squad,
    rng,
    teamGoals: 1,
    oppGoals: 2,
    userEntry: { name: 'Pruebita Test', position: 'DEL', rating: 5.2, goals: 0, assists: 0, subOffMinute: 63 },
  });
  const mine = lineup.find((p) => p.isUser);
  assert.ok(mine, 'debe existir la entrada del jugador real');
  assert.equal(mine.subOff, true);
  assert.equal(mine.subOffMinute, 63);
  const replacement = lineup.find((p) => p.subOn && p.replaced === 'Pruebita Test');
  assert.ok(replacement, 'debe entrar un suplente concreto en el lugar del usuario');
  assert.equal(replacement.subOnMinute, 63);
});

test('el orden de la alineación es por posición (arquero a delantero), no por calificación', () => {
  const rng = new Rng('lineup-order-1');
  const squad = generateSquad(rng, 'UEFA');
  const lineup = ratePerformance({ squad, rng, teamGoals: 2, oppGoals: 3 });
  const starters = lineup.filter((p) => !p.subOn);
  const positions = starters.map((p) => p.position);
  const order = { POR: 0, DEF: 1, MED: 2, DEL: 3 };
  for (let i = 1; i < positions.length; i++) {
    assert.ok(order[positions[i]] >= order[positions[i - 1]], `el orden debería ser POR->DEF->MED->DEL, se encontró ${positions.join(',')}`);
  }
  const ratings = starters.map((p) => p.rating);
  assert.notDeepEqual(
    [...ratings].sort((a, b) => b - a),
    ratings,
    'no debería coincidir con un orden por calificación (con estos datos no debería estar ya ordenado por rating)'
  );
});

test('los suplentes que entraron quedan listados al final, en el orden en que ingresaron', () => {
  const rng = new Rng('lineup-order-2');
  let found = false;
  for (let i = 0; i < 40 && !found; i++) {
    const squad = generateSquad(rng, 'UEFA');
    const lineup = ratePerformance({ squad, rng, teamGoals: 1, oppGoals: 1 });
    const subsOn = lineup.filter((p) => p.subOn);
    if (subsOn.length >= 2) {
      found = true;
      const idxInLineup = subsOn.map((s) => lineup.indexOf(s));
      assert.ok(idxInLineup.every((idx, i) => i === 0 || idx > idxInLineup[i - 1]), 'los suplentes deben aparecer en orden');
      const minutes = subsOn.map((s) => s.subOnMinute);
      assert.ok(minutes.every((min, i) => i === 0 || min >= minutes[i - 1]), 'los suplentes deben estar ordenados por minuto de ingreso');
    }
  }
  assert.ok(found, 'en 40 partidos debería haber aparecido algún caso con 2+ cambios');
});

test('el usuario puede entrar de cambio (arranca en el banco): reemplaza a un titular al minuto decidido', () => {
  const rng = new Rng('lineup-benchon-1');
  const squad = generateSquad(rng, 'UEFA');
  const lineup = ratePerformance({
    squad,
    rng,
    teamGoals: 2,
    oppGoals: 1,
    ownGoals: 1,
    ownAssists: 0,
    userEntry: { name: 'Pruebita Suplente', position: 'DEL', rating: 8.0, goals: 1, assists: 0, subOnMinute: 70 },
  });
  const mine = lineup.find((p) => p.isUser);
  assert.ok(mine, 'debe existir la entrada del usuario');
  assert.equal(mine.subOn, true);
  assert.equal(mine.subOnMinute, 70);
  assert.equal(mine.goals, 1);
  assert.ok(mine.replaced, 'debe registrar a quién reemplazó');
  const replaced = lineup.find((p) => p.name === mine.replaced);
  assert.ok(replaced, 'el titular reemplazado debe seguir apareciendo en la ficha');
  assert.equal(replaced.subOff, true);
  assert.equal(replaced.subOffMinute, 70);
  assert.equal(lineup.filter((p) => p.isUser).length, 1, 'no debe haber una entrada duplicada del usuario');
});

const basicDecisions = { trainingFocus: 'pac', hobby: null, travel: null, party: 'ninguna', gambling: 'no' };

test('tras jugar una temporada, state.lastMatchLineups queda con las alineaciones del último partido', () => {
  const state = createGame('lineup-integration-1');
  playChildhood(state);
  assert.equal(state.lastMatchLineups, null);

  simulateSeason(state, basicDecisions);

  assert.ok(state.lastMatchLineups, 'debe haberse generado una alineación tras jugar partidos');
  assert.ok(state.lastMatchLineups.home.players.length >= 11 && state.lastMatchLineups.home.players.length <= 14);
  assert.ok(state.lastMatchLineups.away.players.length >= 11 && state.lastMatchLineups.away.players.length <= 14);
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
