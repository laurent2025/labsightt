import React from 'react';
import { LAB_METADATA } from '../../lib/constants';
import { Lock, FileText } from 'lucide-react';
import { useLabStore, roleRank } from '../../store/labStore';

interface FooterProps {
  onOpenLegal: (tab: 'terms' | 'privacy') => void;
  onSelectTab: (tab: 'dashboard' | 'patients' | 'microscopy' | 'reports' | 'models' | 'audit') => void;
}

export const Footer: React.FC<FooterProps> = ({ onOpenLegal, onSelectTab }) => {
  const user = useLabStore(s => s.user);
  const canSeeInfra = user && roleRank(user) >= 2;

  return (
    <footer className="no-print border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 pt-10 pb-8 text-xs text-slate-500 dark:text-slate-400 transition-colors duration-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        {/* Main 4-Column Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 pb-8 border-b border-slate-200 dark:border-slate-800">
          {/* Col 1: Brand & Clinical Accreditation */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-base font-bold tracking-tight text-slate-900 dark:text-white">
                {LAB_METADATA.name}
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-cyan-100 dark:bg-cyan-950 text-cyan-800 dark:text-cyan-300 font-semibold border border-transparent dark:border-cyan-800">
                DEMO
              </span>
            </div>
            <p className="text-slate-500 dark:text-slate-400 text-xs leading-relaxed">
              Demonstration workstation for microscopy vision analysis and diagnostic report
              drafting. Not a validated medical device and not accredited for diagnostic use.
            </p>
            <div className="pt-1 text-[11px] font-mono text-slate-600 dark:text-slate-400 space-y-1">
              <div>Status: <strong className="text-slate-800 dark:text-slate-200">unaccredited demonstration build</strong></div>
              <div>Medical Director: <strong className="text-slate-800 dark:text-slate-200">{LAB_METADATA.director}</strong></div>
            </div>
          </div>

          {/* Col 2: Clinical Workstation Modules */}
          <div className="space-y-3">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 block font-mono">
              WORKSTATION MODULES
            </span>
            <ul className="space-y-2 text-xs">
              <li>
                <button
                  type="button"
                  onClick={() => onSelectTab('dashboard')}
                  className="hover:text-cyan-800 dark:hover:text-cyan-400 transition cursor-pointer"
                >
                  Clinical Telemetry & Overview
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => onSelectTab('microscopy')}
                  className="hover:text-cyan-800 dark:hover:text-cyan-400 transition cursor-pointer"
                >
                  Microscopy Optical Stage & Scanner
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => onSelectTab('patients')}
                  className="hover:text-cyan-800 dark:hover:text-cyan-400 transition cursor-pointer"
                >
                  Patient Specimen Accession Directory
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => onSelectTab('reports')}
                  className="hover:text-cyan-800 dark:hover:text-cyan-400 transition cursor-pointer"
                >
                  Diagnostic Laboratory Pathology Reports
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => onSelectTab('models')}
                  className="hover:text-cyan-800 dark:hover:text-cyan-400 transition cursor-pointer"
                >
                  Roboflow YOLO AI Pipelines & Presets
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => onSelectTab('audit')}
                  className="hover:text-cyan-800 dark:hover:text-cyan-400 transition cursor-pointer"
                >
                  21 CFR Part 11 Chain of Custody Audit
                </button>
              </li>
            </ul>
          </div>

          {/* Col 3: Roboflow Vision & Interoperability — supervisors and directors only */}
          {canSeeInfra && (
            <div className="space-y-3">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 block font-mono">
                COMPUTATION & PROTOCOLS
              </span>
              <div className="bg-slate-50 dark:bg-slate-900 p-3 rounded-xl border border-slate-200 dark:border-slate-800 text-[11px] font-mono space-y-1.5 text-slate-600 dark:text-slate-400">
                <div className="flex items-center justify-between">
                  <span>Inference Engine:</span>
                  <span className="text-slate-800 dark:text-slate-200 font-semibold">Roboflow Serverless</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Workflow ID:</span>
                  <span className="text-cyan-700 dark:text-cyan-400 font-semibold truncate max-w-[130px]">labsight-vlabsight-1</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Workspace:</span>
                  <span className="text-slate-800 dark:text-slate-200">laurent-kashinje</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Interop:</span>
                  <span className="text-slate-800 dark:text-slate-200">FHIR R4 / DICOM metadata preview</span>
                </div>
              </div>
            </div>
          )}

          {/* Col 4: Regulatory, Privacy & Legal Disclaimers */}
          <div className="space-y-3">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 block font-mono">
              GOVERNANCE & PRIVACY
            </span>
            <div className="space-y-2 text-xs">
              <button
                type="button"
                onClick={() => onOpenLegal('terms')}
                className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300 hover:text-cyan-800 dark:hover:text-cyan-400 transition font-medium cursor-pointer"
              >
                <FileText className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" />
                <span>Terms of Service & Decision Support</span>
              </button>

              <button
                type="button"
                onClick={() => onOpenLegal('privacy')}
                className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300 hover:text-cyan-800 dark:hover:text-cyan-400 transition font-medium cursor-pointer"
              >
                <Lock className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" />
                <span>Privacy Policy & HIPAA De-Identification</span>
              </button>
            </div>

            <div className="pt-2 text-[11px] text-slate-500 dark:text-slate-400 leading-tight">
              Clinical Decision Support notice: Software provides automated morphology suggestions only. Pathologist or technologist sign-off required prior to clinical release.
            </div>
          </div>
        </div>

        {/* Bottom Sub-Footer Bar */}
        <div className="pt-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-[11px] text-slate-400 dark:text-slate-500">
          <div className="flex flex-wrap items-center gap-3">
            <span>© {new Date().getFullYear()} {LAB_METADATA.name} Diagnostic Systems Inc. All rights reserved.</span>
            <span>·</span>
            <button
              type="button"
              onClick={() => onOpenLegal('privacy')}
              className="hover:text-slate-600 dark:hover:text-slate-300 underline cursor-pointer"
            >
              Privacy Policy
            </button>
            <span>·</span>
            <button
              type="button"
              onClick={() => onOpenLegal('terms')}
              className="hover:text-slate-600 dark:hover:text-slate-300 underline cursor-pointer"
            >
              Terms of Use
            </button>
          </div>

          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-slate-400" />
            <span className="font-mono text-slate-600 dark:text-slate-400">Local demo session · no uptime or SLA is measured</span>
          </div>
        </div>
      </div>
    </footer>
  );
};
