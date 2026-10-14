// Teacher review: every question with the answer the engine computes, flags that feed the fix request
// (framework 9.12; M1 design 3.3). Pure functions; app.js renders them.
import { evaluate, formatSig } from "../engine/expr.js";
import { prepare, formatNumber } from "../engine/questions.js";

const DEFAULT_SIG = 3;
const SIM_SEARCH_POINTS = 5000;

/**
 * Items to review in reading order: per cluster its skills, each followed by its practices;
 * then placement questions and boss steps. Keys use the same paths as check-world messages.
 * @returns {{ key, kind, title, skill?, cluster?, question?, item }[]}
 */
export function reviewItems(world) {
  const items = [];
  const skills = world.skills ?? [];
  const practices = world.practices ?? [];
  const placed = new Set();
  const addSkill = (s, cluster) => {
    if (placed.has(s.id)) return;
    placed.add(s.id);
    items.push({ key: `skills[${s.id}]`, kind: "skill", title: s.name ?? s.id, skill: s.id, cluster, item: s });
    for (const p of practices.filter((x) => x.skill === s.id)) {
      items.push({ key: `practices[${p.id}]`, kind: "practice", title: p.scene || p.id, skill: s.id, cluster, question: p.question, item: p });
    }
  };
  for (const c of world.clusters ?? []) {
    for (const id of c.skills ?? []) {
      const s = skills.find((x) => x.id === id);
      if (s) addSkill(s, c.id);
    }
  }
  for (const s of skills) addSkill(s, s.cluster);
  for (const p of world.placement ?? []) {
    items.push({ key: `placement[${p.id}]`, kind: "placement", title: `分級測驗 ${p.id}`, question: p.question, item: p });
  }
  for (const b of world.bosses ?? []) {
    (b.steps ?? []).forEach((q, i) => {
      items.push({ key: `bosses[${b.id}].steps[${i}]`, kind: "boss", title: `${b.name ?? b.id}：第 ${i + 1} 步`, question: q, item: b });
    });
  }
  return items;
}

const show = (v, sig) => formatNumber(formatSig(v, sig ?? DEFAULT_SIG));

// First slider setting that passes, searched over the grid like check-world does
function passingPoint(q) {
  const counts = q.sliders.map((s) => Math.floor((s.max - s.min) / s.step + 1e-9) + 1);
  const total = counts.reduce((a, b) => a * b, 1);
  const perAxis = total <= SIM_SEARCH_POINTS ? Infinity : Math.max(2, Math.floor(SIM_SEARCH_POINTS ** (1 / counts.length)));
  const scope = { ...(q.consts ?? {}) };
  const visit = (i) => {
    if (i === q.sliders.length) {
      try { return evaluate(q.pass, scope) === true ? { ...scope } : null; } catch { return null; }
    }
    const s = q.sliders[i];
    const stride = Math.max(1, Math.ceil(counts[i] / perAxis));
    for (let k = 0; k < counts[i]; k += stride) {
      scope[s.var] = Number((s.min + k * s.step).toPrecision(12));
      const found = visit(i + 1);
      if (found) return found;
    }
    return null;
  };
  return visit(0);
}

/**
 * What the engine will accept as correct, and each distractor with its stated mistake.
 * @returns {{ answer: string, wrong: { text: string, why: string | null }[], note?: string, error?: string }}
 */
