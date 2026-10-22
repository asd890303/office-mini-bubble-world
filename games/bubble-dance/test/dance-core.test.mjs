import test from 'node:test';
import assert from 'node:assert/strict';
import * as D from '../dance-core.js';

const human = (n = 1) => Array.from({ length: n }, (_, i) => ({ uid: String(i + 1), name: `p${i}` }));
const toPlay = g => { while (g.phase === 'countdown') D.step(g, .05); };
const until = (g, t) => { while (!g.over && g.t < t) D.step(g, .01); };
const other = s => (s === 'L' ? 'R' : 'L');
// 照做一整個回合：每拍舉對的手
const clear = (g, ids) => { const R = g.round; R.player.forEach((x, i) => { until(g, x); for (const id of ids) D.press(g, id, R.moves[i], x); }); until(g, R.end); };

test('plan: same seed gives the same moves; another seed differs; length grows to MAX_LEN, then only the BPM rises up to BPM_MAX', () => {
  assert.deepEqual(D.plan(7, 3), D.plan(7, 3));
  assert.notDeepEqual(Array.from({ length: 6 }, (_, r) => D.plan(7, r + 1).moves), Array.from({ length: 6 }, (_, r) => D.plan(8, r + 1).moves));
  let prev = null;
  for (let r = 1; r <= D.MAX_ROUNDS; r++) {
    const R = D.plan(7, r);
    assert.equal(R.n, Math.min(r, D.MAX_LEN)); assert.ok(R.moves.every(s => D.SIDES.includes(s)));
    assert.ok(R.win <= D.WIN_MAX && R.win < R.beat / 2, 'windows never overlap');
    assert.ok(R.teacher.at(-1) < R.assist[0] && R.assist.at(-1) < R.player[0] && R.player.at(-1) + R.win + D.LATE < R.end, `round ${r} order`);
    if (prev) { assert.ok(R.bpm >= prev.bpm && R.bpm <= D.BPM_MAX); assert.ok(R.win <= prev.win); assert.ok(Math.abs(R.start - prev.end) < 1e-3, 'rounds are back to back'); }
    assert.equal(D.roundAt(R.start + .01), r);
    prev = R;
  }
  assert.equal(D.plan(1, 1).bpm, D.BPM0); assert.ok(D.plan(1, D.MAX_LEN + 1).bpm - D.plan(1, D.MAX_LEN).bpm > D.plan(1, 2).bpm - D.plan(1, 1).bpm, 'speeds up faster after the length cap');
  assert.equal(D.plan(1, D.MAX_ROUNDS).bpm, D.BPM_MAX);
});

test('judge: right hand on the beat passes; wrong hand, an extra hand or a skipped beat is out; outside the answer window is ignored', () => {
  const fresh = r => { const g = D.createGame({ seed: 3, humans: human(), bots: false, late: 0 }); toPlay(g); for (let k = 1; k < r; k++) clear(g, [0]); return g; };
  let g = fresh(1), R = g.round;
  assert.equal(D.press(g, 0, R.moves[0], R.teacher[0]), null, 'during the demo: ignored');
  assert.equal(D.press(g, 0, 'X', R.player[0]), null, 'bad side ignored');
  assert.equal(D.press(g, 0, R.moves[0], R.player[0] + R.win - .01), 'ok');
  assert.equal(D.press(g, 0, R.moves[0], R.player[0] + R.win - .005), 'extra', 'twice on one beat');
  g = fresh(1); R = g.round; assert.equal(D.press(g, 0, other(R.moves[0]), R.player[0]), 'wrong');
  assert.equal(g.players[0].out, 1); assert.equal(D.press(g, 0, R.moves[0], R.player[0]), null, 'out players are ignored');
  g = fresh(3); R = g.round; assert.equal(R.n, 3);
  assert.equal(D.press(g, 0, R.moves[0], R.player[0]), 'ok');
  assert.equal(D.press(g, 0, R.moves[1], (R.player[0] + R.player[1]) / 2), 'extra', 'between beats');
  g = fresh(3); R = g.round; assert.equal(D.press(g, 0, R.moves[1], R.player[1]), 'miss', 'skipped the first beat');
});

test('miss: a human beat is called missed only after the window plus the network grace', () => {
  const g = D.createGame({ seed: 5, humans: human(), bots: false }); toPlay(g);
  const R = g.round, p = g.players[0];
  until(g, R.player[0] + R.win + D.LATE - .03); assert.equal(p.out, 0, 'still waiting for a late packet');
  until(g, R.player[0] + R.win + D.LATE + .03); assert.equal(p.why, 'miss'); assert.equal(p.out, 1);
});

test('solo: clear rounds until the first mistake; the score is the rounds cleared', () => {
  const g = D.createGame({ seed: 9, humans: human(), bots: false }); toPlay(g);
  for (let r = 0; r < 4; r++) clear(g, [0]);
  assert.equal(g.round.r, 5); assert.equal(g.players[0].score, 4);
  until(g, g.round.player[0]); assert.equal(D.press(g, 0, other(g.round.moves[0]), g.t), 'wrong');
  let last = []; while (!g.over) last = D.step(g, .05);
  assert.equal(last.at(-1).type, 'end'); assert.equal(g.result.rounds, 5); assert.equal(g.result.players[0].score, 4); assert.equal(g.result.players[0].why, 'wrong');
});

