// 泡泡賽車：純規則（賽道、物理、道具、圈數、電腦對手），index.html（單人與畫面）和 worker.js（連線、伺服器判定）共用。
// 不碰 DOM / three.js / Math.random：亂數全部來自種子，同一組種子與輸入會重播出同樣結果。
// 座標單位是「格」，賽道在 (x, y) 平面；朝向 h 的前進方向是 (cos h, sin h)，h 增加是往右轉。
export const MAX_PLAYERS = 4, LAPS = 3;
export const COLORS = ['#ffb3c7', '#a8d8ff', '#ffe08a', '#a8e6cf', '#c9b6ff', '#ffc8a2', '#ff8a80', '#7fdbd0', '#8aa4ff', '#cfe88a', '#f29be0', '#c9a58a', '#ffffff', '#000000', '#ff0000'];
export const EARS = { be: '圓耳', pay: '長耳', fe: '尖耳', tool: '小芽', cat: '貓耳', bear: '熊耳', horn: '小角', bow: '蝴蝶結', ant: '觸角' };
export const EYES = { dot: '圓眼', big: '大眼', happy: '笑眼', sleepy: '瞇眼', sparkle: '閃亮', wink: '眨眼' };
const EYE_KEYS = Object.keys(EYES);
export const BODIES = ['#fffdf7', '#ffe9d6', '#e8f4ff', '#eafbe7', '#f3e8ff', '#fff3b8', '#f2d9c4', '#d9dde3', '#ffffff', '#000000', '#ff0000'];
export const BLUSHES = ['#ffa3b5', '#ff7d7d', '#ffc27a', '#ffe27a', '#9fd8ff', '#c4a3ff', '#ffffff', '#000000', '#ff0000'];
export const BOT_NAMES = ['麻糬', '湯圓', '布丁', '棉花', '豆花', '芋圓'];
export const COUNTDOWN = 3, START_WINDOW = .5, START_BOOST = 1, FINISH_GRACE = 30, MAX_TIME = 240;
export const ROAD = 3, WALL = 4.6; // 預設離中心線的距離：路面半寬（路寬 6 格，4 台車並排）、牆。地圖可用 road / wall 改窄
export const KART = { VMAX: 10, ACCEL: 6, BRAKE: 8, STOP: 14, COAST: 4, REVERSE: 3, R: .65, BOUNCE: .7, TURN: 2.2, OFFROAD: .5, WALL_LOSS: .6 };
export const GRID_LANES = [-2.25, -.75, .75, 2.25]; // 起跑 4 台並排，離起跑線同樣距離；窄路會等比例往中間收
export const DRIFT = { MIN_V: 5, LEVELS: [.7, 1.4, 2.2], BOOST: [0, .7, 1.1, 1.6], MULT: 1.55, CHAIN: 1.5 }; // CHAIN：氮氣加速中甩尾，火花累積倍率（連貫甩噴）
export const ITEMS = {
  shoe: { time: 2, mult: 1.8 },
  puddle: { life: 15, drop: [-1.1, 0, 1.1], max: 9, spin: 1, slow: .3, hitR: .8, arm: .5 }, // drop：一次在車後丟一排，橫向偏移
  shield: { time: 8 }, // 泡泡盾：時間內擋下一次攻擊（水柱、水窪、雷雨雲、燙手泡泡、假道具箱）
  jet: { speed: 26, range: 120, reach: 80, steer: 8, trap: 2.5, hitR: 1 }, // 超級水柱：沿賽道追前方 reach 格內最近的車，steer 是每秒橫向修正幾格
  storm: { speed: 30, delay: 2, trap: 1.5, life: 10, hitR: 1.2 }, // 雷雨雲：飛在空中（不管牆）追第一名，到頭上 delay 秒後下雨困住他；life 秒內沒追到就散掉
  hot: { speed: 28, reach: 40, range: 90, steer: 8, hitR: 1, fuse: 5, min: 1.5, pass: .5, trap: 2 }, // 燙手泡泡：沿賽道飛向前方 reach 格內最近的車黏上去（最遠飛 range 格），fuse 秒後爆炸；撞到別人就黏過去（剩不到 min 秒補到 min），pass 秒內不能馬上傳回來
  ghost: { time: 3 }, // 小幽靈：偷前面最近一台有道具的車的道具（前面沒有就偷後面的），自己透明 time 秒，道具和車子都會穿過去
  decoy: { life: 20, max: 4, spin: 1, slow: .3, hitR: .8, arm: .5 }, // 假道具箱：丟在車後，撞到和水窪一樣打滑
};
export const ITEM_KINDS = ['puddle', 'shoe', 'shield', 'jet', 'storm', 'hot', 'ghost', 'decoy'];
// 抽道具機率依名次：落後的人拿到較強的道具，加速鞋越後面越多；第 1 名拿不到超級水柱和雷雨雲，最後一名拿不到假道具箱
export const ODDS = {
  first: { puddle: 40, shoe: 10, shield: 20, jet: 0, storm: 0, hot: 5, ghost: 5, decoy: 20 },
  mid: { puddle: 15, shoe: 25, shield: 10, jet: 17, storm: 5, hot: 15, ghost: 10, decoy: 3 },
  last: { puddle: 5, shoe: 40, shield: 5, jet: 20, storm: 15, hot: 5, ghost: 10, decoy: 0 },
};
// 模式：道具賽撿道具箱；競速賽沒有道具箱，漂移集滿氮氣槽得到 1 個氮氣（最多存 NITRO.max 個），按道具鍵用，效果和加速鞋一樣
export const MODES = { item: { label: '道具賽' }, speed: { label: '競速賽' } };
export const NITRO = { fill: 2.5, max: 2 }; // fill：漂移幾秒集滿一格
export const POINTS = [5, 3, 2, 1];
// 單人賽電腦難度：speed + 0..spread 是最高速比例；chain 為 true 時看前方彎道主動漂移並連噴，否則只偶爾漂移
export const DIFFS = { normal: { label: '普通', speed: .94, spread: .04, chain: false }, hard: { label: '困難', speed: .98, spread: .02, chain: true } };
export const BOX_RESPAWN = 5, BOX_R = .8, IMMUNE = 1.5; // IMMUNE：被困住脫困後幾秒內不會再被困