export function answerSummary(q) {
  try {
    switch (q?.type) {
      case "mc":
        return { answer: q.opts[q.a], wrong: q.opts.map((o, i) => ({ text: o, why: q.why?.[i] ?? null })).filter((_, i) => i !== q.a) };
      case "numeric": {
        const answer = evaluate(q.answer, { ...q.vars });
        const unit = q.unit ? ` ${q.unit}` : "";
        const tol = q.sig ? `容錯 ±${5 * 10 ** -q.sig * 100}%` : "容錯 ±1%";
        return {
          answer: `${show(answer, q.sig)}${unit}`,
          note: `運算式 ${q.answer}；${tol}${q.as === "mc" ? "；以選擇題呈現" : ""}`,
          wrong: (q.mistakes ?? []).map((m) => {
            let v;
            try { v = `${show(evaluate(m.expr, { ...q.vars }), q.sig)}${unit}`; } catch (e) { v = `（無法計算：${e.message}）`; }
            return { text: v, why: m.why ?? null };
          }),
        };
      }
      case "order":
        return { answer: q.items.map((x, i) => `${i + 1}. ${x}`).join("　"), wrong: [] };
      case "sim": {
        const pt = passingPoint(q);
        const where = pt ? q.sliders.map((s) => `${s.var} = ${pt[s.var]}${s.unit ? " " + s.unit : ""}`).join("，") : null;
        let out = "";
        if (pt) { try { out = `，${q.output.label} = ${Number(evaluate(q.output.expr, pt).toPrecision(4))}${q.output.unit ? " " + q.output.unit : ""}`; } catch { /* shown as checker issue */ } }
        return { answer: `過關條件：${q.pass}`, note: where ? `例如 ${where} 時過關${out}` : "滑桿範圍內找不到過關的位置", wrong: [] };
      }
      case "method": {
        const best = q.methods.filter((m) => m.best).map((m) => m.name).join("、");
        const inner = answerSummary(q.then);
        return {
          answer: `方法：${best}；接著：${inner.answer}`, note: inner.note,
          wrong: [...q.methods.filter((m) => !m.best).map((m) => ({ text: `方法：${m.name}`, why: m.why ?? null })), ...inner.wrong],
        };
      }
      default:
        return { answer: "—", wrong: [], error: `未知題型 ${q?.type}` };
    }
  } catch (e) {
    return { answer: "—", wrong: [], error: e.message };
  }
}

/** The question as the player sees it (variables substituted), or null when it cannot be prepared. */
export function playerText(q) {
  const p = prepare(q);
  return p.type === "broken" ? null : p.text;
}

/**
 * After an import, flags on items the new parts replaced are marked "updated" so the teacher
 * looks again; their "seen" marks are cleared.
 * @param {{ flags?: object, seen?: object } | undefined} review
 * @param {object[]} docs  newly imported parts or world files
 */
export function touchReview(review, docs) {
  if (!review) return review;
  const changed = new Set();
  for (const d of docs) {
    for (const s of d.skills ?? []) changed.add(`skills[${s.id}]`);
    for (const p of d.practices ?? []) changed.add(`practices[${p.id}]`);
    for (const p of d.placement ?? []) changed.add(`placement[${p.id}]`);
    for (const b of d.bosses ?? []) changed.add(`bosses[${b.id}]`);
  }
  const hit = (key) => changed.has(key) || changed.has(key.replace(/\.steps\[\d+\]$/, ""));
  const flags = {};
  for (const [key, f] of Object.entries(review.flags ?? {})) flags[key] = hit(key) ? { ...f, updated: true } : f;
  const seen = Object.fromEntries(Object.entries(review.seen ?? {}).filter(([key]) => !hit(key)));
  return { flags, seen };
}

/** Flags still waiting for the AI: every flag the teacher has not cleared and the AI has not answered. */
export function openFlags(review) {
  return Object.entries(review?.flags ?? {}).filter(([, f]) => !f.updated).map(([key, f]) => ({ key, note: f.note }));
}

/**
 * Review progress and whether the world is ready for students.
 * @returns {{ total, seen, flags, updated, exploratory, ready: boolean }}
 */
export function reviewStatus(rec) {
  const items = reviewItems(rec.world);
  const seen = items.filter((i) => rec.review?.seen?.[i.key]).length;
  const flags = Object.values(rec.review?.flags ?? {});
  const exploratory = items.filter((i) => i.item?.confidence === "exploratory").length;
  const errors = rec.issues?.errors?.length ?? 0;
  return {
    total: items.length, seen, flags: flags.length, updated: flags.filter((f) => f.updated).length, exploratory, errors,
    ready: seen === items.length && flags.length === 0 && exploratory === 0 && errors === 0 && !!rec.complete,
  };
}
