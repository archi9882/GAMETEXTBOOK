// Experience and skill levels (framework 3.3; design spec 4.3).
// Progress is keyed by skill id so one skill shares one record across worlds (framework 3.5).
// Every function is pure: it returns new objects and never mutates its input.

const REPEAT_FACTOR = 0.2;

/** Experience for the first correct answer to a practice of the given level. */
export const xpFor = (level) => 10 * 2 ** (level - 1);

export function emptyProgress() {
  return { version: 1, skills: {} };
}

/**
 * Record a correct answer.
 * @param {object} progress
 * @param {{ id: string, skill: string, level: number }} practice
 * @param {number} [factor]  1, or 0.5 when a method question used a weaker method
 * @returns {{ progress: object, xp: number, first: boolean }}
 */
export function recordCorrect(progress, practice, factor = 1) {
  const rec = progress.skills[practice.skill] ?? { solved: {}, xp: 0 };
  const count = rec.solved[practice.id] ?? 0;
  const first = count === 0;
  const xp = Math.round(xpFor(practice.level) * (first ? 1 : REPEAT_FACTOR) * factor);
  const skills = { ...progress.skills, [practice.skill]: { solved: { ...rec.solved, [practice.id]: count + 1 }, xp: rec.xp + xp } };
  return { progress: { ...progress, skills }, xp, first };
}

export function totalXp(progress) {
  return Object.values(progress.skills).reduce((sum, rec) => sum + rec.xp, 0);
}

export function isSolved(progress, practice) {
  return (progress.skills[practice.skill]?.solved[practice.id] ?? 0) > 0;
}

// Level reached, and whether progress is stuck because the next level lacks practices
function evaluateLevel(progress, skill, world) {
  const own = world.practices.filter((p) => p.skill === skill.id);
  const solved = own.filter((p) => isSolved(progress, p));
  let level = solved.length > 0 ? 1 : 0;
  let stuck = own.length === 0;
  for (let L = 2; L <= skill.maxLevel && level === L - 1; L++) {
    const need = L === 5 ? 1 : 2;
    if (own.filter((p) => p.level === L).length < need) {
      stuck = true;
      break;
    }
    if (solved.filter((p) => p.level === L).length >= need) level = L;
  }
  return { level: Math.min(level, skill.maxLevel), stuck };
}

export function skillLevel(progress, skill, world) {
  return evaluateLevel(progress, skill, world).level;
}

/** True when the skill cannot reach its maxLevel with the practices that exist. */
export function isExpandable(progress, skill, world) {
  const { level, stuck } = evaluateLevel(progress, skill, world);
  return stuck && level < skill.maxLevel;
}

/** "lit" (Lv1+), "ready" (every in-world prerequisite lit) or "blocked". */
export function lampState(progress, skill, world) {
  if (skillLevel(progress, skill, world) >= 1) return "lit";
  const inWorld = new Map(world.skills.map((s) => [s.id, s]));
  const ready = (skill.pre ?? []).every((id) => !inWorld.has(id) || skillLevel(progress, inWorld.get(id), world) >= 1);
  return ready ? "ready" : "blocked";
}

/** Ids of skills that are ready to learn, in world order. */
export function learnableSkills(progress, world) {
  return world.skills.filter((s) => lampState(progress, s, world) === "ready").map((s) => s.id);
}
