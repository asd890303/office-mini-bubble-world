import test from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../game-core.js';

const run = (seed, humans = [], inputs = () => {}) => {
  const g = C.createGame({ seed, humans }); let n = 0, evs = [];
  while (!g.over && n < 5000) { inputs(g, n); evs.push(...C.step(g, .05)); n++; }
  return { g, n, evs, snap: C.snapshot(g) };
};

test('simulated game finishes with a full ranking', () => {
  for (const seed of [1, 7, 42, 2026, 99999]) {
    const { g, evs } = run(seed);
    assert.equal(g.over, true, `seed ${seed} should finish`);
    assert.equal(g.result.players.length, 4);
    assert.deepEqual(g.result.players.map(p => p.rank), [1, 2, 3, 4]);
    assert.ok(evs.some(e => e.e === 'end'));
    assert.ok(evs.some(e => e.e === 'boom'));
  }
});

test('deterministic: same seed + same inputs → identical game', () => {
  const inp = (g, n) => { C.setInput(g, 0, [[1, 0], [0, 1], [-1, 0], [0, -1]][Math.floor(n / 20) % 4]); if (n % 37 === 0) C.placeBomb(g, g.players[0]); };
  const h = [{ uid: 'u1', name: 'Alice', color: '#a8d8ff', ear: 'fe' }];
  const a = run(123, h, inp), b = run(123, h, inp);
  assert.equal(a.n, b.n); assert.deepEqual(a.snap, b.snap); assert.deepEqual(a.g.result, b.g.result);
  const c = run(124, h, inp);
  assert.notDeepEqual(c.snap.grid, C.snapshot(C.createGame({ seed: 123 })).grid);
});

test('humans get slots, unique colors; disconnect hands player to AI', () => {
  const g = C.createGame({ seed: 5, humans: [{ uid: 1, name: 'A', color: '#ffb3c7' }, { uid: 2, name: 'B', color: '#ffb3c7' }] });
  assert.equal(g.players[0].human, true); assert.equal(g.players[1].human, true); assert.equal(g.players[2].human, false);
  assert.equal(new Set(g.players.map(p => p.color)).size, 4);
  C.setHuman(g, 1, false); assert.ok(g.players[1].ai); assert.equal(g.players[1].human, false);
  C.setHuman(g, 1, true); assert.equal(g.players[1].ai, null);
  C.setInput(g, 0, [1, 1]); assert.deepEqual(g.players[0].input, [1, 0]);
});

test('time-out game ends with reason time when everyone idles safely', () => {
  const g = C.createGame({ seed: 3, humans: [1, 2, 3, 4].map(i => ({ uid: i, name: 'p' + i })), roundTime: 45 });
  let n = 0; while (!g.over && n < 2000) { C.step(g, .05); n++; }
  assert.equal(g.over, true); // shrinking ring eventually crushes idle players or time runs out
  assert.ok(['time', 'last'].includes(g.result.reason));
});

test('snapshot is JSON-safe and compact', () => {
  const g = C.createGame({ seed: 9 }); for (let i = 0; i < 200; i++) C.step(g, .05);
  const s = JSON.stringify(C.snapshot(g));
  assert.ok(s.length < 4000, 'snapshot size ' + s.length);
  assert.equal(JSON.parse(s).grid.length, C.COLS * C.ROWS);
});

test('bots: false creates only the human players', () => {
  const g = C.createGame({ seed: 8, humans: [{ uid: 1, name: 'A' }, { uid: 2, name: 'B' }], bots: false });
  assert.equal(g.players.length, 2); assert.ok(g.players.every(p => p.human && !p.ai));
  assert.deepEqual(g.players.map(p => p.id), [0, 1]);
});

test('bubble timeout credits the bomb owner; self-trap gives no credit', () => {
  const mk = () => C.createGame({ seed: 11, humans: [{ uid: 1, name: 'A' }, { uid: 2, name: 'B' }], bots: false });
  const trapBy = (g, victim, owner) => {
    const v = g.players[victim]; g.flames.push({ id: 999, x: Math.round(v.x), y: Math.round(v.y), t: C.FLAME_TIME, center: true, owner });
    C.step(g, .05); assert.equal(v.state, 'trapped');
    // 把其他人移開，避免被碰破
    for (const p of g.players) if (p !== v) { p.x = 12; p.y = 12; }
    let n = 0; while (v.state === 'trapped' && n++ < 400) C.step(g, .05);
    return v;
  };
  const g1 = mk(); const v1 = trapBy(g1, 0, 1);
  assert.equal(v1.state, 'dead'); assert.equal(g1.players[1].kills, 1);
  const g2 = mk(); trapBy(g2, 0, 0);
  assert.equal(g2.players[0].kills, 0); assert.equal(g2.players[1].kills, 0);
  assert.ok(C.TRAP_TIME >= 6);
});
