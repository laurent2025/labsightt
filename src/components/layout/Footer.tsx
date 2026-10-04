import React from 'react';
import { LAB_METADATA } from '../../lib/constants';
import { Microscope, ShieldCheck, Globe2, Lock } from 'lucide-react';

interface FooterProps {
  onOpenLegal: (tab: 'terms' | 'privacy') => void;
}

export const Footer: React.FC<FooterProps> = ({ onOpenLegal }) => (
  <footer className="no-print border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-xs text-slate-600 dark:text-slate-400 transition-colors duration-200">
    {/* Gradient accent line */}
    <div className="h-px bg-gradient-to-r from-transparent via-green-500/70 dark:via-green-400/70 to-transparent" />

    {/* safe-bottom keeps the last line clear of the iOS home indicator. */}
    <div className="max-w-[1440px] mx-auto gutter-x py-5 lg:py-6 safe-bottom">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-5">
        {/* Brand column */}
        <div className="sm:col-span-2 lg:col-span-1 space-y-2">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 shrink-0 rounded-lg bg-gradient-to-br from-green-600 to-green-800 flex items-center justify-center shadow-sm shadow-green-600/25">
              <Microscope className="w-3.5 h-3.5 text-white" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-bold text-slate-900 dark:text-white leading-tight">LenziAI</div>
              <div className="text-[10px] font-mono text-green-800 dark:text-green-300 font-bold uppercase leading-tight">
                AI Clinical
              </div>
            </div>
          </div>
          <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-400 max-w-xs">
            Computer-vision assisted microscopy review for clinical laboratories. Not a medical device. All output
            requires qualified technologist sign-off.
          </p>
        </div>

        {/* Product column */}
        <div className="space-y-2">
          <h3 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">Product</h3>
          <ul className="space-y-1">
            <li>
              <button
                type="button"
                onClick={() => onOpenLegal('terms')}
                className="text-left text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-green-800 dark:hover:text-green-300 transition-colors cursor-pointer"
              >
                Terms of Service
              </button>
            </li>
            <li>
              <button
                type="button"
                onClick={() => onOpenLegal('privacy')}
                className="text-left text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-green-800 dark:hover:text-green-300 transition-colors cursor-pointer"
              >
                Privacy Policy &amp; HIPAA
              </button>
            </li>
          </ul>
        </div>

        {/* Compliance column */}
        <div className="space-y-2">
          <h3 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">Compliance</h3>
          <ul className="space-y-1">
            <li className="flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-400">
              <ShieldCheck className="w-3 h-3 shrink-0 text-green-700 dark:text-green-400" />
              FDA CDS Guidance
            </li>
            <li className="flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-400">
              <ShieldCheck className="w-3 h-3 shrink-0 text-green-700 dark:text-green-400" />
              CLIA Regulations
            </li>
            <li className="flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-400">
              <ShieldCheck className="w-3 h-3 shrink-0 text-green-700 dark:text-green-400" />
              ISO 15189:2022
            </li>
          </ul>
        </div>

        {/* Status column */}
        <div className="space-y-2">
          <h3 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">System Status</h3>
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5">
              <span className="relative flex h-2 w-2 shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-600" />
              </span>
              <span className="text-xs font-bold text-slate-800 dark:text-slate-200">Operational</span>
            </div>
            <div className="flex items-start gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-400">
              <Lock className="w-3 h-3 mt-px shrink-0 text-green-700 dark:text-green-400" />
              <span>Records encrypted at rest on the laboratory server</span>
            </div>
            <div className="flex items-start gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-400">
              <Globe2 className="w-3 h-3 mt-px shrink-0 text-green-700 dark:text-green-400" />
              <span className="break-anywhere">{LAB_METADATA.license}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom bar */}
      <div className="mt-6 pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-1.5 text-center sm:text-left">
        <p className="text-xs font-medium text-slate-700 dark:text-slate-300">
          &copy; {new Date().getFullYear()} {LAB_METADATA.license}. All rights reserved.
        </p>
        <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono break-anywhere">
          v2.0 &middot; Server-side inference proxy &middot; AES-256-GCM at rest
        </p>
      </div>
    </div>
  </footer>
);