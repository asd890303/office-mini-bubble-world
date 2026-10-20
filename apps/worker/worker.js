// 泡泡碰碰島 — Cloudflare Worker + Durable Object (single room "main"), server-authoritative.
// Bindings: GAME_ROOM (Durable Object, class GameRoom)、KART_ROOM (class KartRoom)、ARTILLERY_ROOM (class ArtilleryRoom)、LOBBY_ROOM (class LobbyRoom), secret BOT_TOKEN（多個 bot 用逗號分隔，第一個負責貼名次到群組）, var GROUP_ID, optional var ALLOWED_ORIGIN.
import * as Core from '../../games/bubble-island/game-core.js';
import * as KartCore from '../../games/kart-island/kart-core.js';
import * as ArtilleryCore from '../../games/artillery/artillery-core.js';

const TICK_MS = 50, LOBBY_MS = 20000, END_MS = 8000, AUTH_MAX_AGE = 86400, LOBBY_PUSH_MS = 500;
// 線上房間只給真人玩：湊滿 MIN_PLAYERS 才倒數開局；斷線超過 GRACE_MS 判出局
const MIN_PLAYERS = 2, GRACE_MS = 10000;
// 掛機踢除：超過 IDLE_MS 沒有操作就關閉連線（close code 4001），不再占用房間與運行時間
const IDLE_MS = 10 * 60 * 1000;
// 泡泡賽車：倒數結束後投票選地圖的時間
const VOTE_MS = 15000;
// 總積分：連線對戰依名次給分（泡泡賽車的結果自帶 points，其他遊戲用這張表）
const SCORE_POINTS = [5, 3, 2, 1];
// 看板儲存前綴：換一個新前綴，看板就從零重新記錄；舊前綴底下的資料保留不刪
const SCORE_PREFIX = 'score2:';
// 各遊戲紀錄：賽車每條賽道最快完賽 best:kart:<賽道 id>（困難電腦的單人成績另存 best:kart:<賽道 id>:hard；競速賽在賽道 id 後面多 :speed，例如 best:kart:candy:speed:hard），泡泡島單場最多擊敗 best:bubble:kills，泡泡砲戰單場擊敗對手數 best:artillery:kills；每份只留前 RECORD_TOP 名，每位玩家只留自己最好的一次
const RECORD_PREFIX = 'best:', RECORD_TOP = 3, KART_MIN_TIME = 5;
// 泡泡賽車單人紀錄：開跑時發的票 SOLO_TICKET_MS 內有效；同一人兩次送出至少隔 RECORD_GAP_MS
const SOLO_TICKET_MS = 10 * 60 * 1000, RECORD_GAP_MS = 5000;
// 泡泡島與泡泡砲戰單人紀錄（單場擊敗數）：max 單場最多能擊敗幾人，perKill 每擊敗一人至少要花的秒數，ttl 票的有效時間。單人版在瀏覽器裡跑，伺服器只能擋明顯不合理的成績
const KILL_SOLO = { bubble: { max: 3, perKill: 5, ttl: 15 * 60 * 1000 }, artillery: { max: 3, perKill: 8, ttl: 40 * 60 * 1000 } };
// 泡泡砲戰：每人每回合最多送幾個標記、幾句快捷訊息
const AR_PINGS = ['attack', 'danger', 'heal'], AR_SAYS = 6, AR_PER_TURN = 3;
// 泡泡砲戰的 AI 地圖：投票開始時呼叫一次，逾時或失敗就用程式隨機的配方
const enc = new TextEncoder();
const ASSETS = null; // build.mjs 會把入口頁、共用 UI、各遊戲頁面內嵌在這裡，讓同一個 Worker 直接提供頁面
const BUILD_ID = null; // build.mjs 會填入整包內容的雜湊；頁面用它判斷有沒有新版本（/version）

/* ---------- Telegram initData 驗證 ---------- */
async function hmac(key, msg) {
  const k = await crypto.subtle.importKey('raw', typeof key === 'string' ? enc.encode(key) : key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, enc.encode(msg)));
}
const hex = b => [...b].map(x => x.toString(16).padStart(2, '0')).join('');
export async function verifyInitData(initData, botToken, { maxAge = AUTH_MAX_AGE, now = Math.floor(Date.now() / 1000) } = {}) {
  if (!initData || !botToken) return { ok: false, error: 'missing' };
  const params = new URLSearchParams(initData), hash = params.get('hash');
  if (!hash) return { ok: false, error: 'no hash' };
  params.delete('hash');
  const dcs = [...params.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([k, v]) => `${k}=${v}`).join('\n');
  const secret = await hmac('WebAppData', botToken);
  const calc = hex(await hmac(secret, dcs));
  let diff = calc.length ^ hash.length; for (let i = 0; i < calc.length; i++) diff |= calc.charCodeAt(i) ^ (hash.charCodeAt(i) || 0);
  if (diff) return { ok: false, error: 'bad hash' };
  const authDate = Number(params.get('auth_date'));
  if (!authDate || now - authDate > maxAge) return { ok: false, error: 'expired' };
  let user = null; try { user = JSON.parse(params.get('user') || 'null'); } catch {}
  if (!user || !user.id) return { ok: false, error: 'no user' };
  return { ok: true, user };
}

// BOT_TOKEN 可放多個 bot 的 token（逗號分隔）：Mini App 由哪個 bot 開啟，initData 就用那個 bot 的 token 簽
export const botTokens = env => String(env.BOT_TOKEN || '').split(',').map(t => t.trim()).filter(Boolean);
export async function verifyInitDataAny(initData, tokens, opts) {
  let last = { ok: false, error: 'missing' };
  for (const t of tokens) { last = await verifyInitData(initData, t, opts); if (last.ok) return last; }
  return last;
}

const corsHeaders = env => ({ 'access-control-allow-origin': env.ALLOWED_ORIGIN || '*', 'access-control-allow-methods': 'GET, OPTIONS', 'access-control-allow-headers': 'content-type' });

