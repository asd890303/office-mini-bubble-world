// 泡泡砲戰：純規則（地形、彈道、爆炸、道具、金錢、回合、崩塌、電腦對手），index.html（單人與畫面）和 worker.js（連線、伺服器判定）共用。
// 不碰 DOM / three.js / Math.random：亂數全部來自種子，同一組種子與輸入會重播出同樣結果。
// 座標單位是「點」，原點在左上角，x 往右、y 往下；地形遮罩 1 點 1 格（1 = 有地）。角度以 +x 為 0 度、往上為正。
export const W = 1200, H = 600, TEAM_SIZE = 3, MAX_PLAYERS = 6, ROUNDS = 10, STAGES = 5;
export const COLORS = ['#ffb3c7', '#a8d8ff', '#ffe08a', '#a8e6cf', '#c9b6ff', '#ffc8a2', '#ff8a80', '#7fdbd0', '#8aa4ff', '#cfe88a', '#f29be0', '#c9a58a', '#ffffff', '#000000', '#ff0000'];
export const EARS = { be: '圓耳', pay: '長耳', fe: '尖耳', tool: '小芽', cat: '貓耳', bear: '熊耳', horn: '小角', bow: '蝴蝶結', ant: '觸角' };
export const EYES = { dot: '圓眼', big: '大眼', happy: '笑眼', sleepy: '瞇眼', sparkle: '閃亮', wink: '眨眼' };
const EYE_KEYS = Object.keys(EYES);
export const BODIES = ['#fffdf7', '#ffe9d6', '#e8f4ff', '#eafbe7', '#f3e8ff', '#fff3b8', '#f2d9c4', '#d9dde3', '#ffffff', '#000000', '#ff0000'];
export const BLUSHES = ['#ffa3b5', '#ff7d7d', '#ffc27a', '#ffe27a', '#9fd8ff', '#c4a3ff', '#ffffff', '#000000', '#ff0000'];
export const BOT_NAMES = ['麻糬', '湯圓', '布丁', '棉花', '豆花', '芋圓', '年糕', '銅鑼燒'];
export const TEAMS = [{ name: '紅隊', color: '#ff8a8a' }, { name: '藍隊', color: '#7ab8ff' }];
export const CHAR = { R: 12, HP: 100, WALK: 90, STAMINA: 235, STEP: 4, DROP: 8, HEAD: 22, JUMP_COST: 30, JUMP_VX: 70, JUMP_VY: 330 };
export const RULES = { TURN: 20, SHOP: 8, START_MONEY: 120, INCOME: 20, CATCHUP: 15, KILL: 30, HIT_GAIN: .78125, MATE_LOSS: .375, HEAL: 30, PAD: 1.2, SHOP_SIZE: 3, READY: 60, REFRESH: 10, START_ITEMS: {} }; // 命中對手賺傷害的 78.125%，打到隊友扣 37.5%；START_ITEMS 在道具表之後填
export const SHOT = { G: 900, V0: 132, V1: 968, DT: 1 / 120, MAX_STEPS: 1100, SAMPLE: 5 };
export const ITEMS = {
  basic: { name: '水球', price: 0, r: 38, dmg: 26, desc: '傷害小' },
  heavy: { name: '重水球', price: 40, r: 72, dmg: 58, desc: '範圍大、傷害高' },
  triple: { name: '三連發', price: 45, r: 33, dmg: 26, spread: 7, desc: '一次射 3 顆' },
  scatter: { name: '散射水球', price: 50, r: 40, dmg: 30, minis: 5, miniR: 28, miniDmg: 16, desc: '命中後再彈出 5 顆小水球' },
  drill: { name: '鑽地彈', price: 35, r: 82, dmg: 34, len: 168, bore: 12, desc: '鑽進去再炸' },
  delay: { name: '延遲水球', price: 45, r: 82, dmg: 55, desc: '下回合才炸，範圍最大' },
  nuke: { name: '核彈', price: 180, r: 237, dmg: 110, limit: 1, desc: '超大範圍、超高傷害，每場限買 1 次' },
  pull: { name: '牽引水球', price: 45, r: 72, dmg: 0, pull: true, desc: '命中後把範圍內所有人拉向中心' },
  cement: { name: '水泥球', price: 40, r: 36, dmg: 10, wall: true, desc: '命中長出可破壞的土牆，把人往上推' },
  heal: { name: '治療泡泡', price: 30, desc: '自己 +30 血' },
  teleport: { name: '瞬間移動', price: 50, desc: '自己選地點傳送' },
  shoes: { name: '跑鞋', price: 30, desc: '這回合可走的距離 +100%' },
  gloves: { name: '手套', price: 40, desc: '下一次攻擊重複一次' },
  shield: { name: '泡泡護盾', price: 30, r: 120, limit: 1, desc: '自己和附近隊友擋下一次傷害，每場限買 1 次' },
  freeze: { name: '凍結水球', price: 40, r: 40, dmg: 12, freeze: true, desc: '低傷害，命中的人下一回合不能移動' },
};
export const POOL_ATK = ['heavy', 'triple', 'drill', 'scatter', 'freeze', 'delay', 'pull', 'cement', 'nuke']; // 丟出去的攻擊道具，每回合只能發射一次
export const POOL_SUP = ['heal', 'shield', 'teleport', 'shoes', 'gloves']; // 支援道具，每回合可用一個，和發射分開計算
export const POOL = [...POOL_ATK, ...POOL_SUP];
export const SHOTS = ['basic', ...POOL_ATK]; // 需要發射的道具；heal 是立即使用，不佔發射次數
for (const i of POOL) if (i !== 'nuke') RULES.START_ITEMS[i] = 1; // 開場每種道具各 1 個，核彈除外

export function rngFrom(seed) { // mulberry32
  let a = (seed >>> 0) || 1;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export const hashSeed = s => { let h = 2166136261; for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v)), r1 = v => Math.round(v * 10) / 10;

/* ---------- 地形遮罩 ---------- */
export const solid = (m, x, y) => { x = Math.round(x); y = Math.round(y); return x >= 0 && x < W && y >= 0 && y < H && m[y * W + x] === 1; };
// 挖圓洞（v = 0）或補圓（v = 1）；回傳範圍 [x0, y0, x1, y1] 給畫面局部更新
export function carve(m, cx, cy, r, v = 0) {
  const x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(W - 1, Math.ceil(cx + r)), y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(H - 1, Math.ceil(cy + r)), r2 = r * r;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if ((x - cx) ** 2 + (y - cy) ** 2 <= r2) m[y * W + x] = v;
  return [x0, y0, x1, y1];
}
export const groundY = (m, x) => { x = clamp(Math.round(x), 0, W - 1); for (let y = 0; y < H; y++) if (m[y * W + x] === 1) return y - 1; return H; }; // 站得住的位置：最上面一格有地的上面一格
// 每欄的有地區段：[區段數, y0, y1, y0, y1, ...] 依欄串起來，傳給晚加入的人
export function encodeMask(m) {
  const out = [];
  for (let x = 0; x < W; x++) {
    const spans = []; let start = -1;
    for (let y = 0; y < H; y++) { const s = m[y * W + x] === 1; if (s && start < 0) start = y; else if (!s && start >= 0) { spans.push(start, y); start = -1; } }
    if (start >= 0) spans.push(start, H);
    out.push(spans.length / 2, ...spans);
  }
  return out;
}
export function decodeMask(a) {
  const m = new Uint8Array(W * H); let i = 0;
  for (let x = 0; x < W; x++) { const n = a[i++]; for (let k = 0; k < n; k++) { const y0 = a[i++], y1 = a[i++]; for (let y = y0; y < y1; y++) m[y * W + x] = 1; } }
  return m;
}

