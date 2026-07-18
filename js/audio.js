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
    // Recordings are the one thing here the user cannot regenerate from the CSV,
    // so ask the browser not to evict them under storage pressure.
    if (navigator.storage && navigator.storage.persist) {
      navigator.storage.persist().catch(() => {});
    }
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

  /** Last read/write failure, surfaced in Settings — silence here is dangerous. */
  let lastError = null;

  const put = (k, blob) =>
    tx('readwrite', (s) => s.put(blob, k)).catch((e) => {
      lastError = `save failed: ${e && e.name}`;
      throw e;
    });

  const get = (k) =>
    tx('readonly', (s) => s.get(k)).catch((e) => {
      // A failed read silently falls back to TTS, which looks like "my recording
      // vanished". Remember it so the diagnostics can say what really happened.
      lastError = `read failed: ${e && e.name}`;
      return null;
    });

  const del = (k) => tx('readwrite', (s) => s.delete(k));

  async function has(k) {
    try {
      const found = await tx('readonly', (s) => (s.getKey ? s.getKey(k) : s.get(k)));
      return found !== undefined && found !== null;
    } catch (e) {
      lastError = `read failed: ${e && e.name}`;
      return false;
    }
  }

  /**
   * Every stored clip key, in one transaction. The editor builds two recorder
   * controls per item — 468 of them for the real 737 profile — and asking each
   * one separately meant 468 concurrent IndexedDB transactions on every render.
   * A desktop absorbs that; a 2017 tablet does not, and each failure was
   * swallowed into "no recording here", hiding clips that were safely stored.
   */
  async function allKeys() {
    try {
      const keys = await tx('readonly', (s) => s.getAllKeys());
      return new Set(keys || []);
    } catch (e) {
      lastError = `read failed: ${e && e.name}`;
      return new Set();
    }
  }

  /** Rough byte total, for the diagnostics panel. */
  async function stats() {
    try {
      const keys = await tx('readonly', (s) => s.getAllKeys());
      return { count: (keys || []).length, error: lastError };
    } catch (e) {
      return { count: 0, error: `read failed: ${e && e.name}` };
    }
  }

  /** Drop both clips belonging to an item — call when the item is deleted. */
  function delItem(itemId) {
    return Promise.all([del(key(itemId, 'challenge')), del(key(itemId, 'response'))]).catch(() => {});
  }

  return { key, put, get, del, has, delItem, allKeys, stats };
})();
