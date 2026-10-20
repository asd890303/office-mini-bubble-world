// 角色外觀：資料、儲存、選擇視窗。入口大廳與各遊戲共用，遊戲內直接使用這裡存的外觀。
// 儲存：在 Telegram 內存 CloudStorage（跟著帳號走）並同步到 localStorage；一般瀏覽器只用 localStorage。兩邊進度不保證相同。
import * as THREE from 'three';
import { toon, blob, G, makeCritter, animateCritter } from '/shared/three-kit.js';

// 與三款遊戲規則檔的 COLORS / EARS / EYES 保持一致（測試會比對）；外觀只影響畫面，不影響遊戲判定
export const COLORS = ['#ffb3c7', '#a8d8ff', '#ffe08a', '#a8e6cf', '#c9b6ff', '#ffc8a2', '#ff8a80', '#7fdbd0', '#8aa4ff', '#cfe88a', '#f29be0', '#c9a58a'];
export const EARS = { be: '圓耳', pay: '長耳', fe: '尖耳', tool: '小芽', cat: '貓耳', bear: '熊耳', horn: '小角', bow: '蝴蝶結', ant: '觸角' };
export const EYES = { dot: '圓眼', big: '大眼', happy: '笑眼', sleepy: '瞇眼', sparkle: '閃亮', wink: '眨眼' };
export const BODIES = ['#fffdf7', '#ffe9d6', '#e8f4ff', '#eafbe7', '#f3e8ff', '#fff3b8', '#f2d9c4', '#d9dde3'];
export const BLUSHES = ['#ffa3b5', '#ff7d7d', '#ffc27a', '#ffe27a', '#9fd8ff', '#c4a3ff'];
export const DEFAULT_AVATAR = { color: COLORS[0], ear: 'be', eye: 'dot', body: BODIES[0], blush: BLUSHES[0] };

const KEY = 'ombw-avatar';
export const isValidAvatar = a => !!a && COLORS.includes(a.color) && Object.hasOwn(EARS, a.ear);
// 舊版存檔沒有 eye、body、blush，補預設值
const norm = a => ({ color: a.color, ear: a.ear, eye: Object.hasOwn(EYES, a.eye) ? a.eye : 'dot', body: BODIES.includes(a.body) ? a.body : BODIES[0], blush: BLUSHES.includes(a.blush) ? a.blush : BLUSHES[0] });
const parse = v => { try { const a = JSON.parse(v); return isValidAvatar(a) ? norm(a) : null; } catch { return null; } };
const lsGet = () => { try { return localStorage.getItem(KEY); } catch { return null; } };
const lsSet = v => { try { localStorage.setItem(KEY, v); } catch {} };
const cloud = () => { const TG = window.Telegram?.WebApp; try { return TG?.initData && TG.CloudStorage && TG.isVersionAtLeast?.('6.9') ? TG.CloudStorage : null; } catch { return null; } };

// 回傳 { color, ear, eye, body, blush }；從沒設定過回傳 null。CloudStorage 優先，沒回應（1.5 秒）就用 localStorage。
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
  const v = JSON.stringify(norm(a)); lsSet(v);
  try { cloud()?.setItem(KEY, v, () => {}); } catch {}
}

