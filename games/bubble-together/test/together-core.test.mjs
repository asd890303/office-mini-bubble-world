import test from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../together-core.js';

const SPRING_REACH = 2 * C.SPRING_V / C.GRAV * C.MOVE;
const flat = (extra = {}) => ({ seed: 0, springs: [], noPlace: [], type: 'run', mod: 'none', solids: [{ x: -5, y: -12, w: 80, h: 12 }], hidden: [], plates: [], doors: [], flags: [{ x: 3, y: 0, seg: 0, reveals: [] }], segs: [], spawn: { x: 2, y: 0 }, goal: { x: 70, y: 0, w: 2, h: 3 }, chaser: null, end: 75, top: 0, ...extra });
const mk = (level = flat(), n = 3) => { const g = C.createGame({ seed: 1, humans: Array.from({ length: n }, (_, i) => ({ uid: 'u' + i, name: 'p' + i })), level }); g.phase = 'run'; g.players.forEach((p, i) => { p.x = 10 + i * 2; p.y = 0; p.ground = true; }); return g; };
const run = (g, secs, f) => { const all = []; for (let i = 0; i < secs / C.DT && !g.over; i++) { if (f) f(g, i * C.DT); all.push(...C.step(g, C.DT)); } return all; };
const key = (g, id, o) => C.setInput(g, id, o);

test('constants: a lone jump cannot clear a high wall or a wide gap, but a stack and a throw can', () => {
  assert.ok(C.JUMP_H < C.WALL_H[0] - .3, 'wall too low'); assert.ok(C.STACK_H > C.WALL_H[1] + .2, 'stack too short');
  assert.ok(C.SOLO_RANGE < C.GAP_W[0] - .8, 'gap too short'); assert.ok(C.THROW_RANGE > C.GAP_W[1] + .6, 'throw too short');
});

test('genLevel: deterministic by seed, varied across seeds, type and modifier are drawn from the lists', () => {
  assert.equal(JSON.stringify(C.genLevel(7)), JSON.stringify(C.genLevel(7))); assert.notEqual(JSON.stringify(C.genLevel(7)), JSON.stringify(C.genLevel(8)));
  const types = new Set(), mods = new Set(), kinds = new Set();
  for (let s = 1; s <= 80; s++) { const L = C.genLevel(s); types.add(L.type); mods.add(L.mod); L.segs.forEach(x => kinds.add(x.kind)); }
  assert.deepEqual([...types].sort(), [...C.TYPES].sort()); assert.deepEqual([...mods].sort(), [...C.MODS].sort()); assert.ok(kinds.has('plate') && kinds.has('wall') && kinds.has('gap') && kinds.has('run'));
});

test('genLevel: every obstacle is sized so one player cannot pass alone but a team can, over 300 seeds', () => {
  for (let s = 1; s <= 300; s++) {
    const L = C.genLevel(s);
    for (const seg of L.segs) {
      if (seg.wall) { assert.ok(seg.wall.h >= C.WALL_H[0] && seg.wall.h <= C.WALL_H[1], 'wall ' + seg.wall.h); assert.ok(seg.wall.h > C.JUMP_H + .3 && seg.wall.h < C.STACK_H - .2); }
      if (seg.gap?.spring) { assert.ok(seg.gap.w >= C.SPRING_GAP[0] && seg.gap.w <= C.SPRING_GAP[1]); assert.ok(seg.gap.w > C.SOLO_RANGE + .6 && seg.gap.w < SPRING_REACH - 1.2); }
      else if (seg.gap) { assert.ok(seg.gap.w >= C.GAP_W[0] && seg.gap.w <= C.GAP_W[1]); assert.ok(seg.gap.w > C.SOLO_RANGE + .8 && seg.gap.w < C.THROW_RANGE - .6); }
    }
    assert.ok(L.solids.every(b => b.w > 0 && b.h > 0)); assert.equal(L.noPlace.length, L.segs.filter(x => ['wall', 'gap', 'plate'].includes(x.kind) && !x.gap?.spring && !x.gap?.lever && !x.wall?.stairs).length, 'every cooperative section is off limits for placing'); assert.ok(L.flags.length >= 4); assert.ok(L.goal.x < L.end);
    assert.deepEqual(L.flags.map(f => f.x), [...L.flags.map(f => f.x)].sort((a, b) => a - b));
    for (const h of L.hidden) assert.ok(L.flags.some(f => f.reveals.includes(h.id)) || L.plates.some(pl => pl.reveals.includes(h.id)), 'hidden piece without a trigger');
    for (const d of L.doors) assert.equal(L.plates.filter(pl => L.doors[pl.door] === d).length, d.hold ? 1 : 2, d.hold ? 'a timed door has one plate' : 'two plates per door');
    assert.ok(L.type !== 'climb' || L.top > 4, 'climb goes up'); assert.equal(!!L.chaser, L.type !== 'run');
  }
});

