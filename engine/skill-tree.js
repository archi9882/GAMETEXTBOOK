// Skill tree screen (engine C1 design, 2026-10-14, section 2): a full-screen SVG over the map.
// Layout comes from skill-tree-model.js; states and levels from progress.js through the deps passed in.
// All text goes in as text nodes; colours come from engine/theme.css.
import { buildSkillTree, arcTo } from "./skill-tree-model.js";

const NS = "http://www.w3.org/2000/svg";
const KTYPE = { fact: "事實", concept: "概念", procedure: "程序", principle: "原理", judgment: "判斷" };
const TIER = { 1: "初階", 2: "中階", 3: "高階" };
const STATE = { lit: "已點亮", due: "待複習", ready: "可以學", locked: "未解鎖" };
const LABEL_MIN_ZOOM = 0.85;   // below this, names are hidden on large trees

const STYLE = `
.st-root { position: fixed; inset: 0; z-index: 30; background: var(--night); color: var(--paper); display: flex; flex-direction: column; }
.st-root[hidden] { display: none; }
.st-bar { display: flex; align-items: center; gap: 10px; padding: 10px max(14px, env(safe-area-inset-right, 0px)) 10px max(14px, env(safe-area-inset-left, 0px)); padding-top: calc(10px + env(safe-area-inset-top, 0px)); border-bottom: 1px solid var(--line-dark); }
.st-title { margin-right: auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; letter-spacing: .14em; color: var(--mist); }
.st-title b { color: var(--lamp); font-weight: 600; letter-spacing: .06em; }
.st-bar button, .st-zoom button { flex: none; white-space: nowrap; font: inherit; color: var(--paper); background: var(--dusk); border: 1px solid var(--wire); border-radius: 999px; padding: 6px 14px; cursor: pointer; }
.st-stage { position: relative; flex: 1; min-height: 0; }
.st-svg { position: absolute; inset: 0; width: 100%; height: 100%; touch-action: none; cursor: grab; user-select: none; }
.st-zoom { position: absolute; right: max(12px, env(safe-area-inset-right, 0px)); bottom: calc(12px + env(safe-area-inset-bottom, 0px)); display: flex; flex-direction: column; gap: 6px; }
.st-zoom button { width: 40px; height: 40px; padding: 0; font-size: 18px; }
.st-root button:focus-visible, .st-node:focus-visible { outline: 2px solid var(--lamp); outline-offset: 2px; }
.st-legend { position: absolute; left: max(12px, env(safe-area-inset-left, 0px)); bottom: calc(12px + env(safe-area-inset-bottom, 0px)); display: flex; flex-wrap: wrap; gap: 4px 12px; font-size: 12px; color: var(--mist); max-width: calc(100% - 80px); pointer-events: none; }
.st-legend span { display: inline-flex; align-items: center; gap: 5px; }
.st-legend svg { width: 22px; height: 22px; }
.st-card { position: absolute; z-index: 2; top: 14px; left: max(14px, env(safe-area-inset-left, 0px)); width: min(320px, calc(100% - 28px)); background: color-mix(in srgb, var(--dusk) 94%, transparent); border: 1px solid var(--wire); border-radius: 10px; padding: 14px 16px; }
.st-card[hidden] { display: none; }
.st-card h2 { margin: 2px 0; font-size: 18px; }
.st-eyebrow { font-size: 11px; letter-spacing: .16em; color: var(--lamp); }
.st-meta { color: var(--mist); font-size: 13px; margin: 6px 0 8px; }
.st-chips { display: flex; gap: 6px; flex-wrap: wrap; }
.st-chip { border: 1px solid var(--wire); border-radius: 999px; padding: 1px 9px; font-size: 12px; }
.st-chip.lit { border-color: var(--lamp); color: var(--lamp-hi); }
.st-card ul { margin: 8px 0 0; padding-left: 18px; color: var(--mist); font-size: 13px; }
.st-actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 12px; }
.st-actions button { font: inherit; border-radius: 6px; padding: 7px 12px; cursor: pointer; border: 1px solid var(--wire); background: transparent; color: var(--paper); }
.st-actions .go { background: var(--lamp); color: var(--on-lamp); border-color: var(--lamp); font-weight: 700; }
.st-close { position: absolute; top: 8px; right: 10px; background: none; border: 0; color: var(--mist); font-size: 18px; cursor: pointer; }
@media (max-width: 640px) {
  .st-card { top: auto; bottom: 0; left: 0; width: 100%; border-radius: 14px 14px 0 0; padding-bottom: calc(14px + env(safe-area-inset-bottom, 0px)); }
  .st-card:not([hidden]) ~ .st-legend, .st-card:not([hidden]) ~ .st-zoom { display: none; }
}
.st-ring { fill: none; stroke: var(--line-dark); stroke-width: 1; stroke-dasharray: 2 6; }
.st-edge { fill: none; stroke: var(--wire); stroke-width: 2.2; stroke-linecap: round; stroke-linejoin: round; }
.st-edge.lit { stroke: var(--lamp); }
.st-edge.hl { stroke: var(--lamp-hi); stroke-width: 3; }
.st-cross { fill: none; stroke: var(--lamp-hi); stroke-width: 1.6; stroke-dasharray: 5 5; opacity: .85; }
.st-joint { fill: var(--wire); }
.st-joint.lit { fill: var(--lamp); }
.st-node { cursor: pointer; }
.st-node .disc { stroke-width: 2; }
.st-node.locked .disc { fill: var(--node-dark); stroke: var(--wire); }
.st-node.ready .disc { fill: var(--dusk); stroke: var(--lamp); }
.st-node.lit .disc, .st-node.due .disc { fill: var(--lamp); stroke: var(--lamp-hi); }
.st-node .ico { fill: none; stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round; }
.st-node.locked .ico { stroke: var(--wire-hi); }
.st-node.ready .ico { stroke: var(--lamp); }
.st-node.lit .ico, .st-node.due .ico { stroke: var(--on-lamp); }
.st-node .lv { fill: none; stroke-width: 3; }
.st-node .lv.on { stroke: var(--lamp); }
.st-node .lv.off { stroke: var(--line-dark); }
.st-node .dueRing { fill: none; stroke: var(--due); stroke-width: 2; stroke-dasharray: 4 4; transform-box: fill-box; transform-origin: center; animation: st-spin 9s linear infinite; }
.st-node .label { font-size: 12px; fill: var(--mist); text-anchor: middle; paint-order: stroke; stroke: var(--night); stroke-width: 4px; stroke-linejoin: round; }
.st-node.lit .label, .st-node.due .label { fill: var(--lamp-hi); }
.st-node.sel .disc { stroke: #fff; stroke-width: 3; }
.st-nolabels .st-node .label { display: none; }
.st-badge { font-size: 11px; font-weight: 700; text-anchor: middle; dominant-baseline: central; }
.st-sector { font-size: 15px; letter-spacing: .2em; fill: var(--mist); text-anchor: middle; }
.st-sub { font-size: 12px; fill: var(--wire-hi); text-anchor: middle; }
@keyframes st-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .st-node .dueRing { animation: none; } }
`;

