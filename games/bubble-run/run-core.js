// 泡泡跑跑：純規則（種子障礙、跳躍物理、碰撞、名次、測試用電腦），index.html（單人與畫面）和 worker.js（連線、伺服器判定）共用。
// 不碰 DOM / Math.random：亂數全部來自種子，同一組種子與輸入會重播出同樣結果。
// 座標單位是「點」。世界往右延伸，dist 是小傢伙跑過的距離；小傢伙的 x 永遠等於 dist，畫面讓它固定在左側、世界往左捲。y 是離地高度，往上為正。
export const MAX_PLAYERS = 4, MIN_PLAYERS = 2, MAX_TIME = 600;
// 開局流程：OVERVIEW 秒從高空俯瞰所有跑道，MOVE 秒鏡頭移到玩家身後，之後 COUNTDOWN 秒倒數，倒數結束才開跑
export const OVERVIEW = 2, MOVE = 1.8, COUNTDOWN = 3, START_AT = OVERVIEW + MOVE + COUNTDOWN;
export const POINTS = [5, 3, 2, 1];
export const COLORS = ['#ffb3c7', '#a8d8ff', '#ffe08a', '#a8e6cf', '#c9b6ff', '#ffc8a2', '#ff8a80', '#7fdbd0', '#8aa4ff', '#cfe88a', '#f29be0', '#c9a58a', '#ffffff', '#000000', '#ff0000'];
export const EARS = { be: '圓耳', pay: '長耳', fe: '尖耳', tool: '小芽', cat: '貓耳', bear: '熊耳', horn: '小角', bow: '蝴蝶結', ant: '觸角' };
export const EYES = { dot: '圓眼', big: '大眼', happy: '笑眼', sleepy: '瞇眼', sparkle: '閃亮', wink: '眨眼' };
export const BODIES = ['#fffdf7', '#ffe9d6', '#e8f4ff', '#eafbe7', '#f3e8ff', '#fff3b8', '#f2d9c4', '#d9dde3', '#ffffff', '#000000', '#ff0000'];
export const BLUSHES = ['#ffa3b5', '#ff7d7d', '#ffc27a', '#ffe27a', '#9fd8ff', '#c4a3ff', '#ffffff', '#000000', '#ff0000'];
export const BOT_NAMES = ['麻糬', '湯圓', '布丁', '棉花'];
export const DT = 1 / 60, UNIT = 40; // 固定步長；UNIT 點 = 1 公尺（畫面上的分數）
// HARD：跑過這個距離（300 公尺）後進入加速期，加速度改成 ACC2，障礙在 RAMP 點內逐漸變密、高障礙與空中障礙變多
export const RUN = { V0: 360, ACC: 5, ACC2: 14, VMAX: 1000, HARD: 12000, RAMP: 20000, G: 1800, JUMP: 620, JUMP2: 580, FIRST_X: 1100, HIT: 4 };
export const PLAYER = { W: 30, H: 44 };
export const BIOME_LEN = 8, HILLS = 5; // 每個場景 8 個障礙；開場前 HILLS 個一律是平原小山丘
// 障礙的判定只看 kind：圖案（art）只是外觀，不同場景的同一 kind 尺寸相同
export const KINDS = {
  low: { w: 40, y: 0, h: 42 }, // 單跳可過
  wide: { w: 110, y: 0, h: 42 }, // 連續小丘，單跳可過
  high: { w: 56, y: 0, h: 128 }, // 要二連跳
  air: { w: 60, y: 64, h: 36 }, // 浮在空中，站著過；跳起來會撞
};
export const BIOMES = {
  plain: { name: '平原', sky: ['#cfe9ff', '#fff0f5'], ground: '#9be08a', dirt: '#d9a679', art: { low: ['hill', 'rock'], wide: ['hills'], high: ['boulder'], air: ['cloud'] } },
  forest: { name: '森林', sky: ['#d9f7d0', '#f4ffe8'], ground: '#6fc47a', dirt: '#b98a62', art: { low: ['stump', 'bush'], wide: ['logs'], high: ['bigtree'], air: ['branch'] } },
  desert: { name: '沙漠', sky: ['#ffe9c2', '#fff6e0'], ground: '#f2cf86', dirt: '#d9a860', art: { low: ['cactus', 'dune'], wide: ['dunes'], high: ['tallcactus'], air: ['tumble'] } },
  snow: { name: '雪地', sky: ['#e3f2ff', '#ffffff'], ground: '#ffffff', dirt: '#c9dff2', art: { low: ['ice', 'snowpile'], wide: ['icerow'], high: ['snowman'], air: ['icicle'] } },
  beach: { name: '泡泡海灘', sky: ['#c9f1ff', '#fff3d9'], ground: '#ffe6a8', dirt: '#f0c987', art: { low: ['wave', 'starfish'], wide: ['waves'], high: ['sandcastle'], air: ['ball'] } },
};
export const BIOME_IDS = Object.keys(BIOMES);

