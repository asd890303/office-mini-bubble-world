// 角色外觀：資料、儲存、選擇視窗。入口大廳與各遊戲共用，遊戲內直接使用這裡存的外觀。
// 儲存：在 Telegram 內存 CloudStorage（跟著帳號走）並同步到 localStorage；一般瀏覽器只用 localStorage。兩邊進度不保證相同。
import * as THREE from 'three';
import { toon, blob, G, makeCritter, animateCritter } from '/shared/three-kit.js';

// 與 games/bubble-island/game-core.js 的 COLORS / EARS 保持一致（測試會比對）
export const COLORS = ['#ffb3c7', '#a8d8ff', '#ffe08a', '#a8e6cf', '#c9b6ff', '#ffc8a2'];
export const EARS = { be: '圓耳', pay: '長耳', fe: '尖耳', tool: '小芽' };
export const DEFAULT_AVATAR = { color: COLORS[0], ear: 'be' };

const KEY = 'ombw-avatar';
export const isValidAvatar = a => !!a && COLORS.includes(a.color) && Object.hasOwn(EARS, a.ear);
const parse = v => { try { const a = JSON.parse(v); return isValidAvatar(a) ? { color: a.color, ear: a.ear } : null; } catch { return null; } };
const lsGet = () => { try { return localStorage.getItem(KEY); } catch { return null; } };
const lsSet = v => { try { localStorage.setItem(KEY, v); } catch {} };
const cloud = () => { const TG = window.Telegram?.WebApp; try { return TG?.initData && TG.CloudStorage && TG.isVersionAtLeast?.('6.9') ? TG.CloudStorage : null; } catch { return null; } };

// 回傳 { color, ear }；從沒設定過回傳 null。CloudStorage 優先，沒回應（1.5 秒）就用 localStorage。
export async function loadAppearance() {
  const local = parse(lsGet()), c = cloud();
  if (!c) return local;
  const remote = await new Promise(res => {
    const t = setTimeout(() => res(null), 1500);
    try { c.getItem(KEY, (err, v) => { clearTimeout(t); res(err ? null : parse(v)); }); } catch { clearTimeout(t); res(null); }
  });
  if (remote) lsSet(JSON.stringify(remote)); else if (local) { try { c.setItem(KEY, JSON.stringify(local), () => {}); } catch {} }
  return remote || local;
}
export function saveAppearance(a) {
  if (!isValidAvatar(a)) return;
  const v = JSON.stringify({ color: a.color, ear: a.ear }); lsSet(v);
  try { cloud()?.setItem(KEY, v, () => {}); } catch {}
}

const CSS = `
.ap-wrap { position: fixed; inset: 0; z-index: 100; display: grid; place-items: center; background: rgba(74,59,59,.38); }
.ap-box { width: min(380px, calc(100% - 28px)); max-height: calc(100% - 28px); overflow: auto; padding: 18px 20px; text-align: center; }
.ap-box h2 { margin: 0; font-size: 24px; font-weight: 900; }
.ap-box p { margin: 4px 0 6px; font-size: 13px; color: var(--ink-soft); line-height: 1.5; }
.ap-prev { width: 150px; height: 150px; margin: 4px auto 0; border-radius: 50%; background: radial-gradient(circle at 50% 62%, var(--chip) 0 55%, transparent 70%); }
.ap-prev canvas { width: 100%; height: 100%; display: block; }
.ap-lbl { font-weight: 700; font-size: 13px; margin-top: 10px; }
.ap-row { display: flex; gap: 8px; justify-content: center; flex-wrap: wrap; margin: 8px 0; }
.ap-sw { width: 32px; height: 32px; border-radius: 50%; border: 3px solid var(--ink); cursor: pointer; padding: 0; }
.ap-sw[aria-pressed="true"] { outline: 3px solid var(--pink-deep); outline-offset: 2px; }
.ap-box .btn[aria-pressed="true"] { background: var(--pink); color: #4a3b3b; }
.ap-go { margin-top: 14px; width: 100%; padding: 10px; font-size: 17px; font-weight: 900; }
.ap-cancel { margin-top: 8px; }
`;

