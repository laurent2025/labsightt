/**
 * Browser-local cache for specimen slide images.
 *
 * A specimen is routinely scanned on ten or more images, and every one of them
 * is a full-resolution photograph. Re-fetching all of them from the server on
 * each switch or reload makes the operator wait on bytes they already have, so
 * each slide is stored once in IndexedDB and read back from there afterwards.
 *
 * IndexedDB is used rather than localStorage because it holds binary data
 * without the ~5 MB quota and the base64 inflation that serialising a
 * photograph into a string would cost.
 *
 * The cache is strictly an accelerator. The server is the record of truth: a
 * miss falls through to a network fetch, and a write failure is ignored, so a
 * browser with storage disabled or full behaves exactly as it did before.
 */

const DB_NAME = 'lenziai-slides';
const DB_VERSION = 1;
const STORE = 'slides';

/** A cached slide: the key it was stored under and its data URL. */
export interface CachedSlide {
  key: string;
  sampleId: string;
  imageData: string;
  cachedAt: number;
}

/** Builds the cache key for a slide. The slide id is server-issued and unique. */
export function slideCacheKey(sampleId: string, slideId: string): string {
  return `${sampleId}:${slideId}`;
}

let dbPromise: Promise<IDBDatabase | null> | null = null;

/**
 * Opens the cache, resolving to null when IndexedDB is unavailable so callers
 * treat the cache as simply absent rather than as a failure.
 */
function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  if (dbPromise) return dbPromise;

  dbPromise = new Promise(resolve => {
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION);
    } catch {
      resolve(null);
      return;
    }

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'key' });
        // Keys are "sampleId:slideId", so this index serves "every slide of
        // this specimen" in one lookup. It must be a real field on the record
        // rather than the key, or an exact-match query would never hit.
        store.createIndex('sampleId', 'sampleId', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    // Another tab is holding an older version open; yield rather than block.
    request.onblocked = () => resolve(null);
  });

  return dbPromise;
}

/** Runs a transaction and resolves its result, or null on any failure. */
async function withStore<T>(
  mode: IDBTransactionMode,
  work: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T | null> {
  const db = await openDb();
  if (!db) return null;
  return new Promise(resolve => {
    let request: IDBRequest<T>;
    try {
      const tx = db.transaction(STORE, mode);
      request = work(tx.objectStore(STORE));
    } catch {
      resolve(null);
      return;
    }
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
  });
}

/**
 * Reads one cached slide. Resolves to null on a miss, so a caller cannot tell
 * "not cached" from "no cache" and falls back to the network either way.
 */
export async function readCachedSlide(key: string): Promise<string | null> {
  const row = await withStore<CachedSlide>('readonly', store => store.get(key));
  if (!row || typeof row.imageData !== 'string') return null;
  // A data URL is the only shape the UI accepts; anything else is a stale write.
  return row.imageData.startsWith('data:') ? row.imageData : null;
}

/**
 * Reads every cached slide for a specimen in one lookup, keyed by slide id.
 * Returns an empty map when nothing is cached.
 */
export async function readCachedSlidesForSample(
  sampleId: string
): Promise<Map<string, string>> {
  const db = await openDb();
  const found = new Map<string, string>();
  if (!db) return found;

  return new Promise(resolve => {
    let rows: CachedSlide[] = [];
    try {
      const tx = db.transaction(STORE, 'readonly');
      const index = tx.objectStore(STORE).index('sampleId');
      const request = index.getAll(sampleId);
      request.onsuccess = () => {
        rows = (request.result ?? []) as CachedSlide[];
      };
      tx.oncomplete = () => {
        for (const row of rows) {
          if (typeof row.imageData !== 'string') continue;
          const slideId = row.key.slice(sampleId.length + 1);
          if (slideId && row.imageData.startsWith('data:')) {
            found.set(slideId, row.imageData);
          }
        }
        resolve(found);
      };
      tx.onerror = () => resolve(found);
      tx.onabort = () => resolve(found);
    } catch {
      resolve(found);
    }
  });
}

/** Stores one slide, keeping the most recent write if it is called twice. */
export async function writeCachedSlide(
  sampleId: string,
  slideId: string,
  imageData: string
): Promise<void> {
  if (typeof imageData !== 'string' || !imageData.startsWith('data:')) return;
  const key = slideCacheKey(sampleId, slideId);
  await withStore('readwrite', store =>
    store.put({ key, sampleId, imageData, cachedAt: Date.now() } as CachedSlide)
  );
}

/** Removes one cached slide. */
export async function clearCachedSlide(sampleId: string, slideId: string): Promise<void> {
  await withStore('readwrite', store => store.delete(slideCacheKey(sampleId, slideId)));
}

/**
 * Drops every cached slide for a specimen, after it is deleted or re-imaged.
 * Failing to clear is not an error the caller can act on, so it is swallowed.
 */
export async function clearCachedSlidesForSample(sampleId: string): Promise<void> {
  const db = await openDb();
  if (!db) return;
  await new Promise<void>(resolve => {
    try {
      const tx = db.transaction(STORE, 'readwrite');
      const index = tx.objectStore(STORE).index('sampleId');
      const request = index.getAllKeys(sampleId);
      request.onsuccess = () => {
        const store = tx.objectStore(STORE);
        for (const key of request.result ?? []) store.delete(key);
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    } catch {
      resolve();
    }
  });
}