test('setup: 1 to 4 real players, no bot teammates, each player gets 3 blocks to place during the run', () => {
  const g = C.createGame({ seed: 3, humans: [{ uid: 'a', name: 'A' }, { uid: 'b', name: 'B' }] }); assert.equal(g.players.length, 2); assert.ok(g.players.every(p => p.human && p.bot === undefined));
  assert.ok(g.players.every(p => p.items.length === C.ITEMS && p.items.every(k => C.BLOCKS[k]) && p.used.every(u => !u))); assert.equal(g.phase, 'countdown', 'no placement phase, straight to the countdown'); assert.deepEqual(Object.keys(C.BLOCKS), ['plat', 'spring'], 'no life block'); assert.equal(g.lives, C.LIVES);
  assert.equal(C.createGame({ seed: 3, humans: Array.from({ length: 5 }, (_, i) => ({ uid: 'u' + i })) }).players.length, 4); const one = C.createGame({ seed: 3, humans: [{ uid: 'solo' }] }); assert.equal(one.players.length, 1, 'a lone player plays alone'); assert.equal(one.level.solo, true); assert.equal(C.createGame({ seed: 3, humans: [] }).players.length, 1);
});

test('replay: same seed and inputs give the same snapshot', () => {
  const play = seed => { const g = C.createGame({ seed, humans: [{ uid: 'a' }, { uid: 'b' }] }); for (let i = 0; i < 400; i++) { if (g.phase === 'run') for (const p of g.players) key(g, p.id, { x: 1, jump: i % 20 < 3 }); C.step(g, C.DT); } return JSON.stringify(C.snapshot(g)); };
  assert.equal(play(5), play(5)); assert.notEqual(play(5), play(6));
});

test('physics: a jump rises about JUMP_H, walking speed is MOVE, walls stop you', () => {
  const g = mk(flat({ solids: [{ x: -5, y: -12, w: 80, h: 12 }, { x: 14, y: 0, w: 1, h: 6 }] }), 3); g.players.forEach(p => { p.x = 5 + p.id * 20; });
  let top = 0; key(g, 0, { jump: true }); run(g, .6, g0 => { top = Math.max(top, g0.players[0].y); }); assert.ok(Math.abs(top - C.JUMP_H) < .25, String(top));
  key(g, 0, { jump: false, x: 1 }); const x0 = g.players[0].x; run(g, 1); assert.ok(Math.abs(g.players[0].x - x0 - C.MOVE) < .6 || g.players[0].x < 14 - .4, 'speed');
  run(g, 3); assert.ok(g.players[0].x <= 14 - C.PW / 2 + .01, 'stopped by the wall');
});

