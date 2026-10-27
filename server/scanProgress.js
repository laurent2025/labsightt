/**
 * In-flight scan progress.
 *
 * A slide is read as many tiles, and a 63-tile scan takes far longer than the
 * request body it returns from. The operator needs to know the scan is alive
 * and how far it has got, so each scan registers itself here with the tiles it
 * is about to read and reports back as each one completes. A short polling
 * endpoint reads this map and renders a progress bar instead of a spinner.
 *
 * Entries are keyed by analysis id and expire on completion or failure, so the
 * map cannot grow without bound across scans.
 */

/** @typedef {{ total: number; completed: number; startedAt: number }} ScanProgress */

const scans = new Map();

/** Records the start of a scan. */
export function beginScan(analysisId, total) {
  if (!analysisId || total <= 0) return;
  scans.set(analysisId, { total, completed: 0, startedAt: Date.now() });
}

/** Marks one tile done. Idempotent: a tile that reports twice does not double. */
export function completeTile(analysisId) {
  const entry = scans.get(analysisId);
  if (!entry) return;
  entry.completed = Math.min(entry.total, entry.completed + 1);
}

/** Reads the current state for one scan, or null if it is not running. */
export function getScan(analysisId) {
  return scans.get(analysisId) ?? null;
}

/** Drops a scan's entry, whatever its outcome. */
export function endScan(analysisId) {
  scans.delete(analysisId);
}

/** Drops every entry, e.g. on server shutdown. */
export function clearAllScans() {
  scans.clear();
}