import test from 'node:test';
import assert from 'node:assert/strict';
import * as K from '../kart-core.js';

const T = K.TRACK;
const race = (g, secs, each = () => {}) => { const evs = []; for (let i = 0; i < secs / .05 && !g.over; i++) { each(g, i); evs.push(...K.step(g, .05)); } return evs; };
const go = g => { while (g.phase === 'countdown') K.step(g, .05); };
// 把車放到賽道某處（沿賽道距離 s、橫向 lat），朝前
function put(g, k, s, lat = 0) { const p = K.trackPoint(s, lat), loc = K.locate(p.x, p.y); Object.assign(k, { x: p.x, y: p.y, h: p.h, hint: loc.i, s: loc.s }); k.total = s; }

for (const { id, T } of K.TRACKS) test(`track ${id}: closed loop (180-320 cells, narrow roads up to 420), never comes close to itself; bots finish 3 laps`, () => {
  assert.ok(T.L > 180 && T.L < (T.road < K.ROAD ? 420 : 320), `length ${T.L}`);
  const near = 2 * T.wall + 1;
  for (let i = 0; i < T.N; i += 2) for (let j = i + 2; j < T.N; j += 2) {
    const along = Math.min(j - i, T.N - (j - i)) * T.STEP; if (along < 25) continue;
    const d = Math.hypot(T.xs[i] - T.xs[j], T.ys[i] - T.ys[j]);
    assert.ok(d > near, `samples ${i} and ${j} are ${d.toFixed(2)} apart`);
  }
  const p = K.trackPoint(37, 1.5, T), loc = K.locate(p.x, p.y, null, T);
  assert.ok(Math.abs(loc.s - 37) < .3 && Math.abs(loc.d - 1.5) < .05, 'trackPoint and locate agree');
  const g = K.createGame({ seed: 11, track: id }); race(g, K.MAX_TIME + 5);
  assert.equal(g.result.reason, 'all'); assert.equal(K.snapshot(g).track, id);
});

test('track option: unknown id falls back to the first map', () => {
  assert.equal(K.createGame({ track: 'nope' }).trackId, K.TRACKS[0].id);
  assert.deepEqual(K.TRACKS.map(t => t.id), ['candy', 'lake', 'cloud', 'highway', 'peak', 'thunder']);
});

test('track peak: min radius >= 8, 4+ hairpins, 3+ alternating bends, straight start, bots finish slower than cloud with few bumps', () => {
  const T = K.trackById('peak').T, N = T.N, wa = a => Math.atan2(Math.sin(a), Math.cos(a)), hd = i => Math.atan2(T.ty[i % N], T.tx[i % N]);
  let minR = Infinity;
  for (let i = 0; i < N; i++) {
    const a = (i - 6 + N) % N, b = (i + 6) % N, A = Math.hypot(T.xs[b] - T.xs[i], T.ys[b] - T.ys[i]), B = Math.hypot(T.xs[i] - T.xs[a], T.ys[i] - T.ys[a]), C = Math.hypot(T.xs[b] - T.xs[a], T.ys[b] - T.ys[a]);
    const area = Math.abs((T.xs[b] - T.xs[a]) * (T.ys[i] - T.ys[a]) - (T.ys[b] - T.ys[a]) * (T.xs[i] - T.xs[a])) / 2;
    if (area > 1e-9) minR = Math.min(minR, A * B * C / (4 * area));
  }
  assert.ok(minR >= 8 && minR <= 11, `min radius ${minR.toFixed(2)}`);
  const W = Math.round(25 / T.STEP); let hairpins = 0;
  for (let i = 0; i < N;) { const d = wa(hd(i + W) - hd(i)); if (Math.abs(d) > Math.PI * 2 / 3) { const sg = Math.sign(d); let j = i; while (j < N + W && Math.abs(wa(hd(j + W) - hd(j))) > Math.PI * 2 / 3 && Math.sign(wa(hd(j + W) - hd(j))) === sg) j++; hairpins++; i = j + W; } else i++; }
  assert.ok(hairpins >= 4, `hairpins ${hairpins}`);
  let bends = [], run = 0;
  for (let i = 0; i < N; i++) { const d = wa(hd(i + 8) - hd(i)); if (Math.abs(d) > .2) { const s = Math.sign(d); if (bends.at(-1) !== s) bends.push(s); } }
  for (let k = 0, cur = 1; k < bends.length; k++) { if (k && bends[k] !== bends[k - 1]) cur++; else cur = 1; run = Math.max(run, cur); }
  assert.ok(run >= 3, `alternating bends ${run}`);
  for (let d = -12; d <= 12; d += .5) assert.ok(Math.abs(wa(hd(Math.round(d / T.STEP) + 2 + N) - hd(Math.round(d / T.STEP) - 2 + N))) < .05, `straight near start at ${d}`);
  const xr = Math.max(...T.xs) - Math.min(...T.xs), yr = Math.max(...T.ys) - Math.min(...T.ys);
  assert.ok(T.L >= 290 && xr <= 130 && yr <= 130, `length ${T.L} range ${xr} x ${yr}`);
  const first = (id, seed) => { const g = K.createGame({ seed, track: id }); let bump = 0; while (!g.over) for (const e of K.step(g, .05)) if (e.e === 'bump') bump++; assert.equal(g.result.reason, 'all'); return { t: Math.min(...g.karts.map(k => k.finishT)), bump }; };
  for (const seed of [1, 7, 11, 42]) { const p = first('peak', seed), c = first('cloud', seed); assert.ok(p.t >= c.t + 3 && p.t >= 88, `seed ${seed}: peak ${p.t.toFixed(1)} s, cloud ${c.t.toFixed(1)} s`); assert.ok(p.bump <= 12, `seed ${seed}: ${p.bump} bumps`); }
});

