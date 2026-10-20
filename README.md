# Office Mini Bubble World

Telegram Mini App 小遊戲大廳。玩家選好角色外觀，在可走動的 3D 大廳裡走進遊戲房間，選「加入對戰」或「單人」開玩。同一個大廳的玩家彼此看得到。與 TRON / 區塊鏈專案無關。

下一步：在專案根目錄執行 `npm install`，再執行 `npm run dev`，開 http://127.0.0.1:8767 看大廳，約 1 分鐘。

## 遊戲

| 遊戲 | 網址 | 人數 | 一句話 |
|---|---|---|---|
| 泡泡碰碰島 | `/bubble/` | 2 到 4 人 | 放水球炸箱子、炸對手，最後留在場上的人贏 |
| 泡泡賽車 | `/kart/` | 2 到 4 人 | 3 圈賽車，漂移加速、撿道具互相干擾 |
| 泡泡砲戰 | `/artillery/` | 2 到 6 人（3 對 3） | 回合制砲擊，買道具、打中賺錢，只支援電腦版 |

### 泡泡碰碰島

- 15×15 的格子地圖，四角出生。水球 2.5 秒後爆炸，水柱沿十字延伸，碰到硬牆停下，炸開箱子後也停下。
- 箱子裡有道具，超級水球的水柱長 15 格，剛好橫跨整張地圖。
- 連線 2 到 4 人，不補電腦；第 2 人加入後倒數 20 秒，滿 4 人立刻開始。最後 40 秒開始縮圈。
- 單人版對電腦。

### 泡泡賽車

- 3 圈，一場約 60 到 110 秒。按住 W 前進（手機按油門），A/D 轉向，Shift 漂移，空白鍵用道具。
- 6 張地圖，從入門的糖果環道到極限的雷霆峽谷。進房後 15 秒投票選圖。
- 5 種道具：水球、加速鞋、水窪、泡泡盾、超級水柱。
- 漂移累積火花，放開就加速，加速中再漂可以連噴。
- 每條賽道記前 3 快的完賽時間；單人模式可以選電腦難度。
- 設計細節見 [`docs/kart-island.md`](docs/kart-island.md)。

### 泡泡砲戰

- 3 對 3 回合制：自己挑隊伍，空位補電腦。每人只操控自己的小傢伙，畫面是 2D 側視。
- 每人開場 120 元和 3 個起始道具。命中對手賺錢，每輪領錢，打到隊友要扣錢。
- 輪到你時：看商店（刷新要 20 元）、使用支援道具、移動、瞄準蓄力、發射。其他人看得到你在做什麼，隊友可以點地面標記或送快捷訊息。
- 攻擊道具：重水球、三連發、鑽地彈、散射水球、凍結水球、延遲水球、核彈。支援道具：治療、護盾、瞬間移動、跑鞋、手套。支援道具和發射分開計算。
- 4 張地圖：3 張固定（草原丘陵、雙浮空島、泡泡峽谷）加 1 張隨機新地圖，連線時隨機新地圖由 AI 設計。
- 打滿 10 輪後兩側地面開始崩塌，最多 5 次，最後全員淘汰。沒有風向。
- 設計細節見 [`docs/artillery.md`](docs/artillery.md)。

## 結構

npm workspaces monorepo。

```
apps/hub            可走動的 3D 大廳（網址 /）
apps/worker         Cloudflare Worker + Durable Object：頁面、遊戲房間、大廳、build / dev 腳本
games/bubble-island 泡泡碰碰島：index.html、game-core.js、測試
games/kart-island   泡泡賽車：index.html、kart-core.js、測試
games/artillery     泡泡砲戰：index.html、artillery-core.js、測試
docs                遊戲設計文件
packages/ui         共用：theme.css、draw.js、three-kit.js、avatar.js、session.js、update.js
deploy              wrangler.toml、build.mjs、部署文件
```