const el = (tag, attrs = {}, parent) => {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== undefined && v !== null) e.setAttribute(k, String(v));
  if (parent) parent.append(e);
  return e;
};
const html = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
const pt = (r, t) => [r * Math.cos(t), -r * Math.sin(t)];

/** Line icon for a knowledge type, drawn in a 14-unit box around the origin. */
export function typeIcon(g, k) {
  const p = { class: "ico" };
  if (k === "fact") { el("rect", { ...p, x: -5, y: -6, width: 10, height: 12, rx: 1.5 }, g); el("path", { ...p, d: "M-2.5 -2 H2.5 M-2.5 1.5 H2.5" }, g); }
  else if (k === "procedure") el("path", { ...p, d: "M-7 6 H-3 V1 H1 V-4 H6" }, g);
  else if (k === "principle") { el("path", { ...p, d: "M0 -7 L7 6 H-7 Z" }, g); el("circle", { ...p, cx: 0, cy: 2.5, r: 1.2 }, g); }
  else if (k === "judgment") el("path", { ...p, d: "M0 7 V-1 M0 -1 L-6 -6 M0 -1 L6 -6" }, g);
  else el("path", { ...p, d: "M0 -7 L7 0 L0 7 L-7 0 Z" }, g);
}

/** One node: disc, type icon, level ring and state badge; shapes differ by state, not only colour. */
export function nodeGlyph(g, n, { label = true } = {}) {
  const shining = n.state === "lit" || n.state === "due";
  if (shining) {
    el("circle", { r: 24, fill: "var(--lamp)", opacity: 0.22 }, g);
    const seg = (Math.PI * 2) / n.max;
    for (let i = 0; i < n.max; i++) {
      const t0 = Math.PI / 2 - i * seg - 0.08, t1 = Math.PI / 2 - (i + 1) * seg + 0.08;
      const [x0, y0] = pt(23, t0);
      el("path", { class: `lv ${i < n.level ? "on" : "off"}`, d: `M ${x0.toFixed(1)} ${y0.toFixed(1)} ${arcTo(23, t0, t1)}` }, g);
    }
  }
  if (n.state === "due") el("circle", { class: "dueRing", r: 28 }, g);
  el("circle", { class: "disc", r: 17 }, g);
  typeIcon(g, n.k);
  if (n.state === "ready") { el("circle", { cx: 13, cy: -13, r: 7, fill: "var(--lamp)" }, g); const t = el("text", { class: "st-badge", x: 13, y: -12.5, fill: "var(--on-lamp)" }, g); t.textContent = "!"; }
  if (n.state === "locked") { el("rect", { x: 8, y: -17, width: 9, height: 7, rx: 1.5, fill: "var(--wire)" }, g); el("path", { d: "M9.8 -17 v-2.5 a2.7 2.7 0 0 1 5.4 0 v2.5", fill: "none", stroke: "var(--wire)", "stroke-width": 1.6 }, g); }
  if (n.state === "due") { el("circle", { cx: 13, cy: -13, r: 7, fill: "var(--due)" }, g); el("path", { d: "M13 -16.5 V-13 L15.5 -11.5", fill: "none", stroke: "var(--on-lamp)", "stroke-width": 1.6, "stroke-linecap": "round" }, g); }
  if (label && n.name) { const t = el("text", { class: "label", y: 40 }, g); t.textContent = n.name; }
}

