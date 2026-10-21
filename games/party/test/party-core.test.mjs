import test from 'node:test';
import assert from 'node:assert/strict';
import * as P from '../party-core.js';

const B = P.BODY;
const humans = n => Array.from({ length: n }, (_, i) => ({ uid: 100 + i, name: `p${i}` }));
const game = (n = 1, opts = {}) => P.createGame({ seed: 7, humans: humans(n), bots: false, arena: 'ring', items: false, ...opts }); // 物理測試固定在泡泡擂台、不出道具
const toPlay = g => { while (g.phase !== 'play') P.step(g, P.DT); return g; };
const run = (g, secs, each) => { const evs = []; for (let k = 0; k < Math.round(secs / P.DT) && !g.over; k++) { each?.(g); evs.push(...P.step(g, P.DT)); } return evs; };
// 把角色放到指定位置、面向、靜止
const place = (p, x, y, h = 0) => Object.assign(p, { x, y, z: 0, vx: 0, vy: 0, vz: 0, h, mx: 0, my: 0, dashT: 0, dashCD: 0, stun: 0, prone: 0, dive: false });
// 一直跑到這個人停下來（或出局），回傳移動距離
const slide = (g, p, max = 3) => { const x0 = p.x, y0 = p.y; let still = 0; for (let k = 0; k < max / P.DT && !p.out; k++) { P.step(g, P.DT); still = Math.hypot(p.vx, p.vy) < 1e-3 && p.z === 0 ? still + 1 : 0; if (still > 3) break; } return Math.hypot(p.x - x0, p.y - y0); };
const angle = (vx, vy) => Math.atan2(vy, vx) * 180 / Math.PI;

test('walk: reaches WALK in about 0.17 s and stops within 0.15 s of letting go', () => {
  const g = toPlay(game()), p = g.players[0]; place(p, 0, 0);
  P.setInput(g, 0, { mx: 1, my: 0 }); run(g, .1);
  assert.ok(Math.abs(p.vx - B.ACC * .1) < .2, `after 0.1 s vx ${p.vx}`);
  run(g, .1); assert.equal(r(p.vx), B.WALK);
  P.setInput(g, 0, {}); run(g, .16); assert.equal(p.vx, 0);
  P.setInput(g, 0, { mx: 3, my: 4 }); assert.deepEqual([r(p.mx), r(p.my)], [.6, .8], 'input longer than 1 is scaled back');
  P.setInput(g, 0, { mx: NaN, my: 'x' }); assert.deepEqual([p.mx, p.my], [0, 0]);
});
const r = v => Math.round(v * 100) / 100;

test('fall: walking off the edge drops you, you cannot climb back, and you are out below OUT_Z', () => {
  const g = toPlay(game(2)), p = g.players[0]; place(p, 8.2, 0); place(g.players[1], -3, 0);
  P.setInput(g, 0, { mx: 1, my: 0 });
  const evs = run(g, .6);
  assert.ok(evs.some(e => e.e === 'fall' && e.id === 0) && p.fall);
  P.setInput(g, 0, { mx: -1, my: 0 }); run(g, .1);
  assert.ok(p.vx > 0, 'no control while falling');
  const more = run(g, 1);
  const out = [...evs, ...more].find(e => e.e === 'out');
  assert.equal(out.id, 0); assert.ok(p.out); assert.equal(out.self, true, 'nobody touched them');
  assert.equal(g.phase, 'roundEnd', 'one player left ends the round');
});