test('start: 4 karts side by side on one line; gas in the last 0.5 s gives a start boost, earlier does not', () => {
  const g0 = K.createGame({ seed: 1 }), s0 = g0.karts.map(k => K.locate(k.x, k.y));
  assert.ok(s0.every(l => Math.abs(l.s - s0[0].s) < .05), 'same distance to the line');
  assert.ok(s0.every(l => Math.abs(l.d) < K.ROAD), 'all on the road');
  const g = K.createGame({ seed: 3, humans: [{ uid: 'a', name: 'A' }, { uid: 'b', name: 'B' }], bots: false });
  const x0 = g.karts[0].x;
  for (let i = 0; i < 20; i++) K.step(g, .05);                       // 剩 2 秒
  K.setInput(g, 1, { gas: true });                                     // B 太早踩油門
  for (let i = 0; i < 31; i++) K.step(g, .05);                       // 剩約 0.45 秒
  K.setInput(g, 0, { gas: true });
  const evs = race(g, 1);
  assert.ok(evs.some(e => e.e === 'go'));
  assert.equal(g.karts[0].boost > 0 || evs.some(e => e.e === 'boost' && e.id === 0), true, 'A got the start boost');
  assert.equal(evs.some(e => e.e === 'boost' && e.id === 1), false, 'B pressed too early');
  assert.notEqual(g.karts[0].x, x0);
});

test('bots finish 3 laps; ranking, points and result are consistent; same seed replays identically', () => {
  const run = () => { const g = K.createGame({ seed: 42 }); const evs = race(g, K.MAX_TIME + 10); return { g, evs }; };
  const { g, evs } = run();
  assert.equal(g.over, true);
  const done = g.karts.filter(k => k.done);
  assert.ok(done.length >= 1, 'someone finished');
  assert.ok(done[0].finishT > 40 && done[0].finishT < 150, `winner time ${done[0].finishT}`);
  assert.deepEqual(g.result.players.map(p => p.rank), [1, 2, 3, 4]);
  assert.deepEqual(g.result.players.map(p => p.points), [5, 3, 2, 1]);
  assert.ok(evs.filter(e => e.e === 'lap').length >= 2, 'lap events');
  const again = run();
  assert.deepEqual(K.snapshot(again.g), K.snapshot(g), 'deterministic');
});

test('progress: driving backwards loses progress, so laps cannot be faked', () => {
  const g = K.createGame({ seed: 1, humans: [{ uid: 'a', name: 'A' }], bots: false }); go(g);
  const k = g.karts[0]; put(g, k, 20); k.h += Math.PI; k.v = 8;
  race(g, 3, () => K.setInput(g, 0, { steer: 0, gas: true }));
  assert.ok(k.total < 20, `went backwards: total ${k.total}`);
  assert.equal(k.lap, 1);
});

