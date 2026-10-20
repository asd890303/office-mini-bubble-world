// 泡泡碰碰島 — pure game rules shared by index.html (offline + online render) and worker.js (server-authoritative).
// No DOM / three.js / Math.random: all randomness comes from a seeded RNG so the same seed + inputs replay identically.
export const COLS = 15, ROWS = 15, MAX_PLAYERS = 4;
export const EMPTY = 0, HARD = 1, SOFT = 2;
// 水柱：FLAME_TIME 總長；最後 FLAME_FADE 秒是畫面上的消散動畫，這段不再判定（判定時間 = 畫面上水柱完整顯示的時間）
export const BOMB_TIME = 2.5, FLAME_TIME = .5, FLAME_FADE = .1, TRAP_TIME = 6;
// 被水柱判定的距離：角色中心離水柱格中心要小於這個值（原本用四捨五入 = 0.5，半個身體擦到就中）
export const FLAME_HIT_R = .4;
export const BASE_SPEED = 3.4, SPEED_STEP = .8, MAX_SPEED = 7;
export const MAX_POWER = 8, SUPER_POWER = 15, KICK_SPEED = 8;
export const ROUND_TIME = 180, SHRINK_AT = 40, SHRINK_EVERY = .18;
export const COLORS = ['#ffb3c7', '#a8d8ff', '#ffe08a', '#a8e6cf', '#c9b6ff', '#ffc8a2', '#ff8a80', '#7fdbd0', '#8aa4ff', '#cfe88a', '#f29be0', '#c9a58a', '#ffffff', '#000000', '#ff0000'];
export const EARS = { be: '圓耳', pay: '長耳', fe: '尖耳', tool: '小芽', cat: '貓耳', bear: '熊耳', horn: '小角', bow: '蝴蝶結', ant: '觸角' };
export const EYES = { dot: '圓眼', big: '大眼', happy: '笑眼', sleepy: '瞇眼', sparkle: '閃亮', wink: '眨眼' };
const EYE_KEYS = Object.keys(EYES);
export const BODIES = ['#fffdf7', '#ffe9d6', '#e8f4ff', '#eafbe7', '#f3e8ff', '#fff3b8', '#f2d9c4', '#d9dde3', '#ffffff', '#000000', '#ff0000'];
export const BLUSHES = ['#ffa3b5', '#ff7d7d', '#ffc27a', '#ffe27a', '#9fd8ff', '#c4a3ff', '#ffffff', '#000000', '#ff0000'];
export const DIFFS = { easy: { label: '簡單', think: .45, wander: .35, hunt: false }, normal: { label: '普通', think: .22, wander: .12, hunt: true }, hard: { label: '困難', think: .1, wander: .03, hunt: true } };
// 道具掉落：箱子 ITEM_DROP 機率掉一個，種類照下面權重（超級水球稀有）
export const ITEM_DROP = .42;
export const ITEM_WEIGHTS = { bomb: 32, power: 30, speed: 20, kick: 12, super: 6 };
export const ITEM_KINDS = Object.keys(ITEM_WEIGHTS);
export const SPAWNS = [[0, 0], [COLS - 1, ROWS - 1], [COLS - 1, 0], [0, ROWS - 1]];
export const BOT_NAMES = ['麻糬', '湯圓', '布丁', '棉花', '豆花', '芋圓'];
// 縮圈順序：從最外圈順時針往內
export const SPIRAL = (() => {
  const out = []; let x0 = 0, y0 = 0, x1 = COLS - 1, y1 = ROWS - 1;
  while (x0 <= x1 && y0 <= y1) {
    for (let x = x0; x <= x1; x++) out.push([x, y0]);
    for (let y = y0 + 1; y <= y1; y++) out.push([x1, y]);
    if (y0 < y1) for (let x = x1 - 1; x >= x0; x--) out.push([x, y1]);
    if (x0 < x1) for (let y = y1 - 1; y > y0; y--) out.push([x0, y]);
    x0++; y0++; x1--; y1--;
  }
  return out;
})();
const DIRS4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];

