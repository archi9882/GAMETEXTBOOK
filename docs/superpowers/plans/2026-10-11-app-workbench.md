# app/ 第一段：首頁與匯入工作台 實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 做出 `app/` 首頁（世界清單、匯入工作台、教學頁），讓玩家貼上聊天型 AI 的回覆就能合併、驗證、複製修正請求並進入遊戲。

**Architecture:** 邏輯放在可單元測試的純函式模組（`app/workbench.js`、`app/fix-request.js`、`app/prompt.js`、`engine/messages-zh.js`），介面 `app/app.js` 只做接線。`app/` 與 `engine/` 共用同一個 IndexedDB（`engine/store.js` 增加列出與刪除）。遊戲畫面的檔案匯入改用同一個 `applyImport`，並支援 `?world=<id>`。

**Tech Stack:** 原生 ES modules、IndexedDB、Node 24 `node:test`；無新依賴。

**設計文件：** `docs/superpowers/specs/2026-10-11-app-workbench-design.md`

**慣例：** 註解用英文、介面文字用繁體中文（與現有 engine 一致）。每個任務結束跑 `npm test` 全部通過再提交。提交訊息結尾加 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`。

---

## 檔案結構

| 檔案 | 動作 | 職責 |
|---|---|---|
| `engine/messages-zh.js` | 新增 | 驗證訊息與匯入錯誤的中文翻譯 |
| `engine/store.js` | 修改 | 新增 `listWorlds`、`deleteWorld`；匯出 `createMemoryStore` 供測試 |
| `app/workbench.js` | 新增 | `readPaste`、`worldIdOf`、`applyImport`、`partLabel`、`partRows` |
| `app/fix-request.js` | 新增 | `buildFixRequest`、`nextFixNumber` |
| `app/prompt.js` | 新增 | `buildPrompt` |
| `app/index.html`、`app/app.js` | 新增 | 首頁三個畫面 |
| `engine/main.js`、`engine/index.html` | 修改 | 用 `applyImport`、`?world=`、回首頁連結、問題清單中文化 |
| `test/messages-zh.test.mjs`、`test/store.test.mjs`、`test/workbench.test.mjs`、`test/fix-request.test.mjs`、`test/prompt.test.mjs` | 新增 | 單元測試 |
| `test/engine-neutral.test.mjs` | 修改 | 範圍加入 `app/` |

---

### Task 0: 建立分支

- [ ] **Step 1:** `git checkout -b app-workbench`

---

### Task 1: 中文訊息 `engine/messages-zh.js`

**Files:**
- Create: `engine/messages-zh.js`
- Test: `test/messages-zh.test.mjs`

- [ ] **Step 1: 寫失敗的測試**

```js
// Tests for the Chinese rendering of check-world issues and import errors (design spec 4).
import { test } from "node:test";
import assert from "node:assert/strict";
import { describeIssue, describeImportError } from "../engine/messages-zh.js";

const CJK = /[一-鿿]/;

// One sample per message template in engine/check-world.js (keep in sync when adding checks)
const ISSUES = [
  "skills[a]: duplicate skill id",
  "clusters[c1]: unknown skill math/x",
  "clusters[c1]: unknown boss b1",
  "skills: world needs at least one skill",
  "clusters[c1]: has no boss",
  "schools[s]: has no final boss",
  "skills[a].def: placeholder {{...}} used outside a question",
  "skills[a]: unknown school math/x (primary school must be in this world)",
  "clusters[c1]: unknown school math/x",
  "skills[a]: unknown cluster c9",
  "skills[a]: tier 1 is lower than its cluster tier 2",
  "skills[a]: Lv3 has 1 practices (needs 2); lower maxLevel or add practices",
  "skills: prerequisite cycle: a -> b -> a",
  "placement[p1]: school math/x has no tier 3",
  "bosses[b1].steps[2]: same answer as the previous step (12 V)",
  "skills[a]: core skill needs at least 2 practices (has 1)",
  "skills[a]: core skill practices must use different contexts",
  "skills[a]: core skill needs at least 1 practice marked encounter",
  "placement: school math/x tier 1 has 2 questions (need at least 4)",
  "practices[p1]: document content must use source.license (CC-BY-4.0), found CC0-1.0",
  "practices[p1]: supplement content must use license.default (CC0-1.0), found CC-BY-4.0",
  "practices[p1].question: placeholder {{V}} has no matching variable",
  "practices[p1].question: answer index 4 is outside 4 options",
  "practices[p1].question: duplicate option",
  "practices[p1].question: why has 3 entries for 4 options",
  "practices[p1].question.mistakes[0]: value 5e-16 is more than 10^7 times away from the answer",
  "practices[p1].question.mistakes[0]: value 0.99 is the same as the answer",
  "practices[p1].question.mistakes[1]: duplicate mistake value 12",
  "practices[p1].question: shown must be a permutation of 0..3",
  "practices[p1].question.output: unknown variable: k",
  "practices[p1].question.pass: pass must be a comparison (< > <= >=)",
  "practices[p1].question.pass: never passes anywhere in the slider range",
  "practices[p1].question.fig.series[0]: not a finite number anywhere in the x range",
  "practices[p1].question.fig.series[0]: not finite at some of 50 samples",
  'practices[p1].question.answer: unknown variable: R (in "V/R")',
  'practices[p1].question.output: result is not a finite number: 1/x at {"x":0}',
  "check: check failed: boom",
];

test("every check-world message template has a Chinese rendering", () => {
  for (const issue of ISSUES) {
    const { text } = describeIssue(issue);
    assert.ok(CJK.test(text), `no translation for: ${issue}`);
  }
});

test("describeIssue splits the path and keeps ids and numbers", () => {
  const r = describeIssue("skills[math/mean]: Lv3 has 1 practices (needs 2); lower maxLevel or add practices");
  assert.equal(r.path, "skills[math/mean]");
  assert.match(r.text, /Lv3/);
  assert.match(r.text, /1/);
  assert.match(r.text, /2/);
});

test("describeIssue marks in-progress gaps", () => {
  const r = describeIssue("clusters[c1]: unknown skill math/x (not generated yet?)");
  assert.equal(r.pending, true);
  assert.match(r.text, /math\/x/);
  assert.match(r.text, /尚未生成/);
});

test("describeIssue returns unknown messages unchanged", () => {
  assert.deepEqual(describeIssue("x: something new"), { path: "x", text: "something new", pending: false });
  assert.deepEqual(describeIssue("no colon here"), { path: "", text: "no colon here", pending: false });
});

const IMPORT_ERRORS = [
  "code block 2 is not valid JSON: Unexpected token a",
  "input is not valid JSON: Unexpected token a",
  "item 1 is not a JSON object",
  "part 1 has no world id",
  "item 1 is neither a world nor a world part (kind: none)",
  "nothing to merge",
  "part ch2 belongs to world b, expected a",
  "part fix-1 removes from unknown list foo",
  "one paste contains parts of several worlds: a, b",
  "world has no id",
  "skills is not a list",
  "practices[3]: has no question",
];

