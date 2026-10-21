// 泡泡派對：純規則（角色物理、衝撞、3 種擂台、道具、3 關計分、電腦），index.html（單人與畫面）和 worker.js（連線、伺服器判定）共用。
// 不碰 DOM / three.js / Math.random：亂數全部來自種子，同一組種子與輸入會重播出同樣結果。
// 座標單位是「格」，擂台中心在原點，x 往東、y 往北，z 是高度（地板 z = 0）。朝向 h 的前進方向是 (cos h, sin h)。
export const MAX_PLAYERS = 6, ROUNDS = 3;
export const COLORS = ['#ffb3c7', '#a8d8ff', '#ffe08a', '#a8e6cf', '#c9b6ff', '#ffc8a2', '#ff8a80', '#7fdbd0', '#8aa4ff', '#cfe88a', '#f29be0', '#c9a58a', '#ffffff', '#000000', '#ff0000'];
export const EARS = { be: '圓耳', pay: '長耳', fe: '尖耳', tool: '小芽', cat: '貓耳', bear: '熊耳', horn: '小角', bow: '蝴蝶結', ant: '觸角' };
export const EYES = { dot: '圓眼', big: '大眼', happy: '笑眼', sleepy: '瞇眼', sparkle: '閃亮', wink: '眨眼' };
const EYE_KEYS = Object.keys(EYES);
export const BODIES = ['#fffdf7', '#ffe9d6', '#e8f4ff', '#eafbe7', '#f3e8ff', '#fff3b8', '#f2d9c4', '#d9dde3', '#ffffff', '#000000', '#ff0000'];
export const BLUSHES = ['#ffa3b5', '#ff7d7d', '#ffc27a', '#ffe27a', '#9fd8ff', '#c4a3ff', '#ffffff', '#000000', '#ff0000'];
export const BOT_NAMES = ['麻糬', '湯圓', '布丁', '棉花', '豆花', '芋圓'];
export const POINTS = [5, 3, 2, 1]; // 總積分看板：3 關總分第 1 到 4 名的分數，第 5、6 名 0 分
export const DT = 1 / 60; // 固定步長；step(g, dt) 內部切成 DT 一步一步算
export const INTRO = 3, ROUND_MAX = 60, ROUND_END = 4; // 每關：介紹 INTRO 秒（不能動）→ 開打，最長 ROUND_MAX 秒 → 結算 ROUND_END 秒
// 角色物理（docs/party.md「角色物理」）。走路 WALK 格/秒，ACC 加速、STOP 放開後減速，空中加速度只剩 AIR 倍；
// 跳：起跳 JUMP 格/秒、重力 G（最高 1.2 格、滯空 0.6 秒）；衝撞：DASH_T 秒內 DASH_V 格/秒，冷卻 DASH_CD；
// 空中按衝撞是飛撲：水平 DIVE_V、往上補到 DIVE_UP，落地趴 PRONE 秒；
// 被撞中：沿衝撞方向飛出 KNOCK_V、往上 KNOCK_UP，暈 STUN 秒，同一關每被撞 1 次飛出 +GROW（最多算 GROW_MAX 次）；
// 速度超過走路速度（被撞飛還在滑）時只靠 FRIC 減速，玩家只能出 SLIDE_CTRL 倍的力小幅修正；
// 命中範圍 HIT_R（身體相碰是 2R）、高度差 HIT_Z 以內才撞得到，所以跳起來可以閃；
// 正面互撞（兩人都在衝、方向的 cos 小於 CLASH_COS）各往後彈 CLASH_V；走路互碰交換 BUMP 比例的接近速度；
// 腳下沒地板、掉到 FALL_Z 以下就爬不回來，OUT_Z 以下出局
export const BODY = {
  R: .5, WALK: 5, ACC: 30, STOP: 33, AIR: .4, TURN: 14, JUMP: 8, G: 26.7,
  DASH_V: 12, DASH_T: .25, DASH_CD: 1.2, DIVE_V: 7, DIVE_UP: 4, PRONE: .5,
  KNOCK_V: 6, KNOCK_UP: 3, STUN: .5, GROW: .25, GROW_MAX: 4, FRIC: 12, SLIDE_CTRL: .25,
  HIT_R: 1.2, HIT_Z: .8, CLASH_COS: -.5, CLASH_V: 6, CLASH_STUN: .15, BUMP: .5, FALL_Z: -.2, OUT_Z: -6,
};
// 擂台：r 圓台半徑；開打 shrinkAt 秒起每 every 秒縮 1 格，縮到 minR 停；spawn 是開場站位的半徑；items 會不會出道具。
// 掃把擂台 bar：中心一根長 len、高 h、粗 w 的旋轉棒（逆時針），起始每秒 spin 弧度，每 every 秒乘 faster；
// 掃到沒跳過的人沿棒子轉的方向、再往外 out 比例飛出 knock 格/秒，暈 stun 秒，cd 秒內不會再被掃到（不然棒子追上來連續打）；
// 中心柱子半徑 hub，走不進去。開打時棒子停在某個人正後方，第一個被掃到的人有將近 1 秒準備
// 蜂巢擂台 hex：rings 圈六角地板（91 格），size 是六角形外接圓半徑；踩上去 crack 秒後變色，再 drop 秒掉下去
export const ARENAS = {
  ring: { name: '泡泡擂台', rule: '把別人擠下去！擂台會越縮越小', r: 9, shrinkAt: 25, every: 5, minR: 3, spawn: 5.5, items: true },
  sweep: { name: '掃把擂台', rule: '旋轉棒掃過來就跳！它會越轉越快', r: 8, spawn: 5, items: true, bar: { len: 8, h: .5, w: .3, spin: Math.PI * 2 / 4.5, faster: 1.2, every: 10, knock: 7, out: .5, stun: .35, cd: 1, hub: .8 } },
  hex: { name: '蜂巢擂台', rule: '踩過的地板會掉下去，看準時機換格子！', r: 9, spawn: 5, items: false, hex: { rings: 5, size: 1, crack: 1, drop: .5 } },
};
export const ARENA_IDS = Object.keys(ARENAS);
// 道具（docs/party.md「道具」）：撿到立刻生效。speed 走路 ×mult、衝撞冷卻減半；shield 擋一次被撞飛或燙手泡泡；
// giant 身體 ×scale、被撞飛出 ×take、撞人飛出 ×give、走路 ×walk；
// hot 燙手泡泡：飛 fly 秒黏上最近的對手，fuse 秒後爆炸，碰到別人就傳過去（剛傳走的 pass 秒內傳不回來，剩不到 min 秒補到 min），
// 爆炸把身上有泡泡的人從中心往外炸飛 boom 格/秒、暈 stun 秒
export const ITEMS = {
  speed: { label: '速度鞋', time: 3, mult: 1.5 },
  shield: { label: '泡泡盾', time: 8 },
  giant: { label: '變大', time: 5, scale: 1.5, take: .5, give: 1.5, walk: .85 },
  hot: { label: '燙手泡泡', fly: .4, fuse: 5, min: 1.5, pass: .5, boom: 12, stun: .8 },
};
export const ITEM_KINDS = Object.keys(ITEMS);
export const ITEM_SPAWN = { every: 8, max: 2, edge: 2, hub: 1.6, pick: .45 }; // 每 every 秒出一顆，場上最多 max 顆，離邊緣至少 edge 格、離中心柱至少 hub 格；碰到身體外 pick 格內就撿到
// 六角地板（尖頂朝北）：軸座標 (q, r)，中心 x = size·√3·(q + r/2)、y = size·1.5·r
export const HEX = (() => {
  const { rings, size } = ARENAS.hex.hex, tiles = [], index = new Map();
  for (let q = -rings; q <= rings; q++) for (let r = -rings; r <= rings; r++) {
    if (Math.abs(q + r) > rings) continue;
    index.set(q + ',' + r, tiles.length); tiles.push({ q, r, x: size * Math.sqrt(3) * (q + r / 2), y: size * 1.5 * r });
  }
  const DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
  for (const t of tiles) {
    t.nb = DIRS.map(([dq, dr]) => index.get(t.q + dq + ',' + (t.r + dr))).filter(i => i != null);
    t.far = DIRS.map(([dq, dr]) => index.get(t.q + 2 * dq + ',' + (t.r + 2 * dr))).filter(i => i != null); // 同方向隔一格：中間是洞時跳過去的落點
  }
  return { tiles, index, size };
})();
export function hexAt(x, y) {
  const S = HEX.size, fq = (Math.sqrt(3) / 3 * x - y / 3) / S, fr = (2 / 3 * y) / S, fs = -fq - fr;
  let q = Math.round(fq), r = Math.round(fr); const s = Math.round(fs);
  const dq = Math.abs(q - fq), dr = Math.abs(r - fr), ds = Math.abs(s - fs);
  if (dq > dr && dq > ds) q = -r - s; else if (dr > ds) r = -q - s;
  return HEX.index.get(q + ',' + r) ?? -1;
}
// 電腦難度：react 多久重新判斷一次（反應延遲）、aim 衝撞方向誤差（弧度）、dodge 看到別人衝過來時跳起來閃的機率、
// rest 衝完之後再等幾秒（最少、最多）才找下一次機會，沒有這段 6 台電腦一關不到 10 秒就打完；edge 離邊緣幾格內先回中間；
// picky 撞不下台的機會有多少比例放掉（衝完自己會停在邊緣附近，亂衝反而變成下一個目標）；
// jump 跳旋轉棒的時機誤差（秒），miss 旋轉棒來了忘記跳的機率；wait 蜂巢擂台腳下的格子剩幾秒才換格，pick 挑格子時加的亂數（越大越常挑到死路）
export const DIFFS = {
  normal: { label: '普通', react: .3, aim: .35, dodge: .2, rest: [3, 5], edge: 1.5, picky: 0, jump: .08, miss: .1, wait: .45, pick: 3 },
  hard: { label: '困難', react: .12, aim: .14, dodge: .6, rest: [2, 3.5], edge: 1.5, picky: .7, jump: .03, miss: .02, wait: .35, pick: .4 },
};
const DASH_REACH = 2.6, AIM_OFF = 1.5, SWEEP_IN = 3; // 電腦：目標在 DASH_REACH 格內才衝；站在目標靠中心那一側 AIM_OFF 格；掃把擂台不進中心 SWEEP_IN 格內
const SELF_FALL = 2; // 掉下去之前 SELF_FALL 秒內沒碰到任何人，算自己掉下去（給測試和電腦調整用）

