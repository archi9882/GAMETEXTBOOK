# 遊戲畫面 A 段：核心可玩版 實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 做出可在瀏覽器遊玩的引擎：載入世界檔或片段，在像素地區地圖上走動，點亮街燈、作答、升級，進度保存在 IndexedDB。

**Architecture:** 瀏覽器原生 ES module，不打包。純邏輯模組（`questions.js`、`progress.js`、`layout.js`）以 `node:test` 先寫測試；畫面模組（`tiles.js`、`map.js`、`panel.js`、`store.js`、`main.js`）手動驗證。沿用既有的 `expr.js`、`merge.js`、`check-world.js`。

**Tech Stack:** JavaScript（ES2022 module）、Canvas 2D、IndexedDB、KaTeX 0.16（MIT，打包進 `engine/vendor/katex/`）、Node 24 `node:test`。

**設計依據：** `docs/superpowers/specs/2026-10-09-playable-engine-a-design.md`

**程式碼區塊標記：** 每個完整檔案的程式碼區塊都以 `file=<路徑>` 標記，執行時可直接抽出寫入該路徑。

---

## 檔案結構

| 檔案 | 動作 | 職責 |
|---|---|---|
| `tools/vendor-katex.mjs` | 新增 | 從 `node_modules/katex` 複製到 `engine/vendor/katex/` |
| `engine/vendor/katex/**` | 新增 | KaTeX、mhchem、auto-render、woff2 字型、授權檔 |
| `engine/questions.js` | 新增 | 題目準備與判分 |
| `engine/progress.js` | 新增 | 經驗值、技能等級、街燈狀態 |
| `engine/check-world.js` | 修改 | 新增 `assertShape`（瀏覽器載入時的最小形狀檢查） |
| `engine/layout.js` | 新增 | 地圖產生、可走判斷、尋路 |
| `engine/tiles.js` | 新增 | 像素圖塊與物件繪製 |
| `engine/store.js` | 新增 | IndexedDB 保存 |
| `engine/map.js` | 新增 | 畫布、鏡頭、移動、輸入 |
| `engine/panel.js` | 新增 | 側邊面板：技能頁、作答、術語下潛 |
| `engine/main.js` | 新增 | 啟動與串接 |
| `engine/index.html` | 取代 | 新外殼（舊 v0.1 版留在 git 歷史） |
| `test/questions.test.mjs` | 新增 | |
| `test/progress.test.mjs` | 新增 | |
| `test/check-world.test.mjs` | 修改 | 加入 `assertShape` 測試 |
| `test/layout.test.mjs` | 新增 | |
| `test/engine-neutral.test.mjs` | 新增 | 引擎檔案不得含特定書籍文字 |

---

### Task 1: 打包 KaTeX

**Files:**
- Create: `tools/vendor-katex.mjs`
- Create: `engine/vendor/katex/**`（由腳本產生）
- Modify: `package.json`（devDependencies 加入 katex、scripts 加入 `vendor:katex`）

- [ ] **Step 1: 安裝 KaTeX**

Run: `npm i -D katex@0.16`
Expected: `package.json` 的 devDependencies 出現 `"katex"`

- [ ] **Step 2: 寫複製腳本**

```js file=tools/vendor-katex.mjs
// Copy KaTeX (MIT) from node_modules into engine/vendor/katex so the engine works offline.
// Only woff2 fonts are copied; every current browser supports them.
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";

const src = new URL("../node_modules/katex/", import.meta.url);
const dst = new URL("../engine/vendor/katex/", import.meta.url);

if (!existsSync(src)) {
  console.error("node_modules/katex not found: run npm install first");
  process.exit(1);
}

rmSync(dst, { recursive: true, force: true });
mkdirSync(new URL("contrib/", dst), { recursive: true });

cpSync(new URL("dist/katex.min.css", src), new URL("katex.min.css", dst));
cpSync(new URL("dist/katex.min.js", src), new URL("katex.min.js", dst));
for (const f of ["mhchem.min.js", "auto-render.min.js"]) {
  cpSync(new URL(`dist/contrib/${f}`, src), new URL(`contrib/${f}`, dst));
}
cpSync(new URL("dist/fonts/", src), new URL("fonts/", dst), {
  recursive: true,
  filter: (path) => !/\.(ttf|woff)$/i.test(path),
});
cpSync(new URL("LICENSE", src), new URL("LICENSE", dst));
console.log("KaTeX copied to engine/vendor/katex");
```

- [ ] **Step 3: 加入 npm script 並執行**

在 `package.json` 的 `scripts` 加入 `"vendor:katex": "node tools/vendor-katex.mjs"`。

Run: `npm run vendor:katex && ls engine/vendor/katex engine/vendor/katex/contrib && ls engine/vendor/katex/fonts | head -3`
Expected: `katex.min.css katex.min.js contrib fonts LICENSE`；`contrib` 內有 `mhchem.min.js auto-render.min.js`；`fonts` 內只有 `.woff2`

- [ ] **Step 4: Commit**

```bash
git add tools/vendor-katex.mjs engine/vendor/katex package.json package-lock.json
git commit -m "Vendor KaTeX with mhchem and auto-render for offline math"
```

---

### Task 2: 題目準備與判分 `questions.js`

**Files:**
- Create: `engine/questions.js`
- Test: `test/questions.test.mjs`

- [ ] **Step 1: 寫失敗的測試**

```js file=test/questions.test.mjs
// Tests for preparing questions and grading answers (design spec 4.2).
import { test } from "node:test";
import assert from "node:assert/strict";
import { substitute, shuffleOrder, prepare, grade, simOutput } from "../engine/questions.js";

test("substitute replaces placeholders and leaves unknown ones", () => {
  assert.equal(substitute("接在 {{V}} V，{{ I }} A，{{x}}", { V: 110, I: 5 }), "接在 110 V，5 A，{{x}}");
});

test("shuffleOrder is a deterministic permutation tied to the seed text", () => {
  const a = shuffleOrder(5, "題目甲");
  assert.deepEqual([...a].sort(), [0, 1, 2, 3, 4]);
  assert.deepEqual(shuffleOrder(5, "題目甲"), a);
  const others = ["題目乙", "題目丙", "題目丁"].map((s) => shuffleOrder(5, s).join());
  assert.ok(others.some((o) => o !== a.join()), "different seeds should usually differ");
});

const mc = { type: "mc", q: "哪個胞器合成 ATP？", opts: ["粒線體", "核糖體", "高基氏體"], a: 0,
  why: [null, "合成蛋白質", "包裝蛋白質"], ex: "解說" };

test("mc: options keep their correctness and why after shuffling", () => {
  const p = prepare(mc);
  assert.equal(p.options.length, 3);
  assert.equal(p.options.filter((o) => o.correct).length, 1);
  assert.equal(p.options.find((o) => o.correct).label, "粒線體");
  assert.equal(p.options.find((o) => o.label === "核糖體").why, "合成蛋白質");
});

test("mc: grading by displayed index", () => {
  const p = prepare(mc);
  const right = p.options.findIndex((o) => o.correct);
  const wrong = p.options.findIndex((o) => o.label === "核糖體");
  assert.equal(grade(p, { choice: right }).correct, true);
  const g = grade(p, { choice: wrong });
  assert.equal(g.correct, false);
  assert.equal(g.detail.why, "合成蛋白質");
  assert.equal(g.detail.answer, "粒線體");
});

const num = { type: "numeric", q: "把 {{m}} g 溶成 {{V}} L", vars: { m: 11.7, V: 0.5, M: 58.44 },
  answer: "m / M / V", unit: "mol/L", sig: 3, mistakes: [{ expr: "m / V", why: "把質量當成莫耳數" }], ex: "c = n/V" };

test("numeric: text gets variables and the answer comes from the expression", () => {
  const p = prepare(num);
  assert.equal(p.text, "把 11.7 g 溶成 0.5 L");
  assert.ok(Math.abs(p.answer - 11.7 / 58.44 / 0.5) < 1e-12);
  assert.equal(p.options, undefined);
});

test("numeric: free answer graded with sig tolerance", () => {
  const p = prepare(num);
  assert.equal(grade(p, { value: 0.4 }).correct, true);
  assert.equal(grade(p, { value: 0.41 }).correct, false);
  assert.equal(grade(p, { value: NaN }).correct, false);
  assert.equal(grade(p, { value: 0.41 }).detail.answer, "0.4 mol/L");
});

test("numeric as mc: options are computed and labelled with sig and unit", () => {
  const p = prepare({ ...num, as: "mc" });
  assert.deepEqual(p.options.map((o) => o.label).sort(), ["0.4 mol/L", "23.4 mol/L"]);
  const right = p.options.findIndex((o) => o.correct);
  assert.equal(grade(p, { choice: right }).correct, true);
  assert.equal(grade(p, { choice: 1 - right }).detail.why, "把質量當成莫耳數");
});

test("order: correct only when items are back in their original order", () => {
  const p = prepare({ type: "order", q: "排序", items: ["一", "二", "三"], shown: [2, 0, 1] });
  assert.deepEqual(p.shown, [2, 0, 1]);
  assert.equal(grade(p, { order: [0, 1, 2] }).correct, true);
  assert.equal(grade(p, { order: [1, 0, 2] }).correct, false);
});

test("order without shown gets a deterministic shuffle", () => {
  const q = { type: "order", q: "排序二", items: ["a", "b", "c", "d"] };
  assert.deepEqual(prepare(q).shown, prepare(q).shown);
});

const sim = { type: "sim", q: "以 {{v}} m/s 發射", sliders: [{ var: "th", min: 5, max: 85, step: 1 }], consts: { v: 20, g: 9.8 },
  output: { label: "射程", expr: "v^2 * sin(2 * th * pi / 180) / g", unit: "m" }, pass: "abs(th - 45) < 1.5" };

test("sim: output and pass use consts plus slider values", () => {
  const p = prepare(sim);
  assert.equal(p.text, "以 20 m/s 發射");
  assert.ok(Math.abs(simOutput(p, { th: 45 }) - 400 / 9.8) < 1e-9);
  assert.equal(grade(p, { values: { th: 45 } }).correct, true);
  assert.equal(grade(p, { values: { th: 30 } }).correct, false);
});

const method = { type: "method", q: "選方法", methods: [{ name: "能量守恆", best: true }, { name: "積分", why: "繁瑣" }],
  then: { type: "numeric", q: "高度 {{h}}", vars: { h: 2, g: 9.8 }, answer: "sqrt(2 * g * h)", unit: "m/s" } };

test("method: best method keeps full credit, weaker method halves it", () => {
  const p = prepare(method);
  const v = Math.sqrt(2 * 9.8 * 2);
  const best = grade(p, { method: 0, then: { value: v } });
  assert.equal(best.correct, true);
  assert.equal(best.factor, 1);
  const weak = grade(p, { method: 1, then: { value: v } });
  assert.equal(weak.correct, true);
  assert.equal(weak.factor, 0.5);
  assert.equal(weak.detail.methodWhy, "繁瑣");
});

test("broken data becomes a broken question instead of throwing", () => {
  const p = prepare({ type: "numeric", q: "壞掉", vars: {}, answer: "x + 1" });
  assert.equal(p.type, "broken");
  assert.equal(grade(p, {}).correct, false);
});
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `node --test test/questions.test.mjs`
Expected: FAIL，`ERR_MODULE_NOT_FOUND`（`engine/questions.js` 不存在）

- [ ] **Step 3: 寫實作**

```js file=engine/questions.js
// Prepare questions for display and grade answers (framework 6.6, 8.2, 8.3; design spec 4.2).
// Every number shown or checked comes from engine/expr.js; nothing is computed with eval.
import { evaluate, formatSig, withinTolerance } from "./expr.js";

const PLACEHOLDER = /\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g;
const DEFAULT_SIG = 3;

/** Replace {{name}} with the variable's value; unknown names are left untouched. */
export function substitute(text, scope = {}) {
  return String(text ?? "").replace(PLACEHOLDER, (match, name) =>
    (Object.hasOwn(scope, name) ? String(scope[name]) : match));
}

