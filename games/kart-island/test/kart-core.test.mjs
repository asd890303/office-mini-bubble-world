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
  // 12 種道具的隨機性很大（泡泡火箭一次就快 30 格），單一種子 peak 可能比 cloud 快；8 個種子平均實測慢 4.1 秒（平均 90.5 對 86.4 秒）
  const seeds = [1, 7, 11, 42, 99, 123, 5, 13];
  for (const seed of seeds) { const p = first('peak', seed), c = first('cloud', seed); sumP += p.t; sumC += c.t; assert.ok(p.bump <= 12, `seed ${seed}: ${p.bump} bumps`); }
  assert.ok(sumP / seeds.length >= 88 && sumP / seeds.length >= sumC / seeds.length + 3, `average: peak ${(sumP / seeds.length).toFixed(1)} s, cloud ${(sumC / seeds.length).toFixed(1)} s`);
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
  assert.deepEqual([first.foam, first.rocket, first.magnet, mid.rocket, last.big], [0, 0, 0, 0, 0], 'leader: no soap cloud, rocket or magnet; rocket is last place only; last place gets no giant bubble');
  assert.ok(last.rocket > 0 && last.foam > mid.foam && mid.foam > 0 && mid.magnet > 0 && first.big > 0 && mid.big > 0, `second batch: foam ${mid.foam}/${last.foam}, rocket ${last.rocket}, magnet ${mid.magnet}/${last.magnet}, big ${first.big}/${mid.big}`);
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

