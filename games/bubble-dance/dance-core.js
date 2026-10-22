// 泡泡跳舞機：純規則（種子動作、回合時間表、舉手判定、電腦失誤、淘汰與名次），index.html（單人與畫面）和 worker.js（連線、伺服器判定）共用。
// 不碰 DOM / Math.random：動作與電腦全部來自種子，同一組種子與按鍵會重播出同樣結果。
// 時間單位是秒，g.t 是開局後經過的時間。每回合：老師示範 → 助教照做 → 玩家照做，全部踩在同一個節拍上。
export const MAX_PLAYERS = 4, MIN_PLAYERS = 2;
export const POINTS = [5, 3, 2, 1];
export const COLORS = ['#ffb3c7', '#a8d8ff', '#ffe08a', '#a8e6cf', '#c9b6ff', '#ffc8a2', '#ff8a80', '#7fdbd0', '#8aa4ff', '#cfe88a', '#f29be0', '#c9a58a', '#ffffff', '#000000', '#ff0000'];
export const EARS = { be: '圓耳', pay: '長耳', fe: '尖耳', tool: '小芽', cat: '貓耳', bear: '熊耳', horn: '小角', bow: '蝴蝶結', ant: '觸角' };
export const EYES = { dot: '圓眼', big: '大眼', happy: '笑眼', sleepy: '瞇眼', sparkle: '閃亮', wink: '眨眼' };
export const BODIES = ['#fffdf7', '#ffe9d6', '#e8f4ff', '#eafbe7', '#f3e8ff', '#fff3b8', '#f2d9c4', '#d9dde3', '#ffffff', '#000000', '#ff0000'];
export const BLUSHES = ['#ffa3b5', '#ff7d7d', '#ffc27a', '#ffe27a', '#9fd8ff', '#c4a3ff', '#ffffff', '#000000', '#ff0000'];
export const BOT_NAMES = ['麻糬', '湯圓', '布丁', '棉花'];
export const SIDES = ['L', 'R'];
// LEAD：開局後倒數幾秒才進第 1 回合；LATE：伺服器多等幾秒才判「少按」（等網路晚到的按鍵）
export const LEAD = 3, LATE = .5;
// 動作數：第 r 回合 min(r, MAX_LEN) 個。BPM：前 MAX_LEN 回合每回合 +BPM_STEP，之後每回合 +BPM_FAST，最多 BPM_MAX
export const MAX_LEN = 6, BPM0 = 80, BPM_STEP = 4, BPM_FAST = 10, BPM_MAX = 180, MAX_ROUNDS = 30;
// 容許值：和拍點差幾秒內算準，最多 WIN_MAX 秒，拍子變快時是 0.4 拍（180 BPM 約 0.13 秒），兩拍的範圍不會重疊
export const WIN_MAX = .2, WIN_BEATS = .4;
// 電腦難度：[最早在第幾回合失誤, 再往後幾回合內隨機]
export const BOT_LEVELS = { easy: [3, 4], normal: [6, 5], hard: [10, 6] };

