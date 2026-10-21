import test from 'node:test';
import assert from 'node:assert/strict';
import * as R from '../run-core.js';

const go = g => { while (g.phase === 'countdown') R.step(g, R.DT); };
const play = (g, secs, act = (g, i) => R.botJump(g, i)) => {
  for (let k = 0; k < secs * 60 && !g.over; k++) { for (const p of g.players) if (p.alive && act(g, p.id)) R.jump(g, p.id); R.step(g, R.DT); }
};
const solo = (seed, n = 1) => R.createGame({ seed, humans: Array.from({ length: n }, (_, i) => ({ name: `p${i}` })) });

test('track: same seed gives the same obstacles however far it was extended first', () => {
  const a = R.makeTrack(5).ensure(60000), b = R.makeTrack(5);
  for (let d = 2000; d <= 60000; d += 2000) b.ensure(d);
  const n = Math.min(a.obstacles.length, b.obstacles.length);
  assert.ok(n > 60);
  assert.deepEqual(a.obstacles.slice(0, n), b.obstacles.slice(0, n));
  assert.notDeepEqual(R.makeTrack(6).ensure(20000).obstacles.slice(0, 20), a.obstacles.slice(0, 20));
});

test('track: first five obstacles are plain-land hills, then biomes follow; each biome lasts 8 obstacles', () => {
  const t = R.makeTrack(3).ensure(80000);
  assert.deepEqual(t.obstacles.slice(0, R.HILLS).map(o => [o.kind, o.art, o.seg]), Array(R.HILLS).fill(['low', 'hill', 0]));
  assert.equal(t.order[0], 'plain');
  assert.equal(new Set(t.order.slice(0, 5)).size, 5, 'first cycle visits all five biomes');
  for (let c = 1; c < 3; c++) assert.notEqual(t.order[c * 5], t.order[c * 5 - 1], 'no biome repeats back to back');
  for (const o of t.obstacles) assert.ok(R.BIOMES[t.order[o.seg]].art[o.kind].includes(o.art) || (o.seg === 0 && o.art === 'hill'), `${o.art} fits ${t.order[o.seg]}`);
  assert.equal(t.segments[0].biome, 'plain'); assert.equal(t.segments[0].x, 0);
  assert.equal(t.biomeAt(0), 'plain'); assert.equal(t.biomeAt(t.segments[1].x), t.order[1]);
});

test('track: biome order and obstacle mix change with the seed', () => {
  const orders = new Set(Array.from({ length: 30 }, (_, s) => R.makeTrack(s + 1).ensure(20000).order.slice(1, 5).join()));
  assert.ok(orders.size >= 8, `${orders.size} distinct orders`);
  const kinds = new Set(R.makeTrack(9).ensure(120000).obstacles.map(o => o.kind));
  assert.deepEqual([...kinds].sort(), ['air', 'high', 'low', 'wide']);
});

test('track: hit boxes depend on kind only, every gap leaves time to land, and high/air only appear after the warm-up', () => {
  const t = R.makeTrack(2).ensure(150000);
  t.obstacles.forEach((o, i) => {
    const d = R.KINDS[o.kind];
    assert.deepEqual([o.w, o.y, o.h], [d.w, d.y, d.h]);
    if (i < 8) assert.notEqual(o.kind, 'high'); if (i < 10) assert.notEqual(o.kind, 'air');
    if (i) { const p = t.obstacles[i - 1], gapT = (o.x - p.x - p.w) / R.speedAt(p.x + p.w); assert.ok(gapT >= .5, `gap ${gapT.toFixed(2)} s before #${i}`); }
  });
});

test('speed: starts at V0, rises smoothly, caps at VMAX; distAt matches the integration', () => {
  assert.equal(R.speedAt(0), R.RUN.V0);
  let last = 0; for (let d = 0; d < 80000; d += 500) { const v = R.speedAt(d); assert.ok(v >= last && v <= R.RUN.VMAX); last = v; }
  assert.equal(R.speedAt(1e7), R.RUN.VMAX);
  const g = solo(1); g.track.obstacles.length = 0; g.track.end = 1e9; go(g); R.step(g, 20);
  assert.ok(Math.abs(g.dist - R.distAt(20)) < 30, `${g.dist} vs ${R.distAt(20)}`);
});

test('jump: second press in the air double-jumps, a third does nothing, landing resets', () => {
  const g = solo(1); assert.equal(R.jump(g, 0), false, 'no jumping before the countdown ends'); go(g);
  assert.equal(R.jump(g, 0), true); R.step(g, .2);
  const y1 = g.players[0].y; assert.ok(y1 > 40 && g.players[0].jumps === 1);
  assert.equal(R.jump(g, 0), true); assert.equal(R.jump(g, 0), false);
  let top = 0; for (let i = 0; i < 90; i++) { R.step(g, R.DT); top = Math.max(top, g.players[0].y); }
  assert.ok(top > 150, `double jump tops at ${top.toFixed(0)}`);
  while (g.players[0].y > 0) R.step(g, R.DT);
  assert.equal(g.players[0].jumps, 0); assert.equal(R.jump(g, 0), true);
});