/** Deterministic permutation of 0..n-1 seeded by text (FNV-1a hash, xorshift steps). */
export function shuffleOrder(n, seedText) {
  let h = 2166136261;
  for (const ch of String(seedText)) {
    h ^= ch.codePointAt(0);
    h = Math.imul(h, 16777619);
  }
  const order = [...Array(n).keys()];
  for (let i = n - 1; i > 0; i--) {
    h ^= h << 13; h ^= h >>> 17; h ^= h << 5;
    const j = (h >>> 0) % (i + 1);
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

// Display a computed number with its significant figures
const show = (value, sig) => String(formatSig(value, sig ?? DEFAULT_SIG));

/**
 * Turn a world question into something the panel can render.
 * Bad data never throws: it becomes { type: "broken" } so the rest of the game keeps working.
 */
export function prepare(question) {
  try {
    return prepareUnsafe(question);
  } catch (e) {
    return { type: "broken", text: substitute(question?.q ?? ""), error: e.message };
  }
}

function prepareUnsafe(q) {
  switch (q.type) {
    case "mc": {
      const order = shuffleOrder(q.opts.length, q.q);
      return {
        type: "mc", text: q.q, ex: q.ex, fig: q.fig,
        options: order.map((i) => ({ label: q.opts[i], correct: i === q.a, why: q.why?.[i] ?? null })),
      };
    }
    case "numeric": {
      const scope = { ...q.vars };
      const answer = evaluate(q.answer, scope);
      if (typeof answer !== "number") throw new Error("answer must be a number");
      const base = { type: "numeric", text: substitute(q.q, scope), ex: q.ex, fig: q.fig, unit: q.unit ?? "", sig: q.sig, answer };
      if (q.as !== "mc") return base;
      // Multiple-choice form: the answer and every mistake are evaluated into options
      const raw = [
        { value: answer, correct: true, why: null },
        ...(q.mistakes ?? []).map((m) => ({ value: evaluate(m.expr, scope), correct: false, why: m.why })),
      ];
      const order = shuffleOrder(raw.length, q.q);
      return { ...base, options: order.map((i) => ({ ...raw[i], label: `${show(raw[i].value, q.sig)} ${q.unit ?? ""}`.trim() })) };
    }
    case "order":
      return { type: "order", text: q.q, ex: q.ex, fig: q.fig, items: q.items, shown: q.shown ?? shuffleOrder(q.items.length, q.q) };
    case "sim": {
      const scope = { ...(q.consts ?? {}) };
      for (const s of q.sliders) if (!Object.hasOwn(scope, s.var)) scope[s.var] = s.min;
      return { type: "sim", text: substitute(q.q, scope), ex: q.ex, fig: q.fig, sliders: q.sliders, consts: q.consts ?? {}, output: q.output, pass: q.pass };
    }
    case "method":
      return { type: "method", text: q.q, ex: q.ex, fig: q.fig, methods: q.methods, then: prepare(q.then) };
    default:
      throw new Error(`unknown question type ${q.type}`);
  }
}

/** Output value of a sim question at the given slider values. */
export function simOutput(prepared, values) {
  return evaluate(prepared.output.expr, { ...prepared.consts, ...values });
}

const result = (correct, detail) => ({ correct, factor: 1, detail });

// Shared grading for anything presented as a list of options
function gradeChoice(p, choice) {
  const picked = p.options[choice];
  const right = p.options.find((o) => o.correct);
  return result(!!picked?.correct, { why: picked && !picked.correct ? picked.why : null, answer: right?.label, ex: p.ex });
}

/**
 * Grade a response.
 * Responses: mc { choice }, numeric { value } or { choice }, order { order: originalIndices },
 * sim { values }, method { method, then }.
 * @returns {{ correct: boolean, factor: number, detail: object }}  factor is 0.5 for a weaker method
 */
export function grade(p, response) {
  try {
    switch (p.type) {
      case "mc":
        return gradeChoice(p, response.choice);
      case "numeric": {
        if (p.options) return gradeChoice(p, response.choice);
        const ok = Number.isFinite(response.value) && withinTolerance(response.value, p.answer, p.sig);
        return result(ok, { answer: `${show(p.answer, p.sig)} ${p.unit}`.trim(), ex: p.ex });
      }
      case "order": {
        const ok = response.order.length === p.items.length && response.order.every((v, i) => v === i);
        return result(ok, { answer: p.items.join(" → "), ex: p.ex });
      }
      case "sim":
        return result(evaluate(p.pass, { ...p.consts, ...response.values }) === true, { ex: p.ex });
      case "method": {
        const chosen = p.methods[response.method];
        const inner = grade(p.then, response.then);
        const best = chosen?.best === true;
        return { ...inner, factor: inner.factor * (best ? 1 : 0.5), detail: { ...inner.detail, methodWhy: best ? null : chosen?.why ?? null } };
      }
      default:
        return result(false, { why: "這題的資料有問題" });
    }
  } catch (e) {
    return result(false, { why: `這題的資料有問題：${e.message}` });
  }
}
```

- [ ] **Step 4: 執行測試確認通過**

Run: `node --test test/questions.test.mjs`
Expected: PASS（12 tests）

- [ ] **Step 5: Commit**

```bash
git add engine/questions.js test/questions.test.mjs
git commit -m "Add question preparation and grading for the engine"
```

---

### Task 3: 經驗值與等級 `progress.js`

**Files:**
- Create: `engine/progress.js`
- Test: `test/progress.test.mjs`

- [ ] **Step 1: 寫失敗的測試**

```js file=test/progress.test.mjs
// Tests for experience, skill levels and lamp states (framework 3.3, design spec 4.3).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  emptyProgress, recordCorrect, totalXp, skillLevel, isExpandable, lampState, learnableSkills, xpFor, isSolved,
} from "../engine/progress.js";

// Skill a: Lv1, two Lv2, one Lv3 practice. Skill b depends on a (and on a skill from another world).
// Skill c has no practices at all.
const world = {
  skills: [
    { id: "physics/a", maxLevel: 4, pre: [] },
    { id: "physics/b", maxLevel: 2, pre: ["physics/a", "math/outside"] },
    { id: "physics/c", maxLevel: 5, pre: [] },
  ],
  practices: [
    { id: "a1", skill: "physics/a", level: 1 },
    { id: "a2", skill: "physics/a", level: 2 },
    { id: "a2b", skill: "physics/a", level: 2 },
    { id: "a3", skill: "physics/a", level: 3 },
    { id: "b1", skill: "physics/b", level: 1 },
  ],
};
const [A, B, C] = world.skills;
const P = (id) => world.practices.find((x) => x.id === id);
const solve = (start, ...ids) => ids.reduce((prog, id) => recordCorrect(prog, P(id)).progress, start);

test("xpFor doubles per level starting at 10", () => {
  assert.deepEqual([1, 2, 3, 4, 5].map(xpFor), [10, 20, 40, 80, 160]);
});

test("first correct answer gets full xp, repeats 20 %, weaker method half", () => {
  const first = recordCorrect(emptyProgress(), P("a2"));
  assert.equal(first.xp, 20);
  assert.equal(first.first, true);
  const again = recordCorrect(first.progress, P("a2"));
  assert.equal(again.xp, 4);
  assert.equal(again.first, false);
  assert.equal(recordCorrect(emptyProgress(), P("a2"), 0.5).xp, 10);
});

test("recordCorrect does not mutate its input", () => {
  const start = emptyProgress();
  recordCorrect(start, P("a1"));
  assert.deepEqual(start, emptyProgress());
});

test("totalXp sums every skill", () => {
  assert.equal(totalXp(solve(emptyProgress(), "a1", "b1")), 20);
});

test("isSolved tracks practices answered correctly", () => {
  const prog = solve(emptyProgress(), "a1");
  assert.equal(isSolved(prog, P("a1")), true);
  assert.equal(isSolved(prog, P("a2")), false);
});

test("Lv1 comes from any correct practice", () => {
  assert.equal(skillLevel(emptyProgress(), A, world), 0);
  assert.equal(skillLevel(solve(emptyProgress(), "a2"), A, world), 1);
});

test("Lv2 needs two different Lv2 practices", () => {
  assert.equal(skillLevel(solve(emptyProgress(), "a1", "a2"), A, world), 1);
  assert.equal(skillLevel(solve(emptyProgress(), "a1", "a2", "a2"), A, world), 1);
  assert.equal(skillLevel(solve(emptyProgress(), "a1", "a2", "a2b"), A, world), 2);
});

test("a level with too few practices stops progress and marks the skill expandable", () => {
  const prog = solve(emptyProgress(), "a1", "a2", "a2b", "a3");
  assert.equal(skillLevel(prog, A, world), 2);
  assert.equal(isExpandable(prog, A, world), true);
  assert.equal(isExpandable(solve(emptyProgress(), "a1"), A, world), false);
});

test("level never exceeds maxLevel and missing levels are expandable", () => {
  const prog = solve(emptyProgress(), "b1");
  assert.equal(skillLevel(prog, B, world), 1);
  assert.equal(isExpandable(prog, B, world), true);
});

test("a skill without practices stays at 0 and is expandable", () => {
  assert.equal(skillLevel(emptyProgress(), C, world), 0);
  assert.equal(isExpandable(emptyProgress(), C, world), true);
});

test("lamp states: lit, ready, blocked; prerequisites from other worlds are ignored", () => {
  const start = emptyProgress();
  assert.equal(lampState(start, A, world), "ready");
  assert.equal(lampState(start, B, world), "blocked");
  const prog = solve(start, "a1");
  assert.equal(lampState(prog, A, world), "lit");
  assert.equal(lampState(prog, B, world), "ready");
});

test("learnableSkills lists ready skills", () => {
  assert.deepEqual(learnableSkills(emptyProgress(), world), ["physics/a", "physics/c"]);
  assert.deepEqual(learnableSkills(solve(emptyProgress(), "a1"), world), ["physics/b", "physics/c"]);
});
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `node --test test/progress.test.mjs`
Expected: FAIL，`ERR_MODULE_NOT_FOUND`

- [ ] **Step 3: 寫實作**

```js file=engine/progress.js
// Experience and skill levels (framework 3.3; design spec 4.3).
// Progress is keyed by skill id so one skill shares one record across worlds (framework 3.5).
// Every function is pure: it returns new objects and never mutates its input.

const REPEAT_FACTOR = 0.2;

/** Experience for the first correct answer to a practice of the given level. */
export const xpFor = (level) => 10 * 2 ** (level - 1);

export function emptyProgress() {
  return { version: 1, skills: {} };
}

/**
 * Record a correct answer.
 * @param {object} progress
 * @param {{ id: string, skill: string, level: number }} practice
 * @param {number} [factor]  1, or 0.5 when a method question used a weaker method
 * @returns {{ progress: object, xp: number, first: boolean }}
 */
export function recordCorrect(progress, practice, factor = 1) {
  const rec = progress.skills[practice.skill] ?? { solved: {}, xp: 0 };
  const count = rec.solved[practice.id] ?? 0;
  const first = count === 0;
  const xp = Math.round(xpFor(practice.level) * (first ? 1 : REPEAT_FACTOR) * factor);
  const skills = { ...progress.skills, [practice.skill]: { solved: { ...rec.solved, [practice.id]: count + 1 }, xp: rec.xp + xp } };
  return { progress: { ...progress, skills }, xp, first };
}

export function totalXp(progress) {
  return Object.values(progress.skills).reduce((sum, rec) => sum + rec.xp, 0);
}

export function isSolved(progress, practice) {
  return (progress.skills[practice.skill]?.solved[practice.id] ?? 0) > 0;
}

// Level reached, and whether progress is stuck because the next level lacks practices
function evaluateLevel(progress, skill, world) {
  const own = world.practices.filter((p) => p.skill === skill.id);
  const solved = own.filter((p) => isSolved(progress, p));
  let level = solved.length > 0 ? 1 : 0;
  let stuck = own.length === 0;
  for (let L = 2; L <= skill.maxLevel && level === L - 1; L++) {
    const need = L === 5 ? 1 : 2;
    if (own.filter((p) => p.level === L).length < need) {
      stuck = true;
      break;
    }
    if (solved.filter((p) => p.level === L).length >= need) level = L;
  }
  return { level: Math.min(level, skill.maxLevel), stuck };
}

export function skillLevel(progress, skill, world) {
  return evaluateLevel(progress, skill, world).level;
}

/** True when the skill cannot reach its maxLevel with the practices that exist. */
export function isExpandable(progress, skill, world) {
  const { level, stuck } = evaluateLevel(progress, skill, world);
  return stuck && level < skill.maxLevel;
}

/** "lit" (Lv1+), "ready" (every in-world prerequisite lit) or "blocked". */
export function lampState(progress, skill, world) {
  if (skillLevel(progress, skill, world) >= 1) return "lit";
  const inWorld = new Map(world.skills.map((s) => [s.id, s]));
  const ready = (skill.pre ?? []).every((id) => !inWorld.has(id) || skillLevel(progress, inWorld.get(id), world) >= 1);
  return ready ? "ready" : "blocked";
}

/** Ids of skills that are ready to learn, in world order. */
export function learnableSkills(progress, world) {
  return world.skills.filter((s) => lampState(progress, s, world) === "ready").map((s) => s.id);
}
```

- [ ] **Step 4: 執行測試確認通過**

Run: `node --test test/progress.test.mjs`
Expected: PASS（12 tests）

- [ ] **Step 5: Commit**

```bash
git add engine/progress.js test/progress.test.mjs
git commit -m "Add experience and skill level rules for the engine"
```

---

### Task 4: 載入時的最小形狀檢查 `assertShape`

**Files:**
- Modify: `engine/check-world.js`（檔尾新增匯出函式）
- Test: `test/check-world.test.mjs`（檔尾新增測試）

- [ ] **Step 1: 寫失敗的測試**（附加到 `test/check-world.test.mjs` 檔尾，並把檔首的 import 改為 `import { checkWorld, assertShape } from "../engine/check-world.js";`）

```js
// --- minimal shape check used by the browser before checkWorld (design spec 5) ---

test("assertShape: the fixture passes", () => {
  assert.deepEqual(assertShape(world()), []);
});

test("assertShape: reports lists that are not lists and items without ids", () => {
  const problems = assertShape({ id: "x", skills: "nope", practices: [{ skill: "a" }] });
  assert.ok(problems.some((p) => p.includes("skills is not a list")), problems.join("\n"));
  assert.ok(problems.some((p) => p.includes("practices[0]: has no id")), problems.join("\n"));
});

test("assertShape: practices need a question and clusters need a skills list", () => {
  const problems = assertShape({ id: "x", clusters: [{ id: "c" }], practices: [{ id: "p" }] });
  assert.ok(problems.some((p) => p.includes("clusters[0]: has no skills list")));
  assert.ok(problems.some((p) => p.includes("practices[0]: has no question")));
});

test("assertShape: rejects non-objects", () => {
  assert.ok(assertShape(null).length > 0);
  assert.ok(assertShape([]).length > 0);
});
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `node --test test/check-world.test.mjs`
Expected: FAIL，`assertShape is not a function` 或 import 錯誤

- [ ] **Step 3: 寫實作**（附加到 `engine/check-world.js` 檔尾）

```js
/**
 * Minimal shape check for worlds loaded in the browser, where the JSON Schema is not run.
 * Only guards what the engine needs in order not to crash (design spec 5).
 * @returns {string[]}  problems; empty when the world can be loaded
 */
export function assertShape(world) {
  if (!world || typeof world !== "object" || Array.isArray(world)) return ["world is not an object"];
  const problems = [];
  if (typeof world.id !== "string") problems.push("world has no id");
  for (const name of ["schools", "clusters", "skills", "practices", "placement", "bosses", "glossary"]) {
    if (world[name] !== undefined && !Array.isArray(world[name])) problems.push(`${name} is not a list`);
  }
  const each = (name, check) => (Array.isArray(world[name]) ? world[name] : []).forEach((item, i) => {
    const msg = check(item);
    if (msg) problems.push(`${name}[${i}]: ${msg}`);
  });
  each("skills", (s) => (typeof s?.id === "string" ? null : "has no id"));
  each("clusters", (c) => (typeof c?.id !== "string" ? "has no id" : Array.isArray(c.skills) ? null : "has no skills list"));
  each("practices", (p) => (typeof p?.id !== "string" ? "has no id" : typeof p.question?.type === "string" ? null : "has no question"));
  return problems;
}
```

- [ ] **Step 4: 執行測試確認通過**

Run: `npm test`
Expected: 全部 PASS

- [ ] **Step 5: Commit**

```bash
git add engine/check-world.js test/check-world.test.mjs
git commit -m "Add minimal world shape check for browser loading"
```

---

### Task 5: 地圖產生 `layout.js`

**Files:**
- Create: `engine/layout.js`
- Test: `test/layout.test.mjs`

- [ ] **Step 1: 寫失敗的測試**

```js file=test/layout.test.mjs
// Tests for the region map generator (design spec 4.1).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildMap, orderSkills, findPath, isWalkable, objectAt, interactTarget, distances, distanceTo,
} from "../engine/layout.js";