test('jump: apex 1.2 cells, lands after 0.6 s; air steering is weaker than on the ground', () => {
  const g = toPlay(game()), p = g.players[0]; place(p, 0, 0);
  assert.equal(P.jump(g, 0), true); assert.equal(P.jump(g, 0), false, 'no double jump');
  let top = 0, t = 0; while (p.z > 0 || p.vz > 0) { P.step(g, P.DT); t += P.DT; top = Math.max(top, p.z); }
  assert.ok(Math.abs(top - 1.2) < .05, `apex ${top}`); assert.ok(Math.abs(t - .6) < .04, `air time ${t}`);
  place(p, 0, 0); P.setInput(g, 0, { mx: 1 }); run(g, .1); const ground = p.vx;
  place(p, 0, 0); P.jump(g, 0); P.setInput(g, 0, { mx: 1 }); run(g, .1); const air = p.vx;
  assert.ok(ground > 2 * air && air > 0, `ground ${ground} vs air ${air}`);
});

test('dash: covers about 3 cells, then drops to walking speed; cooldown blocks a second dash', () => {
  const g = toPlay(game()), p = g.players[0]; place(p, -4, 0);
  assert.equal(P.dash(g, 0), true); run(g, B.DASH_T + P.DT);
  assert.ok(Math.abs(p.x + 4 - 3) < .25, `dash distance ${p.x + 4}`);
  assert.ok(Math.abs(Math.hypot(p.vx, p.vy) - B.WALK) < .5, 'no extra slide after the dash');
  assert.equal(P.dash(g, 0), false); run(g, B.DASH_CD); assert.equal(P.dash(g, 0), true);
});

test('dash hit: a 30-degree glancing hit still sends the target along the dash direction', () => {
  const g = toPlay(game(2)), [a, o] = g.players, c = Math.cos(Math.PI / 6) * 1.1, s = Math.sin(Math.PI / 6) * 1.1;
  place(a, 0, 0, 0); place(o, c, s);
  P.setInput(g, 0, { mx: 1, my: 0 }); P.dash(g, 0);
  const evs = P.step(g, P.DT);
  assert.ok(evs.some(e => e.e === 'hit' && e.id === 0 && e.to === 1));
  assert.ok(Math.abs(angle(o.vx, o.vy)) < 5, `target flies at ${angle(o.vx, o.vy).toFixed(1)} deg, dash went 0 deg (centre line is 30)`);
  assert.equal(o.hits, 1); assert.ok(o.stun > 0); assert.ok(Math.hypot(a.vx, a.vy) <= 2.01, 'attacker drops to 2 cells/s on the hit');
});

test('dash hit: the 4th hit in a round slides at least 3 cells further than the 1st', () => {
  const dist = hitsBefore => {
    const g = toPlay(game(2)), [a, o] = g.players; place(a, -6.1, 0, 0); place(o, -5, 0); o.hits = hitsBefore;
    P.setInput(g, 0, { mx: 1 }); P.dash(g, 0); P.step(g, P.DT); P.setInput(g, 0, {}); place(a, -6.1, 4);
    return slide(g, o);
  };
  const first = dist(0), fourth = dist(4);
  assert.ok(Math.abs(first - P.slideOf(0)) < .5 && first > 2 && first < 4, `first hit slides ${first.toFixed(2)}, slideOf says ${P.slideOf(0).toFixed(2)}`);
  assert.ok(fourth - first >= 3, `first ${first.toFixed(2)} vs fourth ${fourth.toFixed(2)}`);
});

test('dash clash: two dashes nearly head-on bounce both back and stun neither for long', () => {
  const g = toPlay(game(2)), [a, o] = g.players; place(a, -1, 0, 0); place(o, 1, 0, Math.PI);
  P.dash(g, 0); P.dash(g, 1);
  const evs = run(g, .1);
  assert.ok(evs.some(e => e.e === 'clash'));
  assert.ok(a.vx < -1 && o.vx > 1, `a ${a.vx} o ${o.vx}`);
  assert.deepEqual([a.hits, o.hits], [0, 0]);
});

test('jumping over a dash dodges it; standing still gets hit', () => {
  for (const hop of [true, false]) {
    const g = toPlay(game(2)), [a, o] = g.players; place(a, 0, 0, 0); place(o, 2, 0);
    if (hop) { P.jump(g, 1); run(g, .15); }
    P.dash(g, 0); run(g, .35);
    assert.equal(o.hits, hop ? 0 : 1, hop ? 'jumped over' : 'stood still');
  }
});