test('difficulty: hard bots drift into corners and chain boosts, finishing faster than normal; on the narrow road they skip chaining and keep up with normal', () => {
  assert.equal(K.createGame({ diff: 'nope' }).diff, 'normal'); assert.equal(K.createGame({ diff: 'hard' }).diff, 'hard');
  assert.deepEqual(Object.keys(K.DIFFS), ['normal', 'hard']);
  // 撞牆只算自己開的：被泡泡雲蓋住時方向本來就會亂飄
  const run = (id, seed, diff, mode = 'item') => { const g = K.createGame({ seed, track: id, diff, mode }); let bump = 0, chain = 0; while (!g.over) for (const e of K.step(g, .05)) { if (e.e === 'bump' && !(g.karts[e.id].foam > 0)) bump++; if (e.e === 'boost' && e.chain >= 2) chain++; } assert.equal(g.result.reason, 'all'); return { t: Math.min(...g.karts.map(k => k.finishT)), bump, chain }; };
  // 開法的好壞用競速賽比：道具和電腦隨機配的能力會讓同一個種子差 5 秒以上，競速賽沒有道具（實測困難每場快 5.2 到 26.4 秒；尾流讓普通電腦也常跟車加速，差距比加尾流前小）
  let sumN = 0, sumH = 0, races = 0;
  for (const tr of K.TRACKS.filter(t => t.T.road >= K.ROAD)) {
    let chains = 0;
    for (const seed of [1, 7, 11, 42]) {
      const n = run(tr.id, seed, 'normal', 'speed'), h = run(tr.id, seed, 'hard', 'speed'); chains += h.chain;
      assert.ok(h.t < n.t - 3, `${tr.id} seed ${seed} (speed race): hard ${h.t.toFixed(1)} s, normal ${n.t.toFixed(1)} s`);
      assert.ok(h.bump <= 2, `${tr.id} seed ${seed}: ${h.bump} bumps`);
      sumN += run(tr.id, seed, 'normal').t; sumH += run(tr.id, seed, 'hard').t; races++;
    }
    assert.ok(chains >= 2, `${tr.id}: ${chains} chained boosts over 4 seeds`);
  }
  // 道具賽：5 張地圖各 4 個種子加起來，困難平均每場快 3 秒以上（實測 9.4 秒）
  assert.ok(sumN - sumH >= 3 * races, `item races: hard only ${((sumN - sumH) / races).toFixed(1)} s faster on average`);
  // 雷霆峽谷：困難不連噴，開法和普通一樣，只差最高速；這張圖卡在過彎，12 個種子平均差不到 1 秒（實測慢 0.5 秒，加尾流前快 0.7 秒）。
  // 試過讓困難在急彎前放油門，反而慢 3 到 6 秒（貼牆滑過去比較快），所以只要求不明顯比普通慢。
  // 電腦配到極速等能力後在窄路撞牆變多：實測單場 4 到 23 次、平均 13.9 次。
  // 不連噴的證據：困難的連噴次數和普通差不多（實測平均 15.3 對 14.2 次，甩尾能力讓一般漂移也會接上；暴風山脊困難平均 52 次）
  const seeds = [1, 7, 11, 42, 99, 123, 5, 13, 21, 34, 55, 89]; let tn = 0, th = 0, bumps = 0, chains = 0, chainsN = 0;
  for (const seed of seeds) { const n = run('thunder', seed, 'normal'), h = run('thunder', seed, 'hard'); tn += n.t; th += h.t; bumps += h.bump; chains += h.chain; chainsN += n.chain; assert.ok(h.bump <= 30, `thunder seed ${seed}: ${h.bump} bumps`); }
  assert.ok(th <= tn + 1.5 * seeds.length, `thunder: hard ${(th / seeds.length).toFixed(1)} s vs normal ${(tn / seeds.length).toFixed(1)} s on average`);
  assert.ok(bumps / seeds.length <= 18, `thunder: ${(bumps / seeds.length).toFixed(1)} bumps per race on average`);
  assert.ok(chains / seeds.length <= chainsN / seeds.length + 3, `thunder: hard ${(chains / seeds.length).toFixed(1)} vs normal ${(chainsN / seeds.length).toFixed(1)} chained boosts per race, should skip chaining`);
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

// 水柱放在 k 後面一步的位置，下一步剛好打到 k（同小幽靈測試）
const jetAt = (g, k, owner) => { g.shots.push({ id: g.nextId++, owner, kind: 'jet', target: k.id, dir: 1, prog: k.total - K.ITEMS.jet.speed * .05, lat: K.locate(k.x, k.y, k.hint).d, x: k.x, y: k.y, dist: 0 }); return K.step(g, .05); };

test('soap cloud: covers every kart ahead for 3 s (a shield blocks, see-through and rocket karts are skipped, karts behind are safe); bots wobble, humans keep their own steering', () => {
  let g = trio(); let [a, b, c] = g.karts; put(g, a, 30); put(g, b, 50); put(g, c, 10);
  a.item = 'foam'; K.useItem(g, 0); let evs = K.step(g, .05);
  assert.ok(b.foam > 2.9 && c.foam === 0 && a.foam === 0, 'only the kart ahead'); assert.equal(K.snapshot(g).karts[1].fo, 1);
  race(g, 3, idle(g)); assert.equal(b.foam, 0, 'wears off after 3 s');
  g = trio(); [a, b, c] = g.karts; put(g, a, 10); put(g, b, 30); put(g, c, 50); b.shield = 8; c.ghost = 2;
  a.item = 'foam'; K.useItem(g, 0); evs = K.step(g, .05);
  assert.ok(evs.some(e => e.e === 'block' && e.id === b.id && e.kind === 'foam') && b.shield === 0 && b.foam === 0, 'shield blocks it'); assert.equal(c.foam, 0, 'see-through kart is skipped');
  g = trio(); [a, b] = g.karts; put(g, a, 10); put(g, b, 30); b.rocket = 2; a.item = 'foam'; K.useItem(g, 0); assert.equal(b.foam, 0, 'rocket kart is skipped');
  // 電腦：同一個種子，一場被蓋住、一場沒有，被蓋住的那台開的路線不一樣
  const drive = foam => { const g = K.createGame({ seed: 4, bots: true }); go(g); race(g, 4); g.karts[1].foam = foam; race(g, 1.5); return g.karts[1]; }; // 先開 4 秒，車速起來再蓋
  const clear = drive(0), foamed = drive(3);
  assert.ok(Math.hypot(clear.x - foamed.x, clear.y - foamed.y) > .3, `covered bot wobbles off its line: ${Math.hypot(clear.x - foamed.x, clear.y - foamed.y).toFixed(2)} cells`);
  // 真人：泡泡雲只蓋畫面，同樣的輸入開出同樣的路線
  const human = foam => { const g = trio(); g.karts[0].foam = foam; race(g, 1.5, () => K.setInput(g, 0, { steer: .3, gas: true })); return g.karts[0]; };
  const h0 = human(0), h1 = human(3); assert.ok(Math.hypot(h0.x - h1.x, h0.y - h1.y) < 1e-9, 'human steering untouched');
});

test('bubble rocket: rides the track for 3 s at double speed with no gas, back toward the middle; rams karts in the way; jets, storms and hot bubbles miss it; crushes puddles; never scrapes a wall even on the narrow road', () => {
  let g = trio(); let [a, b, c] = g.karts; put(g, a, 10, 2); put(g, b, 25, 1.5); put(g, c, 120); a.v = 0;
  a.item = 'rocket'; K.useItem(g, 0); assert.equal(a.rocket, K.ITEMS.rocket.time);
  let evs = race(g, 1.5, idle(g));
  assert.ok(a.total > 10 + 28, `rode ${(a.total - 10).toFixed(1)} cells in 1.5 s without gas`); assert.equal(a.v, K.KART.VMAX * K.ITEMS.rocket.mult);
  assert.ok(Math.abs(K.locate(a.x, a.y, a.hint).d) < .3, `eased back to the middle: ${K.locate(a.x, a.y, a.hint).d.toFixed(2)}`);
  assert.ok(evs.some(e => e.e === 'spin' && e.id === b.id && e.by === a.id && e.kind === 'rocket') && a.spin === 0, 'rammed the kart in the way');
  assert.equal(evs.filter(e => e.e === 'spin' && e.id === b.id).length, 1, 'one ram, one spin');
  evs = jetAt(g, a, c.id); assert.equal(a.trap, 0, 'the jet misses');
  a.storm = .04; evs = K.step(g, .05); assert.ok(evs.some(e => e.e === 'miss' && e.id === a.id && e.kind === 'storm') && a.trap === 0, 'the storm rain misses');
  c.hot = 2; c.hotCD = 0; put(g, c, a.total + .3, K.locate(a.x, a.y, a.hint).d); K.step(g, .05); assert.equal(a.hot, 0, 'a hot bubble cannot be passed to it');
  const ahead = K.trackPoint(a.total + K.KART.VMAX * K.ITEMS.rocket.mult * .05, 0); // 火箭這一步會往前 1 格，水窪放在那裡
  g.hazards.push({ id: 99, owner: c.id, kind: 'puddle', x: ahead.x, y: ahead.y, life: 9, arm: 0 }); K.step(g, .05);
  assert.ok(!g.hazards.some(z => z.id === 99) && a.spin === 0, 'crushes the puddle');
  race(g, 1.6, idle(g)); assert.equal(a.rocket, 0, 'ends after 3 s'); assert.equal(K.snapshot(g).karts[0].ro, 0);
  const v0 = a.v; K.step(g, .05); assert.ok(a.v < v0, 'slows back down to normal');
  // 雷霆峽谷（路寬 4.4 格、髮夾彎半徑 4.6）：坐火箭繞 3 秒不擦牆
  g = K.createGame({ seed: 1, humans: [{ uid: 'a', name: 'A' }], bots: false, track: 'thunder' }); go(g); a = g.karts[0];
  race(g, 4, () => K.setInput(g, 0, { gas: true })); a.item = 'rocket'; K.useItem(g, 0);
  evs = race(g, 3); assert.equal(evs.filter(e => e.e === 'bump').length, 0, 'no wall bumps'); assert.ok(a.total > 60, `${a.total.toFixed(1)} cells`);
});

test('magnet: pulls toward the nearest kart ahead at 1.6x speed and lets go within 2 cells; retargets when the target turns see-through; boosts even with nobody ahead; never rewrites the player input', () => {
  let g = trio(); let [a, b, c] = g.karts; put(g, a, 10, -2); put(g, b, 30, 2); put(g, c, 120); b.v = 0;
  a.item = 'magnet'; K.useItem(g, 0); assert.equal(a.magnetT, b.id);
  let snap = K.snapshot(g).karts[0]; assert.deepEqual([snap.mg, snap.mt, snap.bo], [1, b.id + 1, 1]);
  K.setInput(g, 0, { steer: 0 }); let evs = [], vmax = 0;
  for (let i = 0; i < 60 && !evs.some(e => e.e === 'catch'); i++) { evs.push(...K.step(g, .05)); vmax = Math.max(vmax, a.v); }
  const caught = evs.find(e => e.e === 'catch'); assert.ok(caught && caught.id === a.id && caught.by === b.id, 'caught up');
  assert.ok(b.total - a.total <= K.ITEMS.magnet.near + .1 && a.magnet === 0, 'lets go within 2 cells');
  assert.ok(vmax > K.KART.VMAX * 1.4, `pulled at ${vmax.toFixed(1)} cells/s with no gas`);
  assert.ok(K.locate(a.x, a.y, a.hint).d > -1, `steered toward the target's lane: ${K.locate(a.x, a.y, a.hint).d.toFixed(2)}`);
  assert.equal(a.steer, 0, 'player input untouched');
  g = trio(); [a, b, c] = g.karts; put(g, a, 10); put(g, b, 30); put(g, c, 45);
  a.item = 'magnet'; K.useItem(g, 0); b.ghost = 3; K.step(g, .05); assert.equal(a.magnetT, c.id, 'retargets past a see-through kart');
  g = trio(); [a, b, c] = g.karts; put(g, a, 100); put(g, b, 30); put(g, c, 20);
  a.item = 'magnet'; K.useItem(g, 0); assert.equal(a.magnetT, null); vmax = 0;
  race(g, 2, () => { K.setInput(g, 0, { gas: true }); vmax = Math.max(vmax, a.v); }); assert.ok(vmax > K.KART.VMAX * 1.4, 'still a boost with nobody ahead');
});

test('giant bubble: a bigger kart for 5 s; bumping a normal kart spins it while the giant keeps going; a shield pops once with no follow-up spin; crushes puddles; jets still hit; two giants just bump', () => {
  let g = trio(); let [a, b, c] = g.karts; put(g, a, 30); put(g, b, 30, 1.5); put(g, c, 120);
  K.step(g, .05); assert.ok(Math.abs(K.locate(b.x, b.y, b.hint).d - 1.5) < .01, '1.5 apart: normal karts do not touch');
  a.item = 'big'; K.useItem(g, 0); assert.equal(K.snapshot(g).karts[0].bg, 1);
  a.v = b.v = 6; let evs = K.step(g, .05);
  assert.ok(evs.some(e => e.e === 'spin' && e.id === b.id && e.by === a.id && e.kind === 'big'), 'rams the kart beside it'); assert.equal(a.spin, 0);
  assert.ok(Math.hypot(a.x - b.x, a.y - b.y) >= K.KART.R * (1 + K.ITEMS.big.scale) - .01, 'pushed clear');
  g = trio(); [a, b, c] = g.karts; put(g, a, 30); put(g, b, 30, 1.5); a.big = 5; b.shield = 8; a.v = b.v = 0;
  evs = K.step(g, .05); assert.ok(evs.some(e => e.e === 'block' && e.id === b.id && e.kind === 'big') && b.spin === 0);
  put(g, b, 30, 1.2); evs = K.step(g, .05); assert.ok(!evs.some(e => e.e === 'spin'), 'no spin right after the block');
  g.hazards.push({ id: 99, owner: c.id, kind: 'puddle', x: a.x, y: a.y, life: 9, arm: 0 }); K.step(g, .05);
  assert.ok(!g.hazards.some(z => z.id === 99) && a.spin === 0, 'crushes the puddle');
  jetAt(g, a, c.id); assert.ok(a.trap > 0, 'jets still hit a giant');
  g = trio(); [a, b] = g.karts; put(g, a, 30); put(g, b, 30, 1.5); a.big = b.big = 5; evs = K.step(g, .05);
  assert.ok(!evs.some(e => e.e === 'spin'), 'two giants just bump'); race(g, 5.1, idle(g)); assert.equal(a.big, 0, 'shrinks after 5 s');
});

// 單人一台車，指定車子的選擇
const solo = (L = {}, opts = {}) => { const g = K.createGame({ seed: 1, humans: [{ uid: 'a', name: 'A', ...L }], bots: false, ...opts }); go(g); return g; };

test('loadouts: shape, race perk and item perk are validated (bad values fall back); bots get a random loadout per seed; humans without one get no perks', () => {
  assert.deepEqual(K.pickLoadout({ shape: 'spike', rperk: 'top', iperk: 'lucky' }), { shape: 'spike', rperk: 'top', iperk: 'lucky' });
  assert.deepEqual(K.pickLoadout({ shape: 'x', rperk: '__proto__', iperk: 3 }), { shape: 'classic', rperk: null, iperk: null });
  assert.deepEqual(K.pickLoadout({ rperk: 'grip' }, { shape: 'tank', rperk: 'top', iperk: 'guard' }), { shape: 'tank', rperk: 'grip', iperk: 'guard' }, 'keeps earlier picks');
  const g = K.createGame({ seed: 9, humans: [{ uid: 'a', name: 'A', shape: 'puff', rperk: 'drift', iperk: 'power' }, { uid: 'b', name: 'B' }] });
  assert.deepEqual([g.karts[0].shape, g.karts[0].rperk, g.karts[0].iperk], ['puff', 'drift', 'power']);
  assert.deepEqual([g.karts[1].shape, g.karts[1].rperk, g.karts[1].iperk], ['classic', null, null]);
  const bots = seed => K.createGame({ seed }).karts.map(k => [k.shape, k.rperk, k.iperk].join('/'));
  assert.deepEqual(bots(9), bots(9), 'same seed, same bot loadouts'); assert.ok(bots(9).every(l => !l.includes('null')), 'bots always get perks');
  const all = new Set([1, 2, 3, 4, 5, 6, 7, 8].flatMap(bots)); assert.ok(all.size >= 8, `bots mix it up: ${all.size} loadouts`);
  const full = K.snapshot(g), base = full, compact = K.snapshot(g, { full: false });
  assert.equal(full.karts[0].shape, 'puff'); assert.ok(!('shape' in compact.karts[0]) && !('rperk' in compact.karts[0]), 'loadouts travel once, in the start snapshot');
  assert.deepEqual(K.expandFrame(compact, base).karts[0].iperk, 'power');
});

test('race perks: top speed, faster drift sparks, longer boosts; grip turns sharper, keeps more speed on grass and after hitting a wall', () => {
  const P = K.RACE_PERKS;
  const top = rperk => { const g = solo({ rperk }), k = g.karts[0]; race(g, 6, () => { put(g, k, k.total); K.setInput(g, 0, { gas: true }); }); return k.v; }; // 每一步放回路中間，才不會撞到彎道
  assert.ok(Math.abs(top('top') - K.KART.VMAX * P.top.speed) < .01 && Math.abs(top(null) - K.KART.VMAX) < .01, `top speed ${top('top').toFixed(2)} vs ${top(null).toFixed(2)}`);
  const spark = rperk => { const g = solo({ rperk }), k = g.karts[0]; k.v = 8; k.drift = 1; race(g, .5, () => K.setInput(g, 0, { gas: true, drift: true, steer: 1 })); return k.charge; };
  assert.ok(Math.abs(spark('drift') / spark(null) - P.drift.charge) < .01, `spark charge ×${(spark('drift') / spark(null)).toFixed(3)}`);
  let g = solo({ rperk: 'boost' }); g.karts[0].item = 'shoe'; K.useItem(g, 0); assert.ok(Math.abs(g.karts[0].shoe - K.ITEMS.shoe.time * P.boost.time) < 1e-9, 'nitro item lasts longer');
  g = solo({ rperk: 'boost' }, { mode: 'speed' }); g.karts[0].nitro = 1; K.useItem(g, 0); assert.ok(Math.abs(g.karts[0].shoe - K.ITEMS.shoe.time * P.boost.time) < 1e-9, 'speed-race nitro lasts longer');
  g = solo({ rperk: 'boost' }); const k = g.karts[0]; Object.assign(k, { v: 8, drift: 1, level: 2, charge: 1.5 }); K.setInput(g, 0, { gas: true, drift: false }); K.step(g, .05);
  assert.ok(Math.abs(k.boost - (K.DRIFT.BOOST[2] * P.boost.time - .05)) < .051, `orange drift boost ${k.boost.toFixed(2)} s`);
  const turn = rperk => { const g = solo({ rperk }), k = g.karts[0]; k.v = 8; const h0 = k.h; race(g, .3, () => K.setInput(g, 0, { gas: true, steer: 1 })); return Math.abs(K.wrapAngle(k.h - h0)); };
  assert.ok(turn('grip') > turn(null) * (1 + (P.grip.turn - 1) * .8), `turned ${turn('grip').toFixed(3)} vs ${turn(null).toFixed(3)} rad`);
  const grass = rperk => { const g = solo({ rperk }), k = g.karts[0]; put(g, k, 30, K.ROAD + .8); race(g, 4, () => { K.setInput(g, 0, { gas: true }); k.h = K.trackPoint(k.total, 0).h; }); return k.v; };
  assert.ok(Math.abs(grass('grip') - K.KART.VMAX * P.grip.offroad) < .2 && Math.abs(grass(null) - K.KART.VMAX * K.KART.OFFROAD) < .2, `grass ${grass('grip').toFixed(2)} vs ${grass(null).toFixed(2)}`);
  const wall = rperk => { const g = solo({ rperk }), k = g.karts[0]; put(g, k, 30, T.wall - .05); k.h += .9; k.v = 8; const evs = race(g, .1); assert.ok(evs.some(e => e.e === 'bump')); return k.v; };
  assert.ok(wall('grip') > wall(null) * 1.25, `after the wall ${wall('grip').toFixed(2)} vs ${wall(null).toFixed(2)}`);
});

test('item perks: double holds a second item (fills from boxes, moves up after use, a ghost steals the first); guard shortens traps and spins; power stretches your traps, spins and soap clouds; lucky gets more attacks', () => {
  let g = trio(); let [a, b, c] = g.karts; a.iperk = 'double'; put(g, a, 10); put(g, b, 30); put(g, c, 60);
  const box = g.boxes[0]; a.item = 'puddle'; Object.assign(a, { x: box.x, y: box.y, hint: K.locate(box.x, box.y).i }); let evs = K.step(g, .05);
  assert.ok(a.item2 && evs.some(e => e.e === 'item' && e.slot === 2), 'second slot fills'); assert.equal(K.snapshot(g).karts[0].i2, a.item2);
  const second = a.item2; K.useItem(g, 0); assert.deepEqual([a.item, a.item2], [second, null], 'second item moves up');
  Object.assign(b, { iperk: 'double', item: 'shield', item2: 'jet' });
  put(g, a, 10); a.item = 'ghost'; a.item2 = 'shoe'; K.useItem(g, 0);
  assert.deepEqual([a.item, a.item2, b.item, b.item2], ['shoe', 'shield', 'jet', null], 'ghost steals the first item, both sides move up');
  const IP = K.ITEM_PERKS, trapped = (victim, attacker) => { const g = trio(); const [a, b, c] = g.karts; put(g, a, 10); put(g, b, 30); b.iperk = victim; a.iperk = attacker; a.v = b.v = 0; a.item = 'jet'; K.useItem(g, 0); stepUntil(g, e => e.some(x => x.e === 'hit')); return b.trap + .05; };
  assert.ok(Math.abs(trapped(null, null) - K.ITEMS.jet.trap) < .06 && Math.abs(trapped('guard', null) - K.ITEMS.jet.trap * IP.guard.time) < .06 && Math.abs(trapped(null, 'power') - K.ITEMS.jet.trap * IP.power.time) < .06, 'jet trap: plain / guard / power');
  assert.ok(Math.abs(trapped('guard', 'power') - K.ITEMS.jet.trap * IP.guard.time * IP.power.time) < .06, 'both multiply');
  g = trio(); [a, b, c] = g.karts; put(g, a, 10); put(g, b, 30); a.iperk = 'power'; a.item = 'foam'; K.useItem(g, 0); assert.ok(Math.abs(b.foam - K.ITEMS.foam.time * IP.power.time) < 1e-9, 'power soap cloud lasts longer');
  g = trio(); [a, b] = g.karts; put(g, a, 30); put(g, b, 80); a.iperk = 'power'; a.item = 'puddle'; K.useItem(g, 0); const z = g.hazards[0]; a.v = 0; Object.assign(a, { x: z.x, y: z.y }); race(g, .6, idle(g));
  assert.ok(a.spin > 0 && a.spin <= K.ITEMS.puddle.spin, 'your own puddle is not stretched');
  const roll = iperk => { const g = K.createGame({ seed: 9 }); go(g); const k = g.karts[0]; k.iperk = iperk; k.rank = 2; let n = 0; for (let i = 0; i < 6000; i++) if (['jet', 'storm', 'hot', 'foam'].includes(K.rollItem(g, k))) n++; k.rank = 1; let lead = 0; for (let i = 0; i < 3000; i++) if (['jet', 'storm'].includes(K.rollItem(g, k))) lead++; return [n, lead]; };
  const [plain] = roll(null), [lucky, lead] = roll('lucky'); assert.ok(lucky > plain * 1.4, `attacks ${plain} → ${lucky}`); // 中段名次攻擊道具 35% → 51.9%（35×2 / 135），約 ×1.48 assert.equal(lead, 0, 'the leader still never gets jets or storms');
});

test('reset to track: stops for 1 s, then sits on the middle of the road facing forward with no progress gained; not during the countdown, a trap, a rocket or after finishing', () => {
  let g = K.createGame({ seed: 1, humans: [{ uid: 'a', name: 'A' }], bots: false }); const k = g.karts[0];
  assert.equal(K.resetKart(g, 0), false, 'not during the countdown'); go(g);
  put(g, k, 40, 2.5); k.h += Math.PI * .9; k.v = 4; k.boost = 1; const before = k.total;
  assert.ok(K.resetKart(g, 0)); assert.equal(K.resetKart(g, 0), false, 'already resetting');
  let evs = race(g, .5, () => K.setInput(g, 0, { gas: true, steer: 1 })); assert.ok(Math.abs(k.total - before) < .01 && k.v === 0 && k.boost === 0, 'stays put, boost cancelled');
  assert.equal(K.snapshot(g).karts[0].rs, 1);
  evs = race(g, .6); const loc = K.locate(k.x, k.y, k.hint);
  assert.ok(Math.abs(loc.d) < .05 && Math.abs(K.wrapAngle(k.h - K.trackPoint(loc.s, 0).h)) < .01, 'middle of the road, facing forward');
  assert.ok(Math.abs(k.total - before) < .6, `progress ${(k.total - before).toFixed(2)} cells`); assert.equal(k.reset, 0);
  k.trap = 1; assert.equal(K.resetKart(g, 0), false, 'not while trapped'); k.trap = 0;
  k.rocket = 1; assert.equal(K.resetKart(g, 0), false, 'not on a rocket'); k.rocket = 0;
  k.done = true; assert.equal(K.resetKart(g, 0), false, 'not after finishing');
});

test('slipstream: 1.5 s right behind a kart on a straight gives a 1 s boost; not when off to the side, drifting, steering hard or behind a see-through kart; leaving drains it', () => {
  const tail = (setup = () => {}, secs = 1.6) => { const g = trio(); const [a, b, c] = g.karts; put(g, c, 150); const evs = []; for (let i = 0; i < secs / .05; i++) { put(g, b, 30 + i * .4); put(g, a, b.total - 3, a.lat || 0); a.v = b.v = 8; setup(g, a, b); K.setInput(g, 0, { gas: true, steer: a.steerIn || 0, drift: !!a.driftIn2 }); K.setInput(g, 1, { gas: true }); evs.push(...K.step(g, .05)); } return { a, evs }; };
  let { a, evs } = tail(); assert.ok(evs.some(e => e.e === 'draft' && e.id === 0) && a.boost > .8, `boost after 1.5 s behind: ${a.boost.toFixed(2)} s left`); // 觸發後又跑了 2 步
  ({ a, evs } = tail((g, a) => { a.lat = 2; })); assert.ok(!evs.some(e => e.e === 'draft'), 'off to the side');
  ({ a, evs } = tail((g, a) => { a.steerIn = .8; })); assert.ok(!evs.some(e => e.e === 'draft'), 'steering hard');
  ({ a, evs } = tail((g, a, b) => { b.ghost = 1; })); assert.ok(!evs.some(e => e.e === 'draft'), 'behind a see-through kart');
  ({ a, evs } = tail((g, a) => { a.drift = 1; a.driftIn2 = true; })); assert.ok(!evs.some(e => e.e === 'draft'), 'drifting');
  const g = trio(); const [p, q] = g.karts; put(g, q, 30); put(g, p, 27); p.v = q.v = 8; p.draft = 1; put(g, q, 80); K.step(g, .05); assert.ok(Math.abs(p.draft - .9) < 1e-9, 'drains at twice the rate');
  assert.equal(K.snapshot(g).karts[0].df, Math.round(.9 / K.DRAFT.charge * 4) / 4);
});

test('compact frames carry the new states: cloud, hot bubble seconds, see-through, nitro, storm and hot shots, fake boxes, mode', () => {
  const g = trio({ mode: 'speed' }), base = K.snapshot(g); const [a, b, c] = g.karts;
  Object.assign(a, { storm: 1.2, hot: 2.3, nitro: 2, gauge: .42 }); b.ghost = 1;
  g.shots.push({ id: 50, owner: 1, kind: 'storm', x: 1, y: 2, target: 0, life: 5, dist: 0 }, { id: 51, owner: 2, kind: 'hot', x: 3, y: 4, target: 0, prog: 5, lat: 0, dir: 1, dist: 0 });
  g.hazards.push({ id: 52, owner: 2, kind: 'decoy', x: 5, y: 6, life: 9, arm: 0 });
  const full = K.snapshot(g), compact = K.snapshot(g, { full: false });
  assert.deepEqual(K.expandFrame(compact, base), full); assert.equal(compact.mode, undefined, 'mode only travels in the start snapshot');
  const ka = full.karts[0]; assert.deepEqual([ka.cl, ka.ho, ka.ni, ka.ga, full.karts[1].gh], [1, 3, 2, .4, 1]);
  // 第二批：泡泡雲、泡泡火箭、磁鐵（含目標）、巨大泡泡；平常是 0 不送
  Object.assign(b, { foam: 2, rocket: 1, big: 3 }); Object.assign(c, { magnet: 1, magnetT: 0 });
  const full2 = K.snapshot(g), compact2 = K.snapshot(g, { full: false });
  assert.deepEqual(K.expandFrame(compact2, base), full2);
  assert.deepEqual(['fo', 'ro', 'bg', 'bo'].map(f => full2.karts[1][f]), [1, 1, 1, 1]); assert.deepEqual([full2.karts[2].mg, full2.karts[2].mt, full2.karts[2].bo], [1, 1, 1]);
  assert.ok(!('fo' in compact2.karts[0]) && !('mt' in compact2.karts[0]), 'zero fields stay out of compact frames');
  Object.assign(a, { reset: .5, draft: .8 }); const full3 = K.snapshot(g); assert.deepEqual(K.expandFrame(K.snapshot(g, { full: false }), base), full3);
  assert.deepEqual([full3.karts[0].rs, full3.karts[0].df], [1, .5]); assert.deepEqual(full3.shots.map(s => s[4]), [0, 0], 'each shot says which kart it chases');
  assert.deepEqual(full.shots.map(s => s[3]), [K.SHOT_CODE.storm, K.SHOT_CODE.hot]); assert.deepEqual(full.haz.map(h => h[3]), [1]);
});

test('bots use every new item and the items land: clouds, sticks and passes, steals, fake-box spins, soap clouds, magnet catches, rocket and giant rams', () => {
  const c = {};
  for (const id of ['candy', 'peak', 'highway']) for (const seed of [1, 7, 42]) { const g = K.createGame({ seed, track: id }); while (!g.over) for (const e of K.step(g, .05)) { const key = e.e === 'use' || e.e === 'spin' ? `${e.e}:${e.kind}` : e.e; c[key] = (c[key] || 0) + 1; } }
  for (const key of ['use:storm', 'use:hot', 'use:ghost', 'use:decoy', 'cloud', 'stick', 'pass', 'steal', 'spin:decoy', 'use:foam', 'use:magnet', 'use:big', 'foam', 'catch', 'spin:big']) assert.ok(c[key] >= 1, `${key}: ${c[key] || 0}`);
  // 第二批道具的使用時機直接測（泡泡火箭只給最後一名，抽樣常常一次都沒有）：塞道具給電腦，看 0.3 秒內有沒有用
  const uses = (kind, place) => { const g = K.createGame({ seed: 3 }); go(g); const ks = g.karts; place(g, ks); ks.forEach(k => { k.rank = 1 + ks.filter(o => o.total > k.total).length; k.item = null; }); ks[0].item = kind; ks[0].ai.itemT = 0; return race(g, .3).some(e => e.e === 'use' && e.id === 0 && e.kind === kind); };
  const chase = (g, [a, b, c, d]) => { put(g, a, 10); put(g, b, 30); put(g, c, 120); put(g, d, 150); }, lead = (g, [a, b, c, d]) => { put(g, a, 150); put(g, b, 10); put(g, c, 20); put(g, d, 30); };
  assert.ok(uses('rocket', lead), 'rocket: right away');
  assert.ok(uses('magnet', chase) && !uses('magnet', lead), 'magnet: only with a kart ahead in reach');
  assert.ok(uses('foam', chase) && !uses('foam', lead), 'soap cloud: not when leading');
  const side = (g, [a, b, c, d]) => { put(g, a, 30); put(g, b, 34); put(g, c, 120); put(g, d, 150); };
  assert.ok(uses('big', side) && !uses('big', chase), 'giant bubble: only with a kart within 8 cells');
});
