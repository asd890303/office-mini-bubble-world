// node deploy/build.mjs → deploy/dist/worker.bundle.js：把入口頁、共用 UI、各遊戲頁面與各遊戲規則檔內嵌進 worker.js，單一檔案可直接部署或貼到 Cloudflare 後台。
import fs from 'fs';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
const asset = p => ({ type: TYPES[path.extname(p)], body: read(p) });

// 新增遊戲：加一筆 { id, dir }，並在 apps/hub/index.html 的 ROOMS 加上同一個 id
export const GAMES = [{ id: 'bubble', dir: 'games/bubble-island' }, { id: 'kart', dir: 'games/kart-island' }, { id: 'artillery', dir: 'games/artillery' }, { id: 'run', dir: 'games/bubble-run' }, { id: 'survive', dir: 'games/bubble-survivors' }, { id: 'party', dir: 'games/party' }];

export function collectAssets() {
  const out = { '/': asset('apps/hub/index.html') };
  for (const f of fs.readdirSync(path.join(ROOT, 'packages/ui'))) if (/\.(js|css)$/.test(f)) out[`/shared/${f}`] = asset(`packages/ui/${f}`);
  for (const g of GAMES) {
    out[`/${g.id}/`] = asset(`${g.dir}/index.html`);
    for (const f of fs.readdirSync(path.join(ROOT, g.dir))) if (f.endsWith('.js')) out[`/${g.id}/${f}`] = asset(`${g.dir}/${f}`);
  }
  return out;
}

export const buildHash = text => crypto.createHash('sha256').update(text).digest('hex').slice(0, 12);

// 把一個規則檔（只有 export、不 import 其他檔）包成 const Name = (() => { ...; return { 匯出 }; })();
function inlineCore(name, file) {
  const core = read(file);
  const names = [...core.matchAll(/^export (?:const|function) ([A-Za-z_$][\w$]*)/gm)].map(m => m[1]);
  const multi = [...core.matchAll(/^export const (.+)$/gm)].flatMap(m => [...m[1].matchAll(/(?:^|,\s*)([A-Za-z_$][\w$]*)\s*=/g)].map(x => x[1]));
  const all = [...new Set([...names, ...multi])];
  return { code: `const ${name} = (() => {\n${core.replace(/^export /gm, '')}\nreturn { ${all.join(', ')} };\n})();`, count: all.length };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  let worker = fs.readFileSync(new URL('../apps/worker/worker.js', import.meta.url), 'utf8');
  const IMPORT = /^import \* as ([A-Za-z_$][\w$]*) from '\.\.\/\.\.\/(games\/[\w-]+\/[\w-]+\.js)';$/gm, ASSETS = /^const ASSETS = null;.*$/m;
  const cores = [...worker.matchAll(IMPORT)];
  if (!cores.length) throw new Error('game core import lines not found');
  if (!ASSETS.test(worker)) throw new Error('ASSETS line not found');
  const counts = [];
  worker = worker.replace(IMPORT, (_, name, file) => { const c = inlineCore(name, file); counts.push(`${name} ${c.count}`); return c.code; });
  // 版本碼 = 整包內容（含頁面與規則檔）的雜湊，內容不變就不變；先用佔位值算，再填進去
  const BUILD = /^const BUILD_ID = null;.*$/m;
  if (!BUILD.test(worker)) throw new Error('BUILD_ID line not found');
  const body = worker.replace(ASSETS, () => `const ASSETS = ${JSON.stringify(collectAssets())};`);
  const buildId = buildHash(body);
  fs.mkdirSync(new URL('./dist/', import.meta.url), { recursive: true });
  fs.writeFileSync(new URL('./dist/worker.bundle.js', import.meta.url), `// 自動產生（node deploy/build.mjs），請改 worker.js / 各遊戲原始檔再重新產生\n` + body.replace(BUILD, () => `const BUILD_ID = ${JSON.stringify(buildId)};`));
  console.log('dist/worker.bundle.js ok, build', buildId, ', exports:', counts.join(', '));
}
