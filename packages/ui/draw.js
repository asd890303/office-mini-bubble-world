// 共用繪圖原件：深褐描邊、高光、道具徽章。入口頁與遊戲用同一組，美術風格才會一致。
export const INK = '#3b2f2f';
export const inkPath = (x, fill, lw = 4) => { x.fillStyle = fill; x.fill(); x.lineWidth = lw; x.lineJoin = x.lineCap = 'round'; x.strokeStyle = INK; x.stroke(); };
export const shine = (x, px, py, rx, ry, rot = -.5) => { x.beginPath(); x.ellipse(px, py, rx, ry, rot, 0, Math.PI * 2); x.fillStyle = 'rgba(255,255,255,.85)'; x.fill(); };
export function drawShoe(x, c) { // 側視運動鞋：鞋面 + 白底 + 鞋帶
  x.beginPath(); x.moveTo(36, 30); x.lineTo(54, 30); x.quadraticCurveTo(56, 42, 66, 45); x.lineTo(84, 49); x.quadraticCurveTo(95, 52, 95, 62); x.lineTo(36, 62); x.closePath(); inkPath(x, c);
  x.beginPath(); x.roundRect(34, 61, 63, 9, 4); inkPath(x, '#fff');
  x.lineWidth = 3; x.strokeStyle = INK; x.beginPath(); x.moveTo(60, 47); x.lineTo(68, 43); x.moveTo(66, 51); x.lineTo(74, 47); x.stroke();
}
export const ITEM_ART = {
  bomb(x) { // 水球：藍色氣球 + 結 + 繩
    x.beginPath(); x.moveTo(64, 63); x.lineTo(58, 71); x.lineTo(70, 71); x.closePath(); inkPath(x, '#2f8fe0', 3);
    x.beginPath(); x.ellipse(64, 40, 20, 23, 0, 0, Math.PI * 2); inkPath(x, '#5ab8ff'); shine(x, 56, 31, 4.5, 8);
    x.beginPath(); x.moveTo(64, 71); x.quadraticCurveTo(57, 75, 64, 80); x.lineWidth = 3; x.strokeStyle = INK; x.stroke();
  },
  power(x) { // 水柱：大水滴 + 小水滴
    x.beginPath(); x.moveTo(60, 20); x.bezierCurveTo(60, 34, 40, 44, 40, 58); x.arc(60, 58, 20, Math.PI, 0, true); x.bezierCurveTo(80, 44, 60, 34, 60, 20); x.closePath(); inkPath(x, '#3fb6ff'); shine(x, 52, 56, 4, 8, .3);
    x.beginPath(); x.moveTo(86, 30); x.bezierCurveTo(86, 36, 78, 40, 78, 46); x.arc(86, 46, 8, Math.PI, 0, true); x.bezierCurveTo(94, 40, 86, 36, 86, 30); x.closePath(); inkPath(x, '#8fd8ff', 3);
  },
  speed(x) { // 速度鞋：綠色運動鞋 + 速度線
    drawShoe(x, '#4cd68a'); x.lineWidth = 4; x.lineCap = 'round'; x.strokeStyle = INK;
    x.beginPath(); x.moveTo(14, 38); x.lineTo(28, 38); x.moveTo(10, 48); x.lineTo(28, 48); x.moveTo(16, 58); x.lineTo(28, 58); x.stroke();
  },
  kick(x) { // 踢鞋：橘色運動鞋 + 撞擊線
    drawShoe(x, '#ff8a4c'); x.lineWidth = 4; x.lineCap = 'round'; x.strokeStyle = INK;
    x.beginPath(); x.moveTo(100, 40); x.lineTo(112, 34); x.moveTo(102, 52); x.lineTo(116, 52); x.moveTo(100, 64); x.lineTo(112, 70); x.stroke();
  },
  puddle(x) { // 水窪：扁平水灘 + 漣漪 + 高光
    x.beginPath(); x.moveTo(30, 52); x.bezierCurveTo(28, 36, 50, 30, 64, 36); x.bezierCurveTo(78, 28, 102, 34, 98, 50); x.bezierCurveTo(106, 64, 84, 74, 66, 70); x.bezierCurveTo(48, 78, 26, 68, 30, 52); x.closePath(); inkPath(x, '#9edcff');
    x.beginPath(); x.ellipse(64, 52, 16, 7, 0, 0, Math.PI * 2); x.lineWidth = 3; x.strokeStyle = '#3fa7e0'; x.stroke(); shine(x, 46, 46, 6, 3, 0);
  },
  shield(x) { // 泡泡盾：粉色泡泡 + 白色反光弧 + 小愛心
    x.beginPath(); x.arc(64, 50, 30, 0, Math.PI * 2); inkPath(x, '#ffd6ec');
    x.beginPath(); x.arc(64, 50, 22, Math.PI * 1.08, Math.PI * 1.42); x.lineWidth = 5; x.lineCap = 'round'; x.strokeStyle = '#fff'; x.stroke(); shine(x, 82, 34, 3, 5, .5);
    x.beginPath(); x.moveTo(64, 64); x.bezierCurveTo(50, 55, 53, 42, 64, 49); x.bezierCurveTo(75, 42, 78, 55, 64, 64); x.closePath(); inkPath(x, '#ff6fa8', 3);
  },
  storm(x) { // 雷雨雲：灰藍雲朵 + 黃色閃電 + 兩滴雨
    x.beginPath(); x.arc(46, 46, 14, Math.PI * .5, Math.PI * 1.5); x.arc(62, 34, 18, Math.PI * 1.1, Math.PI * 1.95); x.arc(82, 46, 14, Math.PI * 1.5, Math.PI * .5); x.closePath(); inkPath(x, '#c9d3e6');
    x.beginPath(); x.moveTo(66, 54); x.lineTo(54, 72); x.lineTo(63, 72); x.lineTo(57, 88); x.lineTo(76, 66); x.lineTo(67, 66); x.lineTo(74, 54); x.closePath(); inkPath(x, '#ffd23f', 3);
    for (const dx of [40, 88]) { x.beginPath(); x.moveTo(dx, 68); x.quadraticCurveTo(dx - 6, 78, dx, 81); x.quadraticCurveTo(dx + 6, 78, dx, 68); x.closePath(); inkPath(x, '#7cc8ff', 2.5); }
  },
  hot(x) { // 燙手泡泡：橘紅泡泡 + 頂端火苗 + 反光
    x.beginPath(); x.arc(64, 58, 26, 0, Math.PI * 2); inkPath(x, '#ff8a4c'); shine(x, 54, 48, 5, 9);
    x.beginPath(); x.moveTo(64, 14); x.bezierCurveTo(76, 24, 73, 34, 64, 36); x.bezierCurveTo(55, 34, 52, 24, 64, 14); x.closePath(); inkPath(x, '#ffd23f', 3);
  },
  ghost(x) { // 小幽靈：白色幽靈 + 波浪下擺 + 眼睛和圓嘴
    x.beginPath(); x.moveTo(40, 82); x.lineTo(40, 48); x.arc(64, 48, 24, Math.PI, 0); x.lineTo(88, 82);
    for (let sx = 88; sx > 40; sx -= 12) x.quadraticCurveTo(sx - 6, 92, sx - 12, 82);
    x.closePath(); inkPath(x, '#fffdf8');
    x.fillStyle = INK; for (const ex of [55, 73]) { x.beginPath(); x.ellipse(ex, 50, 3.5, 5, 0, 0, Math.PI * 2); x.fill(); }
    x.beginPath(); x.ellipse(64, 63, 4, 5, 0, 0, Math.PI * 2); x.fill();
  },
  decoy(x) { // 假道具箱：和道具箱一樣的方塊，問號上下顛倒
    x.save(); x.translate(64, 52); x.rotate(-.12); x.beginPath(); x.roundRect(-26, -26, 52, 52, 9); inkPath(x, '#ffb3c7');
    x.rotate(Math.PI); x.font = '900 40px "Zen Maru Gothic",sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.lineJoin = 'round';
    x.lineWidth = 6; x.strokeStyle = INK; x.strokeText('?', 0, 2); x.fillStyle = '#fffdf8'; x.fillText('?', 0, 2); x.restore();
  },
  nitro(x) { // 氮氣（競速賽）：藍色氣瓶 + 白色 N + 尾焰
    x.beginPath(); x.moveTo(52, 84); x.quadraticCurveTo(64, 104, 76, 84); x.closePath(); inkPath(x, '#ffa63d', 3);
    x.beginPath(); x.roundRect(47, 30, 34, 54, 11); inkPath(x, '#5ab8ff');
    x.beginPath(); x.roundRect(57, 18, 14, 14, 4); inkPath(x, '#c9d3e6', 3);
    x.lineWidth = 5; x.lineCap = 'round'; x.lineJoin = 'round'; x.strokeStyle = '#fffdf8'; x.beginPath(); x.moveTo(57, 68); x.lineTo(57, 46); x.lineTo(71, 68); x.lineTo(71, 46); x.stroke();
  },
  foam(x) { // 泡泡雲：一團大小不一、顏色淡淡的肥皂泡，每顆有反光
    for (const [cx, cy, r, c] of [[44, 58, 16, '#e8f4ff'], [84, 58, 16, '#f3e8ff'], [64, 42, 22, '#eafbe7'], [56, 70, 13, '#fff3b8'], [75, 72, 12, '#ffe0ec']]) { x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); inkPath(x, c, 3.5); shine(x, cx - r * .35, cy - r * .35, r * .16, r * .28); }
  },
  rocket(x) { // 泡泡火箭：往右上飛的粉色火箭 + 圓窗 + 藍色尾翼 + 尾焰
    x.save(); x.translate(64, 56); x.rotate(Math.PI / 4);
    x.beginPath(); x.moveTo(-9, 20); x.quadraticCurveTo(0, 42, 9, 20); x.closePath(); inkPath(x, '#ffa63d', 3);
    for (const s of [-1, 1]) { x.beginPath(); x.moveTo(s * 11, 2); x.lineTo(s * 22, 20); x.lineTo(s * 9, 18); x.closePath(); inkPath(x, '#5ab8ff', 3); }
    x.beginPath(); x.moveTo(0, -36); x.bezierCurveTo(16, -24, 14, 8, 11, 20); x.lineTo(-11, 20); x.bezierCurveTo(-14, 8, -16, -24, 0, -36); x.closePath(); inkPath(x, '#ff8fab');
    x.beginPath(); x.arc(0, -10, 7, 0, Math.PI * 2); inkPath(x, '#bfe3ff', 3); x.restore();
  },
  magnet(x) { // 磁鐵：紅色 U 形磁鐵 + 銀色兩端 + 上方吸引線
    const u = () => { x.beginPath(); x.moveTo(44, 34); x.lineTo(44, 54); x.arc(64, 54, 20, Math.PI, 0, true); x.lineTo(84, 34); };
    x.lineCap = 'butt'; u(); x.lineWidth = 22; x.strokeStyle = INK; x.stroke(); u(); x.lineWidth = 14; x.strokeStyle = '#ff6b6b'; x.stroke();
    for (const cx of [44, 84]) { x.beginPath(); x.rect(cx - 11, 22, 22, 13); inkPath(x, '#e8edf5', 4); }
    x.lineWidth = 4; x.lineCap = 'round'; x.strokeStyle = INK; x.beginPath(); x.moveTo(54, 14); x.lineTo(57, 8); x.moveTo(64, 13); x.lineTo(64, 6); x.moveTo(74, 14); x.lineTo(71, 8); x.stroke();
  },
  big(x) { // 巨大泡泡：大泡泡裡一台小車 + 左右往外的箭頭
    x.beginPath(); x.arc(64, 52, 30, 0, Math.PI * 2); inkPath(x, '#e2d6ff'); shine(x, 51, 37, 5, 9);
    x.beginPath(); x.roundRect(51, 48, 26, 12, 5); inkPath(x, '#ff8fab', 3);
    for (const cx of [57, 71]) { x.beginPath(); x.arc(cx, 61, 4, 0, Math.PI * 2); inkPath(x, '#4a3b3b', 2.5); }
    x.lineWidth = 4; x.lineCap = x.lineJoin = 'round'; x.strokeStyle = INK;
    for (const s of [-1, 1]) { const ax = 64 + s * 44; x.beginPath(); x.moveTo(64 + s * 35, 52); x.lineTo(ax, 52); x.moveTo(ax - s * 6, 46); x.lineTo(ax, 52); x.lineTo(ax - s * 6, 58); x.stroke(); }
  },
  giant(x) { // 變大（泡泡派對）：大泡泡裡一隻小傢伙 + 左右往外的箭頭
    x.beginPath(); x.arc(64, 52, 30, 0, Math.PI * 2); inkPath(x, '#ffe6a8'); shine(x, 51, 37, 5, 9);
    x.beginPath(); x.arc(64, 58, 13, 0, Math.PI * 2); inkPath(x, '#fffdf7', 3);
    for (const cx of [56, 72]) { x.beginPath(); x.arc(cx, 45, 4.5, 0, Math.PI * 2); inkPath(x, '#ffb3c7', 2.5); }
    x.fillStyle = INK; for (const cx of [59, 69]) { x.beginPath(); x.arc(cx, 57, 2, 0, Math.PI * 2); x.fill(); }
    x.lineWidth = 4; x.lineCap = x.lineJoin = 'round'; x.strokeStyle = INK;
    for (const s of [-1, 1]) { const ax = 64 + s * 44; x.beginPath(); x.moveTo(64 + s * 35, 52); x.lineTo(ax, 52); x.moveTo(ax - s * 6, 46); x.lineTo(ax, 52); x.lineTo(ax - s * 6, 58); x.stroke(); }
  },
  super(x) { // 超級水球：紫色爆炸星 + 黃色核心
    x.beginPath(); for (let i = 0; i < 16; i++) { const a = i * Math.PI / 8 - Math.PI / 2, r = i % 2 ? 17 : 32; x[i ? 'lineTo' : 'moveTo'](64 + Math.cos(a) * r, 50 + Math.sin(a) * r); } x.closePath(); inkPath(x, '#c86bff');
    x.beginPath(); x.arc(64, 50, 11, 0, Math.PI * 2); inkPath(x, '#ffe14d', 3); shine(x, 60, 46, 3, 4);
  },
};

