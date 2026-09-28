import React, { useEffect, useState } from 'react';
import { Camera, ShieldCheck, ChevronDown, ChevronUp, Zap, Info } from 'lucide-react';
import { useLabStore } from '../../store/labStore';
import { systemApi, auditApi, type SystemStatus, type ChainIntegrity } from '../../services/api';

/**
 * Workstation configuration summary.
 *
 * This panel reports only values this build can actually observe: which models
 * are configured, whether the server holds a credential, and the integrity of
 * the server's audit chain as verified on the last check. It deliberately does
 * NOT display latency, mAP, QC lot results, or turnaround times, because
 * nothing in this build measures them. Those require an instrumented backend
 * and a real control material.
 */
export const TelemetryStatusBar: React.FC = () => {
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'models' | 'storage' | 'audit'>('models');

  const { models, auditLogs, user } = useLabStore();
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [integrity, setIntegrity] = useState<ChainIntegrity | null>(null);

  const activeModels = models.filter(m => m.active);
  const credentialPresent = status?.inference.configured ?? false;
  const lastAudit = auditLogs[0];

  // Integrity is fetched, not asserted: the panel reports what the server's
  // chain verification actually returned this time.
  useEffect(() => {
    let cancelled = false;
    systemApi.status().then(s => !cancelled && setStatus(s)).catch(() => {});
    if (user && user.role !== 'Medical Laboratory Technologist') {
      auditApi.verify().then(r => !cancelled && setIntegrity(r)).catch(() => {});
    }
    return () => {
      cancelled = true;
    };
  }, [user, auditLogs.length]);

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950 text-slate-200 overflow-hidden shadow-xl transition-all duration-300">
      <div className="px-4 py-3 sm:px-5 flex flex-wrap items-center justify-between gap-3 text-xs font-mono bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950">
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <div
            className="flex items-center gap-2 bg-slate-900/90 hover:bg-slate-800/90 border border-slate-800 px-3 py-1.5 rounded-xl transition cursor-pointer"
            onClick={() => {
              setIsExpanded(true);
              setActiveTab('models');
            }}
          >
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
            <div className="flex items-center gap-1.5">
              <span className="text-white font-bold tracking-tight">Workstation</span>
              <span className="text-slate-400 text-[11px]">Browser session</span>
            </div>
          </div>

          <span className="text-slate-700 hidden sm:inline">|</span>

          <div
            className="flex items-center gap-2 bg-slate-900/90 hover:bg-slate-800/90 border border-slate-800 px-3 py-1.5 rounded-xl transition cursor-pointer"
            onClick={() => {
              setIsExpanded(true);
              setActiveTab('models');
            }}
          >
            <Zap className="w-3.5 h-3.5 text-purple-400" />
            <div className="flex items-center gap-1.5">
              <span className="text-slate-400">Models:</span>
              <span className="text-purple-300 font-semibold">{activeModels.length} configured</span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-[11px]">
          <div className="flex items-center gap-1.5 bg-slate-900/80 border border-slate-800 px-2.5 py-1 rounded-lg">
            <span className="text-slate-400">Credential:</span>
            <span className={credentialPresent ? 'text-emerald-300 font-bold' : 'text-amber-300 font-bold'}>
              {credentialPresent ? 'Present' : 'Missing'}
            </span>
          </div>

          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex items-center gap-1 bg-cyan-950/60 hover:bg-cyan-900/60 border border-cyan-800/80 text-cyan-300 px-2.5 py-1 rounded-lg text-xs font-semibold transition cursor-pointer"
          >
            <span>{isExpanded ? 'Hide Details' : 'Configuration'}</span>
            {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {isExpanded && (
        <div className="border-t border-slate-800/80 bg-slate-950/95 p-4 sm:p-5 text-xs font-mono space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800/80 gap-2 overflow-x-auto">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setActiveTab('models')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 ${
                  activeTab === 'models'
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/50'
                    : 'text-slate-400 hover:text-white hover:bg-slate-900'
                }`}
              >
                <Zap className="w-3.5 h-3.5" />
                <span>Configured Models</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('storage')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 ${
                  activeTab === 'storage'
                    ? 'bg-purple-500/20 text-purple-300 border border-purple-500/50'
                    : 'text-slate-400 hover:text-white hover:bg-slate-900'
                }`}
              >
                <Camera className="w-3.5 h-3.5" />
                <span>Data Storage</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('audit')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 ${
                  activeTab === 'audit'
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/50'
                    : 'text-slate-400 hover:text-white hover:bg-slate-900'
                }`}
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Local Audit Log</span>
              </button>
            </div>

            <button
              type="button"
              onClick={() => setIsExpanded(false)}
              className="text-slate-500 hover:text-slate-300 cursor-pointer"
              aria-label="Close configuration panel"
            >
              ✕
            </button>
          </div>

          {activeTab === 'models' && (
            <div className="space-y-2">
              {models.map(model => (
                <div
                  key={model.id}
                  className="bg-slate-900/80 p-3 rounded-xl border border-slate-800 flex flex-wrap items-center justify-between gap-2"
                >
                  <div className="min-w-0">
                    <div className="text-cyan-300 font-bold text-xs truncate">{model.name}</div>
                    <div className="text-[11px] text-slate-400">
                      {model.isWorkflow ? 'Serverless workflow' : 'Hosted model'} ·{' '}
                      {model.category} · {model.version}
                    </div>
                  </div>
                  <div className="text-[11px] text-slate-400 font-mono text-right">
                    <div>confidence ≥ {Math.round(model.confidenceThreshold * 100)}%</div>
                    <div>{model.active ? 'enabled' : 'disabled'} · not validated</div>
                  </div>
                </div>
              ))}
              <p className="text-[11px] text-slate-500 leading-relaxed">
                No accuracy or mAP figure is shown for these models: this build has performed no
                model validation, so there is no measured result to report.
              </p>
            </div>
          )}

          {activeTab === 'storage' && (
            <div className="space-y-3">
              <div className="flex items-start gap-2 bg-amber-950/40 border border-amber-800/60 p-3 rounded-xl text-amber-200">
                <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <p className="leading-relaxed text-[11px]">
                  All patient records, specimens, analyses, reports, and audit entries are stored in
                  this browser&apos;s localStorage. They are unencrypted, readable by any script running
                  on this origin, and removed when browser data is cleared. This is suitable for local
                  evaluation only, not for holding protected health information.
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="bg-slate-900/80 p-3 rounded-xl border border-slate-800">
                  <span className="text-slate-500 text-[10px] uppercase font-bold block">Audit Entries</span>
                  <div className="text-white font-bold text-sm">{auditLogs.length}</div>
                  <div className="text-[11px] text-slate-400">Server-side, append-only</div>
                </div>
                <div className="bg-slate-900/80 p-3 rounded-xl border border-slate-800">
                  <span className="text-slate-500 text-[10px] uppercase font-bold block">Chain Integrity</span>
                  <div
                    className={`font-bold text-sm ${integrity?.intact ? 'text-emerald-400' : integrity ? 'text-rose-400' : 'text-slate-400'}`}
                  >
                    {integrity
                      ? integrity.intact
                        ? 'Verified intact'
                        : `BROKEN at entry ${integrity.brokenAt}`
                      : 'Not checked'}
                  </div>
                  <div className="text-[11px] text-slate-400">
                    {integrity
                      ? `${integrity.total} entries, hash chain recomputed server-side`
                      : 'Requires a supervisor or director role'}
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'audit' && (
            <div className="space-y-2">
              <p className="text-[11px] text-slate-500 leading-relaxed">
                Stored server-side in an append-only table. Each row commits to the previous row's
                SHA-256 hash, and the database refuses UPDATE and DELETE on that table. Integrity is
                recomputed on demand rather than asserted. This is tamper-evident; it is not by
                itself a 21 CFR Part 11 or ISO 15189 conformance claim.
              </p>
              <div className="bg-slate-900/80 p-3 rounded-xl border border-slate-800">
                <span className="text-slate-500 text-[10px] uppercase font-bold block">Most Recent Entry</span>
                {lastAudit ? (
                  <>
                    <div className="text-white font-bold text-sm">{lastAudit.action}</div>
                    <div className="text-[11px] text-slate-400">
                      {new Date(lastAudit.timestamp).toLocaleString()} · {lastAudit.userName}
                    </div>
                    <div className="text-[11px] text-slate-300 mt-1">{lastAudit.details}</div>
                  </>
                ) : (
                  <div className="text-[11px] text-slate-400">No entries recorded.</div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
