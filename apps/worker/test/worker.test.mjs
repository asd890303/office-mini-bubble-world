import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { verifyInitData, verifyInitDataAny, botTokens, GameRoom, KartRoom, ArtilleryRoom, LobbyRoom, signSession, readSession, resolveUser, verifyTelegramIdToken, resetJwksCache, kartMinTime } from '../worker.js';
import * as KartCore from '../../../games/kart-island/kart-core.js';
const { LOBBY, IDLE_MS } = LobbyRoom;
import * as Bundle from '../../../deploy/dist/worker.bundle.js';

const TOKEN = '123456:FAKE-test-token';
function makeInitData(token, user, authDate = Math.floor(Date.now() / 1000), extra = {}) {
  const fields = { auth_date: String(authDate), query_id: 'AAE1', user: JSON.stringify(user), ...extra };
  const dcs = Object.keys(fields).sort().map(k => `${k}=${fields[k]}`).join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(token).digest();
  const hash = crypto.createHmac('sha256', secret).update(dcs).digest('hex');
  return new URLSearchParams({ ...fields, hash }).toString();
}

test('initData HMAC: valid / wrong token / tampered / expired', async () => {
  const u = { id: 42, first_name: '小明' }, d = makeInitData(TOKEN, u);
  const ok = await verifyInitData(d, TOKEN);
  assert.equal(ok.ok, true); assert.equal(ok.user.id, 42);
  assert.equal((await verifyInitData(d, '999:other')).ok, false);
  assert.equal((await verifyInitData(d.replace('42', '43'), TOKEN)).ok, false);
  assert.equal((await verifyInitData(makeInitData(TOKEN, u, Math.floor(Date.now() / 1000) - 90000), TOKEN)).error, 'expired');
  assert.equal((await verifyInitData('', TOKEN)).ok, false);
  assert.equal((await Bundle.verifyInitData(d, TOKEN)).ok, true, 'bundle works too');
});

// Fake Durable Object runtime (hibernation API surface)
function fakeRoom(Room = GameRoom, envExtra = {}) {
  const socks = [], sent = [];
  const ctx = { acceptWebSocket(ws, tags) { ws.tags = tags; socks.push(ws); }, getWebSockets(tag) { return socks.filter(w => w.readyState === 1 && (!tag || w.tags.includes(tag))); } };
  const fetches = [];
  globalThis.fetch = async (url, o) => { fetches.push({ url: String(url).replace(/bot[^/]+/, 'bot<T>'), body: JSON.parse(o.body) }); return { ok: true, status: 200 }; };
  const room = new Room(ctx, { BOT_TOKEN: TOKEN, GROUP_ID: '-1004494276417', ...envExtra });
  let now = 1_000_000; room.now = () => now; room.ensureTimer = () => {}; // drive ticks manually
  const connect = (uid, name) => {
    const ws = { readyState: 1, out: [], att: null, send(s) { this.out.push(JSON.parse(s)); }, close() { this.readyState = 3; }, serializeAttachment(a) { this.att = a; }, deserializeAttachment() { return this.att; } };
    ctx.acceptWebSocket(ws, [uid]); ws.serializeAttachment({ uid, name }); room.onOpen(ws, { id: uid, name }); return ws;
  };
  const msg = (ws, o) => room.webSocketMessage(ws, JSON.stringify(o));
  return { room, connect, msg, fetches, adv: ms => { now += ms; }, tick: (k = 1) => { for (let i = 0; i < k; i++) { now += 50; room.tick(); } } };
}

test('room: lobby → countdown → play (humans only) → end → ranking posted → lobby', async () => {
  const R = fakeRoom();
  const a = R.connect('1', 'Alice'), b = R.connect('2', 'Bob');
  assert.equal(a.out[0].t, 'hello');
  await R.msg(a, { t: 'join', color: '#a8d8ff', ear: 'fe' }); await R.msg(b, { t: 'join' });
  assert.equal(R.room.lobby.length, 2); assert.equal(R.room.phase, 'lobby');
  R.adv(19000); R.tick(); assert.equal(R.room.phase, 'lobby');
  R.adv(1500); R.tick(); assert.equal(R.room.phase, 'play');
  const st = a.out.find(m => m.t === 'start'); assert.equal(st.me, 0); assert.equal(st.s.players.length, 2, 'no bots online');
  await R.msg(a, { t: 'in', d: [1, 0] }); assert.deepEqual(R.room.game.players[0].input, [1, 0]);
  await R.msg(a, { t: 'bomb' });
  // late joiner spectates
  const c = R.connect('3', 'Carol'); await R.msg(c, { t: 'join' });
  assert.ok(c.out.some(m => m.t === 'note')); assert.ok(c.out.some(m => m.t === 'start' && m.me === null));
  // Bob disconnects → character stops, no AI; reconnects within grace → keeps playing
  b.readyState = 3; R.room.onLeave(b);
  assert.equal(R.room.game.players[1].human, true); assert.equal(R.room.game.players[1].ai, null); assert.ok(R.room.gone.has('2'));
  const b2 = R.connect('2', 'Bob'); assert.equal(R.room.gone.has('2'), false);
  let k = 0; while (R.room.phase === 'play' && k++ < 5000) R.tick();
  assert.equal(R.room.phase, 'end');
  assert.ok(a.out.some(m => m.t === 's' && m.ev.some(e => e.e === 'end')));
  await new Promise(r => setTimeout(r, 10));
  assert.equal(R.fetches.length, 1); assert.equal(R.fetches[0].body.chat_id, '-1004494276417');
  assert.match(R.fetches[0].body.text, /泡泡碰碰島 結果/); assert.match(R.fetches[0].body.text, /Alice/);
  await R.msg(c, { t: 'join' }); assert.equal(R.room.lobby.length, 1); // join during end → next lobby
  R.adv(8100); R.tick(); assert.equal(R.room.phase, 'lobby'); assert.equal(R.room.countdownAt, 0, 'one player waits for a second');
  await R.msg(a, { t: 'join' }); assert.ok(R.room.countdownAt > 0);
});

test('room: 4 joins start immediately; 5th is told room is full; everyone leaving ends the game silently', async () => {
  const R = fakeRoom();
  const ws = ['1', '2', '3', '4', '5'].map(u => R.connect(u, 'p' + u));
  for (const w of ws.slice(0, 4)) await R.msg(w, { t: 'join' });
  await R.msg(ws[4], { t: 'join' }); assert.ok(ws[4].out.some(m => m.t === 'note' && /已滿/.test(m.text)));
  R.tick(); assert.equal(R.room.phase, 'play');
  for (const w of ws) { w.readyState = 3; R.room.onLeave(w); }
  R.tick(); assert.equal(R.room.phase, 'lobby', 'everyone left → back to idle lobby');
  assert.equal(R.fetches.length, 0);
});

test('room: one player never starts a game; countdown needs 2 and resets when one leaves', async () => {
  const R = fakeRoom();
  const a = R.connect('1', 'Alice'), b = R.connect('2', 'Bob');
  await R.msg(a, { t: 'join' });
  assert.equal(R.room.countdownAt, 0);
  R.adv(60000); R.tick(); assert.equal(R.room.phase, 'lobby', 'alone in lobby → no game');
  assert.equal(R.room.lobbyMsg().countdown, null);
  await R.msg(b, { t: 'join' }); assert.ok(R.room.countdownAt > 0);
  await R.msg(b, { t: 'leave' }); assert.equal(R.room.countdownAt, 0);
  R.adv(60000); R.tick(); assert.equal(R.room.phase, 'lobby');
});

test('room: disconnected player is ruled out after the grace period', async () => {
  const R = fakeRoom();
  const a = R.connect('1', 'Alice'), b = R.connect('2', 'Bob');
  await R.msg(a, { t: 'join' }); await R.msg(b, { t: 'join' });
  R.adv(20000); R.tick(); assert.equal(R.room.phase, 'play');
  b.readyState = 3; R.room.onLeave(b);
  R.tick(150); assert.notEqual(R.room.game?.players[1].state, 'dead', 'still within grace');
  R.tick(60);
  assert.equal(R.room.phase, 'end', 'Bob forfeits → Alice is the last one standing');
  assert.equal(R.room.result.winner.name, 'Alice');
});

