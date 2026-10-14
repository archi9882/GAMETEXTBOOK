// Boot the engine: load a world, build the map, and wire map, panel, progress and storage together.
import { parseImport, ImportError } from "./merge.js";
import { checkWorld } from "./check-world.js";
import { describeIssue, describeImportError } from "./messages-zh.js";
import { worldIdOf, applyImport } from "../app/workbench.js";
import { buildMap, distances, distanceTo } from "./layout.js";
import { createMapView } from "./map.js";
import { createPanel } from "./panel.js";
import { grade } from "./questions.js";
import { emptyProgress, recordCorrect, skillLevel, lampState, learnableSkills, isSolved } from "./progress.js";
import { openStore } from "./store.js";
import { isClassWorld } from "./share.js";

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

// Chinese text of one issue followed by the item path it refers to
function issueText(issue) {
  const { path, text } = describeIssue(issue);
  return path ? `${text}（${path}）` : text;
}

function openIssues() {
  const { errors, warnings } = state.issues;
  const items = [
    ...errors.map((e) => ({ label: `錯誤：${issueText(e)}`, tone: "error" })),
    ...warnings.slice(0, 200).map((w) => ({ label: `提醒：${issueText(w)}`, tone: "muted" })),
  ];
  openPanel(() => state.panel.openList("世界檔檢查結果", items, "沒有問題。"));
}

function startWorld(rec, pos) {
  state.world = rec.world;
  state.complete = !!rec.complete;
  try {
    // Students playing a class version cannot act on checker messages, so none are shown
    state.issues = isClassWorld(rec.world) ? { errors: [], warnings: [] } : checkWorld(rec.world, { partial: !rec.complete });
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
    const docs = [];
    for (const f of files) docs.push(...parseImport(await f.text()));
    // New parts for a world we already have are merged after the stored parts
    const id = worldIdOf(docs);
    const existing = id ? await safe(state.store.getWorld(id)) : null;
    const rec = applyImport(existing ?? undefined, docs, new Date().toISOString());
    await safe(state.store.putWorld(rec));
    startWorld(rec, existing ? state.view?.hero : null);
    toast(`已載入：${rec.world.title ?? rec.id}${rec.complete ? "" : "（進行中）"}`);
  } catch (err) {
    const message = err instanceof ImportError ? `無法載入：${describeImportError(err.message)}` : `無法載入：${err.message}`;
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
  // ?world=<id> from the home page wins over the last world played
  const wanted = new URLSearchParams(location.search).get("world");
  const meta = await safe(state.store.getMeta());
  const pick = wanted ?? meta?.world;
  const rec = pick ? await safe(state.store.getWorld(pick)) : null;
  if (rec) startWorld(rec, rec.id === meta?.world ? meta.pos : null);
  else $("welcome").hidden = false;
}

boot();
