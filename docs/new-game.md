# 新增一款遊戲

先定 **id**、資料夾 **dir**、**中文名**，再照下面五段做。在 Claude Code 或 Cursor 可改跑 `/new-game <id> <dir> <中文名>`，它會照本檔執行。

- **id**：網址、房間、紀錄榜都用它，只能是 1 到 16 個小寫英文字母。`LobbyRoom.setRoom` 用 `/^[a-z]{1,16}$/` 檢查，含數字或連字號的 id 在大廳不會顯示房間狀態。
- **dir**：`games/<dir>/`，可以和 id 不同，例如 `games/bubble-survivors` 的 id 是 `survive`。
- **範本**：連線房間照 `apps/worker/worker.js` 的 `RunRoom` 寫，規則檔照 `games/bubble-run/run-core.js` 寫。

改完前後各跑一次 `git grep -n "新增遊戲"`，列出的位置都要加一筆。

## 頁面與大廳

1. 在 `games/<dir>/` 放四樣：`index.html`、規則檔 `<名稱>-core.js`、`package.json`（照 `games/party/package.json`，`name` 改成 `@world/<dir>`）、`test/`。
2. `index.html` 載入 `/shared/theme.css`；圖示 import `/shared/draw.js`；操作提示用 `/shared/keyhelp.js` 的 `mountKeyHelp`，固定在畫面左側。
3. 在 `deploy/build.mjs` 的 `GAMES` 加 `{ id: '<id>', dir: 'games/<dir>' }`。頁面網址會是 `/<id>/`。
4. 在 `apps/hub/index.html` 的 `ROOMS` 加一筆同 id 的房間，填位置、顏色、`path: '/<id>/'` 與招牌 `art`。
5. 在 `packages/ui/draw.js` 的 `GAME_ART` 加 `<id>(x)`，畫招牌圖示（128×128 座標）。

## 規則檔

1. 只寫 `export const` 和 `export function`，不 `import`。`deploy/build.mjs` 會把它內嵌進 Worker。
2. 不碰 DOM、three.js、`Math.random`。亂數全部來自種子，同一組種子與輸入要重播出同樣結果。
3. 匯出外觀與人數常數：`MAX_PLAYERS`、`COLORS`、`EARS`、`EYES`、`BODIES`、`BLUSHES`。`GameRoom.join` 用它們檢查玩家送來的外觀。
4. 匯出 `createGame({ seed, humans })`、`step(g, dt)`（回傳事件陣列）、`snapshot(g, opts)`、`forfeit(g, id)`。玩家物件要有 `id`、`uid`、`human`。
5. 結束時設 `g.over = true` 與 `g.result = { players, duration }`。`players` 依名次排，每人帶 `uid`、`name`、`bot`，加上 `rank` 或 `points`；中途離開沒分的人帶 `out: true`。

## 連線房間

1. 在 `apps/worker/worker.js` 開頭加 import，格式固定：`import * as XxxCore from '../../games/<dir>/<名稱>-core.js';`。`deploy/build.mjs` 用 regex 找這一行，格式不同就不會內嵌。
2. 加 `export class XxxRoom extends GameRoom`，constructor 設 `this.core = XxxCore; this.gameId = '<id>';`，再覆寫 `onInput`、`stopPlayer`、`alive`、`recordStats`、`resultText`。
3. 在 `fetch` 的 binding 對照表加 `'/<id>/ws': 'XXX_ROOM'`，在 `LOBBY.GAMES` 加 `'<id>'`，並更新檔案第 2 行的 Bindings 註解。
4. 在 `deploy/wrangler.toml` 加一筆 `[[durable_objects.bindings]]`（`name = "XXX_ROOM"`、`class_name = "XxxRoom"`），再加一筆 `[[migrations]]`，tag 用下一個號碼，`new_sqlite_classes = ["XxxRoom"]`。部署過的 tag 不能改也不能刪。
5. `worker.js` 只能匯出函式和類別。新常數不加 `export`，否則 Cloudflare 拒絕啟動。

## 紀錄榜（選做）

不做紀錄榜時，`recordStats()` 回傳 `null`，例如 `PartyRoom`。要做就改這 5 處：

1. `emptyGameBoard()` 加 `<id>: { <欄位>: [] }`，`gameBoard()` 讀出同一個欄位。
2. `addRecords()` 加一段 `else if (body.game === '<id>')`，驗證 `stats` 後寫入 `${RECORD_PREFIX}<id>:<欄位>`。
3. 單人紀錄：`addSoloRecord()` 的白名單加 `'<id>'`，`top` 加上這款的欄位格式。
4. Worker 加 `/<id>/solo`（領票）與 `/<id>/record`（送成績），照 `handleRunSolo` 寫；頁面用 `/shared/solo-record.js` 送出。
5. 大廳看板加分頁：`apps/hub/index.html` 的 `boardTabs` 按鈕、`BOARD_TABS` 與 `renderGames()`。

## 文件與測試

1. 在根目錄 `README.md` 的「遊戲」表格加一列，表格下面加一段介紹（人數、玩法、操作、特色，不超過 6 行），「結構」區塊加一行 `games/<dir>/`。
2. 設計文件放 `docs/<dir>.md`，章節照 `docs/bubble-run.md` 的順序：操作、規則數值、開局流程、電腦、連線。
3. 更新 `docs/api.md` 開頭列出的表格，`AGENTS.md` 的「專案配置」，`deploy/README.md` 的 Durable Object 清單。
4. 在 `games/<dir>/test/` 加 `*.test.mjs`。
5. 執行 `npm test`，通過後再部署。
