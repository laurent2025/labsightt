import React from 'react';
import { LAB_METADATA } from '../../lib/constants';
import { Lock, FileText, Activity, Cpu, Scale, ChevronRight } from 'lucide-react';
import { useLabStore } from '../../store/labStore';

interface FooterProps {
  onOpenLegal: (tab: 'terms' | 'privacy') => void;
  onSelectTab: (tab: 'dashboard' | 'patients' | 'microscopy' | 'reports' | 'models' | 'audit') => void;
}

const MODULES = [
  { label: 'Clinical Telemetry & Overview', tab: 'dashboard' },
  { label: 'Microscopy Optical Stage & Scanner', tab: 'microscopy' },
  { label: 'Patient Specimen Accession Directory', tab: 'patients' },
  { label: 'Diagnostic Laboratory Pathology Reports', tab: 'reports' },
  { label: 'Roboflow YOLO AI Pipelines & Presets', tab: 'models' },
  { label: '21 CFR Part 11 Chain of Custody Audit', tab: 'audit' }
] as const;

function SectionHeading({ icon: Icon, children }: { icon: React.ComponentType<{ className?: string }>; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 font-mono">
      <Icon className="w-3.5 h-3.5 text-cyan-700 dark:text-cyan-400" />
      <span>{children}</span>
    </div>
  );
}

export const Footer: React.FC<FooterProps> = ({ onOpenLegal, onSelectTab }) => {
  const { user } = useLabStore();
  const canSeeInfra = Boolean(user);

  return (
    <footer className="no-print border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-xs text-slate-500 dark:text-slate-400 transition-colors duration-200">
      <div className="h-px bg-gradient-to-r from-transparent via-cyan-500/50 to-transparent" />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-10 pb-8">
        {/* Main 4-Column Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-x-8 gap-y-10 pb-8 border-b border-slate-200 dark:border-slate-800">
          {/* Col 1: Brand & Clinical Accreditation */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <span className="text-base font-bold tracking-tight text-slate-900 dark:text-white">
                {LAB_METADATA.name}
              </span>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-cyan-100 dark:bg-cyan-950 text-cyan-800 dark:text-cyan-300 font-semibold border border-transparent dark:border-cyan-800">
                AI CLINICAL
              </span>
            </div>
            <p className="text-slate-500 dark:text-slate-400 text-xs leading-relaxed">
              Clinical microscopy workstation for automated vision analysis and diagnostic report
              drafting. {LAB_METADATA.institution}.
            </p>
            <div className="pt-1 text-[11px] font-mono space-y-1.5">
              <div className="flex items-start gap-2">
                <span className="text-slate-400 dark:text-slate-500 shrink-0">Institution:</span>
                <span className="text-slate-800 dark:text-slate-200 font-semibold">{LAB_METADATA.institution}</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-slate-400 dark:text-slate-500 shrink-0">Medical Director:</span>
                <span className="text-slate-800 dark:text-slate-200 font-semibold">{LAB_METADATA.director}</span>
              </div>
            </div>
          </div>

          {/* Col 2: Clinical Workstation Modules */}
          <div className="space-y-4">
            <SectionHeading icon={Activity}>WORKSTATION MODULES</SectionHeading>
            <ul className="space-y-2.5 text-xs">
              {MODULES.map(module => (
                <li key={module.label}>
                  <button
                    type="button"
                    onClick={() => onSelectTab(module.tab)}
                    className="group flex items-center gap-1.5 text-left hover:text-cyan-800 dark:hover:text-cyan-400 transition cursor-pointer"
                  >
                    <ChevronRight className="w-3 h-3 text-slate-300 dark:text-slate-600 group-hover:text-cyan-700 dark:group-hover:text-cyan-400 transition shrink-0" />
                    <span>{module.label}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>

          {/* Col 3: Roboflow Vision & Interoperability — supervisors and directors only */}
          {canSeeInfra && (
            <div className="space-y-4">
              <SectionHeading icon={Cpu}>COMPUTATION &amp; PROTOCOLS</SectionHeading>
              <div className="bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 rounded-xl p-4 text-[11px] font-mono space-y-2 text-slate-600 dark:text-slate-400">
                <div className="flex items-center justify-between gap-3">
                  <span>Inference Engine:</span>
                  <span className="text-slate-800 dark:text-slate-200 font-semibold text-right">Roboflow Serverless</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>Model Endpoint:</span>
                  <span className="text-slate-800 dark:text-slate-200 font-semibold text-right">Configured on server</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>Credentials:</span>
                  <span className="text-slate-800 dark:text-slate-200 text-right">Never exposed to the browser</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>Interop:</span>
                  <span className="text-slate-800 dark:text-slate-200 text-right">FHIR R4 / DICOM metadata preview</span>
                </div>
              </div>
            </div>
          )}

          {/* Col 4: Regulatory, Privacy & Legal Disclaimers */}
          <div className="space-y-4">
            <SectionHeading icon={Scale}>GOVERNANCE &amp; PRIVACY</SectionHeading>
            <div className="space-y-2.5 text-xs">
              <button
                type="button"
                onClick={() => onOpenLegal('terms')}
                className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300 hover:text-cyan-800 dark:hover:text-cyan-400 transition font-medium cursor-pointer"
              >
                <FileText className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 shrink-0" />
                <span>Terms of Service &amp; Decision Support</span>
              </button>

              <button
                type="button"
                onClick={() => onOpenLegal('privacy')}
                className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300 hover:text-cyan-800 dark:hover:text-cyan-400 transition font-medium cursor-pointer"
              >
                <Lock className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 shrink-0" />
                <span>Privacy Policy &amp; HIPAA De-Identification</span>
              </button>
            </div>

            <div className="pt-1 text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed border-l-2 border-amber-300 dark:border-amber-600/60 pl-3">
              Clinical Decision Support notice: Software provides automated morphology suggestions only. Pathologist or technologist sign-off required prior to clinical release.
            </div>
          </div>
        </div>

        {/* Bottom Sub-Footer Bar */}
        <div className="pt-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-[11px] text-slate-400 dark:text-slate-500">
          <div className="flex flex-wrap items-center gap-3">
            <span>© {new Date().getFullYear()} {LAB_METADATA.name} Diagnostic Systems Inc. All rights reserved.</span>
            <span aria-hidden="true">·</span>
            <button
              type="button"
              onClick={() => onOpenLegal('privacy')}
              className="hover:text-slate-600 dark:hover:text-slate-300 underline cursor-pointer"
            >
              Privacy Policy
            </button>
            <span aria-hidden="true">·</span>
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
            <span className="font-mono text-slate-600 dark:text-slate-400">Records encrypted at rest on the laboratory server</span>
          </div>
        </div>
      </div>
    </footer>
  );
};