test("every import error has a Chinese rendering", () => {
  for (const m of IMPORT_ERRORS) assert.ok(CJK.test(describeImportError(m)), `no translation for: ${m}`);
});

test("describeImportError translates each part of a joined message", () => {
  const text = describeImportError("world has no id；skills[0]: has no id");
  assert.equal(text.split("；").length, 2);
  for (const piece of text.split("；")) assert.ok(CJK.test(piece));
});
```

- [ ] **Step 2: 執行，確認失敗**

Run: `node --test test/messages-zh.test.mjs`
Expected: FAIL，`Cannot find module '../engine/messages-zh.js'`

- [ ] **Step 3: 實作**

```js
// Chinese rendering of check-world issues and import errors for the player (framework 9.2).
// The English originals stay the source of truth: fix requests send them to the AI unchanged.

const PENDING = " (not generated yet?)";

const NOUNS = {
  skill: "技能", practice: "練習關卡", placement: "分級測驗題", boss: "Boss",
  cluster: "技能群", school: "流派", achievement: "成就",
};

// Messages from engine/expr.js, shown inside expression errors
const EXPR = [
  [/^unknown variable: (.+)$/, (m) => `未知的變數 ${m[1]}`],
  [/^variable (\S+) is not a number$/, (m) => `變數 ${m[1]} 不是數字`],
  [/^result is not a finite number: (.+)$/, (m) => `結果不是有限的數值（${m[1]}）`],
  [/^empty expression$/, () => "運算式是空的"],
  [/^expression longer than (\d+) characters$/, (m) => `運算式超過 ${m[1]} 個字元`],
  [/^(unexpected|expected) .*/, (m) => `語法錯誤（${m[0]}）`],
];
const expr = (msg) => translate(EXPR, msg) ?? msg;

// [pattern on the message, Chinese template]; first match wins, so specific patterns come first
const ISSUE_RULES = [
  [/^(.+) \(in (".*")\)$/s, (m) => `運算式 ${m[2]} 有誤：${expr(m[1])}`],
  [/^(.+) at (\{.*\})$/s, (m) => `代入 ${m[2]} 時計算失敗：${expr(m[1])}`],
  [/^duplicate (\w+) id$/, (m) => `${NOUNS[m[1]] ?? m[1]} ID 重複`],
  [/^unknown skill (.+)$/, (m) => `引用了不存在的技能 ${m[1]}`],
  [/^unknown boss (.+)$/, (m) => `引用了不存在的 Boss ${m[1]}`],
  [/^world needs at least one skill$/, () => "世界至少需要一個技能"],
  [/^has no boss$/, () => "沒有指定 Boss"],
  [/^has no final boss$/, () => "沒有指定最終 Boss"],
  [/^placeholder \{\{\.\.\.\}\} used outside a question$/, () => "題目以外的欄位使用了 {{...}} 佔位符"],
  [/^unknown school (\S+) \(primary school must be in this world\)$/, (m) => `主要流派 ${m[1]} 不在本世界`],
  [/^unknown school (\S+)$/, (m) => `引用了不存在的流派 ${m[1]}`],
  [/^unknown cluster (.+)$/, (m) => `引用了不存在的技能群 ${m[1]}`],
  [/^tier (\d+) is lower than its cluster tier (\d+)$/, (m) => `階級 ${m[1]} 低於所屬技能群的階級 ${m[2]}`],
  [/^Lv(\d) has (\d+) practices \(needs (\d+)\); lower maxLevel or add practices$/,
    (m) => `Lv${m[1]} 只有 ${m[2]} 題（需要 ${m[3]} 題）；請下修 maxLevel 或補題`],
  [/^prerequisite cycle: (.+)$/, (m) => `先修關係形成循環：${m[1]}`],
  [/^school (\S+) has no tier (\d+)$/, (m) => `流派 ${m[1]} 沒有階級 ${m[2]}`],
  [/^same answer as the previous step \((.+)\)$/, (m) => `答案與前一步相同（${m[1]}）`],
  [/^core skill needs at least 2 practices \(has (\d+)\)$/, (m) => `核心技能至少需要 2 題練習（目前 ${m[1]} 題）`],
  [/^core skill practices must use different contexts$/, () => "核心技能的練習必須使用不同情境"],
  [/^core skill needs at least 1 practice marked encounter$/, () => "核心技能至少需要 1 題標記為遭遇（encounter）"],
  [/^school (\S+) tier (\d+) has (\d+) questions \(need at least (\d+)\)$/,
    (m) => `流派 ${m[1]} 階級 ${m[2]} 的分級測驗題只有 ${m[3]} 題（至少 ${m[4]} 題）`],
  [/^document content must use source\.license \((.+)\), found (.+)$/, (m) => `文件內容的授權應為 ${m[1]}，實際為 ${m[2]}`],
  [/^supplement content must use license\.default \((.+)\), found (.+)$/, (m) => `補充內容的授權應為 ${m[1]}，實際為 ${m[2]}`],
  [/^placeholder \{\{(\w+)\}\} has no matching variable$/, (m) => `佔位符 {{${m[1]}}} 沒有對應的變數`],
  [/^answer index (\d+) is outside (\d+) options$/, (m) => `正解索引 ${m[1]} 超出 ${m[2]} 個選項`],
  [/^duplicate option$/, () => "選項重複"],
  [/^why has (\d+) entries for (\d+) options$/, (m) => `錯因說明有 ${m[1]} 筆，但選項有 ${m[2]} 個`],
  [/^value (\S+) is more than 10\^7 times away from the answer$/, (m) => `干擾值 ${m[1]} 與正解相差超過 10^7 倍`],
  [/^value (\S+) is the same as the answer$/, (m) => `干擾值 ${m[1]} 取有效位數後與正解相同`],
  [/^duplicate mistake value (\S+)$/, (m) => `干擾值 ${m[1]} 與另一個干擾值相同`],
  [/^shown must be a permutation of 0\.\.(\d+)$/, (m) => `shown 必須是 0 到 ${m[1]} 的排列`],
  [/^unknown variable: (.+)$/, (m) => `未知的變數 ${m[1]}`],
  [/^pass must be a comparison/, () => "pass 必須是比較式（< > <= >=）"],
  [/^never passes anywhere in the slider range$/, () => "滑桿範圍內沒有任何位置能通過"],
  [/^not a finite number anywhere in the x range$/, () => "在 x 範圍內沒有任何有限值"],
  [/^not finite at some of (\d+) samples$/, (m) => `${m[1]} 個取樣點中有部分不是有限值`],
  [/^check failed: (.+)$/s, (m) => `檢查程式出錯：${m[1]}`],
];

