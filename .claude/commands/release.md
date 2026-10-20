---
description: 整理上次部署到現在的更新紀錄，依固定分類條列重點
allowed-tools: Bash(git log:*), Bash(git tag:*), Bash(git rev-list:*), Bash(git diff:*), Bash(git show:*)
argument-hint: "[起點 tag 或 commit，可省略]"
---

執行第 1 步，整理出更新紀錄，貼在對話裡。只讀 git，不寫檔、不 commit、不推送。

## 步驟

1. 決定範圍。
   - 有帶參數：起點是參數，終點是 `HEAD`。
   - 沒帶參數：起點是最新的 `deploy-test-*` tag（`git tag --list 'deploy-test-*' --sort=-creatordate`），終點是 `HEAD`。
   - 起點和 `HEAD` 是同一個 commit 時，改用最新兩個 tag 之間的範圍。
2. 讀 commit：`git log <起點>..<終點> --no-merges --format='%h %s%n%b'`。合併 commit 略過，內容已在子 commit 裡。
3. 依下面的分類規則歸類，每條 commit 只歸一類。
4. 每類最多 5 條。同一功能的多個 commit 合成一條，超過 5 條的取玩家感受最明顯的。
5. 依輸出格式貼出結果，結尾留一個下一步。

## 分類規則

依 commit 的 `type` 歸類，順序固定：

1. 新功能：`feat`。玩家能玩到或看到的新東西。
2. 調整：`perf`、`refactor`、`style`，以及 `feat` 裡明顯是改既有數值或介面的項目。
3. 修正：`fix`。
4. 文件：`docs`。
5. 維運：`ci`、`build`、`chore`、`test`。

沒有 `type` 或格式不符的 commit，看內容歸入最接近的一類。

## 寫法規則

- 用繁體中文，一條一句，主詞是人或程式，用主動語態。
- 寫玩家看得到的結果，例如「賽車新增道具賽與競速賽」，不寫檔名、函式名、commit hash。
- 不用破折號，不用副詞，不寫「優化了各種體驗」這類空話，要寫具體改了什麼。
- 沒有內容的分類整段略過，不寫「無」。
- 「文件」和「維運」合成一行簡述即可，玩家不需要細節。

## 輸出格式

```
更新紀錄（<起點> → <終點>，共 N 個 commit）

新功能
- ...

調整
- ...

修正
- ...

文件、維運
- ...
```

結尾加一行：「Next：確認內容無誤後，回『放進布告欄』，我把它整理成更新資訊的格式。」