test('stacking: standing on a teammate, a jump clears a 3-high wall that a lone jump cannot', () => {
  const wall = { x: 8, y: 0, w: 1.6, h: 3 }; const lvl = () => flat({ solids: [{ x: -5, y: -12, w: 80, h: 12 }, wall] });
  const alone = mk(lvl(), 3); alone.players.forEach((p, i) => { p.x = 6.5; if (i) p.x = 40 + i; }); key(alone, 0, { x: 1, jump: true }); run(alone, 1.5); assert.ok(alone.players[0].y < 2.9 && alone.players[0].x < 8, 'alone is blocked');
  const g = mk(lvl(), 3); g.players[1].x = 6.6; g.players[1].y = 0; g.players[0].x = 6.55; g.players[0].y = 2; g.players[0].vy = 0; g.players[2].x = 50;
  run(g, .5); assert.equal(g.players[0].on, 1, 'stands on the head'); assert.ok(Math.abs(g.players[0].y - 1) < .05);
  key(g, 0, { x: 1, jump: true }); run(g, .9); assert.ok(g.players[0].x > 8 && g.players[0].y >= 2.95, `${g.players[0].x} ${g.players[0].y}`);
});

test('carry and throw: act picks up a teammate, act again throws them across a gap wider than a lone jump', () => {
  const w = 6.8, lvl = flat({ solids: [{ x: -5, y: -12, w: 15, h: 12 }, { x: 10 + w, y: -12, w: 40, h: 12 }] }), g = mk(lvl, 3);
  g.players[0].x = 9.5; g.players[1].x = 9.4; g.players[2].x = 50; key(g, 0, { act: true }); run(g, .1); assert.equal(g.players[0].carry, 1); assert.equal(g.players[1].by, 0);
  key(g, 0, { act: false }); run(g, .1); key(g, 0, { act: true, x: 1 }); const ev = run(g, .1); assert.ok(ev.some(e => e.type === 'throw'));
  key(g, 0, { act: false }); run(g, 1.2); assert.equal(g.players[1].by, null); assert.ok(g.players[1].x > 10 + w && g.players[1].y >= -.01, `${g.players[1].x} ${g.players[1].y}`);
  const solo = mk(lvl, 3); solo.players[0].x = 9.6; solo.players[1].x = solo.players[2].x = 50; key(solo, 0, { x: 1, jump: true }); run(solo, 2); assert.ok(solo.lives < C.LIVES || solo.players[0].x < 10 + w, 'a lone jump falls in');
});

test('plates and doors: a door stays open only while one of its two plates is pressed; one player alone cannot get through', () => {
  const lvl = flat({ plates: [{ x: 4, y: 0, w: 1.4, h: .15, door: 0 }, { x: 14, y: 0, w: 1.4, h: .15, door: 0 }], doors: [{ x: 9, y: 0, w: .6, h: 9 }] });
  const g = mk(lvl, 3); g.players[0].x = 4.7; g.players[1].x = 7; g.players[2].x = 60; run(g, .2); assert.equal(g.doorOpen[0], true); assert.ok(g.pressed.has(0));
  key(g, 1, { x: 1 }); run(g, 3, gg => { if (gg.players[1].x > 14.5) key(gg, 1, { x: 0 }); }); assert.ok(g.players[1].x > 9.6, 'passes while the plate is held'); assert.ok(g.pressed.has(1), 'stands on the far plate'); key(g, 0, { x: 1 }); run(g, 2.5);
  assert.ok(g.players[0].x > 9.6, 'the holder follows while the far plate stays pressed'); key(g, 1, { x: 1 }); run(g, 1); assert.equal(g.doorOpen[0], false, 'closes once nobody is on a plate');
  const solo = mk(lvl, 3); solo.players[0].x = 4.7; solo.players[1].x = solo.players[2].x = 60; run(solo, .2); key(solo, 0, { x: 1 }); run(solo, 2); assert.ok(solo.players[0].x < 9 - .3, 'alone is stopped by the door');
});

test('flags: touching a flag moves the checkpoint and reveals its hidden pieces', () => {
  const lvl = flat({ hidden: [{ x: 20, y: -.4, w: 4, h: .4, id: 0 }], flags: [{ x: 3, y: 0, seg: 0, reveals: [] }, { x: 18, y: 0, seg: 1, reveals: [0] }] });
  const g = mk(lvl, 3); assert.equal(g.revealed.size, 0); g.players[0].x = 18; run(g, .2); assert.equal(g.cp, 1); assert.ok(g.revealed.has(0)); assert.ok(g.flagsHit.has(1));
});