test('no gas: the kart stays put and coasts to a stop; gas drives; brake reverses slowly', () => {
  const g = K.createGame({ seed: 1, humans: [{ uid: 'a', name: 'A' }], bots: false }); go(g);
  const k = g.karts[0], x0 = k.x;
  race(g, 1); assert.equal(k.x, x0, 'no auto-accelerate');
  K.setInput(g, 0, { gas: true }); race(g, 2); assert.ok(k.v > 8, `gas: v ${k.v}`);
  K.setInput(g, 0, {}); race(g, 3); assert.equal(k.v, 0, 'coasts to a stop');
  K.setInput(g, 0, { brake: true }); race(g, 2); assert.ok(k.v < 0 && k.v >= -K.KART.REVERSE, `reverse ${k.v}`);
  K.setInput(g, 0, { drift: true }); race(g, 1); assert.ok(k.v > 0, 'holding drift counts as gas');
});

test('walls keep karts on the track; grass is slower than road', () => {
  const g = K.createGame({ seed: 1, humans: [{ uid: 'a', name: 'A' }], bots: false }); go(g);
  const k = g.karts[0]; put(g, k, 10); k.h += Math.PI / 2; k.v = 10;  // 直直往右牆衝
  race(g, 2, () => K.setInput(g, 0, { steer: 0 }));
  assert.ok(Math.abs(K.locate(k.x, k.y, k.hint).d) <= K.WALL + 1e-6);
  const speedAt = lat => { const g2 = K.createGame({ seed: 1, humans: [{ uid: 'a', name: 'A' }], bots: false }); go(g2); const q = g2.karts[0]; K.setInput(g2, 0, { gas: true }); put(g2, q, 2, lat); q.v = 10; K.step(g2, .05); for (let i = 0; i < 30; i++) { put(g2, q, 2, lat); K.step(g2, .05); } return q.v; };
  assert.ok(speedAt(K.ROAD + .8) < speedAt(0) * .6, 'grass caps speed');
});

test('drift: longer drifts give longer boosts (blue / orange / pink)', () => {
  const boostAfter = secs => {
    const g = K.createGame({ seed: 1, humans: [{ uid: 'a', name: 'A' }], bots: false }); go(g);
    const k = g.karts[0]; put(g, k, 2); k.v = 9;
    for (let i = 0; i < Math.round(secs / .05); i++) { K.setInput(g, 0, { steer: .6, drift: true, gas: true }); put(g, k, 2); k.v = 9; K.step(g, .05); }
    const lvl = k.level; K.setInput(g, 0, { steer: 0, drift: false }); K.step(g, .05);
    return { lvl, boost: k.boost };
  };
  const a = boostAfter(.4), b = boostAfter(1), c = boostAfter(1.6), d = boostAfter(2.5);
  assert.equal(a.lvl, 0); assert.equal(a.boost, 0, 'too short: no boost');
  assert.equal(b.lvl, 1); assert.equal(c.lvl, 2); assert.equal(d.lvl, 3);
  assert.ok(b.boost < c.boost && c.boost < d.boost, `${b.boost} < ${c.boost} < ${d.boost}`);
});

test('items: balloon traps the kart ahead for 2 s then grants immunity; shoe boosts; puddle spins', () => {
  const g = K.createGame({ seed: 5, humans: [{ uid: 'a', name: 'A' }, { uid: 'b', name: 'B' }], bots: false }); go(g);
  const [a, b] = g.karts; put(g, a, 10, 0); put(g, b, 16, 0); a.v = b.v = 0;
  a.item = 'balloon'; assert.equal(K.useItem(g, 0), true); assert.equal(a.item, null);
  const evs = race(g, .8, () => { K.setInput(g, 1, {}); b.v = 0; });
  assert.ok(evs.some(e => e.e === 'hit' && e.id === 1 && e.by === 0), 'B trapped');
  assert.ok(b.trap > 0);
  race(g, 2); assert.equal(b.trap, 0); assert.ok(b.immune > 0, 'immune right after release');
  b.item = 'shoe'; K.useItem(g, 1); assert.ok(b.shoe > 0);
  const g2 = K.createGame({ seed: 5, humans: [{ uid: 'a', name: 'A' }, { uid: 'b', name: 'B' }], bots: false }); go(g2);
  const [p, q] = g2.karts; put(g2, p, 30); put(g2, q, 26); p.v = 0; q.v = 8;
  p.item = 'puddle'; K.useItem(g2, 0);
  const evs2 = race(g2, 1.2, () => { K.setInput(g2, 1, { steer: 0, gas: true }); });
  assert.ok(evs2.some(e => e.e === 'spin' && e.id === 1), 'Q slipped on the puddle');
  assert.equal(g2.hazards.length, K.ITEMS.puddle.drop.length - 1, 'one use drops a row of puddles; the one that was hit is used up');
});

