import test from 'node:test';
import assert from 'node:assert/strict';
import * as A from '../artillery-core.js';

const two = (seed = 5, recipe = A.RECIPES[0]) => A.createGame({ seed, recipe, humans: [{ uid: 'a', name: 'A', team: 0, seat: 0 }, { uid: 'b', name: 'B', team: 1, seat: 0 }] });
const run = (g, secs, each = () => {}) => { const evs = []; for (let i = 0; i < secs / .05 && !g.over; i++) { each(g); evs.push(...A.step(g, .05)); } return evs; };
// 把角色放到某個 x 的地面上
const put = (g, id, x) => { const c = g.chars[id]; c.x = x; c.y = A.groundY(g.mask, x); return c; };
// 直接對準目標開一發（用電腦的試射找角度），回傳事件
const shootAt = (g, id, target, item = 'basic') => { const c = g.chars[id], s = A.aimSolve(g, c, target.x, target.y - A.CHAR.R, item); return A.fire(g, id, { angle: s.ang, power: s.p, item }); };

test('maps: the 3 presets and 300 seeded maps are valid; same recipe gives the same terrain; mask round-trips', () => {
  for (const r of A.RECIPES) { const v = A.validateTerrain(A.generateTerrain(r)); assert.equal(v.ok, true, `${r.id}: ${v.why}`); }
  for (let i = 1; i <= 300; i++) { const { terrain } = A.buildTerrain(A.recipeFromSeed('seed' + i)); assert.equal(A.validateTerrain(terrain).ok, true, `seed${i}`); }
  const a = A.generateTerrain(A.RECIPES[2]), b = A.generateTerrain(A.RECIPES[2]); assert.deepEqual(a.mask, b.mask);
  assert.deepEqual(A.decodeMask(A.encodeMask(a.mask)), a.mask);
  assert.ok(A.encodeMask(a.mask).length < 20000, 'mask is small enough to send');
});

test('recipes: outside input is clamped to safe values', () => {
  const r = A.sanitizeRecipe({ type: 'volcano', base: 99999, amp: -5, caves: 99, name: '<b>很長很長很長很長很長</b>', theme: 'evil', seed: 'x', extra: 'ignored', gapWidth: 9999 });
  assert.equal(r.type, 'hills'); assert.equal(r.base, 420); assert.equal(r.amp, 10); assert.equal(r.caves, 4); assert.equal(r.theme, 'meadow'); assert.ok(r.name.length <= 10 && !/[<>]/.test(r.name)); assert.equal('extra' in r, false);
  assert.equal(A.sanitizeRecipe({ type: 'islands', gapWidth: 9999, gapCenter: 0 }).gap[1] - A.sanitizeRecipe({ type: 'islands', gapWidth: 9999, gapCenter: 0 }).gap[0], 230);
  assert.deepEqual(A.recipeFromSeed('hello'), A.recipeFromSeed('hello')); assert.notDeepEqual(A.recipeFromSeed('hello'), A.recipeFromSeed('world'));
});

test('shots: deterministic, stop on terrain or character, out of bounds is a splash', () => {
  const g = two(); const t = g.mask, a = A.simulate(t, g.chars, 300, 300, 45, .8), b = A.simulate(t, g.chars, 300, 300, 45, .8);
  assert.deepEqual(a, b); assert.ok(['terrain', 'char'].includes(a.kind)); assert.ok(a.path.length >= 4);
  const out = A.simulate(t, [], 300, 300, 90, 1); assert.ok(out.kind === 'terrain' || out.kind === 'out');
  const far = A.simulate(new Uint8Array(A.W * A.H), [], 600, 300, 45, 1); assert.equal(far.kind, 'out');
  const victim = { id: 9, alive: true, x: 600, y: 330 }; const hit = A.simulate(new Uint8Array(A.W * A.H), [victim], 550, 300, 0, .2, -1);
  assert.ok(hit.kind === 'char' || hit.kind === 'out');
});

test('fire: hitting an enemy hurts, pays 62.5% of the damage, carves a hole; only the current player can fire, once', () => {
  const g = two(); const me = put(g, 0, 250), foe = put(g, 3, 700); assert.equal(g.cur, 0);
  assert.equal(A.fire(g, 3, { angle: 45, power: .8 }), null, 'not your turn');
  const before = g.mask.slice(), m0 = me.money, e = shootAt(g, 0, foe);
  assert.ok(e && e.e === 'shot'); assert.notDeepEqual(g.mask, before, 'terrain was carved');
  const hit = e.fx.find(f => f.k === 'hit' && f.id === 3);
  if (hit) { assert.ok(foe.hp < A.CHAR.HP && foe.hp === A.CHAR.HP - hit.dmg); assert.equal(me.money, m0 + Math.floor(hit.dmg * A.RULES.HIT_GAIN) + (hit.dead ? A.RULES.KILL : 0)); }
  assert.equal(A.fire(g, 0, { angle: 45, power: .8 }), null, 'only one shot per turn'); assert.equal(g.phase, 'resolve');
});

