import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Patient, Sample, Analysis, AIModelConfig, Detection, DetectionImage, LaboratoryReport } from '../../types';
import { MicroscopeViewer } from './MicroscopeViewer';
import { TechnologistReview } from './TechnologistReview';
import {
  Play,
  RotateCcw,
  Upload,
  Microscope,
  Bot,
  Code2,
  Terminal,
  AlertTriangle,
  Camera,
  Video,
  X,
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronRight,
  Layers
} from 'lucide-react';
import { prepareImageForUpload, downscaleImage } from '../../services/roboflow';
import {
  readCachedSlidesForSample,
  writeCachedSlide,
  clearCachedSlide
} from '../../lib/slideCache';
import { playScanComplete, playCriticalValueAlert } from '../../lib/audioOpticalFeedback';
import { ApiError, detectionImagesApi, samplesApi, analysesApi } from '../../services/api';
import { useMicroscopeCamera } from '../../hooks/useMicroscopeCamera';
import { userFriendlyError } from '../../lib/userFriendlyError';

// The Roboflow workflow id ("lenziai-pro-vlenziai-pro-1-yolo26s-t1-logic") and the
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
  onRunAnalysis: (patientId: string, sampleId: string, modelId: string, imageUrlOverride?: string, imageRefOverride?: string, scanToken?: string) => Promise<Analysis>;
  onToggleConfirmDetection: (analysisId: string, detectionId: string) => void;
  onRejectDetection: (analysisId: string, detectionId: string) => void;
  onConfirmAllDetections: (analysisId: string) => void;
  onAddManualDetection: (analysisId: string, det: Omit<Detection, 'id'>) => void | Promise<void>;
  onSaveAnalysisNotes: (analysisId: string, notes: string, impression: string) => void;
  onGenerateReport: (analysisId: string) => Promise<LaboratoryReport>;
  onOpenReportModal: (report: LaboratoryReport) => void;
  onOpenNewPatientModal: () => void;
  onSwitchPatient: (patientId: string, sampleId: string) => void;
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
  onSwitchPatient,
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
  const [aiAssistantImpression, setAiAssistantImpression] = useState<string | null>(null);
  const [inferenceError, setInferenceError] = useState<string | null>(null);
  const [gateError, setGateError] = useState<string | null>(null);
  const camera = useMicroscopeCamera();
  const [cameraPreviewReady, setCameraPreviewReady] = useState(false);
  const [uploadedSlides, setUploadedSlides] = useState<{ id: string; name: string; dataUrl: string }[]>([]);
  const [slidesLoading, setSlidesLoading] = useState(false);
  const [isSavingSlides, setIsSavingSlides] = useState(false);
  const [slideSaveProgress, setSlideSaveProgress] = useState<{ completed: number; total: number; failed: number } | null>(null);
  const [loadingSlideId, setLoadingSlideId] = useState<string | null>(null);
  // Which uploaded image of the specimen is being reviewed. 'primary' is the
  // sample's stored slide; any other value is an uploaded slide id. Every
  // detection is tagged with this ref so the viewer can show only the boxes
  // that belong to the slide currently displayed while the report keeps them
  // all.
  const [activeSlideRef, setActiveSlideRef] = useState<string>('primary');