test('dive: dash in the air lunges forward and leaves you prone on landing', () => {
  const g = toPlay(game()), p = g.players[0]; place(p, -4, 0, 0);
  P.jump(g, 0); run(g, .1); const x0 = p.x;
  assert.equal(P.dash(g, 0), true); assert.equal(P.dash(g, 0), false, 'one dive per jump');
  while (p.z > 0) P.step(g, P.DT);
  assert.ok(p.prone > 0); assert.ok(p.x - x0 > 2, `dove ${p.x - x0}`);
  assert.equal(P.jump(g, 0), false, 'cannot jump while prone');
});

test('ring: shrinks one cell every 5 s from 25 s and stops at radius 3 (50 s)', () => {
  const at = t => P.arenaRadius('ring', t);
  assert.deepEqual([at(0), at(24.99), at(25), at(29.99), at(30), at(45), at(49.99), at(50), at(59)], [9, 9, 8, 8, 7, 4, 4, 3, 3]);
  const g = toPlay(game()), p = g.players[0]; place(p, 7.5, 0);
  const evs = run(g, 31);
  assert.deepEqual(evs.filter(e => e.e === 'shrink').map(e => e.r), [8, 7]);
  assert.ok(p.out, 'standing at 7.5 drops when the ring is radius 7');
});

test('rounds: three rounds, out order scores, same-step falls share, ties use the last round', () => {
  const g = game(4, { arena: null }), drop = (...ids) => { for (const id of ids) Object.assign(g.players[id], { fall: true, z: -5.99, vz: -1 }); P.step(g, P.DT); };
  assert.equal(g.rounds.length, P.ROUNDS);
  assert.deepEqual(g.rounds.slice(0, Math.min(P.ROUNDS, P.ARENA_IDS.length)).sort(), [...new Set(g.rounds)].slice(0, Math.min(P.ROUNDS, P.ARENA_IDS.length)).sort(), 'no repeats while unused arenas remain');
  const order = [[[0], [1, 2]], [[3], [0], [1]], [[2], [3], [0]]]; // 每關依序掉出去的人；最後剩下的人拿最高分
  for (const steps of order) {
    toPlay(g);
    for (const ids of steps) drop(...ids);
    assert.equal(g.phase, 'roundEnd');
    run(g, P.ROUND_END + P.DT);
  }
  assert.deepEqual(g.players.map(p => p.rounds), [[0, 1, 2], [1, 2, 3], [1, 3, 0], [3, 0, 1]]);
  assert.ok(g.over);
  assert.deepEqual(g.result.players.map(p => [p.id, p.rank, p.score, p.points]), [[1, 1, 6, 5], [3, 2, 4, 3], [2, 3, 4, 2], [0, 4, 3, 1]]);
  assert.equal(g.result.winner.id, 1);
});

test('ranking: exact ties share a rank; a forfeited player scores 0 points', () => {
  const g = game(3);
  for (const p of g.players) { p.rounds = [1, 2, 1]; p.score = 4; }
  g.players[2].rounds = [2, 1, 1];
  P.forfeit(g, 1);
  const rk = P.ranking(g);
  assert.deepEqual(rk.map(p => [p.id, p.rank, p.points, p.out]), [[0, 1, 5, false], [1, 1, 0, true], [2, 3, 2, false]]);
});