const IMPORT_RULES = [
  [/^code block (\d+) is not valid JSON: (.+)$/s, (m) => `第 ${m[1]} 個程式碼區塊不是有效的 JSON（${m[2]}）`],
  [/^input is not valid JSON: (.+)$/s, (m) => `貼上的內容不是有效的 JSON，也沒有程式碼區塊（${m[1]}）`],
  [/^item (\d+) is not a JSON object$/, (m) => `第 ${m[1]} 項不是 JSON 物件`],
  [/^part (\d+) has no world id$/, (m) => `第 ${m[1]} 個片段沒有 world 欄位`],
  [/^item (\d+) is neither a world nor a world part \(kind: (.+)\)$/, (m) => `第 ${m[1]} 項既不是世界檔也不是世界片段（kind: ${m[2]}）`],
  [/^nothing to merge$/, () => "沒有可匯入的內容"],
  [/^part (\S+) belongs to world (\S+), expected (\S+)$/, (m) => `片段 ${m[1]} 屬於世界 ${m[2]}，不是 ${m[3]}`],
  [/^part (\S+) removes from unknown list (\S+)$/, (m) => `片段 ${m[1]} 的 remove 指定了不存在的清單 ${m[2]}`],
  [/^one paste contains parts of several worlds: (.+)$/, (m) => `一次貼上的內容包含多個世界：${m[1]}`],
  [/^world is not an object$/, () => "世界不是 JSON 物件"],
  [/^world has no id$/, () => "世界沒有 id"],
  [/^(\w+) is not a list$/, (m) => `${m[1]} 不是清單`],
  [/^(\w+\[\d+\]): has no id$/, (m) => `${m[1]} 沒有 id`],
  [/^(\w+\[\d+\]): has no skills list$/, (m) => `${m[1]} 沒有 skills 清單`],
  [/^(\w+\[\d+\]): has no question$/, (m) => `${m[1]} 沒有題目`],
];

// Apply the first matching rule; undefined when none matches
function translate(rules, msg) {
  for (const [re, render] of rules) {
    const m = msg.match(re);
    if (m) return render(m);
  }
  return undefined;
}

/**
 * Render one "path: message" issue from checkWorld.
 * @returns {{ path: string, text: string, pending: boolean }}  pending: may only mean "not generated yet"
 */
export function describeIssue(issue) {
  const s = String(issue);
  const i = s.indexOf(": ");
  const path = i < 0 ? "" : s.slice(0, i);
  let msg = i < 0 ? s : s.slice(i + 2);
  const pending = msg.endsWith(PENDING);
  if (pending) msg = msg.slice(0, -PENDING.length);
  const zh = translate(ISSUE_RULES, msg);
  if (zh === undefined) return { path, text: pending ? msg + PENDING : msg, pending };
  return { path, text: pending ? `${zh}（可能尚未生成）` : zh, pending };
}

/** Render an ImportError message; shape problems joined with "；" are translated one by one. */
export function describeImportError(message) {
  return String(message).split("；").map((m) => translate(IMPORT_RULES, m) ?? m).join("；");
}
```

- [ ] **Step 4: 執行，確認通過**

Run: `node --test test/messages-zh.test.mjs`
Expected: PASS（6 tests）

- [ ] **Step 5: 提交**

```bash
git add engine/messages-zh.js test/messages-zh.test.mjs
git commit -m "Add Chinese rendering of validation issues and import errors"
```

---

### Task 2: `engine/store.js` 列出與刪除

**Files:**
- Modify: `engine/store.js`
- Test: `test/store.test.mjs`

- [ ] **Step 1: 寫失敗的測試**

```js
// Tests for the memory store; the IndexedDB store implements the same interface (design spec 4).
import { test } from "node:test";
import assert from "node:assert/strict";
import { createMemoryStore } from "../engine/store.js";

test("listWorlds returns every stored world", async () => {
  const s = createMemoryStore();
  await s.putWorld({ id: "a", world: { id: "a" } });
  await s.putWorld({ id: "b", world: { id: "b" } });
  assert.deepEqual((await s.listWorlds()).map((r) => r.id).sort(), ["a", "b"]);
});

test("deleteWorld removes the world and clears meta that points at it", async () => {
  const s = createMemoryStore();
  await s.putWorld({ id: "a" });
  await s.putWorld({ id: "b" });
  await s.putMeta({ world: "a", pos: { x: 1, y: 2 } });
  await s.deleteWorld("a");
  assert.equal(await s.getWorld("a"), undefined);
  assert.equal(await s.getMeta(), undefined);
  assert.deepEqual((await s.listWorlds()).map((r) => r.id), ["b"]);
});

test("deleteWorld keeps meta for another world", async () => {
  const s = createMemoryStore();
  await s.putWorld({ id: "a" });
  await s.putMeta({ world: "b" });
  await s.deleteWorld("a");
  assert.deepEqual(await s.getMeta(), { world: "b" });
});
```

- [ ] **Step 2: 執行，確認失敗**

Run: `node --test test/store.test.mjs`
Expected: FAIL，`createMemoryStore` 不是匯出項目

- [ ] **Step 3: 實作**

在 `idbStore(db)` 的回傳物件加入（`del` 與 `getAll` 定義在 `get`、`put` 之後）：

```js
  const del = (store, key) => request(db.transaction(store, "readwrite").objectStore(store).delete(key));
  const getAll = (store) => request(db.transaction(store).objectStore(store).getAll());
```

```js
    listWorlds: () => getAll("worlds"),
    // Forget the last position too when it points at the deleted world
    deleteWorld: async (id) => {
      await del("worlds", id);
      const meta = await get("meta", "current");
      if (meta?.world === id) await del("meta", "current");
    },
```

把 `function memoryStore()` 改為 `export function createMemoryStore()`（`openStore` 中的呼叫一併改名），回傳物件加入：

```js
    listWorlds: async () => [...data.entries()].filter(([k]) => k.startsWith("world:")).map(([, v]) => structuredClone(v)),
    deleteWorld: async (id) => {
      data.delete(`world:${id}`);
      if (data.get("meta")?.world === id) data.delete("meta");
    },
```

並在 `createMemoryStore` 上方加註解：`/** In-memory store with the same interface; used when IndexedDB is unavailable and in tests. */`

- [ ] **Step 4: 執行，確認通過**

Run: `node --test test/store.test.mjs` → PASS（3 tests）；`npm test` 全部通過

- [ ] **Step 5: 提交**

```bash
git add engine/store.js test/store.test.mjs
git commit -m "Add listWorlds and deleteWorld to the store"
```

---

### Task 3: `app/workbench.js`

**Files:**
- Create: `app/workbench.js`
- Test: `test/workbench.test.mjs`

- [ ] **Step 1: 寫失敗的測試**

```js
// Tests for turning pasted AI replies into stored world records (design spec 3, 4).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readPaste, worldIdOf, applyImport, partLabel, partRows } from "../app/workbench.js";
import { ImportError } from "../engine/merge.js";
import { splitWorld } from "./helpers/split-world.mjs";

