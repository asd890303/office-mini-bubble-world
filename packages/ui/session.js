// 連線身分：Mini App 用 Telegram 給的 initData；一般網頁用 Worker 簽的登入憑證（Telegram 登入或訪客）。
// identity().query 直接接在 WebSocket 網址的 ? 後面。訪客可以連線對戰，成績不進總積分看板。
const KEY = 'ombw-session';
const lsGet = () => { try { return localStorage.getItem(KEY); } catch { return null; } };
const lsSet = v => { try { v ? localStorage.setItem(KEY, v) : localStorage.removeItem(KEY); } catch {} };
const decode = t => { // 只讀內容顯示用；真正的驗證在伺服器
  try { const b = t.split('.')[0].replace(/-/g, '+').replace(/_/g, '/'); return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(b + '==='.slice((b.length + 3) % 4)), c => c.charCodeAt(0)))); } catch { return null; }
};

// Telegram 登入轉址回來時，憑證在網址 # 後面：存起來並從網址拿掉。回傳登入錯誤代碼（沒有錯誤回傳 null）
export function captureLogin() {
  const h = new URLSearchParams(location.hash.slice(1)), s = h.get('session'), err = h.get('login_error');
  if (s || err) { if (s) lsSet(s); history.replaceState(null, '', location.pathname + location.search); }
  return err;
}
// 回傳 { kind: 'app' | 'web' | 'guest', name, guest, query }；沒有可用身分回傳 null
export function identity() {
  const tg = window.Telegram?.WebApp;
  if (tg?.initData) { const u = tg.initDataUnsafe?.user || {}; return { kind: 'app', name: String(u.first_name || '玩家').slice(0, 12), guest: false, query: 'auth=' + encodeURIComponent(tg.initData) }; }
  const t = lsGet(), p = t && decode(t);
  if (!p || !p.uid || !(p.exp > Date.now())) return null;
  return { kind: p.guest ? 'guest' : 'web', name: p.name, guest: !!p.guest, query: 'session=' + encodeURIComponent(t) };
}
export function logout() { lsSet(null); }

let config = null;
async function authConfig() {
  if (config) return config;
  try { const r = await fetch('/auth/config', { cache: 'no-store' }); config = r.ok ? await r.json() : null; } catch { config = null; }
  return config ||= { telegram: false, guest: false };
}
export const LOGIN_ERRORS = { state: '登入逾時，請再試一次', cancelled: '已取消登入', token: 'Telegram 沒有回應，請再試一次', not_configured: '伺服器還沒設定 Telegram 登入' };

const CSS = `
.lg-wrap { position: fixed; inset: 0; z-index: 110; display: grid; place-items: center; background: rgba(74,59,59,.38); }
.lg-box { width: min(360px, calc(100% - 28px)); padding: 18px 20px; text-align: center; }
.lg-box h2 { margin: 0; font-size: 22px; font-weight: 900; }
.lg-box p { margin: 4px 0 10px; font-size: 13px; color: var(--ink-soft); line-height: 1.5; }
.lg-box .btn { display: block; width: 100%; margin-top: 8px; padding: 10px; font-size: 16px; font-weight: 900; }
.lg-tg { background: #a8d8ff !important; }
.lg-row { display: flex; gap: 8px; margin-top: 12px; }
.lg-row input { flex: 1; min-width: 0; font: inherit; font-size: 15px; padding: 8px 12px; border: 2px solid var(--ink); border-radius: 999px; background: var(--paper); color: var(--ink); }
.lg-row .btn { width: auto; margin: 0; white-space: nowrap; }
.lg-box small { display: block; margin-top: 6px; font-size: 11.5px; color: var(--ink-soft); }
.lg-err { color: #d0456b !important; }
`;
// 選身分：Telegram 登入（轉址離開本頁）、訪客（取名字）、或只玩單人。回傳 identity()，選單人回傳 null
// required：一定要選 Telegram 或訪客（伺服器兩種都沒開放時才給略過）；current：目前身分（顯示並提供登出）
export async function openLogin({ soloLabel = '只玩單人', suggest = '', required = false, title = '連線對戰', current = null } = {}) {
  const cfg = await authConfig();
  if (!document.getElementById('lg-style')) { const st = document.createElement('style'); st.id = 'lg-style'; st.textContent = CSS; document.head.append(st); }
  const wrap = document.createElement('div'); wrap.className = 'lg-wrap';
  const canSkip = !required || !(cfg.telegram || cfg.guest);
  const now = current ? `<p>目前：<b>${String(current.name).replace(/[&<>"']/g, '')}</b>${current.guest ? '（訪客，成績不計分）' : '（Telegram）'}</p>` : '';
  wrap.innerHTML = `<div class="lg-box box" role="dialog" aria-label="${title}"><h2>${title}</h2>${now}
    <p>${cfg.telegram || cfg.guest ? '用 Telegram 登入的成績會進總積分榜；訪客可以一起玩，但不計分。' : '伺服器還沒開放連線，先玩單人版。'}</p>
    ${cfg.telegram ? '<button class="btn lg-tg" data-act="tg">用 Telegram 登入</button>' : ''}
    ${cfg.guest ? `<div class="lg-row"><input maxlength="12" placeholder="訪客名字" value="${String(suggest).replace(/[&<>"']/g, '')}"><button class="btn" data-act="guest">訪客加入</button></div><small>訪客可以連線玩，成績不計入總積分榜</small>` : ''}
    ${current && current.kind !== 'app' ? '<button class="btn" data-act="logout">登出</button>' : ''}
    ${canSkip ? `<button class="btn" data-act="solo">${soloLabel}</button>` : ''}<small class="lg-msg"></small></div>`;
  document.body.append(wrap);
  const input = wrap.querySelector('input'), msg = wrap.querySelector('.lg-msg');
  return new Promise(resolve => {
    const done = v => { wrap.remove(); resolve(v); };
    const guest = async () => {
      msg.textContent = '建立訪客身分中…'; msg.classList.remove('lg-err');
      try {
        const r = await fetch('/auth/guest', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: input.value }) });
        if (!r.ok) throw new Error(String(r.status));
        lsSet((await r.json()).session); done(identity());
      } catch { msg.textContent = '建立失敗，請再試一次'; msg.classList.add('lg-err'); }
    };
    input?.addEventListener('keydown', e => { if (e.key === 'Enter') guest(); });
    wrap.addEventListener('click', e => {
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (act === 'tg') location.href = '/auth/telegram/start?return=' + encodeURIComponent(location.pathname + location.search);
      else if (act === 'guest') guest();
      else if (act === 'solo') done(current);
      else if (act === 'logout') { lsSet(null); done(null); }
    });
  });
}
