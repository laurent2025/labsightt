import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { adminApi, auditApi, type AdminAnalysis, type AuditEntry, type ChainIntegrity } from '../../services/api';
import { EmptyState, ErrorState, TableSkeleton } from '../ui/States';
import { Download, Loader2, Microscope, RefreshCw, ScrollText, SearchX, ShieldAlert, ShieldCheck, Trash2 } from 'lucide-react';

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

const ANALYSIS_STATUSES = ['processing', 'in_review', 'confirmed', 'verified'] as const;

const STATUS_COPY: Record<string, string> = {
  processing: 'Processing',
  in_review: 'In review',
  confirmed: 'Confirmed',
  verified: 'Verified'
};

type Tab = 'runs' | 'logs';

export const AuditLogView: React.FC = () => {
  const [tab, setTab] = useState<Tab>('runs');
  const [runs, setRuns] = useState<AdminAnalysis[]>([]);
  const [runsTotal, setRunsTotal] = useState(0);
  const [runsLoading, setRunsLoading] = useState(true);
  const [runsError, setRunsError] = useState<string | null>(null);
  const [runsQuery, setRunsQuery] = useState('');
  const [runsStatusFilter, setRunsStatusFilter] = useState('all');
  const [runsOffset, setRunsOffset] = useState(0);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [integrity, setIntegrity] = useState<ChainIntegrity | null>(null);
  const [logsLoading, setLogsLoading] = useState(true);
  const [logsError, setLogsError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [logQuery, setLogQuery] = useState('');
  const [actionFilter, setActionFilter] = useState('all');

  const runsLimit = 50;

  const loadRuns = useCallback(async () => {
    setRunsLoading(true);
    setRunsError(null);
    try {
      const result = await adminApi.listAnalyses({
        limit: runsLimit,
        offset: runsOffset,
        status: runsStatusFilter === 'all' ? undefined : runsStatusFilter
      });
      setRuns(result.items);
      setRunsTotal(result.total);
    } catch (err) {
      setRunsError(err instanceof Error ? err.message : 'Microscopy runs could not be loaded.');
    } finally {
      setRunsLoading(false);
    }
  }, [runsOffset, runsStatusFilter]);

  useEffect(() => {
    if (tab === 'runs') {
      void loadRuns();
    }
  }, [tab, loadRuns]);

  useEffect(() => {
    if (tab === 'logs') {
      setLogsLoading(true);
      setLogsError(null);
      let cancelled = false;
      const load = async () => {
        try {
          const result = await auditApi.list(200);
          if (!cancelled) {
            setEntries(result.entries);
            setIntegrity(result.integrity);
          }
        } catch (err) {
          if (!cancelled) setLogsError(err instanceof Error ? err.message : 'The audit trail could not be loaded.');
        } finally {
          if (!cancelled) setLogsLoading(false);
        }
      };
      void load();
      return () => {
        cancelled = true;
      };
    }
  }, [tab]);

  const handleVerify = useCallback(async () => {
    setVerifying(true);
    try {
      setIntegrity(await auditApi.verify());
    } catch {
      // keep last known state
    } finally {
      setVerifying(false);
    }
  }, []);

  const handleStatusChange = useCallback(async (analysisId: string, nextStatus: string) => {
    setUpdatingId(analysisId);
    try {
      const result = await adminApi.updateAnalysis(analysisId, { status: nextStatus });
      setRuns(prev => prev.map(run => run.id === analysisId ? { ...run, status: result.analysis.status } : run));
    } catch (err) {
      setRunsError(err instanceof Error ? err.message : 'Status update failed.');
    } finally {
      setUpdatingId(null);
    }
  }, []);

  const handleDeleteAnalysis = useCallback(async (analysisId: string) => {
    if (!confirm('Delete this analysis? This cannot be undone.')) return;
    setDeletingId(analysisId);
    try {
      await adminApi.deleteAnalysis(analysisId);
      setRuns(prev => prev.filter(run => run.id !== analysisId));
      setRunsTotal(prev => Math.max(0, prev - 1));
    } catch (err) {
      setRunsError(err instanceof Error ? err.message : 'Delete failed.');
    } finally {
      setDeletingId(null);
    }
  }, []);

  const runsTerm = runsQuery.trim().toLowerCase();
  const visibleRuns = useMemo(() => {
    return runs.filter(run => {
      if (runsStatusFilter !== 'all' && run.status !== runsStatusFilter) return false;
      if (!runsTerm) return true;
      return (
        run.id.toLowerCase().includes(runsTerm) ||
        (run.patientName ?? '').toLowerCase().includes(runsTerm) ||
        (run.patientNumber ?? '').toLowerCase().includes(runsTerm) ||
        (run.slideLabel ?? '').toLowerCase().includes(runsTerm) ||
        (run.sampleType ?? '').toLowerCase().includes(runsTerm) ||
        run.status.toLowerCase().includes(runsTerm)
      );
    });
  }, [runs, runsStatusFilter, runsTerm]);

  const runsTotalPages = Math.max(1, Math.ceil(runsTotal / runsLimit));
  const runsCurrentPage = Math.floor(runsOffset / runsLimit) + 1;

  const exportRunsCsv = () => {
    const escape = (value: unknown) => {
      const s = String(value ?? '');
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const header = ['id', 'patient_number', 'patient_name', 'slide_label', 'sample_type', 'status', 'total_detections', 'started_at', 'completed_at'];
    const rows = visibleRuns.map(r => [r.id, r.patientNumber ?? '', r.patientName ?? '', r.slideLabel ?? '', r.sampleType ?? '', r.status, r.totalDetections, r.startedAt, r.completedAt ?? '']);
    const csv = [header, ...rows].map(r => r.map(escape).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `labsight-runs-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const logTerm = logQuery.trim().toLowerCase();
  const knownLogActions = useMemo(() => Array.from(new Set(entries.map(e => e.action))).sort(), [entries]);
  const visibleLogs = useMemo(() => {
    return entries.filter(entry => {
      if (actionFilter !== 'all' && entry.action !== actionFilter) return false;
      if (!logTerm) return true;
      return (
        entry.action.toLowerCase().includes(logTerm) ||
        (entry.actorName ?? '').toLowerCase().includes(logTerm) ||
        (entry.entity ?? '').toLowerCase().includes(logTerm) ||
        (entry.entityId ?? '').toLowerCase().includes(logTerm) ||
        (entry.details ?? '').toLowerCase().includes(logTerm)
      );
    });
  }, [entries, actionFilter, logTerm]);

  const exportLogsCsv = () => {
    const escape = (value: unknown) => {
      const s = String(value ?? '');
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const header = ['seq', 'timestamp', 'actor', 'action', 'entity', 'entity_id', 'details', 'row_hash'];
    const rows = visibleLogs.map(e => [e.seq, e.timestamp, e.actorName ?? '', e.action, e.entity ?? '', e.entityId ?? '', e.details ?? '', e.rowHash]);
    const csv = [header, ...rows].map(r => r.map(escape).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `labsight-audit-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const tabClasses = (value: Tab) =>
    `px-3.5 py-2 rounded-lg text-xs font-semibold transition cursor-pointer border ${
      tab === value
        ? 'bg-cyan-600 border-cyan-600 text-white'
        : 'bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
    }`;

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-50 dark:bg-cyan-950/60 border border-cyan-200 dark:border-cyan-800 flex items-center justify-center">
              <ScrollText className="w-5 h-5 text-cyan-700 dark:text-cyan-400" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-slate-900 dark:text-white">Admin Console</h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Oversight for microscopy runs and the hash-chained clinical audit log
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleVerify}
              disabled={verifying || tab !== 'logs'}
              className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 dark:bg-cyan-600 dark:hover:bg-cyan-500 disabled:opacity-60 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer"
            >
              {verifying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              <span>Re-verify chain</span>
            </button>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setTab('runs')} className={tabClasses('runs')}>
            <Microscope className="w-3.5 h-3.5 mr-1.5 inline" />
            Microscopy Runs
          </button>
          <button type="button" onClick={() => setTab('logs')} className={tabClasses('logs')}>
            <ScrollText className="w-3.5 h-3.5 mr-1.5 inline" />
            Logs
          </button>
        </div>

        {tab === 'runs' && integrity && (
          <div className="mt-4 flex items-start gap-2.5 rounded-xl border px-4 py-3 text-xs bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300">
            <ShieldCheck className="w-4 h-4 mt-0.5 shrink-0 text-cyan-600" />
            <div className="space-y-0.5">
              <p className="font-semibold">Audit chain holds</p>
              <p className="opacity-80">{integrity.total} entries verified intact across this server.</p>
            </div>
          </div>
        )}

        {tab === 'logs' && integrity && (
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

      {tab === 'runs' && (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
          {!runsLoading && !runsError && runs.length > 0 && (
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 px-5 py-3.5 border-b border-slate-200 dark:border-slate-800">
              <div className="relative flex-1">
                <input
                  type="search"
                  value={runsQuery}
                  onChange={event => { setRunsQuery(event.target.value); setRunsOffset(0); }}
                  placeholder="Search id, patient, slide, sample type…"
                  className="w-full pl-8 pr-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-600"
                />
                <SearchX className="w-4 h-4 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
              <label className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                <span className="uppercase font-semibold tracking-wider">Status</span>
                <select
                  value={runsStatusFilter}
                  onChange={event => { setRunsStatusFilter(event.target.value); setRunsOffset(0); }}
                  className="px-2.5 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-600 cursor-pointer"
                >
                  <option value="all">All</option>
                  {ANALYSIS_STATUSES.map(s => (
                    <option key={s} value={s}>{STATUS_COPY[s]}</option>
                  ))}
                </select>
              </label>
              <span className="text-[11px] font-mono text-slate-400 dark:text-slate-500">
                {visibleRuns.length} of {runsTotal}
              </span>
              <button
                type="button"
                onClick={exportRunsCsv}
                className="px-3 py-2 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer sm:ml-auto"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export CSV</span>
              </button>
            </div>
          )}

          <div className="overflow-hidden rounded-xl">
            {runsLoading ? (
              <TableSkeleton rows={8} columns={4} />
            ) : runsError ? (
              <ErrorState message={runsError} onRetry={() => void loadRuns()} />
            ) : runs.length === 0 ? (
              <EmptyState
                title="No microscopy runs yet"
                description="Analyses appear here after inference is executed on any sample."
              />
            ) : visibleRuns.length === 0 ? (
              <EmptyState
                icon={<SearchX className="w-5 h-5" />}
                title="No matching runs"
                description="No analysis matches the current search or status filter."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse min-w-[900px]">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                      <th className="py-2.5 px-4 font-semibold">ID</th>
                      <th className="py-2.5 px-4 font-semibold">Patient</th>
                      <th className="py-2.5 px-4 font-semibold">Sample</th>
                      <th className="py-2.5 px-4 font-semibold">Status</th>
                      <th className="py-2.5 px-4 font-semibold">Detections</th>
                      <th className="py-2.5 px-4 font-semibold">Started</th>
                      <th className="py-2.5 px-4 font-semibold text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                    {visibleRuns.map(run => (
                      <tr key={run.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
                        <td className="py-2.5 px-4 font-mono text-slate-600 dark:text-slate-300 whitespace-nowrap">
                          {run.id}
                        </td>
                        <td className="py-2.5 px-4 text-slate-800 dark:text-slate-200">
                          {run.patientName || '—'}
                          <span className="block text-[11px] text-slate-500 dark:text-slate-400">{run.patientNumber ?? ''}</span>
                        </td>
                        <td className="py-2.5 px-4 text-slate-600 dark:text-slate-300">
                          {run.slideLabel || '—'}
                          <span className="block text-[11px] text-slate-500 dark:text-slate-400">{run.sampleType ?? ''}</span>
                        </td>
                        <td className="py-2.5 px-4">
                          <select
                            value={run.status}
                            disabled={updatingId === run.id}
                            onChange={event => handleStatusChange(run.id, event.target.value)}
                            className="px-2 py-1.5 text-[11px] rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-600 cursor-pointer disabled:opacity-60"
                          >
                            {ANALYSIS_STATUSES.map(s => (
                              <option key={s} value={s}>{STATUS_COPY[s]}</option>
                            ))}
                          </select>
                        </td>
                        <td className="py-2.5 px-4 font-mono text-slate-600 dark:text-slate-300">{run.totalDetections}</td>
                        <td className="py-2.5 px-4 font-mono text-slate-600 dark:text-slate-300 whitespace-nowrap">{formatTime(run.startedAt)}</td>
                        <td className="py-2.5 px-4 text-right">
                          <div className="inline-flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleDeleteAnalysis(run.id)}
                              disabled={deletingId === run.id || run.status === 'verified'}
                              title={run.status === 'verified' ? 'Verified runs cannot be deleted' : 'Delete run'}
                              className="p-1.5 rounded-md border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-rose-50 dark:hover:bg-rose-950/40 hover:text-rose-600 disabled:opacity-60 transition cursor-pointer"
                            >
                              {deletingId === run.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {!runsLoading && runsTotalPages > 1 && (
            <div className="flex items-center justify-between gap-3 px-5 py-3 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                disabled={runsOffset === 0}
                onClick={() => setRunsOffset(prev => Math.max(0, prev - runsLimit))}
                className="px-3 py-2 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-lg text-xs font-semibold transition hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-60 cursor-pointer"
              >
                Previous
              </button>
              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                Page {runsCurrentPage} of {runsTotalPages}
              </span>
              <button
                type="button"
                disabled={(runsOffset + runsLimit) >= runsTotal}
                onClick={() => setRunsOffset(prev => prev + runsLimit)}
                className="px-3 py-2 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-lg text-xs font-semibold transition hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-60 cursor-pointer"
              >
                Next
              </button>
            </div>
          )}
        </div>
      )}

      {tab === 'logs' && (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
          {!logsLoading && !logsError && entries.length > 0 && (
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 px-5 py-3.5 border-b border-slate-200 dark:border-slate-800">
              <div className="relative flex-1">
                <input
                  type="search"
                  value={logQuery}
                  onChange={event => setLogQuery(event.target.value)}
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
                  {knownLogActions.map(action => (
                    <option key={action} value={action}>
                      {action}
                    </option>
                  ))}
                </select>
              </label>
              <span className="text-[11px] font-mono text-slate-400 dark:text-slate-500">
                {visibleLogs.length} of {entries.length}
              </span>
              <button
                type="button"
                onClick={exportLogsCsv}
                className="px-3 py-2 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer sm:ml-auto"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export CSV</span>
              </button>
            </div>
          )}

          <div className="overflow-hidden rounded-xl">
            {logsLoading ? (
              <TableSkeleton rows={8} columns={4} />
            ) : logsError ? (
              <ErrorState message={logsError} onRetry={() => {}} />
            ) : entries.length === 0 ? (
              <EmptyState
                title="No audit entries yet"
                description="Clinical operations — accessions, analyses, verifications, releases — are recorded here as they happen."
              />
            ) : visibleLogs.length === 0 ? (
              <EmptyState
                icon={<SearchX className="w-5 h-5" />}
                title="No matching entries"
                description="No audit entry matches the current search or action filter."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse min-w-[760px]">
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
                    {visibleLogs.map(entry => (
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
      )}
    </div>
  );
};
