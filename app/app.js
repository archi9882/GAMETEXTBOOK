// Home page: world list, import workbench and tutorial (app design spec 2).
// Logic lives in workbench.js, fix-request.js and prompt.js; this file only renders and wires events.
import { openStore } from "../engine/store.js";
import { ImportError } from "../engine/merge.js";
import { describeIssue, describeImportError } from "../engine/messages-zh.js";
import { readPaste, applyImport, partRows } from "./workbench.js";
import { buildFixRequest } from "./fix-request.js";
import { buildPrompt } from "./prompt.js";
import { reviewItems, answerSummary, playerText, reviewStatus } from "./review.js";
import { renderFigure } from "../engine/figures.js";
import { buildShareWorld, isClassWorld, shareFileName } from "../engine/share.js";
import { buildBackup, backupFileName, parseBackup, planRestore, mergeProgress, restoreRecord, daysSince, BackupError, REMIND_DAYS } from "./backup.js";

const FRAMEWORK_URL = "../framework/expert-quest-framework.md";
const SOURCE_URL = "https://github.com/archi9882/GAMETEXTBOOK";
const GAME_URL = (id) => `../engine/index.html?world=${encodeURIComponent(id)}`;
// Demo world shipped with the site (an openly licensed textbook chapter; see its README for credits)
const DEMO_URL = "../examples/openstax-kinematics/world.json";

let store;
// Message to show once after an import moves to another world's workbench (the hash change re-renders)
let pendingNotice;
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

