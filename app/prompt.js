// Starting prompt for a chat AI, from framework chapter 12 (design spec 4.2).

const BLANK = "＿＿＿";

// Trim the field and drop a trailing full stop so the sentence reads naturally
const clean = (s) => String(s ?? "").trim().replace(/[。．.]+$/, "");

/**
 * @param {{ background: string, goal: string, scope?: string }} form
 * @returns {string}
 */
export function buildPrompt({ background, goal, scope }) {
  const b = clean(background) || BLANK;
  const g = clean(goal) || BLANK;
  let text = `請依照「專家養成記框架」，把這份文件做成學習世界，並依 4.6 以世界片段輸出。我的背景是${b}，我想做到${g}。`;
  const s = String(scope ?? "").trim();
  if (s) text += `\n${s}`;
  return text;
}
