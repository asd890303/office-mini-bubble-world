// 共用 3D 工具：卡通材質、深褐描邊、小傢伙角色。入口大廳、頭像選擇與各遊戲用同一組，角色與美術才會一致。
import * as THREE from 'three';

export const grad = new THREE.DataTexture(new Uint8Array([90, 170, 255]), 3, 1, THREE.RedFormat);
grad.minFilter = grad.magFilter = THREE.NearestFilter; grad.needsUpdate = true;
const mats = new Map();
export const toon = (c, extra) => { const k = c + JSON.stringify(extra || {}); if (!mats.has(k)) mats.set(k, new THREE.MeshToonMaterial({ color: c, gradientMap: grad, ...extra })); return mats.get(k); };
export const OUTLINE = new THREE.MeshBasicMaterial({ color: 0x3b2f2f, side: THREE.BackSide });
export const G = {
  sphere: new THREE.SphereGeometry(1, 28, 20), small: new THREE.SphereGeometry(1, 12, 10), box: new THREE.BoxGeometry(1, 1, 1),
  disc: new THREE.CircleGeometry(1, 20), smile: new THREE.TorusGeometry(.045, .013, 6, 14, Math.PI),
  scarf: new THREE.TorusGeometry(.5, .075, 10, 32), stem: new THREE.CylinderGeometry(.025, .03, .22, 8),
  cone: new THREE.ConeGeometry(.15, .3, 12), cyl: new THREE.CylinderGeometry(1, 1, 1, 24),
  star: new THREE.OctahedronGeometry(1), capsule: new THREE.CapsuleGeometry(.12, .22, 6, 12),
};
export const M = {
  body: toon('#fffdf7'), black: new THREE.MeshBasicMaterial({ color: 0x2b2222 }), white: new THREE.MeshBasicMaterial({ color: 0xffffff }),
  blush: new THREE.MeshBasicMaterial({ color: 0xffa3b5, transparent: true, opacity: .85 }), innerEar: toon('#ffc4d1'), leaf: toon('#8fd694'),
  bubble: new THREE.MeshToonMaterial({ color: '#bfe9ff', gradientMap: grad, transparent: true, opacity: .42, depthWrite: false }),
  balloon: toon('#7cc8ff'), splash: toon('#9edcff', { transparent: true, opacity: .9 }), splashCore: new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .85 }),
};
export const withOutline = (m, s = 1.07) => { const o = new THREE.Mesh(m.geometry, OUTLINE); o.scale.setScalar(s); m.add(o); return m; };
export const blob = (geo, mat, sx, sy, sz, ol = 1.07) => { const m = new THREE.Mesh(geo, mat); m.scale.set(sx, sy, sz); if (ol) withOutline(m, ol); return m; };
export const boxOutline = (m, w, h, d) => { const o = new THREE.Mesh(G.box, OUTLINE); o.scale.set(1 + .07 / w, 1 + .07 / h, 1 + .07 / d); m.add(o); return m; };

const EAR_TAN = toon('#d9b38c'), EAR_GOLD = toon('#ffd36b'), EAR_BOW = toon('#ff8fab');

const blushMats = new Map();
const blushMat = c => { if (!blushMats.has(c)) blushMats.set(c, new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: .85 })); return blushMats.get(c); };