- 每款遊戲的規則檔（`*-core.js`）前端與伺服器共用，由 `deploy/build.mjs` 內嵌進 Worker，所以規則檔不能 `import`。
- 美術統一：所有頁面載入 `/shared/theme.css`，圖示用 `packages/ui/draw.js` 的 canvas 繪製（深褐描邊、圓角、柔和配色），不用 emoji。

## 指令

```sh
npm test          # build + 全部測試
npm run dev       # http://127.0.0.1:8767 本機預覽（沒有連線房間，連線版只在 Telegram 內可用）
npm run deploy    # build + wrangler deploy
```

部署步驟、Mini App 設定、GitHub 按鈕與免費額度見 [`deploy/README.md`](deploy/README.md)。所有對外 API、WebSocket、第三方服務與靜態頁面見 [`docs/api.md`](docs/api.md)。

## 身分與連線

- Telegram Mini App：直接用 Telegram 身分，成績計入總積分榜。
- 一般網頁：先選「用 Telegram 登入」或「訪客加入」，再選外觀。訪客可以連線玩，成績不計分。大廳右上角的身分按鈕可以切換或登出。
- 外觀（圍巾顏色、耳朵）存在 Telegram CloudStorage 並同步到 localStorage；一般瀏覽器只存 localStorage。直接點遊戲連結進來、還沒設定外觀時，遊戲頁面會先跳出選擇視窗。
- 網址參數：`?mode=solo` 直接單人；`?mode=online` 直接進連線房間（需在 Telegram 內）。Mini App 連結加 `?startapp=bubble` 或 `?startapp=kart` 直接進該遊戲，不加則進大廳。
- 大廳右上角列出在線玩家。房間面板顯示等待人數、倒數、選地圖中或比賽中；比賽中按「進去觀戰」，結束後自動加入下一場。

## 總積分看板

- 大廳左下角的地墊顯示前 3 名，站上去看前 20 名。網址 `/board` 公開唯讀。
- 只算連線對戰。賽車與碰碰島依名次給 5、3、2、1 分，出局 0 分。砲戰獲勝隊伍的真人 5 分、平手 3 分、落敗 1 分，斷線交給電腦的人不計分。
- 單人模式不計總積分，但單人成績會進各遊戲紀錄：賽車完賽時間、泡泡島與砲戰的單場擊敗數。需要用 Telegram 登入，訪客不記錄。
- 單人版在瀏覽器裡跑，伺服器只能擋明顯不合理的成績（開局領票、擊敗數上限、最短時間），所以單人紀錄的可信度比連線對戰低。
- 看板另有分頁：賽車每條賽道前 3 快（連線與單人普通電腦）、賽車困難（單人對困難電腦，另一份榜）、泡泡島與砲戰的單場擊敗數前 3 名。

## 新版本提醒

- 每次 build 產生一個版本碼，網址 `/version` 回傳。頁面每 5 分鐘、切回畫面時比對，版本變了就跳出「有新版本了」。
- 不會自動重新整理，避免打斷比賽。重新整理會讓連線中的比賽斷線，10 秒內回來可以繼續。

## 新增一款遊戲

1. 在 `games/<name>/` 放 `index.html`（載入 `/shared/theme.css`，需要圖示就 import `/shared/draw.js`）。
2. 規則檔放 `games/<name>/<name>-core.js`，只用 `export`；在 `deploy/build.mjs` 的 `GAMES` 加一筆 `{ id, dir }`。
3. 在 `apps/hub/index.html` 的 `ROOMS` 加一筆同 id 的房間，指定位置與招牌圖示。
4. 在本檔的「遊戲」表格加一列，並在表格下面加一段簡單介紹（人數、玩法、操作、特色，不超過 6 行）。
5. 新增路徑、WebSocket 訊息或第三方呼叫時，同步更新 `docs/api.md`。
6. 執行 `npm test`，通過後再部署。
