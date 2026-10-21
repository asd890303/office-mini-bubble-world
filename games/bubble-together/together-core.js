// 泡泡Together：純規則（橫向捲軸物理、疊羅漢與抱丟、隨機關卡與區段、放置階段、共享生命），index.html（單人與畫面）和 worker.js（連線、伺服器判定）共用。
// 不碰 DOM / Math.random：亂數全部來自種子，同一組種子與輸入會重播出同樣結果。
// 座標單位是「格」，x 往右、y 往上；玩家是 0.8 寬 1 高的方塊，座標 (x, y) 是腳底中心。
export const MIN_PLAYERS = 1, MAX_PLAYERS = 4, PLACE_TIME = 20, COUNTDOWN = 3, RUN_LIMIT = 360, LIVES = 5, DT = 1 / 30;
export const PW = .8, PH = 1, GRAV = 32, MOVE = 6.5, JUMP_V = 12.5, THROW_VX = 12, THROW_VY = 11, SPRING_V = 19, CARRY_SLOW = .85, REACH = 1.2;
export const JUMP_H = JUMP_V * JUMP_V / (2 * GRAV), SOLO_RANGE = 2 * JUMP_V / GRAV * MOVE; // 單人跳高與水平跳遠；疊羅漢的跳高再加一個身高
export const STACK_H = JUMP_H + PH, THROW_RANGE = 2 * THROW_VY / GRAV * THROW_VX;
export const WALL_H = [2.8, 3.1], GAP_W = [6.2, 7.2], SPRING_GAP = [5.8, 6.3], DOOR_HOLD = 4, PIT_Y = -5; // 高牆與寬溝的尺寸範圍：單人過不去，兩人合作過得去；彈簧寬溝比單人跳遠還寬，但踩彈簧就過得去；限時門在離開壓力板後還會開 DOOR_HOLD 秒
export const COOP_KINDS = ['plate', 'wall', 'gap'], SOLO_KINDS = ['timer', 'springGap', 'stairs', 'bridge']; // 一定要合作的區段；一個人就能解的謎題
export const TYPES = ['run', 'rush', 'climb'], MODS = ['none', 'ice', 'dark'];
export const BLOCKS = { plat: { name: '平台', w: 4, h: .4 }, spring: { name: '彈簧', w: 1.2, h: .5 }, life: { name: '生命泡泡', w: .9, h: .9 } };
export const CHASE = { rush: { speed: .5, start: -12 }, climb: { speed: .32, start: -8 } };
export const POINTS = { win: 5, win2: 3, lose: 1 };
export const COLORS = ['#ffb3c7', '#a8d8ff', '#ffe08a', '#a8e6cf', '#c9b6ff', '#ffc8a2', '#ff8a80', '#7fdbd0', '#8aa4ff', '#cfe88a', '#f29be0', '#c9a58a', '#ffffff', '#000000', '#ff0000'];
export const EARS = { be: '圓耳', pay: '長耳', fe: '尖耳', tool: '小芽', cat: '貓耳', bear: '熊耳', horn: '小角', bow: '蝴蝶結', ant: '觸角' };
export const EYES = { dot: '圓眼', big: '大眼', happy: '笑眼', sleepy: '瞇眼', sparkle: '閃亮', wink: '眨眼' };
export const BODIES = ['#fffdf7', '#ffe9d6', '#e8f4ff', '#eafbe7', '#f3e8ff', '#fff3b8', '#f2d9c4', '#d9dde3', '#ffffff', '#000000', '#ff0000'];
export const BLUSHES = ['#ffa3b5', '#ff7d7d', '#ffc27a', '#ffe27a', '#9fd8ff', '#c4a3ff', '#ffffff', '#000000', '#ff0000'];

