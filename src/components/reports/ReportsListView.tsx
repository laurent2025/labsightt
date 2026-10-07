import React, { useState } from 'react';
import { LaboratoryReport } from '../../types';
import { Printer, Search, CheckCircle2, Clock, AlertTriangle, Pencil, Trash2 } from 'lucide-react';

interface ReportsListViewProps {
  reports: LaboratoryReport[];
  initialStatusFilter?: 'all' | 'verified' | 'pending_verification';
  onOpenReport: (report: LaboratoryReport) => void;
  onVerifyReport: (reportId: string) => Promise<void>;
  onEditReport: (
    reportId: string,
    updates: { technologistNotes?: string; clinicalImpression?: string }
  ) => Promise<void>;
  onDeleteReport: (report: LaboratoryReport) => Promise<void>;
  currentUserName: string;
  currentUserId: string;
  canManageReports: boolean;
  canDeleteReports: boolean;
}

export const ReportsListView: React.FC<ReportsListViewProps> = ({
  reports,
  initialStatusFilter = 'all',
  onOpenReport,
  onVerifyReport,
  onEditReport,
  onDeleteReport,
  currentUserName,
  currentUserId,
  canManageReports,
  canDeleteReports
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'verified' | 'pending_verification'>(initialStatusFilter);
  const [gateError, setGateError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [editingReport, setEditingReport] = useState<LaboratoryReport | null>(null);
  const [technologistNotes, setTechnologistNotes] = useState('');
  const [clinicalImpression, setClinicalImpression] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const handleVerify = async (reportId: string) => {
    setGateError(null);
    try {
      await onVerifyReport(reportId);
    } catch (err) {
      setGateError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleSaveReport = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editingReport) return;
    setIsSaving(true);
    setActionError(null);
    try {
      await onEditReport(editingReport.id, { technologistNotes, clinicalImpression });
      setEditingReport(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (report: LaboratoryReport) => {
    if (!window.confirm(`Delete report "${report.reportNumber}"? This action cannot be undone.`)) return;
    setActionError(null);
    try {
      await onDeleteReport(report);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    }
  };

  const filteredReports = reports.filter(r => {
    const matchesSearch =
      r.reportNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.patient.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.patient.patientNumber.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus = statusFilter === 'all'
      || (statusFilter === 'verified' ? isVerified(r) : r.status === statusFilter);

    return matchesSearch && matchesStatus;
  });
  const isVerified = (report: LaboratoryReport) =>
    report.status === 'verified' || report.status === 'released';
  const verifiedCount = reports.filter(isVerified).length;
  const pendingCount = reports.filter(report => report.status === 'pending_verification').length;
  const reportFilters = [
    { value: 'all', label: 'All reports', count: reports.length },
    { value: 'pending_verification', label: 'Pending sign-off', count: pendingCount },
    { value: 'verified', label: 'Verified', count: verifiedCount }
  ] as const;

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* Header */}
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
      <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
        Diagnostic Pathology Reports
      </h1>
        <p className="text-sm text-slate-600 dark:text-slate-300 mt-0.5">
        Archived clinical reports, pathologist verification sign-offs, and A4 print / PDF export
      </p>
      </div>
      <div className="flex gap-2">
        <div className="flex-1 sm:flex-initial rounded-xl border border-amber-200 dark:border-amber-900/70 bg-amber-50/70 dark:bg-amber-950/20 px-3 py-2">
          <div className="text-[10px] font-bold uppercase tracking-wider text-amber-800 dark:text-amber-300">Awaiting sign-off</div>
          <div className="mt-0.5 font-mono text-lg font-bold leading-tight text-amber-950 dark:text-amber-100">{pendingCount}</div>
        </div>
        <div className="flex-1 sm:flex-initial rounded-xl border border-green-200 dark:border-green-900/70 bg-green-50/70 dark:bg-green-950/20 px-3 py-2">
          <div className="text-[10px] font-bold uppercase tracking-wider text-green-800 dark:text-green-300">Verified</div>
          <div className="mt-0.5 font-mono text-lg font-bold leading-tight text-green-950 dark:text-green-100">{verifiedCount}</div>
        </div>
      </div>
    </div>

    {/* Filter & Search Bar */}
    <div className="bg-white dark:bg-slate-900 p-3 sm:p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
      <div className="relative w-full">
        <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
        <input
          type="text"
          aria-label="Search reports by report number, patient name, or medical record number"
          placeholder="Search report #, patient name, MRN..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          className="clinical-input w-full pl-9 pr-3 py-2 border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-950 rounded-lg text-sm font-medium text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-cyan-500"
        />
      </div>

      <div className="flex items-center gap-1 overflow-x-auto bg-slate-100 dark:bg-slate-800 p-1 rounded-lg text-xs" role="group" aria-label="Filter reports by verification status">
        {reportFilters.map(({ value, label, count }) => (
          <button
            key={value}
            type="button"
            onClick={() => setStatusFilter(value)}
            aria-pressed={statusFilter === value}
            className={`flex flex-1 items-center justify-center gap-1.5 px-3 py-2 rounded-md font-semibold whitespace-nowrap transition ${
              statusFilter === value
                ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <span>{label}</span>
            <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-mono ${
              statusFilter === value
                ? 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200'
                : 'text-slate-500 dark:text-slate-400'
            }`}>{count}</span>
          </button>
        ))}
      </div>
      <div className="flex items-center justify-between gap-3 text-xs text-slate-500 dark:text-slate-400">
        <span aria-live="polite">
          Showing <strong className="font-mono text-slate-700 dark:text-slate-200">{filteredReports.length}</strong> of{' '}
          <strong className="font-mono text-slate-700 dark:text-slate-200">{reports.length}</strong> reports
        </span>
        {(searchTerm || statusFilter !== 'all') && (
          <button
            type="button"
            onClick={() => { setSearchTerm(''); setStatusFilter('all'); }}
            className="font-semibold text-green-800 dark:text-green-300 hover:underline"
          >
            Clear filters
          </button>
        )}
      </div>
    </div>

      {gateError && (
              <div role="alert" className="flex items-start gap-2 bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-200 p-3.5 rounded-xl text-sm font-medium">
          <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div>
            <span className="font-bold block">Verification refused</span>
            <p className="mt-0.5">{gateError}</p>
          </div>
        </div>
      )}

      {actionError && (
              <div role="alert" className="bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-800 text-rose-900 dark:text-rose-200 p-3.5 rounded-xl text-sm font-medium">
          {actionError}
        </div>
      )}

      {editingReport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/60 p-4">
          <form
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-report-title"
            onSubmit={handleSaveReport}
            className="clinical-form w-full max-w-xl space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-2xl"
          >
            <div>
              <h2 id="edit-report-title" className="text-base font-semibold text-slate-900 dark:text-white">
                Edit {editingReport.reportNumber}
              </h2>
              <p className="mt-1 text-xs text-slate-500">Changes are audited and locked after verification.</p>
            </div>
            <label className="block text-sm font-bold text-slate-800 dark:text-slate-100">
              Technologist notes
              <textarea
                value={technologistNotes}
                onChange={event => setTechnologistNotes(event.target.value)}
                rows={4}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2.5 text-sm font-medium text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-cyan-600 dark:border-slate-600 dark:bg-slate-950"
              />
            </label>
            <label className="block text-sm font-bold text-slate-800 dark:text-slate-100">
              Clinical impression
              <textarea
                value={clinicalImpression}
                onChange={event => setClinicalImpression(event.target.value)}
                rows={4}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2.5 text-sm font-medium text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-cyan-600 dark:border-slate-600 dark:bg-slate-950"
              />
            </label>
            {actionError && <p role="alert" className="text-xs text-rose-700">{actionError}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setEditingReport(null)} disabled={isSaving} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-bold text-slate-700 disabled:opacity-50 dark:border-slate-600 dark:text-slate-200">
                Cancel
              </button>
              <button type="submit" disabled={isSaving} className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-bold text-white disabled:opacity-50">
                {isSaving ? 'Saving...' : 'Save changes'}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
        Signed in as <strong className="text-slate-700 dark:text-slate-200">{currentUserName}</strong>. Any signed-in
        user can verify and authorise reports.
      </div>

      {/* Compact report cards keep review and sign-off actions reachable on phones. */}
      <div className="md:hidden space-y-3">
        {filteredReports.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-5 py-10 text-center">
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
              {reports.length === 0 ? 'No finalized reports yet' : 'No reports match these filters'}
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {reports.length === 0
                ? 'Reports will appear here after a completed analysis has been verified.'
                : 'Try another search or clear the current filters.'}
            </p>
            {(searchTerm || statusFilter !== 'all') && (
              <button
                type="button"
                onClick={() => { setSearchTerm(''); setStatusFilter('all'); }}
                className="mt-3 rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200"
              >
                Clear filters
              </button>
            )}
          </div>
        ) : (
          filteredReports.map(rep => (
            <article
              key={rep.id}
              className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-xs"
            >
              <div className="flex items-start justify-between gap-3">
                <button
                  type="button"
                  onClick={() => onOpenReport(rep)}
                  className="min-w-0 text-left"
                  aria-label={`Open report ${rep.reportNumber}`}
                >
                  <span className="block truncate font-mono text-sm font-bold text-slate-900 dark:text-white">{rep.reportNumber}</span>
                  <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">
                    {new Date(rep.generatedAt).toLocaleDateString()}
                  </span>
                </button>
                <span
                  className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ${
                    isVerified(rep)
                      ? 'bg-green-100 dark:bg-green-950 text-green-800 dark:text-green-200'
                      : 'bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-200'
                  }`}
                >
                  {isVerified(rep) ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Clock className="w-3.5 h-3.5" />}
                  {rep.status === 'released' ? 'Released' : isVerified(rep) ? 'Verified' : 'Pending sign-off'}
                </span>
              </div>

              <div className="mt-3 border-t border-slate-100 dark:border-slate-800 pt-3">
                <h2 className="font-semibold text-slate-900 dark:text-white">{rep.patient.fullName}</h2>
                <p className="mt-0.5 text-xs font-mono text-slate-500 dark:text-slate-400">
                  {rep.patient.patientNumber} · {rep.patient.age}y · {rep.patient.gender}
                </p>
                <p className="mt-2 text-xs font-medium capitalize text-slate-700 dark:text-slate-300">
                  {rep.sample.sampleType} microscopy
                  <span className="font-normal text-slate-500 dark:text-slate-400">
                    {' '}· {rep.sample.slideLabel} · {rep.sample.totalMagnification}
                  </span>
                </p>
                <p className="mt-2 text-sm leading-relaxed text-slate-700 dark:text-slate-300 line-clamp-3">
                  {rep.clinicalImpression || 'No clinical impression recorded.'}
                </p>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2 border-t border-slate-100 dark:border-slate-800 pt-3">
                {rep.status === 'pending_verification' && (
                  <button
                    type="button"
                    onClick={() => handleVerify(rep.id)}
                    className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg border border-green-200 dark:border-green-900 bg-green-50 dark:bg-green-950/40 px-2 py-2 text-xs font-semibold text-green-800 dark:text-green-200"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Sign &amp; authorize
                  </button>
                )}
                {rep.status === 'pending_verification' &&
                  (rep.technologistId === currentUserId || canManageReports) && (
                  <button
                    type="button"
                    onClick={() => {
                      setActionError(null);
                      setTechnologistNotes(rep.technologistNotes || '');
                      setClinicalImpression(rep.clinicalImpression || '');
                      setEditingReport(rep);
                    }}
                    className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    Edit
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onOpenReport(rep)}
                  className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg bg-slate-900 dark:bg-cyan-700 px-2 py-2 text-xs font-semibold text-white"
                >
                  <Printer className="w-3.5 h-3.5" />
                  Print / PDF
                </button>
                {canDeleteReports && rep.status !== 'released' && (
                  <button
                    type="button"
                    onClick={() => void handleDelete(rep)}
                    className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/30 px-2 py-2 text-xs font-semibold text-rose-800 dark:text-rose-200"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Delete report
                  </button>
                )}
              </div>
            </article>
          ))
        )}
      </div>

      {/* Reports Table */}
      <div className="hidden md:block bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-x-auto shadow-xs">
              <table className="clinical-table w-full text-left text-sm border-collapse min-w-[680px]">
          <thead>
            <tr className="bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
              <th className="py-3 px-4 font-semibold">Report # & Date</th>
              <th className="py-3 px-4 font-semibold">Patient Information</th>
              <th className="py-3 px-4 font-semibold">Specimen Examination</th>
              <th className="py-3 px-4 font-semibold">Primary Impression</th>
              <th className="py-3 px-4 font-semibold">Verification Status</th>
              <th className="py-3 px-4 font-semibold text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
            {filteredReports.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-10 text-center text-slate-400 dark:text-slate-500">
                  {searchTerm || statusFilter !== 'all' ? (
                    <>
                      <p className="font-medium text-slate-600 dark:text-slate-300">
                        No reports match the current filters.
                      </p>
                      <p className="text-[11px] mt-1">
                        {reports.length} report(s) exist; adjust the search or status filter.
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="font-medium text-slate-600 dark:text-slate-300">
                        No reports have been finalized yet.
                      </p>
                      <p className="text-[11px] mt-1">
                        A report appears here once a signed-in user verifies a
                        completed analysis.
                      </p>
                    </>
                  )}
                </td>
              </tr>
            ) : (
              filteredReports.map(rep => (
                <tr
                  key={rep.id}
                  tabIndex={0}
                  aria-label={`Open report ${rep.reportNumber}`}
                  onClick={event => {
                    if ((event.target as HTMLElement).closest('button')) return;
                    onOpenReport(rep);
                  }}
                  onKeyDown={event => {
                    if (event.target !== event.currentTarget) return;
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      onOpenReport(rep);
                    }
                  }}
                  className="cursor-pointer hover:bg-cyan-50/70 dark:hover:bg-cyan-950/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-cyan-600 transition-colors"
                >
                    <td className="py-3 px-4">
                      <div className="font-mono font-bold text-slate-900 dark:text-white">{rep.reportNumber}</div>
                      <div className="text-[11px] text-slate-400 dark:text-slate-500 font-mono">
                        {new Date(rep.generatedAt).toLocaleDateString()}
                      </div>
                    </td>

                    <td className="py-3 px-4">
                      <div className="font-bold text-slate-900 dark:text-white">{rep.patient.fullName}</div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                        {rep.patient.patientNumber} · {rep.patient.age}y / {rep.patient.gender}
                      </div>
                    </td>

                    <td className="py-3 px-4">
                      <div className="font-medium text-slate-800 dark:text-slate-200 capitalize">
                        {rep.sample.sampleType} Microscopy
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                        {rep.sample.slideLabel} · {rep.sample.totalMagnification}
                      </div>
                    </td>

                    <td className="py-3 px-4 max-w-xs truncate">
                      <span className="text-slate-700 dark:text-slate-300">{rep.clinicalImpression}</span>
                    </td>

                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${
                          isVerified(rep)
                            ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300'
                            : 'bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300'
                        }`}
                      >
                      {isVerified(rep) ? (
                        <>
                          <CheckCircle2 className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                          <span>{rep.status === 'released' ? 'Released' : 'Verified'}</span>
                        </>
                      ) : (
                        <>
                          <Clock className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                          <span>Pending Sign-Off</span>
                        </>
                      )}
                    </span>
                  </td>

                  <td className="py-3 px-4 text-right">
                    <div className="inline-flex items-center gap-2">
                      {rep.status === 'pending_verification' && (
                        <button
                          type="button"
                          onClick={() => handleVerify(rep.id)}
                            className="px-2.5 py-1 text-xs bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 rounded-lg font-medium border border-emerald-200 dark:border-emerald-800 transition"
                            title="Sign off as pathologist"
                        >
                          Sign & Authorize
                        </button>
                      )}
                      {rep.status === 'pending_verification' &&
                        (rep.technologistId === currentUserId || canManageReports) && (
                        <button
                          type="button"
                          onClick={() => {
                            setActionError(null);
                            setTechnologistNotes(rep.technologistNotes || '');
                            setClinicalImpression(rep.clinicalImpression || '');
                            setEditingReport(rep);
                          }}
                          className="px-2.5 py-1 text-xs bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg font-medium border border-slate-200 dark:border-slate-700 transition"
                          title="Edit report notes"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                      )}
                        <button
                          type="button"
                          onClick={() => onOpenReport(rep)}
                          className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 dark:bg-cyan-600 dark:hover:bg-cyan-500 text-white rounded-lg font-medium text-xs inline-flex items-center gap-1.5 shadow-xs transition"
                        >
                          <Printer className="w-3.5 h-3.5" />
                          <span>Print / PDF</span>
                        </button>
                      {canDeleteReports && rep.status !== 'released' && (
                        <button
                          type="button"
                          onClick={() => void handleDelete(rep)}
                          className="px-2.5 py-1 text-xs bg-rose-100 hover:bg-rose-200 dark:bg-rose-900/30 dark:hover:bg-rose-800 text-rose-700 dark:text-rose-300 rounded-lg font-medium border border-rose-200 dark:border-rose-700 transition"
                          title="Delete report"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