export function rngFrom(seed) { // mulberry32
  let a = (seed >>> 0) || 1;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function shuffle(a, rng) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
const newAI = (g, x, y) => ({ path: [], think: g.rng() * .3, stuck: 0, lastPos: [x, y] });

// humans: [{ uid, name, color, ear }] (max 4, slot order = spawn order); empty slots become AI unless bots is false.
export function createGame({ seed = 1, humans = [], diff = 'normal', roundTime = ROUND_TIME, bots = true } = {}) {
  const rng = rngFrom(seed);
  const grid = [];
  for (let y = 0; y < ROWS; y++) { grid.push([]); for (let x = 0; x < COLS; x++) grid[y].push(x % 2 === 1 && y % 2 === 1 ? HARD : EMPTY); }
  const safe = new Set();
  for (const [sx, sy] of SPAWNS) for (const [dx, dy] of [[0, 0], ...DIRS4]) safe.add(`${sx + dx},${sy + dy}`);
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) if (grid[y][x] === EMPTY && !safe.has(`${x},${y}`) && rng() < .72) grid[y][x] = SOFT;
  const g = { seed: seed >>> 0, rng, diff: DIFFS[diff] ? diff : 'normal', roundTime, grid, bombs: [], flames: [], items: new Map(), players: [], time: roundTime, over: false, result: null, deaths: [], shrinkIdx: 0, shrinkT: 0, shrinking: false, events: [], nextId: 1 };
  const hs = humans.slice(0, MAX_PLAYERS), used = new Set();
  const pickColor = c => { if (!COLORS.includes(c) || used.has(c)) c = COLORS.find(k => !used.has(k)); used.add(c); return c; };
  hs.forEach(h => pickColor(h.color)); used.clear();
  const names = shuffle([...BOT_NAMES], rng), earKeys = Object.keys(EARS);
  SPAWNS.forEach(([sx, sy], i) => {
    const h = hs[i];
    if (!h && !bots) return;
    const p = {
      id: i, uid: h ? String(h.uid ?? i) : null, name: h ? String(h.name || '玩家').slice(0, 12) : names[i], human: !!h,
      color: h ? pickColor(h.color) : null, ear: h && EARS[h.ear] ? h.ear : earKeys[(i + 1) % earKeys.length], eye: h ? (Object.hasOwn(EYES, h.eye) ? h.eye : 'dot') : EYE_KEYS[(i + 2) % EYE_KEYS.length], body: h && BODIES.includes(h.body) ? h.body : BODIES[0], blush: h && BLUSHES.includes(h.blush) ? h.blush : BLUSHES[0],
      x: sx, y: sy, speed: BASE_SPEED, maxBombs: 1, power: 1, kick: false, state: 'alive', trapT: 0, trappedBy: null, kills: 0,
      dir: [0, 0], face: 0, input: [0, 0], ai: h ? null : newAI(g, sx, sy),
    };
    g.players.push(p);
  });
  for (const p of g.players) if (!p.color) p.color = pickColor(null);
  return g;
}