export function rngFrom(seed) { // mulberry32
  let a = (seed >>> 0) || 1;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export const hashSeed = s => { let h = 2166136261; for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };
const r1 = v => Math.round(v * 10) / 10, r2 = v => Math.round(v * 100) / 100;
const pick = (rng, a) => a[Math.floor(rng() * a.length)], between = (rng, [a, b]) => a + rng() * (b - a);

/* ---------- 隨機關卡 ---------- */
// 回傳：solids（固定）、hidden（碰到旗子或踩板才出現的梯子與橋）、plates + doors（壓力板門）、springs（固定彈簧）、flags（檢查點，touch 後解鎖 hidden）、chaser
// solo 為 true（只有一位玩家）時只抽一個人能解的區段；多人時第一個謎題一定是要合作的，其餘混著抽
export function genLevel(seed, type = null, mod = null, solo = false) {
  const rng = rngFrom(hashSeed(`together:${seed}`));
  type = type || pick(rng, TYPES); mod = mod || pick(rng, MODS);
  const L = { seed, type, mod, solids: [], hidden: [], plates: [], doors: [], springs: [], solo, flags: [], segs: [], spawn: { x: 2, y: 0 }, goal: null, chaser: CHASE[type] ? { kind: type === 'climb' ? 'flood' : 'wall', speed: CHASE[type].speed, start: CHASE[type].start } : null };
  let x = 0, y = 0; const solid = (x0, y0, w, h) => { const s = { x: r2(x0), y: r2(y0), w: r2(w), h: r2(h) }; L.solids.push(s); return s; };
  const ground = (x0, w, top) => solid(x0, top - 12, w, 12); // 地面是往下延伸的厚塊，頂面在 top
  ground(x, 8, y); x += 8; L.flags.push({ x: 4, y, seg: 0, reveals: [] });
  const n = 5 + Math.floor(rng() * 2), kinds = [];
  for (let i = 0; i < n; i++) kinds.push(i % 2 !== 0 ? 'run' : solo ? pick(rng, SOLO_KINDS) : i === 0 ? pick(rng, COOP_KINDS) : pick(rng, [...COOP_KINDS, ...SOLO_KINDS]));
  kinds.forEach((kind, i) => {
    const seg = { kind, x0: x, y0: y }; L.segs.push(seg);
    if (L.type === 'climb' && i > 0) { const rise = r2(1.6 + rng() * .6); ground(x, 2.2, y + rise); y = r2(y + rise); x += 2.2; }
    if (kind === 'run') {
      const len = 4 + rng() * 3, step = rng() < .4 ? r2(1 + rng() * .8) : 0, gap = rng() < .5 ? Math.min(step ? 2.6 : 3.4, 1.6 + rng() * 1.8) : 0; if (gap) x += gap;
      ground(x, len, y + step); y = r2(y + step); x += len;
    } else if (kind === 'wall') {
      const pre = 5 + rng() * 2, h = r2(between(rng, WALL_H)), top = r2(y + h); ground(x, pre, y); const wx = x + pre; ground(wx, 1.8, top); const post = 5; ground(wx + 1.8, post, y);
      const steps = [0, 1, 2].map(k => ({ x: r2(wx - (3 - k) * .9), y: r2(y + (k + 1) * h / 3 - .05), w: .9, h: .1 + (k + 1) * h / 3 + 12 })); // 梯子：三級往牆頂的階梯
      const flag = { x: r2(wx + .9), y: top, seg: i + 1, reveals: [] }; L.flags.push(flag); steps.forEach(s => { L.hidden.push({ ...s, y: r2(s.y - 12), id: L.hidden.length }); flag.reveals.push(L.hidden.length - 1); });
      seg.wall = { x: wx, h, top }; x = wx + 1.8 + post;
    } else if (kind === 'gap') {
      const pre = 4, w = between(rng, GAP_W), post = 5; ground(x, pre, y); const gx = x + pre; ground(gx + w, post, y);
      L.hidden.push({ x: r2(gx - .2), y: r2(y - .4), w: r2(w + .4), h: .4, id: L.hidden.length }); const flag = { x: r2(gx + w + .8), y, seg: i + 1, reveals: [L.hidden.length - 1] }; L.flags.push(flag);
      seg.gap = { x: gx, w }; x = gx + w + post;
    } else if (kind === 'plate') {
      const len = 9; ground(x, len, y); const dx = x + 4.2;
      L.plates.push({ x: r2(x + 1.2), y, w: 1.4, h: .15, door: L.doors.length, reveals: [] }); L.plates.push({ x: r2(x + 6.6), y, w: 1.4, h: .15, door: L.doors.length, reveals: [] });
      L.doors.push({ x: r2(dx), y, w: .6, h: 9 }); seg.door = L.doors.length - 1; x += len;
      L.flags.push({ x: r2(x - 1), y, seg: i + 1, reveals: [] });
    }
    else if (kind === 'timer') {
      const len = 10; ground(x, len, y); L.plates.push({ x: r2(x + 1.2), y, w: 1.4, h: .15, door: L.doors.length, reveals: [] }); L.doors.push({ x: r2(x + 7.4), y, w: .6, h: 9, hold: DOOR_HOLD }); seg.door = L.doors.length - 1; x += len;
      L.flags.push({ x: r2(x - 1), y, seg: i + 1, reveals: [] });
    } else if (kind === 'springGap') {
      const pre = 5, w = between(rng, SPRING_GAP), post = 5; ground(x, pre, y); const gx = x + pre; ground(gx + w, post, y);
      L.springs.push({ x: r2(gx - .9), y, w: .8, h: .5 }); seg.gap = { x: gx, w, spring: true }; x = gx + w + post; L.flags.push({ x: r2(x - 1.2), y, seg: i + 1, reveals: [] });
    } else if (kind === 'stairs') {
      const pre = 5, h = r2(between(rng, WALL_H)), top = r2(y + h); ground(x, pre, y); const wx = x + pre; ground(wx, 1.8, top); ground(wx + 1.8, 5, y);
      for (let k = 0; k < 3; k++) solid(wx - (3 - k) * .9, y + (k + 1) * h / 3 - 12 - .05, .9, .1 + (k + 1) * h / 3 + 12);
      seg.wall = { x: wx, h, top, stairs: true }; x = wx + 1.8 + 5; L.flags.push({ x: r2(x - 1.2), y, seg: i + 1, reveals: [] });
    } else if (kind === 'bridge') {
      const pre = 5, w = between(rng, GAP_W), post = 5; ground(x, pre, y); const gx = x + pre; ground(gx + w, post, y);
      L.hidden.push({ x: r2(gx - .2), y: r2(y - .4), w: r2(w + .4), h: .4, id: L.hidden.length }); L.plates.push({ x: r2(x + 1.2), y, w: 1.4, h: .15, door: -1, reveals: [L.hidden.length - 1] });
      seg.gap = { x: gx, w, lever: true }; x = gx + w + post; L.flags.push({ x: r2(x - 1.2), y, seg: i + 1, reveals: [] });
    }
    if (kind === 'run') L.flags.push({ x: r2(x - 1.2), y, seg: i + 1, reveals: [] });
  });
  ground(x, 8, y); x += 8; L.goal = { x: r2(x - 3), y, w: 2, h: 3 }; L.end = x; L.top = y;
  L.flags.sort((a, b) => a.x - b.x);
  return L;
}

/* ---------- 對局 ---------- */
// humans：[{ uid, name }]，1 到 4 位真人，沒有電腦隊友。1 人時關卡只出一個人能解的謎題；level 可直接指定（測試用），否則由種子產生
export function createGame({ seed = 1, humans = [], level = null } = {}) {
  const solo = humans.length <= 1, lv = level || genLevel(seed, null, null, solo), n = Math.max(MIN_PLAYERS, Math.min(MAX_PLAYERS, humans.length)), rng = rngFrom(hashSeed(`offer:${seed}`));
  const players = Array.from({ length: n }, (_, id) => {
    const h = humans[id]; return { id, uid: h?.uid ?? null, human: true, gone: false, name: h?.name || `玩家${id + 1}`, look: { color: h?.color || null, ear: h?.ear || null, eye: h?.eye || null, body: h?.body || null, blush: h?.blush || null }, x: lv.spawn.x + id * .6, y: lv.spawn.y, vx: 0, vy: 0, face: 1, ground: false, on: null, carry: null, by: null, done: false, dead: false, rt: 0, ix: 0, jump: false, act: false, actEdge: false, coyote: 0, offers: [0, 1, 2].map(() => pick(rng, Object.keys(BLOCKS))), placed: null, deaths: 0 };
  });
  return { seed, level: lv, players, rng, phase: 'place', t: 0, run: 0, acc: 0, over: false, result: null, lives: LIVES, cp: 0, flagsHit: new Set(), revealed: new Set(), placedBlocks: [], events: [], chaser: lv.chaser ? lv.chaser.start : null, pressed: new Set(), doorOpen: lv.doors.map(() => false), doorT: lv.doors.map(() => 0) };
}
export function setInput(g, id, { x = 0, jump = false, act = false } = {}) {
  const p = g.players[id]; if (!p) return;
  p.ix = Math.max(-1, Math.min(1, Number(x) || 0)); p.jump = !!jump; if (act && !p.act) p.actEdge = true; p.act = !!act;
}
// 放置階段：從自己的 3 個選項挑 1 個放在 (x, y)。不能蓋在固態物、門、板、起點上
export function place(g, id, idx, x, y) {
  const p = g.players[id]; if (!p || g.phase !== 'place' || p.placed || !(idx >= 0 && idx < p.offers.length)) return false;
  const kind = p.offers[idx], b = BLOCKS[kind]; x = Number(x); y = Number(y); if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  const box = { x: x - b.w / 2, y, w: b.w, h: b.h };
  if (box.x < 0 || box.x + box.w > g.level.end || y < -2 || y > g.level.top + 12) return false;
  const all = [...g.level.solids, ...g.level.hidden, ...g.level.doors, ...g.level.plates, ...g.placedBlocks.map(o => o.box)];
  if (all.some(s => overlap(box, s))) return false;
  if (overlap(box, { x: g.level.spawn.x - 1, y: g.level.spawn.y - .2, w: 4, h: 3 })) return false;
  g.placedBlocks.push({ kind, owner: id, box: { x: r2(box.x), y: r2(box.y), w: b.w, h: b.h }, used: false }); p.placed = kind; g.events.push({ type: 'place', id, kind }); return true;
}
const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
const pbox = p => ({ x: p.x - PW / 2, y: p.y, w: PW, h: PH });
const solidsNow = g => {
  const s = [...g.level.solids];
  g.level.hidden.forEach((h, i) => { if (g.revealed.has(i)) s.push(h); });
  g.level.doors.forEach((d, i) => { if (!g.doorOpen[i]) s.push(d); });
  for (const b of g.placedBlocks) if (b.kind === 'plat') s.push(b.box);
  return s;
};
const springs = g => [...g.level.springs.map(box => ({ box })), ...g.placedBlocks.filter(b => b.kind === 'spring')];

/* ---------- 物理 ---------- */
function respawn(g, p) {
  const f = g.level.flags[g.cp] || { x: g.level.spawn.x, y: g.level.spawn.y }; p.x = f.x + (p.id - 1) * .7 - .0; p.y = f.y + .05; p.vx = p.vy = 0; p.dead = false; p.carry = p.by = null; p.on = null;
  if (g.level.chaser && g.chaser != null) { const lim = g.level.chaser.kind === 'wall' ? f.x - 8 : f.y - 8; g.chaser = Math.min(g.chaser, lim); }
}
function kill(g, p) {
  if (p.dead || p.done) return;
  if (p.carry != null) { const o = g.players[p.carry]; o.by = null; o.vy = 4; p.carry = null; }
  if (p.by != null) { g.players[p.by].carry = null; p.by = null; }
  p.dead = true; p.rt = .8; p.deaths++; g.lives--; g.events.push({ type: 'die', id: p.id, x: r1(p.x), y: r1(p.y) });
  if (g.lives < 0) finish(g, false);
}
function carryAct(g, p) {
  if (!p.actEdge) return; p.actEdge = false;
  if (p.carry != null) { const o = g.players[p.carry]; o.by = null; p.carry = null; o.x = p.x + p.face * .6; o.y = p.y + PH; o.vx = p.face * THROW_VX + p.vx * .5; o.vy = THROW_VY; o.ground = false; g.events.push({ type: 'throw', id: p.id, to: o.id }); return; }
  let best = null, bd = REACH; for (const o of g.players) { if (o === p || o.dead || o.done || o.by != null || o.carry != null) continue; const d = Math.hypot(o.x - p.x, (o.y - p.y) * .6); if (d < bd) { bd = d; best = o; } }
  if (best) { p.carry = best.id; best.by = p.id; best.vx = best.vy = 0; g.events.push({ type: 'grab', id: p.id, to: best.id }); }
}
function movePlayer(g, p, dt, solids) {
  const ice = g.level.mod === 'ice', acc = ice ? 14 : 70, slow = p.carry != null ? CARRY_SLOW : 1;
  const target = p.ix * MOVE * slow, air = !p.ground;
  if (p.vx !== target && !(air && !p.ix) && !(air && Math.sign(p.vx) === Math.sign(target) && Math.abs(p.vx) > Math.abs(target))) { const d = target - p.vx, s = Math.min(Math.abs(d), (air ? Math.min(acc, 30) : acc) * dt); p.vx += Math.sign(d) * s; }
  if (p.ix) p.face = Math.sign(p.ix);
  p.coyote = p.ground ? .1 : Math.max(0, p.coyote - dt);
  if (p.jump && p.coyote > 0) { p.vy = JUMP_V; p.coyote = 0; p.ground = false; p.on = null; }
  p.vy -= GRAV * dt; if (p.vy < -30) p.vy = -30;
  const prevY = p.y; p.x += p.vx * dt; let b = pbox(p); const xb = () => ({ x: b.x, y: b.y + .03, w: b.w, h: b.h - .03 }); // 腳底留一點誤差，貼著同高的地面走不會被卡住
  for (const s of solids) if (overlap(xb(), s)) { if (p.vx > 0) p.x = s.x - PW / 2 - 1e-4; else if (p.vx < 0) p.x = s.x + s.w + PW / 2 + 1e-4; p.vx = 0; b = pbox(p); }
  p.y += p.vy * dt; p.ground = false; p.on = null; b = pbox(p);
  for (const s of solids) if (overlap(b, s)) { if (p.vy <= 0) { p.y = s.y + s.h; p.ground = true; } else p.y = s.y - PH - 1e-4; p.vy = 0; b = pbox(p); }
  if (p.vy <= 0) for (const o of g.players) { // 站在隊友頭上
    if (o === p || o.dead || o.done || o.by != null || Math.abs(o.x - p.x) >= PW - .05) continue;
    const top = o.y + PH; if (prevY >= top - .1 && p.y <= top + 1e-3 && p.y >= top - .6) { p.y = top; p.vy = 0; p.ground = true; p.on = o.id; b = pbox(p); }
  }
  for (const sp of springs(g)) { const bx = pbox(p); if (p.vy <= 0 && bx.x < sp.box.x + sp.box.w && bx.x + bx.w > sp.box.x && p.y <= sp.box.y + sp.box.h + .05 && p.y >= sp.box.y + sp.box.h - .52) { p.vy = SPRING_V; p.ground = false; g.events.push({ type: 'spring', id: p.id }); } }
}
function triggers(g) {
  const pressed = new Set();
  g.level.plates.forEach((pl, i) => { for (const p of g.players) if (!p.dead && !p.done && p.by == null && Math.abs(p.x - (pl.x + pl.w / 2)) < pl.w / 2 + PW / 2 - .1 && p.y <= pl.y + pl.h + .1 && p.y >= pl.y - .2 && p.ground) { pressed.add(i); break; } });
  g.pressed = pressed;
  g.level.plates.forEach((pl, i) => { if (pressed.has(i)) for (const r of pl.reveals || []) g.revealed.add(r); });
  g.level.doors.forEach((d, i) => { const on = g.level.plates.some((pl, k) => pl.door === i && pressed.has(k)); if (on) g.doorT[i] = d.hold || 0; else g.doorT[i] = Math.max(0, g.doorT[i] - DT); g.doorOpen[i] = on || g.doorT[i] > 0; });
  g.level.flags.forEach((f, i) => { if (g.flagsHit.has(i)) return; for (const p of g.players) if (!p.dead && Math.abs(p.x - f.x) < 1 && Math.abs(p.y - f.y) < 1.5) { g.flagsHit.add(i); if (i > g.cp) g.cp = i; for (const r of f.reveals) g.revealed.add(r); g.events.push({ type: 'flag', id: p.id, i }); break; } });
  for (const b of g.placedBlocks) if (b.kind === 'life' && !b.used) for (const p of g.players) if (!p.dead && overlap(pbox(p), b.box)) { b.used = true; g.lives++; g.events.push({ type: 'life', id: p.id }); break; }
  const goal = g.level.goal; for (const p of g.players) if (!p.dead && !p.done && overlap(pbox(p), goal)) { p.done = true; if (p.by != null) { g.players[p.by].carry = null; p.by = null; } g.events.push({ type: 'done', id: p.id }); }
}
function chaserTick(g, dt) {
  const c = g.level.chaser; if (!c) return; g.chaser += c.speed * dt;
  for (const p of g.players) if (!p.dead && !p.done && (c.kind === 'wall' ? p.x < g.chaser : p.y + PH < g.chaser)) kill(g, p);
}
function runTick(g, dt) {
  g.run += dt;
  for (const p of g.players) {
    if (p.gone) continue;
    if (p.dead) { p.rt -= dt; if (p.rt <= 0) respawn(g, p); continue; }
    if (p.done) continue;
    carryAct(g, p);
  }
  const solids = solidsNow(g);
  for (const p of g.players) {
    if (p.dead || p.done || p.gone) continue;
    if (p.by != null) { const c = g.players[p.by]; p.x = c.x; p.y = c.y + PH; p.vx = c.vx; p.vy = 0; if (p.jump) { c.carry = null; p.by = null; p.vy = 6; } continue; }
    movePlayer(g, p, dt, solids);
    if (p.y < PIT_Y) kill(g, p);
  }
  triggers(g); chaserTick(g, dt);
  if (!g.over && g.players.every(p => p.done) && g.players.some(p => !p.gone)) finish(g, true);
  else if (!g.over && g.run >= RUN_LIMIT) finish(g, false);
}

/* ---------- 結算 ---------- */
export function finish(g, win) {
  if (g.over) return; g.over = true; g.phase = 'over';
  const humans = g.players.length, pts = win ? (humans >= 3 ? POINTS.win : POINTS.win2) : POINTS.lose; // 單人局不計總積分，由伺服器端以房間人數過濾
  g.result = { win, time: r2(g.run), lives: Math.max(0, g.lives), type: g.level.type, mod: g.level.mod, seed: g.seed, players: g.players.map(p => ({ id: p.id, uid: p.uid, name: p.name, bot: false, deaths: p.deaths, done: p.done, gone: p.gone, win, points: pts, rank: 1, time: r2(g.run), n: humans })) };
}
// 斷線超過寬限期：該玩家退出，不再算在「全員抵達終點」裡；合作局剩下不到 2 人則本局結束（失敗），單人局退出就結束
export function forfeit(g, id) {
  const p = g.players[id]; if (!p || p.gone) return; p.gone = true; p.done = true;
  if (p.carry != null) { const o = g.players[p.carry]; o.by = null; p.carry = null; }
  if (p.by != null) { g.players[p.by].carry = null; p.by = null; }
  g.events.push({ type: 'gone', id });
  if (g.phase === 'run' && g.players.filter(o => !o.gone).length < Math.min(2, g.players.length)) finish(g, false);
}

export function step(g, dt) {
  g.events = []; if (g.over) return g.events;
  g.acc += dt;
  while (g.acc >= DT - 1e-9 && !g.over) {
    g.acc -= DT; g.t += DT;
    if (g.phase === 'place') { if (g.players.every(p => p.placed) || g.t >= PLACE_TIME) { autoPlace(g); g.phase = 'countdown'; g.t = 0; g.events.push({ type: 'placed' }); } }
    else if (g.phase === 'countdown') { if (g.t >= COUNTDOWN - 1e-9) { g.phase = 'run'; g.events.push({ type: 'go' }); } }
    else if (g.phase === 'run') runTick(g, DT);
  }
  if (g.over) g.events.push({ type: 'end', result: g.result });
  return g.events;
}
// 時間到還沒放的人由系統代放：隨機試幾個位置
function autoPlace(g) {
  for (const p of g.players) if (!p.placed) for (let i = 0; i < 40 && !p.placed; i++) place(g, p.id, Math.floor(g.rng() * p.offers.length), 6 + g.rng() * (g.level.end - 12), g.level.top + g.rng() * 3);
}

export function snapshot(g, { full = true } = {}) {
  const o = {
    phase: g.phase, over: g.over, t: r1(g.t), run: r1(g.run), lives: g.lives, cp: g.cp, ch: g.chaser == null ? null : r1(g.chaser),
    pl: g.players.map(p => ({ id: p.id, x: r2(p.x), y: r2(p.y), f: p.face, g: p.ground ? 1 : 0, c: p.carry, b: p.by, d: p.dead ? 1 : 0, dn: p.done ? 1 : 0, gn: p.gone ? 1 : 0, of: p.placed ? null : p.offers })),
    pr: [...g.pressed], dr: g.doorOpen.map(v => v ? 1 : 0), rv: [...g.revealed], fl: [...g.flagsHit], bl: g.placedBlocks.map(b => [b.kind, b.box.x, b.box.y, b.used ? 1 : 0]),
  };
  if (full) { o.seed = g.seed; o.level = g.level; g.players.forEach((p, i) => Object.assign(o.pl[i], { name: p.name, uid: p.uid, look: p.look })); }
  return o;
}
