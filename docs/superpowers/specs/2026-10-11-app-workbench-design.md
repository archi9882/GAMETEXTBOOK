# app/ 第一段：首頁與匯入工作台 設計

- 日期：2026-10-11
- 狀態：已實作（2026-10-11），瀏覽器手動測試通過
- 範圍：CLAUDE.md 第 7 節第 7 步（`app/`，無金鑰模式）的第一段。完成後即可進行第 8 步（使用者以 claude.ai 實測，教材為 Naghettini《Fundamentals of Statistical Hydrology》第 2 章）。
- 框架依據：`framework/expert-quest-framework.md` v1.0（以下「框架 x.y」指其章節），主要是 4.6、8.7、第 9 章第 1–3、5 條、第 12 章。

## 1. 目標與範圍

讓只會使用聊天型 AI 的玩家，能從「拿到 AI 的回覆」走到「進入遊戲」：

1. 教學頁產生提示詞、提供框架檔下載。
2. 把 AI 的每段回覆貼進工作台，程式自動辨識片段、合併、驗證並以中文列出問題。
3. 有問題時一鍵複製修正請求貼回 AI；AI 的修正片段再貼回工作台。
4. 從世界清單進入遊戲畫面。

不在本段：備份匯出與匯入、技能索引匯出（第二段）；世界總覽、分享版匯出、API 模式（第三段）；瀏覽器端完整 JSON Schema 檢查（見第 6 節）。

## 2. 頁面

`app/index.html` 為首頁，以網址 hash 切換三個畫面；遊戲畫面維持 `engine/index.html`，兩頁共用同一個 IndexedDB（同一來源，由 `tools/serve.mjs` 提供）。

### 2.1 世界清單（`#/` 或空 hash）

- 每個世界一列：標題、狀態（進行中／已完成）、片段數、錯誤數、提醒數。
- 按鈕：工作台、進入遊戲（`../engine/index.html?world=<id>`）、刪除（`confirm` 確認）。
- 頁首：「新增世界」（前往教學頁）、「匯入」（前往不屬於任何世界的工作台 `#/import`）。
- 沒有世界時顯示簡短說明與「從教學開始」按鈕。

### 2.2 工作台（`#/world/<id>`、`#/import`）

- 貼上框（`textarea`）＋「匯入」按鈕；可拖入檔案或選檔（可多選，依檔名排序後逐一匯入）。
- 片段清單：依匯入順序列出片段名稱（`head`、`ch2`、`fix-1`…；完整 `world.json` 顯示為「完整世界檔」）與匯入時間。同名片段再次匯入時，較早的一筆標為「已取代」。
- 驗證結果：錯誤與提醒分兩區，以中文顯示（`engine/messages-zh.js`），每筆附項目路徑；提醒預設摺疊。「尚未生成」類提醒另計數量，不逐筆展開。
- 按鈕：「複製修正請求」（沒有可修正項目時停用）、「進入遊戲」。
- 匯入結果訊息：成功時說明收到哪個片段、送到哪個世界；若與目前開著的世界不同，自動切換到該世界的工作台並提示。

### 2.3 教學（`#/start`）

- 依框架第 12 章列出步驟。
- 表單：背景（必填）、目標（必填）、範圍（選填，例如「只處理第 2 章」）。即時產生提示詞，「複製」按鈕。
- 「下載框架檔」連結：`../framework/expert-quest-framework.md`，`download` 屬性。

### 2.4 遊戲畫面的調整

- `engine/main.js` 開機時：網址有 `?world=<id>` 且存在該世界時開啟它；否則照舊開上次的世界；都沒有時歡迎畫面加一個「回首頁」連結。
- 遊戲畫面的「開啟檔案」按鈕本段保留。

## 3. 資料

### 3.1 世界紀錄

沿用 `engine/main.js` 的紀錄格式並增加 `imports`：

```js
{
  id, world, complete,          // 合併結果（engine/merge.js）
  parts: [ /* 匯入的原始物件，依順序 */ ],
  imports: [ { part: "ch2", at: "<ISO 時間>" } ],  // 與 parts 一一對應；舊紀錄沒有此欄時以 parts 推得、時間留空
  importedAt                     // 最後一次匯入時間
}
```