/* ---------- 規則 ---------- */
export const inBounds = (x, y) => x >= 0 && y >= 0 && x < COLS && y < ROWS;
const bombAt = (g, x, y) => g.bombs.find(b => b.x === x && b.y === y);
export const cellOf = p => [Math.round(p.x), Math.round(p.y)];
const alivePlayers = g => g.players.filter(p => p.state !== 'dead');
const ev = (g, e) => g.events.push(e);
function free(g, x, y, p) {
  if (!inBounds(x, y) || g.grid[y][x] !== EMPTY) return false;
  const b = bombAt(g, x, y);
  return !b || b.passers.has(p.id);
}
export function tryMove(g, p, dx, dy, dist) {
  if (dx) {
    const cy = Math.round(p.y);
    if (Math.abs(p.y - cy) > .02) { // 先沿著轉角滑到格線上
      if (free(g, Math.round(p.x) + dx, cy, p)) p.y += Math.sign(cy - p.y) * Math.min(dist, Math.abs(cy - p.y));
      return;
    }
    p.y = cy;
    const ahead = dx > 0 ? Math.ceil(p.x + 1e-6) : Math.floor(p.x - 1e-6);
    if (free(g, ahead, cy, p)) p.x += dx * dist;
    else if (tryKick(g, p, ahead, cy, dx, 0, Math.abs(ahead - p.x) <= 1 + dist + 1e-6)) return;
    else p.x = dx > 0 ? Math.min(p.x + dist, Math.max(p.x, ahead - 1)) : Math.max(p.x - dist, Math.min(p.x, ahead + 1));
  } else if (dy) {
    const cx = Math.round(p.x);
    if (Math.abs(p.x - cx) > .02) {
      if (free(g, cx, Math.round(p.y) + dy, p)) p.x += Math.sign(cx - p.x) * Math.min(dist, Math.abs(cx - p.x));
      return;
    }
    p.x = cx;
    const ahead = dy > 0 ? Math.ceil(p.y + 1e-6) : Math.floor(p.y - 1e-6);
    if (free(g, cx, ahead, p)) p.y += dy * dist;
    else if (tryKick(g, p, cx, ahead, 0, dy, Math.abs(ahead - p.y) <= 1 + dist + 1e-6)) return;
    else p.y = dy > 0 ? Math.min(p.y + dist, Math.max(p.y, ahead - 1)) : Math.max(p.y - dist, Math.min(p.y, ahead + 1));
  }
  p.x = Math.max(0, Math.min(COLS - 1, p.x)); p.y = Math.max(0, Math.min(ROWS - 1, p.y));
}
// 踢鞋：走進水球就把它往前踢，水球一路滑到被牆／箱子／水球／玩家／道具擋住
function cellBlockedForBomb(g, x, y, self) {
  if (!inBounds(x, y) || g.grid[y][x] !== EMPTY) return true;
  if (g.bombs.some(b => b !== self && b.x === x && b.y === y)) return true;
  if (g.items.has(`${x},${y}`)) return true;
  return g.players.some(q => q.state !== 'dead' && Math.abs(q.x - x) < .9 && Math.abs(q.y - y) < .9);
}
function tryKick(g, p, x, y, dx, dy, touching) {
  if (!p.kick || !touching || p.state !== 'alive') return false;
  const b = bombAt(g, x, y);
  if (!b || b.slide || b.passers.has(p.id) || cellBlockedForBomb(g, x + dx, y + dy, b)) return false;
  b.slide = [dx, dy]; b.prog = 0;
  ev(g, { e: 'kick', id: p.id });
  return false; // 這一步照常被擋住，水球下一步開始滑
}
function slideBombs(g, dt) {
  for (const b of g.bombs) {
    if (!b.slide) continue;
    const [dx, dy] = b.slide;
    if (b.prog === 0 && cellBlockedForBomb(g, b.x + dx, b.y + dy, b)) { b.slide = null; continue; }
    b.prog += KICK_SPEED * dt;
    while (b.slide && b.prog >= 1) {
      if (cellBlockedForBomb(g, b.x + dx, b.y + dy, b)) { b.slide = null; b.prog = 0; break; }
      b.x += dx; b.y += dy; b.prog -= 1; b.passers = new Set();
      if (cellBlockedForBomb(g, b.x + dx, b.y + dy, b)) { b.slide = null; b.prog = 0; }
    }
  }
}
export function placeBomb(g, p) {
  if (!p || p.state !== 'alive' || g.over) return false;
  const [x, y] = cellOf(p);
  if (bombAt(g, x, y) || g.bombs.filter(b => b.owner === p.id).length >= p.maxBombs) return false;
  const passers = new Set(g.players.filter(q => q.state !== 'dead' && Math.abs(q.x - x) < 1 && Math.abs(q.y - y) < 1).map(q => q.id));
  g.bombs.push({ id: g.nextId++, x, y, owner: p.id, power: p.power, t: BOMB_TIME, passers, slide: null, prog: 0 });
  ev(g, { e: 'place', id: p.id });
  return true;
}
function blastCells(g, b) {
  const cells = [[b.x, b.y]];
  for (const [dx, dy] of DIRS4) {
    for (let i = 1; i <= b.power; i++) {
      const x = b.x + dx * i, y = b.y + dy * i;
      if (!inBounds(x, y) || g.grid[y][x] === HARD) break;
      cells.push([x, y]);
      if (g.grid[y][x] === SOFT) break;
      if (g.bombs.some(o => o !== b && o.x === x && o.y === y)) break;
    }
  }
  return cells;
}
function explode(g, b) {
  g.bombs.splice(g.bombs.indexOf(b), 1);
  for (const [x, y] of blastCells(g, b)) {
    if (g.grid[y][x] === SOFT) {
      g.grid[y][x] = EMPTY; ev(g, { e: 'crumble', x, y });
      if (g.rng() < ITEM_DROP) spawnItem(g, x, y, .5);
      addFlame(g, x, y, false, b.owner);
      continue;
    }
    const it = g.items.get(`${x},${y}`);
    if (it && !(it.pending > 0)) g.items.delete(`${x},${y}`);
    const other = bombAt(g, x, y);
    if (other) other.t = Math.min(other.t, .06);
    addFlame(g, x, y, x === b.x && y === b.y, b.owner);
  }
  ev(g, { e: 'boom' });
}
function addFlame(g, x, y, center, owner = null) { g.flames.push({ id: g.nextId++, x, y, t: FLAME_TIME, center, owner }); }
export const flameHits = (p, f) => Math.abs(p.x - f.x) < FLAME_HIT_R && Math.abs(p.y - f.y) < FLAME_HIT_R;
function dropBlock(g, x, y) {
  g.grid[y][x] = HARD;
  g.items.delete(`${x},${y}`);
  const b = bombAt(g, x, y); if (b) g.bombs.splice(g.bombs.indexOf(b), 1);
  ev(g, { e: 'drop', x, y });
  for (const p of g.players) if (p.state !== 'dead' && Math.round(p.x) === x && Math.round(p.y) === y) kill(g, p, null);
}
function spawnItem(g, x, y, delay = 0) {
  let r = g.rng() * Object.values(ITEM_WEIGHTS).reduce((a, b) => a + b, 0), kind = ITEM_KINDS[0];
  for (const k of ITEM_KINDS) { if (r < ITEM_WEIGHTS[k]) { kind = k; break; } r -= ITEM_WEIGHTS[k]; }
  g.items.set(`${x},${y}`, { x, y, kind, pending: delay });
}
function pickItem(g, p) {
  const [x, y] = cellOf(p);
  const it = g.items.get(`${x},${y}`);
  if (!it || it.pending > 0) return;
  g.items.delete(`${x},${y}`);
  if (it.kind === 'bomb') p.maxBombs = Math.min(8, p.maxBombs + 1);
  if (it.kind === 'power') p.power = Math.max(p.power, Math.min(MAX_POWER, p.power + 1));
  if (it.kind === 'speed') p.speed = Math.min(MAX_SPEED, p.speed + SPEED_STEP);
  if (it.kind === 'kick') p.kick = true;
  if (it.kind === 'super') p.power = SUPER_POWER;
  ev(g, { e: 'item', id: p.id, kind: it.kind });
}
function trap(g, p, by = null) { p.state = 'trapped'; p.trapT = TRAP_TIME; p.trappedBy = by; if (p.ai) p.ai.path = []; ev(g, { e: 'trap', id: p.id, by }); }
function kill(g, p, by) {
  p.state = 'dead'; p.trapT = 0; p.trappedBy = null; g.deaths.push(p.id);
  if (by && by !== p) by.kills++;
  ev(g, { e: 'kill', id: p.id, by: by ? by.id : null });
}
// 泡泡計時結束破掉：算放那顆水球的人一次擊敗，自己炸到自己不算
const trapper = (g, p) => (p.trappedBy != null && p.trappedBy !== p.id ? g.players[p.trappedBy] || null : null);
// 斷線太久判出局（線上房間不補 AI 時用）
export function forfeit(g, id) {
  const p = g.players[id]; if (!p || p.state === 'dead' || g.over) return false;
  kill(g, p, p.state === 'trapped' ? trapper(g, p) : null);
  return true;
}
// 斷線 → 交給 AI；重連 → 還給玩家
export function setHuman(g, id, human) {
  const p = g.players[id]; if (!p) return;
  p.human = !!human; p.input = [0, 0];
  p.ai = human ? null : newAI(g, Math.round(p.x), Math.round(p.y));
}
export function setInput(g, id, dir) {
  const p = g.players[id]; if (!p || !Array.isArray(dir)) return;
  const dx = Math.sign(Number(dir[0]) || 0), dy = dx ? 0 : Math.sign(Number(dir[1]) || 0);
  p.input = [dx, dy];
}

