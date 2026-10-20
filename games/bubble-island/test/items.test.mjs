import test from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../game-core.js';

// 空曠的兩人局：清掉所有箱子，方便擺位置
function arena(seed = 1) {
  const g = C.createGame({ seed, humans: [{ uid: 1, name: 'A' }, { uid: 2, name: 'B' }], bots: false });
  for (const row of g.grid) for (let x = 0; x < row.length; x++) if (row[x] === C.SOFT) row[x] = C.EMPTY;
  g.players[1].x = 12; g.players[1].y = 12;
  return g;
}
const put = (g, p, x, y) => { p.x = x; p.y = y; };
const flame = (g, x, y) => { const f = { id: 900 + g.nextId++, x, y, t: C.FLAME_TIME, center: true, owner: 1 }; g.flames.push(f); return f; };

test('flame: only traps during the visible window, not during the fade-out', () => {
  const g = arena(), a = g.players[0];
  put(g, a, 4, 0); const f = flame(g, 6, 0);
  const steps = Math.ceil((C.FLAME_TIME - C.FLAME_FADE) / .05);
  for (let i = 0; i < steps; i++) C.step(g, .05);
  assert.ok(f.t <= C.FLAME_FADE + 1e-9 && g.flames.includes(f), 'flame is in fade-out but still present');
  put(g, a, 6, 0); C.step(g, .05);
  assert.equal(a.state, 'alive', 'walking into a fading flame does not trap');
  const g2 = arena(), b = g2.players[0]; put(g2, b, 6, 0); flame(g2, 6, 0); C.step(g2, .05);
  assert.equal(b.state, 'trapped', 'standing in a live flame traps');
  for (let i = 0; i < 20; i++) C.step(g, .05);
  assert.equal(g.flames.length, 0, 'flame removed after FLAME_TIME');
});

test('flame hitbox: grazing the edge of a flame cell is safe, overlapping is not', () => {
  const g = arena(), a = g.players[0];
  put(g, a, 5.55, 0); flame(g, 6, 0); C.step(g, 0.0001);
  assert.equal(a.state, 'alive', '0.45 away (old rounding would trap) → safe');
  const g2 = arena(), b = g2.players[0]; put(g2, b, 5.7, 0); flame(g2, 6, 0); C.step(g2, 0.0001);
  assert.equal(b.state, 'trapped', '0.3 away → trapped');
});

test('kick: with kick shoes, walking into a bubble slides it until blocked', () => {
  const g = arena(), a = g.players[0];
  a.kick = true; put(g, a, 2, 0);
  g.bombs.push({ id: 77, x: 3, y: 0, owner: 1, power: 1, t: 9, passers: new Set(), slide: null, prog: 0 });
  C.setInput(g, 0, [1, 0]);
  const ev = []; for (let i = 0; i < 6; i++) ev.push(...C.step(g, .05));
  assert.ok(ev.some(e => e.e === 'kick'), 'kick event');
  C.setInput(g, 0, [0, 0]);
  for (let i = 0; i < 40; i++) C.step(g, .05);
  const b = g.bombs.find(b => b.id === 77);
  assert.equal(b.y, 0); assert.equal(b.x, 14, 'slid to the east wall'); assert.equal(b.slide, null);
});

test('kick: stops before a box, and without shoes the bubble does not move', () => {
  const g = arena(), a = g.players[0];
  a.kick = true; put(g, a, 2, 0); g.grid[0][7] = C.SOFT;
  g.bombs.push({ id: 5, x: 3, y: 0, owner: 1, power: 1, t: 9, passers: new Set(), slide: null, prog: 0 });
  C.setInput(g, 0, [1, 0]); for (let i = 0; i < 4; i++) C.step(g, .05); C.setInput(g, 0, [0, 0]);
  for (let i = 0; i < 40; i++) C.step(g, .05);
  assert.equal(g.bombs[0].x, 6, 'stopped right before the box at x=7');
  const g2 = arena(), c = g2.players[0]; put(g2, c, 2, 0);
  g2.bombs.push({ id: 6, x: 3, y: 0, owner: 1, power: 1, t: 9, passers: new Set(), slide: null, prog: 0 });
  C.setInput(g2, 0, [1, 0]); for (let i = 0; i < 40; i++) C.step(g2, .05);
  assert.equal(g2.bombs[0].x, 3); assert.ok(c.x <= 2 + 1e-9, 'blocked by the bubble');
});

test('super bubble: power 15, blast reaches across the whole board', () => {
  const g = arena(), a = g.players[0];
  put(g, a, 0, 0); g.items.set('0,0', { x: 0, y: 0, kind: 'super', pending: 0 });
  C.step(g, .01);
  assert.equal(a.power, C.SUPER_POWER); assert.equal(C.SUPER_POWER, 15);
  g.items.set('0,0', { x: 0, y: 0, kind: 'power', pending: 0 }); C.step(g, .01);
  assert.equal(a.power, 15, 'a later 水柱+1 never lowers super power');
  const g2 = arena(); const b = g2.players[0]; b.power = 15; put(g2, b, 0, 0); C.placeBomb(g2, b); b.state = 'dead';
  let maxX = 0; for (let i = 0; i < 60; i++) { C.step(g2, .05); for (const f of g2.flames) if (f.y === 0) maxX = Math.max(maxX, f.x); }
  assert.equal(maxX, 14, 'flame reaches the far edge (15 cells wide)');
});

test('speed shoes: bigger boost per pickup, capped', () => {
  const g = arena(), a = g.players[0]; put(g, a, 0, 0);
  const s0 = a.speed;
  g.items.set('0,0', { x: 0, y: 0, kind: 'speed', pending: 0 }); C.step(g, .01);
  assert.ok(a.speed - s0 >= .75, 'each pair of shoes adds ≥ 0.75 cells/s');
  for (let i = 0; i < 10; i++) { g.items.set('0,0', { x: 0, y: 0, kind: 'speed', pending: 0 }); C.step(g, .01); }
  assert.equal(a.speed, C.MAX_SPEED);
});

test('item table: no needle, super is the rarest, drops follow weights', () => {
  assert.ok(!C.ITEM_KINDS.includes('needle'));
  assert.deepEqual(C.ITEM_KINDS.sort(), ['bomb', 'kick', 'power', 'speed', 'super']);
  const w = C.ITEM_WEIGHTS; assert.ok(Object.values(w).every(v => v >= w.super));
  assert.equal(typeof C.useNeedle, 'undefined');
  const counts = {};
  for (let seed = 1; seed <= 40; seed++) { const g = C.createGame({ seed }); let k = 0; while (!g.over && k++ < 6000) for (const e of C.step(g, .05)) if (e.e === 'item') counts[e.kind] = (counts[e.kind] || 0) + 1; }
  assert.ok(!counts.needle && counts.super > 0 && counts.kick > 0, JSON.stringify(counts));
  assert.ok(counts.super < counts.bomb && counts.super < counts.power, 'super picked up least often');
});
