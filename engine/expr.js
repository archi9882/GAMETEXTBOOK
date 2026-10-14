// Safe expression evaluator for numeric questions, sim outputs and figure data.
// Grammar and allowed operations: framework 7.2. Never uses eval or Function.
//
//   top     := sum ( cmp sum )?          cmp: < > <= >=  (only at the top level, for `pass`)
//   sum     := term ( (+|-) term )*
//   term    := unary ( (*|/) unary )*
//   unary   := (+|-) unary | power
//   power   := primary ( ^ unary )?      right-associative; -2^2 = -4
//   primary := number | pi | name | func ( sum ) | ( sum )

const MAX_LENGTH = 1000;

// Whitelisted functions; trig functions work in radians
const FUNCS = Object.freeze({
  sqrt: Math.sqrt, exp: Math.exp, ln: Math.log, log10: Math.log10,
  sin: Math.sin, cos: Math.cos, tan: Math.tan,
  asin: Math.asin, acos: Math.acos, atan: Math.atan,
  abs: Math.abs,
});

const CMP = new Set(["<", ">", "<=", ">="]);

export class ExprError extends Error {
  constructor(message) {
    super(message);
    this.name = "ExprError";
  }
}

// Split the source into number, name, operator and parenthesis tokens
function tokenize(src) {
  const tokens = [];
  const re = /\s*(?:(\d+\.?\d*(?:[eE][+-]?\d+)?|\.\d+(?:[eE][+-]?\d+)?)|([A-Za-z_][A-Za-z0-9_]*)|(<=|>=|[-+*/^()<>]))/y;
  let pos = 0;
  while (pos < src.length) {
    // Trailing whitespace ends the input
    if (/^\s*$/.test(src.slice(pos))) break;
    re.lastIndex = pos;
    const m = re.exec(src);
    if (!m) throw new ExprError(`unexpected character at ${pos}: ${JSON.stringify(src[pos])}`);
    if (m[1] !== undefined) tokens.push({ kind: "num", value: Number(m[1]) });
    else if (m[2] !== undefined) tokens.push({ kind: "name", value: m[2] });
    else tokens.push({ kind: "op", value: m[3] });
    pos = re.lastIndex;
  }
  return tokens;
}

// Recursive-descent parser producing a small AST
function parse(src) {
  if (typeof src !== "string") throw new ExprError("expression must be a string");
  if (src.length > MAX_LENGTH) throw new ExprError(`expression longer than ${MAX_LENGTH} characters`);
  const tokens = tokenize(src);
  if (tokens.length === 0) throw new ExprError("empty expression");
  let i = 0;

  const peek = () => tokens[i];
  const isOp = (v) => peek()?.kind === "op" && peek().value === v;
  const expect = (v) => {
    if (!isOp(v)) throw new ExprError(`expected ${JSON.stringify(v)}`);
    i++;
  };

  function top() {
    const left = sum();
    if (peek()?.kind === "op" && CMP.has(peek().value)) {
      const op = tokens[i++].value;
      return { type: "cmp", op, left, right: sum() };
    }
    return left;
  }

  function sum() {
    let node = term();
    while (isOp("+") || isOp("-")) {
      const op = tokens[i++].value;
      node = { type: "bin", op, left: node, right: term() };
    }
    return node;
  }

  function term() {
    let node = unary();
    while (isOp("*") || isOp("/")) {
      const op = tokens[i++].value;
      node = { type: "bin", op, left: node, right: unary() };
    }
    return node;
  }

  function unary() {
    if (isOp("+") || isOp("-")) {
      const op = tokens[i++].value;
      return { type: "neg", negate: op === "-", arg: unary() };
    }
    return power();
  }

  function power() {
    const base = primary();
    if (isOp("^")) {
      i++;
      return { type: "bin", op: "^", left: base, right: unary() };
    }
    return base;
  }

  function primary() {
    const t = peek();
    if (!t) throw new ExprError("unexpected end of expression");
    if (t.kind === "num") {
      i++;
      return { type: "num", value: t.value };
    }
    if (t.kind === "name") {
      i++;
      if (Object.hasOwn(FUNCS, t.value)) {
        // A function name must be followed by exactly one parenthesized argument
        expect("(");
        const arg = sum();
        expect(")");
        return { type: "call", name: t.value, arg };
      }
      if (t.value === "pi") return { type: "num", value: Math.PI };
      return { type: "var", name: t.value };
    }
    if (isOp("(")) {
      i++;
      const inner = sum();
      expect(")");
      return inner;
    }
    throw new ExprError(`unexpected token ${JSON.stringify(t.value)}`);
  }

  const ast = top();
  if (i < tokens.length) throw new ExprError(`unexpected token ${JSON.stringify(tokens[i].value)}`);
  return ast;
}

// Walk the AST and compute its value
function run(node, vars) {
  switch (node.type) {
    case "num":
      return node.value;
    case "var": {
      // Only own properties count, so prototype keys like "constructor" never resolve
      if (!Object.hasOwn(vars, node.name)) throw new ExprError(`unknown variable: ${node.name}`);
      const v = vars[node.name];
      if (typeof v !== "number" || Number.isNaN(v)) throw new ExprError(`variable ${node.name} is not a number`);
      return v;
    }
    case "neg": {
      const v = run(node.arg, vars);
      return node.negate ? -v : v;
    }
    case "call":
      return FUNCS[node.name](run(node.arg, vars));
    case "bin": {
      const a = run(node.left, vars);
      const b = run(node.right, vars);
      switch (node.op) {
        case "+": return a + b;
        case "-": return a - b;
        case "*": return a * b;
        case "/": return a / b;
        case "^": return a ** b;
      }
      break;
    }
    case "cmp": {
      const a = run(node.left, vars);
      const b = run(node.right, vars);
      switch (node.op) {
        case "<": return a < b;
        case ">": return a > b;
        case "<=": return a <= b;
        case ">=": return a >= b;
      }
      break;
    }
  }
  throw new ExprError(`internal: unknown node ${node.type}`);
}

/**
 * Evaluate an expression.
 * @param {string} expr  expression in the framework 7.2 grammar
 * @param {Record<string, number>} [vars]  variable values
 * @returns {number|boolean}  a finite number, or a boolean for a top-level comparison
 */
export function evaluate(expr, vars = {}) {
  const result = run(parse(expr), vars);
  if (typeof result === "number" && !Number.isFinite(result)) {
    throw new ExprError(`result is not a finite number: ${expr}`);
  }
  return result;
}

/**
 * List the variable names an expression uses (pi and function names excluded).
 * @param {string} expr
 * @returns {string[]}
 */
export function variables(expr) {
  const names = new Set();
  const walk = (n) => {
    if (n.type === "var") names.add(n.name);
    for (const k of ["arg", "left", "right"]) if (n[k]) walk(n[k]);
  };
  walk(parse(expr));
  return [...names];
}

/**
 * Round to a number of significant figures, for display and for comparing options.
 * @param {number} x
 * @param {number} sig
 */
export function formatSig(x, sig) {
  return Number(x.toPrecision(sig));
}

/**
 * Check a player's numeric answer (framework 8.5).
 * With `sig`, the relative tolerance is half a unit in the last significant figure (5 * 10^-sig);
 * without it, 1 %. An expected value of 0 needs an exact match.
 * @param {number} actual
 * @param {number} expected
 * @param {number} [sig]
 */
export function withinTolerance(actual, expected, sig) {
  if (expected === 0) return actual === 0;
  const rel = sig ? 5 * 10 ** -sig : 0.01;
  return Math.abs(actual - expected) <= rel * Math.abs(expected);
}