const [scanSeconds, setScanSeconds] = useState<number>(0);
  const [scanSummary, setScanSummary] = useState<string | null>( null );
  // Position within a "Scan All Images" pass, so the operator can see which
  // image is being worked through while several are being worked through in one action.
  const [scanProgress, setScanProgress] = useState<{ current: number; total: number } | null>(null);
  /**
   * Tile-level progress of the scan currently in flight.
   *
   * A slide is cut into overlapping tiles and a 63-tile scan takes far longer
   * than the request body it returns from, so the operator gets a real bar
   * instead of a spinner. The server reports each completed tile under a token
   * the client chose before the request was issued, so the client can poll for
   * progress while the request is still in flight rather than waiting for the
   * analysis id the server assigns.
   */
  const [tileProgress, setTileProgress] = useState<{ completed: number; total: number; elapsedMs: number; failed?: number; etaMs?: number | null } | null>(null);
  const tileProgressTokenRef = useRef<string | null>(null);
  const tilePollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopTilePolling = useCallback(() => {
    if (tilePollTimerRef.current) {
      clearTimeout(tilePollTimerRef.current);
      tilePollTimerRef.current = null;
    }
  }, []);

  const pollTileProgress = useCallback((token: string) => {
    stopTilePolling();
    tileProgressTokenRef.current = token;
    let current = true;
    let lastCompleted = 0;
    let lastChanged = Date.now();
    const POLL_FAST = 350;
    const POLL_SLOW = 1000;

    const tick = () => {
      if (!current) return;
      analysesApi.scanProgress(token).then(({ running, completed = 0, total = 0, elapsedMs = 0, failed = 0, etaMs = null }) => {
        if (!current) return;
        if (running) {
          setTileProgress({ completed, total, elapsedMs, failed, etaMs });
          if (completed !== lastCompleted) {
            lastCompleted = completed;
            lastChanged = Date.now();
          } else if (Date.now() - lastChanged > 3000) {
            // Progress has stalled visually; slow the poll to reduce load.
            tilePollTimerRef.current = setTimeout(tick, POLL_SLOW);
            return;
          }
          tilePollTimerRef.current = setTimeout(tick, POLL_FAST);
        } else {
          setTileProgress(null);
          stopTilePolling();
        }
      }).catch(() => {
        // A poll failure is not worth surfacing: the scan itself is the
        // authoritative outcome and its own error path will report it.
        if (current) setTileProgress(null);
        if (current) tilePollTimerRef.current = setTimeout(tick, POLL_FAST);
      });
    };

    tilePollTimerRef.current = setTimeout(tick, POLL_FAST);
    return () => {
      current = false;
    };
  }, [analysesApi, stopTilePolling]);
  useEffect(() => {
    if (!isAnalyzing) return;
    setScanSeconds(0);
    const started = Date.now();
    const t = setInterval(() => setScanSeconds(Math.floor((Date.now() - started) / 1000)), 500);
    return () => clearInterval(t);
  }, [isAnalyzing]);

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

  // Switching analyses within the same specimen keeps the current image,
  // because images are specimen-scoped and restored from the server when
  // needed. Switching to a different specimen resets the slide view so the
  // previous patient's uploaded photos and boxes never appear under the new
  // patient's name.
  const activeSampleIdRef = useRef<string | null>(null);
  useEffect(() => {
    const nextSampleId =
      pendingSampleId ?? analyses.find(a => a.id === selectedAnalysisId)?.sampleId ?? null;
    setInferenceError(null);
    setScanSummary(null);
    setSelectedDetectionId(null);
    if (activeSampleIdRef.current !== null && activeSampleIdRef.current !== nextSampleId) {
      setCustomSlideDataUrl(null);
      setActiveSlideRef('primary');
      setUploadedSlides([]);
    }
    activeSampleIdRef.current = nextSampleId;
  }, [selectedAnalysisId, pendingSampleId, analyses]);

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

  /**
   * The pictures saved with this analysis's decisions.
   *
   * Listed without their payloads, so the panel can show which findings have
   * one without carrying every crop. Refreshed when the analysis changes and
   * after any ruling, since a ruling is what creates the picture.
   */
  const [evidenceImages, setEvidenceImages] = useState<DetectionImage[]>([]);
  const [evidenceVersion, setEvidenceVersion] = useState(0);

  useEffect(() => {
    const analysisId = activeAnalysis?.id;
    if (!analysisId) {
      setEvidenceImages([]);
      return;
    }

    let current = true;
    detectionImagesApi
      .list(analysisId)
      .then(({ images }) => {
        if (current) setEvidenceImages(images);
      })
      .catch(() => {
        // The panel is the evidence, not the review: a read failure leaves the
        // findings list intact and the operator can still rule on them.
        if (current) setEvidenceImages([]);
      });

    return () => {
      current = false;
    };
  }, [activeAnalysis?.id, evidenceVersion]);

  /** Runs a ruling, then refreshes the saved pictures it produced. */
  const runDecision = useCallback(async (work: () => void | Promise<void>) => {
    try {
      await work();
    } finally {
      // Refreshed whether or not the ruling landed, so a failure cannot leave a
      // picture on screen that the database does not hold.
      setEvidenceVersion(version => version + 1);
    }
  }, []);

  const handleToggleConfirm = useCallback(
    (id: string) => runDecision(() => onToggleConfirmDetection(activeAnalysis!.id, id)),
    [runDecision, onToggleConfirmDetection, activeAnalysis]
  );

  const handleRejectDetection = useCallback(
    (id: string) => runDecision(() => onRejectDetection(activeAnalysis!.id, id)),
    [runDecision, onRejectDetection, activeAnalysis]
  );

  const handleConfirmAll = useCallback(
    () => runDecision(() => onConfirmAllDetections(activeAnalysis!.id)),
    [runDecision, onConfirmAllDetections, activeAnalysis]
  );

  const handleAddManualDetection = useCallback(
    (det: Omit<Detection, 'id'>) =>
      runDecision(() =>
        onAddManualDetection(activeAnalysis!.id, { ...det, imageRef: activeSlideRef })
      ),
    [runDecision, onAddManualDetection, activeAnalysis, activeSlideRef]
  );

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

    // Show cached photographs immediately so switching specimens does not sit
    // on a blank stage, then reconcile with the server, which is the record of
    // truth for what slides a specimen has.
    void readCachedSlidesForSample(sampleId)
      .then(cached => {
        if (!current || cached.size === 0) return;
        const instant = [...cached.entries()].map(([id, dataUrl]) => ({
          id,
          name: id,
          dataUrl
        }));
        setUploadedSlides(previous => {
          const byId = new Map(previous.map(slide => [slide.id, slide]));
          // Cached rows only fill gaps; anything already listed is kept.
          for (const slide of instant) if (!byId.has(slide.id)) byId.set(slide.id, slide);
          return [...byId.values()];
        });
      })
      .catch(() => {
        // A cache miss or a storage failure is not worth reporting: the
        // network fetch below is the authoritative path.
      });

    void samplesApi.slides(sampleId, true)
      .then(({ slides }) => {
        if (current) {
          const persistedSlides = slides.map(slide => ({
            id: slide.id,
            name: slide.name,
            dataUrl: slide.imageData || ''
          }));
          setUploadedSlides(previous => {
            const byId = new Map(persistedSlides.map(slide => [slide.id, slide]));
            previous.forEach(slide => byId.set(slide.id, slide));
            return [...byId.values()];
          });
          // Write through so the next open of this specimen is instant. Each
          // write is independent and failures are ignored by the cache.
          for (const slide of persistedSlides) {
            void writeCachedSlide(sampleId, slide.id, slide.dataUrl);
          }
        }
      })
      .catch(err => {
        if (current) {
          setInferenceError(userFriendlyError(err, 'Could not load saved specimen images.'));
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
  const slideChoices = useMemo(() => [
    ...(primaryImageUrl ? [{ id: 'primary', name: 'Specimen image', dataUrl: primaryImageUrl }] : []),
    ...uploadedSlides
  ], [primaryImageUrl, uploadedSlides]);
  const activeImageUrl = customSlideDataUrl || primaryImageUrl || '';
  const changeSlide = useCallback((direction: -1 | 1) => {
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
    if (uploadedSlide) {
      setCustomSlideDataUrl(uploadedSlide.dataUrl);
      setActiveSlideRef(uploadedSlide.id);
      setInferenceError(null);
    }
  }, [activeSlideRef, slideChoices, slidesLoading, uploadedSlides]);
  const handlePreviousSlide = useCallback(() => changeSlide(-1), [changeSlide]);
  const handleNextSlide = useCallback(() => changeSlide(1), [changeSlide]);
  const activeSlidePosition = slideChoices.findIndex(slide => slide.id === activeSlideRef);

  // Re-run inference with current or selected model. An explicit image
  // override (e.g. a fresh microscope capture) takes precedence over the
  // last uploaded slide so a capture is analysed the instant it is taken.
  // Returns the analysis the scan produced, or null when it did not run.
  const handleTriggerAnalysis = async (imageUrlOverride?: string, imageRefOverride?: string): Promise<Analysis | null> => {
    if (!activePatient || !activeSample) return null;
    const imageUrl = imageUrlOverride || customSlideDataUrl || resolvedImageUrl;
    if (!imageUrl) {
      setInferenceError('No slide image is loaded for this specimen. Use "Load Slide" or "Capture from Microscope" to attach one, then retry.');
      return null;
    }
    // A token chosen here, before the request is issued, lets the progress
    // poll watch the scan while it is still in flight rather than waiting for
    // the analysis id the server assigns.
    const scanToken = `scan-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const cleanup = pollTileProgress(scanToken);
    setIsAnalyzing(true);
    setInferenceError(null);
    setScanSummary(null);
    setTileProgress(null);
    const startedAt = Date.now();
    try {
      const newAna = await onRunAnalysis(
        activePatient.id,
        activeSample.id,
        selectedModelId || activeModel.id,
        imageUrl,
        imageRefOverride ?? activeSlideRef,
        scanToken
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
      // How many of this specimen's images still have no findings.
      const scannedRefs = new Set(newAna.detections.map(d => d.imageRef ?? 'primary'));
      const remaining = slideChoices.filter(slide => !scannedRefs.has(slide.id)).length;
      setScanSummary(
        (n === 0
          ? `Scan finished in ${seconds}s. No parasites were detected in this scan. This does not rule out infection; review the slide manually before drawing a conclusion.`
          : `Scan finished in ${seconds}s. ${n} candidate object${n === 1 ? '' : 's'} detected across all scanned images of this specimen — adjudicate each before the report is generated.`)
        + (remaining > 0 ? ` ${remaining} of ${slideChoices.length} image${slideChoices.length === 1 ? '' : 's'} still to scan.` : '')
      );
      return newAna;
    } catch (err) {
      if (err instanceof ApiError && err.status === 402) return null;
      setInferenceError(userFriendlyError(err, 'The microscope analysis could not be completed. Please try again.'));
      setScanSummary(null);
      return null;
    } finally {
      cleanup();
      setTileProgress(null);
      setIsAnalyzing(false);
    }
  };

  /**
   * Scans the image on screen and then moves to the next unscanned one, so the
   * operator can work through a batch slide by slide instead of switching back
   * and forth. Stops on the last unscanned image rather than wrapping around,
   * so the end of the batch is obvious.
   */
  const handleScanAndNext = async () => {
    // The returned analysis is the authoritative post-scan state, so the
    // advance decision is made from fresh findings rather than a stale render.
    const scanned = await handleTriggerAnalysis();
    if (!scanned) return;

    const scannedRefs = new Set(scanned.detections.map(d => d.imageRef ?? 'primary'));
    const unscanned = slideChoices.filter(slide => !scannedRefs.has(slide.id) && slide.id !== activeSlideRef);
    const next = unscanned[0];
    if (!next) return;
    if (next.id === 'primary') {
      setCustomSlideDataUrl(null);
      setActiveSlideRef('primary');
    } else {
      const uploaded = uploadedSlides.find(slide => slide.id === next.id);
      if (uploaded) selectSlide(uploaded);
    }
  };

  /**
   * Scans every loaded image of this specimen in one action and folds the
   * results into the single active analysis, so one report covers the whole
   * specimen.
   *
   * The server appends each image's findings to the active analysis and scopes
   * its de-duplication by image ref, so scanning the images one after another
   * produces exactly the same combined result as scanning them individually —
   * this only removes the repeated button presses.
   */
  const handleScanAllImages = async () => {
    if (!activePatient || !activeSample) return null;
    if (slideChoices.length === 0) {
      setInferenceError('No slide images are loaded for this specimen. Use "Load Slide" or "Capture from Microscope" first, then retry.');
      return;
    }

    // Re-scanning an image adds nothing: the server de-duplicates by image ref
    // plus box, so an already-scanned image is skipped to save the operator
    // the provider round-trips. If every image is already scanned the pass
    // still runs, so an explicit re-read is honoured.
    const scannedRefs = new Set(
      (activeAnalysis?.detections ?? []).map(d => d.imageRef ?? 'primary')
    );
    const pending = slideChoices.filter(slide => !scannedRefs.has(slide.id));
    const queue = pending.length > 0 ? pending : slideChoices;

    setIsAnalyzing(true);
    setInferenceError(null);
    setScanSummary(null);
    setScanProgress({ current: 0, total: queue.length });

    const startedAt = Date.now();
    let lastAnalysis: Analysis | null = null;
    let unscannable = 0;
    let blocked = false;

    try {
      for (let index = 0; index < queue.length; index += 1) {
        const slide = queue[index];
        setScanProgress({ current: index + 1, total: queue.length });
        try {
          let imageData = slide.dataUrl;
          if (!imageData && slide.id !== 'primary') {
            const loaded = await samplesApi.slide(activeSample.id, slide.id);
            imageData = loaded.slide.imageData;
            setUploadedSlides(previous => previous.map(item =>
              item.id === slide.id ? { ...item, dataUrl: imageData } : item
            ));
            void writeCachedSlide(activeSample.id, slide.id, imageData);
          }
          lastAnalysis = await onRunAnalysis(
            activePatient.id,
            activeSample.id,
            selectedModelId || activeModel.id,
            imageData,
            slide.id
          );
        } catch (err) {
          // A provider-side payment block cannot be fixed by retrying another
          // image, so stop the pass and surface the existing handling.
          if (err instanceof ApiError && err.status === 402) {
            blocked = true;
            break;
          }
          // One unreadable image must not lose the rest of the pass.
          unscannable += 1;
        }
      }

      if (!lastAnalysis) return;

      setSelectedAnalysisId(lastAnalysis.id);
      playScanComplete();
      if (lastAnalysis.findings.some(f => f.clinicalSignificance === 'critical' || f.clinicalSignificance === 'pathological')) {
        setTimeout(() => playCriticalValueAlert(), 350);
      }

      const seconds = Math.round((Date.now() - startedAt) / 1000);
      const n = lastAnalysis.detections.length;
      const lead = blocked
        ? 'Scan stopped early because the provider rejected the request.'
        : `Scanned ${queue.length} image${queue.length === 1 ? '' : 's'} in ${seconds}s.`;
      const tail = n === 0
        ? 'No parasites were detected. This does not rule out infection; review the slides manually before drawing a conclusion.'
        : `${n} candidate object${n === 1 ? '' : 's'} detected across all scanned images of this specimen — adjudicate each before the report is generated.`;
      setScanSummary(
        `${lead} ${tail}${unscannable > 0 ? ` ${unscannable} image${unscannable === 1 ? '' : 's'} could not be scanned.` : ''}`
      );
    } finally {
      setScanProgress(null);
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
    setSlideSaveProgress({ completed: 0, total: files.length, failed: 0 });
    const savedSlides: { id: string; name: string; dataUrl: string }[] = [];
    const uploadErrors: string[] = [];
    try {
      // Prepare and save independent images concurrently. Sequential uploads
      // made selecting several fields feel like the application had stalled.
      const results = await Promise.all(files.map(async file => {
        try {
          // Scaled before it is sent: a full photograph is several megabytes of
          // base64 before it is even encrypted, and the platform refuses that
          // body outright. The slide only ever needs to survive a detector read
          // at 640px and a technologist's screen.
          const dataUrl = await prepareImageForUpload(file);
          const { slide } = await samplesApi.addSlide(activeSample.id, { name: file.name, imageData: dataUrl });
          setSlideSaveProgress(previous => previous
            ? { ...previous, completed: previous.completed + 1 }
            : previous);
          return { ok: true as const, saved: { id: slide.id, name: slide.name, dataUrl: slide.imageData } };
        } catch (err) {
          setSlideSaveProgress(previous => previous
            ? { ...previous, completed: previous.completed + 1, failed: previous.failed + 1 }
            : previous);
          return { ok: false as const, message: `${file.name}: ${userFriendlyError(err, 'upload could not be completed')}` };
        }
      }));
      for (const result of results) {
        if (result.ok) {
          savedSlides.push(result.saved);
          void writeCachedSlide(activeSample.id, result.saved.id, result.saved.dataUrl);
        } else {
          uploadErrors.push(result.message);
        }
      }
      if (savedSlides.length > 0) {
        setUploadedSlides(prev => [...prev, ...savedSlides]);
      }

      if (savedSlides.length > 0) {
        setCustomSlideDataUrl(savedSlides[0].dataUrl);
        setActiveSlideRef(savedSlides[0].id);
        setScanSummary(
          savedSlides.length === 1
            ? `Image saved to this specimen as ${savedSlides[0].name}. Run "Scan Field with LenziAI" to analyse it.`
            : `${savedSlides.length} images saved to this specimen. Select a thumbnail to choose the active slide, then scan it.`
        );
      }
      if (uploadErrors.length > 0) {
        setInferenceError(`Some images could not be saved: ${uploadErrors.join('; ')}`);
      }
    } catch (err) {
      setInferenceError(userFriendlyError(err, 'Failed to save slide images.'));
    } finally {
      setIsSavingSlides(false);
      setSlideSaveProgress(null);
    }
  };

  const selectSlide = async (slide: { id: string; name: string; dataUrl: string }) => {
    setInferenceError(null);
    if (slide.dataUrl) {
      setCustomSlideDataUrl(slide.dataUrl);
      setActiveSlideRef(slide.id);
      return;
    }
    if (!activeSample) return;
    setLoadingSlideId(slide.id);
    try {
      const { slide: loaded } = await samplesApi.slide(activeSample.id, slide.id);
      const dataUrl = loaded.imageData;
      setUploadedSlides(prev => prev.map(item => item.id === slide.id ? { ...item, dataUrl } : item));
      void writeCachedSlide(activeSample.id, slide.id, dataUrl);
      setCustomSlideDataUrl(dataUrl);
      setActiveSlideRef(slide.id);
    } catch (err) {
      setInferenceError(userFriendlyError(err, 'Could not load this slide image.'));
    } finally {
      setLoadingSlideId(null);
    }
  };

  const removeSlide = async (id: string) => {
    if (!activeSample) return;
    setInferenceError(null);
    try {
      await samplesApi.removeSlide(activeSample.id, id);
      setUploadedSlides(prev => prev.filter(s => s.id !== id));
      // Drop the cache entry too, or the removed photograph is served from
      // IndexedDB the next time this specimen is opened.
      void clearCachedSlide(activeSample.id, id);
      if (activeSlideRef === id) {
        setCustomSlideDataUrl(null);
        setActiveSlideRef('primary');
      }
    } catch (err) {
      setInferenceError(userFriendlyError(err, 'Could not remove this slide image.'));
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
            setInferenceError(userFriendlyError(err, 'Could not load the specimen image.'));
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
      setGateError(userFriendlyError(err, 'The report could not be generated. Please try again.'));
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
    if (!activePatient || !activeSample) return null;
    const dataUrl = camera.capture();
    if (!dataUrl) return;
    camera.close();
    setInferenceError(null);
    setIsSavingSlides(true);
    try {
      const name = `Microscope capture ${new Date().toLocaleString()}`;
      // Same scaling as a file upload: a camera frame at full resolution is a
      // request body the platform will refuse.
      const imageData = await downscaleImage(dataUrl);
      const { slide } = await samplesApi.addSlide(activeSample.id, { name, imageData });
      const saved = { id: slide.id, name: slide.name, dataUrl: slide.imageData };
      setUploadedSlides(prev => [...prev, saved]);
          void writeCachedSlide(activeSample.id, saved.id, saved.dataUrl);
      setCustomSlideDataUrl(saved.dataUrl);
      setActiveSlideRef(saved.id);
      setScanSummary(`Microscope capture saved to this specimen. Starting scan…`);
      await handleTriggerAnalysis(saved.dataUrl, saved.id);
    } catch (err) {
      setInferenceError(userFriendlyError(err, 'Could not save microscope capture.'));
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

  // These derived values must be declared before the empty/pending state
  // return below. Keeping hooks in one unconditional path prevents React's
  // hook order error when an analysis finishes loading into the workspace.
  const activeDetections = useMemo(
    () => activeAnalysis?.detections.filter(d => (d.imageRef ?? 'primary') === activeSlideRef) ?? [],
    [activeAnalysis?.detections, activeSlideRef]
  );
  const slideNames = useMemo(
    () => Object.fromEntries(slideChoices.map(slide => [slide.id, slide.name])),
    [slideChoices]
  );

  if (!activeAnalysis || !activePatient || !activeSample) {
    if (activePatient && activeSample) {
      const analysisError = inferenceError || pendingInferenceError;
      return (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-amber-300 dark:border-amber-800 p-4 sm:p-5 max-w-2xl mx-auto">
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
                  Your specimen images are being scanned. Results will appear here as each image finishes.
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
                            void selectSlide(slide);
                          }
                        }}
                        aria-pressed={slide.id === activeSlideRef}
                        disabled={isAnalyzing || loadingSlideId !== null}
                        title={`Select ${slide.name}`}
                        className={`shrink-0 rounded-lg border-2 p-1 text-left ${
                          slide.id === activeSlideRef
                            ? 'border-cyan-600 ring-2 ring-cyan-200 dark:ring-cyan-900'
                            : 'border-slate-200 dark:border-slate-700'
                        }`}
                      >
                        {slide.dataUrl ? (
                          <img src={slide.dataUrl} alt="" className="h-14 w-20 rounded object-cover" loading="lazy" />
                        ) : (
                          <span className="flex h-14 w-20 items-center justify-center rounded bg-slate-100 text-[9px] font-semibold text-slate-400 dark:bg-slate-800 dark:text-slate-500">
                            {loadingSlideId === slide.id ? 'Loading…' : 'Select to load'}
                          </span>
                        )}
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
      <div className="rounded-xl border border-slate-200 bg-white p-12 text-center text-xs dark:border-slate-800 dark:bg-slate-900">
        <Microscope className="mx-auto mb-3 h-12 w-12 text-slate-500 dark:text-slate-400" />
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">No Specimen Accessions Ready</h3>
        <p className="mt-1 mb-4 text-slate-600 dark:text-slate-300">
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
    <div className="microscopy-workspace min-w-0 space-y-5 bg-slate-50/70 text-slate-900 dark:bg-transparent dark:text-slate-100">
      {/* Visual Clinical Workflow Step Bar */}
      <div
        className="bg-white dark:bg-slate-900 px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs transition-colors duration-200"
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

      {/* Session identity and clinical context */}
      <section className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900" aria-labelledby="microscopy-session-title">
        <div className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-emerald-400 via-cyan-500 to-indigo-500" aria-hidden="true" />
        <div className="flex flex-col gap-4 p-4 pl-5 sm:p-5 sm:pl-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="mb-1 flex flex-wrap items-center gap-2 text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-600 dark:text-emerald-400">
              <span>Active microscopy session</span>
              <span className="h-1 w-1 rounded-full bg-slate-300 dark:bg-slate-600" aria-hidden="true" />
              <span className="text-slate-500 dark:text-slate-400">{activeSample.slideLabel || 'Specimen review'}</span>
            </div>
            <h1 id="microscopy-session-title" className="truncate text-xl font-bold tracking-tight text-slate-950 dark:text-white sm:text-2xl">
              {activePatient.fullName}
            </h1>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
              <span className="font-mono">{activePatient.patientNumber}</span>
              <span aria-hidden="true">·</span>
              <span className="capitalize">{activeSample.sampleType}</span>
              <span aria-hidden="true">·</span>
              <span>{activeSample.stainMethod || 'Unstained preparation'}</span>
            </p>
          </div>

          <div className="grid grid-cols-3 gap-2 sm:flex sm:items-stretch sm:gap-3">
            <div className="min-w-24 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-800 dark:bg-slate-950/60">
              <span className="block text-[10px] font-bold uppercase tracking-wide text-slate-600 dark:text-slate-400">Magnification</span>
              <span className="mt-1 block text-sm font-bold text-slate-800 dark:text-slate-100">{activeSample.totalMagnification || '—'}</span>
            </div>
            <div className="min-w-24 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-800 dark:bg-slate-950/60">
              <span className="block text-[10px] font-bold uppercase tracking-wide text-slate-600 dark:text-slate-400">Fields</span>
              <span className="mt-1 block text-sm font-bold text-slate-800 dark:text-slate-100">{activeSample.fieldsExamined || 0}</span>
            </div>
            <div className="min-w-24 rounded-xl border border-cyan-200 bg-cyan-50 px-3 py-2 dark:border-cyan-900/70 dark:bg-cyan-950/30">
              <span className="block text-[10px] font-bold uppercase tracking-wide text-cyan-700 dark:text-cyan-400">Candidates</span>
              <span className="mt-1 block text-sm font-bold text-cyan-900 dark:text-cyan-100">{totalDets}</span>
            </div>
          </div>
        </div>
      </section>

      {/* Top Session Ribbon */}
      <div className="microscopy-command-bar overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-colors duration-200 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/80 px-4 py-2.5 dark:border-slate-800 dark:bg-slate-950/40">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-200">
            <span className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_0_3px_rgba(16,185,129,0.12)]" aria-hidden="true" />
            Examination controls
          </div>
          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">Choose a slide, then scan</span>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 p-3 sm:p-3.5 text-xs">
        <div className="flex items-center gap-3 min-w-0">
          <div>
            <label className="text-xs font-bold text-slate-500 dark:text-slate-400 block uppercase">
              SPECIMEN ACCESSION
            </label>
            <select
              value={activePatient?.id ?? ''}
              onChange={e => {
                const patientId = e.target.value;
                if (!patientId) return;
                const patientSamples = samples
                  .filter(s => s.patientId === patientId)
                  .sort((a, b) => (a.collectionDatetime < b.collectionDatetime ? -1 : 1));
                const sample = patientSamples[0] || samples.find(s => s.patientId === patientId);
                if (sample) {
                  void onSwitchPatient(patientId, sample.id);
                }
              }}
              className="bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 font-semibold rounded-lg px-2.5 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-cyan-500"
            >
              <option value="">Select a patient…</option>
              {patients.map(p => {
                const hasSpecimen = samples.some(s => s.patientId === p.id);
                return (
                  <option key={p.id} value={p.id} disabled={!hasSpecimen}>
                    {p.fullName} · {p.patientNumber}{!hasSpecimen ? ' (no specimen)' : ''}
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
              ACTIVE LENZIAI PIPELINE
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
        <div className="microscopy-command-actions flex items-center gap-2 flex-wrap justify-end w-full xl:w-auto">
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
            title="Inspect LenziAI Serverless JSON output"
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

          {slideChoices.length > 1 && (
            <button
              type="button"
              onClick={() => void handleScanAllImages()}
              disabled={isAnalyzing || isSavingSlides || loadingSlideId !== null}
              title="Scan every loaded image of this specimen and combine the findings into one report"
              className="px-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 hover:border-emerald-500 dark:hover:border-emerald-500 text-slate-700 dark:text-slate-200 rounded-lg text-sm font-bold flex items-center gap-2 shadow-xs transition disabled:opacity-50 cursor-pointer"
            >
              <Layers className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>
                Scan All Images
                <span className="ml-1 font-mono text-[10px] font-normal text-slate-500 dark:text-slate-400">
                  ({slideChoices.length})
                </span>
              </span>
            </button>
          )}

          {slideChoices.length > 1 && (
            <button
              type="button"
              onClick={() => void handleScanAndNext()}
              disabled={isAnalyzing || isSavingSlides || loadingSlideId !== null}
              title="Scan this image, then move to the next unscanned one"
              className="px-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 hover:border-cyan-500 dark:hover:border-cyan-500 text-slate-700 dark:text-slate-200 rounded-lg text-sm font-bold flex items-center gap-2 shadow-xs transition disabled:opacity-50 cursor-pointer"
            >
              <ArrowRight className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
              <span>Scan &amp; Next</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => void handleTriggerAnalysis()}
            disabled={isAnalyzing || isSavingSlides || loadingSlideId !== null || !activeImageUrl}
            className="px-4 py-1.5 bg-slate-900 hover:bg-slate-800 dark:bg-cyan-600 dark:hover:bg-cyan-500 text-white rounded-lg text-sm font-bold flex items-center gap-2 shadow-xs transition disabled:opacity-50 cursor-pointer"
          >
            {isAnalyzing ? (
              <>
                <RotateCcw className="w-3.5 h-3.5 animate-spin text-cyan-400" />
                <span>
                  {scanProgress
                    ? `Scanning image ${scanProgress.current} of ${scanProgress.total}…`
                    : 'Invoking Serverless YOLO...'}
                </span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 fill-current text-cyan-400 dark:text-white" />
                <span>Scan Field with LenziAI</span>
              </>
            )}
          </button>
        </div>
        </div>
      </div>

      {/* Uploaded slide thumbnails — click to select the active slide */}
      {uploadedSlides.length > 0 && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-2 shadow-xs">
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
                    onClick={() => void selectSlide(slide)}
                    disabled={isAnalyzing || loadingSlideId !== null}
                    title={`Use ${slide.name} as the active slide`}
                    className={`relative block w-16 h-12 overflow-hidden rounded-lg border-2 transition ${
                      isActive
                        ? 'border-emerald-500 ring-2 ring-emerald-500/30'
                        : 'border-slate-300 dark:border-slate-700 hover:border-slate-400 dark:hover:border-slate-500'
                    }`}
                  >
                    {slide.dataUrl ? (
                      <img src={slide.dataUrl} alt={slide.name} className="w-full h-full object-cover" loading="lazy" />
                    ) : (
                      <span className="flex h-full w-full items-center justify-center bg-slate-100 text-[9px] font-semibold text-slate-400 dark:bg-slate-800 dark:text-slate-500">
                        {loadingSlideId === slide.id ? 'Loading…' : 'Select to load'}
                      </span>
                    )}
                    {loadingSlideId === slide.id && (
                      <span className="absolute inset-0 flex items-center justify-center bg-slate-950/55 text-[9px] font-bold text-white">
                        Loading…
                      </span>
                    )}
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
        <div className="bg-slate-950 border border-slate-800 p-3 rounded-xl text-slate-300 font-mono text-xs shadow-xl animate-fade-in">
          <div className="flex items-center justify-between pb-2 border-b border-slate-800 mb-2">
            <div className="flex items-center gap-2">
              <Terminal className="w-4 h-4 text-cyan-400" />
              <span className="text-cyan-400 font-bold">
                LenziAI Serverless Response Inspector · {activeModel.endpoint}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setShowRawInspector(false)}
              className="text-slate-400 hover:text-white cursor-pointer"
            >
              ✓
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
                workflow_id: activeModel.roboflowWorkflowId || "lenziai-pro-vlenziai-pro-1-yolo26s-t1-logic",
                workspace: activeModel.roboflowWorkspace || "lenziai-pro",
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
        <div role="alert" className="bg-amber-50 border border-amber-300 p-2.5 rounded-xl text-xs flex items-start gap-2 text-amber-900">
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
            ✓
          </button>
        </div>
      )}

      {/* Inference Failure Banner - loud, never silently substituted.
          Shows the ACTUAL server error; the "add the API key" guidance only
          appears when the server truly has no key. */}
      {inferenceError && (
        <div role="alert" className="bg-slate-900 text-white border border-slate-700 p-2.5 rounded-xl text-xs flex items-start gap-2">
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
                The server has no LenziAI inference credentials. Ask a Lab Director to add
                the inference credentials to the server <span className="font-mono text-amber-300">.env</span> file (or the
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
            ✓
          </button>
        </div>
      )}

      {pendingInferenceActive && activeAnalysis && (
        <div role="status" aria-live="polite" className="bg-cyan-50 dark:bg-cyan-950/30 border border-cyan-200 dark:border-cyan-800 p-2.5 rounded-xl text-xs text-cyan-900 dark:text-cyan-100">
          Scanning the remaining specimen images. Results are shown as each image finishes.
        </div>
      )}

      {pendingInferenceError && activeAnalysis && (
        <div role="alert" className="bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-800 p-2.5 rounded-xl text-xs text-amber-900 dark:text-amber-100">
          Some images could not be scanned. Results from completed images are shown. {pendingInferenceError}
        </div>
      )}

      {/* Adjudication summary banner */}
      {aiAssistantImpression && (
        <div className="bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800 p-2.5 rounded-xl text-xs flex items-start gap-2 text-indigo-900 dark:text-indigo-100">
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
            ✓
          </button>
        </div>
      )}

      {/* Microscope stage followed by the full-width findings review. */}
      <div className="microscopy-main-grid grid min-h-0 grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(340px,0.7fr)]">
        <div className="microscopy-field-pane flex min-h-0 w-full flex-col lg:sticky lg:top-4">
        <div className="min-h-0 w-full">
            <MicroscopeViewer
              imageUrl={activeImageUrl}
              detections={activeDetections}
              selectedDetectionId={selectedDetectionId}
              onSelectDetection={setSelectedDetectionId}
              onToggleConfirm={handleToggleConfirm}
              onRejectDetection={handleRejectDetection}
              onAddManualDetection={handleAddManualDetection}
              objective={activeSample.objective}
              totalMagnification={activeSample.totalMagnification}
              slideLabel={activeSample.slideLabel}
              availableClasses={activeModel.classes}
              currentField={currentField}
              totalFields={totalFields}
              onFieldChange={setCurrentField}
              onPreviousSlide={handlePreviousSlide}
              onNextSlide={handleNextSlide}
              slideNavigationLabel={slidesLoading
                ? 'loading images'
                : slideChoices.length > 0
                ? `image ${activeSlidePosition >= 0 ? activeSlidePosition + 1 : 1} of ${slideChoices.length}`
                : 'no saved images'}
              canSwitchSlides={!slidesLoading && slideChoices.length > 1}
              isScanning={isAnalyzing}
            />
          </div>
        </div>

        <div className="microscopy-review-pane flex min-h-0 w-full flex-col">
          <TechnologistReview
            key={activeAnalysis.id}
            analysis={activeAnalysis}
            patient={activePatient}
            sample={activeSample}
            slideNames={slideNames}
            activeSlideRef={activeSlideRef}
            evidenceImages={evidenceImages}
            onConfirmAll={handleConfirmAll}
            onSelectDetection={id => setSelectedDetectionId(id)}
            selectedDetectionId={selectedDetectionId}
            onToggleConfirmDetection={handleToggleConfirm}
            onRejectDetection={handleRejectDetection}
            onSaveNotes={(notes, impression) =>
              onSaveAnalysisNotes(activeAnalysis.id, notes, impression)
            }
            onGenerateReport={handleGenerateReportClick}
          />
        </div>
      </div>

      {/* Image save progress stays separate from AI scan progress: saving is a
          storage operation and should never look like a stalled inference. */}
      {slideSaveProgress && (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-cyan-200 dark:border-cyan-900/70 px-3 py-2.5 text-xs shadow-xs" role="status" aria-live="polite">
          <div className="flex items-center justify-between gap-3 mb-1.5">
            <span className="font-semibold text-slate-700 dark:text-slate-200">
              Saving slide images
            </span>
            <span className="font-mono tabular-nums text-slate-500 dark:text-slate-400">
              {slideSaveProgress.completed}/{slideSaveProgress.total}
              {slideSaveProgress.failed > 0 ? ` · ${slideSaveProgress.failed} failed` : ''}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
            <div
              className="h-full rounded-full bg-cyan-500 transition-all duration-300"
              style={{ width: `${Math.min(100, (slideSaveProgress.completed / slideSaveProgress.total) * 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* Scan progress + one-line result summary */}
      {(isAnalyzing || scanSummary) && (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 px-3 py-2 text-xs shadow-xs">
          {isAnalyzing ? (
            <div className="space-y-2">
              <span className="font-mono text-slate-500 dark:text-slate-400 inline-flex items-center">
                <RotateCcw className="w-3.5 h-3.5 animate-spin text-cyan-600 dark:text-cyan-400 inline mr-1.5" />
                Scanning field {currentField} of {totalFields} · {scanSeconds}s elapsed
              </span>
              {tileProgress && tileProgress.total > 1 && (
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                    <div
                      className="h-full bg-cyan-500 dark:bg-cyan-400 transition-all duration-300"
                      style={{ width: `${Math.min(100, (tileProgress.completed / tileProgress.total) * 100)}%` }}
                    />
                  </div>
                    <span className="font-mono text-slate-500 dark:text-slate-400 tabular-nums whitespace-nowrap">
                    {tileProgress.completed}/{tileProgress.total}
                      {tileProgress.etaMs && tileProgress.etaMs > 1000 ? ` · ~${Math.ceil(tileProgress.etaMs / 1000)}s` : ''}
                      {tileProgress.failed ? ` · ${tileProgress.failed} failed` : ''}
                  </span>
                </div>
              )}
            </div>
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