export function makeCritter({ ear, color, eye = 'dot', body: bodyColor = '#fffdf7', blush: blushColor = '#ffa3b5' }) { // 只改外觀，不影響碰撞與遊戲判定
  const root = new THREE.Group(), bm = toon(bodyColor);
  const dark = bodyColor === '#000000', ink = dark ? M.white : M.black, glint = dark ? M.black : M.white; // 黑色身體上的五官改白色
  const pivot = new THREE.Group(); root.add(pivot);
  const body = blob(G.sphere, bm, .55, .5, .52); body.position.y = .5; pivot.add(body);
  const arms = [];
  for (const s of [-1, 1]) {
    const foot = blob(G.small, bm, .16, .08, .18, 1.2); foot.position.set(s * .22, .05, .12); pivot.add(foot);
    const ap = new THREE.Group(); ap.position.set(s * .46, .48, .08); pivot.add(ap);
    const arm = blob(G.small, bm, .1, .14, .1, 1.2); arm.position.set(s * .06, -.08, 0); ap.add(arm);
    ap.rotation.z = s * .5; ap.userData.side = s; arms.push(ap);
  }
  for (const s of [-1, 1]) {
    if (ear === 'be') {
      const e = blob(G.small, bm, .14, .13, .1, 1.15); e.position.set(s * .32, .95, 0); pivot.add(e);
      const inner = new THREE.Mesh(G.disc, M.innerEar); inner.scale.setScalar(.07); inner.position.set(s * .32, .95, .105); pivot.add(inner);
    } else if (ear === 'pay') {
      const e = blob(G.small, bm, .1, .34, .08, 1.12); e.position.set(s * .18, 1.18, -.02); e.rotation.z = -s * .18; pivot.add(e);
      const inner = new THREE.Mesh(G.disc, M.innerEar); inner.scale.set(.045, .22, 1); inner.position.set(s * .17, 1.18, .07); inner.rotation.z = -s * .18; pivot.add(inner);
    } else if (ear === 'fe') {
      const e = withOutline(new THREE.Mesh(G.cone, bm), 1.15); e.position.set(s * .3, 1.0, 0); e.rotation.z = -s * .35; pivot.add(e);
    } else if (ear === 'cat') {
      const e = withOutline(new THREE.Mesh(G.cone, bm), 1.15); e.scale.set(1.3, 1, .75); e.position.set(s * .27, 1.03, 0); e.rotation.z = -s * .2; pivot.add(e);
      const inner = new THREE.Mesh(G.cone, M.innerEar); inner.scale.set(.7, .6, .5); inner.position.set(s * .27, 1.0, .07); inner.rotation.z = -s * .2; pivot.add(inner);
    } else if (ear === 'bear') {
      const e = blob(G.small, EAR_TAN, .17, .17, .1, 1.15); e.position.set(s * .4, .9, 0); pivot.add(e);
      const inner = new THREE.Mesh(G.disc, M.innerEar); inner.scale.setScalar(.085); inner.position.set(s * .4, .9, .105); pivot.add(inner);
    } else if (ear === 'horn') {
      const e = withOutline(new THREE.Mesh(G.cone, EAR_GOLD), 1.15); e.scale.set(.6, .7, .6); e.position.set(s * .2, 1.02, 0); e.rotation.z = -s * .3; pivot.add(e);
    } else if (ear === 'ant') {
      const stem = new THREE.Mesh(G.stem, bm); stem.scale.y = 1.3; stem.position.set(s * .12, 1.1, 0); stem.rotation.z = -s * .35; pivot.add(stem);
      const tip = blob(G.small, EAR_GOLD, .06, .06, .06, 1.2); tip.position.set(s * .2, 1.27, 0); pivot.add(tip);
    }
  }
  if (ear === 'bow') {
    for (const s of [-1, 1]) { const w = blob(G.small, EAR_BOW, .13, .09, .07, 1.15); w.position.set(s * .13, 1.04, 0); w.rotation.z = s * .35; pivot.add(w); }
    const knot = blob(G.small, EAR_BOW, .06, .06, .06, 1.15); knot.position.set(0, 1.03, 0); pivot.add(knot);
  }
  if (ear === 'tool') {
    const stem = new THREE.Mesh(G.stem, M.leaf); stem.position.set(0, 1.08, 0); pivot.add(stem);
    for (const s of [-1, 1]) { const l = blob(G.small, M.leaf, .1, .05, .06, 1.15); l.position.set(s * .09, 1.2, 0); l.rotation.z = s * .5; pivot.add(l); }
  }
  const face = new THREE.Group(); face.position.y = .5; pivot.add(face);
  const eyes = [];
  for (const s of [-1, 1]) {
    const style = eye === 'wink' ? (s < 0 ? 'dot' : 'happy') : eye;
    if (style === 'happy') { const arc = new THREE.Mesh(G.smile, ink); arc.scale.setScalar(1.5); arc.position.set(s * .16, .03, .5); face.add(arc); }
    else if (style === 'sleepy') { const lid = new THREE.Mesh(G.small, ink); lid.scale.set(.06, .014, .03); lid.position.set(s * .16, .04, .5); face.add(lid); }
    else {
      const big = style === 'big' || style === 'sparkle', e = new THREE.Mesh(G.small, ink); e.scale.set(big ? .07 : .05, big ? .09 : .065, .03); e.userData.sy = e.scale.y; e.position.set(s * .16, .06, .5); face.add(e); eyes.push(e);
      const hl = new THREE.Mesh(G.small, glint); hl.scale.setScalar(style === 'sparkle' ? .4 : .35); hl.position.set(.3, .35, .6); e.add(hl);
      if (style === 'sparkle') { const h2 = new THREE.Mesh(G.small, glint); h2.scale.setScalar(.2); h2.position.set(-.25, -.35, .6); e.add(h2); }
    }
    const bl = new THREE.Mesh(G.disc, blushMat(blushColor)); bl.scale.set(.085, .055, 1); bl.position.set(s * .3, -.04, .44); bl.rotation.y = s * .55; face.add(bl);
  }
  const mouth = new THREE.Mesh(G.smile, ink); mouth.position.set(0, -.04, .52); mouth.rotation.z = Math.PI; face.add(mouth);
  const sm = toon(color);
  const scarf = new THREE.Mesh(G.scarf, sm); scarf.rotation.x = Math.PI / 2; scarf.position.y = .28; withOutline(scarf, 1.04); pivot.add(scarf);
  const tail = blob(G.small, sm, .08, .14, .05, 1.2); tail.position.set(.28, .18, .42); tail.rotation.z = .4; pivot.add(tail);
  const bubble = new THREE.Mesh(G.sphere, M.bubble); bubble.scale.setScalar(.75); bubble.position.y = .55; bubble.visible = false; root.add(bubble);
  const shine = new THREE.Mesh(G.small, M.white); shine.scale.set(.1, .14, .05); shine.position.set(-.38, .95, .5); shine.visible = false; root.add(shine);
  root.scale.setScalar(.86);
  return { root, pivot, eyes, arms, bubble, shine, mouth, blinkAt: Math.random() * 3, phase: Math.random() * 6 };
}