const base = JSON.parse(readFileSync(new URL("./fixtures/valid-world.json", import.meta.url), "utf8"));
const world = () => structuredClone(base);

// Fixture plus a second, higher-tier chapter with three skills chained by prerequisites
function twoTownWorld() {
  const w = world();
  w.schools[0].tiers.push({ tier: 2, name: "中階", boss: "boss-t2" });
  const mk = (id, num, pre) => ({ ...structuredClone(w.skills[0]), id, num, pre, kind: "core", cluster: "ch2", tier: 2 });
  w.skills.push(mk("physics/s3", "2.1", ["physics/s2"]), mk("physics/s2", "2.2", ["physics/s1"]), mk("physics/s1", "2.3", []));
  w.clusters.push({ id: "ch2", school: w.schools[0].id, tier: 2, name: "第二章", skills: ["physics/s3", "physics/s2", "physics/s1"], boss: "boss-ch2" });
  w.practices.push({ ...structuredClone(w.practices[1]), id: "c1", skill: "physics/s1", context: "commission" });
  return w;
}

const snapshot = (m) => JSON.stringify({ tiles: m.tiles, objects: m.objects, towns: m.towns, spawn: m.spawn });

test("the same world always produces the same map", () => {
  assert.equal(snapshot(buildMap(world())), snapshot(buildMap(world())));
});

test("skills inside a chapter follow prerequisites before section numbers", () => {
  const w = twoTownWorld();
  assert.deepEqual(orderSkills(w, w.clusters[1]), ["physics/s1", "physics/s2", "physics/s3"]);
});

test("orderSkills skips skills that are not generated yet", () => {
  const w = world();
  w.clusters[0].skills.push("physics/not-yet");
  assert.ok(!orderSkills(w, w.clusters[0]).includes("physics/not-yet"));
});

test("every skill gets one lamp; commission practices become npcs, subject practices signs", () => {
  const w = twoTownWorld();
  const m = buildMap(w);
  const lamps = m.objects.filter((o) => o.kind === "lamp").map((o) => o.skill).sort();
  assert.deepEqual(lamps, w.skills.map((s) => s.id).sort());
  const npcs = m.objects.filter((o) => o.kind === "npc").map((o) => o.practice).sort();
  assert.deepEqual(npcs, w.practices.filter((p) => p.context === "commission").map((p) => p.id).sort());
  const signed = m.objects.filter((o) => o.kind === "sign").flatMap((o) => o.practices).sort();
  assert.deepEqual(signed, w.practices.filter((p) => p.context !== "commission").map((p) => p.id).sort());
});

test("every object can be reached from the spawn point", () => {
  for (const w of [world(), twoTownWorld()]) {
    const m = buildMap(w);
    assert.ok(isWalkable(m, m.spawn.x, m.spawn.y), "spawn must be walkable");
    for (const o of m.objects) {
      assert.notEqual(findPath(m, m.spawn, o), null, `${o.kind} at ${o.x},${o.y} is unreachable`);
    }
  }
});

test("each town has a gym and the gym is the last thing on its main street", () => {
  const m = buildMap(twoTownWorld());
  for (const t of m.towns) {
    const inTown = m.objects.filter((o) => o.x >= t.x && o.x < t.x + t.w);
    const gym = inTown.find((o) => o.kind === "gym");
    assert.ok(gym, `town ${t.cluster} has no gym`);
    for (const lamp of inTown.filter((o) => o.kind === "lamp")) assert.ok(lamp.x < gym.x);
  }
});

test("a tier increase puts a cliff with stairs on the road", () => {
  const m = buildMap(twoTownWorld());
  const flat = m.tiles.flat();
  assert.ok(flat.includes("cliff"));
  assert.ok(m.tiles[m.spawn.y].includes("stairs"), "stairs must be on the street row");
  assert.ok(!buildMap(world()).tiles.flat().includes("cliff"));
});

test("higher-tier towns use plateau ground", () => {
  const m = buildMap(twoTownWorld());
  const t = m.towns[1];
  assert.equal(m.tiles[t.y][t.x], "plateau");
  assert.equal(m.tiles[m.towns[0].y][m.towns[0].x], "meadow");
});

test("decorations never land inside towns", () => {
  const m = buildMap(twoTownWorld());
  for (const t of m.towns) {
    for (let y = t.y; y < t.y + t.h; y++) for (let x = t.x; x < t.x + t.w; x++) {
      assert.ok(!["tree", "water"].includes(m.tiles[y][x]), `${m.tiles[y][x]} at ${x},${y}`);
    }
  }
});

test("a chapter with no generated skills still gets a town and a gym", () => {
  const w = world();
  w.clusters.push({ id: "ch9", school: w.schools[0].id, tier: 1, name: "未來的章", skills: ["physics/x"], boss: "boss-ch9" });
  const m = buildMap(w);
  assert.equal(m.towns.length, 2);
  assert.equal(m.objects.filter((o) => o.kind === "gym").length, 2);
});

test("a world without clusters still builds a walkable map", () => {
  const w = world();
  w.clusters = [];
  const m = buildMap(w);
  assert.ok(isWalkable(m, m.spawn.x, m.spawn.y));
});

test("findPath returns adjacent walkable steps", () => {
  const m = buildMap(twoTownWorld());
  const gym = m.objects.filter((o) => o.kind === "gym").at(-1);
  const steps = findPath(m, m.spawn, gym);
  let cur = m.spawn;
  for (const s of steps) {
    assert.equal(Math.abs(s.x - cur.x) + Math.abs(s.y - cur.y), 1);
    assert.ok(isWalkable(m, s.x, s.y));
    cur = s;
  }
});

test("objectAt covers multi-tile footprints and interactTarget prefers the faced tile", () => {
  const m = buildMap(world());
  const gym = m.objects.find((o) => o.kind === "gym");
  assert.equal(objectAt(m, gym.x + gym.w - 1, gym.y + gym.h - 1), gym);
  const lamp = m.objects.find((o) => o.kind === "lamp" && o.skill === "physics/acceleration");
  assert.equal(interactTarget(m, lamp.x, lamp.y + 1, "up"), lamp);
});

test("distanceTo measures the walk to the nearest side of an object", () => {
  const m = buildMap(world());
  const dist = distances(m, m.spawn);
  const lamp = m.objects.find((o) => o.kind === "lamp");
  assert.equal(distanceTo(m, dist, lamp), findPath(m, m.spawn, lamp).length);
});
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `node --test test/layout.test.mjs`
Expected: FAIL，`ERR_MODULE_NOT_FOUND`

- [ ] **Step 3: 寫實作**

