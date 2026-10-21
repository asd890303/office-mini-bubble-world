// 共用操作提示框：各遊戲左側的「操作」小卡，可收合，收合狀態各遊戲共用。
// rows 的每一列是字串，[X] 會畫成按鍵圖示，例如 '[A][D] 左右移動　[空白] 跳'
const FOLD_KEY = 'ombw-keyhelp-fold';
const CSS = `
.keyhelp { border-width: 2px; border-radius: 14px; padding: 4px 8px 6px; font-size: 11.5px; font-weight: 700; line-height: 1.7; box-sizing: border-box; }
.keyhelp.float { position: fixed; left: 10px; top: var(--kh-top, 10px); width: 210px; z-index: 4; }
.keyhelp h4 { margin: 0; font-size: 12px; font-weight: 900; display: flex; justify-content: space-between; align-items: center; }
.keyhelp .kh-fold { padding: 1px 9px; font-size: 11px; white-space: nowrap; }
.keyhelp kbd { display: inline-block; min-width: 16px; padding: 0 4px; margin-right: 2px; text-align: center; font: 900 10.5px inherit; border: 2px solid var(--ink); border-radius: 6px; background: #fff; }
.keyhelp.fold .kh-list { display: none; }
body.touch .keyhelp.float { display: none; }
`;
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const renderRows = rows => rows.map(r => `<div>${esc(r).replace(/\[([^\]]+)\]/g, '<kbd>$1</kbd>')}</div>`).join('');

const store = { get() { try { return localStorage.getItem(FOLD_KEY) === '1'; } catch { return false; } }, set(on) { try { localStorage.setItem(FOLD_KEY, on ? '1' : '0'); } catch {} } };

// parent：放進某個容器（跟著版面排列）；省略就固定在畫面左側，top 是離上緣的距離
export function mountKeyHelp({ rows, parent = null, top = '10px', title = '操作' } = {}) {
  if (!document.getElementById('keyhelp-css')) { const st = document.createElement('style'); st.id = 'keyhelp-css'; st.textContent = CSS; document.head.append(st); }
  const el = document.createElement('div'); el.className = 'box keyhelp' + (parent ? '' : ' float'); el.style.setProperty('--kh-top', top);
  el.innerHTML = `<h4><span>${esc(title)}</span><button class="btn kh-fold" type="button"></button></h4><div class="kh-list">${renderRows(rows)}</div>`;
  const btn = el.querySelector('.kh-fold'), set = on => { el.classList.toggle('fold', on); btn.textContent = on ? '展開' : '收合'; store.set(on); };
  el.classList.toggle('fold', store.get()); btn.textContent = el.classList.contains('fold') ? '展開' : '收合';
  btn.addEventListener('click', e => { e.stopPropagation(); set(!el.classList.contains('fold')); });
  (parent || document.body).append(el);
  return el;
}