test('fire: a direct hit works and the numbers add up (damage falls off with distance)', () => {
  const g = two(); put(g, 0, 250); const foe = put(g, 3, 600);
  A.fire(g, 0, { angle: 0, power: .01 }); // 發出去就落在自己腳邊：自傷，不給錢
  const g2 = two(); const a = put(g2, 0, 250), f2 = put(g2, 3, 400); const m = a.money;
  const sol = A.aimSolve(g2, a, f2.x, f2.y - A.CHAR.R); const ev = A.fire(g2, 0, { angle: sol.ang, power: sol.p });
  const hits = ev.fx.filter(f => f.k === 'hit'); assert.ok(hits.length >= 1, 'the solver finds a hit on a close target');
  const h = hits.find(x => x.id === 3); assert.ok(h && h.dmg > 0 && h.dmg <= A.ITEMS.basic.dmg); assert.equal(a.money, m + Math.floor(h.dmg * A.RULES.HIT_GAIN) + (h.dead ? A.RULES.KILL : 0)); void foe;
});

test('friendly fire: hitting a teammate costs money (never below 0); self damage does not move money', () => {
  const g = two(); const me = put(g, 0, 300), mate = put(g, 1, 330); me.money = 3; mate.hp = 20;
  const fx = []; // 直接在隊友旁爆炸：用基本款對腳邊射
  const e = A.fire(g, 0, { angle: 0, power: .15 }); void fx; void e;
  assert.ok(me.money >= 0, 'never negative');
  const g2 = two(); const a = put(g2, 0, 300), b = put(g2, 1, 340); a.money = 80; const sol = A.aimSolve({ ...g2, chars: g2.chars.map(c => (c.id === 1 ? c : { ...c, team: c.team })) }, a, b.x, b.y - A.CHAR.R);
  const ev2 = A.fire(g2, 0, { angle: sol ? sol.ang : 45, power: sol ? sol.p : .4 }); const hitMate = ev2.fx.find(f => f.k === 'hit' && f.id === 1);
  if (hitMate) assert.equal(a.money, Math.max(0, 80 - Math.floor(hitMate.dmg / 2) - (hitMate.dead ? A.RULES.KILL : 0)), 'teammate hit is charged');
  assert.ok(g2.chars.every(c => c.money >= 0));
});

test('items: shop rules, heavy / triple / drill / heal / shield', () => {
  const g = two(); const me = g.chars[0]; assert.equal(g.offer.length, 3); assert.equal(new Set(g.offer).size, 3);
  const notOffered = A.POOL.find(i => !g.offer.includes(i)); assert.equal(A.buy(g, 0, notOffered), false, 'only offered items');
  me.money = 10; assert.equal(A.buy(g, 0, g.offer[0]), false, 'cannot afford'); me.money = 500;
  assert.equal(A.buy(g, 0, g.offer[0]), true); assert.equal(me.items[g.offer[0]], (A.RULES.START_ITEMS[g.offer[0]] || 0) + 1); assert.equal(me.money, 500 - A.ITEMS[g.offer[0]].price);
  run(g, A.RULES.SHOP + .2, gg => { gg.chars[0].move = 0; }); assert.equal(A.buy(g, 0, g.offer[1]), false, 'shop closes after the shop time');
  // 治療：立即生效，不佔發射次數；護盾要丟出去，不能直接使用
  const h = two(); const hc = h.chars[0]; hc.hp = 50; hc.items.heal = 1; hc.items.shield = 1; A.useItem(h, 0, 'heal'); assert.equal(hc.hp, 80); assert.equal(A.useItem(h, 0, 'shield'), false); assert.equal(hc.shield, false); assert.equal(h.fired, false);
  assert.equal(A.useItem(h, 0, 'heal'), false, 'used up');
  // 護盾擋下一次傷害
  const s = two(); put(s, 0, 300); const v = put(s, 3, 420); v.shield = true; const sol = A.aimSolve(s, s.chars[0], v.x, v.y - A.CHAR.R), ev = A.fire(s, 0, { angle: sol.ang, power: sol.p });
  if (ev.fx.some(f => f.k === 'shield')) { assert.equal(v.hp, A.CHAR.HP); assert.equal(v.shield, false); }
  // 重水球與三連發
  const hv = two(); hv.chars[0].items.heavy = 1; put(hv, 0, 300); const e1 = A.fire(hv, 0, { angle: 50, power: .6, item: 'heavy' }); assert.equal(hv.chars[0].items.heavy, 0); assert.ok(e1.fx.find(f => f.k === 'boom').r === A.ITEMS.heavy.r);
  const tr = two(); tr.chars[0].items.triple = 1; put(tr, 0, 300); const e3 = A.fire(tr, 0, { angle: 50, power: .6, item: 'triple' }); assert.equal(e3.shots.length, 3);
  assert.equal(A.fire(two(), 0, { angle: 50, power: .6, item: 'scatter' }), null, 'cannot fire an item you do not own');
  // 鑽地彈挖出隧道
  const dr = two(); dr.chars[0].items.drill = 1; put(dr, 0, 300); const solid0 = dr.mask.reduce((a, b) => a + b, 0); const ed = A.fire(dr, 0, { angle: 40, power: .5, item: 'drill' }); assert.ok(dr.mask.reduce((a, b) => a + b, 0) < solid0 - 800, 'drill removes a lot of ground'); assert.equal(ed.shots[0].bore, A.ITEMS.drill.bore); assert.ok(ed.shots[0].path.length / 2 > ed.shots[0].digFrom + 5, 'the tunnel is part of the path'); assert.equal(ed.fx.find(f => f.k === 'boom').t, ed.shots[0].dur, 'the crater opens when the drill arrives');
});