export function rngFrom(seed) { // mulberry32
  let a = (seed >>> 0) || 1;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export const hashSeed = s => { let h = 2166136261; for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };

/* ---------- 速度與距離 ---------- */
const V1 = Math.sqrt(RUN.V0 * RUN.V0 + 2 * RUN.ACC * RUN.HARD), T1 = (V1 - RUN.V0) / RUN.ACC; // 加速期開始時的速度與時間
export const speedAt = d => Math.min(RUN.VMAX, d <= RUN.HARD ? Math.sqrt(RUN.V0 * RUN.V0 + 2 * RUN.ACC * d) : Math.sqrt(V1 * V1 + 2 * RUN.ACC2 * (d - RUN.HARD)));
const T2 = (RUN.VMAX - V1) / RUN.ACC2, D2 = RUN.HARD + (RUN.VMAX ** 2 - V1 ** 2) / (2 * RUN.ACC2);
export const distAt = t => (t <= T1 ? RUN.V0 * t + RUN.ACC * t * t / 2 : t <= T1 + T2 ? RUN.HARD + V1 * (t - T1) + RUN.ACC2 * (t - T1) ** 2 / 2 : D2 + RUN.VMAX * (t - T1 - T2)); // 開跑 t 秒後的理論距離
export const scoreOf = dist => Math.floor(dist / UNIT);

/* ---------- 種子障礙 ---------- */
const shuffle = (a, rng) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const pick = (a, rng) => a[Math.floor(rng() * a.length)];

// 障礙表隨距離惰性延伸；同一個種子不管誰先要、要多遠，延伸出來的內容都一樣
export function makeTrack(seed) {
  const rng = rngFrom(hashSeed(`run:${seed}`)), tr = { seed, obstacles: [], segments: [], order: [], end: RUN.FIRST_X };
  let prev = null;
  const biomeFor = s => {
    while (tr.order.length <= s) {
      const c = tr.order.length / BIOME_IDS.length;
      if (c === 0) tr.order.push('plain', ...shuffle(BIOME_IDS.filter(b => b !== 'plain'), rng));
      else { const last = tr.order.at(-1); let o; do o = shuffle([...BIOME_IDS], rng); while (o[0] === last); tr.order.push(...o); }
    }
    return tr.order[s];
  };
  const add = () => {
    const n = tr.obstacles.length, s = Math.floor(n / BIOME_LEN), biome = biomeFor(s), dif = Math.min(1, n / 70), ramp = Math.max(0, Math.min(1, (tr.end - RUN.HARD) / RUN.RAMP));
    let kind = 'low';
    if (n >= HILLS) {
      const w = { low: 1, wide: .15 + .35 * dif, high: n < 8 ? 0 : .1 + .3 * dif + .25 * ramp, air: n < 10 ? 0 : .1 + .25 * dif + .2 * ramp };
      let r = rng() * (w.low + w.wide + w.high + w.air);
      for (const k of ['low', 'wide', 'high', 'air']) { r -= w[k]; if (r < 0) { kind = k; break; } }
    } else rng();
    const art = n < HILLS ? 'hill' : pick(BIOMES[biome].art[kind], rng), d = KINDS[kind];
    const v = speedAt(tr.end), extra = prev && (prev.kind === 'high' || kind === 'high') ? .25 : 0;
    const gap = n === 0 ? 0 : v * (1 - .25 * dif - .2 * ramp + extra + rng() * (.5 - .2 * ramp));
    const o = { x: Math.round(tr.end + gap), w: d.w, y: d.y, h: d.h, kind, art, seg: s };
    if (n % BIOME_LEN === 0) tr.segments.push({ biome, x: n === 0 ? 0 : Math.round((tr.end + o.x) / 2) });
    tr.obstacles.push(o); tr.end = o.x + o.w; prev = o;
  };
  tr.ensure = limit => { while (tr.end < limit) add(); return tr; };
  tr.biomeAt = d => { let b = tr.segments[0]?.biome || 'plain'; for (const s of tr.segments) if (s.x <= d) b = s.biome; else break; return b; };
  return tr.ensure(RUN.FIRST_X + 1);
}

/* ---------- 對局 ---------- */
// humans：[{ uid, name, color, ear, eye, body, blush }]；id 依傳入順序 0, 1, 2...
// visual：只推進跳躍物理與距離，不判定碰撞也不結束（連線版畫面預測用，生死以伺服器為準）
// bots：電腦陪跑的強度（'weak'、'smart'），接在真人後面；有電腦時，真人全部出局就結束這局
export function createGame({ seed = 1, humans = [], bots = [], visual = false } = {}) {
  const hs = humans.slice(0, MAX_PLAYERS), brng = rngFrom(hashSeed(`bots:${seed}`)), ear = Object.keys(EARS), eye = Object.keys(EYES);
  const robots = bots.slice(0, MAX_PLAYERS - hs.length).map((level, i) => ({ name: BOT_NAMES[(i + (level === 'smart' ? 1 : 0)) % BOT_NAMES.length], bot: level, color: COLORS[Math.floor(brng() * COLORS.length)], ear: ear[Math.floor(brng() * ear.length)], eye: eye[Math.floor(brng() * eye.length)], body: BODIES[Math.floor(brng() * BODIES.length)], blush: BLUSHES[Math.floor(brng() * BLUSHES.length)] }));
  const ps = [...hs, ...robots].map((h, id) => ({ id, uid: h.uid ?? null, human: h.uid != null, bot: h.bot || false, name: h.name || `玩家${id + 1}`, look: { color: h.color || null, ear: h.ear || null, eye: h.eye || null, body: h.body || null, blush: h.blush || null }, alive: true, y: 0, vy: 0, jumps: 0, airT: 0, diedAt: null, diedT: null, score: 0 }));
  return { seed, track: makeTrack(seed), players: ps, phase: 'countdown', t: 0, run: 0, dist: 0, acc: 0, over: false, result: null, events: [], visual };
}

export function jump(g, id) {
  const p = g.players[id];
  if (!p || !p.alive || g.phase !== 'running' || p.jumps >= 2) return false;
  p.vy = p.jumps === 0 ? RUN.JUMP : RUN.JUMP2; p.jumps++; p.airT = p.jumps === 1 ? 0 : p.airT;
  g.events.push({ type: 'jump', id, n: p.jumps });
  return true;
}

const hits = (g, p) => {
  g.track.ensure(g.dist + 600);
  const h = RUN.HIT, x0 = g.dist - PLAYER.W / 2 + h, x1 = g.dist + PLAYER.W / 2 - h;
  for (const o of g.track.obstacles) {
    if (o.x > x1) break;
    if (o.x + o.w > x0 && p.y + PLAYER.H > o.y + h && p.y < o.y + o.h - h) return true;
  }
  return false;
};

function tick(g) {
  g.run += DT; g.dist += speedAt(g.dist) * DT;
  for (const p of g.players) if (p.bot && p.alive) botAct(g, p);
  for (const p of g.players) {
    if (!p.alive) continue;
    if (p.y > 0 || p.vy > 0) {
      p.vy -= RUN.G * DT; p.y += p.vy * DT; p.airT += DT;
      if (p.y <= 0) { p.y = 0; p.vy = 0; p.jumps = 0; p.airT = 0; }
    }
    if (!g.visual && hits(g, p)) out(g, p);
  }
  if (!g.visual && (!g.players.some(p => p.alive && !p.bot) || g.run >= MAX_TIME)) finish(g);
}

function out(g, p) {
  p.alive = false; p.diedAt = g.dist; p.diedT = g.run; p.score = scoreOf(g.dist);
  g.events.push({ type: 'out', id: p.id, score: p.score });
}

// 斷線超過寬限期：當場出局
export function forfeit(g, id) { const p = g.players[id]; if (p?.alive && g.phase === 'running') out(g, p); }

function finish(g) {
  for (const p of g.players) if (p.alive) { p.alive = false; p.diedAt = g.dist; p.diedT = g.run; p.score = scoreOf(g.dist); }
  const players = ranking(g), top = players.filter(r => r.rank === 1);
  g.over = true; g.phase = 'over'; g.result = { players, winner: top.length === 1 ? { id: top[0].id, uid: top[0].uid, name: top[0].name } : null, duration: Math.round(g.run), reason: g.run >= MAX_TIME ? 'time' : 'all' };
}

export function ranking(g) {
  const sorted = [...g.players].sort((a, b) => b.diedAt - a.diedAt || a.id - b.id);
  let rank = 0;
  return sorted.map((p, i) => { if (i === 0 || p.diedAt !== sorted[i - 1].diedAt) rank = i + 1; return { rank, id: p.id, uid: p.uid, name: p.name, bot: !!p.bot, score: p.score, time: Math.round(p.diedT * 100) / 100, points: POINTS[rank - 1] ?? 0 }; });
}

// 推進 dt 秒；回傳這段時間發生的事件（jump / out / go / end）
export function step(g, dt) {
  g.events = [];
  if (g.over) return g.events;
  g.acc += dt;
  while (g.acc >= DT - 1e-9 && !g.over) {
    g.acc -= DT; g.t += DT;
    if (g.phase === 'countdown') { if (g.t >= START_AT - 1e-9) { g.phase = 'running'; g.events.push({ type: 'go' }); } continue; }
    tick(g);
  }
  if (g.over) g.events.push({ type: 'end', result: g.result });
  return g.events;
}

/* ---------- 電腦：跳躍判斷 ---------- */
// 依「到下一個障礙還有幾秒」把跳躍的最高點對準障礙中央；二連跳在第一跳後約 0.2 秒補上。
// plan：{ dt（提早或延後幾秒起跳）、miss（這個障礙不跳）、single（高障礙只跳一次）}，省略就是完美操作
const nextIndex = g => { const edge = g.dist - PLAYER.W / 2; g.track.ensure(g.dist + 1500); return g.track.obstacles.findIndex(q => q.x + q.w > edge); };
export function botJump(g, id, plan = {}) {
  const p = g.players[id];
  if (!p || !p.alive || p.jumps >= 2 || plan.miss) return false;
  const v = speedAt(g.dist), o = g.track.obstacles[nextIndex(g)], dt = plan.dt || 0;
  if (!o || o.kind === 'air') return false;
  const tt = (o.x - (g.dist + PLAYER.W / 2)) / v, half = (o.w + PLAYER.W) / 2 / v;
  if (o.kind === 'high') {
    if (p.jumps === 0) return tt <= .322 + .2 - half + dt;
    return !plan.single && p.airT >= .2 && tt <= .322 - half + dt;
  }
  return p.jumps === 0 && tt <= .344 - half + dt;
}

// 電腦強度：每個障礙各自抽一次失誤與起跳誤差（由種子、電腦編號與障礙編號決定，和執行順序無關）
export const BOT_LEVELS = { weak: { miss: .1, missRamp: .15, jitter: .09, single: .3 }, smart: { miss: .004, missRamp: .02, jitter: .02, single: 0 } };
export function botPlan(g, p, idx) {
  const lv = BOT_LEVELS[p.bot] || BOT_LEVELS.smart, r = rngFrom(hashSeed(`${g.seed}:${p.id}:${idx}`)), o = g.track.obstacles[idx];
  const ramp = Math.max(0, Math.min(1, (o.x - RUN.HARD) / RUN.RAMP));
  return { miss: idx >= HILLS && r() < lv.miss + lv.missRamp * ramp, dt: (r() - .5) * 2 * lv.jitter, single: r() < lv.single };
}
function botAct(g, p) {
  const idx = nextIndex(g); if (idx < 0) return;
  if (botJump(g, p.id, botPlan(g, p, idx))) jump(g, p.id);
}

// full：開局與晚加入的人需要種子、名字與外觀；之後每格只送會變的欄位
export function snapshot(g, { full = true } = {}) {
  const r1 = v => Math.round(v * 10) / 10;
  const o = { phase: g.phase, over: g.over, t: Math.round(g.t * 100) / 100, run: Math.round(g.run * 100) / 100, dist: Math.round(g.dist),
    players: g.players.map(p => ({ id: p.id, a: p.alive ? 1 : 0, y: r1(p.y), vy: Math.round(p.vy), j: p.jumps, d: p.diedAt == null ? null : Math.round(p.diedAt) })) };
  if (full) { o.seed = g.seed; g.players.forEach((p, i) => Object.assign(o.players[i], { name: p.name, uid: p.uid, look: p.look })); }
  return o;
}
