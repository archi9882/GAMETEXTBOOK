// Draw figure data in the browser (framework 8.4): SVG for shapes, HTML overlays for text so KaTeX can typeset it.
// Shapes come from figure-model.js; anything that cannot be drawn falls back to a readable text summary.
import { figureModel } from "./figure-model.js";

const SVG = "http://www.w3.org/2000/svg";
const NAMES = { plot: "函數圖", diagram: "示意圖", circuit: "電路圖", molecule: "分子結構", flow: "流程圖", table: "表格", ref: "原書圖" };
const SMILES_SRC = new URL("./vendor/smiles-drawer/smiles-drawer.min.js", import.meta.url).href;

const STYLE = `
.fig-box { margin: 10px 0; }
.fig-canvas { position: relative; width: 100%; }
.fig-canvas svg { display: block; width: 100%; height: auto; overflow: visible; color: var(--fg, #222); }
.fig-canvas .lbl { position: absolute; transform: translate(-50%, -50%); font-size: 13px; line-height: 1.2; white-space: nowrap; pointer-events: none; }
.fig-canvas .lbl.start { transform: translate(0, -50%); }
.fig-canvas .lbl.edge { background: var(--card, #fff); padding: 0 3px; border-radius: 3px; font-size: 12px; }
.fig-canvas .lbl.ytitle { transform: none; }
.fig-canvas .nodebox { position: absolute; display: flex; align-items: center; justify-content: center; text-align: center; font-size: 13px; line-height: 1.25; padding: 2px 6px; overflow: hidden; }
.fig-svg .grid { stroke: currentColor; stroke-opacity: 0.12; stroke-width: 1; }
.fig-svg .gridpt { fill: currentColor; fill-opacity: 0.25; }
.fig-svg .axis { stroke: currentColor; stroke-width: 1.2; }
.fig-svg .tick { fill: currentColor; fill-opacity: 0.75; font: 11px system-ui, sans-serif; }
.fig-svg .sym { fill: currentColor; font: bold 12px system-ui, sans-serif; }
.fig-svg .ink { stroke: currentColor; stroke-width: 1.8; fill: none; stroke-linejoin: round; stroke-linecap: round; }
.fig-svg .ink.fill, .fig-svg circle.ink { fill: currentColor; }
.fig-svg .dashed { stroke-dasharray: 6 5; }
.fig-svg .accent { stroke: var(--fig-1, #2f5fb8); }
.fig-svg .node { fill: var(--card, #fff); stroke: currentColor; stroke-width: 1.4; }
.fig-svg .s0, .fig-legend .s0 { --c: var(--fig-1, #2f5fb8); }
.fig-svg .s1, .fig-legend .s1 { --c: var(--fig-2, #c2410c); }
.fig-svg .s2, .fig-legend .s2 { --c: var(--fig-3, #15803d); }
.fig-svg .s3, .fig-legend .s3 { --c: var(--fig-4, #7e22ce); }
.fig-svg polyline.s0, .fig-svg polyline.s1, .fig-svg polyline.s2, .fig-svg polyline.s3 { stroke: var(--c); stroke-width: 2.2; fill: none; }
.fig-svg circle.fill { fill: var(--c, currentColor); }
.fig-legend { display: flex; flex-wrap: wrap; gap: 4px 14px; font-size: 13px; margin-top: 4px; }
.fig-legend .sw { display: inline-block; width: 16px; height: 3px; background: var(--c); vertical-align: middle; margin-right: 5px; }
.fig-legend .sw.dot { width: 8px; height: 8px; border-radius: 50%; }
.fig-table { border-collapse: collapse; font-size: 14px; margin: 4px 0; }
.fig-table th, .fig-table td { border: 1px solid var(--line, #ccc); padding: 3px 10px; text-align: center; }
.fig-table th { background: color-mix(in srgb, var(--fg, #000) 6%, transparent); }
.fig-scroll { overflow-x: auto; }
.fig-ref { border-left: 3px solid var(--line, #ccc); padding: 4px 10px; }
.fig-mol svg { max-width: 320px; width: 100%; height: auto; }
.fig-caption { font-size: 12px; opacity: 0.75; margin: 2px 0 0; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) .fig-svg { --fig-1: #7aa2f0; --fig-2: #fb923c; --fig-3: #4ade80; --fig-4: #c084fc; } }
`;

function ensureStyle() {
  if (document.getElementById("fig-style")) return;
  const el = document.createElement("style");
  el.id = "fig-style";
  el.textContent = STYLE;
  document.head.append(el);
}

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function svgEl(tag, attrs) {
  const e = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== undefined) e.setAttribute(k, String(v));
  return e;
}

const r2 = (v) => Math.round(v * 100) / 100;

