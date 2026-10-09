import React, { useState, useEffect } from 'react';
import { Patient, Sample, Analysis, AIModelConfig, Detection, LaboratoryReport } from '../../types';
import { MicroscopeViewer } from './MicroscopeViewer';
import { TechnologistReview } from './TechnologistReview';
import {
  Play,
  RotateCcw,
  Upload,
  Microscope,
  Bot,
  FileText,
  Code2,
  Terminal,
  AlertTriangle,
  Camera,
  Video,
  X,
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { fileToDataUrl } from '../../services/roboflow';
import { playScanComplete, playCriticalValueAlert } from '../../lib/audioOpticalFeedback';
import { ApiError, samplesApi } from '../../services/api';
import { useMicroscopeCamera } from '../../hooks/useMicroscopeCamera';

// The Roboflow workflow id ("labsight-vlabsight-3-yolo26m-t1-logic") and the
// display name ("LenziAI vlabsight-3-yolo26m-t1 Logic") share one long token.
// Merging the two longest words into that token keeps the pipeline picker a
// small button-sized control; the full name and id live in the title tooltip.
function compactPipelineLabel(workflowId?: string) {
  return String(workflowId ?? '')
    .replace(/^labsight-/, '')
    .replace(/-logic$/, '');
}

interface MicroscopyWorkspaceProps {
  patients: Patient[];
  samples: Sample[];
  analyses: Analysis[];
  models: AIModelConfig[];
  currentAnalysisId?: string | null;
  pendingPatientId?: string;
  pendingSampleId?: string;
  pendingInferenceError?: string;
  pendingInferenceActive?: boolean;
  onRunAnalysis: (patientId: string, sampleId: string, modelId: string, imageUrlOverride?: string, imageRef?: string) => Promise<Analysis>;
  onToggleConfirmDetection: (analysisId: string, detectionId: string) => void;
  onRejectDetection: (analysisId: string, detectionId: string) => void;
  onConfirmAllDetections: (analysisId: string) => void;
  onAddManualDetection: (analysisId: string, det: Omit<Detection, 'id'>) => void;
  onSaveAnalysisNotes: (analysisId: string, notes: string, impression: string) => void;
  onGenerateReport: (analysisId: string) => Promise<LaboratoryReport>;
  onOpenReportModal: (report: LaboratoryReport) => void;
  onOpenNewPatientModal: () => void;
  onSelectAnalysis?: (analysisId: string) => void;
  browseFilter?: string | null;
}

export const MicroscopyWorkspace: React.FC<MicroscopyWorkspaceProps> = ({
  patients,
  samples,
  analyses,
  models,
  currentAnalysisId,
  pendingPatientId,
  pendingSampleId,
  pendingInferenceError,
  pendingInferenceActive = false,
  onRunAnalysis,
  onToggleConfirmDetection,
  onRejectDetection,
  onConfirmAllDetections,
  onAddManualDetection,
  onSaveAnalysisNotes,
  onGenerateReport,
  onOpenReportModal,
  onOpenNewPatientModal,
  onSelectAnalysis,
  browseFilter
}) => {
  const [selectedAnalysisId, setSelectedAnalysisId] = useState<string>(
    currentAnalysisId || analyses[0]?.id || ''
  );

  const [selectedDetectionId, setSelectedDetectionId] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [selectedModelId, setSelectedModelId] = useState<string>(models[0]?.id || '');
  const [customSlideDataUrl, setCustomSlideDataUrl] = useState<string | null>(null);
  const [showRawInspector, setShowRawInspector] = useState<boolean>(false);
  const [resolvedImageUrl, setResolvedImageUrl] = useState<string | null>(null);

  const [currentField, setCurrentField] = useState<number>(1);
  const [mobileActivePane, setMobileActivePane] = useState<'microscope' | 'review'>('microscope');
  const [aiAssistantImpression, setAiAssistantImpression] = useState<string | null>(null);
  const [inferenceError, setInferenceError] = useState<string | null>(null);
  const [gateError, setGateError] = useState<string | null>(null);
  const camera = useMicroscopeCamera();
  const [cameraPreviewReady, setCameraPreviewReady] = useState(false);
  const [uploadedSlides, setUploadedSlides] = useState<{ id: string; name: string; dataUrl: string }[]>([]);
  const [slidesLoading, setSlidesLoading] = useState(false);
  const [isSavingSlides, setIsSavingSlides] = useState(false);
  // Which uploaded image of the specimen is being reviewed. 'primary' is the
  // sample's stored slide; any other value is an uploaded slide id. Every
  // detection is tagged with this ref so the viewer can show only the boxes
  // that belong to the slide currently displayed while the report keeps them
  // all.
  const [activeSlideRef, setActiveSlideRef] = useState<string>('primary');

  const [scanSeconds, setScanSeconds] = useState<number>(0);
  const [scanSummary, setScanSummary] = useState<string | null>(null);
  useEffect(() => {
    if (!isAnalyzing) return;
    setScanSeconds(0);
    const started = Date.now();
    const t = setInterval(() => setScanSeconds(Math.floor((Date.now() - started) / 1000)), 500);
    return () => clearInterval(t);
  }, [isAnalyzing]);

  useEffect(() => {
    if (currentAnalysisId && currentAnalysisId !== selectedAnalysisId) {
      setSelectedAnalysisId(currentAnalysisId);
    }
  }, [currentAnalysisId, selectedAnalysisId]);

  const handleBrowseSelect = (id: string) => {
    setSelectedAnalysisId(id);
    onSelectAnalysis?.(id);
  };

  if (!currentAnalysisId && analyses.length > 1) {
    const visibleAnalyses = browseFilter
      ? analyses.filter(a => a.status === browseFilter)
      : analyses;
    return (
      <div className="space-y-4 animate-fade-in">
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 sm:p-6 shadow-xs">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-cyan-50 dark:bg-cyan-950/60 border border-cyan-200 dark:border-cyan-800 flex items-center justify-center">
              <Microscope className="w-5 h-5 text-cyan-700 dark:text-cyan-400" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-slate-900 dark:text-white">Microscopy Workstation</h1>
              <p className="text-sm text-slate-600 dark:text-slate-300">
                {browseFilter
                  ? `Showing ${visibleAnalyses.length} pending review${visibleAnalyses.length === 1 ? '' : 's'}`
                  : 'Select a run to open full details'}
              </p>
            </div>
          </div>

          {visibleAnalyses.length === 0 ? (
            <div className="py-10 text-center text-xs text-slate-500 dark:text-slate-400">
              {browseFilter ? 'No pending analyses right now.' : 'No analyses available.'}
            </div>
          ) : (
            <div
              role="region"
              aria-label="Microscopy analysis list"
              tabIndex={0}
              className="overflow-x-auto overscroll-x-contain rounded-xl border border-slate-200 dark:border-slate-800 focus-visible:outline-offset-[-2px]"
            >
              <table className="clinical-table w-full min-w-[760px] text-left text-sm border-collapse">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                    <th scope="col" className="py-2.5 px-4 font-semibold">Patient &amp; Specimen</th>
                    <th scope="col" className="py-2.5 px-4 font-semibold">Slide Preparation</th>
                    <th scope="col" className="py-2.5 px-4 font-semibold">Primary Finding</th>
                    <th scope="col" className="py-2.5 px-4 font-semibold">Status</th>
                    <th scope="col" className="py-2.5 px-4 font-semibold text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {visibleAnalyses.map(ana => {
                    const patient = patients.find(p => p.id === ana.patientId);
                    const sample = samples.find(s => s.id === ana.sampleId);
                    return (
                      <tr key={ana.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
                        <td className="py-3 px-4">
                          <div className="font-bold text-sm text-slate-900 dark:text-white">{patient?.fullName || 'Unknown Patient'}</div>
                          <div className="text-[11px] font-mono text-slate-400 dark:text-slate-500">
                            {patient?.patientNumber} · {sample?.sampleType}
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="text-slate-800 dark:text-slate-200 font-medium">{sample?.stainMethod}</div>
                          <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                            {sample?.totalMagnification} ({sample?.fieldsExamined} HPFs)
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          {ana.findings.length > 0 ? (
                            <div>
                              <span className="font-semibold text-slate-900 dark:text-white italic">
                                {ana.findings.reduce((best, f) =>
                                  f.clinicalSignificance === 'normal' ? best : f,
                                  ana.findings[0]
                                ).displayName}
                              </span>
                              <span className="text-[11px] text-slate-500 dark:text-slate-400 block font-mono">
                                {ana.findings[0].standardizedQuantity}
                              </span>
                            </div>
                          ) : ana.status === 'processing' ? (
                            <span className="text-slate-400 dark:text-slate-500">Analysis in progress</span>
                          ) : ana.totalDetections === 0 ? (
                            <span className="text-slate-400 dark:text-slate-500">No candidates proposed</span>
                          ) : (
                            <span className="text-slate-400 dark:text-slate-500">All candidates rejected by reviewer</span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <span className={`inline-block px-3 py-1 rounded-full text-xs font-bold ${
                            ana.status === 'verified'
                              ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300'
                              : ana.status === 'confirmed'
                              ? 'bg-cyan-100 dark:bg-cyan-950 text-cyan-800 dark:text-cyan-300'
                              : 'bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300'
                          }`}>
                            {ana.status.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <button
                            type="button"
                            onClick={() => handleBrowseSelect(ana.id)}
                            className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 dark:bg-cyan-600 dark:hover:bg-cyan-500 text-white rounded-lg text-sm font-bold inline-flex items-center gap-1.5 transition cursor-pointer"
                          >
                            <span>Open</span>
                            <ArrowRight className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Keep the current image while switching analyses for the same specimen;
  // images are specimen-scoped and restored from the server when needed.
  useEffect(() => {
    setInferenceError(null);
    setScanSummary(null);
  }, [selectedAnalysisId]);

  const activeAnalysis = pendingSampleId
    ? analyses.find(a => a.sampleId === pendingSampleId)
    : analyses.find(a => a.id === selectedAnalysisId) || analyses[0];

  const firstUnanalyzedSample = samples.find(
    sample => !analyses.some(analysis => analysis.sampleId === sample.id)
  );

  const activeSample =
    samples.find(s => s.id === activeAnalysis?.sampleId) ||
    samples.find(s => s.id === pendingSampleId) ||
    (pendingSampleId ? undefined : firstUnanalyzedSample);

  useEffect(() => {
    const sampleId = activeSample?.id;
    if (!sampleId) {
      setUploadedSlides([]);
      setCustomSlideDataUrl(null);
      setActiveSlideRef('primary');
      setSlidesLoading(false);
      return;
    }

    let current = true;
    setUploadedSlides([]);
    setCustomSlideDataUrl(null);
    setActiveSlideRef('primary');
    setSlidesLoading(true);
    void samplesApi.slides(sampleId)
      .then(({ slides }) => {
        if (current) {
          const persistedSlides = slides.map(slide => ({
            id: slide.id,
            name: slide.name,
            dataUrl: slide.imageData
          }));
          setUploadedSlides(previous => {
            const byId = new Map(persistedSlides.map(slide => [slide.id, slide]));
            previous.forEach(slide => byId.set(slide.id, slide));
            return [...byId.values()];
          });
        }
      })
      .catch(err => {
        if (current) {
          setInferenceError(err instanceof Error ? `Could not load saved specimen images: ${err.message}` : 'Could not load saved specimen images.');
        }
      })
      .finally(() => {
        if (current) setSlidesLoading(false);
      });
    return () => { current = false; };
  }, [activeSample?.id]);

  const activePatient =
    patients.find(p => p.id === activeAnalysis?.patientId) ||
    patients.find(p => p.id === pendingPatientId) ||
    patients.find(p => p.id === activeSample?.patientId);

  const activeModel =
    models.find(m => m.id === activeAnalysis?.modelId) || models[0];

  const primaryImageUrl = resolvedImageUrl || activeSample?.imageUrl || null;
  const slideChoices = [
    ...(primaryImageUrl ? [{ id: 'primary', name: 'Specimen image', dataUrl: primaryImageUrl }] : []),
    ...uploadedSlides
  ];
  const activeImageUrl = customSlideDataUrl || primaryImageUrl || '';
  const changeSlide = (direction: -1 | 1) => {
    if (slideChoices.length < 2 || slidesLoading) return;
    const currentIndex = slideChoices.findIndex(slide => slide.id === activeSlideRef);
    const startIndex = currentIndex < 0 ? (direction > 0 ? -1 : 0) : currentIndex;
    const nextIndex = (startIndex + direction + slideChoices.length) % slideChoices.length;
    const nextSlide = slideChoices[nextIndex];
    if (nextSlide.id === 'primary') {
      setCustomSlideDataUrl(null);
      setActiveSlideRef('primary');
      setInferenceError(null);
      return;
    }
    const uploadedSlide = uploadedSlides.find(slide => slide.id === nextSlide.id);
    if (uploadedSlide) selectSlide(uploadedSlide);
  };
  const activeSlidePosition = slideChoices.findIndex(slide => slide.id === activeSlideRef);

  // Re-run inference with current or selected model. An explicit image
  // override (e.g. a fresh microscope capture) takes precedence over the
  // last uploaded slide so a capture is analysed the instant it is taken.
  const handleTriggerAnalysis = async (imageUrlOverride?: string, imageRefOverride?: string) => {
    if (!activePatient || !activeSample) return;
    const imageUrl = imageUrlOverride || customSlideDataUrl || resolvedImageUrl;
    if (!imageUrl) {
      setInferenceError('No slide image is loaded for this specimen. Use "Load Slide" or "Capture from Microscope" to attach one, then retry.');
      return;
    }
    setIsAnalyzing(true);
    setInferenceError(null);
    setScanSummary(null);
    const startedAt = Date.now();
    try {
      const newAna = await onRunAnalysis(
        activePatient.id,
        activeSample.id,
        selectedModelId || activeModel.id,
        imageUrl,
        imageRefOverride ?? activeSlideRef
      );
      setSelectedAnalysisId(newAna.id);

      // Acoustic & Haptic completion feedback
      playScanComplete();
      const hasCritical = newAna.findings.some(f => f.clinicalSignificance === 'critical' || f.clinicalSignificance === 'pathological');
      if (hasCritical) {
        setTimeout(() => playCriticalValueAlert(), 350);
      }

      // Honest, one-line result. Never implies certainty about a 0-count.
      const seconds = Math.round((Date.now() - startedAt) / 1000);
      const n = newAna.detections.length;
      setScanSummary(
        n === 0
          ? `Scan finished in ${seconds}s. No parasites were detected in this scan. This does not rule out infection; review the slide manually before drawing a conclusion.`
          : `Scan finished in ${seconds}s. ${n} candidate object${n === 1 ? '' : 's'} detected across all scanned images of this specimen — adjudicate each before the report is generated.`
      );
    } catch (err) {
      if (err instanceof ApiError && err.status === 402) return;
      const message = err instanceof Error ? err.message : String(err);
      setInferenceError(message);
      setScanSummary(null);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleCustomUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (files.length === 0) return;
    if (!activeSample) {
      setInferenceError('Select a specimen before adding slide images.');
      return;
    }
    setInferenceError(null);
    setIsSavingSlides(true);
    const savedSlides: { id: string; name: string; dataUrl: string }[] = [];
    const uploadErrors: string[] = [];
    try {
      for (const file of files) {
        try {
          const dataUrl = await fileToDataUrl(file);
          const { slide } = await samplesApi.addSlide(activeSample.id, { name: file.name, imageData: dataUrl });
          const saved = { id: slide.id, name: slide.name, dataUrl: slide.imageData };
          savedSlides.push(saved);
          setUploadedSlides(prev => [...prev, saved]);
        } catch (err) {
          uploadErrors.push(`${file.name}: ${err instanceof Error ? err.message : 'upload failed'}`);
        }
      }

      if (savedSlides.length > 0) {
        setCustomSlideDataUrl(savedSlides[0].dataUrl);
        setActiveSlideRef(savedSlides[0].id);
        setScanSummary(
          savedSlides.length === 1
            ? `Image saved to this specimen as ${savedSlides[0].name}. Run "Scan Field with Roboflow" to analyse it.`
            : `${savedSlides.length} images saved to this specimen. Select a thumbnail to choose the active slide, then scan it.`
        );
      }
      if (uploadErrors.length > 0) {
        setInferenceError(`Some images could not be saved: ${uploadErrors.join('; ')}`);
      }
    } catch (err) {
      setInferenceError(err instanceof Error ? `Failed to save slide images: ${err.message}` : 'Failed to save slide images.');
    } finally {
      setIsSavingSlides(false);
    }
  };

  const selectSlide = (slide: { id: string; name: string; dataUrl: string }) => {
    setCustomSlideDataUrl(slide.dataUrl);
    setActiveSlideRef(slide.id);
    setInferenceError(null);
  };

  const removeSlide = async (id: string) => {
    if (!activeSample) return;
    setInferenceError(null);
    try {
      await samplesApi.removeSlide(activeSample.id, id);
      setUploadedSlides(prev => prev.filter(s => s.id !== id));
      if (activeSlideRef === id) {
        setCustomSlideDataUrl(null);
        setActiveSlideRef('primary');
      }
    } catch (err) {
      setInferenceError(err instanceof Error ? err.message : 'Could not remove this slide image.');
    }
  };

  useEffect(() => {
    const sampleId = activeSample?.id;
    if (!sampleId) {
      setResolvedImageUrl(null);
      return;
    }

    let current = true;
    setResolvedImageUrl(activeSample.imageUrl ?? null);
    if (!activeSample.imageUrl) {
      void samplesApi.detail(sampleId)
        .then(({ sample }) => {
          if (current) setResolvedImageUrl(sample.imageUrl ?? null);
        })
        .catch(err => {
          if (current) {
            setInferenceError(err instanceof Error ? `Could not load the specimen image: ${err.message}` : 'Could not load the specimen image.');
          }
        });
    }
    return () => { current = false; };
  }, [activeSample?.id, activeSample?.imageUrl]);

  const handleGenerateReportClick = async () => {
    if (!activeAnalysis) return;
    setGateError(null);
    try {
      const report = await onGenerateReport(activeAnalysis.id);
      onOpenReportModal(report);
    } catch (err) {
      setGateError(err instanceof Error ? err.message : String(err));
    }
  };

  // Camera capture from the connected microscope (shared hook).
  const switchCamera = () => {
    if (camera.devices.length < 2) return;
    const current = camera.devices.findIndex(d => d.deviceId === camera.deviceId);
    const next = camera.devices[(current + 1) % camera.devices.length];
    setCameraPreviewReady(false);
    camera.switchDevice(next.deviceId);
  };

  const captureFrame = async () => {
    if (!activePatient || !activeSample) return;
    const dataUrl = camera.capture();
    if (!dataUrl) return;
    camera.close();
    setInferenceError(null);
    setIsSavingSlides(true);
    try {
      const name = `Microscope capture ${new Date().toLocaleString()}`;
      const { slide } = await samplesApi.addSlide(activeSample.id, { name, imageData: dataUrl });
      const saved = { id: slide.id, name: slide.name, dataUrl: slide.imageData };
      setUploadedSlides(prev => [...prev, saved]);
      setCustomSlideDataUrl(saved.dataUrl);
      setActiveSlideRef(saved.id);
      setScanSummary(`Microscope capture saved to this specimen. Starting scan…`);
      await handleTriggerAnalysis(saved.dataUrl, saved.id);
    } catch (err) {
      setInferenceError(err instanceof Error ? `Could not save microscope capture: ${err.message}` : 'Could not save microscope capture.');
    } finally {
      setIsSavingSlides(false);
    }
  };

  useEffect(() => {
    if (!camera.open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        camera.close();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [camera.open, camera.close]);

  useEffect(() => {
    if (!camera.open) setCameraPreviewReady(false);
  }, [camera.open]);

  /**
   * Summarises what the technologist has actually adjudicated.
   *
   * This replaced a "Multimodal Pathological Diagnostic Consultation" button
   * that waited 700ms and printed canned diagnostic prose. No model produced
   * that text; it was fabricated on the spot and looked authoritative. A
   * derived summary of confirmed findings is the honest version of the same
   * affordance.
   */
  const buildAdjudicationSummary = (): string | null => {
    if (!activeAnalysis || !activeSample) return null;

    const confirmed = activeAnalysis.findings.filter(f => f.confirmedCount > 0);
    const pending = activeAnalysis.detections.filter(d => !d.confirmed && !d.rejected).length;
    const rejectedCount = activeAnalysis.detections.filter(d => d.rejected).length;

    if (confirmed.length === 0) {
      return (
        `No confirmed findings. ${activeAnalysis.detections.length} candidate(s) were proposed, ` +
        `${rejectedCount} rejected, ${pending} awaiting adjudication across ` +
        `${activeSample.fieldsExamined} field(s) at ${activeSample.totalMagnification}.`
      );
    }

    const lines = confirmed
      .map(f => `${f.displayName}: ${f.confirmedCount} confirmed — ${f.standardizedQuantity} (${f.clinicalSignificance.replace('_', ' ')})`)
      .join('; ');

    return (
      `${lines}. Examined across ${activeSample.fieldsExamined} field(s) at ` +
      `${activeSample.totalMagnification} (${activeSample.stainMethod}). ` +
      `${rejectedCount} candidate(s) rejected, ${pending} awaiting adjudication. ` +
      `This is a count of technologist-confirmed detections, not an interpretation.`
    );
  };

  const handleAiConsultation = () => {
    setAiAssistantImpression(buildAdjudicationSummary());
  };

  if (!activeAnalysis || !activePatient || !activeSample) {
    if (activePatient && activeSample) {
      const analysisError = inferenceError || pendingInferenceError;
      return (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-amber-300 dark:border-amber-800 p-5 sm:p-8 max-w-2xl mx-auto">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1">
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                {pendingInferenceActive
                  ? 'Specimen loaded — AI analysis is running'
                  : analysisError
                    ? 'Specimen saved; AI analysis did not complete'
                    : 'Specimen ready for AI analysis'}
              </h3>
              <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
                {activePatient.fullName} · {activeSample.slideLabel} · {activeSample.sampleType}
              </p>
              {analysisError ? (
                <p role="alert" className="text-sm font-medium text-amber-900 dark:text-amber-200 mt-3 break-words">
                  {analysisError}
                </p>
              ) : pendingInferenceActive ? (
                <p role="status" className="text-sm text-slate-600 dark:text-slate-300 mt-3">
                  The first image is being scanned. Your saved specimen images are listed below; you can switch images now.
                </p>
              ) : (
                <p className="text-sm text-slate-600 dark:text-slate-300 mt-3">
                  This saved specimen does not have an analysis yet.
                </p>
)}
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <span className="text-xs text-slate-600 dark:text-slate-300">
                  {slidesLoading
                    ? 'Loading saved images…'
                    : `${slideChoices.length} image${slideChoices.length === 1 ? '' : 's'} available`}
                </span>
                <label
                  aria-disabled={slidesLoading || isSavingSlides}
                  className={`px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-semibold ${
                    slidesLoading || isSavingSlides ? 'opacity-50 cursor-wait' : 'cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  {isSavingSlides ? 'Saving images…' : 'Load additional images'}
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleCustomUpload}
                    disabled={slidesLoading || isSavingSlides}
                    className="hidden"
                  />
                </label>
              </div>
              {slideChoices.length > 0 && (
                <div className="mt-4 rounded-xl border border-slate-200 dark:border-slate-700 p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="text-xs font-bold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                      {slidesLoading ? 'Loading images…' : 'Select an image to scan'}
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => changeSlide(-1)}
                        disabled={slidesLoading || slideChoices.length < 2}
                        aria-label="Previous specimen image"
                        className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300 dark:border-slate-600 disabled:opacity-40"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </button>
                      <span className="min-w-20 text-center text-xs font-mono text-slate-600 dark:text-slate-300" aria-live="polite">
                        {activeSlidePosition >= 0 ? `${activeSlidePosition + 1} / ${slideChoices.length}` : `0 / ${slideChoices.length}`}
                      </span>
                      <button
                        type="button"
                        onClick={() => changeSlide(1)}
                        disabled={slidesLoading || slideChoices.length < 2}
                        aria-label="Next specimen image"
                        className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300 dark:border-slate-600 disabled:opacity-40"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {slideChoices.map((slide, index) => (
                      <button
                        key={slide.id}
                        type="button"
                        onClick={() => {
                          if (slide.id === 'primary') {
                            setCustomSlideDataUrl(null);
                            setActiveSlideRef('primary');
                          } else {
                            selectSlide(slide);
                          }
                        }}
                        aria-pressed={slide.id === activeSlideRef}
                        title={`Select ${slide.name}`}
                        className={`shrink-0 rounded-lg border-2 p-1 text-left ${
                          slide.id === activeSlideRef
                            ? 'border-cyan-600 ring-2 ring-cyan-200 dark:ring-cyan-900'
                            : 'border-slate-200 dark:border-slate-700'
                        }`}
                      >
                        <img src={slide.dataUrl} alt="" className="h-14 w-20 rounded object-cover" />
                        <span className="mt-1 block max-w-20 truncate text-[10px] text-slate-600 dark:text-slate-300">
                          {index + 1}. {slide.name}
                        </span>
                      </button>
                    ))}
                  </div>
                  {activeImageUrl && (
                    <div className="mt-3 flex flex-col items-center gap-3 rounded-lg bg-slate-950 p-2">
                      <img src={activeImageUrl} alt="Selected specimen image" className="max-h-64 max-w-full object-contain" />
                      <span className="text-[11px] font-mono text-slate-300">
                        {slideChoices.find(slide => slide.id === activeSlideRef)?.name || 'Selected specimen image'}
                      </span>
                    </div>
                  )}
                </div>
              )}
              <button
                type="button"
                onClick={() => void handleTriggerAnalysis()}
                disabled={isAnalyzing || pendingInferenceActive || isSavingSlides || slidesLoading}
                className="mt-4 px-4 py-2 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white rounded-lg font-bold text-sm inline-flex items-center gap-2"
              >
                <Play className="w-4 h-4" />
                {pendingInferenceActive || isAnalyzing
                  ? 'Running AI analysis...'
                  : `Scan ${slideChoices.find(slide => slide.id === activeSlideRef)?.name || 'selected image'}`}
              </button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-xs">
        <Microscope className="w-12 h-12 text-slate-300 mx-auto mb-3" />
        <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">No Specimen Accessions Ready</h3>
        <p className="text-slate-500 mt-1 mb-4">
          Accession a patient specimen to initiate computer vision microscopy analysis.
        </p>
        <button
          type="button"
          onClick={onOpenNewPatientModal}
          className="px-4 py-2 bg-slate-900 text-white rounded-lg font-semibold cursor-pointer"
        >
          Accession Patient Specimen
        </button>
      </div>
    );
  }

  const totalFields = Math.max(1, activeSample.fieldsExamined || 10);
  const confirmedCount = activeAnalysis.detections.filter(d => d.confirmed && !d.rejected).length;
  const totalDets = activeAnalysis.detections.filter(d => !d.rejected).length;
  const pendingCount = totalDets - confirmedCount;

  // Workflow steps reflect real state. Step 2 previously used
  // `currentField > 0`, which is unconditionally true.
  const isStep1Done = true;
  const isStep2Done = Boolean(activeAnalysis.analyzedAt);
  const isStep3Done = totalDets > 0;
  const isStep4Done = totalDets > 0 && pendingCount === 0;
  const isStep5Done = activeAnalysis.status === 'verified';

  const workflowSteps = [
    { label: 'Accession', done: isStep1Done },
    { label: 'AI Inference', done: isStep2Done },
    { label: `Adjudication ${confirmedCount}/${totalDets}`, done: isStep3Done },
    { label: 'Draft Report', done: isStep4Done },
    { label: 'Verification', done: isStep5Done }
  ];
  const activeStepIndex = workflowSteps.findIndex(step => !step.done);

  return (
    <div className="space-y-4">
      {/* Visual Clinical Workflow Step Bar */}
      <div
        className="bg-white dark:bg-slate-900 px-4 py-3.5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs transition-colors duration-200"
        aria-label="Clinical workflow progress"
      >
        <ol className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto no-scrollbar pb-0.5">
          {workflowSteps.map((step, index) => {
            const isActive = index === activeStepIndex;
            return (
              <li key={step.label} className="flex items-center gap-1.5 sm:gap-2 whitespace-nowrap shrink-0">
                {index > 0 && (
                  <span
                    aria-hidden
                    className={`h-0.5 w-4 sm:w-7 rounded-full transition-colors ${
                      workflowSteps[index - 1].done ? 'bg-green-600' : 'bg-slate-200 dark:bg-slate-700'
                    }`}
                  />
                )}
                <span
                  className={`inline-flex items-center gap-1.5 sm:gap-2 rounded-full pl-1 pr-3 sm:pr-3.5 py-1 border text-xs sm:text-sm font-bold transition-colors ${
                    step.done
                      ? 'bg-green-600 border-green-600 text-white shadow-sm'
                      : isActive
                        ? 'bg-white dark:bg-slate-900 border-green-500 text-green-800 dark:text-green-300 ring-2 ring-green-200 dark:ring-green-900/60'
                        : 'bg-transparent border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400'
                  }`}
                >
                  <span
                    className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] ${
                      step.done
                        ? 'bg-white/25'
                        : isActive
                          ? 'bg-green-600 text-white'
                          : 'bg-slate-100 dark:bg-slate-800'
                    }`}
                  >
                    {step.done ? <Check className="w-3 h-3" /> : index + 1}
                  </span>
                  {step.label}
                </span>
              </li>
            );
          })}
        </ol>
      </div>

      {/* Top Session Ribbon */}
      <div className="bg-white dark:bg-slate-900 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs flex flex-wrap items-center justify-between gap-3 text-xs transition-colors duration-200">
        <div className="flex items-center gap-3">
          <div>
            <label className="text-xs font-bold text-slate-500 dark:text-slate-400 block uppercase">
              SPECIMEN ACCESSION
            </label>
            <select
              value={activeAnalysis.id}
              onChange={e => setSelectedAnalysisId(e.target.value)}
              className="bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 font-semibold rounded-lg px-2.5 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-cyan-500"
            >
              {analyses.map(a => {
                const pat = patients.find(p => p.id === a.patientId);
                return (
                  <option key={a.id} value={a.id}>
                    {pat?.fullName || 'Patient'} · {pat?.patientNumber}
                  </option>
                );
              })}
            </select>
          </div>

          <div className="hidden sm:block border-l border-slate-200 dark:border-slate-800 pl-3">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 block uppercase">
              SPECIMEN MATRIX
            </span>
            <span className="font-semibold text-slate-800 dark:text-slate-200 capitalize">
              {activeSample.sampleType} ({activeSample.totalMagnification})
            </span>
          </div>

          <div className="hidden md:block border-l border-slate-200 dark:border-slate-800 pl-3">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 block uppercase">
              ACTIVE ROBOFLOW PIPELINE
            </span>
            <select
              value={selectedModelId}
              onChange={e => setSelectedModelId(e.target.value)}
              title={`${activeModel.name} (${activeModel.roboflowWorkflowId || activeModel.roboflowModel})`}
              className="bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-lg px-2 py-1 text-xs font-mono max-w-[150px] cursor-pointer"
            >
              {models.map(m => (
                <option key={m.id} value={m.id}>
                  {compactPipelineLabel(m.roboflowWorkflowId || m.roboflowModel)}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Inference Execution Actions */}
        <div className="flex items-center gap-2">
          {/* AI Consult Button */}
          <button
            type="button"
            onClick={handleAiConsultation}
            className="px-3 py-1.5 bg-indigo-50 dark:bg-indigo-950/50 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 rounded-lg text-sm font-bold flex items-center gap-1.5 transition cursor-pointer"
            title="Summarise the detections you have adjudicated"
          >
            <Bot className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
            <span className="hidden sm:inline">Adjudication Summary</span>
          </button>

          {/* Toggle raw JSON inspector */}
          <button
            type="button"
            onClick={() => setShowRawInspector(!showRawInspector)}
            className="px-2.5 py-1.5 border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-lg text-xs font-mono flex items-center gap-1 transition cursor-pointer"
            title="Inspect Roboflow Serverless JSON output"
          >
            <Code2 className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
            <span className="hidden sm:inline">JSON</span>
          </button>

          {/* Upload new slide photos (one or more at a time) */}
          <label
            aria-disabled={slidesLoading || isSavingSlides}
            className={`px-3 py-1.5 border border-slate-300 dark:border-slate-700 hover:border-slate-400 dark:hover:border-slate-600 bg-slate-50 dark:bg-slate-950 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-lg font-medium transition flex items-center gap-1.5 ${
              slidesLoading || isSavingSlides ? 'opacity-50 cursor-wait' : 'cursor-pointer'
            }`}
            title="Load one or more slide photos"
          >
            <Upload className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
            <span className="hidden sm:inline">Load Slide</span>
            <input type="file" accept="image/*" multiple onChange={handleCustomUpload} disabled={isSavingSlides || slidesLoading} className="hidden" />
          </label>

          {/* Capture from microscope camera */}
          <button
            type="button"
            onClick={() => void camera.openCamera()}
            disabled={isAnalyzing || isSavingSlides}
            className="px-3 py-1.5 border border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950/50 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
            title="Capture live frame from connected microscope camera"
          >
            <Camera className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            <span className="hidden sm:inline">Capture from Microscope</span>
          </button>

          <button
            type="button"
            onClick={() => void handleTriggerAnalysis()}
            disabled={isAnalyzing || isSavingSlides}
            className="px-4 py-1.5 bg-slate-900 hover:bg-slate-800 dark:bg-cyan-600 dark:hover:bg-cyan-500 text-white rounded-lg text-sm font-bold flex items-center gap-2 shadow-xs transition disabled:opacity-50 cursor-pointer"
          >
            {isAnalyzing ? (
              <>
                <RotateCcw className="w-3.5 h-3.5 animate-spin text-cyan-400" />
                <span>Invoking Serverless YOLO...</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 fill-current text-cyan-400 dark:text-white" />
                <span>Scan Field with Roboflow</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Uploaded slide thumbnails — click to select the active slide */}
      {uploadedSlides.length > 0 && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 shadow-xs">
          <div className="flex items-center gap-3 overflow-x-auto no-scrollbar">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 shrink-0">
              {slidesLoading ? 'Loading saved slides…' : isSavingSlides ? 'Saving images…' : `Saved Slides (${uploadedSlides.length})`}
            </span>
            <button
              type="button"
              onClick={() => { setActiveSlideRef('primary'); setCustomSlideDataUrl(null); setInferenceError(null); }}
              title="Switch back to the specimen's stored slide image"
              className={`shrink-0 px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider border transition ${
                activeSlideRef === 'primary'
                  ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300'
                  : 'border-slate-300 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-slate-400'
              }`}
            >
              Specimen image
            </button>
            {uploadedSlides.map((slide, index) => {
              const isActive = activeSlideRef === slide.id;
              const hasFindings = analyses.some(analysis =>
                analysis.sampleId === activeSample?.id &&
                analysis.detections.some(d => d.imageRef === slide.id)
              );
              return (
                <div key={slide.id} className="shrink-0">
                  <button
                    type="button"
                    onClick={() => selectSlide(slide)}
                    title={`Use ${slide.name} as the active slide`}
                    className={`relative block w-16 h-12 overflow-hidden rounded-lg border-2 transition ${
                      isActive
                        ? 'border-emerald-500 ring-2 ring-emerald-500/30'
                        : 'border-slate-300 dark:border-slate-700 hover:border-slate-400 dark:hover:border-slate-500'
                    }`}
                  >
                    <img src={slide.dataUrl} alt={slide.name} className="w-full h-full object-cover" />
                    {hasFindings && (
                      <span className="absolute top-0.5 right-0.5 w-2 h-2 rounded-full bg-emerald-500 ring-1 ring-white dark:ring-slate-900" title="Findings recorded for this slide" />
                    )}
                  </button>
                  <div className="relative w-16 mt-0.5">
                    <span className="block text-[9px] text-slate-500 dark:text-slate-400 text-center truncate">
                      {index + 1}. {slide.name}
                    </span>
                    <button
                      type="button"
                      onClick={() => void removeSlide(slide.id)}
                      disabled={hasFindings || isSavingSlides || isAnalyzing}
                      aria-label={`Remove ${slide.name}`}
                      title={hasFindings ? 'This slide has saved scan findings and cannot be removed.' : 'Remove this saved slide'}
                      className="absolute top-0 right-0 w-3.5 h-3.5 bg-slate-700 hover:bg-red-600 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-full flex items-center justify-center cursor-pointer"
                    >
                      <X className="w-2 h-2" />
                    </button>
                  </div>
                </div>
              );
            })}
            <button
              type="button"
              onClick={() => changeSlide(1)}
              aria-label="Next slide"
              title="Next specimen image"
              className="shrink-0 w-7 h-12 flex items-center justify-center rounded-lg border border-slate-300 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-emerald-500 hover:text-emerald-600 disabled:opacity-40"
              disabled={slideChoices.length < 2}
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => changeSlide(-1)}
              aria-label="Previous slide"
              title="Previous specimen image"
              className="shrink-0 w-7 h-12 flex items-center justify-center rounded-lg border border-slate-300 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-emerald-500 hover:text-emerald-600 disabled:opacity-40"
              disabled={slideChoices.length < 2}
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Raw JSON Inference Inspector Drawer */}
      {showRawInspector && (
        <div className="bg-slate-950 border border-slate-800 p-4 rounded-xl text-slate-300 font-mono text-xs shadow-xl animate-fade-in">
          <div className="flex items-center justify-between pb-2 border-b border-slate-800 mb-2">
            <div className="flex items-center gap-2">
              <Terminal className="w-4 h-4 text-cyan-400" />
              <span className="text-cyan-400 font-bold">
                Roboflow Serverless Response Inspector · {activeModel.endpoint}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setShowRawInspector(false)}
              className="text-slate-400 hover:text-white cursor-pointer"
            >
              ✕
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3 text-[11px]">
            <div className="bg-slate-900 p-2 rounded border border-slate-800">
              <span className="text-slate-500 block">HTTP Status:</span>
              <span className="text-emerald-400 font-bold">200 OK</span>
            </div>
            <div className="bg-slate-900 p-2 rounded border border-slate-800">
              <span className="text-slate-500 block">Detections:</span>
              <span className="text-white font-bold">{activeAnalysis.detections.length} objects</span>
            </div>
            <div className="bg-slate-900 p-2 rounded border border-slate-800">
              <span className="text-slate-500 block">Declared Input:</span>
              <span className="text-white font-bold">image (base64)</span>
            </div>
            <div className="bg-slate-900 p-2 rounded border border-slate-800">
              <span className="text-slate-500 block">Workflow ID:</span>
              <span className="text-cyan-300 font-bold truncate block">{activeModel.roboflowWorkflowId || 'logic'}</span>
            </div>
          </div>
          <pre className="max-h-48 overflow-y-auto text-[11px] text-slate-300 bg-slate-900 p-2.5 rounded border border-slate-800">
            {JSON.stringify(
              {
                workflow_id: activeModel.roboflowWorkflowId || "labsight-vlabsight-3-yolo26m-t1-logic",
                workspace: activeModel.roboflowWorkspace || "laurent-kashinje",
                timestamp: activeAnalysis.analyzedAt,
                predictions: activeAnalysis.detections.map(d => ({
                  class: d.class,
                  confidence: parseFloat((d.confidence).toFixed(3)),
                  box: { x: d.x, y: d.y, width: d.width, height: d.height }
                }))
              },
              null,
              2
            )}
          </pre>
        </div>
      )}

      {/* Report gate rejection */}
      {gateError && (
        <div role="alert" className="bg-amber-50 border border-amber-300 p-3 rounded-xl text-xs flex items-start gap-2.5 text-amber-900">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <span className="font-bold text-amber-950 block">Report not generated</span>
            <p className="leading-relaxed mt-0.5">{gateError}</p>
          </div>
          <button
            type="button"
            onClick={() => setGateError(null)}
            className="text-amber-500 hover:text-amber-800 font-bold ml-2 cursor-pointer"
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      )}

      {/* Inference Failure Banner - loud, never silently substituted.
          Shows the ACTUAL server error; the "add the API key" guidance only
          appears when the server truly has no key. */}
      {inferenceError && (
        <div role="alert" className="bg-slate-900 text-white border border-slate-700 p-3 rounded-xl text-xs flex items-start gap-2.5">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div className="flex-1">
            <span className="font-bold block text-white">
              {/not configured/i.test(inferenceError)
                ? 'Inference is not configured'
                : /scan could not be completed/i.test(inferenceError)
                  ? 'Scan not completed'
                  : /could not save microscope capture/i.test(inferenceError)
                    ? 'Microscope capture could not be saved'
                    : /camera|microscope/i.test(inferenceError)
                      ? 'Microscope camera issue'
                  : 'AI analysis failed'}
            </span>
            <p className="leading-relaxed mt-0.5 text-slate-300 break-words">{inferenceError}</p>
            {/not configured/i.test(inferenceError) && (
              <p className="leading-relaxed mt-1 text-slate-400">
                The server has no Roboflow API key. Ask a Lab Director to add
                <span className="font-mono text-amber-300"> ROBOFLOW_API_KEY</span> to the
                server <span className="font-mono text-amber-300">.env</span> file (or the
                deployment's environment) and restart.
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => setInferenceError(null)}
            className="text-slate-400 hover:text-slate-100 font-bold ml-2 cursor-pointer"
            aria-label="Dismiss error"
          >
            ✕
          </button>
        </div>
      )}

      {/* Adjudication summary banner */}
      {aiAssistantImpression && (
        <div className="bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800 p-3 rounded-xl text-xs flex items-start gap-2.5 text-indigo-900 dark:text-indigo-100">
          <Bot className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />
          <div className="flex-1">
            <span className="font-bold text-indigo-950 dark:text-indigo-100 block">
              Adjudication summary:
            </span>
            <p className="leading-relaxed mt-0.5">{aiAssistantImpression}</p>
          </div>
          <button
            type="button"
            onClick={() => setAiAssistantImpression(null)}
            className="text-indigo-400 hover:text-indigo-700 font-bold ml-2 cursor-pointer"
            aria-label="Dismiss summary"
          >
            ✕
          </button>
        </div>
      )}

      {/* Responsive Pane Switcher for Tablets & Mobile (< lg) */}
      <div role="group" aria-label="Microscopy workspace view" className="lg:hidden flex items-center p-1 bg-slate-100 dark:bg-slate-800 rounded-xl text-xs">
        <button
          type="button"
          onClick={() => setMobileActivePane('microscope')}
          aria-pressed={mobileActivePane === 'microscope'}
          aria-label="Show microscope field view"
          className={`flex-1 min-h-[44px] rounded-lg font-semibold flex items-center justify-center gap-2 transition cursor-pointer ${
            mobileActivePane === 'microscope'
              ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
              : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <Microscope className="w-4 h-4 text-green-700 dark:text-green-400" />
          <span className="truncate">Microscope Field View</span>
        </button>
        <button
          type="button"
          onClick={() => setMobileActivePane('review')}
          aria-pressed={mobileActivePane === 'review'}
          aria-label={`Show findings review, ${totalDets} detections`}
          className={`flex-1 min-h-[44px] rounded-lg font-semibold flex items-center justify-center gap-2 transition cursor-pointer ${
            mobileActivePane === 'review'
              ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
              : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <FileText className="w-4 h-4 text-slate-700 dark:text-slate-300" />
          <span className="truncate">Findings Review ({totalDets})</span>
        </button>
      </div>

      {/* Main Two-Column Stage */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5 min-h-0 lg:min-h-[580px]">
        {/* Left Column: Microscope Canvas */}
        <div className={`lg:col-span-7 flex flex-col ${mobileActivePane === 'review' ? 'hidden lg:flex' : 'flex'}`}>
          <MicroscopeViewer
            imageUrl={activeImageUrl}
            detections={activeAnalysis.detections.filter(d => (d.imageRef ?? 'primary') === activeSlideRef)}
            selectedDetectionId={selectedDetectionId}
            onSelectDetection={id => setSelectedDetectionId(id)}
            onToggleConfirm={id => onToggleConfirmDetection(activeAnalysis.id, id)}
            onRejectDetection={id => onRejectDetection(activeAnalysis.id, id)}
            onAddManualDetection={det => onAddManualDetection(activeAnalysis.id, det)}
            objective={activeSample.objective}
            totalMagnification={activeSample.totalMagnification}
            slideLabel={activeSample.slideLabel}
            availableClasses={activeModel.classes}
            currentField={currentField}
            totalFields={totalFields}
            onFieldChange={f => setCurrentField(f)}
            onPreviousSlide={() => changeSlide(-1)}
            onNextSlide={() => changeSlide(1)}
            slideNavigationLabel={slidesLoading
              ? 'loading images'
              : slideChoices.length > 0
                ? `image ${activeSlidePosition >= 0 ? activeSlidePosition + 1 : 1} of ${slideChoices.length}`
                : 'no saved images'}
            canSwitchSlides={!slidesLoading && slideChoices.length > 1}
            isScanning={isAnalyzing}
          />
        </div>

        {/* Right Column: Technologist Findings Review */}
        <div className={`lg:col-span-5 flex flex-col ${mobileActivePane === 'microscope' ? 'hidden lg:flex' : 'flex'}`}>
          <TechnologistReview
            analysis={activeAnalysis}
            patient={activePatient}
            sample={activeSample}
            onConfirmAll={() => onConfirmAllDetections(activeAnalysis.id)}
            onSelectDetection={id => setSelectedDetectionId(id)}
            selectedDetectionId={selectedDetectionId}
            onToggleConfirmDetection={id => onToggleConfirmDetection(activeAnalysis.id, id)}
            onRejectDetection={id => onRejectDetection(activeAnalysis.id, id)}
            onSaveNotes={(notes, impression) =>
              onSaveAnalysisNotes(activeAnalysis.id, notes, impression)
            }
            onGenerateReport={handleGenerateReportClick}
          />
        </div>
      </div>

      {/* Scan progress + one-line result summary */}
      {(isAnalyzing || scanSummary) && (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 px-3.5 py-2.5 text-xs shadow-xs">
          {isAnalyzing ? (
            <span className="font-mono text-slate-500 dark:text-slate-400">
              <RotateCcw className="w-3.5 h-3.5 animate-spin text-cyan-600 dark:text-cyan-400 inline mr-1.5" />
              Scanning field {currentField} of {totalFields} · {scanSeconds}s elapsed
            </span>
          ) : (
            <span className="text-slate-600 dark:text-slate-300">{scanSummary}</span>
          )}
        </div>
      )}

      {/* Camera Capture Modal */}
      {camera.open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Microscope camera capture"
          className="fixed inset-0 z-50 bg-slate-950/95 flex items-center justify-center p-4"
        >
          <div className="relative w-full max-w-2xl bg-slate-900 rounded-xl border border-slate-700 overflow-hidden shadow-2xl">
            <div className="flex items-center justify-between p-3 border-b border-slate-700 bg-slate-800/50">
              <div className="flex items-center gap-2">
                <Video className="w-5 h-5 text-emerald-400" />
                <span className="font-semibold text-slate-100">Microscope Camera Capture</span>
                <span className="text-[10px] px-2 py-0.5 bg-emerald-900/50 text-emerald-300 rounded font-mono">
                  LIVE
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={switchCamera}
                  className="px-2 py-1 text-[11px] bg-slate-700 hover:bg-slate-600 text-slate-200 rounded transition"
                  title="Flip camera"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span className="ml-1 hidden sm:inline">Flip</span>
                </button>
                <button
                  type="button"
                  onClick={camera.close}
                  className="p-2 hover:bg-slate-700 text-slate-400 hover:text-white rounded transition cursor-pointer"
                  aria-label="Close camera"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <p className="px-3 py-2 border-b border-slate-700 text-xs text-slate-400">
              Allow camera access in the browser and device settings. USB microscope cameras exposed as video devices can be selected here.
            </p>

            {camera.devices.length > 0 && (
              <div className="px-3 py-2 border-b border-slate-700 bg-slate-800/40 flex items-center gap-2 text-xs">
                <span className="text-slate-400 shrink-0">Camera source:</span>
                <select
                  value={camera.deviceId}
                  onChange={event => {
                    setCameraPreviewReady(false);
                    camera.switchDevice(event.target.value);
                  }}
                  className="flex-1 bg-slate-900 border border-slate-700 text-slate-200 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-cyan-600 cursor-pointer"
                >
                  {camera.devices.map(d => (
                    <option key={d.deviceId || d.groupId} value={d.deviceId}>
                      {d.label || `Camera ${d.deviceId ? d.deviceId.slice(0, 8) : '(requesting access)'}`}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {camera.error ? (
              <div className="p-6 text-center space-y-3">
                <AlertTriangle className="w-8 h-8 text-red-400 mx-auto" />
                <p className="text-sm text-slate-300">{camera.error}</p>
                <div className="flex items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={() => void camera.openCamera()}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold transition cursor-pointer"
                  >
                    Retry
                  </button>
                  <button
                    type="button"
                    onClick={camera.close}
                    className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg text-xs transition cursor-pointer"
                  >
                    Close
                  </button>
                </div>
              </div>
            ) : camera.starting ? (
              <div className="p-10 text-center text-sm text-slate-400">Opening camera…</div>
            ) : (
            <div className="relative bg-black p-2">
              <video
                ref={camera.videoRef}
                autoPlay
                playsInline
                aria-label="Microscope camera live preview"
                onLoadedData={() => {
                  const video = camera.videoRef.current;
                  if (video) {
                    setCameraPreviewReady(
                      video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
                        video.videoWidth > 0 &&
                        video.videoHeight > 0
                    );
                    const res = document.getElementById('cameraResolution');
                    if (res) res.textContent = `${video.videoWidth} x ${video.videoHeight}`;
                  }
                }}
                className="w-full aspect-video object-contain bg-black"
              />
              <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between">
                <div className="flex items-center gap-2 bg-slate-900/80 px-3 py-2 rounded-lg text-xs text-slate-300 font-mono">
                  <span>Resolution:</span>
                  <span id="cameraResolution">-- x --</span>
                </div>
                <button
                  type="button"
                  onClick={captureFrame}
                  disabled={isAnalyzing || !cameraPreviewReady}
                  className="min-w-40 px-6 py-3 bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-400 text-white rounded-xl font-semibold text-sm flex items-center justify-center gap-2 shadow-lg transition disabled:opacity-50 cursor-pointer"
                >
                  <Camera className="w-5 h-5" />
                  <span>{cameraPreviewReady ? 'Capture Frame' : 'Preparing preview…'}</span>
                </button>
              </div>
            </div>
            )}
            <div className="p-3 border-t border-slate-700 bg-slate-800/50 text-xs text-slate-400 text-center">
              Position the specimen in the field of view, then click <strong>Capture Frame</strong> to link it into the microscope viewer and run AI analysis.
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
