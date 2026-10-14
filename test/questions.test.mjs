// Tests for preparing questions and grading answers (design spec 4.2).
import { test } from "node:test";
import assert from "node:assert/strict";
import { substitute, shuffleOrder, prepare, grade, simOutput, formatNumber } from "../engine/questions.js";

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

// --- display of very large and very small numbers (decision B) ---

test("formatNumber keeps ordinary numbers as they are", () => {
  for (const [v, s] of [[110, "110"], [0.5, "0.5"], [2400, "2400"], [0, "0"], [-12, "-12"], [0.001, "0.001"]]) {
    assert.equal(formatNumber(v), s);
  }
});

test("formatNumber writes extreme values in scientific notation as LaTeX", () => {
  assert.equal(formatNumber(3e12), "$3 \\times 10^{12}$");
  assert.equal(formatNumber(1.602e-19), "$1.602 \\times 10^{-19}$");
  assert.equal(formatNumber(-4.5e6, { math: true }), "-4.5 \\times 10^{6}");
});

test("substitute uses scientific notation, without extra dollars inside math", () => {
  const scope = { n: 3e12, e: 1.602e-19, V: 110 };
  assert.equal(substitute("有 {{n}} 個電子，{{V}} V", scope), "有 $3 \\times 10^{12}$ 個電子，110 V");
  assert.equal(substitute("$q = -{{n}} \\cdot {{e}}$", scope), "$q = -3 \\times 10^{12} \\cdot 1.602 \\times 10^{-19}$");
  assert.equal(substitute("$$Q = {{n}}$$ 與 {{n}}", scope), "$$Q = 3 \\times 10^{12}$$ 與 $3 \\times 10^{12}$");
  assert.equal(substitute("價格 \\$5，數量 {{n}}", scope), "價格 \\$5，數量 $3 \\times 10^{12}$");
});

test("numeric option labels use scientific notation for extreme values", () => {
  const p = prepare({ type: "numeric", as: "mc", q: "x", vars: { a: 5e-7 }, answer: "a", unit: "C", sig: 3,
    mistakes: [{ expr: "a * 10000", why: "w" }] });
  assert.ok(p.options.some((o) => o.label === "$5 \\times 10^{-7}$ C"), p.options.map((o) => o.label).join(" / "));
  assert.ok(p.options.some((o) => o.label === "0.005 C"));
});
