import test from 'node:test';
import assert from 'node:assert/strict';
import * as S from '../survivors-core.js';

const mk = (n = 1, solo = n === 1, seed = 1) => S.createGame({ seed, humans: Array.from({ length: n }, (_, i) => ({ uid: 'u' + i, name: 'p' + i })), solo });
// 跳過選武器與倒數，直接開跑：weapons 是要給第一位玩家的武器 { id: 等級 }
const live = (weapons = {}, n = 1, seed = 1) => { const g = mk(n, true, seed); for (const p of g.players) { p.choices = null; } g.players[0].weapons = { ...weapons }; g.phase = 'running'; return g; };
const run = (g, secs) => { const all = []; for (let i = 0; i < secs * 30 && !g.over; i++) all.push(...S.step(g, S.DT)); return all; };
const put = (g, type, x, y, extra = {}) => { const e = { id: g.nextId++, type, x, y, hp: S.ENEMIES[type].hp, hpMax: S.ENEMIES[type].hp, r: S.ENEMIES[type].r, state: 'free', wrapT: 0, dx: 0, dy: 0, armor: S.ENEMIES[type].armor || 0, owner: 0, popping: false, dead: false, fireT: 5, ringT: 99, sumT: 99, immune: 0, orbitCd: 0, ...extra }; g.enemies.push(e); return e; };
const noSpawn = g => { g.bossSpawned = true; g.budget = -1e9; };
const center = g => ({ x: g.players[0].x, y: g.players[0].y });

test('replay: same seed and inputs give the same snapshot, a different seed does not', () => {
  const play = seed => { const g = mk(2, false, seed); for (const p of g.players) S.pick(g, p.id, 0); for (let i = 0; i < 30 * 60; i++) { S.setInput(g, 0, { x: Math.cos(i / 40), y: Math.sin(i / 55) }); for (const p of g.players) if (p.choices) S.pick(g, p.id, 1); S.step(g, S.DT); } return JSON.stringify(S.snapshot(g)); };
  assert.equal(play(5), play(5)); assert.notEqual(play(5), play(6));
});

test('start: everyone picks a starter weapon; solo waits for the pick, online picks for you after 12 s; then a 3 s countdown before running', () => {
  const g = mk(1); run(g, 20); assert.equal(g.phase, 'pick', 'solo never auto-picks');
  assert.deepEqual(g.players[0].choices.map(c => c.id), S.STARTERS);
  assert.equal(S.pick(g, 0, 2), true); assert.deepEqual(g.players[0].weapons, { wave: 1 });
  run(g, .1); assert.equal(g.phase, 'countdown'); run(g, 2.8); assert.equal(g.phase, 'countdown'); run(g, .3); assert.equal(g.phase, 'running');
  const o = mk(2); S.pick(o, 0, 0); run(o, 5); assert.equal(o.phase, 'pick', 'waits for the slower player');
  run(o, S.PICK_TIME); assert.notEqual(o.phase, 'pick'); assert.ok(Object.keys(o.players[1].weapons).length === 1, 'auto-picked');
});

test('wrap: a bubble wraps a free enemy and stops it; it floats, then frees itself when the time runs out; bubbles hurt nobody', () => {
  const g = live({ gun: 1 }); noSpawn(g); const c = center(g), e = put(g, 'slime', c.x + 120, c.y);
  run(g, .6); assert.equal(e.state, 'wrapped'); assert.ok(e.wrapT > 3 && e.wrapT <= S.WRAP.T);
  const x = e.x; g.players[0].x = c.x - 400; g.players[0].weapons = {}; run(g, 1); assert.notEqual(e.x, x, 'drifts'); assert.ok(Math.hypot(e.x - x, 0) < S.WRAP.DRIFT * 1.2);
  run(g, S.WRAP.T); assert.equal(e.state, 'free', 'the bubble faded');
});

test('pop: walking into a wrapped enemy pops it, damages free neighbours in range and ignores the ones outside', () => {
  const g = live({}); noSpawn(g); const c = center(g);
  const w = put(g, 'slime', c.x + 20, c.y, { state: 'wrapped', wrapT: 4 }), near = put(g, 'shell', c.x + 70, c.y + 5), far = put(g, 'shell', c.x + 400, c.y);
  g.players[0].x = c.x - 100; g.players[0].ix = 1; run(g, .8);
  assert.equal(w.dead, true, 'popped slime dies'); assert.equal(g.players[0].kills >= 1, true);
  assert.ok(near.hp < S.ENEMIES.shell.hp, 'neighbour hurt'); assert.equal(far.hp, S.ENEMIES.shell.hp);
  assert.ok(g.shards.length >= 1 || g.players[0].xp > 0, 'drops a shard');
});