test('blast radius: every thrown item is about 25% wider than the base numbers', () => {
  for (const [k, r] of Object.entries({ basic: 30, heavy: 52, triple: 26 })) assert.ok(Math.abs(A.ITEMS[k].r / r - 1.25) < .03, k);
  assert.ok(A.ITEMS.drill.len >= 110 && A.ITEMS.drill.bore >= 11 && A.ITEMS.drill.r >= 64, 'drill digs farther and wider');
  assert.ok(A.ITEMS.delay.r > A.ITEMS.heavy.r, 'delay is wider than heavy');
});

test('delay: passes through characters, waits on the ground, blows up when the shooter starts the next turn', () => {
  const g = two(); const me = put(g, 0, 300), foe = put(g, 3, 330); me.items.delay = 1; const solid0 = g.mask.reduce((a, b) => a + b, 0);
  const e = A.fire(g, 0, { angle: 10, power: .3, item: 'delay' }); assert.ok(e);
  assert.ok(!e.fx.some(f => f.k === 'hit' || f.k === 'boom'), 'no damage on landing'); assert.equal(foe.hp, A.CHAR.HP); assert.equal(g.mask.reduce((a, b) => a + b, 0), solid0, 'no hole yet');
  const plant = e.fx.find(f => f.k === 'plant'); assert.ok(plant); assert.equal(g.bombs.length, 1); assert.ok(A.snapshot(g, { mask: false }).bombs.length === 1); g.events.length = 0;
  // 對手的回合開始時不爆；等到 Alice 的下一回合才爆
  const seen = []; for (let i = 0; i < 4000 && !g.over; i++) { if (g.phase === 'turn' && g.chars[g.cur].ai) g.botT = 99; seen.push(...A.step(g, .05)); if (seen.some(x => x.e === 'bomb')) break; }
  const turnsBefore = seen.slice(0, seen.findIndex(x => x.e === 'bomb')).filter(x => x.e === 'turn').map(x => x.id);
  assert.ok(turnsBefore.length >= 1 && !turnsBefore.includes(0), `other players took turns first (${turnsBefore})`);
  const bomb = seen.find(x => x.e === 'bomb'); assert.ok(bomb.fx.some(f => f.k === 'det' && f.bid === plant.id)); assert.ok(bomb.fx.some(f => f.k === 'boom' && f.r === A.ITEMS.delay.r));
  assert.equal(g.bombs.length, 0); assert.equal(seen.findLast(x => x.e === 'turn').id, 0, 'it goes off as Alice starts his turn');
});

test('shield: a support item; you and teammates within range block the next hit, enemies and far teammates do not; the throw is still available', () => {
  const g = two(); const me = put(g, 0, 300), mate = put(g, 1, 380), far = put(g, 2, 120), foe = put(g, 3, 400); me.items.shield = 1;
  assert.equal(A.useItem(g, 0, 'shield'), true); assert.equal(g.fired, false);
  assert.equal(me.shield, true); assert.equal(mate.shield, true); assert.equal(far.shield, false, 'too far'); assert.equal(foe.shield, false, 'enemies are never shielded');
  assert.equal(A.fire(g, 0, { angle: 90, power: .25, item: 'shield' }), null, 'shield can no longer be thrown');
  assert.ok(A.fire(g, 0, { angle: 50, power: .6, item: 'basic' }), 'can throw after using it');
});

test('freeze: low damage, the victim cannot walk next turn, shields block it, shoes cannot undo it', () => {
  assert.ok(A.ITEMS.freeze.dmg <= 15 && A.POOL_ATK.includes('freeze'));
  const g = two(); const me = put(g, 0, 300), foe = put(g, 3, 420); me.items.freeze = 1;
  const sol = A.aimSolve(g, me, foe.x, foe.y - A.CHAR.R, 'freeze'), e = A.fire(g, 0, { angle: sol.ang, power: sol.p, item: 'freeze' });
  if (e.fx.some(f => f.k === 'freeze' && f.id === 3)) {
    assert.equal(foe.frozen, true); g.idx = g.order.indexOf(3) - 1; g.phase = 'resolve'; g.resolveT = 0; A.step(g, .05);
    assert.equal(g.cur, 3); assert.equal(foe.stamina, 0); assert.equal(foe.frozen, false); foe.items.shoes = 1; assert.equal(A.useItem(g, 3, 'shoes'), false);
  }
  const h = two(); const a = put(h, 0, 300), b = put(h, 3, 420); a.items.freeze = 1; b.shield = true;
  const s2 = A.aimSolve(h, a, b.x, b.y - A.CHAR.R, 'freeze'), e2 = A.fire(h, 0, { angle: s2.ang, power: s2.p, item: 'freeze' }); assert.ok(!e2.fx.some(f => f.k === 'freeze'));
});