test('bots: fill empty seats up to 4, fail at a seeded round by difficulty, same seed same result', () => {
  const play = diff => { const g = D.createGame({ seed: 11, humans: human(), diff }); toPlay(g); while (!g.over) clear(g, [0]); return g; };
  const e = play('easy'), h = play('hard');
  assert.equal(e.players.length, D.MAX_PLAYERS); assert.ok(e.players.slice(1).every(p => p.bot === 'easy' && !p.human));
  for (const p of e.players.slice(1)) { assert.ok(p.failRound >= D.BOT_LEVELS.easy[0] && p.failRound < D.BOT_LEVELS.easy[0] + D.BOT_LEVELS.easy[1]); assert.equal(p.out, p.failRound); assert.equal(p.score, p.failRound - 1); }
  assert.equal(e.result.winner.uid, '1', 'the human outlasts every bot');
  assert.ok(Math.min(...h.players.slice(1).map(p => p.failRound)) > Math.min(...e.players.slice(1).map(p => p.failRound)));
  assert.deepEqual(play('easy').players.map(p => [p.score, p.ok]), e.players.map(p => [p.score, p.ok]));
});

test('end: last one standing wins; out in the same round ranks by hands right, then ties; leavers last with out and no points', () => {
  const g = D.createGame({ seed: 2, humans: human(4) }); toPlay(g);
  clear(g, [0, 1, 2, 3]); clear(g, [0, 1, 2, 3]);
  const R = g.round; assert.equal(R.n, 3);
  until(g, R.player[0]); for (const id of [0, 1, 2]) D.press(g, id, R.moves[0], g.t);
  D.press(g, 3, other(R.moves[0]), g.t); // 3 號第一拍就錯
  until(g, R.player[1]); D.press(g, 0, R.moves[1], g.t); D.press(g, 1, other(R.moves[1]), g.t); D.press(g, 2, other(R.moves[1]), g.t);
  D.forfeit(g, 0);
  let ev = []; while (!g.over) ev = D.step(g, .05);
  assert.equal(ev.at(-1).type, 'end');
  const r = g.result; assert.deepEqual(r.players.map(p => [p.uid, p.rank]), [['2', 1], ['3', 1], ['4', 3], ['1', 4]]);
  assert.equal(r.winner, null, 'tie for first'); assert.equal(r.players[0].ok, 1); assert.equal(r.players[2].ok, 0);
  assert.equal(r.players[3].out, true); assert.equal(r.players[3].points, 0); assert.equal(r.players[0].points, D.POINTS[0]); assert.equal(r.players[2].points, D.POINTS[2]);
});

test('end: one survivor wins at the round end; everyone human gone ends at once; snapshot full carries seed and looks, the light one only state', () => {
  const g = D.createGame({ seed: 4, humans: human(2), bots: false }); toPlay(g);
  const R = g.round; until(g, R.player[0]); D.press(g, 0, R.moves[0], g.t); D.press(g, 1, other(R.moves[0]), g.t);
  assert.equal(g.over, false, 'waits for the round end'); until(g, R.end + .05);
  assert.equal(g.result.winner.uid, '1'); assert.equal(g.result.players[0].score, 1);
  const h = D.createGame({ seed: 4, humans: [{ uid: '1', name: 'A', color: '#ffb3c7' }] }); toPlay(h);
  const full = D.snapshot(h), lite = D.snapshot(h, { full: false });
  assert.equal(full.seed, 4); assert.equal(full.r, 1); assert.equal(full.players[0].look.color, '#ffb3c7'); assert.equal(full.players[1].bot, 'normal');
  assert.equal(lite.seed, undefined); assert.deepEqual(Object.keys(lite.players[0]).sort(), ['id', 'l', 'o', 's']);
  D.forfeit(h, 0); D.step(h, .05); assert.equal(h.over, true);
});

test('hands: every human press (even a wrong one) and every bot beat shows up in the snapshot as h = [side, time]; a bot skips the beat it fails on', () => {
  const g = D.createGame({ seed: 11, humans: human(), diff: 'easy' }); toPlay(g);
  const R = g.round; until(g, R.player[0]);
  assert.equal(D.snapshot(g, { full: false }).players[0].h, undefined, 'no hand yet');
  D.press(g, 0, R.moves[0], R.player[0]);
  const s = D.snapshot(g, { full: false }).players; assert.deepEqual(s[0].h, [R.moves[0], R.player[0]]);
  assert.ok(s.slice(1).every(p => p.h && p.h[0] === R.moves[0] && p.h[1] === R.player[0]), 'bots raise the right hand on the beat');
  const w = D.createGame({ seed: 3, humans: human(), bots: false }); toPlay(w); until(w, w.round.player[0]);
  D.press(w, 0, other(w.round.moves[0]), w.t); assert.equal(D.snapshot(w).players[0].h[0], other(w.round.moves[0]), 'a wrong hand is shown too');
  until(g, R.end); assert.equal(g.round.r, 2, 'round 1 has one beat, already pressed');
  const b = g.players[1];
  while (g.round.r < b.failRound) { const r = g.round.r; clear(g, [0]); assert.equal(g.round.r, r + 1); }
  const F = g.round; F.player.forEach((x, i) => { if (i < b.failAt) { until(g, x); D.press(g, 0, F.moves[i], x); } }); until(g, F.player[b.failAt] + .01);
  const prev = b.failAt ? F : D.plan(11, F.r - 1), k = b.failAt ? b.failAt - 1 : prev.n - 1; // 失誤那拍沒舉，最後一次舉手停在前一拍
  assert.equal(b.why, 'miss'); assert.deepEqual(b.hand, [prev.moves[k], prev.player[k]]);
});