// 大廳：可走動、多人同場
function fakeLobby() {
  const socks = [];
  const ctx = { acceptWebSocket(ws, tags) { ws.tags = tags; socks.push(ws); }, getWebSockets(tag) { return socks.filter(w => w.readyState === 1 && (!tag || w.tags.includes(tag))); } };
  const room = new LobbyRoom(ctx, {}); let now = 1_000_000; room.now = () => now; room.ensureTimer = () => {};
  const connect = (uid, name) => {
    const ws = { readyState: 1, out: [], att: null, send(s) { this.out.push(JSON.parse(s)); }, close() { this.readyState = 3; }, serializeAttachment(a) { this.att = a; }, deserializeAttachment() { return this.att; } };
    ctx.acceptWebSocket(ws, [uid]); ws.serializeAttachment({ uid, name, color: '#ffb3c7', ear: 'be', x: 10, y: 10, f: 0 }); room.onOpen(ws, { id: uid, name }); return ws;
  };
  const msg = (ws, o) => room.webSocketMessage(ws, JSON.stringify(o));
  return { room, connect, msg, adv: ms => { now += ms; } };
}

test('lobby: players see each other; positions are clamped; bad input ignored', async () => {
  const L = fakeLobby(), a = L.connect('1', 'Alice'), b = L.connect('2', 'Bob');
  assert.equal(a.out[0].t, 'hello'); assert.equal(a.out[0].W, LOBBY.W);
  L.room.tick(); const snap = a.out.findLast(m => m.t === 'snap'); assert.equal(snap.players.length, 2);
  await L.msg(a, { t: 'pos', x: 999, y: -5, f: 1.5 });
  L.room.tick(); const p = b.out.findLast(m => m.t === 'snap').players.find(q => q.id === '1');
  assert.equal(p.x, LOBBY.W - .5); assert.equal(p.y, .5); assert.equal(p.f, 1.5);
  L.adv(100); await L.msg(a, { t: 'pos', x: 'abc', y: 3 }); assert.equal(a.att.x, LOBBY.W - .5, 'non-numeric position is dropped');
  L.adv(100); await L.msg(a, { t: 'pos', x: 5, y: 5, f: 0 }); await L.msg(a, { t: 'pos', x: 6, y: 6, f: 0 });
  assert.equal(a.att.x, 5, 'messages faster than the min gap are dropped');
});

test('lobby: look validates color/ear; leaving removes the player; idle tick sends nothing', async () => {
  const L = fakeLobby(), a = L.connect('1', 'Alice'), b = L.connect('2', 'Bob');
  await L.msg(a, { t: 'look', color: '#a8d8ff', ear: 'fe' }); assert.equal(a.att.color, '#a8d8ff'); assert.equal(a.att.ear, 'fe');
  await L.msg(a, { t: 'look', color: 'red', ear: 'wings' }); assert.equal(a.att.color, '#a8d8ff', 'invalid look ignored'); assert.equal(a.att.ear, 'fe');
  L.room.tick(); const n = b.out.length; L.room.tick(); assert.equal(b.out.length, n, 'nothing changed, nothing sent');
  a.readyState = 3; await L.room.webSocketClose(a); L.room.tick();
  assert.deepEqual(b.out.findLast(m => m.t === 'snap').players.map(q => q.id), ['2']);
  await L.msg(b, { t: 'ping', at: 7 }); assert.deepEqual(b.out.at(-1), { t: 'pong', at: 7 });
});

test('bundle: exports the lobby room and serves hub, shared files and game pages', async () => {
  assert.equal(typeof Bundle.LobbyRoom, 'function');
  const env = {}; const get = async path => Bundle.default.fetch(new Request('https://x.test' + path), env);
  for (const [path, type] of [['/', 'text/html'], ['/bubble/', 'text/html'], ['/shared/theme.css', 'text/css'], ['/shared/avatar.js', 'text/javascript'], ['/shared/three-kit.js', 'text/javascript'], ['/bubble/game-core.js', 'text/javascript']]) {
    const r = await get(path); assert.equal(r.status, 200, path); assert.ok(r.headers.get('content-type').startsWith(type), path);
  }
  const r = await Bundle.default.fetch(new Request('https://x.test/bubble'), env); assert.equal(r.status, 301); assert.equal(r.headers.get('location'), 'https://x.test/bubble/');
  assert.equal((await get('/nope')).status, 404);
  assert.equal((await Bundle.default.fetch(new Request('https://x.test/lobby/ws'), env)).status, 426, 'lobby ws needs an upgrade');
});

test('initData: several bot tokens — any matching bot passes, unknown bot fails', async () => {
  const u = { id: 7, first_name: 'Amy' }, A = '111:AAA', B = '222:BBB';
  assert.deepEqual(botTokens({ BOT_TOKEN: ` ${A} , ${B},, ` }), [A, B]); assert.deepEqual(botTokens({}), []);
  assert.equal((await verifyInitDataAny(makeInitData(B, u), [A, B])).ok, true, 'signed by the second bot');
  assert.equal((await verifyInitDataAny(makeInitData(A, u), [A, B])).ok, true, 'signed by the first bot');
  assert.equal((await verifyInitDataAny(makeInitData('333:CCC', u), [A, B])).ok, false);
  assert.equal((await verifyInitDataAny(makeInitData(A, u), [])).ok, false, 'no token configured');
});

test('lobby: 10 minutes without moving kicks the player; heartbeats do not count, movement does', async () => {
  const L = fakeLobby(), a = L.connect('1', 'Alice'), b = L.connect('2', 'Bob');
  a.close = function (code) { this.readyState = 3; this.closeCode = code; }; b.close = a.close;
  for (let i = 0; i < 6; i++) { L.adv(IDLE_MS / 6 - 1000); await L.msg(b, { t: 'pos', x: b.att.x, y: b.att.y, f: 0 }); await L.msg(a, { t: 'pos', x: 4 + i, y: 4, f: 0 }); L.room.tick(); }
  assert.equal(a.readyState, 1, 'Alice kept moving');
  assert.equal(b.readyState, 1, 'idle for just under the limit');
  L.adv(IDLE_MS); await L.msg(a, { t: 'pos', x: 1, y: 1, f: 0 }); await L.msg(b, { t: 'pos', x: b.att.x, y: b.att.y, f: 0 }); L.room.tick();
  assert.equal(b.readyState, 3); assert.equal(b.closeCode, 4001, 'Bob: same spot for 10+ minutes');
  assert.equal(a.readyState, 1);
});

test('room: idle in the waiting lobby is kicked after 10 minutes, a running game is never kicked', async () => {
  const R = fakeRoom(); const close = function (code) { this.readyState = 3; this.closeCode = code; };
  const a = R.connect('1', 'Alice'), b = R.connect('2', 'Bob'), c = R.connect('3', 'Cat'); a.close = b.close = c.close = close;
  await R.msg(a, { t: 'join' }); await R.msg(b, { t: 'join' });
  R.adv(21000); R.tick(); assert.equal(R.room.phase, 'play', 'two joined players start');
  R.adv(IDLE_MS + 5000); R.tick(); assert.equal(a.readyState, 1); assert.equal(c.readyState, 1, 'no kicks during play');
  R.room.phase = 'lobby'; R.room.game = null; R.room.lobby = []; R.room.active.set('1', R.room.now()); R.room.active.set('3', R.room.now() - IDLE_MS - 1);
  R.room.tick(); assert.equal(c.readyState, 3); assert.equal(c.closeCode, 4001); assert.equal(a.readyState, 1);
});