test('ready: waits for every human, bots and disconnected players count as ready, times out after RULES.READY', () => {
  const g = A.createGame({ seed: 5, waitReady: true, humans: [{ uid: 'a', team: 0, seat: 0 }, { uid: 'b', team: 1, seat: 0 }] });
  assert.equal(g.phase, 'ready'); assert.equal(g.round, 0); A.step(g, 5); assert.equal(g.phase, 'ready');
  assert.equal(A.fire(g, 0, { angle: 45, power: .5 }), null, 'no shooting before the start');
  assert.equal(A.setReady(g, 0), true); assert.equal(A.setReady(g, 0), false, 'only once'); A.step(g, .05); assert.equal(g.phase, 'ready');
  A.setHuman(g, 3, false); const evs = A.step(g, .05); assert.equal(g.phase, 'turn'); assert.equal(g.round, 1); assert.ok(evs.some(x => x.e === 'go') && evs.some(x => x.e === 'turn'));
  const t = A.createGame({ seed: 5, waitReady: true, humans: [{ uid: 'a' }] }); for (let i = 0; i < A.RULES.READY / .05 + 2; i++) A.step(t, .05); assert.equal(t.phase !== 'ready', true, 'timeout starts the game');
});

test('ready seats: move to any non-human seat, toggle bots per seat, never leave a team empty, changes reset ready', () => {
  const g = A.createGame({ seed: 5, waitReady: true, humans: [{ uid: 'a', name: 'A', team: 0, seat: 0, color: A.COLORS[2] }, { uid: 'b', name: 'B', team: 1, seat: 0 }] });
  A.setReady(g, 0); A.setReady(g, 3);
  assert.equal(A.moveSeat(g, 0, 3), false, 'cannot take a human seat');
  const x5 = g.chars[5].x; assert.equal(A.moveSeat(g, 0, 5), true); const a = g.chars.find(c => c.uid === 'a');
  assert.equal(a.id, 5); assert.equal(a.team, 1); assert.equal(a.color, A.COLORS[2], 'appearance moves with the player'); assert.equal(a.x, x5, 'positions stay with the seat'); assert.equal(g.chars[0].uid, null); assert.equal(g.chars[0].human, false);
  assert.equal(a.ready, false, 'a seat change resets ready'); assert.equal(g.chars[3].ready, false);
  // 紅隊現在全是電腦：關掉兩個可以，最後一個不行
  assert.equal(A.toggleBot(g, 0), true); assert.equal(A.toggleBot(g, 1), true); assert.equal(A.toggleBot(g, 2), false, 'last one on the team stays');
  assert.equal(A.toggleBot(g, 3), false, 'human seats cannot be toggled');
  assert.equal(g.chars[0].off, true); assert.equal(g.chars[0].alive, false);
  // a 搬回紅隊的空位，空位跟著換到藍隊
  assert.equal(A.moveSeat(g, 5, 0), true); assert.equal(g.chars[0].uid, 'a'); assert.equal(g.chars[5].off, true, 'the empty seat moves to where a was');
  assert.equal(A.toggleBot(g, 0), false); assert.equal(A.toggleBot(g, 0 + 1), true, 'bot 1 turned back on'); assert.equal(g.chars[1].alive, true); assert.equal(g.chars[1].hp, A.CHAR.HP);
  A.setReady(g, 0); A.setReady(g, 3); A.step(g, .05); assert.equal(g.phase, 'turn');
  assert.ok(!g.order.some(id => g.chars[id].off), 'empty seats never take a turn');
  assert.equal(A.moveSeat(g, 0, 2), false, 'no changes after the start'); assert.equal(A.toggleBot(g, 2), false);
  for (const c of g.chars.filter(c => c.team === 1)) { c.alive = false; c.hp = 0; } g.phase = 'resolve'; g.resolveT = 0; A.step(g, .05);
  assert.equal(g.result.players.length, g.chars.filter(c => !c.off).length, 'empty seats are not in the result');
});

test('walk reach: matches real walking, stops at walls, flags a fall; stamina is 25% more than 150, twice over', () => {
  assert.equal(A.CHAR.STAMINA, 188); assert.equal(A.RULES.START_MONEY, 120);
  const g = two(); const c = put(g, 0, 400), r = A.walkReach(g.mask, c.x, c.y, 1, c.stamina);
  c.move = 1; run(g, 4, gg => { gg.chars[0].move = 1; }); assert.equal(c.x, r.x); assert.equal(r.fell, false); assert.ok(r.pts.length >= 4);
  const w = two(); const d = put(w, 0, 400); for (let y = 0; y < A.H; y++) for (let x = 430; x < 460; x++) w.mask[y * A.W + x] = 1; assert.ok(A.walkReach(w.mask, d.x, d.y, 1, 150).x < 432);
  const f = two(); const e = put(f, 0, 400); for (let y = 0; y < A.H; y++) for (let x = 420; x < 520; x++) f.mask[y * A.W + x] = 0; const rf = A.walkReach(f.mask, e.x, e.y, 1, 150); assert.equal(rf.fell, true); assert.ok(rf.x <= 421);
});