/* ---------- 地圖配方 → 地形 ---------- */
const THEMES = {
  meadow: { sky: ['#cfe9ff', '#fff0f5'], top: '#9be08a', dirt: '#d9a679', deep: '#b9825a', ink: '#4a3b3b', sea: '#8fd3ff' },
  dusk: { sky: ['#ffd6c9', '#e8d9ff'], top: '#ffb86b', dirt: '#c9806a', deep: '#9a5f5f', ink: '#4a3b3b', sea: '#b7a6ff' },
  mint: { sky: ['#d9f7ee', '#f0fbff'], top: '#7fdcc0', dirt: '#8fb8c9', deep: '#6d93a8', ink: '#3d4a4a', sea: '#9edcff' },
  candy: { sky: ['#ffe3ee', '#e9f4ff'], top: '#ff9fc2', dirt: '#e0b3d9', deep: '#b88dc4', ink: '#4a3b4a', sea: '#ffc6e1' },
};
export const THEME_NAMES = Object.keys(THEMES);
export const RECIPES = [
  { id: 'plains', name: '草原丘陵', tag: '正中間一座大土丘，要用拋物線繞過去', type: 'hills', seed: 11, base: 400, amp: 16, waves: 1.2, rough: 2, peak: 175, caves: 0, floats: 0, theme: 'meadow' },
  { id: 'twin', name: '雙浮空島', tag: '兩隊各在一座浮空島，中間沒有路，掉下去就是海', type: 'islands', float: true, seed: 23, base: 340, amp: 8, waves: 1.6, rough: 2, caves: 0, floats: 2, theme: 'dusk' },
  { id: 'canyon', name: '泡泡峽谷', tag: '兩側高台夾著深谷，谷底有洞穴能繞背', type: 'canyon', seed: 37, base: 290, amp: 14, waves: 1.4, rough: 6, valley: 250, caves: 4, floats: 1, theme: 'candy' },
];
export const recipeById = id => RECIPES.find(r => r.id === id) || RECIPES[0];
const TYPES = ['hills', 'islands', 'canyon'];
// 把外來的配方（種子文字、AI 輸出）限制在安全範圍內；不認識的欄位全部丟掉
export function sanitizeRecipe(o = {}) {
  const num = (v, a, b, d) => (Number.isFinite(Number(v)) ? clamp(Number(v), a, b) : d), type = TYPES.includes(o.type) ? o.type : 'hills';
  const r = { id: 'gen', name: String(o.name || '新地圖').replace(/[\u0000-\u001f<>]/g, '').slice(0, 10) || '新地圖', tag: String(o.tag || '隨機地形').replace(/[\u0000-\u001f<>]/g, '').slice(0, 20),
    type, seed: num(o.seed, 1, 4294967295, 1) >>> 0, base: num(o.base, 280, 420, 380), amp: num(o.amp, 10, 70, 40), waves: num(o.waves, 1, 3.4, 2), rough: num(o.rough, 0, 10, 5), peak: type === 'hills' ? num(o.peak, 0, 130, 0) : 0,
    caves: Math.round(num(o.caves, 0, 4, 1)), floats: Math.round(num(o.floats, 0, 4, 1)), theme: THEMES[o.theme] ? o.theme : 'meadow' };
  if (type === 'islands' && o.float) r.float = true; // 兩座浮空島，不用 gap
  else if (type === 'islands') { const w = num(o.gapWidth, 120, 230, 170), c = num(o.gapCenter, 560, 640, 600); r.gap = [Math.round(c - w / 2), Math.round(c + w / 2)]; }
  if (type === 'canyon') r.valley = num(o.valley, 60, 170, 120);
  return r;
}
// 玩家輸入的種子（文字或數字）→ 一張新地圖
export function recipeFromSeed(seed) {
  const s = typeof seed === 'number' ? seed >>> 0 : hashSeed(seed), rng = rngFrom(s), type = TYPES[Math.floor(rng() * 3)];
  return sanitizeRecipe({ name: '新地圖', type, seed: s || 1, base: 340 + rng() * 60, amp: 20 + rng() * 40, waves: 1.2 + rng() * 1.8, rough: rng() * 8, caves: Math.floor(rng() * 4), floats: Math.floor(rng() * 4), peak: rng() < .5 ? 40 + rng() * 80 : 0,
    theme: THEME_NAMES[Math.floor(rng() * THEME_NAMES.length)], gapWidth: 130 + rng() * 90, gapCenter: 570 + rng() * 60, valley: 80 + rng() * 80 });
}
export const themeOf = r => THEMES[r.theme] || THEMES.meadow;
const SPAWN_X = [[120, 210, 300], [900, 990, 1080]];
export function generateTerrain(r) {
  const rng = rngFrom(r.seed), m = new Uint8Array(W * H), h = new Float32Array(W), ph = [rng() * 6.28, rng() * 6.28, rng() * 6.28], knots = Array.from({ length: 52 }, () => rng() * 2 - 1);
  for (let x = 0; x < W; x++) {
    const u = x / W * Math.PI * 2 * r.waves, k = x / 24, k0 = Math.floor(k), f = k - k0, n = knots[k0] * (1 - f * f * (3 - 2 * f)) + knots[Math.min(51, k0 + 1)] * (f * f * (3 - 2 * f));
    let y = r.base + r.amp * (Math.sin(u + ph[0]) * .6 + Math.sin(u * 2.3 + ph[1]) * .3 + Math.sin(u * 5.1 + ph[2]) * .1) + n * r.rough;
    if (r.peak) y -= r.peak * Math.exp(-(((x - W / 2) / (W * .1)) ** 2));
    if (r.type === 'canyon') y += r.valley * Math.exp(-(((x - W / 2) / (W * .145)) ** 2));
    h[x] = clamp(y, 150, H - 80);
  }
  // 兩側出生區壓成同一個高度，雙方公平
  const level = clamp(r.base, r.type === 'canyon' ? 280 : 330, 410), blend = x => clamp((x < 600 ? Math.min(x - 60, 360 - x) : Math.min(x - 840, 1140 - x)) / 50, 0, 1), sm = t => t * t * (3 - 2 * t);
  for (let x = 60; x <= 360; x++) h[x] += (level - h[x]) * sm(blend(x));
  for (let x = 840; x <= 1140; x++) h[x] += (level - h[x]) * sm(blend(x));
  if (r.float) { // 兩座浮空島：左右各一個底部圓弧的石塊，下面是空的，中間完全沒有連接
    for (const [x0, x1] of [[40, 430], [770, 1160]]) { const cx = (x0 + x1) / 2, hw = (x1 - x0) / 2; for (let x = x0; x <= x1; x++) { const u = (x - cx) / hw, d = 26 + 135 * Math.sqrt(Math.max(0, 1 - u * u)); for (let y = Math.round(h[x]); y < h[x] + d; y++) m[y * W + x] = 1; } }
  } else for (let x = 0; x < W; x++) for (let y = Math.round(h[x]); y < H; y++) m[y * W + x] = 1;
  if (r.type === 'islands' && r.gap && !r.float) {
    const [g0, g1] = r.gap;
    for (let x = g0; x < g1; x++) for (let y = 0; y < H; y++) m[y * W + x] = 0;
    for (let x = g0 - 24; x < g1 + 24; x++) for (let y = Math.round(level) - 6; y < Math.round(level) + 8; y++) m[y * W + x] = 1; // 長橋
  }
  for (let i = 0; i < r.floats; i++) { // 空中平台
    const cx = 380 + rng() * 440, cy = 180 + rng() * 110, rx = 40 + rng() * 40, ry = 9 + rng() * 5;
    for (let y = Math.floor(cy - ry); y <= cy + ry; y++) for (let x = Math.floor(cx - rx); x <= cx + rx; x++) if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1) m[y * W + x] = 1;
  }
  for (let i = 0; i < r.caves; i++) { const cx = 380 + rng() * 440, hy = h[Math.round(cx)], cy = hy + 70 + rng() * Math.max(10, H - hy - 150); carve(m, cx, cy, 24 + rng() * 26, 0); carve(m, cx + 30 + rng() * 20, cy + (rng() - .5) * 30, 18 + rng() * 14, 0); }
  // 出生區上方不留任何東西（空中平台蓋在頭上會卡住）
  for (const xs of SPAWN_X) for (let x = xs[0] - 40; x <= xs[2] + 40; x++) for (let y = 0; y < Math.round(h[x]) - 1; y++) m[y * W + x] = 0;
  return { mask: m, float: !!r.float, spawns: SPAWN_X.map(xs => xs.map(x => [x, groundY(m, x)])) };
}

