import test from 'node:test';
import assert from 'node:assert/strict';
import { TICK, createClock, createDelay, createBuffer, createInputLog, substeps, follow, mix, mixAngle } from '../net-sync.js';

test('clock: offset follows the fastest packet in the last 2 s; jitter is how late the others are', () => {
  const c = createClock();
  assert.equal(c.serverNow(10), null, 'no packet yet');
  c.sample(0, 1.10); c.sample(.05, 1.17); c.sample(.1, 1.20); // 晚到 0.02 秒、0（最快）
  assert.ok(Math.abs(c.offset - 1.10) < 1e-9);
  assert.ok(Math.abs(c.serverNow(1.30) - .2) < 1e-9);
  const j = createClock();
  for (let i = 0; i < 20; i++) j.sample(i * .05, 1 + i * .05 + (i % 5 === 0 ? .04 : 0)); // 每 5 張有一張晚 40 ms
  assert.ok(Math.abs(j.jitter() - .04) < 1e-9, 'p90 lateness, not the median');
  // 伺服器的時鐘走慢了：2 秒前最快的那張丟掉之後，offset 要跟著變大
  for (let i = 3; i < 80; i++) c.sample(i * .05, 1.30 + i * .05);
  assert.ok(Math.abs(c.offset - 1.30) < 1e-9, 'old fastest sample expires');
});

test('clock: round trip is the median of the last pongs; bogus pongs are ignored; inputTime subtracts it', () => {
  const c = createClock();
  c.sample(5, 105); // offset 100
  for (const r of [.15, .14, .5, .16]) c.pong(10, 10 + r);
  c.pong(10, 9); c.pong('x', 10);
  assert.ok(Math.abs(c.rtt - .16) < 1e-9);
  assert.ok(Math.abs(c.inputTime(5) - (105 - .16 + TICK / 2)) < 1e-9);
  c.sample(5.05, 105.07); c.sample(5.1, 105.12); // 下傳晚到中位數 0.02 秒：上傳只有 0.14 秒
  assert.ok(Math.abs(c.inputTime(5) - (105 - .14 + TICK / 2)) < 1e-9, 'upload time = round trip − median download lateness');
  c.reset(); assert.equal(c.offset, null); assert.ok(Math.abs(c.rtt - .16) < 1e-9, 'a new game keeps the measured round trip');
});

test('delay: about one interval when steady, grows at most 0.5 s per second on jitter, shrinks slowly', () => {
  const c = createClock(), d = createDelay({ interval: .05 });
  for (let i = 0; i < 40; i++) c.sample(i * .05, 1 + i * .05);
  assert.ok(Math.abs(d.update(c, 1 / 60) - .065) < 1e-9);
  for (let i = 40; i < 80; i++) c.sample(i * .05, 1 + i * .05 + (i % 2 ? .2 : 0)); // 一半的封包晚 200 ms
  const v1 = d.update(c, .1); assert.ok(Math.abs(v1 - .115) < 1e-9, 'rises by 0.05 in 0.1 s');
  for (let i = 0; i < 20; i++) d.update(c, .1);
  assert.ok(Math.abs(d.value - .265) < 1e-9, 'reaches interval + jitter + margin');
  for (let i = 80; i < 200; i++) c.sample(i * .05, 1 + i * .05);
  assert.ok(Math.abs(d.update(c, 1) - .215) < 1e-9, 'falls 0.05 per second');
});

test('buffer: brackets a time between two frames; past the newest frame u goes above 1; stale or repeated frames are dropped', () => {
  const b = createBuffer(3);
  assert.equal(b.at(0), null);
  b.push(1, 'a'); let r = b.at(5); assert.equal(r.a.s, 'a'); assert.equal(r.b.s, 'a'); assert.equal(r.u, 1);
  b.push(1.05, 'b'); b.push(1.1, 'c');
  assert.equal(b.push(1.1, 'dup'), false); assert.equal(b.latest.s, 'c');
  r = b.at(1.075); assert.equal(r.a.s, 'b'); assert.equal(r.b.s, 'c'); assert.ok(Math.abs(r.u - .5) < 1e-9);
  r = b.at(1.2); assert.equal(r.b.s, 'c'); assert.ok(Math.abs(r.u - 3) < 1e-9);
  r = b.at(0); assert.equal(r.b.s, 'a'); assert.equal(r.a, r.b, 'before the oldest frame: just the oldest');
  b.push(1.15, 'd'); assert.deepEqual(b.frames.map(f => f.s), ['b', 'c', 'd'], 'keeps the newest size frames');
  b.push(0, 'new game'); assert.deepEqual(b.frames.map(f => f.s), ['new game']);
  assert.equal(mix(2, 4, .25), 2.5); assert.ok(Math.abs(mixAngle(3, -3, .5) - Math.PI) < .01, 'angles take the short way');
});

