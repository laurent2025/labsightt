import React, { useCallback, useEffect, useState } from 'react';
import { auditApi, type AuditEntry, type ChainIntegrity } from '../../services/api';
import { EmptyState, ErrorState, TableSkeleton } from '../ui/States';
import { Download, Loader2, RefreshCw, ScrollText, SearchX, ShieldAlert, ShieldCheck } from 'lucide-react';

function formatTime(iso: string) {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? iso
    : date.toLocaleString(undefined, {
        year: 'numeric',
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
}

function shortHash(hash: string) {
  if (!hash || hash.length <= 16) return hash;
  return `${hash.slice(0, 8)}…${hash.slice(-8)}`;
}

/**
 * Administrative audit trail. The server exposes these endpoints to
 * administrators only; every clinical write is recorded here with a hash
 * chain so tampering is detectable.
 */
export const AuditLogView: React.FC = () => {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [integrity, setIntegrity] = useState<ChainIntegrity | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [query, setQuery] = useState('');
  const [actionFilter, setActionFilter] = useState('all');

  const knownActions = Array.from(new Set(entries.map(e => e.action))).sort();
  const term = query.trim().toLowerCase();
  const visibleEntries = entries.filter(entry => {
    if (actionFilter !== 'all' && entry.action !== actionFilter) return false;
    if (!term) return true;
    return (
      entry.action.toLowerCase().includes(term) ||
      (entry.actorName ?? '').toLowerCase().includes(term) ||
      (entry.entity ?? '').toLowerCase().includes(term) ||
      (entry.entityId ?? '').toLowerCase().includes(term) ||
      (entry.details ?? '').toLowerCase().includes(term)
    );
  });

  const exportCsv = () => {
    const escape = (value: unknown) => {
      const s = String(value ?? '');
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const header = ['seq', 'timestamp', 'actor', 'action', 'entity', 'entity_id', 'details', 'row_hash'];
    const rows = visibleEntries.map(e => [
      e.seq,
      e.timestamp,
      e.actorName ?? '',
      e.action,
      e.entity ?? '',
      e.entityId ?? '',
      e.details ?? '',
      e.rowHash
    ]);
    const csv = [header, ...rows].map(r => r.map(escape).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `labsight-audit-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await auditApi.list(200);
      setEntries(result.entries);
      setIntegrity(result.integrity);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The audit trail could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleVerify = useCallback(async () => {
    setVerifying(true);
    try {
      setIntegrity(await auditApi.verify());
    } catch {
      // The banner already shows the last known state; a failed re-check
      // should not replace it with a blank error.
    } finally {
      setVerifying(false);
    }
  }, []);

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-50 dark:bg-cyan-950/60 border border-cyan-200 dark:border-cyan-800 flex items-center justify-center">
              <ScrollText className="w-5 h-5 text-cyan-700 dark:text-cyan-400" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-slate-900 dark:text-white">Audit Trail</h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Append-only, hash-chained record of every clinical operation on this server
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleVerify}
            disabled={verifying}
            className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 dark:bg-cyan-600 dark:hover:bg-cyan-500 disabled:opacity-60 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer"
          >
            {verifying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            <span>Re-verify chain</span>
          </button>
        </div>

        {integrity && (
          <div
            role="status"
            className={`mt-4 flex items-start gap-2.5 rounded-xl border px-4 py-3 text-xs ${
              integrity.intact
                ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200'
                : 'bg-rose-50 dark:bg-rose-950/40 border-rose-300 dark:border-rose-800 text-rose-900 dark:text-rose-200'
            }`}
          >
            {integrity.intact ? (
              <ShieldCheck className="w-4 h-4 mt-0.5 shrink-0" />
            ) : (
              <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0" />
            )}
            <div className="space-y-0.5">
              <p className="font-semibold">
                {integrity.intact
                  ? `Hash chain verified intact across ${integrity.total} entries`
                  : `Hash chain BROKEN at entry #${integrity.brokenAt ?? 'unknown'}`}
              </p>
              <p className="opacity-80">
                {integrity.intact
                  ? 'Every recorded entry recomputes to its stored row hash; no tampering detected.'
                  : integrity.reason ?? 'Recomputation failed; investigate immediately.'}
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
        {!loading && !error && entries.length > 0 && (
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 px-5 py-3.5 border-b border-slate-200 dark:border-slate-800">
            <div className="relative flex-1">
              <input
                type="search"
                value={query}
                onChange={event => setQuery(event.target.value)}
                placeholder="Search action, actor, entity, or details…"
                className="w-full pl-8 pr-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-600"
              />
              <SearchX className="w-4 h-4 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
            <label className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
              <span className="uppercase font-semibold tracking-wider">Action</span>
              <select
                value={actionFilter}
                onChange={event => setActionFilter(event.target.value)}
                className="px-2.5 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-600 cursor-pointer"
              >
                <option value="all">All actions</option>
                {knownActions.map(action => (
                  <option key={action} value={action}>
                    {action}
                  </option>
                ))}
              </select>
            </label>
            <span className="text-[11px] font-mono text-slate-400 dark:text-slate-500">
              {visibleEntries.length} of {entries.length}
            </span>
            <button
              type="button"
              onClick={exportCsv}
              className="px-3 py-2 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer sm:ml-auto"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export CSV</span>
            </button>
          </div>
        )}

        <div className="overflow-hidden rounded-xl">
        {loading ? (
          <TableSkeleton rows={8} columns={4} />
        ) : error ? (
          <ErrorState message={error} onRetry={() => void load()} />
        ) : entries.length === 0 ? (
          <EmptyState
            title="No audit entries yet"
            description="Clinical operations — accessions, analyses, verifications, releases — are recorded here as they happen."
          />
        ) : visibleEntries.length === 0 ? (
          <EmptyState
            icon={<SearchX className="w-5 h-5" />}
            title="No matching entries"
            description="No audit entry matches the current search or action filter."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse min-w-[720px]">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                  <th className="py-2.5 px-4 font-semibold">Time</th>
                  <th className="py-2.5 px-4 font-semibold">Actor</th>
                  <th className="py-2.5 px-4 font-semibold">Action</th>
                  <th className="py-2.5 px-4 font-semibold">Entity</th>
                  <th className="py-2.5 px-4 font-semibold">Details</th>
                  <th className="py-2.5 px-4 font-semibold text-right">Row Hash</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {visibleEntries.map(entry => (
                  <tr key={entry.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="py-2.5 px-4 font-mono text-slate-600 dark:text-slate-300 whitespace-nowrap">
                      {formatTime(entry.timestamp)}
                    </td>
                    <td className="py-2.5 px-4 font-medium text-slate-800 dark:text-slate-200">
                      {entry.actorName || 'System'}
                    </td>
                    <td className="py-2.5 px-4">
                      <span className="inline-block px-2 py-0.5 rounded bg-cyan-50 dark:bg-cyan-950/60 border border-cyan-200 dark:border-cyan-800 text-cyan-800 dark:text-cyan-300 font-mono text-[11px] font-semibold">
                        {entry.action}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 text-slate-600 dark:text-slate-300 font-mono">
                      {entry.entity ? `${entry.entity}${entry.entityId ? `:${entry.entityId}` : ''}` : '—'}
                    </td>
                    <td className="py-2.5 px-4 text-slate-600 dark:text-slate-300 max-w-[320px] truncate" title={entry.details ?? undefined}>
                      {entry.details || '—'}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono text-[11px] text-slate-400 dark:text-slate-500">
                      {shortHash(entry.rowHash)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        </div>
      </div>
    </div>
  );
};