/* ---------- 彈道 ---------- */
// 回傳 { path: [x, y, ...]（每 SAMPLE 步取一點）, x, y（落點）, kind: 'terrain' | 'char' | 'out', hit（命中的角色 id）, vx, vy, steps }
export function simulate(m, chars, x0, y0, angle, power, ignore = -1) {
  const a = angle * Math.PI / 180, v = SHOT.V0 + (SHOT.V1 - SHOT.V0) * clamp(power, 0, 1), dt = SHOT.DT;
  let vx = Math.cos(a) * v, vy = -Math.sin(a) * v, x = x0, y = y0; const path = [r1(x), r1(y)];
  for (let i = 1; i <= SHOT.MAX_STEPS; i++) {
    vy += SHOT.G * dt; const px = x, py = y; x += vx * dt; y += vy * dt;
    if (i % SHOT.SAMPLE === 0) path.push(r1(x), r1(y));
    if (x < -60 || x > W + 60 || y > H + 80) { path.push(r1(x), r1(y)); return { path, x, y, kind: 'out', hit: -1, vx, vy, steps: i }; }
    if (y >= 0 && solid(m, x, y)) { path.push(r1(px), r1(py)); return { path, x: px, y: py, kind: 'terrain', hit: -1, vx, vy, steps: i }; }
    for (const c of chars) if (c.alive && c.id !== ignore && (c.x - x) ** 2 + (c.y - CHAR.R - y) ** 2 < (CHAR.R + 3) ** 2) { path.push(r1(x), r1(y)); return { path, x, y, kind: 'char', hit: c.id, vx, vy, steps: i }; }
  }
  path.push(r1(x), r1(y)); return { path, x, y, kind: 'out', hit: -1, vx, vy, steps: SHOT.MAX_STEPS };
}
// 出生區是否平整、雙方互相打得到、地形比例合理
export function validateTerrain(t) {
  const why = [], m = t.mask; let n = 0; for (let i = 0; i < m.length; i++) n += m[i];
  const frac = n / m.length; if (frac < (t.float ? .09 : .16) || frac > .62) why.push(`solid ${frac.toFixed(2)}`);
  for (const [ti, sp] of t.spawns.entries()) {
    for (const [x, y] of sp) { if (y < 120 || y > H - 120) why.push(`spawn y ${y}`); if (solid(m, x, y - CHAR.HEAD) || solid(m, x, y)) why.push('spawn blocked'); }
    if (Math.max(...sp.map(s => s[1])) - Math.min(...sp.map(s => s[1])) > 6) why.push(`team ${ti} not flat`);
  }
  if (Math.abs(t.spawns[0][1][1] - t.spawns[1][1][1]) > 20) why.push('unfair height');
  let ok = false; const [sx, sy] = t.spawns[0][2], [tx, ty] = t.spawns[1][0]; // 前排對前排
  for (let ang = 20; ang <= 80 && !ok; ang += 3) for (let p = .3; p <= 1.001 && !ok; p += .05) { const s = simulate(m, [], sx, sy - CHAR.R, ang, p); if (s.kind === 'terrain' && Math.hypot(s.x - tx, s.y - (ty - CHAR.R)) < 40) ok = true; }
  if (!ok) why.push('no shot between teams');
  return { ok: why.length === 0, why };
}
// 種子不合格就換下一個種子，最多試 20 次；回傳 { recipe, terrain }
export function buildTerrain(recipe) {
  let r = recipe, t = generateTerrain(r);
  for (let i = 0; i < 20 && !validateTerrain(t).ok; i++) { r = { ...r, seed: ((r.seed * 1664525 + 1013904223) >>> 0) || 1 }; t = generateTerrain(r); }
  return { recipe: r, terrain: t };
}

