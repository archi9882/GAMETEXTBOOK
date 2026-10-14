// Tests for engine/figure-model.js: figure data (framework 8.4) becomes drawing primitives.
import { test } from "node:test";
import assert from "node:assert/strict";
import { figureModel, niceTicks, tickText, flowLayers } from "../engine/figure-model.js";

const plot = (extra = {}) => ({
  type: "plot",
  x: { var: "t", min: 0, max: 6, label: "$t$", unit: "s" },
  y: { label: "$v$", unit: "m/s" },
  series: [{ expr: "v0 + a * t", label: "$v(t)$" }, { points: [[0, "v0"], [6, "v0 + a * 6"]], style: "dots" }],
  ...extra,
});

test("nice ticks are round numbers covering the range", () => {
  assert.deepEqual(niceTicks(0, 10), [0, 2, 4, 6, 8, 10]);
  assert.deepEqual(niceTicks(-1, 1), [-1, -0.5, 0, 0.5, 1]);
  assert.deepEqual(niceTicks(0.1, 0.35), [0.1, 0.15, 0.2, 0.25, 0.3, 0.35]);
});

test("tick text switches to scientific notation for extreme values", () => {
  assert.equal(tickText(2.5), "2.5");
  assert.equal(tickText(0), "0");
  assert.equal(tickText(3e-6), "3×10⁻⁶");
  assert.equal(tickText(120000), "1.2×10⁵");
});

test("plot uses the question variables for lines and points", () => {
  const m = figureModel(plot(), { v0: 2, a: 1.5 });
  assert.equal(m.kind, "svg");
  const lines = m.shapes.filter((s) => s.t === "poly");
  assert.equal(lines.length, 1);
  const dots = m.shapes.filter((s) => s.t === "circle");
  assert.equal(dots.length, 2);
  // Auto y range covers 2..11; the first dot (y = 2) sits above the x axis, the last (y = 11) near the top
  assert.ok(dots[0].cy > dots[1].cy);
  assert.deepEqual(m.legend.map((l) => l.text), ["$v(t)$"]);
  assert.ok(m.labels.some((l) => l.text === "$t$ (s)"));
});

test("plot breaks the line at poles instead of drawing across them", () => {
  const m = figureModel({ type: "plot", x: { min: -1, max: 1 }, y: { min: -10, max: 10 }, series: [{ expr: "1 / x" }] });
  assert.equal(m.shapes.filter((s) => s.t === "poly").length, 2);
});

test("plot supports a log axis", () => {
  const m = figureModel({ type: "plot", x: { min: 1, max: 1000, log: true }, y: { label: "y" }, series: [{ expr: "log10(x)" }] });
  const ticks = m.shapes.filter((s) => s.cls === "tick").map((s) => s.text);
  assert.deepEqual(ticks.slice(0, 4), ["1", "10", "100", "1000"]);
});

test("diagram maps the grid with y pointing up and evaluates coordinates", () => {
  const m = figureModel({
    type: "diagram", grid: [10, 6],
    points: [{ id: "A", at: [1, 1] }, { id: "B", at: [6, "1 + h"] }],
    segments: [{ from: "A", to: "B", style: "dashed" }],
    arrows: [{ from: [3, 1], to: [3, 4], label: "$F$" }],
    labels: [{ at: [1, 0], text: "A" }],
  }, { h: 2 });
  const seg = m.shapes.find((s) => s.t === "line" && s.cls.includes("dashed"));
  assert.ok(seg.y2 < seg.y1, "B is higher than A on screen");
  const arrow = m.shapes.find((s) => s.arrow);
  assert.ok(arrow.y2 < arrow.y1, "an arrow towards larger y points up");
  // Point A already has a free label with its name, so it is not labelled twice
  assert.equal(m.labels.filter((l) => l.text === "A").length, 1);
  assert.ok(m.labels.some((l) => l.text === "B"));
});

test("circuit draws every element kind and junction dots", () => {
  const kinds = ["wire", "resistor", "capacitor", "inductor", "vsource", "isource", "dep-vsource", "dep-isource", "switch", "diode", "lamp", "ammeter", "voltmeter"];
  const elements = kinds.map((kind, i) => ({ id: `e${i}`, kind, from: [0, i], to: [3, i], label: `{{V}} ${kind}` }));
  elements.push({ id: "g", kind: "ground", from: [5, 2], to: [5, 1] });
  elements.push({ id: "U1", kind: "opamp", pins: { plus: [6, 3], minus: [6, 5], out: [8, 4] } });
  // Three wires meet at (5, 2)
  elements.push({ id: "w1", kind: "wire", from: [4, 2], to: [5, 2] }, { id: "w2", kind: "wire", from: [5, 2], to: [5, 3] });
  const m = figureModel({ type: "circuit", grid: [9, 14], elements }, { V: 12 });
  assert.ok(m.shapes.length > kinds.length * 3);
  assert.ok(m.labels.some((l) => l.text === "12 resistor"));
  assert.ok(m.shapes.some((s) => s.t === "text" && s.text === "+"), "sources and the op-amp mark their + terminal");
  assert.ok(m.shapes.some((s) => s.t === "circle" && s.cls === "ink fill"), "junction dot where three elements meet");
});

test("flow layers follow the longest path and survive cycles", () => {
  const nodes = ["a", "b", "c", "d"].map((id) => ({ id, text: id }));
  const layers = flowLayers(nodes, [{ from: "a", to: "b" }, { from: "b", to: "c" }, { from: "a", to: "c" }, { from: "c", to: "a" }, { from: "c", to: "d" }]);
  assert.deepEqual(Object.fromEntries(layers), { a: 0, b: 1, c: 2, d: 3 });
});

test("flow boxes carry substituted text and edges have arrows", () => {
  const m = figureModel({ type: "flow", dir: "TB", nodes: [{ id: "n1", text: "{{n}} 步" }, { id: "n2", text: "B" }], edges: [{ from: "n1", to: "n2", label: "然後" }] }, { n: 3 });
  assert.deepEqual(m.boxes.map((b) => b.text), ["3 步", "B"]);
  assert.ok(m.boxes[1].y > m.boxes[0].y, "TB puts the second node below");
  assert.ok(m.shapes.some((s) => s.arrow));
  assert.ok(m.labels.some((l) => l.text === "然後"));
});

test("table evaluates expression cells with the question variables", () => {
  const m = figureModel({ type: "table", cols: ["x", "y"], rows: [["a", 2], ["{{k}}", { expr: "k * 2" }], ["big", 3e7]] }, { k: 1.25 });
  assert.deepEqual(m.rows, [["a", "2"], ["1.25", "2.5"], ["big", "$3 \\times 10^{7}$"]]);
});

test("ref and molecule pass their text through", () => {
  assert.deepEqual(figureModel({ type: "ref", desc: "照片", page: 12, figure: "圖 1.2" }), { kind: "ref", desc: "照片", page: 12, figure: "圖 1.2" });
  assert.equal(figureModel({ type: "molecule", smiles: "CCO", label: "乙醇" }).smiles, "CCO");
});

test("bad expressions throw so the renderer can fall back to text", () => {
  assert.throws(() => figureModel({ type: "table", cols: ["x"], rows: [[{ expr: "zz + 1" }]] }));
  assert.throws(() => figureModel({ type: "photo" }));
});
