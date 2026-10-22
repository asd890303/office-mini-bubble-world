// 連線同步共用工具：純邏輯，不碰畫面，時間一律用秒。本機時間用 performance.now() / 1000；伺服器時間由各遊戲決定（快照的 k × TICK，或規則檔自己的 time）。
// - createClock：從快照推算「伺服器現在幾秒」，並用 ping / pong 量往返延遲
// - createDelay：別人的角色畫在「伺服器時間 − 延遲」，延遲跟著網路抖動自動調整（穩的時候約 65 ms，抖的時候拉長，不會停住再跳）
// - createBuffer：照伺服器時間排好的快照，取出夾住某個時間的前後兩張
// - createInputLog：記下自己每一幀的輸入；新快照到了，從伺服器位置把還沒算進去的輸入重播一次，就是自己「現在」的位置
// - follow：位置被修正時不瞬移，差距在約 0.1 秒內攤掉；目標照速度移動時完全跟上，不會落後
export const TICK = .05; // 伺服器每 50 ms 推進一次（worker.js 的 TICK_MS）

export function createClock({ window = 2 } = {}) {
  const offs = [], rtts = [];
  return {
    offset: null, // 本機時間 − 伺服器時間：取 window 秒內最小的值，也就是走得最快的那個封包
    rtt: null,
    reset() { offs.length = 0; this.offset = null; }, // 換一局（伺服器時間從 0 重算）要重設；往返延遲保留
    sample(server, local) {
      if (!Number.isFinite(server)) return;
      offs.push([local, local - server]); while (offs.length > 1 && offs[0][0] < local - window) offs.shift();
      this.offset = Math.min(...offs.map(o => o[1]));
    },
    // 封包比最快那個晚到多少：window 秒內第 q 百分位（jitter 用第 90 百分位）
    late(q) {
      if (!offs.length) return 0;
      const l = offs.map(o => o[1] - this.offset).sort((a, b) => a - b);
      return l[Math.floor((l.length - 1) * q)];
    },
    jitter() { return this.late(.9); },
    serverNow(local) { return this.offset == null ? null : local - this.offset; },
    pong(sent, local) {
      const r = local - Number(sent); if (!(r >= 0 && r < 5)) return;
      rtts.push(r); if (rtts.length > 7) rtts.shift();
      this.rtt = [...rtts].sort((a, b) => a - b)[rtts.length >> 1];
    },
    // 伺服器時間 server 的狀態，已經算進「本機在這個時間以前送出的輸入」= 伺服器時間換成本機時間，再減去上傳要花的時間。
    // offset 用的是最快的下傳，往返用的是中位數，所以上傳 ≈ 往返 − 下傳晚到的中位數。伺服器收到輸入後，下一步會把整步都照新輸入算，所以加半步
    inputTime(server) { return server + this.offset - Math.max(0, (this.rtt ?? .1) - this.late(.5)) + TICK / 2; },
  };
}

// 每 every 秒送一次 ping（伺服器原樣回 pong.at）。ping 不算操作，不會延後掛機踢除
export function pinger(every = 2) {
  let last = -Infinity;
  return (local, send) => { if (local - last >= every) { last = local; send({ t: 'ping', at: local }); } };
}

// interval：快照多久來一張。延遲 = interval + 抖動 + margin，夾在 min 到 max；變長時每秒最多 +0.5 秒（短暫慢動作），變短時每秒 −0.05 秒（看不出來）
export function createDelay({ interval = TICK, min = interval, max = .35, margin = .015 } = {}) {
  let d = null;
  return {
    get value() { return d ?? interval + margin; },
    update(clock, dt) {
      const want = Math.max(min, Math.min(max, interval + clock.jitter() + margin));
      d = d == null ? want : want > d ? Math.min(want, d + dt * .5) : Math.max(want, d - dt * .05);
      return d;
    },
    reset() { d = null; },
  };
}

export function createBuffer(size = 40) {
  const fr = [];
  return {
    frames: fr,
    get latest() { return fr.at(-1) || null; },
    get prev() { return fr.at(-2) || null; },
    push(t, s) {
      const l = fr.at(-1);
      if (l && t <= l.t) { if (t > l.t - 1) return false; fr.length = 0; } // 重複或舊的不收；倒退超過 1 秒是新的一局
      fr.push({ t, s }); if (fr.length > size) fr.shift(); return true;
    },
    // 夾住 t 的前後兩張：a.t ≤ t ≤ b.t 時 u 在 0 到 1；比最新那張還晚時 a、b 是最後兩張、u > 1，要不要往前推算由呼叫的人決定；只有一張時 a = b
    at(t) {
      if (!fr.length) return null;
      let i = fr.length - 1; while (i > 0 && fr[i - 1].t > t) i--;
      const b = fr[i], a = fr[i - 1] || b, span = b.t - a.t;
      return { a, b, u: span > 0 ? (t - a.t) / span : 1, span };
    },
    reset() { fr.length = 0; },
  };
}

export const mix = (a, b, u) => a + (b - a) * u;
export const mixAngle = (a, b, u) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * u;

// 每一幀先用 current（上一幀讀到、已經送出的輸入）把自己往前推，再 add(now, 這一幀讀到的輸入)。這一幀讀到的輸入這一幀才送出，伺服器也是從這時候開始算，所以從 now 起才生效
export function createInputLog(keep = 2) {
  const log = []; let cur = null;
  return {
    get current() { return cur ? cur.v : null; },
    // 從 now 起輸入是 v；上一個輸入在 now 結束。同一個輸入接續的時間併成一段
    add(now, v) {
      const k = JSON.stringify(v);
      if (cur && now > cur.t0) { const l = log.at(-1); if (l && l.k === cur.k && l.t1 === cur.t0) l.t1 = now; else log.push({ t0: cur.t0, t1: now, v: cur.v, k: cur.k }); }
      if (!cur || now >= cur.t0) cur = { t0: now, v, k };
      while (log.length && log[0].t1 < now - keep) log.shift();
    },
    // t 到最後一次 add 的每一段 [秒數, 輸入]
    since(t) { const out = []; for (const l of log) if (l.t1 > t) out.push([l.t1 - Math.max(t, l.t0), l.v]); return out; },
    reset() { log.length = 0; cur = null; },
  };
}
// 把 since() 的每一段切成不超過 max 秒的小步，重播時和伺服器的步長差不多
export function* substeps(segs, max = 1 / 60) {
  for (const [dt, v] of segs) { const n = Math.max(1, Math.ceil(dt / max - 1e-9)); for (let i = 0; i < n; i++) yield [dt / n, v]; }
}

// st 是每個要畫的東西自己的狀態物件。目標 (x, y) 以速度 (vx, vy) 移動：畫面位置 = 目標 + 修正差距，差距每 tau 秒縮成 1/e；差距超過 snap 直接跳過去
export function follow(st, x, y, vx, vy, dt, { tau = .08, snap = Infinity } = {}) {
  if (st.x == null) { st.ox = 0; st.oy = 0; }
  else { const k = Math.exp(-dt / tau); st.ox = st.x + st.vx * dt + st.ox * k - x; st.oy = st.y + st.vy * dt + st.oy * k - y; }
  if (!(Math.hypot(st.ox, st.oy) <= snap)) { st.ox = 0; st.oy = 0; }
  st.x = x; st.y = y; st.vx = vx; st.vy = vy;
  return [x + st.ox, y + st.oy];
}