test('kart room: lobby → countdown → race with steering and items → result posted → lobby', async () => {
  const R = fakeRoom(KartRoom);
  const a = R.connect('1', 'Alice'), b = R.connect('2', 'Bob');
  await R.msg(a, { t: 'join', color: '#a8d8ff', ear: 'fe' }); await R.msg(b, { t: 'join' });
  R.adv(20500); R.tick(); assert.equal(R.room.phase, 'vote', 'countdown ends in a map vote');
  await R.msg(a, { t: 'vote', track: 'candy' }); await R.msg(b, { t: 'vote', track: 'candy' });
  R.tick(); assert.equal(R.room.phase, 'play', 'everyone voted: start early'); assert.equal(R.room.game.trackId, 'candy');
  const st = a.out.find(m => m.t === 'start'); assert.equal(st.me, 0); assert.equal(st.s.karts.length, 2, 'no bots online'); assert.equal(st.s.karts[0].color, '#a8d8ff');
  R.tick(70); assert.equal(R.room.game.phase, 'race', 'countdown over');
  await R.msg(a, { t: 'in', steer: .5, drift: 1, gas: 1 }); assert.equal(R.room.game.karts[0].steer, .5); assert.equal(R.room.game.karts[0].driftIn, true); assert.equal(R.room.game.karts[0].gas, true);
  R.room.game.karts[1].item = 'shoe'; await R.msg(b, { t: 'item' }); assert.ok(R.room.game.karts[1].shoe > 0, 'item used');
  assert.ok(a.out.some(m => m.t === 's' && Array.isArray(m.s.karts)), 'snapshots broadcast');
  const fr = a.out.findLast(m => m.t === 's').s, back = KartCore.expandFrame(fr, st.s);
  assert.equal(fr.full, 0); assert.equal(fr.karts[0].name, undefined, 'frames skip names and colors'); assert.equal(typeof fr.boxes, 'string', 'boxes as availability bits');
  assert.equal(back.karts[0].name, 'Alice'); assert.equal(back.karts[0].color, '#a8d8ff'); assert.deepEqual(back.boxes.map(x => x.slice(0, 3)), st.s.boxes.map(x => x.slice(0, 3)), 'box positions come from the start snapshot');
  // Bob 斷線：車停住，寬限期後出局
  b.readyState = 3; R.room.onLeave(b); assert.equal(R.room.game.karts[1].steer, 0); assert.ok(R.room.gone.has('2'));
  R.tick(220); assert.equal(R.room.game.karts[1].state, 'out');
  // Alice 一路自動駕駛到終點（讓 AI 開，測試只看房間流程）
  R.room.game.karts[0].human = false; R.room.game.karts[0].ai = null;
  for (let i = 0; i < 6000 && R.room.phase === 'play'; i++) R.tick();
  assert.equal(R.room.phase, 'end');
  const end = a.out.findLast(m => m.t === 's' && m.ev?.some(e => e.e === 'end'));
  assert.ok(end, 'end event sent');
  await new Promise(r => setTimeout(r, 0));
  const post = R.fetches.at(-1); assert.ok(post, 'result posted to the group');
  assert.match(post.body.text, /泡泡賽車 道具賽 結果（3 圈）/); assert.match(post.body.text, /Alice/); assert.match(post.body.text, /Bob｜出局｜0 分/);
  R.adv(9000); R.tick(); assert.equal(R.room.phase, 'lobby');
});

test('bundle serves the kart page and its rules file', async () => {
  for (const path of ['/kart/', '/kart/kart-core.js']) { const r = await Bundle.default.fetch(new Request('https://x.test' + path), {}); assert.equal(r.status, 200, path); }
  assert.equal((await Bundle.default.fetch(new Request('https://x.test/kart/ws'), {})).status, 426, 'kart ws needs an upgrade');
  assert.equal(typeof Bundle.KartRoom, 'function');
});

test('artillery room: seats, map vote, turns, team-only pings, bot takeover on disconnect, result posted', async () => {
  const R = fakeRoom(ArtilleryRoom);
  const a = R.connect('1', 'Alice'), b = R.connect('2', 'Bob'), c = R.connect('3', 'Cat');
  await R.msg(a, { t: 'join', color: '#a8d8ff', ear: 'fe', team: 0, seat: 0 });
  await R.msg(b, { t: 'join', team: 0, seat: 0 }); // 座位被占：改坐人少那隊
  assert.deepEqual(R.room.lobby.map(p => [p.uid, p.team, p.seat]), [['1', 0, 0], ['2', 1, 0]]);
  await R.msg(c, { t: 'join', team: 1, seat: 2 }); await R.msg(c, { t: 'leave' });
  assert.ok(a.out.findLast(m => m.t === 'lobby').players.every(p => 'team' in p && 'seat' in p), 'lobby shows seats');
  R.adv(20500); R.tick(); assert.equal(R.room.phase, 'vote');
  const v = a.out.findLast(m => m.t === 'lobby').vote; assert.deepEqual(Object.keys(v.counts), ['plains', 'twin', 'canyon']); assert.equal(v.gen, undefined, 'no generated map');
  await R.msg(a, { t: 'vote', map: 'twin' }); await R.msg(b, { t: 'vote', map: 'twin' });
  R.tick(); assert.equal(R.room.phase, 'play'); assert.equal(R.room.game.recipe.id, 'twin');
  const st = a.out.find(m => m.t === 'start'); assert.equal(st.me, 0); assert.ok(Array.isArray(st.s.mask), 'start carries the full terrain');
  assert.equal(st.s.chars.filter(c => c.human).length, 2); assert.equal(st.s.chars.length, 6, 'empty seats are bots');
  assert.equal(b.out.find(m => m.t === 'start').me, 3, 'Bob is blue seat 0');
  R.tick(); const fr = a.out.findLast(m => m.t === 's'); assert.equal(fr.s.mask, undefined, 'frames skip the terrain');
  // 提示窗：兩個真人都按就緒才開始第 1 輪
  const g = R.room.game; assert.equal(g.phase, 'ready'); assert.equal(fr.s.readyT > 0, true);
  // 就緒畫面調隊伍：任何人都能切空位的電腦，換座位只能換自己
  await R.msg(a, { t: 'bot', slot: 1 }); assert.equal(g.chars[1].off, true);
  await R.msg(a, { t: 'seat', slot: 1 }); assert.equal(g.chars[1].uid, '1'); assert.equal(g.chars[0].off, true);
  await R.msg(a, { t: 'seat', slot: 3 }); assert.equal(g.chars[3].uid, '2', 'cannot take Bob\'s seat');
  await R.msg(a, { t: 'seat', slot: 0 }); assert.equal(g.chars[0].uid, '1');
  await R.msg(b, { t: 'bot', slot: 1 }); assert.equal(g.chars[1].off, false); assert.equal(g.chars[1].alive, true);
  R.tick(); assert.ok(a.out.findLast(m => m.t === 's').s.chars.every(c => 'off' in c));
  await R.msg(a, { t: 'ready' }); R.tick(5); assert.equal(g.phase, 'ready', 'Bob is not ready yet');
  await R.msg(b, { t: 'ready' }); R.tick(); assert.equal(g.phase, 'turn'); assert.equal(g.round, 1);
  // 輪到 Alice：買、瞄準、發射；Bob 不能代打
  assert.equal(g.cur, 0); g.chars[0].money = 200;
  await R.msg(b, { t: 'fire', angle: 45, power: .5 }); assert.equal(g.fired, false, 'not your turn');
  await R.msg(a, { t: 'buy', item: g.offer[0] }); assert.equal(g.chars[0].items[g.offer[0]], (g.offer[0] === 'nuke' ? 1 : 2));
  await R.msg(a, { t: 'aim', angle: 50, power: .4, item: 'basic' }); assert.equal(g.aim.angle, 50);
  await R.msg(a, { t: 'fire', angle: 50, power: .6, item: 'basic' }); assert.equal(g.fired, true);
  R.tick(); assert.ok(a.out.some(m => m.t === 's' && m.ev.some(e => e.e === 'shot' && e.id === 0)), 'shot broadcast');
  // 標記只給同隊，每回合最多 3 個
  for (let i = 0; i < 5; i++) await R.msg(a, { t: 'mark', kind: 'attack', x: 900, y: 300 });
  await R.msg(a, { t: 'mark', kind: 'bogus', x: 1, y: 1 }); await R.msg(a, { t: 'say', msg: 2 });
  assert.equal(a.out.filter(m => m.t === 'mark').length, 3); assert.equal(b.out.filter(m => m.t === 'mark' || m.t === 'say').length, 0, 'enemy sees nothing');
  assert.equal(a.out.filter(m => m.t === 'say').length, 1);
  // Bob 斷線：電腦接手；寬限期內回來拿回控制
  b.readyState = 3; R.room.onLeave(b); assert.equal(g.chars[3].human, false); assert.ok(R.room.gone.has('2'));
  const b2 = R.connect('2', 'Bob'); assert.equal(g.chars[3].human, true); assert.equal(b2.out.find(m => m.t === 'start').me, 3);
  // 再斷線超過寬限期：角色繼續由電腦打，回來只能觀戰
  b2.readyState = 3; R.room.onLeave(b2); R.tick(220); assert.ok(R.room.lost.has('2')); assert.equal(g.chars[3].human, false);
  const b3 = R.connect('2', 'Bob'); assert.equal(b3.out.find(m => m.t === 'start').me, null); assert.equal(g.chars[3].human, false);
  // Alice 之後都不出手（超時跳過），其餘由電腦打完
  for (let i = 0; i < 60000 && R.room.phase === 'play'; i++) R.tick();
  assert.equal(R.room.phase, 'end');
  await new Promise(r => setTimeout(r, 0));
  const post = R.fetches.at(-1); assert.ok(post, 'result posted'); assert.match(post.body.text, /泡泡砲戰 結果（\d+ 輪）/); assert.match(post.body.text, /Alice/);
  R.adv(9000); R.tick(); assert.equal(R.room.phase, 'lobby');
});