const base = JSON.parse(readFileSync(new URL("./fixtures/valid-world.json", import.meta.url), "utf8"));
const parts = () => splitWorld(structuredClone(base));
const fence = (obj) => "這是片段，請匯入。\n```json\n" + JSON.stringify(obj) + "\n```\n";
const T1 = "2026-10-11T01:00:00.000Z";
const T2 = "2026-10-11T02:00:00.000Z";

test("readPaste returns the documents and their world id", () => {
  const [head] = parts();
  const r = readPaste(fence(head));
  assert.equal(r.worldId, base.id);
  assert.equal(r.docs.length, 1);
});

test("readPaste rejects a paste that mixes worlds", () => {
  const [head] = parts();
  const other = { ...head, world: "other-world" };
  assert.throws(() => readPaste(fence(head) + fence(other)), (e) => e instanceof ImportError && /several worlds/.test(e.message));
});

test("worldIdOf reads parts and full worlds", () => {
  assert.equal(worldIdOf([{ kind: "part", world: "w" }]), "w");
  assert.equal(worldIdOf([{ id: "w", framework: "expert-quest/1.0" }]), "w");
  assert.equal(worldIdOf([{}]), undefined);
});

test("applyImport creates an in-progress world from a head part", () => {
  const [head] = parts();
  const rec = applyImport(undefined, [head], T1);
  assert.equal(rec.id, base.id);
  assert.equal(rec.complete, false);
  assert.deepEqual(rec.imports, [{ part: "head", at: T1 }]);
  assert.equal(rec.importedAt, T1);
  assert.ok(rec.issues.warnings.some((w) => w.endsWith("(not generated yet?)")));
  assert.deepEqual(rec.issues.errors, []);
});

test("applyImport appends later parts and completes the world", () => {
  const all = parts();
  let rec = applyImport(undefined, [all[0]], T1);
  rec = applyImport(rec, all.slice(1), T2);
  assert.equal(rec.complete, true);
  assert.equal(rec.parts.length, all.length);
  assert.deepEqual(rec.issues, { errors: [], warnings: [] });
  assert.equal(rec.imports.at(-1).at, T2);
});

test("a full world replaces every stored part", () => {
  const all = parts();
  let rec = applyImport(undefined, all.slice(0, 2), T1);
  rec = applyImport(rec, [structuredClone(base)], T2);
  assert.equal(rec.parts.length, 1);
  assert.deepEqual(rec.imports, [{ part: "world", at: T2 }]);
  assert.equal(rec.complete, true);
});

test("applyImport derives import rows for old records without imports", () => {
  const all = parts();
  const old = { id: base.id, parts: [all[0]] };
  const rec = applyImport(old, [all[1]], T2);
  assert.deepEqual(rec.imports.map((r) => r.part), ["head", all[1].part]);
  assert.equal(rec.imports[0].at, null);
});

test("applyImport rejects a world the engine cannot load", () => {
  const bad = { framework: "expert-quest/1.0", kind: "part", world: "w", part: "ch1", practices: [{ id: "p1" }] };
  assert.throws(() => applyImport(undefined, [bad], T1), (e) => e instanceof ImportError && /has no question/.test(e.message));
});

test("partLabel names parts and full worlds", () => {
  assert.equal(partLabel({ kind: "part", part: "fix-2" }), "fix-2");
  assert.equal(partLabel({ id: "w" }), "world");
});

test("partRows marks earlier copies of the same part as replaced", () => {
  const rec = { imports: [{ part: "head", at: T1 }, { part: "ch1", at: T1 }, { part: "ch1", at: T2 }] };
  assert.deepEqual(partRows(rec).map((r) => r.replaced), [false, true, false]);
});
```

- [ ] **Step 2: 執行，確認失敗**

Run: `node --test test/workbench.test.mjs`
Expected: FAIL，`Cannot find module '../app/workbench.js'`

- [ ] **Step 3: 實作**

```js
// Turn pasted AI replies into stored world records (app design spec 3, 4).
// Pure functions shared by app/app.js and engine/main.js; storage is the caller's job.
import { parseImport, mergeParts, ImportError } from "../engine/merge.js";
import { checkWorld, assertShape } from "../engine/check-world.js";

/** Name shown for an imported document: the part name, or "world" for a full world file. */
export function partLabel(doc) {
  return doc?.kind === "part" ? String(doc.part ?? "?") : "world";
}

/** World id a list of documents belongs to; undefined when the first one has none. */
export function worldIdOf(docs) {
  const d = docs[0];
  const id = d?.kind === "part" ? d.world : d?.id;
  return typeof id === "string" && id ? id : undefined;
}

/**
 * Parse pasted text and find which world it belongs to.
 * @returns {{ docs: object[], worldId: string | undefined }}
 * @throws {ImportError} when the text has no valid JSON or mixes several worlds
 */
export function readPaste(text) {
  const docs = parseImport(text);
  const ids = [...new Set(docs.map((d) => worldIdOf([d])).filter(Boolean))];
  if (ids.length > 1) throw new ImportError(`one paste contains parts of several worlds: ${ids.join(", ")}`);
  return { docs, worldId: worldIdOf(docs) };
}

// checkWorld must never break the workbench; a crash becomes one error
function check(world, complete) {
  try {
    return checkWorld(world, { partial: !complete });
  } catch (e) {
    return { errors: [`check: check failed: ${e.message}`], warnings: [] };
  }
}

/**
 * Merge new documents after a stored record (framework 8.7 rule 1) and validate the result.
 * A full world file covers everything, so it drops the parts before it.
 * @param {object | undefined} existing  stored record of the same world
 * @param {object[]} docs  newly imported documents
 * @param {string} now  ISO time of this import
 * @returns {object}  new record { id, world, complete, parts, imports, importedAt, issues }
 * @throws {ImportError} when merging fails or the engine could not load the result
 */
export function applyImport(existing, docs, now) {
  const oldParts = existing?.parts ?? [];
  const oldImports = existing?.imports ?? oldParts.map((d) => ({ part: partLabel(d), at: null }));
  let allParts = [...oldParts, ...docs];
  let imports = [...oldImports, ...docs.map((d) => ({ part: partLabel(d), at: now }))];
  const lastWorld = allParts.findLastIndex((d) => d?.kind !== "part");
  if (lastWorld > 0) {
    allParts = allParts.slice(lastWorld);
    imports = imports.slice(lastWorld);
  }

  const { world, complete } = mergeParts(allParts);
  const problems = assertShape(world);
  if (problems.length) throw new ImportError(problems.slice(0, 5).join("；"));
  return { id: world.id, world, complete, parts: allParts, imports, importedAt: now, issues: check(world, complete) };
}

