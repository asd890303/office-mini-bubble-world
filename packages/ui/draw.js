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
export const GAME_ART = {
  kart(x) { // 泡泡賽車：粉紅小車 + 兩個輪子 + 方向盤
    x.beginPath(); x.roundRect(26, 40, 76, 28, 12); inkPath(x, '#ff8fab');
    x.beginPath(); x.roundRect(40, 26, 30, 18, 8); inkPath(x, '#fffdf8');
    x.beginPath(); x.arc(76, 36, 7, 0, Math.PI * 2); x.lineWidth = 4; x.strokeStyle = INK; x.stroke();
    for (const cx of [42, 86]) { x.beginPath(); x.arc(cx, 72, 11, 0, Math.PI * 2); inkPath(x, '#4a3b3b'); x.beginPath(); x.arc(cx, 72, 4, 0, Math.PI * 2); x.fillStyle = '#fffdf8'; x.fill(); }
    shine(x, 38, 47, 8, 3, 0);
    x.lineWidth = 4; x.lineCap = 'round'; x.strokeStyle = INK; x.beginPath(); x.moveTo(12, 46); x.lineTo(20, 46); x.moveTo(8, 56); x.lineTo(20, 56); x.stroke();
  },
  artillery(x) { // 泡泡砲戰：斜放的砲管 + 輪子 + 飛出去的水球
    x.save(); x.translate(44, 76); x.rotate(-.62); x.beginPath(); x.roundRect(-4, -12, 54, 24, 10); inkPath(x, '#4cd68a'); x.beginPath(); x.roundRect(40, -15, 12, 30, 5); inkPath(x, '#2fae6a'); x.restore();
    x.beginPath(); x.arc(40, 82, 15, 0, Math.PI * 2); inkPath(x, '#4a3b3b'); x.beginPath(); x.arc(40, 82, 5, 0, Math.PI * 2); x.fillStyle = '#fffdf8'; x.fill();
    x.beginPath(); x.arc(94, 30, 13, 0, Math.PI * 2); inkPath(x, '#7cc8ff'); shine(x, 90, 26, 3, 5);
    x.lineWidth = 4; x.lineCap = 'round'; x.strokeStyle = INK; x.beginPath(); x.moveTo(76, 46); x.lineTo(70, 52); x.moveTo(84, 52); x.lineTo(80, 58); x.stroke();
  },
};
