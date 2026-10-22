---
description: 照 docs/new-game.md 建立一款新遊戲，做完跑 npm test
allowed-tools: Read, Glob, Grep, Edit, Write, Bash(git grep:*), Bash(ls:*), Bash(npm test:*), Bash(git status:*), Bash(git diff:*)
argument-hint: "<id> <dir> <中文名>"
---

建立一款新遊戲：id 是 `$0`，資料夾是 `games/$1/`，中文名是 `$2`。依 `docs/new-game.md` 逐項做，不 commit、不推送、不部署。

## 開工前

1. 三個參數缺任何一個就停下來，請使用者補齊。
2. 檢查 id 符合 `/^[a-z]{1,16}$/`。不符合就停下來，說明原因並建議一個合格的 id。
3. 確認 `deploy/build.mjs` 的 `GAMES` 和 `apps/hub/index.html` 的 `ROOMS` 沒有同樣的 id，`games/$1/` 也還不存在。
4. 讀 `docs/new-game.md`、`apps/worker/worker.js` 的 `RunRoom`、`games/bubble-run/run-core.js`，當作範本。
5. 執行 `git grep -n "新增遊戲"`，列出所有要加一筆的位置。

## 步驟

1. 頁面與大廳：照 `docs/new-game.md`「頁面與大廳」建 `games/$1/` 的四樣檔案，在 `GAMES`、`ROOMS`、`GAME_ART` 各加一筆。
2. 規則檔：照 `docs/new-game.md`「規則檔」寫 `<名稱>-core.js`，只用 `export`，不 `import`，不碰 DOM，不用 `Math.random`。
3. 連線房間：照 `docs/new-game.md`「連線房間」改 `worker.js` 和 `deploy/wrangler.toml`。migration tag 用 `wrangler.toml` 裡最新 tag 的下一個號碼。
4. 紀錄榜：使用者沒提就不做，`recordStats()` 回傳 `null`，結尾問要不要加。
5. 文件與測試：照 `docs/new-game.md`「文件與測試」補 README 表格、`docs/$1.md`、`AGENTS.md`、`docs/api.md`、`deploy/README.md` 與測試，最後執行 `npm test`。

## 寫法規則

- 遵守 `AGENTS.md` 的文件風格：繁體中文，每組清單最多 5 項，不用破折號。
- 遊戲玩法沒講清楚的地方，先做最小可玩版本，在回報裡列出做了哪些假設。
- `git grep -n "新增遊戲"` 列出的每個位置都要處理到，做完再搜一次確認沒有漏掉。

## 輸出格式

```
新遊戲 $2（id：$0，資料夾：games/$1/）

改了哪些檔
- ...

假設與待確認
- ...

npm test：通過 / 失敗（失敗時附錯誤摘要）
```

結尾加一行：「Next：確認內容後，回『commit』我再提交；要加紀錄榜就回『加紀錄榜』。」
