// 新版本提醒：頁面載入時記下伺服器的版本碼，之後定時比對；版本變了就在畫面上方提醒玩家重新整理。
// 不會自動重新整理，避免打斷進行中的比賽。fetcher 可以換掉，方便測試。
const CSS = `
.up-bar { position: fixed; left: 50%; top: max(8px, env(safe-area-inset-top)); transform: translateX(-50%); z-index: 200; display: flex; align-items: center; gap: 8px; padding: 6px 8px 6px 14px; max-width: calc(100% - 16px); background: var(--paper); border: 3px solid var(--ink); border-radius: 999px; box-shadow: var(--shadow); font-weight: 900; font-size: 14px; color: var(--ink); animation: upIn .25s; }
.up-bar .btn { padding: 4px 12px; font-size: 13px; background: var(--pink); }
.up-bar .up-later { background: transparent; border-color: transparent; font-weight: 700; color: var(--ink-soft); padding: 4px 8px; }
@keyframes upIn { from { transform: translate(-50%, -140%); } }
`;
export function showUpdateBar() {
  if (document.querySelector('.up-bar')) return;
  if (!document.getElementById('up-style')) { const st = document.createElement('style'); st.id = 'up-style'; st.textContent = CSS; document.head.append(st); }
  const bar = document.createElement('div'); bar.className = 'up-bar'; bar.setAttribute('role', 'status');
  bar.innerHTML = '<span>有新版本了</span><button class="btn up-go">重新整理</button><button class="btn up-later" aria-label="稍後">稍後</button>';
  bar.querySelector('.up-go').onclick = () => location.reload();
  bar.querySelector('.up-later').onclick = () => bar.remove();
  document.body.append(bar);
}

// interval：每隔多久檢查一次（預設 5 分鐘）；回到畫面（切回分頁、從背景回到 Telegram）時也會立刻檢查
export function watchUpdates({ url = '/version', interval = 300000, fetcher = (u) => fetch(u, { cache: 'no-store' }), onNew = showUpdateBar } = {}) {
  let base = null, found = false, timer = 0;
  const check = async () => {
    if (found) return;
    try {
      const r = await fetcher(url); if (!r.ok) return;
      const v = (await r.json()).v; if (typeof v !== 'string') return;
      if (base == null) base = v; else if (v !== base) { found = true; clearInterval(timer); onNew(v); }
    } catch {}
  };
  const onVisible = () => { if (!document.hidden) check(); };
  document.addEventListener('visibilitychange', onVisible);
  check(); timer = setInterval(() => { if (!document.hidden) check(); }, interval);
  return { check, stop() { clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); } };
}