test('item boxes: leader gets weaker items, last place gets stronger ones; boxes respawn', () => {
  const g = K.createGame({ seed: 9 }); go(g);
  const count = (rank, n = 4000) => { const k = g.karts[0], c = Object.fromEntries(K.ITEM_KINDS.map(kd => [kd, 0])); k.rank = rank; for (let i = 0; i < n; i++) c[K.rollItem(g, k)]++; return c; };
  const first = count(1), mid = count(2), last = count(4);
  assert.ok(first.puddle > first.shoe * 3, 'leader mostly gets puddles');
  assert.ok(last.shoe > last.puddle * 3, 'last place mostly gets shoes');
  assert.equal(first.jet, 0, 'the leader never gets the super jet');
  assert.ok(last.jet > mid.jet && mid.jet > 0, `jets go to karts behind: mid ${mid.jet}, last ${last.jet}`);
  assert.ok(first.shield > last.shield, 'shields go to the karts in front');
  const k = g.karts[0], b = g.boxes[0]; k.item = null; Object.assign(k, { x: b.x, y: b.y, hint: K.locate(b.x, b.y).i });
  const evs = K.step(g, .05);
  assert.ok(evs.some(e => e.e === 'item' && e.id === 0)); assert.ok(b.t > 0, 'box waits to respawn');
});

test('online style: humans only, forfeit ranks last with 0 points', () => {
  const g = K.createGame({ seed: 2, humans: [{ uid: 'a', name: 'A', color: '#a8d8ff', ear: 'fe' }, { uid: 'b', name: 'B', color: '#a8d8ff' }], bots: false });
  assert.equal(g.karts.length, 2); assert.equal(g.karts[0].color, '#a8d8ff'); assert.notEqual(g.karts[1].color, '#a8d8ff', 'colors stay unique'); assert.equal(g.karts[0].ear, 'fe');
  go(g); K.forfeit(g, 1);
  race(g, K.MAX_TIME + 5, () => K.setInput(g, 0, { steer: 0 }));
  assert.equal(g.over, true);
  const r = g.result.players; assert.equal(r.at(-1).uid, 'b'); assert.equal(r.at(-1).points, 0); assert.equal(r.at(-1).out, true);
});

test('collisions: karts never overlap; rear-ending slows the chaser and pushes the kart ahead', () => {
  const g = K.createGame({ seed: 1, humans: [{ uid: 'a', name: 'A' }, { uid: 'b', name: 'B' }], bots: false }); go(g);
  const [a, b] = g.karts; put(g, a, 20, 0); put(g, b, 21, 0); a.v = 10; b.v = 2;
  const evs = race(g, .2, () => { K.setInput(g, 0, { gas: true }); K.setInput(g, 1, {}); });
  assert.ok(Math.hypot(a.x - b.x, a.y - b.y) >= K.KART.R * 2 - 1e-6, 'pushed apart');
  assert.ok(a.v < 8, `chaser slowed to ${a.v.toFixed(2)}`); assert.ok(b.v > 2, `kart ahead got pushed to ${b.v.toFixed(2)}`);
  assert.ok(evs.some(e => e.e === 'crash'), 'crash event');
  // 4 台車同時塞在同一點也會被分開
  const g2 = K.createGame({ seed: 2 }); go(g2); for (const k of g2.karts) put(g2, k, 30, 0);
  K.step(g2, .05); K.step(g2, .05);
  for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) { const p = g2.karts[i], q = g2.karts[j]; assert.ok(Math.hypot(p.x - q.x, p.y - q.y) > K.KART.R, `karts ${i},${j} separated`); }
});