/** Rows for the part list; an earlier import of a part name imported again later is "replaced". */
export function partRows(rec) {
  const rows = rec.imports ?? (rec.parts ?? []).map((d) => ({ part: partLabel(d), at: null }));
  return rows.map((r, i) => ({ ...r, replaced: rows.slice(i + 1).some((later) => later.part === r.part) }));
}
```

- [ ] **Step 4: 執行，確認通過**

Run: `node --test test/workbench.test.mjs` → PASS（10 tests）；`npm test` 全部通過

- [ ] **Step 5: 提交**

```bash
git add app/workbench.js test/workbench.test.mjs
git commit -m "Add workbench import logic for pasted parts"
```

---

### Task 4: `app/fix-request.js`

**Files:**
- Create: `app/fix-request.js`
- Test: `test/fix-request.test.mjs`

- [ ] **Step 1: 寫失敗的測試**

```js
// Tests for the fix request the player pastes back to the chat AI (framework 4.6, design spec 4.1).
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildFixRequest, nextFixNumber } from "../app/fix-request.js";

const rec = (issues, imports = [{ part: "head" }]) => ({ id: "w1", issues, imports });

test("nextFixNumber continues after the highest fix part", () => {
  assert.equal(nextFixNumber(rec({}, [{ part: "head" }])), 1);
  assert.equal(nextFixNumber(rec({}, [{ part: "fix-1" }, { part: "fix-3" }, { part: "ch2" }])), 4);
});

test("buildFixRequest returns null when there is nothing to fix", () => {
  assert.equal(buildFixRequest(rec({ errors: [], warnings: ["a: unknown skill x (not generated yet?)"] })), null);
});

test("buildFixRequest lists errors and real warnings in English and names the next part", () => {
  const text = buildFixRequest(rec({
    errors: ["practices[p1].question: duplicate option"],
    warnings: ["clusters[c1]: unknown skill x (not generated yet?)", "bosses[b].steps[1]: same answer as the previous step (2 A)"],
  }, [{ part: "head" }, { part: "fix-1" }]));
  assert.match(text, /fix-2/);
  assert.match(text, /world: w1/);
  assert.match(text, /- practices\[p1\]\.question: duplicate option/);
  assert.match(text, /- bosses\[b\]\.steps\[1\]: same answer/);
  assert.doesNotMatch(text, /not generated yet/);
  assert.match(text, /remove/);
});

test("buildFixRequest omits the warnings heading when only errors exist", () => {
  const text = buildFixRequest(rec({ errors: ["x: duplicate option"], warnings: [] }));
  assert.doesNotMatch(text, /提醒：/);
});
```

- [ ] **Step 2: 執行，確認失敗**

Run: `node --test test/fix-request.test.mjs`
Expected: FAIL，找不到模組

- [ ] **Step 3: 實作**

```js
// Build the fix request a player pastes back to the chat AI (framework 4.6, 9.3; design spec 4.1).
// Messages stay in English so the AI can match them exactly; the screen shows them in Chinese.

const PENDING = "(not generated yet?)";

/** Number for the next fix part: one more than the highest fix-N imported so far. */
export function nextFixNumber(rec) {
  let max = 0;
  for (const r of rec.imports ?? []) {
    const m = /^fix-(\d+)$/.exec(r.part ?? "");
    if (m) max = Math.max(max, Number(m[1]));
  }
  return max + 1;
}

/**
 * @param {object} rec  stored world record with issues
 * @returns {string | null}  text to copy, or null when there is nothing the AI should fix
 */
export function buildFixRequest(rec) {
  const errors = rec.issues?.errors ?? [];
  // "Not generated yet" only means later parts are still coming, so the AI should not act on it
  const warnings = (rec.issues?.warnings ?? []).filter((w) => !w.endsWith(PENDING));
  if (errors.length === 0 && warnings.length === 0) return null;

  const lines = [
    `請依「專家養成記框架」4.6，輸出修正片段 fix-${nextFixNumber(rec)}（world: ${rec.id}）。`,
    "只含修正過的項目（完整項目），沿用原本的 ID；要刪除的項目寫在 remove。",
  ];
  if (errors.length) lines.push("", "錯誤：", ...errors.map((e) => `- ${e}`));
  if (warnings.length) lines.push("", "提醒：", ...warnings.map((w) => `- ${w}`));
  return lines.join("\n");
}
```

- [ ] **Step 4: 執行，確認通過**

Run: `node --test test/fix-request.test.mjs` → PASS（4 tests）

- [ ] **Step 5: 提交**

```bash
git add app/fix-request.js test/fix-request.test.mjs
git commit -m "Add fix request builder"
```

---

### Task 5: `app/prompt.js`

**Files:**
- Create: `app/prompt.js`
- Test: `test/prompt.test.mjs`

- [ ] **Step 1: 寫失敗的測試**

```js
// Tests for the starting prompt from framework chapter 12 (design spec 4.2).
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPrompt } from "../app/prompt.js";

test("buildPrompt fills background and goal", () => {
  const p = buildPrompt({ background: "土木系大三", goal: "看懂水文統計報告" });
  assert.equal(p, "請依照「專家養成記框架」，把這份文件做成學習世界，並依 4.6 以世界片段輸出。我的背景是土木系大三，我想做到看懂水文統計報告。");
});

test("buildPrompt drops a trailing full stop the player typed", () => {
  assert.match(buildPrompt({ background: "高中生。", goal: "考上大學。" }), /高中生，我想做到考上大學。$/);
});

test("buildPrompt appends the scope on its own line", () => {
  const p = buildPrompt({ background: "a", goal: "b", scope: "  只處理第 2 章 " });
  assert.ok(p.endsWith("\n只處理第 2 章"));
});

test("buildPrompt keeps blanks visible when fields are empty", () => {
  assert.match(buildPrompt({ background: "", goal: " " }), /背景是＿＿＿，我想做到＿＿＿。/);
});
```

- [ ] **Step 2: 執行，確認失敗**

Run: `node --test test/prompt.test.mjs` → FAIL

- [ ] **Step 3: 實作**

```js
// Starting prompt for a chat AI, from framework chapter 12 (design spec 4.2).

const BLANK = "＿＿＿";

// Trim the field and drop a trailing full stop so the sentence reads naturally
const clean = (s) => String(s ?? "").trim().replace(/[。．.]+$/, "");

/**
 * @param {{ background: string, goal: string, scope?: string }} form
 * @returns {string}
 */
export function buildPrompt({ background, goal, scope }) {
  const b = clean(background) || BLANK;
  const g = clean(goal) || BLANK;
  let text = `請依照「專家養成記框架」，把這份文件做成學習世界，並依 4.6 以世界片段輸出。我的背景是${b}，我想做到${g}。`;
  const s = String(scope ?? "").trim();
  if (s) text += `\n${s}`;
  return text;
}
```

- [ ] **Step 4: 執行，確認通過**

Run: `node --test test/prompt.test.mjs` → PASS（4 tests）

- [ ] **Step 5: 提交**

```bash
git add app/prompt.js test/prompt.test.mjs
git commit -m "Add starting prompt builder"
```

---

### Task 6: 引擎中立測試涵蓋 `app/`

**Files:**
- Modify: `test/engine-neutral.test.mjs`

- [ ] **Step 1:** 把測試改成同時掃描 `engine/` 與 `app/`：

```js
// The engine and the app must not be tied to any particular book (CLAUDE.md section 5).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";