test('input log: an input counts from the frame it was read; the same input merges; since() clips the first segment; old entries are dropped', () => {
  const l = createInputLog(1);
  assert.equal(l.current, null);
  l.add(0, { x: 1 }); l.add(.1, { x: 1 }); l.add(.2, { x: 1 }); l.add(.3, { x: 0 }); l.add(.4, { x: 0 });
  assert.deepEqual(l.current, { x: 0 });
  assert.deepEqual(l.since(.15).map(([d, v]) => [Math.round(d * 100) / 100, v.x]), [[.15, 1], [.1, 0]], 'x: 1 runs 0–0.3, x: 0 starts at 0.3');
  l.add(1.5, { x: 2 }); assert.deepEqual(l.since(0).map(([d, v]) => [Math.round(d * 10) / 10, v.x]), [[1.2, 0]], 'segments older than keep seconds are gone');
  const sub = [...substeps([[.05, 'a'], [.01, 'b']], 1 / 60)]; assert.deepEqual(sub.map(([, v]) => v), ['a', 'a', 'a', 'b']); assert.ok(sub.every(([d]) => d <= 1 / 60 + 1e-12));
});

test('follow: keeps up with a moving target, hides a jump over ~0.1 s, snaps on a teleport', () => {
  const st = {}; let x = 0, out;
  for (let i = 0; i < 30; i++) { x += 5 / 60; out = follow(st, x, 0, 5, 0, 1 / 60); }
  assert.ok(Math.abs(out[0] - x) < 1e-9, 'no lag while the target moves at its own speed');
  x += 1; out = follow(st, x, 0, 5, 0, 1 / 60);
  assert.ok(x - out[0] > .9, 'a correction does not show up as a jump');
  for (let i = 0; i < 18; i++) { x += 5 / 60; out = follow(st, x, 0, 5, 0, 1 / 60); }
  assert.ok(Math.abs(out[0] - x) < .03, 'and is gone after 0.3 s');
  out = follow(st, x + 50, 0, 0, 0, 1 / 60, { snap: 3 }); assert.equal(out[0], x + 50);
});

// 自己的角色：伺服器往返 150 ms。從伺服器位置把還沒算進去的輸入重播一次，走路中的位置要和不連線時幾乎一樣
test('replay: with 150 ms round trip the predicted position matches the offline one within a tick of movement', () => {
  const FR = 1 / 60, SPEED = 165, up = .075, down = .075, clockDiff = 1000;
  const c = createClock(), log = createInputLog();
  const input = t => (t >= .5 && t < 2.5 ? 1 : 0);
  const sent = [], pk = []; let sx = 0, k = 0, lastIn = null, ideal = 0, pred = 0, worst = 0, oldWorst = 0, oldPred = 0;
  for (let t = 0; t < 3.5; t += FR) {
    const v = input(t); if (v !== lastIn) { sent.push({ at: t + up + (k % 3) * .01, v }); lastIn = v; }
    while ((k + 1) * TICK <= t) { k++; const st = k * TICK; let cur = 0; for (const s of sent) if (s.at <= st) cur = s.v; sx += cur * SPEED * TICK; pk.push({ arrive: st + down + (k % 4 === 1 ? .02 : 0), k, x: sx }); }
    const local = t + clockDiff;
    if (Math.floor(t / .5) !== Math.floor((t - FR) / .5)) c.pong(local - up - down, local);
    const cur = log.current ?? 0; ideal += cur * SPEED * FR; pred += cur * SPEED * FR; oldPred += cur * SPEED * FR; log.add(local, v);
    while (pk.length && pk[0].arrive <= t) {
      const p = pk.shift(); c.sample(p.k * TICK, local);
      let x = p.x; for (const [dt, iv] of log.since(c.inputTime(p.k * TICK))) x += iv * SPEED * dt; pred = x;
      oldPred += (p.x - oldPred) * .2; // 改版前倖存者的寫法：直接往伺服器位置拉 20%
    }
    if (t > 1 && t < 2.5) { worst = Math.max(worst, Math.abs(pred - ideal)); oldWorst = Math.max(oldWorst, Math.abs(oldPred - ideal)); }
  }
  assert.ok(worst <= SPEED * TICK / 2 + 1e-6, `replayed error ${worst.toFixed(1)} px should be within half a tick of movement`);
  assert.ok(oldWorst > SPEED * .1, `the old pull-toward-server lags by more than 0.1 s of movement (${oldWorst.toFixed(1)} px)`);
  assert.ok(Math.abs(pred - sx) < 1e-6, 'after stopping, the prediction ends exactly where the server does');
});