test('death: falling into a pit costs a shared life and respawns at the checkpoint; the chaser pulls back with it', () => {
  const lvl = flat({ solids: [{ x: -5, y: -12, w: 20, h: 12 }, { x: 25, y: -12, w: 50, h: 12 }], flags: [{ x: 3, y: 0, seg: 0, reveals: [] }], chaser: { kind: 'wall', speed: .5, start: -12 }, type: 'rush' }); const g = mk(lvl, 3);
  g.players[0].x = 14; key(g, 0, { x: 1 }); const ev = run(g, 2.5, gg => { if (gg.players[0].dead) key(gg, 0, { x: 0 }); }); assert.ok(ev.some(e => e.type === 'die' && e.id === 0)); assert.equal(g.lives, C.LIVES - 1); assert.equal(g.players[0].deaths, 1);
  key(g, 0, { x: 0 }); run(g, 1.5); assert.equal(g.players[0].dead, false); assert.ok(Math.abs(g.players[0].x - (3 + (0 - 1) * .7)) < 1.2, 'back at the flag');
});

test('lives: running out ends the run as a loss', () => {
  const g = mk(); g.level.solids = []; g.lives = 0; g.players[0].y = -8; run(g, .2); assert.equal(g.over, true); assert.equal(g.result.win, false); assert.ok(g.result.players.every(p => p.points === C.POINTS.lose));
});

test('chaser: the wall kills whoever falls behind it; the flood kills whoever is below it', () => {
  const g = mk(flat({ chaser: { kind: 'wall', speed: 5, start: 0 }, type: 'rush' })); g.chaser = 0; g.players[0].x = 1; g.players[1].x = 30; g.players[2].x = 31; const ev = run(g, .4); assert.ok(ev.some(e => e.type === 'die' && e.id === 0));
  const f = mk(flat({ chaser: { kind: 'flood', speed: 2, start: -1 }, type: 'climb' })); f.chaser = 1.5; f.players.forEach(p => { p.y = 0; }); const e2 = run(f, .2); assert.ok(e2.some(e => e.type === 'die'));
});

test('win: everyone reaching the goal clears the run; 3 or more humans earn 5 points, fewer earn 3', () => {
  const g = mk(); g.players.forEach(p => { p.x = 71; }); run(g, .3); assert.equal(g.over, true); assert.equal(g.result.win, true); assert.ok(g.result.players.every(p => p.points === C.POINTS.win));
  const two = C.createGame({ seed: 1, humans: [{ uid: 'a' }, { uid: 'b' }], level: flat() }); two.phase = 'run'; two.players.forEach(p => { p.x = 71; p.y = 0; }); run(two, .3); assert.ok(two.result.players.every(p => p.points === C.POINTS.win2));
  const part = mk(); part.players[0].x = 71; part.players[1].x = 71; run(part, .5); assert.equal(part.over, false, 'needs everybody');
});

test('placing in the run: a key press drops the chosen block in front of you, each block once, never inside solids or cooperative sections', () => {
  const g = mk(flat(), 2); const p = g.players[0]; p.items = ['plat', 'spring', 'plat']; p.x = 20; p.y = 0; p.face = 1;
  assert.equal(C.place(g, 0, 1), true); const sp = g.placedBlocks.at(-1); assert.equal(sp.kind, 'spring'); assert.ok(sp.box.x > 20 && Math.abs(sp.box.y) < .4, 'beside your feet'); assert.equal(C.place(g, 0, 1), false, 'once only');
  assert.equal(C.place(g, 0, 0), true); const pl = g.placedBlocks.at(-1); assert.equal(pl.kind, 'plat'); assert.ok(pl.box.y > 0 && pl.box.x > 20, 'floats ahead of you'); assert.equal(C.place(g, 0, 9), false);
  p.face = -1; assert.equal(C.place(g, 0, 2), true); assert.ok(g.placedBlocks.at(-1).box.x < 20, 'follows the way you face');
  const w = mk(flat({ noPlace: [{ x: 18, w: 8 }] }), 2); w.players[0].items = ['plat', 'plat', 'plat']; w.players[0].x = 20; assert.equal(C.place(w, 0, 0), false, 'cooperative sections are off limits');
  const ph = C.createGame({ seed: 2, humans: [{ uid: 'a' }, { uid: 'b' }], level: flat() }); assert.equal(C.place(ph, 0, 0), false, 'not before the run starts');
  const gone = mk(flat(), 2); gone.players[0].dead = true; assert.equal(C.place(gone, 0, 0), false, 'not while down');
});

