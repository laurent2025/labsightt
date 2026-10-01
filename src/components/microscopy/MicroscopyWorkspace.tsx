import React, { useState, useEffect, useRef } from 'react';
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
  X
} from 'lucide-react';
import { fileToDataUrl } from '../../services/roboflow';
import { playScanComplete, playCriticalValueAlert } from '../../lib/audioOpticalFeedback';

interface MicroscopyWorkspaceProps {
  patients: Patient[];
  samples: Sample[];
  analyses: Analysis[];
  models: AIModelConfig[];
  currentAnalysisId?: string | null;
  pendingPatientId?: string;
  pendingSampleId?: string;
  pendingInferenceError?: string;
  onRunAnalysis: (patientId: string, sampleId: string, modelId: string, imageUrlOverride?: string) => Promise<Analysis>;
  onToggleConfirmDetection: (analysisId: string, detectionId: string) => void;
  onRejectDetection: (analysisId: string, detectionId: string) => void;
  onConfirmAllDetections: (analysisId: string) => void;
  onAddManualDetection: (analysisId: string, det: Omit<Detection, 'id'>) => void;
  onSaveAnalysisNotes: (analysisId: string, notes: string, impression: string) => void;
  onGenerateReport: (analysisId: string) => Promise<LaboratoryReport>;
  onOpenReportModal: (report: LaboratoryReport) => void;
  onOpenNewPatientModal: () => void;
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
  onRunAnalysis,
  onToggleConfirmDetection,
  onRejectDetection,
  onConfirmAllDetections,
  onAddManualDetection,
  onSaveAnalysisNotes,
  onGenerateReport,
  onOpenReportModal,
  onOpenNewPatientModal
}) => {
  const [selectedAnalysisId, setSelectedAnalysisId] = useState<string>(
    currentAnalysisId || analyses[0]?.id || ''
  );

  const [selectedDetectionId, setSelectedDetectionId] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [selectedModelId, setSelectedModelId] = useState<string>(models[0]?.id || '');
  const [customSlideDataUrl, setCustomSlideDataUrl] = useState<string | null>(null);
  const [showRawInspector, setShowRawInspector] = useState<boolean>(false);

  // Multi-field scanning. The field count comes from the specimen record: it
  // was hardcoded to 10, which contradicted blood films accessioned at 20.
  const [currentField, setCurrentField] = useState<number>(1);

  // Responsive device view switcher for small/medium screens (< lg)
  const [mobileActivePane, setMobileActivePane] = useState<'microscope' | 'review'>('microscope');

  // Adjudication summary state
  const [aiAssistantImpression, setAiAssistantImpression] = useState<string | null>(null);

  // Inference failures are shown to the operator, never substituted.
  const [inferenceError, setInferenceError] = useState<string | null>(null);
  // Report/verification gate rejections surface here.
  const [gateError, setGateError] = useState<string | null>(null);

  // Camera capture from microscope
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [showCameraModal, setShowCameraModal] = useState<boolean>(false);
  const [cameraFacing, setCameraFacing] = useState<'environment' | 'user'>('environment');
  const videoRef = useRef<HTMLVideoElement>(null);

  // Scan progress: elapsed seconds + a one-line result summary after each run.
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
  }, [currentAnalysisId]);

  // A locally uploaded slide belongs to one analysis. Drop it when the
  // operator switches, so patient B is never shown patient A's image.
  useEffect(() => {
    setCustomSlideDataUrl(null);
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

  const activePatient =
    patients.find(p => p.id === activeAnalysis?.patientId) ||
    patients.find(p => p.id === pendingPatientId) ||
    patients.find(p => p.id === activeSample?.patientId);

  const activeModel =
    models.find(m => m.id === activeAnalysis?.modelId) || models[0];

  // Re-run inference with current or selected model. An explicit image
  // override (e.g. a fresh microscope capture) takes precedence over the
  // last uploaded slide so a capture is analysed the instant it is taken.
  const handleTriggerAnalysis = async (imageUrlOverride?: string) => {
    if (!activePatient || !activeSample) return;
    const imageUrl = imageUrlOverride || customSlideDataUrl || activeSample.imageUrl;
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
        imageUrl
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
          ? `Scan finished in ${seconds}s. No objects exceeded the confidence threshold — the field may be empty, out of focus, or below the detection threshold. Review manually before concluding.`
          : `Scan finished in ${seconds}s. ${n} candidate object${n === 1 ? '' : 's'} detected — adjudicate each before the field is confirmed.`
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setInferenceError(message);
      setScanSummary(null);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleCustomUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const dataUrl = await fileToDataUrl(file);
    setCustomSlideDataUrl(dataUrl);
  };

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

  // Camera capture from connected microscope
  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: cameraFacing,
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        }
      });
      setCameraStream(stream);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setShowCameraModal(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setInferenceError(`Camera access failed: ${message}. Ensure a microscope camera is connected and browser permissions are granted.`);
    }
  };

  const stopCamera = () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop());
      setCameraStream(null);
    }
    setShowCameraModal(false);
  };

  const switchCamera = () => {
    setCameraFacing(prev => prev === 'environment' ? 'user' : 'environment');
    if (cameraStream && videoRef.current) {
      stopCamera();
      setTimeout(startCamera, 100);
    }
  };

  const captureFrame = () => {
    if (!videoRef.current || !activePatient || !activeSample) return;
    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
    stopCamera();
    setCustomSlideDataUrl(dataUrl);
    // Trigger analysis with the captured frame
    void handleTriggerAnalysis(dataUrl);
  };

  // The <video> mounts after startCamera() resolves (videoRef.current is null
  // while the stream is being set up), so attach the stream on render.
  useEffect(() => {
    if (showCameraModal && cameraStream && videoRef.current) {
      videoRef.current.srcObject = cameraStream;
      videoRef.current.play().catch(() => undefined);
    }
  }, [showCameraModal, cameraStream]);

  // Cleanup camera on unmount
  useEffect(() => {
    return () => {
      if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
      }
    };
  }, [cameraStream]);

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
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                {analysisError ? 'Specimen saved; AI analysis did not complete' : 'Specimen ready for AI analysis'}
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">
                {activePatient.fullName} · {activeSample.slideLabel} · {activeSample.sampleType}
              </p>
              {analysisError ? (
                <p role="alert" className="text-xs text-amber-900 dark:text-amber-200 mt-3 break-words">
                  {analysisError}
                </p>
              ) : (
                <p className="text-xs text-slate-600 dark:text-slate-300 mt-3">
                  This saved specimen does not have an analysis yet.
                </p>
)}
              <button
                type="button"
                onClick={() => void handleTriggerAnalysis()}
                disabled={isAnalyzing}
                className="mt-4 px-4 py-2 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white rounded-lg font-semibold text-xs inline-flex items-center gap-2"
              >
                <Play className="w-4 h-4" />
                {isAnalyzing ? 'Running AI analysis...' : 'Retry AI analysis'}
              </button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-xs">
        <Microscope className="w-12 h-12 text-slate-300 mx-auto mb-3" />
        <h3 className="text-sm font-semibold text-slate-800">No Specimen Accessions Ready</h3>
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

  const activeImageUrl = customSlideDataUrl || activeSample.imageUrl;
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

  const stepState = (done: boolean) => {
    if (done) return 'bg-green-600 text-white shadow-sm';
    return 'bg-transparent border-2 border-slate-300 dark:border-slate-600 text-slate-500 dark:text-slate-400';
  };

  return (
    <div className="space-y-4">
      {/* Visual Clinical Workflow Step Bar */}
      <div className="bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs transition-colors duration-200">
        <div className="flex items-center justify-between text-xs overflow-x-auto gap-2">
          <div className="flex items-center gap-1.5 whitespace-nowrap">
            <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${stepState(isStep1Done)}`}>
              {isStep1Done ? '✓' : '1'}
            </span>
            <span className="font-semibold text-slate-800 dark:text-slate-200 hidden sm:inline">Accession</span>
          </div>

          <span className="text-slate-300 dark:text-slate-700 shrink-0">──</span>

          <div className="flex items-center gap-1.5 whitespace-nowrap">
            <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${stepState(isStep2Done)}`}>
              {isStep2Done ? '✓' : '2'}
            </span>
            <span className="font-semibold text-slate-800 dark:text-slate-200 hidden sm:inline">AI Inference</span>
          </div>

          <span className="text-slate-300 dark:text-slate-700 shrink-0">──</span>

          <div className="flex items-center gap-1.5 whitespace-nowrap">
            <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${stepState(isStep3Done)}`}>
              {isStep3Done ? '✓' : '3'}
            </span>
            <span className="font-semibold text-slate-800 dark:text-slate-200 hidden sm:inline">Adjudication ({confirmedCount}/{totalDets})</span>
          </div>

          <span className="text-slate-300 dark:text-slate-700 shrink-0">──</span>

          <div className="flex items-center gap-1.5 whitespace-nowrap">
            <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${stepState(isStep4Done)}`}>
              {isStep4Done ? '✓' : '4'}
            </span>
            <span className="font-semibold text-slate-800 dark:text-slate-200 hidden sm:inline">Draft Report</span>
          </div>

          <span className="text-slate-300 dark:text-slate-700 shrink-0">──</span>

          <div className="flex items-center gap-1.5 whitespace-nowrap">
            <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${stepState(isStep5Done)}`}>
              {isStep5Done ? '✓' : '5'}
            </span>
            <span className="font-semibold text-slate-800 dark:text-slate-200 hidden sm:inline">Independent Verification</span>
          </div>
        </div>
      </div>

      {/* Top Session Ribbon */}
      <div className="bg-white dark:bg-slate-900 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs flex flex-wrap items-center justify-between gap-3 text-xs transition-colors duration-200">
        <div className="flex items-center gap-3">
          <div>
            <label className="text-[10px] text-slate-400 dark:text-slate-500 block font-medium uppercase">
              SPECIMEN ACCESSION
            </label>
            <select
              value={activeAnalysis.id}
              onChange={e => setSelectedAnalysisId(e.target.value)}
              className="bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 font-semibold rounded-lg px-2.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-cyan-500"
            >
              {analyses.map(a => {
                const pat = patients.find(p => p.id === a.patientId);
                return (
                  <option key={a.id} value={a.id}>
                    {pat?.fullName || 'Patient'} · {pat?.patientNumber} ({a.modelName})
                  </option>
                );
              })}
            </select>
          </div>

          <div className="hidden sm:block border-l border-slate-200 dark:border-slate-800 pl-3">
            <span className="text-[10px] text-slate-400 dark:text-slate-500 block font-medium uppercase">
              SPECIMEN MATRIX
            </span>
            <span className="font-semibold text-slate-800 dark:text-slate-200 capitalize">
              {activeSample.sampleType} ({activeSample.totalMagnification})
            </span>
          </div>

          <div className="hidden md:block border-l border-slate-200 dark:border-slate-800 pl-3">
            <span className="text-[10px] text-slate-400 dark:text-slate-500 block font-medium uppercase">
              ACTIVE ROBOFLOW PIPELINE
            </span>
            <select
              value={selectedModelId}
              onChange={e => setSelectedModelId(e.target.value)}
              className="bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-lg px-2 py-1 text-xs font-mono"
            >
              {models.map(m => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.roboflowWorkflowId || m.roboflowModel})
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
            className="px-3 py-1.5 bg-indigo-50 dark:bg-indigo-950/50 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
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

          {/* Upload new slide photo */}
          <label className="px-3 py-1.5 border border-slate-300 dark:border-slate-700 hover:border-slate-400 dark:hover:border-slate-600 bg-slate-50 dark:bg-slate-950 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-lg font-medium cursor-pointer transition flex items-center gap-1.5">
            <Upload className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
            <span className="hidden sm:inline">Load Slide</span>
            <input type="file" accept="image/*" onChange={handleCustomUpload} className="hidden" />
          </label>

          {/* Capture from microscope camera */}
          <button
            type="button"
            onClick={startCamera}
            disabled={isAnalyzing}
            className="px-3 py-1.5 border border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950/50 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
            title="Capture live frame from connected microscope camera"
          >
            <Camera className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            <span className="hidden sm:inline">Capture from Microscope</span>
          </button>

          <button
            type="button"
            onClick={() => void handleTriggerAnalysis()}
            disabled={isAnalyzing}
            className="px-4 py-1.5 bg-slate-900 hover:bg-slate-800 dark:bg-cyan-600 dark:hover:bg-cyan-500 text-white rounded-lg font-semibold flex items-center gap-2 shadow-xs transition disabled:opacity-50 cursor-pointer"
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

      {/* Raw JSON Inference Inspector Drawer */}
      {showRawInspector && (
        <div className="bg-slate-950 border border-slate-800 p-4 rounded-xl text-slate-300 font-mono text-xs shadow-xl animate-fadeIn">
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
                workflow_id: activeModel.roboflowWorkflowId || "labsight-vlabsight-1-yolo26m-t1-logic",
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
              {/not configured/i.test(inferenceError) ? 'Inference is not configured' : 'AI analysis failed'}
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
      <div className="lg:hidden flex items-center p-1 bg-slate-100 dark:bg-slate-800 rounded-xl text-xs">
        <button
          type="button"
          onClick={() => setMobileActivePane('microscope')}
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
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 min-h-[580px]">
        {/* Left Column: Microscope Canvas */}
        <div className={`lg:col-span-7 flex flex-col ${mobileActivePane === 'review' ? 'hidden lg:flex' : 'flex'}`}>
          <MicroscopeViewer
            imageUrl={activeImageUrl}
            detections={activeAnalysis.detections}
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
      {showCameraModal && cameraStream && (
        <div className="fixed inset-0 z-50 bg-slate-950/95 flex items-center justify-center p-4">
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
                  title="Switch camera (front/back)"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span className="ml-1 hidden sm:inline">Switch</span>
                </button>
                <button
                  type="button"
                  onClick={stopCamera}
                  className="p-2 hover:bg-slate-700 text-slate-400 hover:text-white rounded transition"
                  aria-label="Close camera"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="relative bg-black p-2">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                onLoadedMetadata={() => {
                  if (videoRef.current) {
                    const res = document.getElementById('cameraResolution');
                    if (res) res.textContent = `${videoRef.current.videoWidth} x ${videoRef.current.videoHeight}`;
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
                  disabled={isAnalyzing}
                  className="px-6 py-3 bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-400 text-white rounded-xl font-semibold text-sm flex items-center gap-2 shadow-lg transition disabled:opacity-50 cursor-pointer"
                >
                  <Camera className="w-5 h-5" />
                  <span>Capture Frame</span>
                </button>
              </div>
            </div>
            <div className="p-3 border-t border-slate-700 bg-slate-800/50 text-xs text-slate-400 text-center">
              Position the specimen in the field of view, then click <strong>Capture Frame</strong> to run AI analysis.
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