function ensureStyle() {
  if (document.getElementById("st-style")) return;
  const s = document.createElement("style");
  s.id = "st-style";
  s.textContent = STYLE;
  document.head.append(s);
}

/**
 * @param {{ state(skill): "lit"|"due"|"ready"|"locked", level(skill): number, onOpenSkill(id): void, onGoTo(id): void, onClose?(): void }} deps
 */
export function createSkillTree(deps) {
  ensureStyle();
  const root = html("div", "st-root"); root.hidden = true;
  root.setAttribute("role", "dialog"); root.setAttribute("aria-label", "技能樹");
  const bar = html("div", "st-bar");
  const title = html("div", "st-title");
  const closeBtn = html("button", "", "回到地圖");
  bar.append(title, closeBtn);
  const stage = html("div", "st-stage");
  const svg = el("svg", { class: "st-svg", "aria-label": "技能樹" });
  const world = el("g", {}, svg);
  const card = html("div", "st-card"); card.hidden = true;
  const legend = html("div", "st-legend");
  const zoom = html("div", "st-zoom");
  const zIn = html("button", "", "+"), zOut = html("button", "", "−"), zFit = html("button", "", "⤢");
  zIn.setAttribute("aria-label", "放大"); zOut.setAttribute("aria-label", "縮小"); zFit.setAttribute("aria-label", "全部顯示");
  zoom.append(zIn, zOut, zFit);
  stage.append(svg, card, legend, zoom);
  root.append(bar, stage);
  document.body.append(root);

  const view = { x: 0, y: 0, k: 1 };
  let layout = null, current = null, selected = null, bounds = null, big = false, moved = false;

  const applyView = () => {
    world.setAttribute("transform", `translate(${view.x},${view.y}) scale(${view.k})`);
    svg.classList.toggle("st-nolabels", big && view.k < LABEL_MIN_ZOOM);
  };
  function fit() {
    const r = svg.getBoundingClientRect();
    if (!bounds || !r.width) return;
    const w = bounds.maxX - bounds.minX, h = bounds.maxY - bounds.minY;
    const below = legend.offsetHeight + 16;   // keep the root clear of the legend
    view.k = Math.min((r.width - 32) / w, (r.height - 32 - below) / h);
    view.x = r.width / 2 - ((bounds.minX + bounds.maxX) / 2) * view.k;
    view.y = (r.height - below) / 2 - ((bounds.minY + bounds.maxY) / 2) * view.k;
    applyView();
  }
  function zoomAt(f, cx, cy) {
    const k = Math.min(4, Math.max(0.1, view.k * f));
    f = k / view.k;
    view.x = cx - (cx - view.x) * f; view.y = cy - (cy - view.y) * f; view.k = k;
    applyView();
  }
  const centre = () => { const r = svg.getBoundingClientRect(); return [r.width / 2, r.height / 2]; };
  zIn.onclick = () => zoomAt(1.3, ...centre());
  zOut.onclick = () => zoomAt(1 / 1.3, ...centre());
  zFit.onclick = fit;

  // Drag to pan, wheel or two fingers to zoom
  const pointers = new Map();
  let pinch = null;
  svg.addEventListener("pointerdown", (e) => {
    pointers.set(e.pointerId, [e.clientX, e.clientY]); moved = false;
    if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinch = Math.hypot(a[0] - b[0], a[1] - b[1]); }
  });
  svg.addEventListener("pointermove", (e) => {
    if (!pointers.has(e.pointerId)) return;
    const prev = pointers.get(e.pointerId);
    pointers.set(e.pointerId, [e.clientX, e.clientY]);
    if (pointers.size === 2 && pinch) {
      const [a, b] = [...pointers.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]), r = svg.getBoundingClientRect();
      zoomAt(d / pinch, (a[0] + b[0]) / 2 - r.left, (a[1] + b[1]) / 2 - r.top); pinch = d; moved = true; return;
    }
    const dx = e.clientX - prev[0], dy = e.clientY - prev[1];
    if (Math.abs(dx) + Math.abs(dy) > 2) moved = true;
    if (moved) { view.x += dx; view.y += dy; applyView(); }
  });
  const release = (e) => { pointers.delete(e.pointerId); if (pointers.size < 2) pinch = null; };
  svg.addEventListener("pointerup", release);
  svg.addEventListener("pointercancel", release);
  svg.addEventListener("wheel", (e) => { e.preventDefault(); const r = svg.getBoundingClientRect(); zoomAt(Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top); }, { passive: false });
  svg.addEventListener("click", () => { if (!moved && selected) { selected = null; card.hidden = true; draw(); } });

  function close() { root.hidden = true; selected = null; card.hidden = true; deps.onClose?.(); }
  closeBtn.onclick = close;
  // Keys stay inside the tree so the hero does not walk behind it
  root.tabIndex = -1;
  root.addEventListener("pointerdown", () => { if (!root.contains(document.activeElement)) root.focus({ preventScroll: true }); });
  root.addEventListener("keydown", (e) => { e.stopPropagation(); if (e.key === "Escape") { e.preventDefault(); if (selected) { selected = null; card.hidden = true; draw(); } else close(); } });

  const skillOf = (id) => current.skills.find((s) => s.id === id);

  function draw() {
    world.replaceChildren();
    if (!layout) return;
    const byNode = new Map(layout.nodes.map((n) => [n.id, n]));
    const view = layout.nodes.map((n) => {
      const s = skillOf(n.id);
      return { ...n, name: s.name, k: s.ktype?.[0] ?? "concept", max: Math.max(1, s.maxLevel ?? 1), level: deps.level(s), state: deps.state(s) };
    });
    const info = new Map(view.map((n) => [n.id, n]));
    const shining = (id) => ["lit", "due"].includes(info.get(id)?.state);
    const litShare = view.filter((n) => shining(n.id)).length / Math.max(1, view.length);
    // Ambient warmth rises with progress
    const defs = el("defs", {}, world);
    const glow = el("radialGradient", { id: "st-glow", cx: 0, cy: 0, r: layout.maxR * 1.2, gradientUnits: "userSpaceOnUse" }, defs);
    el("stop", { offset: 0, "stop-color": "var(--lamp)", "stop-opacity": (0.08 + litShare * 0.3).toFixed(3) }, glow);
    el("stop", { offset: 1, "stop-color": "var(--lamp)", "stop-opacity": 0 }, glow);
    el("circle", { r: layout.maxR * 1.2, fill: "url(#st-glow)" }, world);
    const span = [layout.sectors[0].a0 + 0.03, layout.sectors.at(-1).a1 - 0.03];
    for (const r of layout.rings) { const [x0, y0] = pt(r, span[0]); el("path", { class: "st-ring", d: `M ${x0.toFixed(1)} ${y0.toFixed(1)} ${arcTo(r, span[0], span[1])}` }, world); }
    const edges = el("g", {}, world), joints = el("g", {}, world), nodes = el("g", {}, world), labels = el("g", {}, world);
    // Trunk
    const anyFirst = layout.trunk.spokes.some((s) => shining(s.to));
    el("path", { class: `st-edge ${anyFirst ? "lit" : ""}`, d: layout.trunk.d }, edges);
    if (layout.trunk.hub) el("path", { class: `st-edge ${anyFirst ? "lit" : ""}`, d: layout.trunk.hub }, edges);
    for (const s of layout.trunk.spokes) {
      el("path", { class: `st-edge ${shining(s.to) ? "lit" : ""}`, d: s.d }, edges);
      el("circle", { class: `st-joint ${shining(s.to) ? "lit" : ""}`, cx: s.joint[0].toFixed(1), cy: s.joint[1].toFixed(1), r: 3.2 }, joints);
    }
    el("circle", { class: `st-joint ${anyFirst ? "lit" : ""}`, cx: layout.trunk.joint[0].toFixed(1), cy: layout.trunk.joint[1].toFixed(1), r: 4 }, joints);
    for (const e of layout.edges) {
      const lit = shining(e.from) && shining(e.to);
      const hl = selected && (e.from === selected || e.to === selected);
      el("path", { class: `st-edge ${lit ? "lit" : ""} ${hl ? "hl" : ""}`, d: e.d }, edges);
      for (const [x, y] of e.joints) el("circle", { class: `st-joint ${lit ? "lit" : ""}`, cx: x.toFixed(1), cy: y.toFixed(1), r: 3 }, joints);
    }
    if (selected) for (const c of layout.cross.filter((c) => c.from === selected || c.to === selected)) {
      const a = byNode.get(c.from), b = byNode.get(c.to);
      el("path", { class: "st-cross", d: `M ${a.x.toFixed(1)} ${a.y.toFixed(1)} Q 0 0 ${b.x.toFixed(1)} ${b.y.toFixed(1)}` }, edges);
    }
    // Sector labels outside the rim
    const rim = layout.maxR + 70;
    for (const s of layout.sectors) {
      const mid = (s.a0 + s.a1) / 2;
      const [x, y] = pt(rim + 20, mid);
      const t = el("text", { class: "st-sector", x: x.toFixed(1), y: y.toFixed(1) }, labels);
      t.textContent = TIER[s.tier] ?? `第 ${s.tier} 階`;
      const sub = el("text", { class: "st-sub", x: x.toFixed(1), y: (y + 18).toFixed(1) }, labels);
      sub.textContent = s.chapters.length > 1 ? `${s.chapters[0].name}–${s.chapters.at(-1).name}` : s.chapters[0].name;
    }
    // Root shows the share of lamps lit
    const rg = el("g", {}, nodes);
    el("circle", { r: 26, fill: "var(--lamp)", opacity: (0.18 + litShare * 0.4).toFixed(3) }, rg);
    el("circle", { r: 16, fill: "var(--dusk)", stroke: "var(--lamp)", "stroke-width": 2 }, rg);
    const rt = el("text", { class: "st-badge", fill: "var(--lamp)" }, rg); rt.textContent = `${Math.round(litShare * 100)}%`;
    for (const n of view) {
      const g = el("g", { class: `st-node ${n.state} ${selected === n.id ? "sel" : ""}`, transform: `translate(${n.x.toFixed(1)},${n.y.toFixed(1)})`, tabindex: 0, role: "button", "aria-label": `${n.name}，${STATE[n.state]}，Lv${n.level}／${n.max}` }, nodes);
      nodeGlyph(g, n);
      const pick = (e) => { e.stopPropagation(); if (!moved) select(n.id); };
      g.addEventListener("click", pick);
      g.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); select(n.id); } });
    }
    title.replaceChildren(html("b", "", "技能樹"), `　${current.title ?? ""}・已點亮 ${view.filter((n) => shining(n.id)).length} / ${view.length}`);
  }

  function select(id) {
    selected = id;
    const s = skillOf(id), n = layout.nodes.find((x) => x.id === id);
    const state = deps.state(s), level = deps.level(s);
    const chapter = (current.clusters ?? []).find((c) => c.id === n.cluster);
    const pres = (s.pre ?? []).map((q) => current.skills.find((x) => x.id === q)).filter(Boolean);
    const close = html("button", "st-close", "✕"); close.setAttribute("aria-label", "關閉說明");
    close.onclick = () => { selected = null; card.hidden = true; draw(); };
    const chips = html("div", "st-chips");
    chips.append(html("span", `st-chip ${state === "lit" || state === "due" ? "lit" : ""}`, STATE[state]), html("span", "st-chip", `Lv${level} / ${s.maxLevel ?? 1}`));
    const ul = html("ul");
    if (pres.length) pres.forEach((p) => ul.append(html("li", "", `先修：${p.name}${p.cluster !== s.cluster ? "（其他章）" : ""}`)));
    else ul.append(html("li", "", "先修：無"));
    const actions = html("div", "st-actions");
    const open = html("button", "", "開啟技能頁");
    open.onclick = () => { const keep = id; close.onclick(); root.hidden = true; deps.onOpenSkill(keep); };
    const go = html("button", "go", "帶我去");
    go.onclick = () => { const keep = id; selected = null; card.hidden = true; root.hidden = true; deps.onGoTo(keep); };
    actions.append(open, go);
    card.replaceChildren(close, html("div", "st-eyebrow", `${TIER[n.tier] ?? ""}・${chapter?.name ?? ""}`), html("h2", "", s.name), html("div", "st-meta", `知識類型：${KTYPE[s.ktype?.[0]] ?? "—"}`), chips, ul, actions);
    card.hidden = false;
    draw();
  }

  function drawLegend() {
    legend.replaceChildren();
    for (const st of ["lit", "ready", "locked"]) {
      const span = html("span");
      const s = el("svg", { viewBox: "-30 -30 60 60" }); const g = el("g", { class: `st-node ${st}` }, s);
      nodeGlyph(g, { state: st, k: "concept", level: 2, max: 4 }, { label: false });
      span.append(s, STATE[st]); legend.append(span);
    }
    for (const [k, name] of Object.entries(KTYPE)) {
      const span = html("span"); const s = el("svg", { viewBox: "-12 -12 24 24" }); const g = el("g", { class: "st-node ready" }, s);
      typeIcon(g, k); span.append(s, name); legend.append(span);
    }
  }

  return {
    /** Show the tree for a world; focusId centres nothing but preselects that skill. */
    open(worldData, focusId) {
      current = worldData;
      layout = buildSkillTree(worldData);
      bounds = layout.bounds;
      big = layout.nodes.length > 30;
      selected = null; card.hidden = true;
      root.hidden = false;
      drawLegend();
      draw();
      requestAnimationFrame(() => { fit(); if (focusId && layout.nodes.some((n) => n.id === focusId)) select(focusId); closeBtn.focus(); });
    },
    close,
    isOpen: () => !root.hidden,
  };
}