/* ---------- 建立一場 ---------- */
// humans: [{ uid, name, color, ear, team, seat }]；沒有 team / seat 的人放到人少的那隊第一個空位。空位補電腦。
// waitReady: 開局停在 ready 階段，所有真人按就緒（或 RULES.READY 秒到）才開始第 1 輪
const BOT_ERR = 12; // 電腦瞄準誤差（度）；數字越大越容易打歪
export function createGame({ seed = 1, recipe = RECIPES[0], humans = [], botErr = BOT_ERR, waitReady = false } = {}) {
  const rng = rngFrom(seed), { recipe: rc, terrain } = buildTerrain(recipe), used = new Set(), seats = [[null, null, null], [null, null, null]];
  for (const h of humans.slice(0, MAX_PLAYERS)) {
    let t = h.team === 0 || h.team === 1 ? h.team : seats[0].filter(Boolean).length <= seats[1].filter(Boolean).length ? 0 : 1, s = Number.isInteger(h.seat) && h.seat >= 0 && h.seat < 3 && !seats[t][h.seat] ? h.seat : seats[t].indexOf(null);
    if (s < 0) { t = 1 - t; s = seats[t].indexOf(null); } if (s < 0) continue;
    seats[t][s] = h;
  }
  const pickColor = c => { if (!COLORS.includes(c) || used.has(c)) c = COLORS.find(k => !used.has(k)) || COLORS[0]; used.add(c); return c; };
  const names = [...BOT_NAMES]; for (let i = names.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [names[i], names[j]] = [names[j], names[i]]; }
  const earKeys = Object.keys(EARS), chars = [];
  for (let t = 0; t < 2; t++) for (let s = 0; s < 3; s++) {
    const h = seats[t][s], [x, y] = terrain.spawns[t][s];
    chars.push({ id: chars.length, uid: h ? String(h.uid ?? chars.length) : null, name: h ? String(h.name || '玩家').slice(0, 12) : names.pop(), human: !!h, team: t, seat: s, color: pickColor(h?.color), ear: h && EARS[h.ear] ? h.ear : earKeys[Math.floor(rng() * 4)], eye: h ? (Object.hasOwn(EYES, h.eye) ? h.eye : 'dot') : EYE_KEYS[chars.length % EYE_KEYS.length], body: h && BODIES.includes(h.body) ? h.body : BODIES[0], blush: h && BLUSHES.includes(h.blush) ? h.blush : BLUSHES[0],
      x, y, hp: CHAR.HP, alive: true, money: RULES.START_MONEY, items: { ...RULES.START_ITEMS }, bought: {}, kills: 0, glove: false, shield: false, face: t ? -1 : 1, stamina: CHAR.STAMINA, move: 0, acc: 0, ai: h ? null : { err: botErr }, ready: !h, off: false });
  }
  const g = { seed: seed >>> 0, rng, recipe: rc, theme: themeOf(rc), mask: terrain.mask, chars, round: 0, order: [], idx: -1, cur: -1, phase: 'turn', turnT: 0, shopT: 0, offer: [], fired: false, resolveT: 0, botT: 0, aim: null, over: false, result: null, hp10: null, events: [], collapseStage: 0, bombs: [], bombSeq: 0, readyT: 0 };
  if (waitReady) { g.phase = 'ready'; g.readyT = RULES.READY; } else startRound(g);
  return g;
}
export function setReady(g, id) { const c = g.chars[id]; if (!c || g.phase !== 'ready' || c.ready) return false; c.ready = true; ev(g, { e: 'ready', id }); return true; }
// ready 階段調整隊伍。座位 id = 隊伍 * 3 + 座位，位置固定；換座位是把兩格的身分互換。off = 這格不補電腦、這場沒有角色
const IDENT = ['uid', 'name', 'human', 'color', 'ear', 'eye', 'body', 'blush', 'ai', 'off', 'alive', 'hp', 'ready'];
const fielded = (g, t) => g.chars.filter(c => c.team === t && !c.off).length;
function seatsChanged(g) { for (const c of g.chars) c.ready = c.uid == null || !c.human; ev(g, { e: 'seats' }); } // 隊伍變了，大家重新按就緒
// 真人換到一個沒有真人的座位；換完任一隊沒有角色就不准
export function moveSeat(g, id, to) {
  const a = g.chars[id], b = g.chars[to]; if (g.phase !== 'ready' || !a || !b || a === b || a.uid == null || b.uid != null) return false;
  const swap = () => { for (const k of IDENT) [a[k], b[k]] = [b[k], a[k]]; }; swap();
  if (!fielded(g, 0) || !fielded(g, 1)) { swap(); return false; }
  seatsChanged(g); return true;
}
// 沒有真人的座位切換「電腦／不補」；不能把一隊的最後一個角色關掉
export function toggleBot(g, slot) {
  const c = g.chars[slot]; if (g.phase !== 'ready' || !c || c.uid != null) return false;
  if (!c.off && fielded(g, c.team) <= 1) return false;
  c.off = !c.off; c.alive = !c.off; c.hp = c.off ? 0 : CHAR.HP; seatsChanged(g); return true;
}
const ev = (g, e) => g.events.push(e);
const teamHp = (g, t) => g.chars.filter(c => c.alive && c.team === t).reduce((a, c) => a + c.hp, 0);
const alive = (g, t) => g.chars.filter(c => c.alive && (t == null || c.team === t));

/* ---------- 角色移動與重力 ---------- */
function supported(m, c) { return solid(m, c.x, c.y + 1) || solid(m, c.x - 4, c.y + 1) || solid(m, c.x + 4, c.y + 1); }
// 沒有支撐就往下掉，掉出地圖算死亡（虛空）
function settle(g, c) {
  while (c.y < H + 30 && !supported(g.mask, c)) c.y++;
  if (c.y >= H) { c.alive = false; c.hp = 0; c.y = H + 30; }
}
// 沿地面走 dist 點；爬不上的陡坡或頭頂有地會擋住，走出懸崖會掉下去
export function walk(g, c, dir, dist) {
  const m = g.mask; let moved = 0;
  while (moved < dist && c.stamina > 0 && c.alive) {
    const nx = c.x + dir; if (nx < 8 || nx > W - 8) break;
    let ny = null; for (let yy = Math.floor(c.y) - CHAR.STEP; yy <= c.y + CHAR.DROP; yy++) if (solid(m, nx, yy + 1) && !solid(m, nx, yy)) { ny = yy; break; }
    if (ny != null && (solid(m, nx, ny - CHAR.HEAD) || solid(m, nx, ny - 12))) break;
    if (ny == null) { if (solid(m, nx, c.y - 12)) break; c.x = nx; settle(g, c); } else { c.x = nx; c.y = ny; }
    c.stamina -= 1; moved++; c.face = dir;
  }
  return moved;
}
// 跳：花 JUMP_COST 點體力，往 dir 方向拋出一小段弧線（沒方向就朝面向的那邊），撞到牆就不再往前、撞到頭頂就開始下落，落在第一個站得住的地方；掉出地圖算死亡。回傳弧線的點給畫面播動畫
export function jump(g, id, dir) {
  const c = g.chars[id]; if (!c || g.over || g.phase !== 'turn' || g.cur !== id || g.fired || !c.alive || c.stamina < CHAR.JUMP_COST || !supported(g.mask, c)) return false;
  dir = clamp(Math.round(Number(dir) || 0), -1, 1) || c.face || 1; const m = g.mask, dt = 1 / 60;
  let x = c.x, y = c.y, vx = dir * CHAR.JUMP_VX, vy = -CHAR.JUMP_VY; const path = [r1(x), r1(y)];
  for (let i = 1; i <= 120; i++) {
    vy += SHOT.G * dt; let nx = clamp(x + vx * dt, 8, W - 8), ny = y + vy * dt;
    if (solid(m, nx, ny - 12) || solid(m, nx, ny - CHAR.HEAD)) { nx = x; if (solid(m, nx, ny - 12) || solid(m, nx, ny - CHAR.HEAD)) { vy = Math.max(vy, 0); ny = y; } } // 前面是牆或頭上是地
    x = nx; y = ny; if (i % 3 === 0) path.push(r1(x), r1(y));
    if (vy > 0 && supported(m, { x, y })) { y = Math.floor(y); break; }
    if (y >= H) break;
  }
  c.stamina -= CHAR.JUMP_COST; c.x = x; c.y = y; c.face = dir; c.acc = 0;
  path.push(r1(x), r1(y)); if (c.y >= H) { c.alive = false; c.hp = 0; c.y = H + 30; }
  ev(g, { e: 'jump', id, dir, path, stamina: Math.round(c.stamina) }); return true;
}
// 用剩下的體力往 dir 一直走，能走到哪裡；不改遊戲狀態。pts 每隔約 6 點取一個落腳點，fell = 會走下懸崖掉進虛空
export function walkReach(m, x, y, dir, stamina) {
  const c = { x, y, alive: true, stamina, face: dir }, g = { mask: m }, pts = [x, y];
  while (c.stamina > 0 && c.alive && walk(g, c, dir, 1)) if (c.alive && Math.abs(c.x - pts[pts.length - 2]) >= 6) pts.push(c.x, c.y);
  if (c.alive && pts[pts.length - 2] !== c.x) pts.push(c.x, c.y);
  return { x: c.alive ? c.x : pts[pts.length - 2], y: c.alive ? c.y : pts[pts.length - 1], fell: !c.alive, pts };
}
// 水泥牆：寬 WALL.W、從落點往上長 WALL.H（往下也埋進地裡一點），上面兩角是圓的。只補地形，不挖；回傳範圍 [x0, y0, x1, y1] 給畫面局部更新
export const WALL = { W: 56, H: 110, SINK: 24, ROUND: 14 };
export function growWall(m, cx, cy) {
  const hw = WALL.W / 2, top = cy - WALL.H, x0 = Math.max(0, Math.floor(cx - hw)), x1 = Math.min(W - 1, Math.ceil(cx + hw)), y0 = Math.max(0, Math.floor(top)), y1 = Math.min(H - 1, Math.ceil(cy + WALL.SINK));
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const dx = Math.abs(x - cx); if (dx > hw) continue;
    if (y < top + WALL.ROUND) { const k = WALL.ROUND - (y - top); if (dx > hw - WALL.ROUND + Math.sqrt(Math.max(0, WALL.ROUND * WALL.ROUND - k * k))) continue; }
    m[y * W + x] = 1;
  }
  return [x0, y0, x1, y1];
}
// 水泥球命中後長出土牆：命中前站得住的人被牆往上頂到牆頂；沒有立足點（例如在空中被打中）的人被包在牆裡，要炸開牆才出得來
function wallUp(g, x, y, t, fx, wasOn) {
  growWall(g.mask, x, y); fx.push({ t, k: 'wall', x: r1(x), y: r1(y) });
  for (const c of g.chars) {
    if (!c.alive || !(solid(g.mask, c.x, c.y) || solid(g.mask, c.x, c.y - 12))) continue;
    if (wasOn.get(c.id)) for (let k = 0; k < WALL.H + WALL.SINK + 30 && solid(g.mask, c.x, c.y); k++) c.y--;
  }
}
// 牽引水球：範圍內所有活著的角色（含隊友與自己）往中心拉近 85%，拉到地裡的往上浮出來，之後由 settleAll 處理掉下去的
const PULL = .85;
function pullAll(g, x, y, r, t, fx) {
  fx.push({ t, k: 'pull', x: r1(x), y: r1(y), r });
  for (const c of g.chars) {
    if (!c.alive || Math.hypot(c.x - x, c.y - CHAR.R - y) >= r + CHAR.R) continue;
    const nx = clamp(c.x + (x - c.x) * PULL, 8, W - 8); let ny = c.y; for (let k = 0; k < 40 && solid(g.mask, nx, ny); k++) ny--;
    if (!solid(g.mask, nx, ny)) { c.x = nx; c.y = ny; }
  }
}
// 爆炸後角色被推開一點（不穿進地裡）
function push(m, c, fx, dist) {
  const nx = clamp(c.x + fx * dist, 8, W - 8); let ny = c.y; for (let k = 0; k < 24 && solid(m, nx, ny); k++) ny--; if (!solid(m, nx, ny)) { c.x = nx; c.y = ny; }
}