```js file=engine/layout.js
// Build the pixel-tile region map for a world (design spec 2026-10-09, section 4.1).
// Pure and deterministic: the same world always produces the same map; no DOM access.
//
// Region, left to right: forest border | town (chapter 1) | road with tall grass | town (chapter 2) | ...
// A tier increase adds a cliff band with stairs between two towns.
// Inside a town (rows relative to the town's top):
//   1-3  houses            2-5  gym at the east end
//   5    lamps (north side of the street) with a sign right after each lamp
//   6    main street       8-10 commission npcs below their lamp
//   west alley (optional skills) runs south from the street when needed

export const WALKABLE = new Set(["grass", "meadow", "plateau", "pave", "sand", "tall", "stairs", "flower"]);

const BORDER = 3;              // forest thickness around the region
const MARGIN = 2;              // open ground between the border and the first or last town
const ROAD = 8;                // road length between two towns
const CLIFF = 3;               // width of the cliff band at a tier increase
const TOWN_TOP = BORDER + 2;   // first row of every town
const STREET = 6;              // main street row inside a town
const MIN_TOWN_W = 16, MIN_TOWN_H = 11;
const GYM_W = 6, GYM_H = 4, HOUSE_W = 4, HOUSE_H = 3;
const MAX_NPC_MAIN = 6, MAX_NPC_ALLEY = 2;   // further commissions stay reachable from the skill page
const LOOKS = 6;                             // npc appearance variants (see tiles.js)

const key = (x, y) => `${x},${y}`;
const FACING = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

// Seeded random numbers in [0, 1)
function rng(seedText) {
  let h = 2166136261;
  for (const ch of String(seedText)) {
    h ^= ch.codePointAt(0);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h ^= h << 13; h ^= h >>> 17; h ^= h << 5;
    return (h >>> 0) / 4294967296;
  };
}

function hashLook(text) {
  let h = 0;
  for (const ch of String(text)) h = (h * 31 + ch.codePointAt(0)) | 0;
  return Math.abs(h) % LOOKS;
}

const sectionKey = (skill) => String(skill?.num ?? "").split(".").map((n) => Number.parseInt(n, 10) || 0);

/** Skills of a cluster in prerequisite order; ties broken by section number. Skills not generated yet are skipped. */
export function orderSkills(world, cluster) {
  const byId = new Map(world.skills.map((s) => [s.id, s]));
  const ids = cluster.skills.filter((id) => byId.has(id));
  const inCluster = new Set(ids);
  const compare = (a, b) => {
    const x = sectionKey(byId.get(a)), y = sectionKey(byId.get(b));
    for (let i = 0; i < Math.max(x.length, y.length); i++) {
      const d = (x[i] ?? 0) - (y[i] ?? 0);
      if (d) return d;
    }
    return ids.indexOf(a) - ids.indexOf(b);
  };
  const preOf = (id) => (byId.get(id).pre ?? []).filter((p) => inCluster.has(p) && p !== id);
  const placed = new Set();
  const out = [];
  while (out.length < ids.length) {
    const left = ids.filter((id) => !placed.has(id)).sort(compare);
    // Kahn's algorithm; a cycle (already reported by check-world) must not stall the layout
    const next = left.find((id) => preOf(id).every((p) => placed.has(p))) ?? left[0];
    placed.add(next);
    out.push(next);
  }
  return out;
}

// Size and contents of one town
function planTown(world, cluster, byId) {
  const ordered = orderSkills(world, cluster);
  const kindOf = (id) => byId.get(id).kind;
  const main = ordered.filter((id) => ["core", "supplement"].includes(kindOf(id)));
  const edge = ordered.filter((id) => ["app", "tool"].includes(kindOf(id)));
  const alley = ordered.filter((id) => kindOf(id) === "optional");
  const lamps = [...main, ...edge];
  const left = alley.length ? 3 : 0;
  return {
    cluster, lamps, alley, left,
    tier: cluster.tier ?? 1,
    w: Math.max(MIN_TOWN_W, left + 2 + 2 * lamps.length + 1 + GYM_W),
    h: Math.max(MIN_TOWN_H, alley.length ? 9 + 2 * alley.length : 0),
  };
}

/**
 * @param {object} world  merged world (may be in progress)
 * @returns {{ width, height, tiles: string[][], objects: object[], towns: object[], spawn: {x,y}, occupied: Set<string> }}
 */
export function buildMap(world) {
  const r = rng(world.id);
  const byId = new Map(world.skills.map((s) => [s.id, s]));
  const plans = world.clusters.map((c) => planTown(world, c, byId));

  // Horizontal placement: towns with roads (plus a cliff at each tier increase) between them
  let cursor = BORDER + MARGIN;
  plans.forEach((p, i) => {
    p.x = cursor;
    cursor += p.w;
    const next = plans[i + 1];
    p.gap = next ? ROAD + (next.tier > p.tier ? CLIFF : 0) : 0;
    cursor += p.gap;
  });
  const width = Math.max(cursor + MARGIN + BORDER, 2 * (BORDER + MARGIN) + MIN_TOWN_W);
  const townH = Math.max(MIN_TOWN_H, ...plans.map((p) => p.h));
  const height = TOWN_TOP + townH + 2 + BORDER;
  const sy = TOWN_TOP + STREET;

  const tiles = Array.from({ length: height }, () => Array(width).fill("grass"));
  const reserved = new Set();
  const objects = [];
  const towns = [];
  const set = (x, y, t) => { if (x >= 0 && y >= 0 && x < width && y < height) tiles[y][x] = t; };
  const reserve = (x0, y0, x1, y1) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) reserved.add(key(x, y)); };

  // A lamp, the sign for its subject practices and the npcs for its commission practices
  function addSkillObjects(skillId, lx, ly, signAt, npcAt) {
    objects.push({ kind: "lamp", x: lx, y: ly, skill: skillId });
    const own = world.practices.filter((p) => p.skill === skillId);
    const subject = own.filter((p) => p.context !== "commission").map((p) => p.id);
    if (subject.length) objects.push({ kind: "sign", x: signAt[0], y: signAt[1], skill: skillId, practices: subject });
    own.filter((p) => p.context === "commission").forEach((p, j) => {
      const at = npcAt(j);
      if (at) objects.push({ kind: "npc", x: at[0], y: at[1], skill: skillId, practice: p.id, look: hashLook(p.id) });
    });
  }

  for (const p of plans) {
    const ox = p.x, oy = TOWN_TOP;
    const ground = p.tier > 1 ? "plateau" : "meadow";
    for (let y = oy; y < oy + p.h; y++) for (let x = ox; x < ox + p.w; x++) set(x, y, ground);
    reserve(ox - 1, oy - 1, ox + p.w, oy + p.h);
    for (let x = ox; x < ox + p.w; x++) set(x, sy, "pave");

    const gymX = ox + p.w - GYM_W;
    for (let hx = ox + p.left + 1, n = 0; hx + HOUSE_W <= gymX - 1; hx += HOUSE_W + 2, n++) {
      objects.push({ kind: "house", x: hx, y: oy + 1, w: HOUSE_W, h: HOUSE_H, roof: n % 2 });
    }
    objects.push({ kind: "gym", x: gymX, y: oy + 2, w: GYM_W, h: GYM_H, boss: p.cluster.boss ?? null, cluster: p.cluster.id });

    p.lamps.forEach((id, k) => {
      const lx = ox + p.left + 2 + 2 * k;
      addSkillObjects(id, lx, sy - 1, [lx + 1, sy - 1], (j) => (j < MAX_NPC_MAIN ? [lx + (j % 2), sy + 2 + Math.floor(j / 2)] : null));
    });

    if (p.alley.length) {
      for (let y = sy + 1; y <= oy + p.h - 2; y++) set(ox + 1, y, "pave");
      p.alley.forEach((id, j) => {
        const ly = sy + 2 + 2 * j;
        addSkillObjects(id, ox, ly, [ox, ly + 1], (n) => (n < MAX_NPC_ALLEY ? [ox + 2 + n, ly] : null));
      });
    }

    towns.push({ cluster: p.cluster.id, name: p.cluster.name ?? p.cluster.id, tier: p.tier, x: ox, y: oy, w: p.w, h: p.h, entrance: { x: ox, y: sy } });

    if (p.gap) {
      const rx0 = ox + p.w, rx1 = rx0 + p.gap - 1;
      for (let x = rx0; x <= rx1; x++) set(x, sy, "sand");
      for (let x = rx0 + 2; x <= rx0 + ROAD - 3; x++) for (const dy of [-3, -2, -1, 1, 2, 3]) set(x, sy + dy, "tall");
      reserve(rx0, sy - 4, rx1, sy + 4);
      for (let x = rx0 + ROAD; x <= rx1; x++) {
        for (let y = BORDER; y < height - BORDER; y++) set(x, y, "cliff");
        set(x, sy, "stairs");
        reserve(x, BORDER, x, height - BORDER - 1);
      }
    }
  }

  const spawn = towns.length ? { x: towns[0].entrance.x + 1, y: sy } : { x: BORDER + MARGIN + 1, y: sy };
  if (!towns.length) reserve(BORDER + MARGIN, sy - 2, width - BORDER - MARGIN - 1, sy + 2);

  // Decorations: forest border with a ragged inner edge, groves, ponds and flowers outside reserved areas
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (reserved.has(key(x, y))) continue;
    const edge = Math.min(x, y, width - 1 - x, height - 1 - y);
    if (edge < BORDER || (edge === BORDER && r() < 0.5)) tiles[y][x] = "tree";
  }
  const free = (x, y) => x >= BORDER && y >= BORDER && x < width - BORDER && y < height - BORDER
    && !reserved.has(key(x, y)) && tiles[y][x] === "grass";
  const groves = Math.floor((width * height) / 160);
  for (let n = 0; n < groves; n++) {
    const cx = Math.floor(r() * width), cy = Math.floor(r() * height), rad = 1 + Math.floor(r() * 2);
    for (let y = cy - rad; y <= cy + rad; y++) for (let x = cx - rad; x <= cx + rad; x++) {
      if (Math.hypot(x - cx, y - cy) <= rad + 0.3 && free(x, y)) tiles[y][x] = "tree";
    }
  }
  const ponds = 1 + Math.floor(width / 40);
  for (let n = 0; n < ponds; n++) {
    const px = Math.floor(r() * width), py = Math.floor(r() * height);
    const pw = 3 + Math.floor(r() * 2), ph = 2 + Math.floor(r() * 2);
    let ok = true;
    for (let y = py; y < py + ph && ok; y++) for (let x = px; x < px + pw; x++) if (!free(x, y)) { ok = false; break; }
    if (ok) for (let y = py; y < py + ph; y++) for (let x = px; x < px + pw; x++) tiles[y][x] = "water";
  }
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (free(x, y) && r() < 0.04) tiles[y][x] = "flower";

  const occupied = new Set();
  for (const o of objects) {
    for (let dy = 0; dy < (o.h ?? 1); dy++) for (let dx = 0; dx < (o.w ?? 1); dx++) occupied.add(key(o.x + dx, o.y + dy));
  }
  return { width, height, tiles, objects, towns, spawn, occupied };
}

/** True when the hero may stand on the tile. */
export function isWalkable(map, x, y) {
  if (x < 0 || y < 0 || x >= map.width || y >= map.height) return false;
  return WALKABLE.has(map.tiles[y][x]) && !map.occupied.has(key(x, y));
}

/** The object whose footprint covers the tile, or null. */
export function objectAt(map, x, y) {
  return map.objects.find((o) => x >= o.x && x < o.x + (o.w ?? 1) && y >= o.y && y < o.y + (o.h ?? 1)) ?? null;
}

/** The object the hero would talk to: the faced tile first, then any neighbour. */
export function interactTarget(map, x, y, facing) {
  const [dx, dy] = FACING[facing] ?? FACING.down;
  const ahead = objectAt(map, x + dx, y + dy);
  if (ahead) return ahead;
  for (const [ax, ay] of Object.values(FACING)) {
    const o = objectAt(map, x + ax, y + ay);
    if (o) return o;
  }
  return null;
}

// Walkable tiles next to an object's footprint
function sidesOf(map, o) {
  const out = [];
  for (let y = o.y - 1; y <= o.y + (o.h ?? 1); y++) for (let x = o.x - 1; x <= o.x + (o.w ?? 1); x++) {
    const inside = x >= o.x && x < o.x + (o.w ?? 1) && y >= o.y && y < o.y + (o.h ?? 1);
    const diagonal = (x < o.x || x >= o.x + (o.w ?? 1)) && (y < o.y || y >= o.y + (o.h ?? 1));
    if (!inside && !diagonal && isWalkable(map, x, y)) out.push({ x, y });
  }
  return out;
}

/** Breadth-first distances (in steps) from a tile to every reachable tile. */
export function distances(map, from) {
  const dist = new Map([[key(from.x, from.y), 0]]);
  const queue = [from];
  for (let i = 0; i < queue.length; i++) {
    const cur = queue[i];
    for (const [dx, dy] of Object.values(FACING)) {
      const nx = cur.x + dx, ny = cur.y + dy, k = key(nx, ny);
      if (!dist.has(k) && isWalkable(map, nx, ny)) {
        dist.set(k, dist.get(key(cur.x, cur.y)) + 1);
        queue.push({ x: nx, y: ny });
      }
    }
  }
  return dist;
}

/** Steps needed to stand next to an object, given distances(); Infinity when unreachable. */
export function distanceTo(map, dist, o) {
  return Math.min(Infinity, ...sidesOf(map, o).map((s) => dist.get(key(s.x, s.y)) ?? Infinity));
}

/**
 * Shortest path to a tile or to the side of an object.
 * @returns {{x,y}[] | null}  steps after `from` ([] when already there), null when unreachable
 */
export function findPath(map, from, target) {
  const goals = new Set();
  if (target.kind) for (const s of sidesOf(map, target)) goals.add(key(s.x, s.y));
  else if (isWalkable(map, target.x, target.y)) goals.add(key(target.x, target.y));
  else for (const [dx, dy] of Object.values(FACING)) if (isWalkable(map, target.x + dx, target.y + dy)) goals.add(key(target.x + dx, target.y + dy));
  if (goals.has(key(from.x, from.y))) return [];
  const prev = new Map([[key(from.x, from.y), null]]);
  const queue = [{ x: from.x, y: from.y }];
  for (let i = 0; i < queue.length; i++) {
    const cur = queue[i];
    for (const [dx, dy] of Object.values(FACING)) {
      const nx = cur.x + dx, ny = cur.y + dy, k = key(nx, ny);
      if (prev.has(k) || !isWalkable(map, nx, ny)) continue;
      prev.set(k, cur);
      if (goals.has(k)) {
        const path = [{ x: nx, y: ny }];
        for (let p = cur; p && prev.get(key(p.x, p.y)) !== null; p = prev.get(key(p.x, p.y))) path.unshift({ x: p.x, y: p.y });
        return path;
      }
      queue.push({ x: nx, y: ny });
    }
  }
  return null;
}
```

- [ ] **Step 4: 執行測試確認通過**

Run: `node --test test/layout.test.mjs`
Expected: PASS（14 tests）

- [ ] **Step 5: Commit**

```bash
git add engine/layout.js test/layout.test.mjs
git commit -m "Add deterministic region map generator with pathfinding"
```

---

### Task 6: 像素圖塊繪製 `tiles.js`

**Files:**
- Create: `engine/tiles.js`

圖塊取自核可的示意圖 `docs/superpowers/specs/assets/map-art-v5.html`，改為以圖塊座標雜湊決定地面小點（鏡頭移動時不會閃動）。

- [ ] **Step 1: 寫實作**

