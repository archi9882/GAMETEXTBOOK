// Turn figure data (framework 8.4) into drawing primitives. Pure: no DOM, so it runs in node tests.
// Every coordinate and value goes through engine/expr.js with the question's variables (framework 8.3).
// Grid figures (diagram, circuit) put the origin at the bottom left with y pointing up.
import { evaluate } from "./expr.js";
import { substitute, formatNumber } from "./questions.js";

const PLOT = { w: 480, h: 300, left: 58, right: 18, top: 16, bottom: 46 };
const PLOT_SAMPLES = 240;
const GRID_CELL = 48;
const GRID_PAD = 36;
const FLOW = { w: 136, h: 52, gapX: 76, gapY: 36, pad: 12, bend: 30 };

/** Evaluate a literal number or an expression over the question variables. */
export function num(v, scope = {}) {
  if (typeof v === "number") return v;
  const r = evaluate(v, scope);
  if (typeof r !== "number") throw new Error(`not a number: ${v}`);
  return r;
}

/** Short text for tick labels: 4 significant digits, scientific outside 1e-3..1e5. */
export function tickText(v) {
  if (v === 0) return "0";
  const a = Math.abs(v);
  if (a >= 1e-3 && a < 1e5) return String(Number(v.toPrecision(4)));
  const [m, e] = v.toExponential(2).split("e");
  const sup = String(Number(e)).replace(/[-0-9]/g, (c) => "⁻⁰¹²³⁴⁵⁶⁷⁸⁹"["-0123456789".indexOf(c)]);
  return `${Number(m)}×10${sup}`;
}

/** About `count` evenly spaced round ticks (1, 2, 5 x 10^k) covering [lo, hi]. */
export function niceTicks(lo, hi, count = 5) {
  if (!(hi > lo)) return [lo];
  const raw = (hi - lo) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((k) => k * mag).find((s) => s >= raw) ?? 10 * mag;
  const ticks = [];
  for (let t = Math.ceil(lo / step) * step; t <= hi + step * 1e-9; t += step) ticks.push(Math.abs(t) < step * 1e-9 ? 0 : Number(t.toPrecision(12)));
  return ticks;
}

function axisMap(min, max, log, from, to) {
  const f = log ? Math.log10 : (v) => v;
  const a = f(min), b = f(max);
  return (v) => from + ((f(v) - a) / (b - a)) * (to - from);
}

function logTicks(min, max) {
  const ticks = [];
  for (let k = Math.ceil(Math.log10(min) - 1e-9); k <= Math.floor(Math.log10(max) + 1e-9); k++) ticks.push(10 ** k);
  return ticks.length ? ticks : [min, max];
}

const axisTitle = (axis) => [axis?.label, axis?.unit ? `(${axis.unit})` : ""].filter(Boolean).join(" ");