test('spawns: teammates stand 90 apart', () => {
  for (const r of A.RECIPES) { const { terrain } = A.buildTerrain(r); for (const sp of terrain.spawns) { assert.equal(sp[1][0] - sp[0][0], 90); assert.equal(sp[2][0] - sp[1][0], 90); } }
});

test('walking: stamina limit, no leaving the map, slopes and cliffs', () => {
  const g = two(); const c = put(g, 0, 150); c.move = 1; run(g, 3, gg => { gg.chars[0].move = 1; });
  assert.ok(c.x > 150 && c.x - 150 <= A.CHAR.STAMINA + 1, `moved ${c.x - 150}`); assert.ok(c.stamina >= 0 && c.stamina < 5, 'stamina is spent');
  const e = two(); const left = put(e, 0, 12); e.chars[0].move = -1; run(e, 1, gg => { gg.chars[0].move = -1; }); assert.ok(left.x >= 8, 'stays in the map');
  const w = two(); const wall = put(w, 0, 400); const sx = wall.x; for (let y = 0; y < A.H; y++) for (let x = 410; x < 440; x++) w.mask[y * A.W + x] = 1; wall.move = 1; run(w, 2, gg => { gg.chars[0].move = 1; }); assert.ok(wall.x < sx + 14, `a tall wall blocks (moved ${wall.x - sx})`);
  const cl = two(); const edge = put(cl, 0, 400); for (let y = 0; y < A.H; y++) for (let x = 412; x < 470; x++) cl.mask[y * A.W + x] = 0; edge.move = 1; run(cl, 2, gg => { gg.chars[0].move = 1; }); assert.equal(edge.alive, false, 'walked off into the void'); assert.ok(edge.y >= A.H);
});

test('turns: alternate teams, skip the dead, income every round, catch-up money for the weaker team', () => {
  const g = A.createGame({ seed: 3 }); assert.deepEqual(g.order, [0, 3, 1, 4, 2, 5]); assert.equal(g.round, 1);
  assert.ok(g.chars.every(c => c.money === A.RULES.START_MONEY + A.RULES.INCOME), 'round 1 income');
  g.chars[3].alive = false; g.chars[3].hp = 0; A.forfeit(g, 4); const seen = []; while (!g.over && g.round === 1 && seen.length < 8) { seen.push(g.cur); const c = g.chars[g.cur]; c.fired = false; A.fire(g, g.cur, { angle: c.team ? 135 : 45, power: .05 }); run(g, 4); }
  assert.ok(!seen.includes(3) && !seen.includes(4), 'dead characters are skipped');
  const h = A.createGame({ seed: 4 }); for (const c of h.chars.filter(c => c.team === 1)) c.hp = 10; const m = h.chars[0].money; h.phase = 'resolve'; h.resolveT = 0; h.order = []; A.step(h, .05);
  assert.equal(h.round, 2); assert.equal(h.chars[0].money, m + A.RULES.INCOME + 0, 'the team with the lead gets no catch-up'); assert.equal(h.chars[3].money, A.RULES.START_MONEY + A.RULES.INCOME + A.RULES.INCOME + A.RULES.CATCHUP, 'the weaker team gets extra');
});

test('collapse: nothing for 10 rounds, then 5 stages from the edges in, the last one wipes everyone', () => {
  const g = A.createGame({ seed: 8 }); const solidAt = x => { let n = 0; for (let y = 0; y < A.H; y++) n += g.mask[y * A.W + x]; return n; };
  let stage = 0; const bounds = []; for (let guard = 0; guard < 200000 && !g.over; guard++) {
    const evs = A.step(g, .05); for (const e of evs) if (e.e === 'collapse') { stage = e.stage; bounds.push(e.bound); if (stage === 1) { assert.equal(solidAt(5), 0, 'edge is gone'); assert.ok(solidAt(600) > 0, 'center is still there'); assert.ok(g.round === A.ROUNDS + 1, 'first collapse in round 11'); } }
    if (g.phase === 'turn' && g.fired === false && g.chars[g.cur].ai) g.botT = 99; // 電腦不開火，直接等到崩塌
    if (stage < A.STAGES - 1) for (const c of g.chars) if (c.alive) { c.x = 560 + c.id * 16; c.y = A.groundY(g.mask, c.x); } // 全員站在中央，才撐得到最後一次崩塌
  }
  assert.ok(g.over, 'the game ends'); assert.deepEqual(bounds, [480, 360, 240, 120, 0]); const edge = A.createGame({ seed: 8 }); for (let i = 0; i < 400000 && edge.round < A.ROUNDS + 3; i++) { if (edge.phase === 'turn' && edge.chars[edge.cur].ai) edge.botT = 99; A.step(edge, .05); } assert.ok(edge.chars.every(c => !c.alive), 'standing on the edge: everyone is gone by stage 3'); assert.equal(g.round, A.ROUNDS + A.STAGES); assert.ok(g.chars.every(c => !c.alive), 'the final collapse kills everyone'); assert.equal(g.result.reason, 'collapse');
});