```js file=engine/tiles.js
// Pixel tile and sprite painters (16x16), ported from the approved mockup
// docs/superpowers/specs/assets/map-art-v5.html. All art is drawn with code; no external images.

export const T = 16;

const C = {
  grass: "#8fd27f", grass2: "#82c673", grassDot: "#a6e08f",
  meadow: "#b8e3a2", meadowDot: "#c9ecb4",
  sand: "#ead9a0", sandEdge: "#d2bd7e", sandDot: "#dccb8d",
  pave: "#e6dfcc", paveLine: "#d3cab2",
  plateau: "#c9d98a", plateauDot: "#b7c977",
  tall: "#4f9e4c", tallDark: "#3c8139", tallLight: "#74c062",
  treeDark: "#2d6e35", treeMid: "#43943f", treeLight: "#69bb55", treeHi: "#93d671", trunk: "#6b4a2b",
  water: "#5aa6e8", waterDeep: "#4a90d6", waterHi: "#a9d6f7", foam: "#e9f6ff",
  cliffTop: "#c89b68", cliffFace: "#a06d45", cliffDark: "#7a5032", cliffLine: "#5f3c25",
  plank: "#cf9f57", plankDark: "#91672f",
  wall: "#f3e8d2", wallShade: "#d9cbb0",
  roofs: [["#d4574a", "#a83e33"], ["#4d7fd1", "#365fa3"]], roofP: "#8a63c9", roofPDark: "#674397",
  door: "#6b4a2b", win: "#a9dcf5", winFrame: "#5d7f93",
  post: "#4a4a4a", bulb: "#fff4b0", glow: "rgba(255, 228, 120, 0.35)", bulbOff: "#9a9a9a", star: "#ffd54a",
  skin: "#f6d2ad", eye: "#333", legs: "#3b3f58",
};
const SHIRTS = ["#3b6fd1", "#d1883b", "#3bb08f", "#b04a8f", "#8f6fd1", "#5c8f3b"];
const HAIR = ["#5a3a22", "#222222", "#c2a14d", "#7a3b22", "#3d2a18", "#a35a2a"];

function px(g, x, y, w, h, c) { g.fillStyle = c; g.fillRect(x, y, w, h); }

// Stable pseudo-random value per tile, so details do not move with the camera
function hash(x, y, salt) {
  let h = (x * 374761393 + y * 668265263 + salt * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function ground(g, X, Y, base, dot, tx, ty) {
  px(g, X, Y, T, T, base);
  for (let i = 0; i < 3; i++) {
    if (hash(tx, ty, i) < 0.6) px(g, X + 1 + Math.floor(hash(tx, ty, i + 7) * 14), Y + 1 + Math.floor(hash(tx, ty, i + 13) * 14), 1, 1, dot);
  }
}

function sand(g, X, Y, tx, ty, n) {
  px(g, X, Y, T, T, C.sand);
  for (let i = 0; i < 2; i++) px(g, X + Math.floor(hash(tx, ty, i + 3) * 15), Y + Math.floor(hash(tx, ty, i + 5) * 15), 2, 1, C.sandDot);
  if (!n.up) px(g, X, Y, T, 1, C.sandEdge);
  if (!n.down) px(g, X, Y + 15, T, 1, C.sandEdge);
  if (!n.left) px(g, X, Y, 1, T, C.sandEdge);
  if (!n.right) px(g, X + 15, Y, 1, T, C.sandEdge);
}

function pave(g, X, Y) {
  px(g, X, Y, T, T, C.pave);
  px(g, X, Y + 7, T, 1, C.paveLine); px(g, X + 7, Y, 1, 7, C.paveLine);
  px(g, X + 3, Y + 8, 1, 8, C.paveLine); px(g, X + 11, Y + 8, 1, 8, C.paveLine);
}

function tall(g, X, Y) {
  px(g, X, Y, T, T, C.tall);
  for (let row = 0; row < 4; row++) for (let col = 0; col < 4; col++) {
    const bx = X + col * 4 + (row % 2) * 2, by = Y + row * 4;
    px(g, bx, by + 1, 1, 3, C.tallDark); px(g, bx + 1, by, 1, 3, C.tallLight); px(g, bx + 2, by + 1, 1, 3, C.tallDark);
  }
}

function tree(g, X, Y) {
  px(g, X + 6, Y + 13, 4, 3, C.trunk);
  const rows = [[4, 8], [2, 12], [1, 14], [1, 14], [0, 16], [0, 16], [0, 16], [0, 16], [1, 14], [1, 14], [2, 12], [4, 8]];
  rows.forEach(([o, w], i) => px(g, X + o, Y + i, w, 1, C.treeMid));
  rows.forEach(([o, w], i) => { if (i > 5) px(g, X + o + w - 5, Y + i, 5, 1, C.treeDark); });
  px(g, X + 3, Y + 2, 5, 2, C.treeLight); px(g, X + 2, Y + 4, 4, 2, C.treeLight); px(g, X + 4, Y + 3, 2, 1, C.treeHi);
  px(g, X + 9, Y + 6, 3, 2, C.treeLight); px(g, X + 5, Y + 8, 3, 2, C.treeLight);
  px(g, X + 1, Y + 11, 14, 1, C.treeDark);
}

function water(g, X, Y, n, t) {
  px(g, X, Y, T, T, C.water);
  px(g, X, Y + 8, T, 8, C.waterDeep);
  const s = ((t % 16) + 16) % 16;
  px(g, X + (s % 12), Y + 4, 4, 1, C.waterHi); px(g, X + ((s + 7) % 12), Y + 11, 3, 1, C.waterHi);
  if (!n.up) { px(g, X, Y, T, 2, C.foam); px(g, X, Y + 2, T, 1, C.waterHi); }
  if (!n.left) px(g, X, Y, 2, T, C.foam);
  if (!n.right) px(g, X + 14, Y, 2, T, C.foam);
  if (!n.down) px(g, X, Y + 14, T, 2, C.foam);
}

function cliff(g, X, Y, n) {
  px(g, X, Y, T, T, C.cliffFace);
  for (let k = 0; k < 4; k++) { px(g, X, Y + k * 4 + 3, T, 1, C.cliffDark); px(g, X + ((k * 5) % 13), Y + k * 4 + 1, 3, 1, C.cliffTop); }
  if (!n.up) { px(g, X, Y, T, 3, C.plateau); px(g, X, Y + 3, T, 1, C.cliffLine); }
  if (!n.left) px(g, X, Y, 1, T, C.cliffLine);
  if (!n.right) px(g, X + 15, Y, 1, T, C.cliffLine);
}

function stairs(g, X, Y) {
  px(g, X, Y, T, T, C.cliffTop);
  for (let k = 0; k < 4; k++) { px(g, X + 1, Y + k * 4, 14, 3, C.sand); px(g, X + 1, Y + k * 4 + 3, 14, 1, C.cliffDark); }
}

function flower(g, X, Y, tx, ty) {
  const c = hash(tx, ty, 21) < 0.5 ? "#f6f0f0" : "#f4d65b";
  px(g, X + 4, Y + 5, 2, 2, c); px(g, X + 10, Y + 9, 2, 2, c); px(g, X + 6, Y + 11, 2, 2, "#e86f7d");
}

/**
 * Paint one tile at pixel position (X, Y).
 * @param {{ tx: number, ty: number, frame: number, same: (kinds: string[]) => { up, down, left, right } }} ctx
 */
export function paintTile(g, kind, X, Y, ctx) {
  const { tx, ty } = ctx;
  switch (kind) {
    case "grass": ground(g, X, Y, (tx + ty) % 2 ? C.grass : C.grass2, C.grassDot, tx, ty); break;
    case "flower": ground(g, X, Y, C.grass, C.grassDot, tx, ty); flower(g, X, Y, tx, ty); break;
    case "meadow": ground(g, X, Y, C.meadow, C.meadowDot, tx, ty); break;
    case "plateau": ground(g, X, Y, C.plateau, C.plateauDot, tx, ty); break;
    case "pave": pave(g, X, Y); break;
    case "sand": sand(g, X, Y, tx, ty, ctx.same(["sand", "pave", "stairs"])); break;
    case "tall": tall(g, X, Y); break;
    case "tree": ground(g, X, Y, C.grass2, C.grassDot, tx, ty); tree(g, X, Y); break;
    case "water": water(g, X, Y, ctx.same(["water"]), ctx.frame + tx * 3 + ty); break;
    case "cliff": cliff(g, X, Y, ctx.same(["cliff", "stairs"])); break;
    case "stairs": stairs(g, X, Y); break;
    default: px(g, X, Y, T, T, "#000");
  }
}

function house(g, X, Y, roofIndex) {
  const [roof, roofDark] = C.roofs[roofIndex % C.roofs.length];
  const W = 4 * T;
  px(g, X + 2, Y + 2, W - 4, 20, roof);
  for (let k = 0; k < 5; k++) px(g, X + 2, Y + 4 + k * 4, W - 4, 1, roofDark);
  px(g, X, Y + 20, W, 3, roofDark);
  px(g, X + 3, Y + 23, W - 6, 23, C.wall); px(g, X + 3, Y + 42, W - 6, 4, C.wallShade);
  px(g, X + 26, Y + 30, 12, 16, C.door); px(g, X + 36, Y + 37, 1, 2, "#e8c66a");
  for (const wx of [8, 44]) { px(g, X + wx, Y + 28, 12, 9, C.winFrame); px(g, X + wx + 1, Y + 29, 10, 7, C.win); px(g, X + wx + 1, Y + 29, 4, 2, "#e9f8ff"); }
}

function gym(g, X, Y) {
  const W = 6 * T;
  px(g, X + 2, Y + 4, W - 4, 24, C.roofP);
  for (let k = 0; k < 6; k++) px(g, X + 2, Y + 6 + k * 4, W - 4, 1, C.roofPDark);
  px(g, X, Y + 26, W, 4, C.roofPDark);
  px(g, X + 3, Y + 30, W - 6, 32, C.wall); px(g, X + 3, Y + 58, W - 6, 4, C.wallShade);
  px(g, X + 38, Y + 40, 20, 22, C.door);
  px(g, X + 30, Y + 31, 36, 8, "#f0c94c"); px(g, X + 31, Y + 32, 34, 6, "#fbe48a");
  for (const wx of [10, 72]) { px(g, X + wx, Y + 42, 12, 10, C.winFrame); px(g, X + wx + 1, Y + 43, 10, 8, C.win); }
}

function lamp(g, X, Y, state, frame) {
  const lit = state === "lit";
  if (lit) { g.fillStyle = C.glow; g.beginPath(); g.arc(X + 8, Y - 2, 9 + (frame % 2), 0, Math.PI * 2); g.fill(); }
  px(g, X + 7, Y, 2, 15, C.post); px(g, X + 5, Y + 14, 6, 2, C.post);
  px(g, X + 4, Y - 4, 8, 4, C.post); px(g, X + 5, Y - 3, 6, 2, lit ? C.bulb : C.bulbOff);
  if (state === "ready") { px(g, X + 12, Y - 7, 1, 3, C.star); px(g, X + 11, Y - 6, 3, 1, C.star); }
}

function sign(g, X, Y) {
  px(g, X + 7, Y + 8, 2, 7, C.trunk); px(g, X + 2, Y + 2, 12, 7, C.plankDark); px(g, X + 3, Y + 3, 10, 5, C.plank);
  px(g, X + 5, Y + 5, 6, 1, C.plankDark);
}

function person(g, X, Y, shirt, hair, facing = "down", step = 0) {
  px(g, X + 4, Y + 1, 8, 5, hair);
  if (facing !== "up") {
    px(g, X + 5, Y + 4, 6, 4, C.skin);
    if (facing === "down") { px(g, X + 6, Y + 6, 1, 1, C.eye); px(g, X + 9, Y + 6, 1, 1, C.eye); }
    if (facing === "left") px(g, X + 6, Y + 6, 1, 1, C.eye);
    if (facing === "right") px(g, X + 9, Y + 6, 1, 1, C.eye);
  } else {
    px(g, X + 5, Y + 4, 6, 4, hair);
  }
  px(g, X + 4, Y + 8, 8, 5, shirt);
  px(g, X + 3, Y + 9, 1, 3, C.skin); px(g, X + 12, Y + 9, 1, 3, C.skin);
  px(g, X + 5, Y + 13 - (step ? 1 : 0), 2, 3, C.legs); px(g, X + 9, Y + 13 - (step ? 0 : 1), 2, 3, C.legs);
}

function bubble(g, X, Y) {
  px(g, X + 4, Y - 12, 8, 10, "#ffffff"); px(g, X + 5, Y - 13, 6, 1, "#ffffff"); px(g, X + 7, Y - 2, 2, 2, "#ffffff");
  px(g, X + 7, Y - 11, 2, 5, "#e2402f"); px(g, X + 7, Y - 5, 2, 2, "#e2402f");
}

/**
 * Paint a map object at pixel position (X, Y) of its top-left tile.
 * @param {{ lamp?: string, bubble?: boolean, frame: number }} state
 */
export function paintObject(g, obj, X, Y, state) {
  switch (obj.kind) {
    case "house": house(g, X, Y, obj.roof ?? 0); break;
    case "gym": gym(g, X, Y); break;
    case "lamp": lamp(g, X, Y, state.lamp ?? "blocked", state.frame); break;
    case "sign": sign(g, X, Y); break;
    case "npc":
      person(g, X, Y, SHIRTS[obj.look % SHIRTS.length], HAIR[obj.look % HAIR.length]);
      if (state.bubble) bubble(g, X, Y);
      break;
  }
}

/** The player character, with a two-frame step while walking. */
export function paintHero(g, X, Y, facing, step) {
  person(g, X, Y, "#2f5fb8", "#d8402f", facing, step);
}

/** Orange "!" floating above the suggested next lamp. */
export function paintTargetMarker(g, X, Y, frame) {
  const bob = frame % 2;
  px(g, X + 6, Y - 22 - bob, 4, 7, "#ff7a2f"); px(g, X + 6, Y - 13 - bob, 4, 3, "#ff7a2f");
  px(g, X + 7, Y - 21 - bob, 2, 5, "#ffd2b0");
}
```

- [ ] **Step 2: 檢查語法**

Run: `node --check engine/tiles.js && node -e "import('./engine/tiles.js').then(m => console.log(Object.keys(m).join(' ')))"`
Expected: `T paintTile paintObject paintHero paintTargetMarker`

- [ ] **Step 3: Commit**

```bash
git add engine/tiles.js
git commit -m "Add pixel tile and sprite painters ported from the approved mockup"
```

---

### Task 7: 保存 `store.js`

**Files:**
- Create: `engine/store.js`

- [ ] **Step 1: 寫實作**

```js file=engine/store.js
// Persist worlds, progress and the current position in IndexedDB (design spec 4.5).
// Falls back to memory when IndexedDB is unavailable; `persistent` tells the UI which one is active.

const DB_NAME = "expert-quest";
const DB_VERSION = 1;
const STORES = ["worlds", "progress", "meta"];

const request = (req) => new Promise((resolve, reject) => {
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      for (const name of STORES) if (!req.result.objectStoreNames.contains(name)) req.result.createObjectStore(name);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbStore(db) {
  const get = (store, key) => request(db.transaction(store).objectStore(store).get(key));
  const put = (store, key, value) => request(db.transaction(store, "readwrite").objectStore(store).put(value, key));
  return {
    persistent: true,
    getWorld: (id) => get("worlds", id),
    putWorld: (rec) => put("worlds", rec.id, rec),
    getProgress: () => get("progress", "global"),
    putProgress: (progress) => put("progress", "global", progress),
    getMeta: () => get("meta", "current"),
    putMeta: (meta) => put("meta", "current", meta),
  };
}

function memoryStore() {
  const data = new Map();
  const get = async (key) => structuredClone(data.get(key));
  const put = async (key, value) => { data.set(key, structuredClone(value)); };
  return {
    persistent: false,
    getWorld: (id) => get(`world:${id}`),
    putWorld: (rec) => put(`world:${rec.id}`, rec),
    getProgress: () => get("progress"),
    putProgress: (progress) => put("progress", progress),
    getMeta: () => get("meta"),
    putMeta: (meta) => put("meta", meta),
  };
}

/** Open the store; never throws. */
export async function openStore() {
  try {
    if (!globalThis.indexedDB) throw new Error("IndexedDB is not available");
    return idbStore(await openDb());
  } catch (e) {
    console.warn("Progress will not be saved:", e);
    return memoryStore();
  }
}
```

- [ ] **Step 2: 檢查語法**

Run: `node --check engine/store.js`
Expected: 無輸出（語法正確）

- [ ] **Step 3: Commit**

```bash
git add engine/store.js
git commit -m "Add IndexedDB store with in-memory fallback"
```

---

### Task 8: 地圖畫面 `map.js`

**Files:**
- Create: `engine/map.js`

- [ ] **Step 1: 寫實作**

