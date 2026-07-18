/**
 * Per-item voice recordings.
 *
 * Blobs live in IndexedDB, not localStorage: a handful of short clips already
 * exceed the ~5MB localStorage cap once base64-encoded, and IndexedDB stores the
 * Blob directly with a far larger quota. Recordings are keyed by item id, so
 * they are device-local — they do not travel in the JSON export. Record on the
 * tablet you actually fly with.
 *
 * Key format: `clip:<itemId>:<field>` where field is 'challenge' | 'response'.
 */

const AudioStore = (() => {
  const DB = 'sc-audio';
  const STORE = 'clips';
  let dbp = null;

  function open() {
    if (dbp) return dbp;
    dbp = new Promise((resolve, reject) => {
      if (!window.indexedDB) return reject(new Error('no-indexeddb'));
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbp;
  }

  function tx(mode, run) {
    return open().then(
      (db) =>
        new Promise((resolve, reject) => {
          const t = db.transaction(STORE, mode);
          const req = run(t.objectStore(STORE));
          t.oncomplete = () => resolve(req ? req.result : undefined);
          t.onerror = () => reject(t.error);
          t.onabort = () => reject(t.error);
        })
    );
  }

  function key(itemId, field) {
    return `clip:${itemId}:${field}`;
  }

  const put = (k, blob) => tx('readwrite', (s) => s.put(blob, k));
  const get = (k) => tx('readonly', (s) => s.get(k)).catch(() => null);
  const del = (k) => tx('readwrite', (s) => s.delete(k));

  async function has(k) {
    try {
      const found = await tx('readonly', (s) => (s.getKey ? s.getKey(k) : s.get(k)));
      return found !== undefined && found !== null;
    } catch (_) {
      return false;
    }
  }

  /** Drop both clips belonging to an item — call when the item is deleted. */
  function delItem(itemId) {
    return Promise.all([del(key(itemId, 'challenge')), del(key(itemId, 'response'))]).catch(() => {});
  }

  return { key, put, get, del, has, delItem };
})();
