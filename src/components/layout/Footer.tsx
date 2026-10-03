import React from 'react';
import { LAB_METADATA } from '../../lib/constants';
import { Microscope, ShieldCheck, Globe2 } from 'lucide-react';

interface FooterProps {
  onOpenLegal: (tab: 'terms' | 'privacy') => void;
}

export const Footer: React.FC<FooterProps> = ({ onOpenLegal }) => (
  <footer className="no-print border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-[10px] text-slate-500 dark:text-slate-400 transition-colors duration-200">
    {/* Gradient accent line */}
    <div className="h-px bg-gradient-to-r from-transparent via-cyan-500/60 dark:via-cyan-400/60 to-transparent" />

    <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-5 lg:py-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 lg:gap-6">
        {/* Brand column */}
        <div className="sm:col-span-2 lg:col-span-1 space-y-2">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-xl bg-gradient-to-br from-cyan-600 to-emerald-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
              <Microscope className="w-3.5 h-3.5 text-white" />
            </div>
            <div>
              <div className="text-xs font-bold text-slate-900 dark:text-white">LenziAI</div>
              <div className="text-[8px] font-mono text-cyan-700 dark:text-cyan-400 font-semibold">AI CLINICAL</div>
            </div>
          </div>
          <p className="text-[9px] leading-relaxed text-slate-500 dark:text-slate-400 max-w-xs">
            Computer-vision assisted microscopy review for clinical laboratories. Not a medical device. All output requires qualified technologist sign-off.
          </p>
        </div>

        {/* Product column */}
        <div className="space-y-2">
          <h3 className="text-[10px] font-bold text-slate-900 dark:text-white uppercase tracking-wider">Product</h3>
          <ul className="space-y-1.5">
            <li>
              <button
                type="button"
                onClick={() => onOpenLegal('terms')}
                className="text-[9px] text-slate-600 dark:text-slate-400 hover:text-cyan-700 dark:hover:text-cyan-400 transition-colors cursor-pointer"
              >
                Terms of Service
              </button>
            </li>
            <li>
              <button
                type="button"
                onClick={() => onOpenLegal('privacy')}
                className="text-[9px] text-slate-600 dark:text-slate-400 hover:text-cyan-700 dark:hover:text-cyan-400 transition-colors cursor-pointer"
              >
                Privacy Policy &amp; HIPAA
              </button>
            </li>
          </ul>
        </div>

        {/* Compliance column */}
        <div className="space-y-2">
          <h3 className="text-[10px] font-bold text-slate-900 dark:text-white uppercase tracking-wider">Compliance</h3>
          <ul className="space-y-1.5">
            <li className="flex items-center gap-1.5 text-[9px] text-slate-600 dark:text-slate-400">
              <ShieldCheck className="w-3 h-3 text-cyan-600 dark:text-cyan-400" />
              FDA CDS Guidance
            </li>
            <li className="flex items-center gap-1.5 text-[9px] text-slate-600 dark:text-slate-400">
              <ShieldCheck className="w-3 h-3 text-cyan-600 dark:text-cyan-400" />
              CLIA Regulations
            </li>
            <li className="flex items-center gap-1.5 text-[9px] text-slate-600 dark:text-slate-400">
              <ShieldCheck className="w-3 h-3 text-cyan-600 dark:text-cyan-400" />
              ISO 15189:2022
            </li>
          </ul>
        </div>

        {/* Status column */}
        <div className="space-y-2">
          <h3 className="text-[10px] font-bold text-slate-900 dark:text-white uppercase tracking-wider">System Status</h3>
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
              <span className="text-[9px] text-slate-600 dark:text-slate-400">Operational</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Globe2 className="w-3 h-3 text-cyan-600 dark:text-cyan-400" />
              <span className="text-[9px] text-slate-600 dark:text-slate-400">
                {LAB_METADATA.institution}
              </span>
            </div>
            <p className="text-[8px] text-slate-500 dark:text-slate-500 leading-relaxed">
              Records encrypted at rest on the laboratory server
            </p>
          </div>
        </div>
      </div>

      {/* Bottom bar */}
      <div className="mt-6 pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-2">
        <p className="text-[9px] text-slate-500 dark:text-slate-500">
          © {new Date().getFullYear()} {LAB_METADATA.name} Diagnostic Systems Inc. All rights reserved.
        </p>
        <p className="text-[8px] text-slate-400 dark:text-slate-600 font-mono">
          v2.0 · Server-side inference proxy · AES-256-GCM at rest
        </p>
      </div>
    </div>
  </footer>
);