```js file=engine/map.js
// Canvas map view: camera, grid movement, keyboard and pointer input, interaction (design spec 4.6).
import { T, paintTile, paintObject, paintHero, paintTargetMarker } from "./tiles.js";
import { findPath, isWalkable, objectAt, interactTarget } from "./layout.js";

const STEP_MS = 150;      // time to walk one tile
const VIEW_W = 15, VIEW_H = 10;   // tiles that should fit on screen at the chosen scale
const ANIM_MS = 180;      // water and glow animation frame length
const MOVES = {
  arrowup: [0, -1, "up"], w: [0, -1, "up"],
  arrowdown: [0, 1, "down"], s: [0, 1, "down"],
  arrowleft: [-1, 0, "left"], a: [-1, 0, "left"],
  arrowright: [1, 0, "right"], d: [1, 0, "right"],
};
const TEXT_FIELDS = new Set(["INPUT", "TEXTAREA", "SELECT"]);

/**
 * @param {HTMLCanvasElement} canvas
 * @param {object} map  from layout.buildMap
 * @param {{ start?: {x:number,y:number}, objectState(obj): object, target(): object|null,
 *           onInteract(obj): void, onArrive?(pos: {x:number,y:number}): void }} hooks
 */
export function createMapView(canvas, map, hooks) {
  const g = canvas.getContext("2d");
  const start = hooks.start && isWalkable(map, hooks.start.x, hooks.start.y) ? hooks.start : map.spawn;
  const hero = { x: start.x, y: start.y, facing: "down", fromX: start.x, fromY: start.y, t0: -Infinity };
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let path = [], pending = null, held = null, arrivePending = false;
  let scale = 3, dpr = 1, frame = 0, lastAnim = 0, running = true;
  let camera = { ox: 0, oy: 0 };

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(canvas.clientWidth * dpr));
    canvas.height = Math.max(1, Math.round(canvas.clientHeight * dpr));
    scale = Math.max(2, Math.floor(Math.min(canvas.width / (VIEW_W * T), canvas.height / (VIEW_H * T))));
  }

  const moving = (now) => now - hero.t0 < STEP_MS;

  function tryStep(dx, dy, facing, now) {
    hero.facing = facing;
    if (!isWalkable(map, hero.x + dx, hero.y + dy)) return false;
    hero.fromX = hero.x; hero.fromY = hero.y;
    hero.x += dx; hero.y += dy;
    hero.t0 = now;
    arrivePending = true;
    return true;
  }

  function faceToward(obj) {
    const cx = Math.max(obj.x, Math.min(hero.x, obj.x + (obj.w ?? 1) - 1));
    const cy = Math.max(obj.y, Math.min(hero.y, obj.y + (obj.h ?? 1) - 1));
    const dx = cx - hero.x, dy = cy - hero.y;
    hero.facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : (dy > 0 ? "down" : "up");
  }

  function update(now) {
    if (moving(now)) return;
    if (arrivePending) { arrivePending = false; hooks.onArrive?.({ x: hero.x, y: hero.y }); }
    if (path.length) {
      const next = path.shift();
      const dx = next.x - hero.x, dy = next.y - hero.y;
      const facing = dx > 0 ? "right" : dx < 0 ? "left" : dy > 0 ? "down" : "up";
      if (!tryStep(dx, dy, facing, now)) path = [];
      return;
    }
    if (pending) {
      const obj = pending;
      pending = null;
      faceToward(obj);
      hooks.onInteract(obj);
      return;
    }
    if (held) tryStep(held[0], held[1], held[2], now);
  }

  function same(x, y, kinds) {
    const at = (xx, yy) => yy >= 0 && yy < map.height && xx >= 0 && xx < map.width && kinds.includes(map.tiles[yy][xx]);
    return { up: at(x, y - 1), down: at(x, y + 1), left: at(x - 1, y), right: at(x + 1, y) };
  }

  function draw(now) {
    const W = canvas.width, H = canvas.height;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.imageSmoothingEnabled = false;
    g.fillStyle = "#1d3b22";
    g.fillRect(0, 0, W, H);

    // Camera follows the interpolated hero position, snapped to whole device pixels
    const k = Math.min(1, (now - hero.t0) / STEP_MS);
    const hx = hero.fromX + (hero.x - hero.fromX) * k, hy = hero.fromY + (hero.y - hero.fromY) * k;
    const size = T * scale;
    camera = { ox: Math.round(W / 2 - (hx * T + T / 2) * scale), oy: Math.round(H / 2 - (hy * T + T / 2) * scale) };
    g.setTransform(scale, 0, 0, scale, camera.ox, camera.oy);

    const x0 = Math.max(0, Math.floor(-camera.ox / size) - 1), y0 = Math.max(0, Math.floor(-camera.oy / size) - 1);
    const x1 = Math.min(map.width - 1, x0 + Math.ceil(W / size) + 2), y1 = Math.min(map.height - 1, y0 + Math.ceil(H / size) + 2);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      paintTile(g, map.tiles[y][x], x * T, y * T, { tx: x, ty: y, frame, same: (kinds) => same(x, y, kinds) });
    }

    // Objects and hero sorted by their bottom edge so nearer things overlap farther ones
    const visible = map.objects.filter((o) => o.x + (o.w ?? 1) >= x0 && o.x <= x1 && o.y + (o.h ?? 1) >= y0 && o.y <= y1 + 1);
    const items = [...visible.map((o) => ({ z: o.y + (o.h ?? 1), o })), { z: hy + 1.01, hero: true }].sort((a, b) => a.z - b.z);
    const target = hooks.target();
    for (const item of items) {
      if (item.hero) {
        paintHero(g, hx * T, hy * T, hero.facing, moving(now) ? Math.floor(now / 120) % 2 : 0);
        continue;
      }
      paintObject(g, item.o, item.o.x * T, item.o.y * T, { ...hooks.objectState(item.o), frame });
      if (item.o === target) paintTargetMarker(g, item.o.x * T, item.o.y * T, frame);
    }
  }

  function loop(now) {
    if (!running) return;
    if (!still && now - lastAnim > ANIM_MS) { frame++; lastAnim = now; }
    update(now);
    draw(now);
    requestAnimationFrame(loop);
  }

  function interact() {
    const obj = interactTarget(map, hero.x, hero.y, hero.facing);
    if (obj) { faceToward(obj); hooks.onInteract(obj); }
  }

  /** Walk to an object (and talk to it on arrival). Returns false when it cannot be reached. */
  function goTo(obj, interactAfter = true) {
    const steps = findPath(map, hero, obj);
    if (steps === null) return false;
    path = steps;
    pending = interactAfter ? obj : null;
    held = null;
    return true;
  }

  function teleport(x, y) {
    hero.x = hero.fromX = x; hero.y = hero.fromY = y; hero.t0 = -Infinity;
    path = []; pending = null; held = null;
    hooks.onArrive?.({ x, y });
  }

  function onKeyDown(e) {
    const tag = e.target?.tagName;
    if (TEXT_FIELDS.has(tag) || e.target?.isContentEditable || e.ctrlKey || e.metaKey || e.altKey) return;
    const key = e.key.toLowerCase();
    if (MOVES[key]) { held = MOVES[key]; path = []; pending = null; e.preventDefault(); return; }
    if (tag === "BUTTON") return;   // let space and enter activate the focused button
    if (key === "e" || key === " " || key === "enter") { e.preventDefault(); interact(); }
  }
  function onKeyUp(e) {
    if (held && MOVES[e.key.toLowerCase()] === held) held = null;
  }
  function onPointer(e) {
    const rect = canvas.getBoundingClientRect();
    const size = T * scale;
    const tx = Math.floor(((e.clientX - rect.left) * dpr - camera.ox) / size);
    const ty = Math.floor(((e.clientY - rect.top) * dpr - camera.oy) / size);
    const obj = objectAt(map, tx, ty);
    if (obj) goTo(obj);
    else { path = findPath(map, hero, { x: tx, y: ty }) ?? []; pending = null; held = null; }
  }

  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  canvas.addEventListener("pointerdown", onPointer);
  resize();
  requestAnimationFrame(loop);

  return {
    hero,
    goTo,
    teleport,
    interact,
    destroy() {
      running = false;
      observer.disconnect();
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      canvas.removeEventListener("pointerdown", onPointer);
    },
  };
}
```

- [ ] **Step 2: 檢查語法**

Run: `node --check engine/map.js`
Expected: 無輸出

- [ ] **Step 3: Commit**

```bash
git add engine/map.js
git commit -m "Add canvas map view with grid movement and interaction"
```

---

### Task 9: 側邊面板 `panel.js`

**Files:**
- Create: `engine/panel.js`

- [ ] **Step 1: 寫實作**