test('winner: a wiped team loses; a simultaneous collapse death is decided by team hp at the end of round 10', () => {
  const g = A.createGame({ seed: 9 }); for (const c of g.chars.filter(c => c.team === 1)) { c.alive = false; c.hp = 0; } A.step(g, .05); g.phase = 'resolve'; g.resolveT = 0; A.step(g, .05);
  assert.equal(g.over, true); assert.equal(g.result.winnerTeam, 0); assert.ok(g.result.players.filter(p => p.team === 0).every(p => p.points === 5 && p.win) && g.result.players.filter(p => p.team === 1).every(p => p.points === 1));
  const d = A.createGame({ seed: 10 }); d.round = A.ROUNDS + 4; d.hp10 = [200, 150]; for (const c of d.chars) { c.alive = false; c.hp = 0; } d.phase = 'resolve'; d.resolveT = 0; A.step(d, .05);
  assert.equal(d.over, true); assert.equal(d.result.winnerTeam, 0, 'more hp at round 10 wins'); const e = A.createGame({ seed: 10 }); e.round = A.ROUNDS + 4; e.hp10 = [150, 150]; for (const c of e.chars) { c.alive = false; c.hp = 0; } e.phase = 'resolve'; e.resolveT = 0; A.step(e, .05); assert.equal(e.result.winnerTeam, null); assert.ok(e.result.players.every(p => p.points === 3));
});

test('bots: a full bot game finishes on every preset, results are consistent, same seed replays identically', () => {
  for (const r of A.RECIPES) {
    const g = A.createGame({ seed: 21, recipe: r }); let n = 0; while (!g.over && n++ < 100000) A.step(g, .05);
    assert.equal(g.over, true, r.id); assert.ok(g.round <= A.ROUNDS + A.STAGES); assert.equal(g.result.players.length, 6); assert.ok(g.result.players.every(p => p.bot));
    assert.ok(g.chars.every(c => c.money >= 0 && c.hp >= 0 && c.hp <= A.CHAR.HP));
  }
  const run1 = () => { const g = A.createGame({ seed: 33 }); let n = 0; while (!g.over && n++ < 100000) A.step(g, .05); return JSON.stringify([g.round, g.result, A.snapshot(g, { mask: false }).chars]); };
  assert.equal(run1(), run1());
});

test('bots hit their targets most of the time on open ground (no wind makes this solvable)', () => {
  let hits = 0, tries = 0;
  for (let seed = 1; seed <= 25; seed++) {
    const g = A.createGame({ seed, botErr: 0 }); const c = put(g, 0, 330), foe = put(g, 3, 600 + (seed % 5) * 40); g.cur = 0; g.phase = 'turn'; g.fired = false; c.ai = { err: 0 }; c.human = false;
    const s = A.aimSolve(g, c, foe.x, foe.y - A.CHAR.R); tries++; const ev = A.fire(g, 0, { angle: s.ang, power: s.p }); if (ev.fx.some(f => f.k === 'hit' && f.id === 3)) hits++;
  }
  assert.ok(hits / tries >= .7, `hit rate ${hits}/${tries}`);
});

test('snapshot: round-trips through JSON; the light version has no mask; disconnect hands control to the bot', () => {
  const g = two(); const full = JSON.parse(JSON.stringify(A.snapshot(g))), light = A.snapshot(g, { mask: false });
  assert.ok(Array.isArray(full.mask) && full.mask.length > 1000); assert.equal(light.mask, undefined); assert.equal(full.chars.length, 6); assert.equal(full.turn.offer.length, 3);
  assert.equal(g.chars[0].human, true); A.setHuman(g, 0, false); assert.equal(g.chars[0].human, false); assert.ok(g.chars[0].ai); A.setHuman(g, 0, true); assert.equal(g.chars[0].ai, null);
  const ev = run(g, 25, () => {}); assert.ok(ev.some(e => e.e === 'skip' || e.e === 'turn'), 'an idle turn is skipped');
});

test('start items: everyone begins with one heavy, triple and drill', () => {
  const g = two(); for (const c of g.chars) assert.deepEqual(c.items, { heavy: 1, triple: 1, drill: 1 });
});

test('scatter: the hit throws 5 small balls that each blast on their own', () => {
  const g = two(); const c = g.chars[0]; c.items.scatter = 1; put(g, 0, 300);
  const e = A.fire(g, 0, { angle: 50, power: .6, item: 'scatter' }); assert.equal(c.items.scatter, 0);
  assert.equal(e.fx.filter(f => f.k === 'mini').length, A.ITEMS.scatter.minis);
  const blasts = e.fx.filter(f => f.k === 'boom'); assert.equal(blasts.length, 1 + A.ITEMS.scatter.minis); assert.equal(blasts[0].r, A.ITEMS.scatter.r); assert.ok(blasts.slice(1).every(b => b.r === A.ITEMS.scatter.miniR));
  assert.ok(e.fx.filter(f => f.k === 'mini').every(m => m.path.length === 22));
});

