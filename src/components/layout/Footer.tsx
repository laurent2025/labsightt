import React from 'react';
import { LAB_METADATA } from '../../lib/constants';

interface FooterProps {
  onOpenLegal: (tab: 'terms' | 'privacy') => void;
}

export const Footer: React.FC<FooterProps> = ({ onOpenLegal }) => (
  <footer className="no-print border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-xs text-slate-500 dark:text-slate-400 transition-colors duration-200">
    <div className="h-px bg-gradient-to-r from-transparent via-cyan-500/50 to-transparent" />
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-[11px] text-slate-400 dark:text-slate-500">
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
        <span className="font-mono text-slate-600 dark:text-slate-300">Records encrypted at rest on the laboratory server</span>
      </div>
    </div>
  </footer>
);