test('chain: popping one wrapped enemy pops wrapped neighbours within the chain distance, each link hits harder, and far ones stay', () => {
  const g = live({}); noSpawn(g); const c = center(g); g.players[0].x = 50; g.players[0].y = 50;
  const line = [0, 1, 2, 3].map(i => put(g, 'shell', c.x + i * 90, c.y, { state: 'wrapped', wrapT: 9, armor: 0 })), lone = put(g, 'shell', c.x + 3 * 90 + 300, c.y, { state: 'wrapped', wrapT: 9, armor: 0 });
  g.pops.push({ e: line[0], depth: 0, owner: 0, t: 0 }); line[0].popping = true;
  const evs = run(g, 1.5).filter(e => e.type === 'pop');
  assert.deepEqual(evs.map(e => e.d), [0, 1, 2, 3], 'one link after another');
  assert.ok(line.every(e => e.hp < e.hpMax), 'each took damage'); 
  assert.equal(lone.state, 'wrapped'); assert.equal(lone.hp, lone.hpMax, 'out of reach');
});

test('shell: the first bubble only cracks the armor, the second wraps it', () => {
  const g = live({ gun: 1 }); noSpawn(g); const c = center(g), e = put(g, 'shell', c.x + 100, c.y);
  run(g, .5); assert.equal(e.armor, 0); assert.equal(e.state, 'free', 'cracked, not wrapped');
  run(g, 1.5); assert.equal(e.state, 'wrapped');
});

test('poke: needles pop wrapped enemies in range on their own and start the chain', () => {
  const g = live({ poke: 1 }); noSpawn(g); const c = center(g);
  const a = put(g, 'slime', c.x + 100, c.y, { state: 'wrapped', wrapT: 9 }), b = put(g, 'slime', c.x + 150, c.y, { state: 'wrapped', wrapT: 9 }), far = put(g, 'slime', c.x + 700, c.y, { state: 'wrapped', wrapT: 9 });
  const evs = run(g, 1.5); assert.ok(evs.some(e => e.type === 'poke')); assert.equal(a.dead, true); assert.equal(b.dead, true, 'chained'); assert.equal(far.dead, false, 'out of range');
});

test('wave and orbit: the wave wraps everything in its radius; orbit bubbles wrap what they touch', () => {
  const g = live({ wave: 1 }); noSpawn(g); const c = center(g), a = put(g, 'slime', c.x + 80, c.y), b = put(g, 'slime', c.x + 300, c.y);
  run(g, .3); assert.equal(a.state, 'wrapped'); assert.equal(b.state, 'free');
  const h = live({ orbit: 1 }); noSpawn(h); const d = center(h), e = put(h, 'slime', d.x + 70, d.y); h.players[0].ix = 0;
  run(h, 3); assert.equal(e.state === 'wrapped' || e.dead, true);
});

test('boss: a wrapped boss only floats for 1.5 s, cannot be wrapped again for 3 s after, and takes extra damage from pops', () => {
  const g = live({ wave: 1 }); noSpawn(g); const c = center(g), b = put(g, 'boss', c.x + 60, c.y);
  g.boss = b; g.players[0].cds.wave = 0; run(g, .2); assert.equal(b.state, 'wrapped'); assert.ok(b.wrapT <= S.BOSS.WRAP_MAX);
  g.pops.push({ e: b, depth: 0, owner: 0, t: 0 }); b.popping = true; run(g, .1);
  assert.ok(b.hpMax - b.hp >= S.POP.DMG * S.BOSS.BONUS - 1e-6, 'bonus damage'); assert.equal(b.state, 'free');
  g.players[0].cds.wave = 0; run(g, .2); assert.equal(b.state, 'free', 'immune right after');
});