test('jump: a single jump tops out below a high obstacle, a double jump clears it, a single jump clears a low one', () => {
  const top = (twice) => { const g = solo(1); go(g); R.jump(g, 0); let m = 0; for (let i = 0; i < 120; i++) { if (twice && i === 12) R.jump(g, 0); R.step(g, R.DT); m = Math.max(m, g.players[0].y); } return m; };
  assert.ok(top(false) < R.KINDS.high.h && top(false) > R.KINDS.low.h + 40);
  assert.ok(top(true) > R.KINDS.high.h + 40);
});

test('collision: standing still dies on the first hill; the air obstacle passes over a grounded runner but catches a jumper', () => {
  const g = solo(1); play(g, 30, () => false);
  assert.ok(g.over && g.players[0].diedAt < R.makeTrack(1).obstacles[0].x + 60);
  const mk = y => { const h = solo(1); h.track.obstacles.length = 0; h.track.obstacles.push({ x: 600, w: 60, y: 64, h: 36, kind: 'air', art: 'cloud', seg: 0 }); h.track.end = 1e9; go(h); h.players[0].y = y; h.players[0].vy = 0; h.dist = 600 - 5; return h; };
  const a = mk(0); R.step(a, R.DT); assert.ok(a.players[0].alive, 'walks underneath');
  const b = mk(30); R.step(b, R.DT); assert.ok(!b.players[0].alive, 'a mid-air runner hits it');
});

test('collision: single-jump runner survives the hills but dies at the first high obstacle; the bot with double jump keeps going', () => {
  const t = R.makeTrack(4).ensure(200000), firstHigh = t.obstacles.find(o => o.kind === 'high');
  const g = solo(4); play(g, 200, (g, i) => { const p = g.players[i]; if (!R.botJump(g, i)) return false; return p.jumps === 0; });
  assert.ok(g.over && Math.abs(g.players[0].diedAt - firstHigh.x) < 150, `died at ${g.players[0].diedAt}, first high at ${firstHigh.x}`);
});

test('bot: clears 40 different courses for 80 s each, through the 300 m mark and past 900 points per second', () => {
  for (let s = 1; s <= 40; s++) { const g = solo(s); play(g, 80); assert.ok(!g.over, `seed ${s} died at ${g.dist.toFixed(0)}`); assert.ok(g.dist > R.RUN.HARD && R.speedAt(g.dist) > 900); }
});

test('hard phase: after 300 m speed climbs faster, obstacles come closer together, and tall and floating ones show up more', () => {
  assert.equal(R.RUN.HARD / R.UNIT, 300);
  const gain = d => R.speedAt(d + 1000) - R.speedAt(d);
  assert.ok(gain(R.RUN.HARD + 2000) > gain(R.RUN.HARD - 3000) * 2, 'faster acceleration');
  const g = solo(1); g.track.obstacles.length = 0; g.track.end = 1e9; go(g); R.step(g, 60);
  assert.ok(Math.abs(g.dist - R.distAt(60)) < 40, `${g.dist} vs ${R.distAt(60)}`);
  const gapT = (a, b) => { let sum = 0, n = 0; for (let s = 1; s <= 30; s++) { const o = R.makeTrack(s).ensure(b).obstacles; for (let i = 1; i < o.length; i++) if (o[i].x >= a) { sum += (o[i].x - o[i - 1].x - o[i - 1].w) / R.speedAt(o[i].x); n++; } } return sum / n; };
  assert.ok(gapT(R.RUN.HARD + R.RUN.RAMP, R.RUN.HARD + 2 * R.RUN.RAMP) < gapT(R.RUN.HARD - 8000, R.RUN.HARD) * .85, 'denser');
  const share = (a, b) => { let hard = 0, n = 0; for (let s = 1; s <= 30; s++) for (const o of R.makeTrack(s).ensure(b).obstacles) if (o.x >= a) { n++; if (o.kind === 'high' || o.kind === 'air') hard++; } return hard / n; };
  assert.ok(share(R.RUN.HARD + R.RUN.RAMP, R.RUN.HARD + 2 * R.RUN.RAMP) > share(R.RUN.HARD - 6000, R.RUN.HARD) + .1, 'more tall and floating');
});

test('visual mode: physics and distance advance but nobody dies and the game never ends; forfeit rules a runner out on the spot', () => {
  const v = R.createGame({ seed: 3, humans: [{ name: 'a' }, { name: 'b' }], visual: true }); go(v); R.step(v, 30);
  assert.ok(v.dist > 5000 && !v.over && v.players.every(p => p.alive));
  const g = solo(3, 2); go(g); R.step(g, .5); R.forfeit(g, 1);
  assert.equal(g.players[1].alive, false); assert.equal(g.players[1].score, R.scoreOf(g.dist)); assert.equal(g.players[0].alive, true);
  assert.ok(g.events.some(e => e.type === 'out' && e.id === 1));
});

test('replay: same seed and inputs give the same result', () => {
  const run = () => { const g = solo(11, 3); play(g, 40, (g, i) => R.botJump(g, i) && (i !== 2 || g.run < 6)); return JSON.stringify([R.snapshot(g), g.result]); };
  assert.equal(run(), run());
});

