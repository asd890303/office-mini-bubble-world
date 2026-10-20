# 部署

下一步：在專案根目錄執行 `npm run deploy`，約 1 分鐘。

## 部署一次（約 1 分鐘）

1. 開終端機，進專案根目錄。
2. 執行 `npm run deploy`。這會先 build，再用 wrangler 上傳。
3. 看到 `Deployed office-mini-bubble-world triggers`，部署完成。
4. 打開 `https://<Worker 名稱>.<子網域>.workers.dev/health`。回傳 `{"ok":true,...}` 代表線上正常。

## 第一次設定（約 10 分鐘）

1. 執行 `cd deploy && npx wrangler login`，在瀏覽器授權。
2. 執行 `npx wrangler secret put BOT_TOKEN`，貼上 bot token。
   - 兩個 bot 共用時，用逗號分隔：`tokenA,tokenB`。
   - 第一個 token 負責把對戰名次貼到群組。
3. 回根目錄執行 `npm run deploy`。
4. 照下一節設定 BotFather。

部署會依 `wrangler.toml` 建立四個 Durable Object：`GameRoom`（泡泡碰碰島，migration v1）、`LobbyRoom`（大廳，migration v2）、`KartRoom`（泡泡賽車，migration v3）、`ArtilleryRoom`（泡泡砲戰，migration v4）。`BOT_TOKEN` 存在 Cloudflare，之後部署不會覆蓋它。總積分存在 `LobbyRoom` 的儲存空間，重新部署不會清掉。

## 開啟網頁版 Telegram 登入（約 5 分鐘）

不設定也能用：網頁玩家仍可用訪客身分連線，只是沒有「用 Telegram 登入」按鈕。

1. 在 BotFather 選要當登入用的 bot，進入 `Login Widget`。
2. 在 Allowed URLs 加兩個網址：`https://<Worker 網址>` 和 `https://<Worker 網址>/auth/telegram/callback`。
3. 記下同一頁的 Client ID 和 Client Secret。
4. 執行 `cd deploy && npx wrangler secret put TG_LOGIN_CLIENT_ID`，貼 Client ID。
5. 執行 `npx wrangler secret put TG_LOGIN_SECRET`，貼 Client Secret。
6. 打開 `https://<Worker 網址>/auth/config`，看到 `"telegram":true` 就完成。

登入用的 bot 也要在 `BOT_TOKEN` 裡，網頁登入憑證用 `BOT_TOKEN` 的第一個 token 簽名。換掉第一個 token 時，所有網頁玩家要重新登入。

## 設定 Mini App 網址（約 3 分鐘）

1. 在 Telegram 對 BotFather 輸入 `/myapps`，選 bot，選 app。
2. 選 `Edit Web App URL`，貼上 Worker 網址。要建新 app 就改用 `/newapp`。
3. 兩個 bot 共用時，各建一個 app，填同一個網址。
4. 用 `https://t.me/<bot 帳號>/<short name>` 進大廳。連結後面加 `?startapp=bubble` 直接進泡泡碰碰島，加 `?startapp=kart` 直接進泡泡賽車。

Telegram 的 CloudStorage 依 bot 分開存。玩家換 bot 開啟時，外觀可能要重選一次。

## GitHub 按鈕（測試站）

下一步：打開 repo 的 Actions → Deploy Test → Run workflow，分支選 `dev`，約 2 分鐘。

- `ci.yml`：推送或發 PR 到 `dev` 時，自動 build 並跑測試。
- `deploy.yml`（名稱 Deploy Test）：只能在 `dev` 分支執行，build 和測試通過才會部署。
- 部署 job 掛在 GitHub Environment `test` 底下，repo 首頁右側的 Deployments 區會列出每次部署的時間與 commit。
- 部署成功後自動在該 commit 打 tag `deploy-test-日期時間-版本碼`。版本碼就是線上 `/version` 回傳的那串，對照 tag 清單就知道線上跑哪個 commit。同一個版本碼不重複打 tag。
- 需要兩個 repo secret：`CLOUDFLARE_API_TOKEN`（用「編輯 Cloudflare Workers」範本建立）和 `CLOUDFLARE_ACCOUNT_ID`。
- `BOT_TOKEN` 不放在 GitHub。
- workflow 檔案必須放在 `.github/workflows/`，所以不在 `deploy/` 裡。

排查失敗（約 5 分鐘）：

1. 打開失敗的 Deploy Test job，展開 `Run cloudflare/wrangler-action@v3`。
2. 找含 `ERROR` 或 `Authentication error` 的那幾行。
3. 對照原因：`Authentication error [code: 10000]` 代表 token 權限不足，或 account ID 與 token 不同帳號。

## 選填設定

在 `wrangler.toml` 的 `[vars]` 加：

- `GROUP_ID`：Telegram 群組 id。設了之後，對戰結束會貼名次到該群組。
- `ALLOWED_ORIGIN`：只允許這個網址連線。

## 資源與免費額度

2026-10 查詢，以官方文件為準。

- Worker：每天 100,000 次請求，UTC 午夜重置（台北早上 8 點）。每次請求 CPU 10 ms。
- Durable Object：每天 100,000 次請求、13,000 GB-s 運行時間、5 GB 儲存。只能用 SQLite 版，本專案已是。
- WebSocket：連線建立算 1 次請求，收到的訊息 20 則算 1 次請求。
- GitHub Actions：私有 repo 每月 2,000 分鐘（Linux）。一次 CI 約 1 分鐘。
- 超過 Worker 額度會回 Error 1027，頁面和連線停到重置。

## 掛機踢除

玩家 10 分鐘沒有操作，伺服器關閉連線（close code 4001）。玩家按任意鍵或點一下，畫面自動重連。

- 大廳：只有移動或換外觀算操作。原地回報位置每 10 秒一次，不算操作，也不會廣播。
- 遊戲房間：加入、離開、放水球算操作。
- 進行中的對局不踢，一局最長 3 分鐘。
- 要調整時間，改 `apps/worker/worker.js` 的 `IDLE_MS`。

## 總積分

- 每場連線對戰結束，遊戲房間把真人的名次分數送到 `LobbyRoom`，每位玩家寫 1 筆（免費方案每天可寫 100,000 筆）。
- `GET /board` 公開回傳前 20 名。寫入口 `/score` 只有 Durable Object 之間能呼叫，Worker 不對外轉送。

## 新版本提醒

部署後，玩家頁面最多 5 分鐘內（或切回畫面時）會跳出「有新版本了」。版本碼是整包內容的雜湊，內容沒變就不會提醒，所以重複部署同樣的內容不會打擾玩家。`/version` 每次檢查算 1 次 Worker 請求，20 位玩家玩 10 小時約 2,400 次，遠低於免費額度。

第一次部署這個功能時，已經開著舊頁面的玩家看不到提醒（舊頁面沒有這段程式），要重新整理一次，之後的版本才會提醒。

## 本資料夾的檔案

- `wrangler.toml`：Worker 名稱、Durable Object 綁定、migration。
- `build.mjs`：把大廳、共用檔案、遊戲頁面和 Worker 程式打包成 `dist/worker.bundle.js`。
- `dist/`：build 的輸出，由程式產生，不進 git。

## 現在做

在專案根目錄執行 `npm run deploy`，約 1 分鐘。
