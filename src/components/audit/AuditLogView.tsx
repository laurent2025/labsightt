import React from 'react';
import { AuditLog } from '../../types';
import { Download } from 'lucide-react';

interface AuditLogViewProps {
  logs: AuditLog[];
}

export const AuditLogView: React.FC<AuditLogViewProps> = ({ logs }) => {
  const handleExportAudit = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(logs, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `Laboratory_Audit_Trail_${Date.now()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">
            Laboratory Audit Trail & Quality Assurance
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Immutable server-side append-only log. Entries cannot be edited or deleted to
            maintain clinical compliance. Use the export for offline review.
          </p>
        </div>

        <button
          type="button"
          onClick={handleExportAudit}
          className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold flex items-center gap-2 shadow-xs transition self-start sm:self-auto"
        >
          <Download className="w-3.5 h-3.5" />
            <span>Export Log (JSON)</span>
        </button>
      </div>

      {/* Audit Log Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-slate-50 text-slate-600 border-b border-slate-200">
              <th className="py-3 px-4 font-semibold">Timestamp (UTC)</th>
              <th className="py-3 px-4 font-semibold">Operator</th>
              <th className="py-3 px-4 font-semibold">Event Action</th>
              <th className="py-3 px-4 font-semibold">Audit Event Description</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 font-mono">
            {logs.map(log => (
              <tr key={log.id} className="hover:bg-slate-50/80 transition-colors">
                <td className="py-3 px-4 text-slate-500 whitespace-nowrap text-[11px]">
                  {new Date(log.timestamp).toLocaleString()}
                </td>

                <td className="py-3 px-4 whitespace-nowrap">
                  <div className="font-semibold text-slate-900 font-sans">{log.userName}</div>
                </td>

                <td className="py-3 px-4 whitespace-nowrap">
                  <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-800 border border-slate-200">
                    {log.action}
                  </span>
                </td>

                <td className="py-3 px-4 text-slate-700 font-sans text-xs">
                  {log.details}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
