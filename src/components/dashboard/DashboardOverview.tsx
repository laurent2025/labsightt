import React, { useState } from 'react';
import { Patient, Analysis, LaboratoryReport, Sample } from '../../types';
import {
  Microscope,
  Users,
  FileCheck2,
  Clock,
  ArrowRight,
  Play
} from 'lucide-react';
import { SLIDE_ASSETS } from '../../lib/constants';
import { useLabStore } from '../../store/labStore';
import { EmptyState } from '../ui/States';
import { AdminOversight } from '../admin/AdminOversight';

interface DashboardOverviewProps {
  patients: Patient[];
  analyses: Analysis[];
  reports: LaboratoryReport[];
  samples: Sample[];
  onNavigateTab: (tab: 'microscopy' | 'patients' | 'reports' | 'audit' | 'users') => void;
  onSelectAnalysis: (analysisId: string) => void;
  onOpenReport: (report: LaboratoryReport) => void;
  onOpenNewPatientModal: () => void;
}

export const DashboardOverview: React.FC<DashboardOverviewProps> = ({
  patients,
  analyses,
  reports,
  samples,
  onNavigateTab,
  onSelectAnalysis,
  onOpenReport,
  onOpenNewPatientModal
}) => {
  const [selectedQuickPipeline, setSelectedQuickPipeline] = useState<'stool' | 'blood' | 'urine'>('stool');
  const { user } = useLabStore();
  const canSeeModelDetails = Boolean(user);

  const verifiedReportsCount = reports.filter(r => r.status === 'verified').length;
  const pendingReviewCount = analyses.filter(a => a.status === 'in_review').length;
  const openMostRecentAnalysis = (status?: Analysis['status']) => {
    const analysis = analyses.find(item => !status || item.status === status);
    if (analysis) onSelectAnalysis(analysis.id);
    else onNavigateTab('microscopy');
  };

  // The overview shows only the newest runs; the full history stays reachable
  // through the workstation's session ribbon rather than a 200-row table.
  const RECENT_LIMIT = 8;
  const recentAnalyses = analyses.slice(0, RECENT_LIMIT);

  const positiveAnalyses = analyses.filter(a =>
    a.findings.some(f => f.clinicalSignificance === 'critical' || f.clinicalSignificance === 'pathological')
  ).length;
  const detectionRate = analyses.length > 0 ? Math.round((positiveAnalyses / analyses.length) * 100) : 0;

  // Derived from the actual analyses in this session. The previous version of
  // this panel rendered a hardcoded SVG trend and fixed percentages (42/28/18/12)
  // that had no relationship to any data.
  const confirmedDetectionTotal = analyses.reduce(
    (sum, a) => sum + a.detections.filter(d => d.confirmed && !d.rejected).length,
    0
  );

  const organismTally = new Map<string, number>();
  for (const analysis of analyses) {
    for (const finding of analysis.findings) {
      organismTally.set(finding.displayName, (organismTally.get(finding.displayName) ?? 0) + finding.confirmedCount);
    }
  }
  const topOrganisms = Array.from(organismTally.entries())
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  const organismMax = topOrganisms[0]?.[1] ?? 1;

  const bySampleType = (['stool', 'blood', 'urine'] as const).map(type => ({
    type,
    count: analyses.filter(a => samples.find(s => s.id === a.sampleId)?.sampleType === type).length
  }));

  // This operator's own work: runs they initiated and reports they generated.
  const MY_WORK_LIMIT = 5;
  const myAnalyses = user ? analyses.filter(a => a.initiatedBy === user.id).slice(0, MY_WORK_LIMIT) : [];
  const myReports = user ? reports.filter(r => r.technologistId === user.id).slice(0, MY_WORK_LIMIT) : [];
  const typeMax = Math.max(1, ...bySampleType.map(t => t.count));

  // Reference pipelines. These describe the specimen, the stain, the objective,
  // and the classes the configured endpoint reports. They deliberately carry no
  // accuracy figure: none has ever been measured for this software, and a
  // number here would be indistinguishable from a real validation result.
  // `boxes` was removed for the same reason -- the previous version drew
  // dashed "detection" boxes over a stock photograph, which presented fabricated
  // model output as if a model had run on that image.
  const pipelinePresets = {
    stool: {
      name: "Enteric Parasite & Protozoa Pipeline",
      model: "labsight-yolo26m-workflow (configured endpoint)",
      configured: true,
      stain: "Lugol's Iodine Wet Mount",
      mag: "400x (High Dry 40x)",
      targets: ["Giardia lamblia cysts", "Entamoeba histolytica", "Hookworm ova", "Ascaris lumbricoides"],
      img: SLIDE_ASSETS.stool,
      imgAlt: "Reference image of a stool wet mount slide"
    },
    blood: {
      name: "Peripheral Blood & Hemoparasite Differential",
      model: "No endpoint configured for blood specimens",
      configured: false,
      stain: "Giemsa Thin Blood Film",
      mag: "1000x (Oil Immersion 100x)",
      targets: ["Plasmodium falciparum rings", "Erythrocytes (RBC)", "Neutrophils", "Platelet clumps"],
      img: SLIDE_ASSETS.blood,
      imgAlt: "Reference image of a Giemsa-stained blood film"
    },
    urine: {
      name: "Urinary Sediment & Crystalluria Screen",
      model: "No endpoint configured for urine specimens",
      configured: false,
      stain: "Centrifuged Wet Sediment",
      mag: "400x (High Dry 40x)",
      targets: ["Calcium oxalate dihydrate", "Pus cells (WBCs)", "Squamous epithelial", "Triple phosphate"],
      img: SLIDE_ASSETS.urine,
      imgAlt: "Reference image of a urine sediment slide"
    }
  };

  const activePipeline = pipelinePresets[selectedQuickPipeline];

  return (
    <div className="space-y-6">
      {/* Hero Welcome & Quick Launch Banner */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4 transition-colors duration-200">
        <div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-cyan-700 dark:text-cyan-400">
              PATHOLOGY & CLINICAL MICROSCOPY WORKSTATION
            </span>
            <span className="text-[11px] font-mono text-slate-400 dark:text-slate-500">
              {new Date().toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Welcome back, {user?.name ?? 'Operator'}
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-2xl leading-relaxed">
            {pendingReviewCount > 0
              ? `${pendingReviewCount} analysis${pendingReviewCount === 1 ? '' : 'es'} awaiting review. Open one below to continue adjudication.`
              : 'No analyses are awaiting review. Accession a specimen to start a new microscopy workflow.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={onOpenNewPatientModal}
            className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 dark:bg-cyan-600 dark:hover:bg-cyan-500 text-white rounded-xl text-xs font-semibold flex items-center gap-2 shadow-xs transition whitespace-nowrap cursor-pointer"
          >
            <Microscope className="w-4 h-4 text-cyan-400 dark:text-white" />
            <span>Accession New Specimen</span>
          </button>
          {analyses.length > 0 && (
            <button
              type="button"
              onClick={() => openMostRecentAnalysis(pendingReviewCount > 0 ? 'in_review' : undefined)}
              className="px-4 py-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl text-xs font-semibold flex items-center gap-2 transition whitespace-nowrap cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <span>
                {pendingReviewCount > 0 ? `Review ${pendingReviewCount} pending` : 'Open workstation'}
              </span>
              <ArrowRight className="w-3.5 h-3.5 text-cyan-700 dark:text-cyan-400" />
            </button>
          )}
        </div>
      </div>

      {/* Primary Telemetry Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <button type="button" onClick={() => onNavigateTab('patients')} className="w-full text-left bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs hover:border-cyan-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600 transition-colors duration-200">
          <div className="flex items-center justify-between text-slate-400 dark:text-slate-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Accessioned Patients</span>
            <Users className="w-4 h-4 text-slate-500" />
          </div>
          <div className="text-3xl font-mono font-bold text-slate-900 dark:text-white tabular-nums">
            {patients.length}
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">Active lab cohorts</div>
        </button>

        <button type="button" onClick={() => openMostRecentAnalysis()} className="w-full text-left bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs hover:border-cyan-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600 transition-colors duration-200">
          <div className="flex items-center justify-between text-slate-400 dark:text-slate-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Microscopy Runs</span>
            <Microscope className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
          </div>
          <div className="text-3xl font-mono font-bold text-slate-900 dark:text-white tabular-nums">
            {analyses.length}
          </div>
          <div className="text-xs text-cyan-700 dark:text-cyan-400 font-medium mt-1">Roboflow vision scans complete</div>
        </button>

        <button type="button" onClick={() => openMostRecentAnalysis('in_review')} className="w-full text-left bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs hover:border-cyan-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600 transition-colors duration-200">
          <div className="flex items-center justify-between text-slate-400 dark:text-slate-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Pending Review</span>
            <Clock className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-3xl font-mono font-bold text-amber-600 dark:text-amber-400 tabular-nums">
            {pendingReviewCount}
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">Awaiting technologist sign-off</div>
        </button>

        <button
          type="button"
          onClick={() => {
            const report = reports.find(item => item.status === 'verified' || item.status === 'released');
            if (report) onOpenReport(report);
            else onNavigateTab('reports');
          }}
          className="w-full text-left bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs hover:border-cyan-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600 transition-colors duration-200"
        >
          <div className="flex items-center justify-between text-slate-400 dark:text-slate-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Verified Reports</span>
            <FileCheck2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="text-3xl font-mono font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
            {verifiedReportsCount}
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">ISO 15189 authorized & released</div>
        </button>
      </div>

      {/* Interactive Quick-Test Pipeline Stage & Live Slide Previewer */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-xs transition-colors duration-200">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800 gap-3 mb-5">
          <div>
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">
              Interactive Roboflow Vision Pipelines
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Select calibrated diagnostic models to preview automated morphology classification
            </p>
          </div>

          <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl text-xs">
            <button
              type="button"
              onClick={() => setSelectedQuickPipeline('stool')}
              className={`px-3 py-1.5 rounded-lg font-medium transition cursor-pointer ${
                selectedQuickPipeline === 'stool'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white font-bold shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Stool Parasites
            </button>
            <button
              type="button"
              onClick={() => setSelectedQuickPipeline('blood')}
              className={`px-3 py-1.5 rounded-lg font-medium transition cursor-pointer ${
                selectedQuickPipeline === 'blood'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white font-bold shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Blood Differential
            </button>
            <button
              type="button"
              onClick={() => setSelectedQuickPipeline('urine')}
              className={`px-3 py-1.5 rounded-lg font-medium transition cursor-pointer ${
                selectedQuickPipeline === 'urine'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white font-bold shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Urinary Sediment
            </button>
          </div>
        </div>

        {/* Pipeline Details & Interactive Slide Preview */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
          {/* Left: Specimen Details & Targets (5 cols) */}
          <div className="lg:col-span-5 space-y-4">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-700 dark:text-cyan-400 font-mono">
                DIAGNOSTIC PIPELINE
              </span>
              <h3 className="text-base font-bold text-slate-900 dark:text-white mt-0.5">{activePipeline.name}</h3>
              <p className="text-xs font-mono text-slate-500 dark:text-slate-400 mt-0.5">
                Model:{' '}
                <strong
                  className={
                    activePipeline.configured
                      ? 'text-slate-800 dark:text-slate-200'
                      : 'text-amber-700 dark:text-amber-400'
                  }
                >
                  {canSeeModelDetails ? activePipeline.model : 'Configured on server'}
                </strong>
              </p>
            </div>

            <div className="bg-slate-50 dark:bg-slate-950 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 text-xs space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-500 dark:text-slate-400">Staining Technique:</span>
                <span className="font-semibold text-slate-800 dark:text-slate-200">{activePipeline.stain}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 dark:text-slate-400">Optical Magnification:</span>
                <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">{activePipeline.mag}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-slate-500 dark:text-slate-400">Validation Benchmark:</span>
                <span className="font-semibold text-amber-700 dark:text-amber-400 text-right">
                  Not validated &mdash; no accuracy figure exists for this software
                </span>
              </div>
            </div>

            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 block mb-1.5">
                CLASSIFICATION TARGETS
              </span>
              <div className="flex flex-wrap gap-1.5 text-[11px]">
                {activePipeline.targets.map((t, idx) => (
                  <span
                    key={idx}
                    className="bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-2.5 py-1 rounded-md text-slate-800 dark:text-slate-200 italic"
                  >
                    {t}
                  </span>
                ))}
              </div>
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={() => onNavigateTab('microscopy')}
                className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 dark:bg-cyan-600 dark:hover:bg-cyan-500 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-2 shadow-xs transition cursor-pointer"
              >
                <Play className="w-3.5 h-3.5 fill-current text-cyan-400 dark:text-white" />
                <span>Open in Full Microscopy Workstation</span>
              </button>
            </div>
          </div>

          {/* Right: Reference slide image (7 cols) */}
          <div className="lg:col-span-7">
            <figure className="relative rounded-2xl overflow-hidden border border-slate-800 bg-slate-950 shadow-lg aspect-4/3 flex items-center justify-center">
              <img
                src={activePipeline.img}
                alt={activePipeline.imgAlt}
                className="w-full h-full object-cover"
              />

              {/*
                This is a stock reference photograph of the specimen type. No
                model has run on it, so it carries no detections. The earlier
                version overlaid dashed boxes with organism labels here, which
                made fabricated output indistinguishable from a real result.
              */}
              <div className="absolute bottom-3 left-3 right-3 bg-slate-950/85 backdrop-blur-sm border border-amber-700/50 rounded-lg px-3 py-2 text-[11px] text-amber-200">
                <strong className="font-semibold">Reference image.</strong> Illustrative
                photograph of this specimen type &mdash; not an analysed slide, and no
                detections have been produced from it.
              </div>
            </figure>
          </div>
        </div>
      </div>

      {/* Specimen Workflows & Distribution Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Analyses by specimen type, derived from the local case list */}
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 shadow-xs flex flex-col justify-between transition-colors duration-200">
          <div>
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">Analyses by Specimen Type</h2>
              <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">Last 200 runs</span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
              Counted from the cases stored on the laboratory server
            </p>

            <div className="h-44 w-full flex items-end gap-6 px-2">
              {bySampleType.map(entry => (
                <div key={entry.type} className="flex-1 flex flex-col items-center gap-2">
                  <span className="text-xs font-mono font-bold text-slate-900 dark:text-white">
                    {entry.count}
                  </span>
                  <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-t-md flex items-end" style={{ height: '120px' }}>
                    <div
                      className="w-full bg-cyan-500/80 dark:bg-cyan-500/70 rounded-t-md transition-all duration-300"
                      style={{ height: `${Math.max(2, (entry.count / typeMax) * 100)}%` }}
                    />
                  </div>
                  <span className="text-[11px] capitalize text-slate-500 dark:text-slate-400">{entry.type}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
            <span className="text-slate-500 dark:text-slate-400">Positive detection rate:</span>
            <span className="font-mono font-bold text-slate-800 dark:text-white">{detectionRate}%</span>
          </div>
        </div>

        {/* Technologist-confirmed organism counts */}
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 shadow-xs flex flex-col justify-between transition-colors duration-200">
          <div>
            <h2 className="text-sm font-bold text-slate-900 dark:text-white mb-1">Confirmed Organism Counts</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
              Only technologist-confirmed detections, across all stored cases
            </p>

            {topOrganisms.length === 0 ? (
              <p className="text-xs text-slate-400 dark:text-slate-500 py-8 text-center">
                No confirmed detections yet. Confirm candidate bounding boxes to populate this panel.
              </p>
            ) : (
              <div className="space-y-3 text-xs">
                {topOrganisms.map(([name, count]) => (
                  <div key={name}>
                    <div className="flex justify-between text-slate-700 dark:text-slate-300 font-medium mb-1">
                      <span className="italic">{name}</span>
                      <span className="font-mono text-slate-900 dark:text-white font-bold">{count}</span>
                    </div>
                    <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                      <div
                        className="bg-cyan-500 h-full rounded-full transition-all duration-300"
                        style={{ width: `${Math.max(3, (count / organismMax) * 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
            <span>Total confirmed detections:</span>
            <span className="font-mono font-semibold text-cyan-800 dark:text-cyan-400">{confirmedDetectionTotal}</span>
          </div>
        </div>
      </div>

      {/* My Recent Work — the signed-in operator's own runs and reports */}
      {(myAnalyses.length > 0 || myReports.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs">
            <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800">
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">My Microscopy Runs</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">Analyses you initiated</p>
            </div>
            <ul className="divide-y divide-slate-200 dark:divide-slate-800">
              {myAnalyses.map(ana => {
                const patient = patients.find(p => p.id === ana.patientId);
                const sample = samples.find(s => s.id === ana.sampleId);
                return (
                  <li key={ana.id} className="px-5 py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">
                        {patient?.fullName || 'Unknown Patient'}
                      </div>
                      <div className="text-[11px] font-mono text-slate-400 dark:text-slate-500">
                        {sample?.sampleType ? sample.sampleType.toUpperCase() : '—'} · {new Date(ana.analyzedAt).toLocaleDateString()}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-[10px] font-mono font-semibold uppercase ${
                          ana.status === 'verified'
                            ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300'
                            : ana.status === 'confirmed'
                            ? 'bg-cyan-100 dark:bg-cyan-950 text-cyan-800 dark:text-cyan-300'
                            : 'bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300'
                        }`}
                      >
                        {ana.status.replace('_', ' ')}
                      </span>
                      <button
                        type="button"
                        onClick={() => onSelectAnalysis(ana.id)}
                        className="text-xs font-semibold text-cyan-700 dark:text-cyan-400 hover:text-cyan-800 dark:hover:text-cyan-300 cursor-pointer"
                      >
                        Open
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs">
            <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800">
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">My Reports</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">Laboratory reports you generated</p>
            </div>
            <ul className="divide-y divide-slate-200 dark:divide-slate-800">
              {myReports.map(report => (
                <li key={report.id} className="px-5 py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-slate-800 dark:text-slate-200 font-mono">
                      {report.reportNumber}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">
                      {new Date(report.generatedAt).toLocaleDateString()}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className={`inline-block px-2 py-0.5 rounded text-[10px] font-mono font-semibold uppercase ${
                        report.status === 'released'
                          ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300'
                          : report.status === 'verified'
                          ? 'bg-cyan-100 dark:bg-cyan-950 text-cyan-800 dark:text-cyan-300'
                          : 'bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300'
                      }`}
                    >
                      {report.status.replace('_', ' ')}
                    </span>
                    <button
                      type="button"
                      onClick={() => onOpenReport(report)}
                      className="text-xs font-semibold text-cyan-700 dark:text-cyan-400 hover:text-cyan-800 dark:hover:text-cyan-300 cursor-pointer"
                    >
                      Open
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Administrative oversight: account, chain, and activity summary — admin only */}
      {user?.isAdmin && <AdminOversight onNavigateTab={onNavigateTab} />}

      {/* Recent Analyses Activity Queue — administrative oversight; admin only */}
      {user?.isAdmin && (
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs transition-colors duration-200">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">Recent Microscopy Accessions & Reviews</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">Review, adjust bounding boxes, or sign laboratory reports</p>
          </div>
          <button
            type="button"
            onClick={() => onNavigateTab('reports')}
            className="text-xs text-cyan-700 dark:text-cyan-400 hover:text-cyan-800 dark:hover:text-cyan-300 font-semibold flex items-center gap-1 cursor-pointer"
          >
            <span>View All Reports</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {analyses.length === 0 ? (
          <EmptyState
            title="No microscopy runs yet"
            description="Once a specimen is accessioned and scanned, the latest runs appear here for review and report sign-off."
            action={
              <button
                type="button"
                onClick={onOpenNewPatientModal}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-cyan-700 hover:bg-cyan-800 text-white"
              >
                Accession New Specimen
              </button>
            }
          />
        ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse min-w-[620px]">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                <th className="py-2.5 px-4 font-semibold">Patient & Specimen</th>
                <th className="py-2.5 px-4 font-semibold">Slide Preparation</th>
                <th className="py-2.5 px-4 font-semibold">Primary Microscopic Finding</th>
                <th className="py-2.5 px-4 font-semibold">Review Status</th>
                <th className="py-2.5 px-4 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {recentAnalyses.map(ana => {
                const patient = patients.find(p => p.id === ana.patientId);
                const sample = samples.find(s => s.id === ana.sampleId);

                return (
                  <tr
                    key={ana.id}
                    tabIndex={0}
                    aria-label={`Open microscopy analysis for ${patient?.fullName || 'patient'}`}
                    onClick={event => {
                      if ((event.target as HTMLElement).closest('button')) return;
                      onSelectAnalysis(ana.id);
                    }}
                    onKeyDown={event => {
                      if (event.target !== event.currentTarget) return;
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        onSelectAnalysis(ana.id);
                      }
                    }}
                    className="cursor-pointer hover:bg-cyan-50/70 dark:hover:bg-cyan-950/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-cyan-600 transition-colors"
                  >
                    <td className="py-3 px-4">
                      <div className="font-semibold text-slate-900 dark:text-white">{patient?.fullName || 'Unknown Patient'}</div>
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
                        <span className="text-slate-400 dark:text-slate-500">
                          No candidates proposed
                        </span>
                      ) : (
                        <span className="text-slate-400 dark:text-slate-500">
                          All candidates rejected by reviewer
                        </span>
                      )}
                    </td>

                    <td className="py-3 px-4">
                      <span
                        className={`inline-block px-2.5 py-0.5 rounded text-[10px] font-mono font-semibold uppercase ${
                          ana.status === 'verified'
                            ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300'
                            : ana.status === 'confirmed'
                            ? 'bg-cyan-100 dark:bg-cyan-950 text-cyan-800 dark:text-cyan-300'
                            : 'bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300'
                        }`}
                      >
                        {ana.status.replace('_', ' ')}
                      </span>
                    </td>

                    <td className="py-3 px-4 text-right">
                      <button
                        type="button"
                        onClick={() => onSelectAnalysis(ana.id)}
                        className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 dark:bg-cyan-600 dark:hover:bg-cyan-500 text-white rounded-lg text-xs font-medium inline-flex items-center gap-1.5 transition cursor-pointer"
                      >
                        <Microscope className="w-3.5 h-3.5" />
                        <span>Open Microscope</span>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        )}

        {analyses.length > RECENT_LIMIT && (
          <div className="px-5 py-3 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="text-slate-500 dark:text-slate-400 font-mono">
              Showing the {RECENT_LIMIT} most recent of {analyses.length} runs
            </span>
            <button
              type="button"
              onClick={() => onNavigateTab('microscopy')}
              className="text-cyan-700 dark:text-cyan-400 hover:text-cyan-800 dark:hover:text-cyan-300 font-semibold flex items-center gap-1 cursor-pointer"
            >
              <span>Open workstation to browse all</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
      )}
    </div>
  );
};