/* ---------- 網頁登入：Telegram OIDC（授權碼 + PKCE）與訪客 ---------- */
// Mini App 用 initData 驗證；網頁用 Worker 自己簽的登入憑證（session）。訪客的 uid 以 g: 開頭，成績不進看板。
const SESSION_DAYS = 30, GUEST_PREFIX = 'g:', TG_ISS = 'https://oauth.telegram.org';
const b64u = {
  enc: bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
  dec: s => Uint8Array.from(atob(String(s).replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((String(s).length + 3) % 4)), c => c.charCodeAt(0)),
};
const textToB64u = t => b64u.enc(enc.encode(t)), b64uToText = s => new TextDecoder().decode(b64u.dec(s));
const randB64u = n => b64u.enc(crypto.getRandomValues(new Uint8Array(n)));
const cleanName = (s, fallback) => String(s || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 12) || fallback;
const tgName = u => cleanName([u.first_name, u.last_name].filter(Boolean).join(' ') || u.username || String(u.id), '玩家');
// 換 BOT_TOKEN 會讓所有網頁登入失效。purpose 不同就是不同的金鑰：單人賽的票（kart-solo）不能拿來當登入憑證，反過來也不行
const sessionKey = (env, purpose = 'session') => { const t = botTokens(env)[0]; return t ? hmac(purpose + ':' + t, 'office-mini-bubble-world') : null; };
export async function signSession(payload, env, purpose) {
  const key = await sessionKey(env, purpose); if (!key) throw new Error('BOT_TOKEN missing');
  const body = textToB64u(JSON.stringify(payload)); return body + '.' + b64u.enc(await hmac(key, body));
}
// 回傳 payload；簽名不符、格式錯或過期回傳 null
export async function readSession(token, env, now = Date.now(), purpose) {
  const [body, sig] = String(token || '').split('.'); if (!body || !sig) return null;
  const key = await sessionKey(env, purpose); if (!key) return null;
  const want = b64u.enc(await hmac(key, body)); if (want.length !== sig.length) return null;
  let diff = 0; for (let i = 0; i < want.length; i++) diff |= want.charCodeAt(i) ^ sig.charCodeAt(i); if (diff) return null;
  let p; try { p = JSON.parse(b64uToText(body)); } catch { return null; }
  return p && p.uid && p.exp > now ? p : null;
}
// WebSocket 連線的身分：Mini App 帶 auth=initData，網頁帶 session=登入憑證
export async function resolveUser(url, env) {
  const init = url.searchParams.get('auth');
  if (init) { const v = await verifyInitDataAny(init, botTokens(env)); return v.ok ? { id: String(v.user.id), name: tgName(v.user) } : null; }
  const s = await readSession(url.searchParams.get('session'), env);
  return s && s.uid !== 'oauth' ? { id: String(s.uid), name: cleanName(s.name, '玩家'), guest: s.guest ? 1 : 0 } : null;
}
let jwksCache = null, jwksAt = 0;
export function resetJwksCache() { jwksCache = null; jwksAt = 0; }
async function jwks() {
  if (jwksCache && Date.now() - jwksAt < 3600e3) return jwksCache;
  const r = await fetch(TG_ISS + '/.well-known/jwks.json'); if (!r.ok) throw new Error('jwks ' + r.status);
  jwksCache = (await r.json()).keys || []; jwksAt = Date.now(); return jwksCache;
}
const JWT_ALGS = { RS256: [{ name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, { name: 'RSASSA-PKCS1-v1_5' }], ES256: [{ name: 'ECDSA', namedCurve: 'P-256' }, { name: 'ECDSA', hash: 'SHA-256' }], EdDSA: [{ name: 'Ed25519' }, { name: 'Ed25519' }] };
// 驗證 Telegram 簽發的 id_token：簽名（JWKS 公鑰）、iss、aud（Bot ID）、exp
export async function verifyTelegramIdToken(token, env, now = Date.now()) {
  const parts = String(token || '').split('.'); if (parts.length !== 3) return { ok: false, error: 'format' };
  let head, claims; try { head = JSON.parse(b64uToText(parts[0])); claims = JSON.parse(b64uToText(parts[1])); } catch { return { ok: false, error: 'decode' }; }
  const alg = JWT_ALGS[head.alg]; if (!alg) return { ok: false, error: 'alg' };
  const jwk = (await jwks()).find(k => !head.kid || k.kid === head.kid); if (!jwk) return { ok: false, error: 'kid' };
  let valid = false;
  try { const key = await crypto.subtle.importKey('jwk', jwk, alg[0], false, ['verify']); valid = await crypto.subtle.verify(alg[1], key, b64u.dec(parts[2]), enc.encode(parts[0] + '.' + parts[1])); } catch { valid = false; }
  if (!valid) return { ok: false, error: 'signature' };
  if (claims.iss !== TG_ISS) return { ok: false, error: 'iss' };
  const aud = (Array.isArray(claims.aud) ? claims.aud : [claims.aud]).map(String);
  if (!env.TG_LOGIN_CLIENT_ID || !aud.includes(String(env.TG_LOGIN_CLIENT_ID))) return { ok: false, error: 'aud' };
  if (!(Number(claims.exp) * 1000 > now)) return { ok: false, error: 'expired' };
  return { ok: true, claims };
}
const loginReady = env => !!(env.TG_LOGIN_CLIENT_ID && env.TG_LOGIN_SECRET && botTokens(env).length);
const safeReturn = r => (typeof r === 'string' && /^\/(?![/\\])/.test(r) ? r : '/'); // 只允許站內路徑，避免被拿來轉址到別的網站
async function handleAuth(req, url, env) {
  const noStore = { 'cache-control': 'no-store' };
  if (url.pathname === '/auth/config') return Response.json({ telegram: loginReady(env), guest: botTokens(env).length > 0 }, { headers: noStore });
  if (url.pathname === '/auth/guest' && req.method === 'POST') {
    if (!botTokens(env).length) return new Response('not configured', { status: 503 });
    let body = {}; try { body = await req.json(); } catch {}
    const name = cleanName(body.name, '訪客');
    return Response.json({ session: await signSession({ uid: GUEST_PREFIX + randB64u(9), name, guest: 1, exp: Date.now() + SESSION_DAYS * 864e5 }, env), name }, { headers: noStore });
  }
  if (url.pathname === '/auth/telegram/start') {
    if (!loginReady(env)) return new Response('telegram login not configured', { status: 503 });
    const state = randB64u(16), verifier = randB64u(32), ret = safeReturn(url.searchParams.get('return'));
    const cookie = await signSession({ uid: 'oauth', state, verifier, ret, exp: Date.now() + 600e3 }, env);
    const challenge = b64u.enc(await crypto.subtle.digest('SHA-256', enc.encode(verifier)));
    const q = new URLSearchParams({ client_id: String(env.TG_LOGIN_CLIENT_ID), redirect_uri: url.origin + '/auth/telegram/callback', response_type: 'code', scope: 'openid profile', state, code_challenge: challenge, code_challenge_method: 'S256' });
    return new Response(null, { status: 302, headers: { location: TG_ISS + '/auth?' + q, 'set-cookie': `tg_oauth=${cookie}; Path=/auth; HttpOnly; Secure; SameSite=Lax; Max-Age=600`, ...noStore } });
  }
  if (url.pathname === '/auth/telegram/callback') {
    const m = (req.headers.get('cookie') || '').match(/(?:^|;\s*)tg_oauth=([^;]+)/), st = m ? await readSession(m[1], env) : null;
    const back = (ret, frag) => new Response(null, { status: 302, headers: { location: ret + '#' + frag, 'set-cookie': 'tg_oauth=; Path=/auth; HttpOnly; Secure; SameSite=Lax; Max-Age=0', ...noStore } });
    if (!loginReady(env)) return back('/', 'login_error=not_configured');
    if (!st || st.uid !== 'oauth' || st.state !== url.searchParams.get('state')) return back('/', 'login_error=state');
    const code = url.searchParams.get('code'); if (!code) return back(st.ret, 'login_error=' + encodeURIComponent(url.searchParams.get('error') || 'cancelled'));
    const tr = await fetch(TG_ISS + '/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', authorization: 'Basic ' + btoa(`${env.TG_LOGIN_CLIENT_ID}:${env.TG_LOGIN_SECRET}`) },
      body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: url.origin + '/auth/telegram/callback', client_id: String(env.TG_LOGIN_CLIENT_ID), code_verifier: st.verifier }) });
    if (!tr.ok) return back(st.ret, 'login_error=token');
    const v = await verifyTelegramIdToken((await tr.json().catch(() => ({}))).id_token, env);
    if (!v.ok) return back(st.ret, 'login_error=' + v.error);
    const c = v.claims, uid = String(c.id ?? c.sub), name = cleanName(c.name || [c.given_name, c.family_name].filter(Boolean).join(' ') || c.preferred_username, '玩家');
    return back(st.ret, 'session=' + await signSession({ uid, name, guest: 0, exp: Date.now() + SESSION_DAYS * 864e5 }, env));
  }
  return null;
}

