// Build the fix request a player pastes back to the chat AI (framework 4.6, 9.3; design spec 4.1).
// Messages stay in English so the AI can match them exactly; the screen shows them in Chinese.
// Items the teacher flagged on the review page are added with the teacher's own note.
import { openFlags } from "./review.js";

const PENDING = "(not generated yet?)";

/** Number for the next fix part: one more than the highest fix-N imported so far. */
export function nextFixNumber(rec) {
  let max = 0;
  for (const r of rec.imports ?? []) {
    const m = /^fix-(\d+)$/.exec(r.part ?? "");
    if (m) max = Math.max(max, Number(m[1]));
  }
  return max + 1;
}

/**
 * @param {object} rec  stored world record with issues
 * @returns {string | null}  text to copy, or null when there is nothing the AI should fix
 */
export function buildFixRequest(rec) {
  const errors = rec.issues?.errors ?? [];
  // "Not generated yet" only means later parts are still coming, so the AI should not act on it
  const warnings = (rec.issues?.warnings ?? []).filter((w) => !w.endsWith(PENDING));
  const flags = openFlags(rec.review);
  if (errors.length === 0 && warnings.length === 0 && flags.length === 0) return null;

  const lines = [
    `請依「專家養成記框架」4.6，輸出修正片段 fix-${nextFixNumber(rec)}（world: ${rec.id}）。`,
    "只含修正過的項目（完整項目），沿用原本的 ID；要刪除的項目寫在 remove。",
  ];
  if (errors.length) lines.push("", "錯誤：", ...errors.map((e) => `- ${e}`));
  if (warnings.length) lines.push("", "提醒：", ...warnings.map((w) => `- ${w}`));
  if (flags.length) lines.push("", "使用者審閱時標記有誤（請依說明修正，並確認正解與干擾選項）：", ...flags.map((f) => `- ${f.key}: ${f.note || "（未填說明）"}`));
  return lines.join("\n");
}