test('compact frames: about half the bytes; expandFrame with the start snapshot rebuilds the full snapshot exactly', () => {
  const g = K.createGame({ seed: 9, track: 'highway', humans: [{ uid: 'a', name: '玩家一號', color: '#a8d8ff' }, { uid: 'b', name: '玩家二號' }] });
  const base = K.snapshot(g);
  for (let i = 0; i < 900; i++) { K.setInput(g, 0, { gas: true, steer: Math.sin(i / 9), drift: i % 40 < 15 }); K.step(g, .05); if (i === 300) g.boxes[0].t = 3; }
  g.karts[1].shield = 2; g.karts[2].trap = 1; // 非 0 的旗標要原樣送出
  const full = K.snapshot(g), compact = K.snapshot(g, { full: false });
  assert.deepEqual(K.expandFrame(compact, base), full);
  assert.equal(K.expandFrame(full, base), full, 'full snapshots pass through');
  assert.ok(compact.karts.every(k => k.name === undefined && k.color === undefined && k.ear === undefined), 'no static kart fields');
  const n = o => JSON.stringify(o).length; assert.ok(n(compact) < n(full) * .6, `compact ${n(compact)} bytes vs full ${n(full)}`);
});

test('difficulty: hard bots drift into corners and chain boosts, finishing faster than normal; on the narrow road they skip chaining and still win on average', () => {
  assert.equal(K.createGame({ diff: 'nope' }).diff, 'normal'); assert.equal(K.createGame({ diff: 'hard' }).diff, 'hard');
  assert.deepEqual(Object.keys(K.DIFFS), ['normal', 'hard']);
  const run = (id, seed, diff) => { const g = K.createGame({ seed, track: id, diff }); let bump = 0, chain = 0; while (!g.over) for (const e of K.step(g, .05)) { if (e.e === 'bump') bump++; if (e.e === 'boost' && e.chain >= 2) chain++; } assert.equal(g.result.reason, 'all'); return { t: Math.min(...g.karts.map(k => k.finishT)), bump, chain }; };
  for (const tr of K.TRACKS) {
    let sumN = 0, sumH = 0;
    for (const seed of [1, 7, 11, 42]) {
      const n = run(tr.id, seed, 'normal'), h = run(tr.id, seed, 'hard'); sumN += n.t; sumH += h.t;
      if (tr.T.road < K.ROAD) { assert.ok(h.bump <= 15, `${tr.id} seed ${seed}: ${h.bump} bumps`); continue; }
      assert.ok(h.t < n.t, `${tr.id} seed ${seed}: hard ${h.t.toFixed(1)} s, normal ${n.t.toFixed(1)} s`);
      assert.ok(h.chain >= 1 && h.bump <= 2, `${tr.id} seed ${seed}: ${h.chain} chained boosts, ${h.bump} bumps`);
    }
    assert.ok(sumH < sumN, `${tr.id}: hard ${(sumH / 4).toFixed(1)} s vs normal ${(sumN / 4).toFixed(1)} s on average`);
  }
});

// 電腦跑完一場：最快完賽時間與撞牆次數
const botRace = (id, seed) => { const g = K.createGame({ seed, track: id }); let bump = 0; while (!g.over) for (const e of K.step(g, .05)) if (e.e === 'bump') bump++; assert.equal(g.result.reason, 'all'); return { t: Math.min(...g.karts.map(k => k.finishT)), bump }; };