/* ---------- 泡泡賽車單人紀錄 ---------- */
// 單人賽在瀏覽器裡跑，伺服器只能檢查合不合理：開跑時發票（記下賽道與開跑時間），完賽時驗票，
// 時間不能比開票後真實經過的時間短，也不能比「全程維持漂移加速的極速」跑完還快。通過才交給大廳寫入賽道紀錄（不加總積分）。
// 競速賽每圈能集到好幾個氮氣（效果和加速鞋一樣 ×1.8），上限改用氮氣的倍率
export function kartMinTime(track, mode = 'item') { return KartCore.LAPS * track.T.L / (KartCore.KART.VMAX * (mode === 'speed' ? KartCore.ITEMS.shoe.mult : KartCore.DRIFT.MULT)); }
async function handleKartSolo(req, url, env) {
  const fail = (error, status) => Response.json({ error }, { status, headers: { 'cache-control': 'no-store' } });
  if (req.method !== 'POST') return fail('method', 405);
  const origin = req.headers.get('Origin');
  if (env.ALLOWED_ORIGIN && origin && origin !== env.ALLOWED_ORIGIN) return fail('origin', 403);
  let body = null; try { body = await req.json(); } catch {}
  if (!body || typeof body !== 'object') return fail('body', 400);
  // 身分和 WebSocket 一樣：body.id 是 identity().query（auth=initData 或 session=登入憑證）
  const u = await resolveUser({ searchParams: new URLSearchParams(String(body.id || '')) }, env);
  if (!u) return fail('unauthorized', 401);
  if (u.guest) return fail('guest', 403);
  const now = Date.now();
  if (url.pathname === '/kart/solo') {
    const tr = KartCore.TRACKS.find(t => t.id === body.track); if (!tr) return fail('track', 400);
    const diff = KartCore.DIFFS[body.diff] ? body.diff : 'normal', mode = KartCore.MODES[body.mode] ? body.mode : 'item'; // 電腦難度與模式：困難、競速賽的成績各進另一份榜
    return Response.json({ ticket: await signSession({ uid: u.id, track: tr.id, diff, mode, t0: now, exp: now + SOLO_TICKET_MS }, env, 'kart-solo') }, { headers: { 'cache-control': 'no-store' } });
  }
  const tk = await readSession(body.ticket, env, now, 'kart-solo');
  if (!tk || tk.uid !== u.id) return fail('ticket', 403);
  const tr = KartCore.TRACKS.find(t => t.id === tk.track), time = Number(body.time);
  const mode = tk.mode === 'speed' ? 'speed' : 'item';
  if (!tr || !Number.isFinite(time) || time < kartMinTime(tr, mode) || time > KartCore.MAX_TIME) return fail('time', 422);
  if ((now - tk.t0) / 1000 < time) return fail('time', 422); // 倒數 3 秒不算在成績裡，剛好當網路延遲的緩衝
  if (!env.LOBBY_ROOM) return fail('records off', 503);
  const r = await env.LOBBY_ROOM.get(env.LOBBY_ROOM.idFromName('main')).fetch('https://lobby/record', { method: 'POST', body: JSON.stringify({ game: 'kart', track: tr.id, diff: tk.diff === 'hard' ? 'hard' : 'normal', mode, entries: [{ uid: u.id, name: u.name, stats: { time } }] }) });
  return new Response(r.body, { status: r.status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
}

async function handleKillSolo(req, url, env, game) {
  const cfg = KILL_SOLO[game], fail = (error, status) => Response.json({ error }, { status, headers: { 'cache-control': 'no-store' } });
  if (req.method !== 'POST') return fail('method', 405);
  const origin = req.headers.get('Origin');
  if (env.ALLOWED_ORIGIN && origin && origin !== env.ALLOWED_ORIGIN) return fail('origin', 403);
  let body = null; try { body = await req.json(); } catch {}
  if (!body || typeof body !== 'object') return fail('body', 400);
  const u = await resolveUser({ searchParams: new URLSearchParams(String(body.id || '')) }, env);
  if (!u) return fail('unauthorized', 401);
  if (u.guest) return fail('guest', 403);
  const now = Date.now(), kind = `${game}-solo`;
  if (url.pathname === `/${game}/solo`) return Response.json({ ticket: await signSession({ uid: u.id, game, t0: now, exp: now + cfg.ttl }, env, kind) }, { headers: { 'cache-control': 'no-store' } });
  const tk = await readSession(body.ticket, env, now, kind);
  if (!tk || tk.uid !== u.id) return fail('ticket', 403);
  const kills = Number(body.kills);
  if (!Number.isInteger(kills) || kills < 1 || kills > cfg.max || (now - tk.t0) / 1000 < cfg.perKill * kills) return fail('kills', 422);
  if (!env.LOBBY_ROOM) return fail('records off', 503);
  const r = await env.LOBBY_ROOM.get(env.LOBBY_ROOM.idFromName('main')).fetch('https://lobby/record', { method: 'POST', body: JSON.stringify({ game, entries: [{ uid: u.id, name: u.name, stats: { kills } }] }) });
  return new Response(r.body, { status: r.status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(env) });
    const binding = { '/ws': 'GAME_ROOM', '/kart/ws': 'KART_ROOM', '/artillery/ws': 'ARTILLERY_ROOM', '/lobby/ws': 'LOBBY_ROOM' }[url.pathname];
    if (binding) {
      if (req.headers.get('Upgrade') !== 'websocket') return new Response('expected websocket', { status: 426 });
      const origin = req.headers.get('Origin');
      if (env.ALLOWED_ORIGIN && origin && origin !== env.ALLOWED_ORIGIN) return new Response('forbidden origin', { status: 403 });
      const u = await resolveUser(url, env);
      if (!u) return new Response('unauthorized', { status: 401 });
      const h = new Headers(req.headers); h.set('X-TG-User', encodeURIComponent(JSON.stringify(u)));
      const room = env[binding];
      return room.get(room.idFromName('main')).fetch(new Request(req, { headers: h }));
    }
    if (url.pathname === '/kart/solo' || url.pathname === '/kart/record') return handleKartSolo(req, url, env);
    const ks = url.pathname.match(/^\/(bubble|artillery)\/(solo|record)$/); if (ks) return handleKillSolo(req, url, env, ks[1]);
    if (url.pathname.startsWith('/auth/')) { const r = await handleAuth(req, url, env); if (r) return r; }
    if (url.pathname === '/board/games' && req.method === 'GET') { // 各遊戲紀錄（公開唯讀）
      if (!env.LOBBY_ROOM) return Response.json(emptyGameBoard(), { headers: corsHeaders(env) });
      const r = await env.LOBBY_ROOM.get(env.LOBBY_ROOM.idFromName('main')).fetch('https://lobby/board/games');
      return new Response(r.body, { headers: { 'content-type': 'application/json', 'cache-control': 'no-cache', ...corsHeaders(env) } });
    }
    if (url.pathname === '/board' && req.method === 'GET') { // 總積分看板（公開唯讀）
      if (!env.LOBBY_ROOM) return Response.json({ players: 0, top: [] }, { headers: corsHeaders(env) });
      const r = await env.LOBBY_ROOM.get(env.LOBBY_ROOM.idFromName('main')).fetch('https://lobby/board');
      return new Response(r.body, { headers: { 'content-type': 'application/json', 'cache-control': 'no-cache', ...corsHeaders(env) } });
    }
    const asset = ASSETS && ASSETS[url.pathname === '/index.html' ? '/' : url.pathname];
    if (ASSETS && !asset && ASSETS[url.pathname + '/']) return Response.redirect(url.origin + url.pathname + '/', 301);
    if (asset) return new Response(asset.body, { headers: { 'content-type': asset.type, 'cache-control': 'no-cache', ...corsHeaders(env) } });
    if (url.pathname === '/version') return Response.json({ v: BUILD_ID || 'dev' }, { headers: { 'cache-control': 'no-store', ...corsHeaders(env) } });
    if (url.pathname === '/' || url.pathname === '/health') return new Response(JSON.stringify({ ok: true, game: 'office-mini-bubble-world' }), { headers: { 'content-type': 'application/json', ...corsHeaders(env) } });
    return new Response('not found', { status: 404 });
  },
};

/* ---------- 房間 ---------- */
// 遊戲房間（單一房間 main、伺服器判定）。泡泡碰碰島直接用；其他遊戲繼承後覆寫 newGame / onInput / stopPlayer / alive / resultText。
export class GameRoom {
  constructor(ctx, env) {
    this.ctx = ctx; this.env = env; this.core = Core; this.gameId = 'bubble';
    this.phase = 'lobby';      // lobby -> play -> end -> lobby
    this.lobby = [];           // [{ uid, name, color, ear, eye, body, blush }] next game's players, join order = slot
    this.countdownAt = 0; this.endAt = 0; this.game = null; this.result = null; this.timer = null; this.lastPush = 0;
    this.gone = new Map();     // uid -> 斷線時間（遊戲中）
    this.active = new Map();   // uid -> 最後一次操作時間（ping 不算）
    this.now = () => Date.now();
  }
  async fetch(req) {
    let user = null; try { user = JSON.parse(decodeURIComponent(req.headers.get('X-TG-User') || '')); } catch {}
    if (!user?.id) return new Response('unauthorized', { status: 401 });
    const pair = new WebSocketPair(), [client, server] = Object.values(pair);
    for (const old of this.ctx.getWebSockets(user.id)) { try { old.close(4000, '已在其他視窗開啟'); } catch {} }
    this.ctx.acceptWebSocket(server, [user.id]);
    server.serializeAttachment({ uid: user.id, name: user.name });
    this.onOpen(server, user);
    return new Response(null, { status: 101, webSocket: client });
  }
  sockets() { return this.ctx.getWebSockets().filter(ws => ws.readyState === 1 || ws.readyState === undefined); }
  send(ws, o) { try { ws.send(JSON.stringify(o)); } catch {} }
  broadcast(o) { const s = JSON.stringify(o); for (const ws of this.sockets()) { try { ws.send(s); } catch {} } }
  who(ws) { try { return ws.deserializeAttachment() || {}; } catch { return {}; } }
  gamePlayers() { return this.game?.players || []; }
  gamePlayer(uid) { return this.gamePlayers().find(p => p.uid === uid) || null; }
  newGame(seed) { return this.core.createGame({ seed, humans: this.lobby, diff: 'normal', bots: false }); }
  // 房間狀態給大廳顯示：等待人數、開賽時間、比賽中、結算中
  status() {
    const playing = this.phase === 'play';
    return { phase: this.phase, players: playing ? this.gamePlayers().filter(p => p.human && this.alive(p)).length : this.lobby.length, max: this.core.MAX_PLAYERS,
      startsAt: this.phase === 'lobby' && this.countdownAt ? this.countdownAt : this.phase === 'vote' ? this.voteEndsAt : null,
      endsAt: this.phase === 'end' ? this.endAt : null, watching: this.sockets().length, at: this.now() };
  }
  // 狀態有變就通知大廳（最多每秒一次）；大廳再推給所有在大廳的人
  maybeNotify(now) {
    const st = this.status(), sig = [st.phase, st.players, st.startsAt, st.watching].join('|');
    if (sig === this.lastSig || now - (this.lastNotify || 0) < 1000) return;
    this.lastSig = sig; this.lastNotify = now;
    const ns = this.env.LOBBY_ROOM; if (!ns) return;
    ns.get(ns.idFromName('main')).fetch('https://lobby/rooms', { method: 'POST', body: JSON.stringify({ game: this.gameId, status: st }) }).catch(e => console.error('notify lobby', e));
  }
  onInput(p, m) { if (m.t === 'in') this.core.setInput(this.game, p.id, m.d); else if (m.t === 'bomb') this.core.placeBomb(this.game, p); }
  stopPlayer(p) { this.core.setInput(this.game, p.id, [0, 0]); }
  expire(p) { this.core.forfeit(this.game, p.id); } // 斷線超過寬限期
  frame() { return this.core.snapshot(this.game); } // 每個 tick 廣播的快照
  isWin(r, p) { return !!r.winner && r.winner.id === p.id; }
  alive(p) { return p.state !== 'dead'; }
  lobbyMsg() {
    return { t: 'lobby', phase: this.phase, players: this.lobby.map(p => ({ uid: p.uid, name: p.name, color: p.color })), max: this.core.MAX_PLAYERS, min: MIN_PLAYERS,
      countdown: this.phase === 'lobby' && this.lobby.length >= MIN_PLAYERS ? Math.max(0, Math.ceil((this.countdownAt - this.now()) / 1000)) : null,
      endIn: this.phase === 'end' ? Math.max(0, Math.ceil((this.endAt - this.now()) / 1000)) : null,
      time: this.phase === 'play' && this.game ? Math.ceil(this.game.time) : null };
  }
  onOpen(ws, user) {
    const p = this.phase === 'play' && this.gamePlayer(user.id);
    if (p) this.gone.delete(user.id); // 寬限期內重連：繼續操作原本的角色
    this.active.set(user.id, this.now());
    this.send(ws, { t: 'hello', you: user.id, name: user.name, phase: this.phase, me: p ? p.id : null, result: this.phase === 'end' ? this.result : null });
    if (this.phase === 'play') this.send(ws, { t: 'start', me: p ? p.id : null, s: this.core.snapshot(this.game) });
    this.send(ws, this.lobbyMsg());
    this.ensureTimer();
  }
  async webSocketMessage(ws, raw) {
    let m; try { m = JSON.parse(typeof raw === 'string' ? raw : new TextDecoder().decode(raw)); } catch { return; }
    const { uid, name } = this.who(ws); if (!uid) return;
    if (m.t === 'join') return this.join(ws, uid, name, m);
    if (m.t === 'leave') { this.lobby = this.lobby.filter(p => p.uid !== uid); this.resetCountdown(); return this.broadcast(this.lobbyMsg()); }
    if (m.t === 'ping') return this.send(ws, { t: 'pong', at: m.at });
    this.active.set(uid, this.now());
    if (this.phase !== 'play') return;
    const p = this.gamePlayer(uid); if (!p || !p.human) return;
    this.onInput(p, m);
  }
  join(ws, uid, name, m) {
    if (this.phase === 'play') return this.send(ws, { t: 'note', text: '這局進行中，下一局再加入（目前觀戰）' });
    if (!this.lobby.some(p => p.uid === uid)) {
      if (this.lobby.length >= this.core.MAX_PLAYERS) return this.send(ws, { t: 'note', text: '房間已滿（4 人），這局先觀戰' });
      this.lobby.push({ uid, name, color: this.core.COLORS.includes(m.color) ? m.color : null, ear: this.core.EARS[m.ear] ? m.ear : null, eye: Object.hasOwn(this.core.EYES, m.eye) ? m.eye : null, body: this.core.BODIES.includes(m.body) ? m.body : null, blush: this.core.BLUSHES.includes(m.blush) ? m.blush : null });
      if (this.phase === 'lobby' && this.lobby.length === MIN_PLAYERS) this.countdownAt = this.now() + LOBBY_MS;
    } else { const p = this.lobby.find(p => p.uid === uid); if (this.core.COLORS.includes(m.color)) p.color = m.color; if (this.core.EARS[m.ear]) p.ear = m.ear; if (Object.hasOwn(this.core.EYES, m.eye)) p.eye = m.eye; if (this.core.BODIES.includes(m.body)) p.body = m.body; if (this.core.BLUSHES.includes(m.blush)) p.blush = m.blush; }
    if (this.phase === 'lobby' && this.lobby.length >= this.core.MAX_PLAYERS) this.countdownAt = this.now();
    this.broadcast(this.lobbyMsg()); this.ensureTimer();
  }
  async webSocketClose(ws) { this.onLeave(ws); }
  async webSocketError(ws) { this.onLeave(ws); }
  onLeave(ws) {
    const { uid } = this.who(ws); if (!uid) return;
    if (this.ctx.getWebSockets(uid).some(o => o !== ws && o.readyState === 1)) return; // 同一人另一個連線還在
    if (this.phase !== 'play') { this.lobby = this.lobby.filter(p => p.uid !== uid); this.resetCountdown(); this.broadcast(this.lobbyMsg()); return; }
    const p = this.gamePlayer(uid); if (p && this.alive(p)) { this.stopPlayer(p); this.gone.set(uid, this.now()); } // 斷線：角色停住，寬限期後判出局
  }
  resetCountdown() { if (this.lobby.length < MIN_PLAYERS) this.countdownAt = 0; }
  ensureTimer() { if (!this.timer) this.timer = setInterval(() => { try { this.tick(); } catch (e) { console.error('tick', e); } }, TICK_MS); }
  stopTimer() { if (this.timer) clearInterval(this.timer); this.timer = null; }
  startGame() {
    const seed = crypto.getRandomValues(new Uint32Array(1))[0] || 1;
    this.game = this.newGame(seed);
    this.lobby = []; this.phase = 'play'; this.result = null; this.gone.clear();
    for (const ws of this.sockets()) { const p = this.gamePlayer(this.who(ws).uid); this.send(ws, { t: 'start', me: p ? p.id : null, s: this.core.snapshot(this.game) }); }
    for (const p of this.gamePlayers()) if (!this.ctx.getWebSockets(p.uid).length) this.gone.set(p.uid, this.now());
  }
  kickIdle(now) { // 進行中的對局不踢（一局最長 3 分鐘），其餘階段超過 IDLE_MS 沒動作就請出去
    for (const ws of this.sockets()) {
      const { uid } = this.who(ws); if (!uid) continue;
      if (!this.active.has(uid)) this.active.set(uid, now);
      if (now - this.active.get(uid) >= IDLE_MS) { this.active.delete(uid); try { ws.close(4001, '閒置太久'); } catch {} }
    }
  }
  tick() {
    const now = this.now(), n = this.sockets().length;
    this.maybeNotify(now);
    if (this.phase !== 'play') this.kickIdle(now);
    if (this.phase === 'lobby') {
      if (this.lobby.length >= MIN_PLAYERS && this.countdownAt && now >= this.countdownAt) return this.startGame();
      if (!this.lobby.length && !n) return this.stopTimer(); // 沒人：讓 DO 休眠
    } else if (this.phase === 'play') {
      if (!n) { this.phase = 'lobby'; this.game = null; this.lobby = []; this.gone.clear(); return this.stopTimer(); } // 全部離線：直接收掉這局
      for (const [uid, at] of this.gone) if (now - at >= GRACE_MS) { const p = this.gamePlayer(uid); if (p) this.expire(p); this.gone.delete(uid); }
      const ev = this.core.step(this.game, TICK_MS / 1000);
      this.broadcast({ t: 's', s: this.frame(), ev });
      if (this.game.over) {
        this.result = this.game.result; this.phase = 'end'; this.endAt = now + END_MS;
        this.postResult(this.result).catch(e => console.error('sendMessage', e));
        this.reportScores(this.result).catch(e => console.error('reportScores', e));
      }
      return;
    } else if (this.phase === 'end' && now >= this.endAt) {
      this.phase = 'lobby'; this.game = null; this.gone.clear();
      this.countdownAt = this.lobby.length >= MIN_PLAYERS ? now + LOBBY_MS : 0;
    }
    if (now - this.lastPush >= LOBBY_PUSH_MS) { this.lastPush = now; this.broadcast(this.lobbyMsg()); }
  }
  resultText(r) {
    const medal = ['🥇', '🥈', '🥉', '4.'];
    const head = r.winner ? `🏆 ${r.winner.bot ? '🤖' : ''}${r.winner.name} 獲勝` : r.reason === 'time' ? '⏰ 時間到，平手' : '🤝 平手';
    return `🫧 泡泡碰碰島 結果（${r.duration} 秒）\n${head}\n` + r.players.map((p, i) => `${medal[i]} ${p.bot ? '🤖' : ''}${p.name}｜戳破 ${p.kills}${p.survived ? '｜存活' : ''}`).join('\n');
  }
  // 把真人的名次分數送到大廳的總積分看板（大廳 Durable Object 存）；stats 給各遊戲紀錄用
  async reportScores(r) {
    const ns = this.env.LOBBY_ROOM; if (!ns) return;
    const entries = r.players.filter(p => !p.bot && p.uid != null && !String(p.uid).startsWith(GUEST_PREFIX)).map(p => ({ uid: String(p.uid), name: p.name, points: p.out ? 0 : p.points ?? SCORE_POINTS[p.rank - 1] ?? 0, win: this.isWin(r, p), stats: this.recordStats(p) }));
    if (!entries.length) return;
    await ns.get(ns.idFromName('main')).fetch('https://lobby/score', { method: 'POST', body: JSON.stringify({ game: this.gameId, ...this.recordInfo(r), entries }) });
  }
  // 各遊戲紀錄的資料：泡泡島記單場擊敗數；其他遊戲覆寫
  recordStats(p) { return { kills: p.kills }; }
  recordInfo(r) { return {}; }
  async postResult(r) {
    const token = botTokens(this.env)[0];
    if (!r.players.some(p => !p.bot) || !token || !this.env.GROUP_ID) return;
    const text = this.resultText(r);
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ chat_id: this.env.GROUP_ID, text, disable_notification: true }) });
    if (!res.ok) console.error('sendMessage failed', res.status);
  }
}