function drawSvg(model) {
  const wrap = el("div", "fig-canvas");
  const svg = svgEl("svg", { viewBox: `0 0 ${model.width} ${model.height}`, class: "fig-svg", role: "img" });
  const id = `fa${Math.random().toString(36).slice(2, 8)}`;
  const defs = svgEl("defs", {});
  const marker = svgEl("marker", { id, viewBox: "0 0 10 10", refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: "auto-start-reverse" });
  marker.append(svgEl("path", { d: "M0,0 L10,5 L0,10 z", fill: "context-stroke" }));
  defs.append(marker);
  svg.append(defs);
  for (const s of model.shapes) {
    let node;
    if (s.t === "line") node = svgEl("line", { x1: r2(s.x1), y1: r2(s.y1), x2: r2(s.x2), y2: r2(s.y2), class: s.cls, "marker-end": s.arrow ? `url(#${id})` : undefined });
    else if (s.t === "poly") node = svgEl("polyline", { points: s.pts.map(([x, y]) => `${r2(x)},${r2(y)}`).join(" "), class: s.cls });
    else if (s.t === "circle") node = svgEl("circle", { cx: r2(s.cx), cy: r2(s.cy), r: s.r, class: s.cls });
    else if (s.t === "path") node = svgEl("path", { d: s.d, class: s.cls, "marker-end": s.arrow ? `url(#${id})` : undefined });
    else if (s.t === "rect") node = svgEl("rect", { x: r2(s.x), y: r2(s.y), width: s.w, height: s.h, rx: 8, class: s.cls });
    else if (s.t === "text") { node = svgEl("text", { x: r2(s.x), y: r2(s.y), "text-anchor": s.anchor, class: s.cls }); node.textContent = s.text; }
    if (node) svg.append(node);
  }
  wrap.append(svg);
  const pct = (v, total) => `${(v / total) * 100}%`;
  for (const l of model.labels ?? []) {
    const span = el("span", `lbl ${l.anchor === "start" ? "start" : ""} ${l.cls ?? ""}`, l.text);
    span.style.left = pct(l.x, model.width);
    span.style.top = pct(l.y, model.height);
    wrap.append(span);
  }
  for (const b of model.boxes ?? []) {
    const div = el("div", "nodebox", b.text);
    Object.assign(div.style, { left: pct(b.x, model.width), top: pct(b.y, model.height), width: pct(b.w, model.width), height: pct(b.h, model.height) });
    wrap.append(div);
  }
  return wrap;
}

function drawLegend(legend) {
  const box = el("div", "fig-legend");
  for (const item of legend) {
    const row = el("span", item.cls);
    row.append(el("span", `sw ${item.dots ? "dot" : ""}`), item.text);
    box.append(row);
  }
  return box;
}

function drawTable(model) {
  const scroll = el("div", "fig-scroll");
  const table = el("table", "fig-table");
  const head = el("tr");
  for (const c of model.cols) head.append(el("th", "", c));
  table.append(head);
  for (const row of model.rows) {
    const tr = el("tr");
    for (const c of row) tr.append(el("td", "", c));
    table.append(tr);
  }
  scroll.append(table);
  return scroll;
}

/** Text shown when a figure cannot be drawn (and the only rendering of ref figures). */
export function figureSummary(fig) {
  if (fig?.type === "ref") return `原書圖（第 ${fig.page ?? "?"} 頁${fig.figure ? "，" + fig.figure : ""}）：${fig.desc}`;
  if (fig?.type === "molecule") return `分子結構：${fig.label ? fig.label + "，" : ""}SMILES ${fig.smiles}`;
  return `${NAMES[fig?.type] ?? fig?.type ?? "圖"}（無法繪製）`;
}

// SmilesDrawer is loaded on first use; resolves to the global or null when it fails
let smilesLoad;
function loadSmiles() {
  smilesLoad ??= new Promise((resolve) => {
    if (window.SmilesDrawer) return resolve(window.SmilesDrawer);
    const s = document.createElement("script");
    s.src = SMILES_SRC;
    s.onload = () => resolve(window.SmilesDrawer ?? null);
    s.onerror = () => resolve(null);
    document.head.append(s);
  });
  return smilesLoad;
}

function drawMolecule(model, fig) {
  const box = el("div", "fig-mol");
  const fallback = el("p", "fig-caption", figureSummary(fig));
  box.append(fallback);
  loadSmiles().then((SD) => {
    if (!SD) return;
    try {
      const svg = svgEl("svg", { width: 320, height: 220 });
      const dark = matchMedia?.("(prefers-color-scheme: dark)").matches && document.documentElement.dataset.theme !== "light";
      const drawer = new SD.SvgDrawer({ width: 320, height: 220 });
      SD.parse(model.smiles, (tree) => {
        drawer.draw(tree, svg, dark ? "dark" : "light");
        box.replaceChildren(svg, model.label ? el("p", "fig-caption", model.label) : "");
      }, () => { /* keep the text fallback */ });
    } catch (e) {
      console.warn("molecule failed", e);
    }
  });
  return box;
}

/**
 * Render a figure into a new element. Never throws: bad data becomes a text summary.
 * Callers run KaTeX auto-render over the result afterwards, as with any other text.
 * @param {object} fig  figure data (framework 8.4)
 * @param {object} [scope]  the question's variables
 */
export function renderFigure(fig, scope = {}) {
  ensureStyle();
  const box = el("figure", "fig-box");
  try {
    const model = figureModel(fig, scope);
    if (model.kind === "svg") {
      box.append(drawSvg(model));
      if (model.legend?.length) box.append(drawLegend(model.legend));
    } else if (model.kind === "table") box.append(drawTable(model));
    else if (model.kind === "molecule") box.append(drawMolecule(model, fig));
    else box.append(el("p", "fig-ref", figureSummary({ ...fig, desc: model.desc })));
  } catch (e) {
    console.warn("figure failed", e);
    box.append(el("p", "fig-ref", figureSummary(fig)));
  }
  return box;
}
