// Chinese rendering of check-world issues and import errors for the player (framework 9.2).
// The English originals stay the source of truth: fix requests send them to the AI unchanged.

const PENDING = " (not generated yet?)";

const NOUNS = {
  skill: "技能", practice: "練習關卡", placement: "分級測驗題", boss: "Boss",
  cluster: "技能群", school: "流派", achievement: "成就",
};

// Messages from engine/expr.js, shown inside expression errors
const EXPR = [
  [/^unknown variable: (.+)$/, (m) => `未知的變數 ${m[1]}`],
  [/^variable (\S+) is not a number$/, (m) => `變數 ${m[1]} 不是數字`],
  [/^result is not a finite number: (.+)$/, (m) => `結果不是有限的數值（${m[1]}）`],
  [/^empty expression$/, () => "運算式是空的"],
  [/^expression longer than (\d+) characters$/, (m) => `運算式超過 ${m[1]} 個字元`],
  [/^(unexpected|expected) .*/, (m) => `語法錯誤（${m[0]}）`],
];
const expr = (msg) => translate(EXPR, msg) ?? msg;

// [pattern on the message, Chinese template]; first match wins, so specific patterns come first
const ISSUE_RULES = [
  [/^(.+) \(in (".*")\)$/s, (m) => `運算式 ${m[2]} 有誤：${expr(m[1])}`],
  [/^(.+) at (\{.*\})$/s, (m) => `代入 ${m[2]} 時計算失敗：${expr(m[1])}`],
  [/^duplicate (\w+) id$/, (m) => `${NOUNS[m[1]] ?? m[1]} ID 重複`],
  [/^unknown skill (.+)$/, (m) => `引用了不存在的技能 ${m[1]}`],
  [/^unknown boss (.+)$/, (m) => `引用了不存在的 Boss ${m[1]}`],
  [/^world needs at least one skill$/, () => "世界至少需要一個技能"],
  [/^has no boss$/, () => "沒有指定 Boss"],
  [/^has no final boss$/, () => "沒有指定最終 Boss"],
  [/^placeholder \{\{\.\.\.\}\} used outside a question$/, () => "題目以外的欄位使用了 {{...}} 佔位符"],
  [/^unknown school (\S+) \(primary school must be in this world\)$/, (m) => `主要流派 ${m[1]} 不在本世界`],
  [/^unknown school (\S+)$/, (m) => `引用了不存在的流派 ${m[1]}`],
  [/^unknown cluster (.+)$/, (m) => `引用了不存在的技能群 ${m[1]}`],
  [/^tier (\d+) is lower than its cluster tier (\d+)$/, (m) => `階級 ${m[1]} 低於所屬技能群的階級 ${m[2]}`],
  [/^Lv(\d) has (\d+) practices \(needs (\d+)\); lower maxLevel or add practices$/,
    (m) => `Lv${m[1]} 只有 ${m[2]} 題（需要 ${m[3]} 題）；請下修 maxLevel 或補題`],
  [/^prerequisite cycle: (.+)$/, (m) => `先修關係形成循環：${m[1]}`],
  [/^school (\S+) has no tier (\d+)$/, (m) => `流派 ${m[1]} 沒有階級 ${m[2]}`],
  [/^same answer as the previous step \((.+)\)$/, (m) => `答案與前一步相同（${m[1]}）`],
  [/^core skill needs at least 2 practices \(has (\d+)\)$/, (m) => `核心技能至少需要 2 題練習（目前 ${m[1]} 題）`],
  [/^core skill practices must use different contexts$/, () => "核心技能的練習必須使用不同情境"],
  [/^core skill needs at least 1 practice marked encounter$/, () => "核心技能至少需要 1 題標記為遭遇（encounter）"],
  [/^school (\S+) tier (\d+) has (\d+) questions \(need at least (\d+)\)$/,
    (m) => `流派 ${m[1]} 階級 ${m[2]} 的分級測驗題只有 ${m[3]} 題（至少 ${m[4]} 題）`],
  [/^document content must use source\.license \((.+)\), found (.+)$/, (m) => `文件內容的授權應為 ${m[1]}，實際為 ${m[2]}`],
  [/^supplement content must use license\.default \((.+)\), found (.+)$/, (m) => `補充內容的授權應為 ${m[1]}，實際為 ${m[2]}`],
  [/^concept-based content must use license\.default \((.+)\), found (.+)$/, (m) => `依概念命題的內容授權應為 ${m[1]}，實際為 ${m[2]}`],
  [/^placeholder \{\{(\w+)\}\} has no matching variable$/, (m) => `佔位符 {{${m[1]}}} 沒有對應的變數`],
  [/^answer index (\d+) is outside (\d+) options$/, (m) => `正解索引 ${m[1]} 超出 ${m[2]} 個選項`],
  [/^duplicate option$/, () => "選項重複"],
  [/^why has (\d+) entries for (\d+) options$/, (m) => `錯因說明有 ${m[1]} 筆，但選項有 ${m[2]} 個`],
  [/^value (\S+) is more than 10\^7 times away from the answer$/, (m) => `干擾值 ${m[1]} 與正解相差超過 10^7 倍`],
  [/^value (\S+) is the same as the answer$/, (m) => `干擾值 ${m[1]} 取有效位數後與正解相同`],
  [/^duplicate mistake value (\S+)$/, (m) => `干擾值 ${m[1]} 與另一個干擾值相同`],
  [/^value (\S+) is within the grading tolerance of the answer$/, (m) => `干擾值 ${m[1]} 落在判分容錯內，選它也會被判為答對`],
  [/^value (\S+) is only ([\d.]+)% from the answer$/, (m) => `干擾值 ${m[1]} 與正解只差 ${m[2]}%，不易分辨`],
  [/^shown must be a permutation of 0\.\.(\d+)$/, (m) => `shown 必須是 0 到 ${m[1]} 的排列`],
  [/^unknown variable: (.+)$/, (m) => `未知的變數 ${m[1]}`],
  [/^pass must be a comparison/, () => "pass 必須是比較式（< > <= >=）"],
  [/^never passes anywhere in the slider range$/, () => "滑桿範圍內沒有任何位置能通過"],
  [/^not a finite number anywhere in the x range$/, () => "在 x 範圍內沒有任何有限值"],
  [/^not finite at some of (\d+) samples$/, (m) => `${m[1]} 個取樣點中有部分不是有限值`],
  [/^check failed: (.+)$/s, (m) => `檢查程式出錯：${m[1]}`],
];

