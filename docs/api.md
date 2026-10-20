# API 文件

下一步：想快速試一個端點，執行 `curl -s https://<Worker 網址>/version`，回傳 `{"v":"..."}` 就代表線上正常，約 10 秒。

這份文件列出 Worker 對外的所有入口、程式往外呼叫的第三方服務，以及頁面載入的外部資源。路由寫在 `apps/worker/worker.js`，新增或修改路徑時一起更新本檔。

## 總覽

| 類別 | 數量 | 說明 |
|---|---|---|
| WebSocket | 4 | 三款遊戲房間與大廳 |
| 登入 | 4 | Telegram 登入、訪客 |
| 單人紀錄 | 6 | 三款遊戲各一組領票與送成績 |
| 公開唯讀 | 4 | 看板、版本碼、健康檢查 |
| 靜態頁面與檔案 | 14 | 大廳、三款遊戲、共用程式與樣式 |
| 往外呼叫的第三方服務 | 3 | Anthropic、Telegram Bot、Telegram 登入 |
| 頁面載入的外部資源 | 3 | three.js、Google Fonts、Telegram Web App |

## 身分

連線與需要身分的 HTTP 請求都用同一種身分字串，程式裡叫 `identity().query`：

- Telegram Mini App：`auth=<initData>`，伺服器用 bot token 驗證簽章，最長 24 小時內有效。
- 一般網頁：`session=<登入憑證>`，由 `/auth/guest` 或 Telegram 登入取得，有效 30 天。
- 訪客的 uid 以 `g:` 開頭。訪客可以連線玩，但拿不到單人紀錄的票，成績也不進看板。

WebSocket 把它接在網址後面：`wss://<Worker 網址>/artillery/ws?auth=...`。HTTP POST 把它放在 JSON body 的 `id` 欄位。

## WebSocket

連線時沒有身分回 401；不是 WebSocket 升級請求回 426；設了 `ALLOWED_ORIGIN` 而 Origin 不符回 403。每個房間只有一個實例（`main`）。

| 路徑 | 房間 | 說明 |
|---|---|---|
| `/ws` | 泡泡碰碰島 | 2 到 4 人 |
| `/kart/ws` | 泡泡賽車 | 2 到 4 人，倒數後 15 秒選地圖 |
| `/artillery/ws` | 泡泡砲戰 | 3 對 3，倒數後 15 秒選地圖 |
| `/lobby/ws` | 大廳 | 位置同步、房間狀態、在線玩家 |

### 共用訊息（三款遊戲房間）

| 方向 | 訊息 | 內容 |
|---|---|---|
| 客戶端送出 | `{t:'join', color, ear, ...}` | 加入等待區；砲戰可帶 `team`、`seat` |
| 客戶端送出 | `{t:'leave'}` | 離開等待區 |
| 客戶端送出 | `{t:'ping', at}` | 保活，伺服器回 `pong` |
| 伺服器送出 | `{t:'hello', you, name, phase, me, result}` | 連上後第一則 |
| 伺服器送出 | `{t:'lobby', phase, players, max, min, countdown, ...}` | 等待區狀態，約每 0.5 秒 |
| 伺服器送出 | `{t:'start', me, s}` | 開局或晚加入，`s` 是完整快照 |
| 伺服器送出 | `{t:'s', s, ev}` | 每 50 毫秒一則快照與事件 |
| 伺服器送出 | `{t:'pong', at}` | 回應 ping |
| 伺服器送出 | `{t:'note', text}` | 提示文字 |

### 各遊戲專屬的客戶端訊息

| 房間 | 訊息 |
|---|---|
| 泡泡碰碰島 | `in`（方向輸入，欄位 `d`）、`bomb`（放水球） |
| 泡泡賽車 | `vote`（選地圖）、`in`（`steer`、`drift`、`gas`、`brake`）、`item`（用道具） |
| 泡泡砲戰 | `vote`（`gen` 是隨機新地圖）、`ready`、`seat`（`slot`）、`bot`（`slot`）、`move`（`dir`）、`aim`（`angle`、`power`、`item`、`charging`）、`buy`（`item`）、`refresh`、`use`（`item`，瞬間移動另帶 `x`、`y`）、`fire`（`angle`、`power`、`item`）、`mark`（`kind`、`x`、`y`）、`say`（`msg`） |

砲戰的標記與快捷訊息只轉發給同隊，每人每回合各最多 3 則。標記種類是 `attack`、`danger`、`heal`，快捷訊息編號 0 到 5。

### 大廳訊息