const banned = [/sadiku/i, /alexander/i, /electric circuits/i, /電路學/, /電路之城/, /歐姆/, /\bohm/i, /kirchhoff/i, /naghettini/i, /hydrology/i];

for (const name of ["engine", "app"]) {
  test(`${name} files contain no book-specific text`, () => {
    const dir = new URL(`../${name}/`, import.meta.url);
    const files = readdirSync(dir).filter((f) => /\.(js|html)$/.test(f));
    for (const f of files) {
      const text = readFileSync(new URL(f, dir), "utf8");
      for (const b of banned) assert.ok(!b.test(text), `${name}/${f} matches ${b}`);
    }
  });
}
```

- [ ] **Step 2:** `npm test` 全部通過（app/ 測試中的範例文字「水文統計報告」只出現在 `test/`，不受影響）

- [ ] **Step 3: 提交**

```bash
git add test/engine-neutral.test.mjs
git commit -m "Extend the book-neutral check to app/"
```

---

### Task 7: 首頁 `app/index.html` 與 `app/app.js`

**Files:**
- Create: `app/index.html`、`app/app.js`

- [ ] **Step 1: 寫 `app/index.html`**

```html
<!doctype html>
<html lang="zh-Hant-TW">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>專家養成記</title>
<style>
  :root {
    --bg: #f7f6f2; --fg: #1d1d1b; --muted: #66655f; --line: #dad8d0; --card: #ffffff;
    --accent: #2f5fb8; --ok: #1f7a3a; --bad: #b3261e; --warn: #8a5a00;
    color-scheme: light dark;
  }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) { --bg: #1b1c1e; --fg: #ececea; --muted: #a2a19b; --line: #36373a; --card: #242528; --accent: #7aa2f0; --ok: #5cc27a; --bad: #ff8a80; --warn: #e0b050; }
  }
  :root[data-theme="dark"] { --bg: #1b1c1e; --fg: #ececea; --muted: #a2a19b; --line: #36373a; --card: #242528; --accent: #7aa2f0; --ok: #5cc27a; --bad: #ff8a80; --warn: #e0b050; }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--fg); font: 15px/1.6 system-ui, "Noto Sans TC", sans-serif; }
  header { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 12px 16px; border-bottom: 1px solid var(--line); }
  header h1 { font-size: 18px; margin: 0 auto 0 0; }
  header a { color: inherit; text-decoration: none; }
  main { max-width: 860px; margin: 0 auto; padding: 16px; }
  button, .btn { font: inherit; cursor: pointer; padding: 6px 12px; border-radius: 6px; border: 1px solid var(--line); background: var(--card); color: var(--fg); text-decoration: none; display: inline-block; }
  .primary { background: var(--accent); border-color: var(--accent); color: #fff; }
  button:disabled { opacity: 0.5; cursor: default; }
  .card { background: var(--card); border: 1px solid var(--line); border-radius: 8px; padding: 12px 14px; margin: 10px 0; }
  .row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
  .muted { color: var(--muted); }
  .error { color: var(--bad); }
  .ok { color: var(--ok); }
  .warn { color: var(--warn); }
  textarea, input { width: 100%; font: 14px/1.5 ui-monospace, Consolas, monospace; padding: 8px; border-radius: 6px; border: 1px solid var(--line); background: var(--card); color: var(--fg); }
  input { font-family: inherit; }
  textarea { min-height: 160px; resize: vertical; }
  .drop { outline: 2px dashed var(--accent); }
  ul.issues { padding-left: 18px; margin: 6px 0; }
  ul.issues code { color: var(--muted); font-size: 12px; word-break: break-all; }
  pre.prompt { white-space: pre-wrap; background: var(--card); border: 1px solid var(--line); border-radius: 6px; padding: 10px; }
  table { border-collapse: collapse; width: 100%; }
  td { padding: 4px 6px; border-bottom: 1px solid var(--line); }
  .replaced { color: var(--muted); text-decoration: line-through; }
  #status { min-height: 1.6em; }
  label { display: block; margin: 10px 0 4px; }
  [hidden] { display: none !important; }
</style>
</head>
<body>
<header>
  <h1><a href="#/">專家養成記</a></h1>
  <a class="btn" href="#/start">新增世界</a>
  <a class="btn" href="#/import">匯入</a>
  <span id="volatile" class="warn" hidden>此瀏覽器無法保存資料，關閉頁面後會遺失</span>
</header>
<main id="view"></main>
<script type="module" src="app.js"></script>
</body>
</html>
```

- [ ] **Step 2: 寫 `app/app.js`**

```js
// Home page: world list, import workbench and tutorial (app design spec 2).
// Logic lives in workbench.js, fix-request.js and prompt.js; this file only renders and wires events.
import { openStore } from "../engine/store.js";
import { ImportError } from "../engine/merge.js";
import { describeIssue, describeImportError } from "../engine/messages-zh.js";
import { readPaste, applyImport, partRows } from "./workbench.js";
import { buildFixRequest } from "./fix-request.js";
import { buildPrompt } from "./prompt.js";

const FRAMEWORK_URL = "../framework/expert-quest-framework.md";
const GAME_URL = (id) => `../engine/index.html?world=${encodeURIComponent(id)}`;

let store;
const view = document.getElementById("view");

async function safe(promise) {
  try { return await promise; } catch (e) { console.warn(e); return undefined; }
}

// Build an element: h("p", { class: "muted" }, "text", child, ...)
function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) el.setAttribute(k, v === true ? "" : v);
  }
  el.append(...children.flat().filter((c) => c != null && c !== false));
  return el;
}

const time = (iso) => (iso ? new Date(iso).toLocaleString("zh-TW", { hour12: false }) : "（時間不明）");
const partName = (p) => (p === "world" ? "完整世界檔" : p);
const pendingCount = (rec) => (rec.issues?.warnings ?? []).filter((w) => describeIssue(w).pending).length;

// ---- world list (#/) ----

async function renderList() {
  const worlds = ((await safe(store.listWorlds())) ?? []).sort((a, b) => String(b.importedAt).localeCompare(String(a.importedAt)));
  if (worlds.length === 0) {
    view.replaceChildren(h("div", { class: "card" },
      h("p", {}, "還沒有任何世界。先在聊天型 AI 中依框架產生世界片段，再貼進匯入工作台。"),
      h("a", { class: "btn primary", href: "#/start" }, "從教學開始")));
    return;
  }
  view.replaceChildren(h("h2", {}, "我的世界"), ...worlds.map((rec) => {
    const errors = rec.issues?.errors?.length ?? 0;
    const warnings = (rec.issues?.warnings?.length ?? 0) - pendingCount(rec);
    return h("div", { class: "card" },
      h("div", { class: "row" },
        h("strong", {}, rec.world?.title ?? rec.id),
        h("span", { class: rec.complete ? "ok" : "warn" }, rec.complete ? "已完成" : "進行中"),
        h("span", { class: "muted" }, `${rec.parts?.length ?? 0} 個片段`),
        errors ? h("span", { class: "error" }, `${errors} 個錯誤`) : null,
        warnings > 0 ? h("span", { class: "warn" }, `${warnings} 個提醒`) : null),
      h("div", { class: "row", style: "margin-top:8px" },
        h("a", { class: "btn", href: `#/world/${encodeURIComponent(rec.id)}` }, "工作台"),
        h("a", { class: "btn primary", href: GAME_URL(rec.id) }, "進入遊戲"),
        h("button", { type: "button", onclick: () => removeWorld(rec) }, "刪除")));
  }));
}

