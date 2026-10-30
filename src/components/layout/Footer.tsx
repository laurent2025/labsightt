import React from 'react';
import { LAB_METADATA, DEFAULT_AI_MODELS } from '../../lib/constants';
import { Microscope, ShieldCheck, Globe2, Lock, Cpu, CheckCircle2 } from 'lucide-react';

interface FooterProps {
  onOpenLegal: (tab: 'terms' | 'privacy') => void;
  onNavigateTab?: (tab: 'dashboard' | 'patients' | 'microscopy' | 'reports') => void;
}

export const Footer: React.FC<FooterProps> = ({ onOpenLegal }) => {
  const activeModel = DEFAULT_AI_MODELS[0];

  return (
    <footer className="app-footer no-print border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-xs text-slate-600 dark:text-slate-400 transition-colors duration-200">
      {/* Gradient accent line with subtle pulse */}
      <div className="relative h-px overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-cyan-500/70 dark:via-cyan-400/70 to-transparent" />
      </div>

      <div className="max-w-[1440px] mx-auto gutter-x py-6 lg:py-8 safe-bottom">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-8 gap-y-6">
          {/* Brand & Mission column */}
          <div className="sm:col-span-2 lg:col-span-1 space-y-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 shrink-0 rounded-xl bg-gradient-to-br from-emerald-600 to-teal-800 flex items-center justify-center shadow-sm shadow-emerald-600/25">
                <Microscope className="w-4 h-4 text-white" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-bold text-slate-900 dark:text-white leading-tight">LenziAI</div>
                <div className="text-[10px] font-mono text-emerald-700 dark:text-emerald-400 font-bold uppercase leading-tight tracking-wider">
                  Clinical Microscopy Intelligence
                </div>
              </div>
            </div>
            <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-400">
              High-throughput computer-vision assisted microscopy review. Designed for clinical laboratories, research institutes, and certified pathology workflows.
            </p>
            <div className="flex items-center gap-2 pt-1 text-[11px] font-mono text-slate-500 dark:text-slate-400">
              <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" />
              <span>CLIA &amp; ISO 15189:2022 Ready</span>
            </div>
          </div>

          {/* AI Workflow & Engine column */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-1.5">
              <Cpu className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
              Active Inference Engine
            </h3>
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/60 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-900 dark:text-white text-[11px] truncate" title={activeModel?.name}>
                  {activeModel?.name || 'LENZIAI PRO YOLO26s'}
                </span>
                <span className="inline-flex items-center gap-1 text-[9px] font-mono font-bold uppercase px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Online
                </span>
              </div>
              <div className="text-[10px] font-mono text-slate-500 dark:text-slate-400 space-y-0.5">
                <div>Architecture: YOLO26s Serverless</div>
                <div>Confidence Floor: 60% · SAHI Sliced</div>
              </div>
            </div>
          </div>

          {/* Compliance & Regulatory column */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              Quality &amp; Standards
            </h3>
            <ul className="space-y-2 text-xs">
              <li className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                <span>FDA Clinical Decision Support</span>
              </li>
              <li className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                <span>CLIA '88 Quality Control Standards</span>
              </li>
              <li className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                <span>HIPAA &amp; HITECH Data Safeguards</span>
              </li>
            </ul>
          </div>

          {/* Operational Governance column */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-1.5">
              <Globe2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              Security &amp; Policy
            </h3>
            <ul className="space-y-2 text-xs">
              <li>
                <button
                  type="button"
                  onClick={() => onOpenLegal('terms')}
                  className="text-left text-slate-600 dark:text-slate-400 hover:text-emerald-700 dark:hover:text-emerald-300 transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500/40 shrink-0" />
                  Clinical Terms of Service
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => onOpenLegal('privacy')}
                  className="text-left text-slate-600 dark:text-slate-400 hover:text-emerald-700 dark:hover:text-emerald-300 transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500/40 shrink-0" />
                  Privacy Policy &amp; Security Measures
                </button>
              </li>
              <li className="flex items-start gap-1.5 text-slate-500 dark:text-slate-400 text-[11px] pt-1">
                <Lock className="w-3.5 h-3.5 mt-0.5 shrink-0 text-slate-400" />
                <span>256-bit Encrypted Serverless Proxy · No Patient PHI Transmitted to Model</span>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-8 pt-4 border-t border-slate-200 dark:border-slate-800/80 flex flex-col sm:flex-row items-center justify-between gap-2 text-center sm:text-left">
          <p className="text-xs text-slate-600 dark:text-slate-400">
            &copy; {new Date().getFullYear()} {LAB_METADATA.license}. All clinical decisions require qualified technologist sign-off.
          </p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
            <span>LenziAI Clinical v2.0 · Single Serverless Endpoint Active</span>
          </p>
        </div>
      </div>
    </footer>
  );
};