/* ---------- 錢、傷害、爆炸 ---------- */
const money = (g, c, d) => { const before = c.money; c.money = Math.max(0, c.money + d); if (c.money !== before) return { id: c.id, money: c.money }; return null; };
// 一次爆炸：挖洞、傷害範圍內所有活著的角色（含自己與隊友）、換算金錢。fx 收集畫面用的效果（t = 距離發射的毫秒數）
function explode(g, shooter, x, y, r, dmg, carveR, t, fx, freeze = false) {
  const box = carve(g.mask, x, y, carveR, 0); fx.push({ t, k: 'boom', x: r1(x), y: r1(y), r, c: carveR, box });
  for (const c of g.chars) {
    if (!c.alive || dmg <= 0) continue;
    const d = Math.hypot(c.x - x, c.y - CHAR.R - y), reach = r + CHAR.R; if (d >= reach) continue;
    let dealt = Math.max(1, Math.round(dmg * (1 - d / reach)));
    if (c.shield) { c.shield = false; fx.push({ t, k: 'shield', id: c.id }); dealt = 0; }
    else {
      c.hp = Math.max(0, c.hp - dealt); const killed = c.hp <= 0; if (killed) { c.alive = false; if (shooter && c.team !== shooter.team) shooter.kills++; } // 只算擊敗對手，不算隊友與自己
      fx.push({ t, k: 'hit', id: c.id, dmg: dealt, hp: c.hp, dead: killed });
      if (freeze && !killed) { c.frozen = true; fx.push({ t, k: 'freeze', id: c.id }); }
      if (shooter && c.id !== shooter.id) { const mate = c.team === shooter.team, base = Math.floor(dealt * (mate ? RULES.MATE_LOSS : RULES.HIT_GAIN)), delta = (mate ? -1 : 1) * (base + (killed ? RULES.KILL : 0)), me = money(g, shooter, delta); if (me) fx.push({ t, k: 'money', ...me, delta }); }
      if (!killed) push(g.mask, c, Math.sign(c.x - x) || (g.rng() < .5 ? -1 : 1), Math.round(14 * (1 - d / reach)));
    }
  }
}
const settleAll = (g, before, fx, t) => {
  for (const c of g.chars) if (c.alive) settle(g, c); // 被炸死的角色留在原地
  for (const c of g.chars) { const b = before.get(c.id); if (b && (b.x !== c.x || b.y !== c.y || b.alive !== c.alive)) fx.push({ t, k: 'move', id: c.id, x: r1(c.x), y: r1(c.y), dead: !c.alive, fell: c.y > b.y + 2 }); }
};
const snapPos = g => new Map(g.chars.map(c => [c.id, { x: c.x, y: c.y, alive: c.alive }]));