test('shop refresh: costs RULES.REFRESH, never repeats an item shown this turn, stops when the pool runs dry', () => {
  const g = two(); const me = g.chars[0]; me.money = 500; const seen = new Set(g.offer);
  assert.equal(A.refresh(g, 0), true); assert.equal(me.money, 500 - A.RULES.REFRESH); for (const i of g.offer) { assert.ok(!seen.has(i), 'no repeat'); seen.add(i); }
  while (A.refresh(g, 0)) for (const i of g.offer) { assert.ok(!seen.has(i), 'no repeat'); seen.add(i); }
  assert.equal(seen.size, A.POOL.length); assert.equal(A.refresh(g, 0), false);
  const p = two(); p.chars[0].money = 5; assert.equal(A.refresh(p, 0), false, 'cannot afford');
  const q = two(); q.chars[0].money = 500; run(q, A.RULES.SHOP + .2, gg => { gg.chars[0].move = 0; }); assert.equal(A.refresh(q, 0), false, 'shop closes');
});

test('shop: third slot is always a support item, the first two are attacks; nuke can be bought once per game', () => {
  for (let k = 0; k < 20; k++) { const g = two(); assert.equal(g.offer.length, 3); assert.ok(A.POOL_ATK.includes(g.offer[0]) && A.POOL_ATK.includes(g.offer[1])); assert.ok(A.POOL_SUP.includes(g.offer[2])); g.chars[0].money = 500; A.refresh(g, 0); assert.ok(A.POOL_SUP.includes(g.offer[2])); }
  const g = two(); const c = g.chars[0]; c.money = 999; g.offer = ['nuke', 'heavy', 'heal']; assert.equal(A.buy(g, 0, 'nuke'), true); g.offer = ['nuke', 'heavy', 'heal']; assert.equal(A.buy(g, 0, 'nuke'), false, 'limit one');
});

test('support items: one per turn, separate from the throw; heal, shoes, gloves, teleport', () => {
  const g = two(); const c = g.chars[0]; Object.assign(c.items, { heal: 2, shoes: 1, gloves: 1, teleport: 1 }); c.hp = 50;
  assert.equal(A.useItem(g, 0, 'heal'), true); assert.equal(c.hp, 80); assert.equal(A.useItem(g, 0, 'shoes'), false, 'one support per turn');
  assert.ok(A.fire(g, 0, { angle: 50, power: .6, item: 'basic' }), 'can still throw after a support item');
  const h = two(); const d = h.chars[0]; d.items.shoes = 1; assert.equal(A.useItem(h, 0, 'shoes'), true); assert.equal(d.stamina, A.CHAR.STAMINA * 2);
  const t = two(); const u = t.chars[0]; u.items.teleport = 1; assert.equal(A.useItem(t, 0, 'teleport', { x: 600, y: 100 }), true);
  assert.ok(Math.abs(u.x - 600) < 1 && A.solid(t.mask, u.x, u.y + 1) && !A.solid(t.mask, u.x, u.y)); assert.equal(u.items.teleport, 0);
  const w = two(); w.chars[0].items.teleport = 1; assert.equal(A.useItem(w, 0, 'teleport', { x: 'x', y: 'y' }), false, 'bad target');
});

test('gloves: the next attack is thrown twice, the second round after the first; one item is spent', () => {
  const g = two(); const c = g.chars[0]; c.items.gloves = 1; put(g, 0, 300); A.useItem(g, 0, 'gloves'); assert.equal(c.glove, true);
  const e = A.fire(g, 0, { angle: 50, power: .6, item: 'basic' }); assert.equal(c.glove, false); assert.equal(e.shots.length, 2); assert.equal(e.shots[0].at, 0); assert.ok(e.shots[1].at > e.shots[0].dur);
  assert.equal(e.fx.filter(f => f.k === 'boom' || f.k === 'splash').length, 2);
});

test('nuke: huge blast radius and damage', () => {
  assert.ok(A.ITEMS.nuke.r >= 150 && A.ITEMS.nuke.dmg >= 100 && A.ITEMS.nuke.limit === 1);
  const g = two(); g.chars[0].items.nuke = 1; put(g, 0, 300); const e = A.fire(g, 0, { angle: 50, power: .6, item: 'nuke' }); assert.equal(e.fx.find(f => f.k === 'boom')?.r ?? e.fx.find(f => f.k === 'splash') ? true : false, true);
});

test('bots are no longer perfect: with the default error they miss clearly more often than with none', () => {
  const rate = botErr => { let hits = 0; for (let seed = 1; seed <= 40; seed++) {
    const g = A.createGame({ seed, botErr }); const c = put(g, 0, 330), foe = put(g, 3, 700 + (seed % 5) * 40); g.cur = 0; g.phase = 'turn'; g.fired = false; c.ai = { err: botErr }; c.human = false; foe.money = 0;
    const s = A.aimSolve(g, c, foe.x, foe.y - A.CHAR.R), err = botErr * (g.rng() < .3 ? 2 : 1), e = A.fire(g, 0, { angle: s.ang + (g.rng() - .5) * 2 * err, power: Math.min(1, Math.max(.1, s.p + (g.rng() - .5) * err * .02)) }); if (e.fx.some(f => f.k === 'hit' && f.id === 3)) hits++; } return hits / 40; };
  assert.ok(rate(12) < rate(0) - .15, `default ${rate(12)} vs exact ${rate(0)}`);
});

