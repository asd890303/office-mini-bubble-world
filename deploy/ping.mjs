// node deploy/ping.mjs https://<Worker 網址> → 量每個房間的往返延遲（約 10 秒）。用訪客身分連進房間，只送 ping，不加入、不開局。
// 邊緣節點（只到 Worker）通常 20 到 30 ms；房間比邊緣多 30 ms 以內就是建在附近的機房。多很多的話，看 deploy/README.md「房間的機房位置」
const base = String(process.argv[2] || '').replace(/\/$/, '');
if (!/^https?:\/\//.test(base)) { console.error('用法：node deploy/ping.mjs https://<Worker 網址>'); process.exit(1); }
const ms = a => { const s = [...a].sort((x, y) => x - y); return s.length ? `中位數 ${s[s.length >> 1].toFixed(0)} ms（最快 ${s[0].toFixed(0)}、最慢 ${s.at(-1).toFixed(0)}）` : '沒有回應'; };
const edge = [];
for (let i = 0; i < 8; i++) { const t = performance.now(); await (await fetch(base + '/version', { cache: 'no-store' })).text(); edge.push(performance.now() - t); }
console.log('邊緣節點'.padEnd(10), ms(edge));
const r = await fetch(base + '/auth/guest', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: '延遲測試' }) });
if (!r.ok) { console.error('拿不到訪客身分：', r.status); process.exit(1); }
const { session } = await r.json();
for (const [path, name] of [['/ws', '泡泡碰碰島'], ['/kart/ws', '泡泡賽車'], ['/artillery/ws', '泡泡砲戰'], ['/run/ws', '泡泡跑跑'], ['/survive/ws', '泡泡倖存者'], ['/party/ws', '泡泡派對'], ['/together/ws', '泡泡Together']]) {
  const rtt = await new Promise(res => {
    const out = [], ws = new WebSocket(base.replace(/^http/, 'ws') + path + '?session=' + encodeURIComponent(session));
    const done = () => { try { ws.close(); } catch {} res(out); };
    ws.onopen = () => { let n = 0; const iv = setInterval(() => { ws.send(JSON.stringify({ t: 'ping', at: performance.now() })); if (++n >= 12) { clearInterval(iv); setTimeout(done, 500); } }, 120); };
    ws.onmessage = e => { const m = JSON.parse(e.data); if (m.t === 'pong') out.push(performance.now() - m.at); };
    ws.onerror = done; setTimeout(done, 8000);
  });
  console.log(name.padEnd(10), ms(rtt));
}