test('track thunder: narrow road, 7+ tight hairpins, grid fits; bots finish slower than peak and hit more walls', () => {
  const T = K.trackById('thunder').T, N = T.N, wa = a => Math.atan2(Math.sin(a), Math.cos(a)), hd = i => Math.atan2(T.ty[i % N], T.tx[i % N]);
  assert.ok(T.road < K.ROAD && T.wall < K.WALL, `road ${T.road}, wall ${T.wall}`);
  let minR = Infinity;
  for (let i = 0; i < N; i++) {
    const a = (i - 6 + N) % N, b = (i + 6) % N, A = Math.hypot(T.xs[b] - T.xs[i], T.ys[b] - T.ys[i]), B = Math.hypot(T.xs[i] - T.xs[a], T.ys[i] - T.ys[a]), C = Math.hypot(T.xs[b] - T.xs[a], T.ys[b] - T.ys[a]);
    const area = Math.abs((T.xs[b] - T.xs[a]) * (T.ys[i] - T.ys[a]) - (T.ys[b] - T.ys[a]) * (T.xs[i] - T.xs[a])) / 2;
    if (area > 1e-9) minR = Math.min(minR, A * B * C / (4 * area));
  }
  assert.ok(minR > T.wall && minR < 6, `min radius ${minR.toFixed(2)}: tighter than peak, but the inner wall never folds over itself`);
  const W = Math.round(25 / T.STEP); let hairpins = 0;
  for (let i = 0; i < N;) { const d = wa(hd(i + W) - hd(i)); if (Math.abs(d) > Math.PI * 2 / 3) { const sg = Math.sign(d); let j = i; while (j < N + W && Math.abs(wa(hd(j + W) - hd(j))) > Math.PI * 2 / 3 && Math.sign(wa(hd(j + W) - hd(j))) === sg) j++; hairpins++; i = j + W; } else i++; }
  assert.ok(hairpins >= 7, `hairpins ${hairpins}`);
  const g0 = K.createGame({ seed: 1, track: 'thunder' });
  for (const k of g0.karts) assert.ok(Math.abs(K.locate(k.x, k.y, null, T).d) < T.road, 'every grid slot is on the narrow road');
  for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) { const p = g0.karts[i], q = g0.karts[j]; assert.ok(Math.hypot(p.x - q.x, p.y - q.y) >= K.KART.R * 2 - 1e-9, `grid ${i},${j} overlap`); }
  let bumpsT = 0, bumpsP = 0;
  for (const seed of [1, 7, 11, 42]) { const t = botRace('thunder', seed), p = botRace('peak', seed); assert.ok(t.t >= p.t + 3, `seed ${seed}: thunder ${t.t.toFixed(1)} s, peak ${p.t.toFixed(1)} s`); bumpsT += t.bump; bumpsP += p.bump; }
  assert.ok(bumpsT > bumpsP, `wall bumps: thunder ${bumpsT}, peak ${bumpsP}`);
});

test('track highway: town right-angle corners, a raised highway of wide bends; elev is drawing-only, starts on the ground, ramps stay gentle', () => {
  const tr = K.trackById('highway'), T = tr.T, N = T.N, wa = a => Math.atan2(Math.sin(a), Math.cos(a)), hd = i => Math.atan2(T.ty[i % N], T.tx[i % N]);
  const radius = i => {
    const a = (i - 6 + N) % N, b = (i + 6) % N, A = Math.hypot(T.xs[b] - T.xs[i], T.ys[b] - T.ys[i]), B = Math.hypot(T.xs[i] - T.xs[a], T.ys[i] - T.ys[a]), C = Math.hypot(T.xs[b] - T.xs[a], T.ys[b] - T.ys[a]);
    const area = Math.abs((T.xs[b] - T.xs[a]) * (T.ys[i] - T.ys[a]) - (T.ys[b] - T.ys[a]) * (T.xs[i] - T.xs[a])) / 2;
    return area > 1e-9 ? A * B * C / (4 * area) : Infinity;
  };
  // 直角彎：14 格內轉超過 60 度；高架大彎半徑 16，14 格只轉約 50 度，不算
  const W = Math.round(14 / T.STEP), sharp = i => Math.abs(wa(hd(i + W) - hd(i))) > Math.PI / 3; let corners = 0;
  for (let i = 0; i < N;) { if (sharp(i)) { corners++; while (sharp(i)) i++; } else i++; }
  assert.ok(corners >= 6, `town corners ${corners}`);
  const e = tr.elev, top = e.reduce((m, p) => Math.max(m, p[1]), 0);
  assert.ok(e[0][1] === 0 && e.at(-1)[1] === 0 && top >= 2, 'ramps go up from the ground and come back down');
  assert.ok(e[0][0] * T.L > 12 && (1 - e.at(-1)[0]) * T.L > 12, 'start line and grid stay on the ground');
  for (let k = 1; k < e.length; k++) {
    assert.ok(e[k][0] > e[k - 1][0] && e[k][0] < 1, 'ramp points in order');
    const slope = 1.5 * Math.abs(e[k][1] - e[k - 1][1]) / ((e[k][0] - e[k - 1][0]) * T.L); // 平滑過渡最陡處是平均坡度的 1.5 倍
    assert.ok(slope <= .3, `ramp ${k} slope ${slope.toFixed(2)}`);
  }
  const deck = e.filter(p => p[1] === top), i0 = Math.ceil(deck[0][0] * N), i1 = Math.floor(deck.at(-1)[0] * N);
  assert.ok((i1 - i0) / N >= .3, `raised section ${((i1 - i0) / N * 100).toFixed(0)}% of the lap`);
  for (let i = i0; i <= i1; i++) assert.ok(radius(i) >= 11, `highway bend at sample ${i}: radius ${radius(i).toFixed(1)}`); // 高架最急處是直線接大彎的過渡，半徑約 12；市區直角彎約 6
  for (const seed of [1, 7, 11, 42]) { const r = botRace('highway', seed); assert.ok(r.bump <= 3, `seed ${seed}: ${r.bump} wall bumps`); }
});

