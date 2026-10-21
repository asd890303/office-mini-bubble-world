// 泡泡倖存者：純規則（敵人、武器、包泡與連鎖引爆、升級選擇、波次與王、名次），index.html（單人與畫面）和 worker.js（連線、伺服器判定）共用。
// 不碰 DOM / Math.random：亂數全部來自種子，同一組種子與輸入會重播出同樣結果。
// 座標單位是「點」，原點在左上角，x 往右、y 往下；場地 ARENA 是有牆的長方形。
export const MAX_PLAYERS = 4, MIN_PLAYERS = 2, RUN_TIME = 300, BOSS_AT = 250, PICK_TIME = 10, CHOICE_AUTO = 12, COUNTDOWN = 3, DT = 1 / 30;
export const POINTS = [5, 3, 2, 1];
export const COLORS = ['#ffb3c7', '#a8d8ff', '#ffe08a', '#a8e6cf', '#c9b6ff', '#ffc8a2', '#ff8a80', '#7fdbd0', '#8aa4ff', '#cfe88a', '#f29be0', '#c9a58a', '#ffffff', '#000000', '#ff0000'];
export const EARS = { be: '圓耳', pay: '長耳', fe: '尖耳', tool: '小芽', cat: '貓耳', bear: '熊耳', horn: '小角', bow: '蝴蝶結', ant: '觸角' };
export const EYES = { dot: '圓眼', big: '大眼', happy: '笑眼', sleepy: '瞇眼', sparkle: '閃亮', wink: '眨眼' };
export const BODIES = ['#fffdf7', '#ffe9d6', '#e8f4ff', '#eafbe7', '#f3e8ff', '#fff3b8', '#f2d9c4', '#d9dde3', '#ffffff', '#000000', '#ff0000'];
export const BLUSHES = ['#ffa3b5', '#ff7d7d', '#ffc27a', '#ffe27a', '#9fd8ff', '#c4a3ff', '#ffffff', '#000000', '#ff0000'];
export const ARENA = { W: 1800, H: 1200 };
export const VIEW = { W: 980, H: 560 }; // 畫面大約能看到的範圍，敵人在這個範圍外生成
export const PLAYER = { R: 16, HP: 100, SPEED: 165, INVULN: .7, LEVEL_HEAL: 15 };
export const DASH = { DIST: 170, TIME: .2, CD: 3.2, INVULN: .35 }; // 空白鍵：朝移動方向（沒按方向就朝面向）無敵衝刺一小段
export const MAX_ENEMIES = 120, MAX_SHARDS = 150, SLOTS = 6, PASSIVE_MAX = 3;
export const WRAP = { T: 4, DRIFT: 18 }; // 包泡預設持續秒數；被包住的敵人慢慢漂浮的速度
export const POP = { R: 55, DMG: 20, BONUS: 2, CHAIN_PAD: 30, CHAIN_DELAY: .1, DEPTH: .15, DEPTH_MAX: .75 }; // 戳破：範圍、傷害、對被包住的敵人傷害倍率、連鎖距離加成、連鎖延遲、每層連鎖加傷
export const ENEMIES = {
  slime: { name: '史萊姆', hp: 20, spd: 55, dmg: 8, r: 12, xp: 2 },
  swarm: { name: '小群', hp: 8, spd: 88, dmg: 5, r: 9, xp: 1 },
  shell: { name: '厚殼', hp: 60, spd: 40, dmg: 12, r: 16, xp: 4, armor: 1 }, // 第一次包泡只會打裂外殼，第二次才包得住
  shooter: { name: '射手', hp: 18, spd: 45, dmg: 6, r: 12, xp: 3, keep: 260, fire: 2.2 },
  boss: { name: '泡泡王', hp: 900, spd: 38, dmg: 20, r: 38, xp: 60 },
};
export const BOSS = { RING: 3.5, RING_N: 10, SUMMON: 9, SUMMON_N: 6, WRAP_MAX: 1.5, IMMUNE: 3, BONUS: 4 };
export const SHOT = { SPD: 170, DMG: 7, LIFE: 3 }; // 射手與王的子彈
export const WEAPONS = {
  gun: { name: '泡泡槍', desc: '朝最近的敵人射出泡泡', max: 5, cd: [1, .9, .8, .7, .6], n: [1, 1, 2, 2, 3], spd: 340, life: 1.1, r: 8 },
  orbit: { name: '環繞泡泡', desc: '泡泡繞著你轉，碰到的敵人被包住', max: 5, n: [2, 2, 3, 3, 4], radius: 70, spin: 2.4, r: 10, recheck: .5 },
  wave: { name: '水波', desc: '定時擴散一圈，範圍內的敵人全被包住', max: 5, cd: [6, 5.5, 5, 4.5, 4], radius: [110, 125, 140, 155, 170] },
  poke: { name: '戳針', desc: '自動戳破附近被包住的敵人，引爆連鎖', max: 5, cd: [1.6, 1.45, 1.3, 1.15, 1], n: [1, 1, 2, 2, 3], range: 320 },
  rain: { name: '泡泡雨', desc: '在敵人頭上降下泡泡區，稍後包住範圍內的敵人', max: 5, cd: [5, 4.5, 4, 3.6, 3.2], n: [1, 1, 2, 2, 3], radius: [70, 80, 90, 100, 110], delay: .6, reach: 300 },
  ball: { name: '磁吸球', desc: '把附近的敵人吸成一團，方便一次連鎖', max: 5, cd: [7, 6.5, 6, 5.5, 5], radius: [150, 165, 180, 195, 210], dur: [1.5, 1.8, 2.1, 2.4, 2.7], pull: 150, reach: 320 },
  needle: { name: '連環針', desc: '戳針進化：一次戳 5 隻，距離更遠', max: 1, cd: [.7], n: [5], range: 420, evolved: true },
  storm: { name: '暴風雨', desc: '泡泡雨進化：更大更密的泡泡區', max: 1, cd: [2.6], n: [4], radius: [120], delay: .5, reach: 340, evolved: true },
  pearl: { name: '連珠泡', desc: '泡泡槍進化：泡泡穿透 3 隻敵人', max: 1, cd: [.6], n: [3], spd: 380, life: 1.2, r: 8, pierce: 3, evolved: true },
  hole: { name: '黑洞泡泡', desc: '環繞泡泡進化：把附近敵人吸過來', max: 1, n: [4], radius: 85, spin: 2.8, r: 11, recheck: .4, pull: 170, pullSpd: 60, evolved: true },
};
export const STARTERS = ['gun', 'orbit', 'wave'];
export const BASE_WEAPONS = ['gun', 'orbit', 'wave', 'poke', 'rain', 'ball'];
export const EVOLVE = { gun: { need: 'chain', to: 'pearl' }, orbit: { need: 'magnet', to: 'hole' }, poke: { need: 'dur', to: 'needle' }, rain: { need: 'area', to: 'storm' } }; // 武器升滿 5 級且持有該被動，就能進化
export const PASSIVES = {
  area: { name: '包泡範圍', desc: '戳破、水波與環繞泡泡的範圍 +15%' },
  dur: { name: '包泡時間', desc: '被包住的時間 +25%' },
  chain: { name: '連鎖距離', desc: '連鎖的觸發距離 +25' },
  speed: { name: '輕盈', desc: '移動速度 +10%' },
  magnet: { name: '碎片磁吸', desc: '撿碎片的距離 +40' },
  dash: { name: '衝刺冷卻', desc: '衝刺冷卻縮短 0.5 秒' },
  vital: { name: '生命上限', desc: '生命上限 +20%' },
  greed: { name: '碎片加成', desc: '碎片經驗 +20%' },
};
export const WAVE = { LEN: 50, COUNT: 6, BASE: 1.9, STEP: .65, PER_PLAYER: .55, HP_STEP: .2, SPEED_STEP: .11, SPAWN_EVERY: .5 };
const MIX = [{ swarm: 0, shell: 0, shooter: 0 }, { swarm: .3, shell: 0, shooter: 0 }, { swarm: .3, shell: .15, shooter: 0 }, { swarm: .25, shell: .2, shooter: .15 }, { swarm: .3, shell: .2, shooter: .2 }, { swarm: .3, shell: .25, shooter: .25 }]; // 各波敵人組成，其餘都是史萊姆
export const xpNeed = lv => 10 + 9 * lv;