| 方向 | 訊息 | 內容 |
|---|---|---|
| 客戶端送出 | `{t:'pos', x, y, f}` | 回報位置與朝向，間隔太短的會被忽略 |
| 客戶端送出 | `{t:'look', color, ear}` | 換外觀 |
| 客戶端送出 | `{t:'ping', at}` | 保活 |
| 伺服器送出 | `{t:'hello', you, W, H}` | 連上後第一則，含大廳尺寸 |
| 伺服器送出 | `{t:'snap', players}` | 所有人的位置 |
| 伺服器送出 | `{t:'rooms', rooms}` | 各遊戲房間狀態（等待、選地圖、比賽中、結算中） |

### 掛機踢除

玩家 10 分鐘沒有操作，伺服器關閉連線，close code 為 `4001`。

## 登入

| 方法與路徑 | 說明 | 回應 |
|---|---|---|
| GET `/auth/config` | 查伺服器開放哪些登入方式 | `{"telegram":bool,"guest":bool}` |
| POST `/auth/guest` | 建立訪客身分。body：`{"name":"..."}`，名字最長 12 字 | `{"session":"...","name":"..."}`；沒設 bot token 回 503 |
| GET `/auth/telegram/start?return=/路徑` | 開始 Telegram 登入，導向 Telegram 授權頁；`return` 只接受站內路徑 | 302；沒設定回 503 |
| GET `/auth/telegram/callback` | Telegram 授權完成後回到這裡，換憑證後導回 `return`，憑證放在網址 `#session=...` 後面 | 302；失敗時 `#login_error=<代碼>` |

登入錯誤代碼：`state`（逾時或被竄改）、`cancelled`（取消）、`token`（Telegram 沒回應）、`not_configured`（伺服器沒設定）。其他代碼是憑證驗證失敗的原因（`signature`、`iss`、`aud`、`expired` 等）。登入用的暫存 cookie 叫 `tg_oauth`，有效 10 分鐘，只作用在 `/auth` 路徑。

## 單人紀錄

單人版在瀏覽器裡跑，伺服器只能檢查成績合不合理。流程是開局領票、結束送成績。六個路徑都是 POST，body 是 JSON，都要帶 `id`（身分字串）。

| 路徑 | body | 說明 |
|---|---|---|
| `/kart/solo` | `id`、`track` | 領票，票綁定賽道，10 分鐘有效 |
| `/kart/record` | `id`、`ticket`、`time` | 送完賽秒數，檢查最短時間與票的經過時間 |
| `/bubble/solo` | `id` | 領票，15 分鐘有效 |
| `/bubble/record` | `id`、`ticket`、`kills` | 送擊敗數，1 到 3，每擊敗 1 人至少 5 秒 |
| `/artillery/solo` | `id` | 領票，40 分鐘有效 |
| `/artillery/record` | `id`、`ticket`、`kills` | 送擊敗數，1 到 3，每擊敗 1 人至少 8 秒 |

回應：
- 領票：`{"ticket":"..."}`。
- 送成績：`{"ok":true,"rank":<名次或null>,"improved":bool,"top":[...]}`。賽車的 `top` 項目是 `{rank,name,time}`，另兩款是 `{rank,name,kills}`。

錯誤碼：

| 狀態 | 原因 |
|---|---|
| 400 | body 格式錯誤，或賽道不存在 |
| 401 | 身分驗證失敗 |
| 403 | 訪客、票不屬於這個人、票種類不對（例如拿賽車票報砲戰） |
| 405 | 不是 POST |
| 422 | 成績不合理（太快、超過上限、不是整數） |
| 429 | 同一人兩次送出間隔不到 5 秒 |
| 503 | 伺服器沒綁定紀錄儲存 |

單人紀錄只更新各遊戲看板，不加總積分。每條賽道和每款遊戲的看板只留前 3 名，每位玩家只留自己最好的一次。

## 公開唯讀

| 路徑 | 說明 | 回應 |
|---|---|---|
| GET `/board` | 總積分榜前 20 名 | `{"players":<總人數>,"top":[{rank,name,points,games,wins}]}` |
| GET `/board/games` | 各遊戲紀錄 | `{"kart":{laps,tracks:[{id,name,top}]},"bubble":{kills:[]},"artillery":{kills:[]}}` |
| GET `/version` | 目前部署的版本碼，`no-store` | `{"v":"<12 碼>"}` |
| GET `/health` | 健康檢查 | `{"ok":true,"game":"office-mini-bubble-world"}` |

版本碼是打包內容的雜湊，和 git commit 不同，對照方式見 `deploy/README.md`。

這四個路徑都帶 CORS 標頭：`access-control-allow-origin` 預設是 `*`，設了 `ALLOWED_ORIGIN` 就只允許那個網址。

## 靜態頁面與檔案