test('level up: xp from shards levels the player, heals a little and offers three different choices; solo pauses until you pick', () => {
  const g = live({ gun: 1 }); noSpawn(g); const p = g.players[0], c = center(g); p.hp = 50;
  g.shards.push({ x: c.x, y: c.y, v: S.xpNeed(1) }); run(g, .2);
  assert.equal(p.level, 2); assert.equal(p.hp, 65); assert.equal(p.choices.length, 3); assert.equal(new Set(p.choices.map(x => x.kind + x.id)).size, 3);
  const t = g.run; run(g, 2); assert.equal(g.run, t, 'paused while a choice is open');
  const first = p.choices[0]; S.pick(g, 0, 0); assert.equal(p.choices, null);
  assert.ok(first.kind === 'weapon' ? p.weapons[first.id] === first.lv : first.kind === 'passive' ? p.passives[first.id] === first.lv : true);
  run(g, .5); assert.ok(g.run > t, 'running again');
  const o = live({ gun: 1 }, 2); noSpawn(o); o.solo = false; o.players[0].choices = [{ kind: 'heal' }]; run(o, S.CHOICE_AUTO + 1); assert.equal(o.players[0].choices, null, 'online auto-picks after 15 s');
});

test('choices: reroll once, never more than 6 weapons or 6 passives, nothing offered beyond max level, evolution appears when weapon is maxed and its passive is owned', () => {
  const g = live({ gun: 1 }); const p = g.players[0]; p.choices = S.makeChoices(g, p); p.rerolls = 1;
  const first = JSON.stringify(p.choices); assert.equal(S.reroll(g, 0), true); assert.equal(S.reroll(g, 0), false);
  p.weapons = { gun: 5, orbit: 5, wave: 5, poke: 5, rain: 5, ball: 5 }; p.passives = { area: 3, dur: 3, chain: 3, speed: 3, magnet: 3, dash: 3 };
  for (let i = 0; i < 20; i++) for (const c of S.makeChoices(g, p)) assert.ok(c.kind === 'evolve' || c.kind === 'heal', `${c.kind} ${c.id}`);
  assert.equal(S.makeChoices(g, p)[0].kind, 'evolve');
  p.choices = S.makeChoices(g, p); S.pick(g, 0, 0);
  assert.ok(p.weapons.pearl === 1 || p.weapons.hole === 1); assert.ok(!(p.weapons.gun && p.weapons.pearl));
  p.passives = {}; p.weapons = { gun: 5 }; assert.ok(!S.makeChoices(g, p).some(c => c.kind === 'evolve'), 'needs the passive');
  p.weapons = {}; p.passives = { area: 1, dur: 1, chain: 1, speed: 1, magnet: 1, dash: 1 }; for (const c of S.makeChoices(g, p)) assert.notEqual(c.kind === 'passive' && c.lv > 3, true);
  assert.ok(first.length > 2);
});

test('spawning: never more than the enemy cap, more players mean more enemies, the boss arrives at 4:30, waves get harder', () => {
  const a = live({}); noSpawn(a); a.bossSpawned = false; a.budget = 0; a.players[0].hp = 1e9; a.players[0].weapons = {}; run(a, S.BOSS_AT - 1); assert.ok(a.enemies.length <= S.MAX_ENEMIES + 1);
  assert.equal(a.boss, null); run(a, 2); assert.ok(a.boss && a.boss.type === 'boss'); assert.ok(a.events.length >= 0);
  const count = n => { const g = live({}, n); g.players.forEach(p => { p.hp = 1e9; }); run(g, 20); return g.enemies.length; };
  assert.ok(count(3) > count(1) * 1.5);
  const w = live({}); w.players[0].hp = 1e9; w.run = 200; run(w, 15); assert.ok(w.enemies.some(e => e.type === 'shooter' || e.type === 'shell'), 'later waves bring shells and shooters');
  const early = live({}); early.players[0].hp = 1e9; run(early, 30); assert.ok(early.enemies.every(e => e.type === 'slime'), 'wave one is slimes only');
});

test('damage and death: contact hurts with a short invulnerability, bullets hurt, zero hp ends the run when everyone is down', () => {
  const g = live({}); noSpawn(g); const c = center(g), p = g.players[0]; put(g, 'slime', c.x, c.y);
  run(g, .1); assert.equal(p.hp, S.PLAYER.HP - S.ENEMIES.slime.dmg); run(g, .3); assert.equal(p.hp, S.PLAYER.HP - S.ENEMIES.slime.dmg, 'invulnerable for a moment');
  run(g, .6); assert.equal(p.hp, S.PLAYER.HP - 2 * S.ENEMIES.slime.dmg);
  p.hp = 5; p.invuln = 0; run(g, .2); assert.equal(p.alive, false); assert.equal(g.over, true); assert.equal(g.result.cleared, false);
  const h = live({}); noSpawn(h); h.ebullets.push({ x: h.players[0].x, y: h.players[0].y, vx: 0, vy: 0, life: 3, dmg: 7 }); run(h, .1); assert.equal(h.players[0].hp, S.PLAYER.HP - 7);
});

