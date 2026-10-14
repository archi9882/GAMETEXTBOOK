// Tests for the starting prompt from framework chapter 12 (design spec 4.2).
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPrompt } from "../app/prompt.js";

test("buildPrompt fills background and goal", () => {
  const p = buildPrompt({ background: "土木系大三", goal: "看懂水文統計報告" });
  assert.equal(p, "請依照「專家養成記框架」，把這份文件做成學習世界，並依 4.6 以世界片段輸出。我的背景是土木系大三，我想做到看懂水文統計報告。");
});

test("buildPrompt drops a trailing full stop the player typed", () => {
  assert.match(buildPrompt({ background: "高中生。", goal: "考上大學。" }), /高中生，我想做到考上大學。$/);
});

test("buildPrompt appends the scope on its own line", () => {
  const p = buildPrompt({ background: "a", goal: "b", scope: "  只處理第 2 章 " });
  assert.ok(p.endsWith("\n只處理第 2 章"));
});

test("buildPrompt keeps blanks visible when fields are empty", () => {
  assert.match(buildPrompt({ background: "", goal: " " }), /背景是＿＿＿，我想做到＿＿＿。/);
});