// 開啟選擇視窗。required = true（沒設定過外觀）不能取消。回傳 Promise<{color, ear} | null>（取消為 null）。
export function openAvatarPicker({ initial, required = false, title = '選你的小傢伙', note = '進入遊戲都會用這個外觀，之後可以在大廳隨時更換。' } = {}) {
  if (!document.getElementById('ap-style')) { const st = document.createElement('style'); st.id = 'ap-style'; st.textContent = CSS; document.head.append(st); }
  let cur = isValidAvatar(initial) ? { ...initial } : { ...DEFAULT_AVATAR };
  const wrap = document.createElement('div'); wrap.className = 'ap-wrap';
  wrap.innerHTML = `<div class="ap-box box" role="dialog" aria-label="${title}"><h2>${title}</h2><p>${note}</p><div class="ap-prev"></div>
    <div class="ap-lbl">圍巾顏色</div><div class="ap-row" data-k="colors"></div><div class="ap-lbl">耳朵</div><div class="ap-row" data-k="ears"></div>
    <button class="btn primary ap-go">確定</button>${required ? '' : '<button class="btn ap-cancel">取消</button>'}</div>`;
  document.body.append(wrap);
  const $ = k => wrap.querySelector(`[data-k="${k}"]`), slot = wrap.querySelector('.ap-prev');

  // 預覽：獨立的小 renderer，關閉視窗時釋放
  let renderer = null, critter = null, key = '', raf = 0, closed = false, hop = 0, last = performance.now();
  const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(30, 1, .1, 50);
  scene.add(new THREE.HemisphereLight(0xfff6f0, 0xffd6e4, 1.7));
  { const l = new THREE.DirectionalLight(0xffffff, 1.6); l.position.set(2, 4, 5); scene.add(l); }
  { const b = blob(G.cyl, toon('#d3efc0'), .72, .06, .72, 1.04); b.position.y = -.03; scene.add(b); }
  cam.position.set(0, 1.35, 4.1); cam.lookAt(0, .62, 0);
  try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.setSize(150, 150, false); slot.append(renderer.domElement); } catch { renderer = null; }
  const frame = now => {
    if (closed) return; raf = requestAnimationFrame(frame);
    const dt = Math.min(.05, (now - last) / 1e3), t = now / 1e3; last = now;
    if (!renderer) return;
    const k = cur.color + cur.ear;
    if (k !== key) { key = k; if (critter) scene.remove(critter.root); critter = makeCritter(cur); critter.root.scale.setScalar(1); scene.add(critter.root); hop = .01; }
    critter.root.rotation.y = Math.sin(t * .8) * .6;
    animateCritter(critter, dt, t, false);
    if (hop > 0) { hop += dt * 2.4; critter.pivot.position.y = Math.sin(Math.min(1, hop) * Math.PI) * .35; if (hop >= 1) hop = 0; }
    renderer.render(scene, cam);
  };
  raf = requestAnimationFrame(frame);

  const render = () => {
    $('colors').innerHTML = COLORS.map(c => `<button class="ap-sw" data-c="${c}" style="background:${c}" aria-pressed="${c === cur.color}" aria-label="${c}"></button>`).join('');
    $('ears').innerHTML = Object.entries(EARS).map(([k, v]) => `<button class="btn" data-ear="${k}" aria-pressed="${k === cur.ear}">${v}</button>`).join('');
  };
  render();
  return new Promise(resolve => {
    const done = v => { closed = true; cancelAnimationFrame(raf); try { renderer?.dispose(); } catch {} wrap.remove(); resolve(v); };
    wrap.addEventListener('click', e => {
      const c = e.target.closest('[data-c]'), ear = e.target.closest('[data-ear]');
      if (c) { cur.color = c.dataset.c; render(); } else if (ear) { cur.ear = ear.dataset.ear; render(); }
      else if (e.target.closest('.ap-go')) { saveAppearance(cur); done({ ...cur }); }
      else if (e.target.closest('.ap-cancel')) done(null);
    });
  });
}