export function rngFrom(seed) { // mulberry32
  let a = (seed >>> 0) || 1;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const wrapAngle = a => { a = (a + Math.PI) % (Math.PI * 2); if (a < 0) a += Math.PI * 2; return a - Math.PI; };

/* ---------- 賽道：控制點 → Catmull-Rom 曲線 → 每 0.5 格一個取樣點 ---------- */
export const TRACK_POINTS = [[0, 0], [32.4, 0], [48.6, 8.1], [51.3, 24.3], [40.5, 35.1], [24.3, 32.4], [13.5, 40.5], [-2.7, 45.9], [-18.9, 37.8], [-21.6, 18.9], [-13.5, 5.4]];
export function buildTrack(pts, road = ROAD, wall = WALL) {
  const n = pts.length, P = i => pts[((i % n) + n) % n], dense = [];
  for (let i = 0; i < n; i++) {
    const [p0, p1, p2, p3] = [P(i - 1), P(i), P(i + 1), P(i + 2)];
    for (let k = 0; k < 24; k++) {
      const t = k / 24, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => .5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      dense.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  const cum = [0];
  for (let i = 1; i <= dense.length; i++) { const a = dense[i - 1], b = dense[i % dense.length]; cum.push(cum[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1])); }
  const total = cum[dense.length], N = Math.round(total / .5), STEP = total / N, xs = new Float64Array(N), ys = new Float64Array(N);
  for (let j = 0, k = 0; j < N; j++) {
    const s = j * STEP; while (cum[k + 1] < s) k++;
    const a = dense[k], b = dense[(k + 1) % dense.length], u = (s - cum[k]) / (cum[k + 1] - cum[k] || 1);
    xs[j] = a[0] + (b[0] - a[0]) * u; ys[j] = a[1] + (b[1] - a[1]) * u;
  }
  const tx = new Float64Array(N), ty = new Float64Array(N);
  for (let j = 0; j < N; j++) { const a = (j - 1 + N) % N, b = (j + 1) % N, dx = xs[b] - xs[a], dy = ys[b] - ys[a], l = Math.hypot(dx, dy) || 1; tx[j] = dx / l; ty[j] = dy / l; }
  return { N, STEP, L: N * STEP, xs, ys, tx, ty, road, wall }; // 左側法線 = (ty, -tx)；右側 = (-ty, tx)
}
// 地圖：每張地圖一組控制點與配色（配色只給畫面用）；boxes 是道具箱排的位置（佔一圈的比例，盡量放在直線上）；road / wall 可把路改窄
export const TRACKS = [
  { id: 'candy', name: '糖果環道', tag: '入門，彎道平緩', boxes: [.12, .34, .58, .84], points: TRACK_POINTS, theme: { ground: '#e4f6d4', road: '#fff1dc', curb: '#ff9fb8', fence: '#c9b6ff', leaves: ['#a8e6cf', '#ffd0dc', '#d4c8f5', '#ffe3b8'] } },
  { id: 'lake', name: '泡泡湖', tag: '中等，長直線加大彎', boxes: [.14, .38, .62, .88], points: [[0, 0], [30, -4], [52, 4], [62, 22], [54, 40], [34, 46], [22, 36], [8, 44], [-12, 42], [-22, 26], [-16, 8]], theme: { ground: '#d8f1f4', road: '#fff6e8', curb: '#7cc8ff', fence: '#a8e6cf', leaves: ['#a8d8ff', '#c9f0e4', '#ffffff', '#bfe3ff'] } },
  { id: 'cloud', name: '雲朵山路', tag: '進階，連續髮夾彎', boxes: [.08, .26, .44, .62, .82], points: [[0, 0], [34, 0], [46, 10], [40, 22], [22, 24], [14, 34], [24, 46], [44, 48], [50, 60], [36, 70], [0, 70], [-14, 56], [-10, 36], [-16, 18], [-10, 4]], theme: { ground: '#f2ecfb', road: '#fffdf8', curb: '#ffc23d', fence: '#ffb3c7', leaves: ['#ffe08a', '#ffc8a2', '#e2d6ff', '#fff1dc'] } },
  // 城鎮高架道：市區 3 個直角彎（半徑 6）→ 上匝道 → 高架大右彎、換車道 S 彎、大右彎（半徑 16 以上）→ 下匝道 → 市區 3 個直角彎（半徑 7）
  // elev 是高架路段的高度，只給畫面用，物理還是平面：[佔一圈的比例, 高度] 之間平滑過渡，其他地方高度 0
  { id: 'highway', name: '城鎮高架道', tag: '進階，市區直角彎接高架大彎', boxes: [.03, .26, .43, .58, .72, .90], elev: [[.21, 0], [.30, 2.6], [.68, 2.6], [.735, 0]], points: [[0, 0], [2.9, 0], [5.7, 0], [8.6, 0], [11.4, 0], [14.3, 0], [17.1, 0], [20, 0], [22.3, 0.5], [24.2, 1.8], [25.5, 3.7], [26, 6], [26, 9], [26, 12], [26.5, 14.3], [27.8, 16.2], [29.7, 17.5], [32, 18], [35, 18], [38, 18], [40.3, 18.5], [42.2, 19.8], [43.5, 21.7], [44, 24], [44, 26.9], [44, 29.8], [44, 32.7], [44, 35.6], [44, 38.4], [44, 41.3], [44, 44.2], [44, 47.1], [44, 50], [43.8, 52.5], [43.2, 54.9], [42.3, 57.3], [40.9, 59.4], [39.3, 61.3], [37.4, 62.9], [35.3, 64.3], [32.9, 65.2], [30.5, 65.8], [28, 66], [25, 66], [22, 66], [19, 66], [16, 66], [13, 66], [10, 66], [7.4, 66.1], [4.8, 66.5], [2.2, 67], [-0.3, 67.8], [-2.7, 68.8], [-5.1, 69.8], [-7.6, 70.6], [-10.1, 71.2], [-12.7, 71.5], [-15.4, 71.6], [-18.2, 71.6], [-21, 71.6], [-23.8, 71.6], [-26.6, 71.6], [-29.4, 71.6], [-31.9, 71.4], [-34.3, 70.8], [-36.6, 69.9], [-38.8, 68.6], [-40.7, 66.9], [-42.3, 65], [-43.6, 62.9], [-44.6, 60.6], [-45.2, 58.1], [-45.4, 55.6], [-45.4, 52.4], [-45.4, 49.2], [-45.4, 46], [-45.4, 42.8], [-45.4, 39.6], [-45, 37.5], [-44, 35.5], [-42.5, 34], [-40.5, 33], [-38.4, 32.6], [-35.4, 32.6], [-32.4, 32.6], [-30.2, 32.3], [-28.2, 31.3], [-26.7, 29.7], [-25.7, 27.8], [-25.4, 25.6], [-25.4, 22.5], [-25.4, 19.4], [-25.4, 16.3], [-25.4, 13.2], [-25.4, 10.1], [-25.4, 7], [-25, 4.8], [-24, 2.9], [-22.5, 1.3], [-20.5, 0.3], [-18.4, 0], [-15.3, 0], [-12.2, 0], [-9.2, 0], [-6.1, 0], [-3.1, 0]], theme: { ground: '#dcefd2', road: '#fff4e2', curb: '#ff8f6b', fence: '#7c8db5', leaves: ['#a8e6cf', '#ffe08a', '#ffd0dc', '#bfe3ff'], town: true, highway: '#dcd8e8', deck: '#bdb6cc', walls: ['#fff1dc', '#ffe0e6', '#e0f0ff', '#fff7c2'], roofs: ['#ff8f6b', '#7cc8ff', '#c9b6ff', '#ffb3c7'] } },
  { id: 'peak', name: '暴風山脊', tag: '高難度，髮夾彎與連續S彎', boxes: [.06, .22, .40, .62, .82], points: [[0,0], [3,0], [6,0], [9,0], [12,0], [15,0], [18,0], [21,0], [24,0], [27,0], [29.4,0.3], [31.6,1.2], [33.6,2.7], [35.1,4.7], [36,6.9], [36.3,9.3], [36,11.7], [35.1,13.9], [33.6,15.9], [31.6,17.4], [29.4,18.3], [27,18.6], [24,18.6], [21,18.6], [18,18.6], [15,18.6], [12,18.6], [9,18.6], [6,18.6], [3,18.6], [0,18.6], [-2.4,18.9], [-4.7,19.8], [-6.6,21.3], [-8.1,23.3], [-9,25.5], [-9.3,27.9], [-9,30.3], [-8.1,32.6], [-6.6,34.5], [-4.7,36], [-2.4,36.9], [0,37.2], [3,37.2], [6,37.2], [9,37.2], [12,37.2], [15,37.2], [18,37.2], [21,37.2], [24,37.2], [27,37.2], [29.4,37.5], [31.6,38.4], [33.6,39.9], [35.1,41.9], [36,44.1], [36.3,46.5], [36,48.9], [35.1,51.1], [33.6,53.1], [31.6,54.6], [29.4,55.5], [27,55.8], [24,55.8], [21.1,55.8], [18.1,55.8], [15.2,55.8], [12.2,55.8], [9.3,55.8], [6.3,55.8], [3.3,55.8], [0.4,55.8], [-2.6,55.8], [-5.5,55.8], [-8.5,55.8], [-11.5,55.8], [-14.4,55.8], [-17.4,55.8], [-20.3,55.8], [-23.3,55.8], [-26.2,55.8], [-29.2,55.8], [-32.2,55.8], [-34.6,55.5], [-36.8,54.6], [-38.7,53.1], [-40.2,51.1], [-41.1,48.9], [-41.5,46.5], [-41.1,43.8], [-39.9,41.4], [-38.1,39.4], [-36.6,37.7], [-35.5,35.7], [-34.9,33.5], [-34.9,31.3], [-35.4,29.1], [-35.9,26.9], [-35.9,24.6], [-35.3,22.4], [-34.2,20.4], [-32.6,18.8], [-30.8,16.8], [-29.7,14.3], [-29.3,11.6], [-29.3,9.3], [-29,6.9], [-28.1,4.6], [-26.6,2.7], [-24.6,1.2], [-22.4,0.3], [-20,0], [-17.1,0], [-14.3,0], [-11.4,0], [-8.6,0], [-5.7,0], [-2.9,0]], theme: { ground: '#3b3350', road: '#e8dcc8', curb: '#ff7a3d', fence: '#2e3a7a', leaves: ['#7fb2d9', '#9a8fd6', '#6fc3b5', '#a9b8e8'] } },
  // 雷霆峽谷：路寬 4.4 格（其他地圖 6 格），7 個半徑約 4.6 的髮夾彎，頂端與左側回程共 4 個側移約 6 格的 S 彎，直線穿不過去
  { id: 'thunder', name: '雷霆峽谷', tag: '極限，窄路與連續髮夾彎', boxes: [.04, .21, .40, .58, .74, .90], road: 2.2, wall: 3.6, points: [[0, 0], [3.1, 0], [6.3, 0], [9.4, 0], [12.6, 0], [15.7, 0], [18.9, 0], [22, 0], [24.3, 0.6], [26, 2.3], [26.6, 4.6], [26, 6.9], [24.3, 8.6], [22, 9.2], [18.9, 9.2], [15.7, 9.2], [12.6, 9.2], [9.4, 9.2], [6.3, 9.2], [3.1, 9.2], [0, 9.2], [-2.3, 9.8], [-4, 11.5], [-4.6, 13.8], [-4, 16.1], [-2.3, 17.8], [0, 18.4], [3.1, 18.4], [6.3, 18.4], [9.4, 18.4], [12.6, 18.4], [15.7, 18.4], [18.9, 18.4], [22, 18.4], [24.3, 19], [26, 20.7], [26.6, 23], [26, 25.3], [24.3, 27], [22, 27.6], [18.9, 27.6], [15.7, 27.6], [12.6, 27.6], [9.4, 27.6], [6.3, 27.6], [3.1, 27.6], [0, 27.6], [-2.3, 28.2], [-4, 29.9], [-4.6, 32.2], [-4, 34.5], [-2.3, 36.2], [0, 36.8], [3.1, 36.8], [6.3, 36.8], [9.4, 36.8], [12.6, 36.8], [15.7, 36.8], [18.9, 36.8], [22, 36.8], [24.3, 37.4], [26, 39.1], [26.6, 41.4], [26, 43.7], [24.3, 45.4], [22, 46], [18.9, 46], [15.7, 46], [12.6, 46], [9.4, 46], [6.3, 46], [3.1, 46], [0, 46], [-2.3, 46.6], [-4, 48.3], [-4.6, 50.6], [-4, 52.9], [-2.3, 54.6], [0, 55.2], [3.1, 55.2], [6.3, 55.2], [9.4, 55.2], [12.6, 55.2], [15.7, 55.2], [18.9, 55.2], [22, 55.2], [24.3, 55.8], [26, 57.5], [26.6, 59.8], [26, 62.1], [24.3, 63.8], [22, 64.4], [18.7, 64.4], [15.4, 64.4], [12.1, 64.4], [9.5, 65.2], [7.8, 67.4], [6.6, 69.3], [4.6, 70.3], [2.4, 70.3], [0.4, 69.3], [-0.8, 67.4], [-2.5, 65.2], [-5.1, 64.4], [-8.4, 64.4], [-11.7, 64.4], [-15, 64.4], [-17.5, 63.7], [-19.3, 61.9], [-20, 59.4], [-20, 58.8], [-20.8, 56.1], [-23, 54.4], [-24.9, 53.2], [-25.9, 51.2], [-25.9, 49], [-24.9, 47], [-23, 45.8], [-20.8, 44.1], [-20, 41.5], [-20, 40.8], [-20.8, 38.2], [-23, 36.5], [-24.9, 35.3], [-25.9, 33.3], [-25.9, 31.1], [-24.9, 29.1], [-23, 27.9], [-20.8, 26.2], [-20, 23.6], [-20, 22.9], [-20.8, 20.3], [-23, 18.6], [-24.9, 17.4], [-25.9, 15.4], [-25.9, 13.2], [-24.9, 11.2], [-23, 10], [-20.8, 8.3], [-20, 5.6], [-20, 5], [-19.3, 2.5], [-17.5, 0.7], [-15, 0], [-12, 0], [-9, 0], [-6, 0], [-3, 0]], theme: { ground: '#4a2f3a', road: '#f1e4d3', curb: '#ffd23f', fence: '#e2483d', leaves: ['#ff9f6b', '#ffcf6b', '#c77dff', '#f78fb3'] } },
].map(t => ({ ...t, T: buildTrack(t.points, t.road, t.wall) }));
export const trackById = id => TRACKS.find(t => t.id === id) || TRACKS[0];
export const TRACK = TRACKS[0].T;

// 找離 (x, y) 最近的取樣點。hint 是上一次的位置索引（只在附近找，避免跳到相鄰的另一段賽道）。
// 回傳 i（索引）、s（沿賽道距離 0..L）、d（橫向偏移，右側為正）
export function locate(x, y, hint = null, T = TRACK) {
  let best = 0, bd = Infinity;
  const check = j => { const dx = x - T.xs[j], dy = y - T.ys[j], d2 = dx * dx + dy * dy; if (d2 < bd) { bd = d2; best = j; } };
  if (hint == null) for (let j = 0; j < T.N; j++) check(j);
  else for (let k = -16; k <= 16; k++) check(((hint + k) % T.N + T.N) % T.N);
  const dx = x - T.xs[best], dy = y - T.ys[best];
  let s = best * T.STEP + dx * T.tx[best] + dy * T.ty[best]; s = ((s % T.L) + T.L) % T.L;
  return { i: best, s, d: -dx * T.ty[best] + dy * T.tx[best] };
}
// 沿賽道距離 s、橫向偏移 lat（右側為正）的座標與朝向
export function trackPoint(s, lat = 0, T = TRACK) {
  s = ((s % T.L) + T.L) % T.L; const j = Math.floor(s / T.STEP) % T.N, k = (j + 1) % T.N, u = s / T.STEP - Math.floor(s / T.STEP);
  const x = T.xs[j] + (T.xs[k] - T.xs[j]) * u, y = T.ys[j] + (T.ys[k] - T.ys[j]) * u;
  return { x: x - T.ty[j] * lat, y: y + T.tx[j] * lat, h: Math.atan2(T.ty[j], T.tx[j]) };
}

/* ---------- 建立一場 ---------- */
// humans: [{ uid, name, color, ear }]（最多 4 人，順序 = 起跑格位）；空位補電腦，bots 為 false 時不補
export function createGame({ seed = 1, humans = [], bots = true, laps = LAPS, track = TRACKS[0].id, diff = 'normal', mode = 'item' } = {}) {
  const rng = rngFrom(seed), tr = trackById(track), T = tr.T, D = DIFFS[diff] || DIFFS.normal;
  const g = { seed: seed >>> 0, rng, laps, trackId: tr.id, T, diff: DIFFS[diff] ? diff : 'normal', mode: MODES[mode] ? mode : 'item', phase: 'countdown', cd: COUNTDOWN, time: 0, karts: [], boxes: [], shots: [], hazards: [], nextId: 1, events: [], over: false, result: null, firstFinishAt: null, finishCount: 0 };
  const hs = humans.slice(0, MAX_PLAYERS), used = new Set(), earKeys = Object.keys(EARS);
  const pickColor = c => { if (!COLORS.includes(c) || used.has(c)) c = COLORS.find(k => !used.has(k)); used.add(c); return c; };
  const colors = hs.map(h => pickColor(h.color));
  const names = [...BOT_NAMES]; for (let i = names.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [names[i], names[j]] = [names[j], names[i]]; }
  const laneK = Math.min(1, (T.road - .25) / 2.25); // 窄路：4 個起跑格往中間收，車心都在路面上
  for (let i = 0; i < MAX_PLAYERS; i++) {
    const h = hs[i]; if (!h && !bots) continue;
    const s0 = -2, lat = GRID_LANES[i] * laneK, p = trackPoint(s0, lat, T), loc = locate(p.x, p.y, null, T);
    g.karts.push({
      id: g.karts.length, uid: h ? String(h.uid ?? i) : null, name: h ? String(h.name || '玩家').slice(0, 12) : names[i], human: !!h,
      color: h ? colors[i] : pickColor(null), ear: h && EARS[h.ear] ? h.ear : earKeys[(i + 1) % earKeys.length], eye: h ? (Object.hasOwn(EYES, h.eye) ? h.eye : 'dot') : EYE_KEYS[(i + 2) % EYE_KEYS.length], body: h && BODIES.includes(h.body) ? h.body : BODIES[0], blush: h && BLUSHES.includes(h.blush) ? h.blush : BLUSHES[0],
      x: p.x, y: p.y, h: p.h, v: 0, steer: 0, gas: false, brake: false, driftIn: false, drift: 0, charge: 0, level: 0, boost: 0, chain: 0, combo: 0, shoe: 0, trap: 0, immune: 0, spin: 0, shield: 0,
      storm: 0, stormBy: null, hot: 0, hotBy: null, hotCD: 0, ghost: 0, gauge: 0, nitro: 0,
      item: null, hint: loc.i, s: loc.s, total: s0, lap: 1, done: false, place: 0, finishT: null, state: 'racing', rank: i + 1, startPress: null,
      ai: h ? null : { lane: lat * .6, laneT: 1 + rng() * 3, drifting: false, itemT: .6 + rng(), speed: D.speed + rng() * D.spread },
    });
  }
  const bl = Math.min(2, T.road - .6); // 每排 3 個道具箱，窄路排得近一點；競速賽沒有道具箱
  if (g.mode === 'item') for (const r of tr.boxes || [.3, .68]) for (const lat of [-bl, 0, bl]) { const p = trackPoint(T.L * r, lat, T); g.boxes.push({ i: g.boxes.length, x: p.x, y: p.y, t: 0 }); }
  return g;
}
const ev = (g, e) => g.events.push(e);

/* ---------- 輸入 ---------- */
export function setInput(g, id, input = {}) {
  const k = g.karts[id]; if (!k) return;
  const steer = Number(input.steer); k.steer = Number.isFinite(steer) ? clamp(steer, -1, 1) : 0;
  const gas = !!input.gas;
  if (g.phase === 'countdown' && gas && !k.gas && k.startPress == null) k.startPress = g.cd; // 起跑：記下第一次踩油門的時間
  k.gas = gas; k.brake = !!input.brake; k.driftIn = !!input.drift;
}
export function useItem(g, id) {
  const k = g.karts[id];
  if (!k || g.phase !== 'race' || k.trap > 0 || k.state !== 'racing') return false;
  if (g.mode === 'speed') { // 競速賽：道具鍵用氮氣
    if (!(k.nitro > 0) || k.done) return false;
    k.nitro--; k.shoe = ITEMS.shoe.time; ev(g, { e: 'use', id: k.id, kind: 'nitro' });
    return true;
  }
  if (!k.item) return false;
  const kind = k.item; k.item = null;
  const fx = Math.cos(k.h), fy = Math.sin(k.h);
  if (kind === 'shoe') k.shoe = ITEMS.shoe.time;
  else if (kind === 'shield') k.shield = ITEMS.shield.time;
  else if (kind === 'jet' || kind === 'hot') { // 鎖定前方最近的車；前面沒人：水柱沿賽道直直噴出去，燙手泡泡往後飛黏後面最近的車
    const reach = ITEMS[kind].reach, rs = rivals(g, k);
    let tgt = rs.filter(o => o.total > k.total && o.total - k.total < reach).sort((a, b) => a.total - b.total)[0], dir = 1;
    if (!tgt && kind === 'hot') { tgt = rs.filter(o => o.total <= k.total && k.total - o.total < reach).sort((a, b) => b.total - a.total)[0]; dir = -1; }
    if (tgt && kind === 'hot' && Math.abs(tgt.total - k.total) < 1.5) stickHot(g, tgt, k.id); // 就在旁邊：直接黏上
    else g.shots.push({ id: g.nextId++, owner: k.id, kind, target: tgt ? tgt.id : null, dir, prog: k.total + dir, lat: clamp(locate(k.x, k.y, k.hint, g.T).d, -g.T.road, g.T.road), x: k.x, y: k.y, dist: 0 }); // 從草地發射也從路面上出發
  } else if (kind === 'storm') { // 鎖定第一名；第一名換人或完賽，飛行中會改追新的第一名
    const tgt = leader(g, k);
    if (tgt) g.shots.push({ id: g.nextId++, owner: k.id, kind, target: tgt.id, x: k.x, y: k.y, dist: 0, life: ITEMS.storm.life });
  } else if (kind === 'ghost') {
    k.ghost = ITEMS.ghost.time;
    const has = g.karts.filter(o => o !== k && o.state === 'racing' && o.item);
    const v = has.filter(o => o.total > k.total).sort((a, b) => a.total - b.total)[0] || has.sort((a, b) => b.total - a.total)[0];
    if (v) { k.item = v.item; v.item = null; ev(g, { e: 'steal', id: k.id, from: v.id, kind: k.item }); }
  } else if (kind === 'puddle' || kind === 'decoy') {
    const it = ITEMS[kind], lats = kind === 'puddle' ? it.drop : [0], back = kind === 'puddle' ? 1.3 : 1.5;
    for (const lat of lats) g.hazards.push({ id: g.nextId++, owner: k.id, kind, x: k.x - fx * back - fy * lat, y: k.y - fy * back + fx * lat, life: it.life, arm: it.arm });
    const same = g.hazards.filter(z => z.kind === kind); // 同一種超過上限就收掉最舊的
    for (const z of same.slice(0, Math.max(0, same.length - it.max))) g.hazards.splice(g.hazards.indexOf(z), 1);
  }
  ev(g, { e: 'use', id: k.id, kind });
  return true;
}
export function forfeit(g, id) { const k = g.karts[id]; if (!k || k.state !== 'racing') return; k.state = 'out'; k.v = 0; k.item = null; k.shield = 0; k.storm = 0; k.hot = 0; ev(g, { e: 'out', id }); }
const rivals = (g, k) => g.karts.filter(o => o !== k && o.state === 'racing' && !o.done);
const leader = (g, k) => rivals(g, k).sort((a, b) => b.total - a.total)[0] || null;
const tangible = k => k.state === 'racing' && !(k.ghost > 0); // 小幽靈透明時，道具和車子都穿過去
// 被打中：有泡泡盾就擋掉這一次（盾也跟著破），回傳 true
function blocked(g, k, by, kind) {
  if (!(k.shield > 0)) return false;
  k.shield = 0; ev(g, { e: 'block', id: k.id, by, kind });
  return true;
}
// 被泡泡困住（水柱、雷雨雲、燙手泡泡）或打滑（水窪、假道具箱）；火花和連噴都歸零
function trapKart(g, k, by, kind, t) {
  if (blocked(g, k, by, kind)) return;
  k.trap = t; k.drift = 0; k.charge = 0; k.level = 0; k.chain = 0; ev(g, { e: 'hit', id: k.id, by, kind });
}
function spinKart(g, k, by, kind) {
  if (blocked(g, k, by, kind)) return;
  const it = ITEMS[kind]; k.spin = it.spin; k.v *= it.slow; k.drift = 0; k.charge = 0; k.level = 0; k.chain = 0; ev(g, { e: 'spin', id: k.id, by, kind });
}
// 燙手泡泡黏上 k：泡泡盾擋得掉；已經黏著一顆就不再多黏
function stickHot(g, k, by) {
  if (k.hot > 0 || blocked(g, k, by, 'hot')) return;
  k.hot = ITEMS.hot.fuse; k.hotBy = by; k.hotCD = 0; ev(g, { e: 'stick', id: k.id, by });
}
// 燙手泡泡：兩台車碰到時從 a 黏到 b
function passHot(g, a, b) {
  if (!(a.hot > 0) || b.hot > 0 || a.hotCD > 0 || b.done || b.state !== 'racing') return false;
  b.hot = Math.max(a.hot, ITEMS.hot.min); b.hotBy = a.id; b.hotCD = ITEMS.hot.pass; a.hot = 0;
  ev(g, { e: 'pass', id: b.id, by: a.id });
  return true;
}

/* ---------- 道具抽取 ---------- */
function oddsFor(g, k) {
  const n = g.karts.filter(o => o.state !== 'out').length;
  if (n <= 1) return ODDS.mid;
  return k.rank === 1 ? ODDS.first : k.rank >= n ? ODDS.last : ODDS.mid;
}
export function rollItem(g, k) {
  const o = oddsFor(g, k); let r = g.rng() * ITEM_KINDS.reduce((a, kd) => a + o[kd], 0);
  for (const kd of ITEM_KINDS) { if (r < o[kd]) return kd; r -= o[kd]; }
  return ITEM_KINDS.at(-1);
}

/* ---------- 電腦對手（也負責完賽後的自動駕駛） ---------- */
function driveAI(g, k, dt) {
  const ai = k.ai || (k.ai = { lane: 0, laneT: 2, drifting: false, itemT: 1, speed: .9 }), T = g.T;
  k.gas = true; k.brake = false;
  ai.laneT -= dt; if (ai.laneT <= 0) { ai.laneT = 2 + g.rng() * 3; ai.lane = (g.rng() - .5) * Math.min(3, (T.road - .8) * 2); } // 窄路換線幅度跟著變小
  if (k.hot > 0 && k.hotCD <= 0 && !k.done) { // 身上有燙手泡泡：往 8 格內最近的車靠過去，撞到就傳出去
    const o = rivals(g, k).filter(o => tangible(o) && !(o.hot > 0) && Math.abs(o.total - k.total) < 8).sort((a, b) => Math.abs(a.total - k.total) - Math.abs(b.total - k.total))[0];
    if (o) ai.lane = clamp(locate(o.x, o.y, o.hint, T).d, -T.road, T.road);
  }
  const look = Math.round((3 + Math.max(0, k.v) * .45) / T.STEP), j = (k.hint + look) % T.N;
  const tx = T.xs[j] - T.ty[j] * ai.lane, ty = T.ys[j] + T.tx[j] * ai.lane;
  const diff = wrapAngle(Math.atan2(ty - k.y, tx - k.x) - k.h);
  k.steer = clamp(diff * 2.2, -1, 1);
  // 困難：前方 10 格轉超過 0.45 弧度就漂移；集到火花、上一段加速快用完才放開，接著再甩，連噴過彎。
  // 窄路（雷霆峽谷）的髮夾彎比加速中的迴轉半徑小，連噴只會撞牆，改用一般的偶爾漂移
  if (DIFFS[g.diff]?.chain && !k.done && T.road >= ROAD) {
    const m = Math.round(10 / T.STEP), ang = j => Math.atan2(T.ty[j % T.N], T.tx[j % T.N]), turnAt = a => wrapAngle(ang(k.hint + a + m) - ang(k.hint + a)), turn = turnAt(0);
    let sharp = false; for (let a = 0; a <= 2 * m && !sharp; a += 4) sharp = Math.abs(turnAt(a)) > 1.2; // 前方 20 格內有急彎：加速中轉不過去（也不能煞車），不為了連噴提早放開
    if (!ai.drifting && k.v > 7 && Math.abs(turn) > .45 && Math.sign(turn) === Math.sign(diff)) ai.drifting = true;
    else if (ai.drifting && (Math.abs(turn) < .2 || k.v < DRIFT.MIN_V || (k.drift && Math.sign(diff) !== k.drift && Math.abs(diff) > .15) || (k.level >= 1 && k.boost < .15 && !sharp) || k.level >= 3)) ai.drifting = false;
  } else {
    if (!ai.drifting && Math.abs(diff) > .35 && k.v > 7 && g.rng() < .3) ai.drifting = true;
    if (ai.drifting && (Math.abs(diff) < .1 || k.charge > 1.5 || k.v < DRIFT.MIN_V)) ai.drifting = false;
  }
  k.driftIn = ai.drifting;
  if (g.mode === 'speed') { // 競速賽：在直線上、沒有其他加速時用氮氣
    if (k.nitro > 0 && !k.done && !k.drift && k.boost <= 0 && k.shoe <= 0) {
      const m = Math.round(12 / T.STEP), ang = j => Math.atan2(T.ty[j % T.N], T.tx[j % T.N]);
      if (Math.abs(wrapAngle(ang(k.hint + m) - ang(k.hint))) < .25) useItem(g, k.id);
    }
  } else if (k.item && !k.done) {
    ai.itemT -= dt;
    if (ai.itemT <= 0) {
      const behind = g.karts.some(o => o !== k && o.state === 'racing' && k.total - o.total > 0 && k.total - o.total < 6);
      // 威脅：追著自己的水柱、雷雨雲或燙手泡泡靠近，或頭上已經有雲、身上黏著泡泡
      const threat = k.storm > 0 || k.hot > 0 || g.shots.some(s => s.owner !== k.id && s.target === k.id && Math.hypot(s.x - k.x, s.y - k.y) < (s.kind === 'storm' ? 15 : 9));
      const hotTarget = rivals(g, k).some(o => Math.abs(o.total - k.total) < ITEMS.hot.reach); // 前面沒人時會往後黏
      const use = { shoe: true, puddle: behind, shield: threat || behind, jet: k.rank > 1, storm: k.rank > 1, hot: hotTarget, ghost: threat || g.karts.some(o => o !== k && o.item), decoy: behind }[k.item];
      if (use || ai.itemT < -5) { useItem(g, k.id); ai.itemT = .6 + g.rng(); }
    }
  }
}

/* ---------- 每台車一步 ---------- */
function driveKart(g, k, dt, band) {
  if (k.trap > 0) { k.trap -= dt; k.v = Math.max(0, k.v - 30 * dt); if (k.trap <= 0) { k.trap = 0; k.immune = IMMUNE; } }
  else if (k.immune > 0) k.immune = Math.max(0, k.immune - dt);
  if (k.boost > 0) k.boost = Math.max(0, k.boost - dt);
  if (k.shoe > 0) k.shoe = Math.max(0, k.shoe - dt);
  if (k.shield > 0) k.shield = Math.max(0, k.shield - dt);
  if (k.ghost > 0) k.ghost = Math.max(0, k.ghost - dt);
  if (k.hotCD > 0) k.hotCD = Math.max(0, k.hotCD - dt);
  if (k.done) { k.storm = 0; k.hot = 0; }
  // 雷雨雲下雨、燙手泡泡爆炸；剛好透明、被困住或剛脫困（immune）就沒事
  if (k.storm > 0 && (k.storm -= dt) <= 0) { k.storm = 0; if (k.ghost > 0 || k.trap > 0 || k.immune > 0) ev(g, { e: 'miss', id: k.id, by: k.stormBy, kind: 'storm' }); else trapKart(g, k, k.stormBy, 'storm', ITEMS.storm.trap); }
  if (k.hot > 0 && (k.hot -= dt) <= 0) { k.hot = 0; if (k.trap > 0 || k.immune > 0) ev(g, { e: 'miss', id: k.id, by: k.hotBy, kind: 'hot' }); else trapKart(g, k, k.hotBy, 'hot', ITEMS.hot.trap); }
  const stunned = k.trap > 0 || k.spin > 0;
  if (k.spin > 0) { k.spin = Math.max(0, k.spin - dt); k.v = Math.max(0, k.v - 6 * dt); }
  if (!stunned && (!k.human || k.done)) driveAI(g, k, dt);
  const steer = stunned ? 0 : k.steer, driftIn = stunned ? false : k.driftIn;
  // 漂移：按住漂移並轉向開始；放開時依累積時間給加速
  // 連噴：在氮氣加速中開始的漂移，放開時 chain 加 1；中斷（加速結束後才甩、被打中、沒集到火花）就從 1 重算
  if (!k.drift && driftIn && k.v >= DRIFT.MIN_V && Math.abs(steer) > .3) { k.drift = Math.sign(steer); k.charge = 0; k.level = 0; k.combo = k.boost > 0 ? k.chain : 0; }
  if (k.drift && (!driftIn || k.v < DRIFT.MIN_V * .7)) {
    if (!driftIn && k.level > 0) { k.chain = k.combo + 1; k.boost = Math.max(k.boost, DRIFT.BOOST[k.level]); ev(g, { e: 'boost', id: k.id, level: k.level, chain: k.chain }); }
    else k.chain = 0;
    k.drift = 0; k.charge = 0; k.level = 0;
  }
  if (k.drift && !k.wallHit) { k.charge += dt * (k.boost > 0 ? DRIFT.CHAIN : 1); k.level = DRIFT.LEVELS.filter(t => k.charge >= t).length; } // 擦著牆時火花暫停累積，不能靠磨牆集滿粉色
  if (g.mode === 'speed' && k.drift && !k.wallHit && !k.done && k.nitro < NITRO.max && (k.gauge += dt / NITRO.fill) >= 1) { k.gauge -= 1; k.nitro++; ev(g, { e: 'nitro', id: k.id, n: k.nitro }); } // 氮氣槽：存滿 max 個就停在原處
  // 轉向：低速轉不動，高速轉得慢；漂移時固定往漂移方向彎，搖桿只調鬆緊
  const sp = Math.abs(k.v), tf = clamp(sp / 3, 0, 1) * (1 - .35 * Math.min(1, sp / KART.VMAX)) * (k.v < 0 ? -1 : 1); // 倒車時方向盤反過來
  const turn = k.drift ? k.drift * (.75 + .45 * steer * k.drift) : steer;
  k.h = wrapAngle(k.h + turn * KART.TURN * tf * dt);
  // 速度
  const T = g.T, loc0 = locate(k.x, k.y, k.hint, T), off = Math.abs(loc0.d) > T.road;
  let vmax = KART.VMAX * (off ? KART.OFFROAD : 1) * (k.ai && !k.human ? k.ai.speed * band : 1) * (k.drift ? .96 : 1) * (k.done ? .8 : 1);
  const mult = Math.max(k.boost > 0 ? DRIFT.MULT : 1, k.shoe > 0 ? ITEMS.shoe.mult : 1);
  if (mult > 1) vmax = KART.VMAX * mult * (off ? .75 : 1);
  // 油門才加速；加速效果期間不用踩也會衝；放開滑行減速；煞車先停下再慢慢倒車
  if (!stunned) {
    const gas = ((k.gas || driftIn) && !k.brake) || mult > 1; // 按住漂移也算踩油門，手機不用同時按兩顆鍵
    if (gas) k.v = k.v < vmax ? Math.min(vmax, k.v + KART.ACCEL * (mult > 1 ? 3 : 1) * dt * (k.v < 0 ? 3 : 1)) : Math.max(vmax, k.v - KART.BRAKE * dt);
    else if (k.brake) k.v = k.v > 0 ? Math.max(0, k.v - KART.STOP * dt) : Math.max(-KART.REVERSE, k.v - KART.ACCEL * .5 * dt);
    else k.v = k.v > 0 ? Math.max(0, k.v - KART.COAST * dt) : Math.min(0, k.v + KART.COAST * dt);
    if (k.v > vmax && !gas) k.v = Math.max(vmax, k.v - KART.BRAKE * dt);
  }
  k.x += Math.cos(k.h) * k.v * dt; k.y += Math.sin(k.h) * k.v * dt;
  // 牆：推回牆內、減速、車頭轉向沿著賽道
  let loc = locate(k.x, k.y, k.hint, T);
  if (Math.abs(loc.d) > T.wall) {
    const over = Math.abs(loc.d) - T.wall, sg = Math.sign(loc.d), i = loc.i;
    k.x -= -T.ty[i] * sg * over; k.y -= T.tx[i] * sg * over;
    const ta = Math.atan2(T.ty[i], T.tx[i]), fw = Math.cos(wrapAngle(k.h - ta)) >= 0;
    k.h = wrapAngle(k.h + wrapAngle((fw ? ta : ta + Math.PI) - k.h) * .4);
    if (!k.wallHit) { k.v *= KART.WALL_LOSS; ev(g, { e: 'bump', id: k.id }); }
    k.wallHit = true; loc = locate(k.x, k.y, loc.i, T);
  } else k.wallHit = false;
  // 進度：沿賽道的累計距離；倒車會扣回去，所以抄近路或反向都不會多算圈
  let ds = loc.s - k.s; if (ds < -T.L / 2) ds += T.L; else if (ds > T.L / 2) ds -= T.L;
  k.total += ds; k.s = loc.s; k.hint = loc.i;
  const lap = clamp(Math.floor(k.total / T.L) + 1, 1, g.laps);
  if (lap > k.lap) { k.lap = lap; ev(g, { e: 'lap', id: k.id, lap }); }
  if (!k.done && k.total >= g.laps * T.L) {
    k.done = true; k.finishT = g.time; k.place = ++g.finishCount; k.item = null;
    if (g.firstFinishAt == null) g.firstFinishAt = g.time;
    ev(g, { e: 'finish', id: k.id, place: k.place, time: Math.round(g.time * 100) / 100 });
  }
}

function rankKarts(g) {
  const order = [...g.karts].sort((a, b) => {
    const ka = a.state === 'out' ? 2 : a.done ? 0 : 1, kb = b.state === 'out' ? 2 : b.done ? 0 : 1;
    if (ka !== kb) return ka - kb;
    return ka === 0 ? a.place - b.place : b.total - a.total;
  });
  order.forEach((k, i) => { k.rank = i + 1; });
  return order;
}

function finish(g, reason) {
  if (g.over) return;
  g.over = true; g.phase = 'over';
  const order = rankKarts(g), w = order[0] && order[0].done ? order[0] : null;
  g.result = {
    reason, laps: g.laps, duration: Math.round(g.time), winner: w ? { id: w.id, name: w.name, bot: w.uid == null } : null,
    players: order.map((k, i) => ({ rank: i + 1, id: k.id, uid: k.uid, name: k.name, bot: k.uid == null, time: k.done ? Math.round(k.finishT * 100) / 100 : null, points: k.state === 'out' ? 0 : POINTS[i] ?? 0, out: k.state === 'out' })),
  };
  ev(g, { e: 'end', result: g.result });
}

// 前進 dt 秒（建議固定 0.05）；回傳這段時間產生的事件
export function step(g, dt) {
  if (g.over) { const out = g.events; g.events = []; return out; }
  if (g.phase === 'countdown') {
    g.cd -= dt;
    if (g.cd <= 0) {
      g.cd = 0; g.phase = 'race'; ev(g, { e: 'go' });
      for (const k of g.karts) {
        const good = k.human ? k.startPress != null && k.startPress <= START_WINDOW && k.startPress > 0 : g.rng() < .5; // 真人：最後 0.5 秒內才踩油門
        if (good) { k.boost = START_BOOST; ev(g, { e: 'boost', id: k.id, level: 0 }); }
      }
    }
    const out = g.events; g.events = []; return out;
  }
  g.time += dt;
  const humans = g.karts.filter(k => k.human && k.state === 'racing'), lead = humans.length ? Math.max(...humans.map(k => k.total)) : null;
  for (const k of g.karts) {
    if (k.state === 'out') continue;
    const band = lead == null || k.human ? 1 : k.total - lead > 20 ? .94 : lead - k.total > 20 ? 1.06 : 1; // 電腦太前面就放慢、太後面就加快
    driveKart(g, k, dt, band);
  }
  // 車子互撞：把兩台車完全推開，再沿碰撞方向交換一部分速度（後車減速、前車被頂一下），撞得夠用力會往側邊彈。
  // 透明的車直接穿過去；碰到時燙手泡泡會黏到對方身上
  const live = g.karts.filter(k => k.state !== 'out');
  for (let a = 0; a < live.length; a++) for (let b = a + 1; b < live.length; b++) {
    const A = live[a], B = live[b], dx = B.x - A.x, dy = B.y - A.y, d = Math.hypot(dx, dy), min = KART.R * 2;
    if (!(d < min) || A.ghost > 0 || B.ghost > 0) continue;
    passHot(g, A, B) || passHot(g, B, A);
    const ux = d > 1e-6 ? dx / d : 1, uy = d > 1e-6 ? dy / d : 0, push = (min - d) / 2 + .02;
    A.x -= ux * push; A.y -= uy * push; B.x += ux * push; B.y += uy * push;
    const ax = Math.cos(A.h) * A.v, ay = Math.sin(A.h) * A.v, bx = Math.cos(B.h) * B.v, by = Math.sin(B.h) * B.v;
    const closing = (ax - bx) * ux + (ay - by) * uy; // 正數：兩台車正在互相靠近
    if (closing > 0) {
      const j = closing * KART.BOUNCE, nax = ax - ux * j, nay = ay - uy * j, nbx = bx + ux * j, nby = by + uy * j;
      A.v = nax * Math.cos(A.h) + nay * Math.sin(A.h); B.v = nbx * Math.cos(B.h) + nby * Math.sin(B.h);
      const shove = Math.min(.45, j * .05); A.x -= ux * shove; A.y -= uy * shove; B.x += ux * shove; B.y += uy * shove;
      if (closing > 2) ev(g, { e: 'crash', a: A.id, b: B.id });
    }
  }
  rankKarts(g);
  // 道具箱
  for (const b of g.boxes) {
    if (b.t > 0) { b.t = Math.max(0, b.t - dt); continue; }
    const k = live.find(k => k.state === 'racing' && !k.done && k.trap <= 0 && Math.hypot(k.x - b.x, k.y - b.y) < BOX_R);
    if (!k) continue;
    b.t = BOX_RESPAWN;
    if (!k.item) { k.item = rollItem(g, k); ev(g, { e: 'item', id: k.id, kind: k.item }); }
  }
  // 超級水柱和燙手泡泡沿賽道前進、橫向慢慢對準目標，不會撞牆；雷雨雲直接飛向目標
  const popAt = s => ev(g, { e: 'pop', x: Math.round(s.x * 100) / 100, y: Math.round(s.y * 100) / 100 });
  for (const s of [...g.shots]) {
    const it = ITEMS[s.kind], d = it.speed * dt;
    if (s.kind === 'storm') {
      let t = g.karts[s.target];
      if (!t || t.state !== 'racing' || t.done) { t = leader(g, g.karts[s.owner]); s.target = t ? t.id : null; }
      s.life -= dt; let gone = !t || s.life <= 0;
      if (!gone) {
        const dx = t.x - s.x, dy = t.y - s.y, dd = Math.hypot(dx, dy);
        if (dd > Math.max(it.hitR, d)) { s.x += dx / dd * d; s.y += dy / dd * d; }
        else { s.x = t.x; s.y = t.y; if (!(t.ghost > 0)) { gone = true; if (!(t.storm > 0)) { t.storm = it.delay; t.stormBy = s.owner; ev(g, { e: 'cloud', id: t.id, by: s.owner }); } } } // 目標透明時雲停在頭上等
      }
      if (gone) { g.shots.splice(g.shots.indexOf(s), 1); if (s.life <= 0 || !t) popAt(s); }
      continue;
    }
    s.prog += d * (s.dir || 1);
    const t = s.target != null ? g.karts[s.target] : null;
    if (t && t.state === 'racing') { const want = clamp(locate(t.x, t.y, t.hint, g.T).d, -g.T.road, g.T.road); s.lat += clamp(want - s.lat, -it.steer * dt, it.steer * dt); }
    const p = trackPoint(s.prog, s.lat, g.T); s.x = p.x; s.y = p.y;
    s.dist += d;
    const near = k => tangible(k) && k.id !== s.owner && Math.hypot(k.x - s.x, k.y - s.y) < it.hitR;
    const hit = s.kind === 'hot' ? live.find(k => near(k) && !k.done) // 燙手泡泡被困住的車也黏得上
      : live.find(k => near(k) && k.trap <= 0 && k.immune <= 0);
    if (hit && s.kind === 'hot') stickHot(g, hit, s.owner);
    else if (hit) trapKart(g, hit, s.owner, s.kind, it.trap);
    if (hit || s.dist > it.range) { g.shots.splice(g.shots.indexOf(s), 1); if (!hit) popAt(s); }
  }
  // 水窪、假道具箱：撞到打滑
  for (const z of [...g.hazards]) {
    const it = ITEMS[z.kind]; z.life -= dt; z.arm -= dt;
    const k = live.find(k => tangible(k) && k.trap <= 0 && k.spin <= 0 && (k.id !== z.owner || z.arm <= 0) && Math.hypot(k.x - z.x, k.y - z.y) < it.hitR);
    if (k) spinKart(g, k, z.owner, z.kind);
    if (k || z.life <= 0) g.hazards.splice(g.hazards.indexOf(z), 1);
  }
  // 結束：所有真人完賽或出局、全部完賽、第一名衝線後 FINISH_GRACE 秒、或超過 MAX_TIME
  const racing = g.karts.filter(k => k.state === 'racing'), hs = g.karts.filter(k => k.human);
  if (!racing.length || racing.every(k => k.done)) finish(g, 'all');
  else if (hs.length && hs.every(k => k.done || k.state === 'out')) finish(g, 'humans');
  else if (g.firstFinishAt != null && g.time - g.firstFinishAt >= FINISH_GRACE) finish(g, 'grace');
  else if (g.time >= MAX_TIME) finish(g, 'time');
  const out = g.events; g.events = []; return out;
}

// 精簡、可 JSON 化的畫面資料（畫面與連線共用）
// 連線每個 tick 送 full: false 的版本，約省一半流量：不送整場不變的資料（名字、顏色、耳朵、道具箱座標），值是 0 的欄位也省略。
// 客戶端用 expandFrame 拿開局時的完整快照補回來
const r2 = v => Math.round(v * 100) / 100, r3 = v => Math.round(v * 1000) / 1000;
const KART_STATIC = ['uid', 'name', 'human', 'color', 'ear', 'eye', 'body', 'blush'], KART_ZERO = ['dr', 'dl', 'bo', 'tr', 'sp', 'im', 'sh', 'cl', 'ho', 'gh', 'ni', 'ga', 'done', 'place'];
// shots 第 4 欄的道具代碼（0 原本是水球，已移除）；haz 第 4 欄 1 = 假道具箱、0 = 水窪
export const SHOT_CODE = { jet: 1, storm: 2, hot: 3 };
export function snapshot(g, { full = true } = {}) {
  const s = fullSnapshot(g);
  if (full) return s;
  const karts = s.karts.map(k => Object.fromEntries(Object.entries(k).filter(([key, v]) => !KART_STATIC.includes(key) && !(v === 0 && KART_ZERO.includes(key)))));
  const { mode, ...rest } = s;
  return { ...rest, full: 0, karts, boxes: s.boxes.map(b => b[3]).join('') };
}
export function expandFrame(f, base) {
  if (f.full !== 0) return f;
  const { full, ...rest } = f;
  return {
    ...rest, mode: base.mode,
    karts: f.karts.map(k => { const b = base.karts.find(o => o.id === k.id) || {}, o = {}; for (const key of KART_STATIC) o[key] = b[key]; for (const key of KART_ZERO) o[key] = 0; return { ...o, ...k }; }),
    boxes: base.boxes.map((b, i) => [b[0], b[1], b[2], f.boxes[i] === '1' ? 1 : 0]),
  };
}
function fullSnapshot(g) {
  return {
    seed: g.seed, track: g.trackId, mode: g.mode, phase: g.phase, cd: r2(g.cd), time: r2(g.time), over: g.over, laps: g.laps,
    karts: g.karts.map(k => ({
      id: k.id, uid: k.uid, name: k.name, human: k.human, color: k.color, ear: k.ear, eye: k.eye, body: k.body, blush: k.blush, x: r3(k.x), y: r3(k.y), h: r3(k.h), v: r2(k.v),
      dr: k.drift, dl: k.level, bo: k.boost > 0 || k.shoe > 0 ? 1 : 0, tr: r2(k.trap), sp: r2(k.spin), im: k.immune > 0 ? 1 : 0, sh: k.shield > 0 ? 1 : 0,
      // cl：頭上有雷雨雲；ho：燙手泡泡還剩幾秒（無條件進位，每秒才變一次）；gh：透明；ni、ga：氮氣個數與氮氣槽（每 5% 一格）
      cl: k.storm > 0 ? 1 : 0, ho: Math.ceil(k.hot), gh: k.ghost > 0 ? 1 : 0, ni: k.nitro, ga: Math.round(k.gauge * 20) / 20,
      lap: k.lap, tot: r2(k.total), item: k.item, done: k.done ? 1 : 0, place: k.place, rank: k.rank, st: k.state,
    })),
    boxes: g.boxes.map(b => [b.i, r3(b.x), r3(b.y), b.t > 0 ? 0 : 1]),
    shots: g.shots.map(s => [s.id, r3(s.x), r3(s.y), SHOT_CODE[s.kind]]),
    haz: g.hazards.map(z => [z.id, r3(z.x), r3(z.y), z.kind === 'decoy' ? 1 : 0]),
  };
}