```js file=engine/panel.js
// Side panel / bottom drawer: skill pages, practices and glossary dives (design spec 4.4).
// All text is inserted as text nodes (never innerHTML); KaTeX auto-render typesets $...$ afterwards.
import { prepare, simOutput } from "./questions.js";
import { skillLevel, isSolved, isExpandable } from "./progress.js";

const KTYPE = { fact: "事實", concept: "概念", procedure: "程序", principle: "原理", judgment: "判斷" };
const KIND = { core: "核心", optional: "支線", app: "應用", tool: "工具", supplement: "補充" };
const CONF = { document: "文件原意", "ai-verified": "AI 驗證", exploratory: "探索中" };
const CONTEXT = { subject: "學科", commission: "委託" };
const FIG = { plot: "函數圖", diagram: "示意圖", circuit: "電路圖", molecule: "分子結構", flow: "流程圖", table: "表格", ref: "原書圖" };
const MATH = /(\$\$[\s\S]+?\$\$|\$(?:\\\$|[^$])+?\$)/;
const DELIMITERS = [{ left: "$$", right: "$$", display: true }, { left: "$", right: "$", display: false }];

// Tiny element builder: h("p", { class: "x", onclick }, "text", child)
function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k === "class") el.className = v;
    else el.setAttribute(k, v === true ? "" : String(v));
  }
  for (const c of children.flat()) if (c !== null && c !== undefined && c !== false) el.append(c instanceof Node ? c : String(c));
  return el;
}

const textOf = (v) => (v && typeof v === "object" ? v.text ?? "" : v ?? "");
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const joinNodes = (nodes) => nodes.flatMap((n, i) => (i ? ["、", n] : [n]));

function parseNumber(s) {
  const clean = String(s).trim().replace(/[，,\s]/g, "");
  return clean === "" ? NaN : Number(clean);
}

function figSummary(f) {
  if (f.type === "ref") return `原書圖（第 ${f.page ?? "?"} 頁${f.figure ? "，" + f.figure : ""}）：${f.desc}`;
  return `${FIG[f.type] ?? f.type}（之後會繪製成圖）`;
}

/**
 * @param {HTMLElement} root  the <aside> that holds the panel
 * @param {{ world(): object, progress(): object, answer(practice, prepared, response): object, onClose?(): void }} deps
 */
export function createPanel(root, deps) {
  const stack = [];

  function typeset(el) {
    if (typeof window.renderMathInElement !== "function") return;
    try { window.renderMathInElement(el, { delimiters: DELIMITERS, throwOnError: false }); } catch (e) { console.warn("KaTeX failed", e); }
  }

  // Text with math left intact and glossary terms turned into dive buttons
  function rich(value, tag = "p") {
    const el = h(tag, { class: "rich" });
    const terms = deps.world().glossary.map((g) => g.term).filter(Boolean).sort((a, b) => b.length - a.length);
    const re = terms.length ? new RegExp(terms.map(escapeRe).join("|"), "g") : null;
    for (const part of String(textOf(value)).split(MATH)) {
      if (!part) continue;
      if (!re || MATH.test(part)) { el.append(part); continue; }
      let last = 0;
      for (const m of part.matchAll(re)) {
        el.append(part.slice(last, m.index));
        el.append(h("button", { type: "button", class: "term", onclick: () => push({ view: "term", term: m[0] }) }, m[0]));
        last = m.index + m[0].length;
      }
      el.append(part.slice(last));
    }
    return el;
  }

  function attributionText(item) {
    const a = item.attribution ?? {};
    const name = a.name ?? (item.origin === "document" ? deps.world().source?.title : null);
    return [name, a.loc, a.url].filter(Boolean).join("，") || "—";
  }

  function push(entry) { stack.push(entry); render(); }
  function back() { stack.pop(); if (stack.length) render(); else close(); }
  function close() {
    stack.length = 0;
    root.classList.remove("open", "tall");
    root.replaceChildren();
    deps.onClose?.();
  }
  const reset = (entry) => { stack.length = 0; push(entry); };

  function render() {
    const top = stack.at(-1);
    const body = top.view === "skill" ? skillView(top.id)
      : top.view === "practice" ? practiceView(top.id)
      : top.view === "term" ? termView(top.term)
      : listView(top);
    const bar = h("div", { class: "panel-bar" },
      stack.length > 1 ? h("button", { type: "button", class: "ghost", onclick: back }, "← 返回") : h("span"),
      h("button", { type: "button", class: "ghost", "aria-label": "關閉", onclick: close }, "✕"));
    root.classList.add("open");
    root.replaceChildren(h("button", { type: "button", class: "grip", "aria-label": "拉高或收起面板", onclick: () => root.classList.toggle("tall") }), bar, body);
    typeset(body);
  }

  function skillLink(sid) {
    const s = deps.world().skills.find((x) => x.id === sid);
    return s ? h("button", { type: "button", class: "link", onclick: () => push({ view: "skill", id: sid }) }, s.name)
      : h("span", { class: "muted" }, `${sid}（其他世界）`);
  }

  function skillView(id) {
    const w = deps.world();
    const s = w.skills.find((x) => x.id === id);
    if (!s) return h("div", { class: "panel-body" }, h("p", {}, "這個技能尚未生成。"));
    const prog = deps.progress();
    const own = w.practices.filter((p) => p.skill === id);
    const next = w.skills.filter((x) => (x.pre ?? []).includes(id));
    const pages = s.pages ? `p.${s.pages[0]}–${s.pages[1]}` : "";
    return h("div", { class: "panel-body" },
      h("h2", {}, s.name),
      h("p", { class: "meta" }, [s.en, s.id, s.num ? `§${s.num}` : "", pages].filter(Boolean).join(" · ")),
      s.aliases?.length ? h("p", { class: "meta" }, `別名：${s.aliases.join("、")}`) : null,
      h("p", { class: "tags" },
        ...(s.ktype ?? []).map((k) => h("span", { class: "tag" }, KTYPE[k] ?? k)),
        h("span", { class: "tag" }, KIND[s.kind] ?? s.kind),
        ...(s.meta ?? []).map((m) => h("span", { class: "tag" }, m)),
        h("span", { class: "tag" }, CONF[s.confidence] ?? s.confidence),
        h("span", { class: "tag strong" }, `Lv${skillLevel(prog, s, w)} / ${s.maxLevel}`)),
      rich(s.def),
      ...(s.figs ?? []).map((f) => h("p", { class: "fig" }, figSummary(f))),
      textOf(s.analog) ? h("div", { class: "box" }, h("strong", {}, "類比："), rich(s.analog, "span"),
        textOf(s.analogLimit) ? h("p", { class: "muted" }, "類比的極限：", rich(s.analogLimit, "span")) : null) : null,
      textOf(s.story) ? h("div", { class: "box" }, h("strong", {}, "由來："), rich(s.story, "span")) : null,
      h("p", { class: "muted" }, `出處：${attributionText(s)}`),
      h("h3", {}, "先修"),
      (s.pre ?? []).length ? h("p", {}, ...joinNodes(s.pre.map(skillLink))) : h("p", { class: "muted" }, "無"),
      h("h3", {}, "後續"),
      next.length ? h("p", {}, ...joinNodes(next.map((x) => skillLink(x.id)))) : h("p", { class: "muted" }, "無"),
      h("h3", {}, "練習關卡"),
      own.length ? h("ul", { class: "practices" }, ...own.map((p) => h("li", {},
        h("button", { type: "button", class: "practice", onclick: () => push({ view: "practice", id: p.id }) },
          h("span", {}, p.scene || p.id),
          h("small", {}, `${CONTEXT[p.context] ?? p.context} · Lv${p.level}${isSolved(prog, p) ? " · 已完成" : ""}`)))))
        : h("p", { class: "muted" }, "尚無練習關卡"),
      isExpandable(prog, s, w) ? h("p", { class: "note" }, "這個技能更高的等級目前沒有足夠的練習關卡，之後可以擴充難度。") : null);
  }

  function termView(term) {
    const w = deps.world();
    const g = w.glossary.find((x) => x.term === term);
    const linked = g?.skill ? w.skills.find((s) => s.id === g.skill) : null;
    return h("div", { class: "panel-body" },
      h("h2", {}, term),
      g?.en ? h("p", { class: "meta" }, g.en) : null,
      g ? rich(g.def) : h("p", { class: "muted" }, "找不到這個詞條。"),
      linked ? h("button", { type: "button", class: "link", onclick: () => push({ view: "skill", id: linked.id }) }, `前往技能：${linked.name}`) : null);
  }

  function listView(entry) {
    return h("div", { class: "panel-body" },
      h("h2", {}, entry.title),
      entry.items.length ? h("ul", { class: "list" }, ...entry.items.map((item) => h("li", {},
        item.onPick ? h("button", { type: "button", class: "practice", onclick: item.onPick }, item.label) : h("span", { class: item.tone ?? "" }, item.label))))
        : h("p", { class: "muted" }, entry.empty ?? "沒有項目"));
  }

  function practiceView(id) {
    const w = deps.world();
    const p = w.practices.find((x) => x.id === id);
    if (!p) return h("div", { class: "panel-body" }, h("p", {}, "找不到這個練習關卡。"));
    const skill = w.skills.find((s) => s.id === p.skill);
    const area = h("div", { class: "question" });
    const body = h("div", { class: "panel-body" },
      h("p", { class: "meta" }, `${skill?.name ?? p.skill} · ${CONTEXT[p.context] ?? p.context} · Lv${p.level}`),
      h("h2", {}, p.scene || "練習"),
      area,
      skill ? h("button", { type: "button", class: "link", onclick: () => push({ view: "skill", id: skill.id }) }, "看技能頁") : null);
    mountQuestion(area, prepare(p.question), (prepared, response) => deps.answer(p, prepared, response));
    return body;
  }

  function mountQuestion(area, q, submit) {
    const done = (response) => showResult(area, submit(q, response), () => { mountQuestion(area, q, submit); typeset(area); });
    area.replaceChildren(questionUI(q, done));
  }

  function choiceList(options, pick) {
    return h("div", { class: "choices" }, ...options.map((o, i) => h("button", { type: "button", class: "choice", onclick: () => pick(i) }, rich(o.label, "span"))));
  }

  function questionUI(q, done) {
    const box = h("div", {});
    if (q.fig) box.append(h("p", { class: "fig" }, figSummary(q.fig)));
    switch (q.type) {
      case "broken":
        box.append(h("p", { class: "error" }, "這題的資料有問題，暫時無法作答。"), h("p", { class: "muted" }, q.error));
        break;
      case "mc":
        box.append(rich(q.text), choiceList(q.options, (i) => done({ choice: i })));
        break;
      case "numeric": {
        box.append(rich(q.text));
        if (q.options) { box.append(choiceList(q.options, (i) => done({ choice: i }))); break; }
        const input = h("input", { type: "text", inputmode: "decimal", class: "num", "aria-label": "你的答案", autocomplete: "off" });
        box.append(h("form", { class: "num-form", onsubmit: (e) => { e.preventDefault(); done({ value: parseNumber(input.value) }); } },
          input, h("span", { class: "unit" }, q.unit), h("button", { type: "submit", class: "primary" }, "送出")));
        break;
      }
      case "order": {
        box.append(rich(q.text));
        const ordering = [...q.shown];
        const list = h("ol", { class: "order" });
        const move = (from, to) => { [ordering[from], ordering[to]] = [ordering[to], ordering[from]]; draw(); };
        const draw = () => {
          list.replaceChildren(...ordering.map((itemIndex, pos) => h("li", {},
            rich(q.items[itemIndex], "span"),
            h("span", { class: "order-btns" },
              h("button", { type: "button", "aria-label": "上移", disabled: pos === 0, onclick: () => move(pos, pos - 1) }, "↑"),
              h("button", { type: "button", "aria-label": "下移", disabled: pos === ordering.length - 1, onclick: () => move(pos, pos + 1) }, "↓")))));
          typeset(list);
        };
        draw();
        box.append(list, h("button", { type: "button", class: "primary", onclick: () => done({ order: [...ordering] }) }, "送出"));
        break;
      }
      case "sim": {
        box.append(rich(q.text));
        const values = Object.fromEntries(q.sliders.map((s) => [s.var, s.min]));
        const out = h("p", { class: "sim-out" });
        const show = () => {
          try { out.textContent = `${q.output.label}：${Number(simOutput(q, values).toPrecision(4))} ${q.output.unit ?? ""}`; }
          catch { out.textContent = `${q.output.label}：—`; }
        };
        for (const s of q.sliders) {
          const label = h("span", {}, `${s.label ?? s.var} = ${s.min} ${s.unit ?? ""}`);
          box.append(h("label", { class: "sim-row" }, label, h("input", {
            type: "range", min: s.min, max: s.max, step: s.step, value: s.min,
            oninput: (e) => { values[s.var] = Number(e.target.value); label.textContent = `${s.label ?? s.var} = ${values[s.var]} ${s.unit ?? ""}`; show(); },
          })));
        }
        show();
        box.append(out, h("button", { type: "button", class: "primary", onclick: () => done({ values: { ...values } }) }, "檢查"));
        break;
      }
      case "method": {
        box.append(rich(q.text));
        box.append(h("div", { class: "choices" }, ...q.methods.map((m, i) => h("button", {
          type: "button", class: "choice",
          onclick: () => {
            box.replaceChildren(h("p", { class: "meta" }, `你選擇：${m.name}`), questionUI(q.then, (resp) => done({ method: i, then: resp })));
            typeset(box);
          },
        }, m.name))));
        break;
      }
    }
    return box;
  }

  function showResult(area, res, retry) {
    const box = h("div", { class: res.correct ? "result ok" : "result bad", role: "status" },
      h("p", { class: "verdict" }, res.correct ? `答對了！${res.xp ? `＋${res.xp} 經驗值` : ""}` : "還沒答對"),
      res.detail?.methodWhy ? rich(`另一個方法比較好：${res.detail.methodWhy}`) : null,
      !res.correct && res.detail?.why ? rich(`常見錯誤：${res.detail.why}`) : null,
      !res.correct && res.detail?.answer ? rich(`正確答案：${res.detail.answer}`) : null,
      res.detail?.ex ? rich(`解說：${res.detail.ex}`) : null,
      h("button", { type: "button", class: res.correct ? "ghost" : "primary", onclick: retry }, res.correct ? "再做一次" : "再試一次"));
    area.replaceChildren(box);
    typeset(box);
  }

  return {
    openSkill: (id) => reset({ view: "skill", id }),
    openPractice: (id) => reset({ view: "practice", id }),
    openList: (title, items, empty) => reset({ view: "list", title, items, empty }),
    close,
    isOpen: () => stack.length > 0,
  };
}
```

- [ ] **Step 2: 檢查語法**

Run: `node --check engine/panel.js`
Expected: 無輸出

- [ ] **Step 3: Commit**

```bash
git add engine/panel.js
git commit -m "Add side panel with skill pages, practices and glossary dives"
```

---

### Task 10: 外殼與串接 `index.html`、`main.js`

**Files:**
- Replace: `engine/index.html`
- Create: `engine/main.js`
- Test: `test/engine-neutral.test.mjs`

- [ ] **Step 1: 寫失敗的測試**（舊的 `engine/index.html` 含測試書文字，所以會失敗）

