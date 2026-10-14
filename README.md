# 專家養成記（Expert Quest）

把一份科學教材交給**你自己的聊天型 AI**，生成一個可以遊玩的學習世界：在像素小鎮裡走動，答對題目點亮技能街燈，一步步把書裡的知識練成能用的技能。

**立即試玩：<https://archi9882.github.io/GAMETEXTBOOK/>**（手機、電腦都能玩；第一次開啟後可離線使用）

---

## 它能做什麼

- **任何科學教材都能變成遊戲**：數學、物理、化學、生物及其延伸學科的教科書、講義或期刊論文。
- **不需要 API 金鑰**：用 claude.ai 等聊天型 AI（免費版也可以）就能生成世界，整份文件直接上傳即可。
- **答案由程式計算**：數值題由 AI 寫成運算式，遊戲自己算出答案，不靠 AI 心算。
- **老師可以發給學生**：老師逐題審閱後匯出「班級版」，學生用手機一鍵加入。
- **資料只在你的瀏覽器**：沒有帳號、沒有伺服器、沒有追蹤。

## 怎麼使用

### 先玩玩看

打開網站，按「玩示範世界」。示範世界是一章高中程度的一維運動學，改編自開放教材 OpenStax《College Physics 2e》。

### 用自己的教材建立世界

1. 在網站的「新增世界」頁下載框架檔 `expert-quest-framework.md`，並複製提示詞。
2. 在聊天型 AI 開新對話，上傳框架檔與你的整份文件，貼上提示詞。
3. AI 會先問你幾個問題，之後每次給出一個「世界片段」。把每段回覆貼進網站的「匯入」。
4. 網站列出問題時，按「複製修正請求」貼回給 AI，再匯入它的修正片段。

### 老師：發給學生

1. 在世界清單按「審閱」，逐題確認題目、程式算出的正解與每個干擾選項。
2. 按「匯出班級版」。班級版會依授權標記，自動移除改編自原書特定段落的內容。
3. 把檔案傳給學生，或把檔案放在網路上，產生一鍵加入的連結。學生在網站按「加入班級世界」即可。

> 完整備份含有依文件改編的內容，僅限個人使用；要發給他人請一律使用班級版。詳見網站「關於」頁的使用條款。

## 這個專案包含什麼

| 部分 | 位置 | 說明 |
|---|---|---|
| 框架 | `framework/expert-quest-framework.md` | 給 AI 讀的生成規格：遊戲模型、生成流程、正確性規則、世界檔格式。任何 AI 讀了它都能生成世界 |
| 世界檔格式 | `schema/world.schema.json` | 依框架第 8 章的 JSON Schema |
| 網站首頁 | `app/` | 世界清單、匯入工作台、審閱、班級版、學生加入、備份、教學 |
| 遊戲本體 | `engine/` | 像素地圖、技能頁、題目、圖表繪製、運算式求值 |
| 示範世界 | `examples/openstax-kinematics/` | 依框架生成的完整範例（片段與合併後的世界檔） |
| 工具與測試 | `tools/`、`test/` | 驗證、本機伺服器、網站建置；Node 內建測試 |

給開發者（與在本 repo 工作的 AI）的完整說明在 [`CLAUDE.md`](CLAUDE.md)。

## 開發

需要 Node.js 22 以上。

```sh
npm ci
npm test                                    # 全部測試
npm run validate -- <世界檔或片段...>        # 驗證世界檔；多個片段會依序合併後驗證
node tools/serve.mjs                        # 本機開 http://localhost:8000/app/
node tools/build-site.mjs                   # 建出 _site/，與線上網站相同
```

推到 `main` 後，GitHub Actions 會測試、建置並部署到 GitHub Pages。

請勿把書檔、含原書文字的檔案或 API 金鑰提交到 repo。`library/` 與 `worlds/` 已設為不提交，可放本機測試用的書與生成的世界。

## 授權

| 內容 | 授權 |
|---|---|
| 程式碼（`app/`、`engine/`、`tools/` 等） | [GNU AGPL-3.0](LICENSE) |
| 框架文件（`framework/`） | [CC BY-SA 4.0](framework/LICENSE)；依框架生成的世界檔不受框架授權約束 |
| 世界檔中的結構與 AI 補充內容 | 預設 CC0 1.0 |
| 示範世界 | 改編自 OpenStax《College Physics 2e》第 2 章（Paul Peter Urone、Roger Hinrichs 著，[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)），內容經改寫與翻譯、數值重新設定；原書可於 <https://openstax.org/details/books/college-physics-2e> 免費取得。本專案與 OpenStax 無關，亦未經其認可 |
| 內含套件 | KaTeX、SmilesDrawer：MIT |

本軟體依現狀提供，不附任何擔保。AI 生成的內容可能有錯，發給學生前請先審閱。