export function rngFrom(seed) { // mulberry32
  let a = (seed >>> 0) || 1;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export const hashSeed = s => { let h = 2166136261; for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v)), r1 = v => Math.round(v * 10) / 10;
const lvl = (p, k) => p.passives[k] || 0;
// 玩家目前的數值（被動加成）
export const stats = p => ({ area: 1 + .15 * lvl(p, 'area'), dur: WRAP.T * (1 + .25 * lvl(p, 'dur')), chain: 25 * lvl(p, 'chain'), speed: PLAYER.SPEED * (1 + .1 * lvl(p, 'speed')), magnet: 40 * lvl(p, 'magnet'), maxHp: Math.round(PLAYER.HP * (1 + .2 * lvl(p, 'vital'))), dashCd: Math.max(1.2, DASH.CD - .5 * lvl(p, 'dash')), xp: 1 + .2 * lvl(p, 'greed') });

// 理論上限：開跑 t 秒內最多生成幾隻敵人（含王的召喚），單人紀錄驗證用
export function maxKills(t, players = 1) {
  let n = 0;
  for (let s = 0; s < t; s++) n += (WAVE.BASE + WAVE.STEP * Math.min(WAVE.COUNT - 1, Math.floor(s / WAVE.LEN))) * (1 + WAVE.PER_PLAYER * (players - 1)) * 1.3;
  return Math.ceil(n + 1 + (t > BOSS_AT ? 1 + Math.floor((t - BOSS_AT) / BOSS.SUMMON) * BOSS.SUMMON_N : 0)) + 20;
}