/* ---------- AI ---------- */
function dangerMap(g, extraBomb) {
  const bombs = extraBomb ? [...g.bombs, extraBomb] : g.bombs;
  const eff = new Map(bombs.map(b => [b, b.t]));
  const cellsOf = new Map(bombs.map(b => [b, blastCells(g, b)]));
  for (let k = 0; k < 4; k++) for (const a of bombs) for (const [x, y] of cellsOf.get(a)) {
    const o = bombs.find(b => b !== a && b.x === x && b.y === y);
    if (o && eff.get(a) < eff.get(o)) eff.set(o, eff.get(a));
  }
  const d = Array.from({ length: ROWS }, () => new Array(COLS).fill(Infinity));
  for (const b of bombs) for (const [x, y] of cellsOf.get(b)) d[y][x] = Math.min(d[y][x], eff.get(b));
  for (const f of g.flames) d[f.y][f.x] = 0;
  if (g.shrinking) {
    let k = 0;
    for (let i = g.shrinkIdx; i < SPIRAL.length && k < 8; i++) {
      const [x, y] = SPIRAL[i]; if (g.grid[y][x] === HARD) continue;
      d[y][x] = Math.min(d[y][x], Math.max(.01, g.shrinkT + k * SHRINK_EVERY)); k++;
    }
  }
  return d;
}
function bfs(g, p, start, danger, goal, maxSteps = 40, allowDanger = false) {
  const key = (x, y) => y * COLS + x;
  const prev = new Map([[key(...start), null]]);
  const q = [[...start, 0]];
  while (q.length) {
    const [x, y, s] = q.shift();
    if (goal(x, y, s)) {
      const path = []; let k = key(x, y);
      while (k !== null && k !== key(...start)) { path.unshift([k % COLS, Math.floor(k / COLS)]); k = prev.get(k); }
      return path;
    }
    if (s >= maxSteps) continue;
    for (const [dx, dy] of shuffle([...DIRS4], g.rng)) {
      const nx = x + dx, ny = y + dy, k = key(nx, ny);
      if (prev.has(k) || !free(g, nx, ny, p)) continue;
      const arrive = (s + 1) / p.speed, dz = danger[ny][nx];
      if (dz === 0) continue;
      if (!allowDanger && dz !== Infinity) continue;
      if (allowDanger && dz !== Infinity && dz < arrive + .55 && dz > arrive - .9) continue;
      prev.set(k, key(x, y)); q.push([nx, ny, s + 1]);
    }
  }
  return null;
}
function inLine(g, a, b, power) {
  if (a[0] === b[0]) { const s = Math.sign(b[1] - a[1]); if (Math.abs(b[1] - a[1]) > power) return false; for (let y = a[1] + s; y !== b[1]; y += s) if (g.grid[y][a[0]] !== EMPTY) return false; return true; }
  if (a[1] === b[1]) { const s = Math.sign(b[0] - a[0]); if (Math.abs(b[0] - a[0]) > power) return false; for (let x = a[0] + s; x !== b[0]; x += s) if (g.grid[a[1]][x] !== EMPTY) return false; return true; }
  return false;
}
function think(g, p) {
  const D = DIFFS[g.diff], cell = cellOf(p), danger = dangerMap(g), ai = p.ai;
  if (danger[cell[1]][cell[0]] !== Infinity && p.kick) { // 有踢鞋：旁邊的水球踢得動就先踢走
    for (const [dx, dy] of DIRS4) {
      const b = bombAt(g, cell[0] + dx, cell[1] + dy);
      if (b && !b.slide && !b.passers.has(p.id) && !cellBlockedForBomb(g, b.x + dx, b.y + dy, b) && !cellBlockedForBomb(g, b.x + 2 * dx, b.y + 2 * dy, b)) { ai.path = [[b.x, b.y]]; ai.think = .2; return; }
    }
  }
  if (danger[cell[1]][cell[0]] !== Infinity) { ai.path = bfs(g, p, cell, danger, (x, y) => danger[y][x] === Infinity, 14, true) || []; return; } // 1. 腳下危險：先逃
  const others = alivePlayers(g).filter(o => o !== p);
  const trapped = others.filter(o => o.state === 'trapped'); // 2. 有人被困：去戳破
  if (trapped.length && D.hunt) {
    const tcells = new Set(trapped.map(o => cellOf(o).join(',')));
    const path = bfs(g, p, cell, danger, (x, y) => tcells.has(`${x},${y}`), 10);
    if (path) { ai.path = path; return; }
  }
  const canBomb = !bombAt(g, ...cell) && g.bombs.filter(b => b.owner === p.id).length < p.maxBombs; // 3. 放水球
  if (canBomb) {
    const enemyHit = D.hunt && others.some(o => o.state === 'alive' && inLine(g, cell, cellOf(o), p.power));
    const softNear = DIRS4.some(([dx, dy]) => inBounds(cell[0] + dx, cell[1] + dy) && g.grid[cell[1] + dy][cell[0] + dx] === SOFT);
    if (enemyHit || (softNear && g.rng() < .85)) {
      const sim = { x: cell[0], y: cell[1], power: p.power, t: BOMB_TIME, passers: new Set([p.id]) };
      const d2 = dangerMap(g, sim);
      g.bombs.push(sim);
      const esc = bfs(g, p, cell, d2, (x, y) => d2[y][x] === Infinity, 10, true);
      g.bombs.pop();
      if (esc) { placeBomb(g, p); ai.path = esc; return; }
    }
  }
  if (ai.path.length && g.rng() > .25) return;
  const path = bfs(g, p, cell, danger, (x, y) => { const it = g.items.get(`${x},${y}`); return it && !(it.pending > 0); }, 8); // 4. 撿道具
  if (path) { ai.path = path; return; }
  if (g.rng() < D.wander) { const n = 2 + Math.floor(g.rng() * 3); ai.path = bfs(g, p, cell, danger, (x, y, s) => s >= n, 5) || []; return; } // 5. 隨意走走
  const nearSoft = (x, y) => DIRS4.some(([dx, dy]) => inBounds(x + dx, y + dy) && g.grid[y + dy][x + dx] === SOFT);
  const target = bfs(g, p, cell, danger, (x, y, s) => s > 0 && nearSoft(x, y), 30);
  if (target) { ai.path = target; return; }
  const enemy = others[0];
  if (enemy) { const ec = cellOf(enemy); ai.path = bfs(g, p, cell, danger, (x, y) => Math.abs(x - ec[0]) + Math.abs(y - ec[1]) <= 1, 40) || []; }
}
function driveAI(g, p, dt) {
  const ai = p.ai;
  ai.think -= dt;
  const centered = Math.abs(p.x - Math.round(p.x)) < .08 && Math.abs(p.y - Math.round(p.y)) < .08;
  if (ai.think <= 0 && centered) { ai.think = DIFFS[g.diff].think * (.7 + g.rng() * .6); think(g, p); }
  if (p.state === 'trapped') { p.dir = [0, 0]; return; }
  const next = ai.path[0];
  if (!next) { p.dir = [0, 0]; return; }
  const dx = next[0] - p.x, dy = next[1] - p.y;
  if (Math.abs(dx) < .06 && Math.abs(dy) < .06) { p.x = next[0]; p.y = next[1]; ai.path.shift(); p.dir = [0, 0]; return; }
  p.dir = Math.abs(dx) > Math.abs(dy) ? [Math.sign(dx), 0] : [0, Math.sign(dy)];
  if (Math.hypot(p.x - ai.lastPos[0], p.y - ai.lastPos[1]) < .01) { ai.stuck += dt; if (ai.stuck > .8) { ai.path = []; ai.stuck = 0; ai.think = 0; } } // 卡住就重新規劃
  else ai.stuck = 0;
  ai.lastPos = [p.x, p.y];
}

