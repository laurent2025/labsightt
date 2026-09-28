import React, { useState } from 'react';
import { LaboratoryReport } from '../../types';
import { Printer, Search, CheckCircle2, Clock, AlertTriangle } from 'lucide-react';

interface ReportsListViewProps {
  reports: LaboratoryReport[];
  onOpenReport: (report: LaboratoryReport) => void;
  onVerifyReport: (reportId: string) => void;
  currentUserName: string;
}

export const ReportsListView: React.FC<ReportsListViewProps> = ({
  reports,
  onOpenReport,
  onVerifyReport,
  currentUserName
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'verified' | 'pending_verification'>('all');
  const [gateError, setGateError] = useState<string | null>(null);

  const handleVerify = (reportId: string) => {
    setGateError(null);
    try {
      onVerifyReport(reportId);
    } catch (err) {
      setGateError(err instanceof Error ? err.message : String(err));
    }
  };

  const filteredReports = reports.filter(r => {
    const matchesSearch =
      r.reportNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.patient.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.patient.patientNumber.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus = statusFilter === 'all' || r.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold tracking-tight text-slate-900">
          Diagnostic Pathology Reports
        </h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Archived clinical reports, pathologist verification sign-offs, and A4 print / PDF export
        </p>
      </div>

      {/* Filter & Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search report #, patient name, MRN..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-cyan-500"
          />
        </div>

        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg text-xs self-stretch sm:self-auto">
          {(['all', 'verified', 'pending_verification'] as const).map(st => (
            <button
              key={st}
              type="button"
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1 rounded-md capitalize font-medium transition ${
                statusFilter === st
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {st === 'pending_verification' ? 'Pending Sign-Off' : st}
            </button>
          ))}
        </div>
      </div>

      {gateError && (
        <div role="alert" className="flex items-start gap-2 bg-amber-50 border border-amber-300 text-amber-900 p-3 rounded-xl text-xs">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <span className="font-bold block">Verification refused</span>
            <p className="mt-0.5">{gateError}</p>
          </div>
        </div>
      )}

      <div className="text-[11px] text-slate-500 font-mono">
        Signed in as <strong className="text-slate-700">{currentUserName}</strong>. A report can
        only be verified by a user other than the technologist who prepared it.
      </div>

      {/* Reports Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto shadow-xs">
        <table className="w-full text-left text-xs border-collapse min-w-[680px]">
          <thead>
            <tr className="bg-slate-50 text-slate-600 border-b border-slate-200">
              <th className="py-3 px-4 font-semibold">Report # & Date</th>
              <th className="py-3 px-4 font-semibold">Patient Information</th>
              <th className="py-3 px-4 font-semibold">Specimen Examination</th>
              <th className="py-3 px-4 font-semibold">Primary Impression</th>
              <th className="py-3 px-4 font-semibold">Verification Status</th>
              <th className="py-3 px-4 font-semibold text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {filteredReports.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-10 text-center text-slate-400">
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
                        A report appears here once a second technologist or pathologist verifies a
                        completed analysis.
                      </p>
                    </>
                  )}
                </td>
              </tr>
            ) : (
              filteredReports.map(rep => (
                <tr key={rep.id} className="hover:bg-slate-50/80 transition-colors">
                  <td className="py-3 px-4">
                    <div className="font-mono font-bold text-slate-900">{rep.reportNumber}</div>
                    <div className="text-[11px] text-slate-400 font-mono">
                      {new Date(rep.generatedAt).toLocaleDateString()}
                    </div>
                  </td>

                  <td className="py-3 px-4">
                    <div className="font-semibold text-slate-900">{rep.patient.fullName}</div>
                    <div className="text-[11px] text-slate-500 font-mono">
                      {rep.patient.patientNumber} · {rep.patient.age}y / {rep.patient.gender}
                    </div>
                  </td>

                  <td className="py-3 px-4">
                    <div className="font-medium text-slate-800 capitalize">
                      {rep.sample.sampleType} Microscopy
                    </div>
                    <div className="text-[11px] text-slate-500 font-mono">
                      {rep.sample.slideLabel} · {rep.sample.totalMagnification}
                    </div>
                  </td>

                  <td className="py-3 px-4 max-w-xs truncate">
                    <span className="text-slate-700">{rep.clinicalImpression}</span>
                  </td>

                  <td className="py-3 px-4">
                    <span
                      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[10px] font-mono font-semibold uppercase ${
                        rep.status === 'verified'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {rep.status === 'verified' ? (
                        <>
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          <span>Verified</span>
                        </>
                      ) : (
                        <>
                          <Clock className="w-3 h-3 text-amber-600" />
                          <span>Pending Sign-Off</span>
                        </>
                      )}
                    </span>
                  </td>

                  <td className="py-3 px-4 text-right">
                    <div className="inline-flex items-center gap-2">
                      {rep.status !== 'verified' && (
                        <button
                          type="button"
                          onClick={() => handleVerify(rep.id)}
                          className="px-2.5 py-1 text-xs bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-lg font-medium border border-emerald-200 transition"
                          title="Sign off as pathologist"
                        >
                          Sign & Authorize
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => onOpenReport(rep)}
                        className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg font-medium text-xs inline-flex items-center gap-1.5 shadow-xs transition"
                      >
                        <Printer className="w-3.5 h-3.5" />
                        <span>Print / PDF</span>
                      </button>
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
