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
  // 每個種子都要比雲朵山路慢；差距看平均，道具讓單一場的首位完賽時間上下差好幾秒
  let sumP = 0, sumC = 0;
  for (const seed of [1, 7, 11, 42]) { const p = first('peak', seed), c = first('cloud', seed); sumP += p.t; sumC += c.t; assert.ok(p.t >= c.t && p.t >= 88, `seed ${seed}: peak ${p.t.toFixed(1)} s, cloud ${c.t.toFixed(1)} s`); assert.ok(p.bump <= 12, `seed ${seed}: ${p.bump} bumps`); }
  assert.ok(sumP / 4 >= sumC / 4 + 3, `average: peak ${(sumP / 4).toFixed(1)} s, cloud ${(sumC / 4).toFixed(1)} s`);
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

test('items: the super jet traps the kart ahead, then grants immunity; shoe boosts; puddle spins', () => {
  const g = K.createGame({ seed: 5, humans: [{ uid: 'a', name: 'A' }, { uid: 'b', name: 'B' }], bots: false }); go(g);
  const [a, b] = g.karts; put(g, a, 10, 0); put(g, b, 16, 0); a.v = b.v = 0;
  a.item = 'jet'; assert.equal(K.useItem(g, 0), true); assert.equal(a.item, null);
  const evs = race(g, .8, () => { K.setInput(g, 1, {}); b.v = 0; });
  assert.ok(evs.some(e => e.e === 'hit' && e.id === 1 && e.by === 0 && e.kind === 'jet'), 'B trapped');
  assert.ok(b.trap > 0);
  race(g, K.ITEMS.jet.trap + .1); assert.equal(b.trap, 0); assert.ok(b.immune > 0, 'immune right after release');
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
  assert.equal(first.storm, 0, 'the leader never gets the storm cloud'); assert.ok(last.storm > mid.storm * 2 && mid.storm > 0, `storm clouds go to the back: mid ${mid.storm}, last ${last.storm}`);
  assert.ok(!K.ITEM_KINDS.includes('balloon') && !K.ITEMS.balloon, 'the aimless water balloon is gone');
  assert.ok(last.shoe > mid.shoe * 1.3 && mid.shoe > first.shoe * 2, `speed shoes go to the back: ${first.shoe} / ${mid.shoe} / ${last.shoe}`);
  assert.equal(last.decoy, 0, 'last place never gets a fake box'); assert.ok(first.decoy > mid.decoy, 'fake boxes go to the front');
  assert.ok(mid.hot > first.hot && mid.hot > last.hot, `hot bubbles go to the middle: ${first.hot} / ${mid.hot} / ${last.hot}`);
  for (const kd of K.ITEM_KINDS) assert.ok(K.ITEMS[kd], `${kd} has settings`);
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
    // 窄路上困難電腦不連噴，只快一點點（12 個種子平均約 2 秒），用 12 個種子才比得出來
    const seeds = tr.T.road < K.ROAD ? [1, 7, 11, 42, 99, 123, 5, 13, 21, 34, 55, 89] : [1, 7, 11, 42];
    let sumN = 0, sumH = 0, chains = 0, bumps = 0;
    for (const seed of seeds) {
      const n = run(tr.id, seed, 'normal'), h = run(tr.id, seed, 'hard'); sumN += n.t; sumH += h.t; chains += h.chain;
      if (tr.T.road < K.ROAD) { bumps += h.bump; assert.ok(h.bump <= 20, `${tr.id} seed ${seed}: ${h.bump} bumps`); continue; } // 12 個種子實測 5 到 19 次
      assert.ok(h.t < n.t, `${tr.id} seed ${seed}: hard ${h.t.toFixed(1)} s, normal ${n.t.toFixed(1)} s`);
      assert.ok(h.bump <= 2, `${tr.id} seed ${seed}: ${h.bump} bumps`);
    }
    // 道具會打斷連噴（被打中、偷道具、假道具箱），單一種子可能一次都沒連上；4 個種子加起來一定有
    if (tr.T.road >= K.ROAD) assert.ok(chains >= 2, `${tr.id}: ${chains} chained boosts over 4 seeds`);
    else assert.ok(bumps / seeds.length <= 15, `${tr.id}: ${(bumps / seeds.length).toFixed(1)} bumps per race on average`);
    assert.ok(sumH < sumN, `${tr.id}: hard ${(sumH / seeds.length).toFixed(1)} s vs normal ${(sumN / seeds.length).toFixed(1)} s on average`);
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
  // 比 4 個種子的平均：道具（雷雨雲、小幽靈）讓單一場的首位完賽時間上下差到 6 秒
  let bumpsT = 0, bumpsP = 0, sumT = 0, sumP = 0;
  for (const seed of [1, 7, 11, 42]) { const t = botRace('thunder', seed), p = botRace('peak', seed); assert.ok(t.t >= p.t, `seed ${seed}: thunder ${t.t.toFixed(1)} s, peak ${p.t.toFixed(1)} s`); sumT += t.t; sumP += p.t; bumpsT += t.bump; bumpsP += p.bump; }
  assert.ok(sumT / 4 >= sumP / 4 + 5, `average: thunder ${(sumT / 4).toFixed(1)} s, peak ${(sumP / 4).toFixed(1)} s`);
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

test('shield: blocks one super jet or puddle, then pops; runs out after 8 s', () => {
  const g = K.createGame({ seed: 5, humans: [{ uid: 'a', name: 'A' }, { uid: 'b', name: 'B' }], bots: false }); go(g);
  const [a, b] = g.karts; put(g, a, 10); put(g, b, 16); a.v = b.v = 0;
  b.item = 'shield'; assert.equal(K.useItem(g, 1), true); assert.ok(b.shield > 0); assert.equal(K.snapshot(g).karts[1].sh, 1);
  const shoot = () => { a.item = 'jet'; K.useItem(g, 0); return race(g, .8, () => { K.setInput(g, 1, {}); b.v = 0; }); };
  let evs = shoot();
  assert.ok(evs.some(e => e.e === 'block' && e.id === 1 && e.by === 0 && e.kind === 'jet'), 'shield took the hit');
  assert.equal(b.trap, 0); assert.equal(b.shield, 0, 'shield popped');
  evs = shoot(); assert.ok(evs.some(e => e.e === 'hit' && e.id === 1 && e.kind === 'jet'), 'the next jet hits');
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
  g.hazards.push({ id: 999, owner: 0, kind: 'puddle', x: k.x, y: k.y, life: 5, arm: 0 }); K.step(g, .05);
  assert.ok(k.spin > 0 && k.chain === 0, 'spinning out resets the chain');
});

// 3 位真人、不補電腦，方便擺位置測道具
const trio = (opts = {}) => { const g = K.createGame({ seed: 1, humans: [{ uid: 'a', name: 'A' }, { uid: 'b', name: 'B' }, { uid: 'c', name: 'C' }], bots: false, ...opts }); go(g); return g; };
const idle = g => () => { for (const k of g.karts) K.setInput(g, k.id, {}); };
const stepUntil = (g, pred, secs = 10) => { const evs = []; for (let i = 0; i < secs / .05; i++) { idle(g)(); const e = K.step(g, .05); evs.push(...e.map(x => ({ ...x, t: g.time }))); if (pred(e)) break; } return evs; };

test('speed race: no item boxes; drifting fills the nitro gauge (at most 2 stored), the item key fires a nitro boost; item races never fill it', () => {
  assert.equal(K.createGame({ mode: 'nope' }).mode, 'item'); assert.deepEqual(Object.keys(K.MODES), ['item', 'speed']);
  const drift = (g, secs) => { const k = g.karts[0], evs = []; for (let i = 0; i < Math.round(secs / .05); i++) { K.setInput(g, 0, { steer: .6, drift: true, gas: true }); put(g, k, 2); k.v = 9; evs.push(...K.step(g, .05)); } K.setInput(g, 0, { gas: true }); evs.push(...K.step(g, .05)); return evs; };
  const g = K.createGame({ seed: 1, mode: 'speed', humans: [{ uid: 'a', name: 'A' }], bots: false }); go(g);
  const k = g.karts[0];
  assert.equal(g.boxes.length, 0); assert.equal(K.snapshot(g).mode, 'speed');
  assert.equal(K.useItem(g, 0), false, 'no nitro yet');
  let evs = drift(g, K.NITRO.fill * .9); assert.equal(k.nitro, 0, 'gauge not full yet'); assert.ok(k.gauge > .8);
  evs = drift(g, K.NITRO.fill * 3);
  assert.deepEqual(evs.filter(e => e.e === 'nitro').map(e => e.n), [1, 2], 'one nitro per full gauge'); assert.equal(k.nitro, K.NITRO.max, 'stops at the max');
  assert.equal(K.useItem(g, 0), true); assert.equal(k.nitro, 1); assert.equal(k.shoe, K.ITEMS.shoe.time, 'same boost as the speed shoe');
  const gi = K.createGame({ seed: 1, humans: [{ uid: 'a', name: 'A' }], bots: false }); go(gi); drift(gi, K.NITRO.fill * 3);
  assert.equal(gi.karts[0].nitro, 0); assert.equal(gi.karts[0].gauge, 0, 'item races have no nitro gauge');
});

test('speed race bots: hard bots collect and fire nitro and beat their item-race times; every speed race finishes', () => {
  let speed = 0, item = 0, used = 0;
  for (const seed of [1, 7]) {
    const gs = K.createGame({ seed, track: 'candy', diff: 'hard', mode: 'speed' }), gi = K.createGame({ seed, track: 'candy', diff: 'hard' });
    while (!gs.over) for (const e of K.step(gs, .05)) if (e.e === 'use' && e.kind === 'nitro') used++;
    while (!gi.over) K.step(gi, .05);
    assert.equal(gs.result.reason, 'all'); speed += Math.min(...gs.karts.map(k => k.finishT)); item += Math.min(...gi.karts.map(k => k.finishT));
  }
  assert.ok(used >= 20, `${used} nitros fired in 2 races`); assert.ok(speed < item, `speed ${speed / 2} s vs item ${item / 2} s`);
});

test('storm cloud: flies over walls to the leader, rains 2 s later and traps them; follows a new leader; a shield blocks it; a see-through leader makes it wait', () => {
  let g = trio(); let [a, b, c] = g.karts; put(g, a, 10); put(g, b, 60, 1.5); put(g, c, 40, -1.5);
  a.item = 'storm'; assert.ok(K.useItem(g, 0)); assert.equal(g.shots[0].target, b.id, 'locks on to the leader');
  let evs = stepUntil(g, e => e.some(x => x.e === 'hit'));
  const cloud = evs.find(e => e.e === 'cloud'), hit = evs.find(e => e.e === 'hit');
  assert.equal(cloud.id, b.id); assert.deepEqual([hit.id, hit.by, hit.kind], [b.id, a.id, 'storm']);
  assert.ok(Math.abs(hit.t - cloud.t - K.ITEMS.storm.delay) < .11, `rain ${(hit.t - cloud.t).toFixed(2)} s after the cloud arrives`); assert.ok(b.trap > 0);
  // 第一名完賽：改追新的第一名
  g = trio(); [a, b, c] = g.karts; put(g, a, 10); put(g, b, 60); put(g, c, 40);
  a.item = 'storm'; K.useItem(g, 0); b.done = true; K.step(g, .05); assert.equal(g.shots[0].target, c.id);
  // 泡泡盾擋下
  g = trio(); [a, b, c] = g.karts; put(g, a, 10); put(g, b, 30); put(g, c, 20);
  a.item = 'storm'; K.useItem(g, 0); b.shield = 8; evs = stepUntil(g, e => e.some(x => x.e === 'block'));
  assert.ok(evs.some(e => e.e === 'block' && e.id === b.id && e.kind === 'storm')); assert.equal(b.trap, 0); assert.equal(b.shield, 0);
  // 目標透明：雲停在頭上等，透明結束才開始倒數
  g = trio(); [a, b, c] = g.karts; put(g, a, 10); put(g, b, 20); put(g, c, 15);
  a.item = 'storm'; K.useItem(g, 0); b.ghost = 3; evs = stepUntil(g, e => e.some(x => x.e === 'cloud'));
  assert.ok(evs.at(-1).t >= 3 - .06, `cloud lands at ${evs.at(-1).t.toFixed(2)} s, after the ghost wears off`);
});

test('hot bubble: sticks to the kart ahead; passes on contact (topped up to 1.5 s, no instant pass-back); traps whoever holds it at 0; the leader throws it backwards', () => {
  let g = trio(); let [a, b, c] = g.karts; put(g, a, 10, -1); put(g, b, 30, 1); put(g, c, 90);
  a.item = 'hot'; K.useItem(g, 0); assert.equal(g.shots[0].target, b.id);
  let evs = stepUntil(g, e => e.some(x => x.e === 'stick')); assert.ok(evs.some(e => e.e === 'stick' && e.id === b.id && e.by === a.id));
  b.hot = .5; put(g, c, b.total + .3, 0); put(g, b, b.total, .1); K.step(g, .05);
  assert.equal(b.hot, 0); assert.equal(c.hot, K.ITEMS.hot.min, 'receiver gets at least 1.5 s'); assert.ok(c.hotCD > 0);
  put(g, b, c.total + .3, 0); K.step(g, .05); assert.ok(c.hot > 0 && b.hot === 0, 'cannot pass it straight back');
  put(g, b, c.total + 40); evs = stepUntil(g, e => e.some(x => x.e === 'hit'));
  assert.deepEqual(evs.filter(e => e.e === 'hit').map(e => [e.id, e.by, e.kind]), [[c.id, b.id, 'hot']], 'explodes on the holder, credited to whoever passed it'); assert.ok(c.trap > 0);
  // 第一名：往後黏；就在旁邊：直接黏上
  g = trio(); [a, b, c] = g.karts; put(g, a, 60); put(g, b, 40); put(g, c, 10);
  a.item = 'hot'; K.useItem(g, 0); assert.equal(g.shots[0].target, b.id); assert.equal(g.shots[0].dir, -1);
  evs = stepUntil(g, e => e.some(x => x.e === 'stick')); assert.ok(b.hot > 0);
  g = trio(); [a, b, c] = g.karts; put(g, a, 20, -1.5); put(g, b, 20.5, 1.5); put(g, c, 80);
  a.item = 'hot'; K.useItem(g, 0); assert.equal(g.shots.length, 0); assert.equal(b.hot, K.ITEMS.hot.fuse);
});

test('ghost: steals the item of the nearest kart ahead (behind when nobody ahead has one); for 3 s super jets and karts pass through', () => {
  let g = trio(); let [a, b, c] = g.karts; put(g, a, 10); put(g, b, 30); put(g, c, 50);
  a.item = 'ghost'; b.item = 'shield'; c.item = 'jet';
  const evs = []; K.useItem(g, 0); evs.push(...K.step(g, .05));
  assert.equal(a.item, 'shield'); assert.equal(b.item, null); assert.equal(c.item, 'jet');
  assert.ok(evs.some(e => e.e === 'steal' && e.id === a.id && e.from === b.id && e.kind === 'shield'));
  assert.ok(a.ghost > 2.9); assert.equal(K.snapshot(g).karts[0].gh, 1);
  // 水柱放在車後 1.3 格（每步沿賽道飛 1.3 格），下一步剛好打到車子的位置
  const shoot = () => { a.v = 0; g.shots.push({ id: g.nextId++, owner: c.id, kind: 'jet', target: a.id, dir: 1, prog: a.total - K.ITEMS.jet.speed * .05, lat: K.locate(a.x, a.y, a.hint).d, x: a.x, y: a.y, dist: 0 }); K.step(g, .05); };
  shoot(); assert.equal(a.trap, 0, 'the jet passes through');
  put(g, b, a.total + .2); a.v = b.v = 0; K.step(g, .05);
  assert.ok(Math.hypot(a.x - b.x, a.y - b.y) < K.KART.R, 'karts pass through too');
  put(g, b, a.total + 30); race(g, 3.1, idle(g)); assert.equal(a.ghost, 0);
  shoot(); assert.ok(a.trap > 0, 'the same jet hits once the ghost wears off');
  g = trio(); [a, b, c] = g.karts; put(g, a, 60); put(g, b, 40); put(g, c, 10);
  a.item = 'ghost'; c.item = 'jet'; b.item = 'puddle'; K.useItem(g, 0); assert.equal(a.item, 'puddle', 'nearest one behind');
});

test('fake item box: dropped behind, shows as a box in the snapshot, spins whoever hits it; the owner is safe for 0.5 s; at most 4 on the track', () => {
  const g = trio(); const [a, b] = g.karts; put(g, a, 30); put(g, b, 80);
  a.item = 'decoy'; K.useItem(g, 0);
  assert.equal(g.hazards.length, 1); assert.equal(g.hazards[0].kind, 'decoy'); assert.equal(K.snapshot(g).haz[0][3], 1);
  const z = g.hazards[0]; Object.assign(a, { x: z.x, y: z.y }); a.v = 0; K.step(g, .05); assert.equal(a.spin, 0, 'owner safe while arming');
  Object.assign(b, { x: z.x, y: z.y, hint: K.locate(z.x, z.y).i }); const evs = K.step(g, .05);
  assert.ok(evs.some(e => e.e === 'spin' && e.id === b.id && e.by === a.id && e.kind === 'decoy')); assert.ok(b.spin > 0);
  for (let i = 0; i < 6; i++) { a.item = 'decoy'; put(g, a, 100 + i * 5); K.useItem(g, 0); }
  a.item = 'puddle'; put(g, a, 150); K.useItem(g, 0);
  assert.equal(g.hazards.filter(h => h.kind === 'decoy').length, K.ITEMS.decoy.max); assert.equal(g.hazards.filter(h => h.kind === 'puddle').length, 3, 'puddles keep their own limit');
});

test('compact frames carry the new states: cloud, hot bubble seconds, see-through, nitro, storm and hot shots, fake boxes, mode', () => {
  const g = trio({ mode: 'speed' }), base = K.snapshot(g); const [a, b, c] = g.karts;
  Object.assign(a, { storm: 1.2, hot: 2.3, nitro: 2, gauge: .42 }); b.ghost = 1;
  g.shots.push({ id: 50, owner: 1, kind: 'storm', x: 1, y: 2, target: 0, life: 5, dist: 0 }, { id: 51, owner: 2, kind: 'hot', x: 3, y: 4, target: 0, prog: 5, lat: 0, dir: 1, dist: 0 });
  g.hazards.push({ id: 52, owner: 2, kind: 'decoy', x: 5, y: 6, life: 9, arm: 0 });
  const full = K.snapshot(g), compact = K.snapshot(g, { full: false });
  assert.deepEqual(K.expandFrame(compact, base), full); assert.equal(compact.mode, undefined, 'mode only travels in the start snapshot');
  const ka = full.karts[0]; assert.deepEqual([ka.cl, ka.ho, ka.ni, ka.ga, full.karts[1].gh], [1, 3, 2, .4, 1]);
  assert.deepEqual(full.shots.map(s => s[3]), [K.SHOT_CODE.storm, K.SHOT_CODE.hot]); assert.deepEqual(full.haz.map(h => h[3]), [1]);
});

test('bots use every new item and the items land: clouds, sticks and passes, steals, fake-box spins', () => {
  const c = {};
  for (const id of ['candy', 'peak', 'highway']) for (const seed of [1, 7, 42]) { const g = K.createGame({ seed, track: id }); while (!g.over) for (const e of K.step(g, .05)) { const key = e.e === 'use' || e.e === 'spin' ? `${e.e}:${e.kind}` : e.e; c[key] = (c[key] || 0) + 1; } }
  for (const key of ['use:storm', 'use:hot', 'use:ghost', 'use:decoy', 'cloud', 'stick', 'pass', 'steal', 'spin:decoy']) assert.ok(c[key] >= 1, `${key}: ${c[key] || 0}`);
});