/* ---------- 對局 ---------- */
// humans：[{ uid, name, color, ear, eye, body, blush }]；solo：單人，選擇升級時暫停
export function createGame({ seed = 1, humans = [], solo = false } = {}) {
  const ps = humans.slice(0, MAX_PLAYERS).map((h, id) => ({
    id, uid: h.uid ?? null, human: h.uid != null, bot: false, name: h.name || `玩家${id + 1}`,
    look: { color: h.color || null, ear: h.ear || null, eye: h.eye || null, body: h.body || null, blush: h.blush || null },
    x: ARENA.W / 2 + (id - (humans.length - 1) / 2) * 60, y: ARENA.H / 2, ix: 0, iy: 0, face: 0, hp: PLAYER.HP, alive: true, invuln: 0,
    level: 1, xp: 0, weapons: {}, passives: {}, queue: 0, choices: null, rerolls: 1, choiceT: 0, cds: {}, orbit: 0, dashT: 0, dashCd: 0, dx: 1, dy: 0,
    kills: 0, damage: 0, diedT: null,
  }));
  const g = { seed, solo, players: ps, rng: rngFrom(hashSeed(`surv:${seed}`)), phase: 'pick', t: 0, run: 0, acc: 0, over: false, result: null, cleared: false, events: [], nextId: 1,
    enemies: [], bullets: [], ebullets: [], shards: [], pops: [], budget: 0, spawnT: 0, boss: null, bossSpawned: false, zones: [], chainSeq: 0 };
  for (const p of ps) p.choices = starterChoices();
  return g;
}
const starterChoices = () => STARTERS.map(id => ({ kind: 'weapon', id, lv: 1 }));

const alivePlayers = g => g.players.filter(p => p.alive);
const nearest = (list, x, y) => { let b = null, bd = Infinity; for (const o of list) { const d = (o.x - x) ** 2 + (o.y - y) ** 2; if (d < bd) { bd = d; b = o; } } return b; };

/* ---------- 升級選擇 ---------- */
const shuffle = (a, rng) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
export function makeChoices(g, p) {
  const pool = [], evo = [];
  for (const [id, l] of Object.entries(p.weapons)) {
    if (l < WEAPONS[id].max) pool.push({ kind: 'weapon', id, lv: l + 1 });
    const e = EVOLVE[id]; if (e && l >= WEAPONS[id].max && lvl(p, e.need) >= 1) evo.push({ kind: 'evolve', id, to: e.to });
  }
  if (Object.keys(p.weapons).length < SLOTS) for (const id of BASE_WEAPONS) if (!p.weapons[id] && !(EVOLVE[id] && p.weapons[EVOLVE[id].to])) pool.push({ kind: 'weapon', id, lv: 1 });
  for (const [id, l] of Object.entries(p.passives)) if (l < PASSIVE_MAX) pool.push({ kind: 'passive', id, lv: l + 1 });
  if (Object.keys(p.passives).length < SLOTS) for (const id of Object.keys(PASSIVES)) if (!p.passives[id]) pool.push({ kind: 'passive', id, lv: 1 });
  const out = [...evo.slice(0, 1), ...shuffle(pool, g.rng)].slice(0, 3);
  return out.length ? out : [{ kind: 'heal' }];
}
function applyChoice(g, p, c) {
  if (c.kind === 'weapon') p.weapons[c.id] = c.lv;
  else if (c.kind === 'passive') { p.passives[c.id] = c.lv; if (c.id === 'vital') p.hp += Math.round(PLAYER.HP * .2); }
  else if (c.kind === 'evolve') { delete p.weapons[c.id]; p.weapons[c.to] = 1; p.cds = {}; }
  else if (c.kind === 'heal') p.hp = Math.min(stats(p).maxHp, p.hp + 30);
  p.choices = null; p.choiceT = 0;
  if (p.queue > 0) { p.queue--; p.choices = makeChoices(g, p); p.rerolls = 1; }
}
export function pick(g, id, i) {
  const p = g.players[id]; if (!p || !p.choices || !p.alive) return false;
  const c = p.choices[i]; if (!c) return false;
  applyChoice(g, p, c); return true;
}
export function reroll(g, id) {
  const p = g.players[id]; if (!p || !p.choices || p.rerolls < 1 || !p.alive || g.phase === 'pick') return false;
  p.rerolls--; p.choices = makeChoices(g, p); return true;
}
export function setInput(g, id, { x = 0, y = 0 } = {}) {
  const p = g.players[id]; if (!p || !p.alive) return;
  x = Number(x) || 0; y = Number(y) || 0; const m = Math.hypot(x, y); if (m > 1) { x /= m; y /= m; }
  p.ix = x; p.iy = y;
}