function plotModel(fig, scope) {
  const P = PLOT;
  const xVar = fig.x.var ?? "x";
  const xLog = !!fig.x.log, yLog = !!fig.y?.log;
  const xmin = num(fig.x.min, scope), xmax = num(fig.x.max, scope);
  const series = fig.series.map((s, i) => {
    let pts;
    if (s.expr !== undefined) {
      pts = [];
      for (let k = 0; k < PLOT_SAMPLES; k++) {
        const t = k / (PLOT_SAMPLES - 1);
        const x = xLog ? 10 ** (Math.log10(xmin) + t * (Math.log10(xmax) - Math.log10(xmin))) : xmin + t * (xmax - xmin);
        let y;
        try { y = num(s.expr, { ...scope, [xVar]: x }); } catch { y = NaN; }
        pts.push([x, y]);
      }
    } else {
      pts = s.points.map(([x, y]) => [num(x, scope), num(y, scope)]);
    }
    return { pts, label: s.label ? substitute(s.label, scope) : "", style: s.style ?? (s.expr !== undefined ? "line" : "dots"), index: i };
  });

  // y range: given, or from the finite data with a little headroom
  let ymin = fig.y?.min, ymax = fig.y?.max;
  if (ymin === undefined || ymax === undefined) {
    const ys = series.flatMap((s) => s.pts.map((p) => p[1])).filter((y) => Number.isFinite(y) && (!yLog || y > 0));
    let lo = ys.length ? Math.min(...ys) : 0, hi = ys.length ? Math.max(...ys) : 1;
    if (lo === hi) { lo -= Math.abs(lo) || 1; hi += Math.abs(hi) || 1; }
    const pad = yLog ? 0 : (hi - lo) * 0.06;
    ymin ??= yLog ? lo : (lo >= 0 && lo - pad < 0 ? 0 : lo - pad);
    ymax ??= hi + pad;
  }
  ymin = num(ymin, scope); ymax = num(ymax, scope);

  const X = axisMap(xmin, xmax, xLog, P.left, P.w - P.right);
  const Y = axisMap(ymin, ymax, yLog, P.h - P.bottom, P.top);
  const shapes = [];
  const xTicks = xLog ? logTicks(xmin, xmax) : niceTicks(xmin, xmax);
  const yTicks = yLog ? logTicks(ymin, ymax) : niceTicks(ymin, ymax);
  for (const t of xTicks) {
    shapes.push({ t: "line", x1: X(t), y1: P.top, x2: X(t), y2: P.h - P.bottom, cls: "grid" });
    shapes.push({ t: "text", x: X(t), y: P.h - P.bottom + 16, text: tickText(t), anchor: "middle", cls: "tick" });
  }
  for (const t of yTicks) {
    shapes.push({ t: "line", x1: P.left, y1: Y(t), x2: P.w - P.right, y2: Y(t), cls: "grid" });
    shapes.push({ t: "text", x: P.left - 6, y: Y(t) + 4, text: tickText(t), anchor: "end", cls: "tick" });
  }
  shapes.push({ t: "line", x1: P.left, y1: P.h - P.bottom, x2: P.w - P.right, y2: P.h - P.bottom, cls: "axis" });
  shapes.push({ t: "line", x1: P.left, y1: P.top, x2: P.left, y2: P.h - P.bottom, cls: "axis" });

  // Data, clipped to the plot box; a non-finite or out-of-range sample breaks the line
  const inBox = (x, y) => Number.isFinite(x) && Number.isFinite(y) && x >= xmin && x <= xmax && y >= ymin && y <= ymax && (!yLog || y > 0) && (!xLog || x > 0);
  for (const s of series) {
    const cls = `s${s.index % 4}`;
    if (s.style === "dots") {
      for (const [x, y] of s.pts) if (inBox(x, y)) shapes.push({ t: "circle", cx: X(x), cy: Y(y), r: 3.5, cls: `${cls} fill` });
      continue;
    }
    let run = [];
    const flush = () => { if (run.length > 1) shapes.push({ t: "poly", pts: run, cls }); run = []; };
    for (const [x, y] of s.pts) {
      if (inBox(x, y)) run.push([X(x), Y(y)]);
      else flush();
    }
    flush();
  }

  const labels = [];
  const xt = axisTitle(fig.x), yt = axisTitle(fig.y);
  if (xt) labels.push({ x: (P.left + P.w - P.right) / 2, y: P.h - 6, text: substitute(xt, scope), anchor: "middle" });
  if (yt) labels.push({ x: 4, y: P.top - 2, text: substitute(yt, scope), anchor: "start", cls: "ytitle" });
  const legend = series.filter((s) => s.label).map((s) => ({ text: s.label, cls: `s${s.index % 4}`, dots: s.style === "dots" }));
  return { kind: "svg", width: P.w, height: P.h, shapes, labels, legend };
}

// Map a grid coordinate (origin bottom left, y up) to drawing units
function gridMapper(grid) {
  const [gw, gh] = grid;
  return {
    width: GRID_PAD * 2 + gw * GRID_CELL,
    height: GRID_PAD * 2 + gh * GRID_CELL,
    at: ([x, y]) => [GRID_PAD + x * GRID_CELL, GRID_PAD + (gh - y) * GRID_CELL],
  };
}

function gridBackground(grid, map) {
  const shapes = [];
  for (let x = 0; x <= grid[0]; x++) for (let y = 0; y <= grid[1]; y++) {
    const [px, py] = map.at([x, y]);
    shapes.push({ t: "circle", cx: px, cy: py, r: 1.2, cls: "gridpt" });
  }
  return shapes;
}