/* ---------- 買、用、瞄準、發射 ---------- */
const turnChar = g => g.chars[g.cur];
export function buy(g, id, item) {
  const c = g.chars[id]; if (g.over || g.phase !== 'turn' || g.cur !== id || g.shopT <= 0 || !g.offer.includes(item) || c.money < ITEMS[item].price) return false;
  if (ITEMS[item].limit && (c.bought[item] || 0) >= ITEMS[item].limit) return false;
  c.bought[item] = (c.bought[item] || 0) + 1; c.money -= ITEMS[item].price; c.items[item] = (c.items[item] || 0) + 1; ev(g, { e: 'buy', id, item, money: c.money }); return true;
}
// 這一回合還沒出現過、這個角色還買得到的道具
const unseen = (g, c, P) => P.filter(i => !g.seen.includes(i) && !(ITEMS[i].limit && (c.bought[i] || 0) >= ITEMS[i].limit));
export const offerLeft = (g, c) => unseen(g, c, POOL).length;
// 商店一批 3 個：前兩個是攻擊道具，最後一個固定是支援道具；沒有新的就少給
function drawOffer(g, c) {
  const atk = unseen(g, c, POOL_ATK), sup = unseen(g, c, POOL_SUP), offer = [];
  for (let i = 0; i < RULES.SHOP_SIZE - 1 && atk.length; i++) offer.push(atk.splice(Math.floor(g.rng() * atk.length), 1)[0]);
  if (sup.length) offer.push(sup[Math.floor(g.rng() * sup.length)]);
  return offer;
}
// 刷新商店：花 REFRESH 元換一批，這一回合出現過的不再出現；全部看過就不能再刷
export function refresh(g, id) {
  const c = g.chars[id]; if (g.over || g.phase !== 'turn' || g.cur !== id || g.fired || g.shopT <= 0 || c.money < RULES.REFRESH) return false;
  const offer = drawOffer(g, c); if (!offer.length) return false;
  c.money -= RULES.REFRESH; g.seen.push(...offer); g.offer = offer; ev(g, { e: 'refresh', id, offer, money: c.money, more: offerLeft(g, c) }); return true;
}
// 支援道具：每回合只能用一個，不佔發射。瞬間移動要帶 arg = { x, y }（點的位置），會落在那一欄該位置下方第一個站得住的地面
export function useItem(g, id, item, arg = {}) {
  const c = g.chars[id]; if (g.over || g.phase !== 'turn' || g.cur !== id || g.fired || !c.alive || g.supportUsed || !POOL_SUP.includes(item) || !(c.items[item] > 0)) return false;
  const e = { e: 'use', id, item, hp: c.hp };
  if (item === 'heal') c.hp = Math.min(CHAR.HP, c.hp + RULES.HEAL);
  else if (item === 'shoes') { if (g.frozenTurn) return false; c.stamina += CHAR.STAMINA; }
  else if (item === 'gloves') c.glove = true;
  else if (item === 'shield') { const ids = g.chars.filter(o => o.alive && o.team === c.team && Math.hypot(o.x - c.x, o.y - c.y) < ITEMS.shield.r).map(o => o.id); for (const i of ids) g.chars[i].shield = true; e.ids = ids; e.x = r1(c.x); e.y = r1(c.y); e.r = ITEMS.shield.r; }
  else if (item === 'teleport') {
    const x = clamp(Math.round(Number(arg.x)), 10, W - 10); let y = clamp(Math.round(Number(arg.y)), 0, H - 1); if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
    for (let k = 0; k < 60 && solid(g.mask, x, y); k++) y--;
    if (solid(g.mask, x, y)) return false; while (y < H && !solid(g.mask, x, y + 1)) y++; if (y >= H) return false;
    if (g.chars.some(o => o !== c && o.alive && Math.hypot(o.x - x, o.y - y) < CHAR.R * 2)) return false;
    c.x = x; c.y = y; c.move = 0; e.x = x; e.y = y;
  }
  c.items[item]--; g.supportUsed = true; e.hp = c.hp; e.stamina = Math.round(c.stamina); ev(g, e); return true;
}
export function setMove(g, id, dir) { const c = g.chars[id]; if (c && g.cur === id && g.phase === 'turn' && !g.fired) c.move = clamp(Math.round(Number(dir) || 0), -1, 1); }
export function setAim(g, id, a = {}) {
  const c = g.chars[id]; if (!c || g.cur !== id || g.phase !== 'turn' || g.fired) return;
  const angle = Number(a.angle), power = Number(a.power);
  g.aim = { id, angle: Number.isFinite(angle) ? r1(((angle % 360) + 360) % 360) : 0, power: Number.isFinite(power) ? clamp(Math.round(power * 100) / 100, 0, 1) : 0, item: a.item in ITEMS && (a.item === 'basic' || c.items[a.item] > 0) ? a.item : 'basic', charging: !!a.charging };
  if (Math.cos(g.aim.angle * Math.PI / 180) !== 0) c.face = Math.cos(g.aim.angle * Math.PI / 180) >= 0 ? 1 : -1;
}
// 發射。回傳這次的事件（彈道點串與各個效果的時間表）；失敗回傳 null
export function fire(g, id, { angle, power, item = 'basic' } = {}) {
  const c = g.chars[id]; if (g.over || g.phase !== 'turn' || g.cur !== id || g.fired || !c.alive) return null;
  angle = Number(angle); power = Number(power); if (!Number.isFinite(angle) || !Number.isFinite(power)) return null;
  if (!SHOTS.includes(item) || (item !== 'basic' && !(c.items[item] > 0))) return null;
  if (item !== 'basic') c.items[item]--;
  power = clamp(power, 0.05, 1); const spec = ITEMS[item], angles = item === 'triple' ? [angle - spec.spread, angle, angle + spec.spread] : [angle], before = snapPos(g), fx = [], shots = []; let tEnd = 0;
  c.move = 0; c.face = Math.cos(angle * Math.PI / 180) >= 0 ? 1 : -1;
  const reps = c.glove ? 2 : 1; c.glove = false;
  for (let rep = 0, off = 0; rep < reps; rep++, off = tEnd + 450) for (const a of angles) { // off：手套的第二輪等第一輪結束再丟
    // 延遲水球穿過角色，只停在地形上
    const rad = a * Math.PI / 180, s = simulate(g.mask, item === 'delay' ? [] : g.chars, c.x + Math.cos(rad) * 18, c.y - CHAR.R - Math.sin(rad) * 18, a, power, id), fl = Math.round(s.path.length / 2 * (SHOT.SAMPLE * SHOT.DT * 1000)), dur = off + fl;
    shots.push({ path: s.path, dur: fl, at: off }); tEnd = Math.max(tEnd, dur);
    if (s.kind === 'out') { fx.push({ t: dur, k: 'splash', x: r1(s.x), y: r1(Math.min(s.y, H)) }); continue; }
    if (item === 'delay') { const b = { id: ++g.bombSeq, owner: id, x: r1(s.x), y: r1(s.y) }; g.bombs.push(b); fx.push({ t: dur, k: 'plant', ...b }); continue; }
    if (item === 'drill' && s.kind === 'terrain') { // 順著方向鑽進地裡，彈道多出來的點是隧道
      const spd = Math.hypot(s.vx, s.vy) || 1, ux = s.vx / spd, uy = s.vy / spd, shot = shots[shots.length - 1]; shot.bore = spec.bore; shot.digFrom = s.path.length / 2 - 1;
      let x = s.x, y = s.y; for (let d = 6; d <= spec.len; d += 6) { x = s.x + ux * d; y = s.y + uy * d; carve(g.mask, x, y, spec.bore, 0); shot.path.push(r1(x), r1(y)); }
      const dig = Math.round(spec.len / spd * 1000); shot.dur = fl + dig; explode(g, c, x, y, spec.r, spec.dmg, Math.round(spec.r * .9), off + shot.dur, fx); tEnd = Math.max(tEnd, off + shot.dur); continue;
    }
    const wasOn = spec.wall ? new Map(g.chars.map(o => [o.id, o.alive && supported(g.mask, o)])) : null; // 水泥球：命中前誰站得住
    explode(g, c, s.x, s.y, spec.r, spec.dmg, Math.round(spec.r * (spec.pull ? .45 : spec.wall ? 0 : .9)), dur, fx, !!spec.freeze);
    if (spec.pull) pullAll(g, s.x, s.y, spec.r, dur, fx);
    if (spec.wall) wallUp(g, s.x, s.y, dur, fx, wasOn);
    if (item === 'scatter') tEnd = Math.max(tEnd, scatter(g, c, s.x, s.y, dur, fx, spec));
  }
  settleAll(g, before, fx, tEnd + 350);
  g.fired = true; g.phase = 'resolve'; g.resolveT = (tEnd + 900) / 1000 + RULES.PAD; g.aim = null;
  const e = { e: 'shot', id, item, angle: r1(angle), power: r1(power * 100) / 100, shots, fx, money: c.money, items: { ...c.items } }; ev(g, e); return e;
}
// 散射水球命中後往四周隨機彈出 spec.minis 顆小水球，各自落地爆炸；回傳最後一顆爆炸的時間
function scatter(g, c, x, y, t0, fx, spec) {
  let last = t0;
  for (let i = 0; i < spec.minis; i++) {
    const lx = clamp(Math.round(x + (g.rng() - .5) * 2 * 130), 10, W - 10); let ly = H; for (let yy = Math.max(0, Math.round(y) - 90); yy < H; yy++) if (solid(g.mask, lx, yy)) { ly = yy; break; }
    const rise = 40 + g.rng() * 50, path = []; for (let k = 0; k <= 10; k++) { const u = k / 10; path.push(r1(x + (lx - x) * u), r1(y + (ly - y) * u - 4 * rise * u * (1 - u))); }
    const start = t0 + 150 + i * 90, dur = 420, end = start + dur; last = Math.max(last, end);
    fx.push({ t: start, k: 'mini', path, dur });
    if (ly >= H) fx.push({ t: end, k: 'splash', x: lx, y: H }); else explode(g, c, lx, ly, spec.miniR, spec.miniDmg, Math.round(spec.miniR * .9), end, fx);
  }
  return last;
}
// 回合開始時引爆：發射者自己的延遲水球，以及發射者已經倒下的延遲水球。地面被挖掉的話先往下掉
function detonate(g, curId) {
  const due = g.bombs.filter(b => b.owner === curId || !g.chars[b.owner].alive); if (!due.length) return false;
  g.bombs = g.bombs.filter(b => !due.includes(b));
  const spec = ITEMS.delay, before = snapPos(g), fx = [];
  due.forEach((b, i) => {
    const t = i * 300; let y = Math.round(b.y); while (y < H && !solid(g.mask, b.x, y + 1)) y++;
    fx.push({ t, k: 'det', bid: b.id });
    if (y >= H) fx.push({ t, k: 'splash', x: b.x, y: H }); else explode(g, g.chars[b.owner], b.x, y, spec.r, spec.dmg, Math.round(spec.r * .9), t, fx);
  });
  settleAll(g, before, fx, due.length * 300 + 350); ev(g, { e: 'bomb', fx }); return true;
}