async function removeWorld(rec) {
  const title = rec.world?.title ?? rec.id;
  if (!confirm(`刪除「${title}」？世界資料會從這個瀏覽器移除（學習進度保留）。`)) return;
  await safe(store.deleteWorld(rec.id));
  renderList();
}

// ---- workbench (#/import, #/world/<id>) ----

async function renderWorkbench(worldId, notice) {
  const rec = worldId ? await safe(store.getWorld(worldId)) : undefined;
  const status = h("p", { id: "status", role: "status" }, notice ?? "");
  const input = h("textarea", { placeholder: "把 AI 的整段回覆貼在這裡（含 ```json 程式碼區塊），或拖入檔案", "aria-label": "貼上 AI 的回覆" });
  const file = h("input", { type: "file", multiple: true, accept: ".json,.txt,.md,application/json,text/plain", hidden: true });

  const run = async (texts) => {
    for (const text of texts) {
      const message = await importOne(text);
      if (message.error) { status.className = "error"; status.textContent = message.error; return; }
      worldId = message.worldId;
      notice = message.text;
    }
    location.hash = `#/world/${encodeURIComponent(worldId)}`;
    renderWorkbench(worldId, notice);
  };

  input.addEventListener("dragover", (e) => { e.preventDefault(); input.classList.add("drop"); });
  input.addEventListener("dragleave", () => input.classList.remove("drop"));
  input.addEventListener("drop", async (e) => {
    e.preventDefault();
    input.classList.remove("drop");
    run(await readFiles(e.dataTransfer.files));
  });
  file.addEventListener("change", async () => { const texts = await readFiles(file.files); file.value = ""; run(texts); });

  view.replaceChildren(
    h("h2", {}, rec ? `工作台：${rec.world?.title ?? rec.id}` : "匯入工作台"),
    h("div", { class: "card" },
      input,
      h("div", { class: "row", style: "margin-top:8px" },
        h("button", { type: "button", class: "primary", onclick: () => input.value.trim() && run([input.value]) }, "匯入"),
        h("button", { type: "button", onclick: () => file.click() }, "選擇檔案"),
        file),
      status),
    rec ? renderRecord(rec) : h("p", { class: "muted" }, "貼上 AI 給的任何片段（head、某一章、final 或 fix-N）。程式會依片段中的 world 欄位放進對應的世界。"));
}

// Import one pasted text or file; returns { worldId, text } or { error }
async function importOne(text) {
  try {
    const { docs, worldId } = readPaste(text);
    const existing = worldId ? await safe(store.getWorld(worldId)) : undefined;
    const rec = applyImport(existing, docs, new Date().toISOString());
    await store.putWorld(rec);
    const names = docs.map((d) => partName(d.kind === "part" ? d.part : "world")).join("、");
    const where = rec.world?.title ?? rec.id;
    return { worldId: rec.id, text: `已匯入 ${names} 到「${where}」${existing ? "" : "（新世界）"}。` };
  } catch (e) {
    console.error(e);
    return { error: e instanceof ImportError ? `無法匯入：${describeImportError(e.message)}` : `無法匯入：${e.message}` };
  }
}

// Read dropped or chosen files in name order so ch1 comes before ch2
async function readFiles(fileList) {
  const files = [...fileList].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  return Promise.all(files.map((f) => f.text()));
}

function renderRecord(rec) {
  const errors = rec.issues?.errors ?? [];
  const allWarnings = (rec.issues?.warnings ?? []).map(describeIssue);
  const warnings = allWarnings.filter((w) => !w.pending);
  const pending = allWarnings.length - warnings.length;
  const fix = buildFixRequest(rec);
  const copyStatus = h("span", { class: "muted", role: "status" });
  // Shown only when copying to the clipboard fails
  const fixText = fix ? h("pre", { class: "prompt", hidden: true }, fix) : null;

  const issueList = (items) => h("ul", { class: "issues" }, items.map((d) =>
    h("li", {}, d.text, d.path ? h("br") : null, d.path ? h("code", {}, d.path) : null)));

  return h("div", {},
    h("div", { class: "card" },
      h("div", { class: "row" },
        h("strong", {}, rec.complete ? "已完成" : "進行中"),
        h("span", { class: errors.length ? "error" : "ok" }, errors.length ? `${errors.length} 個錯誤` : "沒有錯誤"),
        warnings.length ? h("span", { class: "warn" }, `${warnings.length} 個提醒`) : null,
        pending ? h("span", { class: "muted" }, `${pending} 項尚未生成`) : null),
      h("div", { class: "row", style: "margin-top:8px" },
        h("button", { type: "button", disabled: !fix, onclick: async () => {
          try { await navigator.clipboard.writeText(fix); copyStatus.textContent = "已複製，請貼回給 AI。"; }
          catch { copyStatus.textContent = "無法自動複製，請手動選取下方文字。"; if (fixText) fixText.hidden = false; }
        } }, "複製修正請求"),
        h("a", { class: "btn primary", href: GAME_URL(rec.id) }, "進入遊戲"),
        copyStatus)),
    fixText,
    errors.length ? h("div", { class: "card" }, h("strong", { class: "error" }, "錯誤"), issueList(errors.map(describeIssue))) : null,
    warnings.length ? h("details", { class: "card" }, h("summary", {}, `提醒（${warnings.length}）`), issueList(warnings)) : null,
    h("div", { class: "card" }, h("strong", {}, "已收到的片段"),
      h("table", {}, partRows(rec).map((r) => h("tr", {},
        h("td", { class: r.replaced ? "replaced" : "" }, partName(r.part)),
        h("td", { class: "muted" }, time(r.at)),
        h("td", { class: "muted" }, r.replaced ? "已取代" : ""))))));
}

// ---- tutorial (#/start) ----