// 衝刺：朝目前的移動方向（x、y 是客戶端送來的方向，沒有就用最後的輸入，再沒有就朝面向）衝 DASH.DIST 點，期間無敵
export function dash(g, id, dir = {}) {
  const p = g.players[id]; if (!p || !p.alive || g.phase !== 'running' || p.dashCd > 0 || p.dashT > 0) return false;
  const gx = Number(dir.x) || 0, gy = Number(dir.y) || 0; let x = gx || gy ? gx : p.ix, y = gx || gy ? gy : p.iy; const m = Math.hypot(x, y);
  if (!m) { x = Math.cos(p.face); y = Math.sin(p.face); } else { x /= m; y /= m; }
  p.dx = x; p.dy = y; p.dashT = DASH.TIME; p.dashCd = stats(p).dashCd; p.invuln = Math.max(p.invuln, DASH.INVULN); p.face = Math.atan2(y, x);
  g.events.push({ type: 'dash', id, x: r1(p.x), y: r1(p.y), dx: r1(x), dy: r1(y) });
  return true;
}

/* ---------- 包泡與戳破 ---------- */
function wrapEnemy(g, e, p) {
  if (e.state === 'wrapped' || e.popping) return false;
  if (e.armor > 0) { e.armor--; g.events.push({ type: 'crack', x: r1(e.x), y: r1(e.y) }); return false; }
  const s = stats(p);
  if (e.type === 'boss') { if (g.run < e.immune) return false; e.wrapT = Math.min(BOSS.WRAP_MAX, s.dur * .4); }
  else e.wrapT = s.dur;
  e.state = 'wrapped'; e.owner = p.id;
  const a = g.rng() * Math.PI * 2; e.dx = Math.cos(a) * WRAP.DRIFT; e.dy = Math.sin(a) * WRAP.DRIFT;
  g.events.push({ type: 'wrap', x: r1(e.x), y: r1(e.y) });
  return true;
}
function schedulePop(g, e, depth, owner, delay, chain) {
  if (e.popping) return; e.popping = true;
  g.pops.push({ e, depth, owner, t: delay, chain: chain ?? ++g.chainSeq }); // chain：同一串連鎖共用的編號，畫面用它合計傷害
}
function killEnemy(g, e, owner) {
  e.dead = true;
  const p = g.players[owner]; if (p) p.kills++;
  if (e.type === 'boss') { g.cleared = true; g.boss = null; }
  g.shards.push({ x: e.x, y: e.y, v: ENEMIES[e.type].xp });
  if (g.shards.length > MAX_SHARDS) { const a = g.shards.shift(), b = g.shards[0]; if (b) b.v += a.v; }
}
function explode(g, pop) {
  const { e, depth, owner } = pop, p = g.players[owner]; if (e.dead) return;
  const s = stats(p), R = POP.R * s.area, chainR = R + POP.CHAIN_PAD + s.chain, mult = 1 + Math.min(POP.DEPTH_MAX, POP.DEPTH * depth), dmg = POP.DMG * mult;
  g.events.push({ type: 'pop', x: r1(e.x), y: r1(e.y), r: Math.round(R), d: depth, c: pop.chain });
  const self = dmg * (e.type === 'boss' ? BOSS.BONUS : POP.BONUS); e.hp -= self; p.damage += Math.min(self, e.hp + self);
  g.events.push({ type: 'd', x: r1(e.x), y: r1(e.y), v: Math.round(self), d: depth, c: pop.chain, k: e.hp <= 0 ? 1 : 0, i: e.id });
  if (e.hp <= 0) killEnemy(g, e, owner); else { e.state = 'free'; e.wrapT = 0; e.popping = false; if (e.type === 'boss') e.immune = g.run + BOSS.IMMUNE; }
  for (const o of g.enemies) {
    if (o === e || o.dead || o.popping) continue;
    const d = Math.hypot(o.x - e.x, o.y - e.y);
    if (o.state === 'wrapped' && d <= chainR + o.r) schedulePop(g, o, depth + 1, owner, POP.CHAIN_DELAY, pop.chain);
    else if (d <= R + o.r) { o.hp -= dmg; p.damage += Math.min(dmg, o.hp + dmg); g.events.push({ type: 'd', x: r1(o.x), y: r1(o.y), v: Math.round(dmg), d: 0, c: pop.chain, k: o.hp <= 0 ? 1 : 0, i: o.id }); if (o.hp <= 0) killEnemy(g, o, owner); }
  }
  e.popping = false;
}

