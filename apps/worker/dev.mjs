// node apps/worker/dev.mjs → http://127.0.0.1:8767 ：用和 Worker 相同的網址對應提供頁面（沒有 /ws，連線版只在 Telegram 內可用；/board 回空的看板）。
import http from 'http';
import { collectAssets, buildHash } from '../../deploy/build.mjs';

const PORT = Number(process.env.PORT) || 8767;
http.createServer((req, res) => {
  let p = new URL(req.url, 'http://x').pathname; const assets = collectAssets();
  if (p === '/index.html') p = '/';
  if (p === '/version') { res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' }); return res.end(JSON.stringify({ v: buildHash(JSON.stringify(assets)) })); }
  if (p === '/board') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ players: 0, top: [] })); } // 本機沒有大廳 Durable Object，看板回空的
  if (!assets[p] && assets[p + '/']) { res.writeHead(301, { location: p + '/' }); return res.end(); }
  const a = assets[p]; if (!a) { res.writeHead(404); return res.end('not found'); }
  res.writeHead(200, { 'content-type': a.type, 'cache-control': 'no-cache' }); res.end(a.body);
}).listen(PORT, '127.0.0.1', () => console.log(`http://127.0.0.1:${PORT}`));