test('artillery room: 6 players start at once; 7th is told the room is full', async () => {
  const R = fakeRoom(ArtilleryRoom), ws = ['1', '2', '3', '4', '5', '6', '7'].map(u => R.connect(u, 'p' + u));
  for (const w of ws) await R.msg(w, { t: 'join' });
  assert.ok(ws[6].out.some(m => m.t === 'note' && /人滿了（6 人）/.test(m.text)));
  assert.deepEqual(R.room.lobby.map(p => `${p.team}${p.seat}`).sort(), ['00', '01', '02', '10', '11', '12'], 'auto seats fill both teams');
  R.tick(); assert.equal(R.room.phase, 'vote');
});

test('bundle serves the artillery page and its rules file', async () => {
  for (const path of ['/artillery/', '/artillery/artillery-core.js']) { const r = await Bundle.default.fetch(new Request('https://x.test' + path), {}); assert.equal(r.status, 200, path); }
  assert.equal((await Bundle.default.fetch(new Request('https://x.test/artillery/ws'), {})).status, 426);
  assert.equal(typeof Bundle.ArtilleryRoom, 'function');
});

test('bundle: every module export is a function or a handler object (Cloudflare rejects other exports)', () => {
  for (const [name, v] of Object.entries(Bundle)) assert.ok(typeof v === 'function' || (name === 'default' && typeof v.fetch === 'function'), `export ${name} is ${typeof v}`);
});

// 大廳的總積分看板要用的假 Durable Object 儲存
const fakeStorage = () => { const m = new Map(); return { async get(k) { return structuredClone(m.get(k)); }, async put(k, v) { m.set(k, structuredClone(v)); }, async list({ prefix = '' } = {}) { return new Map([...m].filter(([k]) => k.startsWith(prefix))); } }; };

test('kart vote: 15 s to pick a map; majority wins; dropping below 2 players returns to the lobby', async () => {
  const R = fakeRoom(KartRoom);
  const a = R.connect('1', 'Alice'), b = R.connect('2', 'Bob'), c = R.connect('3', 'Cat');
  for (const w of [a, b, c]) await R.msg(w, { t: 'join' });
  R.adv(20500); R.tick(); assert.equal(R.room.phase, 'vote');
  const v = a.out.findLast(m => m.t === 'lobby').vote; assert.equal(v.endsIn, 15); assert.deepEqual(v.tracks.map(t => t.id), ['candy', 'lake', 'cloud', 'highway', 'peak', 'thunder']);
  await R.msg(a, { t: 'vote', track: 'lake' }); await R.msg(b, { t: 'vote', track: 'lake' }); await R.msg(c, { t: 'vote', track: 'bogus' });
  assert.deepEqual(a.out.findLast(m => m.t === 'lobby').vote.counts, { candy: 0, lake: 2, cloud: 0, highway: 0, peak: 0, thunder: 0 }, 'invalid map ignored');
  R.adv(10000); R.tick(); assert.equal(R.room.phase, 'vote', 'Cat has not voted yet');
  R.adv(5500); R.tick(); assert.equal(R.room.phase, 'play'); assert.equal(R.room.game.trackId, 'lake');
  assert.equal(a.out.find(m => m.t === 'start').s.track, 'lake');
  // 投票中有人離開，剩 1 人：回到大廳
  const R2 = fakeRoom(KartRoom), p = R2.connect('1', 'A'), q = R2.connect('2', 'B');
  await R2.msg(p, { t: 'join' }); await R2.msg(q, { t: 'join' }); R2.adv(20500); R2.tick(); assert.equal(R2.room.phase, 'vote');
  await R2.msg(q, { t: 'leave' }); R2.tick(); assert.equal(R2.room.phase, 'lobby');
});

test('scores: game rooms report human results; the lobby keeps totals and serves /board', async () => {
  const lobby = new LobbyRoom({ getWebSockets: () => [], acceptWebSocket() {}, storage: fakeStorage() }, {});
  const env = { LOBBY_ROOM: { idFromName: n => n, get: () => ({ fetch: (url, o) => lobby.fetch(new Request(url, o)) }) } };
  const R = fakeRoom(GameRoom, env);
  await R.room.reportScores({ winner: { id: 0 }, players: [{ rank: 1, id: 0, uid: '1', name: 'Alice' }, { rank: 2, id: 1, uid: '2', name: 'Bob' }] });
  const K2 = fakeRoom(KartRoom, env);
  await K2.room.reportScores({ winner: { id: 1 }, players: [{ rank: 1, id: 1, uid: '2', name: 'Bob', points: 5 }, { rank: 2, id: 0, uid: '1', name: 'Alice', points: 3 }, { rank: 3, id: 2, uid: null, name: '麻糬', bot: true, points: 2 }, { rank: 4, id: 3, uid: '9', name: 'Zed', points: 0, out: true }] });
  const board = await (await lobby.fetch(new Request('https://lobby/board'))).json();
  assert.equal(board.players, 3, 'bots are not counted');
  assert.deepEqual(board.top.map(p => [p.name, p.points, p.games, p.wins]).sort(), [['Alice', 8, 2, 1], ['Bob', 8, 2, 1], ['Zed', 0, 1, 0]], 'bubble 5/3 plus kart points; one win each');
  assert.equal(board.top[2].name, 'Zed', 'lowest total last');
  await lobby.addScores({ entries: [{ uid: '1', name: 'Alice', points: 999 }] });
  lobby.boardCache = null; assert.equal((await lobby.board()).top[0].points, 18, 'points per game are capped at 10');
});

test('worker /board: public read; /score is not reachable from outside', async () => {
  const lobby = new LobbyRoom({ getWebSockets: () => [], acceptWebSocket() {}, storage: fakeStorage() }, {});
  await lobby.addScores({ entries: [{ uid: '1', name: 'Alice', points: 5, win: true }] });
  const env = { LOBBY_ROOM: { idFromName: n => n, get: () => ({ fetch: (url, o) => lobby.fetch(new Request(url, o)) }) } };
  const r = await Bundle.default.fetch(new Request('https://x.test/board'), env);
  assert.equal(r.status, 200); assert.equal((await r.json()).top[0].name, 'Alice');
  assert.equal((await Bundle.default.fetch(new Request('https://x.test/score', { method: 'POST', body: '{}' }), env)).status, 404);
  assert.equal((await Bundle.default.fetch(new Request('https://x.test/board'), {})).status, 200, 'no lobby binding: empty board');
});