/* ---------- 泡泡賽車房間：沿用 GameRoom 的大廳、倒數、斷線寬限、掛機踢除，只換規則與輸入 ---------- */
export class KartRoom extends GameRoom {
  constructor(ctx, env) { super(ctx, env); this.core = KartCore; this.gameId = 'kart'; this.votes = new Map(); this.modeVotes = new Map(); this.voteEndsAt = 0; this.track = KartCore.TRACKS[0].id; this.mode = 'item'; }
  gamePlayers() { return this.game?.karts || []; }
  newGame(seed) { return this.core.createGame({ seed, humans: this.lobby, bots: false, track: this.track, mode: this.mode }); }
  // 投票：地圖和模式（道具賽／競速賽）分開計票，只算目前在房間名單裡的人
  voteCounts() { const c = {}; for (const t of this.core.TRACKS) c[t.id] = 0; for (const p of this.lobby) { const v = this.votes.get(p.uid); if (v in c) c[v]++; } return c; }
  modeCounts() { const c = {}; for (const id in this.core.MODES) c[id] = 0; for (const p of this.lobby) { const v = this.modeVotes.get(p.uid); if (v in c) c[v]++; } return c; }
  lobbyMsg() {
    const m = super.lobbyMsg(); m.track = this.track; m.mode = this.mode;
    if (this.phase === 'vote') m.vote = { endsIn: Math.max(0, Math.ceil((this.voteEndsAt - this.now()) / 1000)), counts: this.voteCounts(), modes: this.modeCounts(), tracks: this.core.TRACKS.map(t => ({ id: t.id, name: t.name })) };
    return m;
  }
  // 票多的贏，同票隨機；沒人投就用 fallback
  pickTop(c, fallback) {
    const max = Math.max(...Object.values(c)), top = Object.keys(c).filter(k => c[k] === max);
    return max > 0 || !fallback ? top[Math.floor(crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32 * top.length)] : fallback;
  }
  pickTrack() { return this.pickTop(this.voteCounts()); }
  pickMode() { return this.pickTop(this.modeCounts(), 'item'); } // 沒人選模式就是道具賽
  startGame() { // 大廳倒數結束先投票 VOTE_MS，投完或時間到才開跑
    if (this.phase !== 'vote') { this.phase = 'vote'; this.voteEndsAt = this.now() + VOTE_MS; this.votes.clear(); this.modeVotes.clear(); this.broadcast(this.lobbyMsg()); return; }
    this.track = this.pickTrack(); this.mode = this.pickMode(); super.startGame();
  }
  tick() {
    if (this.phase !== 'vote') return super.tick();
    const now = this.now(); this.maybeNotify(now); this.kickIdle(now);
    if (this.lobby.length < MIN_PLAYERS) { this.phase = 'lobby'; this.countdownAt = 0; this.votes.clear(); this.modeVotes.clear(); this.lastPush = now; return this.broadcast(this.lobbyMsg()); }
    if (now >= this.voteEndsAt || this.lobby.every(p => this.votes.has(p.uid))) return this.startGame(); // 地圖全員投完就開跑，模式可以不投
    if (now - this.lastPush >= LOBBY_PUSH_MS) { this.lastPush = now; this.broadcast(this.lobbyMsg()); }
  }
  async webSocketMessage(ws, raw) {
    if (this.phase === 'vote') {
      let m; try { m = JSON.parse(typeof raw === 'string' ? raw : new TextDecoder().decode(raw)); } catch { return; }
      if (m.t === 'vote') {
        const { uid } = this.who(ws);
        if (!uid || !this.lobby.some(p => p.uid === uid)) return;
        const track = this.core.TRACKS.some(t => t.id === m.track), mode = !!this.core.MODES[m.mode]; // 一則訊息可以只投地圖、只投模式，或兩個都投
        if (!track && !mode) return;
        this.active.set(uid, this.now());
        if ((!mode || this.modeVotes.get(uid) === m.mode) && (!track || this.votes.get(uid) === m.track)) return; // 票沒變就不廣播，重複送票的客戶端不會灌爆房間
        if (mode) this.modeVotes.set(uid, m.mode);
        if (track) this.votes.set(uid, m.track);
        this.broadcast(this.lobbyMsg());
        return;
      }
    }
    return super.webSocketMessage(ws, raw);
  }
  onInput(p, m) { if (m.t === 'in') this.core.setInput(this.game, p.id, { steer: m.steer, drift: m.drift, gas: m.gas, brake: m.brake }); else if (m.t === 'item') this.core.useItem(this.game, p.id); }
  frame() { return this.core.snapshot(this.game, { full: false }); } // 每個 tick 送精簡版，名字、顏色、道具箱座標只在開局（start）送一次
  stopPlayer(p) { this.core.setInput(this.game, p.id, {}); }
  alive(p) { return p.state === 'racing' && !p.done; }
  recordStats(p) { return { time: p.time }; } // 只有完賽的人有 time，其他是 null
  recordInfo(r) { return { track: this.game?.trackId || this.track, mode: this.game?.mode || this.mode }; }
  resultText(r) {
    const medal = ['🥇', '🥈', '🥉', '4.'];
    return `🏎 泡泡賽車 ${this.core.MODES[this.game?.mode || this.mode].label} 結果（${r.laps} 圈）\n` + r.players.map((p, i) => `${medal[i]} ${p.name}｜${p.time != null ? p.time.toFixed(2) + ' 秒' : p.out ? '出局' : '未完賽'}｜${p.points} 分`).join('\n');
  }
}