/* ---------- 電腦對手 ---------- */
// 在伺服器上試射一批角度與力度，挑最接近目標的；只用傳進來的資料，不改任何狀態
export function aimSolve(g, c, tx, ty, item = 'basic') {
  const spec = ITEMS[item] || ITEMS.basic, others = g.chars; let best = null;
  const score = (ang, p) => {
    const rad = ang * Math.PI / 180, s = simulate(g.mask, others, c.x + Math.cos(rad) * 18, c.y - CHAR.R - Math.sin(rad) * 18, ang, p, c.id); if (s.kind === 'out') return 1e9;
    let d = Math.hypot(s.x - tx, s.y - ty);
    for (const o of others) if (o.alive && o.team === c.team) { const dd = Math.hypot(s.x - o.x, s.y - CHAR.R - o.y); if (dd < spec.r + 18) d += (spec.r + 40 - dd) * 6; } // 別炸到自己人與自己
    return d;
  };
  const dirs = tx >= c.x ? [10, 80] : [100, 170];
  for (let ang = dirs[0]; ang <= dirs[1]; ang += 6) for (let p = .3; p <= 1.001; p += .1) { const d = score(ang, p); if (!best || d < best.d) best = { ang, p, d }; }
  if (!best) return null;
  const a0 = best.ang, p0 = best.p; for (let ang = a0 - 5; ang <= a0 + 5; ang += 1.5) for (let p = p0 - .08; p <= p0 + .081; p += .02) { if (p < .1 || p > 1) continue; const d = score(ang, p); if (d < best.d) best = { ang, p, d }; }
  return best;
}
function botAct(g) {
  const c = turnChar(g), enemies = g.chars.filter(o => o.alive && o.team !== c.team); if (!enemies.length) return;
  const ATK = ['heavy', 'triple', 'drill', 'scatter', 'freeze', 'delay', 'nuke'];
  // 買：血少先補或擋，其次有錢買攻擊道具，偶爾買手套、跑鞋、瞬間移動
  const want = () => (c.hp <= 55 && g.offer.includes('heal') ? 'heal' : c.hp <= 60 && !c.shield && g.offer.includes('shield') ? 'shield' : ATK.find(i => g.offer.includes(i) && !(c.items[i] > 1)) || (g.rng() < .4 ? ['gloves', 'shoes', 'teleport'].find(i => g.offer.includes(i)) : null));
  for (let k = 0; k < 2; k++) { const w = want(); if (w && c.money >= ITEMS[w].price + (g.rng() < .35 ? 20 : 0)) buy(g, c.id, w); }
  const target = enemies.reduce((b, o) => (Math.abs(o.x - c.x) + (o.hp < b.hp ? -30 : 0) < Math.abs(b.x - c.x) ? o : b), enemies[0]);
  // 支援道具每回合一個：先救自己，再看手套與跑鞋
  const far = Math.abs(target.x - c.x) > 420;
  if (c.hp <= 60 && c.items.heal > 0) useItem(g, c.id, 'heal');
  else if (c.hp <= 60 && !c.shield && c.items.shield > 0) useItem(g, c.id, 'shield');
  else if (c.hp <= 40 && c.items.teleport > 0) useItem(g, c.id, 'teleport', { x: c.team === 0 ? 90 + g.rng() * 400 : 710 + g.rng() * 400, y: 0 });
  else if (c.items.gloves > 0 && g.rng() < .7) useItem(g, c.id, 'gloves');
  else if (far && c.items.shoes > 0 && useItem(g, c.id, 'shoes')) walk(g, c, Math.sign(target.x - c.x) || 1, 100 + Math.floor(g.rng() * 60));
  // 核彈只在離得夠遠、不會炸到自己時才用
  const item = ATK.find(i => c.items[i] > 0 && (i !== 'nuke' || Math.abs(target.x - c.x) > ITEMS.nuke.r * 2)) || 'basic';
  let sol = aimSolve(g, c, target.x, target.y - CHAR.R, item);
  if (!sol || sol.d > 90) { walk(g, c, Math.sign(target.x - c.x) || 1, 40 + Math.floor(g.rng() * 30)); sol = aimSolve(g, c, target.x, target.y - CHAR.R, item) || sol; }
  if (!sol) { fire(g, c.id, { angle: target.x > c.x ? 45 : 135, power: .7, item: 'basic' }); return; }
  const err = (c.ai ? c.ai.err : BOT_ERR) * (g.rng() < .3 ? 2 : 1); // 三成機率手滑
  fire(g, c.id, { angle: sol.ang + (g.rng() - .5) * 2 * err, power: clamp(sol.p + (g.rng() - .5) * err * .02, .1, 1), item });
}