test('spawn: everyone starts on the spawn circle facing the centre, and neighbours change between rounds', () => {
  const ring = g => g.players.map(p => p.id).sort((a, b) => Math.atan2(g.players[a].y, g.players[a].x) - Math.atan2(g.players[b].y, g.players[b].x));
  const cyc = o => { const i = o.indexOf(0); return [...o.slice(i), ...o.slice(0, i)].join(); };
  let changed = 0;
  for (let s = 1; s <= 20; s++) {
    const g = P.createGame({ seed: s, humans: [], bots: true });
    for (const p of g.players) { assert.ok(Math.abs(Math.hypot(p.x, p.y) - P.ARENAS[g.arena].spawn) < 1e-9); assert.ok(Math.abs(P.wrapAngle(p.h - Math.atan2(-p.y, -p.x))) < 1e-9); }
    const first = cyc(ring(g));
    while (g.round === 0) P.step(g, .05);
    if (cyc(ring(g)) !== first) changed++;
  }
  assert.ok(changed >= 15, `neighbour order changed in ${changed}/20 games`);
});

test('practice: one arena, one round, then the game is over', () => {
  const g = P.createGame({ seed: 3, humans: humans(1), arena: 'ring' });
  assert.deepEqual(g.rounds, ['ring']); assert.equal(g.players.length, P.MAX_PLAYERS, 'solo fills with 5 bots');
  run(g, P.INTRO + P.ROUND_MAX + P.ROUND_END + 1);
  assert.ok(g.over); assert.equal(g.result.rounds.length, 1);
});

test('inputs: nothing works during the intro, while stunned, or once out', () => {
  const g = game(2), p = g.players[0];
  assert.equal(P.dash(g, 0), false); assert.equal(P.jump(g, 0), false);
  toPlay(g); p.stun = .3; assert.equal(P.dash(g, 0), false); assert.equal(P.jump(g, 0), false);
  p.stun = 0; p.out = true; assert.equal(P.dash(g, 0), false);
});

// 每個擂台各跑一關。蜂巢擂台地板踩光就會掉，「沒被碰到就掉下去」本來就多，不算在內
const arenaRun = (arena, bots, seeds) => {
  let outs = 0, self = 0, rounds = 0, len = 0, ref = 0;
  for (let s = 1; s <= seeds; s++) {
    const g = P.createGame({ seed: s, humans: [], bots, arena });
    while (!g.over) for (const e of P.step(g, .05)) { if (e.e === 'out') { outs++; if (e.self) self++; } if (e.e === 'roundEnd') { rounds++; len += g.rt; } }
    ref += g.players[0].score;
  }
  return { outs, self: self / outs, len: len / rounds, ref: ref / seeds };
};
test('bots: on the ring and the sweeper, normal bots rarely fall off untouched (under 5%); every arena lasts 15 to 45 s on average', () => {
  for (const arena of P.ARENA_IDS) {
    const r = arenaRun(arena, true, 40);
    assert.ok(r.outs >= 40 * 4, `${arena}: ${r.outs} eliminations`);
    if (arena !== 'hex') assert.ok(r.self < .05, `${arena}: self falls ${(r.self * 100).toFixed(1)}%`);
    assert.ok(r.len > 15 && r.len < 45, `${arena}: average round ${r.len.toFixed(1)} s (bots dashing nonstop ended ring rounds in 7 s; bots not jumping the bar ended sweeper rounds in 9 s)`);
  }
});

// 參考玩家用普通電腦的開法，站 0 號；只換對手的難度，參考玩家的分數要明顯變低。蜂巢擂台主要看運氣，只要求整場派對加起來也變低
test('bots: the same player scores at least 15% less against 5 hard bots on the ring and the sweeper, and less over whole parties', () => {
  for (const arena of ['ring', 'sweep']) {
    const normal = arenaRun(arena, ['normal', ...Array(5).fill('normal')], 50).ref, hard = arenaRun(arena, ['normal', ...Array(5).fill('hard')], 50).ref;
    assert.ok(hard < normal * .85, `${arena}: vs normal ${normal.toFixed(2)}, vs hard ${hard.toFixed(2)}`);
  }
  const party = diff => { let sc = 0; for (let s = 1; s <= 50; s++) { const g = P.createGame({ seed: s, humans: [], bots: ['normal', ...Array(5).fill(diff)] }); while (!g.over) P.step(g, .05); sc += g.players[0].score; } return sc / 50; };
  const normal = party('normal'), hard = party('hard');
  assert.ok(hard < normal * .95, `party: vs normal ${normal.toFixed(2)}, vs hard ${hard.toFixed(2)}`);
});