test('records: kart keeps each track top 3, one best time per player; invalid data dropped', async () => {
  const lobby = new LobbyRoom({ getWebSockets: () => [], acceptWebSocket() {}, storage: fakeStorage() }, {});
  let now = 1000; lobby.now = () => now++;
  const env = { LOBBY_ROOM: { idFromName: n => n, get: () => ({ fetch: (url, o) => lobby.fetch(new Request(url, o)) }) } };
  const K = fakeRoom(KartRoom, env); K.room.track = 'lake';
  await K.room.reportScores({ winner: { id: 0 }, players: [
    { rank: 1, id: 0, uid: '1', name: 'Alice', time: 61.234, points: 5 }, { rank: 2, id: 1, uid: '2', name: 'Bob', time: 65.5, points: 3 },
    { rank: 3, id: 2, uid: null, name: '麻糬', bot: true, time: 40, points: 2 }, { rank: 4, id: 3, uid: 'g:abc', name: '訪客', time: 30, points: 1 },
  ] });
  await K.room.reportScores({ winner: { id: 0 }, players: [{ rank: 1, id: 0, uid: '1', name: 'Alice', time: 70, points: 5 }, { rank: 2, id: 1, uid: '3', name: 'Cat', time: null, points: 3 }] });
  await lobby.addScores({ game: 'kart', track: 'lake', entries: [{ uid: '4', name: '  一二三四五六七八九十一二三  ', points: 3, stats: { time: 63 } }, { uid: '5', name: 'Eve', points: 2, stats: { time: 80 } }] });
  await lobby.addScores({ game: 'kart', track: 'lake', entries: [{ uid: '6', name: 'Fast', points: 5, stats: { time: 2 } }, { uid: '7', name: 'Slow', points: 5, stats: { time: 9999 } }, { uid: '8', name: 'NaN', points: 5, stats: { time: 'x' } }] });
  await lobby.addScores({ game: 'kart', track: 'bogus', entries: [{ uid: '9', name: 'Bad', points: 5, stats: { time: 30 } }] });
  await lobby.addScores({ game: 'kart', track: 'lake', entries: [{ uid: 'g:zz', name: 'Guest', points: 5, stats: { time: 20 } }] });
  const g = await (await lobby.fetch(new Request('https://lobby/board/games'))).json();
  assert.deepEqual(g.kart.tracks.map(t => t.id), ['candy', 'lake', 'cloud', 'highway', 'peak', 'thunder']);
  assert.ok(g.kart.tracks.every(t => typeof t.name === 'string' && t.name));
  const lake = g.kart.tracks.find(t => t.id === 'lake').top;
  assert.deepEqual(lake.map(p => [p.rank, p.name, p.time]), [[1, 'Alice', 61.23], [2, '一二三四五六七八九十一二', 63], [3, 'Bob', 65.5]], 'fastest first, slower Alice run ignored, top 3 cap, name 12 chars');
  assert.ok(g.kart.tracks.filter(t => t.id !== 'lake').every(t => t.top.length === 0), 'bogus track not stored');
  // 自己刷新紀錄：只留一筆，排到第一
  await lobby.addScores({ game: 'kart', track: 'lake', entries: [{ uid: '2', name: 'Bob', points: 5, stats: { time: 50 } }] });
  lobby.gameCache = null;
  const lake2 = (await lobby.gameBoard()).kart.tracks.find(t => t.id === 'lake').top;
  assert.deepEqual(lake2.map(p => p.name), ['Bob', 'Alice', '一二三四五六七八九十一二']);
  assert.equal((await lobby.board()).top.find(p => p.name === 'Alice').points, 10, 'total points unchanged: 5 + 5');
});

test('records: bubble island top 3 single-game kills; worker serves /board/games', async () => {
  const lobby = new LobbyRoom({ getWebSockets: () => [], acceptWebSocket() {}, storage: fakeStorage() }, {});
  let now = 1000; lobby.now = () => now++;
  const env = { LOBBY_ROOM: { idFromName: n => n, get: () => ({ fetch: (url, o) => lobby.fetch(new Request(url, o)) }) } };
  const R = fakeRoom(GameRoom, env);
  await R.room.reportScores({ winner: { id: 0 }, players: [{ rank: 1, id: 0, uid: '1', name: 'Alice', kills: 3 }, { rank: 2, id: 1, uid: '2', name: 'Bob', kills: 1 }, { rank: 3, id: 2, uid: null, name: 'Bot', bot: true, kills: 9 }, { rank: 4, id: 3, uid: '3', name: 'Zero', kills: 0 }] });
  await R.room.reportScores({ winner: { id: 1 }, players: [{ rank: 1, id: 1, uid: '2', name: 'Bob', kills: 4 }, { rank: 2, id: 0, uid: '1', name: 'Alice', kills: 2 }, { rank: 3, id: 4, uid: '4', name: 'Dan', kills: 1 }, { rank: 4, id: 5, uid: '5', name: 'Eve', kills: 2 }] });
  await lobby.addScores({ game: 'bubble', entries: [{ uid: '6', name: 'Hack', points: 5, stats: { kills: 999 } }, { uid: '7', name: 'Frac', points: 5, stats: { kills: 2.5 } }] });
  const r = await Bundle.default.fetch(new Request('https://x.test/board/games'), env);
  assert.equal(r.status, 200);
  const g = await r.json();
  assert.deepEqual(g.bubble.kills.map(p => [p.rank, p.name, p.kills]), [[1, 'Bob', 4], [2, 'Alice', 3], [3, 'Eve', 2]], 'best per player, ties keep the earlier record, bots/zero/invalid dropped');
  assert.equal(g.kart.laps, 3); assert.equal(g.kart.tracks.length, 6);
  const empty = await (await Bundle.default.fetch(new Request('https://x.test/board/games'), {})).json();
  assert.deepEqual(empty.bubble.kills, []); assert.ok(empty.kart.tracks.every(t => t.top.length === 0), 'no lobby binding: empty records');
  assert.equal((await Bundle.default.fetch(new Request('https://x.test/board'), env)).status, 200, '/board still works');
});

/* ---------- 網頁登入與訪客 ---------- */
const AUTH_ENV = { BOT_TOKEN: TOKEN, TG_LOGIN_CLIENT_ID: '777000111', TG_LOGIN_SECRET: 'client-secret' };
const b64url = buf => Buffer.from(buf).toString('base64url');
async function fakeTelegram() { // 模擬 Telegram：RSA 金鑰、JWKS、簽 id_token
  const kp = await crypto.webcrypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
  const jwk = { ...(await crypto.webcrypto.subtle.exportKey('jwk', kp.publicKey)), kid: 'k1', use: 'sig', alg: 'RS256' };
  const sign = async (claims, kid = 'k1') => { const h = b64url(JSON.stringify({ alg: 'RS256', kid, typ: 'JWT' })), b = b64url(JSON.stringify(claims)); return `${h}.${b}.${b64url(await crypto.webcrypto.subtle.sign('RSASSA-PKCS1-v1_5', kp.privateKey, Buffer.from(`${h}.${b}`)))}`; };
  const now = Math.floor(Date.now() / 1000), good = { iss: 'https://oauth.telegram.org', aud: AUTH_ENV.TG_LOGIN_CLIENT_ID, sub: 's-42', id: 42, name: '小明', iat: now, exp: now + 3600 };
  return { jwk, sign, good };
}

test('session: signed, tamper-proof, expires', async () => {
  const t = await signSession({ uid: '42', name: 'A', guest: 0, exp: Date.now() + 60000 }, AUTH_ENV);
  assert.equal((await readSession(t, AUTH_ENV)).uid, '42');
  assert.equal(await readSession(t.replace(/^./, c => c === 'e' ? 'f' : 'e'), AUTH_ENV), null, 'tampered body');
  assert.equal(await readSession(t, { BOT_TOKEN: '1:other' }), null, 'other secret');
  assert.equal(await readSession(t, AUTH_ENV, Date.now() + 120000), null, 'expired');
  assert.equal(await readSession('nope', AUTH_ENV), null);
});

test('guest: /auth/guest gives a session; guests can connect but never reach the board', async () => {
  const r = await Bundle.default.fetch(new Request('https://x.test/auth/guest', { method: 'POST', body: JSON.stringify({ name: '  <小明>  ' }) }), AUTH_ENV);
  const { session, name } = await r.json(); assert.equal(name, '小明', 'name cleaned');
  const u = await resolveUser(new URL('https://x.test/kart/ws?session=' + encodeURIComponent(session)), AUTH_ENV);
  assert.match(u.id, /^g:/); assert.equal(u.guest, 1); assert.equal(u.name, '小明');
  assert.equal(await resolveUser(new URL('https://x.test/kart/ws?session=bad.token'), AUTH_ENV), null);
  const mini = await resolveUser(new URL('https://x.test/ws?auth=' + encodeURIComponent(makeInitData(TOKEN, { id: 42, first_name: 'Alice' }))), AUTH_ENV);
  assert.deepEqual(mini, { id: '42', name: 'Alice' }, 'Mini App initData still works');
  const posted = []; const env = { LOBBY_ROOM: { idFromName: n => n, get: () => ({ fetch: async (url, o) => { posted.push(JSON.parse(o.body)); return new Response('ok'); } }) } };
  const R = fakeRoom(KartRoom, env);
  await R.room.reportScores({ winner: { id: 0 }, players: [{ rank: 1, id: 0, uid: u.id, name: '小明', points: 5 }, { rank: 2, id: 1, uid: '42', name: 'Alice', points: 3 }] });
  assert.deepEqual(posted[0].entries.map(e => e.uid), ['42'], 'guest result is not recorded');
  const cfg = await (await Bundle.default.fetch(new Request('https://x.test/auth/config'), AUTH_ENV)).json(); assert.deepEqual(cfg, { telegram: true, guest: true });
  assert.deepEqual(await (await Bundle.default.fetch(new Request('https://x.test/auth/config'), { BOT_TOKEN: TOKEN })).json(), { telegram: false, guest: true });
});