export function rngFrom(seed) { // mulberry32
  let a = (seed >>> 0) || 1;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export const wrapAngle = a => { a = (a + Math.PI) % (Math.PI * 2); if (a < 0) a += Math.PI * 2; return a - Math.PI; };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const r2 = v => Math.round(v * 100) / 100, r1 = v => Math.round(v * 10) / 10;
const ev = (g, e) => g.events.push(e);

/* ---------- 擂台 ---------- */
export function arenaRadius(id, rt) {
  const a = ARENAS[id] || ARENAS.ring;
  if (!(rt >= a.shrinkAt)) return a.r;
  return Math.max(a.minR, a.r - 1 - Math.floor((rt - a.shrinkAt) / a.every));
}
export const barSpeed = (id, rt) => { const b = ARENAS[id]?.bar; return b ? b.spin * b.faster ** Math.floor(rt / b.every) : 0; };
export function onFloor(g, x, y) {
  if (g.tiles) { const i = hexAt(x, y); return i >= 0 && g.tiles[i] >= 0; }
  return Math.hypot(x, y) <= g.r;
}
const size = p => p.big > 0 ? ITEMS.giant.scale : 1;
const walkOf = p => BODY.WALK * (p.fast > 0 ? ITEMS.speed.mult : 1) * (p.big > 0 ? ITEMS.giant.walk : 1);

/* ---------- 建立一場 ---------- */
// humans: [{ uid, name, color, ear, eye, body, blush }]（最多 6 人）。
// bots：true 依 diff 補滿 6 人、false 不補，或給難度陣列（例如 ['hard', 'normal']）照順序補。
// arena：只打這一個擂台一關（單人練習）；沒給就打 ROUNDS 關，擂台隨機排順序，種類夠多時每種只打一次。items：false 關掉道具（測試用）
export function createGame({ seed = 1, humans = [], bots = true, diff = 'normal', arena = null, items = true } = {}) {
  const rng = rngFrom(seed), hs = humans.slice(0, MAX_PLAYERS), used = new Set(), earKeys = Object.keys(EARS);
  const pickColor = c => { if (!COLORS.includes(c) || used.has(c)) c = COLORS.find(k => !used.has(k)); used.add(c); return c; };
  const colors = hs.map(h => pickColor(h.color));
  const names = [...BOT_NAMES]; shuffle(names, rng);
  const level = d => DIFFS[d] ? d : DIFFS[diff] ? diff : 'normal';
  const botList = Array.isArray(bots) ? bots.slice(0, MAX_PLAYERS - hs.length).map(level) : bots ? Array(MAX_PLAYERS - hs.length).fill(level(diff)) : [];
  const g = { seed: seed >>> 0, rng, diff: level(diff), phase: 'intro', t: 0, rt: 0, time: 0, acc: 0, round: 0, rounds: [], arena: null, r: 0, bar: null, tiles: null, useItems: !!items, items: [], itemT: 0, hot: null, players: [], events: [], over: false, result: null };
  if (ARENAS[arena]) g.rounds = [arena];
  else { const pool = []; while (pool.length < ROUNDS) pool.push(...shuffle([...ARENA_IDS], rng)); g.rounds = pool.slice(0, ROUNDS); }
  [...hs, ...botList].forEach((h, i) => {
    const bot = typeof h === 'string' ? h : null;
    g.players.push({
      id: i, uid: bot ? null : String(h.uid ?? i), name: bot ? names[i % names.length] : String(h.name || '玩家').slice(0, 12), human: !bot,
      color: bot ? pickColor(null) : colors[i], ear: !bot && EARS[h.ear] ? h.ear : earKeys[(i + 1) % earKeys.length], eye: !bot && Object.hasOwn(EYES, h.eye) ? h.eye : bot ? EYE_KEYS[(i + 2) % EYE_KEYS.length] : 'dot',
      body: !bot && BODIES.includes(h.body) ? h.body : BODIES[0], blush: !bot && BLUSHES.includes(h.blush) ? h.blush : BLUSHES[0],
      x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, h: 0, mx: 0, my: 0, dashT: 0, dashCD: 0, dive: false, dove: false, stun: 0, prone: 0, hits: 0, fall: false, out: false, touchT: -9, barCD: 0, fast: 0, shield: 0, big: 0,
      score: 0, rs: null, rounds: [], left: false, auto: !!bot, ai: { diff: bot || g.diff, t: 0, next: 0 },
    });
  });
  startRound(g);
  return g;
}
function shuffle(a, rng) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

function startRound(g) {
  const id = g.rounds[g.round], A = ARENAS[id], n = g.players.length, rot = g.rng() * Math.PI * 2, slots = shuffle([...Array(n).keys()], g.rng);
  g.arena = id; g.r = A.r; g.phase = 'intro'; g.t = 0; g.rt = 0;
  g.bar = A.bar ? { a: rot + .15 } : null; // 站位角度是 rot + k·60°：棒子從 0 號位置後面一點出發
  g.tiles = A.hex ? HEX.tiles.map(() => 0) : null; // 0 完好、大於 0 是踩到後過了幾秒、-1 已經掉下去
  g.items = []; g.itemT = ITEM_SPAWN.every; g.hot = null;
  g.players.forEach((p, i) => { // 每關重新排站位，鄰居每關不同
    const a = rot + slots[i] / n * Math.PI * 2;
    Object.assign(p, { x: Math.cos(a) * A.spawn, y: Math.sin(a) * A.spawn, z: 0, vx: 0, vy: 0, vz: 0, h: wrapAngle(a + Math.PI), dashT: 0, dashCD: 0, dive: false, dove: false, stun: 0, prone: 0, hits: 0, fall: false, out: false, touchT: -9, barCD: 0, fast: 0, shield: 0, big: 0, rs: null });
    Object.assign(p.ai, { t: 0, next: 0, goal: -1, run: false, leap: false, armed: false, hold: false, tf: 9 });
  });
  ev(g, { e: 'round', n: g.round, arena: id });
}

/* ---------- 輸入 ---------- */
// mx, my：想走的方向（世界座標，長度超過 1 會縮回 1）
export function setInput(g, id, input = {}) {
  const p = g.players[id]; if (!p) return;
  let mx = Number(input.mx), my = Number(input.my);
  if (!Number.isFinite(mx)) mx = 0; if (!Number.isFinite(my)) my = 0;
  const m = Math.hypot(mx, my); if (m > 1) { mx /= m; my /= m; }
  p.mx = mx; p.my = my;
}
const canAct = (g, p) => g.phase === 'play' && !p.out && !p.fall && p.stun <= 0 && p.prone <= 0;
const grounded = p => p.z <= 0 && p.vz <= 0 && !p.fall;
export function jump(g, id) {
  const p = g.players[id];
  if (!p || !canAct(g, p) || !grounded(p) || p.dashT > 0) return false;
  p.vz = BODY.JUMP; p.z = 1e-3; ev(g, { e: 'jump', id });
  return true;
}
// 地上按：往前衝；空中按：飛撲（每次騰空一次）。方向用搖桿的方向，沒推搖桿就用面向
export function dash(g, id) {
  const p = g.players[id];
  if (!p || !canAct(g, p) || p.dashCD > 0 || p.dashT > 0 || p.dive) return false;
  if (Math.hypot(p.mx, p.my) > .2) p.h = Math.atan2(p.my, p.mx);
  const c = Math.cos(p.h), s = Math.sin(p.h);
  p.dashCD = BODY.DASH_CD * (p.fast > 0 ? .5 : 1);
  if (grounded(p)) { p.dashT = BODY.DASH_T; p.vx = c * BODY.DASH_V; p.vy = s * BODY.DASH_V; ev(g, { e: 'dash', id }); return true; }
  if (p.dove) return false;
  p.dive = true; p.dove = true; p.vx = c * BODY.DIVE_V; p.vy = s * BODY.DIVE_V; p.vz = Math.max(p.vz, BODY.DIVE_UP);
  ev(g, { e: 'dive', id });
  return true;
}
// 連線斷線：電腦接手（on = true），回來再交還；forfeit 是超過寬限期，電腦打完這場，結算當作出局
export function setAuto(g, id, on) { const p = g.players[id]; if (p && p.human && !p.left) { p.auto = !!on; p.ai.t = 0; if (!on) { p.mx = 0; p.my = 0; } } }
export function forfeit(g, id) { const p = g.players[id]; if (p && p.human) { p.left = true; p.auto = true; } }

/* ---------- 物理 ---------- */
// 把 o 往 (dx, dy) 撞飛：基本速度 v，乘上「越撞越遠」和變大的倍率。有泡泡盾就抵掉這一下，回傳 false。
// by 是撞人的角色；旋轉棒和燙手泡泡沒有 by，用 kind 標示
function knock(g, o, dx, dy, v, { by = null, kind = 'dash', stun = BODY.STUN } = {}) {
  if (o.shield > 0) { o.shield = 0; o.touchT = g.rt; ev(g, { e: 'block', id: o.id, kind }); return false; }
  const m = (1 + BODY.GROW * Math.min(BODY.GROW_MAX, o.hits)) * (o.big > 0 ? ITEMS.giant.take : 1) * (by?.big > 0 ? ITEMS.giant.give : 1);
  o.vx = dx * v * m; o.vy = dy * v * m; o.vz = BODY.KNOCK_UP; o.z = Math.max(o.z, 1e-3);
  o.stun = stun; o.dashT = 0; o.dive = false; o.prone = 0; o.hits++; o.touchT = g.rt;
  ev(g, { e: 'hit', id: by ? by.id : -1, to: o.id, kind });
  return true;
}

function move(g, p) {
  const B = BODY, ground = grounded(p);
  p.dashCD = Math.max(0, p.dashCD - DT); p.stun = Math.max(0, p.stun - DT); p.prone = Math.max(0, p.prone - DT); p.barCD = Math.max(0, p.barCD - DT);
  p.fast = Math.max(0, p.fast - DT); p.shield = Math.max(0, p.shield - DT); p.big = Math.max(0, p.big - DT);
  const W = walkOf(p);
  const control = p.stun <= 0 && p.prone <= 0 && !p.fall, inMag = Math.hypot(p.mx, p.my);
  if (control && inMag > .1 && p.dashT <= 0 && !p.dive) { // 轉向：面向搖桿的方向，每秒最多轉 TURN 弧度
    const want = Math.atan2(p.my, p.mx), d = wrapAngle(want - p.h), turn = B.TURN * DT;
    p.h = wrapAngle(p.h + clamp(d, -turn, turn));
  }
  if (p.dashT > 0) { // 衝撞：維持衝刺速度，結束時降回走路速度，不會多滑一段
    p.dashT -= DT; p.vx = Math.cos(p.h) * B.DASH_V; p.vy = Math.sin(p.h) * B.DASH_V;
    if (p.dashT <= 0) { p.dashT = 0; p.vx = Math.cos(p.h) * W; p.vy = Math.sin(p.h) * W; }
  } else if (ground) {
    const sp = Math.hypot(p.vx, p.vy);
    if (!control || sp > W + .1) { // 被撞飛還在滑或趴著：只靠摩擦減速；能動的話出一點力修正
      const dec = (p.prone > 0 ? B.STOP : B.FRIC) * DT, k = sp > dec ? (sp - dec) / sp : 0;
      p.vx *= k; p.vy *= k;
      if (control) { p.vx += p.mx * B.ACC * B.SLIDE_CTRL * DT; p.vy += p.my * B.ACC * B.SLIDE_CTRL * DT; }
    } else approach(p, p.mx * W, p.my * W, (inMag > .1 ? B.ACC : B.STOP) * DT);
  } else if (control && !p.dive) approach(p, p.mx * W, p.my * W, B.ACC * B.AIR * DT); // 空中只能小幅轉向；被撞飛、飛撲時照拋物線飛
  p.x += p.vx * DT; p.y += p.vy * DT;
  const floor = !p.fall && onFloor(g, p.x, p.y);
  if (p.z > 0 || p.vz > 0 || !floor) {
    p.z += (p.vz - B.G * DT / 2) * DT; p.vz -= B.G * DT; // 等加速度的精確解，跳的高度不會因為步長變矮
    if (p.z <= 0 && floor) {
      p.z = 0; p.vz = 0; p.dove = false;
      if (p.dive) { p.dive = false; p.prone = B.PRONE; }
    } else if (p.z < B.FALL_Z && !p.fall) { p.fall = true; p.dashT = 0; p.dive = false; ev(g, { e: 'fall', id: p.id }); }
  }
}
// 速度往 (tx, ty) 靠近，每步最多改變 max
function approach(p, tx, ty, max) {
  const dx = tx - p.vx, dy = ty - p.vy, d = Math.hypot(dx, dy);
  if (d <= max) { p.vx = tx; p.vy = ty; } else { p.vx += dx / d * max; p.vy += dy / d * max; }
}

// 衝撞與飛撲的命中：每個在衝的人找身前 HIT_R 格內、高度差 HIT_Z 內最近的人。全部找完再一起結算，
// 同一步發生的碰撞不會因為誰的編號小而有不同結果。被撞的人同一步只會被最近的那一下撞飛；
// 兩人都在衝而且幾乎正對，雙方往後彈
function hits(g, live, contacts) {
  const B = BODY, dashers = new Set(live.filter(p => p.dashT > 0 || p.dive)), pairs = [];
  for (const a of dashers) {
    const ca = Math.cos(a.h), sa = Math.sin(a.h); let best = null, bd = Infinity;
    for (const o of live) {
      if (o === a) continue;
      const dx = o.x - a.x, dy = o.y - a.y, d = Math.hypot(dx, dy), reach = B.HIT_R + B.R * (size(a) + size(o) - 2); // 變大的人撞得到、也被撞到得更遠
      if (d <= reach && d < bd && dx * ca + dy * sa > 0 && Math.abs(o.z - a.z) <= B.HIT_Z) { best = o; bd = d; }
    }
    if (best) { pairs.push({ a, o: best, ca, sa, d: bd }); contacts.push([a, best, bd]); }
  }
  pairs.sort((p, q) => p.d - q.d);
  const knocked = new Set(), clashed = new Set();
  for (const { a, o, ca, sa } of pairs) {
    if (clashed.has(a)) continue;
    if (dashers.has(o) && ca * Math.cos(o.h) + sa * Math.sin(o.h) < B.CLASH_COS) {
      if (clashed.has(o) || knocked.has(a) || knocked.has(o)) continue;
      for (const p of [a, o]) { p.vx = -Math.cos(p.h) * B.CLASH_V; p.vy = -Math.sin(p.h) * B.CLASH_V; p.dashT = 0; p.dive = false; p.stun = B.CLASH_STUN; p.touchT = g.rt; clashed.add(p); }
      ev(g, { e: 'clash', id: a.id, to: o.id });
      continue;
    }
    if (!knocked.has(a)) { a.dashT = 0; a.dive = false; a.vx = ca * 2; a.vy = sa * 2; } // 撞到人就停下來；自己同一步也被撞飛的話照被撞飛算
    if (!knocked.has(o) && !clashed.has(o)) { if (knock(g, o, ca, sa, B.KNOCK_V, { by: a })) knocked.add(o); }
  }
}

// 身體互碰：完全推開，再交換 BUMP 比例的接近速度（走過去推人，對方會被推動）。
// 先算完所有人的推移量再一起套用，三個人擠在一起時結果和編號順序無關
function bumps(g, live, contacts) {
  const d = live.map(() => [0, 0, 0, 0]);
  for (let i = 0; i < live.length; i++) for (let j = i + 1; j < live.length; j++) {
    const a = live[i], b = live[j], dx = b.x - a.x, dy = b.y - a.y, dist = Math.hypot(dx, dy), min = BODY.R * (size(a) + size(b));
    if (!(dist < min) || Math.abs(a.z - b.z) > 1) continue;
    contacts.push([a, b, dist]);
    const ux = dist > 1e-6 ? dx / dist : 1, uy = dist > 1e-6 ? dy / dist : 0, push = (min - dist) / 2;
    const vn = (b.vx - a.vx) * ux + (b.vy - a.vy) * uy, k = vn < 0 ? vn * BODY.BUMP : 0;
    d[i][0] -= ux * push; d[i][1] -= uy * push; d[i][2] += ux * k; d[i][3] += uy * k;
    d[j][0] += ux * push; d[j][1] += uy * push; d[j][2] -= ux * k; d[j][3] -= uy * k;
    a.touchT = b.touchT = g.rt;
  }
  live.forEach((p, i) => { p.x += d[i][0]; p.y += d[i][1]; p.vx += d[i][2]; p.vy += d[i][3]; });
}

/* ---------- 擂台機關 ---------- */
// 掃把擂台：旋轉棒逆時針轉，掃到高度不夠（腳低於棒子頂）的人沿棒子轉的方向撞飛；中心柱子把人推出去
function sweepBar(g, live) {
  const B = ARENAS[g.arena].bar, w = barSpeed(g.arena, g.rt);
  if (w !== barSpeed(g.arena, g.rt - DT)) ev(g, { e: 'faster' });
  g.bar.a = wrapAngle(g.bar.a + w * DT);
  const a = g.bar.a, ox = Math.cos(a) * B.out, oy = Math.sin(a) * B.out, tl = Math.hypot(1, B.out), tx = (-Math.sin(a) + ox) / tl, ty = (Math.cos(a) + oy) / tl;
  for (const p of live) {
    const d = Math.hypot(p.x, p.y), r = BODY.R * size(p);
    if (d < B.hub + r) { // 中心柱子：推回柱子外面，去掉往內的速度
      const ux = d > 1e-6 ? p.x / d : 1, uy = d > 1e-6 ? p.y / d : 0, vin = p.vx * ux + p.vy * uy;
      p.x = ux * (B.hub + r); p.y = uy * (B.hub + r); if (vin < 0) { p.vx -= ux * vin; p.vy -= uy * vin; }
      continue;
    }
    if (p.z >= B.h || p.barCD > 0 || d > B.len + r) continue;
    const da = wrapAngle(Math.atan2(p.y, p.x) - a);
    if (Math.cos(da) <= 0 || Math.abs(d * Math.sin(da)) > r + B.w / 2) continue;
    p.barCD = B.cd; knock(g, p, tx, ty, B.knock, { kind: 'bar', stun: B.stun });
  }
}
// 蜂巢擂台：站在地上的人踩到的完好地板開始計時，crack + drop 秒後掉下去
function crackTiles(g) {
  const H = ARENAS[g.arena].hex;
  for (const p of g.players) {
    if (p.out || p.fall || p.z > 0) continue;
    const i = hexAt(p.x, p.y); if (i >= 0 && g.tiles[i] === 0) { g.tiles[i] = 1e-6; ev(g, { e: 'crack', i }); }
  }
  for (let i = 0; i < g.tiles.length; i++) {
    if (!(g.tiles[i] > 0)) continue;
    g.tiles[i] += DT;
    if (g.tiles[i] >= H.crack + H.drop) { g.tiles[i] = -1; ev(g, { e: 'drop', i }); }
  }
}

/* ---------- 道具 ---------- */
function spawnItem(g) {
  const A = ARENAS[g.arena], hub = A.bar ? ITEM_SPAWN.hub : 0, R = g.r - ITEM_SPAWN.edge;
  const kinds = ITEM_KINDS.filter(k => k !== 'hot' || !g.hot && !g.items.some(it => it.k === 'hot')); // 場上同時只有 1 顆燙手泡泡
  const k = kinds[Math.floor(g.rng() * kinds.length)], rr = hub + Math.sqrt(g.rng()) * Math.max(0, R - hub), a = g.rng() * Math.PI * 2;
  g.items.push({ k, x: Math.cos(a) * rr, y: Math.sin(a) * rr });
  ev(g, { e: 'spawn', k });
}
function items(g, live) {
  if ((g.itemT -= DT) <= 0) { g.itemT = ITEM_SPAWN.every; if (g.items.length < ITEM_SPAWN.max) spawnItem(g); }
  g.items = g.items.filter(it => {
    if (Math.hypot(it.x, it.y) > g.r) return false; // 擂台縮小，掉到外面的道具消失
    const p = live.find(q => q.z < 1 && Math.hypot(q.x - it.x, q.y - it.y) < BODY.R * size(q) + ITEM_SPAWN.pick);
    if (!p) return true;
    ev(g, { e: 'item', id: p.id, k: it.k });
    if (it.k === 'speed') p.fast = ITEMS.speed.time;
    else if (it.k === 'shield') p.shield = ITEMS.shield.time;
    else if (it.k === 'giant') p.big = ITEMS.giant.time;
    else throwHot(g, p, live);
    return false;
  });
}
const nearest = (p, list) => { let best = null, bd = Infinity; for (const o of list) { if (o === p) continue; const d = Math.hypot(o.x - p.x, o.y - p.y); if (d < bd) { bd = d; best = o; } } return best; };
function throwHot(g, p, live) {
  const t = nearest(p, live); if (!t) return;
  g.hot = { s: 'fly', by: p.id, to: t.id, t: 0, x0: p.x, y0: p.y, x: p.x, y: p.y };
}
function hotStep(g, live, contacts) {
  const H = ITEMS.hot, h = g.hot; if (!h) return;
  if (h.s === 'fly') {
    const t = g.players[h.to];
    if (!live.includes(t)) { g.hot = null; ev(g, { e: 'pop' }); return; }
    h.t += DT; const k = Math.min(1, h.t / H.fly); h.x = h.x0 + (t.x - h.x0) * k; h.y = h.y0 + (t.y - h.y0) * k;
    if (k < 1) return;
    if (t.shield > 0) { t.shield = 0; g.hot = null; ev(g, { e: 'block', id: t.id, kind: 'hot' }); return; }
    g.hot = { s: 'stuck', id: t.id, by: h.by, fuse: H.fuse, prev: null, passT: 0 };
    ev(g, { e: 'stick', id: t.id, by: h.by });
    return;
  }
  const p = g.players[h.id];
  if (!live.includes(p)) { g.hot = null; ev(g, { e: 'pop' }); return; } // 拿著的人掉下去，泡泡跟著消失
  h.fuse -= DT; h.passT = Math.max(0, h.passT - DT);
  let to = null, bd = Infinity;
  for (const [a, b, d] of contacts) { const o = a === p ? b : b === p ? a : null; if (o && !(o.id === h.prev && h.passT > 0) && d < bd) { bd = d; to = o; } }
  if (to) { ev(g, { e: 'pass', id: to.id, by: p.id }); Object.assign(h, { id: to.id, prev: p.id, passT: H.pass, fuse: Math.max(h.fuse, H.min) }); return; }
  if (h.fuse > 0) return;
  const d = Math.hypot(p.x, p.y), ux = d > .3 ? p.x / d : Math.cos(p.h), uy = d > .3 ? p.y / d : Math.sin(p.h);
  g.hot = null; ev(g, { e: 'boom', id: p.id });
  knock(g, p, ux, uy, H.boom, { kind: 'hot', stun: H.stun });
}

/* ---------- 電腦 ---------- */
// 被撞中後大約滑多遠：飛在空中的距離加上落地後摩擦滑行的距離
export function slideOf(hits) {
  const v = BODY.KNOCK_V * (1 + BODY.GROW * Math.min(BODY.GROW_MAX, hits));
  return v * 2 * BODY.KNOCK_UP / BODY.G + v * v / (2 * BODY.FRIC);
}
// 選最近、又最靠近邊緣的對手，走到他靠中心那一側，朝外衝撞；自己離邊緣太近先回中間。
// 每 react 秒才重新判斷一次（中間沿用上次的輸入），所以反應有延遲。要跳或衝時只記在 ai.act，由 tick 統一執行
function think(g, p) {
  const ai = p.ai, D = DIFFS[ai.diff] || DIFFS.normal;
  if (g.bar && dodgeBar(g, p, D)) return;
  if (g.tiles) { // 蜂巢擂台每一步都看：空中不改方向（跳洞跳到一半回頭會掉下去），走到目標格中間就停（反應慢的電腦不會衝過頭），
    // 走到洞邊：跑得夠快、落點有地板就跳，不然先停下來
    if (!grounded(p)) return;
    if (ai.goal >= 0 && Math.hypot(HEX.tiles[ai.goal].x - p.x, HEX.tiles[ai.goal].y - p.y) < .4) { ai.goal = -1; ai.run = ai.leap = false; p.mx = p.my = 0; }
    const v = Math.hypot(p.vx, p.vy), ux = p.vx / (v || 1), uy = p.vy / (v || 1), ahead = hexAt(p.x + ux * .55, p.y + uy * .55);
    if (v > .5 && ahead !== hexAt(p.x, p.y) && !hexSafe(g, p.x + ux * .55, p.y + uy * .55, .1)) { // 前面那格（腳下這格不算，反正要離開）
      if (v > 3 && hexSafe(g, p.x + ux * 2.4, p.y + uy * 2.4, .6) && hexSafe(g, p.x + ux * 3.1, p.y + uy * 3.1, .7)) ai.act = 'jump';
      else if (!ai.run) { p.mx = p.my = 0; }
    }
  }
  if ((ai.t -= DT) > 0) return;
  ai.t = D.react * (.7 + .6 * g.rng());
  if (g.tiles) return thinkHex(g, p, D);
  const R = Math.min(g.r, arenaRadius(g.arena, g.rt + 1.5)), d0 = Math.hypot(p.x, p.y), foes = g.players.filter(o => o !== p && !o.out && !o.fall);
  const go = (x, y) => { const d = Math.hypot(x, y); p.mx = d > .05 ? x / d : 0; p.my = d > .05 ? y / d : 0; };
  for (const o of foes) { // 有人朝自己衝過來：機率跳起來閃
    if (!(o.dashT > 0)) continue;
    const dx = p.x - o.x, dy = p.y - o.y, d = Math.hypot(dx, dy);
    if (d < 3 && dx * Math.cos(o.h) + dy * Math.sin(o.h) > d * .8 && g.rng() < D.dodge) { ai.act = 'jump'; break; }
  }
  if (d0 > R - D.edge) return go(-p.x, -p.y);
  if (g.bar && d0 < SWEEP_IN) return go(p.x || 1, p.y); // 掃把擂台中間棒子掃過的角度太寬，跳不過去，離中心遠一點
  const hot = g.hot?.s === 'stuck' ? g.players[g.hot.id] : null;
  if (hot === p) { // 身上有燙手泡泡：追最近的人，碰到就傳出去
    const o = nearest(p, foes); if (o) return go(o.x - p.x, o.y - p.y);
  } else if (hot && !hot.out && Math.hypot(hot.x - p.x, hot.y - p.y) < 3.5) { // 別人有：躲開，但往中間躲
    const ax = p.x - hot.x, ay = p.y - hot.y, ad = Math.hypot(ax, ay) || 1;
    return go(ax / ad - .6 * p.x / (d0 || 1), ay / ad - .6 * p.y / (d0 || 1));
  }
  let t = null, best = Infinity;
  for (const o of foes) { // 加一點亂數：開場大家站成正六邊形，兩邊鄰居一樣近，不加的話同分都挑編號小的，0 號會被兩邊夾攻
    const s = Math.hypot(o.x - p.x, o.y - p.y) - .8 * Math.hypot(o.x, o.y) + g.rng() * .8;
    if (s < best) { best = s; t = o; }
  }
  if (!t) return g.bar ? go(p.x / (d0 || 1) * (SWEEP_IN + 1.5) - p.x, p.y / (d0 || 1) * (SWEEP_IN + 1.5) - p.y) : go(-p.x, -p.y);
  const dt = Math.hypot(t.x, t.y), ux = dt > .3 ? t.x / dt : (t.x - p.x) / (Math.hypot(t.x - p.x, t.y - p.y) || 1), uy = dt > .3 ? t.y / dt : (t.y - p.y) / (Math.hypot(t.x - p.x, t.y - p.y) || 1);
  const tx = t.x - p.x, ty = t.y - p.y, td = Math.hypot(tx, ty) || 1;
  if (td < DASH_REACH && (tx * ux + ty * uy) / td > .3 && p.dashCD <= 0 && g.rt >= ai.next && grounded(p) && !(g.bar && ai.tf < 1.2)) { // 棒子快來了不衝，留著跳
    const ang = Math.atan2(ty, tx) + (g.rng() * 2 - 1) * D.aim, ex = p.x + Math.cos(ang) * 3.2, ey = p.y + Math.sin(ang) * 3.2, sl = slideOf(t.hits);
    const lethal = Math.hypot(t.x + tx / td * sl, t.y + ty / td * sl) > R;
    if (Math.hypot(ex, ey) < R - .3 && (lethal || g.rng() >= D.picky)) { // 衝完會出界就不衝
      p.mx = Math.cos(ang); p.my = Math.sin(ang); ai.act = 'dash';
      ai.next = g.rt + D.rest[0] + g.rng() * (D.rest[1] - D.rest[0]);
      return;
    }
  }
  const it = nearest(p, g.items); // 附近有道具就先去撿
  if (it && Math.hypot(it.x - p.x, it.y - p.y) < 4 && Math.hypot(it.x, it.y) < R - D.edge) return go(it.x - p.x, it.y - p.y);
  let sx = t.x - ux * AIM_OFF, sy = t.y - uy * AIM_OFF;
  const sd = Math.hypot(sx, sy), lim = R - D.edge, low = g.bar ? SWEEP_IN : 0;
  if (sd > lim) { sx *= lim / sd; sy *= lim / sd; } else if (sd < low) { const k = low / (sd || 1); sx = (sx || 1) * k; sy *= k; }
  if (Math.hypot(sx - p.x, sy - p.y) < .4) go(tx, ty); else go(sx - p.x, sy - p.y);
}

// 跳旋轉棒：每一步都看（不受反應延遲限制），算棒子前緣還要幾秒掃到自己，讓棒子通過的時間落在「腳高過棒子」那段滯空的中間。
// 棒子 0.8 秒內會到就站定等著跳：一邊走一邊跳，空中轉向會讓棒子晚到、順著棒子走還會讓棒子掃過的時間比滯空長。
// 每一圈抽一次時機誤差和「忘記跳」；回傳 true 表示正在等棒子，這一步不要改走向
function dodgeBar(g, p, D) {
  const B = ARENAS[g.arena].bar, ai = p.ai, d = Math.hypot(p.x, p.y);
  if (d > B.len + .5 || d < B.hub) return false;
  if (!grounded(p)) return ai.hold;
  const w = barSpeed(g.arena, g.rt) - (p.x * p.vy - p.y * p.vx) / (d * d); if (w <= .05) return false;
  const gap = ((Math.atan2(p.y, p.x) - g.bar.a) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2), hw = Math.asin(Math.min(1, (BODY.R * size(p) + B.w / 2) / d));
  const J = BODY.JUMP, Gv = BODY.G, root = Math.sqrt(J * J - 2 * Gv * B.h), up = (J - root) / Gv, window = 2 * root / Gv; // 腳高過棒子的時段：起跳後 up 秒開始，持續 window 秒
  const tf = (gap - hw) / w, cross = 2 * hw / w, lead = up + Math.max(0, (window - cross) / 2); ai.tf = tf;
  if (!ai.armed && tf > lead + .05 && tf < Math.PI) { ai.armed = true; ai.err = (g.rng() * 2 - 1) * D.jump; ai.skip = g.rng() < D.miss; }
  ai.lead = lead + (ai.err || 0); // 每一步重算：站定之後棒子相對自己的速度會變
  ai.hold = ai.armed && !ai.skip && tf < .8;
  if (ai.hold) { p.mx = 0; p.my = 0; }
  if (ai.armed && !ai.skip && tf <= ai.lead && tf > -cross) ai.act = 'jump'; // 還在衝撞中跳不起來，下一步再試，直到跳起來或棒子過去
  if (ai.armed && tf <= -cross) ai.armed = false;
  return ai.hold;
}
// 蜂巢擂台：站在腳下這格等到快掉了（剩不到 wait 秒）才換格；一直跑會把整片地板踩光（6 個人跑來跑去，5 秒就沒地板了）。
// 換格只走隔壁格（兩格中心連線只經過共用的邊，路上不會踩到別格），挑兩步內完好格子最多的；
// 隔壁都沒了就跳過一格洞，落在同方向的第二格，先退到腳下這格中心後面助跑。對手在衝撞距離內、衝完落腳處有地板，偶爾衝一下
function hexLeft(g, i) { const H = ARENAS.hex.hex, life = H.crack + H.drop; return i < 0 || g.tiles[i] < 0 ? 0 : g.tiles[i] === 0 ? life : life - g.tiles[i]; }
const hexSafe = (g, x, y, eta, m = .15) => hexLeft(g, hexAt(x, y)) > eta + m;
function thinkHex(g, p, D) {
  const ai = p.ai, T = HEX.tiles, cur = hexAt(p.x, p.y), ok = i => g.tiles[i] === 0;
  const go = (x, y) => { const d = Math.hypot(x, y); p.mx = d > .05 ? x / d : 0; p.my = d > .05 ? y / d : 0; };
  const room = j => { const seen = new Set([j, cur]); let n = 0; for (const a of T[j].nb) if (ok(a)) { n += 1; seen.add(a); } for (const a of T[j].nb) for (const b of T[a].nb) if (!seen.has(b) && ok(b)) { seen.add(b); n += .3; } return n; };
  if (ai.goal >= 0 && (g.tiles[ai.goal] < 0 || ai.goal !== cur && g.tiles[ai.goal] > 0)) { ai.goal = -1; ai.run = false; ai.leap = false; }
  const foes = g.players.filter(o => o !== p && !o.out && !o.fall), t = nearest(p, foes);
  if (t && ai.goal < 0 && p.dashCD <= 0 && g.rt >= ai.next && grounded(p) && g.rng() >= D.picky) {
    const tx = t.x - p.x, ty = t.y - p.y, td = Math.hypot(tx, ty);
    if (td < DASH_REACH) {
      const ang = Math.atan2(ty, tx) + (g.rng() * 2 - 1) * D.aim;
      if (hexSafe(g, p.x + Math.cos(ang) * 3.2, p.y + Math.sin(ang) * 3.2, .5)) { p.mx = Math.cos(ang); p.my = Math.sin(ang); ai.act = 'dash'; ai.next = g.rt + D.rest[0] + g.rng() * (D.rest[1] - D.rest[0]); return; }
    }
  }
  const island = cur >= 0 && !T[cur].nb.some(ok); // 隔壁都沒了：助跑加跳要將近 1 秒，提早走
  if (ai.goal < 0 && cur >= 0 && hexLeft(g, cur) < D.wait + D.react + (island ? .9 : 0)) { // 快掉了：先找隔壁，沒有再找跳得過去的
    let best = -Infinity;
    for (const j of T[cur].nb) if (ok(j)) { const s = room(j) + g.rng() * D.pick; if (s > best) { best = s; ai.goal = j; ai.leap = false; } }
    if (ai.goal < 0) for (const j of T[cur].far) if (ok(j)) { const s = room(j) + g.rng() * D.pick; if (s > best) { best = s; ai.goal = j; ai.leap = true; } }
    ai.run = false;
  }
  if (ai.goal < 0) return go(0, 0);
  const gx = T[ai.goal].x - p.x, gy = T[ai.goal].y - p.y, gd = Math.hypot(gx, gy) || 1;
  if (ai.leap && !ai.run && cur >= 0) { // 助跑：退到這格中心後面 0.5 格，再往目標跑，跑到洞邊由每一步的檢查起跳
    const bx = T[cur].x - gx / gd * .5 - p.x, by = T[cur].y - gy / gd * .5 - p.y;
    if (Math.hypot(bx, by) > .25) return go(bx, by);
    ai.run = true;
  }
  go(gx, gy);
}

/* ---------- 推進 ---------- */
function tick(g) {
  g.t += DT; g.time += DT;
  if (g.phase === 'intro') { if (g.t >= INTRO - 1e-9) { g.phase = 'play'; g.t = 0; ev(g, { e: 'go', n: g.round }); } return; }
  if (g.phase === 'roundEnd') {
    if (g.t >= ROUND_END - 1e-9) { if (++g.round < g.rounds.length) startRound(g); else finish(g); }
    return;
  }
  g.rt += DT;
  const r = arenaRadius(g.arena, g.rt); if (r !== g.r) { g.r = r; ev(g, { e: 'shrink', r }); }
  const bots = g.players.filter(p => p.auto && !p.out && !p.fall && p.stun <= 0 && p.prone <= 0);
  for (const p of bots) think(g, p);
  for (const p of bots) { if (p.ai.act === 'jump') { if (jump(g, p.id)) { p.ai.armed = false; } } else if (p.ai.act === 'dash') dash(g, p.id); p.ai.act = null; } // 全部決定完才一起動，編號小的不會先衝
  for (const p of g.players) if (!p.out) move(g, p);
  const live = g.players.filter(p => !p.out && !p.fall), contacts = [];
  hits(g, live, contacts); bumps(g, live, contacts);
  if (g.bar) sweepBar(g, live);
  if (g.tiles) crackTiles(g);
  if (g.useItems && ARENAS[g.arena].items) items(g, live);
  hotStep(g, live, contacts);
  const before = g.players.filter(p => p.out).length, gone = g.players.filter(p => !p.out && p.z < BODY.OUT_Z);
  for (const p of gone) { // 同一步掉出去的人同分：分數 = 比他早出局的人數
    p.out = true; p.rs = before;
    ev(g, { e: 'out', id: p.id, rs: before, self: g.rt - p.touchT > SELF_FALL });
  }
  const alive = g.players.filter(p => !p.out);
  if (alive.length <= (g.players.length > 1 ? 1 : 0) || g.rt >= ROUND_MAX - 1e-9) endRound(g);
}

function endRound(g) {
  const outs = g.players.filter(p => p.out).length;
  for (const p of g.players) { if (!p.out) p.rs = outs; p.rounds.push(p.rs); p.score += p.rs; }
  g.phase = 'roundEnd'; g.t = 0;
  ev(g, { e: 'roundEnd', n: g.round, rs: g.players.map(p => p.rs), score: g.players.map(p => p.score) });
}

// 名次：總分高的在前，同分從最後一關往前比單關分數，全部一樣就並列
export function ranking(g) {
  const cmp = (a, b) => { if (b.score !== a.score) return b.score - a.score; for (let i = a.rounds.length - 1; i >= 0; i--) if (b.rounds[i] !== a.rounds[i]) return b.rounds[i] - a.rounds[i]; return 0; };
  const order = [...g.players].sort((a, b) => cmp(a, b) || a.id - b.id);
  let rank = 0;
  return order.map((p, i) => { if (i === 0 || cmp(order[i - 1], p) !== 0) rank = i + 1; return { rank, id: p.id, uid: p.uid, name: p.name, bot: !p.human, score: p.score, rounds: [...p.rounds], points: p.left ? 0 : POINTS[rank - 1] ?? 0, out: p.left }; });
}

function finish(g) {
  const players = ranking(g), top = players.filter(p => p.rank === 1);
  g.over = true; g.phase = 'over';
  g.result = { reason: 'done', rounds: [...g.rounds], duration: Math.round(g.time), winner: top.length === 1 ? { id: top[0].id, name: top[0].name, bot: top[0].bot } : null, players };
  ev(g, { e: 'end', result: g.result });
}

// 前進 dt 秒（伺服器每次 0.05）；回傳這段時間產生的事件
export function step(g, dt) {
  g.events = [];
  if (g.over) return g.events;
  g.acc += dt;
  while (g.acc >= DT - 1e-9 && !g.over) { g.acc -= DT; tick(g); }
  return g.events;
}

/* ---------- 快照 ---------- */
// 開局（full）送名字與外觀；之後每個 tick 只送會變的欄位，值是 0 的欄位省略，客戶端用 expandFrame 補回來
const STATIC = ['uid', 'name', 'human', 'color', 'ear', 'eye', 'body', 'blush'];
const ZERO = ['z', 'vx', 'vy', 'dash', 'dive', 'stun', 'prone', 'hits', 'fall', 'out', 'score', 'auto', 'fast', 'shield', 'big'];
// 燙手泡泡：飛行中 [0, 丟的人, 目標, x, y]；黏住 [1, 拿著的人, 剩幾秒]
const hotSnap = h => !h ? null : h.s === 'fly' ? [0, h.by, h.to, r2(h.x), r2(h.y)] : [1, h.id, r2(h.fuse)];
function fullSnapshot(g) {
  return {
    seed: g.seed, phase: g.phase, time: r2(g.time), t: r2(g.t), rt: r2(g.rt), round: g.round, rounds: g.rounds, arena: g.arena, r: g.r, over: g.over,
    ba: g.bar ? r2(g.bar.a) : null, tl: g.tiles ? g.tiles.map(v => v < 0 ? 2 : v > 0 ? 1 : 0).join('') : null,
    items: g.items.map(it => [it.k, r2(it.x), r2(it.y)]), hot: hotSnap(g.hot),
    players: g.players.map(p => ({
      id: p.id, uid: p.uid, name: p.name, human: p.human, color: p.color, ear: p.ear, eye: p.eye, body: p.body, blush: p.blush,
      x: r2(p.x), y: r2(p.y), z: r2(p.z), h: r2(p.h), vx: r1(p.vx), vy: r1(p.vy), dash: p.dashT > 0 ? 1 : 0, dive: p.dive ? 1 : 0, stun: r1(p.stun), prone: r1(p.prone), // 位置要 2 位小數才畫得順；速度和計時只用來推算與顯示，1 位就夠
      hits: p.hits, fall: p.fall ? 1 : 0, out: p.out ? 1 : 0, rs: p.rs, score: p.score, auto: p.human && p.auto ? 1 : 0,
      fast: r1(p.fast), shield: r1(p.shield), big: r1(p.big),
    })),
  };
}
// 精簡快照也省略「沒有」的欄位：沒有旋轉棒、地板、燙手泡泡時是 null，沒有道具是空陣列，還沒出局的 rs 是 null，over 平常是 false
const EMPTY = { ba: null, tl: null, hot: null, items: [], over: false };
const empty = v => v === null || v === false || (Array.isArray(v) && !v.length);
export function snapshot(g, { full = true } = {}) {
  const s = fullSnapshot(g);
  if (full) return s;
  const { seed, rounds, players, ...rest } = s;
  return {
    ...Object.fromEntries(Object.entries(rest).filter(([k, v]) => !(k in EMPTY && empty(v)))), full: 0,
    players: players.map(p => p.out ? { id: p.id, out: 1, rs: p.rs, score: p.score } // 出局的人這關不會再動，只送名次和分數
      : Object.fromEntries(Object.entries(p).filter(([k, v]) => !STATIC.includes(k) && !(v === 0 && ZERO.includes(k)) && v !== null))),
  };
}
export function expandFrame(f, base) {
  if (f.full !== 0) return f;
  const { full, ...rest } = f;
  return {
    ...structuredClone(EMPTY), ...rest, seed: base.seed, rounds: base.rounds,
    players: f.players.map(p => { const b = base.players.find(o => o.id === p.id) || {}, o = { rs: null }; for (const k of STATIC) o[k] = b[k]; for (const k of ZERO) o[k] = 0; return { ...o, ...p }; }),
  };
}