test('item boxes: every map has 4+ rows of 3 boxes, all on the road', () => {
  for (const tr of K.TRACKS) {
    const g = K.createGame({ seed: 1, track: tr.id });
    assert.ok(tr.boxes.length >= 4, `${tr.id}: ${tr.boxes.length} rows`); assert.equal(g.boxes.length, tr.boxes.length * 3);
    for (const b of g.boxes) assert.ok(Math.abs(K.locate(b.x, b.y, null, tr.T).d) < tr.T.road, `${tr.id}: box ${b.i} off the road`);
  }
});

test('shield: blocks one balloon or puddle, then pops; runs out after 8 s', () => {
  const g = K.createGame({ seed: 5, humans: [{ uid: 'a', name: 'A' }, { uid: 'b', name: 'B' }], bots: false }); go(g);
  const [a, b] = g.karts; put(g, a, 10); put(g, b, 16); a.v = b.v = 0;
  b.item = 'shield'; assert.equal(K.useItem(g, 1), true); assert.ok(b.shield > 0); assert.equal(K.snapshot(g).karts[1].sh, 1);
  const shoot = () => { a.item = 'balloon'; K.useItem(g, 0); return race(g, .8, () => { K.setInput(g, 1, {}); b.v = 0; }); };
  let evs = shoot();
  assert.ok(evs.some(e => e.e === 'block' && e.id === 1 && e.by === 0 && e.kind === 'balloon'), 'shield took the hit');
  assert.equal(b.trap, 0); assert.equal(b.shield, 0, 'shield popped');
  evs = shoot(); assert.ok(evs.some(e => e.e === 'hit' && e.id === 1 && e.kind === 'balloon'), 'the next balloon hits');
  const g2 = K.createGame({ seed: 5, humans: [{ uid: 'a', name: 'A' }, { uid: 'b', name: 'B' }], bots: false }); go(g2);
  const [p, q] = g2.karts; put(g2, p, 30); put(g2, q, 26); p.v = 0; q.v = 8;
  q.item = 'shield'; K.useItem(g2, 1); p.item = 'puddle'; K.useItem(g2, 0);
  const evs2 = race(g2, 1.2, () => K.setInput(g2, 1, { steer: 0, gas: true }));
  assert.ok(evs2.some(e => e.e === 'block' && e.id === 1 && e.kind === 'puddle'), 'shield blocked the puddle');
  assert.ok(!evs2.some(e => e.e === 'spin' && e.id === 1), 'no spin');
  q.item = 'shield'; K.useItem(g2, 1); race(g2, K.ITEMS.shield.time + .1); assert.equal(q.shield, 0, 'runs out');
});