/* ---------- 一局結束 ---------- */
function finish(g, reason) {
  if (g.over) return;
  g.over = true;
  const alive = alivePlayers(g).filter(p => p.state === 'alive');
  const winner = reason === 'last' && alive.length === 1 ? alive[0] : null;
  const order = [...g.players].sort((a, b) => {
    const ra = a.state === 'dead' ? g.deaths.indexOf(a.id) : 99, rb = b.state === 'dead' ? g.deaths.indexOf(b.id) : 99;
    return rb - ra || b.kills - a.kills;
  });
  g.result = {
    reason, winner: winner ? { id: winner.id, name: winner.name, bot: winner.uid == null } : null,
    duration: Math.round(g.roundTime - g.time),
    players: order.map((p, i) => ({ rank: i + 1, id: p.id, uid: p.uid, name: p.name, bot: p.uid == null, kills: p.kills, survived: p.state !== 'dead' })),
  };
  ev(g, { e: 'end', result: g.result });
}

// Advance the game by dt seconds; returns the events produced since the last call.
export function step(g, dt) {
  if (!g.over) { g.time -= dt; if (g.time <= 0) { g.time = 0; finish(g, 'time'); } }
  if (!g.over && g.time <= SHRINK_AT) {
    if (!g.shrinking) { g.shrinking = true; g.shrinkT = SHRINK_EVERY; ev(g, { e: 'shrink' }); }
    g.shrinkT -= dt;
    while (g.shrinkT <= 0 && g.shrinkIdx < SPIRAL.length) {
      const [x, y] = SPIRAL[g.shrinkIdx++];
      if (g.grid[y][x] === HARD) continue;
      dropBlock(g, x, y); g.shrinkT += SHRINK_EVERY;
    }
  }
  for (const p of g.players) {
    if (p.state === 'dead') continue;
    if (g.over) p.dir = [0, 0]; else if (p.human) p.dir = p.input; else driveAI(g, p, dt);
    const sp = p.speed * (p.state === 'trapped' ? .22 : 1) * dt;
    if (p.dir[0] || p.dir[1]) { tryMove(g, p, p.dir[0], p.dir[1], sp); p.face = Math.atan2(p.dir[0], p.dir[1]); }
    if (p.state === 'alive') pickItem(g, p);
    if (p.state === 'trapped') { p.trapT -= dt; if (p.trapT <= 0) kill(g, p, trapper(g, p)); }
  }
  for (const b of g.bombs) for (const id of [...b.passers]) { const q = g.players[id]; if (q.state === 'dead' || Math.abs(q.x - b.x) >= .98 || Math.abs(q.y - b.y) >= .98) b.passers.delete(id); } // 離開水球後就不能再穿過
  slideBombs(g, dt);
  for (const b of [...g.bombs]) { b.t -= dt; if (b.t <= 0 && g.bombs.includes(b)) explode(g, b); }
  for (const f of [...g.flames]) {
    f.t -= dt;
    if (f.t > FLAME_FADE) for (const p of g.players) { if (p.state === 'alive' && flameHits(p, f)) trap(g, p, f.owner); }
    if (f.t <= 0) g.flames.splice(g.flames.indexOf(f), 1);
  }
  for (const p of g.players) { // 碰到被困的人就戳破
    if (p.state !== 'trapped') continue;
    const by = g.players.find(o => o !== p && o.state === 'alive' && Math.hypot(o.x - p.x, o.y - p.y) < .72);
    if (by) kill(g, p, by);
  }
  for (const it of g.items.values()) if (it.pending > 0) it.pending -= dt;
  if (!g.over) {
    const left = alivePlayers(g);
    if (left.length === 0 || (left.length <= 1 && left.every(p => p.state === 'alive'))) finish(g, 'last');
  }
  const out = g.events; g.events = []; return out;
}

