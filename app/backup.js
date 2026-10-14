// Full backup export and restore (framework 9.12; M1 design 3.2).
// Pure functions: app.js reads and writes the store and shows the preview.
import { mergeParts } from "../engine/merge.js";
import { recheck } from "./workbench.js";

export const BACKUP_KIND = "expert-quest-backup";
export const BACKUP_VERSION = 1;
export const REMIND_DAYS = 14;

export class BackupError extends Error {}

/**
 * @param {{ worlds: object[], progress: object }} data  every stored world record and the global progress
 * @param {string} now  ISO time
 */
export function buildBackup({ worlds, progress }, now) {
  return {
    kind: BACKUP_KIND, version: BACKUP_VERSION, exportedAt: now,
    notice: "含有文件內容，僅限個人使用。要發給他人請匯出班級版。",
    worlds, progress,
  };
}

/** File name such as expert-quest-backup-2026-10-12.json */
export const backupFileName = (now) => `${BACKUP_KIND}-${now.slice(0, 10)}.json`;

/**
 * Parse and sanity-check a backup file.
 * @throws {BackupError}
 */
export function parseBackup(text) {
  let doc;
  try { doc = JSON.parse(text); } catch { throw new BackupError("這不是有效的 JSON 檔案。"); }
  if (doc?.kind !== BACKUP_KIND) throw new BackupError("這不是專家養成記的備份檔。世界檔或片段請用「匯入」。");
  if (doc.version > BACKUP_VERSION) throw new BackupError("這個備份檔來自較新版本的遊戲，請先更新。");
  if (!Array.isArray(doc.worlds)) throw new BackupError("備份檔缺少世界清單。");
  for (const rec of doc.worlds) {
    if (typeof rec?.id !== "string" || !rec.world) throw new BackupError("備份檔中有損壞的世界紀錄。");
  }
  return doc;
}

/**
 * What a restore would do to each world in the backup.
 * @returns {{ id, title, action: "add" | "conflict", newer: "backup" | "current" | "same", backup, current }[]}
 */
export function planRestore(currentWorlds, backup) {
  const byId = new Map(currentWorlds.map((r) => [r.id, r]));
  return backup.worlds.map((rec) => {
    const cur = byId.get(rec.id);
    const title = rec.world?.title ?? rec.id;
    if (!cur) return { id: rec.id, title, action: "add", newer: "backup", backup: rec, current: null };
    const a = String(rec.importedAt ?? ""), b = String(cur.importedAt ?? "");
    return { id: rec.id, title, action: "conflict", newer: a > b ? "backup" : a < b ? "current" : "same", backup: rec, current: cur };
  });
}

/**
 * Merge two progress records without losing anything: per practice the higher solve count,
 * per skill the higher experience.
 */
export function mergeProgress(a, b) {
  const skills = { ...(a?.skills ?? {}) };
  for (const [id, rec] of Object.entries(b?.skills ?? {})) {
    const cur = skills[id];
    if (!cur) { skills[id] = rec; continue; }
    const solved = { ...cur.solved };
    for (const [pid, n] of Object.entries(rec.solved ?? {})) solved[pid] = Math.max(solved[pid] ?? 0, n);
    skills[id] = { ...cur, solved, xp: Math.max(cur.xp ?? 0, rec.xp ?? 0) };
  }
  return { version: a?.version ?? b?.version ?? 1, skills };
}

/**
 * Prepare a backed-up world record for storing: rebuild the merged world from its parts when
 * possible and re-run the checks, so the record matches the current game version.
 */
export function restoreRecord(rec) {
  let next = rec;
  if (Array.isArray(rec.parts) && rec.parts.length) {
    try {
      const { world, complete } = mergeParts(rec.parts);
      next = { ...rec, world, complete };
    } catch { /* keep the stored world */ }
  }
  return recheck(next);
}

/** Days since the last backup, or null when there has never been one. */
export function daysSince(iso, now) {
  if (!iso) return null;
  return Math.floor((Date.parse(now) - Date.parse(iso)) / 86400000);
}