function diagramModel(fig, scope) {
  const map = gridMapper(fig.grid);
  const pt = (p) => map.at([num(p[0], scope), num(p[1], scope)]);
  const shapes = gridBackground(fig.grid, map);
  const labels = [];
  const named = new Map();
  for (const p of fig.points ?? []) named.set(p.id, pt(p.at));
  for (const s of fig.segments ?? []) {
    const a = named.get(s.from), b = named.get(s.to);
    if (a && b) shapes.push({ t: "line", x1: a[0], y1: a[1], x2: b[0], y2: b[1], cls: s.style === "dashed" ? "ink dashed" : "ink" });
  }
  for (const a of fig.arrows ?? []) {
    const [x1, y1] = pt(a.from), [x2, y2] = pt(a.to);
    shapes.push({ t: "line", x1, y1, x2, y2, cls: "ink accent", arrow: true });
    if (a.label) labels.push({ x: (x1 + x2) / 2 + 10, y: (y1 + y2) / 2, text: substitute(a.label, scope), anchor: "start" });
  }
  const free = (fig.labels ?? []).map((l) => ({ at: pt(l.at), text: substitute(l.text, scope) }));
  for (const [id, [x, y]] of named) {
    shapes.push({ t: "circle", cx: x, cy: y, r: 3.5, cls: "ink fill" });
    // A point's name is drawn unless a free label with the same text already names it
    if (!free.some((l) => l.text === id)) labels.push({ x: x + 6, y: y - 8, text: id, anchor: "start" });
  }
  for (const l of free) labels.push({ x: l.at[0], y: l.at[1], text: l.text, anchor: "middle" });
  return { kind: "svg", width: map.width, height: map.height, shapes, labels };
}

// ---- circuit symbols, drawn in a local frame: s along the element, n across it ----

const BODY = 30; // half length of a symbol body

function zigzag() {
  const pts = [[-BODY + 6, 0]];
  for (let i = 0; i < 6; i++) pts.push([-BODY + 6 + (i + 0.5) * 8, i % 2 ? 7 : -7]);
  pts.push([BODY - 6, 0]);
  return [{ t: "poly", pts }];
}

function coil() {
  const pts = [];
  for (let k = 0; k < 4; k++) {
    for (let j = 0; j <= 10; j++) {
      const a = Math.PI - (j / 10) * Math.PI;
      pts.push([-BODY + 6 + k * 12 + 6 + 6 * Math.cos(a), -6 * Math.sin(a)]);
    }
  }
  return [{ t: "poly", pts: [[-BODY + 6, 0], ...pts, [BODY - 6, 0]] }];
}

const circle = (r = 15) => {
  const pts = [];
  for (let j = 0; j <= 36; j++) pts.push([r * Math.cos((j / 36) * 2 * Math.PI), r * Math.sin((j / 36) * 2 * Math.PI)]);
  return { t: "poly", pts };
};
const diamond = (r = 16) => ({ t: "poly", pts: [[-r, 0], [0, r], [r, 0], [0, -r], [-r, 0]] });
const arrowInside = () => [{ t: "poly", pts: [[-9, 0], [9, 0]] }, { t: "poly", pts: [[3, -5], [9, 0], [3, 5]] }];
const plusMinus = () => [{ t: "label", s: 8, n: -1, text: "+" }, { t: "label", s: -8, n: -1, text: "−" }];

/** Local drawing for each element kind and the half length its body occupies. */
function symbol(kind) {
  switch (kind) {
    case "resistor": return { half: BODY, parts: zigzag() };
    case "inductor": return { half: BODY, parts: coil() };
    case "capacitor": return { half: 4, parts: [{ t: "poly", pts: [[-4, -13], [-4, 13]] }, { t: "poly", pts: [[4, -13], [4, 13]] }] };
    case "vsource": return { half: 15, parts: [circle(), ...plusMinus()] };
    case "isource": return { half: 15, parts: [circle(), ...arrowInside()] };
    case "dep-vsource": return { half: 16, parts: [diamond(), ...plusMinus()] };
    case "dep-isource": return { half: 16, parts: [diamond(), ...arrowInside()] };
    case "lamp": return { half: 15, parts: [circle(), { t: "poly", pts: [[-10, -10], [10, 10]] }, { t: "poly", pts: [[-10, 10], [10, -10]] }] };
    case "ammeter": return { half: 15, parts: [circle(), { t: "label", s: 0, n: 0, text: "A" }] };
    case "voltmeter": return { half: 15, parts: [circle(), { t: "label", s: 0, n: 0, text: "V" }] };
    case "diode": return { half: 10, parts: [{ t: "poly", pts: [[-10, -10], [-10, 10], [10, 0], [-10, -10]], fill: true }, { t: "poly", pts: [[10, -10], [10, 10]] }] };
    case "switch": return { half: 18, parts: [{ t: "dot", s: -18 }, { t: "dot", s: 18 }, { t: "poly", pts: [[-18, 0], [14, -14]] }] };
    default: return { half: 0, parts: [] };
  }
}