// 開場站成正六邊形時，電腦挑目標同分都挑編號小的，0 號平均 5.1 分、5 號 10.0 分；修正後每個位置都接近 7.5
test('fairness: no player slot has an edge (300 seeds of 6 normal bots, each slot averages 7.5 +- 0.8)', () => {
  const sum = Array(6).fill(0), N = 300;
  for (let s = 1; s <= N; s++) { const g = P.createGame({ seed: s * 2654435761 >>> 0, humans: [], bots: true }); while (!g.over) P.step(g, .05); g.players.forEach((p, i) => { sum[i] += p.score; }); }
  for (const [i, v] of sum.entries()) assert.ok(Math.abs(v / N - 7.5) < .8, `slot ${i} averages ${(v / N).toFixed(2)}`);
});

const sweepGame = () => toPlay(P.createGame({ seed: 7, humans: humans(1), bots: false, arena: 'sweep', items: false }));
// 把旋轉棒轉到 a0，角色放在棒子前方：前緣 lead 秒後掃到
const barAhead = (g, p, d, lead) => { g.bar.a = 0; const B = P.ARENAS.sweep.bar, hw = Math.asin((B.w / 2 + P.BODY.R) / d), ang = hw + lead * P.barSpeed('sweep', g.rt); place(p, Math.cos(ang) * d, Math.sin(ang) * d); return ang; };

test('sweeper: the bar knocks a standing player along its turn and slightly outward; jumping over it is safe', () => {
  const g = sweepGame(), p = g.players[0]; barAhead(g, p, 5, .15);
  let a = null; for (let k = 0; k < 30 && a == null; k++) if (P.step(g, P.DT).some(e => e.e === 'hit' && e.kind === 'bar' && e.to === 0)) a = g.bar.a;
  assert.ok(a != null, 'the bar hit');
  const tang = -Math.sin(a) * p.vx + Math.cos(a) * p.vy, rad = Math.cos(a) * p.vx + Math.sin(a) * p.vy, out = P.ARENAS.sweep.bar.out; // 用被掃到那一刻棒子的角度拆成「沿著轉」和「往外」
  assert.ok(tang > 3 && Math.abs(rad / tang - out) < .05, `along the turn ${tang.toFixed(2)}, outward ${rad.toFixed(2)} (expected ratio ${out})`);
  const h = sweepGame(), q = h.players[0]; barAhead(h, q, 5, .15); P.jump(h, 0);
  run(h, 1); assert.equal(q.hits, 0, 'jumped over the bar');
});

test('sweeper: the bar speeds up x1.2 every 10 s and the centre post pushes people out', () => {
  assert.ok(Math.abs(P.barSpeed('sweep', 10) / P.barSpeed('sweep', 9.99) - 1.2) < 1e-9);
  assert.ok(Math.abs(P.barSpeed('sweep', 20) / P.barSpeed('sweep', 0) - 1.44) < 1e-9);
  const g = sweepGame(), p = g.players[0]; g.bar.a = Math.PI; place(p, .3, 0); P.step(g, P.DT);
  assert.ok(Math.hypot(p.x, p.y) >= P.ARENAS.sweep.bar.hub + P.BODY.R - 1e-9);
});

