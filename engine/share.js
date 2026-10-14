// Class (share) version of a world: framework 7.4 filtering rules, run by the game, never by the AI.
// Content under a reserved or unknown license is removed; structure, pointers into the source
// (sections, pages, example numbers, figure numbers) and openly licensed, concept-based or supplement content stay.

export const RESTRICTED = new Set(["LicenseRef-All-Rights-Reserved", "NOASSERTION"]);
const TEXT_FIELDS = ["analog", "analogLimit", "story"];

const restricted = (license) => RESTRICTED.has(license);
const isNC = (license) => /(^|-)NC(-|$)/.test(String(license ?? ""));

// Text fields may be plain strings (item license) or objects with their own license (framework 8.1)
const textLicense = (value, itemLicense) => (value && typeof value === "object" ? value.license : itemLicense);

function pointer(item, world) {
  const loc = item.attribution?.loc;
  const pages = item.pages ? `第 ${item.pages[0]}–${item.pages[1]} 頁` : null;
  const where = [item.num ? `§${item.num}` : null, pages ?? loc].filter(Boolean).join("，");
  return `（內容見原書${world.source?.title ? `《${world.source.title}》` : ""}${where ? `，${where}` : ""}）`;
}

function shareSkill(s, world, removed) {
  const out = { ...s };
  if (restricted(s.license)) {
    out.def = pointer(s, world);
    removed.fields++;
  }
  for (const f of TEXT_FIELDS) {
    if (out[f] !== undefined && restricted(textLicense(out[f], s.license))) {
      delete out[f];
      removed.fields++;
    }
  }
  if (out.figs) {
    // Figure data rewritten from the document follows the skill's license; ref figures keep only their address
    out.figs = restricted(s.license)
      ? out.figs.filter((f) => f.type === "ref").map((f) => ({ type: "ref", desc: `見原書${f.page ? `第 ${f.page} 頁` : ""}${f.figure ? ` ${f.figure}` : ""}`, ...(f.page !== undefined ? { page: f.page } : {}), ...(f.figure ? { figure: f.figure } : {}) }))
      : out.figs;
    if (out.figs.length === 0) delete out.figs;
  }
  return out;
}

function credit(credits, item, world) {
  const a = item.attribution ?? {};
  // Concept-based content still owes its ideas to the document, so it is credited to it too
  const name = a.name ?? (item.origin === "document" || item.origin === "concept-based" ? world.source?.title : null);
  if (!name) return;
  const key = `${name}|${a.url ?? ""}|${item.license}`;
  if (!credits.has(key)) credits.set(key, { name, ...(a.url ? { url: a.url } : {}), license: item.license, origin: item.origin });
}

/**
 * @param {object} world  merged world
 * @param {string} now  ISO time of the export
 * @returns {{ world: object, removed: { practices, placement, bosses, glossary, bridges, fields }, kept: number, credits: object[], nonCommercial: boolean }}
 */
export function buildShareWorld(world, now) {
  const removed = { practices: 0, placement: 0, bosses: 0, glossary: 0, bridges: 0, fields: 0 };
  const credits = new Map();
  const keepList = (list = [], name) => list.filter((item) => {
    if (restricted(item.license)) { removed[name]++; return false; }
    credit(credits, item, world);
    return true;
  });

  const skills = (world.skills ?? []).map((s) => {
    if (!restricted(s.license)) credit(credits, s, world);
    return shareSkill(s, world, removed);
  });
  const practices = keepList(world.practices, "practices");
  const placement = keepList(world.placement, "placement");
  const bosses = keepList(world.bosses, "bosses");
  const bridges = keepList(world.bridges, "bridges");
  const glossary = (world.glossary ?? []).map((g) => {
    if (!restricted(g.license)) { credit(credits, g, world); return g; }
    removed.glossary++;
    return { ...g, def: `（解釋見原書${g.attribution?.loc ? `，${g.attribution.loc}` : ""}）` };
  });

  // Structure that pointed at a removed boss loses the reference, so nothing dangles
  const bossIds = new Set(bosses.map((b) => b.id));
  const dropBoss = (obj, key) => {
    if (obj[key] !== undefined && !bossIds.has(obj[key])) { const o = { ...obj }; delete o[key]; return o; }
    return obj;
  };
  const schools = (world.schools ?? []).map((s) => dropBoss({ ...s, tiers: s.tiers.map((t) => dropBoss(t, "boss")) }, "finalBoss"));
  const clusters = (world.clusters ?? []).map((c) => dropBoss(c, "boss"));
  const achievements = (world.achievements ?? []).filter((a) => a.when?.boss === undefined || bossIds.has(a.when.boss));

  const licenses = [...skills, ...practices, ...placement, ...bosses, ...bridges, ...glossary]
    .filter((x) => !restricted(x.license)).map((x) => x.license);
  licenses.push(world.license?.default);
  const nonCommercial = licenses.some(isNC) || (world.sources ?? []).some((s) => isNC(s.license));
  const creditList = [...credits.values()];
  for (const s of world.sources ?? []) {
    if (!creditList.some((c) => c.url === s.url)) creditList.push({ name: s.name, url: s.url, license: s.license, origin: "expansion" });
  }

  const shared = {
    framework: world.framework, id: world.id, title: world.title, lang: world.lang,
    source: world.source, license: world.license,
    ...(world.theme ? { theme: world.theme } : {}),
    schools, clusters, skills, practices, placement, bosses, achievements, glossary,
    ...(bridges.length ? { bridges } : {}),
    ...(world.sources ? { sources: world.sources } : {}),
    report: {},
    share: { kind: "class", exportedAt: now, credits: creditList, nonCommercial, removed },
  };
  return { world: shared, removed, kept: practices.length, credits: creditList, nonCommercial };
}

/** True when a world file is a class version (students see the game, not the workbench). */
export const isClassWorld = (world) => world?.share?.kind === "class";

/** File name for the class version, e.g. my-world-class.json */
export const shareFileName = (world) => `${world.id}-class.json`;