由 Worker 直接從內嵌的資源提供，內容由 `deploy/build.mjs` 在打包時收集，回應標頭 `cache-control: no-cache`。路徑結尾少了 `/` 的資料夾網址會 301 轉到有 `/` 的版本，找不到的路徑回 404。

| 路徑 | 內容 |
|---|---|
| `/` | 大廳（3D 可走動，`apps/hub/index.html`） |
| `/bubble/` | 泡泡碰碰島頁面 |
| `/bubble/game-core.js` | 碰碰島規則（前端與伺服器共用） |
| `/kart/` | 泡泡賽車頁面 |
| `/kart/kart-core.js` | 賽車規則 |
| `/artillery/` | 泡泡砲戰頁面（只支援電腦版） |
| `/artillery/artillery-core.js` | 砲戰規則 |
| `/shared/theme.css` | 共用配色、描邊、卡片、按鈕 |
| `/shared/draw.js` | 圖示與徽章底的 canvas 繪製 |
| `/shared/three-kit.js` | 卡通材質與小傢伙角色 |
| `/shared/avatar.js` | 外觀資料、儲存、選擇視窗 |
| `/shared/session.js` | 身分、登入視窗 |
| `/shared/update.js` | 新版本提醒 |
| `/shared/solo-record.js` | 單人擊敗數紀錄（碰碰島、砲戰） |

頁面網址參數：`?mode=solo` 直接單人，`?mode=online` 直接進連線房間。Mini App 連結加 `?startapp=bubble` 或 `?startapp=kart` 直接進該遊戲。

## 往外呼叫的第三方服務

| 服務 | 端點 | 用途 | 觸發時機 | 需要的設定 |
|---|---|---|---|---|
| Anthropic Messages API | POST `https://api.anthropic.com/v1/messages` | 請 Haiku 設計砲戰的隨機新地圖配方 | 連線砲戰每次進入選地圖階段呼叫一次，逾時 8 秒或格式不對就用程式隨機的版本 | secret `ANTHROPIC_API_KEY`（沒設就不呼叫） |
| Telegram Bot API | POST `https://api.telegram.org/bot<token>/sendMessage` | 對戰結束把名次貼到群組，靜音發送 | 每場有真人的連線對戰結束 | secret `BOT_TOKEN`、變數 `GROUP_ID`（兩者都要有） |
| Telegram 登入 | `https://oauth.telegram.org`：`/auth`、`/token`、`/.well-known/jwks.json` | 網頁版 Telegram 登入（OIDC，授權碼加 PKCE），驗證回傳的 id_token 簽章 | 玩家按「用 Telegram 登入」；公鑰清單快取 1 小時 | secret `TG_LOGIN_CLIENT_ID`、`TG_LOGIN_SECRET`、`BOT_TOKEN` |

Anthropic 呼叫使用模型 `claude-haiku-5-5`，輸出限定為結構化 JSON，送出前程式會把內容限制在安全範圍內，再檢查地圖公平性。設定方式見 `deploy/README.md`。

## 頁面載入的外部資源

由玩家的瀏覽器直接載入，不經過 Worker。

| 資源 | 網址 | 用途 |
|---|---|---|
| three.js 0.160.0 | `https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js` | 3D 繪圖（大廳與三款遊戲） |
| Zen Maru Gothic 字型 | `https://fonts.googleapis.com/css2?family=Zen+Maru+Gothic:wght@500;700;900` | 全站字型 |
| Telegram Web App | `https://telegram.org/js/telegram-web-app.js` | Mini App 身分、CloudStorage、按鈕 |

## Worker 內部（外部呼叫不到）

大廳 Durable Object 有 5 個內部路徑，只有 Worker 和遊戲房間能呼叫，外部請求打不進去：

| 路徑 | 說明 |
|---|---|
| POST `/score` | 遊戲結束後寫入總積分與各遊戲紀錄 |
| POST `/record` | 單人紀錄 |
| GET `/board`、GET `/board/games` | 給公開唯讀路徑讀取 |
| POST `/rooms` | 各房間回報狀態，大廳再廣播給在線玩家 |

## 需要的設定一覽

| 名稱 | 類型 | 作用 |
|---|---|---|
| `BOT_TOKEN` | secret | Telegram bot token，可用逗號放多個；第一個用來簽訪客與登入憑證、貼群組訊息 |
| `TG_LOGIN_CLIENT_ID`、`TG_LOGIN_SECRET` | secret | 網頁版 Telegram 登入 |
| `ANTHROPIC_API_KEY` | secret | 砲戰 AI 地圖 |
| `GROUP_ID` | 變數 | 貼名次的 Telegram 群組 |
| `ALLOWED_ORIGIN` | 變數 | 限制 WebSocket、POST 與 CORS 的來源網址 |

設定方式見 `deploy/README.md`。