function circuitModel(fig, scope) {
  const map = gridMapper(fig.grid);
  const pt = (p) => map.at([num(p[0], scope), num(p[1], scope)]);
  const shapes = [];
  const labels = [];
  const ends = new Map(); // terminal position -> how many elements meet there
  const touch = ([x, y]) => { const k = `${Math.round(x)},${Math.round(y)}`; ends.set(k, (ends.get(k) ?? 0) + 1); };
  const label = (text, x, y) => { if (text) labels.push({ x, y, text: substitute(text, scope), anchor: "middle" }); };

  for (const e of fig.elements) {
    if (e.kind === "opamp") {
      const plus = pt(e.pins.plus), minus = pt(e.pins.minus), out = pt(e.pins.out);
      const dir = Math.sign(out[0] - (plus[0] + minus[0]) / 2) || 1;
      const inX = (plus[0] + minus[0]) / 2 + dir * 14;
      const top = Math.min(plus[1], minus[1]) - 18, bottom = Math.max(plus[1], minus[1]) + 18;
      const tipX = out[0] - dir * 10;
      shapes.push({ t: "poly", pts: [[inX, top], [inX, bottom], [tipX, out[1]], [inX, top]], cls: "ink" });
      for (const p of [plus, minus]) shapes.push({ t: "line", x1: p[0], y1: p[1], x2: inX, y2: p[1], cls: "ink" });
      shapes.push({ t: "line", x1: tipX, y1: out[1], x2: out[0], y2: out[1], cls: "ink" });
      shapes.push({ t: "text", x: inX + dir * 9, y: plus[1] + 4, text: "+", anchor: "middle", cls: "sym" });
      shapes.push({ t: "text", x: inX + dir * 9, y: minus[1] + 4, text: "−", anchor: "middle", cls: "sym" });
      [plus, minus, out].forEach(touch);
      label(e.label, (inX + tipX) / 2, top - 10);
      continue;
    }
    const a = pt(e.from), b = pt(e.to);
    touch(a); touch(b);
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const len = Math.hypot(dx, dy) || 1;
    const u = [dx / len, dy / len];
    // Normal chosen to point up (or left for vertical elements) on screen, so +/− and labels sit consistently
    let n = [-u[1], u[0]];
    if (n[1] > 1e-9 || (Math.abs(n[1]) < 1e-9 && n[0] > 0)) n = [-n[0], -n[1]];
    const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const at = (s, t) => [mid[0] + u[0] * s + n[0] * t, mid[1] + u[1] * s + n[1] * t];

    if (e.kind === "wire") {
      shapes.push({ t: "line", x1: a[0], y1: a[1], x2: b[0], y2: b[1], cls: "ink" });
      label(e.label, ...at(0, 14));
      continue;
    }
    if (e.kind === "ground") {
      shapes.push({ t: "line", x1: a[0], y1: a[1], x2: b[0], y2: b[1], cls: "ink" });
      const g = (s, w) => { const p1 = [b[0] + u[0] * s + n[0] * w, b[1] + u[1] * s + n[1] * w], p2 = [b[0] + u[0] * s - n[0] * w, b[1] + u[1] * s - n[1] * w]; shapes.push({ t: "line", x1: p1[0], y1: p1[1], x2: p2[0], y2: p2[1], cls: "ink" }); };
      g(0, 12); g(5, 8); g(10, 4);
      continue;
    }
    const sym = symbol(e.kind);
    const half = Math.min(sym.half, len / 2);
    shapes.push({ t: "line", x1: a[0], y1: a[1], x2: at(-half, 0)[0], y2: at(-half, 0)[1], cls: "ink" });
    shapes.push({ t: "line", x1: at(half, 0)[0], y1: at(half, 0)[1], x2: b[0], y2: b[1], cls: "ink" });
    for (const p of sym.parts) {
      if (p.t === "poly") shapes.push({ t: "poly", pts: p.pts.map(([s, t]) => at(s, t)), cls: p.fill ? "ink fill" : "ink" });
      else if (p.t === "dot") { const [x, y] = at(p.s, 0); shapes.push({ t: "circle", cx: x, cy: y, r: 2.5, cls: "ink" }); }
      else if (p.t === "label") {
        // Terminal marks: s > 0 is the `to` side (the + terminal of a voltage source)
        const [x, y] = p.n === 0 ? at(0, 0) : at(p.s, 0);
        shapes.push({ t: "text", x, y: y + 4, text: p.text, anchor: "middle", cls: "sym" });
      }
    }
    label(e.label, ...at(0, Math.max(sym.half, 10) + 14));
  }
  for (const [k, count] of ends) {
    if (count < 3) continue;
    const [x, y] = k.split(",").map(Number);
    shapes.push({ t: "circle", cx: x, cy: y, r: 3, cls: "ink fill" });
  }
  return { kind: "svg", width: map.width, height: map.height, shapes, labels };
}

