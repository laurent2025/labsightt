import React, { useState, useEffect } from 'react';
import { LaboratoryReport } from '../../types';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { Printer, Download, X, ShieldCheck } from 'lucide-react';
import { LAB_METADATA } from '../../lib/constants';
import { samplesApi } from '../../services/api';

interface LaboratoryReportModalProps {
  report: LaboratoryReport;
  onClose: () => void;
  onVerify?: (reportId: string) => void | Promise<void>;
  verifyError?: string | null;
}

export const LaboratoryReportModal: React.FC<LaboratoryReportModalProps> = ({
  report,
  onClose,
  onVerify,
  verifyError
}) => {
  const [sampleImageUrl, setSampleImageUrl] = useState<string | null>(null);
  const panelRef = useFocusTrap<HTMLDivElement>(true, onClose);

  useEffect(() => {
    const imageUrl = report.sample?.imageUrl;
    if (imageUrl) {
      setSampleImageUrl(imageUrl);
      return;
    }
    const sampleId = report.sample?.id;
    if (!sampleId) {
      setSampleImageUrl(null);
      return;
    }
    void samplesApi.detail(sampleId)
      .then(({ sample }) => setSampleImageUrl(sample.imageUrl))
      .catch(() => setSampleImageUrl(null));
  }, [report.sample]);

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadJSON = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(report, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `${report.reportNumber}_Diagnostic_Report.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/70 backdrop-blur-xs flex justify-center p-2 sm:p-6 print:p-0 print:bg-white print:fixed-none">
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={`Laboratory report ${report.reportNumber}`}
        className="relative w-full max-w-4xl my-auto print:max-w-none print:m-0">
        {/* Verification gate rejection */}
        {verifyError && (
          <div role="alert" className="no-print mb-3 flex items-start gap-2 bg-amber-50 border border-amber-300 text-amber-900 px-4 py-2.5 rounded-xl text-xs">
            <span className="font-bold">Verification refused:</span>
            <span className="flex-1">{verifyError}</span>
          </div>
        )}
        {/* Floating Screen Actions Bar (hidden when printing) */}
        <div className="no-print sticky top-2 z-20 flex flex-wrap items-center justify-between bg-slate-900/95 text-white px-4 py-2.5 rounded-xl shadow-xl mb-3 border border-slate-700 gap-2">
          <div className="flex items-center gap-2 sm:gap-3">
            <span className="font-mono text-cyan-400 font-semibold text-xs">
              {report.reportNumber}
            </span>
            <span className="text-slate-900 font-bold">·</span>
            <span className="text-xs text-slate-300">
              Patient: <strong>{report.patient.fullName}</strong>
            </span>
            <span className="text-slate-900 font-bold">·</span>
            <span
              className={`text-[11px] font-mono px-2 py-0.5 rounded font-medium ${
                report.status === 'verified'
                  ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                  : 'bg-amber-950 text-amber-300 border border-amber-800'
              }`}
            >
              {report.status === 'verified' ? 'Verified Official' : 'Pending Sign-Off'}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {report.status !== 'verified' && onVerify && (
              <button
                type="button"
                onClick={() => void onVerify(report.id)}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition shadow-sm"
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Verify & Sign</span>
              </button>
            )}
            <button
              type="button"
              onClick={handleDownloadJSON}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium flex items-center gap-1.5 transition"
              title="Download structured data"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Export</span>
            </button>
            <button
              type="button"
              onClick={handlePrint}
              className="px-4 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-sm transition"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print / PDF</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition ml-1"
              aria-label="Close report"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Standard A4 Printable Laboratory Document */}
        <div
            id="laboratory-report-container"
            className="bg-white text-slate-900 rounded-2xl shadow-2xl p-6 sm:p-12 border border-slate-200 print:border-none print:shadow-none print:p-0 print:rounded-none max-w-[210mm] mx-auto min-h-[297mm] text-base print:text-sm flex flex-col justify-between"
          >
            <div>
              {/* Header / Letterhead */}
              <div className="border-b-2 border-slate-900 pb-5">
                <div className="flex items-start justify-between">
                  <div>
                    <h1 className="text-2xl font-bold tracking-tight text-slate-950 font-serif">
                      {LAB_METADATA.name}
                    </h1>
                    <p className="text-slate-800 text-sm font-semibold mt-0.5">
                      {LAB_METADATA.subtitle}
                    </p>
                  </div>

                  <div className="text-right">
                    <div className="font-mono text-sm font-bold text-slate-900">
                      REPORT #: {report.reportNumber}
                    </div>
                      <div className="text-sm text-slate-800 font-mono font-medium mt-0.5">
                        {LAB_METADATA.license}
                      </div>
                    <div className="text-xs text-rose-700 font-mono font-semibold mt-1">
                      ● {report.status === 'verified'
                        ? `Verified ${report.verifiedAt ? new Date(report.verifiedAt).toLocaleString() : ''}`
                        : 'NOT VERIFIED - draft output'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Document Title Banner */}
              <div className="my-4 py-1.5 px-3 bg-slate-100 rounded text-center">
<span className="text-sm font-bold uppercase tracking-wider text-slate-900">
                  CLINICAL MICROSCOPY &amp; DIAGNOSTIC PATHOLOGY REPORT
                </span>
              </div>

              {/* Patient & Specimen Metadata Two-Column Grid */}
              <div className="grid grid-cols-1 gap-4 p-3.5 bg-slate-50 rounded-lg border border-slate-200 mb-5 sm:grid-cols-2 print:grid-cols-1 print:gap-3">
                {/* Left: Patient */}
                <div className="space-y-1.5">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-500 block border-b border-slate-200 pb-1">
                    PATIENT DEMOGRAPHICS
                  </span>
                  <div className="grid grid-cols-[auto_1fr] gap-2">
                    <span className="text-slate-900 font-bold">Patient Name:</span>
                    <span className="font-bold text-slate-900">{report.patient.fullName}</span>
                  </div>
                  <div className="grid grid-cols-[auto_1fr] gap-2 font-mono">
                    <span className="text-slate-900 font-bold">Patient ID:</span>
                    <span className="font-bold text-slate-900">{report.patient.patientNumber}</span>
                  </div>
                  <div className="grid grid-cols-[auto_1fr] gap-2">
                    <span className="text-slate-900 font-bold">Age / Gender:</span>
                    <span className="font-semibold text-slate-900 font-mono">{report.patient.age} yrs / {report.patient.gender}</span>
                  </div>
                  <div className="grid grid-cols-[auto_1fr] gap-2">
                    <span className="text-slate-900 font-bold">Referring Dr:</span>
                    <span className="font-semibold text-slate-900">{report.patient.referringDoctor}</span>
                  </div>
                  <div className="grid grid-cols-[auto_1fr] gap-2">
                    <span className="text-slate-900 font-bold">Facility:</span>
                    <span className="font-semibold text-slate-900 truncate">{report.patient.referringFacility}</span>
                  </div>
                </div>

                {/* Right: Specimen & Examination Details */}
                <div className="space-y-1.5">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-500 block border-b border-slate-200 pb-1">
                    SPECIMEN & MICROSCOPY METRICS
                  </span>
                  <div className="grid grid-cols-[auto_1fr] gap-2">
                    <span className="text-slate-900 font-bold">Specimen Type:</span>
                    <span className="font-bold text-slate-900 capitalize">{report.sample.sampleType} Microscopy</span>
                  </div>
                  <div className="grid grid-cols-[auto_1fr] gap-2 font-mono">
                    <span className="text-slate-900 font-bold">Slide ID:</span>
                    <span className="font-semibold text-slate-900">{report.sample.slideLabel}</span>
                  </div>
                  <div className="grid grid-cols-[auto_1fr] gap-2">
                    <span className="text-slate-900 font-bold">Preparation:</span>
                    <span className="font-semibold text-slate-900">{report.sample.stainMethod}</span>
                  </div>
                  <div className="grid grid-cols-[auto_1fr] gap-2 font-mono">
                    <span className="text-slate-900 font-bold">Total Magnification:</span>
                    <span className="font-bold text-slate-900">{report.sample.totalMagnification}</span>
                  </div>
                  <div className="grid grid-cols-[auto_1fr] gap-2 font-mono">
                    <span className="text-slate-900 font-bold">Objective Lens:</span>
                    <span className="font-bold text-slate-900">
                      {report.sample.objective === '100x_oil' ? '100x (oil immersion)' : report.sample.objective}
                    </span>
                  </div>
                  <div className="grid grid-cols-[auto_1fr] gap-2 font-mono">
                    <span className="text-slate-900 font-bold">Ocular Eyepiece:</span>
                    <span className="font-bold text-slate-900">{report.sample.eyepiece}</span>
                  </div>
                  <div className="grid grid-cols-[auto_1fr] gap-2 font-mono">
                    <span className="text-slate-900 font-bold">Fields Scanned:</span>
                    <span className="font-semibold text-slate-900">{report.sample.fieldsExamined} Standard HPFs</span>
                  </div>
                </div>
              </div>

              {/* Microscopic Findings Table */}
              <div className="mb-5">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900 mb-2 border-b border-slate-300 pb-1">
                  STANDARDIZED MICROSCOPIC QUANTIFICATION
                </h3>
                <table className="w-full border-collapse border border-slate-300 text-left text-sm">
                  <thead>
                    <tr className="bg-slate-100 text-slate-800 font-semibold border-b border-slate-300">
                      <th className="p-2 border border-slate-300">Analyte / Microscopic Element</th>
                      <th className="p-2 border border-slate-300 text-center">Verified Count</th>
                      <th className="p-2 border border-slate-300 text-center">AI Candidates</th>
                      <th className="p-2 border border-slate-300 font-mono">Standardized Diagnostic Quantity</th>
                      <th className="p-2 border border-slate-300">Reference / Normal</th>
                      <th className="p-2 border border-slate-300 text-right">Diagnostic Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.findings.length === 0 ? (
                      <tr>
                          <td colSpan={6} className="p-4 text-center text-slate-600 border border-slate-300">
                          No ova, parasites, or abnormal cellular elements observed in examined fields.
                        </td>
                      </tr>
                    ) : (
                      report.findings.map((f, i) => (
                        <tr key={i} className={i % 2 === 1 ? 'bg-slate-50' : 'bg-white'}>
                          <td className="p-2 border border-slate-300 font-semibold text-slate-900">
                            {f.displayName}
                          </td>
                        <td className="p-2 border border-slate-300 text-center font-mono font-bold">
                          {f.confirmedCount}
                        </td>
                        <td className="p-2 border border-slate-300 text-center font-mono text-slate-600">
                          {f.count}
                        </td>
                          <td className="p-2 border border-slate-300 font-mono font-bold text-slate-900">
                            {f.standardizedQuantity}
                          </td>
                      <td className="p-2 border border-slate-300 text-slate-600">
                        {f.clinicalSignificance === 'normal' ? 'Expected in normal specimen' : 'None in normal specimen'}
                      </td>
                          <td className="p-2 border border-slate-300 text-right font-mono font-bold">
                            <span
                              className={
                                f.clinicalSignificance === 'critical' || f.clinicalSignificance === 'pathological'
                                  ? 'text-rose-700'
                                  : 'text-emerald-700'
                              }
                            >
                              {f.clinicalSignificance.toUpperCase()}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Microscopy Photomicrograph Plate & Legend */}
              <div className="mb-5 border border-slate-200 rounded-lg p-3 bg-slate-50">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-800">
                    REPRESENTATIVE DIGITAL PHOTOMICROGRAPH
                  </span>
                  <span className="text-[11px] font-mono text-slate-600">
                    Calibrated scale: {report.sample.objective === '100x_oil' ? '20' : report.sample.objective === '40x' ? '25' : '50'} µm / bar
                  </span>
                </div>
<div className="relative w-full h-56 bg-slate-950 rounded overflow-hidden flex items-center justify-center print:h-auto print:bg-white print:flex-col print:border print:border-slate-300">
      {sampleImageUrl ? (
        <img
          src={sampleImageUrl}
          alt="Microscopy plate"
          className="max-h-full max-w-full object-contain print:max-h-[120mm]"
        />
      ) : (
        <span className="text-slate-500 text-xs font-mono px-4 text-center">
          No photomicrograph captured for this specimen
        </span>
      )}
                  <div className="absolute bottom-2 left-2 bg-slate-900/80 px-2 py-0.5 rounded text-[11px] font-mono text-slate-300 print:static print:bg-white print:text-slate-900 print:border print:border-slate-300 print:rounded print:mt-2 print:py-1">
                    {report.sample.stainMethod} · {report.sample.totalMagnification}
                  </div>
                </div>
              </div>

              {/* Diagnostic Impression & Clinical Interpretation */}
              <div className="border border-slate-300 rounded-lg p-3.5 mb-5 space-y-2">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-800 block border-b border-slate-200 pb-1">
                  DIAGNOSTIC PATHOLOGY IMPRESSION & CLINICAL REMARKS
                </span>
                <p className="font-bold text-slate-900 leading-relaxed">
                  {report.clinicalImpression}
                </p>
                <p className="text-slate-800 leading-relaxed text-sm font-medium">
                  {report.technologistNotes}
                </p>
              </div>
            </div>

            {/* Footer & Electronic Signatures Block */}
            <div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 pt-4 border-t-2 border-slate-300 mb-4">
                <div>
                  <span className="text-xs font-bold uppercase text-slate-500 block mb-3">
                    PERFORMED & REVIEWED BY
                  </span>
                  <div className="font-serif italic text-base text-slate-800 border-b border-dashed border-slate-300 pb-1">
                    {report.technologistName}
                  </div>
                  <div className="text-xs text-slate-600 font-mono mt-1">
                    Certified Medical Laboratory Technologist
                  </div>
                  <div className="text-[11px] text-slate-600 font-mono">
                    Timestamp: {new Date(report.generatedAt).toLocaleString()}
                  </div>
                </div>

                <div>
                  <span className="text-xs font-bold uppercase text-slate-500 block mb-3">
                    VERIFIED &amp; AUTHORIZED BY
                  </span>
                  <div className="font-serif italic text-base text-slate-800 border-b border-dashed border-slate-300 pb-1">
                    {report.supervisorName || <span className="text-slate-500 not-italic">Pending independent verification</span>}
                  </div>
                  <div className="text-xs text-slate-600 font-mono mt-1">
                    Pathologist / Laboratory Director
                  </div>
                  <div className="text-[11px] text-slate-600 font-mono">
                    {report.verifiedAt
                      ? `Verification timestamp: ${new Date(report.verifiedAt).toLocaleString()}`
                      : 'No electronic signature applied. This document is not a valid released report.'}
                  </div>
                </div>
              </div>

              <p className="text-[11px] text-slate-500 font-mono text-center border-t border-slate-200 pt-3 mt-2">
                Computer-assisted preliminary screening only. All results require qualified technologist sign-off before release. Not a medical device.
              </p>
            </div>
          </div>
      </div>
    </div>
  );
};