```js file=test/engine-neutral.test.mjs
// The engine must not be tied to any particular book (CLAUDE.md section 5).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";

test("engine files contain no book-specific text", () => {
  const dir = new URL("../engine/", import.meta.url);
  const files = readdirSync(dir).filter((f) => /\.(js|html)$/.test(f));
  const banned = [/sadiku/i, /alexander/i, /electric circuits/i, /電路學/, /電路之城/, /歐姆/, /\bohm/i, /kirchhoff/i];
  for (const f of files) {
    const text = readFileSync(new URL(f, dir), "utf8");
    for (const b of banned) assert.ok(!b.test(text), `${f} matches ${b}`);
  }
});
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `node --test test/engine-neutral.test.mjs`
Expected: FAIL，`index.html matches /電路/`（或其他寫死的書籍文字）

- [ ] **Step 3: 寫新外殼**

```html file=engine/index.html
<!doctype html>
<html lang="zh-Hant-TW">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>專家養成記</title>
<link rel="stylesheet" href="vendor/katex/katex.min.css">
<script defer src="vendor/katex/katex.min.js"></script>
<script defer src="vendor/katex/contrib/mhchem.min.js"></script>
<script defer src="vendor/katex/contrib/auto-render.min.js"></script>
<style>
  :root {
    --bg: #f7f6f2; --fg: #1d1d1b; --muted: #66655f; --line: #dad8d0; --accent: #2f5fb8; --ok: #1f7a3a; --bad: #b3261e;
    --hud: rgba(20, 24, 30, 0.72); --panel-w: min(420px, 38vw); --panel-h: 46vh;
    color-scheme: light dark;
  }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) { --bg: #1b1c1e; --fg: #ececea; --muted: #a2a19b; --line: #36373a; --accent: #7aa2f0; --ok: #5cc27a; --bad: #ff8a80; }
  }
  :root[data-theme="dark"] { --bg: #1b1c1e; --fg: #ececea; --muted: #a2a19b; --line: #36373a; --accent: #7aa2f0; --ok: #5cc27a; --bad: #ff8a80; }
  * { box-sizing: border-box; }
  html, body { margin: 0; height: 100%; overflow: hidden; background: #1d3b22; font: 15px/1.6 system-ui, "Noto Sans TC", sans-serif; }
  button { font: inherit; cursor: pointer; }
  #map { position: fixed; left: 0; top: 0; right: 0; bottom: 0; width: 100%; height: 100%; display: block; touch-action: none; image-rendering: pixelated; }
  body.panel-open #map { width: calc(100% - var(--panel-w)); }
  #hud { position: fixed; left: 10px; top: 10px; display: flex; flex-wrap: wrap; gap: 6px; max-width: calc(100% - 20px); }
  #hud > * { background: var(--hud); color: #fff; padding: 4px 10px; border-radius: 6px; border: 0; font-size: 13px; }
  #hud-issues { background: #8a5a00 !important; }
  #actions { position: fixed; left: 10px; bottom: calc(10px + env(safe-area-inset-bottom)); display: flex; gap: 6px; flex-wrap: wrap; }
  #actions button { background: var(--hud); color: #fff; border: 0; padding: 8px 12px; border-radius: 8px; }
  #panel { position: fixed; top: 0; right: 0; bottom: 0; width: var(--panel-w); background: var(--bg); color: var(--fg);
    border-left: 1px solid var(--line); overflow-y: auto; transform: translateX(100%); transition: transform .2s ease; }
  #panel.open { transform: none; }
  #panel .grip { display: none; }
  .panel-bar { position: sticky; top: 0; display: flex; justify-content: space-between; padding: 8px 12px; background: var(--bg); border-bottom: 1px solid var(--line); }
  .panel-body { padding: 12px 16px 32px; }
  .panel-body h2 { margin: 0 0 4px; font-size: 20px; }
  .panel-body h3 { margin: 18px 0 6px; font-size: 15px; }
  .meta, .muted { color: var(--muted); font-size: 13px; margin: 2px 0; }
  .tags { display: flex; flex-wrap: wrap; gap: 4px; margin: 8px 0; }
  .tag { border: 1px solid var(--line); border-radius: 10px; padding: 0 8px; font-size: 12px; }
  .tag.strong { border-color: var(--accent); color: var(--accent); }
  .box { border-left: 3px solid var(--line); padding: 4px 10px; margin: 10px 0; }
  .fig { border: 1px dashed var(--line); border-radius: 6px; padding: 6px 10px; color: var(--muted); font-size: 13px; }
  .note { background: color-mix(in srgb, var(--accent) 10%, transparent); border-radius: 6px; padding: 6px 10px; }
  .term { background: none; border: 0; padding: 0; color: inherit; text-decoration: underline dashed; text-underline-offset: 3px; }
  .link { background: none; border: 0; padding: 0; color: var(--accent); text-decoration: underline; }
  .ghost { background: none; border: 1px solid var(--line); color: var(--fg); border-radius: 6px; padding: 4px 10px; }
  .primary { background: var(--accent); color: #fff; border: 0; border-radius: 6px; padding: 8px 16px; margin-top: 8px; }
  .practices, .list { list-style: none; padding: 0; margin: 0; display: grid; gap: 6px; }
  .practice { width: 100%; text-align: left; display: flex; justify-content: space-between; gap: 8px; background: none; color: var(--fg);
    border: 1px solid var(--line); border-radius: 8px; padding: 8px 10px; }
  .practice small { color: var(--muted); white-space: nowrap; }
  .choices { display: grid; gap: 6px; margin-top: 10px; }
  .choice { text-align: left; background: none; color: var(--fg); border: 1px solid var(--line); border-radius: 8px; padding: 10px 12px; }
  .choice:hover, .practice:hover { border-color: var(--accent); }
  .num-form { display: flex; gap: 6px; align-items: center; margin-top: 10px; flex-wrap: wrap; }
  .num { width: 9em; padding: 8px; border: 1px solid var(--line); border-radius: 6px; background: transparent; color: var(--fg); font: inherit; }
  .num-form .primary { margin-top: 0; }
  .order { padding-left: 1.4em; display: grid; gap: 6px; }
  .order li { display: flex; justify-content: space-between; gap: 8px; border: 1px solid var(--line); border-radius: 8px; padding: 6px 8px; }
  .order-btns button { background: none; border: 1px solid var(--line); color: var(--fg); border-radius: 4px; width: 2em; }
  .sim-row { display: grid; gap: 4px; margin-top: 10px; }
  .sim-out { font-weight: 600; }
  .result { border-radius: 8px; padding: 8px 12px; margin-top: 10px; border: 1px solid var(--line); }
  .result.ok { border-color: var(--ok); } .result.bad { border-color: var(--bad); }
  .verdict { font-weight: 700; margin: 0 0 6px; }
  .result.ok .verdict { color: var(--ok); } .result.bad .verdict { color: var(--bad); }
  .error { color: var(--bad); }
  #welcome { position: fixed; inset: 0; display: grid; place-content: center; gap: 8px; padding: 16px; text-align: center;
    background: var(--bg); color: var(--fg); }
  #welcome h1 { margin: 0; }
  #toast { position: fixed; left: 50%; top: 56px; transform: translateX(-50%); background: var(--hud); color: #fff; padding: 8px 14px; border-radius: 8px; max-width: 90vw; }
  [hidden] { display: none !important; }
  @media (max-width: 720px) {
    body.panel-open #map { width: 100%; height: calc(100% - var(--panel-h)); }
    #panel { top: auto; left: 0; width: 100%; height: var(--panel-h); border-left: 0; border-top: 1px solid var(--line);
      border-radius: 12px 12px 0 0; transform: translateY(100%); }
    #panel.tall { height: 86vh; }
    body.panel-open:has(#panel.tall) #map { height: 14vh; }
    #panel .grip { display: block; width: 100%; height: 18px; background: none; border: 0; position: relative; }
    #panel .grip::after { content: ""; position: absolute; left: 50%; top: 7px; width: 40px; height: 4px; margin-left: -20px; border-radius: 2px; background: var(--line); }
  }
  @media (prefers-reduced-motion: reduce) { #panel { transition: none; } }
</style>
</head>
<body>
<canvas id="map" aria-label="世界地圖"></canvas>
<header id="hud" hidden>
  <span id="hud-title"></span><span id="hud-lit"></span><span id="hud-xp"></span>
  <button id="hud-issues" type="button" hidden></button><span id="hud-save" hidden>進度不會保存</span>
</header>
<nav id="actions" hidden>
  <button id="btn-go" type="button">帶我去 ！</button>
  <button id="btn-book" type="button">書本地圖</button>
  <button id="btn-open" type="button">開啟世界</button>
</nav>
<aside id="panel" aria-live="polite"></aside>
<section id="welcome" hidden>
  <h1>專家養成記</h1>
  <p>選擇一個世界檔（world.json），或一次選取多個世界片段。</p>
  <p><button id="btn-welcome-open" type="button" class="primary">開啟世界檔或片段</button></p>
  <p id="welcome-error" class="error" hidden></p>
  <p class="muted">方向鍵或 WASD 移動，E 互動；手機可點地面移動、點物件互動。</p>
</section>
<input id="file" type="file" multiple accept=".json,.txt,.md,application/json,text/plain" hidden>
<div id="toast" role="status" hidden></div>
<script type="module" src="main.js"></script>
</body>
</html>
```

- [ ] **Step 4: 寫串接**

```js file=engine/main.js
// Boot the engine: load a world, build the map, and wire map, panel, progress and storage together.
import { parseImport, mergeParts, ImportError } from "./merge.js";
import { checkWorld, assertShape } from "./check-world.js";
import { buildMap, distances, distanceTo } from "./layout.js";
import { createMapView } from "./map.js";
import { createPanel } from "./panel.js";
import { grade } from "./questions.js";
import { emptyProgress, recordCorrect, skillLevel, lampState, learnableSkills, isSolved } from "./progress.js";
import { openStore } from "./store.js";

const TIER_NAME = { 1: "初階", 2: "中階", 3: "高階" };
const META_SAVE_MS = 2000;
const $ = (id) => document.getElementById(id);

const state = {
  store: null, world: null, complete: false, issues: { errors: [], warnings: [] },
  progress: emptyProgress(), map: null, view: null, panel: null, target: null, lastMetaSave: 0,
};

async function safe(promise) {
  try { return await promise; } catch (e) { console.warn(e); return undefined; }
}

let toastTimer;
function toast(message) {
  const el = $("toast");
  el.textContent = message;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2600);
}

const skillById = (id) => state.world.skills.find((s) => s.id === id);
const practiceById = (id) => state.world.practices.find((p) => p.id === id);

function setPanelOpen(open) { document.body.classList.toggle("panel-open", open); }
function openPanel(show) { setPanelOpen(true); show(); }

function objectState(obj) {
  if (obj.kind === "lamp") {
    const s = skillById(obj.skill);
    return { lamp: s ? lampState(state.progress, s, state.world) : "blocked" };
  }
  if (obj.kind === "npc") {
    const p = practiceById(obj.practice);
    return { bubble: p ? !isSolved(state.progress, p) : false };
  }
  return {};
}

function onInteract(obj) {
  if (obj.kind === "lamp") openPanel(() => state.panel.openSkill(obj.skill));
  else if (obj.kind === "npc") openPanel(() => state.panel.openPractice(obj.practice));
  else if (obj.kind === "sign") {
    const list = obj.practices.map(practiceById).filter(Boolean);
    const next = list.find((p) => !isSolved(state.progress, p)) ?? list[0];
    openPanel(() => (next ? state.panel.openPractice(next.id) : state.panel.openSkill(obj.skill)));
  } else if (obj.kind === "gym") toast("道館：即將開放");
  else if (obj.kind === "house") toast("這戶人家不在家。");
}

// Suggested next lamp: ready to learn and the shortest walk away
function updateTarget() {
  const learnable = new Set(learnableSkills(state.progress, state.world));
  const dist = distances(state.map, state.view.hero);
  let best = null, bestDist = Infinity;
  for (const o of state.map.objects) {
    if (o.kind !== "lamp" || !learnable.has(o.skill)) continue;
    const d = distanceTo(state.map, dist, o);
    if (d < bestDist) { best = o; bestDist = d; }
  }
  state.target = best;
}

function onArrive(pos) {
  updateTarget();
  const now = Date.now();
  if (now - state.lastMetaSave > META_SAVE_MS) {
    state.lastMetaSave = now;
    safe(state.store.putMeta({ world: state.world.id, pos }));
  }
}

function updateHud() {
  const w = state.world;
  const lit = w.skills.filter((s) => skillLevel(state.progress, s, w) >= 1).length;
  const xp = w.skills.reduce((sum, s) => sum + (state.progress.skills[s.id]?.xp ?? 0), 0);
  $("hud-title").textContent = w.title ?? w.id;
  $("hud-lit").textContent = `已點亮 ${lit} / ${w.skills.length}`;
  $("hud-xp").textContent = `經驗 ${xp}`;
  const { errors, warnings } = state.issues;
  const btn = $("hud-issues");
  btn.hidden = errors.length === 0 && warnings.length === 0;
  btn.textContent = errors.length ? `有 ${errors.length} 個問題` : `${state.complete ? "" : "進行中，"}${warnings.length} 則提醒`;
}

function answer(practice, prepared, response) {
  const res = grade(prepared, response);
  if (!res.correct) return { ...res, xp: 0 };
  const skill = skillById(practice.skill);
  const before = skill ? skillLevel(state.progress, skill, state.world) : 0;
  const rec = recordCorrect(state.progress, practice, res.factor);
  state.progress = rec.progress;
  safe(state.store.putProgress(state.progress));
  if (skill) {
    const after = skillLevel(state.progress, skill, state.world);
    if (after > before) toast(after === 1 ? `街燈點亮了：${skill.name}` : `${skill.name} 升到 Lv${after}`);
  }
  updateTarget();
  updateHud();
  return { ...res, xp: rec.xp };
}

function openBookMap() {
  const items = state.map.towns.map((t) => ({
    label: `${t.name}（${TIER_NAME[t.tier] ?? `第 ${t.tier} 級`}）`,
    onPick: () => { state.view.teleport(t.entrance.x + 1, t.entrance.y); state.panel.close(); },
  }));
  openPanel(() => state.panel.openList("書本地圖", items, "這個世界還沒有任何章。"));
}

function openIssues() {
  const { errors, warnings } = state.issues;
  const items = [
    ...errors.map((e) => ({ label: `錯誤：${e}`, tone: "error" })),
    ...warnings.slice(0, 200).map((w) => ({ label: `提醒：${w}`, tone: "muted" })),
  ];
  openPanel(() => state.panel.openList("世界檔檢查結果", items, "沒有問題。"));
}

function startWorld(rec, pos) {
  state.world = rec.world;
  state.complete = !!rec.complete;
  try {
    state.issues = checkWorld(rec.world, { partial: !rec.complete });
  } catch (e) {
    state.issues = { errors: [`check failed: ${e.message}`], warnings: [] };
  }
  state.view?.destroy();
  state.map = buildMap(rec.world);
  state.panel ??= createPanel($("panel"), {
    world: () => state.world, progress: () => state.progress, answer, onClose: () => setPanelOpen(false),
  });
  state.panel.close();
  state.view = createMapView($("map"), state.map, { start: pos, objectState, target: () => state.target, onInteract, onArrive });
  $("welcome").hidden = true;
  $("hud").hidden = false;
  $("actions").hidden = false;
  safe(state.store.putMeta({ world: rec.id, pos: { x: state.view.hero.x, y: state.view.hero.y } }));
  updateTarget();
  updateHud();
}

async function onFiles(e) {
  const files = [...e.target.files];
  e.target.value = "";
  if (!files.length) return;
  try {
    let docs = [];
    for (const f of files) docs.push(...parseImport(await f.text()));
    // New parts for a world we already have are merged after the stored parts
    const id = docs[0]?.kind === "part" ? docs[0].world : docs[0]?.id;
    const existing = id ? await safe(state.store.getWorld(id)) : null;
    if (existing && docs.every((d) => d.kind === "part")) docs = [...existing.parts, ...docs];
    const { world, complete } = mergeParts(docs);
    const problems = assertShape(world);
    if (problems.length) throw new ImportError(problems.slice(0, 5).join("；"));
    const rec = { id: world.id, world, complete, parts: docs, importedAt: new Date().toISOString() };
    await safe(state.store.putWorld(rec));
    startWorld(rec, existing ? state.view?.hero : null);
    toast(`已載入：${world.title ?? world.id}${complete ? "" : "（進行中）"}`);
  } catch (err) {
    const message = err instanceof ImportError ? `無法載入：${err.message}` : `無法載入：${err.message}`;
    if (!$("welcome").hidden) { $("welcome-error").textContent = message; $("welcome-error").hidden = false; } else toast(message);
    console.error(err);
  }
}

async function boot() {
  state.store = await openStore();
  $("hud-save").hidden = state.store.persistent;
  state.progress = (await safe(state.store.getProgress())) ?? emptyProgress();
  for (const id of ["btn-open", "btn-welcome-open"]) $(id).addEventListener("click", () => $("file").click());
  $("file").addEventListener("change", onFiles);
  $("btn-go").addEventListener("click", () => {
    if (state.target && state.view.goTo(state.target)) return;
    toast("目前沒有建議的下一盞街燈");
  });
  $("btn-book").addEventListener("click", openBookMap);
  $("hud-issues").addEventListener("click", openIssues);
  const meta = await safe(state.store.getMeta());
  const rec = meta?.world ? await safe(state.store.getWorld(meta.world)) : null;
  if (rec) startWorld(rec, meta.pos);
  else $("welcome").hidden = false;
}

boot();
```

- [ ] **Step 5: 執行全部測試**

Run: `npm test`
Expected: 全部 PASS（含 `engine files contain no book-specific text`）

- [ ] **Step 6: 啟動並手動檢查**

Run: `node tools/serve.mjs`，瀏覽器開 `http://localhost:8000/engine/`

檢查清單：
1. 看到歡迎畫面；選 `test/fixtures/valid-world.json` 後出現像素地圖與狀態列。
2. 方向鍵與 WASD 能走、撞到樹與房子會停；點地面會走過去。
3. 「！」出現在可學的街燈上；「帶我去」會走到它並打開技能頁。
4. 技能頁的公式由 KaTeX 排版；虛線術語可下潛、可返回。
5. 五種題型都能作答；答對後街燈點亮、經驗值增加。
6. 重新整理後回到原位，進度仍在。
7. 視窗縮到 400px 寬：面板變成底部抽屜，可拉高。

- [ ] **Step 7: Commit**

```bash
git add engine/index.html engine/main.js test/engine-neutral.test.mjs
git commit -m "Replace v0.1 engine with the phase A shell and wiring"
```

---

### Task 11: 用真實內容試玩並記錄

**Files:**
- Modify: `CLAUDE.md`（第 3 節 `engine/` 說明、第 7 節進度）
- Modify: `docs/test-log/2026-10-09-generation-run-1.md`

- [ ] **Step 1:** 依框架生成第 1 章片段 `worlds/sadiku-circuits-6e/parts/ch1.json`，以 `npm run validate -- worlds/sadiku-circuits-6e/parts/head.json worlds/sadiku-circuits-6e/parts/ch1.json` 驗證到沒有錯誤。
- [ ] **Step 2:** 在引擎中依序選取 `head.json` 與 `ch1.json` 載入，走完第 1 章城鎮。
- [ ] **Step 3:** 把試玩中發現的問題寫入測試紀錄（框架、片段、引擎各自的問題分開記）。
- [ ] **Step 4:** 更新 CLAUDE.md 第 7 節第 6 步為「A 段完成，B–D 段待做」。
- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md docs/test-log/2026-10-09-generation-run-1.md
git commit -m "Log first playthrough of generated chapter 1"
```