// Compact, JSON-safe view of the game for rendering / sending over the wire.
const r2 = v => Math.round(v * 100) / 100, r3 = v => Math.round(v * 1000) / 1000;
export function snapshot(g) {
  return {
    seed: g.seed, time: r2(g.time), over: g.over, shrinking: g.shrinking, grid: g.grid.map(r => r.join('')).join(''),
    bombs: g.bombs.map(b => [b.id, b.x, b.y, r2(b.t), b.slide ? r2(b.slide[0] * b.prog) : 0, b.slide ? r2(b.slide[1] * b.prog) : 0]),
    flames: g.flames.map(f => [f.id, f.x, f.y, r2(f.t), f.center ? 1 : 0]),
    items: [...g.items.values()].map(i => [i.x, i.y, i.kind, r2(Math.max(0, i.pending))]),
    players: g.players.map(p => ({ id: p.id, uid: p.uid, name: p.name, human: p.human, color: p.color, ear: p.ear, eye: p.eye, body: p.body, blush: p.blush, x: r3(p.x), y: r3(p.y), state: p.state, trapT: r2(p.trapT), kick: p.kick ? 1 : 0, maxBombs: p.maxBombs, power: p.power, speed: p.speed, kills: p.kills, face: r2(p.face), mv: p.dir[0] || p.dir[1] ? 1 : 0 })),
  };
}