function renderStart() {
  const background = h("input", { type: "text", placeholder: "例如：大學二年級，修過微積分" });
  const goal = h("input", { type: "text", placeholder: "例如：能獨立完成期末專題的資料分析" });
  const scope = h("input", { type: "text", placeholder: "選填，例如：只處理第 2 章" });
  const out = h("pre", { class: "prompt" });
  const copyStatus = h("span", { class: "muted", role: "status" });
  const update = () => { out.textContent = buildPrompt({ background: background.value, goal: goal.value, scope: scope.value }); };
  for (const el of [background, goal, scope]) el.addEventListener("input", update);
  update();

  view.replaceChildren(
    h("h2", {}, "用聊天型 AI 建立新世界"),
    h("div", { class: "card" },
      h("ol", {},
        h("li", {}, "下載框架檔：", h("a", { class: "btn", href: FRAMEWORK_URL, download: "expert-quest-framework.md" }, "下載框架檔")),
        h("li", {}, "在聊天型 AI（例如 claude.ai）開新對話，上傳框架檔與你的文件。文件太大時，可依章分批上傳。"),
        h("li", {}, "填寫下方表單，複製提示詞貼給 AI。AI 會先問你幾個問題（P0）。"),
        h("li", {}, "AI 每給出一個片段，就把整段回覆貼進", h("a", { href: "#/import" }, "匯入工作台"), "。"),
        h("li", {}, "工作台列出問題時，按「複製修正請求」貼回給 AI，再匯入它給的修正片段。"),
        h("li", {}, "對話太長時開新對話，上傳框架檔、文件與 AI 最後一次給的狀態摘要，說「請從這份狀態摘要接續」。"))),
    h("div", { class: "card" },
      h("label", {}, "你的背景（必填）"), background,
      h("label", {}, "你想做到什麼（必填）"), goal,
      h("label", {}, "範圍"), scope,
      h("label", {}, "提示詞"), out,
      h("div", { class: "row" },
        h("button", { type: "button", class: "primary", onclick: async () => {
          if (!background.value.trim() || !goal.value.trim()) { copyStatus.textContent = "請先填寫背景與目標。"; return; }
          try { await navigator.clipboard.writeText(out.textContent); copyStatus.textContent = "已複製。"; }
          catch { copyStatus.textContent = "無法自動複製，請手動選取上方文字。"; }
        } }, "複製提示詞"),
        copyStatus)));
}

// ---- routing ----

function route() {
  const hash = location.hash || "#/";
  const world = hash.match(/^#\/world\/(.+)$/);
  if (world) return renderWorkbench(decodeURIComponent(world[1]));
  if (hash === "#/import") return renderWorkbench();
  if (hash === "#/start") return renderStart();
  return renderList();
}

store = await openStore();
document.getElementById("volatile").hidden = store.persistent;
window.addEventListener("hashchange", route);
route();
```

- [ ] **Step 3:** `npm test` 全部通過（含引擎中立測試掃描 `app/`）

- [ ] **Step 4: 提交**

```bash
git add app/index.html app/app.js
git commit -m "Add the app home page: world list, workbench and tutorial"
```

---

### Task 8: 遊戲畫面接上首頁

**Files:**
- Modify: `engine/main.js`、`engine/index.html`

- [ ] **Step 1: `engine/main.js`**
  - 前兩行 import 改為：
    ```js
    import { parseImport, ImportError } from "./merge.js";
    import { checkWorld } from "./check-world.js";
    import { describeIssue, describeImportError } from "./messages-zh.js";
    import { worldIdOf, applyImport } from "../app/workbench.js";
    ```
  - `onFiles` 的 try 區塊改為：
    ```js
    let docs = [];
    for (const f of files) docs.push(...parseImport(await f.text()));
    // New parts for a world we already have are merged after the stored parts
    const id = worldIdOf(docs);
    const existing = id ? await safe(state.store.getWorld(id)) : null;
    const rec = applyImport(existing ?? undefined, docs, new Date().toISOString());
    await safe(state.store.putWorld(rec));
    startWorld(rec, existing ? state.view?.hero : null);
    toast(`已載入：${rec.world.title ?? rec.id}${rec.complete ? "" : "（進行中）"}`);
    ```
    catch 區塊的訊息改為 `err instanceof ImportError ? \`無法載入：${describeImportError(err.message)}\` : \`無法載入：${err.message}\``。
  - `openIssues` 中的兩行改用中文：
    ```js
    ...errors.map((e) => ({ label: `錯誤：${describeIssue(e).text}（${describeIssue(e).path}）`, tone: "error" })),
    ...warnings.slice(0, 200).map((w) => ({ label: `提醒：${describeIssue(w).text}（${describeIssue(w).path}）`, tone: "muted" })),
    ```
  - `boot()` 結尾改為：
    ```js
    // ?world=<id> from the home page wins over the last world played
    const wanted = new URLSearchParams(location.search).get("world");
    const meta = await safe(state.store.getMeta());
    const pick = wanted ?? meta?.world;
    const rec = pick ? await safe(state.store.getWorld(pick)) : null;
    if (rec) startWorld(rec, rec.id === meta?.world ? meta.pos : null);
    else $("welcome").hidden = false;
    ```

- [ ] **Step 2: `engine/index.html`**
  - `#actions` 最前面加 `<a id="btn-home" href="../app/index.html">首頁</a>`，並在 CSS 的 `#actions button` 規則改為 `#actions button, #actions a { background: var(--hud); color: #fff; border: 0; padding: 8px 12px; border-radius: 8px; text-decoration: none; }`
  - 歡迎畫面的說明改為：`<p>到<a href="../app/index.html">首頁</a>匯入 AI 給的世界片段，或直接選擇世界檔（world.json）與片段。</p>`

- [ ] **Step 3:** `npm test` 全部通過

- [ ] **Step 4: 提交**

```bash
git add engine/main.js engine/index.html
git commit -m "Open worlds from the home page and show issues in Chinese in the game"
```

---

### Task 9: 手動測試

- [ ] **Step 1:** `node tools/serve.mjs`（已在執行則沿用），開 `http://127.0.0.1:8000/app/index.html`
- [ ] **Step 2:** 依序把 `worlds/sadiku-circuits-6e/parts/` 的 head、ch1、ch2、ch3、final 貼進工作台（以 ```json 包住，模擬 AI 回覆）。確認：每次顯示「已匯入」；head 後為進行中且只有「尚未生成」；final 後為已完成、0 錯誤。
- [ ] **Step 3:** 修改一份 ch1 製造錯誤（例如兩個相同選項）再匯入，確認：同名片段標為已取代、錯誤以中文列出、修正請求為 `fix-1` 且含英文原訊息。
- [ ] **Step 4:** 教學頁：表單即時更新提示詞、下載框架檔可用。
- [ ] **Step 5:** 從清單「進入遊戲」開啟正確的世界；遊戲的「首頁」連結回到清單；刪除世界後清單更新。
- [ ] **Step 6:** 結果寫入 `docs/test-log/2026-10-11-app-workbench-manual.md` 並提交。

---

### Task 10: 收尾

- [ ] **Step 1:** CLAUDE.md 第 7 節第 7 步標註「第一段完成（首頁、匯入工作台、教學頁）；第二段備份與技能索引、第三段總覽待做」；第 3 節 repo 結構加入 `app/`（第 3 節修改前先向使用者說明）。
- [ ] **Step 2:** 設計文件狀態改為「已實作」。
- [ ] **Step 3:** 依 superpowers:finishing-a-development-branch 合併回 main。