/* ---------- 泡泡砲戰房間：選隊伍與座位、斷線由電腦接手、地圖投票（3 張手作地圖） ---------- */
const randU32 = () => crypto.getRandomValues(new Uint32Array(1))[0] || 1;
export class ArtilleryRoom extends GameRoom {
  constructor(ctx, env) { super(ctx, env); this.core = ArtilleryCore; this.gameId = 'artillery'; this.votes = new Map(); this.voteEndsAt = 0; this.recipe = ArtilleryCore.RECIPES[0]; this.lost = new Set(); this.chat = new Map(); }
  gamePlayers() { return this.game?.chars.filter(c => c.uid != null) || []; }
  gamePlayer(uid) { return this.lost.has(uid) ? null : super.gamePlayer(uid); } // 斷線超過寬限期的人回來只能觀戰
  newGame(seed) { return this.core.createGame({ seed, recipe: this.recipe, humans: this.lobby, waitReady: true }); }
  frame() { return this.core.snapshot(this.game, { mask: false }); } // 地形只在開局與晚加入時整張送，之後靠爆炸事件更新
  mapIds() { return this.core.RECIPES.map(r => r.id); }
  voteCounts() { const c = {}; for (const id of this.mapIds()) c[id] = 0; for (const p of this.lobby) { const v = this.votes.get(p.uid); if (v in c) c[v]++; } return c; }
  lobbyMsg() {
    const m = super.lobbyMsg(); m.players = this.lobby.map(p => ({ uid: p.uid, name: p.name, color: p.color, team: p.team, seat: p.seat }));
    if (this.phase === 'vote') m.vote = { endsIn: Math.max(0, Math.ceil((this.voteEndsAt - this.now()) / 1000)), counts: this.voteCounts() };
    return m;
  }
  // 指定的座位空著就坐下；沒指定或被占走，就坐到人少那隊的第一個空位
  join(ws, uid, name, m) {
    if (this.phase === 'play') return this.send(ws, { t: 'note', text: '這局進行中，先觀戰' });
    let p = this.lobby.find(q => q.uid === uid);
    if (!p) {
      if (this.lobby.length >= this.core.MAX_PLAYERS) return this.send(ws, { t: 'note', text: `人滿了（${this.core.MAX_PLAYERS} 人），先觀戰` });
      p = { uid, name, color: null, ear: null, eye: null, body: null, blush: null, team: null, seat: null }; this.lobby.push(p);
      if (this.phase === 'lobby' && this.lobby.length === MIN_PLAYERS) this.countdownAt = this.now() + LOBBY_MS;
    }
    if (this.core.COLORS.includes(m.color)) p.color = m.color; if (Object.hasOwn(this.core.EARS, m.ear)) p.ear = m.ear; if (Object.hasOwn(this.core.EYES, m.eye)) p.eye = m.eye; if (this.core.BODIES.includes(m.body)) p.body = m.body; if (this.core.BLUSHES.includes(m.blush)) p.blush = m.blush;
    const free = (t, s) => !this.lobby.some(q => q !== p && q.team === t && q.seat === s), t = Number(m.team), s = Number(m.seat);
    if ((t === 0 || t === 1) && Number.isInteger(s) && s >= 0 && s < this.core.TEAM_SIZE && free(t, s)) { p.team = t; p.seat = s; }
    else if (p.team == null) {
      const size = k => this.lobby.filter(q => q !== p && q.team === k).length, order = size(0) <= size(1) ? [0, 1] : [1, 0];
      for (const k of order) { const i = [0, 1, 2].find(j => free(k, j)); if (i != null) { p.team = k; p.seat = i; break; } }
    }
    if (this.phase === 'lobby' && this.lobby.length >= this.core.MAX_PLAYERS) this.countdownAt = this.now();
    this.broadcast(this.lobbyMsg()); this.ensureTimer();
  }
  startGame() { // 大廳倒數結束先投票 VOTE_MS，投完或時間到才開打
    if (this.phase !== 'vote') {
      this.phase = 'vote'; this.voteEndsAt = this.now() + VOTE_MS; this.votes.clear();
      this.broadcast(this.lobbyMsg());
      return;
    }
    const c = this.voteCounts(), max = Math.max(...Object.values(c)), top = Object.keys(c).filter(k => c[k] === max), pick = top[Math.floor(randU32() / 2 ** 32 * top.length)];
    this.recipe = this.core.recipeById(pick); this.lost.clear(); this.chat.clear();
    super.startGame();
    for (const uid of this.gone.keys()) { const p = this.gamePlayer(uid); if (p) this.stopPlayer(p); } // 開局時不在線的人先交給電腦
  }
  tick() {
    if (this.phase !== 'vote') return super.tick();
    const now = this.now(); this.maybeNotify(now); this.kickIdle(now);
    if (this.lobby.length < MIN_PLAYERS) { this.phase = 'lobby'; this.countdownAt = 0; this.votes.clear(); this.lastPush = now; return this.broadcast(this.lobbyMsg()); }
    if (now >= this.voteEndsAt || this.lobby.every(p => this.votes.has(p.uid))) return this.startGame();
    if (now - this.lastPush >= LOBBY_PUSH_MS) { this.lastPush = now; this.broadcast(this.lobbyMsg()); }
  }
  async webSocketMessage(ws, raw) {
    if (this.phase === 'vote') {
      let m; try { m = JSON.parse(typeof raw === 'string' ? raw : new TextDecoder().decode(raw)); } catch { return; }
      if (m.t === 'vote') {
        const { uid } = this.who(ws);
        if (uid && this.lobby.some(p => p.uid === uid) && this.mapIds().includes(m.map)) { this.votes.set(uid, m.map); this.active.set(uid, this.now()); this.broadcast(this.lobbyMsg()); }
        return;
      }
    }
    return super.webSocketMessage(ws, raw);
  }
  onOpen(ws, user) { // 寬限期內回來：從電腦手上拿回角色
    super.onOpen(ws, user);
    const p = this.phase === 'play' && this.gamePlayer(user.id); if (p && p.alive) this.core.setHuman(this.game, p.id, true);
  }
  onInput(p, m) {
    const g = this.game, C = this.core, item = String(m.item || 'basic');
    if (m.t === 'ready') C.setReady(g, p.id);
    else if (m.t === 'seat') C.moveSeat(g, p.id, Number(m.slot));
    else if (m.t === 'bot') C.toggleBot(g, Number(m.slot));
    else if (m.t === 'move') C.setMove(g, p.id, m.dir);
    else if (m.t === 'jump') C.jump(g, p.id, m.dir);
    else if (m.t === 'aim') C.setAim(g, p.id, { angle: m.angle, power: m.power, item, charging: m.charging });
    else if (m.t === 'buy') C.buy(g, p.id, item);
    else if (m.t === 'refresh') C.refresh(g, p.id);
    else if (m.t === 'use') C.useItem(g, p.id, item, { x: m.x, y: m.y });
    else if (m.t === 'fire') C.fire(g, p.id, { angle: m.angle, power: m.power, item });
    else if (m.t === 'mark' || m.t === 'say') this.teamChat(p, m);
  }
  // 標記與快捷訊息只送給同隊；每人每回合各最多 AR_PER_TURN 次。標記用 mark，因為 ping 是連線保活訊息
  teamChat(p, m) {
    const g = this.game, turn = `${g.round}:${g.idx}:${m.t}`, used = this.chat.get(p.id);
    const n = used && used.turn === turn ? used.n : 0; if (n >= AR_PER_TURN) return; this.chat.set(p.id, { turn, n: n + 1 });
    let out = null;
    if (m.t === 'mark' && AR_PINGS.includes(m.kind) && Number.isFinite(Number(m.x)) && Number.isFinite(Number(m.y))) out = { t: 'mark', kind: m.kind, x: Math.round(Math.max(0, Math.min(this.core.W, Number(m.x)))), y: Math.round(Math.max(-200, Math.min(this.core.H + 40, Number(m.y)))), id: p.id };
    else if (m.t === 'say' && Number.isInteger(m.msg) && m.msg >= 0 && m.msg < AR_SAYS) out = { t: 'say', id: p.id, msg: m.msg };
    if (!out) return;
    const s = JSON.stringify(out);
    for (const ws of this.sockets()) { const c = this.gamePlayer(this.who(ws).uid); if (c && c.team === p.team) { try { ws.send(s); } catch {} } }
  }
  stopPlayer(p) { p.move = 0; this.core.setHuman(this.game, p.id, false); } // 斷線：電腦立刻接手
  expire(p) { this.lost.add(p.uid); } // 寬限期過了：角色繼續由電腦打，這人不再拿回
  alive(p) { return p.alive; }
  isWin(r, p) { return !!p.win; }
  recordStats(p) { return p.kills > 0 ? { kills: p.kills } : null; } // 單場擊敗對手數，0 不記
  resultText(r) {
    const T = this.core.TEAMS, head = r.winnerTeam == null ? '平手' : `${T[r.winnerTeam].name}獲勝`;
    return `泡泡砲戰 結果（${r.rounds} 輪）\n${head}\n` + r.players.map(p => `${T[p.team].name}｜${p.name}${p.bot ? '（電腦）' : ''}｜${p.hp} 血｜${p.points} 分`).join('\n');
  }
}