// 人多時給「別人」用的精簡造型：只有身體與耳朵眼睛，約 6 個物件（完整造型約 28 個）。介面與 makeCritter 相同，animateCritter 可直接用
export function makeLiteCritter({ ear, color, body: bodyColor = '#fffdf7' }) {
  const root = new THREE.Group(), bm = toon(bodyColor), em = toon(color || '#ffb3c7'), pivot = new THREE.Group(); root.add(pivot);
  const body = blob(G.small, bm, .55, .5, .52); body.position.y = .5; pivot.add(body);
  const tall = ear === 'pay';
  for (const s of [-1, 1]) { const e = new THREE.Mesh(G.cone, em); e.scale.set(tall ? .8 : 1.2, tall ? 1.6 : 1, .8); e.position.set(s * (tall ? .18 : .27), tall ? 1.15 : 1.03, 0); e.rotation.z = -s * .2; pivot.add(e); }
  const eyes = []; for (const s of [-1, 1]) { const e = new THREE.Mesh(G.small, M.black); e.scale.set(.05, .07, .04); e.position.set(s * .17, .55, .5); e.userData.sy = .07; pivot.add(e); eyes.push(e); }
  return { root, pivot, arms: [], eyes, phase: Math.random() * 6.28, blinkAt: 2 + Math.random() * 4, lite: true };
}

export function addNameTag(c, name) { // 對手頭上的小字名字（永遠面向鏡頭、不被場景遮住）
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 64; const x = cv.getContext('2d');
  const font = px => `900 ${px}px "Zen Maru Gothic","PingFang TC",sans-serif`; x.font = font(30);
  x.font = font(Math.min(30, Math.floor(30 * 236 / Math.max(1, x.measureText(name).width)))); x.textAlign = 'center'; x.textBaseline = 'middle'; x.lineJoin = 'round';
  x.lineWidth = 7; x.strokeStyle = '#3b2f2f'; x.strokeText(name, 128, 34); x.fillStyle = '#fff'; x.fillText(name, 128, 34);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthTest: false }));
  sp.scale.set(1.5, .375, 1); sp.position.y = 1.75; sp.renderOrder = 10; c.root.add(sp); c.nameTag = sp;
}

// 角色動畫：走路時身體起伏、手臂擺動，並定時眨眼（moving 為 true 時走路）
export function animateCritter(c, dt, t, moving) {
  const walk = moving ? Math.abs(Math.sin(t * 13 + c.phase)) : 0;
  c.pivot.position.y = walk * .12;
  const sq = 1 + (moving ? 0 : Math.sin(t * 2.2 + c.phase) * .035);
  c.pivot.scale.set(1 / Math.sqrt(sq), sq, 1 / Math.sqrt(sq));
  for (const a of c.arms) { const side = a.userData.side; a.rotation.z = side * (.5 + (moving ? Math.sin(t * 13 + c.phase + side) * .35 : 0)); }
  c.blinkAt -= dt;
  const blink = c.blinkAt < 0 && c.blinkAt > -.12;
  if (c.blinkAt < -.12) c.blinkAt = 2 + Math.random() * 4;
  for (const e of c.eyes) e.scale.y = blink ? .008 : e.userData.sy;
}
