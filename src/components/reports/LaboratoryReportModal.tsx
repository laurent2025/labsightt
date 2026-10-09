import React, { useState, useEffect } from 'react';
import { LaboratoryReport } from '../../types';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { Printer, Download, X, ShieldCheck } from 'lucide-react';
import { LAB_METADATA } from '../../lib/constants';
import { samplesApi, type SpecimenSlide } from '../../services/api';

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
  const [sampleImages, setSampleImages] = useState<{ id: string; name: string; imageData: string }[]>([]);
  const [imageLoadError, setImageLoadError] = useState<string | null>(null);
  const panelRef = useFocusTrap<HTMLDivElement>(true, onClose);

  useEffect(() => {
    const sampleId = report.sample?.id;
    if (!sampleId) {
      setSampleImages([]);
      return;
    }
    let current = true;
    setImageLoadError(null);
    void Promise.all([
      report.sample.imageUrl
        ? Promise.resolve(report.sample.imageUrl)
        : samplesApi.detail(sampleId).then(({ sample }) => sample.imageUrl),
      samplesApi.slides(sampleId).then(({ slides }) => slides)
    ])
      .then(([primaryImage, slides]) => {
        if (!current) return;
        const images = [];
        if (primaryImage) {
          images.push({ id: 'primary', name: 'Specimen image', imageData: primaryImage });
        }
        images.push(...slides.map((slide: SpecimenSlide) => ({
          id: slide.id,
          name: slide.name,
          imageData: slide.imageData
        })));
        setSampleImages(images);
      })
      .catch(err => {
        if (current) {
          setImageLoadError(err instanceof Error ? err.message : 'Saved specimen images could not be loaded.');
        }
      });
    return () => { current = false; };
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
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/70 backdrop-blur-xs flex justify-center p-3 sm:p-6 lg:p-8 print:p-0 print:bg-white print:fixed-none">
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={`Laboratory report ${report.reportNumber}`}
        className="relative w-full max-w-5xl sm:max-w-6xl lg:max-w-7xl my-3 sm:my-auto print:max-w-none print:m-0">
        {/* Verification gate rejection */}
        {verifyError && (
          <div role="alert" className="no-print mb-3 flex items-start gap-2 bg-amber-50 border border-amber-300 text-amber-900 px-4 py-2.5 rounded-xl text-xs">
            <span className="font-bold">Verification refused:</span>
            <span className="flex-1">{verifyError}</span>
          </div>
        )}
        {/* Floating Screen Actions Bar (hidden when printing) */}
        <div className="no-print sticky top-2 sm:top-3 z-20 flex flex-col sm:flex-row sm:items-center sm:justify-between bg-slate-900/95 text-white px-3 sm:px-4 py-2.5 sm:py-3 rounded-xl shadow-xl mb-3 sm:mb-4 border border-slate-700 gap-2 sm:gap-3">
          <div className="flex min-w-0 flex-wrap items-center gap-2 sm:gap-3">
            <span className="font-mono text-cyan-400 font-semibold text-xs sm:text-sm">
              {report.reportNumber}
            </span>
            <span className="text-slate-900 font-bold hidden sm:inline">·</span>
            <span className="text-xs sm:text-sm text-slate-300">
              Patient: <strong>{report.patient.fullName}</strong>
            </span>
            <span className="text-slate-900 font-bold hidden sm:inline">·</span>
            <span
              className={`text-[11px] sm:text-xs font-mono px-2 py-0.5 rounded font-medium ${
                report.status === 'verified'
                  ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                  : 'bg-amber-950 text-amber-300 border border-amber-800'
              }`}
            >
              {report.status === 'verified' ? 'Verified Official' : 'Pending Sign-Off'}
            </span>
          </div>

          <div className="flex w-full flex-wrap items-center justify-end gap-1.5 sm:w-auto sm:gap-2">
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
            className="bg-white text-slate-900 rounded-2xl shadow-2xl p-4 sm:p-6 lg:p-10 xl:p-12 border border-slate-200 print:border-none print:shadow-none print:p-0 print:rounded-none max-w-[210mm] mx-auto min-h-0 sm:min-h-[297mm] text-base sm:text-sm lg:text-base print:text-sm flex flex-col justify-between"
          >
            <div>
              {/* Header / Letterhead */}
              <div className="border-b-2 border-slate-900 pb-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-950 break-words">
                      {LAB_METADATA.name}
                    </h1>
                    <p className="text-slate-800 text-sm font-semibold mt-0.5">
                      {LAB_METADATA.subtitle}
                    </p>
                  </div>

                  <div className="min-w-0 text-left sm:text-right">
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
                <span className="text-[10px] sm:text-sm font-bold uppercase tracking-normal sm:tracking-[0.12em] text-slate-900">
                  CLINICAL MICROSCOPY &amp; DIAGNOSTIC PATHOLOGY REPORT
                </span>
              </div>

              {/* Patient & Specimen Metadata Two-Column Grid */}
              <div className="grid grid-cols-1 gap-3 sm:gap-4 lg:gap-6 p-3 sm:p-4 lg:p-5 bg-slate-50 rounded-lg border border-slate-200 mb-4 sm:mb-5 print:grid-cols-1 print:gap-3">
                {/* Left: Patient */}
                <div className="space-y-2 sm:space-y-2.5">
                  <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-[0.14em] text-slate-800 block border-b-2 border-slate-400 pb-1">
                    PATIENT DEMOGRAPHICS
                  </span>
                  <div className="grid grid-cols-[auto_1fr] gap-2 items-baseline">
                    <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-500">Patient Name</span>
                    <span className="text-sm sm:text-base font-semibold text-slate-900 break-words">{report.patient.fullName}</span>
                  </div>
                  <div className="grid grid-cols-[auto_1fr] gap-2 items-baseline">
                    <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-500">Patient ID</span>
                    <span className="font-mono text-sm font-bold text-slate-900">{report.patient.patientNumber}</span>
                  </div>
                  <div className="grid grid-cols-[auto_1fr] gap-2 items-baseline">
                    <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-500">Age / Gender</span>
                    <span className="font-mono text-sm font-semibold text-slate-900">{report.patient.age} yrs / {report.patient.gender}</span>
                  </div>
                  <div className="grid grid-cols-[auto_1fr] gap-2 items-baseline">
                    <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-500">Referring Dr</span>
                    <span className="text-sm font-semibold text-slate-900 truncate">{report.patient.referringDoctor || 'Not recorded'}</span>
                  </div>
                  <div className="grid grid-cols-[auto_1fr] gap-2 items-baseline">
                    <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-500">Facility</span>
                    <span className="text-sm font-semibold text-slate-900 truncate">{report.patient.referringFacility || 'Not recorded'}</span>
                  </div>
                </div>

                {/* Right: Specimen & Examination Details */}
                <div className="space-y-2 sm:space-y-2.5">
                  <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-[0.14em] text-slate-800 block border-b-2 border-slate-400 pb-1">
                    SPECIMEN & MICROSCOPY METRICS
                  </span>
                  <div className="grid grid-cols-[auto_1fr] gap-2 items-baseline">
                    <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-500">Specimen Type</span>
                    <span className="text-sm font-semibold text-slate-900 capitalize">{report.sample.sampleType} Microscopy</span>
                  </div>
                  <div className="grid grid-cols-[auto_1fr] gap-2 items-baseline">
                    <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-500">Slide ID</span>
                    <span className="font-mono text-sm font-bold text-slate-900">{report.sample.slideLabel}</span>
                  </div>
                  <div className="grid grid-cols-[auto_1fr] gap-2 items-baseline">
                    <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-500">Preparation</span>
                    <span className="text-sm font-semibold text-slate-900">{report.sample.stainMethod}</span>
                  </div>
                  <div className="grid grid-cols-[auto_1fr] gap-2 items-baseline">
                    <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-500">Total Magnification</span>
                    <span className="font-mono text-sm font-bold text-slate-900">{report.sample.totalMagnification}</span>
                  </div>
                  <div className="grid grid-cols-[auto_1fr] gap-2 items-baseline">
                    <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-500">Objective Lens</span>
                    <span className="font-mono text-sm font-bold text-slate-900">
                      {report.sample.objective === '100x_oil' ? '100x (oil immersion)' : report.sample.objective}
                    </span>
                  </div>
                  <div className="grid grid-cols-[auto_1fr] gap-2 items-baseline">
                    <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-500">Ocular Eyepiece</span>
                    <span className="font-mono text-sm font-bold text-slate-900">{report.sample.eyepiece}</span>
                  </div>
                  <div className="grid grid-cols-[auto_1fr] gap-2 items-baseline">
                    <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-500">Fields Scanned</span>
                    <span className="font-mono text-sm font-semibold text-slate-900">{report.sample.fieldsExamined} Standard HPFs</span>
                  </div>
                  {sampleImages.length > 0 && (
                    <div className="grid grid-cols-[auto_1fr] gap-2 items-baseline">
                      <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-500">Images Examined</span>
                      <span className="font-mono text-sm font-semibold text-slate-900">
                        {sampleImages.length} photomicrograph{sampleImages.length === 1 ? '' : 's'}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Microscopic Findings Table */}
              <div className="mb-5">
                <h3 className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-800 mb-2 border-b-2 border-slate-400 pb-1">
                  STANDARDIZED MICROSCOPIC QUANTIFICATION
                </h3>
                <table className="clinical-table report-findings-table a4-findings-table w-full border-collapse border border-slate-300 text-left text-sm">
                  <caption className="sr-only">Verified counts, AI candidates, standardized quantities, reference ranges, and diagnostic status</caption>
                  <colgroup>
                    <col style={{ width: '28%' }} />
                    <col style={{ width: '8%' }} />
                    <col style={{ width: '8%' }} />
                    <col style={{ width: '26%' }} />
                    <col style={{ width: '15%' }} />
                    <col style={{ width: '15%' }} />
                  </colgroup>
                  <thead>
                    <tr className="bg-slate-100 text-slate-800 font-semibold border-b border-slate-300">
                      <th className="p-2 border border-slate-300">Analyte</th>
                      <th className="p-2 border border-slate-300 text-center">Verified</th>
                      <th className="p-2 border border-slate-300 text-center">AI Count</th>
                      <th className="p-2 border border-slate-300 font-mono">Std. Quantity</th>
                      <th className="p-2 border border-slate-300">Reference</th>
                      <th className="p-2 border border-slate-300 text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.findings.length === 0 ? (
                      <tr>
                          <td colSpan={6} data-empty="true" className="p-4 text-center text-slate-600 border border-slate-300">
                          No ova, parasites, or abnormal cellular elements observed in {report.sample.fieldsExamined} examined field{report.sample.fieldsExamined === 1 ? '' : 's'}.
                        </td>
                      </tr>
                    ) : (
                      report.findings.map((f, i) => (
                        <tr key={i} className={i % 2 === 1 ? 'bg-slate-50' : 'bg-white'}>
                          <td data-label="Analyte / Microscopic Element" className="p-2 border border-slate-300 font-semibold text-slate-900">
                            {f.displayName}
                          </td>
                        <td data-label="Verified Count" className="p-2 border border-slate-300 text-center font-mono font-bold">
                          {f.confirmedCount}
                        </td>
                        <td data-label="AI Candidates" className="p-2 border border-slate-300 text-center font-mono text-slate-600">
                          {f.count}
                        </td>
                          <td data-label="Standardized Diagnostic Quantity" className="p-2 border border-slate-300 font-mono font-bold text-slate-900">
                            {f.standardizedQuantity}
                          </td>
                      <td data-label="Reference / Normal" className="p-2 border border-slate-300 text-slate-600">
                        {f.clinicalSignificance === 'normal' ? 'Expected in normal specimen' : 'None in normal specimen'}
                      </td>
                          <td data-label="Diagnostic Status" className="p-2 border border-slate-300 text-right font-mono font-bold">
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
              <div className="mb-4 sm:mb-5 border border-slate-200 rounded-lg p-3 sm:p-4 bg-slate-50">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-2 sm:mb-3 gap-2">
                  <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-[0.14em] text-slate-800">
                    SPECIMEN PHOTOMICROGRAPHS
                  </span>
                  <span className="text-[10px] sm:text-[11px] font-mono text-slate-600 shrink-0">
                    Calibrated scale: {report.sample.objective === '100x_oil' ? '20' : report.sample.objective === '40x' ? '25' : '50'} µm / bar
                  </span>
                </div>
                {imageLoadError ? (
                  <p role="alert" className="text-xs text-rose-700 print:hidden">
                    Saved specimen images could not be loaded: {imageLoadError}
                  </p>
                ) : sampleImages.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-3 print:grid-cols-2">
                    {sampleImages.map((image, index) => (
                      <figure key={image.id} className="break-inside-avoid border border-slate-300 rounded bg-white p-2">
                        <div className="aspect-video bg-slate-950 rounded overflow-hidden flex items-center justify-center print:h-auto print:min-h-[50mm] print:bg-white">
                          <img
                            src={image.imageData}
                            alt={`${image.name} microscopy image`}
                            className="max-h-full max-w-full object-contain print:max-h-[75mm]"
                          />
                        </div>
                        <figcaption className="mt-1.5 flex flex-wrap items-center justify-between gap-1 text-[9px] sm:text-[10px] font-mono text-slate-700">
                          <span className="truncate">
                            {index + 1}. {image.name}
                            <span className="ml-1 text-slate-500">
                              ({image.id === 'primary' ? 'primary' : 'uploaded'})
                            </span>
                          </span>
                          <span className="shrink-0">{report.sample.stainMethod} · {report.sample.totalMagnification}</span>
                        </figcaption>
                      </figure>
                    ))}
                  </div>
                ) : (
                  <span className="block py-6 text-center text-slate-500 text-xs font-mono">
                    No photomicrographs have been saved for this specimen.
                  </span>
                )}
              </div>

{/* Diagnostic Impression & Clinical Interpretation */}
              <div className="border border-slate-300 rounded-lg p-3 sm:p-4 mb-4 sm:mb-5 space-y-2">
                <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-[0.14em] text-slate-800 block border-b-2 border-slate-400 pb-1">
                  DIAGNOSTIC PATHOLOGY IMPRESSION & CLINICAL REMARKS
                </span>
                <p className={`font-bold leading-relaxed ${report.clinicalImpression ? 'text-slate-900' : 'text-slate-500 not-italic'}`}>
                  {report.clinicalImpression || 'No clinical impression recorded.'}
                </p>
                <p className={`leading-relaxed text-sm font-medium ${report.technologistNotes ? 'text-slate-800' : 'text-slate-500'}`}>
                  {report.technologistNotes || 'No technologist remarks recorded.'}
                </p>
              </div>
            </div>

            {/* Footer & Electronic Signatures Block */}
            <div>
              <div className="grid grid-cols-1 gap-6 sm:gap-8 lg:gap-10 pt-4 border-t-2 border-slate-300 mb-4">
                <div>
                  <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-[0.14em] text-slate-800 block mb-3 border-b-2 border-slate-400 pb-1">
                    PERFORMED &amp; REVIEWED BY
                  </span>
                  <div className="font-serif italic text-sm sm:text-base text-slate-800 border-b border-dashed border-slate-300 pb-1">
                    {report.technologistName}
                  </div>
                  <div className="text-xs text-slate-600 font-mono mt-1">
                    Certified Medical Laboratory Technologist
                  </div>
                  <div className="text-[10px] sm:text-[11px] text-slate-600 font-mono">
                    Timestamp: {new Date(report.generatedAt).toLocaleString()}
                  </div>
                </div>

                <div>
                  <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-[0.14em] text-slate-800 block mb-3 border-b-2 border-slate-400 pb-1">
                    VERIFIED &amp; AUTHORIZED BY
                  </span>
                  <div className="font-serif italic text-sm sm:text-base text-slate-800 border-b border-dashed border-slate-300 pb-1">
                    {report.supervisorName || <span className="text-slate-500 not-italic">Pending independent verification</span>}
                  </div>
                  <div className="text-xs text-slate-600 font-mono mt-1">
                    Pathologist / Laboratory Director
                  </div>
                  <div className="text-[10px] sm:text-[11px] text-slate-600 font-mono">
                    {report.verifiedAt
                      ? `Verification timestamp: ${new Date(report.verifiedAt).toLocaleString()}`
                      : 'No electronic signature applied. This document is not a valid released report.'}
                  </div>
                </div>
              </div>

              <p className="text-[10px] sm:text-[11px] text-slate-500 font-mono text-center border-t border-slate-200 pt-3 mt-2">
                Computer-assisted preliminary screening only. All results require qualified technologist sign-off before release. Not a medical device.
              </p>
            </div>
          </div>
      </div>
    </div>
  );
};
