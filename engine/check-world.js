// Checks on a world file that the JSON Schema cannot express:
// unique IDs, references, prerequisite cycles, coverage counts (framework 6.3, 6.7, 10),
// license consistency (7.4) and every expression (7.2, 8.3, 8.4).
// Run the schema first; this module assumes the basic shape is already valid.

import { evaluate, variables, formatSig, withinTolerance, ExprError } from "./expr.js";

const MIN_PLACEMENT_PER_TIER = 4;   // framework 6.7
const PLOT_SAMPLES = 50;            // samples per plot series
const SIM_MAX_POINTS = 5000;        // sim grids up to this size are checked at every point (framework 7.2)
const DEFAULT_SIG = 3;              // used to decide whether two numeric options look identical
const MAX_DISTRACTOR_RATIO = 1e7;   // beyond this a distractor is implausible (decision D)
const MIN_DISTRACTOR_GAP = 0.03;    // closer than this a distractor is hard to tell apart (framework 7.2)
const PLACEHOLDER = /\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g;
const TEXT_FIELDS = ["def", "analog", "analogLimit", "story", "intro"];

/**
 * @param {object} world  a parsed world.json that already passed the schema
 * @param {{ partial?: boolean }} [options]  partial: the world is still being generated (framework 8.7),
 *   so references to items not generated yet and coverage counts are warnings, not errors
 * @returns {{ errors: string[], warnings: string[] }}
 */