const TABS = [['color', '顏色'], ['ear', '耳朵'], ['eye', '眼睛']];

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
.ap-row .btn { padding: 4px 10px; font-size: 14px; }
.ap-tabs { display: flex; gap: 6px; justify-content: center; margin: 10px 0 2px; }
.ap-tabs button { flex: 1; padding: 6px 4px; font: inherit; font-size: 14px; font-weight: 700; color: var(--ink-soft); background: transparent; border: 1.5px solid var(--line); border-radius: 999px; cursor: pointer; }
.ap-tabs button[aria-selected="true"] { color: var(--ink); background: var(--chip); border-color: var(--ink); }
.ap-pane { min-height: 168px; max-height: 38vh; overflow: auto; }
`;

// 小預覽：獨立的小 renderer 顯示角色。set(avatar) 換外觀並開始繪製，stop() 暫停，bump() 讓角色跳一下，dispose() 釋放。
// WebGL 建立失敗時 el 仍可用，只是沒有畫面。
export function createCritterPreview(size = 150, { spin = true } = {}) {
  const el = document.createElement('div'); el.style.cssText = `width:${size}px;height:${size}px`;
  let renderer = null, critter = null, key = '', cur = null, raf = 0, hop = 0, last = performance.now(), running = false;
  const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(30, 1, .1, 50);
  scene.add(new THREE.HemisphereLight(0xfff6f0, 0xffd6e4, 1.7));
  { const l = new THREE.DirectionalLight(0xffffff, 1.6); l.position.set(2, 4, 5); scene.add(l); }
  { const b = blob(G.cyl, toon('#d3efc0'), .72, .06, .72, 1.04); b.position.y = -.03; scene.add(b); }
  cam.position.set(0, 1.35, 4.1); cam.lookAt(0, .62, 0);
  try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.setSize(size, size, false); renderer.domElement.style.cssText = 'width:100%;height:100%;display:block'; el.append(renderer.domElement); } catch { renderer = null; }
  const frame = now => {
    if (!running) return; raf = requestAnimationFrame(frame);
    const dt = Math.min(.05, (now - last) / 1e3), t = now / 1e3; last = now;
    if (!renderer || !cur) return;
    const k = [cur.color, cur.ear, cur.eye, cur.body, cur.blush].join();
    if (k !== key) { key = k; if (critter) scene.remove(critter.root); critter = makeCritter(cur); critter.root.scale.setScalar(1); scene.add(critter.root); hop = .01; }
    critter.root.rotation.y = spin ? Math.sin(t * .8) * .6 : 0;
    animateCritter(critter, dt, t, false);
    if (hop > 0) { hop += dt * 2.4; critter.pivot.position.y = Math.sin(Math.min(1, hop) * Math.PI) * .35; if (hop >= 1) hop = 0; }
    renderer.render(scene, cam);
  };
  const start = () => { if (running) return; running = true; last = performance.now(); raf = requestAnimationFrame(frame); };
  return {
    el,
    set(a) { cur = norm(a); start(); },
    stop() { running = false; cancelAnimationFrame(raf); },
    bump() { hop = .01; },
    dispose() { running = false; cancelAnimationFrame(raf); try { renderer?.dispose(); } catch {} el.remove(); },
  };
}

// 開啟選擇視窗。required = true（沒設定過外觀）不能取消。回傳 Promise<{color, ear, eye} | null>（取消為 null）。
export function openAvatarPicker({ initial, required = false, title = '選你的小傢伙', note = '進入遊戲都會用這個外觀，之後可以在大廳隨時更換。' } = {}) {
  if (!document.getElementById('ap-style')) { const st = document.createElement('style'); st.id = 'ap-style'; st.textContent = CSS; document.head.append(st); }
  let cur = isValidAvatar(initial) ? norm(initial) : { ...DEFAULT_AVATAR };
  const wrap = document.createElement('div'); wrap.className = 'ap-wrap';
  wrap.innerHTML = `<div class="ap-box box" role="dialog" aria-label="${title}"><h2>${title}</h2><p>${note}</p><div class="ap-prev"></div>
    <div class="ap-tabs" role="tablist">${TABS.map(([k, label]) => `<button role="tab" data-tab="${k}">${label}</button>`).join('')}</div>
    <div class="ap-pane" data-k="pane"></div>
    <button class="btn primary ap-go">確定</button>${required ? '' : '<button class="btn ap-cancel">取消</button>'}</div>`;
  document.body.append(wrap);
  const $ = k => wrap.querySelector(`[data-k="${k}"]`), preview = createCritterPreview(150);
  wrap.querySelector('.ap-prev').append(preview.el); preview.set(cur);

  const swatches = (key, list, label) => `<div class="ap-lbl">${label}</div><div class="ap-row">${list.map(c => `<button class="ap-sw" data-${key}="${c}" style="background:${c}" aria-pressed="${c === cur[key]}" aria-label="${c}"></button>`).join('')}</div>`;
  const choices = (key, map) => `<div class="ap-row">${Object.entries(map).map(([k, v]) => `<button class="btn" data-${key}="${k}" aria-pressed="${k === cur[key]}">${v}</button>`).join('')}</div>`;
  let tab = 'color';
  const render = () => {
    for (const b of wrap.querySelectorAll('[data-tab]')) b.setAttribute('aria-selected', String(b.dataset.tab === tab));
    $('pane').innerHTML = tab === 'color' ? swatches('color', COLORS, '圍巾') + swatches('body', BODIES, '身體') + swatches('blush', BLUSHES, '腮紅') : tab === 'ear' ? choices('ear', EARS) : choices('eye', EYES);
    preview.set(cur);
  };
  render();
  return new Promise(resolve => {
    const done = v => { preview.dispose(); wrap.remove(); resolve(v); };
    wrap.addEventListener('click', e => {
      const t = e.target.closest('[data-tab]'), pick = e.target.closest('.ap-pane [data-color], .ap-pane [data-body], .ap-pane [data-blush], .ap-pane [data-ear], .ap-pane [data-eye]');
      if (t) { tab = t.dataset.tab; render(); }
      else if (pick) { for (const k of ['color', 'body', 'blush', 'ear', 'eye']) if (pick.dataset[k] !== undefined) cur[k] = pick.dataset[k]; render(); }
      else if (e.target.closest('.ap-go')) { saveAppearance(cur); done({ ...cur }); }
      else if (e.target.closest('.ap-cancel')) done(null);
    });
  });
}