test('hex: the tile under you cracks, drops 1.5 s later and you fall; other tiles stay; jumping does not crack tiles', () => {
  const g = toPlay(P.createGame({ seed: 7, humans: humans(2), bots: false, arena: 'hex' })), [p, o] = g.players, H = P.ARENAS.hex.hex;
  for (const [i, t] of P.HEX.tiles.entries()) assert.equal(P.hexAt(t.x, t.y), i);
  const ti = P.hexAt(0, 0); place(p, 0, 0); place(o, P.HEX.tiles[P.HEX.tiles.length - 1].x, P.HEX.tiles[P.HEX.tiles.length - 1].y);
  const evs = run(g, H.crack + H.drop - .1);
  assert.ok(evs.some(e => e.e === 'crack' && e.i === ti)); assert.ok(g.tiles[ti] > 0 && !p.fall, 'still standing just before the drop');
  const later = run(g, .5);
  assert.ok(later.some(e => e.e === 'drop' && e.i === ti)); assert.equal(g.tiles[ti], -1); assert.ok(p.fall);
  assert.equal(g.tiles.filter(v => v !== 0).length, 2, 'only the two occupied tiles changed');
  const h = toPlay(P.createGame({ seed: 7, humans: humans(2), bots: false, arena: 'hex' })), q = h.players[0]; place(q, 0, 0); place(h.players[1], P.HEX.tiles[0].x, P.HEX.tiles[0].y);
  P.jump(h, 0); h.tiles[ti] = 0; run(h, .3); assert.equal(h.tiles[ti], 0, 'in the air for 0.3 s and the tile is untouched');
});

const itemGame = (n = 2) => { const g = toPlay(game(n, { items: true })); g.itemT = 99; return g; };
const give = (g, p, k) => { g.items.push({ k, x: p.x, y: p.y }); P.step(g, P.DT); };

test('items: one spawns every 8 s, at most 2 on the field, never on the hex arena', () => {
  const g = toPlay(game(1, { items: true }));
  run(g, 8.05); assert.equal(g.items.length, 1); run(g, 8); assert.equal(g.items.length, 2); run(g, 8); assert.equal(g.items.length, 2);
  for (const it of g.items) assert.ok(Math.hypot(it.x, it.y) <= g.r - P.ITEM_SPAWN.edge + 1e-9);
  const h = toPlay(P.createGame({ seed: 7, humans: humans(2), bots: false, arena: 'hex' })); run(h, 9, g => g.tiles.fill(0)); // 地板不掉，兩人才撐得過 8 秒
  assert.equal(h.phase, 'play'); assert.equal(h.items.length, 0);
});

test('items: speed shoes walk x1.5 and halve the dash cooldown; the shield eats one hit; giant takes half the knockback', () => {
  const g = itemGame(), [p, o] = g.players; place(p, 0, 0); place(o, -6, 0);
  give(g, p, 'speed'); P.setInput(g, 0, { mx: 1 }); run(g, .3); assert.ok(Math.abs(p.vx - P.BODY.WALK * 1.5) < .01, `speed ${p.vx}`);
  P.dash(g, 0); assert.ok(Math.abs(p.dashCD - P.BODY.DASH_CD / 2) < 1e-9);
  const h = itemGame(), [a, b] = h.players; place(a, -1.1, 0); place(b, 0, 0); give(h, b, 'shield');
  P.setInput(h, 0, { mx: 1 }); P.dash(h, 0); const evs = run(h, .1);
  assert.ok(evs.some(e => e.e === 'block' && e.id === 1)); assert.equal(b.hits, 0); assert.equal(b.shield, 0);
  const slideWith = k => { const q = itemGame(), [x, y] = q.players; place(x, -6.1, 0); place(y, -5, 0); if (k) give(q, y, k); place(x, -6.1, 0); P.setInput(q, 0, { mx: 1 }); P.dash(q, 0); P.step(q, P.DT); P.setInput(q, 0, {}); place(x, -6.1, 4); return slide(q, y); };
  const plain = slideWith(null), big = slideWith('giant');
  assert.ok(big < plain * .5, `giant slides ${big.toFixed(2)} vs ${plain.toFixed(2)}`);
});