/** Layer of each flow node: longest path from a node without incoming edges; cycles are cut. */
export function flowLayers(nodes, edges) {
  const ids = nodes.map((n) => n.id);
  const out = new Map(ids.map((id) => [id, []]));
  for (const e of edges) if (out.has(e.from) && out.has(e.to)) out.get(e.from).push(e.to);
  // Drop back edges found by depth-first search so the rest is acyclic
  const state = new Map();
  const forward = new Map(ids.map((id) => [id, []]));
  const visit = (id) => {
    state.set(id, 1);
    for (const next of out.get(id)) {
      if (state.get(next) === 1) continue;
      forward.get(id).push(next);
      if (!state.has(next)) visit(next);
    }
    state.set(id, 2);
  };
  const incoming = new Set(edges.map((e) => e.to));
  for (const id of ids) if (!incoming.has(id) && !state.has(id)) visit(id);
  for (const id of ids) if (!state.has(id)) visit(id);
  const layer = new Map(ids.map((id) => [id, 0]));
  // Relax in topological order (at most n passes over an acyclic graph)
  for (let pass = 0; pass < ids.length; pass++) {
    let changed = false;
    for (const [from, tos] of forward) for (const to of tos) {
      if (layer.get(to) < layer.get(from) + 1) { layer.set(to, layer.get(from) + 1); changed = true; }
    }
    if (!changed) break;
  }
  return layer;
}

