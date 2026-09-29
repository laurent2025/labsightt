import React, { useState } from 'react';
import { LaboratoryReport } from '../../types';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { Printer, Download, X, ShieldCheck, Code2, FileText } from 'lucide-react';
import { LAB_METADATA } from '../../lib/constants';
import { generateFHIRDiagnosticReport, generateDICOMMetadata } from '../../services/integration';

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
  const [activeView, setActiveView] = useState<'a4_report' | 'fhir_json' | 'dicom_metadata'>('a4_report');
  const [copiedNotification, setCopiedNotification] = useState(false);
  const panelRef = useFocusTrap<HTMLDivElement>(true, onClose);

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadJSON = () => {
    let exportData: any;
    let filename: string;

    if (activeView === 'fhir_json') {
      exportData = generateFHIRDiagnosticReport(report);
      filename = `${report.reportNumber}_FHIR_R4.json`;
    } else if (activeView === 'dicom_metadata') {
      exportData = generateDICOMMetadata(report);
      filename = `${report.reportNumber}_DICOM.json`;
    } else {
      exportData = report;
      filename = `${report.reportNumber}_Diagnostic_Report.json`;
    }

    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(exportData, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", filename);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const handleCopyClipboard = () => {
    const fhir = generateFHIRDiagnosticReport(report);
    navigator.clipboard.writeText(JSON.stringify(fhir, null, 2));
    setCopiedNotification(true);
    setTimeout(() => setCopiedNotification(false), 2000);
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
            <span className="text-slate-500">·</span>
            <span className="text-xs text-slate-300">
              Patient: <strong>{report.patient.fullName}</strong>
            </span>
            <span className="text-slate-500">·</span>
            <span
              className={`text-[10px] font-mono px-2 py-0.5 rounded font-medium ${
                report.status === 'verified'
                  ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                  : 'bg-amber-950 text-amber-300 border border-amber-800'
              }`}
            >
              {report.status === 'verified' ? 'Verified Official' : 'Pending Sign-Off'}
            </span>
          </div>

          {/* View Mode Selector */}
          <div className="flex items-center gap-1 bg-slate-800 p-0.5 rounded-lg text-xs">
            <button
              type="button"
              onClick={() => setActiveView('a4_report')}
              className={`px-2.5 py-1 rounded transition ${
                activeView === 'a4_report'
                  ? 'bg-slate-700 text-white font-semibold shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <FileText className="w-3.5 h-3.5 inline mr-1" />
              A4 Clinical Report
            </button>
            <button
              type="button"
              onClick={() => setActiveView('fhir_json')}
              className={`px-2.5 py-1 rounded transition ${
                activeView === 'fhir_json'
                  ? 'bg-slate-700 text-white font-semibold shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Code2 className="w-3.5 h-3.5 inline mr-1" />
              FHIR R4 JSON
            </button>
            <button
              type="button"
              onClick={() => setActiveView('dicom_metadata')}
              className={`px-2.5 py-1 rounded transition ${
                activeView === 'dicom_metadata'
                  ? 'bg-slate-700 text-white font-semibold shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              DICOM PACS
            </button>
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

        {/* View Switcher Container */}
        {activeView === 'fhir_json' ? (
          <div className="bg-slate-900 border border-slate-800 text-slate-200 p-6 rounded-2xl shadow-2xl overflow-hidden font-mono text-xs">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-3">
              <span className="font-semibold text-cyan-400">
                HL7 FHIR R4 DiagnosticReport & Observations Interoperability Payload
              </span>
              <button
                type="button"
                onClick={handleCopyClipboard}
                className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs"
              >
                {copiedNotification ? '✓ Copied!' : 'Copy FHIR JSON'}
              </button>
            </div>
            <pre className="overflow-x-auto max-h-[70vh] text-[11px] text-slate-300 p-2 leading-relaxed">
              {JSON.stringify(generateFHIRDiagnosticReport(report), null, 2)}
            </pre>
          </div>
        ) : activeView === 'dicom_metadata' ? (
          <div className="bg-slate-900 border border-slate-800 text-slate-200 p-6 rounded-2xl shadow-2xl overflow-hidden font-mono text-xs">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-3">
              <span className="font-semibold text-cyan-400">
                DICOM Whole Slide Microscopy (VL-SM) Image Storage Attributes
              </span>
            </div>
            <pre className="overflow-x-auto max-h-[70vh] text-[11px] text-slate-300 p-2 leading-relaxed">
              {JSON.stringify(generateDICOMMetadata(report), null, 2)}
            </pre>
          </div>
        ) : (
          /* Standard A4 Printable Laboratory Document */
          <div
            id="laboratory-report-container"
            className="bg-white text-slate-900 rounded-2xl shadow-2xl p-6 sm:p-12 border border-slate-200 print:border-none print:shadow-none print:p-0 print:rounded-none max-w-[210mm] mx-auto min-h-[297mm] text-xs flex flex-col justify-between"
          >
            <div>
              {/* Header / Letterhead */}
              <div className="border-b-2 border-slate-900 pb-5">
                <div className="flex items-start justify-between">
                  <div>
                    <h1 className="text-xl font-bold tracking-tight text-slate-950 font-serif">
                      {LAB_METADATA.name}
                    </h1>
                    <p className="text-slate-600 text-xs font-medium mt-0.5">
                      {LAB_METADATA.institution}
                    </p>
                    <p className="text-[11px] text-slate-500 font-mono mt-0.5">
                      {LAB_METADATA.address} · {LAB_METADATA.contact}
                    </p>
                  </div>

                  <div className="text-right">
                    <div className="font-mono text-sm font-bold text-slate-900">
                      REPORT #: {report.reportNumber}
                    </div>
                    <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                      {LAB_METADATA.license}
                    </div>
                    <div className="text-[11px] text-rose-700 font-mono font-semibold mt-1">
                      ● {report.status === 'verified'
                        ? `Verified ${report.verifiedAt ? new Date(report.verifiedAt).toLocaleString() : ''}`
                        : 'NOT VERIFIED - draft output'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Document Title Banner */}
              <div className="my-4 py-1.5 px-3 bg-slate-100 rounded text-center">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-800">
                  CLINICAL MICROSCOPY & DIAGNOSTIC PATHOLOGY REPORT
                </span>
              </div>

              {/* Patient & Specimen Metadata Two-Column Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-3.5 bg-slate-50 rounded-lg border border-slate-200 mb-5">
                {/* Left: Patient */}
                <div className="space-y-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block border-b border-slate-200 pb-1">
                    PATIENT DEMOGRAPHICS
                  </span>
                  <div className="grid grid-cols-3 gap-1">
                    <span className="text-slate-500">Patient Name:</span>
                    <span className="col-span-2 font-bold text-slate-900">{report.patient.fullName}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-1 font-mono">
                    <span className="text-slate-500">Patient ID:</span>
                    <span className="col-span-2 font-semibold text-slate-800">{report.patient.patientNumber}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-1">
                    <span className="text-slate-500">Age / Gender:</span>
                    <span className="col-span-2 text-slate-800 font-mono">{report.patient.age} yrs / {report.patient.gender}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-1">
                    <span className="text-slate-500">Referring Dr:</span>
                    <span className="col-span-2 text-slate-800">{report.patient.referringDoctor}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-1">
                    <span className="text-slate-500">Facility:</span>
                    <span className="col-span-2 text-slate-800 truncate">{report.patient.referringFacility}</span>
                  </div>
                </div>

                {/* Right: Specimen & Examination Details */}
                <div className="space-y-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block border-b border-slate-200 pb-1">
                    SPECIMEN & MICROSCOPY METRICS
                  </span>
                  <div className="grid grid-cols-3 gap-1">
                    <span className="text-slate-500">Specimen Type:</span>
                    <span className="col-span-2 font-bold text-slate-900 capitalize">{report.sample.sampleType} Microscopy</span>
                  </div>
                  <div className="grid grid-cols-3 gap-1 font-mono">
                    <span className="text-slate-500">Slide ID:</span>
                    <span className="col-span-2 text-slate-800">{report.sample.slideLabel}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-1">
                    <span className="text-slate-500">Preparation:</span>
                    <span className="col-span-2 text-slate-800">{report.sample.stainMethod}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-1 font-mono">
                    <span className="text-slate-500">Magnification:</span>
                    <span className="col-span-2 text-slate-800">
                      {report.sample.totalMagnification} ({report.sample.objective} Obj / {report.sample.eyepiece} Ocular)
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-1 font-mono">
                    <span className="text-slate-500">Fields Scanned:</span>
                    <span className="col-span-2 text-slate-800">{report.sample.fieldsExamined} Standard HPFs</span>
                  </div>
                </div>
              </div>

              {/* Microscopic Findings Table */}
              <div className="mb-5">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900 mb-2 border-b border-slate-300 pb-1">
                  STANDARDIZED MICROSCOPIC QUANTIFICATION
                </h3>
                <table className="w-full border-collapse border border-slate-300 text-left">
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
                        <td colSpan={5} className="p-4 text-center text-slate-500 border border-slate-300">
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
                        <td className="p-2 border border-slate-300 text-center font-mono text-slate-500">
                          {f.count}
                        </td>
                          <td className="p-2 border border-slate-300 font-mono text-slate-800">
                            {f.standardizedQuantity}
                          </td>
                      <td className="p-2 border border-slate-300 text-slate-600">
                        {f.clinicalSignificance === 'normal' ? 'None expected' : 'None in normal specimen'}
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
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-700">
                    REPRESENTATIVE DIGITAL PHOTOMICROGRAPH (FIELD #04)
                  </span>
                  <span className="text-[10px] font-mono text-slate-500">
                    Calibrated scale: 20 µm / bar
                  </span>
                </div>
                <div className="relative w-full h-56 bg-slate-950 rounded overflow-hidden flex items-center justify-center">
                  <img
                    src={report.sample.imageUrl}
                    alt="Microscopy plate"
                    className="max-h-full max-w-full object-contain"
                  />
                  <div className="absolute bottom-2 left-2 bg-slate-900/80 px-2 py-0.5 rounded text-[10px] font-mono text-slate-300">
                    {report.sample.stainMethod} · {report.sample.totalMagnification}
                  </div>
                </div>
              </div>

              {/* Diagnostic Impression & Clinical Interpretation */}
              <div className="border border-slate-300 rounded-lg p-3.5 mb-5 space-y-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-800 block border-b border-slate-200 pb-1">
                  DIAGNOSTIC PATHOLOGY IMPRESSION & CLINICAL REMARKS
                </span>
                <p className="font-bold text-slate-900 leading-relaxed text-xs">
                  {report.clinicalImpression}
                </p>
                <p className="text-slate-600 leading-relaxed text-[11px]">
                  {report.technologistNotes}
                </p>
              </div>
            </div>

            {/* Footer & Electronic Signatures Block */}
            <div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 pt-4 border-t-2 border-slate-300 mb-4">
                <div>
                  <span className="text-[10px] font-bold uppercase text-slate-400 block mb-3">
                    PERFORMED & REVIEWED BY
                  </span>
                  <div className="font-serif italic text-base text-slate-800 border-b border-dashed border-slate-300 pb-1">
                    {report.technologistName}
                  </div>
                  <div className="text-[11px] text-slate-600 font-mono mt-1">
                    Certified Medical Laboratory Technologist
                  </div>
                  <div className="text-[10px] text-slate-400 font-mono">
                    Timestamp: {new Date(report.generatedAt).toLocaleString()}
                  </div>
                </div>

                <div>
                  <span className="text-[10px] font-bold uppercase text-slate-400 block mb-3">
                    VERIFIED &amp; AUTHORIZED BY
                  </span>
                  <div className="font-serif italic text-base text-slate-800 border-b border-dashed border-slate-300 pb-1">
                    {report.supervisorName || <span className="text-slate-400 not-italic">Pending independent verification</span>}
                  </div>
                  <div className="text-[11px] text-slate-600 font-mono mt-1">
                    Pathologist / Laboratory Director
                  </div>
                  <div className="text-[10px] text-slate-400 font-mono">
                    {report.verifiedAt
                      ? `Verification timestamp: ${new Date(report.verifiedAt).toLocaleString()}`
                      : 'No electronic signature applied. This document is not a valid released report.'}
                  </div>
                </div>
              </div>

              {/* Legal / Regulatory Disclaimer */}
              <div className="text-[10px] text-slate-400 leading-tight border-t border-slate-200 pt-2 text-center">
                {LAB_METADATA.legalDisclaimer}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
