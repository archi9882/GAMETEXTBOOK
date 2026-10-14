// Persist worlds, progress and the current position in IndexedDB (design spec 4.5).
// Falls back to memory when IndexedDB is unavailable; `persistent` tells the UI which one is active.

const DB_NAME = "expert-quest";
const DB_VERSION = 1;
const STORES = ["worlds", "progress", "meta"];

const request = (req) => new Promise((resolve, reject) => {
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      for (const name of STORES) if (!req.result.objectStoreNames.contains(name)) req.result.createObjectStore(name);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbStore(db) {
  const get = (store, key) => request(db.transaction(store).objectStore(store).get(key));
  const put = (store, key, value) => request(db.transaction(store, "readwrite").objectStore(store).put(value, key));
  const del = (store, key) => request(db.transaction(store, "readwrite").objectStore(store).delete(key));
  const getAll = (store) => request(db.transaction(store).objectStore(store).getAll());
  return {
    persistent: true,
    getWorld: (id) => get("worlds", id),
    putWorld: (rec) => put("worlds", rec.id, rec),
    listWorlds: () => getAll("worlds"),
    // Forget the last position too when it points at the deleted world
    deleteWorld: async (id) => {
      await del("worlds", id);
      const meta = await get("meta", "current");
      if (meta?.world === id) await del("meta", "current");
    },
    getProgress: () => get("progress", "global"),
    putProgress: (progress) => put("progress", "global", progress),
    getMeta: () => get("meta", "current"),
    putMeta: (meta) => put("meta", "current", meta),
    // Small app settings (last backup time, ...) live next to the position in the meta store
    getSetting: (key) => get("meta", `setting:${key}`),
    putSetting: (key, value) => put("meta", `setting:${key}`, value),
  };
}

/** In-memory store with the same interface; used when IndexedDB is unavailable and in tests. */
export function createMemoryStore() {
  const data = new Map();
  const get = async (key) => structuredClone(data.get(key));
  const put = async (key, value) => { data.set(key, structuredClone(value)); };
  return {
    persistent: false,
    getWorld: (id) => get(`world:${id}`),
    putWorld: (rec) => put(`world:${rec.id}`, rec),
    listWorlds: async () => [...data.entries()].filter(([k]) => k.startsWith("world:")).map(([, v]) => structuredClone(v)),
    deleteWorld: async (id) => {
      data.delete(`world:${id}`);
      if (data.get("meta")?.world === id) data.delete("meta");
    },
    getProgress: () => get("progress"),
    putProgress: (progress) => put("progress", progress),
    getMeta: () => get("meta"),
    putMeta: (meta) => put("meta", meta),
    getSetting: (key) => get(`setting:${key}`),
    putSetting: (key, value) => put(`setting:${key}`, value),
  };
}

/** Open the store; never throws. */
export async function openStore() {
  try {
    if (!globalThis.indexedDB) throw new Error("IndexedDB is not available");
    return idbStore(await openDb());
  } catch (e) {
    console.warn("Progress will not be saved:", e);
    return createMemoryStore();
  }
}