test('ranking: later death wins, ties share a rank, points 5/3/2/1, score is meters', () => {
  const g = solo(8, 4); go(g);
  Object.assign(g.players[0], { alive: false, diedAt: 4000, diedT: 20, score: R.scoreOf(4000) });
  Object.assign(g.players[1], { alive: false, diedAt: 4000, diedT: 20, score: R.scoreOf(4000) });
  Object.assign(g.players[2], { alive: false, diedAt: 9000, diedT: 40, score: R.scoreOf(9000) });
  g.players[3].alive = true; g.dist = 2500; g.run = 12;
  const r = (R.step(g, 20), R.ranking(g));
  assert.ok(g.over);
  assert.equal(r[0].id, 2); assert.equal(r[0].score, 225);
  assert.deepEqual(r.slice(1).map(x => x.rank), [2, 2, 4]);
  assert.deepEqual(r.map(x => x.points), [5, 3, 3, 1]);
});

test('multiplayer: players share one course, the game ends when the last runner falls, spectators get a snapshot', () => {
  const g = solo(21, 4); let stop = false;
  play(g, 15, (g, i) => i === 0 && !stop && R.botJump(g, 0));
  assert.deepEqual(g.players.map(p => p.alive), [true, false, false, false]);
  assert.ok(g.players.slice(1).every(p => p.diedAt === g.players[1].diedAt), 'idle runners all fall at the first hill');
  const snap = R.snapshot(g); assert.equal(snap.players.length, 4); assert.equal(snap.phase, 'running'); assert.equal(snap.players[0].a, 1);
  stop = true; play(g, 30, () => false);
  assert.ok(g.over && g.phase === 'over' && g.result.players.length === 4);
  assert.equal(g.result.players[0].id, 0); assert.equal(g.result.winner.id, 0); assert.ok(g.result.players[0].score > g.result.players[1].score);
  assert.deepEqual(g.result.players.map(r => r.points), [5, 3, 3, 3]);
});

test('createGame: caps at four runners and gives default names', () => {
  const g = R.createGame({ seed: 1, humans: [{}, {}, {}, {}, {}] });
  assert.equal(g.players.length, R.MAX_PLAYERS); assert.equal(g.players[0].name, '玩家1');
});

test('start sequence: overview, camera move, then the countdown; running starts only after START_AT', () => {
  assert.equal(R.START_AT, R.OVERVIEW + R.MOVE + R.COUNTDOWN);
  const g = solo(1); R.step(g, R.START_AT - .1); assert.equal(g.phase, 'countdown'); assert.equal(R.jump(g, 0), false);
  R.step(g, .2); assert.equal(g.phase, 'running'); assert.equal(g.dist < 40, true);
});

test('solo bots: a weak and a smart runner share the course; the weak one falls first, the smart one is beatable but lasts; the game ends when the human falls', () => {
  const weak = [], smart = [];
  for (let s = 1; s <= 30; s++) {
    const g = R.createGame({ seed: s, humans: [{ uid: 'me', name: 'me' }], bots: ['weak', 'smart'] });
    assert.deepEqual(g.players.map(p => [p.human, p.bot]), [[true, false], [false, 'weak'], [false, 'smart']]);
    go(g); for (let i = 0; i < 60 * 150 && !(g.players[1].diedAt != null && g.players[2].diedAt != null); i++) { if (R.botJump(g, 0)) R.jump(g, 0); R.step(g, R.DT); }
    assert.ok(g.players[1].diedAt != null, `weak bot survived 150 s on seed ${s}`);
    weak.push(g.players[1].diedT); smart.push(g.players[2].diedT ?? g.run);
    assert.ok(!g.over, 'bots dying does not end the game while the human runs');
  }
  const avg = a => a.reduce((x, y) => x + y, 0) / a.length;
  assert.ok(avg(weak) < avg(smart) / 2, `weak ${avg(weak).toFixed(1)} s vs smart ${avg(smart).toFixed(1)} s`);
  assert.ok(avg(weak) > 5 && avg(smart) > 40);
  const g = R.createGame({ seed: 4, humans: [{ uid: 'me', name: 'me' }], bots: ['weak', 'smart'] }); play(g, 40, () => false);
  assert.ok(g.over, 'the idle human falls at the first hill and the game ends'); assert.equal(g.result.players.length, 3);
  assert.deepEqual(g.result.players.filter(p => p.bot).length, 2); assert.equal(g.result.players.find(p => !p.bot).rank >= 1, true);
  const snap = R.snapshot(R.createGame({ seed: 4, humans: [{ uid: 'me', name: 'me' }], bots: ['weak'] })); assert.equal(snap.players.length, 2);
  const again = () => { const h = R.createGame({ seed: 9, humans: [{ uid: 'me', name: 'me' }], bots: ['weak', 'smart'] }); play(h, 30, (h, i) => i === 0 && R.botJump(h, 0)); return JSON.stringify(R.snapshot(h)); };
  assert.equal(again(), again(), 'bots are deterministic');
});
