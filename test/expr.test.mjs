// Tests for the expression evaluator (framework 7.2).
import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluate, variables, ExprError, withinTolerance, formatSig } from "../engine/expr.js";

// Helper: compare floats with a tight relative tolerance
const close = (a, b) => assert.ok(Math.abs(a - b) <= 1e-12 * Math.max(1, Math.abs(b)), `${a} != ${b}`);

test("evaluates numbers, including decimals and scientific notation", () => {
  assert.equal(evaluate("42"), 42);
  assert.equal(evaluate("0.5"), 0.5);
  assert.equal(evaluate(".25"), 0.25);
  assert.equal(evaluate("1.5e3"), 1500);
  assert.equal(evaluate("2E-2"), 0.02);
});

test("respects operator precedence and parentheses", () => {
  assert.equal(evaluate("1 + 2 * 3"), 7);
  assert.equal(evaluate("(1 + 2) * 3"), 9);
  assert.equal(evaluate("10 - 4 - 3"), 3);
  assert.equal(evaluate("12 / 3 / 2"), 2);
});

test("power is right-associative and binds tighter than unary minus", () => {
  assert.equal(evaluate("2 ^ 3 ^ 2"), 512);
  assert.equal(evaluate("-2 ^ 2"), -4);
  assert.equal(evaluate("(-2) ^ 2"), 4);
  assert.equal(evaluate("2 ^ -1"), 0.5);
});

test("supports unary plus and minus", () => {
  assert.equal(evaluate("-3 + +5"), 2);
  assert.equal(evaluate("--4"), 4);
  assert.equal(evaluate("2 * -3"), -6);
});

test("substitutes variables", () => {
  assert.equal(evaluate("V / I", { V: 110, I: 5 }), 22);
  assert.equal(evaluate("x_1 + x2", { x_1: 1, x2: 2 }), 3);
});

test("supports all whitelisted functions and pi", () => {
  close(evaluate("sqrt(16)"), 4);
  close(evaluate("exp(0)"), 1);
  close(evaluate("ln(exp(2))"), 2);
  close(evaluate("log10(1000)"), 3);
  close(evaluate("sin(pi / 2)"), 1);
  close(evaluate("cos(0)"), 1);
  close(evaluate("tan(pi / 4)"), 1);
  close(evaluate("asin(1)"), Math.PI / 2);
  close(evaluate("acos(1)"), 0);
  close(evaluate("atan(1)"), Math.PI / 4);
  assert.equal(evaluate("abs(-3)"), 3);
  close(evaluate("pi"), Math.PI);
});

test("evaluates the framework examples", () => {
  close(evaluate("m / M / V", { m: 11.7, M: 58.44, V: 0.5 }), 11.7 / 58.44 / 0.5);
  close(evaluate("v^2 * sin(2 * th * pi / 180) / g", { v: 20, th: 45, g: 9.8 }), 400 / 9.8);
});

test("a single top-level comparison returns a boolean", () => {
  assert.equal(evaluate("abs(R - Rth) < 0.6", { R: 8.5, Rth: 8 }), true);
  assert.equal(evaluate("abs(R - Rth) < 0.6", { R: 9, Rth: 8 }), false);
  assert.equal(evaluate("2 <= 2"), true);
  assert.equal(evaluate("3 > 4"), false);
  assert.equal(evaluate("4 >= 3"), true);
});

test("rejects chained or nested comparisons", () => {
  assert.throws(() => evaluate("1 < 2 < 3"), ExprError);
  assert.throws(() => evaluate("(1 < 2) + 1"), ExprError);
  assert.throws(() => evaluate("abs(1 < 2)"), ExprError);
});

test("rejects unknown variables, including prototype keys", () => {
  assert.throws(() => evaluate("x + 1"), ExprError);
  assert.throws(() => evaluate("constructor"), ExprError);
  assert.throws(() => evaluate("toString", {}), ExprError);
  assert.throws(() => evaluate("__proto__", {}), ExprError);
});

test("rejects functions outside the whitelist", () => {
  assert.throws(() => evaluate("max(1, 2)"), ExprError);
  assert.throws(() => evaluate("alert(1)"), ExprError);
  assert.throws(() => evaluate("log(10)"), ExprError);
});

test("does not let a variable shadow a function or pi", () => {
  assert.throws(() => evaluate("sqrt", { sqrt: 1 }), ExprError);
  assert.equal(evaluate("pi", { pi: 3 }), Math.PI);
});

test("rejects syntax outside the grammar", () => {
  for (const bad of ["", "   ", "1 +", "(1 + 2", "1 + 2)", "2x", "2 (3)", "1 ** 2", "a.b", "x[0]",
                     "'a'", "1; 2", "1 = 1", "1 == 1", "sin 1", "sin()", "sqrt(1, 2)", "1..2", "1e", "x => x"]) {
    assert.throws(() => evaluate(bad, { x: 1, a: 1 }), ExprError, `should reject: ${JSON.stringify(bad)}`);
  }
});

test("rejects non-string input and overly long expressions", () => {
  assert.throws(() => evaluate(42), ExprError);
  assert.throws(() => evaluate("1+".repeat(600) + "1"), ExprError);
});

test("rejects non-number variable values", () => {
  assert.throws(() => evaluate("x", { x: "1" }), ExprError);
  assert.throws(() => evaluate("x", { x: NaN }), ExprError);
});

test("throws on a non-finite numeric result", () => {
  assert.throws(() => evaluate("1 / 0"), ExprError);
  assert.throws(() => evaluate("sqrt(-1)"), ExprError);
  assert.throws(() => evaluate("ln(0)"), ExprError);
});

test("variables() lists the variable names an expression uses", () => {
  assert.deepEqual(variables("V^2 * R / (Rth + R)^2 + pi").sort(), ["R", "Rth", "V"]);
  assert.deepEqual(variables("sqrt(2)"), []);
  assert.throws(() => variables("1 +"), ExprError);
});

test("formatSig rounds to significant figures", () => {
  assert.equal(formatSig(0.400342, 3), 0.4);
  assert.equal(formatSig(40.8163, 3), 40.8);
  assert.equal(formatSig(123456, 2), 120000);
});

test("withinTolerance uses half a unit in the last significant figure", () => {
  // sig 3 -> relative tolerance 0.5 %
  assert.equal(withinTolerance(40.9, 40.8163, 3), true);
  assert.equal(withinTolerance(41.1, 40.8163, 3), false);
  // sig 2 -> relative tolerance 5 %
  assert.equal(withinTolerance(1.55, 1.5, 2), true);
  assert.equal(withinTolerance(1.6, 1.5, 2), false);
});

test("withinTolerance defaults to 1 % relative error without sig", () => {
  assert.equal(withinTolerance(100.9, 100), true);
  assert.equal(withinTolerance(101.1, 100), false);
});

test("withinTolerance requires an exact match when the expected value is 0", () => {
  assert.equal(withinTolerance(0, 0, 3), true);
  assert.equal(withinTolerance(1e-9, 0, 3), false);
});