export function rngFrom(seed) { // mulberry32
  let a = (seed >>> 0) || 1;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export const hashSeed = s => { let h = 2166136261; for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };

/* ---------- 回合時間表 ---------- */
export const lenOf = r => Math.min(r, MAX_LEN);
export const bpmOf = r => Math.min(BPM_MAX, BPM0 + BPM_STEP * (Math.min(r, MAX_LEN) - 1) + BPM_FAST * Math.max(0, r - MAX_LEN));
// 一回合的拍數：第 0 拍預備，老師 1..n，空 1 拍，助教 n+2..2n+1，空 1 拍，玩家 2n+3..3n+2，再空 3 拍收尾（夠等 LATE）
export const beatsOf = n => 3 * n + 6;
// 第 r 回合的完整時間表；時間都是 g.t。回合長度與種子無關，只有動作左右由種子決定
export function plan(seed, r) {
  let start = LEAD; for (let k = 1; k < r; k++) start += beatsOf(lenOf(k)) * 60 / bpmOf(k);
  const n = lenOf(r), bpm = bpmOf(r), beat = 60 / bpm, rng = rngFrom(hashSeed(`moves:${seed}:${r}`));
  const moves = Array.from({ length: n }, () => SIDES[rng() < .5 ? 0 : 1]), at = b => Math.round((start + b * beat) * 1000) / 1000;
  return { r, n, bpm, beat, start, moves, win: Math.min(WIN_MAX, beat * WIN_BEATS),
    teacher: moves.map((_, i) => at(1 + i)), assist: moves.map((_, i) => at(n + 2 + i)), player: moves.map((_, i) => at(2 * n + 3 + i)), end: at(beatsOf(n)) };
}
// 時間 t 落在第幾回合（倒數期間回 1）
export function roundAt(t) { let r = 1, s = LEAD; while (r < MAX_ROUNDS && t >= (s += beatsOf(lenOf(r)) * 60 / bpmOf(r))) r++; return r; }
// 畫面用：現在輪到誰示範／照做
export function turnOf(R, t) { return t < R.teacher[0] - R.beat / 2 ? 'ready' : t < R.assist[0] - R.beat / 2 ? 'teacher' : t < R.player[0] - R.beat / 2 ? 'assist' : t < R.end - 2 * R.beat ? 'you' : 'rest'; }

/* ---------- 對局 ---------- */
// humans：[{ uid, name, color, ear, eye, body, blush }]；id 依傳入順序 0, 1, 2...
// bots：true 時空位補電腦到 MAX_PLAYERS；diff：電腦難度（BOT_LEVELS 的 key）；late：判少按前多等幾秒（伺服器用 LATE，本機判定用 0）
export function createGame({ seed = 1, humans = [], bots = true, diff = 'normal', late = LATE } = {}) {
  const hs = humans.slice(0, MAX_PLAYERS), brng = rngFrom(hashSeed(`bots:${seed}`)), ear = Object.keys(EARS), eye = Object.keys(EYES), level = BOT_LEVELS[diff] ? diff : 'normal';
  const robots = bots ? Array.from({ length: MAX_PLAYERS - hs.length }, (_, i) => ({ name: BOT_NAMES[i % BOT_NAMES.length], bot: level, color: COLORS[Math.floor(brng() * COLORS.length)], ear: ear[Math.floor(brng() * ear.length)], eye: eye[Math.floor(brng() * eye.length)], body: BODIES[Math.floor(brng() * BODIES.length)], blush: BLUSHES[Math.floor(brng() * BLUSHES.length)] })) : [];
  const players = [...hs, ...robots].map((h, id) => ({ id, uid: h.uid ?? null, human: h.uid != null, bot: h.bot || false, name: h.name || `玩家${id + 1}`,
    look: { color: h.color || null, ear: h.ear || null, eye: h.eye || null, body: h.body || null, blush: h.blush || null },
    score: 0, ok: 0, got: [], out: 0, why: null, left: false, hand: null, ...(h.bot ? botFail(seed, id, h.bot) : {}) }));
  return { seed, players, phase: 'countdown', t: 0, late, round: null, over: false, result: null, events: [] };
}
// 電腦在 failRound 回合的第 failAt 個動作失誤（failAt 也是它那回合按對的數量）
function botFail(seed, id, level) {
  const rng = rngFrom(hashSeed(`fail:${seed}:${id}`)), [base, spread] = BOT_LEVELS[level], failRound = base + Math.floor(rng() * spread);
  return { failRound, failAt: Math.floor(rng() * lenOf(failRound)) };
}
const inGame = p => !p.left && !p.out;

function knockOut(g, p, why) {
  if (!inGame(p)) return null;
  p.out = g.round.r; p.why = why; g.events.push({ type: 'out', id: p.id, why, r: g.round.r, ok: p.ok });
  return why;
}

// 真人舉手，side 是 'L' 或 'R'，t 是舉手那一刻的 g.t（伺服器已夾在合理範圍）。
// 只有玩家照做那段（第一拍前到最後一拍後各 win 秒）才算；範圍內按錯手、多按或跳過一拍就淘汰。回傳 'ok'、淘汰原因或 null（不算）
export function press(g, id, side, t = g.t) {
  const p = g.players[id], R = g.round;
  if (!p || p.bot || !inGame(p) || g.phase !== 'play' || !R || !SIDES.includes(side) || !Number.isFinite(t)) return null;
  p.hand = [side, t]; // 畫面用：每次舉手都記下來，算不算分另外判
  if (t < R.player[0] - R.win || t > R.player.at(-1) + R.win) return null;
  const i = R.player.findIndex((x, k) => !p.got[k] && Math.abs(t - x) <= R.win);
  if (i < 0) return knockOut(g, p, 'extra');
  if (p.got.slice(0, i).some(x => !x)) return knockOut(g, p, 'miss'); // 範圍不重疊，前一拍已經過了
  if (R.moves[i] !== side) return knockOut(g, p, 'wrong');
  p.got[i] = 1; p.ok++; g.events.push({ type: 'hand', id, side, i });
  return 'ok';
}

// 斷線超過寬限期：當作中途離開。已經淘汰的人保留名次
export function forfeit(g, id) { const p = g.players[id]; if (p && !p.left && !p.out) { p.left = true; g.events.push({ type: 'left', id }); } }

function startRound(g, r) {
  g.round = plan(g.seed, r);
  for (const p of g.players) { p.ok = 0; p.got = new Array(g.round.n).fill(0); }
  g.events.push({ type: 'round', r, n: g.round.n, bpm: g.round.bpm });
}

// 推進 dt 秒；回傳這段時間發生的事件（go / round / hand / out / clear / left / end）
export function step(g, dt) {
  g.events = [];
  if (g.over) return g.events;
  g.t += Math.max(0, dt);
  if (g.phase === 'countdown' && g.t >= LEAD) { g.phase = 'play'; g.events.push({ type: 'go' }); startRound(g, 1); }
  while (g.phase === 'play') {
    const R = g.round;
    for (const p of g.players) {
      if (!inGame(p)) continue;
      if (p.bot) {
        const last = p.failRound === R.r ? p.failAt : R.n; // 電腦照拍點舉對的手，失誤那拍不舉
        for (let k = 0; k < last; k++) if (!p.got[k] && g.t >= R.player[k]) { p.got[k] = 1; p.hand = [R.moves[k], R.player[k]]; }
        if (p.failRound === R.r && g.t >= R.player[p.failAt]) { p.ok = p.failAt; knockOut(g, p, 'miss'); }
      }
      else if (R.player.some((x, k) => !p.got[k] && g.t >= x + R.win + g.late)) knockOut(g, p, 'miss');
    }
    if (!g.players.some(p => p.human && !p.left)) return end(g);
    if (g.t < R.end) break;
    const alive = g.players.filter(inGame);
    for (const p of alive) { p.score = R.r; if (p.bot) p.ok = R.n; }
    g.events.push({ type: 'clear', r: R.r, ids: alive.map(p => p.id) });
    if (!alive.some(p => p.human) || (g.players.length > 1 ? alive.length <= 1 : !alive.length) || R.r >= MAX_ROUNDS) return end(g);
    startRound(g, R.r + 1);
  }
  return g.events;
}
function end(g) { finish(g); g.events.push({ type: 'end', result: g.result }); return g.events; }

// 名次：中途離開排最後；再比過關回合數；同一回合淘汰的比當回合按對幾個；都一樣算同名次
const tie = p => (p.out ? p.ok : 99);
export function ranking(g) {
  const sorted = [...g.players].sort((a, b) => a.left - b.left || b.score - a.score || tie(b) - tie(a) || a.id - b.id);
  let rank = 0;
  return sorted.map((p, i) => {
    const q = sorted[i - 1];
    if (!i || p.left !== q.left || p.score !== q.score || tie(p) !== tie(q)) rank = i + 1;
    return { rank, id: p.id, uid: p.uid, name: p.name, bot: !!p.bot, score: p.score, ok: p.ok, ...(p.why ? { why: p.why } : {}), points: p.left ? 0 : POINTS[rank - 1] ?? 0, ...(p.left ? { out: true } : {}) };
  });
}
function finish(g) {
  const players = ranking(g), top = players.filter(r => r.rank === 1);
  g.over = true; g.phase = 'over';
  g.result = { players, winner: top.length === 1 ? { id: top[0].id, uid: top[0].uid, name: top[0].name, bot: top[0].bot } : null, rounds: g.round ? g.round.r : 0, duration: Math.round(Math.max(0, g.t - LEAD)) };
}

// full：開局與晚加入的人需要種子、名字與外觀（動作用 plan 自己算）；之後每格只送會變的欄位
// h：最近一次舉手 [side, g.t]，客戶端看到時間變了就讓台上那人舉手
export function snapshot(g, { full = true } = {}) {
  const o = { phase: g.phase, over: g.over, t: Math.round(g.t * 1000) / 1000, r: g.round ? g.round.r : 0, players: g.players.map(p => ({ id: p.id, s: p.score, o: p.out ? 1 : 0, l: p.left ? 1 : 0, ...(p.hand ? { h: [p.hand[0], Math.round(p.hand[1] * 1000) / 1000] } : {}) })) };
  if (full) { o.seed = g.seed; g.players.forEach((p, i) => Object.assign(o.players[i], { name: p.name, uid: p.uid, bot: p.bot, look: p.look })); }
  return o;
}