// Load the shipped demo world and open it in the game
async function playDemo(status) {
  status.textContent = "載入中…";
  try {
    const res = await fetch(DEMO_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const { docs, worldId } = readPaste(await res.text());
    const existing = await safe(store.getWorld(worldId));
    await store.putWorld(applyImport(existing ?? undefined, docs, new Date().toISOString()));
    location.href = GAME_URL(worldId);
  } catch (e) {
    status.textContent = `無法載入示範世界：${e.message}`;
  }
}

function demoCard(first) {
  const status = h("span", { class: "muted", role: "status" });
  return h("div", { class: "card" },
    h("strong", {}, first ? "先玩玩看" : "示範世界"),
    h("p", {}, "一章高中程度的一維運動學，改編自開放教材 OpenStax《College Physics 2e》（CC BY 4.0）。老師可以用它試試審閱頁與班級版匯出。"),
    h("div", { class: "row" }, h("button", { type: "button", class: first ? "primary" : "", onclick: () => playDemo(status) }, "玩示範世界"), status));
}

async function renderList() {
  const worlds = ((await safe(store.listWorlds())) ?? []).sort((a, b) => String(b.importedAt).localeCompare(String(a.importedAt)));
  if (worlds.length === 0) {
    view.replaceChildren(
      demoCard(true),
      h("div", { class: "card" },
        h("strong", {}, "用自己的教材建立世界"),
        h("p", {}, "在聊天型 AI（例如 claude.ai）中依框架產生世界片段，再貼進匯入工作台。"),
        h("a", { class: "btn primary", href: "#/start" }, "從教學開始")),
      h("div", { class: "card" },
        h("strong", {}, "我是學生"),
        h("p", {}, "老師給了你班級版檔案或連結？"),
        h("a", { class: "btn", href: "#/join" }, "加入班級世界")));
    return;
  }
  const days = daysSince(await safe(store.getSetting("lastBackup")), new Date().toISOString());
  const remind = days === null || days >= REMIND_DAYS
    ? h("div", { class: "card warn" }, days === null ? "還沒有備份過。" : `上次備份是 ${days} 天前。`,
      "清除瀏覽器資料會讓世界與進度消失，", h("a", { href: "#/backup" }, "現在備份"), "。")
    : null;
  view.replaceChildren(h("h2", {}, "我的世界"), ...(remind ? [remind] : []), ...worlds.map((rec) => {
    const errors = rec.issues?.errors?.length ?? 0;
    const warnings = (rec.issues?.warnings?.length ?? 0) - pendingCount(rec);
    return h("div", { class: "card" },
      h("div", { class: "row" },
        h("strong", {}, rec.world?.title ?? rec.id),
        isClassWorld(rec.world) ? h("span", { class: "tag" }, "班級世界")
          : h("span", { class: rec.complete ? "ok" : "warn" }, rec.complete ? "已完成" : "進行中"),
        isClassWorld(rec.world) ? null : h("span", { class: "muted" }, `${rec.parts?.length ?? 0} 個片段`),
        errors ? h("span", { class: "error" }, `${errors} 個錯誤`) : null,
        warnings > 0 ? h("span", { class: "warn" }, `${warnings} 個提醒`) : null),
      h("div", { class: "row", style: "margin-top:8px" },
        ...(isClassWorld(rec.world) ? [] : [
          h("a", { class: "btn", href: `#/world/${encodeURIComponent(rec.id)}` }, "工作台"),
          h("a", { class: "btn", href: `#/world/${encodeURIComponent(rec.id)}/review` }, "審閱")]),
        h("a", { class: "btn primary", href: GAME_URL(rec.id) }, isClassWorld(rec.world) ? "繼續" : "進入遊戲"),
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
    const target = `#/world/${encodeURIComponent(worldId)}`;
    if (location.hash === target) return renderWorkbench(worldId, notice);
    pendingNotice = notice;
    location.hash = target;
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
        h("a", { class: "btn", href: `#/world/${encodeURIComponent(rec.id)}/review` }, "審閱"),
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

// ---- teacher review (#/world/<id>/review) ----

const CONF = { document: "文件原意", "ai-verified": "AI 驗證", exploratory: "探索中" };
const ORIGIN = { document: "改編自文件", "concept-based": "依文件概念命題", supplement: "AI 補充", expansion: "擴充" };
const ITEM_KIND = { skill: "技能頁", practice: "練習", placement: "分級測驗", boss: "Boss" };
const DELIMITERS = [{ left: "$$", right: "$$", display: true }, { left: "$", right: "$", display: false }];
const textOf = (v) => (v && typeof v === "object" ? v.text ?? "" : v ?? "");

function typeset(el) {
  if (typeof window.renderMathInElement !== "function") return;
  try { window.renderMathInElement(el, { delimiters: DELIMITERS, throwOnError: false }); } catch (e) { console.warn(e); }
}

async function renderReview(worldId, filter = "all") {
  let rec = await safe(store.getWorld(worldId));
  if (!rec) { view.replaceChildren(h("p", { class: "error" }, "找不到這個世界。"), h("a", { href: "#/" }, "回首頁")); return; }
  rec.review ??= { flags: {}, seen: {} };
  const save = async () => { await safe(store.putWorld(rec)); updateStatus(); };
  const statusBox = h("div", { class: "card" });
  const scrollY = window.scrollY;

  function updateStatus() {
    const st = reviewStatus(rec);
    const fix = buildFixRequest(rec);
    const reasons = [
      st.errors ? `${st.errors} 個驗證錯誤` : null,
      !rec.complete ? "世界尚未完成（還沒收到 final）" : null,
      st.seen < st.total ? `還有 ${st.total - st.seen} 項沒看過` : null,
      st.flags ? `${st.flags} 項標記有誤${st.updated ? `（其中 ${st.updated} 項 AI 已送出修正，請再看一次後清除標記）` : ""}` : null,
      st.exploratory ? `${st.exploratory} 個技能的信心等級為「探索中」，請確認或請 AI 補出處` : null,
    ].filter(Boolean);
    const copyStatus = h("span", { class: "muted", role: "status" });
    statusBox.replaceChildren(
      h("div", { class: "row" },
        st.ready ? h("span", { class: "badge ok" }, "可以發給學生") : h("span", { class: "badge warn" }, "尚未完成審閱"),
        h("span", { class: "muted" }, `已看過 ${st.seen} / ${st.total}`)),
      reasons.length ? h("ul", { class: "issues" }, reasons.map((r) => h("li", {}, r))) : null,
      h("div", { class: "row", style: "margin-top:8px" },
        h("button", { type: "button", disabled: !fix, onclick: async () => {
          try { await navigator.clipboard.writeText(fix); copyStatus.textContent = "已複製修正請求，請貼回給 AI，再把修正片段貼進工作台。"; }
          catch { copyStatus.textContent = "無法自動複製，請到工作台手動複製。"; }
        } }, "複製修正請求"),
        h("a", { class: "btn", href: `#/world/${encodeURIComponent(rec.id)}` }, "工作台"),
        h("a", { class: "btn primary", href: `#/world/${encodeURIComponent(rec.id)}/share` }, "匯出班級版"),
        copyStatus),
      h("div", { class: "row", style: "margin-top:8px" }, "顯示：",
        ...[["all", "全部"], ["unseen", "未看過"], ["flagged", "已標記"]].map(([k, label]) =>
          h("button", { type: "button", class: k === filter ? "primary" : "", onclick: () => renderReview(worldId, k) }, label))));
  }

  const items = reviewItems(rec.world).filter((i) =>
    filter === "all" || (filter === "unseen" ? !rec.review.seen[i.key] : !!rec.review.flags[i.key]));
  const clusterName = new Map((rec.world.clusters ?? []).map((c) => [c.id, c.name ?? c.id]));
  const groups = new Map();
  for (const it of items) {
    const g = it.kind === "placement" ? "分級測驗" : it.kind === "boss" ? "Boss" : clusterName.get(it.cluster) ?? "其他技能";
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(it);
  }

  const reviewCard = (it) => {
    const card = h("div", { class: "card rv-item" });
    const paint = () => {
      card.classList.toggle("seen", !!rec.review.seen[it.key]);
      card.classList.toggle("flagged", !!rec.review.flags[it.key]);
    };
    const body = [];
    const src = it.item;
    body.push(h("div", { class: "row" },
      h("span", { class: "tag" }, ITEM_KIND[it.kind]),
      h("strong", {}, it.title),
      it.kind === "practice" ? h("span", { class: "muted" }, `Lv${src.level}`) : null,
      src.confidence ? h("span", { class: "tag" }, CONF[src.confidence] ?? src.confidence) : null,
      src.origin ? h("span", { class: "tag" }, ORIGIN[src.origin] ?? src.origin) : null,
      h("code", { class: "muted" }, it.key)));
    if (it.kind === "skill") {
      body.push(h("p", {}, textOf(src.def)));
      if (textOf(src.analog)) body.push(h("p", { class: "muted" }, `類比：${textOf(src.analog)}`));
      for (const f of src.figs ?? []) body.push(renderFigure(f));
    } else {
      const q = it.question;
      const text = playerText(q);
      body.push(h("p", {}, text ?? h("span", { class: "error" }, "這題無法顯示（資料有問題）")));
      if (q.fig) body.push(renderFigure(q.fig, q.type === "numeric" ? { ...q.vars } : {}));
      if (q.type === "mc") body.push(h("ol", { type: "A" }, q.opts.map((o) => h("li", {}, o))));
      if (q.type === "method" && q.then) {
        body.push(h("p", { class: "muted" }, `方法選項：${q.methods.map((m) => m.name).join("／")}`));
        body.push(h("p", {}, `接著：${playerText(q.then) ?? "（無法顯示）"}`));
        if (q.then.fig) body.push(renderFigure(q.then.fig, q.then.type === "numeric" ? { ...q.then.vars } : {}));
      }
      const sum = answerSummary(q);
      body.push(h("div", { class: "rv-answer" },
        h("div", {}, h("strong", {}, "正解："), sum.answer),
        sum.note ? h("div", { class: "muted" }, sum.note) : null,
        sum.error ? h("div", { class: "error" }, `無法計算：${sum.error}`) : null,
        sum.wrong.length ? h("ul", { class: "rv-wrong" }, sum.wrong.map((w) => h("li", {}, `✗ ${w.text}`, w.why ? h("span", { class: "muted" }, `：${w.why}`) : null))) : null,
        (q.ex ?? q.then?.ex) ? h("div", { class: "muted" }, `解說：${q.ex ?? q.then.ex}`) : null));
    }

    const seenBox = h("input", { type: "checkbox", checked: !!rec.review.seen[it.key], onchange: async (e) => {
      if (e.target.checked) rec.review.seen[it.key] = true; else delete rec.review.seen[it.key];
      paint(); await save();
    } });
    const flagArea = h("div", {});
    const drawFlag = () => {
      const f = rec.review.flags[it.key];
      if (!f) {
        flagArea.replaceChildren(h("button", { type: "button", onclick: () => {
          const note = h("input", { type: "text", placeholder: "哪裡有誤？例如：單位應為 kPa；選項 C 也對" });
          flagArea.replaceChildren(note, h("div", { class: "rv-controls" },
            h("button", { type: "button", class: "primary", onclick: async () => {
              rec.review.flags[it.key] = { note: note.value.trim(), at: new Date().toISOString() };
              delete rec.review.seen[it.key];
              seenBox.checked = false;
              drawFlag(); paint(); await save();
            } }, "儲存標記"),
            h("button", { type: "button", onclick: drawFlag }, "取消")));
          note.focus();
        } }, "標記有誤"));
        return;
      }
      flagArea.replaceChildren(h("div", { class: f.updated ? "warn" : "error" },
        f.updated ? "AI 已送出修正，請再看一次：" : "已標記有誤：", f.note || "（未填說明）",
        h("button", { type: "button", style: "margin-left:8px", onclick: async () => { delete rec.review.flags[it.key]; drawFlag(); paint(); await save(); } }, "清除標記")));
    };
    drawFlag();
    body.push(h("div", { class: "rv-controls" }, h("label", {}, seenBox, "已看過"), flagArea));
    card.append(...body);
    paint();
    return card;
  };

  updateStatus();
  view.replaceChildren(
    h("h2", {}, `審閱：${rec.world?.title ?? rec.id}`),
    h("p", { class: "muted" }, "發給學生前，逐項確認題目、引擎算出的正解與每個干擾選項。看完勾「已看過」；有問題按「標記有誤」，標記會併入修正請求。"),
    statusBox,
    ...(items.length ? [] : [h("p", { class: "muted" }, "沒有符合的項目。")]),
    ...[...groups].map(([name, list], i) => reviewGroup(name, list, i === 0 || groups.size <= 3)));
  window.scrollTo(0, scrollY);

  // A whole book has hundreds of items, so a group builds its cards (and typesets them) only when first opened
  function reviewGroup(name, list, open) {
    const seen = list.filter((it) => rec.review.seen[it.key]).length;
    const group = h("details", { class: "rv-group" }, h("summary", {}, `${name}（已看過 ${seen} / ${list.length}）`));
    let built = false;
    group.addEventListener("toggle", () => {
      if (!group.open || built) return;
      built = true;
      group.append(...list.map(reviewCard));
      typeset(group);
    });
    group.open = open;
    return group;
  }
}

// ---- class version (#/world/<id>/share) ----

const ORIGIN_NAME = { document: "文件", "concept-based": "依文件概念命題", supplement: "AI 補充", expansion: "擴充來源" };

async function renderShare(worldId) {
  const rec = await safe(store.getWorld(worldId));
  if (!rec) { view.replaceChildren(h("p", { class: "error" }, "找不到這個世界。"), h("a", { href: "#/" }, "回首頁")); return; }
  const { world, removed, kept, credits, nonCommercial } = buildShareWorld(rec.world, new Date().toISOString());
  const st = reviewStatus(rec);
  const removedTotal = removed.practices + removed.placement + removed.bosses;
  const lic = rec.world.source?.license;
  const urlInput = h("input", { type: "url", placeholder: "https://…/my-world-class.json" });
  const linkOut = h("pre", { class: "prompt", hidden: true });
  const copyStatus = h("span", { class: "muted", role: "status" });
  const joinBase = new URL("#/join?url=", location.href.split("#")[0]).href;

  view.replaceChildren(...[
    h("h2", {}, `班級版：${rec.world.title ?? rec.id}`),
    st.ready ? null : h("div", { class: "card warn" }, "這個世界還沒完成審閱（",
      h("a", { href: `#/world/${encodeURIComponent(rec.id)}/review` }, "前往審閱"), "）。仍可匯出，但建議先逐題檢查。"),
    h("div", { class: "card" },
      h("strong", {}, "匯出內容"),
      h("ul", {},
        h("li", {}, `文件授權：${lic ?? "未標示"}`),
        h("li", {}, `保留 ${kept} 題練習、${world.placement.length} 題分級測驗、${world.bosses.length} 座 Boss、${world.skills.length} 個技能`),
        removedTotal || removed.fields || removed.glossary
          ? h("li", { class: "warn" }, `依授權移除 ${removed.practices} 題練習、${removed.placement} 題分級測驗、${removed.bosses} 座 Boss、${removed.fields} 段技能內容、${removed.glossary} 則詞條解釋（著作權保留或授權不明）。學生需持有原書，依頁碼與節次對照。`)
          : h("li", { class: "ok" }, "沒有需要移除的內容。"),
        nonCommercial ? h("li", { class: "warn" }, "含 NC（非商業）授權內容：這份檔案不可用於商業用途。") : null),
      h("p", { class: "muted" }, "班級版只供你發給自己的學生，請勿公開張貼。是否屬於課堂合理使用，程式無法判斷；有疑問請詢問學校或法律顧問。匯出即表示你同意",
        h("a", { href: "#/about" }, "使用條款"), "。"),
      h("button", { type: "button", class: "primary", onclick: () => download(shareFileName(world), JSON.stringify(world, null, 1)) }, "下載班級版檔案")),
    h("div", { class: "card" },
      h("strong", {}, "發給學生"),
      h("ol", {},
        h("li", {}, "把下載的檔案傳給學生（例如透過班級群組或課程平台）。學生打開本網站，按「加入班級世界」選擇檔案即可。"),
        h("li", {}, "或把檔案放在允許跨網域讀取的網址（例如 GitHub 儲存庫的 raw 連結、GitHub Pages），在下面貼上檔案網址，產生一鍵加入的連結。Google 雲端硬碟的分享連結無法直接使用。")),
      h("label", {}, "班級版檔案的網址"), urlInput,
      h("div", { class: "row", style: "margin-top:8px" },
        h("button", { type: "button", onclick: async () => {
          const u = urlInput.value.trim();
          if (!/^https:\/\//.test(u)) { copyStatus.textContent = "請貼上 https:// 開頭的網址。"; return; }
          linkOut.textContent = joinBase + encodeURIComponent(u);
          linkOut.hidden = false;
          try { await navigator.clipboard.writeText(linkOut.textContent); copyStatus.textContent = "已複製加入連結。"; }
          catch { copyStatus.textContent = "請手動複製下方連結。"; }
        } }, "產生加入連結"), copyStatus),
      linkOut),
    credits.length ? h("details", { class: "card" }, h("summary", {}, `出處與授權（${credits.length}）`),
      h("ul", {}, credits.map((c) => h("li", {}, `${c.name}（${ORIGIN_NAME[c.origin] ?? c.origin}，${c.license}）`, c.url ? h("br") : null, c.url ? h("code", {}, c.url) : null)))) : null,
  ].filter(Boolean));
}

// ---- join a class world (#/join, #/join?url=...) ----

async function joinFrom(text) {
  const { docs } = readPaste(text);
  const doc = docs[0];
  if (docs.length !== 1 || doc.kind === "part") throw new Error("這不是班級版世界檔。請向老師索取「班級版」檔案。");
  const existing = await safe(store.getWorld(doc.id));
  // A teacher testing their own link must not lose the full world (parts, review marks) to the class version
  if (existing && !isClassWorld(existing.world)) {
    throw new Error("這個瀏覽器已經有這個世界的完整版（例如你是製作它的老師），為了不覆蓋它，沒有加入班級版。要測試學生畫面，請用另一個瀏覽器或無痕視窗。");
  }
  const rec = applyImport(undefined, [doc], new Date().toISOString());
  await store.putWorld(rec);
  return { rec, updated: !!existing };
}

async function renderJoin(query) {
  const status = h("p", { role: "status" });
  const file = h("input", { type: "file", accept: ".json,application/json", hidden: true });
  const done = ({ rec, updated }) => {
    status.className = "ok";
    status.replaceChildren(`${updated ? "已更新" : "已加入"}「${rec.world.title ?? rec.id}」。`, " ",
      h("a", { class: "btn primary", href: GAME_URL(rec.id) }, "開始玩"));
  };
  const fail = (e) => { status.className = "error"; status.textContent = e instanceof ImportError ? `無法加入：${describeImportError(e.message)}` : `無法加入：${e.message}`; };
  file.addEventListener("change", async () => {
    const f = file.files[0];
    file.value = "";
    if (!f) return;
    try { done(await joinFrom(await f.text())); } catch (e) { fail(e); }
  });
  view.replaceChildren(
    h("h2", {}, "加入班級世界"),
    h("div", { class: "card" },
      h("p", {}, "選擇老師給你的班級版檔案（.json）。你的學習進度只存在這個瀏覽器；老師之後給你新版檔案時，再加入一次即可更新，進度會保留。"),
      h("button", { type: "button", class: "primary", onclick: () => file.click() }, "選擇檔案"), file,
      status));
  const url = new URLSearchParams(query).get("url");
  if (url) {
    status.textContent = "正在下載老師提供的世界…";
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`下載失敗（HTTP ${res.status}）`);
      done(await joinFrom(await res.text()));
    } catch (e) {
      fail(e instanceof TypeError ? new Error("無法從這個網址下載：可能目前沒有網路，或網址不允許跨網域讀取。請確認連線，或改用檔案加入。") : e);
    }
  }
}

// ---- about (#/about) ----

function renderAbout() {
  const link = (href, text) => h("a", { href, target: "_blank", rel: "noopener" }, text ?? href);
  view.replaceChildren(
    h("h2", {}, "關於專家養成記"),
    h("div", { class: "card" },
      h("p", {}, "把數學、物理、化學、生物的教材或論文交給你自己的聊天型 AI，依框架生成可以遊玩的學習世界。"),
      h("p", {}, "原始碼：", link(SOURCE_URL))),
    h("div", { class: "card", id: "terms" },
      h("strong", {}, "使用條款與免責聲明"),
      h("ul", {},
        h("li", {}, "本網站只是工具。世界的內容是你自己的 AI 依你提供的文件生成的，不是本網站提供的。"),
        h("li", {}, "你交給 AI 的文件，必須是你自己的著作、開放授權的教材，或你有權為此用途使用的文件。"),
        h("li", {}, "你分發給他人的世界檔（包括班級版），必須是你有權分發的內容。完整備份含有依文件改編的內容，僅限個人使用；要發給學生請匯出班級版。"),
        h("li", {}, "班級版會依每段內容的授權標記，自動移除改編自原書的內容。這些標記由 AI 判斷，程式無法確認每一段都標對，也不能取代法律意見；分發前請自行確認。"),
        h("li", {}, "AI 生成的內容可能有錯。發給學生前，請先在審閱頁逐題檢查；本網站不保證內容正確，也不保證適合特定用途。"),
        h("li", {}, "本軟體依 AGPL-3.0 授權「依現狀」提供，不附任何擔保；在法律允許的範圍內，作者不對使用本軟體造成的損害負責。"))),
    h("div", { class: "card" },
      h("strong", {}, "你的資料"),
      h("ul", {},
        h("li", {}, "世界與學習進度只存在這個瀏覽器（IndexedDB），不會上傳到任何伺服器。"),
        h("li", {}, "清除瀏覽器資料會讓它們消失，請定期", h("a", { href: "#/backup" }, "備份"), "。"),
        h("li", {}, "本網站不使用 Cookie、不做追蹤或分析。"),
        h("li", {}, "加入班級世界時，只會從老師給的網址下載世界檔。"))),
    h("div", { class: "card" },
      h("strong", {}, "授權"),
      h("ul", {},
        h("li", {}, "程式碼（遊戲本體）：GNU AGPL-3.0，", link(`${SOURCE_URL}/blob/main/LICENSE`, "全文")),
        h("li", {}, "框架文件：CC BY-SA 4.0；依框架生成的世界檔不受框架授權約束，授權依各段內容的標記。"),
        h("li", {}, "世界檔的結構與 AI 補充內容：預設 CC0 1.0。"),
        h("li", {}, "KaTeX（公式排版）、SmilesDrawer（分子結構）：MIT 授權。"),
        h("li", {}, "示範世界改編自 OpenStax《College Physics 2e》第 2 章（Paul Peter Urone、Roger Hinrichs 著，CC BY 4.0），內容經改寫與翻譯、數值重新設定；可於 ",
          link("https://openstax.org/details/books/college-physics-2e", "openstax.org"), " 免費取得原書。本網站與 OpenStax 無關，亦未經其認可。"))),
    h("div", { class: "card" },
      h("strong", {}, "設計參考"),
      h("p", { class: "muted" }, "遊戲設計參考了一些既有作品的玩法概念，但本網站與它們無關，不使用其名稱、角色、圖像、音效或標誌。")));
}

// ---- backup (#/backup) ----

function download(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const a = h("a", { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function renderBackup() {
  const last = await safe(store.getSetting("lastBackup"));
  const lastLine = h("p", { class: "muted" }, last ? `上次備份：${time(last)}` : "還沒有備份過。");
  const status = h("p", { role: "status" });
  const restoreArea = h("div", {});
  const file = h("input", { type: "file", accept: ".json,application/json", hidden: true });

  const exportAll = async () => {
    if (!confirm("備份檔含有依文件改寫的內容，僅限個人使用。要發給學生或他人，請改用世界的「班級版」匯出。\n\n繼續匯出備份？")) return;
    const worlds = (await safe(store.listWorlds())) ?? [];
    const progress = (await safe(store.getProgress())) ?? { version: 1, skills: {} };
    const stamp = new Date().toISOString();
    download(backupFileName(stamp), JSON.stringify(buildBackup({ worlds, progress }, stamp), null, 1));
    await safe(store.putSetting("lastBackup", stamp));
    lastLine.textContent = `上次備份：${time(stamp)}`;
    status.className = "ok";
    status.textContent = `已匯出 ${worlds.length} 個世界與學習進度。`;
  };

  file.addEventListener("change", async () => {
    const f = file.files[0];
    file.value = "";
    if (!f) return;
    try {
      const backup = parseBackup(await f.text());
      const plan = planRestore((await safe(store.listWorlds())) ?? [], backup);
      restoreArea.replaceChildren(restorePreview(backup, plan));
    } catch (e) {
      restoreArea.replaceChildren(h("p", { class: "error" }, e instanceof BackupError ? e.message : `無法讀取備份：${e.message}`));
    }
  });

  view.replaceChildren(
    h("h2", {}, "備份與還原"),
    h("div", { class: "card" },
      h("p", {}, "世界與學習進度只存在這個瀏覽器。清除瀏覽器資料、換電腦或換瀏覽器前，請先備份。"),
      lastLine,
      h("div", { class: "row" },
        h("button", { type: "button", class: "primary", onclick: exportAll }, "匯出完整備份"),
        h("button", { type: "button", onclick: () => file.click() }, "從備份還原"), file),
      status),
    restoreArea);
}

function restorePreview(backup, plan) {
  // Conflicts default to whichever copy was imported more recently
  const choice = new Map(plan.map((p) => [p.id, p.action === "add" || p.newer === "backup" ? "backup" : "current"]));
  const result = h("p", { role: "status" });
  const rows = plan.map((p) => {
    const cell = p.action === "add" ? h("td", {}, "新增")
      : h("td", {}, h("select", { "aria-label": `${p.title} 要保留哪一份`, onchange: (e) => choice.set(p.id, e.target.value) },
        h("option", { value: "backup", selected: choice.get(p.id) === "backup" }, `用備份的（${time(p.backup.importedAt)}）`),
        h("option", { value: "current", selected: choice.get(p.id) === "current" }, `保留目前的（${time(p.current.importedAt)}）`)));
    return h("tr", {}, h("td", {}, p.title), cell);
  });
  const apply = async () => {
    let n = 0;
    for (const p of plan) {
      if (choice.get(p.id) !== "backup") continue;
      await store.putWorld(restoreRecord(p.backup));
      n++;
    }
    const merged = mergeProgress((await safe(store.getProgress())) ?? { version: 1, skills: {} }, backup.progress);
    await store.putProgress(merged);
    result.className = "ok";
    result.textContent = `已還原 ${n} 個世界；學習進度已合併（兩邊都保留，取較高者）。`;
  };
  return h("div", { class: "card" },
    h("strong", {}, `備份時間：${time(backup.exportedAt)}，共 ${plan.length} 個世界`),
    h("table", {}, rows),
    h("p", { class: "muted" }, "學習進度會與目前的進度合併，不會減少。"),
    h("button", { type: "button", class: "primary", onclick: apply }, "還原"),
    result);
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
        h("li", {}, "在聊天型 AI（例如 claude.ai）開新對話，上傳框架檔與你的整份文件，不需要自己切割。只有平台拒收檔案時，才改傳較小的檔案。"),
        h("li", {}, "填寫下方表單，複製提示詞貼給 AI。AI 會先問你幾個問題（P0）。"),
        h("li", {}, "AI 每給出一個片段，就把整段回覆貼進", h("a", { href: "#/import" }, "匯入工作台"), "。"),
        h("li", {}, "工作台列出問題時，按「複製修正請求」貼回給 AI，再匯入它給的修正片段。"),
        h("li", {}, "對話太長時開新對話，上傳框架檔、同一份完整文件與 AI 最後一次給的狀態摘要，說「請從這份狀態摘要接續」。"),
        h("li", {}, "要發給學生：在世界清單按「審閱」逐題檢查，再匯出「班級版」。AI 問你是不是文件作者時，自編講義請回答是，並選擇授權。"))),
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
  if (hash === "#/join" || hash.startsWith("#/join?")) return renderJoin(hash.slice("#/join".length));
  const share = hash.match(/^#\/world\/(.+)\/share$/);
  if (share) return renderShare(decodeURIComponent(share[1]));
  const review = hash.match(/^#\/world\/(.+)\/review$/);
  if (review) return renderReview(decodeURIComponent(review[1]));
  const world = hash.match(/^#\/world\/(.+)$/);
  const notice = pendingNotice;
  pendingNotice = undefined;
  if (world) return renderWorkbench(decodeURIComponent(world[1]), notice);
  if (hash === "#/import") return renderWorkbench();
  if (hash === "#/start") return renderStart();
  if (hash === "#/backup") return renderBackup();
  if (hash === "#/about") return renderAbout();
  return renderList();
}

store = await openStore();
document.getElementById("volatile").hidden = store.persistent;
window.addEventListener("hashchange", route);
route();