test('hot bubble: sticks to the nearest opponent, passes on touch, cannot bounce straight back, and blows the holder outward', () => {
  const g = itemGame(3), [p, b, a] = g.players; place(p, 0, 0); place(b, 5, 0); place(a, -2, 0); // 最近的是 2 號，不是排第一個的 1 號
  give(g, p, 'hot'); assert.equal(g.hot.s, 'fly'); assert.equal(g.hot.to, 2, 'aimed at the nearest player');
  run(g, P.ITEMS.hot.fly + .05); assert.deepEqual([g.hot.s, g.hot.id], ['stuck', 2]);
  g.hot.fuse = .5; place(p, -2.9, 0); P.step(g, P.DT); assert.equal(g.hot.id, 0, 'touching passes it on');
  assert.ok(g.hot.fuse >= P.ITEMS.hot.min - 1e-9, `fuse topped up to ${P.ITEMS.hot.min} s`);
  run(g, .2, () => { place(p, -2.9, 0); place(a, -2, 0); }); assert.equal(g.hot.id, 0, 'still touching, but cannot pass straight back within 0.5 s');
  run(g, .4, () => { place(p, -2.9, 0); place(a, -2, 0); }); assert.equal(g.hot.id, 2, 'after 0.5 s it can go back');
  const holder = g.players[g.hot.id]; place(p, 0, 0); place(a, 6, 0); place(b, 0, 6); place(holder, 0, -3); g.hot.fuse = .05; const evs = run(g, .1);
  assert.ok(evs.some(e => e.e === 'boom' && e.id === holder.id)); assert.equal(g.hot, null);
  const h = itemGame(2), [x, y] = h.players; place(x, 3, 0); place(y, 6, 0); give(h, x, 'hot'); run(h, .5); place(x, 4, 0); place(y, 6, 0); h.hot.fuse = .02;
  const boom = run(h, .05); assert.ok(boom.some(e => e.e === 'hit' && e.kind === 'hot' && e.to === 1)); assert.ok(y.vx > 0, 'blown outward, away from the centre');
  const k = itemGame(2), [m, n] = k.players; place(m, 0, 0); place(n, 2, 0); n.shield = 5; give(k, m, 'hot'); const blk = run(k, .5);
  assert.ok(blk.some(e => e.e === 'block' && e.kind === 'hot')); assert.equal(k.hot, null, 'the shield pops it');
});

test('hot bubble: only one at a time, so no new one spawns while it is out', () => {
  const g = itemGame(2), [p] = g.players; place(p, 0, 0); place(g.players[1], 3, 0); give(g, p, 'hot');
  for (let s = 0; s < 60; s++) { g.items = []; g.itemT = 0; P.step(g, P.DT); if (g.hot) assert.notEqual(g.items[0]?.k, 'hot'); }
});

test('replay: same seed and inputs give the same game; compact frames expand back to the full snapshot', () => {
  const play = () => {
    const g = P.createGame({ seed: 42, humans: humans(1), diff: 'hard' });
    let k = 0;
    while (!g.over && k < 2000) { k++; P.setInput(g, 0, { mx: Math.sin(k / 30), my: Math.cos(k / 45) }); if (k % 70 === 0) P.dash(g, 0); if (k % 90 === 0) P.jump(g, 0); P.step(g, .05); }
    return g;
  };
  const a = play(), b = play();
  assert.deepEqual(P.snapshot(a), P.snapshot(b));
  const g = P.createGame({ seed: 5, humans: humans(2) }), base = P.snapshot(g);
  run(g, P.INTRO + 2);
  const full = P.snapshot(g), small = P.snapshot(g, { full: false });
  assert.ok(!('name' in small.players[0]) && !('seed' in small));
  assert.ok(JSON.stringify(small).length < JSON.stringify(full).length * .7, 'compact frame is at least 30% smaller');
  assert.deepEqual(P.expandFrame(small, base), full);
});