/* ---------- 每格推進 ---------- */
function startRun(g) { g.phase = 'countdown'; g.t = 0; g.events.push({ type: 'start' }); }
function levelUp(g, p) {
  while (p.xp >= xpNeed(p.level)) {
    p.xp -= xpNeed(p.level); p.level++; p.hp = Math.min(stats(p).maxHp, p.hp + PLAYER.LEVEL_HEAL);
    g.events.push({ type: 'level', id: p.id, level: p.level });
    if (p.choices) p.queue++; else { p.choices = makeChoices(g, p); p.rerolls = 1; }
  }
}
function movePlayers(g, dt) {
  for (const p of alivePlayers(g)) {
    const sp = stats(p).speed;
    p.dashCd = Math.max(0, p.dashCd - dt);
    if (p.dashT > 1e-9) { const step = Math.min(dt, p.dashT), k = DASH.DIST / DASH.TIME * step; p.x = clamp(p.x + p.dx * k, PLAYER.R, ARENA.W - PLAYER.R); p.y = clamp(p.y + p.dy * k, PLAYER.R, ARENA.H - PLAYER.R); p.dashT = p.dashT - step < 1e-9 ? 0 : p.dashT - step; }
    else { p.x = clamp(p.x + p.ix * sp * dt, PLAYER.R, ARENA.W - PLAYER.R); p.y = clamp(p.y + p.iy * sp * dt, PLAYER.R, ARENA.H - PLAYER.R); }
    if (p.ix || p.iy) p.face = Math.atan2(p.iy, p.ix);
    p.invuln = Math.max(0, p.invuln - dt);
    for (let i = g.shards.length - 1; i >= 0; i--) {
      const sh = g.shards[i], d = Math.hypot(sh.x - p.x, sh.y - p.y), R = 40 + stats(p).magnet;
      if (d < PLAYER.R + 6) { p.xp += sh.v * stats(p).xp; g.shards.splice(i, 1); levelUp(g, p); }
      else if (d < R * 1.6) { const k = 260 * dt / Math.max(1, d); sh.x += (p.x - sh.x) * k; sh.y += (p.y - sh.y) * k; }
    }
  }
}
function fireWeapons(g, p, dt) {
  const free = g.enemies.filter(e => !e.dead && e.state === 'free');
  p.orbit += dt;
  for (const [id, l] of Object.entries(p.weapons)) {
    const w = WEAPONS[id], i = l - 1, s = stats(p);
    if (id === 'orbit' || id === 'hole') {
      const n = w.n[i], R = w.radius * s.area;
      for (let k = 0; k < n; k++) {
        const a = p.orbit * w.spin + k * Math.PI * 2 / n, bx = p.x + Math.cos(a) * R, by = p.y + Math.sin(a) * R;
        for (const e of free) if (e.state === 'free' && !(e.orbitCd > g.run) && Math.hypot(e.x - bx, e.y - by) <= w.r + e.r) { e.orbitCd = g.run + w.recheck; wrapEnemy(g, e, p); }
      }
      if (id === 'hole') for (const e of free) { const d = Math.hypot(p.x - e.x, p.y - e.y); if (e.state === 'free' && e.type !== 'boss' && d < w.pull && d > 1) { e.x += (p.x - e.x) / d * w.pullSpd * dt; e.y += (p.y - e.y) / d * w.pullSpd * dt; } }
      continue;
    }
    p.cds[id] = (p.cds[id] ?? 0) - dt; if (p.cds[id] > 0) continue;
    if (id === 'gun' || id === 'pearl') {
      const t = nearest(free, p.x, p.y); if (!t) { p.cds[id] = .1; continue; }
      p.cds[id] = w.cd[i]; const base = Math.atan2(t.y - p.y, t.x - p.x), n = w.n[i];
      for (let k = 0; k < n; k++) { const a = base + (k - (n - 1) / 2) * .22; g.bullets.push({ x: p.x, y: p.y, vx: Math.cos(a) * w.spd, vy: Math.sin(a) * w.spd, life: w.life, owner: p.id, pierce: w.pierce || 1, hit: new Set() }); }
    } else if (id === 'wave') {
      if (!free.length) { p.cds[id] = .2; continue; }
      p.cds[id] = w.cd[i]; const R = w.radius[i] * s.area; g.events.push({ type: 'wave', id: p.id, x: r1(p.x), y: r1(p.y), r: Math.round(R) });
      for (const e of free) if (Math.hypot(e.x - p.x, e.y - p.y) <= R + e.r) wrapEnemy(g, e, p);
    } else if (id === 'poke' || id === 'needle') {
      const wrapped = g.enemies.filter(e => !e.dead && e.state === 'wrapped' && !e.popping && Math.hypot(e.x - p.x, e.y - p.y) <= w.range);
      if (!wrapped.length) { p.cds[id] = .2; continue; }
      p.cds[id] = w.cd[i];
      for (let k = 0; k < w.n[i] && wrapped.length; k++) { const t = nearest(wrapped, p.x, p.y); wrapped.splice(wrapped.indexOf(t), 1); g.events.push({ type: 'poke', id: p.id, x: r1(p.x), y: r1(p.y), tx: r1(t.x), ty: r1(t.y) }); schedulePop(g, t, 0, p.id, 0); }
    } else if (id === 'rain' || id === 'storm') {
      const near = free.filter(e => Math.hypot(e.x - p.x, e.y - p.y) <= w.reach);
      if (!near.length) { p.cds[id] = .3; continue; }
      p.cds[id] = w.cd[i]; const R = w.radius[i] * s.area;
      for (let k = 0; k < w.n[i]; k++) { const t = near[Math.floor(g.rng() * near.length)]; g.zones.push({ kind: 'rain', x: t.x, y: t.y, r: R, t: w.delay, owner: p.id }); g.events.push({ type: 'zone', kind: 'rain', x: r1(t.x), y: r1(t.y), r: Math.round(R), t: w.delay }); }
    } else if (id === 'ball') {
      const t = nearest(free.filter(e => e.type !== 'boss' && Math.hypot(e.x - p.x, e.y - p.y) <= w.reach), p.x, p.y);
      if (!t) { p.cds[id] = .3; continue; }
      p.cds[id] = w.cd[i]; const R = w.radius[i] * s.area, dur = w.dur[i];
      g.zones.push({ kind: 'pull', x: t.x, y: t.y, r: R, t: dur, pull: w.pull, owner: p.id }); g.events.push({ type: 'zone', kind: 'pull', x: r1(t.x), y: r1(t.y), r: Math.round(R), t: dur });
    }
  }
}
function runZones(g, dt) {
  for (let i = g.zones.length - 1; i >= 0; i--) {
    const z = g.zones[i]; z.t -= dt;
    if (z.kind === 'pull') for (const e of g.enemies) { if (e.dead || e.state !== 'free' || e.type === 'boss') continue; const d = Math.hypot(z.x - e.x, z.y - e.y); if (d < z.r && d > 4) { e.x += (z.x - e.x) / d * z.pull * dt; e.y += (z.y - e.y) / d * z.pull * dt; } }
    if (z.t > 0) continue;
    g.zones.splice(i, 1);
    if (z.kind === 'rain') { const p = g.players[z.owner]; for (const e of g.enemies) if (!e.dead && e.state === 'free' && Math.hypot(z.x - e.x, z.y - e.y) <= z.r + e.r) wrapEnemy(g, e, p); }
  }
}
function moveBullets(g, dt) {
  for (const b of g.bullets) {
    b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
    const p = g.players[b.owner];
    for (const e of g.enemies) {
      if (e.dead || e.state !== 'free' || b.hit.has(e) || b.pierce <= 0) continue;
      if (Math.hypot(e.x - b.x, e.y - b.y) <= e.r + 8) { b.hit.add(e); b.pierce--; wrapEnemy(g, e, p); }
    }
    if (b.pierce <= 0 || b.x < 0 || b.y < 0 || b.x > ARENA.W || b.y > ARENA.H) b.life = 0;
  }
  g.bullets = g.bullets.filter(b => b.life > 0);
  for (const b of g.ebullets) {
    b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
    for (const p of alivePlayers(g)) if (b.life > 0 && p.invuln <= 0 && Math.hypot(p.x - b.x, p.y - b.y) <= PLAYER.R + 5) { hurt(g, p, b.dmg); b.life = 0; }
  }
  g.ebullets = g.ebullets.filter(b => b.life > 0 && b.x > -20 && b.y > -20 && b.x < ARENA.W + 20 && b.y < ARENA.H + 20);
}
function hurt(g, p, dmg) {
  p.hp -= dmg; p.invuln = PLAYER.INVULN; g.events.push({ type: 'hurt', id: p.id, v: Math.round(dmg) });
  if (p.hp <= 0) { p.hp = 0; p.alive = false; p.diedT = g.run; g.events.push({ type: 'out', id: p.id }); }
}
function fireRing(g, e, n) { const a0 = g.rng() * Math.PI * 2; for (let k = 0; k < n; k++) { const a = a0 + k * Math.PI * 2 / n; g.ebullets.push({ x: e.x, y: e.y, vx: Math.cos(a) * SHOT.SPD * .8, vy: Math.sin(a) * SHOT.SPD * .8, life: SHOT.LIFE + 1, dmg: SHOT.DMG + 1 }); } }
function moveEnemies(g, dt) {
  const alive = alivePlayers(g), speedMul = 1 + WAVE.SPEED_STEP * Math.min(WAVE.COUNT - 1, Math.floor(g.run / WAVE.LEN));
  for (const e of g.enemies) {
    if (e.dead) continue;
    const def = ENEMIES[e.type];
    if (e.state === 'wrapped') {
      e.x = clamp(e.x + e.dx * dt, 0, ARENA.W); e.y = clamp(e.y + e.dy * dt, 0, ARENA.H); e.wrapT -= dt;
      if (e.wrapT <= 0 && !e.popping) { e.state = 'free'; if (e.type === 'boss') e.immune = g.run + BOSS.IMMUNE; g.events.push({ type: 'free', x: r1(e.x), y: r1(e.y) }); }
      continue;
    }
    const t = nearest(alive, e.x, e.y); if (!t) continue;
    const dx = t.x - e.x, dy = t.y - e.y, d = Math.hypot(dx, dy) || 1;
    let mv = 1;
    if (e.type === 'shooter') { if (d < def.keep - 40) mv = -.7; else if (d < def.keep + 20) mv = 0; e.fireT -= dt; if (e.fireT <= 0 && d < 460) { e.fireT = def.fire; g.ebullets.push({ x: e.x, y: e.y, vx: dx / d * SHOT.SPD, vy: dy / d * SHOT.SPD, life: SHOT.LIFE, dmg: SHOT.DMG }); } }
    if (e.type === 'boss') {
      e.ringT -= dt; if (e.ringT <= 0) { e.ringT = BOSS.RING; fireRing(g, e, BOSS.RING_N); g.events.push({ type: 'ring' }); }
      e.sumT -= dt; if (e.sumT <= 0) { e.sumT = BOSS.SUMMON; for (let k = 0; k < BOSS.SUMMON_N; k++) spawn(g, 'swarm', e.x + (g.rng() - .5) * 120, e.y + (g.rng() - .5) * 120); }
    }
    const sp = def.spd * (e.type === 'boss' ? 1 : speedMul);
    e.x = clamp(e.x + dx / d * sp * mv * dt, 0, ARENA.W); e.y = clamp(e.y + dy / d * sp * mv * dt, 0, ARENA.H);
    for (const p of alive) if (p.invuln <= 0 && Math.hypot(p.x - e.x, p.y - e.y) <= PLAYER.R + e.r - 2) hurt(g, p, def.dmg);
  }
  for (let i = 0; i < g.enemies.length; i++) { // 敵人之間輕輕推開，避免疊成一點
    const a = g.enemies[i]; if (a.dead || a.state !== 'free') continue;
    for (let j = i + 1; j < g.enemies.length; j++) {
      const b = g.enemies[j]; if (b.dead || b.state !== 'free') continue;
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy), m = a.r + b.r;
      if (d > 0 && d < m) { const k = (m - d) / 2 * Math.min(1, dt * 8) / d; a.x -= dx * k; a.y -= dy * k; b.x += dx * k; b.y += dy * k; }
    }
  }
  for (const p of alive) for (const e of g.enemies) if (!e.dead && e.state === 'wrapped' && !e.popping && Math.hypot(p.x - e.x, p.y - e.y) <= PLAYER.R + e.r) schedulePop(g, e, 0, p.id, 0);
}
function spawn(g, type, x, y) {
  if (g.enemies.length >= MAX_ENEMIES && type !== 'boss') return null;
  const def = ENEMIES[type], w = Math.min(WAVE.COUNT - 1, Math.floor(g.run / WAVE.LEN)), n = g.players.length;
  const hp = def.hp * (type === 'boss' ? 1 + .5 * (n - 1) : 1 + WAVE.HP_STEP * w + .1 * (n - 1));
  const e = { id: g.nextId++, type, x: clamp(x, 0, ARENA.W), y: clamp(y, 0, ARENA.H), hp, hpMax: hp, r: def.r, state: 'free', wrapT: 0, dx: 0, dy: 0, armor: def.armor || 0, owner: 0, popping: false, dead: false, fireT: def.fire ? 1 + g.rng() * def.fire : 0, ringT: BOSS.RING, sumT: BOSS.SUMMON, immune: 0, orbitCd: 0 };
  g.enemies.push(e); return e;
}
function spawnRing(g, type, cx, cy) {
  const a = g.rng() * Math.PI * 2, d = Math.hypot(VIEW.W, VIEW.H) / 2 + 40 + g.rng() * 80;
  return spawn(g, type, cx + Math.cos(a) * d, cy + Math.sin(a) * d);
}
function spawnTick(g, dt) {
  const alive = alivePlayers(g), w = Math.min(WAVE.COUNT - 1, Math.floor(g.run / WAVE.LEN)); if (!alive.length) return;
  if (!g.bossSpawned && g.run >= BOSS_AT) { g.bossSpawned = true; const c = alive[0]; g.boss = spawnRing(g, 'boss', c.x, c.y); g.events.push({ type: 'boss' }); }
  g.budget += (WAVE.BASE + WAVE.STEP * w) * (1 + WAVE.PER_PLAYER * (alive.length - 1)) * (g.bossSpawned ? .5 : 1) * dt;
  g.spawnT -= dt; if (g.spawnT > 0) return; g.spawnT = WAVE.SPAWN_EVERY;
  while (g.budget >= 1) {
    const c = alive[Math.floor(g.rng() * alive.length)], mix = MIX[w], r = g.rng();
    let type = 'slime'; if (r < mix.shell) type = 'shell'; else if (r < mix.shell + mix.shooter) type = 'shooter'; else if (r < mix.shell + mix.shooter + mix.swarm) type = 'swarm';
    if (type === 'swarm') { const n = Math.min(5, Math.floor(g.budget)); const a = g.rng() * Math.PI * 2, d = Math.hypot(VIEW.W, VIEW.H) / 2 + 60; for (let k = 0; k < n; k++) spawn(g, 'swarm', c.x + Math.cos(a) * d + (g.rng() - .5) * 50, c.y + Math.sin(a) * d + (g.rng() - .5) * 50); g.budget -= n; }
    else { spawnRing(g, type, c.x, c.y); g.budget -= 1; }
    if (g.enemies.length >= MAX_ENEMIES) { g.budget = Math.min(g.budget, 1); break; }
  }
}
function runTick(g, dt) {
  g.run += dt;
  movePlayers(g, dt);
  for (const p of alivePlayers(g)) fireWeapons(g, p, dt);
  runZones(g, dt);
  moveBullets(g, dt);
  moveEnemies(g, dt);
  for (let i = g.pops.length - 1; i >= 0; i--) { const pp = g.pops[i]; pp.t -= dt; if (pp.t <= 0) { g.pops.splice(i, 1); explode(g, pp); } }
  g.enemies = g.enemies.filter(e => !e.dead);
  spawnTick(g, dt);
  if (!alivePlayers(g).length) finish(g, false);
  else if (g.cleared || g.run >= RUN_TIME) finish(g, true);
}
function choiceTimers(g, dt) {
  for (const p of g.players) if (p.alive && p.choices && !g.solo) { p.choiceT += dt; if (p.choiceT >= CHOICE_AUTO) pick(g, p.id, Math.floor(g.rng() * p.choices.length)); }
}