/* ---------- 輪與回合 ---------- */
function checkOver(g) {
  if (g.over) return true; const a0 = alive(g, 0).length, a1 = alive(g, 1).length; if (a0 && a1) return false;
  let win = null, reason = 'wipe'; if (!a0 && a1) win = 1; else if (a0 && !a1) win = 0; else { reason = g.round > ROUNDS ? 'collapse' : 'draw'; const h = g.hp10; if (g.round > ROUNDS && h && h[0] !== h[1]) win = h[0] > h[1] ? 0 : 1; }
  g.over = true; g.phase = 'over'; g.cur = -1;
  const pts = t => (win == null ? 3 : win === t ? 5 : 1);
  g.result = { reason, winnerTeam: win, rounds: g.round, players: g.chars.filter(c => !c.off).sort((x, y) => (win === y.team) - (win === x.team) || y.hp - x.hp).map((c, i) => ({ rank: i + 1, id: c.id, uid: c.uid, name: c.name, bot: !c.human, team: c.team, hp: c.hp, money: c.money, kills: c.kills, points: pts(c.team), win: win === c.team })) };
  ev(g, { e: 'end', result: g.result }); return true;
}
// 崩塌：第 k 次把離中線超過 (1 - k / 5) 個半寬的地形全部消失，第 5 次什麼都不剩
function collapse(g, stage) {
  const half = W / 2, bound = (1 - stage / STAGES) * half, before = snapPos(g), fx = [];
  for (let x = 0; x < W; x++) if (stage >= STAGES || Math.abs(x + .5 - half) > bound) for (let y = 0; y < H; y++) g.mask[y * W + x] = 0;
  g.collapseStage = stage; settleAll(g, before, fx, 900); ev(g, { e: 'collapse', stage, bound: r1(bound), fx });
}
function startRound(g) {
  g.round++; const events = [];
  if (g.round === ROUNDS + 1) g.hp10 = [teamHp(g, 0), teamHp(g, 1)];
  const h0 = teamHp(g, 0), h1 = teamHp(g, 1);
  for (const c of g.chars) if (c.alive) { const catchUp = (c.team === 0 ? h0 * 2 < h1 : h1 * 2 < h0) ? RULES.CATCHUP : 0; c.money += RULES.INCOME + catchUp; events.push({ id: c.id, money: c.money }); }
  ev(g, { e: 'round', round: g.round, money: events });
  if (g.round > ROUNDS) { collapse(g, g.round - ROUNDS); if (checkOver(g)) return; }
  const a = alive(g, 0), b = alive(g, 1), order = []; for (let i = 0; i < 3; i++) { if (a[i]) order.push(a[i].id); if (b[i]) order.push(b[i].id); }
  g.order = order; g.idx = -1; nextTurn(g);
}
function nextTurn(g) {
  if (checkOver(g)) return;
  do g.idx++; while (g.idx < g.order.length && !g.chars[g.order[g.idx]].alive);
  if (g.idx >= g.order.length) return startRound(g);
  const c = g.chars[g.order[g.idx]];
  if (detonate(g, c.id)) { if (checkOver(g)) return; if (!c.alive) return nextTurn(g); }
  g.seen = []; const offer = drawOffer(g, c); g.seen.push(...offer); g.supportUsed = false; g.frozenTurn = !!c.frozen;
  g.cur = c.id; g.phase = 'turn'; g.turnT = RULES.TURN; g.shopT = RULES.SHOP; g.offer = offer; g.fired = false; g.aim = null; c.stamina = c.frozen ? 0 : CHAR.STAMINA; c.frozen = false; c.move = 0; c.acc = 0; g.botT = .5 + g.rng() * .7;
  ev(g, { e: 'turn', id: c.id, round: g.round, offer, turnT: g.turnT, frozen: g.frozenTurn });
}
// 玩家掉線時由電腦接手；回來可以拿回
export function setHuman(g, id, human) { const c = g.chars[id]; if (c) { c.human = human; c.ai = human ? null : c.ai || { err: BOT_ERR }; } }
export function forfeit(g, id) { const c = g.chars[id]; if (!c || !c.alive) return; c.alive = false; c.hp = 0; ev(g, { e: 'out', id }); if (g.cur === id && !g.over) nextTurn(g); else checkOver(g); }

// 前進 dt 秒（建議固定 0.05）；回傳這段時間產生的事件
export function step(g, dt) {
  if (!g.over) {
    if (g.phase === 'ready') { g.readyT -= dt; if (g.readyT <= 0 || g.chars.every(c => c.ready || !c.human)) { g.phase = 'turn'; ev(g, { e: 'go' }); startRound(g); } } // 斷線的人交給電腦，不必等
    else if (g.phase === 'turn') {
      const c = turnChar(g); g.turnT -= dt; g.shopT = Math.max(0, g.shopT - dt);
      if (c.move && !g.fired && c.stamina > 0) { c.acc += CHAR.WALK * dt; const n = Math.floor(c.acc); c.acc -= n; if (n) walk(g, c, c.move, n); } // 累積小數，速度才準
      if (!c.alive) { ev(g, { e: 'fall', id: c.id, x: r1(c.x) }); nextTurn(g); return flush(g); } // 走下懸崖掉進水裡：這個人的回合結束，順便判斷勝負
      if (!c.human && !g.fired) { g.botT -= dt; if (g.botT <= 0) botAct(g); }
      if (g.turnT <= 0 && !g.fired) { ev(g, { e: 'skip', id: c.id }); nextTurn(g); }
    } else if (g.phase === 'resolve') { g.resolveT -= dt; if (g.resolveT <= 0) nextTurn(g); }
  }
  return flush(g);
}
const flush = g => { const out = g.events; g.events = []; return out; };

// 畫面用的快照。mask: true 時附上整張地形（開局與晚加入的人）；平常的更新不帶，爆炸只送事件
const r2 = v => Math.round(v * 100) / 100;
export function snapshot(g, { mask = true } = {}) {
  const c = g.cur >= 0 ? g.chars[g.cur] : null, bound = g.round >= ROUNDS ? r1((1 - (g.round + 1 - ROUNDS) / STAGES) * W / 2) : null;
  return {
    seed: g.seed, recipe: { id: g.recipe.id, name: g.recipe.name, theme: g.recipe.theme, type: g.recipe.type }, round: g.round, rounds: ROUNDS, phase: g.phase, over: g.over, collapse: g.collapseStage, warn: bound,
    turn: c ? { id: g.cur, turnT: r2(g.turnT), shopT: r2(g.shopT), offer: g.offer, more: g.seen ? offerLeft(g, c) : 0, sup: !!g.supportUsed, glove: !!c.glove, fired: g.fired, stamina: Math.round(c.stamina) } : null, aim: g.aim,
    readyT: g.phase === 'ready' ? Math.ceil(g.readyT) : null, bombs: g.bombs.map(b => ({ ...b })),
    chars: g.chars.map(c => ({ id: c.id, uid: c.uid, name: c.name, human: c.human, team: c.team, seat: c.seat, color: c.color, ear: c.ear, eye: c.eye, body: c.body, blush: c.blush, frozen: !!c.frozen, x: r1(c.x), y: r1(c.y), hp: c.hp, alive: c.alive, money: c.money, items: c.items, shield: c.shield, face: c.face, ready: c.ready, off: c.off })),
    mask: mask ? encodeMask(g.mask) : undefined, result: g.result,
  };
}