test('super jet: follows the track around a bend to the kart ahead and traps it; a shield blocks it; the leader fires it down the track', () => {
  const setup = () => { const g = K.createGame({ seed: 5, humans: [{ uid: 'a', name: 'A' }, { uid: 'b', name: 'B' }], bots: false }); go(g); return g; };
  const g = setup(), [a, b] = g.karts, T = g.T;
  put(g, a, 10, -1.5); put(g, b, 60, 1.5); a.v = b.v = 0;
  const pa = K.trackPoint(10, -1.5), pb = K.trackPoint(60, 1.5), mid = K.trackPoint(35, 0);
  const off = Math.abs(((mid.x - pa.x) * (pb.y - pa.y) - (mid.y - pa.y) * (pb.x - pa.x)) / Math.hypot(pb.x - pa.x, pb.y - pa.y));
  assert.ok(off > 3, `the road bends between them (${off.toFixed(1)} cells off the straight line)`);
  a.item = 'jet'; K.useItem(g, 0); assert.equal(g.shots[0].target, 1, 'locks on to B');
  const evs = race(g, 3, () => { K.setInput(g, 1, {}); b.v = 0; for (const s of g.shots) assert.ok(Math.abs(K.locate(s.x, s.y).d) <= T.road + 1e-6, 'stays on the road'); });
  assert.ok(evs.some(e => e.e === 'hit' && e.id === 1 && e.by === 0 && e.kind === 'jet'), 'jet hit B');
  assert.equal(b.trap > 0 || b.immune > 0, true);
  const g2 = setup(), [c, d] = g2.karts; put(g2, c, 10); put(g2, d, 40); c.v = d.v = 0;
  d.item = 'shield'; K.useItem(g2, 1); c.item = 'jet'; K.useItem(g2, 0);
  const evs2 = race(g2, 3, () => { K.setInput(g2, 1, {}); d.v = 0; });
  assert.ok(evs2.some(e => e.e === 'block' && e.id === 1 && e.kind === 'jet'), 'shield blocked the jet');
  const g3 = setup(), [e, f] = g3.karts; put(g3, e, 50); put(g3, f, 10); e.v = f.v = 0;
  e.item = 'jet'; K.useItem(g3, 0); assert.equal(g3.shots[0].target, null, 'nobody ahead');
  const evs3 = race(g3, 6, () => { K.setInput(g3, 0, {}); K.setInput(g3, 1, {}); e.v = f.v = 0; });
  assert.ok(evs3.some(x => x.e === 'pop'), 'flies its full range and pops'); assert.ok(!evs3.some(x => x.e === 'hit'), 'never turns back');
  assert.equal(K.snapshot(g).shots.length, 0);
});

test('drift: scraping the wall pauses the spark charge', () => {
  const after = lat => {
    const g = K.createGame({ seed: 1, humans: [{ uid: 'a', name: 'A' }], bots: false }); go(g);
    const k = g.karts[0];
    for (let i = 0; i < 24; i++) { K.setInput(g, 0, { steer: .6, drift: true, gas: true }); put(g, k, 2, lat); k.v = 9; K.step(g, .05); }
    return k;
  };
  const clean = after(0), wall = after(K.WALL + .3);
  assert.equal(clean.level, 1, `clean drift reaches blue (charge ${clean.charge.toFixed(2)})`);
  assert.ok(wall.drift !== 0 && wall.charge < .1, `still drifting, charge paused at ${wall.charge.toFixed(2)}`);
});

test('chain drift: sparks charge 1.5x faster during a boost, so drift-boosts link up; a gap, a failed drift or a hit resets the chain', () => {
  const g = K.createGame({ seed: 1, humans: [{ uid: 'a', name: 'A' }], bots: false }); go(g);
  const k = g.karts[0];
  const hold = secs => { for (let i = 0; i < Math.round(secs / .05); i++) { K.setInput(g, 0, { steer: .6, drift: true, gas: true }); put(g, k, 2); k.v = 9; K.step(g, .05); } };
  const release = () => { K.setInput(g, 0, { steer: 0, drift: false, gas: true }); return K.step(g, .05).filter(e => e.e === 'boost').map(e => [e.level, e.chain]); };
  hold(.5); const plain = k.charge; release();
  k.boost = 5; hold(.5); const boosted = k.charge; release(); k.boost = 0;
  assert.ok(Math.abs(boosted / plain - K.DRIFT.CHAIN) < 1e-9, `charge ${plain} plain, ${boosted} in a boost`);
  hold(.8); assert.deepEqual(release(), [[1, 1]], 'first drift: blue, chain 1');
  hold(.6); assert.deepEqual(release(), [[1, 2]], '0.6 s is too short for blue on its own, but the boost speeds it up');
  hold(.6); assert.deepEqual(release(), [[1, 3]]);
  race(g, 1, () => K.setInput(g, 0, { gas: true })); assert.equal(k.boost, 0);
  hold(.8); assert.deepEqual(release(), [[1, 1]], 'drift after the boost ran out starts over');
  hold(.2); assert.deepEqual(release(), [], 'released before any spark'); assert.equal(k.chain, 0);
  hold(.6); assert.deepEqual(release(), [[1, 1]], 'still boosting, but the failed drift broke the chain');
  hold(.6); assert.deepEqual(release(), [[1, 2]]);
  g.hazards.push({ id: 999, owner: 0, x: k.x, y: k.y, life: 5, arm: 0 }); K.step(g, .05);
  assert.ok(k.spin > 0 && k.chain === 0, 'spinning out resets the chain');
});