// /board/games 的空白格式：賽道名稱來自 KartCore.TRACKS。新遊戲在這裡加一個欄位
function emptyGameBoard() {
  return { kart: { laps: KartCore.LAPS, tracks: KartCore.TRACKS.map(t => ({ id: t.id, name: t.name, top: [], hard: [], speed: [], speedHard: [] })) }, bubble: { kills: [] }, artillery: { kills: [] } };
}

/* ---------- 大廳（可走動、多人同場；位置由各自的瀏覽器回報，伺服器只做範圍限制與廣播） ---------- */
const LOBBY = { W: 18, H: 20, MAX: 40, PUSH_MS: 100, MIN_GAP_MS: 40, GHOST_MS: 10 * 60 * 1000, GAMES: ['bubble', 'kart', 'artillery'] }; // GHOST_MS：進遊戲的人離開大廳後，角色留在原地並標示「遊戲中」的最長時間
export class LobbyRoom {
  constructor(ctx, env) { this.ctx = ctx; this.env = env; this.timer = null; this.dirty = false; this.lastMsg = new Map(); this.active = new Map(); this.ghosts = new Map(); this.lastRecord = new Map(); this.now = () => Date.now(); }
  async fetch(req) {
    const path = new URL(req.url).pathname;
    // /score 只有其他 Durable Object 會呼叫，/record 只有 Worker 驗過單人賽的票才呼叫（公開路由都不轉送這兩個路徑）；/board 是公開唯讀
    if (path === '/score' && req.method === 'POST') { await this.addScores(await req.json().catch(() => null)); return new Response('ok'); }
    if (path === '/record' && req.method === 'POST') return this.addSoloRecord(await req.json().catch(() => null));
    if (path === '/board') return Response.json(await this.board());
    if (path === '/board/games') return Response.json(await this.gameBoard());
    if (path === '/rooms' && req.method === 'POST') { await this.setRoom(await req.json().catch(() => null)); return new Response('ok'); }
    let user = null; try { user = JSON.parse(decodeURIComponent(req.headers.get('X-TG-User') || '')); } catch {}
    if (!user?.id) return new Response('unauthorized', { status: 401 });
    if (this.ctx.getWebSockets().filter(w => !this.ctx.getWebSockets(user.id).includes(w)).length >= LOBBY.MAX) return new Response('lobby full', { status: 503 });
    const pair = new WebSocketPair(), [client, server] = Object.values(pair);
    for (const old of this.ctx.getWebSockets(user.id)) { try { old.close(4000, '已在其他視窗開啟'); } catch {} }
    this.ctx.acceptWebSocket(server, [user.id]);
    // 出生在大廳下方中間附近，避免所有人疊在同一格
    server.serializeAttachment({ uid: user.id, name: user.name, color: Core.COLORS[0], ear: 'be', eye: 'dot', body: Core.BODIES[0], blush: Core.BLUSHES[0], x: LOBBY.W / 2 + (Math.random() - .5) * 3, y: LOBBY.H - 1.5, f: 0 });
    this.onOpen(server, user);
    this.send(server, { t: 'rooms', rooms: await this.loadRooms() });
    return new Response(null, { status: 101, webSocket: client });
  }
  who(ws) { try { return ws.deserializeAttachment() || {}; } catch { return {}; } }
  sockets() { return this.ctx.getWebSockets().filter(ws => ws.readyState === 1 || ws.readyState === undefined); }
  send(ws, o) { try { ws.send(JSON.stringify(o)); } catch {} }
  // 各遊戲房間的狀態（遊戲房間主動通知）；存起來，大廳休眠醒來後還能顯示
  async loadRooms() { if (!this.rooms) this.rooms = (await this.ctx.storage?.get('rooms')) || {}; return this.rooms; }
  async setRoom(body) {
    if (!body || !/^[a-z]{1,16}$/.test(body.game || '') || typeof body.status !== 'object') return;
    const n = v => (Number.isFinite(Number(v)) ? Number(v) : null), st = body.status;
    const rooms = await this.loadRooms();
    rooms[body.game] = { phase: String(st.phase || 'lobby').slice(0, 8), players: n(st.players) ?? 0, max: n(st.max) ?? 4, startsAt: n(st.startsAt), endsAt: n(st.endsAt), watching: n(st.watching) ?? 0, at: n(st.at) ?? this.now() };
    await this.ctx.storage?.put('rooms', rooms);
    const msg = JSON.stringify({ t: 'rooms', rooms }); for (const ws of this.sockets()) { try { ws.send(msg); } catch {} }
  }
  // 總積分：每位玩家一筆 SCORE_PREFIX + uid，累計分數、場數、冠軍次數
  async addScores(body) {
    if (!body || !Array.isArray(body.entries)) return;
    const st = this.ctx.storage;
    for (const e of body.entries.slice(0, 8)) {
      if (!e?.uid) continue;
      const key = SCORE_PREFIX + String(e.uid), cur = (await st.get(key)) || { name: '玩家', points: 0, games: 0, wins: 0 };
      cur.name = String(e.name || cur.name).slice(0, 12); cur.points += Math.max(0, Math.min(10, Number(e.points) || 0)); cur.games += 1; cur.wins += e.win ? 1 : 0;
      await st.put(key, cur);
    }
    await this.addRecords(body);
    this.boardCache = null; this.gameCache = null;
  }
  // 單人賽紀錄：只更新各遊戲紀錄，不加總積分。回傳這位玩家在前 RECORD_TOP 名的名次（不在榜上是 null）與目前榜單
  async addSoloRecord(body) {
    if (!body || !['kart', 'bubble', 'artillery'].includes(body.game) || !Array.isArray(body.entries) || body.entries.length !== 1) return Response.json({ error: 'body' }, { status: 400 });
    const uid = String(body.entries[0]?.uid || ''), now = this.now();
    if (now - (this.lastRecord.get(uid) || -Infinity) < RECORD_GAP_MS) return Response.json({ error: 'too many' }, { status: 429 });
    this.lastRecord.set(uid, now);
    const [res] = await this.addRecords(body); this.gameCache = null;
    if (!res) return Response.json({ error: 'time' }, { status: 422 });
    const top = ((await this.ctx.storage.get(res.key)) || []).map((x, i) => (body.game === 'kart' ? { rank: i + 1, name: x.name, time: x.v } : { rank: i + 1, name: x.name, kills: x.v }));
    return Response.json({ ok: true, rank: res.rank, improved: res.improved, top });
  }
  // 各遊戲紀錄：驗證後更新前 RECORD_TOP 名。訪客與電腦在 reportScores 已濾掉，這裡再擋一次訪客
  // 回傳每筆的 { key, uid, improved（比榜上自己的舊紀錄好，或原本不在榜上）, rank（寫入後在榜上的名次，沒上榜是 null） }
  async addRecords(body) {
    const rows = [];
    for (const e of body.entries.slice(0, 8)) {
      if (!e?.uid || String(e.uid).startsWith(GUEST_PREFIX) || !e.stats || typeof e.stats !== 'object') continue;
      const name = String(e.name || '玩家').trim().slice(0, 12) || '玩家';
      if (body.game === 'kart') {
        const t = Number(e.stats.time);
        if (e.stats.time == null || !Number.isFinite(t) || t < KART_MIN_TIME || t > KartCore.MAX_TIME) continue;
        if (!KartCore.TRACKS.some(tr => tr.id === body.track)) return [];
        rows.push({ key: `${RECORD_PREFIX}kart:${body.track}${body.mode === 'speed' ? ':speed' : ''}${body.diff === 'hard' ? ':hard' : ''}`, uid: String(e.uid), name, v: Math.round(t * 100) / 100, low: true });
      } else if (body.game === 'artillery') {
        const k = Number(e.stats.kills);
        if (!Number.isInteger(k) || k < 1 || k > 5) continue;
        rows.push({ key: `${RECORD_PREFIX}artillery:kills`, uid: String(e.uid), name, v: k, low: false });
      } else if (body.game === 'bubble') {
        const k = Number(e.stats.kills);
        if (!Number.isInteger(k) || k < 1 || k > 50) continue;
        rows.push({ key: `${RECORD_PREFIX}bubble:kills`, uid: String(e.uid), name, v: k, low: false });
      }
    }
    const st = this.ctx.storage, at = this.now(), out = [];
    for (const r of rows) {
      let list = (await st.get(r.key)) || [];
      const old = list.find(x => x.uid === r.uid), improved = !(old && (r.low ? old.v <= r.v : old.v >= r.v)); // 沒有比自己的舊紀錄好就不動
      if (improved) {
        const next = list.filter(x => x.uid !== r.uid).concat({ uid: r.uid, name: r.name, v: r.v, at });
        next.sort((a, b) => (r.low ? a.v - b.v : b.v - a.v) || a.at - b.at); // 同成績先達成的排前面
        list = next.slice(0, RECORD_TOP); await st.put(r.key, list);
      }
      const i = list.findIndex(x => x.uid === r.uid);
      out.push({ key: r.key, uid: r.uid, improved, rank: i >= 0 ? i + 1 : null });
    }
    return out;
  }
  async gameBoard() {
    if (this.gameCache && this.now() - this.gameAt < 10000) return this.gameCache;
    const st = this.ctx.storage, out = emptyGameBoard();
    for (const t of out.kart.tracks) {
      t.top = ((await st.get(`${RECORD_PREFIX}kart:${t.id}`)) || []).map((x, i) => ({ rank: i + 1, name: x.name, time: x.v }));
      t.hard = ((await st.get(`${RECORD_PREFIX}kart:${t.id}:hard`)) || []).map((x, i) => ({ rank: i + 1, name: x.name, time: x.v }));
      t.speed = ((await st.get(`${RECORD_PREFIX}kart:${t.id}:speed`)) || []).map((x, i) => ({ rank: i + 1, name: x.name, time: x.v }));
      t.speedHard = ((await st.get(`${RECORD_PREFIX}kart:${t.id}:speed:hard`)) || []).map((x, i) => ({ rank: i + 1, name: x.name, time: x.v }));
    }
    out.bubble.kills = ((await st.get(`${RECORD_PREFIX}bubble:kills`)) || []).map((x, i) => ({ rank: i + 1, name: x.name, kills: x.v }));
    out.artillery.kills = ((await st.get(`${RECORD_PREFIX}artillery:kills`)) || []).map((x, i) => ({ rank: i + 1, name: x.name, kills: x.v }));
    this.gameCache = out; this.gameAt = this.now();
    return out;
  }
  async board() {
    if (this.boardCache && this.now() - this.boardAt < 10000) return this.boardCache;
    const all = [...(await this.ctx.storage.list({ prefix: SCORE_PREFIX })).values()];
    all.sort((a, b) => b.points - a.points || b.wins - a.wins || a.games - b.games);
    this.boardCache = { players: all.length, top: all.slice(0, 20).map((p, i) => ({ rank: i + 1, name: p.name, points: p.points, games: p.games, wins: p.wins })) }; this.boardAt = this.now();
    return this.boardCache;
  }
  snapshot() {
    const r3 = v => Math.round(v * 1000) / 1000, live = this.sockets().map(ws => this.who(ws)).filter(p => p.uid), ids = new Set(live.map(p => p.uid));
    const ghosts = [...this.ghosts.values()].filter(g => !ids.has(g.uid));
    return { t: 'snap', players: [...live, ...ghosts].map(p => ({ id: p.uid, name: p.name, color: p.color, ear: p.ear, eye: p.eye || 'dot', body: p.body || Core.BODIES[0], blush: p.blush || Core.BLUSHES[0], x: r3(p.x), y: r3(p.y), f: r3(p.f), ...(p.playing ? { st: 'play' } : {}) })) };
  }
  onOpen(ws, user) { this.ghosts.delete(user.id); this.active.set(user.id, this.now()); this.send(ws, { t: 'hello', you: user.id, W: LOBBY.W, H: LOBBY.H }); this.dirty = true; this.ensureTimer(); }
  async webSocketMessage(ws, raw) {
    let m; try { m = JSON.parse(typeof raw === 'string' ? raw : new TextDecoder().decode(raw)); } catch { return; }
    const a = this.who(ws); if (!a.uid) return;
    if (m.t === 'ping') return this.send(ws, { t: 'pong', at: m.at });
    const now = this.now();
    if (m.t === 'pos') {
      if (now - (this.lastMsg.get(a.uid) || 0) < LOBBY.MIN_GAP_MS) return; this.lastMsg.set(a.uid, now);
      const x = Number(m.x), y = Number(m.y), f = Number(m.f);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      const nx = Math.max(.5, Math.min(LOBBY.W - .5, x)), ny = Math.max(.5, Math.min(LOBBY.H - .5, y)), nf = Number.isFinite(f) ? f : a.f;
      if (Math.hypot(nx - a.x, ny - a.y) < .05 && nf === a.f) return; // 原地回報不算操作，也不用重新廣播
      this.active.set(a.uid, now); a.x = nx; a.y = ny; a.f = nf;
    } else if (m.t === 'look') {
      this.active.set(a.uid, now);
      if (Core.COLORS.includes(m.color)) a.color = m.color; if (Object.hasOwn(Core.EARS, m.ear)) a.ear = m.ear; if (Object.hasOwn(Core.EYES, m.eye)) a.eye = m.eye; if (Core.BODIES.includes(m.body)) a.body = m.body; if (Core.BLUSHES.includes(m.blush)) a.blush = m.blush;
    } else if (m.t === 'playing') {
      if (!LOBBY.GAMES.includes(m.game)) return;
      this.active.set(a.uid, now); a.playing = m.game;
    } else return;
    ws.serializeAttachment(a); this.dirty = true;
  }
  async webSocketClose(ws) {
    const a = this.who(ws);
    if (a.playing && a.uid && !this.ctx.getWebSockets(a.uid).some(w => w !== ws && w.readyState === 1)) this.ghosts.set(a.uid, { ...a, until: this.now() + LOBBY.GHOST_MS });
    this.dirty = true;
  }
  async webSocketError(ws) { this.dirty = true; }
  tick() {
    const socks = this.sockets(); if (!socks.length) { this.stopTimer(); return; }
    const now = this.now();
    for (const [uid, g] of this.ghosts) if (g.until <= now) { this.ghosts.delete(uid); this.dirty = true; }
    for (const ws of socks) {
      const { uid } = this.who(ws); if (!uid) continue;
      if (!this.active.has(uid)) this.active.set(uid, now);
      if (now - this.active.get(uid) >= IDLE_MS) { this.active.delete(uid); try { ws.close(4001, '閒置太久'); } catch {} }
    }
    if (!this.dirty) return; this.dirty = false;
    const s = JSON.stringify(this.snapshot()); for (const ws of this.sockets()) { try { ws.send(s); } catch {} }
  }
  ensureTimer() { if (!this.timer) this.timer = setInterval(() => { try { this.tick(); } catch (e) { console.error('lobby tick', e); } }, LOBBY.PUSH_MS); }
  stopTimer() { if (this.timer) clearInterval(this.timer); this.timer = null; }
}

// Worker 模組只能匯出函式或 handler 物件，常數掛在類別上給測試讀
GameRoom.IDLE_MS = LobbyRoom.IDLE_MS = IDLE_MS;
KartRoom.VOTE_MS = VOTE_MS;
LobbyRoom.LOBBY = LOBBY;
