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

export function makeCritter({ ear, color }) {
  const root = new THREE.Group();
  const pivot = new THREE.Group(); root.add(pivot);
  const body = blob(G.sphere, M.body, .55, .5, .52); body.position.y = .5; pivot.add(body);
  const arms = [];
  for (const s of [-1, 1]) {
    const foot = blob(G.small, M.body, .16, .08, .18, 1.2); foot.position.set(s * .22, .05, .12); pivot.add(foot);
    const ap = new THREE.Group(); ap.position.set(s * .46, .48, .08); pivot.add(ap);
    const arm = blob(G.small, M.body, .1, .14, .1, 1.2); arm.position.set(s * .06, -.08, 0); ap.add(arm);
    ap.rotation.z = s * .5; ap.userData.side = s; arms.push(ap);
  }
  for (const s of [-1, 1]) {
    if (ear === 'be') {
      const e = blob(G.small, M.body, .14, .13, .1, 1.15); e.position.set(s * .32, .95, 0); pivot.add(e);
      const inner = new THREE.Mesh(G.disc, M.innerEar); inner.scale.setScalar(.07); inner.position.set(s * .32, .95, .105); pivot.add(inner);
    } else if (ear === 'pay') {
      const e = blob(G.small, M.body, .1, .34, .08, 1.12); e.position.set(s * .18, 1.18, -.02); e.rotation.z = -s * .18; pivot.add(e);
      const inner = new THREE.Mesh(G.disc, M.innerEar); inner.scale.set(.045, .22, 1); inner.position.set(s * .17, 1.18, .07); inner.rotation.z = -s * .18; pivot.add(inner);
    } else if (ear === 'fe') {
      const e = withOutline(new THREE.Mesh(G.cone, M.body), 1.15); e.position.set(s * .3, 1.0, 0); e.rotation.z = -s * .35; pivot.add(e);
    }
  }
  if (ear === 'tool') {
    const stem = new THREE.Mesh(G.stem, M.leaf); stem.position.set(0, 1.08, 0); pivot.add(stem);
    for (const s of [-1, 1]) { const l = blob(G.small, M.leaf, .1, .05, .06, 1.15); l.position.set(s * .09, 1.2, 0); l.rotation.z = s * .5; pivot.add(l); }
  }
  const face = new THREE.Group(); face.position.y = .5; pivot.add(face);
  const eyes = [];
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(G.small, M.black); eye.scale.set(.05, .065, .03); eye.position.set(s * .16, .06, .5); face.add(eye); eyes.push(eye);
    const hl = new THREE.Mesh(G.small, M.white); hl.scale.setScalar(.35); hl.position.set(.3, .35, .6); eye.add(hl);
    const bl = new THREE.Mesh(G.disc, M.blush); bl.scale.set(.085, .055, 1); bl.position.set(s * .3, -.04, .44); bl.rotation.y = s * .55; face.add(bl);
  }
  const mouth = new THREE.Mesh(G.smile, M.black); mouth.position.set(0, -.04, .52); mouth.rotation.z = Math.PI; face.add(mouth);
  const sm = toon(color);
  const scarf = new THREE.Mesh(G.scarf, sm); scarf.rotation.x = Math.PI / 2; scarf.position.y = .28; withOutline(scarf, 1.04); pivot.add(scarf);
  const tail = blob(G.small, sm, .08, .14, .05, 1.2); tail.position.set(.28, .18, .42); tail.rotation.z = .4; pivot.add(tail);
  const bubble = new THREE.Mesh(G.sphere, M.bubble); bubble.scale.setScalar(.75); bubble.position.y = .55; bubble.visible = false; root.add(bubble);
  const shine = new THREE.Mesh(G.small, M.white); shine.scale.set(.1, .14, .05); shine.position.set(-.38, .95, .5); shine.visible = false; root.add(shine);
  root.scale.setScalar(.86);
  return { root, pivot, eyes, arms, bubble, shine, mouth, blinkAt: Math.random() * 3, phase: Math.random() * 6 };
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
  for (const e of c.eyes) e.scale.y = blink ? .008 : .065;
}
