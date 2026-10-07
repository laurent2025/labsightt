import React, { useState } from 'react';
import { Analysis, Patient, Sample } from '../../types';
import {
  CheckCircle2,
  AlertTriangle,
  FileText,
  CheckCheck,
  Edit3,
  ShieldCheck,
  SlidersHorizontal,
  ChevronDown,
  ChevronUp
} from 'lucide-react';

interface TechnologistReviewProps {
  analysis: Analysis;
  patient: Patient;
  sample: Sample;
  onConfirmAll: () => void;
  onSelectDetection: (id: string | null) => void;
  selectedDetectionId?: string | null;
  onToggleConfirmDetection: (id: string) => void;
  onRejectDetection: (id: string) => void;
  onSaveNotes: (notes: string, impression: string) => void;
  onGenerateReport: () => void;
}

export const TechnologistReview: React.FC<TechnologistReviewProps> = ({
  analysis,
  patient,
  sample,
  onConfirmAll,
  onSelectDetection,
  selectedDetectionId,
  onToggleConfirmDetection,
  onRejectDetection,
  onSaveNotes,
  onGenerateReport
}) => {
  const [techNotes, setTechNotes] = useState(analysis.technologistNotes || '');
  const [impression, setImpression] = useState(analysis.clinicalImpression || '');
  const [isEditingNotes, setIsEditingNotes] = useState(false);
  const [showQCChecklist, setShowQCChecklist] = useState(false);
  const [minConfidenceFilter, setMinConfidenceFilter] = useState<number>(0);
  const [criticalCalloutLogged, setCriticalCalloutLogged] = useState<string | null>(null);

  const hasCriticalFindings = analysis.findings.some(f => f.clinicalSignificance === 'critical');

  const handleSaveNotes = () => {
    onSaveNotes(techNotes, impression);
    setIsEditingNotes(false);
  };

  const handleLogCriticalCallout = () => {
    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    setCriticalCalloutLogged(`Notified ${patient.referringDoctor} at ${timeStr} · Read-back confirmed`);
  };

  const totalDetections = analysis.detections.filter(d => !d.rejected).length;
  const confirmedDetections = analysis.detections.filter(d => d.confirmed && !d.rejected).length;
  const allConfirmed = totalDetections > 0 && confirmedDetections === totalDetections;

  const filteredDetections = analysis.detections.filter(
    d => !d.rejected && d.confidence >= minConfidenceFilter
  );

  return (
    <div className="clinical-form flex flex-col h-full bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs transition-colors duration-200">
      {/* Header */}
      <div className="px-4 sm:px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950 flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
              Laboratory Findings & Technologist Review
            </h2>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded font-medium bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
              {sample.totalMagnification}
            </span>
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-300 mt-0.5">
            Slide: <strong className="text-slate-700 dark:text-slate-200">{sample.slideLabel}</strong> · Staining:{' '}
            <strong className="text-slate-700 dark:text-slate-200">{sample.stainMethod}</strong>
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onConfirmAll}
            disabled={allConfirmed}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer ${
              allConfirmed
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 cursor-default'
                : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm'
            }`}
          >
            <CheckCheck className="w-3.5 h-3.5" />
            <span>{allConfirmed ? 'All Confirmed' : 'Confirm All'}</span>
          </button>
        </div>
      </div>

      {/* Main Review Body */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
        {/* Critical Pathology Alert Bar */}
        {hasCriticalFindings && (
            <div className="p-3.5 bg-rose-50 border border-rose-300 rounded-lg text-sm font-medium space-y-1.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-rose-800 font-bold">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>CRITICAL PATHOLOGY ALERT · IMMEDIATE CALL-OUT MANDATE</span>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-rose-200 text-rose-900 font-bold">
                CLIA STAT
              </span>
            </div>
            <p className="text-rose-900 text-[11px] leading-tight">
              Specimen exhibits critical-tier organisms. Immediate verbal notification to referring clinician is required under CLSI/CAP guidelines.
            </p>
            <div className="pt-1 flex items-center justify-between">
              {criticalCalloutLogged ? (
                <div className="text-emerald-800 font-medium text-[11px] flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  <span>{criticalCalloutLogged}</span>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={handleLogCriticalCallout}
                  className="px-3 py-1 bg-rose-700 hover:bg-rose-800 text-white rounded font-semibold text-xs transition cursor-pointer"
                >
                  Log Critical Phone Call to {patient.referringDoctor}
                </button>
              )}
            </div>
          </div>
        )}

        {/* Patient Demographics Banner */}
        <div className="p-3.5 bg-slate-50 dark:bg-slate-950 rounded-lg border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between text-sm gap-2">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 block">
              PATIENT ACCESSION
            </span>
            <span className="font-bold text-slate-800 dark:text-slate-100 text-sm">{patient.fullName}</span>
            <span className="text-slate-500 dark:text-slate-400 ml-1.5 font-mono">
              ({patient.patientNumber} · {patient.age}y / {patient.gender})
            </span>
          </div>
          <div className="sm:text-right">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 block">
              REFERRING CLINICIAN
            </span>
            <span className="font-medium text-slate-700 dark:text-slate-300">{patient.referringDoctor}</span>
            <span className="text-slate-400 dark:text-slate-500 block text-[11px] truncate">{patient.referringFacility}</span>
          </div>
        </div>

        {/* Quality Control (QC) & Specimen Suitability Strip */}
        <div className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden text-xs">
          <button
            type="button"
            onClick={() => setShowQCChecklist(!showQCChecklist)}
            className="w-full px-3 py-2 flex items-center justify-between text-slate-700 dark:text-slate-300 font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span>Specimen QC Criteria: Monolayer Verified · Staining Optimal</span>
            </div>
            {showQCChecklist ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>

          {showQCChecklist && (
            <div className="px-3 pb-3 pt-1 border-t border-slate-200 dark:border-slate-800 grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px] text-slate-600 dark:text-slate-400">
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                <span>Smear Density: Monolayer</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                <span>Artifact Index: &lt; 3%</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                <span>Optics: Olympus FN 22 Calibrated</span>
              </div>
            </div>
          )}
        </div>

        {/* Standardized Findings Table */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200">
              Organism & Cellular Quantification ({sample.fieldsExamined} Examined Fields)
            </h3>
            <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
              {confirmedDetections} / {totalDetections} verified
            </span>
          </div>

          <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-x-auto">
                <table className="clinical-table w-full text-left text-sm border-collapse min-w-[420px]">
              <thead>
                <tr className="bg-slate-100/80 dark:bg-slate-950 text-slate-600 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                  <th className="py-2 px-3 font-semibold">Organism / Element</th>
                  <th className="py-2 px-3 font-semibold text-center">Count</th>
                  <th className="py-2 px-3 font-semibold text-center">AI Mean Conf</th>
                  <th className="py-2 px-3 font-semibold">Diagnostic Density</th>
                  <th className="py-2 px-3 font-semibold text-right">Severity</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {analysis.findings.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-slate-400 dark:text-slate-500">
                      No significant organisms or structures detected within examined fields.
                    </td>
                  </tr>
                ) : (
                  analysis.findings.map(finding => {
                    const isCritical = finding.clinicalSignificance === 'critical';
                    const isPathological = finding.clinicalSignificance === 'pathological';

                    return (
                      <tr key={finding.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors">
                        <td className="py-2 px-3 font-medium text-slate-900 dark:text-slate-100">
                          <div className="flex items-center gap-1.5">
                            <span
                              className={`w-2 h-2 rounded-full ${
                                isCritical
                                  ? 'bg-rose-500 ring-2 ring-rose-300 dark:ring-rose-900'
                                  : isPathological
                                  ? 'bg-amber-500'
                                  : 'bg-emerald-500'
                              }`}
                            />
                            <span className="italic font-semibold">{finding.displayName}</span>
                          </div>
                          <span className="text-[11px] text-slate-400 dark:text-slate-500 block ml-3.5">
                            {finding.remarks}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-center font-mono font-semibold text-slate-800 dark:text-slate-200">
                          {finding.count}
                        </td>
                        <td className="py-2 px-3 text-center font-mono text-slate-700 dark:text-slate-300">
                          {(finding.averageConfidence * 100).toFixed(1)}%
                        </td>
                        <td className="py-2 px-3 font-mono text-slate-600 dark:text-slate-400">
                          {finding.standardizedQuantity}
                        </td>
                        <td className="py-2 px-3 text-right">
                          <span
                            className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider font-mono ${
                              isCritical
                                ? 'bg-rose-100 dark:bg-rose-950/80 text-rose-800 dark:text-rose-300 border border-rose-200 dark:border-rose-800'
                                : isPathological
                                ? 'bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
                                : 'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                            }`}
                          >
                            {finding.clinicalSignificance}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Individual Detections Verification Cards */}
        <div>
          <div className="flex items-center justify-between mb-2">
                        <h3 className="text-sm font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200">
              Identified Targets ({filteredDetections.length})
            </h3>
            <div className="flex items-center gap-1.5 text-[11px] font-mono text-slate-500">
              <SlidersHorizontal className="w-3 h-3 text-slate-400" />
              <span>Min Conf:</span>
              <select
                value={minConfidenceFilter}
                onChange={e => setMinConfidenceFilter(parseFloat(e.target.value))}
                className="bg-slate-100 border border-slate-300 rounded px-1 py-0.5 text-[11px] text-slate-800 dark:text-slate-200 dark:bg-slate-800 dark:border-slate-600"
              >
                <option value={0}>All (&gt;0%)</option>
                <option value={0.6}>&gt; 60%</option>
                <option value={0.8}>&gt; 80%</option>
                <option value={0.9}>&gt; 90%</option>
              </select>
            </div>
          </div>

          <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
            {filteredDetections.length === 0 ? (
              <p className="text-xs text-slate-400 italic">No targets matching confidence filter.</p>
            ) : (
              filteredDetections.map(det => {
                const isSelected = det.id === selectedDetectionId;

                return (
                  <div
                    key={det.id}
                    onClick={() => onSelectDetection(det.id)}
                    className={`flex items-center justify-between p-2.5 rounded-lg border text-sm cursor-pointer transition ${
                      isSelected
                        ? 'border-cyan-500 bg-cyan-50/40 dark:bg-cyan-950/40 shadow-xs'
                        : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-white dark:bg-slate-900'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <button
                        type="button"
                        onClick={e => {
                          e.stopPropagation();
                          onToggleConfirmDetection(det.id);
                        }}
                        className={`p-1 rounded-md transition cursor-pointer ${
                          det.confirmed
                            ? 'text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 bg-emerald-50 dark:bg-emerald-950/60'
                            : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 bg-slate-100 dark:bg-slate-800'
                        }`}
                        title={det.confirmed ? 'Confirmed' : 'Click to confirm'}
                      >
                        <CheckCircle2 className="w-4 h-4" />
                      </button>

                      <div>
                        <span className="font-semibold text-slate-800 dark:text-slate-200 block">
                          <span className="italic">{det.class}</span>
                          {det.manual && (
                            <span className="text-[10px] ml-1.5 font-normal text-cyan-600 dark:text-cyan-400 font-mono">
                              (Manual entry)
                            </span>
                          )}
                        </span>
                        <span className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                          Confidence: {(det.confidence * 100).toFixed(1)}% · Pos: ({Math.round(det.x)},{' '}
                          {Math.round(det.y)})
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={e => {
                          e.stopPropagation();
                          onRejectDetection(det.id);
                        }}
                        className="px-2 py-1 text-[11px] rounded text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/60 cursor-pointer"
                        title="Mark as artifact or false positive"
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Clinical Impression & Technologist Notes */}
        <div className="p-3.5 bg-slate-50 dark:bg-slate-950 rounded-lg border border-slate-200 dark:border-slate-800">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-slate-500" />
              Technologist Diagnostic Interpretation & Remarks
            </span>
            {!isEditingNotes ? (
              <button
                type="button"
                onClick={() => setIsEditingNotes(true)}
                className="text-xs text-cyan-700 dark:text-cyan-400 hover:text-cyan-800 dark:hover:text-cyan-300 font-medium flex items-center gap-1 cursor-pointer"
              >
                <Edit3 className="w-3 h-3" />
                <span>Edit Remarks</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSaveNotes}
                className="text-xs bg-slate-800 dark:bg-cyan-600 text-white px-2.5 py-1 rounded font-medium hover:bg-slate-700 dark:hover:bg-cyan-500 cursor-pointer"
              >
                Save
              </button>
            )}
          </div>

          {!isEditingNotes ? (
                  <div className="space-y-2 text-sm">
              <div>
                <span className="text-slate-400 dark:text-slate-500 font-medium">Diagnostic Impression:</span>
                <p className="font-semibold text-slate-800 dark:text-slate-200 mt-0.5">
                  {impression || 'Pending technologist impression review.'}
                </p>
              </div>
              <div>
                <span className="text-slate-400 dark:text-slate-500 font-medium">Examination Notes:</span>
                <p className="text-slate-600 dark:text-slate-400 mt-0.5">
                  {techNotes || 'Standard high dry field examination complete.'}
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                      <label className="text-sm font-bold text-slate-800 dark:text-slate-100 block mb-1">
                  Diagnostic Impression:
                </label>
                <textarea
                  rows={2}
                  value={impression}
                  onChange={e => setImpression(e.target.value)}
                  className="w-full text-sm font-medium p-2.5 bg-white dark:bg-slate-900 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-1 focus:ring-cyan-500"
                />
              </div>
              <div>
                      <label className="text-sm font-bold text-slate-800 dark:text-slate-100 block mb-1">
                  Examination Notes:
                </label>
                <textarea
                  rows={2}
                  value={techNotes}
                  onChange={e => setTechNotes(e.target.value)}
                  className="w-full text-sm font-medium p-2.5 bg-white dark:bg-slate-900 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-1 focus:ring-cyan-500"
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Footer Actions */}
      <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="text-xs text-slate-500 dark:text-slate-400 font-mono">
          Reviewed by: <strong className="text-slate-800 dark:text-slate-200">Laurent K., MLS (ASCP)</strong>
        </div>

        <button
          type="button"
          onClick={onGenerateReport}
          className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 dark:bg-cyan-600 dark:hover:bg-cyan-500 text-white rounded-lg text-sm font-bold flex items-center justify-center gap-2 shadow-xs transition cursor-pointer"
        >
          <FileText className="w-4 h-4" />
          <span>Release Diagnostic Report</span>
        </button>
      </div>
    </div>
  );
};