test('placed blocks work: a platform is solid and a spring bounces', () => {
  const g = mk(); g.placedBlocks.push({ kind: 'plat', owner: 0, box: { x: 20, y: 1.5, w: 4, h: .4 }, used: false }, { kind: 'spring', owner: 0, box: { x: 30, y: 0, w: 1.2, h: .5 }, used: false });
  g.players[0].x = 22; g.players[0].y = 3; g.players[0].vy = 0; g.players[1].x = 30.6; g.players[1].y = 1.5; g.players[1].vy = 0; g.players[2].x = 50;
  let apex = 0; run(g, 1.2, g0 => { apex = Math.max(apex, g0.players[1].y); }); assert.ok(Math.abs(g.players[0].y - 1.9) < .05, 'rests on the platform'); assert.ok(apex > C.JUMP_H + 1.5, 'spring bounce ' + apex);
});

test('ice: sliding keeps momentum, so stopping takes longer', () => {
  const a = mk(flat({ mod: 'none' })), b = mk(flat({ mod: 'ice' })); for (const g of [a, b]) { g.players[1].x = g.players[2].x = 60; key(g, 0, { x: 1 }); run(g, 1); key(g, 0, { x: 0 }); }
  const xa = a.players[0].x, xb = b.players[0].x; run(a, .3); run(b, .3); assert.ok(b.players[0].x - xb > a.players[0].x - xa + 1, 'ice slides further');
});

test('snapshot: full carries the level and names; frames carry compact state and the blocks each player has left', () => {
  const g = C.createGame({ seed: 4, humans: [{ uid: 'u0', name: 'Neo' }, { uid: 'u1', name: 'Kim' }] }); const f = C.snapshot(g), s = C.snapshot(g, { full: false });
  assert.equal(f.pl[0].name, 'Neo'); assert.ok(f.level.solids.length > 3); assert.equal(s.level, undefined); assert.equal(s.pl[0].it.length, 3); assert.equal(s.lives, C.LIVES);
});

test('forfeit: a player who leaves no longer blocks the win; a team with fewer than two left loses, a lone player leaving ends the run', () => {
  const g = mk(flat(), 3); C.forfeit(g, 2); assert.equal(g.players[2].gone, true); g.players[0].x = g.players[1].x = 71; run(g, .3); assert.equal(g.over, true); assert.equal(g.result.win, true);
  const h = mk(flat(), 2); C.forfeit(h, 1); run(h, .1); assert.equal(h.over, true); assert.equal(h.result.win, false);
});

test('solo levels: only puzzles one player can solve; team levels always start with a cooperative one', () => {
  const kinds = new Set();
  for (let seed = 1; seed <= 120; seed++) { const L = C.genLevel(seed, null, null, true); L.segs.forEach(x => { if (x.kind !== 'run') { assert.ok(C.SOLO_KINDS.includes(x.kind), x.kind); kinds.add(x.kind); } }); assert.equal(L.solo, true); const T = C.genLevel(seed); assert.ok(C.COOP_KINDS.includes(T.segs[0].kind), 'first puzzle needs a team'); }
  assert.deepEqual([...kinds].sort(), [...C.SOLO_KINDS].sort());
});