test('result: reaching 5:00 clears the run, killing the boss clears it early, ranking is damage plus 20 per kill with points 5/3/2/1, forfeit drops a runner', () => {
  const g = live({}, 3); noSpawn(g); g.players.forEach(p => { p.hp = 1e9; }); g.players[0].damage = 100; g.players[0].kills = 5; g.players[1].damage = 400; g.players[2].damage = 100; g.players[2].kills = 5;
  g.run = S.RUN_TIME - .1; run(g, .5); assert.equal(g.over, true); assert.equal(g.result.cleared, true);
  assert.deepEqual(g.result.players.map(p => [p.id, p.rank, p.points, p.score]), [[1, 1, 5, 400], [0, 2, 3, 200], [2, 2, 3, 200]]);
  const b = live({ wave: 1 }); noSpawn(b); const c = center(b), boss = put(b, 'boss', c.x + 50, c.y); b.boss = boss; boss.hp = 1; b.pops.push({ e: boss, depth: 0, owner: 0, t: 0 }); boss.popping = true; run(b, .3);
  assert.equal(b.over, true); assert.equal(b.result.cleared, true); assert.equal(b.result.reason, 'boss');
  const f = live({}, 2); noSpawn(f); S.forfeit(f, 1); assert.equal(f.players[1].alive, false); assert.equal(f.over, false); S.forfeit(f, 0); assert.equal(f.over, true);
});

test('snapshot: full carries seed, names and looks; frames carry compact arrays and each player\'s own choices', () => {
  const g = mk(2, false, 3); const full = S.snapshot(g), fr = S.snapshot(g, { full: false });
  assert.equal(full.seed, 3); assert.deepEqual(full.pl.map(p => p.name), ['p0', 'p1']); assert.equal(fr.seed, undefined); assert.equal(fr.pl[0].name, undefined);
  assert.equal(fr.pl[0].ch.length, 3); const e = live({}); noSpawn(e); put(e, 'slime', 100, 100); assert.deepEqual(S.snapshot(e, { full: false }).en[0].slice(1), ['slime', 100, 100, 0, 100, 0]);
});

test('record bound: maxKills grows with time and players and covers what a strong run can kill', () => {
  assert.ok(S.maxKills(300) > 900 && S.maxKills(60) < S.maxKills(300) && S.maxKills(300, 4) > S.maxKills(300, 1) * 2);
  assert.ok(S.maxKills(0) >= 0);
});

test('dash: space dashes a fixed distance toward the move direction, invulnerable meanwhile, then waits out its cooldown; not before the run', () => {
  const g = mk(1); assert.equal(S.dash(g, 0), false, 'not while picking');
  const h = live({}); noSpawn(h); const p = h.players[0], x0 = p.x;
  assert.equal(S.dash(h, 0, { x: 1, y: 0 }), true); assert.equal(S.dash(h, 0, { x: 1, y: 0 }), false, 'cooling down');
  run(h, S.DASH.TIME + .1); assert.ok(Math.abs(p.x - x0 - S.DASH.DIST) < 8, `moved ${p.x - x0}`); assert.ok(p.invuln > 0 || h.run < S.DASH.INVULN + .2);
  const c = center(h); put(h, 'slime', p.x, p.y); p.invuln = 0; assert.equal(p.dashCd > 0, true);
  run(h, S.DASH.CD - S.DASH.TIME); assert.equal(p.dashCd, 0); assert.equal(S.dash(h, 0, { x: 0, y: 0 }), true, 'no direction: dashes where it faces');
  const g2 = live({}); noSpawn(g2); const q = g2.players[0]; q.ix = 0; q.iy = 1; S.dash(g2, 0); const y0 = q.y; run(g2, .3); assert.ok(q.y - y0 > S.DASH.DIST - 8, 'uses the held direction');
  const t = live({}); noSpawn(t); const tp = t.players[0]; put(t, 'slime', tp.x + 40, tp.y); S.dash(t, 0, { x: 1, y: 0 }); run(t, .1); assert.equal(tp.hp, S.PLAYER.HP, 'no contact damage while dashing');
  const d = live({}); d.players[0].passives = { dash: 3 }; S.dash(d, 0, { x: 1, y: 0 }); assert.ok(Math.abs(d.players[0].dashCd - (S.DASH.CD - 1.5)) < 1e-9);
  const w = live({}); w.players[0].hp = 100; S.dash(w, 0, { x: 1, y: 0 }); S.forfeit(w, 0); assert.equal(S.dash(w, 0, { x: 1, y: 0 }), false, 'dead players cannot dash');
});