const IMPORT_RULES = [
  [/^code block (\d+) is not valid JSON: (.+)$/s, (m) => `第 ${m[1]} 個程式碼區塊不是有效的 JSON（${m[2]}）`],
  [/^input is not valid JSON: (.+)$/s, (m) => `貼上的內容不是有效的 JSON，也沒有程式碼區塊（${m[1]}）`],
  [/^item (\d+) is not a JSON object$/, (m) => `第 ${m[1]} 項不是 JSON 物件`],
  [/^part (\d+) has no world id$/, (m) => `第 ${m[1]} 個片段沒有 world 欄位`],
  [/^item (\d+) is neither a world nor a world part \(kind: (.+)\)$/, (m) => `第 ${m[1]} 項既不是世界檔也不是世界片段（kind: ${m[2]}）`],
  [/^nothing to merge$/, () => "沒有可匯入的內容"],
  [/^part (\S+) belongs to world (\S+), expected (\S+)$/, (m) => `片段 ${m[1]} 屬於世界 ${m[2]}，不是 ${m[3]}`],
  [/^part (\S+) removes from unknown list (\S+)$/, (m) => `片段 ${m[1]} 的 remove 指定了不存在的清單 ${m[2]}`],
  [/^one paste contains parts of several worlds: (.+)$/, (m) => `一次貼上的內容包含多個世界：${m[1]}`],
  [/^world is not an object$/, () => "世界不是 JSON 物件"],
  [/^world has no id$/, () => "世界沒有 id"],
  [/^(\w+) is not a list$/, (m) => `${m[1]} 不是清單`],
  [/^(\w+\[\d+\]): has no id$/, (m) => `${m[1]} 沒有 id`],
  [/^(\w+\[\d+\]): has no skills list$/, (m) => `${m[1]} 沒有 skills 清單`],
  [/^(\w+\[\d+\]): has no question$/, (m) => `${m[1]} 沒有題目`],
];

// Apply the first matching rule; undefined when none matches
function translate(rules, msg) {
  for (const [re, render] of rules) {
    const m = msg.match(re);
    if (m) return render(m);
  }
  return undefined;
}

/**
 * Render one "path: message" issue from checkWorld.
 * @returns {{ path: string, text: string, pending: boolean }}  pending: may only mean "not generated yet"
 */
export function describeIssue(issue) {
  const s = String(issue);
  const i = s.indexOf(": ");
  const path = i < 0 ? "" : s.slice(0, i);
  let msg = i < 0 ? s : s.slice(i + 2);
  const pending = msg.endsWith(PENDING);
  if (pending) msg = msg.slice(0, -PENDING.length);
  const zh = translate(ISSUE_RULES, msg);
  if (zh === undefined) return { path, text: pending ? msg + PENDING : msg, pending };
  return { path, text: pending ? `${zh}（可能尚未生成）` : zh, pending };
}

/** Render an ImportError message; shape problems joined with "；" are translated one by one. */
export function describeImportError(message) {
  return String(message).split("；").map((m) => translate(IMPORT_RULES, m) ?? m).join("；");
}