function finish(g, cleared) {
  for (const p of g.players) if (p.alive && p.diedT == null) p.diedT = g.run;
  g.cleared = cleared; g.over = true; g.phase = 'over';
  g.result = { players: ranking(g), winner: null, cleared, duration: Math.round(g.run), reason: cleared ? (g.bossSpawned && !g.enemies.some(e => e.type === 'boss') ? 'boss' : 'time') : 'down' };
}
export const contribution = p => Math.round(p.damage + 20 * p.kills);
export function ranking(g) {
  const sorted = [...g.players].sort((a, b) => contribution(b) - contribution(a) || a.id - b.id);
  let rank = 0;
  return sorted.map((p, i) => { if (i === 0 || contribution(p) !== contribution(sorted[i - 1])) rank = i + 1; return { rank, id: p.id, uid: p.uid, name: p.name, bot: false, score: contribution(p), kills: p.kills, damage: Math.round(p.damage), level: p.level, time: Math.round((p.diedT ?? g.run) * 100) / 100, points: POINTS[rank - 1] ?? 0, down: p.hp <= 0 }; });
}
// 斷線超過寬限期：當場倒下
export function forfeit(g, id) { const p = g.players[id]; if (p?.alive && g.phase === 'running') { p.hp = 0; p.alive = false; p.diedT = g.run; g.events.push({ type: 'out', id }); if (!alivePlayers(g).length) finish(g, false); } }