function flowModel(fig, scope) {
  const layer = flowLayers(fig.nodes, fig.edges);
  const lr = (fig.dir ?? "LR") === "LR";
  const slot = new Map();
  const perLayer = new Map();
  for (const n of fig.nodes) {
    const L = layer.get(n.id);
    const k = perLayer.get(L) ?? 0;
    perLayer.set(L, k + 1);
    slot.set(n.id, [L, k]);
  }
  const layers = Math.max(...layer.values()) + 1;
  const across = Math.max(...perLayer.values());
  const F = FLOW;
  const box = (id) => {
    const [L, k] = slot.get(id);
    const main = F.pad + L * ((lr ? F.w : F.h) + (lr ? F.gapX : F.gapY));
    // The cross axis keeps a margin of F.bend on both sides for bent edges
    const cross = F.pad + F.bend + k * ((lr ? F.h : F.w) + (lr ? F.gapY : F.gapX));
    return lr ? { x: main, y: cross } : { x: cross, y: main };
  };
  const width = lr ? F.pad * 2 + layers * F.w + (layers - 1) * F.gapX : (F.pad + F.bend) * 2 + across * F.w + (across - 1) * F.gapX;
  const height = lr ? (F.pad + F.bend) * 2 + across * F.h + (across - 1) * F.gapY : F.pad * 2 + layers * F.h + (layers - 1) * F.gapY;
  const shapes = [];
  const labels = [];
  const boxes = [];
  for (const n of fig.nodes) {
    const { x, y } = box(n.id);
    shapes.push({ t: "rect", x, y, w: F.w, h: F.h, cls: "node" });
    boxes.push({ x, y, w: F.w, h: F.h, text: substitute(n.text, scope) });
  }
  // Edge from the side of one box to the facing side of the other
  for (const e of fig.edges) {
    if (!slot.has(e.from) || !slot.has(e.to)) continue;
    const a = box(e.from), b = box(e.to);
    const [la, ka] = slot.get(e.from), [lb, kb] = slot.get(e.to);
    // Edges that skip a layer in the same row, or go backwards, would cross other boxes: bend them around
    if (ka === kb && Math.abs(lb - la) !== 1) {
      const side = lb > la ? -1 : 1; // forward skips bend above (or left), back edges below (or right)
      const p1 = lr ? [a.x + F.w / 2, side < 0 ? a.y : a.y + F.h] : [side < 0 ? a.x : a.x + F.w, a.y + F.h / 2];
      const p2 = lr ? [b.x + F.w / 2, side < 0 ? b.y : b.y + F.h] : [side < 0 ? b.x : b.x + F.w, b.y + F.h / 2];
      const c = lr ? [(p1[0] + p2[0]) / 2, p1[1] + side * F.bend * 1.6] : [p1[0] + side * F.bend * 1.6, (p1[1] + p2[1]) / 2];
      shapes.push({ t: "path", d: `M${p1[0]},${p1[1]} Q${c[0]},${c[1]} ${p2[0]},${p2[1]}`, cls: "ink", arrow: true });
      if (e.label) labels.push({ x: (p1[0] + 2 * c[0] + p2[0]) / 4, y: (p1[1] + 2 * c[1] + p2[1]) / 4, text: substitute(e.label, scope), anchor: "middle", cls: "edge" });
      continue;
    }
    const ca = [a.x + F.w / 2, a.y + F.h / 2], cb = [b.x + F.w / 2, b.y + F.h / 2];
    const dx = cb[0] - ca[0], dy = cb[1] - ca[1];
    // Clip the centre-to-centre line at each box border
    const clip = (c, sx, sy) => {
      const t = Math.min(Math.abs(dx) > 1e-9 ? (F.w / 2) / Math.abs(dx) : Infinity, Math.abs(dy) > 1e-9 ? (F.h / 2) / Math.abs(dy) : Infinity);
      return [c[0] + sx * dx * t, c[1] + sy * dy * t];
    };
    const p1 = clip(ca, 1, 1), p2 = clip(cb, -1, -1);
    shapes.push({ t: "line", x1: p1[0], y1: p1[1], x2: p2[0], y2: p2[1], cls: "ink", arrow: true });
    if (e.label) labels.push({ x: (p1[0] + p2[0]) / 2, y: (p1[1] + p2[1]) / 2 - 6, text: substitute(e.label, scope), anchor: "middle", cls: "edge" });
  }
  return { kind: "svg", width, height, shapes, labels, boxes };
}

function tableModel(fig, scope) {
  const cell = (c) => {
    if (typeof c === "number") return formatNumber(c);
    if (c && typeof c === "object") return formatNumber(Number(num(c.expr, scope).toPrecision(6)));
    return substitute(c, scope);
  };
  return { kind: "table", cols: fig.cols.map((c) => substitute(c, scope)), rows: fig.rows.map((r) => r.map(cell)) };
}

/**
 * Build the drawing model of a figure.
 * @param {object} fig  figure data (framework 8.4)
 * @param {object} [scope]  the question's variables (framework 8.3)
 * @returns {object}  { kind: "svg" | "table" | "molecule" | "ref", ... }
 * @throws when the data cannot be drawn; callers fall back to a text summary
 */
export function figureModel(fig, scope = {}) {
  switch (fig?.type) {
    case "plot": return plotModel(fig, scope);
    case "diagram": return diagramModel(fig, scope);
    case "circuit": return circuitModel(fig, scope);
    case "flow": return flowModel(fig, scope);
    case "table": return tableModel(fig, scope);
    case "molecule": return { kind: "molecule", smiles: fig.smiles, label: fig.label ? substitute(fig.label, scope) : "" };
    case "ref": return { kind: "ref", desc: substitute(fig.desc, scope), page: fig.page, figure: fig.figure };
    default: throw new Error(`unknown figure type ${fig?.type}`);
  }
}