// 圓形徽章底：彩色外圈 + 深褐描邊 + 白色內圈（128x128 座標）
export function badgeFrame(x, color) {
  x.beginPath(); x.arc(64, 64, 58, 0, Math.PI * 2); x.fillStyle = color; x.fill(); x.lineWidth = 8; x.strokeStyle = INK; x.stroke();
  x.beginPath(); x.arc(64, 64, 47, 0, Math.PI * 2); x.fillStyle = 'rgba(255,255,255,.9)'; x.fill();
}

// 遊戲房間招牌用的大圖示（128x128 座標，畫在徽章白圈內）
// 新增遊戲：加 <id>(x)，apps/hub/index.html 的 ROOMS 用 art(x) { GAME_ART.<id>(x); } 呼叫
export const GAME_ART = {
  kart(x) { // 泡泡賽車：粉紅小車 + 兩個輪子 + 方向盤
    x.beginPath(); x.roundRect(26, 40, 76, 28, 12); inkPath(x, '#ff8fab');
    x.beginPath(); x.roundRect(40, 26, 30, 18, 8); inkPath(x, '#fffdf8');
    x.beginPath(); x.arc(76, 36, 7, 0, Math.PI * 2); x.lineWidth = 4; x.strokeStyle = INK; x.stroke();
    for (const cx of [42, 86]) { x.beginPath(); x.arc(cx, 72, 11, 0, Math.PI * 2); inkPath(x, '#4a3b3b'); x.beginPath(); x.arc(cx, 72, 4, 0, Math.PI * 2); x.fillStyle = '#fffdf8'; x.fill(); }
    shine(x, 38, 47, 8, 3, 0);
    x.lineWidth = 4; x.lineCap = 'round'; x.strokeStyle = INK; x.beginPath(); x.moveTo(12, 46); x.lineTo(20, 46); x.moveTo(8, 56); x.lineTo(20, 56); x.stroke();
  },
  run(x) { // 泡泡跑跑：奔跑的小傢伙 + 前方的小山丘與速度線
    x.beginPath(); x.ellipse(82, 84, 22, 14, 0, Math.PI, 0); inkPath(x, '#8fd694');
    x.beginPath(); x.arc(46, 66, 24, 0, Math.PI * 2); inkPath(x, '#fffdf7');
    x.beginPath(); x.arc(38, 44, 8, 0, Math.PI * 2); inkPath(x, '#ffb3c7'); x.beginPath(); x.arc(58, 44, 8, 0, Math.PI * 2); inkPath(x, '#ffb3c7');
    x.beginPath(); x.arc(54, 64, 3.4, 0, Math.PI * 2); x.fillStyle = INK; x.fill(); x.beginPath(); x.arc(66, 64, 3.4, 0, Math.PI * 2); x.fill();
    x.beginPath(); x.ellipse(70, 74, 5, 3, 0, 0, Math.PI * 2); x.fillStyle = '#ffa3b5'; x.fill();
    x.beginPath(); x.roundRect(30, 84, 36, 9, 4); inkPath(x, '#ffb04d');
    x.lineWidth = 4; x.lineCap = 'round'; x.strokeStyle = INK; x.beginPath(); x.moveTo(10, 58); x.lineTo(20, 58); x.moveTo(6, 68); x.lineTo(18, 68); x.moveTo(12, 78); x.lineTo(22, 78); x.stroke();
  },
  survive(x) { // 泡泡倖存者：中間的小傢伙，被泡泡包住的敵人與環繞的泡泡
    x.beginPath(); x.arc(64, 70, 22, 0, Math.PI * 2); inkPath(x, '#fffdf7');
    x.beginPath(); x.arc(54, 50, 8, 0, Math.PI * 2); inkPath(x, '#ffb3c7'); x.beginPath(); x.arc(74, 50, 8, 0, Math.PI * 2); inkPath(x, '#ffb3c7');
    x.beginPath(); x.arc(58, 68, 3.2, 0, Math.PI * 2); x.fillStyle = INK; x.fill(); x.beginPath(); x.arc(70, 68, 3.2, 0, Math.PI * 2); x.fill();
    x.beginPath(); x.arc(24, 34, 14, 0, Math.PI * 2); inkPath(x, '#8fd694'); x.beginPath(); x.arc(24, 34, 20, 0, Math.PI * 2); x.lineWidth = 4; x.strokeStyle = '#7cc8ff'; x.stroke();
    x.beginPath(); x.arc(104, 98, 11, 0, Math.PI * 2); inkPath(x, '#ffcf6b'); x.beginPath(); x.arc(104, 98, 16, 0, Math.PI * 2); x.lineWidth = 4; x.strokeStyle = '#7cc8ff'; x.stroke();
    x.beginPath(); x.arc(100, 30, 8, 0, Math.PI * 2); inkPath(x, '#bfe9ff'); shine(x, 97, 27, 2.5, 3.5);
    x.beginPath(); x.arc(30, 100, 8, 0, Math.PI * 2); inkPath(x, '#bfe9ff'); shine(x, 27, 97, 2.5, 3.5);
  },
  party(x) { // 泡泡派對：圓形擂台上兩隻小傢伙撞在一起 + 撞擊星
    x.beginPath(); x.ellipse(64, 86, 46, 13, 0, 0, Math.PI * 2); inkPath(x, '#c9b6ff');
    for (const [cx, ear, rot] of [[44, '#ffb3c7', -.18], [86, '#a8d8ff', .18]]) {
      x.save(); x.translate(cx, 66); x.rotate(rot);
      x.beginPath(); x.arc(-9, -19, 6, 0, Math.PI * 2); inkPath(x, ear, 3); x.beginPath(); x.arc(9, -19, 6, 0, Math.PI * 2); inkPath(x, ear, 3);
      x.beginPath(); x.arc(0, 0, 18, 0, Math.PI * 2); inkPath(x, '#fffdf7');
      x.fillStyle = INK; x.beginPath(); x.arc(-6, -2, 2.6, 0, Math.PI * 2); x.fill(); x.beginPath(); x.arc(6, -2, 2.6, 0, Math.PI * 2); x.fill();
      x.restore();
    }
    x.beginPath(); for (let i = 0; i < 10; i++) { const a = i * Math.PI / 5 - Math.PI / 2, r = i % 2 ? 6 : 13; x[i ? 'lineTo' : 'moveTo'](65 + Math.cos(a) * r, 38 + Math.sin(a) * r); } x.closePath(); inkPath(x, '#ffd23f', 3);
  },
  together(x) { // 泡泡Together：兩隻疊羅漢的小傢伙 + 終點旗
    x.beginPath(); x.roundRect(14, 92, 100, 16, 6); inkPath(x, '#a8e6cf');
    for (const [cx, cy, ear] of [[52, 78, '#ffb3c7'], [52, 52, '#a8d8ff']]) {
      x.beginPath(); x.arc(cx - 9, cy - 19, 6, 0, Math.PI * 2); inkPath(x, ear, 3); x.beginPath(); x.arc(cx + 9, cy - 19, 6, 0, Math.PI * 2); inkPath(x, ear, 3);
      x.beginPath(); x.arc(cx, cy, 18, 0, Math.PI * 2); inkPath(x, '#fffdf7');
      x.fillStyle = INK; x.beginPath(); x.arc(cx - 6, cy - 2, 2.6, 0, Math.PI * 2); x.fill(); x.beginPath(); x.arc(cx + 6, cy - 2, 2.6, 0, Math.PI * 2); x.fill();
    }
    x.beginPath(); x.moveTo(98, 92); x.lineTo(98, 40); x.lineWidth = 4; x.strokeStyle = INK; x.stroke(); x.beginPath(); x.moveTo(98, 40); x.lineTo(120, 48); x.lineTo(98, 56); x.closePath(); inkPath(x, '#ff6b6b', 3);
  },
  artillery(x) { // 泡泡砲戰：斜放的砲管 + 輪子 + 飛出去的水球
    x.save(); x.translate(44, 76); x.rotate(-.62); x.beginPath(); x.roundRect(-4, -12, 54, 24, 10); inkPath(x, '#4cd68a'); x.beginPath(); x.roundRect(40, -15, 12, 30, 5); inkPath(x, '#2fae6a'); x.restore();
    x.beginPath(); x.arc(40, 82, 15, 0, Math.PI * 2); inkPath(x, '#4a3b3b'); x.beginPath(); x.arc(40, 82, 5, 0, Math.PI * 2); x.fillStyle = '#fffdf8'; x.fill();
    x.beginPath(); x.arc(94, 30, 13, 0, Math.PI * 2); inkPath(x, '#7cc8ff'); shine(x, 90, 26, 3, 5);
    x.lineWidth = 4; x.lineCap = 'round'; x.strokeStyle = INK; x.beginPath(); x.moveTo(76, 46); x.lineTo(70, 52); x.moveTo(84, 52); x.lineTo(80, 58); x.stroke();
  },
  dance(x) { // 泡泡跳舞機：舞台上的助教、老師、玩家，老師和玩家舉起同一隻手 + 迪斯可燈球 + 音符
    x.beginPath(); x.roundRect(12, 92, 104, 14, 6); inkPath(x, '#7cc8ff');
    for (const cx of [30, 64, 98]) { x.beginPath(); x.arc(cx, 99, 2.5, 0, Math.PI * 2); x.fillStyle = '#ffd23f'; x.fill(); }
    for (const [cx, cy, r, ear, arm] of [[30, 79, 13, '#8fd694', 0], [98, 79, 13, '#ffd23f', 1], [64, 74, 18, '#ff7eb6', 1]]) {
      if (arm) { x.lineWidth = 5; x.lineCap = 'round'; x.strokeStyle = INK; x.beginPath(); x.moveTo(cx + r * .6, cy - r * .3); x.lineTo(cx + r * 1.3, cy - r * 1.4); x.stroke(); }
      for (const s of [-1, 1]) { x.beginPath(); x.arc(cx + s * r * .5, cy - r * .95, r * .34, 0, Math.PI * 2); inkPath(x, ear, 3); }
      x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); inkPath(x, '#fffdf7');
      x.fillStyle = INK; for (const s of [-1, 1]) { x.beginPath(); x.arc(cx + s * r * .33, cy - r * .1, r * .14, 0, Math.PI * 2); x.fill(); }
      x.beginPath(); x.arc(cx, cy + r * .2, r * .25, 0, Math.PI); x.lineWidth = 2.5; x.strokeStyle = INK; x.stroke();
    }
    x.lineWidth = 3; x.strokeStyle = INK; x.beginPath(); x.moveTo(64, 8); x.lineTo(64, 16); x.stroke();
    x.beginPath(); x.arc(64, 26, 10, 0, Math.PI * 2); inkPath(x, '#ffb3c7', 3);
    x.lineWidth = 2; x.beginPath(); x.moveTo(54, 26); x.lineTo(74, 26); x.ellipse(64, 26, 4.5, 10, 0, 0, Math.PI * 2); x.stroke(); shine(x, 60, 22, 2.5, 3.5);
    x.beginPath(); x.ellipse(22, 46, 6, 4.5, -.4, 0, Math.PI * 2); x.fillStyle = INK; x.fill(); x.lineWidth = 3.5; x.beginPath(); x.moveTo(27, 44); x.lineTo(27, 26); x.lineTo(35, 30); x.stroke();
  },
};
