import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { scanImagesApi, saveFile, type SavedScanImage, type SavedScanCounts } from '../../services/api';
import { EmptyState, ErrorState, TableSkeleton } from '../ui/States';
import { Download, HardDrive, Image as ImageIcon, Loader2 } from 'lucide-react';

/** What a saved image is called in the list, so a raw enum is never shown. */
const KIND_LABELS: Record<SavedScanImage['kind'], string> = {
  specimen: 'Specimen image',
  slide: 'Uploaded slide',
  evidence: 'Saved crop'
};

function formatSize(bytes: number) {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(value: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleString(undefined, {
        year: 'numeric',
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      });
}

/**
 * Every image the system has saved, for an administrator to take away.
 *
 * A specimen is scanned on a photograph and on every slide uploaded against
 * it, and a ruling on a finding stores the crop it was made on. Those are the
 * pictures the system actually holds, and this view lists them so one can be
 * downloaded, several can be downloaded together, or the whole lot can be.
 *
 * Fetched through the admin endpoints, which the server denies to anyone who
 * is not an administrator.
 */
export const SavedScansView: React.FC = () => {
  const [images, setImages] = useState<SavedScanImage[]>([]);
  const [counts, setCounts] = useState<SavedScanCounts | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<'one' | 'many' | 'all' | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await scanImagesApi.list();
      setImages(result.images);
      setCounts(result.counts);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'The saved images could not be listed.'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /** Which rows are picked, identified by kind + id because that is how they are addressed. */
  const keyOf = (image: SavedScanImage) => `${image.kind}:${image.id}`;

  const selectedImages = useMemo(
    () => images.filter(image => selected.has(keyOf(image))),
    [images, selected]
  );

  const grouped = useMemo(() => {
    const bySpecimen = new Map<string, SavedScanImage[]>();
    for (const image of images) {
      const key = image.specimenLabel || 'Unlabelled specimen';
      if (!bySpecimen.has(key)) bySpecimen.set(key, []);
      bySpecimen.get(key)!.push(image);
    }
    return [...bySpecimen.entries()];
  }, [images]);

  const toggleOne = (image: SavedScanImage) => {
    const key = keyOf(image);
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleSpecimen = (specimenImages: SavedScanImage[]) => {
    const keys = specimenImages.map(keyOf);
    setSelected(prev => {
      const next = new Set(prev);
      const allPicked = keys.every(key => next.has(key));
      for (const key of keys) {
        if (allPicked) next.delete(key);
        else next.add(key);
      }
      return next;
    });
  };

  const handleDownloadOne = async (image: SavedScanImage) => {
    setBusy('one');
    setActionError(null);
    try {
      saveFile(await scanImagesApi.download([{ kind: image.kind, id: image.id }]));
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'That image could not be downloaded.');
    } finally {
      setBusy(null);
    }
  };

  const handleDownloadSelected = async () => {
    if (selectedImages.length === 0) return;
    setBusy('many');
    setActionError(null);
    try {
      saveFile(
        await scanImagesApi.download(
          selectedImages.map(image => ({ kind: image.kind, id: image.id }))
        )
      );
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : 'The chosen images could not be downloaded.'
      );
    } finally {
      setBusy(null);
    }
  };

  const handleDownloadAll = async () => {
    setBusy('all');
    setActionError(null);
    try {
      saveFile(await scanImagesApi.downloadAll());
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : 'The saved images could not be downloaded.'
      );
    } finally {
      setBusy(null);
    }
  };

  if (loading) {
    return (
      <div
        className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs p-4"
        role="status"
        aria-busy="true"
      >
        <TableSkeleton rows={8} columns={3} />
      </div>
    );
  }

  if (error) {
    return <ErrorState message={error} onRetry={() => void load()} />;
  }

  if (images.length === 0) {
    return (
      <EmptyState
        icon={<ImageIcon className="w-5 h-5" />}
        title="No images are saved yet"
        description="Scan a specimen and the photographs it was read on, and the crops saved against its findings, will appear here for download."
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary and the bulk actions that apply to the whole system. */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 shadow-xs flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-5">
        <div className="flex-1 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <div className="text-xl font-mono font-bold text-slate-900 dark:text-white">
              {counts?.specimens ?? 0}
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400">Specimens</div>
          </div>
          <div>
            <div className="text-xl font-mono font-bold text-slate-900 dark:text-white">
              {counts?.specimen ?? 0}
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400">Specimen images</div>
          </div>
          <div>
            <div className="text-xl font-mono font-bold text-slate-900 dark:text-white">
              {counts?.slide ?? 0}
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400">Uploaded slides</div>
          </div>
          <div>
            <div className="text-xl font-mono font-bold text-slate-900 dark:text-white">
              {counts?.evidence ?? 0}
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400">Saved crops</div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void handleDownloadSelected()}
            disabled={selectedImages.length === 0 || busy !== null}
            className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 cursor-pointer"
          >
            {busy === 'many' ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Download className="w-3.5 h-3.5" />
            )}
            <span>
              Download {selectedImages.length > 0 ? `selected (${selectedImages.length})` : 'selected'}
            </span>
          </button>
          <button
            type="button"
            onClick={() => void handleDownloadAll()}
            disabled={busy !== null}
            className="px-3 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 dark:bg-cyan-600 dark:hover:bg-cyan-500 text-white text-xs font-bold disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
          >
            {busy === 'all' ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <HardDrive className="w-3.5 h-3.5" />
            )}
            <span>Download all</span>
          </button>
        </div>
      </div>

      {actionError && (
        <div
          role="alert"
          className="flex items-start gap-2 bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-800 text-rose-800 dark:text-rose-200 p-3 rounded-xl text-xs font-medium"
        >
          <span className="flex-1">{actionError}</span>
        </div>
      )}

      {/* One group per specimen: the pictures belong to the case, not to a flat bucket. */}
      <div className="space-y-3">
        {grouped.map(([specimenLabel, specimenImages]) => {
          const allPicked = specimenImages.every(image => selected.has(keyOf(image)));

          return (
            <div
              key={specimenLabel}
              className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden"
            >
              <div className="flex items-center gap-3 px-4 py-2.5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/40">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={allPicked}
                    onChange={() => toggleSpecimen(specimenImages)}
                    className="w-3.5 h-3.5 rounded border-slate-300 dark:border-slate-600 text-cyan-600 focus:ring-cyan-500"
                    aria-label={`Select every image for ${specimenLabel}`}
                  />
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-100">
                    {specimenLabel}
                  </span>
                </label>
                <span className="text-[11px] text-slate-400 dark:text-slate-500">
                  {specimenImages.length} image{specimenImages.length === 1 ? '' : 's'}
                </span>
              </div>

              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {specimenImages.map(image => (
                  <li
                    key={keyOf(image)}
                    className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50/70 dark:hover:bg-slate-800/40"
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(keyOf(image))}
                      onChange={() => toggleOne(image)}
                      className="w-3.5 h-3.5 rounded border-slate-300 dark:border-slate-600 text-cyan-600 focus:ring-cyan-500"
                      aria-label={`Select ${image.label}`}
                    />

                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-slate-800 dark:text-slate-100 truncate">
                        {image.label}
                      </p>
                      <p className="text-[11px] text-slate-400 dark:text-slate-500">
                        {KIND_LABELS[image.kind]} · {formatSize(image.sizeBytes)} ·{' '}
                        {formatDate(image.createdAt)}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => void handleDownloadOne(image)}
                      disabled={busy !== null}
                      className="p-1.5 rounded-md text-slate-400 hover:text-cyan-700 dark:hover:text-cyan-400 hover:bg-cyan-50 dark:hover:bg-cyan-950/60 disabled:opacity-50 cursor-pointer"
                      title={`Download ${image.label}`}
                    >
                      {busy === 'one' ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Download className="w-4 h-4" />
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
};
