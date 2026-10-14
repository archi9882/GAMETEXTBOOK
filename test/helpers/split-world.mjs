// Test helper: split a complete world into head / per-cluster / final parts, the way
// framework 4.6 tells a chat AI to emit them.

const V = "expert-quest/1.0";

export function splitWorld(w) {
  const base = { framework: V, kind: "part", world: w.id };
  const head = {
    ...base, part: "head",
    title: w.title, lang: w.lang, source: w.source, license: w.license, player: w.player, theme: w.theme,
    schools: w.schools, clusters: w.clusters,
  };

  // One part per cluster: its skills, their practices, the cluster boss and matching glossary
  const chapters = w.clusters.map((c) => {
    const ids = new Set(c.skills);
    return {
      ...base, part: c.id,
      skills: w.skills.filter((s) => ids.has(s.id)),
      practices: w.practices.filter((p) => ids.has(p.skill)),
      bosses: w.bosses.filter((b) => b.id === c.boss),
      glossary: w.glossary.filter((g) => ids.has(g.skill)),
      placement: w.placement,
    };
  });

  const clusterBosses = new Set(w.clusters.map((c) => c.boss));
  const final = {
    ...base, part: "final", complete: true,
    bosses: w.bosses.filter((b) => !clusterBosses.has(b.id)),
    achievements: w.achievements, bridges: w.bridges, report: w.report,
  };
  return [head, ...chapters, final];
}