遊戲畫面原本的檔案匯入也改用 `app/workbench.js` 產生紀錄，讓兩邊格式一致。

### 3.2 片段送往哪個世界

- 片段以 `world` 欄、完整世界檔以 `id` 決定所屬世界；同一次貼上含多個世界時拒絕匯入。
- 所屬世界已存在：新片段接在已存片段之後合併（框架 8.7 規則 1）。完整世界檔則取代全部已存片段（它涵蓋全部內容）。
- 所屬世界不存在：建立新世界。任何片段都可建立；缺 `head` 時，引用缺失的項目照進行中規則列為提醒。
- 無法解析、合併失敗或 `assertShape` 不通過：以中文說明原因，不存入任何資料。

## 4. 模組

| 模組 | 介面 | 說明 |
|---|---|---|
| `app/workbench.js` | `importText(existing, text, now)` → `{ rec, parts: [名稱], worldId }`；`partLabel(doc)`；`partRows(rec)` → `[{ part, at, replaced }]` | 純函式。內部用 `parseImport`、`mergeParts`、`assertShape`、`checkWorld`；`rec.issues` 為 `{ errors, warnings }`。失敗時拋 `ImportError` |
| `app/fix-request.js` | `buildFixRequest(rec)` → 字串或 `null`；`nextFixNumber(rec)` | 收錄全部錯誤，以及「尚未生成」以外的提醒；沒有時回傳 `null`。片段編號取已存 `fix-N` 的最大值加 1 |
| `app/prompt.js` | `buildPrompt({ background, goal, scope })` | 第 12 章提示詞；`scope` 有值時接在後面 |
| `engine/messages-zh.js` | `describeIssue(message)` → 中文；`describeImportError(message)` | 規則表（正規式 → 中文樣板），保留項目 ID、數值等參數；認不得時回傳原文 |
| `engine/store.js` | 新增 `listWorlds()`、`deleteWorld(id)` | IndexedDB 與記憶體兩版都要有；刪除目前世界時一併清除 `meta` |
| `app/index.html`、`app/app.js` | 介面 | 只做接線，邏輯都在上列模組 |

### 4.1 修正請求的格式

```
請依「專家養成記框架」4.6，輸出修正片段 fix-<N>（world: <世界 ID>）。
只含修正過的項目（完整項目），沿用原本的 ID；要刪除的項目寫在 remove。

錯誤：
- <路徑>: <英文原始訊息>
提醒：
- <路徑>: <英文原始訊息>
```

訊息保留英文原文，讓 AI 精確對應；畫面上的中文只供玩家閱讀。

### 4.2 提示詞的格式

```
請依照「專家養成記框架」，把這份文件做成學習世界，並依 4.6 以世界片段輸出。我的背景是<背景>，我想做到<目標>。
<範圍（選填）>
```

## 5. 錯誤處理

- 所有儲存操作沿用 `safe()` 模式，失敗時提示但不中斷介面。
- 記憶體模式（IndexedDB 不可用）時頁首顯示「不會保存」。
- `checkWorld` 拋例外時以一筆錯誤呈現（同遊戲畫面現有做法）。

## 6. 已知限制

瀏覽器端只跑 `assertShape` 與 `checkWorld`，不跑完整 JSON Schema（ajv 打包後體積過大）。少數格式問題（例如未知欄位、列舉值拼錯）可能通過工作台卻沒被抓到；完整檢查仍以 `npm run validate` 執行。之後若實測發現常見漏網問題，再把對應檢查加進 `check-world`。

## 7. 測試

- 單元測試（`node:test`）：`workbench`、`fix-request`、`prompt`、`messages-zh`、`store` 記憶體版。
- `messages-zh`：`check-world.js` 中每一種訊息樣板各有一筆範例，必須翻譯成中文（結果不等於原文且含中文字）。
- 手動：瀏覽器中以電路學的五個片段走完「建立 → 匯入 → 修正請求 → 進入遊戲 → 刪除」。
- 引擎中立測試涵蓋 `app/`（不得出現特定書籍名稱）。
