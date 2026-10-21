// 單人擊敗數紀錄（泡泡島、泡泡砲戰）：開局向伺服器拿票，結束時送出成績，伺服器檢查合理才進看板。訪客與沒登入的人不記錄。
const post = (path, body) => fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

// game：'bubble' 或 'artillery'；ID：session.js 的 identity()。回傳要交給 soloFinish 的物件
export function soloStart(game, ID) {
  const s = { game, ticket: Promise.resolve(null) };
  if (!ID || ID.guest) return s;
  s.ticket = post(`/${game}/solo`, { id: ID.query }).then(r => (r.ok ? r.json() : null)).then(j => j?.ticket || null).catch(() => null);
  return s;
}

// 回傳結算畫面要顯示的一句話 { text, best }；這場沒有成績（value 小於 1）回傳 null
// field / unit：榜單上成績的欄位名與單位字，擊敗數是 kills / 擊敗，泡泡跑跑是 score / 公尺
export async function soloFinish(s, ID, kills, label, { field = 'kills', unit = '擊敗', unitAfter = false, extra = {}, show = null } = {}) {
  if (!s || !(kills >= 1)) return null;
  const fmt = v => (unitAfter ? `${v} ${unit}` : `${unit} ${v}`), at = row => (show ? show(row) : fmt(row[field]));
  if (!ID) return { text: `登入後，單人成績也會進${label}紀錄` };
  if (ID.guest) return { text: `訪客的成績不進${label}紀錄` };
  const ticket = await s.ticket;
  if (!ticket) return { text: '紀錄沒送出：連不上伺服器' };
  try {
    const r = await post(`/${s.game}/record`, { id: ID.query, ticket, [field]: kills, ...extra });
    const j = await r.json().catch(() => null);
    if (!r.ok || !j?.ok) return { text: r.status === 429 ? '送出太頻繁，這場沒記錄' : '這場成績沒通過檢查，沒記錄' };
    if (j.rank && j.improved) return { text: `新紀錄！${label}第 ${j.rank} 名（${at(j.top[j.rank - 1])}）`, best: true };
    if (j.rank) return { text: `${label}紀錄：你排第 ${j.rank} 名（${at(j.top[j.rank - 1])}）` };
    const last = j.top.at(-1);
    return { text: last ? `${label}前 3 名最低是${at(last)}` : `${label}紀錄已送出` };
  } catch { return { text: '紀錄沒送出：連不上伺服器' }; }
}

// 把結果寫進 #endNote；seq 用來避免已經開下一場後還顯示舊結果
export function showSoloNote(el, promise, isStale) {
  el.hidden = true; el.className = 'endnote';
  promise.then(n => { if (!n || isStale()) return; el.textContent = n.text; el.classList.toggle('best', !!n.best); el.hidden = false; });
}