test('telegram id_token: signature, issuer, audience and expiry are all checked', async () => {
  const tg = await fakeTelegram(); resetJwksCache();
  globalThis.fetch = async url => { assert.equal(String(url), 'https://oauth.telegram.org/.well-known/jwks.json'); return Response.json({ keys: [tg.jwk] }); };
  assert.equal((await verifyTelegramIdToken(await tg.sign(tg.good), AUTH_ENV)).ok, true);
  assert.equal((await verifyTelegramIdToken(await tg.sign({ ...tg.good, aud: '999' }), AUTH_ENV)).error, 'aud');
  assert.equal((await verifyTelegramIdToken(await tg.sign({ ...tg.good, iss: 'https://evil.test' }), AUTH_ENV)).error, 'iss');
  assert.equal((await verifyTelegramIdToken(await tg.sign({ ...tg.good, exp: tg.good.iat - 10 }), AUTH_ENV)).error, 'expired');
  const t = await tg.sign(tg.good), forged = t.split('.').slice(0, 2).join('.') + '.' + b64url(Buffer.from('x'.repeat(256)));
  assert.equal((await verifyTelegramIdToken(forged, AUTH_ENV)).error, 'signature');
  const swapped = t.split('.'); swapped[1] = b64url(JSON.stringify({ ...tg.good, id: 1 })); assert.equal((await verifyTelegramIdToken(swapped.join('.'), AUTH_ENV)).error, 'signature', 'edited claims');
});

