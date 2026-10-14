// Prepare questions for display and grade answers (framework 6.6, 8.2, 8.3; design spec 4.2).
// Every number shown or checked comes from engine/expr.js; nothing is computed with eval.
import { evaluate, formatSig, withinTolerance } from "./expr.js";

const PLACEHOLDER = /\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g;
const DEFAULT_SIG = 3;

/**
 * Format a number for display. Values at or above 10^6, or below 10^-3 (except 0), become
 * LaTeX scientific notation; math: true returns it without surrounding dollars.
 */
export function formatNumber(value, { math = false } = {}) {
  if (typeof value !== "number" || !Number.isFinite(value)) return String(value);
  const a = Math.abs(value);
  if (a === 0 || (a >= 1e-3 && a < 1e6)) return String(value);
  const [mantissa, exponent] = value.toExponential().split("e");
  const tex = `${mantissa} \\times 10^{${Number(exponent)}}`;
  return math ? tex : "$" + tex + "$";
}

// True when position `end` of text lies inside $...$ or $$...$$ (an escaped \$ does not count)
function insideMath(text, end) {
  let inMath = false;
  for (let i = 0; i < end; i++) {
    if (text[i] === "\\") { i++; continue; }
    if (text[i] !== "$") continue;
    if (text[i + 1] === "$") i++;
    inMath = !inMath;
  }
  return inMath;
}

/** Replace {{name}} with the variable's value; unknown names are left untouched. */
export function substitute(text, scope = {}) {
  const src = String(text ?? "");
  return src.replace(PLACEHOLDER, (match, name, offset) => {
    if (!Object.hasOwn(scope, name)) return match;
    const v = scope[name];
    return typeof v === "number" ? formatNumber(v, { math: insideMath(src, offset) }) : String(v);
  });
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
const show = (value, sig) => formatNumber(formatSig(value, sig ?? DEFAULT_SIG));

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
      const base = { type: "numeric", text: substitute(q.q, scope), ex: q.ex, fig: q.fig, scope, unit: q.unit ?? "", sig: q.sig, answer };
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
      return { type: "sim", text: substitute(q.q, scope), ex: q.ex, fig: q.fig, scope, sliders: q.sliders, consts: q.consts ?? {}, output: q.output, pass: q.pass };
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