test('timed door: pressing the plate opens the door for a few seconds after stepping off, then it closes', () => {
  const lvl = flat({ plates: [{ x: 4, y: 0, w: 1.4, h: .15, door: 0, reveals: [] }], doors: [{ x: 11, y: 0, w: .6, h: 9, hold: C.DOOR_HOLD }] }); const g = mk(lvl, 1);
  g.players[0].x = 4.7; run(g, .2); assert.equal(g.doorOpen[0], true); key(g, 0, { x: 1 }); run(g, 1.3); assert.ok(g.players[0].x > 11.6, 'a lone player runs through in time');
  key(g, 0, { x: 0 }); run(g, C.DOOR_HOLD + .5); assert.equal(g.doorOpen[0], false, 'closes again');
});

test('spring gap: walking onto the fixed spring launches a lone player over a gap wider than a lone jump', () => {
  const w = 6.0, lvl = flat({ solids: [{ x: -5, y: -12, w: 15, h: 12 }, { x: 10 + w, y: -12, w: 40, h: 12 }], springs: [{ x: 9.1, y: 0, w: .8, h: .5 }] }), g = mk(lvl, 1);
  g.players[0].x = 6; key(g, 0, { x: 1 }); run(g, 2.5); assert.ok(g.players[0].x > 10 + w && g.lives === C.LIVES, `${g.players[0].x} ${g.lives}`);
  const none = mk(flat({ solids: lvl.solids }), 1); none.players[0].x = 9.6; key(none, 0, { x: 1, jump: true }); run(none, 2.5); assert.ok(none.lives < C.LIVES || none.players[0].x < 10 + w, 'without the spring the gap is too wide');
});

test('bridge lever: stepping on the plate raises a bridge that stays up', () => {
  const lvl = flat({ solids: [{ x: -5, y: -12, w: 15, h: 12 }, { x: 17, y: -12, w: 40, h: 12 }], hidden: [{ x: 9.8, y: -.4, w: 7.4, h: .4, id: 0 }], plates: [{ x: 3, y: 0, w: 1.4, h: .15, door: -1, reveals: [0] }] }); const g = mk(lvl, 1);
  g.players[0].x = 3.7; run(g, .2); assert.ok(g.revealed.has(0)); key(g, 0, { x: 1 }); run(g, 3); assert.ok(g.players[0].x > 17.4 && g.lives === C.LIVES); assert.ok(g.revealed.has(0), 'stays');
});

// 測試用的單人腳本：一路往右跑，前方有牆或高台就跳，前方沒有地面就跳。不認識任何區段，只看地形，所以通過就代表關卡本身一個人走得過去
function soloRun(g) {
  const L = g.level, p = g.players[0];
  for (let i = 0; i < C.RUN_LIMIT / C.DT && !g.over; i++) {
    const solids = [...L.solids, ...L.hidden.filter((h, k) => g.revealed.has(k)), ...L.doors.filter((d, k) => !g.doorOpen[k])];
    const ahead = solids.some(s => s.x < p.x + 1 && s.x + s.w > p.x + .4 && s.y < p.y + .95 && s.y + s.h > p.y + .1);
    const floor = solids.some(s => p.x + .5 > s.x && p.x + .5 < s.x + s.w && s.y + s.h <= p.y + .35 && s.y + s.h > p.y - .6);
    C.setInput(g, 0, { x: 1, jump: p.ground && (ahead || !floor) }); C.step(g, C.DT);
  }
  return g;
}
test('solo levels are clearable: a terrain-only script clears every kind of level, all three types and modifiers, from 150 seeds', () => {
  const types = new Set(), mods = new Set(); let fails = [];
  for (let seed = 1; seed <= 150; seed++) {
    const g = C.createGame({ seed, humans: [{ uid: 'a' }] }); g.phase = 'run'; types.add(g.level.type); mods.add(g.level.mod); soloRun(g);
    if (!(g.over && g.result.win)) fails.push(`${seed}:${g.level.type}/${g.level.mod}/${g.level.segs.map(s => s.kind).join('+')} x=${g.players[0].x.toFixed(1)} lives=${g.lives}`);
  }
  assert.equal(types.size, 3); assert.equal(mods.size, 3); assert.deepEqual(fails, []);
});
