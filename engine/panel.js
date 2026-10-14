// Side panel / bottom drawer: skill pages, practices and glossary dives (design spec 4.4).
// All text is inserted as text nodes (never innerHTML); KaTeX auto-render typesets $...$ afterwards.
import { prepare, simOutput } from "./questions.js";
import { skillLevel, isSolved, isExpandable } from "./progress.js";
import { renderFigure } from "./figures.js";

const KTYPE = { fact: "事實", concept: "概念", procedure: "程序", principle: "原理", judgment: "判斷" };
const KIND = { core: "核心", optional: "支線", app: "應用", tool: "工具", supplement: "補充" };
const CONF = { document: "文件原意", "ai-verified": "AI 驗證", exploratory: "探索中" };
const CONTEXT = { subject: "學科", commission: "委託" };
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
    const title = deps.world().source?.title;
    const name = a.name ?? (item.origin === "document" ? title : item.origin === "concept-based" && title ? `依《${title}》的概念命題` : null);
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
      ...(s.figs ?? []).map((f) => renderFigure(f)),
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
    // A sim figure is redrawn with the current slider values below; others are drawn once here
    const figBox = h("div", {});
    if (q.fig) figBox.append(renderFigure(q.fig, q.scope));
    box.append(figBox);
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
        // Phone decimal keypads (iOS) have no minus key, so a button flips the sign
        const flip = () => { const v = input.value.trim(); input.value = v.startsWith("-") ? v.slice(1) : `-${v}`; input.focus(); };
        box.append(h("form", { class: "num-form", onsubmit: (e) => { e.preventDefault(); done({ value: parseNumber(input.value) }); } },
          h("button", { type: "button", class: "ghost sign", "aria-label": "正負號", onclick: flip }, "±"),
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
            oninput: (e) => {
            values[s.var] = Number(e.target.value);
            label.textContent = `${s.label ?? s.var} = ${values[s.var]} ${s.unit ?? ""}`;
            show();
            if (q.fig) { figBox.replaceChildren(renderFigure(q.fig, { ...q.scope, ...values })); typeset(figBox); }
          },
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