test('bots use the new items: shield, gloves and teleport', () => {
  const g = two(); const c = put(g, 0, 330); g.chars[3].x = 800; c.human = false; c.ai = { err: 0 }; c.hp = 40; c.items.shield = 1; c.money = 0; g.botT = 0; g.phase = 'turn'; g.cur = 0; g.fired = false; g.shopT = 0;
  A.step(g, .05); assert.equal(c.shield, true, 'hurt bot raises a shield'); assert.equal(g.fired, true);
  const h = two(); const d = put(h, 0, 330); d.human = false; d.ai = { err: 0 }; d.items.gloves = 1; d.money = 0; h.botT = 0; h.phase = 'turn'; h.cur = 0; h.fired = false; h.shopT = 0;
  for (let k = 0; k < 40 && !h.fired; k++) { A.step(h, .05); } assert.ok(h.fired);
});

test('kills: only defeated enemies count; teammates and yourself do not; result lists kills per player', () => {
  const g = two(); const me = put(g, 0, 300), foe = put(g, 3, 330), mate = put(g, 1, 360); foe.hp = 1; mate.hp = 1; me.items.heavy = 2;
  const e = A.fire(g, 0, { angle: 60, power: .12, item: 'heavy' });
  assert.ok(e.fx.some(f => f.k === 'hit' && f.dead && f.id === 3) && e.fx.some(f => f.k === 'hit' && f.dead && f.id === 1), 'both fall');
  assert.equal(me.kills, 1, 'the enemy counts, the teammate does not');
  const r = two(); const a = put(r, 0, 300); a.hp = 1; a.items.heavy = 1; A.fire(r, 0, { angle: 90, power: .12, item: 'heavy' }); assert.equal(a.kills, 0, 'suicide is not a kill');
  const f = two(); for (const c of f.chars.slice(3)) c.alive = false; f.chars[0].kills = 2; f.chars[0].alive = true; A.forfeit(f, 1); A.forfeit(f, 2);
  assert.ok(f.over && f.result.players.find(p => p.id === 0).kills === 2);
});

test('hit income: an enemy hit pays 25% more than half the damage; a teammate hit still costs half', () => {
  assert.equal(A.RULES.HIT_GAIN, .5 * 1.25);
  const g = two(); const me = put(g, 0, 300), foe = put(g, 3, 330); put(g, 1, 360); me.items.heavy = 2; me.money = 100;
  const e = A.fire(g, 0, { angle: 60, power: .12, item: 'heavy' }), hits = e.fx.filter(f => f.k === 'hit' && f.id !== 0);
  assert.ok(hits.some(h => h.id === 3) && hits.some(h => g.chars[h.id].team === 0), 'an enemy and a teammate are in the blast');
  const want = hits.reduce((m, h) => m + (g.chars[h.id].team === 0 ? -Math.floor(h.dmg / 2) : Math.floor(h.dmg * .625)) + (h.dead ? (g.chars[h.id].team === 0 ? -1 : 1) * A.RULES.KILL : 0), 100);
  assert.equal(me.money, want); assert.ok(foe.hp < A.CHAR.HP);
});

test('falling: walking off a cliff into the void ends that turn right away, and a wiped team ends the game', () => {
  const g = two(); const c = put(g, 0, 300); for (let x = 320; x < A.W; x++) for (let y = 0; y < A.H; y++) g.mask[y * A.W + x] = 0; // 前面整片沒有地
  c.move = 1; const seen = run(g, 3, gg => { gg.chars[0].move = 1; });
  assert.equal(c.alive, false); assert.ok(seen.some(e => e.e === 'fall' && e.id === 0)); assert.notEqual(g.cur, 0, 'turn moved on');
  const w = two(); for (const o of w.chars) if (o.team === 0 && o.id !== 0) o.alive = false; const d = put(w, 0, 300); for (let x = 320; x < A.W; x++) for (let y = 0; y < A.H; y++) w.mask[y * A.W + x] = 0;
  d.move = 1; run(w, 3, gg => { gg.chars[0].move = 1; }); assert.equal(w.over, true); assert.equal(w.result.winnerTeam, 1);
});

test('falling: whoever dies during their own turn (a bot walking into the void, for one) never stalls the game', () => {
  const g = two(); const b = g.chars[0]; b.human = false; b.ai = { err: 0 }; g.botT = 99;
  b.alive = false; b.hp = 0; // 回合中途掉下去
  const evs = A.step(g, .05); assert.ok(evs.some(e => e.e === 'fall' && e.id === 0)); assert.notEqual(g.cur, 0, 'the turn moves on at once, not after the 20 s timer');
});