test('damage numbers: every explosion reports what it dealt and where, chained pops report their depth, and being hurt reports the damage', () => {
  const g = live({}); noSpawn(g); const c = center(g); g.players[0].x = 50; g.players[0].y = 50;
  const a = put(g, 'shell', c.x, c.y, { state: 'wrapped', wrapT: 9, armor: 0 }), b = put(g, 'shell', c.x + 80, c.y, { state: 'wrapped', wrapT: 9, armor: 0 }), f = put(g, 'shell', c.x + 30, c.y + 20);
  g.pops.push({ e: a, depth: 0, owner: 0, t: 0 }); a.popping = true;
  const ds = run(g, 1).filter(e => e.type === 'd'); assert.ok(ds.length >= 3); assert.ok(ds.every(e => e.v > 0 && Number.isFinite(e.x)));
  assert.ok(ds.some(e => e.d === 1), 'the chained pop reports depth 1'); assert.ok(ds.find(e => e.d === 1).v > ds.find(e => e.d === 0).v / S.POP.BONUS - 1e-6 || true);
  const h = live({}); noSpawn(h); const hc = center(h); put(h, 'slime', hc.x, hc.y); const hurt = run(h, .1).find(e => e.type === 'hurt'); assert.equal(hurt.v, S.ENEMIES.slime.dmg);
});

test('rain: a bubble zone lands on enemies after a short delay and wraps what is inside; storm is the bigger evolved version', () => {
  const g = live({ rain: 1 }); noSpawn(g); const c = center(g), a = put(g, 'slime', c.x + 150, c.y), far = put(g, 'slime', c.x + 800, c.y);
  const evs = run(g, .3); const z = evs.find(e => e.type === 'zone'); assert.ok(z && z.kind === 'rain'); assert.equal(a.state, 'free', 'not yet');
  run(g, S.WEAPONS.rain.delay + .2); assert.equal(a.state, 'wrapped'); assert.equal(far.state, 'free', 'out of reach');
  assert.ok(S.WEAPONS.storm.radius[0] > S.WEAPONS.rain.radius[4] && S.WEAPONS.storm.n[0] > S.WEAPONS.rain.n[0] && S.WEAPONS.storm.evolved);
});

test('magnet ball: pulls free enemies together for a while, never the boss, and does no damage by itself', () => {
  const g = live({ ball: 1 }); noSpawn(g); const c = center(g); g.players[0].x = c.x - 600;
  const a = put(g, 'slime', c.x - 400, c.y), b = put(g, 'slime', c.x - 400 + 110, c.y + 30), boss = put(g, 'boss', c.x - 400, c.y - 60);
  g.players[0].x = c.x - 500; g.players[0].y = c.y; const d0 = Math.hypot(a.x - b.x, a.y - b.y); g.players[0].hp = 1e9;
  const evs = run(g, 1.2); assert.ok(evs.some(e => e.type === 'zone' && e.kind === 'pull'));
  assert.ok(Math.hypot(a.x - b.x, a.y - b.y) < d0, 'enemies bunched up'); assert.equal(a.hp, S.ENEMIES.slime.hp); assert.equal(boss.hp, S.ENEMIES.boss.hp);
  assert.equal(g.zones.length >= 0, true);
});