export function checkWorld(world, { partial = false } = {}) {
  const errors = [];
  const warnings = [];
  const err = (path, msg) => errors.push(`${path}: ${msg}`);
  const warn = (path, msg) => warnings.push(`${path}: ${msg}`);
  // Problems that may only mean "not generated yet" while a world is in progress
  const gap = (path, msg) => (partial ? warn(path, `${msg} (not generated yet?)`) : err(path, msg));

  const skills = world.skills ?? [];
  const practices = world.practices ?? [];
  const placement = world.placement ?? [];
  const bosses = world.bosses ?? [];
  const clusters = world.clusters ?? [];
  const schools = world.schools ?? [];

  // ---- unique IDs ----
  const ids = (list, label, noun) => {
    const seen = new Set();
    for (const item of list) {
      if (seen.has(item.id)) err(`${label}[${item.id}]`, `duplicate ${noun} id`);
      seen.add(item.id);
    }
    return seen;
  };
  const skillIds = ids(skills, "skills", "skill");
  ids(practices, "practices", "practice");
  ids(placement, "placement", "placement");
  const bossIds = ids(bosses, "bosses", "boss");
  const clusterIds = ids(clusters, "clusters", "cluster");
  const schoolIds = ids(schools, "schools", "school");
  ids(world.achievements ?? [], "achievements", "achievement");

  // Prerequisites taught elsewhere are allowed if the report lists them (framework 5.5, 8.7)
  const external = new Set((world.report?.missingPrereqs ?? []).map((m) => (typeof m === "string" ? m : m?.skill)));
  const refSkill = (path, id, allowExternal = false) => {
    if (!skillIds.has(id) && !(allowExternal && external.has(id))) gap(path, `unknown skill ${id}`);
  };
  const refBoss = (path, id) => { if (!bossIds.has(id)) gap(path, `unknown boss ${id}`); };

  if (skills.length === 0) gap("skills", "world needs at least one skill");

  // ---- schools and tiers ----
  const tiersBySchool = new Map();
  for (const s of schools) {
    const path = `schools[${s.id}]`;
    tiersBySchool.set(s.id, new Set(s.tiers.map((t) => t.tier)));
    for (const t of s.tiers) {
      if (t.boss === undefined) gap(`${path}.tier ${t.tier}`, "has no boss");
      else refBoss(`${path}.tier ${t.tier}`, t.boss);
    }
    if (s.finalBoss === undefined) gap(path, "has no final boss");
    else refBoss(path, s.finalBoss);
  }

  // Framework 7.5: {{...}} placeholders only make sense inside questions, which have variables
  const noPlaceholder = (path, value) => {
    const text = value && typeof value === "object" ? value.text : value;
    if (typeof text === "string" && /\{\{\s*[A-Za-z_]/.test(text)) err(path, "placeholder {{...}} used outside a question");
  };

  // ---- clusters ----
  for (const c of clusters) {
    const path = `clusters[${c.id}]`;
    noPlaceholder(`${path}.name`, c.name);
    if (!schoolIds.has(c.school)) err(path, `unknown school ${c.school}`);
    for (const id of c.skills) refSkill(path, id);
    if (c.boss === undefined) gap(path, "has no boss");
    else refBoss(path, c.boss);
  }

  // ---- skills ----
  for (const s of skills) {
    const path = `skills[${s.id}]`;
    if (!schoolIds.has(s.schools[0])) err(path, `unknown school ${s.schools[0]} (primary school must be in this world)`);
    if (s.cluster !== undefined && !clusterIds.has(s.cluster)) gap(path, `unknown cluster ${s.cluster}`);
    // Framework 3.2: a skill may sit above its chapter's tier, never below
    const cluster = clusters.find((c) => c.id === s.cluster);
    if (cluster && s.tier < cluster.tier) err(path, `tier ${s.tier} is lower than its cluster tier ${cluster.tier}`);
    for (const id of s.pre ?? []) refSkill(`${path}.pre`, id, true);
    for (const l of s.links ?? []) refSkill(`${path}.links`, l.skill, true);
    (s.figs ?? []).forEach((f, i) => checkFig(f, {}, `${path}.figs[${i}]`, err, warn));
    // Framework 3.3: every level up to maxLevel needs enough practices to be reachable
    for (let L = 2; L <= s.maxLevel; L++) {
      const need = L === 5 ? 1 : 2;
      const n = practices.filter((p) => p.skill === s.id && p.level === L).length;
      if (n < need) gap(path, `Lv${L} has ${n} practices (needs ${need}); lower maxLevel or add practices`);
    }
    for (const f of ["name", "def", "analog", "analogLimit", "story"]) noPlaceholder(`${path}.${f}`, s[f]);
  }
  findCycles(skills, skillIds).forEach((cycle) => err("skills", `prerequisite cycle: ${cycle.join(" -> ")}`));

  // ---- practices, placement, bosses, bridges ----
  for (const p of practices) {
    refSkill(`practices[${p.id}]`, p.skill);
    noPlaceholder(`practices[${p.id}].scene`, p.scene);
    checkQuestion(p.question, `practices[${p.id}].question`, err, warn);
  }
  for (const p of placement) {
    const path = `placement[${p.id}]`;
    if (!schoolIds.has(p.school)) err(path, `unknown school ${p.school}`);
    else if (!tiersBySchool.get(p.school).has(p.tier)) err(path, `school ${p.school} has no tier ${p.tier}`);
    for (const id of p.skills) refSkill(path, id);
    checkQuestion(p.question, `${path}.question`, err, warn);
  }
  for (const b of bosses) {
    for (const id of b.skills) refSkill(`bosses[${b.id}]`, id);
    for (const f of ["name", "npc", "intro"]) noPlaceholder(`bosses[${b.id}].${f}`, b[f]);
    b.steps.forEach((q, i) => checkQuestion(q, `bosses[${b.id}].steps[${i}]`, err, warn));
    // Plausibility: consecutive steps with the same numeric answer read like a copy of the previous step
    let prev = null;
    b.steps.forEach((q, i) => {
      const inner = q.type === "method" ? q.then : q;
      let cur = null;
      if (inner?.type === "numeric") {
        try {
          const v = evaluate(inner.answer, { ...inner.vars });
          // Same number in a different unit (2 Ω then 2 A) is not confusing, so the unit is part of the key
          if (typeof v === "number") cur = `${formatSig(v, inner.sig ?? DEFAULT_SIG)} ${inner.unit ?? ""}`.trim();
        } catch { /* reported by checkQuestion */ }
      }
      if (cur !== null && cur === prev) warn(`bosses[${b.id}].steps[${i}]`, `same answer as the previous step (${cur})`);
      prev = cur;
    });
  }
  (world.bridges ?? []).forEach((b, i) => {
    refSkill(`bridges[${i}]`, b.a);
    b.steps.forEach((q, j) => checkQuestion(q, `bridges[${i}].steps[${j}]`, err, warn));
  });

  // ---- achievements and glossary ----
  for (const a of world.achievements ?? []) {
    if (a.when.boss !== undefined) refBoss(`achievements[${a.id}]`, a.when.boss);
    if (a.when.skill !== undefined) refSkill(`achievements[${a.id}]`, a.when.skill);
  }
  for (const g of world.glossary ?? []) {
    if (g.skill !== undefined) refSkill(`glossary[${g.term}]`, g.skill);
    for (const f of ["term", "def"]) noPlaceholder(`glossary[${g.term}].${f}`, g[f]);
  }

  // ---- coverage: practices and encounters per core skill (framework 6.3, 10) ----
  for (const s of skills.filter((x) => x.kind === "core")) {
    const path = `skills[${s.id}]`;
    const own = practices.filter((p) => p.skill === s.id);
    if (own.length < 2) gap(path, `core skill needs at least 2 practices (has ${own.length})`);
    else if (new Set(own.map((p) => `${p.context}|${p.scene ?? ""}`)).size < 2) {
      gap(path, "core skill practices must use different contexts");
    }
    if (!own.some((p) => p.encounter === true)) gap(path, "core skill needs at least 1 practice marked encounter");
  }

  // ---- coverage: placement questions per school tier (framework 6.7) ----
  for (const s of schools) {
    for (const t of s.tiers) {
      const n = placement.filter((p) => p.school === s.id && p.tier === t.tier).length;
      if (n < MIN_PLACEMENT_PER_TIER) {
        gap(`placement`, `school ${s.id} tier ${t.tier} has ${n} questions (need at least ${MIN_PLACEMENT_PER_TIER})`);
      }
    }
  }

  // ---- licenses (framework 7.4) ----
  const expectLicense = (path, origin, license) => {
    if (origin === "document" && license !== world.source.license) {
      err(path, `document content must use source.license (${world.source.license}), found ${license}`);
    }
    if ((origin === "supplement" || origin === "concept-based") && license !== world.license.default) {
      err(path, `${origin} content must use license.default (${world.license.default}), found ${license}`);
    }
  };
  const content = [
    ["skills", skills, (x) => x.id], ["practices", practices, (x) => x.id], ["placement", placement, (x) => x.id],
    ["bosses", bosses, (x) => x.id], ["glossary", world.glossary ?? [], (x) => x.term],
    ["bridges", world.bridges ?? [], (_x, i) => i],
  ];
  for (const [label, list, key] of content) {
    list.forEach((item, i) => {
      const path = `${label}[${key(item, i)}]`;
      expectLicense(path, item.origin, item.license);
      for (const f of TEXT_FIELDS) {
        const v = item[f];
        if (v && typeof v === "object") expectLicense(`${path}.${f}`, v.origin, v.license);
      }
    });
  }

  return { errors, warnings };
}

// Depth-first search over in-world prerequisite edges; returns each cycle found once
function findCycles(skills, skillIds) {
  const pre = new Map(skills.map((s) => [s.id, (s.pre ?? []).filter((p) => skillIds.has(p))]));
  const state = new Map(); // undefined = unvisited, 1 = on stack, 2 = done
  const stack = [];
  const cycles = [];
  const visit = (id) => {
    state.set(id, 1);
    stack.push(id);
    for (const next of pre.get(id) ?? []) {
      if (state.get(next) === 1) cycles.push([...stack.slice(stack.indexOf(next)), next]);
      else if (state.get(next) === undefined) visit(next);
    }
    stack.pop();
    state.set(id, 2);
  };
  for (const id of pre.keys()) if (state.get(id) === undefined) visit(id);
  return cycles;
}

// Evaluate an expression and report failures; returns the value or undefined
function tryEval(expr, scope, path, err) {
  try {
    return evaluate(expr, scope);
  } catch (e) {
    if (!(e instanceof ExprError)) throw e;
    err(path, `${e.message} (in ${JSON.stringify(expr)})`);
    return undefined;
  }
}

// Collect every string inside a question except a nested method `then`, which has its own scope
function questionStrings(q, out = []) {
  for (const [k, v] of Object.entries(q)) {
    if (k === "then") continue;
    if (typeof v === "string") out.push(v);
    else if (v && typeof v === "object") questionStrings(v, out);
  }
  return out;
}

// Variables visible to a question's text, answer and figure
function questionScope(q) {
  if (q.type === "numeric") return { ...q.vars };
  if (q.type === "sim") {
    const scope = { ...(q.consts ?? {}) };
    for (const s of q.sliders) scope[s.var] = s.min;
    return scope;
  }
  return {};
}

function checkQuestion(q, path, err, warn) {
  const scope = questionScope(q);

  // {{name}} placeholders must refer to variables in scope (framework 7.5)
  for (const text of questionStrings(q)) {
    for (const m of text.matchAll(PLACEHOLDER)) {
      if (!Object.hasOwn(scope, m[1])) err(path, `placeholder {{${m[1]}}} has no matching variable`);
    }
  }

  switch (q.type) {
    case "mc":
      if (q.a >= q.opts.length) err(path, `answer index ${q.a} is outside ${q.opts.length} options`);
      if (new Set(q.opts).size !== q.opts.length) err(path, "duplicate option");
      if (q.why && q.why.length !== q.opts.length) err(path, `why has ${q.why.length} entries for ${q.opts.length} options`);
      break;

    case "numeric": {
      // Answer and every mistake must evaluate and stay distinct after rounding
      const sig = q.sig ?? DEFAULT_SIG;
      const answer = tryEval(q.answer, scope, `${path}.answer`, err);
      const seen = new Map();
      if (typeof answer === "number") seen.set(formatSig(answer, sig), "answer");
      (q.mistakes ?? []).forEach((m, i) => {
        const v = tryEval(m.expr, scope, `${path}.mistakes[${i}]`, err);
        if (typeof v !== "number") return;
        const key = formatSig(v, sig);
        // Plausibility: a distractor this far off (prefix mistakes reach about 10^6) is easy to rule out
        if (typeof answer === "number" && answer !== 0 && v !== 0) {
          const ratio = Math.max(Math.abs(answer / v), Math.abs(v / answer));
          if (ratio > MAX_DISTRACTOR_RATIO) warn(`${path}.mistakes[${i}]`, `value ${key} is more than 10^7 times away from the answer`);
        }
        if (seen.get(key) === "answer") err(`${path}.mistakes[${i}]`, `value ${key} is the same as the answer`);
        else if (seen.has(key)) err(`${path}.mistakes[${i}]`, `duplicate mistake value ${key}`);
        else {
          seen.set(key, i);
          // Framework 7.2: a distractor inside the grading tolerance would be marked correct
          if (typeof answer === "number" && answer !== 0) {
            const gap = Math.abs(v - answer) / Math.abs(answer);
            if (withinTolerance(v, answer, q.sig)) err(`${path}.mistakes[${i}]`, `value ${key} is within the grading tolerance of the answer`);
            else if (gap < MIN_DISTRACTOR_GAP) warn(`${path}.mistakes[${i}]`, `value ${key} is only ${(gap * 100).toFixed(1)}% from the answer`);
          }
        }
      });
      break;
    }

    case "order": {
      if (q.shown) {
        const sorted = [...q.shown].sort((a, b) => a - b);
        if (sorted.length !== q.items.length || sorted.some((v, i) => v !== i)) {
          err(path, `shown must be a permutation of 0..${q.items.length - 1}`);
        }
      }
      break;
    }

    case "sim":
      checkSim(q, path, err);
      break;

    case "method":
      checkQuestion(q.then, `${path}.then`, err, warn);
      break;
  }

  if (q.fig) checkFig(q.fig, scope, `${path}.fig`, err, warn);
}

// Probe the sim over the slider grid: output must stay finite, pass must be reachable.
// Grids up to SIM_MAX_POINTS are checked at every point; larger ones are sampled evenly.
function checkSim(q, path, err) {
  const consts = q.consts ?? {};
  const counts = q.sliders.map((s) => Math.floor((s.max - s.min) / s.step + 1e-9) + 1);
  const total = counts.reduce((a, b) => a * b, 1);
  const perAxis = total <= SIM_MAX_POINTS ? Infinity : Math.max(2, Math.floor(SIM_MAX_POINTS ** (1 / counts.length)));
  const axes = q.sliders.map((s, a) => {
    const n = counts[a];
    const stride = Math.max(1, Math.ceil(n / perAxis));
    const values = [];
    for (let k = 0; k < n; k += stride) values.push(s.min + k * s.step);
    if (values[values.length - 1] !== s.max) values.push(s.max);
    return { name: s.var, values };
  });

  // Validate syntax and variable names once, with sliders at their minimum
  const first = { ...consts, ...Object.fromEntries(axes.map((a) => [a.name, a.values[0]])) };
  for (const v of variables(q.output.expr)) if (!Object.hasOwn(first, v)) return err(`${path}.output`, `unknown variable: ${v}`);
  for (const v of variables(q.pass)) if (!Object.hasOwn(first, v)) return err(`${path}.pass`, `unknown variable: ${v}`);

  let passed = false;
  const visit = (i, scope) => {
    if (i < axes.length) {
      for (const v of axes[i].values) if (visit(i + 1, { ...scope, [axes[i].name]: v }) === false) return false;
      return true;
    }
    try {
      evaluate(q.output.expr, scope);
    } catch (e) {
      err(`${path}.output`, `${e.message} at ${JSON.stringify(scope)}`);
      return false;
    }
    let ok;
    try {
      ok = evaluate(q.pass, scope);
    } catch (e) {
      err(`${path}.pass`, `${e.message} at ${JSON.stringify(scope)}`);
      return false;
    }
    if (typeof ok !== "boolean") {
      err(`${path}.pass`, "pass must be a comparison (< > <= >=)");
      return false;
    }
    if (ok) passed = true;
    return true;
  };
  if (visit(0, { ...consts }) && !passed) err(`${path}.pass`, "never passes anywhere in the slider range");
}

// Evaluate a coordinate or value that may be a literal number or an expression
function checkNum(v, scope, path, err) {
  if (typeof v === "string") tryEval(v, scope, path, err);
}

function checkFig(fig, scope, path, err, warn) {
  switch (fig.type) {
    case "plot": {
      const xVar = fig.x.var ?? "x";
      fig.series.forEach((s, i) => {
        const sp = `${path}.series[${i}]`;
        if (s.expr !== undefined) {
          // Unknown names are an error; isolated non-finite samples (poles) are only a warning
          const missing = variables(safe(s.expr) ?? "0").filter((v) => v !== xVar && !Object.hasOwn(scope, v));
          if (missing.length) return err(sp, `unknown variable: ${missing.join(", ")}`);
          if (safe(s.expr) === undefined) return tryEval(s.expr, scope, sp, err);
          let bad = 0;
          for (let k = 0; k < PLOT_SAMPLES; k++) {
            const x = fig.x.min + ((fig.x.max - fig.x.min) * k) / (PLOT_SAMPLES - 1);
            try { evaluate(s.expr, { ...scope, [xVar]: x }); } catch { bad++; }
          }
          if (bad === PLOT_SAMPLES) err(sp, "not a finite number anywhere in the x range");
          else if (bad > 0) warn(sp, `not finite at some of ${PLOT_SAMPLES} samples`);
        }
        (s.points ?? []).forEach((pt, j) => pt.forEach((c) => checkNum(c, scope, `${sp}.points[${j}]`, err)));
      });
      break;
    }
    case "diagram":
      (fig.points ?? []).forEach((p) => p.at.forEach((c) => checkNum(c, scope, `${path}.points[${p.id}]`, err)));
      (fig.arrows ?? []).forEach((a, i) => [...a.from, ...a.to].forEach((c) => checkNum(c, scope, `${path}.arrows[${i}]`, err)));
      (fig.labels ?? []).forEach((l, i) => l.at.forEach((c) => checkNum(c, scope, `${path}.labels[${i}]`, err)));
      break;
    case "circuit":
      for (const e of fig.elements) {
        const pts = e.pins ? Object.values(e.pins) : [e.from, e.to];
        pts.forEach((pt) => pt.forEach((c) => checkNum(c, scope, `${path}.elements[${e.id}]`, err)));
      }
      break;
    case "table":
      fig.rows.forEach((row, i) => row.forEach((cell, j) => {
        if (cell && typeof cell === "object") tryEval(cell.expr, scope, `${path}.rows[${i}][${j}]`, err);
      }));
      break;
  }
}

// Return the expression if it parses, otherwise undefined
function safe(expr) {
  try {
    variables(expr);
    return expr;
  } catch {
    return undefined;
  }
}

/**
 * Minimal shape check for worlds loaded in the browser, where the JSON Schema is not run.
 * Only guards what the engine needs in order not to crash (design spec 5).
 * @returns {string[]}  problems; empty when the world can be loaded
 */
export function assertShape(world) {
  if (!world || typeof world !== "object" || Array.isArray(world)) return ["world is not an object"];
  const problems = [];
  if (typeof world.id !== "string") problems.push("world has no id");
  for (const name of ["schools", "clusters", "skills", "practices", "placement", "bosses", "glossary"]) {
    if (world[name] !== undefined && !Array.isArray(world[name])) problems.push(`${name} is not a list`);
  }
  const each = (name, check) => (Array.isArray(world[name]) ? world[name] : []).forEach((item, i) => {
    const msg = check(item);
    if (msg) problems.push(`${name}[${i}]: ${msg}`);
  });
  each("skills", (s) => (typeof s?.id === "string" ? null : "has no id"));
  each("clusters", (c) => (typeof c?.id !== "string" ? "has no id" : Array.isArray(c.skills) ? null : "has no skills list"));
  each("practices", (p) => (typeof p?.id !== "string" ? "has no id" : typeof p.question?.type === "string" ? null : "has no question"));
  return problems;
}