// 推進 dt 秒；回傳這段時間發生的事件
export function step(g, dt) {
  g.events = [];
  if (g.over) return g.events;
  g.acc += dt;
  while (g.acc >= DT - 1e-9 && !g.over) {
    g.acc -= DT;
    if (g.phase === 'pick') {
      g.t += DT;
      if (!g.solo) for (const p of g.players) if (p.choices && g.t >= PICK_TIME) pick(g, p.id, Math.floor(g.rng() * p.choices.length));
      if (g.players.every(p => !p.alive || !p.choices)) startRun(g);
    } else if (g.phase === 'countdown') { g.t += DT; if (g.t >= COUNTDOWN - 1e-9) { g.phase = 'running'; g.events.push({ type: 'go' }); } }
    else if (g.phase === 'running') {
      if (g.solo && g.players.some(p => p.alive && p.choices)) continue;
      choiceTimers(g, DT); runTick(g, DT);
    }
  }
  if (g.over) g.events.push({ type: 'end', result: g.result });
  return g.events;
}

// full：開局與晚加入的人需要種子、名字與外觀；之後每格只送會變的欄位（敵人、子彈、碎片用陣列，省流量）
export function snapshot(g, { full = true } = {}) {
  const q = Math.round;
  const o = {
    phase: g.phase, over: g.over, t: r1(g.t), run: r1(g.run), solo: g.solo ? 1 : 0, cleared: g.cleared ? 1 : 0,
    pl: g.players.map(p => ({ id: p.id, x: q(p.x), y: q(p.y), f: r1(p.face), hp: q(p.hp), mh: stats(p).maxHp, dc: r1(p.dashCd), ds: p.dashT > 0 ? 1 : 0, wc: Object.fromEntries(Object.entries(p.cds).filter(([id]) => p.weapons[id]).map(([id, v]) => [id, r1(Math.max(0, v))])), a: p.alive ? 1 : 0, lv: p.level, xp: q(p.xp), need: xpNeed(p.level), w: p.weapons, ps: p.passives, ch: p.choices, rr: p.rerolls, k: p.kills, dm: q(p.damage), q: p.queue })),
    en: g.enemies.map(e => [e.id, e.type, q(e.x), q(e.y), e.state === 'wrapped' ? 1 : 0, Math.max(1, q(e.hp / e.hpMax * 100)), e.armor ? 1 : 0]),
    b: g.bullets.map(b => [q(b.x), q(b.y), q(b.vx), q(b.vy)]), eb: g.ebullets.map(b => [q(b.x), q(b.y), q(b.vx), q(b.vy)]), sh: g.shards.map(s => [q(s.x), q(s.y)]),
    boss: g.boss ? { hp: q(g.boss.hp), max: q(g.boss.hpMax) } : null,
  };
  if (full) { o.seed = g.seed; g.players.forEach((p, i) => Object.assign(o.pl[i], { name: p.name, uid: p.uid, look: p.look })); }
  return o;
}