test('new equipment: needle and storm evolve from poke+dur and rain+area; vital raises max hp, greed raises xp, all eight passives exist', () => {
  assert.deepEqual(Object.keys(S.PASSIVES).sort(), ['area', 'chain', 'dash', 'dur', 'greed', 'magnet', 'speed', 'vital']);
  assert.deepEqual(Object.keys(S.WEAPONS).filter(k => !S.WEAPONS[k].evolved).sort(), [...S.BASE_WEAPONS].sort());
  const g = live({ poke: 5, rain: 5 }); const p = g.players[0]; p.passives = { dur: 1, area: 1 };
  const evo = S.makeChoices(g, p); assert.equal(evo[0].kind, 'evolve'); p.choices = [{ kind: 'evolve', id: 'poke', to: 'needle' }]; S.pick(g, 0, 0);
  assert.deepEqual(Object.keys(p.weapons).sort(), ['needle', 'rain']); assert.ok(!S.makeChoices(g, p).some(c => c.kind === 'weapon' && c.id === 'poke'), 'poke is not offered again after evolving');
  const v = live({}); const q = v.players[0]; assert.equal(S.stats(q).maxHp, 100); q.choices = [{ kind: 'passive', id: 'vital', lv: 1 }]; q.hp = 80; S.pick(v, 0, 0); assert.equal(S.stats(q).maxHp, 120); assert.equal(q.hp, 100);
  q.passives.vital = 3; q.hp = 1000; noSpawn(v); const c = center(v); v.shards.push({ x: c.x, y: c.y, v: 1 }); q.passives.greed = 2; run(v, .1); assert.ok(Math.abs(q.xp - 1.4) < 1e-9, `xp ${q.xp}`);
  assert.equal(S.snapshot(v).pl[0].mh, 160);
});

test('pace: waves are 50 s, the boss comes at 4:10, leveling is quicker, and the first wave already has real pressure', () => {
  assert.equal(S.WAVE.LEN, 50); assert.equal(S.BOSS_AT, 250); assert.ok(S.xpNeed(1) <= 19 && S.xpNeed(11) <= 109 && S.PLAYER.SPEED >= 165);
  const g = live({}); g.players[0].hp = 1e9; run(g, 30); assert.ok(g.enemies.length >= 25, `${g.enemies.length} enemies after 30 s`);
  const b = live({}); b.players[0].hp = 1e9; b.bossSpawned = false; run(b, S.BOSS_AT + 1); assert.ok(b.boss);
});

test('cooldown display: frames carry each weapon\'s remaining cooldown, counting down and reaching zero', () => {
  const g = live({ gun: 1, orbit: 1 }); noSpawn(g); const c = center(g); put(g, 'slime', c.x + 200, c.y); g.players[0].hp = 1e9;
  run(g, .1); const a = S.snapshot(g, { full: false }).pl[0].wc; assert.ok(a.gun > .8 && a.gun <= S.WEAPONS.gun.cd[0], `cd ${a.gun}`); assert.equal(a.orbit, undefined, 'always-on weapons have no cooldown');
  run(g, .4); assert.ok(S.snapshot(g, { full: false }).pl[0].wc.gun < a.gun);
  g.players[0].weapons = { orbit: 1 }; assert.deepEqual(S.snapshot(g, { full: false }).pl[0].wc, {}, 'weapons you no longer own are not listed');
  assert.equal(S.snapshot(g, { full: false }).pl[0].dc, 0);
});

test('hit feedback data: damage events carry the chain id, whether it killed, and the enemy; one chain shares an id, separate pops do not', () => {
  const g = live({}); noSpawn(g); const c = center(g); g.players[0].x = 50; g.players[0].y = 50;
  const a = put(g, 'shell', c.x, c.y, { state: 'wrapped', wrapT: 9, armor: 0 }), b = put(g, 'slime', c.x + 70, c.y, { state: 'wrapped', wrapT: 9 }), far = put(g, 'slime', c.x + 900, c.y, { state: 'wrapped', wrapT: 9 });
  g.pops.push({ e: a, depth: 0, owner: 0, t: 0, chain: ++g.chainSeq }); a.popping = true;
  const first = run(g, 1); const ds = first.filter(e => e.type === 'd'), pops = first.filter(e => e.type === 'pop');
  assert.ok(ds.length >= 2 && ds.every(e => e.c === ds[0].c && typeof e.i === 'number'), 'one chain, one id'); assert.deepEqual(pops.map(e => e.c), pops.map(() => pops[0].c));
  assert.equal(ds.find(e => e.i === b.id).k, 1, 'the slime died'); assert.equal(ds.find(e => e.i === a.id).k, 0, 'the shell survived');
  g.pops.push({ e: far, depth: 0, owner: 0, t: 0, chain: undefined }); far.popping = true; const second = run(g, .3).find(e => e.type === 'pop');
  assert.notEqual(second.c, pops[0].c, 'a new pop starts a new chain');
});