test('telegram login flow: start redirects with PKCE, callback exchanges the code and returns a session in the URL fragment', async () => {
  const tg = await fakeTelegram(); resetJwksCache();
  const start = await Bundle.default.fetch(new Request('https://x.test/auth/telegram/start?return=' + encodeURIComponent('/kart/?mode=online')), AUTH_ENV);
  assert.equal(start.status, 302);
  const loc = new URL(start.headers.get('location')); assert.equal(loc.origin + loc.pathname, 'https://oauth.telegram.org/auth');
  assert.equal(loc.searchParams.get('client_id'), '777000111'); assert.equal(loc.searchParams.get('redirect_uri'), 'https://x.test/auth/telegram/callback');
  assert.equal(loc.searchParams.get('code_challenge_method'), 'S256'); assert.equal(loc.searchParams.get('response_type'), 'code');
  const cookie = start.headers.get('set-cookie').split(';')[0], state = loc.searchParams.get('state');
  let tokenReq = null;
  globalThis.fetch = async (url, o) => {
    if (String(url).endsWith('/jwks.json')) return Response.json({ keys: [tg.jwk] });
    tokenReq = { url: String(url), auth: o.headers.authorization, body: new URLSearchParams(String(o.body)) };
    return Response.json({ access_token: 'a', token_type: 'Bearer', expires_in: 3600, id_token: await tg.sign(tg.good) });
  };
  const cb = await Bundle.default.fetch(new Request(`https://x.test/auth/telegram/callback?code=c1&state=${state}`, { headers: { cookie } }), AUTH_ENV);
  assert.equal(cb.status, 302);
  assert.equal(tokenReq.url, 'https://oauth.telegram.org/token'); assert.equal(tokenReq.auth, 'Basic ' + Buffer.from('777000111:client-secret').toString('base64'));
  assert.equal(tokenReq.body.get('code'), 'c1'); assert.ok(tokenReq.body.get('code_verifier'));
  const back = cb.headers.get('location'); assert.match(back, /^\/kart\/\?mode=online#session=/);
  const sess = await readSession(back.split('#session=')[1], AUTH_ENV); assert.equal(sess.uid, '42', 'same id as the Mini App'); assert.equal(sess.guest, 0); assert.equal(sess.name, '小明');
  const bad = await Bundle.default.fetch(new Request('https://x.test/auth/telegram/callback?code=c1&state=wrong', { headers: { cookie } }), AUTH_ENV);
  assert.match(bad.headers.get('location'), /login_error=state/);
  const evil = await Bundle.default.fetch(new Request('https://x.test/auth/telegram/start?return=' + encodeURIComponent('//evil.test/x')), AUTH_ENV);
  const evilCookie = evil.headers.get('set-cookie').split(';')[0].split('=')[1]; assert.equal((await readSession(evilCookie, AUTH_ENV)).ret, '/', 'no open redirect');
  assert.equal((await Bundle.default.fetch(new Request('https://x.test/auth/telegram/start'), { BOT_TOKEN: TOKEN })).status, 503, 'not configured');
});

test('scores: records under an old storage prefix do not show on the board', async () => {
  const storage = fakeStorage(); await storage.put('score:1', { name: 'Old', points: 99, games: 9, wins: 9 });
  const lobby = new LobbyRoom({ getWebSockets: () => [], acceptWebSocket() {}, storage }, {});
  assert.deepEqual((await lobby.board()).top, [], 'fresh board');
  await lobby.addScores({ entries: [{ uid: '1', name: 'New', points: 5, win: true }] }); lobby.boardCache = null;
  assert.deepEqual((await lobby.board()).top.map(p => [p.name, p.points]), [['New', 5]]);
  assert.equal((await storage.get('score:1')).points, 99, 'old data kept, not deleted');
});

test('room status: game rooms tell the lobby when things change; the lobby pushes it to everyone in the hub', async () => {
  const storage = fakeStorage(), socks = [];
  const lobby = new LobbyRoom({ getWebSockets: () => socks.filter(w => w.readyState === 1), acceptWebSocket(ws) { socks.push(ws); }, storage }, {});
  const hubWs = { readyState: 1, out: [], send(x) { this.out.push(JSON.parse(x)); }, deserializeAttachment() { return { uid: '9' }; } }; socks.push(hubWs);
  const env = { LOBBY_ROOM: { idFromName: n => n, get: () => ({ fetch: (url, o) => lobby.fetch(new Request(url, o)) }) } };
  const R = fakeRoom(KartRoom, env), a = R.connect('1', 'Alice'), b = R.connect('2', 'Bob');
  await R.msg(a, { t: 'join' }); await R.msg(b, { t: 'join' });
  R.adv(1500); R.tick(); await new Promise(r => setTimeout(r, 0));
  let st = hubWs.out.findLast(m => m.t === 'rooms').rooms.kart;
  assert.equal(st.phase, 'lobby'); assert.equal(st.players, 2); assert.ok(st.startsAt > st.at, 'countdown time is sent');
  R.adv(20000); R.tick(); R.adv(1100); R.tick(); await new Promise(r => setTimeout(r, 0));
  assert.equal(hubWs.out.findLast(m => m.t === 'rooms').rooms.kart.phase, 'vote');
  await R.msg(a, { t: 'vote', track: 'candy' }); await R.msg(b, { t: 'vote', track: 'candy' }); R.tick(); R.adv(1100); R.tick(); await new Promise(r => setTimeout(r, 0));
  st = hubWs.out.findLast(m => m.t === 'rooms').rooms.kart; assert.equal(st.phase, 'play'); assert.equal(st.players, 2);
  assert.equal((await storage.get('rooms')).kart.phase, 'play', 'saved for the next hub visitor');
  await lobby.setRoom({ game: 'Bad Name!', status: {} }); assert.equal((await lobby.loadRooms())['Bad Name!'], undefined, 'invalid game id ignored');
});

test('version: /version returns the build id; the id is a content hash that changes when anything changes', async () => {
  const r = await Bundle.default.fetch(new Request('https://x.test/version'), {});
  assert.equal(r.status, 200); assert.equal(r.headers.get('cache-control'), 'no-store');
  const { v } = await r.json(); assert.match(v, /^[0-9a-f]{12}$/, 'build id from build.mjs');
  const { buildHash } = await import('../../../deploy/build.mjs');
  assert.equal(buildHash('abc'), buildHash('abc')); assert.notEqual(buildHash('abc'), buildHash('abd'));
  assert.equal(((await (await Bundle.default.fetch(new Request('https://x.test/version'), {})).json()).v), v, 'stable between requests');
});

test('kart solo records: ticket at the start, checked time at the finish; records only, no points; bad tickets and guests rejected', async () => {
  const lobby = new LobbyRoom({ getWebSockets: () => [], acceptWebSocket() {}, storage: fakeStorage() }, {});
  let now = 1000; lobby.now = () => now;
  const env = { ...AUTH_ENV, LOBBY_ROOM: { idFromName: n => n, get: () => ({ fetch: (url, o) => lobby.fetch(new Request(url, o)) }) } };
  const alice = 'auth=' + encodeURIComponent(makeInitData(TOKEN, { id: 42, first_name: 'Alice' })), bob = 'auth=' + encodeURIComponent(makeInitData(TOKEN, { id: 7, first_name: 'Bob' }));
  const post = (path, body) => Bundle.default.fetch(new Request('https://x.test' + path, { method: 'POST', body: JSON.stringify(body) }), env);
  const realNow = Date.now; let clock = realNow(); Date.now = () => clock;
  try {
    const start = await post('/kart/solo', { id: alice, track: 'candy' }); assert.equal(start.status, 200);
    const { ticket } = await start.json(), min = kartMinTime(KartCore.trackById('candy'));
    assert.ok(min > 30 && min < 45, `candy minimum ${min.toFixed(1)} s`);
    clock += 50_000; // 開票後 50 秒
    assert.equal((await post('/kart/record', { id: alice, ticket, time: 55 })).status, 422, 'faster than the real time since the ticket');
    assert.equal((await post('/kart/record', { id: alice, ticket, time: min - .5 })).status, 422, 'faster than physically possible');
    assert.equal((await post('/kart/record', { id: alice, ticket, time: 'x' })).status, 422);
    assert.equal((await post('/kart/record', { id: bob, ticket, time: 48 })).status, 403, 'the ticket belongs to Alice');
    assert.equal((await post('/kart/record', { id: alice, ticket: ticket.replace(/^./, c => c === 'e' ? 'f' : 'e'), time: 48 })).status, 403, 'tampered ticket');
    const web = await signSession({ uid: '42', name: 'Alice', guest: 0, exp: clock + 60000 }, AUTH_ENV);
    assert.equal((await post('/kart/record', { id: alice, ticket: web, time: 48 })).status, 403, 'a login is not a ticket');
    assert.equal(await resolveUser(new URL('https://x.test/kart/ws?session=' + encodeURIComponent(ticket)), AUTH_ENV), null, 'a ticket is not a login');
    const ok = await post('/kart/record', { id: alice, ticket, time: 48.5 }); assert.equal(ok.status, 200);
    assert.deepEqual(await ok.json(), { ok: true, rank: 1, improved: true, top: [{ rank: 1, name: 'Alice', time: 48.5 }] });
    assert.equal((await post('/kart/record', { id: alice, ticket, time: 49 })).status, 429, 'one record every 5 s');
    now += 6000;
    assert.deepEqual(await (await post('/kart/record', { id: alice, ticket, time: 49 })).json(), { ok: true, rank: 1, improved: false, top: [{ rank: 1, name: 'Alice', time: 48.5 }] }, 'slower run keeps the old record');
    const guest = (await (await Bundle.default.fetch(new Request('https://x.test/auth/guest', { method: 'POST', body: '{"name":"G"}' }), env)).json()).session;
    assert.equal((await post('/kart/solo', { id: 'session=' + encodeURIComponent(guest), track: 'candy' })).status, 403, 'guests get no ticket');
    assert.equal((await post('/kart/solo', { id: '', track: 'candy' })).status, 401);
    assert.equal((await post('/kart/solo', { id: alice, track: 'nope' })).status, 400);
    assert.equal((await Bundle.default.fetch(new Request('https://x.test/kart/solo'), env)).status, 405);
    clock += 10 * 60 * 1000 + 1; // 票 10 分鐘後失效
    assert.equal((await post('/kart/record', { id: alice, ticket, time: 48 })).status, 403, 'expired ticket');
    const g = await (await Bundle.default.fetch(new Request('https://x.test/board/games'), env)).json();
    assert.deepEqual(g.kart.tracks.find(t => t.id === 'candy').top.map(p => [p.name, p.time]), [['Alice', 48.5]], 'solo record on the board');
    assert.equal((await lobby.board()).players, 0, 'solo races never add points');
    assert.equal((await Bundle.default.fetch(new Request('https://x.test/record', { method: 'POST', body: '{}' }), env)).status, 404, '/record is not public');
  } finally { Date.now = realNow; }
});

test('records: artillery keeps the best single-game kills per player; zero, bots and out-of-range values dropped', async () => {
  const lobby = new LobbyRoom({ getWebSockets: () => [], acceptWebSocket() {}, storage: fakeStorage() }, {});
  let now = 1000; lobby.now = () => now++;
  const env = { LOBBY_ROOM: { idFromName: n => n, get: () => ({ fetch: (url, o) => lobby.fetch(new Request(url, o)) }) } };
  const R = fakeRoom(ArtilleryRoom, env);
  assert.equal(R.room.recordStats({ kills: 0 }), null); assert.deepEqual(R.room.recordStats({ kills: 2 }), { kills: 2 });
  await R.room.reportScores({ winnerTeam: 0, players: [{ rank: 1, id: 0, uid: '1', name: 'Alice', team: 0, kills: 3, points: 5 }, { rank: 2, id: 1, uid: '2', name: 'Bob', team: 1, kills: 1, points: 1 }, { rank: 3, id: 2, uid: null, name: 'Bot', bot: true, team: 1, kills: 3, points: 1 }] });
  await R.room.reportScores({ winnerTeam: 1, players: [{ rank: 1, id: 1, uid: '2', name: 'Bob', team: 1, kills: 2, points: 5 }, { rank: 2, id: 0, uid: '1', name: 'Alice', team: 0, kills: 1, points: 1 }] });
  await lobby.addScores({ game: 'artillery', entries: [{ uid: '9', name: 'Hack', points: 1, stats: { kills: 99 } }, { uid: '8', name: 'Frac', points: 1, stats: { kills: 1.5 } }] });
  const r = await Bundle.default.fetch(new Request('https://x.test/board/games'), env), g = await r.json();
  assert.deepEqual(g.artillery.kills.map(p => [p.rank, p.name, p.kills]), [[1, 'Alice', 3], [2, 'Bob', 2]]);
});

test('bubble / artillery solo records: ticket at the start, kills checked at the finish; too many, too fast, wrong ticket, guests rejected', async () => {
  const lobby = new LobbyRoom({ getWebSockets: () => [], acceptWebSocket() {}, storage: fakeStorage() }, {});
  let now = 1000; lobby.now = () => now;
  const env = { ...AUTH_ENV, LOBBY_ROOM: { idFromName: n => n, get: () => ({ fetch: (url, o) => lobby.fetch(new Request(url, o)) }) } };
  const alice = 'auth=' + encodeURIComponent(makeInitData(TOKEN, { id: 42, first_name: 'Alice' })), bob = 'auth=' + encodeURIComponent(makeInitData(TOKEN, { id: 7, first_name: 'Bob' }));
  const post = (path, body) => Bundle.default.fetch(new Request('https://x.test' + path, { method: 'POST', body: JSON.stringify(body) }), env);
  const realNow = Date.now; let clock = realNow(); Date.now = () => clock;
  try {
    for (const [game, perKill] of [['artillery', 8], ['bubble', 5]]) {
      const start = await post(`/${game}/solo`, { id: alice }); assert.equal(start.status, 200); const { ticket } = await start.json(); assert.ok(ticket);
      assert.equal((await post(`/${game}/record`, { id: alice, ticket, kills: 1 })).status, 422, 'faster than one kill can take');
      clock += 60000; now += 60000;
      assert.equal((await post(`/${game}/record`, { id: alice, ticket, kills: 4 })).status, 422, 'more than 3 enemies');
      assert.equal((await post(`/${game}/record`, { id: alice, ticket, kills: 0 })).status, 422, 'zero is not a record');
      assert.equal((await post(`/${game}/record`, { id: alice, ticket, kills: 1.5 })).status, 422);
      assert.equal((await post(`/${game}/record`, { id: bob, ticket, kills: 1 })).status, 403, 'the ticket belongs to Alice');
      assert.equal((await post(`/${game}/record`, { id: alice, ticket: 'bad.ticket', kills: 1 })).status, 403);
      const kartTicket = await (await post('/kart/solo', { id: alice, track: 'candy' })).json();
      assert.equal((await post(`/${game}/record`, { id: alice, ticket: kartTicket.ticket, kills: 1 })).status, 403, 'a kart ticket is not a ' + game + ' ticket');
      const ok = await post(`/${game}/record`, { id: alice, ticket, kills: 2 }); assert.equal(ok.status, 200);
      assert.deepEqual(await ok.json(), { ok: true, rank: 1, improved: true, top: [{ rank: 1, name: 'Alice', kills: 2 }] });
      now += 6000; assert.equal((await post(`/${game}/record`, { id: alice, ticket, kills: 1 })).status, 200, 'a worse result is accepted but does not replace the best');
      const board = await (await Bundle.default.fetch(new Request('https://x.test/board/games'), env)).json(); assert.deepEqual(board[game].kills.map(p => [p.name, p.kills]), [['Alice', 2]]);
      now += 10000;
    }
    const web = await signSession({ uid: 'g:1', name: 'Guest', guest: 1, exp: clock + 60000 }, AUTH_ENV);
    assert.equal((await post('/artillery/solo', { id: 'session=' + encodeURIComponent(web) })).status, 403, 'guests get no ticket');
    assert.equal((await post('/artillery/solo', { id: 'auth=nope' })).status, 401);
    assert.equal((await Bundle.default.fetch(new Request('https://x.test/artillery/solo'), env)).status, 405);
    const total = await (await Bundle.default.fetch(new Request('https://x.test/board'), env)).json(); assert.equal(total.top.length, 0, 'solo records never add points');
  } finally { Date.now = realNow; }
});

test('kart hard records: solo against hard computers go to their own board; normal and online stay on the normal board', async () => {
  const lobby = new LobbyRoom({ getWebSockets: () => [], acceptWebSocket() {}, storage: fakeStorage() }, {});
  let now = 1000; lobby.now = () => now;
  const env = { ...AUTH_ENV, LOBBY_ROOM: { idFromName: n => n, get: () => ({ fetch: (url, o) => lobby.fetch(new Request(url, o)) }) } };
  const alice = 'auth=' + encodeURIComponent(makeInitData(TOKEN, { id: 42, first_name: 'Alice' }));
  const post = (path, body) => Bundle.default.fetch(new Request('https://x.test' + path, { method: 'POST', body: JSON.stringify(body) }), env);
  const realNow = Date.now; let clock = realNow(); Date.now = () => clock;
  try {
    const hard = await (await post('/kart/solo', { id: alice, track: 'candy', diff: 'hard' })).json();
    clock += 120000; now += 120000;
    const ok = await post('/kart/record', { id: alice, ticket: hard.ticket, time: 50 }); assert.equal(ok.status, 200);
    assert.deepEqual(await ok.json(), { ok: true, rank: 1, improved: true, top: [{ rank: 1, name: 'Alice', time: 50 }] });
    let board = await (await Bundle.default.fetch(new Request('https://x.test/board/games'), env)).json(), candy = board.kart.tracks.find(t => t.id === 'candy');
    assert.deepEqual(candy.hard.map(p => [p.name, p.time]), [['Alice', 50]]); assert.deepEqual(candy.top, [], 'normal board untouched');
    now += 6000; clock += 6000;
    const nor = await (await post('/kart/solo', { id: alice, track: 'candy', diff: 'nope' })).json(); clock += 120000; now += 120000;
    assert.equal((await post('/kart/record', { id: alice, ticket: nor.ticket, time: 55 })).status, 200, 'an unknown difficulty counts as normal');
    board = await (await Bundle.default.fetch(new Request('https://x.test/board/games'), env)).json(); candy = board.kart.tracks.find(t => t.id === 'candy');
    assert.deepEqual(candy.top.map(p => [p.name, p.time]), [['Alice', 55]]); assert.deepEqual(candy.hard.map(p => p.time), [50]);
  } finally { Date.now = realNow; }
});

test('kart mode vote: map and mode are counted apart; the mode majority wins; nobody picking a mode means the item race', async () => {
  const R = fakeRoom(KartRoom);
  const a = R.connect('1', 'Alice'), b = R.connect('2', 'Bob'), c = R.connect('3', 'Cat');
  for (const w of [a, b, c]) await R.msg(w, { t: 'join' });
  R.adv(20500); R.tick(); assert.equal(R.room.phase, 'vote');
  await R.msg(a, { t: 'vote', mode: 'speed' }); // 只投模式
  await R.msg(b, { t: 'vote', track: 'lake', mode: 'speed' }); await R.msg(c, { t: 'vote', track: 'lake', mode: 'item' }); await R.msg(c, { t: 'vote', mode: 'turbo' });
  let v = a.out.findLast(m => m.t === 'lobby').vote;
  assert.deepEqual(v.modes, { item: 1, speed: 2 }, 'unknown mode ignored'); assert.equal(v.counts.lake, 2, 'a mode-only vote is not a map vote');
  const sent = a.out.length; for (let i = 0; i < 5; i++) await R.msg(b, { t: 'vote', track: 'lake', mode: 'speed' });
  assert.equal(a.out.length, sent, 'repeating the same vote does not broadcast');
  R.tick(); assert.equal(R.room.phase, 'vote', 'Alice has not picked a map yet');
  await R.msg(a, { t: 'vote', track: 'candy' }); R.tick();
  assert.equal(R.room.phase, 'play'); assert.equal(R.room.game.mode, 'speed'); assert.equal(R.room.game.boxes.length, 0, 'no item boxes in the speed race');
  assert.equal(a.out.find(m => m.t === 'start').s.mode, 'speed');
  // 沒人選模式：道具賽
  const R2 = fakeRoom(KartRoom), p = R2.connect('1', 'A'), q = R2.connect('2', 'B');
  await R2.msg(p, { t: 'join' }); await R2.msg(q, { t: 'join' }); R2.adv(20500); R2.tick();
  await R2.msg(p, { t: 'vote', track: 'candy' }); await R2.msg(q, { t: 'vote', track: 'candy' }); R2.tick();
  assert.equal(R2.room.game.mode, 'item'); assert.ok(R2.room.game.boxes.length > 0);
});

test('kart speed records: speed races get their own boards (online and solo, normal and hard); the minimum time allows nitro', async () => {
  const lobby = new LobbyRoom({ getWebSockets: () => [], acceptWebSocket() {}, storage: fakeStorage() }, {});
  let now = 1000; lobby.now = () => now;
  const env = { ...AUTH_ENV, LOBBY_ROOM: { idFromName: n => n, get: () => ({ fetch: (url, o) => lobby.fetch(new Request(url, o)) }) } };
  const K2 = fakeRoom(KartRoom, env); K2.room.track = 'lake'; K2.room.mode = 'speed';
  await K2.room.reportScores({ winner: { id: 0 }, players: [{ rank: 1, id: 0, uid: '1', name: 'Bob', points: 5, time: 60 }] });
  const alice = 'auth=' + encodeURIComponent(makeInitData(TOKEN, { id: 42, first_name: 'Alice' }));
  const post = (path, body) => Bundle.default.fetch(new Request('https://x.test' + path, { method: 'POST', body: JSON.stringify(body) }), env);
  const candy = KartCore.trackById('candy'), minItem = kartMinTime(candy), minSpeed = kartMinTime(candy, 'speed'), between = Math.round((minItem + minSpeed) / 2 * 100) / 100;
  assert.ok(minSpeed < minItem - 3, `speed ${minSpeed.toFixed(1)} s, item ${minItem.toFixed(1)} s`);
  const realNow = Date.now; let clock = realNow(); Date.now = () => clock;
  try {
    const sp = await (await post('/kart/solo', { id: alice, track: 'candy', diff: 'hard', mode: 'speed' })).json(); clock += 120000; now += 120000;
    assert.equal((await post('/kart/record', { id: alice, ticket: sp.ticket, time: between })).status, 200, 'faster than the item-race limit is fine in a speed race');
    now += 6000; clock += 6000;
    const it = await (await post('/kart/solo', { id: alice, track: 'candy', diff: 'hard', mode: 'nope' })).json(); clock += 120000; now += 120000;
    assert.equal((await post('/kart/record', { id: alice, ticket: it.ticket, time: between })).status, 422, 'an unknown mode counts as the item race, which keeps the stricter limit');
    const board = await (await Bundle.default.fetch(new Request('https://x.test/board/games'), env)).json(), t = id => board.kart.tracks.find(x => x.id === id);
    assert.deepEqual(t('lake').speed.map(p => [p.name, p.time]), [['Bob', 60]], 'online speed race'); assert.deepEqual(t('lake').top, [], 'item board untouched');
    assert.deepEqual(t('candy').speedHard.map(p => [p.name, p.time]), [['Alice', between]], 'solo speed race against hard computers'); assert.deepEqual(t('candy').hard, []);
  } finally { Date.now = realNow; }
});
