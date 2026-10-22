# AGENTS.md

給 AI 代理讀的專案規則。開工前先讀完。

## 專案配置

- `apps/hub`：可走動的 3D 大廳。
- `apps/worker`：Worker 與 Durable Object 的程式碼。
- `games/bubble-island`：泡泡碰碰島。
- `games/kart-island`：泡泡賽車。
- `games/artillery`：泡泡砲戰（電腦版）。
- `games/party`：泡泡派對（走路相撲，3 種擂台）。
- `games/bubble-together`：泡泡Together（合作闖關，單人或 2 到 4 人，3 D 畫面、2 D 操作）。
- `games/bubble-dance`：泡泡跳舞機（id `dance`，跟著老師與助教示範、照拍子舉左右手，舉錯淘汰；單人跳到失誤為止，或 2 到 4 人比誰撐最久，空位補電腦）。沒有背景音樂，節拍聲與舉手音用 Web Audio 即時合成。
- 新遊戲的規則檔只能有 `export`、不能 `import`，`deploy/build.mjs` 會把它內嵌進 Worker。
- `apps/worker/worker.js` 只能匯出函式或類別。匯出數字或字串常數，Cloudflare 會拒絕啟動。
- `packages/ui`：共用美術、角色、外觀選擇。連線遊戲的對時、快照內插、自己角色的預測重播放在 `packages/ui/net-sync.js`，新遊戲照泡泡派對或泡泡倖存者的用法接。
- `deploy/`：所有部署相關檔案（`wrangler.toml`、`build.mjs`、部署文件）。
- `docs/`：遊戲設計文件，例如 `docs/kart-island.md`、`docs/artillery.md`。
- `.github/workflows/`：GitHub 規定 workflow 只能放這裡，所以不在 `deploy/`。
- 連線身分：Mini App 用 initData；網頁用 Worker 簽的登入憑證（`/auth/*`，Telegram OIDC 或訪客）。訪客 uid 以 `g:` 開頭，成績不進看板。
- 部署後頁面會自動比對 `/version` 並提醒玩家重新整理（`packages/ui/update.js`）。
- 工作分支是 `dev`。部署用手動按鈕或 `npm run deploy`。

## 新增遊戲

照 [`docs/new-game.md`](docs/new-game.md) 逐步做，或執行 `/new-game <id> <dir> <中文名>`。`git grep -n "新增遊戲"` 列出程式註解裡要加一筆的位置。最常漏的 4 件事：

- id 只能是 1 到 16 個小寫英文字母（`LobbyRoom.setRoom` 的 `/^[a-z]{1,16}$/`），和資料夾名可以不同。
- `deploy/wrangler.toml` 要加 binding 和下一個 migration tag，部署過的 tag 不能改。
- 房間照 `RunRoom` 寫，規則檔照 `games/bubble-run/run-core.js` 寫。
- `worker.js` 只能匯出函式與類別，新常數不加 `export`。


## 文件撰寫規則

寫或改 README、部署文件、`AGENTS.md`、程式註解、commit 訊息之前，依序套用兩個 skill：

1. `i-have-adhd:i-have-adhd`
   - 第一行就是讀者能做的下一步。
   - 多步驟用編號清單，每步一個動作。
   - 結尾留一個兩分鐘內能做完的下一步。
   - 時間用具體數字，例如「約 5 分鐘」。
   - 每組清單最多 5 項。
2. `stop-slop`
   - 刪掉填充詞和副詞。
   - 用主動語態，主詞是人或程式。
   - 不用破折號，不寫「不是 X 而是 Y」。
   - 寫具體名詞，不寫「相關內容」「各種設定」。

## Commit 規則

- 格式：`type(scope): 一句摘要`，`type` 和 `scope` 用英文（例如 `feat`、`fix`、`docs`），摘要與條列用繁體中文。
- 條列最多 4 條，每條一句繁體中文，只寫改了什麼。
- 不加 `Co-Authored-By`。
- 使用者說要 commit 才 commit，說要推才推。

## 測試

- `npm test`：先 build，再跑全部測試。改完程式一定要跑。
